// src/app/api/raffles/[id]/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { TICKET_PRICE, POT_CONTRIBUTION_PER_TICKET } from "@/lib/ticket.server";

/** Valida formatos típicos de YouTube */
function isValidYouTubeUrl(u = "") {
  try {
    const url = new URL(u);
    if (!/^(www\.)?(youtube\.com|youtu\.be)$/i.test(url.hostname)) return false;
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).length > 0;
    if (url.pathname === "/watch") return !!url.searchParams.get("v");
    if (/^\/(live|shorts)\/[A-Za-z0-9_-]+$/.test(url.pathname)) return true;
    if (/^\/embed\/[A-Za-z0-9_-]+$/.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

// Normaliza "regla en miles" para prizeValue
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

/* =======================
   GET /api/raffles/[id]
   ======================= */
export async function GET(_req, ctx) {
  try {
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id || null;
    const viewerRole = String(session?.user?.role || "").toUpperCase();
    const isAdmin = viewerRole === "ADMIN" || viewerRole === "SUPERADMIN";
    const isSuper = viewerRole === "SUPERADMIN";

    const { id } = await ctx.params;

    const raffle = await prisma.raffle.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,

        // 👇 claves para media/metadatos
        youtubeUrl: true,
        prizeCategory: true,
        freeShipping: true, // 🚚 persistencia del envío

        prizeValue: true,
        maxParticipants: true,
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        ownerId: true,
        isPrivate: true,

        // reglas por participante
        minTicketsPerParticipant: true,
        minTicketsIsMandatory: true,

        // opcional si lo tuvieras en el modelo
        ownerImage: true,

        owner: { select: { id: true, name: true, email: true, image: true } },
        _count: { select: { tickets: true, participations: true } },
      },
    });

    if (!raffle) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const isOwner = viewerId && raffle.ownerId === viewerId;

    // visibilidad pública
    const publicStates = new Set(["PUBLISHED", "ACTIVE", "FINISHED", "READY_TO_DRAW", "READY_TO_FINISH"]);

    if (raffle.isPrivate) {
      const canSeeByLink = publicStates.has(raffle.status);
      const canModerate = isOwner || isAdmin;
      if (!canSeeByLink && !canModerate) {
        return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
      }
    } else {
      if (!publicStates.has(raffle.status) && !(isOwner || isAdmin)) {
        return NextResponse.json({ error: "Sorteo no disponible" }, { status: 404 });
      }
    }

    return NextResponse.json({
      success: true,
      raffle: {
        ...raffle,
        unitPrice: TICKET_PRICE,
      },
      meta: {
        ticketPrice: TICKET_PRICE,
        viewer: {
          isOwner: !!isOwner,
          isAdmin: !!isAdmin,
          isSuperAdmin: !!isSuper,
        },
      },
    });
  } catch (err) {
    console.error("GET /api/raffles/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* =======================
   PUT /api/raffles/[id]
   ======================= */
export async function PUT(req, ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const existing = await prisma.raffle.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true, participations: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const role = String(session.user?.role || "").toUpperCase();
    const isAdmin = role === "ADMIN" || role === "SUPERADMIN";
    const isSuper = role === "SUPERADMIN";
    const isOwner = !!session.user?.id && existing.ownerId === session.user.id;

    if (!isOwner && !isAdmin && !isSuper) {
      return NextResponse.json(
        { error: "No autorizado para modificar este sorteo" },
        { status: 403 }
      );
    }

    if (existing.isLocked && !isSuper) {
      return NextResponse.json(
        { error: "Rifa bloqueada. Solo SUPERADMIN puede modificarla." },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!isSuper) {
      delete body?.ownerId;
      delete body?.isLocked;
      delete body?.winnerId;
      delete body?.winnerParticipationId;
      delete body?.winningTicket;
    }

    const {
      title,
      description,
      startsAt,
      endsAt,
      participantLimit,
      maxParticipants,             // alias aceptado
      published,
      imageUrl,

      // nuevos meta
      youtubeUrl,
      prizeCategory,
      freeShipping,                // 🚚 toggle de envío
      isPrivate,                   // toggle visibilidad

      // reglas por participante
      minTicketsPerParticipant,
      minTicketsIsMandatory,

      // valor del premio (con regla en miles)
      prizeValue,

      makePublicIfPublished,
      notifyParticipants,
    } = body || {};

    const hasParticipants =
      (existing._count?.participations ?? 0) > 0 ||
      (existing._count?.tickets ?? 0) > 0;

    const isFinalized =
      existing.status === "FINISHED" ||
      existing.status === "COMPLETED" ||
      existing.status === "CANCELLED";

    const data = {};
    const changed = [];

    if (title !== undefined) {
      if (hasParticipants && !isFinalized) {
        // ignorar si hay actividad y no está finalizado
      } else {
        const t = String(title).trim();
        if (!t) {
          return NextResponse.json({ error: "El título no puede estar vacío" }, { status: 400 });
        }
        if (t !== existing.title) {
          data.title = t;
          changed.push("título");
        }
      }
    }

    if (description !== undefined) {
      const d = String(description);
      if (d !== existing.description) {
        data.description = d;
        changed.push("descripción");
      }
    }

    if (imageUrl !== undefined) {
      const img = imageUrl ? String(imageUrl).trim() : null;
      if (img !== existing.imageUrl) {
        data.imageUrl = img;
        changed.push("imagen");
      }
    }

    // YouTube
    if (youtubeUrl !== undefined) {
      const y = youtubeUrl ? String(youtubeUrl).trim() : null;
      if (y && !isValidYouTubeUrl(y)) {
        return NextResponse.json({ error: "El enlace de YouTube no es válido" }, { status: 400 });
      }
      if (y !== existing.youtubeUrl) {
        data.youtubeUrl = y;
        changed.push("video de YouTube");
      }
    }

    // Categoría
    if (prizeCategory !== undefined) {
      const c = prizeCategory ? String(prizeCategory).trim() : null;
      if (c !== existing.prizeCategory) {
        data.prizeCategory = c;
        changed.push("categoría");
      }
    }

    // 🚚 Envío (toggle)
    if (freeShipping !== undefined) {
      const val = !!freeShipping;
      if (val !== existing.freeShipping) {
        data.freeShipping = val;
        changed.push(val ? "envío gratis" : "acordar entrega");
      }
    }

    // Visibilidad (isPrivate)
    if (isPrivate !== undefined) {
      const v = !!isPrivate;
      if (v !== existing.isPrivate) {
        data.isPrivate = v;
        changed.push(v ? "modo privado" : "modo público");
      }
    }

    // Reglas por participante
    if (minTicketsPerParticipant !== undefined) {
      const m = Math.max(1, parseInt(minTicketsPerParticipant, 10) || 1);
      const prevM = existing.minTicketsPerParticipant || 1;
      if (hasParticipants && m > prevM && !isSuper) {
        return NextResponse.json(
          { error: `No podés aumentar el mínimo de tickets por participante (actual: ${prevM}).` },
          { status: 400 }
        );
      }
      if (m !== existing.minTicketsPerParticipant) {
        data.minTicketsPerParticipant = m;
        changed.push("mínimo de tickets por participante");
      }
    }

    if (minTicketsIsMandatory !== undefined) {
      const mand = !!minTicketsIsMandatory;
      if (hasParticipants && !existing.minTicketsIsMandatory && mand && !isSuper) {
        return NextResponse.json(
          { error: "No podés activar la obligatoriedad de tickets porque ya hay participantes." },
          { status: 400 }
        );
      }
      if (mand !== existing.minTicketsIsMandatory) {
        data.minTicketsIsMandatory = mand;
        changed.push(mand ? "regla obligatoria" : "regla sugerida");
      }
    }

    // prizeValue (regla en miles, coherencia con participantLimit/maxParticipants)
    if (prizeValue !== undefined) {
      const pv = normalizePrizeValue(prizeValue);
      if (!pv || pv < 1000) {
        return NextResponse.json(
          { error: "El valor del premio debe ser un entero ≥ 1000" },
          { status: 400 }
        );
      }
      if (pv !== existing.prizeValue) {
        // Aseguramos coherencia con maxParticipants (existente o nuevo si viene)
        const divisor = (data.minTicketsIsMandatory ?? existing.minTicketsIsMandatory)
          ? Math.max(1, data.minTicketsPerParticipant ?? existing.minTicketsPerParticipant ?? 1)
          : 1;
        const baseNeeded = Math.ceil(pv / POT_CONTRIBUTION_PER_TICKET);
        const minRequired = Math.ceil(baseNeeded / divisor);
        const targetLimit = (data.maxParticipants ?? existing.maxParticipants) || 0;

        if (!isSuper && targetLimit && targetLimit < minRequired) {
          return NextResponse.json(
            { error: `Con ese premio, participantLimit debe ser ≥ ${minRequired}` },
            { status: 400 }
          );
        }

        data.prizeValue = pv;
        changed.push("valor del premio");
      }
    }

    // startsAt
    if (startsAt !== undefined) {
      const startDate = startsAt ? new Date(startsAt) : null;
      if (startDate && isNaN(startDate.getTime())) {
        return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 });
      }
      if (startDate && startDate <= new Date()) {
        return NextResponse.json({ error: "La fecha de inicio debe ser futura" }, { status: 400 });
      }
      const prev = existing.startsAt ? existing.startsAt.toISOString() : null;
      const next = startDate ? startDate.toISOString() : null;
      if (prev !== next) {
        data.startsAt = startDate;
        changed.push("fecha de inicio");
      }
    }

    // endsAt
    if (endsAt !== undefined) {
      const endDate = endsAt ? new Date(endsAt) : null;
      if (endDate && isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "Fecha de finalización inválida" }, { status: 400 });
      }
      if (endDate && endDate <= new Date()) {
        return NextResponse.json({ error: "La fecha de finalización debe ser futura" }, { status: 400 });
      }
      const effectiveStart = data.startsAt ?? existing.startsAt;
      if (endDate && effectiveStart && endDate <= effectiveStart) {
        return NextResponse.json(
          { error: "La fecha de finalización debe ser posterior a la de inicio" },
          { status: 400 }
        );
      }
      const prev = existing.endsAt ? existing.endsAt.toISOString() : null;
      const next = endDate ? endDate.toISOString() : null;
      if (prev !== next) {
        data.endsAt = endDate;
        changed.push("fecha de finalización");
      }
    }

    // participantLimit o alias maxParticipants
    const participantLimitRaw = participantLimit ?? maxParticipants;
    if (participantLimitRaw !== undefined) {
      const mp = participantLimitRaw === null ? null : Math.trunc(Number(participantLimitRaw));
      if (mp === null || !Number.isFinite(mp) || mp <= 0) {
        return NextResponse.json(
          { error: "participantLimit debe ser un entero mayor a 0" },
          { status: 400 }
        );
      }
      const effectivePrize = data.prizeValue ?? existing.prizeValue ?? 0;
      const divisor = (data.minTicketsIsMandatory ?? existing.minTicketsIsMandatory)
        ? Math.max(1, data.minTicketsPerParticipant ?? existing.minTicketsPerParticipant ?? 1)
        : 1;
      const baseNeeded = Math.ceil(effectivePrize / POT_CONTRIBUTION_PER_TICKET);
      const minNeeded = Math.ceil(baseNeeded / divisor);
      if (mp < minNeeded) {
        return NextResponse.json(
          { error: `participantLimit debe ser ≥ ${minNeeded} para cubrir el premio` },
          { status: 400 }
        );
      }
      if (mp !== existing.maxParticipants) {
        data.maxParticipants = mp;
        changed.push("límite de participantes");
      }
    }

    // published toggle
    if (published !== undefined) {
      const wantPublished = !!published;
      if (wantPublished) {
        if (!existing.publishedAt) data.publishedAt = new Date();

        const effectiveStart = (data.startsAt ?? existing.startsAt) || null;
        const startIsPastOrNull = !effectiveStart || new Date(effectiveStart) <= new Date();

        const newStatus = startIsPastOrNull ? "ACTIVE" : "PUBLISHED";
        if (existing.status !== newStatus) {
          data.status = newStatus;
          changed.push(newStatus === "ACTIVE" ? "activación" : "publicación");
        }

        if (makePublicIfPublished === true && existing.isPrivate) {
          data.isPrivate = false;
          changed.push("visibilidad (ahora público)");
        }
      } else {
        if (existing.status !== "DRAFT") {
          data.status = "DRAFT";
          data.publishedAt = null;
          changed.push("publicación (despublicado)");
        }
      }
    }

    if (Object.keys(data).length === 0) {
      const current = await prisma.raffle.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          youtubeUrl: true,
          prizeCategory: true,
          freeShipping: true, // 👈
          prizeValue: true,
          maxParticipants: true,
          startsAt: true,
          endsAt: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          publishedAt: true,
          ownerId: true,
          isPrivate: true,
          minTicketsPerParticipant: true,
          minTicketsIsMandatory: true,
          ownerImage: true,
          owner: { select: { id: true, name: true, email: true, image: true } },
          _count: { select: { tickets: true, participations: true } },
        },
      });
      return NextResponse.json({
        success: true,
        message: "Sin cambios",
        raffle: { ...current, unitPrice: TICKET_PRICE },
      });
    }

    const updated = await prisma.raffle.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        youtubeUrl: true,
        prizeCategory: true,
        freeShipping: true, // 👈
        prizeValue: true,
        maxParticipants: true,
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        ownerId: true,
        isPrivate: true,
        minTicketsPerParticipant: true,
        minTicketsIsMandatory: true,
        ownerImage: true,
        owner: { select: { id: true, name: true, email: true, image: true } },
        _count: { select: { tickets: true, participations: true } },
      },
    });

    // Auditoría (best-effort)
    try {
      await prisma.auditLog.create({
        data: {
          action: "update_raffle",
          userId: session.user.id,
          targetType: "raffle",
          targetId: id,
          oldValues: {
            title: existing.title,
            description: existing.description,
            imageUrl: existing.imageUrl,
            youtubeUrl: existing.youtubeUrl,
            prizeCategory: existing.prizeCategory,
            freeShipping: existing.freeShipping, // 👈
            startsAt: existing.startsAt,
            endsAt: existing.endsAt,
            maxParticipants: existing.maxParticipants,
            status: existing.status,
            isPrivate: existing.isPrivate,
            publishedAt: existing.publishedAt,
            isLocked: existing.isLocked,
            minTicketsPerParticipant: existing.minTicketsPerParticipant,
            minTicketsIsMandatory: existing.minTicketsIsMandatory,
            prizeValue: existing.prizeValue,
          },
          newValues: data,
        },
      });
    } catch (e) {
      console.warn("auditLog update failed (ignored):", e?.message || e);
    }

    // notificaciones opcionales
    if (notifyParticipants === true && changed.length > 0) {
      try {
        const parts = await prisma.participation.findMany({
          where: { raffleId: id },
          select: { ticket: { select: { userId: true } } },
        });
        const userIdsSet = new Set(parts.map((p) => p.ticket.userId).filter(Boolean));
        if (userIdsSet.size > 0) {
          const changesText = changed.join(", ");
          const toCreate = Array.from(userIdsSet).map((uid) => ({
            userId: uid,
            type: "SYSTEM_ALERT",
            title: "Actualización del sorteo",
            message: `El sorteo "${updated.title}" tuvo cambios: ${changesText}.`,
            raffleId: id,
          }));
          await prisma.notification.createMany({ data: toCreate });
        }
      } catch (e) {
        console.warn("Notifications failed (ignored):", e?.message || e);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Sorteo actualizado",
      raffle: { ...updated, unitPrice: TICKET_PRICE },
    });
  } catch (err) {
    console.error("PUT /api/raffles/[id] error:", err);
    return NextResponse.json(
      {
        error: "Error al actualizar sorteo",
        details: process.env.NODE_ENV === "development" ? err.message : undefined,
      },
      { status: 500 }
    );
  }
}

/* =======================
   DELETE /api/raffles/[id]
   ======================= */
export async function DELETE(_req, ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const existing = await prisma.raffle.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true, participations: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const role = String(session.user?.role || "").toUpperCase();
    const isSuper = role === "SUPERADMIN";
    const isAdmin = role === "ADMIN" || role === "SUPERADMIN";
    const isOwner = !!session.user?.id && existing.ownerId === session.user.id;

    if (existing.isLocked && !isSuper) {
      return NextResponse.json(
        { error: "Rifa bloqueada. Solo SUPERADMIN puede eliminarla." },
        { status: 403 }
      );
    }

    const ticketsCount = existing._count?.tickets ?? 0;
    const partsCount = existing._count?.participations ?? 0;

    if (ticketsCount > 0 || partsCount > 0) {
      if (!isSuper) {
        return NextResponse.json(
          {
            error:
              "No se puede eliminar: hay participantes/tickets. Solo SUPERADMIN puede forzar eliminación.",
          },
          { status: 400 }
        );
      }
    } else {
      if (!isOwner && !isAdmin && !isSuper) {
        return NextResponse.json(
          { error: "No autorizado para eliminar" },
          { status: 403 }
        );
      }
    }

    try {
      await prisma.auditLog.create({
        data: {
          action: "delete_raffle",
          userId: session.user.id,
          targetType: "raffle",
          targetId: id,
          oldValues: {
            title: existing.title,
            status: existing.status,
            prizeValue: existing.prizeValue,
            maxParticipants: existing.maxParticipants,
            isPrivate: existing.isPrivate,
            isLocked: existing.isLocked,
            freeShipping: existing.freeShipping, // 👈 auditoría
            counters: { ticketsCount, partsCount },
          },
        },
      });
    } catch (e) {
      console.warn("auditLog delete failed (ignored):", e?.message || e);
    }

    await prisma.raffle.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Sorteo eliminado exitosamente" });
  } catch (err) {
    console.error("DELETE /api/raffles/[id] error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
