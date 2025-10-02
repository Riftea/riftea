// src/app/api/mercadopago/webhook/route.js
export const runtime = "nodejs";

import prisma from "@/lib/prisma";
import { TicketsService } from "@/services/tickets.service";

/* ===================== Helpers ===================== */

function ensureAccessToken() {
  const tok = process.env.MP_ACCESS_TOKEN;
  if (!tok) throw new Error("Falta MP_ACCESS_TOKEN en variables de entorno");
  return tok;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** GET /v1/orders/:id */
async function fetchOrderFromMP(orderId) {
  const res = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${ensureAccessToken()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.message || `Orders GET ${orderId} ${res.status}`);
  return data;
}

/** GET /v1/payments/:id */
async function fetchPaymentFromMP(paymentId) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${ensureAccessToken()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.message || `Payments GET ${paymentId} ${res.status}`);
  return data;
}

/** GET /merchant_orders/:id (algunas notificaciones de Checkout Pro llegan así) */
async function fetchMerchantOrderFromMP(moId) {
  const res = await fetch(`https://api.mercadopago.com/merchant_orders/${moId}`, {
    headers: {
      Authorization: `Bearer ${ensureAccessToken()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.message || `MerchantOrder GET ${moId} ${res.status}`);
  return data;
}

function mapPaymentStatusToPurchaseStatus(mpStatus) {
  const s = String(mpStatus || "").toLowerCase();
  if (["approved", "accredited"].includes(s)) return "approved";
  if (["rejected", "cancelled", "canceled"].includes(s)) return "rejected";
  if (["in_process", "pending"].includes(s)) return "pending";
  return s || "pending";
}

function mapOrderStatusToPurchaseStatus(mpStatus) {
  const s = String(mpStatus || "").toLowerCase();
  if (["approved", "captured", "authorized"].includes(s)) return "approved";
  if (["rejected", "cancelled", "canceled"].includes(s)) return "rejected";
  if (["processing", "in_process", "pending"].includes(s)) return "pending";
  return s || "pending";
}

async function findPurchaseByExternalReference(ref) {
  const ext = String(ref || "");
  if (!ext.startsWith("riftea_")) return null;
  const id = ext.replace("riftea_", "");
  if (!id) return null;
  return prisma.purchase.findUnique({ where: { id }, select: { id: true } });
}

async function settlePurchaseAndMaybeGift({ purchaseId, statusMapped, meta = {} }) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, userId: true, status: true },
  });
  if (!purchase) return;

  // Idempotencia: si ya quedó approved, no repetir efectos
  if (String(purchase.status).toLowerCase() === "approved" && statusMapped === "approved") return;

  await prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      status: statusMapped,
      paymentMethod: meta.paymentMethod ?? null,
      paymentId: meta.paymentId ?? null,
    },
  });

  if (statusMapped === "approved") {
    await TicketsService.issueGiftTicketForPurchase({
      userId: purchase.userId,
      purchaseId: purchase.id,
      notify: true,
      force: true, // ya validamos estado arriba
    });
  }
}

/* ===================== Webhook ===================== */

/**
 * POST: receptor de notificaciones MP
 *
 * Puede llegar:
 *  - { type:"payment",  data:{ id } }                      ← Checkout Pro (payments)
 *  - { type:"order",    data:{ id } }                      ← Orders API (card token server-side)
 *  - { topic:"merchant_order", resource:".../<id>" }       ← Checkout Pro (merchant_orders)
 *  - { resource:".../payments/<id>" } o ".../orders/<id>"
 */
export async function POST(req) {
  try {
    ensureAccessToken(); // valida que esté seteado

    const body = await req.json().catch(() => ({}));
    const topic = String(body?.type || body?.topic || "").toLowerCase();

    // Extraer id de data.id o de resource
    let id = body?.data?.id || body?.id || null;
    if (!id && typeof body?.resource === "string") {
      const parts = body.resource.split("/");
      id = parts.pop();
    }
    if (!id) return new Response("ignored", { status: 200 });

    // === Notificaciones de Payments (Checkout Pro) ===
    if (topic.includes("payment") || (typeof body?.resource === "string" && body.resource.includes("/payments/"))) {
      const pay = await fetchPaymentFromMP(id);
      const statusMapped = mapPaymentStatusToPurchaseStatus(pay?.status);
      const purchase =
        (await findPurchaseByExternalReference(pay?.external_reference)) ||
        (await findPurchaseByExternalReference(pay?.order?.external_reference));
      if (purchase?.id) {
        await settlePurchaseAndMaybeGift({
          purchaseId: purchase.id,
          statusMapped,
          meta: {
            paymentMethod: pay?.payment_method_id ?? null,
            paymentId: String(pay?.id || ""),
          },
        });
      }
      return new Response("ok", { status: 200 });
    }

    // === Notificaciones de Orders API ===
    if (topic.includes("order") || (typeof body?.resource === "string" && body.resource.includes("/orders/"))) {
      const order = await fetchOrderFromMP(id);
      const statusMapped = mapOrderStatusToPurchaseStatus(order?.status);
      const purchase = await findPurchaseByExternalReference(order?.external_reference);
      if (purchase?.id) {
        await settlePurchaseAndMaybeGift({
          purchaseId: purchase.id,
          statusMapped,
          meta: {
            paymentMethod: order?.transactions?.payments?.[0]?.payment_method?.id ?? null,
            paymentId: String(order?.id || ""),
          },
        });
      }
      return new Response("ok", { status: 200 });
    }

    // === Notificaciones de Merchant Orders (otro formato de Checkout Pro) ===
    if (topic.includes("merchant_order") || (typeof body?.resource === "string" && body.resource.includes("/merchant_orders/"))) {
      const mo = await fetchMerchantOrderFromMP(id);
      const extRef = mo?.external_reference;
      // Determinar estado agregado de pagos dentro del merchant_order
      // Si alguno está approved → approved; si hay pending/in_process y ninguno rejected → pending; si todos rejected → rejected
      const payments = Array.isArray(mo?.payments) ? mo.payments : [];
      let mapped = "pending";
      if (payments.some((p) => mapPaymentStatusToPurchaseStatus(p?.status) === "approved")) {
        mapped = "approved";
      } else if (payments.length && payments.every((p) => mapPaymentStatusToPurchaseStatus(p?.status) === "rejected")) {
        mapped = "rejected";
      }
      const purchase = await findPurchaseByExternalReference(extRef);
      if (purchase?.id) {
        await settlePurchaseAndMaybeGift({
          purchaseId: purchase.id,
          statusMapped: mapped,
          meta: {
            paymentMethod: payments?.[0]?.payment_type || "checkout_pro",
            paymentId: String(payments?.[0]?.id || mo?.id || ""),
          },
        });
      }
      return new Response("ok", { status: 200 });
    }

    // Desconocido pero no queremos que MP reintente eternamente
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("Webhook MP error:", e);
    // Devolvemos 200 para evitar loops de reintentos cuando el error es de nuestra app
    return new Response("ok", { status: 200 });
  }
}

/** GET simple para healthcheck / verificación */
export async function GET() {
  return new Response("ok", { status: 200 });
}
