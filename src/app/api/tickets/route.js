// app/api/tickets/route.js
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

function normalizeRole(session) {
  const r = session?.user?.role;
  return typeof r === 'string' ? r.toUpperCase() : '';
}

export async function POST(request) {
  try {
    // 1. Verificar autenticación
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({
        error: 'No autorizado. Debes iniciar sesión.',
        code: 'UNAUTHORIZED'
      }, { status: 401 });
    }

    console.log("session POST tickets:", !!session, session?.user?.email);

    // 2. Obtener el USER ID desde la base de datos
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!dbUser) {
      return NextResponse.json({
        error: 'Usuario no encontrado en la base de datos',
        code: 'USER_NOT_FOUND'
      }, { status: 400 });
    }

    console.log("DB User found:", dbUser.id);

    // 3. Obtener y validar datos del body
    const body = await request.json();
    const {
      raffleId,
      quantity = 1,
      ticketNumbers = []
    } = body;

    // 4. Validaciones básicas
    if (!raffleId?.trim()) {
      return NextResponse.json({
        error: 'ID de rifa requerido',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    const quantityNum = parseInt(quantity, 10);
    if (!Number.isInteger(quantityNum) || quantityNum <= 0 || quantityNum > 50) {
      return NextResponse.json({
        error: 'La cantidad debe ser un número entre 1 y 50',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    // 5. Verificar que la rifa existe y está activa
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId.trim() },
      include: {
        _count: { select: { tickets: true } }
      }
    });

    if (!raffle) {
      return NextResponse.json({
        error: 'Rifa no encontrada',
        code: 'RAFFLE_NOT_FOUND'
      }, { status: 404 });
    }

    if (!['PUBLISHED', 'ACTIVE'].includes(raffle.status)) {
      return NextResponse.json({
        error: 'Esta rifa no está disponible para compra de tickets',
        code: 'RAFFLE_NOT_AVAILABLE'
      }, { status: 400 });
    }

    // 6. Verificar límites de tickets
    const currentTickets = raffle._count?.tickets ?? 0;
    if (raffle.maxTickets && (currentTickets + quantityNum) > raffle.maxTickets) {
      return NextResponse.json({
        error: `No hay suficientes tickets disponibles. Quedan ${raffle.maxTickets - currentTickets} tickets.`,
        code: 'INSUFFICIENT_TICKETS'
      }, { status: 400 });
    }

    // 7. Verificar fecha de finalización
    if (raffle.endsAt && new Date() > new Date(raffle.endsAt)) {
      return NextResponse.json({
        error: 'Esta rifa ya ha finalizado',
        code: 'RAFFLE_EXPIRED'
      }, { status: 400 });
    }

    // 8. Crear los tickets
    let createdTickets;

    try {
      const ticketsData = [];
      
      for (let i = 0; i < quantityNum; i++) {
        ticketsData.push({
          raffleId: raffle.id,
          buyerId: dbUser.id,
          ticketNumber: ticketNumbers[i] || null,
          price: raffle.ticketPrice,
          status: 'ACTIVE'
        });
      }

      createdTickets = await prisma.$transaction(async (tx) => {
        return await tx.ticket.createMany({
          data: ticketsData,
          skipDuplicates: false
        });
      });

      console.log("✅ Tickets creados exitosamente:", createdTickets);

    } catch (createError) {
      console.error('Error en creación de tickets:', createError);
      
      if (createError?.code === 'P2002') {
        return NextResponse.json({
          error: 'Uno o más números de ticket ya están ocupados',
          code: 'DUPLICATE_TICKET_NUMBER'
        }, { status: 409 });
      }
      
      throw createError;
    }

    // 9. Crear log de auditoría
    try {
      await prisma.auditLog.create({
        data: {
          action: 'buy_tickets',
          userId: dbUser.id,
          targetType: 'ticket',
          targetId: raffle.id,
          newValues: {
            raffleId: raffle.id,
            quantity: quantityNum,
            totalPrice: raffle.ticketPrice * quantityNum
          }
        }
      });
    } catch (e) {
      console.warn('auditLog create failed (ignored):', e?.message || e);
    }

    // 10. Crear notificación
    try {
      await prisma.notification.create({
        data: {
          userId: dbUser.id,
          type: 'TICKETS_PURCHASED',
          title: 'Tickets comprados exitosamente',
          message: `Has comprado ${quantityNum} ticket(s) para la rifa "${raffle.title}".`,
          raffleId: raffle.id
        }
      });
    } catch (e) {
      console.warn('notification create failed (ignored):', e?.message || e);
    }

    return NextResponse.json({
      success: true,
      message: `${quantityNum} ticket(s) comprado(s) exitosamente`,
      tickets: {
        count: createdTickets.count,
        raffleId: raffle.id,
        totalPrice: raffle.ticketPrice * quantityNum
      },
      code: 'TICKETS_PURCHASED'
    }, { status: 201 });

  } catch (error) {
    console.error('Error buying tickets:', error);

    // Manejo específico de errores de Prisma
    if (error?.code === 'P2002') {
      return NextResponse.json({
        error: 'Número de ticket duplicado',
        code: 'DUPLICATE_ERROR'
      }, { status: 409 });
    }
    if (error?.code === 'P2003') {
      return NextResponse.json({
        error: 'Referencia inválida',
        code: 'INVALID_REFERENCE'
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);
    const raffleId = searchParams.get('raffleId');
    const buyerId = searchParams.get('buyerId');
    const status = searchParams.get('status');
    const mine = searchParams.get('mine'); // Para obtener tickets del usuario actual

    const skip = Math.max(0, (Math.max(1, page) - 1) * limit);

    // Construir filtros
    const where = {};

    // Si se pide "mine=1", obtener tickets del usuario actual
    if (mine === '1') {
      const session = await getServerSession(authOptions);

      if (!session?.user?.email) {
        return NextResponse.json({
          error: 'No autorizado. Debes iniciar sesión.',
          code: 'UNAUTHORIZED'
        }, { status: 401 });
      }

      const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true }
      });

      if (!dbUser) {
        return NextResponse.json({
          error: 'Usuario no encontrado en la base de datos',
          code: 'USER_NOT_FOUND'
        }, { status: 400 });
      }

      where.buyerId = dbUser.id;
    } else if (buyerId) {
      where.buyerId = buyerId;
    }

    if (raffleId) {
      where.raffleId = raffleId;
    }

    if (status && ['ACTIVE', 'USED', 'CANCELLED'].includes(status)) {
      where.status = status;
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { createdAt: 'desc' }
        ],
        include: {
          raffle: {
            select: {
              id: true,
              title: true,
              status: true,
              ticketPrice: true,
              endsAt: true,
              imageUrl: true
            }
          },
          buyer: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      }),
      prisma.ticket.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      },
      filters: {
        raffleId,
        buyerId,
        status,
        mine
      },
      code: 'TICKETS_FETCHED'
    });

  } catch (error) {
    console.error('Error fetching tickets:', error);
    return NextResponse.json({
      error: 'Error al obtener los tickets',
      code: 'FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({
        error: 'No autorizado',
        code: 'UNAUTHORIZED'
      }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!dbUser) {
      return NextResponse.json({
        error: 'Usuario no encontrado en la base de datos',
        code: 'USER_NOT_FOUND'
      }, { status: 400 });
    }

    const body = await request.json();
    const { id, action } = body;

    if (!id?.trim()) {
      return NextResponse.json({
        error: 'ID de ticket requerido',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id: id.trim() },
      include: { 
        raffle: true,
        buyer: true 
      }
    });

    if (!existingTicket) {
      return NextResponse.json({
        error: 'Ticket no encontrado',
        code: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }

    const role = dbUser.role?.toUpperCase();
    const isOwner = existingTicket.buyerId === dbUser.id;
    const isRaffleOwner = existingTicket.raffle.ownerId === dbUser.id;
    
    if (!isOwner && !isRaffleOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json({
        error: 'No tienes permisos para modificar este ticket',
        code: 'FORBIDDEN'
      }, { status: 403 });
    }

    let updateObject = {};

    switch (action) {
      case 'cancel':
        if (existingTicket.status !== 'ACTIVE') {
          return NextResponse.json({
            error: 'Solo se pueden cancelar tickets activos',
            code: 'INVALID_STATUS'
          }, { status: 400 });
        }
        updateObject = { status: 'CANCELLED' };
        break;

      case 'activate':
        if (existingTicket.status !== 'CANCELLED') {
          return NextResponse.json({
            error: 'Solo se pueden activar tickets cancelados',
            code: 'INVALID_STATUS'
          }, { status: 400 });
        }
        updateObject = { status: 'ACTIVE' };
        break;

      default:
        return NextResponse.json({
          error: 'Acción no válida',
          code: 'INVALID_ACTION'
        }, { status: 400 });
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: id.trim() },
      data: updateObject,
      include: {
        raffle: {
          select: {
            id: true,
            title: true,
            status: true
          }
        },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Ticket ${action === 'cancel' ? 'cancelado' : 'activado'} exitosamente`,
      ticket: updatedTicket,
      code: `TICKET_${action.toUpperCase()}`
    });

  } catch (error) {
    console.error('Error updating ticket:', error);

    if (error?.code === 'P2025') {
      return NextResponse.json({
        error: 'Ticket no encontrado',
        code: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }

    return NextResponse.json({
      error: 'Error al actualizar el ticket',
      code: 'UPDATE_ERROR',
      details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({
        error: 'No autorizado',
        code: 'UNAUTHORIZED'
      }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!dbUser) {
      return NextResponse.json({
        error: 'Usuario no encontrado en la base de datos',
        code: 'USER_NOT_FOUND'
      }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id?.trim()) {
      return NextResponse.json({
        error: 'ID de ticket requerido',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id: id.trim() },
      include: { raffle: true }
    });

    if (!existingTicket) {
      return NextResponse.json({
        error: 'Ticket no encontrado',
        code: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }

    const role = dbUser.role?.toUpperCase();
    const isOwner = existingTicket.buyerId === dbUser.id;
    const isRaffleOwner = existingTicket.raffle.ownerId === dbUser.id;
    
    if (!isOwner && !isRaffleOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json({
        error: 'No tienes permisos para eliminar este ticket',
        code: 'FORBIDDEN'
      }, { status: 403 });
    }

    if (existingTicket.raffle.status === 'FINISHED') {
      return NextResponse.json({
        error: 'No se pueden eliminar tickets de rifas finalizadas',
        code: 'RAFFLE_FINISHED'
      }, { status: 400 });
    }

    await prisma.ticket.delete({ where: { id: id.trim() } });

    return NextResponse.json({
      success: true,
      message: 'Ticket eliminado exitosamente',
      code: 'TICKET_DELETED'
    });

  } catch (error) {
    console.error('Error deleting ticket:', error);

    if (error?.code === 'P2025') {
      return NextResponse.json({
        error: 'Ticket no encontrado',
        code: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }

    return NextResponse.json({
      error: 'Error al eliminar el ticket',
      code: 'DELETE_ERROR',
      details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    }, { status: 500 });
  }
}