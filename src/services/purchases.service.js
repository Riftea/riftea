// src/services/purchases.service.js
import prisma from "@/src/lib/prisma";
import { calculateFundSplit } from "@/src/lib/crypto";
import { createTickets } from "./tickets.service";
import { logAuditEvent } from "./audit.service";
import { enqueueJob } from "@/src/lib/queue";

/**
 * 🛒 Crea una compra con división automática 50/50 y genera tickets
 */
export async function createPurchaseWithTickets({
  userId,
  raffleId,
  productPrice,
  quantity = 1,
  metadata = {},
  paymentProvider = "stripe",
  paymentIntentId = null
}) {
  // 🔍 Validar que la rifa existe y está activa
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId }
  });

  if (!raffle || raffle.status !== "ACTIVE") {
    throw new Error("Sorteo no disponible o inactivo");
  }

  // 💰 Calcular totales y división 50/50
  const totalAmount = productPrice;
  const { ticketFund, platformFund } = calculateFundSplit(totalAmount);

  // 🔄 Transacción atómica: Purchase + Tickets + Audit
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

    // 2️⃣ Generar tickets seguros
    const tickets = await createTickets({
      userId,
      raffleId,
      purchaseId: purchase.id,
      quantity,
      tx // usar la misma transacción
    });

    // 3️⃣ Actualizar progreso de la rifa
    await tx.raffle.update({
      where: { id: raffleId },
      data: {
        currentFunding: {
          increment: ticketFund
        },
        totalTickets: {
          increment: quantity
        }
      }
    });

    // 4️⃣ Registrar auditoría
    await logAuditEvent({
      action: "PURCHASE_CREATED",
      entityType: "PURCHASE",
      entityId: purchase.id,
      userId,
      metadata: {
        totalAmount,
        ticketFund,
        platformFund,
        ticketsGenerated: quantity,
        raffleId
      },
      tx
    });

    return { purchase, tickets };
  });

  // 🚀 Encolar job para verificar si el sorteo llegó al 100%
  await enqueueJob("checkRaffleProgress", {
    raffleId,
    newFunding: result.purchase.ticketFund
  });

  // 📧 Encolar notificación de compra exitosa
  await enqueueJob("sendPurchaseConfirmation", {
    userId,
    purchaseId: result.purchase.id,
    ticketCount: quantity
  });

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