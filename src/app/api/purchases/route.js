// app/api/purchases/route.js - ALINEADO CON ticket.server.js (precio en .env)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TICKET_PRICE } from '@/lib/ticket.server';

function normalizeRole(session) {
  const r = session?.user?.role;
  return typeof r === 'string' ? r.toUpperCase() : '';
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'No autorizado. Debes iniciar sesión.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado en la base de datos', code: 'USER_NOT_FOUND' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      raffleId,
      ticketIds = [],
      paymentMethod = 'MANUAL',
      paymentDetails = {},
      totalAmount,
    } = body;

    if (!raffleId?.trim()) {
      return NextResponse.json(
        { error: 'ID de rifa requerido', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere al menos un ticket para crear una compra', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const totalAmountInt = parseInt(totalAmount, 10);
    if (!Number.isInteger(totalAmountInt) || totalAmountInt <= 0) {
      return NextResponse.json(
        { error: 'El monto total debe ser un número entero positivo', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId.trim() },
      select: { id: true, title: true, status: true, ownerId: true },
    });

    if (!raffle) {
      return NextResponse.json(
        { error: 'Rifa no encontrada', code: 'RAFFLE_NOT_FOUND' },
        { status: 404 }
      );
    }

    const tickets = await prisma.ticket.findMany({
      where: {
        id: { in: ticketIds },
        raffleId: raffle.id,
        userId: dbUser.id,
        status: 'ACTIVE',
      },
    });

    if (tickets.length !== ticketIds.length) {
      return NextResponse.json(
        { error: 'Uno o más tickets no son válidos o no te pertenecen', code: 'INVALID_TICKETS' },
        { status: 400 }
      );
    }

    const calculatedTotal = tickets.length * TICKET_PRICE;
    if (calculatedTotal !== totalAmountInt) {
      return NextResponse.json(
        {
          error: `El monto total no coincide. Esperado: ${calculatedTotal}, Recibido: ${totalAmountInt}`,
          code: 'AMOUNT_MISMATCH',
        },
        { status: 400 }
      );
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const newPurchase = await tx.purchase.create({
        data: {
          userId: dbUser.id,
          amount: totalAmountInt,
          currency: 'ARS',
          paymentMethod,
          paymentId: `MANUAL_${Date.now()}`,
          status: 'completed',
        },
      });

      await tx.ticket.updateMany({
        where: { id: { in: ticketIds } },
        data: { purchaseId: newPurchase.id, updatedAt: new Date() },
      });

      return newPurchase;
    });

    const completePurchase = await prisma.purchase.findUnique({
      where: { id: purchase.id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        tickets: {
          select: {
            id: true,
            code: true,
            status: true,
            raffle: { select: { id: true, title: true, imageUrl: true } },
          },
        },
      },
    });

    // Audit log (best-effort)
    try {
      await prisma.auditLog.create({
        data: {
          action: 'create_purchase',
          userId: dbUser.id,
          targetType: 'purchase',
          targetId: purchase.id,
          newValues: {
            raffleId: raffle.id,
            totalAmount: totalAmountInt,
            ticketCount: tickets.length,
            paymentMethod,
            priceType: 'INTEGER',
          },
        },
      });
    } catch {}

    // Notificación (best-effort)
    try {
      await prisma.notification.create({
        data: {
          userId: dbUser.id,
          type: 'PURCHASE_CONFIRMATION',
          title: 'Compra procesada exitosamente',
          message: `Tu compra de ${tickets.length} ticket(s) para "${raffle.title}" ha sido procesada exitosamente.`,
          raffleId: raffle.id,
        },
      });
    } catch {}

    return NextResponse.json(
      {
        success: true,
        message: 'Compra creada exitosamente',
        unitPrice: TICKET_PRICE,
        purchase: completePurchase,
        code: 'PURCHASE_CREATED',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating purchase:', error);
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        code: 'INTERNAL_SERVER_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined,
      },
      { status: 500 }
    );
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
    const mine = searchParams.get('mine');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const skip = Math.max(0, (Math.max(1, page) - 1) * limit);

    const where = {};

    if (mine === '1') {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json(
          { error: 'No autorizado. Debes iniciar sesión.', code: 'UNAUTHORIZED' },
          { status: 401 }
        );
      }

      const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });

      if (!dbUser) {
        return NextResponse.json(
          { error: 'Usuario no encontrado en la base de datos', code: 'USER_NOT_FOUND' },
          { status: 400 }
        );
      }

      where.userId = dbUser.id;
    } else if (buyerId) {
      where.userId = buyerId;
    }

    if (raffleId) {
      where.tickets = { some: { raffleId } };
    }

    if (status && ['pending', 'completed', 'failed', 'refunded'].includes(status)) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    // Promise.all correctamente balanceado
    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
          tickets: {
            select: {
              id: true,
              code: true,
              status: true,
              raffle: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  imageUrl: true,
                  endsAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.purchase.count({ where }),
    ]);

    const stats =
      purchases.length > 0
        ? {
            totalAmount: purchases.reduce((sum, p) => sum + (p.amount || 0), 0),
            totalTickets: purchases.reduce((sum, p) => sum + (p.tickets?.length || 0), 0),
            averagePurchase: Math.round(
              purchases.reduce((sum, p) => sum + (p.amount || 0), 0) / purchases.length
            ),
          }
        : null;

    return NextResponse.json({
      success: true,
      purchases,
      unitPrice: TICKET_PRICE,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
      filters: { buyerId, raffleId, status, mine, dateFrom, dateTo },
      code: 'PURCHASES_FETCHED',
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    return NextResponse.json(
      {
        error: 'Error al obtener las compras',
        code: 'FETCH_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado en la base de datos', code: 'USER_NOT_FOUND' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { id, action, refundReason } = body;

    if (!id?.trim()) {
      return NextResponse.json(
        { error: 'ID de compra requerido', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const existingPurchase = await prisma.purchase.findUnique({
      where: { id: id.trim() },
      include: {
        user: true,
        tickets: { include: { raffle: true } },
      },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { error: 'Compra no encontrada', code: 'PURCHASE_NOT_FOUND' },
        { status: 404 }
      );
    }

    const role = dbUser.role?.toUpperCase();
    const isOwner = existingPurchase.userId === dbUser.id;
    const raffleOwnerId = existingPurchase.tickets[0]?.raffle?.ownerId;
    const isRaffleOwner = raffleOwnerId === dbUser.id;

    if (!isOwner && !isRaffleOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'No tienes permisos para modificar esta compra', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    let updateObject = {};

    switch (action) {
      case 'cancel':
        if (existingPurchase.status !== 'pending') {
          return NextResponse.json(
            { error: 'Solo se pueden cancelar compras pendientes', code: 'INVALID_STATUS' },
            { status: 400 }
          );
        }
        updateObject = { status: 'failed', updatedAt: new Date() };
        break;

      case 'refund':
        if (!['completed', 'pending'].includes(existingPurchase.status)) {
          return NextResponse.json(
            { error: 'Solo se pueden reembolsar compras completadas o pendientes', code: 'INVALID_STATUS' },
            { status: 400 }
          );
        }
        if (!isRaffleOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
          return NextResponse.json(
            { error: 'Solo el dueño de la rifa o administradores pueden procesar reembolsos', code: 'FORBIDDEN' },
            { status: 403 }
          );
        }
        updateObject = { status: 'refunded', updatedAt: new Date() };
        break;

      case 'complete':
        if (existingPurchase.status !== 'pending') {
          return NextResponse.json(
            { error: 'Solo se pueden completar compras pendientes', code: 'INVALID_STATUS' },
            { status: 400 }
          );
        }
        updateObject = { status: 'completed', updatedAt: new Date() };
        break;

      default:
        return NextResponse.json({ error: 'Acción no válida', code: 'INVALID_ACTION' }, { status: 400 });
    }

    const updatedPurchase = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.update({
        where: { id: id.trim() },
        data: updateObject,
        include: {
          user: { select: { id: true, name: true, email: true } },
          tickets: {
            select: {
              id: true,
              code: true,
              status: true,
              raffle: { select: { id: true, title: true, status: true } },
            },
          },
        },
      });

      if (['cancel', 'refund'].includes(action)) {
        await tx.ticket.updateMany({
          where: { purchaseId: purchase.id },
          data: { status: 'DELETED', updatedAt: new Date() },
        });
      }

      return purchase;
    });

    try {
      await prisma.auditLog.create({
        data: {
          action: `purchase_${action}`,
          userId: dbUser.id,
          targetType: 'purchase',
          targetId: id.trim(),
          oldValues: { status: existingPurchase.status },
          newValues: { ...updateObject, priceType: 'INTEGER' },
        },
      });
    } catch {}

    try {
      const notificationMessages = {
        cancel: 'Tu compra ha sido cancelada',
        refund: 'Tu compra ha sido reembolsada',
        complete: 'Tu compra ha sido completada',
      };

      const raffleTitle = existingPurchase.tickets[0]?.raffle?.title || 'Sorteo';

      await prisma.notification.create({
        data: {
          userId: existingPurchase.userId,
          type: 'SYSTEM_ALERT',
          title: notificationMessages[action] || 'Compra actualizada',
          message: `Tu compra para "${raffleTitle}" ha sido ${
            action === 'cancel' ? 'cancelada' : action === 'refund' ? 'reembolsada' : 'completada'
          }.`,
          raffleId: existingPurchase.tickets[0]?.raffleId,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Compra ${
        action === 'cancel' ? 'cancelada' : action === 'refund' ? 'reembolsada' : 'completada'
      } exitosamente`,
      unitPrice: TICKET_PRICE,
      purchase: updatedPurchase,
      code: `PURCHASE_${action.toUpperCase()}ED`,
    });
  } catch (error) {
    console.error('Error updating purchase:', error);
    return NextResponse.json(
      {
        error: 'Error al actualizar la compra',
        code: 'UPDATE_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado en la base de datos', code: 'USER_NOT_FOUND' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id?.trim()) {
      return NextResponse.json(
        { error: 'ID de compra requerido', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const existingPurchase = await prisma.purchase.findUnique({
      where: { id: id.trim() },
      include: { tickets: { include: { raffle: true } } },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { error: 'Compra no encontrada', code: 'PURCHASE_NOT_FOUND' },
        { status: 404 }
      );
    }

    const role = dbUser.role?.toUpperCase();
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'No tienes permisos para eliminar compras', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if (existingPurchase.status === 'completed') {
      return NextResponse.json(
        { error: 'No se pueden eliminar compras completadas', code: 'PURCHASE_COMPLETED' },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.ticket.updateMany({
        where: { purchaseId: existingPurchase.id },
        data: { purchaseId: null, status: 'AVAILABLE', updatedAt: new Date() },
      });

      await tx.purchase.delete({ where: { id: id.trim() } });
    });

    return NextResponse.json({
      success: true,
      message: 'Compra eliminada exitosamente',
      code: 'PURCHASE_DELETED',
    });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    return NextResponse.json(
      {
        error: 'Error al eliminar la compra',
        code: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined,
      },
      { status: 500 }
    );
  }
}
