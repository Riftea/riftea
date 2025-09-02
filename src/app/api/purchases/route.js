// app/api/purchases/route.js
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

    console.log("session POST purchases:", !!session, session?.user?.email);

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
      ticketIds = [],
      paymentMethod = 'MANUAL',
      paymentDetails = {},
      totalAmount
    } = body;

    // 4. Validaciones básicas
    if (!raffleId?.trim()) {
      return NextResponse.json({
        error: 'ID de rifa requerido',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return NextResponse.json({
        error: 'Se requiere al menos un ticket para crear una compra',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    const totalAmountNum = Number(totalAmount);
    if (!Number.isFinite(totalAmountNum) || totalAmountNum <= 0) {
      return NextResponse.json({
        error: 'Monto total inválido',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    // 5. Verificar que la rifa existe
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId.trim() },
      select: {
        id: true,
        title: true,
        status: true,
        ticketPrice: true,
        ownerId: true
      }
    });

    if (!raffle) {
      return NextResponse.json({
        error: 'Rifa no encontrada',
        code: 'RAFFLE_NOT_FOUND'
      }, { status: 404 });
    }

    // 6. Verificar que los tickets existen y pertenecen al usuario
    const tickets = await prisma.ticket.findMany({
      where: {
        id: { in: ticketIds },
        raffleId: raffle.id,
        buyerId: dbUser.id,
        status: 'ACTIVE'
      }
    });

    if (tickets.length !== ticketIds.length) {
      return NextResponse.json({
        error: 'Uno o más tickets no son válidos o no te pertenecen',
        code: 'INVALID_TICKETS'
      }, { status: 400 });
    }

    // 7. Calcular y verificar el monto total
    const calculatedTotal = tickets.length * raffle.ticketPrice;
    if (Math.abs(calculatedTotal - totalAmountNum) > 0.01) {
      return NextResponse.json({
        error: `El monto total no coincide. Esperado: ${calculatedTotal}, Recibido: ${totalAmountNum}`,
        code: 'AMOUNT_MISMATCH'
      }, { status: 400 });
    }

    // 8. Crear la compra
    let purchase;

    try {
      purchase = await prisma.$transaction(async (tx) => {
        // Crear el registro de compra
        const newPurchase = await tx.purchase.create({
          data: {
            buyerId: dbUser.id,
            raffleId: raffle.id,
            totalAmount: totalAmountNum,
            ticketCount: tickets.length,
            status: 'COMPLETED',
            paymentMethod,
            paymentDetails: paymentDetails || {},
            purchaseDate: new Date()
          }
        });

        // Actualizar los tickets para vincularlos con la compra
        await tx.ticket.updateMany({
          where: {
            id: { in: ticketIds }
          },
          data: {
            purchaseId: newPurchase.id,
            updatedAt: new Date()
          }
        });

        return newPurchase;
      });

      console.log("✅ Compra creada exitosamente:", purchase.id);

    } catch (createError) {
      console.error('Error en creación de compra:', createError);
      throw createError;
    }

    // 9. Obtener la compra completa con relaciones
    const completePurchase = await prisma.purchase.findUnique({
      where: { id: purchase.id },
      include: {
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        raffle: {
          select: {
            id: true,
            title: true,
            ticketPrice: true,
            imageUrl: true
          }
        },
        tickets: {
          select: {
            id: true,
            ticketNumber: true,
            status: true
          }
        }
      }
    });

    // 10. Crear log de auditoría
    try {
      await prisma.auditLog.create({
        data: {
          action: 'create_purchase',
          userId: dbUser.id,
          targetType: 'purchase',
          targetId: purchase.id,
          newValues: {
            raffleId: raffle.id,
            totalAmount: totalAmountNum,
            ticketCount: tickets.length,
            paymentMethod
          }
        }
      });
    } catch (e) {
      console.warn('auditLog create failed (ignored):', e?.message || e);
    }

    // 11. Crear notificación
    try {
      await prisma.notification.create({
        data: {
          userId: dbUser.id,
          type: 'PURCHASE_COMPLETED',
          title: 'Compra procesada exitosamente',
          message: `Tu compra de ${tickets.length} ticket(s) para "${raffle.title}" ha sido procesada exitosamente.`,
          raffleId: raffle.id
        }
      });
    } catch (e) {
      console.warn('notification create failed (ignored):', e?.message || e);
    }

    return NextResponse.json({
      success: true,
      message: 'Compra creada exitosamente',
      purchase: completePurchase,
      code: 'PURCHASE_CREATED'
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating purchase:', error);

    // Manejo específico de errores de Prisma
    if (error?.code === 'P2002') {
      return NextResponse.json({
        error: 'Ya existe una compra con estos datos',
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
    const buyerId = searchParams.get('buyerId');
    const raffleId = searchParams.get('raffleId');
    const status = searchParams.get('status');
    const mine = searchParams.get('mine'); // Para obtener compras del usuario actual
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const skip = Math.max(0, (Math.max(1, page) - 1) * limit);

    // Construir filtros
    const where = {};

    // Si se pide "mine=1", obtener compras del usuario actual
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

    if (status && ['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(status)) {
      where.status = status;
    }

    // Filtros de fecha
    if (dateFrom || dateTo) {
      where.purchaseDate = {};
      if (dateFrom) {
        where.purchaseDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.purchaseDate.lte = new Date(dateTo);
      }
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { purchaseDate: 'desc' }
        ],
        include: {
          buyer: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          raffle: {
            select: {
              id: true,
              title: true,
              status: true,
              ticketPrice: true,
              imageUrl: true,
              endsAt: true
            }
          },
          tickets: {
            select: {
              id: true,
              ticketNumber: true,
              status: true
            }
          }
        }
      }),
      prisma.purchase.count({ where })
    ]);

    // Calcular estadísticas adicionales
    const stats = purchases.length > 0 ? {
      totalAmount: purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0),
      totalTickets: purchases.reduce((sum, p) => sum + (p.ticketCount || 0), 0),
      averagePurchase: purchases.length > 0 ? purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0) / purchases.length : 0
    } : null;

    return NextResponse.json({
      success: true,
      purchases,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      },
      filters: {
        buyerId,
        raffleId,
        status,
        mine,
        dateFrom,
        dateTo
      },
      code: 'PURCHASES_FETCHED'
    });

  } catch (error) {
    console.error('Error fetching purchases:', error);
    return NextResponse.json({
      error: 'Error al obtener las compras',
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
    const { id, action, refundReason } = body;

    if (!id?.trim()) {
      return NextResponse.json({
        error: 'ID de compra requerido',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    const existingPurchase = await prisma.purchase.findUnique({
      where: { id: id.trim() },
      include: { 
        raffle: true,
        buyer: true,
        tickets: true
      }
    });

    if (!existingPurchase) {
      return NextResponse.json({
        error: 'Compra no encontrada',
        code: 'PURCHASE_NOT_FOUND'
      }, { status: 404 });
    }

    const role = dbUser.role?.toUpperCase();
    const isOwner = existingPurchase.buyerId === dbUser.id;
    const isRaffleOwner = existingPurchase.raffle.ownerId === dbUser.id;
    
    if (!isOwner && !isRaffleOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json({
        error: 'No tienes permisos para modificar esta compra',
        code: 'FORBIDDEN'
      }, { status: 403 });
    }

    let updateObject = {};

    switch (action) {
      case 'cancel':
        if (existingPurchase.status !== 'PENDING') {
          return NextResponse.json({
            error: 'Solo se pueden cancelar compras pendientes',
            code: 'INVALID_STATUS'
          }, { status: 400 });
        }
        updateObject = { 
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: refundReason || 'Cancelada por el usuario'
        };
        break;

      case 'refund':
        if (!['COMPLETED', 'PENDING'].includes(existingPurchase.status)) {
          return NextResponse.json({
            error: 'Solo se pueden reembolsar compras completadas o pendientes',
            code: 'INVALID_STATUS'
          }, { status: 400 });
        }
        
        if (!isRaffleOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
          return NextResponse.json({
            error: 'Solo el dueño de la rifa o administradores pueden procesar reembolsos',
            code: 'FORBIDDEN'
          }, { status: 403 });
        }
        
        updateObject = { 
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundReason: refundReason || 'Reembolso procesado'
        };
        break;

      case 'complete':
        if (existingPurchase.status !== 'PENDING') {
          return NextResponse.json({
            error: 'Solo se pueden completar compras pendientes',
            code: 'INVALID_STATUS'
          }, { status: 400 });
        }
        updateObject = { 
          status: 'COMPLETED',
          completedAt: new Date()
        };
        break;

      default:
        return NextResponse.json({
          error: 'Acción no válida',
          code: 'INVALID_ACTION'
        }, { status: 400 });
    }

    const updatedPurchase = await prisma.$transaction(async (tx) => {
      // Actualizar la compra
      const purchase = await tx.purchase.update({
        where: { id: id.trim() },
        data: updateObject,
        include: {
          buyer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          raffle: {
            select: {
              id: true,
              title: true,
              status: true
            }
          },
          tickets: {
            select: {
              id: true,
              ticketNumber: true,
              status: true
            }
          }
        }
      });

      // Si es cancelación o reembolso, actualizar los tickets
      if (['cancel', 'refund'].includes(action)) {
        await tx.ticket.updateMany({
          where: {
            purchaseId: purchase.id
          },
          data: {
            status: 'CANCELLED',
            updatedAt: new Date()
          }
        });
      }

      return purchase;
    });

    // Crear log de auditoría
    try {
      await prisma.auditLog.create({
        data: {
          action: `purchase_${action}`,
          userId: dbUser.id,
          targetType: 'purchase',
          targetId: id.trim(),
          oldValues: {
            status: existingPurchase.status
          },
          newValues: updateObject
        }
      });
    } catch (e) {
      console.warn('auditLog update failed (ignored):', e?.message || e);
    }

    // Crear notificación
    try {
      const notificationMessages = {
        cancel: 'Tu compra ha sido cancelada',
        refund: 'Tu compra ha sido reembolsada',
        complete: 'Tu compra ha sido completada'
      };

      await prisma.notification.create({
        data: {
          userId: existingPurchase.buyerId,
          type: `PURCHASE_${action.toUpperCase()}ED`,
          title: notificationMessages[action] || 'Compra actualizada',
          message: `Tu compra para "${existingPurchase.raffle.title}" ha sido ${action === 'cancel' ? 'cancelada' : action === 'refund' ? 'reembolsada' : 'completada'}.`,
          raffleId: existingPurchase.raffleId
        }
      });
    } catch (e) {
      console.warn('notification create failed (ignored):', e?.message || e);
    }

    return NextResponse.json({
      success: true,
      message: `Compra ${action === 'cancel' ? 'cancelada' : action === 'refund' ? 'reembolsada' : 'completada'} exitosamente`,
      purchase: updatedPurchase,
      code: `PURCHASE_${action.toUpperCase()}ED`
    });

  } catch (error) {
    console.error('Error updating purchase:', error);

    if (error?.code === 'P2025') {
      return NextResponse.json({
        error: 'Compra no encontrada',
        code: 'PURCHASE_NOT_FOUND'
      }, { status: 404 });
    }

    return NextResponse.json({
      error: 'Error al actualizar la compra',
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
        error: 'ID de compra requerido',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    const existingPurchase = await prisma.purchase.findUnique({
      where: { id: id.trim() },
      include: { 
        raffle: true,
        tickets: true
      }
    });

    if (!existingPurchase) {
      return NextResponse.json({
        error: 'Compra no encontrada',
        code: 'PURCHASE_NOT_FOUND'
      }, { status: 404 });
    }

    const role = dbUser.role?.toUpperCase();
    const isOwner = existingPurchase.buyerId === dbUser.id;
    
    // Solo ADMIN y SUPERADMIN pueden eliminar compras
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json({
        error: 'No tienes permisos para eliminar compras',
        code: 'FORBIDDEN'
      }, { status: 403 });
    }

    if (existingPurchase.status === 'COMPLETED') {
      return NextResponse.json({
        error: 'No se pueden eliminar compras completadas',
        code: 'PURCHASE_COMPLETED'
      }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // Primero desvinculamos los tickets
      await tx.ticket.updateMany({
        where: {
          purchaseId: existingPurchase.id
        },
        data: {
          purchaseId: null,
          status: 'ACTIVE',
          updatedAt: new Date()
        }
      });

      // Luego eliminamos la compra
      await tx.purchase.delete({ 
        where: { id: id.trim() } 
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Compra eliminada exitosamente',
      code: 'PURCHASE_DELETED'
    });

  } catch (error) {
    console.error('Error deleting purchase:', error);

    if (error?.code === 'P2025') {
      return NextResponse.json({
        error: 'Compra no encontrada',
        code: 'PURCHASE_NOT_FOUND'
      }, { status: 404 });
    }

    return NextResponse.json({
      error: 'Error al eliminar la compra',
      code: 'DELETE_ERROR',
      details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    }, { status: 500 });
  }
}
