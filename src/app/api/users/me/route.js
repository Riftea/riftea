// app/api/users/me/route.js
import { getServerSession } from 'next-auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request) {
  try {
    // En App Router, getServerSession se usa sin parámetros en route handlers
    const session = await getServerSession()
    
    if (!session?.user?.email) {
      return Response.json({
        success: false,
        error: 'No autenticado'
      }, { status: 401 })
    }

    // Buscar usuario completo en Supabase
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
                status: true  // ✅ CAMBIADO de isFinished a status
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
                    status: true  // ✅ CAMBIADO también aquí si lo necesitas
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
            status: true,  // ✅ CAMBIADO de isFinished a status
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

    // Respuesta con datos completos
    return Response.json({
      success: true,
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
      }
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