// src/app/api/checkout/wallet/route.js
export const runtime = "nodejs";

import prisma from "@/lib/prisma";

/**
 * Endpoint para iniciar un pago con Mercado Pago usando Checkout Pro / Wallet.
 * 
 * Body esperado:
 *   {
 *     productId: string,
 *     quantity?: number,
 *     buyer?: { email?: string, dni?: string }
 *   }
 *
 * Variables de entorno necesarias:
 *   - MP_ACCESS_TOKEN   (APP_USR-... en producción real)
 *   - FRONT_BASE_URL    (opcional; si no está, uso el origin de la request)
 *
 * Respuesta:
 *   {
 *     redirectUrl,        // URL donde redirigir al usuario (ahí puede usar saldo MP)
 *     preferenceId,
 *     external_reference
 *   }
 */
export async function POST(req) {
  try {
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      return Response.json({ error: "Falta MP_ACCESS_TOKEN" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { productId, quantity = 1, buyer } = body || {};
    const qty = Number(quantity) || 1;

    if (!productId || !Number.isInteger(qty) || qty <= 0 || qty > 50) {
      return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    // 1) Buscar producto
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return Response.json({ error: "Producto no disponible" }, { status: 404 });
    }

    // 2) Usuario (si hay sesión NextAuth la usamos; si no, guest user)
    let userId = null;
    try {
      const { getServerSession } = await import("next-auth");
      const { authOptions } = await import("@/lib/auth");
      const session = await getServerSession(authOptions);
      userId = session?.user?.id || null;
    } catch {
      // fallback a guest user
    }

    // 3) Crear Purchase en DB
    const amountCents = product.priceCents * qty;
    const currency = product.currency || "ARS";

    const purchase = await prisma.purchase.create({
      data: {
        userId: userId ?? (await ensureGuestUser(buyer?.email)),
        amount: amountCents,
        currency,
        status: "pending",
        items: {
          create: [
            {
              productId: product.id,
              quantity: qty,
              unitPrice: product.priceCents,
              currency,
            },
          ],
        },
      },
      select: { id: true },
    });

    const external_reference = `riftea_${purchase.id}`;

    // 4) Armar URLs de retorno
    const url = new URL(req.url);
    const origin = process.env.FRONT_BASE_URL || `${url.protocol}//${url.host}`;
    const back_urls = {
      success: `${origin}/marketplace?pay=success&ref=${external_reference}`,
      failure: `${origin}/marketplace?pay=failure&ref=${external_reference}`,
      pending: `${origin}/marketplace?pay=pending&ref=${external_reference}`,
    };
    const notification_url = `${origin}/api/mercadopago/webhook`;

    // 5) Crear preferencia (Checkout Pro)
    const prefPayload = {
      items: [
        {
          id: product.id,
          title: product.title || "Producto",
          quantity: qty,
          currency_id: currency,
          unit_price: Number((product.priceCents / 100).toFixed(2)),
        },
      ],
      payer: {
        email: buyer?.email || undefined,
        identification: buyer?.dni ? { type: "DNI", number: buyer.dni } : undefined,
      },
      external_reference,
      back_urls,
      notification_url,
      auto_return: "approved",
      statement_descriptor: "RIFTEA",
    };

    const resPref = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prefPayload),
    });

    const pref = await resPref.json().catch(() => ({}));
    if (!resPref.ok) {
      console.error("MP preference error:", pref);
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: "rejected" },
      });
      return Response.json(
        { error: pref?.message || "No se pudo crear la preferencia de pago" },
        { status: 502 }
      );
    }

    // 6) Guardar info de preferencia
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        paymentId: String(pref?.id || ""),
        paymentMethod: "checkout_pro",
        status: "pending",
      },
    });

    // 7) Devolver redirectUrl (init_point) al front
    return Response.json({
      redirectUrl: pref.init_point,
      preferenceId: pref.id,
      external_reference,
    });
  } catch (e) {
    console.error("wallet route error:", e);
    return Response.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}

async function ensureGuestUser(email) {
  let finalEmail = email || `guest_${Date.now()}@riftea.local`;
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
