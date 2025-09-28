export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

function toInt(v, def = 0) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : def;
}

function sanitizeText(s, max = 2000) {
  return String(s ?? '').trim().slice(0, max);
}

// POST /api/products → crear producto digital
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id || null;
    if (!userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = sanitizeText(body.type, 32);
    const title = sanitizeText(body.title, 160);
    const description = sanitizeText(body.description, 4000);
    const priceCents = toInt(body.priceCents);
    const currency = sanitizeText(body.currency || 'ARS', 8) || 'ARS';
    const filePath = sanitizeText(body.filePath, 512) || null;
    const bonusFilePath = sanitizeText(body.bonusFilePath, 512) || null;
    const isActive = Boolean(body.isActive ?? true);

    if (!type || !title || !Number.isFinite(priceCents) || priceCents < 0) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const created = await prisma.product.create({
      data: {
        type,
        title,
        description: description || null,
        priceCents,
        currency,
        filePath,
        bonusFilePath,
        isActive,
        sellerId: userId, // solo si existe en tu schema
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    console.error('POST /api/products error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// GET /api/products → listar productos del usuario
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id || null;
    if (!userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const where = { sellerId: userId };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          priceCents: true,
          currency: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return NextResponse.json({
      items,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    });
  } catch (err) {
    console.error('GET /api/products error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
