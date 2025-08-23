// app/api/users/me/route.js - CREAR este archivo
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
                isFinished: true
              }
            }
          }
        },
        purchases: {
          include: {
            tickets: {
              include: {
                raffle: {
                  select: { title: true }
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
            isFinished: true,
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
        
        // Datos detallados
        tickets: user.tickets,
        purchases: user.purchases,
        ownedRaffles: user.raffles, // Para futuro
        
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
      error: 'Error interno del servidor'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}