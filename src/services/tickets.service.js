// src/services/tickets.service.js
import {
  generateTicketUUID,
  generateTicketCode,
  createTicketHMAC,
  verifyTicketHMAC,
} from '@/lib/crypto.server';

import crypto from 'crypto';
import prisma from '@/lib/prisma';

// ---- Compatibilidad de firmas (acepta variantes históricas) ----
async function verifyTicketAny(ticket, userId, { verifyTicketHMAC }, legacyValidate) {
  if (!ticket) return false;
  const { uuid, code, hash } = ticket;
  const genAt = ticket.generatedAt ?? ticket.createdAt ?? new Date();

  // Canónico v2
  try { if (verifyTicketHMAC(uuid, userId, hash, genAt.getTime())) return true; } catch {}
  // Con createdAt explícito
  try { if (ticket.createdAt && verifyTicketHMAC(uuid, userId, hash, ticket.createdAt.getTime())) return true; } catch {}
  // Variantes de issuedAt
  try {
    const iso = new Date(genAt).toISOString();
    if (verifyTicketHMAC(uuid, userId, hash, iso)) return true;
    if (verifyTicketHMAC(uuid, userId, hash, Number(new Date(genAt).getTime()))) return true;
  } catch {}
  // Variante “code|user|createdAt” que viste en código viejo
  try {
    if (code && ticket.createdAt && verifyTicketHMAC(code, userId, hash, ticket.createdAt.getTime())) return true;
  } catch {}
  // Legacy SHA256(userId+uuid)
  try { if (legacyValidate(userId, uuid, hash)) return true; } catch {}
  return false;
}

// Backfill opcional para destrabar tickets antiguos (controlado por env)
async function backfillTicketHMACIfAllowed(ticket, userId, tx) {
  try {
    if (process.env.ALLOW_HMAC_BACKFILL !== 'true') return false;
    if (!ticket || ticket.userId !== userId) return false;
    if (ticket.status !== 'AVAILABLE') return false;

    const ts = (ticket.generatedAt ?? ticket.createdAt ?? new Date()).getTime();
    const newHash = createTicketHMAC(ticket.uuid, userId, ts);
    if (ticket.hash === newHash) return true;

    await (tx || prisma).ticket.update({
      where: { id: ticket.id },
      data: { hash: newHash },
    });
    return true;
  } catch (e) {
    console.error('[BACKFILL] Error:', e);
    return false;
  }
}

export class TicketsService {
  // Legacy SHA256 (compat)
  static generateTicketHash(userId, ticketUuid) {
    const data = `${userId}${ticketUuid}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  static validateTicket(userId, ticketUuid, hash) {
    const expected = this.generateTicketHash(userId, ticketUuid);
    return expected === hash;
  }

  /**
   * Crear tickets (genérico o asignado a rifa).
   */
  static async createTickets({ userId, purchaseId = null, quantity = 1, raffleId = null, tx = null }) {
    const db = tx || prisma;
    const out = [];

    // Validaciones mínimas
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new Error(`Usuario con ID ${userId} no encontrado`);
    if (raffleId) {
      const raffle = await db.raffle.findUnique({
        where: { id: raffleId },
        select: { id: true, status: true, endsAt: true },
      });
      if (!raffle) throw new Error(`Rifa con ID ${raffleId} no encontrada`);
      if (!['PUBLISHED', 'ACTIVE'].includes(raffle.status)) throw new Error('Rifa no disponible');
      if (raffle.endsAt && new Date() > new Date(raffle.endsAt)) throw new Error('Rifa finalizada');
    }

    for (let i = 0; i < quantity; i++) {
      let done = false, attempts = 0;
      while (!done && attempts < 5) {
        attempts++;
        try {
          const now = new Date();
          const uuid = generateTicketUUID();
          const code = generateTicketCode();
          const hash = createTicketHMAC(uuid, userId, now.getTime());

          const ticket = await db.ticket.create({
            data: {
              uuid,
              code,
              hash,
              userId,
              purchaseId,
              raffleId,
              status: 'AVAILABLE',
              generatedAt: now,
            },
          });
          out.push(ticket);
          done = true;
        } catch (e) {
          if (e?.code === 'P2002' && attempts < 5) continue;
          throw e;
        }
      }
    }
    return out;
  }

  static async generateTicket(userId, generatedBy = 'system', raffleId = null) {
    const [ticket] = await this.createTickets({ userId, quantity: 1, raffleId });
    const full = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        raffle: raffleId ? { select: { id: true, title: true, status: true } } : undefined,
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        title: generatedBy === 'superadmin' ? 'Ticket generado por superadmin' : 'Nuevo ticket recibido',
        message:
          generatedBy === 'superadmin'
            ? 'Un superadministrador ha generado un ticket para ti'
            : `Has recibido un nuevo ticket${raffleId ? ' para una rifa específica' : ''}`,
        type: 'SYSTEM_ALERT',
        raffleId,
      },
    });

    return full;
  }

  static async verifyTicketOwnership(ticketUuid, userId) {
    const ticket = await prisma.ticket.findUnique({
      where: { uuid: ticketUuid },
      include: {
        user: { select: { id: true, email: true } },
        raffle: { select: { id: true, title: true, status: true } },
      },
    });
    if (!ticket) return { valid: false, error: 'Ticket no encontrado' };
    if (ticket.userId !== userId) return { valid: false, error: 'Ticket no pertenece al usuario' };

    const valid = await verifyTicketAny(ticket, userId, { verifyTicketHMAC }, this.validateTicket.bind(this));
    if (!valid) return { valid: false, error: 'Hash de seguridad inválido' };

    return {
      valid: true,
      ticket: {
        uuid: ticket.uuid,
        code: ticket.code,
        status: ticket.status,
        createdAt: ticket.generatedAt || ticket.createdAt,
        isGeneric: !ticket.raffleId,
        raffle: ticket.raffle,
      },
    };
  }

  static async canApplyTicketToRaffle(ticketId, raffleId, userId) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, raffleId: true, status: true },
    });
    if (!ticket || ticket.userId !== userId) return { canUse: false, reason: 'Ticket no válido o no pertenece al usuario' };

    const dup = await prisma.participation.findFirst({
      where: { ticketId, raffleId, isActive: true },
      select: { id: true },
    });
    if (dup) return { canUse: false, reason: 'Este ticket ya está participando en esta rifa' };

    if (!['AVAILABLE', 'IN_RAFFLE'].includes(ticket.status)) {
      return { canUse: false, reason: 'Ticket no disponible' };
    }
    if (ticket.raffleId && ticket.raffleId !== raffleId) {
      return { canUse: false, reason: 'Ticket asignado a otra rifa' };
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        ownerId: true,
        status: true,
        endsAt: true,
        maxParticipants: true,
        _count: { select: { participations: true } },
      },
    });
    if (!raffle) return { canUse: false, reason: 'Rifa no encontrada' };
    if (!['PUBLISHED', 'ACTIVE'].includes(raffle.status)) {
      return { canUse: false, reason: 'La rifa no está disponible' };
    }
    if (raffle.endsAt && new Date() > new Date(raffle.endsAt)) {
      return { canUse: false, reason: 'La rifa ya terminó' };
    }
    if (raffle.ownerId && raffle.ownerId === userId) {
      return { canUse: false, reason: 'El propietario no puede participar en su propia rifa' };
    }
    if (raffle.maxParticipants && raffle._count.participations >= raffle.maxParticipants) {
      return { canUse: false, reason: 'La rifa alcanzó el límite máximo de participantes' };
    }

    return { canUse: true, reason: 'Ticket compatible con la rifa' };
  }

  static async getAvailableTicketsForUser(userId, raffleId = null) {
    const where = { userId };
    if (!raffleId) {
      where.status = 'AVAILABLE';
    } else {
      where.AND = [
        { status: { in: ['AVAILABLE', 'IN_RAFFLE'] } },
        { OR: [{ raffleId: null }, { raffleId }] },
      ];
    }

    return prisma.ticket.findMany({
      where,
      include: {
        raffle: { select: { id: true, title: true, status: true, endsAt: true } },
        participation: raffleId ? { select: { id: true, raffleId: true, isActive: true } } : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async applyTicketToRaffle(ticketId, raffleId, userId) {
    // 1) reglas/cupo
    const compat = await this.canApplyTicketToRaffle(ticketId, raffleId, userId);
    if (!compat.canUse) throw new Error(compat.reason);

    // 2) traer ticket completo
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { id: true, name: true, email: true } }, raffle: true },
    });
    if (!ticket) throw new Error('Ticket no encontrado');

    // 3) validar integridad con compat + backfill (si permitido)
    let valid = await verifyTicketAny(ticket, userId, { verifyTicketHMAC }, this.validateTicket.bind(this));
    if (!valid) {
      const didBackfill = await backfillTicketHMACIfAllowed(ticket, userId, null);
      if (didBackfill) {
        const refreshed = await prisma.ticket.findUnique({ where: { id: ticketId } });
        valid = await verifyTicketAny(refreshed, userId, { verifyTicketHMAC }, this.validateTicket.bind(this));
      }
    }
    if (!valid) throw new Error('Ticket inválido - hash no coincide');

    const raffle = await prisma.raffle.findUnique({ where: { id: raffleId } });

    // 4) transacción
    const result = await prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: ticketId }, data: { status: 'IN_RAFFLE', raffleId } });

      let participation;
      try {
        participation = await tx.participation.create({
          data: { ticketId, raffleId, isActive: true },
          include: {
            ticket: { include: { user: { select: { id: true, name: true, email: true } } } },
            raffle: true,
          },
        });
      } catch (e) {
        if (e?.code === 'P2002') throw new Error('Este ticket ya está participando en esta rifa');
        throw e;
      }

      await tx.notification.create({
        data: {
          userId,
          title: 'Ticket usado en sorteo',
          message: `Tu ticket ${ticket.code} fue usado en el sorteo "${raffle?.title ?? ''}"`,
          type: 'SYSTEM_ALERT',
          raffleId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'USE_TICKET_IN_RAFFLE',
          userId,
          targetType: 'ticket',
          targetId: ticketId,
          newValues: {
            ticketId,
            raffleId,
            wasGeneric: !ticket.raffleId,
            ticketCode: ticket.code,
          },
        },
      });

      return participation;
    });

    return result;
  }
}
