import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

function isAdminLike(role) {
  const r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPERADMIN';
}

export async function POST(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const raffleId = params?.id;
    if (!raffleId) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Verificar que la rifa exista
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { id: true, ownerId: true, isPrivate: true, status: true },
    });
    if (!raffle) {
      return NextResponse.json({ error: 'Rifa no encontrada' }, { status: 404 });
    }

    // Gate de visibilidad: si es privada y no sos owner ni admin/superadmin => 404
    const isOwner = raffle.ownerId === session.user.id;
    const canBypass = isOwner || isAdminLike(session.user?.role);
    if (raffle.isPrivate && !canBypass) {
      return NextResponse.json({ error: 'Rifa no encontrada' }, { status: 404 });
    }

    // Crear favorito (único por user/raffle)
    await prisma.favorite.upsert({
      where: {
        favorite_user_raffle_unique: {
          userId: session.user.id,
          raffleId,
        },
      },
      create: { userId: session.user.id, raffleId },
      update: {}, // si ya existe, no hace nada
    });

    // Datos para la UI
    const [favoritesCount] = await Promise.all([
      prisma.favorite.count({ where: { raffleId } }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        isFavorite: true,
        favoritesCount,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('POST /api/raffles/[id]/favorite error:', err);
    return NextResponse.json({ error: 'Error al crear favorito' }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const raffleId = params?.id;
    if (!raffleId) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Intentar borrar el favorito (si no existe, lo tratamos como ya eliminado)
    try {
      await prisma.favorite.delete({
        where: {
          favorite_user_raffle_unique: {
            userId: session.user.id,
            raffleId,
          },
        },
      });
    } catch (err) {
      if (err?.code !== 'P2025') {
        throw err; // si es otro error, lo propagamos
      }
    }

    const [favoritesCount] = await Promise.all([
      prisma.favorite.count({ where: { raffleId } }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        isFavorite: false,
        favoritesCount,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('DELETE /api/raffles/[id]/favorite error:', err);
    return NextResponse.json({ error: 'Error al eliminar favorito' }, { status: 500 });
  }
}
