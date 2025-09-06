// app/api/tickets/my/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    // Solo AVAILABLE para el modal
    const tickets = await prisma.ticket.findMany({
      where: { userId: session.user.id, status: 'AVAILABLE' },
      select: {
        id: true,
        uuid: true,
        code: true,
        status: true,
        raffleId: true,
        generatedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Para el modal: mostramos un “displayCode” amigable
    const data = tickets.map(t => ({
      ...t,
      displayCode: t.code || (t.uuid ? t.uuid.slice(-8).toUpperCase() : t.id.slice(-6).toUpperCase()),
    }));

    return NextResponse.json({ success: true, tickets: data, count: data.length });
  } catch (error) {
    console.error('[MY-TICKETS] error:', error);
    return NextResponse.json({ error: 'Error interno del servidor', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
