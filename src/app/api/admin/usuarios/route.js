// src/app/api/admin/usuarios/route.js (YA EXISTE - SOLO ACTUALIZAR)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route.js';
import prisma from '../../../../lib/prisma.js';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'No tienes permisos para acceder a esta función' },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        name: 'asc'
      }
    });

    return NextResponse.json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// src/app/api/admin/generar-tickets/route.js (YA EXISTE - SOLO ACTUALIZAR)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]/route.js';
import prisma from '../../../../../lib/prisma.js';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'No tienes permisos para generar tickets' },
        { status: 403 }
      );
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId es requerido' },
        { status: 400 }
      );
    }

    // Verificar que el usuario existe
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Generar ticket
    const ticketUuid = crypto.randomUUID();
    const ticketCode = `TK-${Date.now().toString(36).toUpperCase()}`;
    const hash = crypto.createHash('sha256')
      .update(`${userId}-${ticketUuid}`)
      .digest('hex');

    const ticket = await prisma.ticket.create({
      data: {
        uuid: ticketUuid,
        code: ticketCode,
        hash: hash,
        userId: userId,
        status: 'AVAILABLE',
        metodoPago: 'MANUAL_ADMIN',
        displayCode: ticketCode,
        generatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Crear notificación para el usuario
    await prisma.notification.create({
      data: {
        userId: userId,
        type: 'SYSTEM_ALERT',
        title: 'Nuevo Ticket Generado',
        message: `Se te ha asignado un nuevo ticket: ${ticketCode}`,
        ticketId: ticket.id
      }
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        action: 'generate_ticket_admin',
        userId: session.user.id,
        targetType: 'ticket',
        targetId: ticket.id,
        newValues: {
          ticketId: ticket.id,
          targetUserId: userId,
          code: ticketCode
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Ticket generado exitosamente',
      ticket
    });

  } catch (error) {
    console.error('Error generating ticket:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// src/app/api/tickets/my-tickets/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route.js';
import prisma from '../../../../lib/prisma.js';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // Construir filtros
    const where = {
      userId: session.user.id
    };

    if (status && status !== 'all') {
      where.status = status;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        raffle: {
          select: {
            id: true,
            title: true,
            status: true
          }
        },
        participations: {
          include: {
            raffle: {
              select: {
                id: true,
                title: true,
                status: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({
      success: true,
      tickets
    });

  } catch (error) {
    console.error('Error fetching user tickets:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}