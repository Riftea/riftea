// src/app/api/raffles/[id]/progress/route.js
import prisma from '@/lib/prisma';

export async function GET(req, { params }) {
  try {
    // Awaiting params si es una Promise
    const resolvedParams = await params;
    const { id } = resolvedParams;
    
    // Obtener el sorteo con información relacionada
    const raffle = await prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tickets: {
              where: {
                status: {
                  in: ['ACTIVE', 'IN_RAFFLE', 'WINNER', 'LOST']
                }
              }
            },
            participations: {
              where: {
                isActive: true
              }
            }
          }
        },
        tickets: {
          where: {
            status: {
              in: ['ACTIVE', 'IN_RAFFLE', 'WINNER', 'LOST']
            }
          },
          select: {
            id: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    if (!raffle) {
      return new Response(
        JSON.stringify({ error: "Sorteo no encontrado" }), 
        { status: 404 }
      );
    }

    // Calcular métricas de progreso
    const soldTickets = raffle._count.tickets;
    const totalParticipants = raffle._count.participations;
    const currentFunding = soldTickets * raffle.ticketPrice;
    
    // Determinar meta de financiamiento
    let targetFunding;
    let progressPercentage;
    
    if (raffle.maxTickets) {
      // Si hay límite de tickets, la meta es vender todos
      targetFunding = raffle.maxTickets * raffle.ticketPrice;
      progressPercentage = raffle.maxTickets > 0 
        ? Math.round((soldTickets / raffle.maxTickets) * 100) 
        : 0;
    } else if (raffle.maxParticipants) {
      // Si hay límite de participantes, usar eso como meta
      targetFunding = raffle.maxParticipants * raffle.ticketPrice;
      progressPercentage = raffle.maxParticipants > 0 
        ? Math.round((totalParticipants / raffle.maxParticipants) * 100) 
        : 0;
    } else {
      // Si no hay límites definidos, usar una meta arbitraria basada en tiempo
      // O marcar como "sin límite"
      targetFunding = null;
      progressPercentage = 0;
    }

    // Calcular tiempo restante
    let timeRemaining = null;
    if (raffle.endsAt) {
      const now = new Date();
      const endTime = new Date(raffle.endsAt);
      
      if (endTime > now) {
        const diffMs = endTime - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        timeRemaining = {
          totalMs: diffMs,
          days: diffDays,
          hours: diffHours,
          minutes: diffMinutes,
          formatted: diffDays > 0 
            ? `${diffDays}d ${diffHours}h ${diffMinutes}m`
            : diffHours > 0 
              ? `${diffHours}h ${diffMinutes}m`
              : `${diffMinutes}m`
        };
      } else {
        timeRemaining = {
          totalMs: 0,
          days: 0,
          hours: 0,
          minutes: 0,
          formatted: "Finalizado"
        };
      }
    }

    // Determinar estado actual
    let currentStatus = raffle.status;
    
    // Auto-actualizar estado si es necesario
    const now = new Date();
    if (raffle.status === 'PUBLISHED' && raffle.startsAt && now >= new Date(raffle.startsAt)) {
      currentStatus = 'ACTIVE';
    }
    if (raffle.status === 'ACTIVE' && raffle.endsAt && now >= new Date(raffle.endsAt)) {
      currentStatus = 'FINISHED';
    }

    // Calcular velocidad de venta (tickets por día en los últimos 7 días)
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const recentTickets = raffle.tickets.filter(
      ticket => new Date(ticket.createdAt) >= sevenDaysAgo
    );
    const dailyVelocity = recentTickets.length / 7;

    // Estadísticas adicionales
    const stats = {
      totalTicketsSold: soldTickets,
      totalRevenue: currentFunding,
      averageTicketsPerDay: dailyVelocity,
      participationRate: soldTickets > 0 ? Math.round((totalParticipants / soldTickets) * 100) : 0,
      isCompletelyFunded: raffle.maxTickets ? soldTickets >= raffle.maxTickets : false,
      isSoldOut: raffle.maxTickets ? soldTickets >= raffle.maxTickets : false
    };

    // Respuesta del endpoint
    const progressData = {
      // Campos principales que espera el hook
      currentFunding,
      targetFunding,
      progressPercentage: Math.min(progressPercentage || 0, 100),
      status: currentStatus,
      totalParticipants,
      timeRemaining,
      
      // Información adicional del sorteo
      raffleInfo: {
        id: raffle.id,
        title: raffle.title,
        ticketPrice: raffle.ticketPrice,
        maxTickets: raffle.maxTickets,
        maxParticipants: raffle.maxParticipants,
        startsAt: raffle.startsAt,
        endsAt: raffle.endsAt,
        status: raffle.status,
        actualStatus: currentStatus
      },
      
      // Estadísticas detalladas
      stats,
      
      // Metadatos
      lastCalculated: new Date().toISOString(),
      hasTimeLimit: !!raffle.endsAt,
      hasTicketLimit: !!raffle.maxTickets,
      hasParticipantLimit: !!raffle.maxParticipants
    };

    return new Response(
      JSON.stringify(progressData), 
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate' // Evitar cache para datos en tiempo real
        }
      }
    );

  } catch (error) {
    console.error('❌ Error en GET /api/raffles/[id]/progress:', error);
    
    return new Response(
      JSON.stringify({ 
        error: "Error interno del servidor",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }), 
      { status: 500 }
    );
  }
}