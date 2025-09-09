// app/api/raffles/public/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TICKET_PRICE } from "@/lib/ticket.server";

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // filtros y orden
    const q = (searchParams.get('q') || '').trim();
    const sortBy = (searchParams.get('sortBy') || 'createdAt').toLowerCase();
    const order = (searchParams.get('order') || 'desc').toLowerCase(); // 'asc'|'desc'
    const page = toInt(searchParams.get('page'), 1);
    const perPage = Math.min(toInt(searchParams.get('perPage'), 12), 50);

    const where = {
      isPrivate: false,
      status: { in: ['PUBLISHED', 'ACTIVE'] },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Orden soportado en DB
    let orderBy = [{ createdAt: order }];
    if (sortBy === 'participants' || sortBy === 'participations') {
      orderBy = [{ participations: { _count: order } }, { createdAt: 'desc' }];
    } else if (sortBy === 'createdat') {
      orderBy = [{ createdAt: order }];
    }
    // Nota: ordenar por "timeLeft" se hará en el cliente (es calculado)

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
          owner: {
            select: { name: true, image: true },
          },
          _count: {
            select: { participations: true, tickets: true },
          },
        },
      }),
    ]);

    // Attach precio derivado del server
    const items = rows.map((r) => ({
      ...r,
      unitPrice: RAFFLES_TICKET_PRICE,
    }));

    return NextResponse.json({
      success: true,
      page,
      perPage,
      total,
      items,
      meta: { ticketPrice: RAFFLES_TICKET_PRICE },
    });
  } catch (err) {
    console.error('GET /api/raffles/public error:', err);
    return NextResponse.json(
      { success: false, error: 'Error al listar sorteos públicos' },
      { status: 500 }
    );
  }
}
