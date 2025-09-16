// src/app/api/tickets/my/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/authz';

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const asUserRaw = (searchParams.get('asUser') || '').trim();
    const statusFilter = (searchParams.get('status') || '').trim().toUpperCase(); // p.ej.: AVAILABLE | IN_RAFFLE | ...
    const onlyAvailable = /^(1|true|yes)$/i.test(searchParams.get('onlyAvailable') || '');
    const raffleIdFilter = (searchParams.get('raffleId') || '').trim();

    // Si NO sos superadmin y envías ?asUser= => 403
    if (asUserRaw && !isSuperAdmin(session)) {
      return NextResponse.json(
        { error: 'No autorizado para impersonar usuarios', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Si es SUPERADMIN y viene ?asUser, permitimos impersonar; si no, usamos el propio id
    const targetUserId = isSuperAdmin(session) && asUserRaw ? asUserRaw : session.user.id;

    // Construimos filtro dinámico
    const where = { userId: targetUserId };

    if (raffleIdFilter) {
      // Si viene raffleId, devolvemos sólo tickets asociados a esa rifa
      where.raffleId = raffleIdFilter;
    }

    if (statusFilter) {
      // Si el status es válido, filtramos por status exacto
      where.status = statusFilter;
    } else if (onlyAvailable) {
      // Si no se pidió status, pero sí onlyAvailable, filtramos AVAILABLE
      where.status = 'AVAILABLE';
    }

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id: true,
        uuid: true,
        code: true,
        status: true,
        raffleId: true,
        generatedAt: true,
        createdAt: true,
        isUsed: true,
        isWinner: true,
        raffle: {
          select: {
            id: true,
            title: true,
            status: true,
            endsAt: true,
            drawnAt: true,
            isPrivate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = tickets.map((t) => ({
      ...t,
      // Código amigable para la UI
      displayCode:
        t.code ||
        (t.uuid ? t.uuid.slice(-8).toUpperCase() : (t.id || '').slice(-6).toUpperCase()),
    }));

    return NextResponse.json({
      success: true,
      tickets: data,
      count: data.length,
      filters: {
        userId: targetUserId,
        status: statusFilter || (onlyAvailable ? 'AVAILABLE' : null),
        raffleId: raffleIdFilter || null,
      },
    });
  } catch (error) {
    console.error('[MY-TICKETS] error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
