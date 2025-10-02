export const runtime = "nodejs";

import prisma from "@/lib/prisma";
import { TicketsService } from "@/services/tickets.service";

/** Consulta el estado real de una Order en MP */
async function fetchOrderFromMP(orderId) {
  const res = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Client-Info": "riftea-webhook/1.0",
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`MercadoPago Orders GET ${orderId} error: ${data?.message || res.status}`);
  }
  return data;
}

/** Mapea estado de MP → estado de Purchase (string libre) */
function mapOrderStatusToPurchaseStatus(mpStatus) {
  const s = String(mpStatus || "").toLowerCase();
  if (["approved", "captured", "authorized"].includes(s)) return "approved";
  if (["rejected", "cancelled", "canceled"].includes(s)) return "rejected";
  if (["processing", "in_process", "pending"].includes(s)) return "pending";
  return s || "pending";
}

/** Busca la purchase por external_reference: "riftea_<purchaseId>" */
async function findPurchaseByExternalReference(order) {
  const extRef = String(order?.external_reference || "");
  if (!extRef.startsWith("riftea_")) return null;
  const purchaseId = extRef.replace("riftea_", "");
  if (!purchaseId) return null;
  return prisma.purchase.findUnique({ where: { id: purchaseId }, select: { id: true } });
}

/** Aplica cambios en Purchase y, si corresponde, regala ticket (idempotente) */
async function settlePurchaseAndMaybeGift({ purchaseId, mpOrder, statusMapped }) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, userId: true, status: true, currency: true, amount: true },
  });
  if (!purchase) return;

  // Idempotencia: si ya estaba approved y vuelve a venir "approved", no hacemos nada
  if (String(purchase.status).toLowerCase() === "approved" && statusMapped === "approved") return;

  await prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      status: statusMapped,
      paymentMethod: mpOrder?.transactions?.payments?.[0]?.payment_method?.id || null,
      paymentId: String(mpOrder?.id || ""), // guardamos el orderId en paymentId para trazabilidad
    },
  });

  if (statusMapped === "approved") {
    await TicketsService.issueGiftTicketForPurchase({
      userId: purchase.userId,
      purchaseId: purchase.id,
      notify: true,
      force: true,
    });
  }
}

/** POST: receptor de notificaciones MP */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    // MP te puede mandar: { type:"order", data:{ id } } o { resource:".../orders/<id>" }
    const topic = body?.type || body?.topic || "";
    const fromResource =
      typeof body?.resource === "string" && body.resource.includes("/orders/")
        ? body.resource.split("/").pop()
        : null;

    const orderId = body?.data?.id || fromResource || body?.id || null;
    if (!orderId) return new Response("ignored", { status: 200 });

    const order = await fetchOrderFromMP(orderId);
    const statusMapped = mapOrderStatusToPurchaseStatus(order?.status);
    const purchase = await findPurchaseByExternalReference(order);
    if (!purchase?.id) {
      console.warn("Webhook MP: purchase no encontrada para order", orderId, order?.external_reference);
      return new Response("ok", { status: 200 });
    }

    await settlePurchaseAndMaybeGift({ purchaseId: purchase.id, mpOrder: order, statusMapped });
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("Webhook MP error:", e);
    // respondemos 200 para no entrar en loops si el error fue “nuestro”
    return new Response("ok", { status: 200 });
  }
}

/** GET: healthcheck/IPN */
export async function GET() {
  return new Response("ok", { status: 200 });
}
