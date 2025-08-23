// src/jobs/checkProgress.job.js
import prisma from "@/src/lib/prisma";
import { enqueueJob, JobTypes } from "@/src/lib/queue";
import { logAuditEvent } from "@/src/services/audit.service";

/**
 * 📊 Verifica si un sorteo alcanzó el 100% y lo activa automáticamente
 */
export async function checkRaffleProgressJob(job) {
  const { raffleId, newFunding } = job.data;
  
  try {
    console.log(`📊 Verificando progreso del sorteo ${raffleId}...`);

    // 🎯 Obtener datos actuales de la rifa
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      include: {
        _count: {
          select: { tickets: true }
        }
      }
    });

    if (!raffle) {
      throw new Error(`Sorteo ${raffleId} no encontrado`);
    }

    // 💰 Calcular progreso actual
    const progressPercentage = (raffle.currentFunding / raffle.targetFunding) * 100;
    const wasCompleted = raffle.status === 'COMPLETED';

    console.log(`📈 Sorteo ${raffle.title}: ${progressPercentage.toFixed(2)}% (${raffle.currentFunding}/${raffle.targetFunding})`);

    // 🎉 ¿Alcanzamos el 100%?
    if (progressPercentage >= 100 && !wasCompleted) {
      
      // 🔄 Actualizar estado a COMPLETED
      const updatedRaffle = await prisma.raffle.update({
        where: { id: raffleId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          finalFunding: raffle.currentFunding
        }
      });

      // 📝 Registrar en auditoría
      await logAuditEvent({
        action: 'RAFFLE_FULLY_FUNDED',
        entityType: 'RAFFLE',
        entityId: raffleId,
        userId: null, // sistema
        metadata: {
          finalFunding: raffle.currentFunding,
          targetFunding: raffle.targetFunding,
          progressPercentage: progressPercentage.toFixed(2),
          totalTickets: raffle._count.tickets,
          triggeredBy: 'automated_check'
        }
      });

      // 🚀 Programar ejecución automática del sorteo (ej: en 1 hora)
      await enqueueJob(JobTypes.EXECUTE_RAFFLE, {
        raffleId,
        scheduledBy: 'system',
        reason: 'fully_funded'
      }, {
        delay: 60 * 60 * 1000, // 1 hora de delay
        priority: 10
      });

      // 📧 Enviar notificaciones a todos los participantes
      const participants = await prisma.user.findMany({
        where: {
          tickets: {
            some: {
              raffleId,
              status: 'ACTIVE'
            }
          }
        },
        select: { id: true, email: true, name: true }
      });

      // 🎊 Encolar notificaciones
      for (const participant of participants) {
        await enqueueJob('sendRaffleCompleteNotification', {
          userId: participant.id,
          raffleId,
          raffleTitle: raffle.title,
          executeDate: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        });
      }

      console.log(`🎉 ¡Sorteo ${raffle.title} completamente financiado! Ejecutándose en 1 hora.`);
      console.log(`👥 Notificando a ${participants.length} participantes`);

      return {
        status: 'COMPLETED',
        progressPercentage,
        participantsNotified: participants.length,
        executeScheduled: true
      };
    }

    // 📊 Actualizar métricas si no está completo
    if (progressPercentage < 100) {
      
      // 🔔 Notificar hitos importantes (25%, 50%, 75%, 90%)
      const milestones = [25, 50, 75, 90];
      const previousPercentage = ((raffle.currentFunding - newFunding) / raffle.targetFunding) * 100;
      
      for (const milestone of milestones) {
        if (previousPercentage < milestone && progressPercentage >= milestone) {
          
          // 📝 Log del hito alcanzado
          await logAuditEvent({
            action: 'RAFFLE_MILESTONE_REACHED',
            entityType: 'RAFFLE',
            entityId: raffleId,
            metadata: {
              milestone: `${milestone}%`,
              currentFunding: raffle.currentFunding,
              progressPercentage: progressPercentage.toFixed(2)
            }
          });

          // 🎯 Notificación especial para 90% (urgencia)
          if (milestone === 90) {
            await enqueueJob('sendUrgentFundingNotification', {
              raffleId,
              progressPercentage: progressPercentage.toFixed(2),
              remainingAmount: raffle.targetFunding - raffle.currentFunding
            });
          }

          console.log(`🎯 Hito ${milestone}% alcanzado para sorteo ${raffle.title}`);
          break;
        }
      }
    }

    return {
      status: 'IN_PROGRESS',
      progressPercentage: progressPercentage.toFixed(2),
      currentFunding: raffle.currentFunding,
      targetFunding: raffle.targetFunding,
      remainingAmount: raffle.targetFunding - raffle.currentFunding
    };

  } catch (error) {
    console.error(`❌ Error verificando progreso del sorteo ${raffleId}:`, error);
    
    // 📝 Log del error
    await logAuditEvent({
      action: 'RAFFLE_PROGRESS_CHECK_FAILED',
      entityType: 'RAFFLE',
      entityId: raffleId,
      metadata: {
        error: error.message,
        newFunding,
        timestamp: new Date().toISOString()
      }
    });

    throw error;
  }
}

/**
 * 🎲 Ejecutar sorteo automáticamente
 */
export async function executeRaffleJob(job) {
  const { raffleId, scheduledBy = 'system', reason = 'scheduled' } = job.data;
  
  try {
    console.log(`🎲 Ejecutando sorteo ${raffleId}...`);

    // 🔍 Verificar que el sorteo esté listo
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      include: {
        tickets: {
          where: { status: 'ACTIVE' },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    if (!raffle || raffle.status !== 'COMPLETED') {
      throw new Error(`Sorteo ${raffleId} no está listo para ejecutar`);
    }

    if (raffle.tickets.length === 0) {
      throw new Error(`No hay tickets activos para el sorteo ${raffleId}`);
    }

    // 🎲 Selección aleatoria del ganador
    const crypto = require("crypto");
    const randomIndex = crypto.randomInt(0, raffle.tickets.length);
    const winnerTicket = raffle.tickets[randomIndex];
    const randomSeed = crypto.randomBytes(32).toString('hex');

    console.log(`🏆 Ticket ganador: ${winnerTicket.displayCode} (${winnerTicket.user.name})`);

    // 🔄 Transacción atómica para actualizar todo
    await prisma.$transaction(async (tx) => {
      
      // 🏆 Marcar ticket ganador
      await tx.ticket.update({
        where: { uuid: winnerTicket.uuid },
        data: { 
          status: 'WINNER',
          wonAt: new Date()
        }
      });

      // 😢 Marcar tickets perdedores
      await tx.ticket.updateMany({
        where: {
          raffleId,
          uuid: { not: winnerTicket.uuid },
          status: 'ACTIVE'
        },
        data: { status: 'LOST' }
      });

      // 🎯 Actualizar estado del sorteo
      await tx.raffle.update({
        where: { id: raffleId },
        data: {
          status: 'EXECUTED',
          executedAt: new Date(),
          winnerTicketId: winnerTicket.uuid,
          winnerId: winnerTicket.userId
        }
      });

      // 📝 Auditoría completa del sorteo
      await logAuditEvent({
        action: 'RAFFLE_EXECUTED',
        entityType: 'RAFFLE',
        entityId: raffleId,
        userId: winnerTicket.userId,
        metadata: {
          winnerTicketId: winnerTicket.uuid,
          winnerUserId: winnerTicket.userId,
          totalParticipants: raffle.tickets.length,
          finalFunding: raffle.finalFunding,
          randomSeed,
          scheduledBy,
          reason,
          executionTime: new Date().toISOString()
        },
        tx
      });
    });

    // 🎊 Notificar al ganador
    await enqueueJob(JobTypes.SEND_WINNER_NOTIFICATION, {
      winnerId: winnerTicket.userId,
      raffleId,
      raffleTitle: raffle.title,
      ticketCode: winnerTicket.displayCode,
      prizeAmount: raffle.finalFunding
    }, {
      priority: 100 // máxima prioridad
    });

    // 📧 Notificar a perdedores (consolación)
    const losers = raffle.tickets.filter(t => t.uuid !== winnerTicket.uuid);
    for (const loserTicket of losers) {
      await enqueueJob('sendConsolationNotification', {
        userId: loserTicket.userId,
        raffleId,
        raffleTitle: raffle.title,
        winnerName: winnerTicket.user.name.split(' ')[0] // solo primer nombre
      }, {
        delay: 300000 // 5 minutos después
      });
    }

    console.log(`✅ Sorteo ${raffle.title} ejecutado exitosamente`);
    console.log(`🏆 Ganador: ${winnerTicket.user.name} (${winnerTicket.displayCode})`);
    console.log(`💰 Premio: ${raffle.finalFunding}`);
    console.log(`👥 Total participantes: ${raffle.tickets.length}`);

    return {
      status: 'EXECUTED',
      winner: {
        ticketId: winnerTicket.uuid,
        ticketCode: winnerTicket.displayCode,
        userId: winnerTicket.userId,
        userName: winnerTicket.user.name
      },
      totalParticipants: raffle.tickets.length,
      prizeAmount: raffle.finalFunding,
      randomSeed
    };

  } catch (error) {
    console.error(`❌ Error ejecutando sorteo ${raffleId}:`, error);
    
    // 📝 Log del error crítico
    await logAuditEvent({
      action: 'RAFFLE_EXECUTION_FAILED',
      entityType: 'RAFFLE',
      entityId: raffleId,
      metadata: {
        error: error.message,
        scheduledBy,
        reason,
        timestamp: new Date().toISOString()
      }
    });

    // 🚨 Notificar administradores
    await enqueueJob('sendAdminAlert', {
      type: 'RAFFLE_EXECUTION_FAILED',
      raffleId,
      error: error.message
    });

    throw error;
  }
}

/**
 * 🧹 Job de limpieza: cancelar sorteos vencidos sin financiamiento completo
 */
export async function cleanupExpiredRafflesJob(job) {
  try {
    console.log('🧹 Limpiando sorteos vencidos...');

    const expiredDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 días atrás

    const expiredRaffles = await prisma.raffle.findMany({
      where: {
        status: 'ACTIVE',
        createdAt: { lt: expiredDate },
        currentFunding: { lt: prisma.raffle.fields.targetFunding }
      },
      include: {
        tickets: {
          include: {
            user: { select: { id: true, email: true, name: true } },
            purchase: { select: { id: true, ticketFund: true } }
          }
        }
      }
    });

    const results = [];

    for (const raffle of expiredRaffles) {
      
      // 🔄 Cancelar sorteo
      await prisma.raffle.update({
        where: { id: raffle.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: 'EXPIRED_INSUFFICIENT_FUNDING'
        }
      });

      // 🎫 Marcar tickets como cancelados
      await prisma.ticket.updateMany({
        where: { raffleId: raffle.id },
        data: { status: 'CANCELLED' }
      });

      // 💰 Procesar reembolsos proporcionales
      const uniquePurchases = [...new Map(
        raffle.tickets.map(t => [t.purchase.id, t.purchase])
      ).values()];

      for (const purchase of uniquePurchases) {
        await enqueueJob(JobTypes.PROCESS_REFUND, {
          purchaseId: purchase.id,
          reason: 'RAFFLE_CANCELLED_EXPIRED',
          refundAmount: purchase.ticketFund
        });
      }

      // 📝 Auditoría
      await logAuditEvent({
        action: 'RAFFLE_CANCELLED_EXPIRED',
        entityType: 'RAFFLE',
        entityId: raffle.id,
        metadata: {
          reason: 'EXPIRED_INSUFFICIENT_FUNDING',
          currentFunding: raffle.currentFunding,
          targetFunding: raffle.targetFunding,
          totalTickets: raffle.tickets.length,
          refundsScheduled: uniquePurchases.length
        }
      });

      results.push({
        raffleId: raffle.id,
        title: raffle.title,
        ticketsAffected: raffle.tickets.length,
        refundsScheduled: uniquePurchases.length
      });

      console.log(`❌ Sorteo cancelado: ${raffle.title} (${raffle.tickets.length} tickets)`);
    }

    console.log(`🧹 Limpieza completada: ${expiredRaffles.length} sorteos cancelados`);

    return {
      cleanedRaffles: expiredRaffles.length,
      details: results
    };

  } catch (error) {
    console.error('❌ Error en limpieza de sorteos:', error);
    throw error;
  }
}