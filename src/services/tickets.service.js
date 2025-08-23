// src/services/tickets.service.js
import { generateTicketUUID, createTicketHash, generateTicketCode } from "@/src/lib/crypto";

/**
 * 🎟️ Genera tickets seguros con UUID + SHA256
 */
export async function createTickets({
  userId,
  raffleId,
  purchaseId,
  quantity = 1,
  tx = null // transacción opcional de Prisma
}) {
  const prismaClient = tx || (await import("@/src/lib/prisma")).default;
  const tickets = [];
  const timestamp = Date.now();

  for (let i = 0; i < quantity; i++) {
    let attempts = 0;
    let ticketCreated = false;

    while (!ticketCreated && attempts < 5) {
      try {
        // 🔐 Generar identificadores únicos
        const uuid = generateTicketUUID();
        const displayCode = generateTicketCode();
        const hash = createTicketHash(uuid, userId, timestamp);

        // 🎫 Crear ticket en DB
        const ticket = await prismaClient.ticket.create({
          data: {
            uuid,
            displayCode,
            hash,
            userId,
            raffleId,
            purchaseId,
            status: "PENDING", // se activa cuando el pago confirma
            generatedAt: new Date(timestamp),
            metadata: {
              userAgent: "system",
              ipAddress: "127.0.0.1" // en producción obtener IP real
            }
          }
        });

        tickets.push(ticket);
        ticketCreated = true;

      } catch (error) {
        attempts++;
        
        if (error.code === 'P2002') { // Unique constraint violation
          console.warn(`🔄 Colisión UUID intento ${attempts}/5`);
          if (attempts >= 5) {
            throw new Error("No fue posible generar ticket único tras 5 intentos");
          }
        } else {
          throw error;
        }
      }
    }
  }

  return tickets;
}

/**
 * ✅ Verificar propiedad de un ticket
 */
export async function verifyTicketOwnership(ticketUuid, userId) {
  const ticket = await prisma.ticket.findUnique({
    where: { uuid: ticketUuid },
    include: { user: { select: { id: true, email: true } } }
  });

  if (!ticket) {
    return { valid: false, error: "Ticket no encontrado" };
  }

  if (ticket.userId !== userId) {
    return { valid: false, error: "Ticket no pertenece al usuario" };
  }

  // 🔐 Verificar hash SHA256
  const expectedHash = createTicketHash(ticket.uuid, userId, ticket.generatedAt.getTime());
  if (ticket.hash !== expectedHash) {
    return { valid: false, error: "Hash de seguridad inválido" };
  }

  return {
    valid: true,
    ticket: {
      uuid: ticket.uuid,
      displayCode: ticket.displayCode,
      status: ticket.status,
      raffleId: ticket.raffleId,
      createdAt: ticket.generatedAt
    }
  };
}

/**
 * 🎯 Obtener tickets de usuario para una rifa específica
 */
export async function getUserRaffleTickets(userId, raffleId) {
  return await prisma.ticket.findMany({
    where: {
      userId,
      raffleId,
      status: { in: ["ACTIVE", "PENDING"] }
    },
    select: {
      uuid: true,
      displayCode: true,
      status: true,
      generatedAt: true,
      raffle: {
        select: {
          id: true,
          title: true,
          status: true,
          endDate: true
        }
      }
    },
    orderBy: { generatedAt: 'desc' }
  });
}

/**
 * 🎲 Seleccionar ticket ganador aleatorio para una rifa
 */
export async function selectRandomWinner(raffleId) {
  const activeTickets = await prisma.ticket.findMany({
    where: {
      raffleId,
      status: "ACTIVE"
    },
    include: {
      user: {
        select: { id: true, name: true, email: true }
      }
    }
  });

  if (activeTickets.length === 0) {
    throw new Error("No hay tickets activos para sortear");
  }

  // 🎲 Selección aleatoria criptográficamente segura
  const crypto = require("crypto");
  const randomIndex = crypto.randomInt(0, activeTickets.length);
  const winnerTicket = activeTickets[randomIndex];

  // 🏆 Marcar como ganador en DB
  await prisma.ticket.update({
    where: { uuid: winnerTicket.uuid },
    data: { 
      status: "WINNER",
      wonAt: new Date()
    }
  });

  // 📝 Marcar tickets restantes como no ganadores
  await prisma.ticket.updateMany({
    where: {
      raffleId,
      uuid: { not: winnerTicket.uuid },
      status: "ACTIVE"
    },
    data: { status: "LOST" }
  });

  return {
    winnerTicket: {
      uuid: winnerTicket.uuid,
      displayCode: winnerTicket.displayCode,
      user: winnerTicket.user
    },
    totalParticipants: activeTickets.length
  };
}

/**
 * 📊 Estadísticas de tickets por rifa
 */
export async function getRaffleTicketStats(raffleId) {
  const stats = await prisma.ticket.groupBy({
    by: ['status'],
    where: { raffleId },
    _count: { uuid: true }
  });

  return stats.reduce((acc, stat) => {
    acc[stat.status.toLowerCase()] = stat._count.uuid;
    return acc;
  }, {});
}