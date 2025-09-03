// app/api/raffles/[id]/participate/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { TicketsService } from '@/services/tickets.service';

export async function POST(request, { params }) {
  try {
    const { id: raffleId } = params;
    
    // 1. Verificar autenticación
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({
        error: 'No autorizado. Debes iniciar sesión.',
        code: 'UNAUTHORIZED'
      }, { status: 401 });
    }

    // 2. Obtener usuario de la DB
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, email: true }
    });

    if (!dbUser) {
      return NextResponse.json({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      }, { status: 400 });
    }

    // 3. Obtener datos del body
    const body = await request.json();
    const { ticketId } = body;

    if (!ticketId?.trim()) {
      return NextResponse.json({
        error: 'ID de ticket requerido',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    // 4. Verificar que la rifa existe y está disponible
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      include: {
        _count: { select: { participations: true } }
      }
    });

    if (!raffle) {
      return NextResponse.json({
        error: 'Sorteo no encontrado',
        code: 'RAFFLE_NOT_FOUND'
      }, { status: 404 });
    }

    if (!['PUBLISHED', 'ACTIVE'].includes(raffle.status)) {
      return NextResponse.json({
        error: 'Este sorteo no está disponible para participación',
        code: 'RAFFLE_NOT_AVAILABLE'
      }, { status: 400 });
    }

    // 5. Verificar fecha límite
    if (raffle.endsAt && new Date() > new Date(raffle.endsAt)) {
      return NextResponse.json({
        error: 'Este sorteo ya ha finalizado',
        code: 'RAFFLE_EXPIRED'
      }, { status: 400 });
    }

    // 6. Verificar límite de participantes
    if (raffle.maxParticipants && raffle._count.participations >= raffle.maxParticipants) {
      return NextResponse.json({
        error: 'El sorteo ha alcanzado el límite máximo de participantes',
        code: 'MAX_PARTICIPANTS_REACHED'
      }, { status: 400 });
    }

    // 7. Verificar que el usuario no es el dueño del sorteo
    if (raffle.ownerId === dbUser.id) {
      return NextResponse.json({
        error: 'No puedes participar en tu propio sorteo',
        code: 'OWNER_CANNOT_PARTICIPATE'
      }, { status: 400 });
    }

    // 8. Usar el servicio para verificar y aplicar el ticket
    try {
      const participation = await TicketsService.applyTicketToRaffle(
        ticketId.trim(),
        raffleId,
        dbUser.id
      );

      // 9. Obtener información actualizada del sorteo
      const updatedRaffle = await prisma.raffle.findUnique({
        where: { id: raffleId },
        include: {
          _count: { select: { participations: true } }
        }
      });

      // 10. Verificar si alcanzamos el límite y notificar si es necesario
      if (updatedRaffle.maxParticipants && 
          updatedRaffle._count.participations >= updatedRaffle.maxParticipants) {
        
        // Programar notificaciones de sorteo (aquí podrías usar una cola de trabajos)
        await scheduleDrawNotifications(raffleId);
      }

      return NextResponse.json({
        success: true,
        message: 'Participación exitosa en el sorteo',
        participation: {
          id: participation.id,
          ticketId: participation.ticketId,
          raffleId: participation.raffleId,
          participantName: participation.ticket.user.name,
          participantEmail: participation.ticket.user.email,
          ticketCode: participation.ticket.code
        },
        raffleStatus: {
          currentParticipants: updatedRaffle._count.participations,
          maxParticipants: updatedRaffle.maxParticipants,
          isReady: updatedRaffle.maxParticipants ? 
            updatedRaffle._count.participations >= updatedRaffle.maxParticipants : false
        },
        code: 'PARTICIPATION_SUCCESS'
      }, { status: 201 });

    } catch (serviceError) {
      return NextResponse.json({
        error: serviceError.message || 'Error al procesar la participación',
        code: 'PARTICIPATION_FAILED'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in participate endpoint:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

// Función auxiliar para programar notificaciones de sorteo
async function scheduleDrawNotifications(raffleId) {
  try {
    // Obtener todos los participantes
    const participants = await prisma.participation.findMany({
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
        },
        raffle: {
          select: { title: true }
        }
      }
    });

    // Crear notificación para todos los participantes
    const notifications = participants.map(participation => ({
      userId: participation.ticket.userId,
      type: 'RAFFLE_READY',
      title: 'Sorteo listo para realizar',
      message: `El sorteo "${participation.raffle.title}" alcanzó el número máximo de participantes. Se realizará en 10 minutos.`,
      raffleId: raffleId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas
    }));

    await prisma.notification.createMany({
      data: notifications,
      skipDuplicates: true
    });

    // Actualizar estado del sorteo
    await prisma.raffle.update({
      where: { id: raffleId },
      data: {
        status: 'ACTIVE', // Cambiar a activo cuando esté listo
        // Aquí podrías agregar un campo scheduledDrawAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    console.log(`📢 Notificaciones enviadas para sorteo ${raffleId} - ${participants.length} participantes`);
    
    // TODO: Aquí podrías programar el sorteo automático con un job scheduler
    
  } catch (error) {
    console.error('Error scheduling draw notifications:', error);
  }
}

export async function GET(request, { params }) {
  try {
    const { id: raffleId } = params;

    // Obtener lista de participantes
    const participants = await prisma.participation.findMany({
      where: {
        raffleId,
        isActive: true
      },
      include: {
        ticket: {
          select: {
            id: true,
            code: true,
            uuid: true,
            status: true,
            createdAt: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Obtener información del sorteo
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        title: true,
        status: true,
        maxParticipants: true,
        endsAt: true,
        drawnAt: true,
        winnerId: true,
        winningTicket: true
      }
    });

    if (!raffle) {
      return NextResponse.json({
        error: 'Sorteo no encontrado',
        code: 'RAFFLE_NOT_FOUND'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      participants: participants.map(p => ({
        id: p.id,
        participatedAt: p.createdAt,
        ticket: {
          code: p.ticket.code,
          status: p.ticket.status
        },
        user: {
          id: p.user?.id,
          name: p.user?.name || 'Participante anónimo',
          image: p.user?.image
        },
        isWinner: p.isWinner
      })),
      raffle: {
        id: raffle.id,
        title: raffle.title,
        status: raffle.status,
        currentParticipants: participants.length,
        maxParticipants: raffle.maxParticipants,
        isComplete: raffle.maxParticipants ? participants.length >= raffle.maxParticipants : false,
        hasWinner: !!raffle.winnerId,
        drawnAt: raffle.drawnAt
      },
      code: 'PARTICIPANTS_FETCHED'
    });

  } catch (error) {
    console.error('Error fetching participants:', error);
    return NextResponse.json({
      error: 'Error al obtener participantes',
      code: 'FETCH_ERROR'
    }, { status: 500 });
  }
}