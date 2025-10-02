// src/app/api/checkout/preference/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// Helpers
function toCents(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100);
}
function centsToDecimal(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}
function safeInt(v, def = 1) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}
function str(v, max = 1000) {
  return String(v ?? "").trim().slice(0, max);
}

/**
 * POST /api/checkout/preference
 * Body esperado:
 * {
 *   items: Array<{ productId: string, quantity?: number }>,
 *   buyer?: { email?: string, dni?: string },
 *   successUrl?: string,  // opcional override
 *   failureUrl?: string,  // opcional override
 *   pendingUrl?: string   // opcional override
 * }
 *
 * Requiere:
 * - MP_ACCESS_TOKEN (server)
 * - PUBLIC_BASE_URL (para notification_url) o NEXTAUTH_URL
 * - Webhook activo en /api/webhooks/mp (ya lo tenés)
 */
export async function POST(req) {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: "Falta MP_ACCESS_TOKEN en variables de entorno" },
        { status: 500 }
      );
    }

    const baseUrl =
      process.env.PUBLIC_BASE_URL ||
      process.env.NEXTAUTH_URL ||
      "https://riftea.vercel.app"; // fallback razonable

    const body = await req.json().catch(() => ({}));
    const itemsReq = Array.isArray(body?.items) ? body.items : [];
    const buyer = body?.buyer || {};
    const successUrl = str(body?.successUrl) || `${baseUrl}/mis-compras`;
    const failureUrl = str(body?.failureUrl) || `${baseUrl}/marketplace`;
    const pendingUrl = str(body?.pendingUrl) || `${baseUrl}/mis-compras`;

    if (itemsReq.length === 0) {
      return NextResponse.json(
        { error: "items es requerido y no puede estar vacío" },
        { status: 400 }
      );
    }

    // Cargar productos y calcular totales
    const productIds = itemsReq.map((i) => String(i.productId));
    const dbProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
      },
    });

    if (dbProducts.length !== productIds.length) {
      return NextResponse.json(
        { error: "Uno o más productos no existen o no están activos" },
        { status: 404 }
      );
    }

    // Si usás sesión, la tomamos; si no, invitado por email
    let userId = null;
    try {
      const { getServerSession } = await import("next-auth");
      const { authOptions } = await import("@/lib/auth");
      const session = await getServerSession(authOptions);
      userId = session?.user?.id || null;
    } catch {
      // sin auth no pasa nada, seguimos como guest
    }

    // Normalizamos items (con quantity)
    const normalized = itemsReq.map((it) => ({
      productId: String(it.productId),
      quantity: Math.min(50, Math.max(1, safeInt(it.quantity, 1))),
    }));

    // Currency (asumimos todos iguales; tu schema guarda currency en Product/PurchaseItem)
    const currency = dbProducts[0].currency || "ARS";
    const lines = normalized.map((n) => {
      const p = dbProducts.find((dp) => dp.id === n.productId);
      return {
        product: p,
        quantity: n.quantity,
        lineCents: p.priceCents * n.quantity,
      };
    });

    const amountCents = lines.reduce((acc, l) => acc + l.lineCents, 0);
    if (amountCents <= 0) {
      return NextResponse.json({ error: "Total inválido" }, { status: 400 });
    }

    // Crear Purchase + Items primero
    const userIdFinal = userId ?? (await ensureGuestUser(buyer?.email));
    const purchase = await prisma.purchase.create({
      data: {
        userId: userIdFinal,
        amount: amountCents,
        currency,
        status: "pending",
        items: {
          create: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            unitPrice: l.product.priceCents,
            currency,
          })),
        },
      },
      select: { id: true, userId: true },
    });

    const external_reference = `riftea_${purchase.id}`;

    // Construimos items para la Preference
    const mpItems = lines.map((l) => ({
      title: str(l.product.title, 150) || "Producto digital",
      description: str(l.product.description, 256) || undefined,
      quantity: l.quantity,
      currency_id: currency, // "ARS"
      unit_price: centsToDecimal(l.product.priceCents), // número (no string)
    }));

    // Crear Preference en MP
    const prefPayload = {
      items: mpItems,
      external_reference,
      notification_url: `${baseUrl}/api/webhooks/mp`,
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      auto_return: "approved",
      payer: {
        email: buyer?.email || undefined,
        identification: buyer?.dni ? { type: "DNI", number: buyer.dni } : undefined,
      },
      // Opcional: metadatos por si querés más contexto
      metadata: { purchaseId: purchase.id },
    };

    const resPref = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prefPayload),
    });

    const pref = await resPref.json().catch(() => ({}));
    if (!resPref.ok) {
      console.error("MP preference error:", pref);

      // Marcamos la purchase rechazada para no colgarla
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: "rejected" },
      });

      return NextResponse.json(
        { error: pref?.message || "No se pudo crear la preferencia en Mercado Pago" },
        { status: 502 }
      );
    }

    // Guardamos preference id y dejamos pending
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        paymentId: String(pref.id), // guardamos el preference_id
        paymentMethod: "wallet",    // referencia: usado con Wallet Brick
        status: "pending",
      },
    });

    // Devolvemos datos para inicializar el Wallet Brick en el front
    return NextResponse.json({
      preferenceId: pref.id,
      init_point: pref.init_point,       // web
      sandbox_init_point: pref.sandbox_init_point, // sandbox
      external_reference,
    });
  } catch (e) {
    console.error("checkout/preference error:", e);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}

/** Crea/usa un "guest user" por email si no hay sesión (tu schema exige userId) */
async function ensureGuestUser(email) {
  let finalEmail = email;
  if (!finalEmail) finalEmail = `guest_${Date.now()}@riftea.local`;

  const existing = await prisma.user.findUnique({
    where: { email: finalEmail },
    select: { id: true },
  });
  if (existing?.id) return existing.id;

  const created = await prisma.user.create({
    data: { email: finalEmail, isActive: true },
    select: { id: true },
  });
  return created.id;
}
