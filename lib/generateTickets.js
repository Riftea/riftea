import { prisma } from "./prisma.js";

function generateTicketCode() {
  const prefix = "RFT";
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}

export async function createTickets(userId, raffleId, quantity, purchaseId) {
  const tickets = [];

  for (let i = 0; i < quantity; i++) {
    let code = generateTicketCode();

    // Evitar duplicados
    while (await prisma.ticket.findUnique({ where: { code } })) {
      code = generateTicketCode();
    }

    tickets.push({
      code,
      userId,
      raffleId,
      purchaseId,
    });
  }

  return prisma.ticket.createMany({ data: tickets });
}
