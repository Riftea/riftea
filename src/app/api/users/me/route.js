export const runtime = 'nodejs';
// src/app/api/users/me/route.js
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { TICKET_PRICE } from '@/lib/ticket.server';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Traemos el usuario completo
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        tickets: {
          where: {
            NOT: { status: 'DELETED' }, // Filtramos tickets borrados
          },
          include: {
            raffle: {
              select: {
                id: true,
                title: true,
                description: true,
                endsAt: true,
                status: true,
                // Precio se inyecta abajo como unitPrice
              },
            },
          },
        },
        purchases: {
          include: {
            tickets: {
              include: {
                raffle: {
                  select: {
                    title: true,
                    status: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        raffles: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            _count: {
              select: {
                tickets: true,
                participations: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        wonRaffles: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            drawnAt: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado en la base de datos' },
        { status: 404 }
      );
    }

    // Inyectar unitPrice en rifas relacionadas con tickets
    const ticketsWithRaffleUnit = user.tickets.map((t) => ({
      ...t,
      raffle: t.raffle ? { ...t.raffle, unitPrice: TICKET_PRICE } : t.raffle,
    }));

    // RIFAS PROPIAS con unitPrice derivado
    const ownedRafflesWithUnit = user.raffles.map((r) => ({
      ...r,
      unitPrice: TICKET_PRICE,
    }));

    // Cálculos de estadísticas de tickets
    const availableTickets = ticketsWithRaffleUnit.filter(
      (ticket) => !ticket.isUsed && ticket.status === 'AVAILABLE'
    );
    const usedTickets = ticketsWithRaffleUnit.filter((ticket) => ticket.isUsed);

    // Gastos del usuario
    const totalSpent = user.purchases.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    // Métricas de rifas propias
    const totalRafflesCreated = ownedRafflesWithUnit.length;
    const finishedRaffles = ownedRafflesWithUnit.filter((r) =>
      ['FINISHED', 'COMPLETED'].includes(r.status)
    );
    const totalTicketsSold = ownedRafflesWithUnit.reduce(
      (sum, r) => sum + (r._count?.tickets || 0),
      0
    );
    const totalRevenue = ownedRafflesWithUnit.reduce(
      (sum, r) => sum + ((r._count?.tickets || 0) * TICKET_PRICE),
      0
    );

    // Top rifas por revenue
    const topRaffles = ownedRafflesWithUnit
      .map((r) => ({
        id: r.id,
        title: r.title,
        ticketsSold: r._count.tickets,
        revenue: r._count.tickets * TICKET_PRICE,
        participants: r._count.participations,
        unitPrice: TICKET_PRICE,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Actividad reciente: compras + rifas creadas
    const recentActivity = [
      ...user.purchases.slice(0, 3).map((purchase) => ({
        icon: '💳',
        description: `Compraste ${purchase.tickets?.length || 0} tickets por $${purchase.amount}`,
        timeAgo: formatTimeAgo(purchase.createdAt),
        createdAt: purchase.createdAt,
      })),
      ...ownedRafflesWithUnit.slice(0, 2).map((raffle) => ({
        icon: '🎯',
        description: `Creaste el sorteo "${raffle.title}"`,
        timeAgo: formatTimeAgo(raffle.createdAt),
        createdAt: raffle.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    // Agrupar tickets DISPONIBLES por rifa (con unitPrice)
    const ticketsByRaffle = availableTickets.reduce((acc, ticket) => {
      const raffleId = ticket.raffleId;
      if (!raffleId) return acc;
      if (!acc[raffleId]) {
        acc[raffleId] = {
          raffle: ticket.raffle
            ? { ...ticket.raffle, unitPrice: TICKET_PRICE }
            : null,
          tickets: [],
        };
      }
      acc[raffleId].tickets.push(ticket);
      return acc;
    }, {});

    // === RESPUESTA ===
    // Para que tu front actual funcione sin tocar nada:
    // - Exponemos métricas clave en el NIVEL RAÍZ (stats.* en tu page.js)
    // - Mantenemos detalles dentro de `user`
    return NextResponse.json({
      success: true,
      unitPrice: TICKET_PRICE,

      // === Campos esperados por el front en nivel raíz ===
      createdAt: user.createdAt,
      lastNameChange: user.lastNameChange,
      whatsapp: user.whatsapp,

      totalTickets: ticketsWithRaffleUnit.length,
      totalRaffles: totalRafflesCreated, // "Sorteos Creados" en tu UI
      rafflesWon: user.wonRaffles.length,
      totalSpent: totalSpent,

      // === Datos detallados ===
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        lastNameChange: user.lastNameChange,
        whatsapp: user.whatsapp,

        // Stats internas por si las necesitás en otras pantallas
        totalTickets: ticketsWithRaffleUnit.length,
        availableTickets: availableTickets.length,
        usedTickets: usedTickets.length,
        totalPurchases: user.purchases.length,
        totalSpent: totalSpent,

        // Colecciones completas
        tickets: ticketsWithRaffleUnit,
        purchases: user.purchases,
        ownedRaffles: ownedRafflesWithUnit,
        wonRaffles: user.wonRaffles,

        // Agrupación útil
        ticketsByRaffle,
      },

      // === Métricas extra (para dashboard/estadísticas) ===
      totalRafflesCreated,
      totalTicketsSold,
      totalRevenue,
      totalWins: user.wonRaffles.length,
      totalParticipants: ownedRafflesWithUnit.reduce(
        (sum, r) => sum + r._count.participations,
        0
      ),
      successRate:
        totalRafflesCreated > 0
          ? Math.round((finishedRaffles.length / totalRafflesCreated) * 100)
          : 0,
      topRaffles,
      recentActivity,
    });
  } catch (error) {
    console.error('Error en /api/users/me:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error interno del servidor',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

// Helper de tiempo relativo
function formatTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

  if (diffInSeconds < 60) return 'Hace un momento';
  if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} minutos`;
  if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} horas`;
  return `Hace ${Math.floor(diffInSeconds / 86400)} días`;
}

