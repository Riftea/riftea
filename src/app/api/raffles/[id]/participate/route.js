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
  // Ya no usamos minTicketsPolicy porque no existe en el schema
  if (typeof raffle?.minTicketsIsMandatory === "boolean") return raffle.minTicketsIsMandatory;
  return false;
}

// ---------------- GET: lista de participantes (CORREGIDO) ----------------
export async function GET(req, ctx) {
  const { id: raffleId } = await getParams(ctx);
  if (!isNonEmptyString(raffleId)) {
    return json({ error: "MISSING_RAFFLE_ID" }, { status: 400 });
  }

  try {
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        description: true,
        maxParticipants: true,
        minTicketsPerParticipant: true,
        minTicketsIsMandatory: true,
        // ❌ REMOVIDO: minTicketsPolicy (no existe en schema)
        _count: { select: { participations: true } },
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

      minTicketsPerParticipant,
      minTicketsIsMandatory: minMandatory,
      minTicketsPolicy: minMandatory ? "mandatory" : "suggested", // Calculado, no del DB
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

// ---------------- POST: VERSIÓN CON DEBUGGING INTENSIVO ----------------
export async function POST(req, ctx) {
  console.log("🔍 POST /participate - INICIO");
  
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    console.log("❌ No hay sesión");
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  console.log("✅ Usuario autenticado:", session.user.id);

  const { id: raffleId } = await getParams(ctx);
  console.log("🎯 Raffle ID:", raffleId);

  // Lee body
  const ct = req.headers.get("content-type") || "";
  const body = ct.toLowerCase().includes("application/json") ? await readJson(req) : {};
  console.log("📦 Body recibido:", JSON.stringify(body, null, 2));

  const ticketIds = Array.isArray(body?.ticketIds) ? body.ticketIds : [];
  console.log("🎫 Ticket IDs extraídos:", ticketIds);

  const cleaned = uniq(
    ticketIds
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  );
  console.log("🧹 Ticket IDs limpiados:", cleaned);

  if (cleaned.length === 0) {
    console.log("❌ No hay ticket IDs válidos");
    return json(
      { ok: false, error: "INVALID_TICKET_IDS", details: "ticketIds debe ser un array de strings no vacíos" },
      { status: 422 }
    );
  }

  try {
    console.log("🔄 Iniciando transacción...");
    
    const result = await prisma.$transaction(async (tx) => {
      console.log("1️⃣ Validando sorteo...");
      
      // 1. Validar sorteo - SCHEMA CORREGIDO
      const raffle = await tx.raffle.findUnique({
        where: { id: raffleId },
        select: {
          id: true,
          title: true, // Para debugging
          status: true,
          isLocked: true,
          maxParticipants: true,
          description: true,
          minTicketsPerParticipant: true,
          minTicketsIsMandatory: true,
          // ❌ REMOVIDO: minTicketsPolicy (no existe en tu schema)
          _count: { select: { participations: true } },
        },
      });

      console.log("🎰 Sorteo encontrado:", {
        id: raffle?.id,
        title: raffle?.title,
        status: raffle?.status,
        participations: raffle?._count?.participations,
        maxParticipants: raffle?.maxParticipants
      });

      if (!raffle) {
        throw new Error("RAFFLE_NOT_FOUND");
      }
      if (raffle.isLocked) {
        console.log("🔒 Sorteo bloqueado");
        throw new Error("RAFFLE_LOCKED");
      }

      const blockedStatuses = ["READY_TO_DRAW", "FINISHED", "CANCELLED", "COMPLETED"];
      if (blockedStatuses.includes(String(raffle.status))) {
        console.log("⛔ Estado bloqueado:", raffle.status);
        throw new Error(`RAFFLE_STATUS_${raffle.status}`);
      }

      console.log("2️⃣ Buscando tickets del usuario...");
      
      // 2. Validar TODOS los tickets de una vez
      const tickets = await tx.ticket.findMany({
        where: {
          id: { in: cleaned },
          userId: session.user.id,
        },
        select: {
          id: true,
          code: true, // Para debugging
          userId: true,
          raffleId: true,
          status: true,
          isUsed: true,
        },
      });

      console.log("🎫 Tickets encontrados:", tickets.map(t => ({
        id: t.id,
        code: t.code,
        status: t.status,
        isUsed: t.isUsed,
        raffleId: t.raffleId
      })));

      // Verificar que encontramos todos los tickets solicitados
      if (tickets.length !== cleaned.length) {
        const found = tickets.map(t => t.id);
        const missing = cleaned.filter(id => !found.includes(id));
        console.log("❌ Tickets faltantes:", missing);
        throw new Error(`TICKETS_NOT_FOUND: ${missing.join(', ')}`);
      }

      console.log("3️⃣ Validando tickets...");

      // 3. Validar cada ticket
      const validTickets = [];
      const errors = [];

      for (const ticket of tickets) {
        console.log(`🔍 Validando ticket ${ticket.code}:`, {
          isUsed: ticket.isUsed,
          raffleId: ticket.raffleId,
          status: ticket.status
        });

        if (ticket.isUsed) {
          console.log(`❌ Ticket ${ticket.code} ya usado`);
          errors.push({ ticketId: ticket.id, error: "TICKET_ALREADY_USED" });
          continue;
        }
        
        if (ticket.raffleId && ticket.raffleId !== raffleId) {
          console.log(`❌ Ticket ${ticket.code} en otro sorteo:`, ticket.raffleId);
          errors.push({ ticketId: ticket.id, error: "TICKET_ALREADY_IN_OTHER_RAFFLE" });
          continue;
        }

        // Permitir reintento idempotente
        if (ticket.raffleId === raffleId) {
          console.log(`🔄 Ticket ${ticket.code} ya en este sorteo, verificando participación...`);
          const existing = await tx.participation.findUnique({
            where: { ticketId: ticket.id },
            select: { id: true },
          });
          if (existing) {
            console.log(`✅ Participación existente para ticket ${ticket.code}`);
            validTickets.push({ 
              ticket, 
              isExisting: true, 
              participationId: existing.id 
            });
            continue;
          }
        }

        if (!["AVAILABLE", "ACTIVE", "PENDING"].includes(String(ticket.status))) {
          console.log(`❌ Estado inválido para ticket ${ticket.code}:`, ticket.status);
          errors.push({ ticketId: ticket.id, error: `TICKET_STATUS_${ticket.status}` });
          continue;
        }

        console.log(`✅ Ticket ${ticket.code} válido`);
        validTickets.push({ ticket, isExisting: false });
      }

      console.log("📊 Resumen validación:", {
        validTickets: validTickets.length,
        errors: errors.length,
        newTickets: validTickets.filter(vt => !vt.isExisting).length
      });

      if (errors.length > 0) {
        console.log("❌ Errores de validación:", errors);
        throw new Error(`TICKET_VALIDATION_FAILED: ${JSON.stringify(errors)}`);
      }

      const newTickets = validTickets.filter(vt => !vt.isExisting);
      console.log("🆕 Tickets nuevos a procesar:", newTickets.length);

      // 4. Verificar capacidad
      const currentParticipations = raffle._count.participations;
      const newParticipationsCount = newTickets.length;
      const totalAfterAdd = currentParticipations + newParticipationsCount;

      console.log("📈 Verificación de capacidad:", {
        current: currentParticipations,
        adding: newParticipationsCount,
        total: totalAfterAdd,
        max: raffle.maxParticipants
      });

      if (raffle.maxParticipants && totalAfterAdd > raffle.maxParticipants) {
        console.log("❌ Excede capacidad máxima");
        throw new Error("RAFFLE_FULL");
      }

      // 5. Procesar tickets nuevos
      if (newTickets.length > 0) {
        console.log("4️⃣ Actualizando tickets...");
        
        const ticketIdsToUpdate = newTickets.map(vt => vt.ticket.id);
        console.log("🔄 Actualizando tickets:", ticketIdsToUpdate);

        const updateResult = await tx.ticket.updateMany({
          where: { 
            id: { in: ticketIdsToUpdate } 
          },
          data: {
            raffleId,
            status: "IN_RAFFLE",
          },
        });
        
        console.log("✅ Tickets actualizados:", updateResult.count);

        console.log("5️⃣ Creando participaciones...");

        const participationData = newTickets.map(vt => ({
          raffleId,
          ticketId: vt.ticket.id,
          isActive: true,
        }));

        console.log("📝 Datos de participaciones:", participationData);

        const createResult = await tx.participation.createMany({
          data: participationData,
          skipDuplicates: true,
        });

        console.log("✅ Participaciones creadas:", createResult.count);
      }

      // 6. Preparar respuesta
      const allResults = validTickets.map(vt => ({
        ok: true,
        ticketId: vt.ticket.id,
        participation: { 
          id: vt.participationId || "new", 
          ticketCode: vt.ticket.code, 
          raffleId 
        },
        isExisting: vt.isExisting
      }));

      const allSuccesses = validTickets.map(vt => ({
        ticketId: vt.ticket.id,
        data: {
          ticketCode: vt.ticket.code,
          raffleId,
        },
      }));

      console.log("📤 Preparando respuesta:", {
        results: allResults.length,
        successes: allSuccesses.length,
        newParticipations: newTickets.length,
        totalAfter: totalAfterAdd
      });

      return {
        results: allResults,
        successes: allSuccesses,
        newParticipations: newTickets.length,
        totalParticipationsAfter: totalAfterAdd,
        maxParticipants: raffle.maxParticipants
      };

    }, {
      timeout: 15000,
      isolationLevel: 'Serializable'
    });

    console.log("✅ Transacción completada exitosamente");

    // 7. Auto-draw check
    if (result.maxParticipants && 
        result.totalParticipationsAfter >= result.maxParticipants) {
      console.log("🎯 Verificando auto-draw...");
      try {
        await maybeTriggerAutoDraw(raffleId);
        console.log("✅ Auto-draw verificado");
      } catch (autoDrawError) {
        console.error("❌ Error en auto-draw:", autoDrawError);
      }
    }

    const response = {
      ok: true,
      results: result.results,
      successes: result.successes,
      message: `${result.newParticipations} nuevas participaciones agregadas`,
      debug: {
        totalParticipationsAfter: result.totalParticipationsAfter,
        maxParticipants: result.maxParticipants
      }
    };

    console.log("📤 Enviando respuesta:", response);
    return json(response);

  } catch (error) {
    console.error("❌ ERROR en POST /participate:", error.message);
    console.error("📚 Stack trace:", error.stack);
    
    // Parsear errores específicos
    const errorMessage = error.message || "INTERNAL_ERROR";
    
    if (errorMessage.includes("MIN_TICKETS_REQUIRED")) {
      const match = errorMessage.match(/MIN_TICKETS_REQUIRED: (\d+)/);
      const required = match ? parseInt(match[1]) : 1;
      return json({
        ok: false,
        error: "MIN_TICKETS_REQUIRED",
        message: `Este sorteo requiere un mínimo de ${required} ticket(s) por participante.`,
        required
      }, { status: 422 });
    }

    if (errorMessage === "RAFFLE_FULL") {
      return json({
        ok: false,
        error: "RAFFLE_FULL",
        message: "El sorteo ha alcanzado su capacidad máxima."
      }, { status: 409 });
    }

    if (errorMessage.includes("TICKETS_NOT_FOUND")) {
      return json({
        ok: false,
        error: "TICKETS_NOT_FOUND",
        message: "Algunos tickets no existen o no te pertenecen."
      }, { status: 404 });
    }

    if (errorMessage.includes("TICKET_VALIDATION_FAILED")) {
      return json({
        ok: false,
        error: "TICKET_VALIDATION_FAILED",
        message: "Algunos tickets no son válidos para este sorteo."
      }, { status: 422 });
    }

    return json({
      ok: false,
      error: errorMessage,
      message: "Error interno al procesar la participación.",
      debug: { originalError: error.message }
    }, { status: 500 });
  }
}