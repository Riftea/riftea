export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { drawRaffle } from '@/services/raffles.service';

// GET /api/raffles/[id]/results
// - Si la rifa está READY_TO_DRAW y llegó la hora, ejecuta el sorteo ahora mismo
// - Si ya fue sorteada, devuelve el resultado
// - Si todavía no está lista, responde 409 con razón
export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;

    const raffle = await prisma.raffle.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        drawAt: true,
        drawnAt: true,
        winnerParticipationId: true,
        isPrivate: true,
      },
    });

    if (!raffle) {
      return NextResponse.json({ error: 'Sorteo no encontrado' }, { status: 404 });
    }

    const now = new Date();

    // 1) Caso: listo para ejecutar y llegó la hora -> ejecutar
    const readyAndDue =
      raffle.status === 'READY_TO_DRAW' &&
      raffle.drawAt &&
      new Date(raffle.drawAt) <= now &&
      !raffle.drawnAt &&
      !raffle.winnerParticipationId;

    if (readyAndDue) {
      try {
        const winner = await drawRaffle(raffle.id);

        // Volvemos a cargar el estado final y winner
        const final = await prisma.raffle.findUnique({
          where: { id: raffle.id },
          select: {
            id: true,
            title: true,
            status: true,
            drawAt: true,
            drawnAt: true,
            winnerParticipationId: true,
          },
        });

        return NextResponse.json({
          success: true,
          executedNow: true,
          raffle: final,
          winner, // { participationId, ticketId, ticketCode, userId, userName, userEmail, executedAt }
        });
      } catch (e) {
        // Si otro request ganó la carrera, devolvemos el estado ya sorteado
        const already = await prisma.raffle.findUnique({
          where: { id: raffle.id },
          select: {
            id: true,
            title: true,
            status: true,
            drawAt: true,
            drawnAt: true,
            winnerParticipationId: true,
          },
        });

        if (already?.winnerParticipationId) {
          const win = await prisma.participation.findUnique({
            where: { id: already.winnerParticipationId },
            select: {
              id: true,
              ticketId: true,
              isWinner: true,
              ticket: {
                select: {
                  code: true,
                  userId: true,
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          });

          return NextResponse.json({
            success: true,
            executedNow: false,
            raffle: already,
            winner: win
              ? {
                  participationId: win.id,
                  ticketId: win.ticketId,
                  ticketCode: win.ticket?.code,
                  userId: win.ticket?.user?.id,
                  userName: win.ticket?.user?.name,
                  userEmail: win.ticket?.user?.email,
                }
              : null,
          });
        }

        return NextResponse.json(
          { error: 'No se pudo ejecutar el sorteo', details: e?.message || 'unknown' },
          { status: 500 }
        );
      }
    }

    // 2) Caso: ya finalizado -> devolver resultado
    if (raffle.winnerParticipationId || raffle.drawnAt || raffle.status === 'FINISHED') {
      const win = raffle.winnerParticipationId
        ? await prisma.participation.findUnique({
            where: { id: raffle.winnerParticipationId },
            select: {
              id: true,
              ticketId: true,
              isWinner: true,
              ticket: {
                select: {
                  code: true,
                  userId: true,
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          })
        : null;

      return NextResponse.json({
        success: true,
        executedNow: false,
        raffle,
        winner: win
          ? {
              participationId: win.id,
              ticketId: win.ticketId,
              ticketCode: win.ticket?.code,
              userId: win.ticket?.user?.id,
              userName: win.ticket?.user?.name,
              userEmail: win.ticket?.user?.email,
            }
          : null,
      });
    }

    // 3) Caso: todavía no corresponde
    let reason = 'NOT_READY';
    if (raffle.status === 'READY_TO_DRAW' && raffle.drawAt && new Date(raffle.drawAt) > now) {
      reason = 'TOO_EARLY';
    }
    return NextResponse.json(
      {
        success: false,
        reason,
        waitUntil: raffle.drawAt || null,
        status: raffle.status,
      },
      { status: 409 }
    );
  } catch (err) {
    console.error('GET /api/raffles/[id]/results error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
