// src/app/api/users/me/route.js - CORREGIDO
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

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
                status: true,
                ticketPrice: true
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
            ticketPrice: true,
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

    // Calcular estadísticas
    const availableTickets = user.tickets.filter(ticket => 
      !ticket.isUsed && ticket.status === 'AVAILABLE'
    );
    const usedTickets = user.tickets.filter(ticket => ticket.isUsed);
    const totalSpent = user.purchases.reduce((sum, purchase) => sum + purchase.amount, 0);

    // Estadísticas de rifas creadas
    const totalRafflesCreated = user.raffles.length;
    const finishedRaffles = user.raffles.filter(r => r.status === 'FINISHED' || r.status === 'COMPLETED');
    
    // Calcular tickets vendidos y revenue de sus rifas
    const totalTicketsSold = user.raffles.reduce((sum, raffle) => sum + raffle._count.tickets, 0);
    const totalRevenue = user.raffles.reduce((sum, raffle) => {
      return sum + (raffle._count.tickets * raffle.ticketPrice);
    }, 0);

    // Top raffles (mejores por revenue)
    const topRaffles = user.raffles
      .map(raffle => ({
        id: raffle.id,
        title: raffle.title,
        ticketsSold: raffle._count.tickets,
        revenue: raffle._count.tickets * raffle.ticketPrice,
        participants: raffle._count.participations
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
      ...user.raffles.slice(0, 2).map(raffle => ({
        icon: '🎯',
        description: `Creaste el sorteo "${raffle.title}"`,
        timeAgo: formatTimeAgo(raffle.createdAt),
        createdAt: raffle.createdAt
      }))
    ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        
        // Estadísticas de tickets
        totalTickets: user.tickets.length,
        availableTickets: availableTickets.length,
        usedTickets: usedTickets.length,
        
        // Estadísticas de compras
        totalPurchases: user.purchases.length,
        totalSpent: totalSpent,
        
        // Datos detallados
        tickets: user.tickets,
        purchases: user.purchases,
        ownedRaffles: user.raffles,
        wonRaffles: user.wonRaffles,
        
        // Tickets agrupados por rifa
        ticketsByRaffle: availableTickets.reduce((acc, ticket) => {
          const raffleId = ticket.raffleId;
          if (!raffleId) return acc;
          
          if (!acc[raffleId]) {
            acc[raffleId] = {
              raffle: ticket.raffle,
              tickets: []
            };
          }
          acc[raffleId].tickets.push(ticket);
          return acc;
        }, {})
      },
      
      // Estadísticas adicionales para la página de estadísticas
      totalRafflesCreated,
      totalTicketsSold,
      totalRevenue,
      totalWins: user.wonRaffles.length,
      totalParticipants: user.raffles.reduce((sum, raffle) => sum + raffle._count.participations, 0),
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