// src/services/raffles.service.js
import 'server-only';
import prisma from '@/lib/prisma';
import { TicketsService } from './tickets.service';

/**
 * Programa el autodraw cuando se llena el cupo.
 * - Si la rifa está PUBLISHED/ACTIVE
 * - Si alcanzó maxParticipants
 * - Si aún no tiene scheduledDrawAt
 * Setea status = READY y scheduledDrawAt = now + countdown (default 600s)
 */
export async function maybeTriggerAutoDraw(raffleId, opts = {}) {
  const seconds = Number(process.env.RAFFLES_DEFAULT_COUNTDOWN_SECONDS ?? 600);

  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: {
      id: true,
      status: true,
      scheduledDrawAt: true,
      maxParticipants: true,
      _count: { select: { participations: true } },
    },
  });
  if (!raffle) return;

  const active = ['PUBLISHED', 'ACTIVE'].includes(raffle.status);
  const filled =
    raffle.maxParticipants &&
    raffle._count.participations >= raffle.maxParticipants;

  if (!active || !filled || raffle.scheduledDrawAt) return;

  const eta = new Date(Date.now() + seconds * 1000);

  // Actualiza a READY y programa la hora del sorteo
  await prisma.raffle.update({
    where: { id: raffleId },
    data: { status: 'READY', scheduledDrawAt: eta },
  });

  // TODO: notificar a todos los participantes que el sorteo está “listo para realizar”
  // await prisma.notification.createMany({ ... })
}

/**
 * Ejecuta el sorteo y persiste ganador (reusa la lógica probada).
 */
export async function drawRaffle(raffleId) {
  return TicketsService.selectRandomWinner(raffleId);
}
