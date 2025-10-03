// src/app/api/chekout/orders/route.js
export const runtime = "nodejs";

import prisma from "@/lib/prisma";

/**
 * Espera:
 * {
 *   productId: string,
 *   quantity?: number,
 *   buyer?: { email?: string, dni?: string },
 *   cardFormData: { token: string, payment_method_id: string, installments?: number, issuer_id?: string }
 * }
 *
 * Requiere:
 * - process.env.MP_ACCESS_TOKEN (APP_USR-... en prod, TEST-... en sandbox)
 * - El front debe tokenizar tarjeta con tu Public Key (NEXT_PUBLIC_MP_PUBLIC_KEY) y enviarnos `token`.
 */
export async function POST(req) {
  try {
    // === Sanity check de credenciales ===
    if (!process.env.MP_ACCESS_TOKEN) {
      return Response.json(
        { error: "Falta MP_ACCESS_TOKEN en variables de entorno" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { productId, quantity = 1, buyer, cardFormData } = body || {};
    const { token, payment_method_id, installments, issuer_id } = cardFormData || {};

    // === Validaciones básicas ===
    if (!productId) {
      return Response.json({ error: "productId es requerido" }, { status: 400 });
    }
    if (!token || !payment_method_id) {
      return Response.json(
        { error: "Faltan datos de pago (token / payment_method_id)" },
        { status: 400 }
      );
    }
    const qty = Number(quantity) || 1;
    if (!Number.isInteger(qty) || qty <= 0 || qty > 50) {
      return Response.json(
        { error: "quantity debe ser un entero entre 1 y 50" },
        { status: 400 }
      );
    }

    // === Producto ===
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return Response.json({ error: "Producto no disponible" }, { status: 404 });
    }

    // === Usuario (si usás NextAuth y hay sesión, la tomamos) ===
    let userId = null;
    try {
      const { getServerSession } = await import("next-auth");
      const { authOptions } = await import("@/lib/auth");
      const session = await getServerSession(authOptions);
      userId = session?.user?.id || null;
    } catch {
      // si no tenés auth acá, seguimos como guest por email
    }

    // === Montos (guardamos en centavos en tu DB; MP requiere string decimal) ===
    const unitPriceCents = product.priceCents; // Int en centavos
    const amountCents = unitPriceCents * qty;
    const amountDecimal = (amountCents / 100).toFixed(2); // "1234.00"
    const currency = product.currency || "ARS";

    // === Creamos la Purchase + Item primero ===
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
              unitPrice: unitPriceCents,
              currency,
            },
          ],
        },
      },
      select: { id: true, userId: true },
    });

    // Vinculación por external_reference para que el webhook ubique la purchase
    const external_reference = `riftea_${purchase.id}`;

    // === Armamos Order (Orders API, modo automático) ===
    const payload = {
      type: "online",
      processing_mode: "automatic",
      total_amount: amountDecimal,
      external_reference,
      payer: {
        email: buyer?.email || undefined,
        identification: buyer?.dni ? { type: "DNI", number: buyer.dni } : undefined,
      },
      transactions: {
        payments: [
          {
            amount: amountDecimal,
            payment_method: {
              id: payment_method_id,       // ej: "visa"
              type: "credit_card",
              token,                       // token del Brick
              installments: Number(installments || 1),
              issuer_id,                   // opcional
              statement_descriptor: "RIFTEA",
            },
          },
        ],
      },
      // Captura asíncrona: MP nos avisará por webhook el resultado final
      capture_mode: "automatic_async",
    };

    const resOrder = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": genIdemKey(), // para evitar órdenes duplicadas por reintentos del front
      },
      body: JSON.stringify(payload),
    });

    const order = await resOrder.json().catch(() => ({}));
    if (!resOrder.ok) {
      console.error("MP order error:", order);

      // dejamos la purchase en rejected para no colgar el estado
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: "rejected" },
      });

      // devolvemos mensaje entendible al front
      return Response.json(
        { error: order?.message || "No se pudo crear la orden en Mercado Pago" },
        { status: 502 }
      );
    }

    // === Guardamos el orderId y status preliminar ===
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        paymentId: String(order.id), // usamos paymentId como “orderId”
        paymentMethod:
          order?.transactions?.payments?.[0]?.payment_method?.id || payment_method_id || null,
        status: String(order?.status || "processing").toLowerCase(), // suele ser "processing"
      },
    });

    // === Respuesta al front ===
    // La Orders API procesa “server side” con el token; no siempre devuelve init_point (eso era prefer/checkout pro).
    // El estado final llega por webhook. Devolvemos datos mínimos para UI.
    return Response.json({
      orderId: order.id,
      status: order.status || "processing",
      external_reference,
    });
  } catch (e) {
    console.error("checkout error:", e);
    return Response.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}

/** Idempotency-Key simple */
function genIdemKey() {
  try {
    // nodejs runtime disponible en app router
    const c = require("node:crypto");
    return c.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
    data: {
      email: finalEmail,
      isActive: true,
      // Podrías marcar role USER por defecto y firstLogin=true si necesitás
    },
    select: { id: true },
  });
  return created.id;
}
