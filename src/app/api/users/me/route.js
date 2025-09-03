// app/api/users/me/route.js
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth.js'
import prisma from '@/lib/prisma.js'

export async function GET(request) {
  try {
    // Usar authOptions para obtener la sesión
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return Response.json({
        success: false,
        error: 'No autenticado'
      }, { status: 401 })
    }

    // Buscar usuario completo en la base de datos
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        tickets: {
          include: {
            raffle: {
              select: {
                id: true,
                title: true,
                description: true,
                endsAt: true,
                status: true
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
          orderBy: { createdAt: 'desc' }
        },
        raffles: { // Si en el futuro puede crear rifas
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true
          }
        }
      }
    })

    if (!user) {
      return Response.json({
        success: false,
        error: 'Usuario no encontrado en la base de datos'
      }, { status: 404 })
    }

    // Calcular estadísticas útiles
    const availableTickets = user.tickets.filter(ticket => !ticket.isUsed)
    const usedTickets = user.tickets.filter(ticket => ticket.isUsed)
    const totalSpent = user.purchases.reduce((sum, purchase) => sum + purchase.amount, 0)

    // Calcular estadísticas adicionales para la página de estadísticas
    const totalRafflesCreated = user.raffles.length
    const totalTicketsSold = user.raffles.reduce((sum, raffle) => {
      // Aquí necesitarías hacer otra consulta para obtener el count de tickets por raffle
      // Por ahora lo dejamos en 0 hasta que agregues esa información
      return sum + 0
    }, 0)
    const totalRevenue = user.raffles.reduce((sum, raffle) => {
      // Similar al anterior, necesitarías el count de tickets vendidos
      return sum + 0
    }, 0)

    // Respuesta con datos completos y estadísticas adicionales
    return Response.json({
      success: true,
      // Estructura original para compatibilidad
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        
        // Estadísticas de tickets
        totalTickets: user.tickets.length,
        availableTickets: availableTickets.length,
        usedTickets: usedTickets.length,
        
        // Estadísticas de compras
        totalPurchases: user.purchases.length,
        totalSpent: totalSpent,
        
        // Datos detallados con campos calculados
        tickets: user.tickets.map(ticket => ({
          ...ticket,
          // Calcular si la rifa está terminada
          raffleFinished: ticket.raffle.status === 'FINISHED' || 
                         ticket.raffle.status === 'DRAWN' ||
                         (ticket.raffle.endsAt && new Date() > new Date(ticket.raffle.endsAt))
        })),
        purchases: user.purchases,
        ownedRaffles: user.raffles.map(raffle => ({
          ...raffle,
          // Agregar campo calculado isFinished
          isFinished: raffle.status === 'FINISHED' || raffle.status === 'DRAWN'
        })),
        
        // Tickets disponibles por rifa
        ticketsByRaffle: availableTickets.reduce((acc, ticket) => {
          const raffleId = ticket.raffleId
          if (!acc[raffleId]) {
            acc[raffleId] = {
              raffle: ticket.raffle,
              tickets: []
            }
          }
          acc[raffleId].tickets.push(ticket)
          return acc
        }, {})
      },
      
      // Estadísticas adicionales para la página de estadísticas
      totalRafflesCreated,
      totalTicketsSold,
      totalRevenue,
      totalWins: 0, // Necesitarías agregar lógica para contar victorias
      totalParticipants: 0, // Necesitarías agregar lógica para contar participantes únicos
      successRate: totalRafflesCreated > 0 ? Math.round((user.raffles.filter(r => r.status === 'FINISHED').length / totalRafflesCreated) * 100) : 0,
      topRaffles: [], // Podrías agregar los mejores sorteos
      recentActivity: [] // Podrías agregar actividad reciente
    })

  } catch (error) {
    console.error('Error en /api/users/me:', error)
    return Response.json({
      success: false,
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}