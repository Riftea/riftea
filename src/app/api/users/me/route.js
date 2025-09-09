// src/app/api/users/me/route.js - CORREGIDO
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { TICKET_PRICE } from '@/lib/ticket.server';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({
        success: false,
        error: 'No autenticado'
      }, { status: 401 });
    }

    // Buscar usuario completo en la base de datos
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        tickets: {
          where: {
            // Filtrar tickets válidos
            NOT: {
              status: 'DELETED'
            }
          },
          include: {
            raffle: {
              select: {
                id: true,
                title: true,
                description: true,
                endsAt: true,
                status: true
                // ❌ ticketPrice removido: el precio viene del server (TICKET_PRICE)
              }
            }
          }
        },
        purchases: {
          include: {
            tickets: {
              include: {
                raffle: {
                  select: { 
                    title: true,
                    status: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10 // Limitar para performance
        },
        raffles: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            // ❌ ticketPrice removido
            _count: {
              select: {
                tickets: true,
                participations: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        wonRaffles: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            drawnAt: true
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Usuario no encontrado en la base de datos'
      }, { status: 404 });
    }

    // Inyectar unitPrice=TICKET_PRICE en estructuras que exponen datos de rifa
    const ticketsWithRaffleUnit = user.tickets.map(t => ({
      ...t,
      raffle: t.raffle
        ? { ...t.raffle, unitPrice: TICKET_PRICE }
        : t.raffle
    }));

    const ownedRafflesWithUnit = user.raffles.map(r => ({
      ...r,
      unitPrice: TICKET_PRICE
    }));

    // Calcular estadísticas
    const availableTickets = ticketsWithRaffleUnit.filter(ticket => 
      !ticket.isUsed && ticket.status === 'AVAILABLE'
    );
    const usedTickets = ticketsWithRaffleUnit.filter(ticket => ticket.isUsed);
    const totalSpent = user.purchases.reduce((sum, purchase) => sum + purchase.amount, 0);

    // Estadísticas de rifas creadas
    const totalRafflesCreated = ownedRafflesWithUnit.length;
    const finishedRaffles = ownedRafflesWithUnit.filter(r => r.status === 'FINISHED' || r.status === 'COMPLETED');
    
    // Calcular tickets vendidos y revenue de sus rifas
    const totalTicketsSold = ownedRafflesWithUnit.reduce((sum, raffle) => sum + raffle._count.tickets, 0);
    const totalRevenue = ownedRafflesWithUnit.reduce((sum, raffle) => {
      return sum + (raffle._count.tickets * TICKET_PRICE);
    }, 0);

    // Top raffles (mejores por revenue)
    const topRaffles = ownedRafflesWithUnit
      .map(raffle => ({
        id: raffle.id,
        title: raffle.title,
        ticketsSold: raffle._count.tickets,
        revenue: raffle._count.tickets * TICKET_PRICE,
        participants: raffle._count.participations,
        unitPrice: TICKET_PRICE
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Actividad reciente (combinar compras y rifas creadas)
    const recentActivity = [
      ...user.purchases.slice(0, 3).map(purchase => ({
        icon: '💳',
        description: `Compraste ${purchase.tickets?.length || 0} tickets por $${purchase.amount}`,
        timeAgo: formatTimeAgo(purchase.createdAt),
        createdAt: purchase.createdAt
      })),
      ...ownedRafflesWithUnit.slice(0, 2).map(raffle => ({
        icon: '🎯',
        description: `Creaste el sorteo "${raffle.title}"`,
        timeAgo: formatTimeAgo(raffle.createdAt),
        createdAt: raffle.createdAt
      }))
    ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

    // Agrupar tickets disponibles por rifa, exponiendo unitPrice
    const ticketsByRaffle = availableTickets.reduce((acc, ticket) => {
      const raffleId = ticket.raffleId;
      if (!raffleId) return acc;
      
      if (!acc[raffleId]) {
        acc[raffleId] = {
          raffle: ticket.raffle ? { ...ticket.raffle, unitPrice: TICKET_PRICE } : null,
          tickets: []
        };
      }
      acc[raffleId].tickets.push(ticket);
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      unitPrice: TICKET_PRICE, // Campo derivado a nivel de respuesta
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        
        // Estadísticas de tickets
        totalTickets: ticketsWithRaffleUnit.length,
        availableTickets: availableTickets.length,
        usedTickets: usedTickets.length,
        
        // Estadísticas de compras
        totalPurchases: user.purchases.length,
        totalSpent: totalSpent,
        
        // Datos detallados (con unitPrice donde aplica)
        tickets: ticketsWithRaffleUnit,
        purchases: user.purchases,
        ownedRaffles: ownedRafflesWithUnit,
        wonRaffles: user.wonRaffles,
        
        // Tickets agrupados por rifa
        ticketsByRaffle
      },
      
      // Estadísticas adicionales para la página de estadísticas
      totalRafflesCreated,
      totalTicketsSold,
      totalRevenue,
      totalWins: user.wonRaffles.length,
      totalParticipants: ownedRafflesWithUnit.reduce((sum, raffle) => sum + raffle._count.participations, 0),
      successRate: totalRafflesCreated > 0 ? Math.round((finishedRaffles.length / totalRafflesCreated) * 100) : 0,
      topRaffles,
      recentActivity
    });

  } catch (error) {
    console.error('Error en /api/users/me:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

// Función helper para formatear tiempo
function formatTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
  
  if (diffInSeconds < 60) return 'Hace un momento';
  if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} minutos`;
  if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} horas`;
  return `Hace ${Math.floor(diffInSeconds / 86400)} días`;
}
