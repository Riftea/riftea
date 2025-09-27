export const runtime = 'nodejs';
// src/app/api/raffles/[id]/participate/route.js
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { maybeTriggerAutoDraw } from "@/services/raffles.service";
import { computeTicketHash } from "@/lib/crypto.server";

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
  if (typeof raffle?.minTicketsIsMandatory === "boolean") return raffle.minTicketsIsMandatory;
  return false;
}

// En dev NO enforzamos HMAC a menos que lo pidas explícitamente
const ENFORCE_HMAC = String(process.env.TICKETS_ENFORCE_HMAC ?? "false").toLowerCase() === "true";

// ---------------- GET: lista de participantes + stats por usuario ----------------
export async function GET(req, ctx) {
  const { id: raffleId } = await getParams(ctx);
  if (!isNonEmptyString(raffleId)) {
    return json({ error: "MISSING_RAFFLE_ID" }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id || null;

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        description: true,
        maxParticipants: true,
        minTicketsPerParticipant: true,
        minTicketsIsMandatory: true,
        _count: { select: { participations: { where: { isActive: true } } } },
      },
    });

    if (!raffle) {
      return json({ error: "RAFFLE_NOT_FOUND" }, { status: 404 });
    }

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

    const minFromField =
      typeof raffle.minTicketsPerParticipant === "number" && raffle.minTicketsPerParticipant >= 1
        ? raffle.minTicketsPerParticipant
        : null;
    const minFromDesc = parseMinFromDescription(raffle.description);
    const minTicketsPerParticipant = minFromField ?? minFromDesc ?? 1;
    const minMandatory = isMinMandatory(raffle);

    // ✅ Stats por usuario (para poder avisar 50%)
    let userCurrentCount = 0;
    let userCap = null;
    let remainingForUser = null;

    if (viewerId && Number.isFinite(raffle.maxParticipants) && raffle.maxParticipants > 0) {
      userCap = Math.max(1, Math.floor(raffle.maxParticipants / 2));
      userCurrentCount = await prisma.participation.count({
        where: { raffleId, isActive: true, ticket: { userId: viewerId } },
      });
      remainingForUser = Math.max(0, userCap - userCurrentCount);
    }

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
        userCurrentCount,
        userCap,
        remainingForUser,
      },

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

// ---------------- POST: aplica tickets y devuelve USER_CAP claro ----------------
export async function POST(req, ctx) {
  console.log("🔍 POST /participate - INICIO");

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    console.log("❌ No hay sesión");
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  console.log("✅ Usuario autenticado:", session.user.id);

  const role = String(session.user.role || "").toUpperCase();
  const isSuperAdmin = role === "SUPERADMIN";

  const { id: raffleId } = await getParams(ctx);
  console.log("🎯 Raffle ID:", raffleId);

  // Body
  const ct = req.headers.get("content-type") || "";
  const body = ct.toLowerCase().includes("application/json") ? await readJson(req) : {};
  const rawIds = Array.isArray(body?.ticketIds) ? body.ticketIds : [];
  const ticketIds = uniq(
    rawIds
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  );

  console.log("🎫 Ticket IDs recibidos:", ticketIds);

  if (ticketIds.length === 0) {
    return json(
      { ok: false, error: "INVALID_TICKET_IDS", details: "ticketIds debe ser un array de strings no vacíos" },
      { status: 422 }
    );
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // 1) Validar sorteo
        const raffle = await tx.raffle.findUnique({
          where: { id: raffleId },
          select: {
            id: true,
            title: true,
            status: true,
            isLocked: true,
            maxParticipants: true,
            _count: { select: { participations: { where: { isActive: true } } } },
          },
        });
        if (!raffle) throw new Error("RAFFLE_NOT_FOUND");
        if (raffle.isLocked) throw new Error("RAFFLE_LOCKED");
        const blocked = new Set(["READY_TO_DRAW", "FINISHED", "CANCELLED", "COMPLETED"]);
        if (blocked.has(String(raffle.status))) throw new Error(`RAFFLE_STATUS_${raffle.status}`);

        // 2) Traer exactamente esos tickets por ID y del usuario
        const tickets = await tx.ticket.findMany({
          where: { id: { in: ticketIds }, userId: session.user.id },
          select: {
            id: true,
            uuid: true,
            userId: true,
            generatedAt: true,
            hash: true,
            code: true,
            raffleId: true,
            status: true,
            isUsed: true,
          },
        });

        console.log("🔎 Tickets leídos:", tickets.map(t => ({ id: t.id, code: t.code, status: t.status, raffleId: t.raffleId })));

        if (tickets.length !== ticketIds.length) {
          // Encontrar faltantes para debug
          const found = new Set(tickets.map(t => t.id));
          const missing = ticketIds.filter(id => !found.has(id));
          console.log("❌ Tickets no encontrados o no pertenecen al usuario:", missing);
          throw new Error("TICKETS_NOT_FOUND");
        }

        // 3) Validaciones + (opcional) HMAC
        const valid = [];
        for (const t of tickets) {
          // HMAC (opcional en dev)
          if (ENFORCE_HMAC) {
            try {
              const expected = computeTicketHash({ uuid: t.uuid, userId: t.userId, generatedAt: t.generatedAt });
              const a = Buffer.from(String(expected), "hex");
              const b = Buffer.from(String(t.hash || ""), "hex");
              if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
                throw new Error("TICKET_SIGNATURE_INVALID");
              }
            } catch (e) {
              console.log(`❌ Firma inválida para ${t.code}:`, e?.message || e);
              throw new Error("TICKET_SIGNATURE_INVALID");
            }
          }

          if (t.isUsed) throw new Error("TICKET_ALREADY_USED");
          if (t.raffleId && t.raffleId !== raffleId) throw new Error("TICKET_ALREADY_IN_OTHER_RAFFLE");

          // Idempotencia
          if (t.raffleId === raffleId) {
            const existing = await tx.participation.findFirst({
              where: { ticketId: t.id, raffleId, isActive: true },
              select: { id: true },
            });
            if (existing) {
              valid.push({ ticket: t, isExisting: true, participationId: existing.id });
              continue;
            }
          }

          if (!["AVAILABLE", "ACTIVE", "PENDING"].includes(String(t.status))) {
            throw new Error(`TICKET_STATUS_${t.status}`);
          }

          valid.push({ ticket: t, isExisting: false });
        }

        const newOnes = valid.filter(v => !v.isExisting);

        // 4) Verificar cupo global y 50%
        const current = raffle._count.participations;
        const after = current + newOnes.length;

        if (raffle.maxParticipants && after > raffle.maxParticipants) {
          throw new Error("RAFFLE_FULL");
        }

        // 50% por usuario
        if (!isSuperAdmin && Number.isFinite(raffle.maxParticipants) && raffle.maxParticipants > 0) {
          const userCap = Math.max(1, Math.floor(raffle.maxParticipants / 2));
          const userCurrent = await tx.participation.count({
            where: { raffleId, isActive: true, ticket: { userId: session.user.id } },
          });
          const remainingForUser = Math.max(0, userCap - userCurrent);
          const userAfter = userCurrent + newOnes.length;

          if (userAfter > userCap) {
            const err = new Error(
              remainingForUser <= 0
                ? "Alcanzaste el máximo permitido (50% del cupo total) para este sorteo."
                : `No podés superar el 50% del cupo. Máximo adicional permitido ahora: ${remainingForUser}.`
            );
            err.code = "USER_CAP";
            // @ts-ignore
            err.remainingForUser = remainingForUser;
            throw err;
          }
        }

        // 5) update tickets + create participations (con fallback)
        if (newOnes.length > 0) {
          const idsToUpdate = newOnes.map(n => n.ticket.id);
          const upd = await tx.ticket.updateMany({
            where: { id: { in: idsToUpdate } },
            data: { raffleId, status: "IN_RAFFLE" },
          });

          if (upd.count !== idsToUpdate.length) {
            for (const id of idsToUpdate) {
              await tx.ticket.update({ where: { id }, data: { raffleId, status: "IN_RAFFLE" } });
            }
          }

          await tx.participation.createMany({
            data: newOnes.map((n) => ({ raffleId, ticketId: n.ticket.id, isActive: true })),
            skipDuplicates: true,
          });
        }

        // 6) Respuesta
        const results = valid.map((v) => ({
          ok: true,
          ticketId: v.ticket.id,
          participation: { id: v.participationId || "new", ticketCode: v.ticket.code, raffleId },
          isExisting: v.isExisting,
        }));

        const successes = valid.map((v) => ({
          ticketId: v.ticket.id,
          data: { ticketCode: v.ticket.code, raffleId },
        }));

        return {
          results,
          successes,
          newParticipations: newOnes.length,
          totalParticipationsAfter: (raffle._count.participations + newOnes.length),
          maxParticipants: raffle.maxParticipants,
        };
      },
      { timeout: 15000, isolationLevel: "Serializable" }
    );

    // 7) Auto-draw
    if (result.maxParticipants && result.totalParticipationsAfter >= result.maxParticipants) {
      try { await maybeTriggerAutoDraw(raffleId); } catch (e) { console.error("auto-draw error:", e); }
    }

    return json({
      ok: true,
      results: result.results,
      successes: result.successes,
      message: `${result.newParticipations} nuevas participaciones agregadas`,
      debug: {
        totalParticipationsAfter: result.totalParticipationsAfter,
        maxParticipants: result.maxParticipants,
      },
    });
  } catch (error) {
    console.error("❌ ERROR en POST /participate:", error?.message, error);

    const msg = error?.message || "INTERNAL_ERROR";

    if (error.code === "USER_CAP" || msg.includes("USER_CAP")) {
      // devolvemos remainingForUser si vino colgado en el error
      const remaining = Number.isFinite(error?.remainingForUser) ? error.remainingForUser : undefined;
      return json(
        {
          ok: false,
          error: "USER_CAP",
          message: msg,
          ...(remaining !== undefined ? { remainingForUser: remaining } : {}),
        },
        { status: 422 }
      );
    }
    if (msg === "RAFFLE_FULL") {
      return json({ ok: false, error: "RAFFLE_FULL", message: "El sorteo ha alcanzado su capacidad máxima." }, { status: 409 });
    }
    if (msg === "RAFFLE_LOCKED" || msg.startsWith("RAFFLE_STATUS_")) {
      return json({ ok: false, error: msg }, { status: 409 });
    }
    if (msg === "TICKETS_NOT_FOUND") {
      return json({ ok: false, error: "TICKETS_NOT_FOUND", message: "Algunos tickets no existen o no te pertenecen." }, { status: 404 });
    }
    if (msg === "TICKET_SIGNATURE_INVALID") {
      return json({ ok: false, error: "TICKET_SIGNATURE_INVALID", message: "Firma de ticket inválida." }, { status: 403 });
    }

    return json(
      { ok: false, error: "INTERNAL_ERROR", message: "Error interno al procesar la participación." },
      { status: 500 }
    );
  }
}
