// src/services/tickets.service.js
import prisma from "@/lib/prisma";
import { generateTicketData, validateTicket } from "@/lib/crypto.server";

/**
 * Tickets:
 * - Creación: SIEMPRE genéricos → raffleId = null, status = "AVAILABLE".
 * - Uso en rifa: pasa a "IN_RAFFLE" + se setea raffleId y se crea Participation.
 */

export const TicketsService = {
  /**
   * Crea N tickets genéricos (sin rifa asignada).
   * @param {{ userId: string, quantity?: number }}
   * @returns {Promise<Array<{id:string, uuid:string, code:string, generatedAt:Date, userId:string, status:string}>>}
   */
  async createTickets({ userId, quantity = 1 }) {
    if (!userId) throw new Error("userId es requerido");

    const qty = Number.parseInt(quantity ?? 1, 10);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 50) {
      throw new Error("quantity debe ser un entero entre 1 y 50");
    }

    // Validar usuario
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new Error(`Usuario con ID ${userId} no encontrado`);

    // Crear genéricos
    const items = await prisma.$transaction(async (tx) => {
      const out = [];
      for (let i = 0; i < qty; i++) {
        const t = generateTicketData(userId); // { uuid, displayCode, hmac, generatedAt }
        const created = await tx.ticket.create({
          data: {
            uuid: t.uuid,
            code: t.displayCode,
            hash: t.hmac,
            generatedAt: t.generatedAt,
            userId,
            raffleId: null,
            status: "AVAILABLE",
          },
          select: { id: true, uuid: true, code: true, generatedAt: true, userId: true, status: true },
        });
        out.push(created);
      }
      return out;
    });

    return items;
  },

  /**
   * Atajo para 1 ticket (admin/superadmin).
   */
  async generateTicket(userId, generatedBy = "system") {
    const [ticket] = await this.createTickets({ userId, quantity: 1 });

    // Notificación best-effort
    try {
      await prisma.notification.create({
        data: {
          userId,
          title: generatedBy === "superadmin" ? "Ticket generado por superadmin" : "Nuevo ticket recibido",
          message: "Se generó un ticket genérico disponible para usar en cualquier sorteo.",
          type: "SYSTEM_ALERT",
        },
      });
    } catch (_) {}

    return ticket;
  },

  /**
   * Verifica que el ticket pertenece al user y su HMAC sea válido.
   */
  async verifyTicketOwnership(ticketUuid, userId) {
    const ticket = await prisma.ticket.findUnique({
      where: { uuid: ticketUuid },
      select: { uuid: true, code: true, hash: true, generatedAt: true, userId: true, raffleId: true },
    });
    if (!ticket) return { valid: false, error: "Ticket no encontrado" };
    if (ticket.userId !== userId) return { valid: false, error: "Ticket no pertenece al usuario" };

    const res = validateTicket(
      { uuid: ticket.uuid, hmac: ticket.hash, generatedAt: ticket.generatedAt },
      ticket.userId
    );
    if (!res.valid) return { valid: false, error: res.error || "Firma HMAC inválida" };

    return {
      valid: true,
      ticket: {
        uuid: ticket.uuid,
        code: ticket.code,
        createdAt: ticket.generatedAt,
        isGeneric: ticket.raffleId == null, // debería ser true siempre hasta que lo use
      },
    };
  },

  /**
   * Lista tickets disponibles (genéricos) de un usuario.
   */
  async getAvailableTicketsForUser(userId) {
    if (!userId) throw new Error("userId es requerido");
    return prisma.ticket.findMany({
      where: { userId, status: "AVAILABLE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, uuid: true, code: true, generatedAt: true, status: true },
    });
  },

  /**
   * Chequea si el ticket se puede aplicar a una rifa (desde AVAILABLE).
   */
  async canApplyTicketToRaffle(ticketId, raffleId, userId) {
    if (!ticketId || !raffleId || !userId) {
      return { canUse: false, reason: "Parámetros incompletos" };
    }

    const [ticket, raffle] = await Promise.all([
      prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, userId: true, raffleId: true, status: true, uuid: true, hash: true, generatedAt: true },
      }),
      prisma.raffle.findUnique({
        where: { id: raffleId },
        select: {
          id: true,
          status: true,
          endsAt: true,
          ownerId: true,
          maxParticipants: true,
          _count: { select: { participations: true } },
        },
      }),
    ]);

    if (!ticket) return { canUse: false, reason: "Ticket no encontrado" };
    if (ticket.userId !== userId) return { canUse: false, reason: "Este ticket no te pertenece" };

    // HMAC válido
    const res = validateTicket(
      { uuid: ticket.uuid, hmac: ticket.hash, generatedAt: ticket.generatedAt },
      userId
    );
    if (!res.valid) return { canUse: false, reason: "Ticket inválido (firma HMAC inválida)" };

    if (!raffle) return { canUse: false, reason: "Rifa no encontrada" };
    if (!["PUBLISHED", "ACTIVE"].includes(raffle.status)) {
      return { canUse: false, reason: "Rifa no disponible" };
    }
    if (raffle.endsAt && new Date() > new Date(raffle.endsAt)) {
      return { canUse: false, reason: "La rifa ya ha finalizado" };
    }
    if (raffle.ownerId && raffle.ownerId === userId) {
      return { canUse: false, reason: "El propietario no puede participar en su propia rifa" };
    }
    if (raffle.maxParticipants && raffle._count.participations >= raffle.maxParticipants) {
      return { canUse: false, reason: "La rifa alcanzó el límite máximo de participantes" };
    }

    // Solo desde AVAILABLE
    if (ticket.status !== "AVAILABLE") {
      return { canUse: false, reason: "El ticket no está disponible para usar" };
    }
    if (ticket.raffleId) {
      return { canUse: false, reason: "El ticket ya está asociado a una rifa" };
    }

    return { canUse: true };
  },

  /**
   * Aplica ticket genérico a una rifa: set raffleId, status IN_RAFFLE y crea Participation.
   */
  async applyTicketToRaffle(ticketId, raffleId, userId) {
    const compat = await this.canApplyTicketToRaffle(ticketId, raffleId, userId);
    if (!compat.canUse) throw new Error(compat.reason || "Ticket no disponible");

    const part = await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { raffleId, status: "IN_RAFFLE" },
      });

      const created = await tx.participation.create({
        data: { raffleId, ticketId, isActive: true },
        include: {
          raffle: { select: { id: true, title: true, endsAt: true } },
          ticket: { select: { id: true, code: true, uuid: true, raffleId: true } },
        },
      });

      // Notificación / auditoría best-effort
      try {
        await tx.notification.create({
          data: {
            userId,
            title: "Ticket usado en sorteo",
            message: `Tu ticket ${created.ticket.code} fue usado en el sorteo "${created.raffle.title}"`,
            type: "SYSTEM_ALERT",
            raffleId,
          },
        });
      } catch (_) {}

      try {
        await tx.auditLog.create({
          data: {
            action: "USE_TICKET_IN_RAFFLE",
            userId,
            targetType: "ticket",
            targetId: ticketId,
            newValues: { ticketId, raffleId, ticketCode: created.ticket.code },
          },
        });
      } catch (_) {}

      return created;
    });

    return part;
  },
};
