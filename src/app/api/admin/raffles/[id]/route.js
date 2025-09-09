// src/app/api/admin/raffles/[id]/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Validación de fechas mejorada con mensajes claros
 */
function validateDates(startsAt, endsAt) {
  const now = new Date();
  const endDate = endsAt ? new Date(endsAt) : null;
  const startDate = startsAt ? new Date(startsAt) : null;

  if (endDate && isNaN(endDate.getTime())) {
    return { valid: false, error: "Fecha de finalización inválida" };
  }
  if (startDate && isNaN(startDate.getTime())) {
    return { valid: false, error: "Fecha de inicio inválida" };
  }
  if (endDate && endDate <= now) {
    return { valid: false, error: "La fecha de finalización debe ser futura" };
  }
  if (startDate && startDate <= now) {
    return { valid: false, error: "La fecha de inicio debe ser futura" };
  }
  if (startDate && endDate && startDate >= endDate) {
    return {
      valid: false,
      error: "La fecha de inicio debe ser anterior a la fecha de finalización",
    };
  }

  return { valid: true, startDate, endDate };
}

/**
 * Verificar permisos de usuario para operaciones CRUD
 */
function checkPermissions(session, operation, raffle = null) {
  if (!session) {
    return { allowed: false, status: 401, error: "No autorizado" };
  }

  const role = String(session.user.role || "").toLowerCase();
  if (!["admin", "superadmin"].includes(role)) {
    return { allowed: false, status: 403, error: "Permisos insuficientes" };
  }

  if (raffle && role === "admin" && raffle.ownerId !== session.user.id) {
    const actionMap = { view: "ver", edit: "editar", delete: "eliminar" };
    return {
      allowed: false,
      status: 403,
      error: `No autorizado para ${actionMap[operation] || operation} este sorteo`,
    };
  }

  return { allowed: true, role };
}

/** Helpers locales simples (sin utils externas) */
function parseIntStrict(name, value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${name} debe ser un entero`);
  }
  return n;
}

function requireIntMin(name, value, min) {
  const n = parseIntStrict(name, value);
  if (n === null) return null;
  if (n < min) {
    throw new Error(`${name} debe ser un entero mayor o igual a ${min}`);
  }
  return n;
}

/**
 * GET - Obtener detalles de un sorteo específico
 */
export async function GET(_request, { params }) {
  try {
    const { id } = params;
    const session = await getServerSession(authOptions);
    const permissionCheck = checkPermissions(session, "view");
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { error: permissionCheck.error },
        { status: permissionCheck.status }
      );
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: { select: { tickets: true, participations: true } },
        owner: { select: { id: true, name: true, email: true } },
        winner: { select: { id: true, name: true, email: true } },
      },
    });

    if (!raffle) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const ownershipCheck = checkPermissions(session, "view", raffle);
    if (!ownershipCheck.allowed) {
      return NextResponse.json(
        { error: ownershipCheck.error },
        { status: ownershipCheck.status }
      );
    }

    // Precio unitario derivado desde el servidor (no persistido)
    const POT_CONTRIBUTION_PER_TICKET = Number(
      process.env.POT_CONTRIBUTION_PER_TICKET ?? "500"
    );
    const unitPrice =
      Number.isFinite(POT_CONTRIBUTION_PER_TICKET) &&
      POT_CONTRIBUTION_PER_TICKET > 0
        ? POT_CONTRIBUTION_PER_TICKET
        : null;

    return NextResponse.json({ success: true, raffle, unitPrice });
  } catch (error) {
    console.error("GET /api/admin/raffles/[id] error:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PUT - Actualizar un sorteo existente
 * Alineado con ticket.server.js:
 * - No leer ni persistir ticketPrice
 * - minParticipants = ceil(prizeValue / POT_CONTRIBUTION_PER_TICKET)
 * - Validar maxTickets >= minParticipants
 */
export async function PUT(request, { params }) {
  try {
    const { id } = params;

    const session = await getServerSession(authOptions);
    const permissionCheck = checkPermissions(session, "edit");
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { error: permissionCheck.error },
        { status: permissionCheck.status }
      );
    }

    const currentRaffle = await prisma.raffle.findUnique({
      where: { id },
      include: {
        owner: true,
        _count: { select: { tickets: true, participations: true } },
      },
    });

    if (!currentRaffle) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const ownershipCheck = checkPermissions(session, "edit", currentRaffle);
    if (!ownershipCheck.allowed) {
      return NextResponse.json(
        { error: ownershipCheck.error },
        { status: ownershipCheck.status }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
    }

    // ⚠️ CONFIG obligatoria en server (no persistida)
    const POT_CONTRIBUTION_PER_TICKET = Number(
      process.env.POT_CONTRIBUTION_PER_TICKET ?? "500"
    );
    if (
      !Number.isFinite(POT_CONTRIBUTION_PER_TICKET) ||
      POT_CONTRIBUTION_PER_TICKET <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Configuración inválida: POT_CONTRIBUTION_PER_TICKET debe ser un entero > 0 en .env",
        },
        { status: 500 }
      );
    }

    const updateData = {};

    // --- Campos simples
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title)
        return NextResponse.json(
          { error: "El título no puede estar vacío" },
          { status: 400 }
        );
      updateData.title = title;
    }

    if (body.description !== undefined) {
      const description = String(body.description).trim();
      if (!description)
        return NextResponse.json(
          { error: "La descripción no puede estar vacía" },
          { status: 400 }
        );
      updateData.description = description;
    }

    // ❌ Nunca leer ni persistir ticketPrice
    // (Eliminar cualquier referencia a body.ticketPrice / ticketPriceInput)

    // prizeValue (regla: entero ≥ 1000)
    if (body.prizeValueInput !== undefined || body.prizeValue !== undefined) {
      try {
        const raw = body.prizeValueInput ?? body.prizeValue;
        const cleaned = typeof raw === "string" ? raw.replace(/[^\d-]/g, "") : raw;
        updateData.prizeValue = requireIntMin("Valor del premio", cleaned, 1000);
      } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    }

    // maxTickets (a.k.a participantGoal / maxParticipants)
    if (
      body.maxTickets !== undefined ||
      body.participantLimit !== undefined ||
      body.participantGoal !== undefined
    ) {
      const maxTickets =
        body.maxTickets ?? body.participantLimit ?? body.participantGoal;
      try {
        updateData.maxTickets = requireIntMin("Máximo de tickets", maxTickets, 1);
      } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    }

    if (body.imageUrl !== undefined) {
      updateData.imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;
    }

    if (body.startsAt !== undefined || body.endsAt !== undefined) {
      const newStartsAt =
        body.startsAt !== undefined ? body.startsAt : currentRaffle.startsAt;
      const newEndsAt =
        body.endsAt !== undefined ? body.endsAt : currentRaffle.endsAt;

      const dateValidation = validateDates(newStartsAt, newEndsAt);
      if (!dateValidation.valid) {
        return NextResponse.json({ error: dateValidation.error }, { status: 400 });
      }

      if (body.startsAt !== undefined) updateData.startsAt = dateValidation.startDate;
      if (body.endsAt !== undefined) updateData.endsAt = dateValidation.endDate;
    }

    if (body.published !== undefined) {
      if (body.published) {
        updateData.status = "PUBLISHED";
        updateData.publishedAt = new Date();
      } else {
        updateData.status = "DRAFT";
        updateData.publishedAt = null;
      }
    }

    if (body.action) {
      switch (body.action) {
        case "publish":
          if (currentRaffle.status !== "DRAFT") {
            return NextResponse.json(
              { error: "Solo se pueden publicar rifas en borrador" },
              { status: 400 }
            );
          }
          updateData.status = "PUBLISHED";
          updateData.publishedAt = new Date();
          break;

        case "activate":
          if (!["PUBLISHED", "DRAFT"].includes(currentRaffle.status)) {
            return NextResponse.json(
              { error: "Solo se pueden activar rifas publicadas o en borrador" },
              { status: 400 }
            );
          }
          updateData.status = "ACTIVE";
          updateData.startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
          updateData.publishedAt = currentRaffle.publishedAt || new Date();
          break;

        case "finish":
          if (currentRaffle.status !== "ACTIVE") {
            return NextResponse.json(
              { error: "Solo se pueden finalizar rifas activas" },
              { status: 400 }
            );
          }
          updateData.status = "FINISHED";
          updateData.drawnAt = new Date();
          break;

        case "cancel":
          if (["FINISHED", "CANCELLED"].includes(currentRaffle.status)) {
            return NextResponse.json(
              { error: "No se puede cancelar una rifa ya finalizada o cancelada" },
              { status: 400 }
            );
          }
          updateData.status = "CANCELLED";
          break;

        default:
          console.warn(`Unknown action: ${body.action}`);
          break;
      }
    }

    // --- Consolidar valores finales para validar capacidad mínima
    const finalPrizeValue =
      (updateData.prizeValue !== undefined
        ? updateData.prizeValue
        : currentRaffle.prizeValue) ?? null;
    const finalMaxTickets =
      (updateData.maxTickets !== undefined
        ? updateData.maxTickets
        : currentRaffle.maxTickets) ?? null;

    if (finalPrizeValue !== null && finalMaxTickets !== null) {
      const minParticipants = Math.ceil(
        finalPrizeValue / POT_CONTRIBUTION_PER_TICKET
      );
      if (finalMaxTickets < minParticipants) {
        return NextResponse.json(
          {
            error: `Capacidad insuficiente: para un premio de $${finalPrizeValue} se requieren al menos ${minParticipants} participantes.`,
            code: "VALIDATION_ERROR",
            details: {
              maxTickets: finalMaxTickets,
              minParticipants,
              prizeValue: finalPrizeValue,
              contributionPerTicket: POT_CONTRIBUTION_PER_TICKET,
            },
          },
          { status: 400 }
        );
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    }

    const updatedRaffle = await prisma.raffle.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { tickets: true, participations: true } },
        owner: { select: { id: true, name: true, email: true } },
        winner: { select: { id: true, name: true, email: true } },
      },
    });

    // Exponer unitPrice derivado (no persistido), útil para la UI
    return NextResponse.json({
      success: true,
      message: "Sorteo actualizado exitosamente",
      raffle: updatedRaffle,
      unitPrice: POT_CONTRIBUTION_PER_TICKET,
    });
  } catch (error) {
    console.error("PUT /api/admin/raffles/[id] error:", error);
    return NextResponse.json(
      {
        error: "Error al actualizar sorteo",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Eliminar un sorteo
 */
export async function DELETE(_request, { params }) {
  try {
    const { id } = params;

    const session = await getServerSession(authOptions);
    const permissionCheck = checkPermissions(session, "delete");
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { error: permissionCheck.error },
        { status: permissionCheck.status }
      );
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true, participations: true } } },
    });

    if (!raffle) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const ownershipCheck = checkPermissions(session, "delete", raffle);
    if (!ownershipCheck.allowed) {
      return NextResponse.json(
        { error: ownershipCheck.error },
        { status: ownershipCheck.status }
      );
    }

    const hasParticipants =
      (raffle._count?.tickets ?? 0) > 0 ||
      (raffle._count?.participations ?? 0) > 0;
    if (hasParticipants && permissionCheck.role !== "superadmin") {
      return NextResponse.json(
        {
          error: `No se puede eliminar: hay ${raffle._count.tickets} tickets y ${raffle._count.participations} participaciones. Solo SUPERADMIN puede forzar eliminación.`,
          code: "CANNOT_DELETE_WITH_PARTICIPANTS",
          details: {
            ticketsCount: raffle._count.tickets,
            participationsCount: raffle._count.participations,
          },
        },
        { status: 400 }
      );
    }

    await prisma.raffle.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Sorteo eliminado exitosamente",
    });
  } catch (error) {
    console.error("DELETE /api/admin/raffles/[id] error:", error);
    return NextResponse.json(
      {
        error: "Error al eliminar sorteo",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
