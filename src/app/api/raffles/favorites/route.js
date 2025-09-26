export const runtime = 'nodejs';
// src/app/api/raffles/favorites/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/authz';

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mine = searchParams.get('mine');
    if (mine !== '1') {
      return NextResponse.json({ error: 'Parámetro no soportado' }, { status: 400 });
    }

    // Impersonación: permitir ?asUser=<userId> solo si SUPERADMIN
    const asUser = (searchParams.get('asUser') || '').trim();
    const targetUserId =
      isSuperAdmin(session) && asUser ? asUser : session.user.id;

    const favorites = await prisma.favorite.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        raffle: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            status: true,
            prizeTitle: true,
            prizeValue: true,
            isPrivate: true,
            ownerId: true,
            createdAt: true,
          },
        },
      },
    });

    const raffles = favorites.map((f) => ({
      favoriteId: f.id,
      favoritedAt: f.createdAt,
      ...f.raffle,
      isFavorite: true,
    }));

    return NextResponse.json({ ok: true, raffles }, { status: 200 });
  } catch (err) {
    console.error('GET /api/raffles/favorites error', err);
    return NextResponse.json({ error: 'Error al listar favoritos' }, { status: 500 });
  }
}

