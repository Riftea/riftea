// src/services/auto-draw.service.js  (CORREGIDO)
import prisma from '@/lib/prisma';

export class AutoDrawService {
  // Verificar y programar sorteos que necesitan auto-draw
  static async checkAndScheduleDraws() {
    try {
      // Buscar sorteos activos sin drawAt aún
      const needsUpdate = await prisma.raffle.findMany({
        where: {
          status: 'ACTIVE',
          drawAt: null,
        },
        select: {
          id: true,
          title: true,
          maxParticipants: true,
          drawAt: true,
          _count: { select: { participations: true } },
        },
      });

      const updates = [];

      for (const raffle of needsUpdate) {
        const participationCount = raffle._count.participations ?? 0;
        const capacity = raffle.maxParticipants; // en tu schema es Int (no nulo)

        // Si llegó a la capacidad máxima, programar el sorteo a 5 minutos
        if (typeof capacity === 'number' && capacity > 0 && participationCount >= capacity) {
          const drawTime = new Date(Date.now() + 5 * 60 * 1000); // 5 min
          const updated = await prisma.raffle.update({
            where: { id: raffle.id },
            data: {
              status: 'READY_TO_DRAW',
              drawAt: raffle.drawAt || drawTime,
            },
            select: { id: true, title: true, drawAt: true },
          });

          updates.push({
            raffleId: raffle.id,
            title: raffle.title,
            action: 'scheduled',
            drawAt: updated.drawAt,
            participations: participationCount,
          });

          console.log(`✅ Auto-programado sorteo ${raffle.id} para ${updated.drawAt}`);
        }
      }

      return updates;
    } catch (error) {
      console.error('❌ Error en checkAndScheduleDraws:', error);
      return [];
    }
  }

  // Ejecutar sorteos que están listos
  static async executeReadyDraws() {
    try {
      const now = new Date();

      const readyRaffles = await prisma.raffle.findMany({
        where: {
          status: 'READY_TO_DRAW',
          drawAt: { lte: now },
          drawnAt: null,
          winnerParticipationId: null,
        },
        select: {
          id: true,
          title: true,
          drawAt: true,
        },
      });

      if (readyRaffles.length === 0) {
        return { executed: 0, results: [] };
      }

      console.log(`🎯 Ejecutando ${readyRaffles.length} sorteos programados`);

      const results = [];

      for (const raffle of readyRaffles) {
        try {
          const result = await this.executeSingleDraw(raffle.id);
          results.push({
            raffleId: raffle.id,
            title: raffle.title,
            success: true,
            winner: result.winner,
            executedAt: new Date(),
          });
          console.log(`🏆 Sorteo ${raffle.id} ejecutado exitosamente`);
        } catch (error) {
          console.error(`❌ Error ejecutando sorteo ${raffle.id}:`, error);
          results.push({
            raffleId: raffle.id,
            title: raffle.title,
            success: false,
            error: error.message,
          });
        }
      }

      return {
        executed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      };
    } catch (error) {
      console.error('❌ Error en executeReadyDraws:', error);
      return { executed: 0, failed: 0, results: [], error: error.message };
    }
  }

  // Ejecutar un sorteo específico
  static async executeSingleDraw(raffleId) {
    return await prisma.$transaction(async (tx) => {
      // Verificar que el sorteo esté listo
      const raffle = await tx.raffle.findUnique({
        where: { id: raffleId },
        select: {
          id: true,
          status: true,
          drawnAt: true,
          title: true,
        },
      });

      if (!raffle) throw new Error('Sorteo no encontrado');
      if (raffle.status !== 'READY_TO_DRAW') {
        throw new Error(`Sorteo no está listo (status: ${raffle.status})`);
      }
      if (raffle.drawnAt) throw new Error('Sorteo ya fue ejecutado');

      // Participaciones activas
      const participants = await tx.participation.findMany({
        where: { raffleId, isActive: true },
        include: {
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

      if (participants.length === 0) throw new Error('No hay participantes activos');

      // Ganador aleatorio
      const randomIndex = Math.floor(Math.random() * participants.length);
      const winner = participants[randomIndex];

      const now = new Date();

      // Marcar ganador en Participation
      await tx.participation.update({
        where: { id: winner.id },
        data: { isWinner: true },
      });

      // Ticket ganador
      await tx.ticket.update({
        where: { id: winner.ticketId },
        data: { status: 'WINNER' },
      });

      // Tickets perdedores
      const loserTicketIds = participants.filter(p => p.id !== winner.id).map(p => p.ticketId);
      if (loserTicketIds.length > 0) {
        await tx.ticket.updateMany({
          where: { id: { in: loserTicketIds } },
          data: { status: 'LOST' },
        });
      }

      // Finalizar sorteo y guardar la participación ganadora
      await tx.raffle.update({
        where: { id: raffleId },
        data: {
          status: 'FINISHED',
          drawnAt: now,
          winnerParticipationId: winner.id,
        },
      });

      return {
        raffleId,
        winner: {
          participationId: winner.id,
          ticketId: winner.ticketId,
          ticketCode: winner.ticket?.code,
          userId: winner.ticket?.user?.id,
          userName: winner.ticket?.user?.name,
          userEmail: winner.ticket?.user?.email,
        },
        totalParticipants: participants.length,
        executedAt: now,
      };
    });
  }

  // Mantener compatibilidad con endpoints existentes
  static async maybeTriggerAutoDraw(raffleId) {
    try {
      const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const res = await fetch(`${base}/api/raffles/${raffleId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        console.warn(`No se pudo actualizar estado del sorteo ${raffleId}`);
        return { updated: false };
      }

      const data = await res.json();
      return {
        updated: data.raffle?.changed || false,
        newStatus: data.raffle?.newStatus,
        drawAt: data.raffle?.drawAt,
      };
    } catch (error) {
      console.error('Error en maybeTriggerAutoDraw:', error);
      return { updated: false, error: error.message };
    }
  }
}

// Compatibilidad con importaciones antiguas
export async function maybeTriggerAutoDraw(raffleId) {
  return AutoDrawService.maybeTriggerAutoDraw(raffleId);
}

export default AutoDrawService;
