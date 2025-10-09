// src/services/purchases.service.js
import prisma from "@/src/lib/prisma";
import { calculateFundSplit } from "@/src/lib/crypto";
import { createTickets } from "./tickets.service";
import { logAuditEvent } from "./audit.service";

// Si querés cambiar la regla sin tocar código, poné TICKET_UNIT en ENV.
// OJO: debe estar en las mismas unidades que uses en productPrice.
const TICKET_UNIT = Number(process.env.TICKET_UNIT ?? 1000); // 1 ticket cada 1000

/**
 * 🛒 Crea una compra con división automática 50/50 y genera tickets
 * Regla de tickets: 1 ticket por cada TICKET_UNIT de totalAmount (floor).
 */
export async function createPurchaseWithTickets({
  userId,
  raffleId,
  productPrice,        // total pagado por el usuario (mismas unidades que TICKET_UNIT)
  // quantity = 1,     // <— ya NO se usa para calcular tickets
  metadata = {},
  paymentProvider = "stripe",
  paymentIntentId = null
}) {
  if (!Number.isFinite(TICKET_UNIT) || TICKET_UNIT <= 0) {
    throw new Error("Configuración inválida: TICKET_UNIT debe ser > 0");
  }

  // 🔍 Validar que la rifa existe y está activa
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId }
  });

  if (!raffle || raffle.status !== "ACTIVE") {
    throw new Error("Sorteo no disponible o inactivo");
  }

  // 💰 Totales y split
  const totalAmount = Number(productPrice) || 0;
  if (totalAmount <= 0) {
    throw new Error("Monto de compra inválido");
  }
  const { ticketFund, platformFund } = calculateFundSplit(totalAmount);

  // 🎟️ Regla: 1 ticket por cada TICKET_UNIT del monto total (floor)
  let ticketsToIssue = Math.floor(totalAmount / TICKET_UNIT);
  // Si querés garantizar mínimo 1 ticket por compra, descomentá:
  // ticketsToIssue = Math.max(ticketsToIssue, 1);

  if (ticketsToIssue <= 0) {
    // Si no llega a TICKET_UNIT, no emite tickets.
    // Podés decidir si querés rechazar la compra o permitirla sin tickets:
    // throw new Error(`El monto no alcanza para un ticket. Se requiere al menos ${TICKET_UNIT}.`);
    // Por ahora, permitimos compra sin tickets:
    ticketsToIssue = 0;
  }

  // 🔄 Transacción atómica
  const result = await prisma.$transaction(async (tx) => {
    // 1️⃣ Crear la compra
    const purchase = await tx.purchase.create({
      data: {
        userId,
        raffleId,
        totalAmount,
        ticketFund,
        platformFund,
        status: "PENDING",
        paymentProvider,
        paymentIntentId,
        metadata
      }
    });

    // 2️⃣ Generar tickets según monto
    let tickets = [];
    if (ticketsToIssue > 0) {
      tickets = await createTickets({
        userId,
        raffleId,
        purchaseId: purchase.id,
        quantity: ticketsToIssue,
        tx // usar la misma transacción
      });
    }

    // 3️⃣ Actualizar progreso de la rifa
    await tx.raffle.update({
      where: { id: raffleId },
      data: {
        currentFunding: {
          increment: ticketFund
        },
        totalTickets: {
          increment: ticketsToIssue
        }
      }
    });

    // 4️⃣ Auditoría
    await logAuditEvent({
      action: "PURCHASE_CREATED",
      entityType: "PURCHASE",
      entityId: purchase.id,
      userId,
      metadata: {
        totalAmount,
        ticketFund,
        platformFund,
        ticketsGenerated: ticketsToIssue,
        raffleId,
        ticketUnit: TICKET_UNIT
      },
      tx
    });

    return { purchase, tickets };
  });

  // 🚫 Antes: encolábamos jobs (Redis). Ahora no-op.
  return result;
}

/**
 * 🔄 Actualizar estado de pago (webhook de Stripe/PayU)
 */
export async function updatePaymentStatus({
  purchaseId,
  status,
  providerReference,
  providerMetadata = {}
}) {
  const purchase = await prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      status,
      providerReference,
      providerMetadata,
      paidAt: status === "COMPLETED" ? new Date() : null
    }
  });

  // 🔍 Si el pago fue exitoso, activar tickets
  if (status === "COMPLETED") {
    await prisma.ticket.updateMany({
      where: { purchaseId },
      data: { status: "ACTIVE" }
    });

    await logAuditEvent({
      action: "PAYMENT_COMPLETED",
      entityType: "PURCHASE",
      entityId: purchaseId,
      userId: purchase.userId,
      metadata: { providerReference, amount: purchase.totalAmount }
    });
  }

  return purchase;
}

/**
 * 📊 Obtener estadísticas de compras por usuario
 */
export async function getUserPurchaseStats(userId) {
  const stats = await prisma.purchase.aggregate({
    where: { userId, status: "COMPLETED" },
    _sum: { totalAmount: true, ticketFund: true },
    _count: { id: true }
  });

  const ticketsCount = await prisma.ticket.count({
    where: { userId, status: "ACTIVE" }
  });

  return {
    totalSpent: stats._sum.totalAmount || 0,
    totalContributed: stats._sum.ticketFund || 0,
    purchaseCount: stats._count.id || 0,
    activeTickets: ticketsCount
  };
}
