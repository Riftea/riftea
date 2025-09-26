export const runtime = 'nodejs';
// src/app/api/admin/tickets/issue/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { emitirTicketParaUsuario, emitirNTicketsParaUsuario } from '@/server/tickets';

/* Helpers */
async function safeJson(req) { try { return await req.json(); } catch { return {}; } }
function toInt(n, def = 1) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : def;
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const role = String(session?.user?.role || '').toUpperCase();
    if (!session?.user?.id || role !== 'SUPERADMIN') {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 });
    }

    const body = await safeJson(req);
    const userId = String(body?.userId || '').trim();
    let cantidad = toInt(body?.cantidad, 1);
    if (cantidad < 1) cantidad = 1;
    if (cantidad > 100) cantidad = 100;

    const status = String(body?.status || 'AVAILABLE').toUpperCase();
    const validStatuses = ['AVAILABLE', 'ACTIVE', 'PENDING'];

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'userId es requerido' }, { status: 400 });
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) {
      return NextResponse.json({ ok: false, error: 'cantidad debe ser entero 1..100' }, { status: 400 });
    }
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ ok: false, error: 'status inválido' }, { status: 400 });
    }

    // Verificar usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Emitir tickets genéricos (sin asignar rifa ni purchase)
    const tickets = cantidad === 1
      ? [await emitirTicketParaUsuario(userId, status)]
      : await emitirNTicketsParaUsuario(userId, cantidad, status);

    // Notificación best-effort
    try {
      await prisma.notification.create({
        data: {
          userId,
          title: `Se te asignaron ${cantidad} ticket(s)`,
          message: `El superadmin emitió ${cantidad} ticket(s) a tu favor.`,
          type: 'SYSTEM_ALERT',
          ticketId: tickets?.[0]?.id ?? null,
        },
      });
    } catch (e) {
      console.warn('[ADMIN/TICKETS/ISSUE] notificación falló:', e);
    }

    return NextResponse.json({ ok: true, count: tickets.length, tickets });
  } catch (err) {
    console.error('[ADMIN/TICKETS/ISSUE] error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Método no permitido' }, { status: 405 });
}
