// src/lib/generateTickets.js
import { TicketsService } from '@/services/tickets.service';

export async function createTickets({ userId, raffleId = null, quantity = 1, purchaseId = null }) {
  return TicketsService.createTickets({ userId, purchaseId, quantity, raffleId });
}

export async function createDevTickets({ userId, raffleId = null, quantity = 1 }) {
  return TicketsService.createTickets({ userId, raffleId, quantity, purchaseId: null });
}

export async function createGenericTickets({ userId, quantity = 1, purchaseId = null }) {
  return TicketsService.createTickets({ userId, raffleId: null, quantity, purchaseId });
}

// (Opcional) Stats ya delegadas:
export async function getTicketStats(userId) {
  const all = await TicketsService.getUserTickets(userId);
  const result = {
    total: all.length,
    PENDING: 0, ACTIVE: 0, AVAILABLE: 0, IN_RAFFLE: 0,
    WINNER: 0, LOST: 0, DELETED: 0,
  };
  for (const t of all) result[t.status] = (result[t.status] ?? 0) + 1;
  return result;
}
