// app/api/raffles/route.js - VERSIÓN COMPLETA CON POST SIMPLIFICADO
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

function normalizeRole(session) {
  const r = session?.user?.role;
  return typeof r === 'string' ? r.toUpperCase() : '';
}

// Función helper para validar fechas
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

    console.log("session POST:", !!session, session?.user?.email);

    // 2. Obtener el USER ID desde la base de datos
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true, image: true }
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
      title,
      description,
      ticketPrice,
      prizeValue,
      endsAt,
      maxTickets,
      imageUrl,
      startsAt
    } = body;

    // 4. VALIDACIÓN UNIFICADA DE PRECIO - Solo acepta ticketPrice (Number)
    let price = Number.isFinite(body.ticketPrice) ? Math.trunc(body.ticketPrice) : NaN;

    // Fallback temporal para compatibilidad con ticketPriceInput (legacy)
    if (!Number.isFinite(price) && body.ticketPriceInput) {
      console.warn("⚠️ Usando ticketPriceInput legacy, migrar a ticketPrice");
      const raw = String(body.ticketPriceInput || "").replace(/[^\d]/g, "");
      price = raw ? parseInt(raw, 10) : NaN;
    }

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ 
        error: 'El precio del ticket debe ser un número mayor a 0',
        code: 'VALIDATION_ERROR' 
      }, { status: 400 });
    }

    // 5. VALIDACIÓN DE PREMIO (opcional, pero si viene debe ser válido)
    let prizeValueInt = null;
    if (body.prizeValue !== undefined && body.prizeValue !== null) {
      prizeValueInt = Number.isFinite(body.prizeValue) ? Math.trunc(body.prizeValue) : NaN;
      
      // Fallback temporal para prizeValueInput (legacy)
      if (!Number.isFinite(prizeValueInt) && body.prizeValueInput) {
        console.warn("⚠️ Usando prizeValueInput legacy, migrar a prizeValue");
        const raw = String(body.prizeValueInput || "").replace(/[^\d]/g, "");
        prizeValueInt = raw ? parseInt(raw, 10) : NaN;
      }
      
      if (!Number.isFinite(prizeValueInt) || prizeValueInt <= 0) {
        return NextResponse.json({ 
          error: 'El valor del premio debe ser un número mayor a 0',
          code: 'VALIDATION_ERROR' 
        }, { status: 400 });
      }
    }

    // 6. Validaciones básicas
    if (!title?.trim()) {
      return NextResponse.json({ 
        error: 'El título es requerido',
        code: 'VALIDATION_ERROR' 
      }, { status: 400 });
    }

    if (!description?.trim()) {
      return NextResponse.json({ 
        error: 'La descripción no puede estar vacía',
        code: 'VALIDATION_ERROR' 
      }, { status: 400 });
    }

    // 7. VALIDACIÓN DE COHERENCIA PREMIO/MAXTICKETS (sin helpers externos)
    const maxTicketsInt = maxTickets ? parseInt(maxTickets, 10) : null;
    if (maxTicketsInt && maxTicketsInt <= 0) {
      return NextResponse.json({ 
        error: 'El máximo de tickets debe ser un número entero mayor a 0',
        code: 'VALIDATION_ERROR' 
      }, { status: 400 });
    }

    if (prizeValueInt && maxTicketsInt && price) {
      const participantsNeeded = Math.ceil(prizeValueInt / price);
      if (maxTicketsInt < participantsNeeded) {
        return NextResponse.json({ 
          error: `El máximo de tickets (${maxTicketsInt}) es insuficiente para cubrir el premio. Se necesitan al menos ${participantsNeeded} participantes.`,
          code: 'VALIDATION_ERROR' 
        }, { status: 400 });
      }
    }

    // 8. VALIDAR FECHAS - Ahora son opcionales
    let processedStartDate = null;
    let processedEndDate = null;
    
    if (startsAt || endsAt) {
      const dateValidation = validateDates(startsAt, endsAt);
      if (!dateValidation.valid) {
        return NextResponse.json({ 
          error: dateValidation.error,
          code: 'VALIDATION_ERROR' 
        }, { status: 400 });
      }
      processedStartDate = dateValidation.startDate;
      processedEndDate = dateValidation.endDate;
    }

    // 9. CREAR LA RIFA - CON VALORES NORMALIZADOS
    let raffle;
    
    try {
      const raffleData = {
        title: title.trim(),
        description: description.trim(),
        ticketPrice: price, // Siempre entero, en ARS
        endsAt: processedEndDate,
        status: 'DRAFT',
        maxTickets: maxTicketsInt,
        imageUrl: imageUrl?.trim() || null,
        startsAt: processedStartDate,
        publishedAt: null,
        ownerImage: dbUser.image || session.user.image || null,
        owner: {
          connect: { id: dbUser.id }
        }
      };

      // Solo agregar prizeValue si está definido
      if (prizeValueInt) {
        raffleData.prizeValue = prizeValueInt;
      }

      raffle = await prisma.raffle.create({
        data: raffleData,
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true
            }
          },
          _count: {
            select: {
              tickets: true,
              participations: true
            }
          }
        }
      });

      console.log("✅ Rifa creada exitosamente:", {
        id: raffle.id,
        ticketPrice: raffle.ticketPrice,
        prizeValue: raffle.prizeValue || 'no definido'
      });

    } catch (createError) {
      console.error('Error en creación de rifa:', createError);
      throw createError;
    }

    // 10. Crear log de auditoría
    try {
      await prisma.auditLog.create({
        data: {
          action: 'create_raffle',
          userId: dbUser.id,
          targetType: 'raffle',
          targetId: raffle.id,
          newValues: {
            title: raffle.title,
            ticketPrice: raffle.ticketPrice,
            prizeValue: raffle.prizeValue,
            maxTickets: raffle.maxTickets,
            status: raffle.status
          }
        }
      });
    } catch (e) {
      console.warn('auditLog create failed (ignored):', e?.message || e);
    }

    // 11. Crear notificación para el owner
    try {
      await prisma.notification.create({
        data: {
          userId: dbUser.id,
          type: 'RAFFLE_CREATED',
          title: 'Rifa creada exitosamente',
          message: `Tu rifa "${raffle.title}" ha sido creada. Ahora puedes publicarla para que otros puedan comprar tickets.`,
          raffleId: raffle.id
        }
      });
    } catch (e) {
      console.warn('notification create failed (ignored):', e?.message || e);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Rifa creada exitosamente', 
      raffle,
      code: 'RAFFLE_CREATED'
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating raffle:', error);

    // Manejo específico de errores de Prisma
    if (error?.code === 'P2002') {
      return NextResponse.json({ 
        error: 'Ya existe una rifa con datos similares',
        code: 'DUPLICATE_ERROR' 
      }, { status: 409 });
    }
    if (error?.code === 'P2003') {
      return NextResponse.json({ 
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND' 
      }, { status: 400 });
    }
    if (error?.code === 'P2025') {
      return NextResponse.json({ 
        error: 'Registro no encontrado',
        code: 'RECORD_NOT_FOUND' 
      }, { status: 404 });
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
    const status = searchParams.get('status');
    const ownerId = searchParams.get('ownerId');
    const search = searchParams.get('search');
    const mine = searchParams.get('mine');

    const skip = Math.max(0, (Math.max(1, page) - 1) * limit);

    // Construir filtros
    const where = {};

    // Si se pide "mine=1", obtener sorteos del usuario actual
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

      where.ownerId = dbUser.id;
    } else if (ownerId) {
      where.ownerId = ownerId;
    } else {
      // Si no se especifica ownerId ni mine, solo mostrar rifas públicas
      if (!status) {
        where.status = { in: ['PUBLISHED', 'ACTIVE', 'FINISHED'] };
      }
    }

    if (status && ['DRAFT', 'PUBLISHED', 'ACTIVE', 'FINISHED', 'CANCELLED'].includes(status)) {
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
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true
            }
          },
          winner: {
            select: {
              id: true,
              name: true,
              image: true
            }
          },
          _count: {
            select: {
              tickets: true,
              participations: true
            }
          }
        }
      }),
      prisma.raffle.count({ where })
    ]);

    const rafflesWithStats = raffles.map(raffle => ({
      ...raffle,
      stats: {
        totalTickets: raffle._count?.tickets ?? 0,
        totalParticipations: raffle._count?.participations ?? 0,
        ticketsSold: raffle._count?.tickets ?? 0,
        maxTicketsReached: raffle.maxTickets ? (raffle._count?.tickets ?? 0) >= raffle.maxTickets : false,
        daysLeft: raffle.endsAt ? Math.max(0, Math.ceil((new Date(raffle.endsAt) - new Date()) / (1000 * 60 * 60 * 24))) : null,
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
      filters: {
        status,
        ownerId,
        search
      },
      code: 'RAFFLES_FETCHED'
    });

  } catch (error) {
    console.error('Error fetching raffles:', error);
    return NextResponse.json({
      error: 'Error al obtener las rifas',
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
    const { id, action, ...updateData } = body;

    if (!id?.trim()) {
      return NextResponse.json({ 
        error: 'ID de rifa requerido',
        code: 'VALIDATION_ERROR' 
      }, { status: 400 });
    }

    const existingRaffle = await prisma.raffle.findUnique({
      where: { id: id.trim() },
      include: { owner: true }
    });

    if (!existingRaffle) {
      return NextResponse.json({ 
        error: 'Rifa no encontrada',
        code: 'RAFFLE_NOT_FOUND' 
      }, { status: 404 });
    }

    const role = dbUser.role?.toUpperCase();
    const isOwner = existingRaffle.ownerId === dbUser.id;
    if (!isOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json({ 
        error: 'No tienes permisos para modificar esta rifa',
        code: 'FORBIDDEN' 
      }, { status: 403 });
    }

    let updateObject = {};

    switch (action) {
      case 'publish':
        if (existingRaffle.status !== 'DRAFT') {
          return NextResponse.json({ 
            error: 'Solo se pueden publicar rifas en estado borrador',
            code: 'INVALID_STATUS' 
          }, { status: 400 });
        }
        updateObject = { status: 'PUBLISHED', publishedAt: new Date() };
        break;
        
      case 'activate':
        if (!['PUBLISHED', 'DRAFT'].includes(existingRaffle.status)) {
          return NextResponse.json({ 
            error: 'Solo se pueden activar rifas publicadas o en borrador',
            code: 'INVALID_STATUS' 
          }, { status: 400 });
        }
        updateObject = { 
          status: 'ACTIVE', 
          startsAt: updateData.startsAt ? new Date(updateData.startsAt) : new Date(),
          publishedAt: existingRaffle.publishedAt || new Date()
        };
        break;
        
      case 'finish':
        if (existingRaffle.status !== 'ACTIVE') {
          return NextResponse.json({ 
            error: 'Solo se pueden finalizar rifas activas',
            code: 'INVALID_STATUS' 
          }, { status: 400 });
        }
        updateObject = { status: 'FINISHED', drawnAt: new Date() };
        break;
        
      case 'cancel':
        if (['FINISHED', 'CANCELLED'].includes(existingRaffle.status)) {
          return NextResponse.json({ 
            error: 'No se puede cancelar una rifa ya finalizada o cancelada',
            code: 'INVALID_STATUS' 
          }, { status: 400 });
        }
        updateObject = { status: 'CANCELLED' };
        break;
        
      default:
        // Actualización general de campos con validación simplificada
        if (updateData.title !== undefined) {
          const titleTrimmed = String(updateData.title).trim();
          if (!titleTrimmed) {
            return NextResponse.json({ 
              error: 'El título no puede estar vacío',
              code: 'VALIDATION_ERROR' 
            }, { status: 400 });
          }
          updateObject.title = titleTrimmed;
        }
        
        if (updateData.description !== undefined) {
          const descTrimmed = String(updateData.description).trim();
          if (!descTrimmed) {
            return NextResponse.json({ 
              error: 'La descripción no puede estar vacía',
              code: 'VALIDATION_ERROR' 
            }, { status: 400 });
          }
          updateObject.description = descTrimmed;
        }
        
        // VALIDAR PRECIO CON LÓGICA SIMPLIFICADA (como en POST)
        if (updateData.ticketPrice !== undefined) {
          const tp = Number.isFinite(updateData.ticketPrice) ? Math.trunc(updateData.ticketPrice) : NaN;
          if (!Number.isFinite(tp) || tp <= 0) {
            return NextResponse.json({ 
              error: 'El precio del ticket debe ser un número mayor a 0',
              code: 'VALIDATION_ERROR' 
            }, { status: 400 });
          }
          updateObject.ticketPrice = tp;
        }

        // VALIDAR PREMIO CON LÓGICA SIMPLIFICADA
        if (updateData.prizeValue !== undefined) {
          let newPrizeValue = null;
          if (updateData.prizeValue !== null) {
            newPrizeValue = Number.isFinite(updateData.prizeValue) ? Math.trunc(updateData.prizeValue) : NaN;
            if (!Number.isFinite(newPrizeValue) || newPrizeValue <= 0) {
              return NextResponse.json({ 
                error: 'El valor del premio debe ser un número mayor a 0',
                code: 'VALIDATION_ERROR' 
              }, { status: 400 });
            }
          }
          updateObject.prizeValue = newPrizeValue;
        }
        
        if (updateData.maxTickets !== undefined) {
          updateObject.maxTickets = updateData.maxTickets ? parseInt(updateData.maxTickets, 10) : null;
        }
        
        if (updateData.imageUrl !== undefined) {
          updateObject.imageUrl = updateData.imageUrl ? String(updateData.imageUrl).trim() : null;
        }
        
        // Validar fechas si se están actualizando
        if (updateData.endsAt !== undefined || updateData.startsAt !== undefined) {
          const newStartsAt = updateData.startsAt !== undefined ? updateData.startsAt : existingRaffle.startsAt;
          const newEndsAt = updateData.endsAt !== undefined ? updateData.endsAt : existingRaffle.endsAt;
          
          const dateValidation = validateDates(newStartsAt, newEndsAt);
          if (!dateValidation.valid) {
            return NextResponse.json({ 
              error: dateValidation.error,
              code: 'VALIDATION_ERROR' 
            }, { status: 400 });
          }
          
          if (updateData.endsAt !== undefined) updateObject.endsAt = dateValidation.endDate;
          if (updateData.startsAt !== undefined) updateObject.startsAt = dateValidation.startDate;
        }
        break;
    }

    if (Object.keys(updateObject).length === 0) {
      return NextResponse.json({ 
        error: 'Nada para actualizar',
        code: 'NO_CHANGES' 
      }, { status: 400 });
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

    // Crear log de auditoría
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
            ticketPrice: existingRaffle.ticketPrice,
            prizeValue: existingRaffle.prizeValue
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
      return NextResponse.json({ 
        error: 'Rifa no encontrada',
        code: 'RAFFLE_NOT_FOUND' 
      }, { status: 404 });
    }
    
    return NextResponse.json({
      error: 'Error al actualizar la rifa',
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
        error: 'ID de rifa requerido',
        code: 'VALIDATION_ERROR' 
      }, { status: 400 });
    }

    const existingRaffle = await prisma.raffle.findUnique({
      where: { id: id.trim() },
      include: {
        _count: { select: { tickets: true } }
      }
    });

    if (!existingRaffle) {
      return NextResponse.json({ 
        error: 'Rifa no encontrada',
        code: 'RAFFLE_NOT_FOUND' 
      }, { status: 404 });
    }

    const role = dbUser.role?.toUpperCase();
    const isOwner = existingRaffle.ownerId === dbUser.id;
    if (!isOwner && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return NextResponse.json({ 
        error: 'No tienes permisos para eliminar esta rifa',
        code: 'FORBIDDEN' 
      }, { status: 403 });
    }

    if ((existingRaffle._count?.tickets ?? 0) > 0) {
      return NextResponse.json({ 
        error: 'No se puede eliminar una rifa que ya tiene tickets vendidos',
        code: 'HAS_TICKETS' 
      }, { status: 400 });
    }

    await prisma.raffle.delete({ where: { id: id.trim() } });

    // Crear log de auditoría
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
            ticketPrice: existingRaffle.ticketPrice,
            prizeValue: existingRaffle.prizeValue
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
      return NextResponse.json({ 
        error: 'Rifa no encontrada',
        code: 'RAFFLE_NOT_FOUND' 
      }, { status: 404 });
    }
    
    return NextResponse.json({
      error: 'Error al eliminar la rifa',
      code: 'DELETE_ERROR',
      details: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    }, { status: 500 });
  }
}