export const runtime = 'nodejs';
// src/app/api/raffles/[id]/progress/route.js
export const dynamic = 'force-dynamic';

import prisma from '@/lib/prisma';
import { TICKET_PRICE } from '@/lib/ticket.server';

export async function GET(req, { params }) {
  try {
    const resolvedParams = (await params) || params || {};
    const { id } = resolvedParams;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Falta id' }), { status: 400 });
    }

    // 🎯 Datos base del sorteo
    const raffle = await prisma.raffle.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        startsAt: true,
        endsAt: true,
        publishedAt: true,
        drawAt: true,
        maxParticipants: true,
        updatedAt: true,
      },
    });

    if (!raffle) {
      return new Response(JSON.stringify({ error: 'Sorteo no encontrado' }), { status: 404 });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const TICKET_STATUSES = ['ACTIVE', 'IN_RAFFLE', 'WINNER', 'LOST'];

    // 📢 Conteos filtrados (sin usar _count con where)
    const [soldTickets, totalParticipants, recentTickets] = await Promise.all([
      prisma.ticket.count({
        where: { raffleId: id, status: { in: TICKET_STATUSES } },
      }),
      prisma.participation.count({
        where: { raffleId: id, isActive: true },
      }),
      prisma.ticket.count({
        where: {
          raffleId: id,
          status: { in: TICKET_STATUSES },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

    // NUEVO: Detectar si se alcanzó la capacidad y actualizar automáticamente
    const isFull = raffle.maxParticipants && totalParticipants >= raffle.maxParticipants;
    let currentStatus = raffle.status;
    let shouldUpdate = false;
    let newDrawAt = null;

    // Si se alcanzó la capacidad y aún está ACTIVE, cambiar a READY_TO_DRAW
    if (isFull && raffle.status === 'ACTIVE') {
      currentStatus = 'READY_TO_DRAW';
      shouldUpdate = true;
      
      // Programar sorteo para 5 minutos después si no tiene drawAt
      if (!raffle.drawAt) {
        newDrawAt = new Date(now.getTime() + 5 * 60 * 1000);
      }
    }

    // Actualizar en base de datos si es necesario
    if (shouldUpdate) {
      try {
        const updateData = { status: currentStatus };
        if (newDrawAt) {
          updateData.drawAt = newDrawAt;
        }
        
        await prisma.raffle.update({
          where: { id },
          data: updateData,
        });
        
        console.log(`✅ Sorteo ${id} actualizado a ${currentStatus}`, newDrawAt ? `con drawAt: ${newDrawAt}` : '');
      } catch (error) {
        console.error('❌ Error actualizando sorteo:', error);
        // No bloquear la respuesta por error de actualización
      }
    }

    // 👥 Lista de participantes actuales - CORREGIDO estructura para frontend
    const participations = await prisma.participation.findMany({
      where: { 
        raffleId: id, 
        isActive: true 
      },
      include: {
        ticket: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Transformar participaciones al formato esperado por el frontend
    const participants = participations.map(p => ({
      id: p.id,
      isWinner: p.isWinner,
      user: p.ticket?.user ? {
        id: p.ticket.user.id,
        name: p.ticket.user.name,
        image: p.ticket.user.image
      } : null,
      ticket: p.ticket ? {
        id: p.ticket.id,
        code: p.ticket.code
      } : null,
      ticketCode: p.ticket?.code, // Para compatibilidad adicional
      name: p.ticket?.user?.name // Para compatibilidad adicional
    }));

    // 💰 Métricas de "funding" estimado (informativo)
    const currentFunding = soldTickets * TICKET_PRICE;

    // 📊 Velocidad (tickets/día últimos 7 días)
    const dailyVelocity = recentTickets / 7;

    // 📈 Progreso (por participaciones activas)
    const cap = raffle.maxParticipants ?? null;
    const progressPercentage = cap
      ? Math.min(100, Math.max(0, Math.round((totalParticipants / cap) * 100)))
      : 0;

    const targetFunding = cap ? cap * TICKET_PRICE : null;

    // ⏳ Tiempo restante
    let timeRemaining = null;
    if (raffle.endsAt) {
      const endTime = new Date(raffle.endsAt);
      if (endTime > now) {
        const diffMs = endTime.getTime() - now.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        timeRemaining = {
          totalMs: diffMs,
          days: diffDays,
          hours: diffHours,
          minutes: diffMinutes,
          formatted:
            diffDays > 0
              ? `${diffDays}d ${diffHours}h ${diffMinutes}m`
              : diffHours > 0
              ? `${diffHours}h ${diffMinutes}m`
              : `${diffMinutes}m`,
        };
      } else {
        timeRemaining = {
          totalMs: 0,
          days: 0,
          hours: 0,
          minutes: 0,
          formatted: 'Finalizado',
        };
      }
    }

    // 🟢 Estado derivado para UI (incluye la actualización automática)
    if (currentStatus === 'PUBLISHED' && raffle.startsAt && now >= new Date(raffle.startsAt)) {
      currentStatus = 'ACTIVE';
    }
    // Si vención por fecha y no estaba terminado
    if (
      ['ACTIVE', 'READY_TO_DRAW', 'PUBLISHED'].includes(currentStatus) &&
      raffle.endsAt &&
      now >= new Date(raffle.endsAt)
    ) {
      currentStatus = 'FINISHED';
    }

    // 📚 Stats adicionales
    const stats = {
      totalTicketsSold: soldTickets,
      totalRevenue: currentFunding,
      averageTicketsPerDay: dailyVelocity,
      participationRate: soldTickets > 0 ? Math.round((totalParticipants / soldTickets) * 100) : 0,
      isFull,
      // Agregar conteos con nombres compatibles para extractProgressPayload
      participationsCount: totalParticipants,
      totalParticipations: totalParticipants,
      maxParticipants: raffle.maxParticipants,
      capacity: raffle.maxParticipants
    };

    // 📤 Respuesta - CORREGIDO para máxima compatibilidad con extractProgressPayload
    const progressData = {
      // Campos principales para la UI
      currentFunding,
      targetFunding,
      progressPercentage,
      status: currentStatus,
      totalParticipants,
      timeRemaining,

      // CORREGIDO: Lista de participantes con el nombre esperado por el frontend
      participants,

      // También incluir otros nombres posibles que busca extractProgressPayload
      data: participants,
      items: participants,
      
      // Conteos directos para extractProgressPayload
      participationsCount: totalParticipants,
      totalParticipations: totalParticipants,
      applied: totalParticipants,
      maxParticipants: raffle.maxParticipants,
      max: raffle.maxParticipants,
      capacity: raffle.maxParticipants,

      // Info extra del sorteo (incluye cambios automáticos)
      raffleInfo: {
        id: raffle.id,
        title: raffle.title,
        ticketPrice: TICKET_PRICE, // derivado del server
        maxParticipants: raffle.maxParticipants,
        startsAt: raffle.startsAt,
        endsAt: raffle.endsAt,
        drawAt: newDrawAt || raffle.drawAt, // Incluye nueva fecha si se programó automáticamente
        status: raffle.status, // DB original
        actualStatus: currentStatus, // derivado para UI
        isReadyToDraw: currentStatus === 'READY_TO_DRAW',
        autoUpdated: shouldUpdate, // Flag para indicar si se actualizó automáticamente
        autoDrawAt: newDrawAt, // Nueva fecha de sorteo si se programó
      },

      // Estadísticas con nombres compatibles
      stats: {
        ...stats,
        participationsCount: totalParticipants,
        totalParticipations: totalParticipants,
        maxParticipants: raffle.maxParticipants,
        capacity: raffle.maxParticipants
      },

      // Metadatos
      lastCalculated: new Date().toISOString(),
      hasTimeLimit: !!raffle.endsAt,
      hasParticipantLimit: !!raffle.maxParticipants,
      hasTicketLimit: false, // no existe maxTickets en el schema
      
      // NUEVO: Flags de estado crítico
      justReachedCapacity: shouldUpdate, // Para disparar notificaciones en frontend
      readyForDraw: currentStatus === 'READY_TO_DRAW',
      scheduledDrawTime: newDrawAt || raffle.drawAt,
    };

    return new Response(JSON.stringify(progressData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('❌ Error en GET /api/raffles/[id]/progress:', error);
    return new Response(
      JSON.stringify({
        error: 'Error interno del servidor',
        details: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined,
      }),
      { status: 500 }
    );
  }
}