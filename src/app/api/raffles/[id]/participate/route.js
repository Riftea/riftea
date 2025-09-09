// src/app/api/raffles/[id]/participate/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { TicketsService } from '@/services/tickets.service';
import crypto from 'crypto';

/* -------------------- Helpers seguros -------------------- */
async function safeJson(req) {
  try { return await req.json(); } catch { return {}; }
}
function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function toBytes(x) {
  return Buffer.isBuffer(x) ? x : Buffer.from(String(x));
}
/** Semilla: commit-reveal + snapshot consistente con /draw */
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
/** Fisher–Yates determinístico con HMAC-DRBG (SHA-256) */
function seededShuffle(array, seedBytes) {
  const arr = array.slice();
  let ctr = 0;
  const rand = () => {
    const h = crypto.createHmac('sha256', seedBytes)
      .update(Buffer.from(String(ctr++)))
      .digest();
    const n = h.readUIntBE(0, 6); // 48 bits
    return n / 281474976710656;   // 2^48
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* =========================================================
   POST /api/raffles/:id/participate
   Acepta: { ticketId } | { ticketCode } | { ticketIds: string[] }
   Aplica tickets y si alcanza maxParticipants → ejecuta sorteo.
   ========================================================= */
export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    const { id: raffleId } = await params;
    if (!raffleId) {
      return NextResponse.json({ ok: false, error: 'Falta id de sorteo' }, { status: 400 });
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true, status: true, maxParticipants: true, endsAt: true, ownerId: true,
        drawAt: true, drawnAt: true, drawSeedHash: true, drawSeedReveal: true,
        winnerParticipationId: true,
      },
    });
    if (!raffle) {
      return NextResponse.json({ ok: false, error: 'Sorteo no encontrado' }, { status: 404 });
    }

    // El owner no puede participar
    if (session.user.id === raffle.ownerId) {
      return NextResponse.json({ ok: false, error: 'El organizador no puede participar en su propio sorteo' }, { status: 403 });
    }

    const body = await safeJson(req);
    let { ticketId, ticketCode, ticketIds } = body || {};

    // Normalizamos ids
    const ids = new Set();
    if (Array.isArray(ticketIds)) for (const v of ticketIds) if (typeof v === 'string' && v.trim()) ids.add(v.trim());
    if (typeof ticketId === 'string' && ticketId.trim()) ids.add(ticketId.trim());
    if (!ids.size && ticketCode) {
      const t = await prisma.ticket.findUnique({ where: { code: String(ticketCode).trim() }, select: { id: true } });
      if (!t) return NextResponse.json({ ok: false, error: 'Ticket no encontrado' }, { status: 404 });
      ids.add(t.id);
    }
    if (!ids.size) {
      return NextResponse.json({ ok: false, error: 'Debes enviar ticketId, ticketCode o ticketIds' }, { status: 400 });
    }

    // Aplica tickets uno a uno (respetando ownership/estado dentro de TicketsService)
    const results = [];
    for (const tId of ids) {
      try {
        // (Opcional) chequeo rápido de pertenencia antes del service:
        const t = await prisma.ticket.findUnique({ where: { id: tId }, select: { userId: true } });
        if (!t || t.userId !== session.user.id) {
          results.push({ ticketId: tId, ok: false, status: 403, error: 'El ticket no pertenece al usuario autenticado' });
          continue;
        }

        const participation = await TicketsService.applyTicketToRaffle(tId, raffleId, session.user.id);
        results.push({
          ticketId: tId,
          ok: true,
          participation: {
            id: participation.id,
            raffleId: participation.raffleId,
            ticketCode: participation.ticket?.code || null,
            participatedAt: participation.createdAt,
          },
        });
      } catch (error) {
        const msg = (error?.message || '').toLowerCase();
        let status = 400;
        if (msg.includes('no encontrad')) status = 404;
        const clientPatterns = [
          'ya está participando', 'no disponible', 'termin', 'límite', 'propietario',
          'hash', 'firma', 'hmac', 'inválid',
        ];
        const isClient = clientPatterns.some((s) => msg.includes(s));
        if (!isClient && status !== 404) status = 500;

        results.push({ ticketId: tId, ok: false, status, error: error?.message || 'Error al participar con este ticket' });
      }
    }

    // Recuento actual y participantes (con ticket.user)
    const items = await prisma.participation.findMany({
      where: { raffleId },
      include: {
        ticket: { select: { id: true, code: true, user: { select: { id: true, name: true, image: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const participationsCount = items.length;
    const distinctUsers = new Set(items.map(i => i.ticket?.user?.id).filter(Boolean)).size;

    let ranDraw = false;
    let drawPayload = null;

    // Si alcanzó la meta → ejecutamos sorteo automático
    if (Number.isFinite(raffle.maxParticipants) && raffle.maxParticipants > 0 && participationsCount >= raffle.maxParticipants) {
      // Solo si aún no se sorteó
      const alreadyFinished = raffle.drawnAt || raffle.winnerParticipationId;
      if (!alreadyFinished && participationsCount >= 2) {
        // Preparar commitment si no existe
        let drawSeedReveal = raffle.drawSeedReveal;
        let drawSeedHash = raffle.drawSeedHash;
        let drawAt = raffle.drawAt;
        if (!drawSeedReveal) {
          drawSeedReveal = crypto.randomBytes(32).toString('hex');
          drawSeedHash = sha256hex(Buffer.from(drawSeedReveal, 'utf8'));
        }
        if (!drawAt) {
          drawAt = new Date(); // ahora mismo (auto)
        }

        // Snapshot de códigos
        const ticketCodes = items.map(i => i.ticket?.code || i.id);
        const seed = composeSeed({ serverReveal: drawSeedReveal, raffleId, drawAt, ticketCodes });

        // Orden determinístico
        const idsAsc = items.map(i => i.id);
        const shuffled = seededShuffle(idsAsc, seed);  // descendente (eliminación)
        const rankingAsc = shuffled.slice().reverse(); // [ganador, 2°, 3°, ...]

        const winnerParticipationId = rankingAsc[0];

        // Transacción: marca ganador, opcional drawOrder, actualiza Raffle
        const updated = await prisma.$transaction(async (trx) => {
          // ¿existe drawOrder en el modelo?
          const hasDrawOrder = true; // tu schema lo define como Int? -> lo usamos

          // marcar ranking y ganador
          for (let idx = 0; idx < rankingAsc.length; idx++) {
            const pId = rankingAsc[idx];
            await trx.participation.update({
              where: { id: pId },
              data: {
                isWinner: idx === 0 ? true : undefined,
                ...(hasDrawOrder ? { drawOrder: idx + 1 } : {}),
              },
            });
          }

          const upd = await trx.raffle.update({
            where: { id: raffleId },
            data: {
              status: 'FINISHED',
              drawAt,
              drawnAt: new Date(),
              drawSeedHash,
              drawSeedReveal,
              winnerParticipationId,
            },
            select: { id: true, status: true, drawAt: true, drawnAt: true, drawSeedHash: true, drawSeedReveal: true, winnerParticipationId: true },
          });

          return upd;
        });

        ranDraw = true;
        drawPayload = {
          raffle: updated,
          commitment: `sha256:${updated.drawSeedHash}`,
          reveal: updated.drawSeedReveal,
          order: rankingAsc,
          eliminatedDesc: shuffled,
          winnerParticipationId,
        };
      }
    }

    // Si ya terminó (o terminó recién), devolvemos info de ganador
    let winner = null;
    const winnerPid = drawPayload?.winnerParticipationId || raffle.winnerParticipationId || null;
    if (winnerPid) {
      const w = await prisma.participation.findUnique({
        where: { id: winnerPid },
        include: {
          ticket: { select: { id: true, code: true, user: { select: { id: true, name: true, image: true, email: true } } } },
        },
      });
      if (w) {
        winner = {
          participationId: w.id,
          ticketCode: w.ticket?.code || null,
          user: w.ticket?.user ? { id: w.ticket.user.id, name: w.ticket.user.name, image: w.ticket.user.image, email: w.ticket.user.email } : null,
        };
      }
    }

    const atLeastOneOk = results.some(r => r.ok);
    const errorStatuses = results.filter(r => !r.ok).map(r => r.status || 400);
    const worst = errorStatuses.length ? Math.max(...errorStatuses) : 201;
    const httpStatus = atLeastOneOk ? 201 : worst;

    return NextResponse.json({
      ok: atLeastOneOk,
      success: atLeastOneOk,
      message: atLeastOneOk
        ? (results.length > 1 ? 'Se procesaron tus tickets' : 'Participación exitosa')
        : 'No se pudo procesar ninguno de los tickets',
      raffleId,
      results,
      currentCounts: {
        participations: participationsCount,
        distinctUsers,
        target: raffle.maxParticipants ?? null,
      },
      autoDraw: ranDraw,
      draw: drawPayload, // si corrió ahora
      winner,            // si el sorteo está FINISHED
    }, { status: httpStatus });

  } catch (error) {
    console.error('participate POST error:', error);
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}

/* =========================================================
   GET /api/raffles/:id/participate
   Lista participantes y, si FINISHED, devuelve `winner`.
   ========================================================= */
export async function GET(_req, { params }) {
  try {
    const { id: raffleId } = await params;
    if (!raffleId) {
      return NextResponse.json({ ok: false, error: 'Falta id de sorteo' }, { status: 400 });
    }

    const [items, raffle] = await Promise.all([
      prisma.participation.findMany({
        where: { raffleId },
        include: {
          ticket: { select: { id: true, code: true, user: { select: { id: true, name: true, image: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.raffle.findUnique({
        where: { id: raffleId },
        select: {
          id: true, status: true, maxParticipants: true,
          drawAt: true, drawnAt: true, drawSeedHash: true, drawSeedReveal: true,
          winnerParticipationId: true,
        },
      }),
    ]);

    if (!raffle) return NextResponse.json({ ok: false, error: 'Sorteo no encontrado' }, { status: 404 });

    const participants = items.map(p => ({
      id: p.id,
      user: p.ticket?.user ? { id: p.ticket.user.id, name: p.ticket.user.name, image: p.ticket.user.image } : null,
      ticket: p.ticket ? { id: p.ticket.id, code: p.ticket.code } : null,
      ticketCode: p.ticket?.code || null,
      participatedAt: p.createdAt,
      isWinner: !!p.isWinner,
      drawOrder: p.drawOrder ?? null,
      name: p.ticket?.user?.name || null,
    }));

    const distinctUsers = new Set(participants.map(x => x.user?.id).filter(Boolean)).size;

    // Winner si FINISHED
    let winner = null;
    if (raffle.winnerParticipationId) {
      const w = items.find(i => i.id === raffle.winnerParticipationId);
      if (w) {
        winner = {
          participationId: w.id,
          ticketCode: w.ticket?.code || null,
          user: w.ticket?.user ? { id: w.ticket.user.id, name: w.ticket.user.name, image: w.ticket.user.image } : null,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      success: true,
      participants,
      winner,
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
      counts: {
        participations: participants.length,
        distinctUsers,
        target: raffle.maxParticipants ?? null,
      },
    });

  } catch (e) {
    console.error('GET participants error:', e);
    return NextResponse.json({ ok: false, error: 'Error al cargar participantes' }, { status: 500 });
  }
}
