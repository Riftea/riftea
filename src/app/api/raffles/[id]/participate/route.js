// app/api/raffles/[id]/participate/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { TicketsService } from '@/services/tickets.service';

export async function POST(req, { params }) {
  try {
    const raffleId = params.id;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    let { ticketId, ticketCode } = body || {};

    if (!ticketId && ticketCode) {
      const t = await prisma.ticket.findUnique({
        where: { code: String(ticketCode).trim() },
        select: { id: true },
      });
      if (!t) return NextResponse.json({ ok: false, error: 'Ticket no encontrado' }, { status: 404 });
      ticketId = t.id;
    }

    if (typeof ticketId !== 'string' || ticketId.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'ticketId es requerido' }, { status: 400 });
    }

    const participation = await TicketsService.applyTicketToRaffle(ticketId.trim(), raffleId, session.user.id);

    return NextResponse.json({
      ok: true,
      success: true,
      message: 'Participación exitosa en el sorteo',
      participation: {
        id: participation.id,
        ticketCode: participation.ticket?.code,
        participatedAt: participation.createdAt,
        raffleId: participation.raffleId,
      },
    }, { status: 201 });

  } catch (error) {
    const msg = (error?.message || '').toLowerCase();

    if (msg.includes('no encontrad')) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    if (
      msg.includes('ya está participando') ||
      msg.includes('no disponible') ||
      msg.includes('termin') ||
      msg.includes('límite') ||
      msg.includes('propietario') ||
      msg.includes('hash') || msg.includes('firma') || msg.includes('hmac') || msg.includes('inválido')
    ) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    console.error('participate error:', error);
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function GET(_req, { params }) {
  try {
    const raffleId = params.id;
    const items = await prisma.participation.findMany({
      where: { raffleId },
      include: {
        user: { select: { id: true, name: true, image: true } },
        ticket: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      ok: true,
      success: true,
      participants: items.map(p => ({
        id: p.id,
        user: p.user,
        ticket: p.ticket,
        ticketCode: p.ticket?.code,
        participatedAt: p.createdAt,
        isWinner: p.isWinner || false,
        name: p.user?.name,
      })),
    });
  } catch (e) {
    console.error('GET participants error:', e);
    return NextResponse.json({ ok: false, error: 'Error al cargar participantes' }, { status: 500 });
  }
}
