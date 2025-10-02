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
   * Chequea si el ticket se puede aplicar a una rifa.
   * (Acepta AVAILABLE / PENDING / ACTIVE siempre que no esté usado ni asociado a otra rifa)
   */
  async canApplyTicketToRaffle(ticketId, raffleId, userId) {
    if (!ticketId || !raffleId || !userId) {
      return { canUse: false, reason: "Parámetros incompletos" };
    }

    const [ticket, raffle] = await Promise.all([
      prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          userId: true,
          raffleId: true,
          status: true,
          uuid: true,
          hash: true,
          generatedAt: true,
          isUsed: true,
        },
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

    // Estados utilizables y flags
    const usableStates = new Set(["AVAILABLE", "PENDING", "ACTIVE"]);
    if (!usableStates.has(ticket.status)) {
      return { canUse: false, reason: "El ticket no está disponible para usar" };
    }
    if (ticket.raffleId) {
      return { canUse: false, reason: "El ticket ya está asociado a una rifa" };
    }
    if (ticket.isUsed) {
      return { canUse: false, reason: "El ticket ya fue usado" };
    }

    return { canUse: true };
  },

  /**
   * Aplica ticket genérico a una rifa: set raffleId, status IN_RAFFLE, isUsed=true y crea Participation.
   */
  async applyTicketToRaffle(ticketId, raffleId, userId) {
    const compat = await this.canApplyTicketToRaffle(ticketId, raffleId, userId);
    if (!compat.canUse) throw new Error(compat.reason || "Ticket no disponible");

    const part = await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { raffleId, status: "IN_RAFFLE", isUsed: true },
      });

      const created = await tx.participation.create({
        data: { raffleId, ticketId, isActive: true },
        include: {
          // Traemos ownerId para poder notificar al dueño
          raffle: { select: { id: true, title: true, endsAt: true, ownerId: true } },
          ticket: { select: { id: true, code: true, uuid: true, raffleId: true } },
        },
      });

      // Notificación al dueño del sorteo (si existe y no es el mismo usuario)
      try {
        if (created?.raffle?.ownerId && created.raffle.ownerId !== userId) {
          await tx.notification.create({
            data: {
              userId: created.raffle.ownerId,
              type: "SYSTEM_ALERT",
              title: "Nueva participación en tu sorteo",
              message: `Se agregó una participación en "${created.raffle.title}" con el ticket ${created.ticket.code}.`,
              raffleId,
              ticketId,
            },
          });
        }
      } catch (_) {}

      // Notificación al participante
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

      // Auditoría
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

  /**
   * === NUEVO ===
   * Emite 1 ticket de obsequio por una Purchase aprobada (idempotente por purchaseId).
   * @param {{ userId: string, purchaseId: string, notify?: boolean, force?: boolean }}
   * @returns {Promise<{created:boolean, ticketId?:string, reason?:string}>}
   */
  async issueGiftTicketForPurchase({ userId, purchaseId, notify = true, force = false }) {
    if (!userId || !purchaseId) throw new Error("userId y purchaseId son requeridos");

    // Traemos la purchase para validar pertenencia y (opcional) estado
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: { id: true, userId: true, status: true },
    });
    if (!purchase) return { created: false, reason: "Purchase no encontrada" };
    if (purchase.userId !== userId) return { created: false, reason: "Purchase no pertenece al usuario" };

    // Estado de compra (tu schema usa string "libre")
    const st = String(purchase.status || "").toLowerCase();
    if (!force && st && st !== "approved" && st !== "aprobado") {
      return { created: false, reason: `Purchase no aprobada (status="${purchase.status}")` };
    }

    // Idempotencia: ¿ya hay ticket GIFT para esta compra?
    const existing = await prisma.ticket.findFirst({
      where: { purchaseId, metodoPago: "GIFT" },
      select: { id: true },
    });
    if (existing) {
      return { created: false, ticketId: existing.id, reason: "Ya existe ticket de obsequio para esta compra" };
    }

    // Generación (una sola vez) usando tu helper actual
    const t = generateTicketData(userId); // { uuid, displayCode, hmac, generatedAt }

    // Creamos ticket
    const created = await prisma.ticket.create({
      data: {
        uuid: t.uuid,
        code: t.displayCode,
        hash: t.hmac,
        generatedAt: t.generatedAt,
        userId,
        purchaseId,
        raffleId: null,
        status: "AVAILABLE",
        metodoPago: "GIFT",
      },
      select: { id: true, code: true, uuid: true },
    });

    // Notificación amistosa (best-effort)
    if (notify) {
      try {
        await this.notifyGiftTicket({ userId, purchaseId, ticketId: created.id });
      } catch (e) {
        // no romper el flujo por notificación
        console.error("notifyGiftTicket failed (non-blocking)", e);
      }
    }

    // Auditoría (best-effort)
    try {
      await prisma.auditLog.create({
        data: {
          action: "GIFT_TICKET_ISSUED",
          userId,
          targetType: "purchase",
          targetId: purchaseId,
          newValues: { ticketId: created.id, purchaseId },
        },
      });
    } catch (_) {}

    return { created: true, ticketId: created.id };
  },

  /**
   * === NUEVO ===
   * Notificación por ticket de obsequio.
   * @param {{ userId:string, purchaseId:string, ticketId:string }}
   */
  async notifyGiftTicket({ userId, purchaseId, ticketId }) {
    await prisma.notification.create({
      data: {
        userId,
        type: "PURCHASE_CONFIRMATION",
        subtype: "TICKET_GIFT_RECEIVED",
        title: "🎁 ¡Tenés un ticket de obsequio!",
        message: "Usalo cuando quieras para participar en cualquier sorteo disponible.",
        actionUrl: "/mis-tickets",
        isActionable: true,
        targets: { purchaseId, ticketId },
        meta: { reason: "DigitalProductPurchaseApproved", quantity: 1 },
      },
    });
  },
};
