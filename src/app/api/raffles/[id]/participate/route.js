// src/app/api/raffles/[id]/participate/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { maybeTriggerAutoDraw } from "@/services/raffles.service";

// ---------------- Helpers ----------------
function json(data, init) {
  return Response.json(data, init);
}

async function readJson(req) {
  try {
    const raw = await req.text();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function isNonEmptyString(s) {
  return typeof s === "string" && s.trim().length > 0;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

async function getParams(ctx) {
  // 👇 Next.js 15 requiere await en params de rutas dinámicas
  const p = (ctx && (await ctx.params)) || {};
  return p || {};
}

// Parseo de mínimo desde la descripción si no hay campo dedicado.
function parseMinFromDescription(desc = "") {
  const m = String(desc).match(/Mínimo de tickets por participante:\s*(\d+)/i);
  return m ? Math.max(1, parseInt(m[1], 10)) : null;
}

// Normaliza política/flags de mínimo obligatorio
function isMinMandatory(raffle) {
  const policy = (raffle?.minTicketsPolicy || "").toString().toLowerCase();
  if (policy === "mandatory") return true;
  if (typeof raffle?.minTicketsIsMandatory === "boolean") return raffle.minTicketsIsMandatory;
  return false;
}

// ---------------- GET: lista de participantes (CORREGIDO + metadatos mínimo) ----------------
/**
 * Devuelve participantes del sorteo compatible con extractProgressPayload y
 * agrega:
 *   - minTicketsPerParticipant
 *   - minTicketsIsMandatory (o policy)
 */
export async function GET(req, ctx) {
  const { id: raffleId } = await getParams(ctx);
  if (!isNonEmptyString(raffleId)) {
    return json({ error: "MISSING_RAFFLE_ID" }, { status: 400 });
  }

  try {
    // Traemos también descripción y campos de mínimo (si existen en tu schema)
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        description: true,
        maxParticipants: true,
        minTicketsPerParticipant: true,             // <- si no existe, queda undefined
        minTicketsIsMandatory: true,                // <- si no existe, queda undefined
        minTicketsPolicy: true,                     // <- si no existe, queda undefined
        _count: { select: { participations: true } },
      },
    });

    if (!raffle) {
      return json({ error: "RAFFLE_NOT_FOUND" }, { status: 404 });
    }

    // Trae participaciones + ticket + usuario
    const participations = await prisma.participation.findMany({
      where: { raffleId, isActive: true },
      orderBy: { createdAt: "asc" },
      include: {
        ticket: {
          select: {
            id: true,
            code: true,
            user: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });

    const participants = participations.map((p) => ({
      id: p.id,
      isWinner: p.isWinner,
      user: p.ticket?.user
        ? {
            id: p.ticket.user.id,
            name: p.ticket.user.name,
            image: p.ticket.user.image,
          }
        : null,
      ticket: p.ticket ? { id: p.ticket.id, code: p.ticket.code } : null,
      ticketCode: p.ticket?.code,
      name: p.ticket?.user?.name,
    }));

    const totalParticipants = participants.length;

    // Derivar valores de mínimo (con fallback a descripción si no hay campos)
    const minFromField =
      typeof raffle.minTicketsPerParticipant === "number" && raffle.minTicketsPerParticipant >= 1
        ? raffle.minTicketsPerParticipant
        : null;
    const minFromDesc = parseMinFromDescription(raffle.description);
    const minTicketsPerParticipant = minFromField ?? minFromDesc ?? 1;
    const minMandatory = isMinMandatory(raffle);

    return json({
      participants,
      data: participants,
      items: participants,

      participationsCount: totalParticipants,
      totalParticipations: totalParticipants,
      applied: totalParticipants,
      count: totalParticipants,

      maxParticipants: raffle.maxParticipants,
      max: raffle.maxParticipants,
      capacity: raffle.maxParticipants,

      stats: {
        participationsCount: totalParticipants,
        totalParticipations: totalParticipants,
        maxParticipants: raffle.maxParticipants,
        capacity: raffle.maxParticipants,
      },

      // Metadatos de mínimo para el front (por si los querés usar)
      minTicketsPerParticipant,
      minTicketsIsMandatory: minMandatory,
      minTicketsPolicy: minMandatory ? "mandatory" : "suggested",
    });
  } catch (error) {
    console.error("❌ Error en GET /api/raffles/[id]/participate:", error);
    return json(
      {
        error: "INTERNAL_ERROR",
        participants: [],
        participationsCount: 0,
        maxParticipants: null,
      },
      { status: 500 }
    );
  }
}

// ---------------- POST: participar con tickets (con enforcement del mínimo obligatorio) ----------------
/**
 * Body esperado:
 * { ticketIds: string[] }
 *
 * Respuesta:
 * {
 *   ok: boolean,
 *   results: [{ ok, ticketId, participation?, error? }],
 *   successes: [{ ticketId, data: { ticketCode, raffleId } }]
 * }
 */
export async function POST(req, ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id: raffleId } = await getParams(ctx);
  if (!isNonEmptyString(raffleId)) {
    return json({ ok: false, error: "MISSING_RAFFLE_ID" }, { status: 400 });
  }

  // Verifica sorteo
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: {
      id: true,
      status: true,
      isLocked: true,
      maxParticipants: true,
      description: true,
      minTicketsPerParticipant: true,   // <- si no existe en tu schema, queda undefined
      minTicketsIsMandatory: true,      // <- idem
      minTicketsPolicy: true,           // <- idem
      _count: { select: { participations: true } },
    },
  });
  if (!raffle) {
    return json({ ok: false, error: "RAFFLE_NOT_FOUND" }, { status: 404 });
  }
  if (raffle.isLocked) {
    return json({ ok: false, error: "RAFFLE_LOCKED" }, { status: 423 });
  }
  const blockedStatuses = ["READY_TO_DRAW", "FINISHED", "CANCELLED", "COMPLETED"];
  if (blockedStatuses.includes(String(raffle.status))) {
    return json({ ok: false, error: `RAFFLE_STATUS_${raffle.status}` }, { status: 409 });
  }

  // Lee body
  const ct = req.headers.get("content-type") || "";
  const body = ct.toLowerCase().includes("application/json") ? await readJson(req) : {};
  const ticketIds = Array.isArray(body?.ticketIds) ? body.ticketIds : [];

  const cleaned = uniq(
    ticketIds
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  );

  if (cleaned.length === 0) {
    return json(
      { ok: false, error: "INVALID_TICKET_IDS", details: "ticketIds debe ser un array de strings no vacíos" },
      { status: 422 }
    );
  }

  // -------- Enforcement del mínimo obligatorio (pre-chequeo) --------
  // Deriva mínimo y si es obligatorio (con fallback a descripción)
  const minFromField =
    typeof raffle.minTicketsPerParticipant === "number" && raffle.minTicketsPerParticipant >= 1
      ? raffle.minTicketsPerParticipant
      : null;
  const minFromDesc = parseMinFromDescription(raffle.description);
  const minRequired = minFromField ?? minFromDesc ?? 1;
  const mandatory = isMinMandatory(raffle);

  if (mandatory && minRequired > 1) {
    // ¿Cuántas participaciones activas ya tiene este usuario en el sorteo?
    const already = await prisma.participation.count({
      where: {
        raffleId,
        isActive: true,
        ticket: { userId: session.user.id },
      },
    });

    const selected = cleaned.length;
    const totalIfAccepted = already + selected;

    if (totalIfAccepted < minRequired) {
      const needed = Math.max(0, minRequired - already);
      return json(
        {
          ok: false,
          error: "MIN_TICKETS_REQUIRED",
          message: `Este sorteo requiere un mínimo de ${minRequired} ticket(s) por participante.`,
          required: minRequired,
          selected,
          already,
          needed, // tickets que faltan en esta llamada para cumplir el mínimo
        },
        { status: 422 }
      );
    }
  }

  // Límite defensivo
  const MAX_TICKETS_PER_CALL = 100;
  if (cleaned.length > MAX_TICKETS_PER_CALL) {
    return json(
      { ok: false, error: "TOO_MANY_TICKETS", details: `Máximo ${MAX_TICKETS_PER_CALL} por solicitud` },
      { status: 422 }
    );
  }

  const results = [];
  const successes = [];

  // Procesa UNO POR UNO, con transacción por ticket
  for (const ticketId of cleaned) {
    try {
      const res = await prisma.$transaction(async (tx) => {
        // Valida ticket
        const t = await tx.ticket.findUnique({
          where: { id: ticketId },
          select: {
            id: true,
            userId: true,
            raffleId: true,
            status: true,
            isUsed: true,
            code: true,
          },
        });

        if (!t) {
          return { ok: false, ticketId, error: "TICKET_NOT_FOUND" };
        }
        if (t.userId !== session.user.id) {
          return { ok: false, ticketId, error: "TICKET_NOT_OWNED_BY_USER" };
        }
        if (t.isUsed) {
          return { ok: false, ticketId, error: "TICKET_ALREADY_USED" };
        }
        if (t.raffleId && t.raffleId !== raffleId) {
          return { ok: false, ticketId, error: "TICKET_ALREADY_IN_OTHER_RAFFLE" };
        }
        // Permitimos reintento idempotente si ya estaba en este sorteo:
        if (t.raffleId === raffleId) {
          const existing = await tx.participation.findUnique({
            where: { ticketId: t.id },
            select: { id: true },
          });
          return existing
            ? { ok: true, ticketId, participation: { id: existing.id, ticketCode: t.code, raffleId } }
            : { ok: false, ticketId, error: "PARTICIPATION_MISSING_FOR_EXISTING_TICKET" };
        }

        // Reglas de disponibilidad
        if (!["AVAILABLE", "ACTIVE", "PENDING"].includes(String(t.status))) {
          return { ok: false, ticketId, error: `TICKET_STATUS_${t.status}` };
        }

        // Chequeo de cupo (si tenés maxParticipants)
        if (raffle.maxParticipants && raffle._count.participations >= raffle.maxParticipants) {
          return { ok: false, ticketId, error: "RAFFLE_FULL" };
        }

        // Vincula ticket al sorteo
        await tx.ticket.update({
          where: { id: t.id },
          data: {
            raffleId,
            status: "IN_RAFFLE",
          },
        });

        // Crea Participation (único por ticketId)
        const part = await tx.participation.create({
          data: {
            raffleId,
            ticketId: t.id,
            isActive: true,
          },
          select: { id: true },
        });

        // Aumenta contador local en memoria para siguientes iteraciones
        raffle._count.participations += 1;

        return {
          ok: true,
          ticketId,
          participation: { id: part.id, ticketCode: t.code, raffleId },
        };
      });

      results.push(res);

      // Agregar a successes si fue exitoso
      if (res.ok && res.participation) {
        successes.push({
          ticketId: res.ticketId,
          data: {
            ticketCode: res.participation.ticketCode,
            raffleId: res.participation.raffleId,
          },
        });
      }
    } catch (e) {
      const errorResult = {
        ok: false,
        ticketId,
        error: e?.code === "P2002" ? "ALREADY_PARTICIPATING" : "DB_ERROR",
      };
      results.push(errorResult);
    }
  }

  // Intentá programar autodraw si se llenó el cupo
  try {
    await maybeTriggerAutoDraw(raffleId);
  } catch {
    // no bloquear respuesta por esto
  }

  const hasSuccesses = successes.length > 0;

  return json({
    ok: hasSuccesses,
    results,
    successes, // Formato esperado por handleParticipationSuccess en el frontend
  });
}
