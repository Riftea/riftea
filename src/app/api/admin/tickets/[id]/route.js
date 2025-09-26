export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/authz';

export async function DELETE(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSuperAdmin(session)) {
      return NextResponse.json({ error: 'Solo SUPERADMIN puede eliminar tickets' }, { status: 403 });
    }

    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const t = await prisma.ticket.findUnique({
      where: { id },
      select: { id: true, raffleId: true, isUsed: true, status: true, participation: { select: { id: true } } },
    });
    if (!t) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });

    // reglas de seguridad para eliminación
    if (t.raffleId) {
      return NextResponse.json({ error: 'No se puede eliminar: el ticket está asociado a un sorteo' }, { status: 400 });
    }
    if (t.participation) {
      return NextResponse.json({ error: 'No se puede eliminar: el ticket tiene participación registrada' }, { status: 400 });
    }
    if (t.isUsed) {
      return NextResponse.json({ error: 'No se puede eliminar: el ticket ya está usado' }, { status: 400 });
    }

    // Soft delete (más seguro). Si querés delete físico, reemplaza por prisma.ticket.delete({ where: { id } })
    await prisma.ticket.update({
      where: { id },
      data: { status: 'DELETED', isUsed: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[ADMIN/TICKETS] DELETE error:', err);
    return NextResponse.json({ error: 'Error al eliminar ticket' }, { status: 500 });
  }
}
