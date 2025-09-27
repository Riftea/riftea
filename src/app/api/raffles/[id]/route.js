export const runtime = 'nodejs';
// src/app/api/raffles/[id]/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import {
  TICKET_PRICE,
  POT_CONTRIBUTION_PER_TICKET,
} from "@/lib/ticket.server";

/* =======================
   GET /api/raffles/[id]
   - Público: solo rifas NO privadas y en estado PUBLISHED/ACTIVE/FINISHED
   - Dueño/Admin/Superadmin: puede ver cualquier estado y también privadas
   ======================= */
export async function GET(_req, ctx) {
  try {
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id || null;
    const viewerRole = String(session?.user?.role || "").toUpperCase();
    const isAdmin = viewerRole === "ADMIN" || viewerRole === "SUPERADMIN";
    const isSuper = viewerRole === "SUPERADMIN";

    const { id } = await ctx.params; // ✅ evitar warning Next

    const raffle = await prisma.raffle.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
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
        owner: { select: { id: true, name: true, email: true, image: true } },
        _count: { select: { tickets: true, participations: true } },
      },
    });

    if (!raffle) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const isOwner = viewerId && raffle.ownerId === viewerId;

    // =======================
    // Visibilidad (patch)
    // =======================
    const publicStates = new Set(["PUBLISHED", "ACTIVE", "FINISHED"]);

    if (raffle.isPrivate) {
      // "No listado": visible por link SIN requerir login si está en estado público
      const canSeeByLink = publicStates.has(raffle.status);
      const canModerate = isOwner || isAdmin;
      if (!canSeeByLink && !canModerate) {
        return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
      }
    } else {
      // Público: sólo estados públicos para no dueños/admin
      if (!publicStates.has(raffle.status) && !(isOwner || isAdmin)) {
        return NextResponse.json({ error: "Sorteo no disponible" }, { status: 404 });
      }
    }

    return NextResponse.json({
      success: true,
      raffle: {
        ...raffle,
        unitPrice: TICKET_PRICE, // derivado del sistema, no de DB
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
   - Permisos: dueño, ADMIN o SUPERADMIN
   - Reglas: valida mínimos vs POT_CONTRIBUTION_PER_TICKET, fechas, etc.
   - Extra: si isLocked === true, solo SUPERADMIN puede modificar.
            Además, si NO sos SUPERADMIN no podés tocar ownerId ni isLocked.
   ======================= */
export async function PUT(req, ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await ctx.params; // ✅ evitar warning Next

    // Obtenemos rifa + conteos para reglas
    const existing = await prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: { select: { tickets: true, participations: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    // Permisos
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

    // Si está bloqueada, solo SUPERADMIN puede modificar
    if (existing.isLocked && !isSuper) {
      return NextResponse.json(
        { error: "Rifa bloqueada. Solo SUPERADMIN puede modificarla." },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Bloqueo de campos sensibles si NO es SUPERADMIN
    if (!isSuper) {
      delete body?.ownerId;
      delete body?.isLocked;
      delete body?.winnerId;
      delete body?.winnerParticipationId;
      delete body?.winningTicket;
    }

    // Flags del body
    const {
      title,
      description,
      startsAt, // ✅ ahora soportado
      endsAt,
      participantLimit,
      published,
      imageUrl,
      makePublicIfPublished,
      notifyParticipants,
    } = body || {};

    // Reglas base
    const hasParticipants =
      (existing._count?.participations ?? 0) > 0 ||
      (existing._count?.tickets ?? 0) > 0;
    const isFinalized =
      existing.status === "FINISHED" ||
      existing.status === "COMPLETED" ||
      existing.status === "CANCELLED";

    // Construir update
    const data = {};
    const changed = []; // para notificaciones

    if (title !== undefined) {
      if (hasParticipants && !isFinalized) {
        // Ignorar cambio de título mientras haya actividad y no esté finalizado
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

    // ✅ startsAt
    if (startsAt !== undefined) {
      const startDate = startsAt ? new Date(startsAt) : null;
      if (startDate && isNaN(startDate.getTime())) {
        return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 });
      }
      if (startDate && startDate <= new Date()) {
        return NextResponse.json(
          { error: "La fecha de inicio debe ser futura" },
          { status: 400 }
        );
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
        return NextResponse.json(
          { error: "La fecha de finalización debe ser futura" },
          { status: 400 }
        );
      }
      // coherencia startsAt < endsAt (si ambas disponibles)
      const effectiveStart = data.startsAt ?? existing.startsAt;
      if (endDate && effectiveStart && endDate <= effectiveStart) {
        return NextResponse.json(
          { error: "La fecha de finalización debe ser posterior a la fecha de inicio" },
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

    // participantLimit (maxParticipants)
    if (participantLimit !== undefined) {
      const mp =
        participantLimit === null ? null : Math.trunc(Number(participantLimit));
      if (mp === null || !Number.isFinite(mp) || mp <= 0) {
        return NextResponse.json(
          { error: "participantLimit debe ser un entero mayor a 0" },
          { status: 400 }
        );
      }
      const minNeeded = Math.ceil(
        (existing.prizeValue ?? 0) / POT_CONTRIBUTION_PER_TICKET
      );
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

    // published toggle + transición a PUBLISHED/ACTIVE según startsAt
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
        // despublicar -> DRAFT
        if (existing.status !== "DRAFT") {
          data.status = "DRAFT";
          data.publishedAt = null;
          changed.push("publicación (despublicado)");
        }
      }
    }

    if (Object.keys(data).length === 0) {
      // Nada para actualizar; devolvemos el actual igualmente
      const current = await prisma.raffle.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
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
            startsAt: existing.startsAt,
            endsAt: existing.endsAt,
            maxParticipants: existing.maxParticipants,
            status: existing.status,
            isPrivate: existing.isPrivate,
            publishedAt: existing.publishedAt,
            isLocked: existing.isLocked,
          },
          newValues: data,
        },
      });
    } catch (e) {
      console.warn("auditLog update failed (ignored):", e?.message || e);
    }

    // Notificar participantes si corresponde
    if (notifyParticipants === true && changed.length > 0) {
      try {
        const parts = await prisma.participation.findMany({
          where: { raffleId: id },
          select: { ticket: { select: { userId: true } } },
        });
        const userIdsSet = new Set(
          parts.map((p) => p.ticket.userId).filter(Boolean)
        );

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

/* ==========================
   DELETE /api/raffles/[id]
   - SUPERADMIN: puede borrar aun con tickets/participaciones
   - ADMIN/DUEÑO: solo sin actividad
   - Extra: si isLocked === true, solo SUPERADMIN puede borrar.
   ========================== */
export async function DELETE(_req, ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await ctx.params; // ✅ evitar warning Next

    const existing = await prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: { select: { tickets: true, participations: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const role = String(session.user?.role || "").toUpperCase();
    const isSuper = role === "SUPERADMIN";
    const isAdmin = role === "ADMIN" || role === "SUPERADMIN";
    const isOwner = !!session.user?.id && existing.ownerId === session.user.id;

    // Si está bloqueada, solo SUPERADMIN puede borrar
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

    // Auditoría (best-effort)
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
            counters: { ticketsCount, partsCount },
          },
        },
      });
    } catch (e) {
      console.warn("auditLog delete failed (ignored):", e?.message || e);
    }

    await prisma.raffle.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Sorteo eliminado exitosamente",
    });
  } catch (err) {
    console.error("DELETE /api/raffles/[id] error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
