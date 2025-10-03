export const runtime = "nodejs";

import prisma from "@/lib/prisma";

/**
 * Crea una Purchase y una Preference de Mercado Pago (Checkout Pro / Wallet).
 * Devuelve { init_point, preferenceId, external_reference } para redirigir al usuario.
 *
 * Body:
 * { productId: string, quantity?: number, buyer?: { email?: string, dni?: string } }
 *
 * Requiere:
 * - MP_ACCESS_TOKEN (privada, en Vercel)
 * - Opcional: FRONT_BASE_URL (para back_urls). Si no está, uso origin del request.
 */
export async function POST(req) {
  try {
    if (!process.env.MP_ACCESS_TOKEN) {
      return Response.json({ error: "Falta MP_ACCESS_TOKEN" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { productId, quantity = 1, buyer } = body || {};
    const qty = Number(quantity) || 1;

    if (!productId || qty <= 0 || qty > 50) {
      return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    // Producto
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return Response.json({ error: "Producto no disponible" }, { status: 404 });
    }

    // Usuario (si usás NextAuth, obtenemos userId)
    let userId = null;
    try {
      const { getServerSession } = await import("next-auth");
      const { authOptions } = await import("@/lib/auth");
      const session = await getServerSession(authOptions);
      userId = session?.user?.id || null;
    } catch {}

    // Crear Purchase + Item
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
      select: { id: true, userId: true },
    });

    const external_reference = `riftea_${purchase.id}`;

    // back_urls
    const url = new URL(req.url);
    const origin = process.env.FRONT_BASE_URL || `${url.protocol}//${url.host}`;
    const successUrl = `${origin}/marketplace?pay=success&ref=${external_reference}`;
    const failureUrl = `${origin}/marketplace?pay=failure&ref=${external_reference}`;
    const pendingUrl = `${origin}/marketplace?pay=pending&ref=${external_reference}`;

    // Webhook público (asegurate de configurarlo en MP)
    const notificationUrl = `${origin}/api/mercadopago/webhook`;

    // Preference (Checkout Pro / Wallet)
    const prefPayload = {
      items: [
        {
          id: product.id,
          title: product.title || "Producto",
          quantity: qty,
          currency_id: currency,
          // MP acepta number con 2 decimales; convertimos de centavos a ARS
          unit_price: Number((product.priceCents / 100).toFixed(2)),
        },
      ],
      payer: {
        email: buyer?.email || undefined,
        identification: buyer?.dni ? { type: "DNI", number: buyer.dni } : undefined,
      },
      external_reference,
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      auto_return: "approved",
      notification_url: notificationUrl,
      statement_descriptor: "RIFTEA",
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
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: "rejected" },
      });
      return Response.json(
        { error: pref?.message || "No se pudo crear la preferencia de pago" },
        { status: 502 }
      );
    }

    // Guardamos algo de trazabilidad
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        paymentId: String(pref?.id || ""), // id de la preferencia
        paymentMethod: "checkout_pro",
        status: "pending",
      },
    });

    return Response.json({
      init_point: pref.init_point, // URL para redirigir (desktop)
      sandbox_init_point: pref.sandbox_init_point,
      preferenceId: pref.id,
      external_reference,
    });
  } catch (e) {
    console.error("preference error:", e);
    return Response.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}

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
