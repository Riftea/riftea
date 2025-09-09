// app/api/raffles/route.js
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  TICKET_PRICE,
  POT_CONTRIBUTION_PER_TICKET
} from '@/lib/ticket.server';

/* =======================
   Helpers
   ======================= */

// Valida fechas: mismas reglas que ya usabas
function validateDates(startsAt, endsAt) {
  const now = new Date();
  const endDate = endsAt ? new Date(endsAt) : null;
  const startDate = startsAt ? new Date(startsAt) : null;

  if (endDate && isNaN(endDate.getTime())) {
    return { valid: false, error: 'Fecha de finalización inválida' };
  }
  if (startDate && isNaN(startDate.getTime())) {
    return { valid: false, error: 'Fecha de inicio inválida' };
  }
  if (endDate && endDate <= now) {
    return { valid: false, error: 'La fecha de finalización debe ser futura' };
  }
  if (startDate && startDate <= now) {
    return { valid: false, error: 'La fecha de inicio debe ser futura' };
  }
  if (startDate && endDate && startDate >= endDate) {
    return { valid: false, error: 'La fecha de inicio debe ser anterior a la fecha de finalización' };
  }

  return { valid: true, startDate, endDate };
}

// Normaliza "regla en miles" para premio:
// - < 1000 -> interpreta en miles (1 -> 1000, 10 -> 10000)
// - >= 1000 -> toma literal
function normalizePrizeValue(raw) {
  if (raw === null || raw === undefined) return null;
  let n = Number.isFinite(raw) ? Math.trunc(raw) : NaN;
  if (!Number.isFinite(n)) {
    const cleaned = String(raw).replace(/[^\d]/g, '');
    n = cleaned ? parseInt(cleaned, 10) : NaN;
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1000 ? n * 1000 : n;
}

/* =======================
   POST: Crear rifa
   ======================= */

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
      select: { id: true, role: true, image: true }
    });
    if (!dbUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado en la base de datos', code: 'USER_NOT_FOUND' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      prizeValue,       // requerido
      participantGoal,  // opcional
      startsAt,         // opcional
      endsAt,           // opcional/condicional
      imageUrl,         // opcional
      isPrivate         // opcional (default false)
    } = body ?? {};

    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'El título es requerido', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    if (!description?.trim()) {
      return NextResponse.json(
        { error: 'La descripción no puede estar vacía', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const prizeValueInt = normalizePrizeValue(prizeValue);
    if (!prizeValueInt || prizeValueInt < 1000) {
      return NextResponse.json(
        { error: 'El valor del premio es obligatorio y debe ser un entero ≥ 1000', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Si NO hay participantGoal => exigir endsAt
    if ((participantGoal === undefined || participantGoal === null) && !endsAt) {
      return NextResponse.json(
        { error: 'Si no defines un objetivo de participantes, debes indicar una fecha de finalización', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    let processedStartDate = null;
    let processedEndDate = null;
    if (startsAt || endsAt) {
      const dateValidation = validateDates(startsAt, endsAt);
      if (!dateValidation.valid) {
        return NextResponse.json(
          { error: dateValidation.error, code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      processedStartDate = dateValidation.startDate;
      processedEndDate = dateValidation.endDate;
    }

    const minParticipants = Math.ceil(
      prizeValueInt / POT_CONTRIBUTION_PER_TICKET
    );

    let maxParticipants = minParticipants;
    if (participantGoal !== undefined && participantGoal !== null) {
      const goalInt = Math.trunc(Number(participantGoal));
      if (!Number.isFinite(goalInt) || goalInt < minParticipants) {
        return NextResponse.json(
          { error: `El objetivo de participantes debe ser un entero ≥ ${minParticipants}`, code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      maxParticipants = goalInt;
    }

    const initialStatus = processedStartDate ? 'PUBLISHED' : 'ACTIVE';
    const isPrivateFlag = typeof isPrivate === 'boolean' ? isPrivate : false;

    let raffle;
    try {
      raffle = await prisma.raffle.create({
        data: {
          title: title.trim(),
          description: description.trim(),
          prizeValue: prizeValueInt,
          maxParticipants,
          startsAt: processedStartDate,
          endsAt: processedEndDate,
          imageUrl: imageUrl?.trim() || null,
          status: initialStatus,
          publishedAt: new Date(),
          ownerImage: dbUser.image || session.user.image || null,
          isPrivate: isPrivateFlag,
          owner: { connect: { id: dbUser.id } }
        },
        include: {
          owner: {
            select: { id: true, name: true, email: true, image: true, role: true }
          },
          _count: {
            select: { tickets: true, participations: true }
          }
        }
      });
    } catch (createError) {
      console.error('Error en creación de rifa:', createError);
      throw createError;
    }

    try {
      await prisma.auditLog.create({
        data: {
          action: 'create_raffle',
          userId: dbUser.id,
          targetType: 'raffle',
          targetId: raffle.id,
          newValues: {
            title: raffle.title,
            prizeValue: raffle.prizeValue,
            maxParticipants: raffle.maxParticipants,
            status: raffle.status,
            isPrivate: raffle.isPrivate
          }
        }
      });
    } catch (e) {
      console.warn('auditLog create failed (ignored):', e?.message || e);
    }

    try {
      await prisma.notification.create({
        data: {
          userId: dbUser.id,
          type: 'RAFFLE_CREATED',
          title: 'Rifa creada exitosamente',
          message: `Tu rifa "${raffle.title}" ha sido creada${raffle.status === 'ACTIVE' ? ' y ya está activa' : ''}.`,
          raffleId: raffle.id
        }
      });
    } catch (e) {
      console.warn('notification create failed (ignored):', e?.message || e);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Rifa creada exitosamente',
        raffle,
        meta: {
          minParticipants,            // auxiliar para UI
          ticketPrice: TICKET_PRICE   // informativo (derivado del server)
        },
        code: 'RAFFLE_CREATED'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating raffle:', error);

    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Ya existe una rifa con datos similares', code: 'DUPLICATE_ERROR' },
        { status: 409 }
      );
    }
    if (error?.code === 'P2003') {
      return NextResponse.json(
        { error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' },
        { status: 400 }
      );
    }
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Registro no encontrado', code: 'RECORD_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        code: 'INTERNAL_SERVER_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
      },
      { status: 500 }
    );
  }
}

/* =======================
   GET: Listar rifas (con SELECT explícito, incluye isPrivate)
   ======================= */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);
    const status = searchParams.get('status');
    const ownerId = searchParams.get('ownerId');
    const search = searchParams.get('search');
    const mine = searchParams.get('mine');

    const skip = Math.max(0, (Math.max(1, page) - 1) * limit);

    // Filtros
    const where = {};

    if (mine === '1') {
      // Filtra SOLO por dueño, sin condicionar por isPrivate
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json(
          { error: 'No autorizado. Debes iniciar sesión.', code: 'UNAUTHORIZED' },
          { status: 401 }
        );
      }
      const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true }
      });
      if (!dbUser) {
        return NextResponse.json(
          { error: 'Usuario no encontrado en la base de datos', code: 'USER_NOT_FOUND' },
          { status: 400 }
        );
      }
      where.ownerId = dbUser.id;
    } else {
      // Si NO viene mine=1 → mostrar solo públicas
      where.isPrivate = false;

      // Si además piden ownerId específico (p.ej. vitrina de un usuario), se respeta
      if (ownerId) {
        where.ownerId = ownerId;
      }

      // Si no se especifica status, limitar a estados de vista pública
      if (!status) {
        where.status = { in: ['PUBLISHED', 'ACTIVE', 'FINISHED'] };
      }
    }

    if (status && ['DRAFT', 'PUBLISHED', 'ACTIVE', 'FINISHED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      where.status = status;
    }

    if (search?.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } }
      ];
    }

    const [raffles, total] = await Promise.all([
      prisma.raffle.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { status: 'asc' },
          { createdAt: 'desc' }
        ],
        // SELECT EXPLÍCITO: limita campos y asegura isPrivate
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          prizeValue: true,
          maxParticipants: true,
          startsAt: true,
          endsAt: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          isPrivate: true, // 👈 explícito
          owner: {
            select: { id: true, name: true, email: true, image: true, role: true }
          },
          winner: { select: { id: true, name: true, image: true } },
          _count: { select: { tickets: true, participations: true } }
        }
      }),
      prisma.raffle.count({ where })
    ]);

    const rafflesWithStats = raffles.map(raffle => ({
      ...raffle,
      // Precio unitario derivado para el cliente (NO viene de la DB)
      unitPrice: TICKET_PRICE,
      stats: {
        totalTickets: raffle._count?.tickets ?? 0,
        totalParticipations: raffle._count?.participations ?? 0,
        ticketsSold: raffle._count?.tickets ?? 0,
        maxParticipantsReached: raffle.maxParticipants
          ? (raffle._count?.tickets ?? 0) >= raffle.maxParticipants
          : false,
        daysLeft: raffle.endsAt
          ? Math.max(0, Math.ceil((new Date(raffle.endsAt) - new Date()) / (1000 * 60 * 60 * 24)))
          : null,
        isExpired: raffle.endsAt ? new Date() > new Date(raffle.endsAt) : false
      }
    }));

    return NextResponse.json({
      success: true,
      raffles: rafflesWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      },
      // También exponemos precio unitario a nivel respuesta (compatibilidad)
      meta: { ticketPrice: TICKET_PRICE },
      filters: { status, ownerId, search, mine },
      code: 'RAFFLES_FETCHED'
    });

  } catch (error) {
    console.error('Error fetching raffles:', error);
    return NextResponse.json(
      {
        error: 'Error al obtener las rifas',
        code: 'FETCH_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
      },
      { status: 500 }
    );
  }
}

/* =======================
   PUT: Actualizar rifa
   ======================= */

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'No autorizado', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });
    if (!dbUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado en la base de datos', code: 'USER_NOT_FOUND' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { id, action, ...updateData } = body;

    if (!id?.trim()) {
      return NextResponse.json(
        { error: 'ID de rifa requerido', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const existingRaffle = await prisma.raffle.findUnique({
      where: { id: id.trim() },
      include: { owner: true }
    });
    if (!existingRaffle) {
      return NextResponse.json(
        { error: 'Rifa no encontrada', code: 'RAFFLE_NOT_FOUND' },
        { status: 404 }
      );
    }

    const role = (existingRaffle && dbUser.role || '').toUpperCase();
    const isOwner = existingRaffle.ownerId === dbUser.id;
    if (!isOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'No tienes permisos para modificar esta rifa', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    let updateObject = {};

    switch (action) {
      case 'publish':
        if (existingRaffle.status !== 'DRAFT') {
          return NextResponse.json(
            { error: 'Solo se pueden publicar rifas en estado borrador', code: 'INVALID_STATUS' },
            { status: 400 }
          );
        }
        updateObject = { status: 'PUBLISHED', publishedAt: new Date() };
        break;

      case 'activate':
        if (!['PUBLISHED', 'DRAFT'].includes(existingRaffle.status)) {
          return NextResponse.json(
            { error: 'Solo se pueden activar rifas publicadas o en borrador', code: 'INVALID_STATUS' },
            { status: 400 }
          );
        }
        updateObject = {
          status: 'ACTIVE',
          startsAt: updateData.startsAt ? new Date(updateData.startsAt) : new Date(),
          publishedAt: existingRaffle.publishedAt || new Date()
        };
        break;

      case 'finish':
        if (existingRaffle.status !== 'ACTIVE') {
          return NextResponse.json(
            { error: 'Solo se pueden finalizar rifas activas', code: 'INVALID_STATUS' },
            { status: 400 }
          );
        }
        updateObject = { status: 'FINISHED', drawnAt: new Date() };
        break;

      case 'cancel':
        if (['FINISHED', 'CANCELLED'].includes(existingRaffle.status)) {
          return NextResponse.json(
            { error: 'No se puede cancelar una rifa ya finalizada o cancelada', code: 'INVALID_STATUS' },
            { status: 400 }
          );
        }
        updateObject = { status: 'CANCELLED' };
        break;

      default:
        if (updateData.title !== undefined) {
          const t = String(updateData.title).trim();
          if (!t) {
            return NextResponse.json(
              { error: 'El título no puede estar vacío', code: 'VALIDATION_ERROR' },
              { status: 400 }
            );
          }
          updateObject.title = t;
        }

        if (updateData.description !== undefined) {
          const d = String(updateData.description).trim();
          if (!d) {
            return NextResponse.json(
              { error: 'La descripción no puede estar vacía', code: 'VALIDATION_ERROR' },
              { status: 400 }
            );
          }
          updateObject.description = d;
        }

        if (updateData.prizeValue !== undefined) {
          const pv = normalizePrizeValue(updateData.prizeValue);
          if (!pv || pv < 1000) {
            return NextResponse.json(
              { error: 'El valor del premio debe ser un entero ≥ 1000', code: 'VALIDATION_ERROR' },
              { status: 400 }
            );
          }
          updateObject.prizeValue = pv;

          const minNeeded = Math.ceil(pv / POT_CONTRIBUTION_PER_TICKET);
          const targetMax = (updateData.maxParticipants !== undefined && updateData.maxParticipants !== null)
            ? Math.trunc(Number(updateData.maxParticipants))
            : existingRaffle.maxParticipants;

          if (!Number.isFinite(targetMax) || targetMax < minNeeded) {
            return NextResponse.json(
              { error: `maxParticipants debe ser ≥ ${minNeeded} para cubrir el premio`, code: 'VALIDATION_ERROR' },
              { status: 400 }
            );
          }
          if (updateData.maxParticipants === undefined) {
            updateObject.maxParticipants = targetMax;
          }
        }

        if (updateData.maxParticipants !== undefined) {
          const mp = updateData.maxParticipants === null ? null : Math.trunc(Number(updateData.maxParticipants));
          if (mp === null || !Number.isFinite(mp) || mp <= 0) {
            return NextResponse.json(
              { error: 'maxParticipants debe ser un entero mayor a 0', code: 'VALIDATION_ERROR' },
              { status: 400 }
            );
          }
          if (updateObject.prizeValue === undefined) {
            const minNeeded = Math.ceil((existingRaffle.prizeValue ?? 0) / POT_CONTRIBUTION_PER_TICKET);
            if (mp < minNeeded) {
              return NextResponse.json(
                { error: `maxParticipants debe ser ≥ ${minNeeded}`, code: 'VALIDATION_ERROR' },
                { status: 400 }
              );
            }
          }
          updateObject.maxParticipants = mp;
        }

        if (updateData.imageUrl !== undefined) {
          updateObject.imageUrl = updateData.imageUrl ? String(updateData.imageUrl).trim() : null;
        }

        if (updateData.isPrivate !== undefined) {
          if (typeof updateData.isPrivate !== 'boolean') {
            return NextResponse.json(
              { error: 'isPrivate debe ser boolean', code: 'VALIDATION_ERROR' },
              { status: 400 }
            );
          }
          updateObject.isPrivate = updateData.isPrivate;
        }

        if (updateData.endsAt !== undefined || updateData.startsAt !== undefined) {
          const newStartsAt = updateData.startsAt !== undefined ? updateData.startsAt : existingRaffle.startsAt;
          const newEndsAt = updateData.endsAt !== undefined ? updateData.endsAt : existingRaffle.endsAt;
          const dateValidation = validateDates(newStartsAt, newEndsAt);
          if (!dateValidation.valid) {
            return NextResponse.json(
              { error: dateValidation.error, code: 'VALIDATION_ERROR' },
              { status: 400 }
            );
          }
          if (updateData.endsAt !== undefined) updateObject.endsAt = dateValidation.endDate;
          if (updateData.startsAt !== undefined) updateObject.startsAt = dateValidation.startDate;
        }
        break;
    }

    if (Object.keys(updateObject).length === 0) {
      return NextResponse.json(
        { error: 'Nada para actualizar', code: 'NO_CHANGES' },
        { status: 400 }
      );
    }

    const updatedRaffle = await prisma.raffle.update({
      where: { id: id.trim() },
      data: updateObject,
      include: {
        owner: { select: { id: true, name: true, email: true, image: true, role: true } },
        winner: { select: { id: true, name: true, image: true } },
        _count: { select: { tickets: true, participations: true } }
      }
    });

    try {
      await prisma.auditLog.create({
        data: {
          action: action ? `raffle_${action}` : 'update_raffle',
          userId: dbUser.id,
          targetType: 'raffle',
          targetId: id.trim(),
          oldValues: {
            status: existingRaffle.status,
            title: existingRaffle.title,
            prizeValue: existingRaffle.prizeValue,
            maxParticipants: existingRaffle.maxParticipants,
            isPrivate: existingRaffle.isPrivate
          },
          newValues: updateObject
        }
      });
    } catch (e) {
      console.warn('auditLog update failed (ignored):', e?.message || e);
    }

    return NextResponse.json({
      success: true,
      message: `Rifa ${action ? action : 'actualizada'} exitosamente`,
      raffle: updatedRaffle,
      code: action ? `RAFFLE_${action.toUpperCase()}` : 'RAFFLE_UPDATED'
    });

  } catch (error) {
    console.error('Error updating raffle:', error);

    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Rifa no encontrada', code: 'RAFFLE_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Error al actualizar la rifa',
        code: 'UPDATE_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
      },
      { status: 500 }
    );
  }
}

/* =======================
   DELETE: Eliminar rifa
   ======================= */

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'No autorizado', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
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
        { error: 'ID de rifa requerido', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const existingRaffle = await prisma.raffle.findUnique({
      where: { id: id.trim() },
      include: { _count: { select: { tickets: true } } }
    });
    if (!existingRaffle) {
      return NextResponse.json(
        { error: 'Rifa no encontrada', code: 'RAFFLE_NOT_FOUND' },
        { status: 404 }
      );
    }

    const role = (dbUser.role || '').toUpperCase();
    const isOwner = existingRaffle.ownerId === dbUser.id;
    if (!isOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'No tienes permisos para eliminar esta rifa', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if ((existingRaffle._count?.tickets ?? 0) > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar una rifa que ya tiene tickets vendidos', code: 'HAS_TICKETS' },
        { status: 400 }
      );
    }

    await prisma.raffle.delete({ where: { id: id.trim() } });

    try {
      await prisma.auditLog.create({
        data: {
          action: 'delete_raffle',
          userId: dbUser.id,
          targetType: 'raffle',
          targetId: id.trim(),
          oldValues: {
            title: existingRaffle.title,
            status: existingRaffle.status,
            prizeValue: existingRaffle.prizeValue,
            maxParticipants: existingRaffle.maxParticipants,
            isPrivate: existingRaffle.isPrivate
          }
        }
      });
    } catch (e) {
      console.warn('auditLog delete failed (ignored):', e?.message || e);
    }

    return NextResponse.json({
      success: true,
      message: 'Rifa eliminada exitosamente',
      code: 'RAFFLE_DELETED'
    });

  } catch (error) {
    console.error('Error deleting raffle:', error);

    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Rifa no encontrada', code: 'RAFFLE_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Error al eliminar la rifa',
        code: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
      },
      { status: 500 }
    );
  }
}
