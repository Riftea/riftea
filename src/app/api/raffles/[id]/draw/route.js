export const runtime = 'nodejs';
// app/api/raffles/[id]/draw/route.js
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
function normRole(r) {
  return String(r || '').toUpperCase().replace(/[\s-]/g, '_');
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

/* =========================================================
   GET → estado del sorteo (con auto-ejecución en vivo)
   Si el sorteo está READY_TO_DRAW y sin ganador, al entrar
   se ejecuta inmediatamente y se persiste:
   - status = FINISHED
   - drawAt = ahora (momento real del sorteo)
   - drawnAt = ahora
   - winnerParticipationId
   ========================================================= */
export async function GET(_req, { params }) {
  try {
    const { id: raffleId } = await params;

    // 1) Traer la rifa
    let raffle = await prisma.raffle.findUnique({
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
    });

    if (!raffle) {
      return NextResponse.json({ ok: false, error: 'Sorteo no encontrado' }, { status: 404 });
    }

    // 2) Si está READY_TO_DRAW y aún no fue sorteado → ejecutar en vivo
    if (
      raffle.status === 'READY_TO_DRAW' &&
      !raffle.drawnAt &&
      !raffle.winnerParticipationId
    ) {
      // Cargar participaciones
      const items = await prisma.participation.findMany({
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
      });

      const total = items.length;

      // Regla conservadora (igual que POST:run): mínimo 2 participantes para sortear
      if (total >= 2) {
        // Autocommit si falta compromiso
        let reveal = raffle.drawSeedReveal;
        let hash = raffle.drawSeedHash;
        if (!reveal || !hash) {
          reveal = crypto.randomBytes(32).toString('hex');
          hash = sha256hex(Buffer.from(reveal, 'utf8'));
          await prisma.raffle.update({
            where: { id: raffleId },
            data: { drawSeedReveal: reveal, drawSeedHash: hash },
          });
        } else {
          // Validación de integridad del compromiso
          const check = sha256hex(Buffer.from(reveal, 'utf8'));
          if (check !== hash) {
            return NextResponse.json({ ok: false, error: 'Compromiso inválido' }, { status: 400 });
          }
        }

        // Usamos el instante real como drawAt para la semilla y persistencia
        const drawMoment = new Date();

        // Snapshot de códigos (inmutable para seed)
        const ticketCodes = items.map((i) => i.ticket?.code || i.id);
        const seed = composeSeed({
          serverReveal: reveal,
          raffleId,
          drawAt: drawMoment, // ahora se usa el momento real del sorteo
          ticketCodes,
        });

        // Orden determinístico
        const ids = items.map((i) => i.id);
        const shuffled = seededShuffle(ids, seed);     // para animación de "eliminados"
        const rankingAsc = shuffled.slice().reverse(); // [ganador, 2°, 3°, ...]
        const winnerParticipationId = rankingAsc[0];

        // Transacción: marcar ganador y cerrar rifa
        await prisma.$transaction(async (trx) => {
          // ganador
          await trx.participation.update({
            where: { id: winnerParticipationId },
            data: { isWinner: true },
          });

          // drawOrder (opcional)
          try {
            for (let idx = 0; idx < rankingAsc.length; idx++) {
              const pId = rankingAsc[idx];
              await trx.participation.update({
                where: { id: pId },
                data: { drawOrder: idx + 1 },
              });
            }
          } catch (e) {
            console.warn('drawOrder not persisted (optional):', e?.code || e?.message || e);
          }

          // actualizar rifa → FINISHED, y guardar fecha real del sorteo
          await trx.raffle.update({
            where: { id: raffleId },
            data: {
              status: 'FINISHED',
              drawAt: drawMoment,      // ⬅️ fecha real del sorteo
              drawnAt: drawMoment,     // (si mantenés ambos campos, quedan alineados)
              winnerParticipationId,
            },
          });
        });

        // Logging/notify (no crítico)
        try {
          const winner = items.find((i) => i.id === winnerParticipationId);
          const winnerEmail = winner?.ticket?.user?.email;
          const emails = Array.from(new Set(items.map((i) => i.ticket?.user?.email).filter(Boolean)));
          console.log(
            `[AUTO-DRAW] Raffle ${raffleId} ejecutado por vista. Ganador ${winnerParticipationId} → ${winnerEmail}. Notificando a ${emails.length} participantes.`
          );
        } catch (e) {
          console.warn('Notify (view) failed (non-critical):', e);
        }

        // refrescar datos de rifa ya cerrada
        raffle = await prisma.raffle.findUnique({
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
        });
      }
      // Si no hay 2 participantes, no se ejecuta; se devuelve estado actual.
    }

    // 3) Elegir orden de DB: si ya se sorteó → drawOrder; si no → createdAt
    const dbOrderBy = raffle.drawnAt
      ? [{ drawOrder: 'asc' }, { createdAt: 'asc' }]
      : [{ createdAt: 'asc' }];

    // 4) Cargar participaciones con ese orden
    let items = await prisma.participation.findMany({
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
      orderBy: dbOrderBy,
    });

    // 5) Seguridad adicional si ya fue sorteado → ordenar en memoria por drawOrder asc y backup createdAt
    if (raffle.drawnAt) {
      items = items.slice().sort((a, b) => {
        const da = a.drawOrder ?? Number.MAX_SAFE_INTEGER;
        const db = b.drawOrder ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
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
          drawAt: raffle.drawAt, // ⬅️ ahora es la fecha real del sorteo
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
   POST → programa / commit / ejecuta
   Acciones:
   - { action: "schedule", minutesFromNow?: number }
   - { action: "commit" }
   - { action: "run", autocommit?: boolean, notify?: boolean }
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

    const roleStr = normRole(session.user?.role);
    const isOwner = session.user.id === raffle.ownerId;
    const isAdmin = roleStr === 'ADMIN' || roleStr === 'SUPERADMIN' || roleStr === 'SUPER_ADMIN';
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 });
    }

    // Estados que no permiten operar
    const forbidden = ['CANCELLED', 'FINISHED', 'COMPLETED'];
    if (forbidden.includes(raffle.status)) {
      return NextResponse.json(
        { ok: false, error: `Estado actual no permite operar (${raffle.status})` },
        { status: 400 }
      );
    }

    // Cargar participaciones
    const items = await prisma.participation.findMany({
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
    });
    const total = items.length;

    /* ====== 1) Programar ====== */
    if (action === 'schedule') {
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
          status: 'READY_TO_DRAW',
          drawAt,             // aquí drawAt puede seguir usándose como "fecha programada"
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

    /* ====== 2) Commit explícito (genera hash si falta) ====== */
    if (action === 'commit') {
      if (!raffle.drawSeedReveal || !raffle.drawSeedHash) {
        const reveal = crypto.randomBytes(32).toString('hex');
        const hash = sha256hex(Buffer.from(reveal, 'utf8'));
        const updated = await prisma.raffle.update({
          where: { id: raffleId },
          data: { drawSeedReveal: reveal, drawSeedHash: hash },
          select: { drawSeedHash: true, drawSeedReveal: true },
        });
        return NextResponse.json(
          {
            ok: true,
            message: 'Compromiso creado',
            commitment: `sha256:${updated.drawSeedHash}`,
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        {
          ok: true,
          message: 'Compromiso existente',
          commitment: `sha256:${raffle.drawSeedHash}`,
        },
        { status: 200 }
      );
    }

    /* ====== 3) Ejecutar sorteo (manual/admin) ====== */
    if (action === 'run') {
      if (raffle.drawnAt) {
        return NextResponse.json({ ok: false, error: 'El sorteo ya fue ejecutado' }, { status: 400 });
      }
      if (total < 2) {
        return NextResponse.json(
          { ok: false, error: 'Se requieren al menos 2 participaciones para sortear' },
          { status: 400 }
        );
      }

      // Autocommit si falta
      let reveal = raffle.drawSeedReveal;
      let hash = raffle.drawSeedHash;
      if (!reveal || !hash) {
        if (body?.autocommit !== false) {
          reveal = crypto.randomBytes(32).toString('hex');
          hash = sha256hex(Buffer.from(reveal, 'utf8'));
          await prisma.raffle.update({
            where: { id: raffleId },
            data: { drawSeedReveal: reveal, drawSeedHash: hash },
          });
        } else {
          return NextResponse.json({ ok: false, error: 'Compromiso ausente' }, { status: 400 });
        }
      }

      // Validación de integridad del compromiso
      const check = sha256hex(Buffer.from(reveal, 'utf8'));
      if (check !== hash) {
        return NextResponse.json({ ok: false, error: 'Compromiso inválido' }, { status: 400 });
      }

      // Usar momento real del sorteo para el commit (y semilla)
      const drawMoment = new Date();

      // Snapshot de códigos (inmutable para seed)
      const ticketCodes = items.map((i) => i.ticket?.code || i.id);
      const seed = composeSeed({
        serverReveal: reveal,
        raffleId,
        drawAt: drawMoment, // ⬅️ usar fecha real del sorteo
        ticketCodes,
      });

      // Orden determinístico
      const ids = items.map((i) => i.id);
      const shuffled = seededShuffle(ids, seed);
      const rankingAsc = shuffled.slice().reverse(); // [ganador, 2°, 3°, ...]
      const winnerParticipationId = rankingAsc[0];

      // Transacción: marca ganador + FINISHED + winnerParticipationId + drawnAt & drawAt
      const result = await prisma.$transaction(async (trx) => {
        // marcar ganador
        await trx.participation.update({
          where: { id: winnerParticipationId },
          data: { isWinner: true },
        });

        // drawOrder opcional
        try {
          for (let idx = 0; idx < rankingAsc.length; idx++) {
            const pId = rankingAsc[idx];
            await trx.participation.update({
              where: { id: pId },
              data: { drawOrder: idx + 1 },
            });
          }
        } catch (e) {
          console.warn('drawOrder not persisted (optional):', e?.code || e?.message || e);
        }

        // actualizar rifa → FINISHED y guardar fecha real del sorteo
        return trx.raffle.update({
          where: { id: raffleId },
          data: {
            status: 'FINISHED',
            drawAt: drawMoment,     // ⬅️ fecha real del sorteo
            drawnAt: drawMoment,    // si conservás ambos campos
            winnerParticipationId,
          },
          select: { id: true, status: true, drawAt: true, drawnAt: true, winnerParticipationId: true },
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
          commitment: `sha256:${hash}`,
          reveal,
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
