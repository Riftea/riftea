// app/api/tickets/my/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    console.log('[MY-TICKETS] Iniciando solicitud de tickets del usuario');
     
    // Obtener sesión
    const session = await getServerSession(authOptions);
    console.log('[MY-TICKETS] Sesión obtenida:', !!session?.user?.email);

    if (!session?.user?.email) {
      console.log('[MY-TICKETS] Usuario no autenticado');
      return NextResponse.json({ 
        error: 'No autorizado',
        code: 'UNAUTHORIZED'
       }, { status: 401 });
    }

    console.log('[MY-TICKETS] Buscando usuario en DB:', session.user.email);
     
    // Verificar conexión a la base de datos
    try {
      await prisma.$connect();
      console.log('[MY-TICKETS] Conexión a DB establecida');
    } catch (dbError) {
      console.error('[MY-TICKETS] Error conectando a DB:', dbError);
      return NextResponse.json({
        error: 'Error de conexión a base de datos',
        code: 'DB_CONNECTION_ERROR',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      }, { status: 500 });
    }

    // Buscar usuario
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, email: true }
    });

    if (!dbUser) {
      console.log('[MY-TICKETS] Usuario no encontrado en DB');
      return NextResponse.json({ 
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
       }, { status: 400 });
    }

    console.log('[MY-TICKETS] Usuario encontrado:', dbUser.id);
     
    // Buscar tickets del usuario - CAMPO CORREGIDO
    const tickets = await prisma.ticket.findMany({
      where: { userId: dbUser.id },
      include: {
        raffle: {
          select: {
            id: true,
            title: true,
            status: true,
            ticketPrice: true,
            endsAt: true,
            winnerId: true,
            drawnAt: true  // CAMBIADO de drawDate a drawnAt
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // LOGS DE DEBUG - AGREGADOS
    console.log('[MY-TICKETS] UserId buscado:', dbUser.id);
    console.log('[MY-TICKETS] Email del usuario:', dbUser.email);
    console.log('[MY-TICKETS] Tickets raw encontrados:', tickets.length);
    
    // Ver TODOS los tickets en la DB (temporal para debug)
    const allTickets = await prisma.ticket.findMany({
      select: { id: true, userId: true, uuid: true, metodoPago: true, status: true, createdAt: true }
    });
    console.log('[MY-TICKETS] TODOS los tickets en DB:', allTickets.length);
    console.log('[MY-TICKETS] Detalle de TODOS los tickets:', allTickets.map(t => ({
      id: t.id,
      userId: t.userId,
      metodoPago: t.metodoPago,
      status: t.status,
      createdAt: t.createdAt
    })));
    
    console.log('[MY-TICKETS] Detalles de MIS tickets:', tickets.map(t => ({
      id: t.id,
      uuid: t.uuid,
      userId: t.userId,
      raffleId: t.raffleId,
      status: t.status,
      metodoPago: t.metodoPago,
      createdAt: t.createdAt
    })));

    console.log('[MY-TICKETS] Tickets encontrados para este usuario:', tickets.length);

    // Agregar información adicional a cada ticket
    const enhancedTickets = tickets.map(ticket => ({
      ...ticket,
      isWinner: ticket.raffle?.winnerId === dbUser.id,
      raffleStatus: ticket.raffle?.status,
      raffleEnded: ticket.raffle?.endsAt ? new Date() > new Date(ticket.raffle.endsAt) : false
    }));

    console.log('[MY-TICKETS] Enhanced tickets a enviar:', enhancedTickets.length);
    if (enhancedTickets.length > 0) {
      console.log('[MY-TICKETS] Primer ticket example:', {
        id: enhancedTickets[0].id,
        uuid: enhancedTickets[0].uuid,
        status: enhancedTickets[0].status,
        metodoPago: enhancedTickets[0].metodoPago,
        raffleTitle: enhancedTickets[0].raffle?.title
      });
    }

    return NextResponse.json({
      success: true,
      tickets: enhancedTickets,
      count: tickets.length,
      code: 'TICKETS_FETCHED'
    });

  } catch (error) {
    console.error('[MY-TICKETS] Error completo:', error);
    console.error('[MY-TICKETS] Stack trace:', error.stack);
    console.error('[MY-TICKETS] Mensaje:', error.message);
    console.error('[MY-TICKETS] Código:', error.code);
     
    return NextResponse.json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack,
        code: error.code
      } : undefined
    }, { status: 500 });
  } finally {
    // Desconectar Prisma al final
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error('[MY-TICKETS] Error desconectando Prisma:', disconnectError);
    }
  }
}