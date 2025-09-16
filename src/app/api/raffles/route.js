// src/app/api/raffles/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  TICKET_PRICE,
  POT_CONTRIBUTION_PER_TICKET,
} from "@/lib/ticket.server";

/* =======================
   Helpers
   ======================= */

// Valida fechas
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

// Normaliza "regla en miles"
function normalizePrizeValue(raw) {
  if (raw === null || raw === undefined) return null;
  let n = Number.isFinite(raw) ? Math.trunc(raw) : NaN;
  if (!Number.isFinite(n)) {
    const cleaned = String(raw).replace(/[^\d]/g, "");
    n = cleaned ? parseInt(cleaned, 10) : NaN;
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1000 ? n * 1000 : n;
}

// Aceptamos SOLO imágenes locales bajo /uploads
function sanitizeLocalImageUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  return s.startsWith("/uploads/") ? s : null;
}

/* =======================
   POST: Crear rifa
   ======================= */

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "No autorizado. Debes iniciar sesión.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true, image: true },
    });
    if (!dbUser) {
      return NextResponse.json(
        {
          error: "Usuario no encontrado en la base de datos",
          code: "USER_NOT_FOUND",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      prizeValue,        // requerido
      participantGoal,   // opcional
      startsAt,          // opcional
      endsAt,            // opcional
      imageUrl,          // opcional (solo local /uploads/*.webp)
      category,          // opcional → prizeCategory
      isPrivate,         // opcional (default false)

      // UX (no persistidos como columnas reales)
      minTicketsPerParticipant,
      recommendedTicketsPerParticipant
    } = body ?? {};

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "El título es requerido", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (!description?.trim()) {
      return NextResponse.json(
        { error: "La descripción no puede estar vacía", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const prizeValueInt = normalizePrizeValue(prizeValue);
    if (!prizeValueInt || prizeValueInt < 1000) {
      return NextResponse.json(
        {
          error:
            "El valor del premio es obligatorio y debe ser un entero ≥ 1000",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    // Si hay fechas, validarlas (ya no exigimos endsAt cuando no hay goal)
    let processedStartDate = null;
    let processedEndDate = null;
    if (startsAt || endsAt) {
      const dateValidation = validateDates(startsAt, endsAt);
      if (!dateValidation.valid) {
        return NextResponse.json(
          { error: dateValidation.error, code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      processedStartDate = dateValidation.startDate;
      processedEndDate = dateValidation.endDate;
    }

    const minParticipants = Math.ceil(prizeValueInt / POT_CONTRIBUTION_PER_TICKET);

    let maxParticipants = minParticipants;
    if (participantGoal !== undefined && participantGoal !== null && String(participantGoal).trim() !== "") {
      const goalInt = Math.trunc(Number(participantGoal));
      if (!Number.isFinite(goalInt) || goalInt < minParticipants) {
        return NextResponse.json(
          {
            error: `El objetivo de participantes debe ser un entero ≥ ${minParticipants}`,
            code: "VALIDATION_ERROR",
          },
          { status: 400 }
        );
      }
      maxParticipants = goalInt;
    }

    // Solo aceptar imágenes locales
    const finalImageUrl = sanitizeLocalImageUrl(imageUrl);

    const initialStatus = processedStartDate ? "PUBLISHED" : "ACTIVE";
    const isPrivateFlag = typeof isPrivate === "boolean" ? isPrivate : false;

    let raffle;
    try {
      raffle = await prisma.raffle.create({
        data: {
          title: title.trim(),
          description: description.trim(),
          prizeValue: prizeValueInt,
          maxParticipants,
          startsAt: processedStartDate,
          endsAt: processedEndDate,
          imageUrl: finalImageUrl,             // <= solo /uploads/*
          prizeCategory: category?.trim() || null,
          status: initialStatus,
          publishedAt: new Date(),
          ownerImage: dbUser.image || session.user.image || null,
          isPrivate: isPrivateFlag,
          owner: { connect: { id: dbUser.id } },
        },
        include: {
          owner: {
            select: { id: true, name: true, email: true, image: true, role: true },
          },
          _count: { select: { tickets: true, participations: true } },
        },
      });
    } catch (createError) {
      console.error("Error en creación de rifa:", createError);
      throw createError;
    }

    // audit log (best-effort)
    try {
      await prisma.auditLog.create({
        data: {
          action: "create_raffle",
          userId: dbUser.id,
          targetType: "raffle",
          targetId: raffle.id,
          newValues: {
            title: raffle.title,
            prizeValue: raffle.prizeValue,
            maxParticipants: raffle.maxParticipants,
            status: raffle.status,
            isPrivate: raffle.isPrivate,
            prizeCategory: raffle.prizeCategory || null,
          },
        },
      });
    } catch (e) {
      console.warn("auditLog create failed (ignored):", e?.message || e);
    }

    // notificación (best-effort)
    try {
      await prisma.notification.create({
        data: {
          userId: dbUser.id,
          type: "RAFFLE_CREATED",
          title: "Rifa creada exitosamente",
          message: `Tu rifa "${raffle.title}" ha sido creada${
            raffle.status === "ACTIVE" ? " y ya está activa" : ""
          }.`,
          raffleId: raffle.id,
        },
      });
    } catch (e) {
      console.warn("notification create failed (ignored):", e?.message || e);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Rifa creada exitosamente",
        raffle,
        meta: {
          minParticipants,  // auxiliar para UI
          ticketPrice: TICKET_PRICE,
        },
        code: "RAFFLE_CREATED",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating raffle:", error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe una rifa con datos similares", code: "DUPLICATE_ERROR" },
        { status: 409 }
      );
    }
    if (error?.code === "P2003") {
      return NextResponse.json(
        { error: "Usuario no encontrado", code: "USER_NOT_FOUND" },
        { status: 400 }
      );
    }
    if (error?.code === "P2025") {
      return NextResponse.json(
        { error: "Registro no encontrado", code: "RECORD_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: "Error interno del servidor",
        code: "INTERNAL_SERVER_ERROR",
        details:
          process.env.NODE_ENV === "development"
            ? String(error.message || error)
            : undefined,
      },
      { status: 500 }
    );
  }
}

/* =======================
   GET: Listar rifas
   ======================= */

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const sp = url.searchParams;

    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") || "10", 10)));
    const skip = (page - 1) * limit;

    const status = sp.get("status");
    const ownerIdParam = sp.get("ownerId");
    const search = sp.get("search") || sp.get("q") || "";

    const mine = sp.get("mine") === "1" || sp.get("mine") === "true";
    const asUserParam = (sp.get("asUser") || "").trim();
    const includePrivate =
      sp.get("includePrivate") === "1" || sp.get("includePrivate") === "true";

    const sortBy = (sp.get("sortBy") || "createdAt").toLowerCase();
    const order = (sp.get("order") || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id || null;
    const role = String(session?.user?.role || "").toUpperCase();
    const isSuperAdmin = role === "SUPERADMIN";

    const where = {};
    let effectiveOwnerId = null;
    const impersonating = isSuperAdmin && !!asUserParam;

    if (impersonating) {
      effectiveOwnerId = asUserParam;
      where.ownerId = asUserParam;
      if (!includePrivate) where.isPrivate = false;
    } else if (mine) {
      if (!userId) {
        return NextResponse.json(
          { error: "No autorizado. Debes iniciar sesión.", code: "UNAUTHORIZED" },
          { status: 401 }
        );
      }
      effectiveOwnerId = userId;
      where.ownerId = userId;
    } else {
      where.isPrivate = false;
      if (!status) {
        where.status = { in: ["PUBLISHED", "ACTIVE", "READY_TO_DRAW", "FINISHED"] };
      }
      if (ownerIdParam) {
        where.ownerId = ownerIdParam;
      }
    }

    if (
      status &&
      ["DRAFT","PUBLISHED","ACTIVE","READY_TO_DRAW","FINISHED","CANCELLED","COMPLETED"].includes(status)
    ) {
      where.status = status;
    }

    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    let orderBy = [{ createdAt: order }];
    if (sortBy === "participants" || sortBy === "participations") {
      orderBy = [{ participations: { _count: order } }, { createdAt: "desc" }];
    } else if (sortBy === "createdat") {
      orderBy = [{ createdAt: order }];
    }

    const [rows, total] = await Promise.all([
      prisma.raffle.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          prizeValue: true,
          prizeCategory: true,
          maxParticipants: true,
          startsAt: true,
          endsAt: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          isPrivate: true,
          ownerId: true,
          owner: {
            select: { id: true, name: true, email: true, image: true, role: true },
          },
          winner: { select: { id: true, name: true, image: true } },
          _count: { select: { tickets: true, participations: true } },
        },
      }),
      prisma.raffle.count({ where }),
    ]);

    const rafflesWithStats = rows.map((raffle) => ({
      ...raffle,
      unitPrice: TICKET_PRICE,
      stats: {
        totalTickets: raffle._count?.tickets ?? 0,
        totalParticipations: raffle._count?.participations ?? 0,
        ticketsSold: raffle._count?.tickets ?? 0,
        maxParticipantsReached: raffle.maxParticipants
          ? (raffle._count?.tickets ?? 0) >= raffle.maxParticipants
          : false,
        daysLeft: raffle.endsAt
          ? Math.max(
              0,
              Math.ceil((new Date(raffle.endsAt) - new Date()) / (1000 * 60 * 60 * 24))
            )
          : null,
        isExpired: raffle.endsAt ? new Date() > new Date(raffle.endsAt) : false,
      },
    }));

    return NextResponse.json({
      success: true,
      raffles: rafflesWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
      meta: { ticketPrice: TICKET_PRICE },
      filters: {
        status,
        ownerId: ownerIdParam,
        search,
        mine: mine ? "1" : undefined,
        asUser: isSuperAdmin ? (asUserParam || undefined) : undefined,
        includePrivate: isSuperAdmin ? (includePrivate ? "1" : "0") : undefined,
      },
      code: "RAFFLES_FETCHED",
    });
  } catch (error) {
    console.error("Error fetching raffles:", error);
    return NextResponse.json(
      {
        error: "Error al obtener las rifas",
        code: "FETCH_ERROR",
        details:
          process.env.NODE_ENV === "development"
            ? String(error.message || error)
            : undefined,
      },
      { status: 500 }
    );
  }
}

/* =======================
   PUT y DELETE
   ======================= */

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "No autorizado", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });
    if (!dbUser) {
      return NextResponse.json(
        {
          error: "Usuario no encontrado en la base de datos",
          code: "USER_NOT_FOUND",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { id, action, ...updateData } = body;

    if (!id?.trim()) {
      return NextResponse.json(
        { error: "ID de rifa requerido", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const existingRaffle = await prisma.raffle.findUnique({
      where: { id: id.trim() },
      include: { owner: true },
    });
    if (!existingRaffle) {
      return NextResponse.json(
        { error: "Rifa no encontrada", code: "RAFFLE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const role = String(dbUser.role || "").toUpperCase();
    const isOwner = existingRaffle.ownerId === dbUser.id;
    if (!isOwner && role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "No tienes permisos para modificar esta rifa", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    let updateObject = {};

    switch (action) {
      case "publish":
        if (existingRaffle.status !== "DRAFT") {
          return NextResponse.json(
            { error: "Solo se pueden publicar rifas en estado borrador", code: "INVALID_STATUS" },
            { status: 400 }
          );
        }
        updateObject = { status: "PUBLISHED", publishedAt: new Date() };
        break;

      case "activate":
        if (!["PUBLISHED", "DRAFT"].includes(existingRaffle.status)) {
          return NextResponse.json(
            { error: "Solo se pueden activar rifas publicadas o en borrador", code: "INVALID_STATUS" },
            { status: 400 }
          );
        }
        updateObject = {
          status: "ACTIVE",
          startsAt: updateData.startsAt ? new Date(updateData.startsAt) : new Date(),
          publishedAt: existingRaffle.publishedAt || new Date(),
        };
        break;

      case "finish":
        if (existingRaffle.status !== "ACTIVE" && existingRaffle.status !== "READY_TO_DRAW") {
          return NextResponse.json(
            { error: "Solo se pueden finalizar rifas activas o listas para sortear", code: "INVALID_STATUS" },
            { status: 400 }
          );
        }
        updateObject = { status: "FINISHED", drawnAt: new Date() };
        break;

      case "cancel":
        if (["FINISHED", "CANCELLED"].includes(existingRaffle.status)) {
          return NextResponse.json(
            { error: "No se puede cancelar una rifa ya finalizada o cancelada", code: "INVALID_STATUS" },
            { status: 400 }
          );
        }
        updateObject = { status: "CANCELLED" };
        break;

      default:
        if (updateData.title !== undefined) {
          const t = String(updateData.title).trim();
          if (!t) {
            return NextResponse.json(
              { error: "El título no puede estar vacío", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          updateObject.title = t;
        }

        if (updateData.description !== undefined) {
          const d = String(updateData.description).trim();
          if (!d) {
            return NextResponse.json(
              { error: "La descripción no puede estar vacía", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          updateObject.description = d;
        }

        if (updateData.prizeValue !== undefined) {
          const pv = normalizePrizeValue(updateData.prizeValue);
          if (!pv || pv < 1000) {
            return NextResponse.json(
              { error: "El valor del premio debe ser un entero ≥ 1000", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          updateObject.prizeValue = pv;

          const minNeeded = Math.ceil(pv / POT_CONTRIBUTION_PER_TICKET);
          const targetMax =
            updateData.maxParticipants !== undefined && updateData.maxParticipants !== null
              ? Math.trunc(Number(updateData.maxParticipants))
              : existingRaffle.maxParticipants;

          if (!Number.isFinite(targetMax) || targetMax < minNeeded) {
            return NextResponse.json(
              { error: `maxParticipants debe ser ≥ ${minNeeded} para cubrir el premio`, code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          if (updateData.maxParticipants === undefined) {
            updateObject.maxParticipants = targetMax;
          }
        }

        if (updateData.maxParticipants !== undefined) {
          const mp =
            updateData.maxParticipants === null
              ? null
              : Math.trunc(Number(updateData.maxParticipants));
          if (mp === null || !Number.isFinite(mp) || mp <= 0) {
            return NextResponse.json(
              { error: "maxParticipants debe ser un entero mayor a 0", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          if (updateObject.prizeValue === undefined) {
            const minNeeded = Math.ceil(
              (existingRaffle.prizeValue ?? 0) / POT_CONTRIBUTION_PER_TICKET
            );
            if (mp < minNeeded) {
              return NextResponse.json(
                { error: `maxParticipants debe ser ≥ ${minNeeded}`, code: "VALIDATION_ERROR" },
                { status: 400 }
              );
            }
          }
          updateObject.maxParticipants = mp;
        }

        // Solo permitimos URLs locales
        if (updateData.imageUrl !== undefined) {
          updateObject.imageUrl = sanitizeLocalImageUrl(updateData.imageUrl);
        }

        if (updateData.category !== undefined) {
          updateObject.prizeCategory = updateData.category
            ? String(updateData.category).trim()
            : null;
        }

        if (updateData.isPrivate !== undefined) {
          if (typeof updateData.isPrivate !== "boolean") {
            return NextResponse.json(
              { error: "isPrivate debe ser boolean", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          updateObject.isPrivate = updateData.isPrivate;
        }

        if (updateData.endsAt !== undefined || updateData.startsAt !== undefined) {
          const newStartsAt =
            updateData.startsAt !== undefined
              ? updateData.startsAt
              : existingRaffle.startsAt;
          const newEndsAt =
            updateData.endsAt !== undefined ? updateData.endsAt : existingRaffle.endsAt;
          const dateValidation = validateDates(newStartsAt, newEndsAt);
          if (!dateValidation.valid) {
            return NextResponse.json(
              { error: dateValidation.error, code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          if (updateData.endsAt !== undefined)
            updateObject.endsAt = dateValidation.endDate;
          if (updateData.startsAt !== undefined)
            updateObject.startsAt = dateValidation.startDate;
        }
        break;
    }

    if (Object.keys(updateObject).length === 0) {
      return NextResponse.json(
        { error: "Nada para actualizar", code: "NO_CHANGES" },
        { status: 400 }
      );
    }

    const updatedRaffle = await prisma.raffle.update({
      where: { id: id.trim() },
      data: updateObject,
      include: {
        owner: {
          select: { id: true, name: true, email: true, image: true, role: true },
        },
        winner: { select: { id: true, name: true, image: true } },
        _count: { select: { tickets: true, participations: true } },
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          action: action ? `raffle_${action}` : "update_raffle",
          userId: dbUser.id,
          targetType: "raffle",
          targetId: id.trim(),
          oldValues: {
            status: existingRaffle.status,
            title: existingRaffle.title,
            prizeValue: existingRaffle.prizeValue,
            maxParticipants: existingRaffle.maxParticipants,
            isPrivate: existingRaffle.isPrivate,
            prizeCategory: existingRaffle.prizeCategory || null,
          },
          newValues: updateObject,
        },
      });
    } catch (e) {
      console.warn("auditLog update failed (ignored):", e?.message || e);
    }

    return NextResponse.json({
      success: true,
      message: `Rifa ${action ? action : "actualizada"} exitosamente`,
      raffle: updatedRaffle,
      code: action ? `RAFFLE_${action.toUpperCase()}` : "RAFFLE_UPDATED",
    });
  } catch (error) {
    console.error("Error updating raffle:", error);

    if (error?.code === "P2025") {
      return NextResponse.json(
        { error: "Rifa no encontrada", code: "RAFFLE_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: "Error al actualizar la rifa",
        code: "UPDATE_ERROR",
        details:
          process.env.NODE_ENV === "development"
            ? String(error.message || error)
            : undefined,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "No autorizado", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });
    if (!dbUser) {
      return NextResponse.json(
        { error: "Usuario no encontrado en la base de datos", code: "USER_NOT_FOUND" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id?.trim()) {
      return NextResponse.json(
        { error: "ID de rifa requerido", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const existingRaffle = await prisma.raffle.findUnique({
      where: { id: id.trim() },
      select: {
        id: true,
        ownerId: true,
        title: true,
        status: true,
        prizeValue: true,
        maxParticipants: true,
        isPrivate: true,
        prizeCategory: true,
        _count: { select: { tickets: true, participations: true } },
      },
    });

    if (!existingRaffle) {
      return NextResponse.json(
        { error: "Rifa no encontrada", code: "RAFFLE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const role = String(dbUser.role || "").toUpperCase();
    const isOwner = existingRaffle.ownerId === dbUser.id;
    const isSuperAdmin = role === "SUPERADMIN";
    const isAdmin = role === "ADMIN";

    if (!isOwner && !isAdmin && !isSuperAdmin) {
      return NextResponse.json(
        { error: "No tienes permisos para eliminar esta rifa", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const hasTickets = (existingRaffle._count?.tickets ?? 0) > 0;
    const hasParts = (existingRaffle._count?.participations ?? 0) > 0;

    if (!isSuperAdmin && (hasTickets || hasParts)) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: la rifa tiene tickets o participaciones registradas",
          code: "HAS_REFS",
        },
        { status: 409 }
      );
    }

    await prisma.raffle.delete({ where: { id: id.trim() } });

    // Audit log (best-effort)
    try {
      await prisma.auditLog.create({
        data: {
          action: "delete_raffle",
          userId: dbUser.id,
          targetType: "raffle",
          targetId: id.trim(),
          oldValues: {
            title: existingRaffle.title,
            status: existingRaffle.status,
            prizeValue: existingRaffle.prizeValue,
            maxParticipants: existingRaffle.maxParticipants,
            isPrivate: existingRaffle.isPrivate,
            prizeCategory: existingRaffle.prizeCategory || null,
            _count: existingRaffle._count,
          },
          newValues: { deleted: true, byRole: role },
        },
      });
    } catch (e) {
      console.warn("auditLog delete failed (ignored):", e?.message || e);
    }

    return NextResponse.json({
      success: true,
      message: "Rifa eliminada exitosamente",
      code: "RAFFLE_DELETED",
    });
  } catch (error) {
    console.error("Error deleting raffle:", error);

    if (error?.code === "P2025") {
      return NextResponse.json(
        { error: "Rifa no encontrada", code: "RAFFLE_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: "Error al eliminar la rifa",
        code: "DELETE_ERROR",
        details:
          process.env.NODE_ENV === "development"
            ? String(error.message || error)
            : undefined,
      },
      { status: 500 }
    );
  }
}
