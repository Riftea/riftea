// src/services/raffles.service.js - MEJORADO (mantiene compatibilidad)
import 'server-only';
import prisma from '@/lib/prisma';
import { TicketsService } from './tickets.service';

/**
 * Programa el autodraw cuando se llena el cupo.
 * - Usa transacción para evitar race conditions
 * - Cambia a READY_TO_DRAW y setea drawAt (countdown configurable)
 */
export async function maybeTriggerAutoDraw(raffleId, _opts = {}) {
  const seconds = Number(process.env.RAFFLES_DEFAULT_COUNTDOWN_SECONDS ?? 300); // p/def: 5 min

  try {
    const result = await prisma.$transaction(async (tx) => {
      const raffle = await tx.raffle.findUnique({
        where: { id: raffleId },
        select: {
          id: true,
          status: true,
          drawAt: true,
          maxParticipants: true,
          _count: { select: { participations: true } },
        },
      });

      if (!raffle) {
        return { updated: false, reason: 'RAFFLE_NOT_FOUND' };
      }

      const isActive = ['PUBLISHED', 'ACTIVE'].includes(raffle.status);
      const capacity = raffle.maxParticipants ?? 0;
      const parts = raffle._count?.participations ?? 0;
      const isFull = capacity > 0 && parts >= capacity;

      if (!isActive || !isFull || raffle.drawAt) {
        return {
          updated: false,
          reason: !isActive ? 'NOT_ACTIVE' : !isFull ? 'NOT_FULL' : 'ALREADY_SCHEDULED',
          currentStatus: raffle.status,
          participants: parts,
          maxParticipants: capacity,
        };
      }

      const eta = new Date(Date.now() + seconds * 1000);

      await tx.raffle.update({
        where: { id: raffleId },
        data: {
          status: 'READY_TO_DRAW',
          drawAt: eta,
          // updatedAt existe en Raffle y se actualiza automáticamente,
          // no hace falta setearlo manualmente
        },
      });

      console.log(`✅ Sorteo ${raffleId} programado para auto-draw: ${eta.toISOString()}`);

      return {
        updated: true,
        newStatus: 'READY_TO_DRAW',
        drawAt: eta,
        participants: parts,
        reason: 'CAPACITY_REACHED',
      };
    });

    // Notificaciones fuera de la transacción (best-effort)
    if (result.updated) {
      setImmediate(async () => {
        try {
          // TODO: notifyParticipants(raffleId, 'READY_TO_DRAW');
          console.log(`📢 (TODO) Notificar participantes del sorteo ${raffleId}`);
        } catch (e) {
          console.error('Error enviando notificaciones:', e);
        }
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Error en maybeTriggerAutoDraw:', error);
    return { updated: false, error: error.message };
  }
}

/**
 * Verifica y ejecuta sorteos listos (para cron).
 */
export async function executeReadyDraws() {
  try {
    const now = new Date();
    const readyRaffles = await prisma.raffle.findMany({
      where: {
        status: 'READY_TO_DRAW',
        drawAt: { lte: now },
        drawnAt: null,
        winnerParticipationId: null,
      },
      select: { id: true, title: true, drawAt: true },
    });

    if (readyRaffles.length === 0) {
      return { executed: 0, results: [] };
    }

    console.log(`🎯 Ejecutando ${readyRaffles.length} sorteos programados`);

    const results = [];
    for (const r of readyRaffles) {
      try {
        const winner = await drawRaffle(r.id);
        results.push({
          raffleId: r.id,
          title: r.title,
          success: true,
          winner,
          executedAt: new Date(),
        });
        console.log(`🏆 Sorteo ${r.id} ejecutado exitosamente`);
      } catch (e) {
        console.error(`❌ Error ejecutando sorteo ${r.id}:`, e);
        results.push({
          raffleId: r.id,
          title: r.title,
          success: false,
          error: e.message,
        });
      }
    }

    return {
      executed: results.filter(x => x.success).length,
      failed: results.filter(x => !x.success).length,
      results,
    };
  } catch (error) {
    console.error('❌ Error en executeReadyDraws:', error);
    return { executed: 0, failed: 0, results: [], error: error.message };
  }
}

/**
 * Ejecuta un sorteo y persiste ganador.
 * - 100% transaccional
 * - No depende de campos inexistentes
 */
export async function drawRaffle(raffleId) {
  try {
    console.log(`🎲 Iniciando sorteo para raffle ${raffleId}`);

    const result = await prisma.$transaction(async (tx) => {
      // Cargar rifa y validar estado
      const raffle = await tx.raffle.findUnique({
        where: { id: raffleId },
        select: {
          id: true,
          status: true,
          drawAt: true,
          drawnAt: true,
          winnerParticipationId: true,
          maxParticipants: true,
          _count: { select: { participations: true } },
        },
      });

      if (!raffle) throw new Error('Sorteo no encontrado');
      if (raffle.drawnAt || raffle.winnerParticipationId) {
        throw new Error('Sorteo ya fue ejecutado anteriormente');
      }
      if (!['READY_TO_DRAW', 'ACTIVE'].includes(raffle.status)) {
        throw new Error(`Sorteo no está listo (status: ${raffle.status})`);
      }

      // Si está ACTIVE, asegurate de que drawAt ya venció y cumple condiciones
      if (raffle.status === 'ACTIVE') {
        if (!raffle.drawAt || new Date(raffle.drawAt) > new Date()) {
          throw new Error('Aún no es el horario del sorteo');
        }
        const parts = raffle._count?.participations ?? 0;
        if (raffle.maxParticipants && parts < raffle.maxParticipants) {
          throw new Error(`La rifa no alcanzó el cupo (${parts}/${raffle.maxParticipants})`);
        }
      }

      // Participaciones activas
      const participants = await tx.participation.findMany({
        where: { raffleId, isActive: true },
        select: {
          id: true,
          ticketId: true,
          ticket: {
            select: {
              id: true,
              code: true,
              userId: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      if (participants.length < 1) {
        throw new Error('No hay participantes activos');
      }

      // === ELEGIR GANADOR ===
      let winner;
      // Compatibilidad: si existe TicketsService.selectRandomWinner, podés usarlo
      if (TicketsService?.selectRandomWinner) {
        winner = await TicketsService.selectRandomWinner(raffleId, { tx });
        // Si ese método solo devuelve la participación ganadora sin persistir,
        // abajo persistimos igual con nuestro flujo.
      } else {
        const idx = Math.floor(Math.random() * participants.length);
        winner = participants[idx];
      }

      // Persistir ganador y perdedores
      await tx.participation.update({
        where: { id: winner.id },
        data: { isWinner: true },
      });

      await tx.ticket.update({
        where: { id: winner.ticketId },
        data: { status: 'WINNER' },
      });

      const loserTicketIds = participants
        .filter(p => p.id !== winner.id)
        .map(p => p.ticketId);

      if (loserTicketIds.length > 0) {
        await tx.ticket.updateMany({
          where: { id: { in: loserTicketIds } },
          data: { status: 'LOST' },
        });
      }

      // Terminar rifa
      const now = new Date();
      await tx.raffle.update({
        where: { id: raffleId },
        data: {
          status: 'FINISHED',
          drawnAt: now,
          winnerParticipationId: winner.id,
        },
      });

      return {
        participationId: winner.id,
        ticketId: winner.ticketId,
        ticketCode: winner.ticket?.code,
        userId: winner.ticket?.user?.id,
        userName: winner.ticket?.user?.name,
        userEmail: winner.ticket?.user?.email,
        executedAt: now,
      };
    });

    return result;
  } catch (error) {
    console.error(`❌ Error en drawRaffle ${raffleId}:`, error);
    throw error;
  }
}

/**
 * Helper de estado de rifa (para UI o debugging)
 */
export async function checkRaffleStatus(raffleId) {
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: {
      id: true,
      status: true,
      drawAt: true,
      drawnAt: true,
      maxParticipants: true,
      _count: { select: { participations: true } },
    },
  });

  if (!raffle) return null;

  const now = new Date();
  const capacity = raffle.maxParticipants ?? 0;
  const parts = raffle._count?.participations ?? 0;
  const isFull = capacity > 0 && parts >= capacity;
  const isReady = raffle.status === 'READY_TO_DRAW';
  const canExecute = isReady && raffle.drawAt && now >= raffle.drawAt && !raffle.drawnAt;

  return {
    ...raffle,
    participants: parts,
    isFull,
    isReady,
    canExecute,
  };
}

/**
 * Ejecutar sorteo manual (para endpoint/admin).
 * - Reusa drawRaffle()
 */
export async function executeManualDraw(raffleId, adminUserId = null) {
  try {
    console.log(`🎲 Ejecutando sorteo manual ${raffleId}...`);

    // Validaciones livianas previas (opcional)
    const pre = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        title: true,
        status: true,
        drawnAt: true,
        winnerParticipationId: true,
        _count: { select: { participations: true } },
      },
    });

    if (!pre) throw new Error('Sorteo no encontrado');
    if (pre.drawnAt || pre.winnerParticipationId) {
      throw new Error('Sorteo ya fue ejecutado anteriormente');
    }
    if (!['ACTIVE', 'PUBLISHED', 'READY_TO_DRAW'].includes(pre.status)) {
      throw new Error(`Sorteo no está disponible para ejecutar (status: ${pre.status})`);
    }
    if ((pre._count?.participations ?? 0) < 1) {
      throw new Error('No hay participaciones suficientes para el sorteo');
    }

    const winner = await drawRaffle(raffleId);

    return {
      raffleId,
      title: pre.title,
      winner,
      totalParticipants: pre._count?.participations ?? 0,
      executedBy: adminUserId,
      executedAt: new Date(),
    };
  } catch (error) {
    console.error(`❌ Error en sorteo manual ${raffleId}:`, error);
    throw error;
  }
}
