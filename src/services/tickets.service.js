// src/services/tickets.service.js
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { generateTicketUUID, createTicketHash, generateTicketCode } from "@/src/lib/crypto";

const prisma = new PrismaClient();

export class TicketsService {
  /**
   * Genera un hash SHA256 basado en userId + ticketUuid
   */
  static generateTicketHash(userId, ticketUuid) {
    const data = `${userId}${ticketUuid}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Valida si un ticket es válido comparando el hash
   */
  static validateTicket(userId, ticketUuid, hash) {
    const expectedHash = this.generateTicketHash(userId, ticketUuid);
    return expectedHash === hash;
  }

  /**
   * 🎟️ Genera tickets seguros con UUID + SHA256 (usando tu función existente)
   */
  static async createTickets({
    userId,
    purchaseId = null,
    quantity = 1,
    raffleId = null, // 🆕 Soporte para tickets específicos de rifa
    tx = null
  }) {
    const prismaClient = tx || prisma;
    const tickets = [];
    const timestamp = Date.now();

    for (let i = 0; i < quantity; i++) {
      let attempts = 0;
      let ticketCreated = false;

      while (!ticketCreated && attempts < 5) {
        try {
          // 🔐 Generar identificadores únicos
          const uuid = generateTicketUUID();
          const code = generateTicketCode(); // Tu función existente
          const hash = this.generateTicketHash(userId, uuid); // Método mejorado

          // 🎫 Crear ticket en DB
          const ticket = await prismaClient.ticket.create({
            data: {
              uuid,
              code,
              hash,
              userId,
              purchaseId,
              raffleId, // 🆕 Puede ser null para tickets genéricos
              status: "AVAILABLE",
              generatedAt: new Date(timestamp),
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
   * Genera un nuevo ticket para un usuario (método nuevo mejorado)
   */
  static async generateTicket(userId, generatedBy = 'system', raffleId = null) {
    try {
      // Crear el ticket con UUID automático
      const tickets = await this.createTickets({
        userId,
        quantity: 1,
        raffleId // 🆕 Soporte para tickets específicos
      });

      const ticket = tickets[0];

      // Obtener el ticket completo con relaciones
      const updatedTicket = await prisma.ticket.findUnique({
        where: { id: ticket.id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            }
          },
          raffle: raffleId ? {
            select: {
              id: true,
              title: true,
              status: true
            }
          } : undefined
        }
      });

      // Crear notificación
      await prisma.notification.create({
        data: {
          userId,
          title: generatedBy === 'superadmin' 
            ? 'Ticket generado por superadmin'
            : 'Nuevo ticket recibido',
          message: generatedBy === 'superadmin' 
            ? 'Un superadministrador ha generado un ticket para ti'
            : `Has recibido un nuevo ticket${raffleId ? ' para una rifa específica' : ''}`,
          type: 'SYSTEM_ALERT',
          raffleId
        }
      });

      return updatedTicket;
    } catch (error) {
      console.error('Error generating ticket:', error);
      throw new Error('No se pudo generar el ticket');
    }
  }

  /**
   * ✅ Verificar propiedad de un ticket (tu función existente mejorada)
   */
  static async verifyTicketOwnership(ticketUuid, userId) {
    const ticket = await prisma.ticket.findUnique({
      where: { uuid: ticketUuid },
      include: { 
        user: { select: { id: true, email: true } },
        raffle: { select: { id: true, title: true, status: true } }
      }
    });

    if (!ticket) {
      return { valid: false, error: "Ticket no encontrado" };
    }

    if (ticket.userId !== userId) {
      return { valid: false, error: "Ticket no pertenece al usuario" };
    }

    // 🔐 Verificar hash SHA256 (método mejorado)
    if (!this.validateTicket(userId, ticket.uuid, ticket.hash)) {
      return { valid: false, error: "Hash de seguridad inválido" };
    }

    return {
      valid: true,
      ticket: {
        uuid: ticket.uuid,
        code: ticket.code,
        status: ticket.status,
        createdAt: ticket.generatedAt || ticket.createdAt,
        isGeneric: !ticket.raffleId,
        raffle: ticket.raffle
      }
    };
  }

  /**
   * 🆕 Verificar si un ticket puede usarse en una rifa específica
   */
  static async canUseTicketInRaffle(ticketId, raffleId, userId) {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { 
          raffle: true,
          participations: {
            where: { raffleId, isActive: true }
          }
        }
      });

      if (!ticket || ticket.userId !== userId) {
        return { canUse: false, reason: 'Ticket no válido o no pertenece al usuario' };
      }

      // Verificar si ya está participando en esta rifa
      if (ticket.participations.length > 0) {
        return { canUse: false, reason: 'Este ticket ya está participando en esta rifa' };
      }

      // Verificar estado del ticket
      if (!['AVAILABLE', 'IN_RAFFLE'].includes(ticket.status)) {
        return { canUse: false, reason: 'Ticket no disponible' };
      }

      // Si es un ticket específico de otra rifa, no se puede usar
      if (ticket.raffleId && ticket.raffleId !== raffleId) {
        return { canUse: false, reason: 'Ticket asignado a otra rifa' };
      }

      // Verificar la rifa
      const raffle = await prisma.raffle.findUnique({
        where: { id: raffleId },
        include: {
          _count: { select: { participations: true } }
        }
      });

      if (!raffle) {
        return { canUse: false, reason: 'Rifa no encontrada' };
      }

      if (!['PUBLISHED', 'ACTIVE'].includes(raffle.status)) {
        return { canUse: false, reason: 'La rifa no está disponible' };
      }

      if (raffle.deadline && new Date() > new Date(raffle.deadline)) {
        return { canUse: false, reason: 'La rifa ya terminó' };
      }

      // Verificar límite de participantes si existe
      if (raffle.maxParticipants && raffle._count.participations >= raffle.maxParticipants) {
        return { canUse: false, reason: 'La rifa alcanzó el límite máximo de participantes' };
      }

      return { canUse: true, reason: 'Ticket compatible con la rifa' };
      
    } catch (error) {
      console.error('Error checking ticket compatibility:', error);
      return { canUse: false, reason: 'Error de validación' };
    }
  }

  /**
   * 🆕 Obtener tickets disponibles para un usuario (genéricos + específicos disponibles)
   */
  static async getAvailableTicketsForUser(userId, raffleId = null) {
    const where = {
      userId: userId,
      status: {
        in: ['AVAILABLE', 'IN_RAFFLE']
      }
    };

    // Si se especifica una rifa, incluir tickets genéricos y específicos de esa rifa
    if (raffleId) {
      where.OR = [
        { raffleId: null }, // Tickets genéricos
        { raffleId: raffleId } // Tickets específicos de esta rifa
      ];
    }

    return await prisma.ticket.findMany({
      where,
      include: {
        raffle: {
          select: {
            id: true,
            title: true,
            status: true,
            deadline: true
          }
        },
        participations: {
          where: raffleId ? { raffleId } : undefined,
          select: {
            id: true,
            raffleId: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * ✅ Valida y usa un ticket para participar en un sorteo (MEJORADO)
   */
  static async useTicketInRaffle(ticketId, raffleId, userId) {
    try {
      // 🔍 Verificar compatibilidad primero
      const compatibility = await this.canUseTicketInRaffle(ticketId, raffleId, userId);
      if (!compatibility.canUse) {
        throw new Error(compatibility.reason);
      }

      // Obtener el ticket con todas sus relaciones
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { 
          user: true,
          raffle: true,
          participations: {
            where: { raffleId }
          }
        }
      });

      // Validar el hash del ticket por seguridad
      if (!this.validateTicket(userId, ticket.uuid, ticket.hash)) {
        throw new Error('Ticket inválido - hash no coincide');
      }

      // Obtener información de la rifa
      const raffle = await prisma.raffle.findUnique({
        where: { id: raffleId }
      });

      // 🔄 TRANSACCIÓN: Crear participación y actualizar estado
      const result = await prisma.$transaction(async (tx) => {
        // 1. Actualizar estado del ticket
        await tx.ticket.update({
          where: { id: ticketId },
          data: { 
            status: 'IN_RAFFLE',
            raffleId: raffleId // Asignar rifa si era genérico
          }
        });

        // 2. Crear participación
        const participation = await tx.participation.create({
          data: {
            ticketId,
            raffleId,
            isActive: true
          },
          include: {
            ticket: {
              include: {
                user: {
                  select: { id: true, name: true, email: true }
                }
              }
            },
            raffle: true
          }
        });

        // 3. Crear notificación
        await tx.notification.create({
          data: {
            userId,
            title: `Ticket usado en sorteo`,
            message: `Tu ticket ${ticket.code} fue usado en el sorteo "${raffle.title}"`,
            type: 'SYSTEM_ALERT',
            raffleId
          }
        });

        // 4. Log de auditoría
        await tx.auditLog.create({
          data: {
            action: 'USE_TICKET_IN_RAFFLE',
            userId: userId,
            targetType: 'ticket',
            targetId: ticketId,
            newValues: {
              ticketId,
              raffleId,
              wasGeneric: !ticket.raffleId,
              ticketCode: ticket.code
            }
          }
        });

        return participation;
      });

      return result;
    } catch (error) {
      console.error('Error using ticket in raffle:', error);
      throw error;
    }
  }

  /**
   * Obtiene todos los tickets de un usuario
   */
  static async getUserTickets(userId, status = null) {
    const where = { userId };
    if (status) {
      where.status = status;
    }

    return await prisma.ticket.findMany({
      where,
      include: {
        raffle: {
          select: {
            id: true,
            title: true,
            status: true,
            deadline: true
          }
        },
        participations: {
          include: {
            raffle: {
              select: {
                id: true,
                title: true,
                status: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Obtiene información de un ticket específico
   */
  static async getTicketInfo(ticketId) {
    return await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        },
        raffle: {
          select: {
            id: true,
            title: true,
            status: true,
            deadline: true
          }
        },
        participations: {
          include: {
            raffle: {
              select: {
                id: true,
                title: true,
                status: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * 🎲 Seleccionar ticket ganador aleatorio para una rifa (tu función existente)
   */
  static async selectRandomWinner(raffleId) {
    // Buscar participaciones activas
    const activeParticipations = await prisma.participation.findMany({
      where: {
        raffleId,
        isActive: true,
        ticket: {
          status: "IN_RAFFLE"
        }
      },
      include: {
        ticket: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    if (activeParticipations.length === 0) {
      throw new Error("No hay participaciones activas para sortear");
    }

    // 🎲 Selección aleatoria criptográficamente segura
    const randomIndex = crypto.randomInt(0, activeParticipations.length);
    const winnerParticipation = activeParticipations[randomIndex];

    // 🏆 Marcar como ganador en DB
    await prisma.$transaction(async (tx) => {
      // Marcar ticket como ganador
      await tx.ticket.update({
        where: { id: winnerParticipation.ticket.id },
        data: { status: "WINNER" }
      });

      // Marcar participación como ganadora
      await tx.participation.update({
        where: { id: winnerParticipation.id },
        data: { isWinner: true }
      });

      // Actualizar raffle con el ganador
      await tx.raffle.update({
        where: { id: raffleId },
        data: {
          winnerId: winnerParticipation.ticket.userId,
          winningTicket: winnerParticipation.ticket.code,
          drawnAt: new Date(),
          status: 'COMPLETED'
        }
      });

      // Crear notificación para el ganador
      await tx.notification.create({
        data: {
          userId: winnerParticipation.ticket.userId,
          title: '🎉 ¡Felicidades! Has ganado',
          message: `Tu ticket ${winnerParticipation.ticket.code} ganó el sorteo`,
          type: 'WINNER_NOTIFICATION',
          raffleId
        }
      });
    });

    return {
      winnerTicket: {
        uuid: winnerParticipation.ticket.uuid,
        code: winnerParticipation.ticket.code,
        user: winnerParticipation.ticket.user
      },
      totalParticipants: activeParticipations.length
    };
  }

  /**
   * 📊 Estadísticas de tickets por rifa (adaptado a participaciones)
   */
  static async getRaffleTicketStats(raffleId) {
    const participationStats = await prisma.participation.groupBy({
      by: ['isActive', 'isWinner'],
      where: { raffleId },
      _count: { id: true }
    });

    const ticketStats = await prisma.ticket.groupBy({
      by: ['status'],
      where: {
        participations: {
          some: { raffleId }
        }
      },
      _count: { id: true }
    });

    return {
      participations: participationStats.reduce((acc, stat) => {
        const key = stat.isWinner ? 'winner' : stat.isActive ? 'active' : 'inactive';
        acc[key] = stat._count.id;
        return acc;
      }, {}),
      tickets: ticketStats.reduce((acc, stat) => {
        acc[stat.status.toLowerCase()] = stat._count.id;
        return acc;
      }, {})
    };
  }

  /**
   * Elimina un ticket (solo superadmin)
   */
  static async deleteTicket(ticketId, adminId) {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { user: true }
      });

      if (!ticket) {
        throw new Error('Ticket no encontrado');
      }

      if (ticket.status !== 'AVAILABLE') {
        throw new Error('Solo se pueden eliminar tickets disponibles');
      }

      await prisma.$transaction(async (tx) => {
        // Cambiar estado a DELETED en lugar de eliminar físicamente
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: 'DELETED' }
        });

        // Notificar al usuario
        await tx.notification.create({
          data: {
            userId: ticket.userId,
            title: 'Ticket eliminado',
            message: 'Un administrador eliminó tu ticket',
            type: 'SYSTEM_ALERT',
          }
        });

        // Log de auditoría
        await tx.auditLog.create({
          data: {
            action: 'TICKET_DELETED',
            userId: adminId,
            targetType: 'ticket',
            targetId: ticket.id,
            newValues: {
              ticketUuid: ticket.uuid,
              reason: 'Admin deletion',
              targetUserId: ticket.userId
            }
          }
        });
      });

      return { success: true, message: 'Ticket eliminado correctamente' };
    } catch (error) {
      console.error('Error deleting ticket:', error);
      throw error;
    }
  }

  /**
   * 🎯 Obtener tickets de usuario para una rifa específica (tu función existente)
   */
  static async getUserRaffleTickets(userId, raffleId) {
    return await prisma.participation.findMany({
      where: {
        raffleId,
        ticket: {
          userId,
          status: { in: ["AVAILABLE", "IN_RAFFLE"] }
        }
      },
      include: {
        ticket: {
          select: {
            uuid: true,
            code: true,
            status: true,
            generatedAt: true,
          }
        },
        raffle: {
          select: {
            id: true,
            title: true,
            status: true,
            deadline: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}