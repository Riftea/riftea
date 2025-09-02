// src/app/api/tickets/use/route.js - UBICACIÓN CORRECTA para App Router
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { TicketService } from '../../../../services/tickets.service'; // ✅ Ruta correcta desde src/

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return Response.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { ticketId, raffleId } = body;

    if (!ticketId || !raffleId) {
      return Response.json(
        { error: 'ticketId y raffleId son requeridos' },
        { status: 400 }
      );
    }

    // ✅ Verificar compatibilidad antes de usar
    const compatibility = await TicketService.canUseTicketInRaffle(
      ticketId, 
      raffleId, 
      session.user.id
    );

    if (!compatibility.canUse) {
      return Response.json(
        {
          error: compatibility.reason,
          canRetry: compatibility.reason.includes('no disponible')
        },
        { status: 400 }
      );
    }

    // Usar el ticket en el sorteo
    const participation = await TicketService.useTicketInRaffle(
      ticketId, 
      raffleId, 
      session.user.id
    );

    return Response.json({
      success: true,
      participation,
      message: 'Ticket usado exitosamente en el sorteo',
      ticketInfo: {
        id: participation.ticket.id,
        code: participation.ticket.displayCode || participation.ticket.code,
        wasGeneric: !participation.ticket.raffleId || participation.ticket.raffleId === raffleId
      },
      raffleInfo: {
        id: participation.raffle.id,
        title: participation.raffle.title,
        endsAt: participation.raffle.endsAt
      }
    });

  } catch (error) {
    console.error('Error using ticket:', error);
    
    // Mejor manejo de errores
    const errorMap = {
      'Ticket no encontrado': 404,
      'Este ticket no te pertenece': 403,
      'Ticket ya en uso': 409,
      'Rifa no encontrada': 404,
      'Rifa no disponible': 400
    };

    const statusCode = errorMap[error.message] || 400;
    
    return Response.json(
      { 
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: statusCode }
    );
  }
}