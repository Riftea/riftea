// app/api/raffles/[id]/draw/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

/* Helpers */
function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function toBytes(x) {
  return Buffer.isBuffer(x) ? x : Buffer.from(String(x));
}

/** Fisher–Yates determinístico con seed (HMAC-DRBG sobre SHA-256) */
function seededShuffle(array, seedBytes) {
  const arr = array.slice();
  let ctr = 0;
  const rand = () => {
    const h = crypto
      .createHmac('sha256', seedBytes)
      .update(Buffer.from(String(ctr++)))
      .digest();
    const n = h.readUIntBE(0, 6);         // 48 bits
    return n / 281474976710656;           // 2^48 → [0,1)
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** compone semilla con (raffleId, drawAt, ticketCodes, serverReveal) */
function composeSeed({ serverReveal, raffleId, drawAt, ticketCodes }) {
  const material = Buffer.concat([
    toBytes('RAFFLE-V1'),
    toBytes(raffleId),
    toBytes(drawAt?.toISOString?.() || ''),
    toBytes(ticketCodes.join('|')),
    toBytes(serverReveal),
  ]);
  return crypto.createHash('sha512').update(material).digest(); // 64 bytes
}

/* ============================
   GET → estado del sorteo
   ============================ */
export async function GET(_req, { params }) {
  try {
    const { id: raffleId } = await params;

    const [raffle, items] = await Promise.all([
      prisma.raffle.findUnique({
        where: { id: raffleId },
        select: {
          id: true,
          status: true,
          maxParticipants: true,
          drawAt: true,
          drawnAt: true,
          drawSeedHash: true,
          drawSeedReveal: true,
          winnerParticipationId: true,
        },
      }),
      prisma.participation.findMany({
        where: { raffleId },
        select: {
          id: true,
          ticketId: true,
          createdAt: true,
          isWinner: true,
          drawOrder: true,
          ticket: {
            select: {
              id: true,
              code: true,
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!raffle) {
      return NextResponse.json({ ok: false, error: 'Sorteo no encontrado' }, { status: 404 });
    }

    const participants = items.map((p) => ({
      id: p.id,
      ticketCode: p.ticket?.code || null,
      user: p.ticket?.user || null,
      isWinner: p.isWinner,
      drawOrder: p.drawOrder ?? null,
      createdAt: p.createdAt,
    }));

    return NextResponse.json(
      {
        ok: true,
        raffle: {
          id: raffle.id,
          status: raffle.status,
          maxParticipants: raffle.maxParticipants,
          drawAt: raffle.drawAt,
          drawnAt: raffle.drawnAt,
          drawSeedHash: raffle.drawSeedHash ? `sha256:${raffle.drawSeedHash}` : null,
          drawSeedReveal: raffle.drawSeedReveal || null,
          winnerParticipationId: raffle.winnerParticipationId || null,
        },
        participants,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('DRAW GET error:', e);
    return NextResponse.json({ ok: false, error: 'Error al cargar estado del sorteo' }, { status: 500 });
  }
}

/* ============================
   POST → programa o ejecuta el sorteo
   Acciones:
   - { action: "schedule", minutesFromNow?: number }
   - { action: "run" }
   ============================ */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id: raffleId } = await params;
    const body = await (async () => {
      try {
        return await req.json();
      } catch {
        return {};
      }
    })();
    const action = body?.action;

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        status: true,
        ownerId: true,
        maxParticipants: true,
        drawAt: true,
        drawnAt: true,
        drawSeedHash: true,
        drawSeedReveal: true,
      },
    });
    if (!raffle) {
      return NextResponse.json({ ok: false, error: 'Sorteo no encontrado' }, { status: 404 });
    }

    const roleStr = String(session.user?.role || '').toUpperCase();
    const isOwner = session.user.id === raffle.ownerId;
    const isAdmin = roleStr === 'ADMIN';
    const isSuper = roleStr === 'SUPERADMIN';
    if (!isOwner && !isAdmin && !isSuper) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 });
    }

    const [items, target] = await Promise.all([
      prisma.participation.findMany({
        where: { raffleId },
        select: {
          id: true,
          ticketId: true,
          createdAt: true,
          ticket: {
            select: {
              id: true,
              code: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      raffle.maxParticipants ?? null,
    ]);
    const total = items.length;

    // Estados no válidos para operar
    const forbidden = ['CANCELLED', 'FINISHED', 'COMPLETED'];
    if (forbidden.includes(raffle.status)) {
      return NextResponse.json(
        { ok: false, error: `Estado actual no permite operar (${raffle.status})` },
        { status: 400 }
      );
    }

    /* ====== 1) Programar ====== */
    if (action === 'schedule') {
      if (target && total < target) {
        return NextResponse.json(
          { ok: false, error: `Aún no se alcanzó la meta (${total}/${target}).` },
          { status: 400 }
        );
      }

      const minutes = Number.isFinite(+body?.minutesFromNow)
        ? Math.max(1, +body.minutesFromNow)
        : 3;
      const drawAt = new Date(Date.now() + minutes * 60 * 1000);

      // Compromiso (commit) si no existe
      let drawSeedReveal = raffle.drawSeedReveal;
      let drawSeedHash = raffle.drawSeedHash;
      if (!drawSeedReveal) {
        drawSeedReveal = crypto.randomBytes(32).toString('hex'); // secreto del servidor
        drawSeedHash = sha256hex(Buffer.from(drawSeedReveal, 'utf8'));
      }

      const updated = await prisma.raffle.update({
        where: { id: raffleId },
        data: {
          status: 'READY_TO_DRAW',  // ← pasamos a listo para sortear
          drawAt,
          drawSeedReveal,
          drawSeedHash,
        },
        select: { id: true, status: true, drawAt: true, drawSeedHash: true },
      });

      // Notificación (stub)
      try {
        const emails = Array.from(
          new Set(items.map((i) => i.ticket?.user?.email).filter(Boolean))
        );
        console.log(`[NOTIFY] Sorteo ${raffleId} en ${minutes} minutos. Emails:`, emails);
        // TODO: enviar emails / WS / push
      } catch (e) {
        console.warn('Notify failed (non-critical):', e);
      }

      return NextResponse.json(
        {
          ok: true,
          message: `Sorteo programado en ${minutes} minutos`,
          drawAt: updated.drawAt,
          status: updated.status,
          commitment: `sha256:${updated.drawSeedHash}`,
        },
        { status: 200 }
      );
    }

    /* ====== 2) Ejecutar sorteo ====== */
    if (action === 'run') {
      if (raffle.drawnAt) {
        return NextResponse.json({ ok: false, error: 'El sorteo ya fue ejecutado' }, { status: 400 });
      }
      if (!raffle.drawAt || new Date(raffle.drawAt) > new Date()) {
        return NextResponse.json({ ok: false, error: 'Aún no es el horario del sorteo' }, { status: 400 });
      }

      // Estado permitido: READY_TO_DRAW o ACTIVE (si cumplió condiciones)
      if (!['READY_TO_DRAW', 'ACTIVE'].includes(raffle.status)) {
        return NextResponse.json(
          { ok: false, error: `Estado inválido para ejecutar sorteo (${raffle.status})` },
          { status: 400 }
        );
      }

      if (!raffle.drawSeedReveal || !raffle.drawSeedHash) {
        return NextResponse.json({ ok: false, error: 'Compromiso ausente' }, { status: 400 });
      }
      const check = sha256hex(Buffer.from(raffle.drawSeedReveal, 'utf8'));
      if (check !== raffle.drawSeedHash) {
        return NextResponse.json({ ok: false, error: 'Compromiso inválido' }, { status: 400 });
      }
      if (target && total < target) {
        return NextResponse.json(
          { ok: false, error: `No se alcanzó la meta (${total}/${target}).` },
          { status: 400 }
        );
      }
      if (total < 2) {
        return NextResponse.json(
          { ok: false, error: 'Se requieren al menos 2 participaciones para sortear' },
          { status: 400 }
        );
      }

      // Snapshot de códigos (inmutable para seed)
      const ticketCodes = items.map((i) => i.ticket?.code || i.id);
      const seed = composeSeed({
        serverReveal: raffle.drawSeedReveal,
        raffleId,
        drawAt: raffle.drawAt,
        ticketCodes,
      });

      // Orden determinístico
      const ids = items.map((i) => i.id);
      const shuffled = seededShuffle(ids, seed);     // para animación de "eliminados"
      const rankingAsc = shuffled.slice().reverse(); // [ganador, 2°, 3°, ...]
      const winnerParticipationId = rankingAsc[0];

      // Transacción: marca ganador + setea drawnAt y winnerParticipationId
      const result = await prisma.$transaction(async (trx) => {
        // marcar ganador
        await trx.participation.update({
          where: { id: winnerParticipationId },
          data: { isWinner: true },
        });

        // intentá guardar drawOrder (si la columna existe). Si falla, se omite.
        try {
          for (let idx = 0; idx < rankingAsc.length; idx++) {
            const pId = rankingAsc[idx];
            await trx.participation.update({
              where: { id: pId },
              data: { drawOrder: idx + 1 },
            });
          }
        } catch (e) {
          // columna ausente o incompatible: ignorar silenciosamente
          console.warn('drawOrder not persisted (optional):', e?.code || e?.message || e);
        }

        // actualizar rifa → FINISHED (enum válido), winnerParticipationId y drawnAt
        return trx.raffle.update({
          where: { id: raffleId },
          data: {
            status: 'FINISHED',
            drawnAt: new Date(),
            winnerParticipationId,
          },
          select: { id: true, status: true, drawnAt: true, winnerParticipationId: true },
        });
      });

      // Notificar (stub)
      try {
        const winner = items.find((i) => i.id === winnerParticipationId);
        const winnerEmail = winner?.ticket?.user?.email;
        const emails = Array.from(new Set(items.map((i) => i.ticket?.user?.email).filter(Boolean)));
        console.log(
          `[NOTIFY] Ganador ${winnerParticipationId} → ${winnerEmail}. Notificando a ${emails.length} participantes.`
        );
        // TODO: enviar emails / WS / push
      } catch (e) {
        console.warn('Notify result failed (non-critical):', e);
      }

      return NextResponse.json(
        {
          ok: true,
          message: 'Sorteo ejecutado',
          raffle: result,
          commitment: `sha256:${raffle.drawSeedHash}`,
          reveal: raffle.drawSeedReveal,
          order: rankingAsc,       // [ganador, 2°, 3°, ...]
          eliminatedDesc: shuffled // [último eliminado → … → penúltimo → ganador]
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: false, error: 'Acción inválida' }, { status: 400 });
  } catch (e) {
    console.error('DRAW POST error:', e);
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}
