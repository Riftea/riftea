export const runtime = 'nodejs';
// src/app/api/raffles/[id]/notify-participants/route.js
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function getParams(ctx) {
  const p = (ctx && (await ctx.params)) || {};
  return p || {};
}

export async function POST(req, ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id: raffleId } = await getParams(ctx);
    if (!raffleId) {
      return Response.json({ error: "MISSING_RAFFLE_ID" }, { status: 400 });
    }

    // Verificar que el usuario sea el owner del sorteo
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        title: true,
        ownerId: true,
        status: true,
        drawAt: true,
        maxParticipants: true,
        _count: { select: { participations: true } }
      }
    });

    if (!raffle) {
      return Response.json({ error: "RAFFLE_NOT_FOUND" }, { status: 404 });
    }

    if (raffle.ownerId !== session.user.id) {
      return Response.json({ error: "NOT_OWNER" }, { status: 403 });
    }

    // Obtener todos los participantes activos
    const participations = await prisma.participation.findMany({
      where: {
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
        }
      }
    });

    const drawTime = raffle.drawAt ? new Date(raffle.drawAt).toLocaleString() : "próximamente";
    
    // Crear notificaciones para todos los participantes
    const notifications = participations.map(p => ({
      userId: p.ticket.user.id,
      type: "RAFFLE_READY_TO_DRAW",
      title: "🎯 ¡Sorteo listo para ejecutar!",
      message: `El sorteo "${raffle.title}" alcanzó su capacidad máxima. Se ejecutará el ${drawTime}. ¡Mucha suerte!`,
      raffleId: raffleId,
      ticketId: p.ticket.id
    }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({
        data: notifications,
        skipDuplicates: true
      });
    }

    return Response.json({
      ok: true,
      notificationsSent: notifications.length,
      participants: participations.length
    });

  } catch (error) {
    console.error("Error enviando notificaciones:", error);
    return Response.json(
      { error: "INTERNAL_ERROR", details: error.message },
      { status: 500 }
    );
  }
}