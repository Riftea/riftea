// app/api/raffles/public/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TICKET_PRICE } from '@/lib/ticket.server';

function toPosInt(v, def) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // filtros y orden
    const qRaw = (searchParams.get('q') || '').trim();
    const sortByRaw = (searchParams.get('sortBy') || 'createdAt').toLowerCase();
    const orderRaw = (searchParams.get('order') || 'desc').toLowerCase();

    // Sanitizar order y sortBy
    const order = orderRaw === 'asc' ? 'asc' : 'desc';
    const sortBy = ['createdat', 'created_at', 'createdAt', 'participants', 'participations'].includes(sortByRaw)
      ? sortByRaw
      : 'createdAt';

    const page = Math.max(1, toPosInt(searchParams.get('page'), 1));
    const perPage = Math.min(toPosInt(searchParams.get('perPage'), 12), 50);

    // Catálogo público: solo listados públicos + estados visibles
    const where = {
      isPrivate: false,
      status: { in: ['PUBLISHED', 'ACTIVE', 'READY_TO_DRAW', 'FINISHED'] },
      ...(qRaw
        ? {
            OR: [
              { title: { contains: qRaw, mode: 'insensitive' } },
              { description: { contains: qRaw, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Orden soportado en DB
    /** @type {any[]} */
    let orderBy = [{ createdAt: order }];
    if (sortBy === 'participants' || sortBy === 'participations') {
      // Ordena por cantidad de participaciones y, como desempate, por fecha de creación desc
      orderBy = [{ participations: { _count: order } }, { createdAt: 'desc' }];
    } else if (sortBy === 'createdat' || sortBy === 'created_at' || sortBy === 'createdAt') {
      orderBy = [{ createdAt: order }];
    }

    const skip = (page - 1) * perPage;
    const take = perPage;

    const [total, rows] = await Promise.all([
      prisma.raffle.count({ where }),
      prisma.raffle.findMany({
        where,
        orderBy,
        skip,
        take,
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
          ownerId: true,
          isPrivate: true,
          owner: { select: { name: true, image: true } },
          _count: { select: { participations: true, tickets: true } },
        },
      }),
    ]);

    // Adjuntar precio derivado del server (constante)
    const items = rows.map((r) => ({
      ...r,
      unitPrice: TICKET_PRICE,
    }));

    return NextResponse.json({
      success: true,
      page,
      perPage,
      total,
      items,
      meta: { ticketPrice: TICKET_PRICE, sortBy, order },
    });
  } catch (err) {
    console.error('GET /api/raffles/public error:', err);
    return NextResponse.json(
      { success: false, error: 'Error al listar sorteos públicos' },
      { status: 500 }
    );
  }
}
