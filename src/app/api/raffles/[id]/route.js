// src/app/api/raffles/[id]/route.js
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { TICKET_PRICE, POT_CONTRIBUTION_PER_TICKET } from "@/lib/ticket.server";

/* =======================
   GET /api/raffles/[id]
   ======================= */
export async function GET(_req, { params }) {
  try {
    const { id } = params;

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
        owner: {
          select: { name: true, email: true, image: true },
        },
        _count: {
          select: { tickets: true, participations: true },
        },
      },
    });

    if (!raffle) {
      return new Response(JSON.stringify({ error: "Sorteo no encontrado" }), { status: 404 });
    }

    return new Response(
      JSON.stringify({
        success: true,
        raffle: {
          ...raffle,
          // ✅ Precio unitario derivado desde server/env (no DB, no body)
          unitPrice: TICKET_PRICE,
        },
        meta: {
          // ✅ Campo auxiliar si la UI lo necesita
          ticketPrice: TICKET_PRICE,
        },
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/raffles/[id] error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
  }
}

/* =======================
   PUT /api/raffles/[id]
   ======================= */
export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }

    const { id } = params;

    // Obtenemos rifa + conteos para reglas
    const existing = await prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: { select: { tickets: true, participations: true } },
      },
    });
    if (!existing) {
      return new Response(JSON.stringify({ error: "Sorteo no encontrado" }), { status: 404 });
    }

    // Permisos: owner/admin/superadmin
    const role = (session.user?.role || "").toString().toLowerCase();
    const isAdmin = role === "admin";
    const isSuper = role === "superadmin";
    const isOwner = !!session.user?.id && existing.ownerId === session.user.id;
    if (!isOwner && !isAdmin && !isSuper) {
      return new Response(JSON.stringify({ error: "No autorizado para modificar este sorteo" }), { status: 403 });
    }

    const body = await req.json();

    // Flags del body
    const {
      title,
      description,
      endsAt,
      participantLimit,
      published,
      imageUrl,
      makePublicIfPublished,
      notifyParticipants,
    } = body || {};

    // Reglas: título bloqueado si hay participantes y no finalizó
    const hasParticipants =
      (existing._count?.participations ?? 0) > 0 || (existing._count?.tickets ?? 0) > 0;
    const isFinalized =
      existing.status === "FINISHED" ||
      existing.status === "COMPLETED" ||
      existing.status === "CANCELLED";

    // Construir update
    const data = {};
    const changed = []; // campos cambiados para notificar

    if (title !== undefined) {
      if (hasParticipants && !isFinalized) {
        // ignorar cambio de título
      } else {
        const t = String(title).trim();
        if (!t) {
          return new Response(JSON.stringify({ error: "El título no puede estar vacío" }), {
            status: 400,
          });
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

    if (participantLimit !== undefined) {
      const mp = participantLimit === null ? null : Math.trunc(Number(participantLimit));
      if (mp === null || !Number.isFinite(mp) || mp <= 0) {
        return new Response(
          JSON.stringify({ error: "participantLimit debe ser un entero mayor a 0" }),
          { status: 400 }
        );
      }
      // ✅ Validar mínimo según premio actual usando env: POT_CONTRIBUTION_PER_TICKET
      const minNeeded = Math.ceil((existing.prizeValue ?? 0) / POT_CONTRIBUTION_PER_TICKET);
      if (mp < minNeeded) {
        return new Response(
          JSON.stringify({ error: `participantLimit debe ser ≥ ${minNeeded} para cubrir el premio` }),
          { status: 400 }
        );
      }
      if (mp !== existing.maxParticipants) {
        data.maxParticipants = mp;
        changed.push("límite de participantes");
      }
    }

    if (endsAt !== undefined) {
      const endDate = endsAt ? new Date(endsAt) : null;
      if (endDate && isNaN(endDate.getTime())) {
        return new Response(JSON.stringify({ error: "Fecha de finalización inválida" }), {
          status: 400,
        });
      }
      if (endDate && endDate <= new Date()) {
        return new Response(
          JSON.stringify({ error: "La fecha de finalización debe ser futura" }),
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

    if (published !== undefined) {
      const wantPublished = !!published;
      if (wantPublished) {
        // si se publica, aseguramos estado PUBLISHED/ACTIVE y publishedAt
        if (!existing.publishedAt) data.publishedAt = new Date();
        if (existing.status === "DRAFT") data.status = "PUBLISHED";
        // si piden salir de privado
        if (makePublicIfPublished === true && existing.isPrivate) {
          data.isPrivate = false;
          changed.push("visibilidad (ahora público)");
        }
        if (!(existing.status === "PUBLISHED" || existing.status === "ACTIVE")) {
          changed.push("publicación");
        }
      } else {
        // despublicar -> volver a DRAFT
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
          owner: { select: { name: true, email: true, image: true } },
          _count: { select: { tickets: true, participations: true } },
        },
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: "Sin cambios",
          raffle: { ...current, unitPrice: TICKET_PRICE },
        }),
        { status: 200 }
      );
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
        owner: { select: { name: true, email: true, image: true } },
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
            endsAt: existing.endsAt,
            maxParticipants: existing.maxParticipants,
            status: existing.status,
            isPrivate: existing.isPrivate,
            publishedAt: existing.publishedAt,
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
        // Participantes = usuarios con ticket en esta rifa (via Participation o Ticket)
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

          // createMany para eficiencia
          await prisma.notification.createMany({ data: toCreate });
        }
      } catch (e) {
        console.warn("Notifications failed (ignored):", e?.message || e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sorteo actualizado",
        raffle: { ...updated, unitPrice: TICKET_PRICE },
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("PUT /api/raffles/[id] error:", err);
    return new Response(
      JSON.stringify({
        error: "Error al actualizar sorteo",
        details: process.env.NODE_ENV === "development" ? err.message : undefined,
      }),
      { status: 500 }
    );
  }
}

/* ==========================
   DELETE /api/raffles/[id]
   ========================== */
export async function DELETE(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }

    const { id } = params;
    const existing = await prisma.raffle.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true, participations: true } } },
    });
    if (!existing) {
      return new Response(JSON.stringify({ error: "Sorteo no encontrado" }), { status: 404 });
    }

    const role = (session.user?.role || "").toString().toLowerCase();
    const isSuper = role === "superadmin";
    const isAdmin = role === "admin";
    const isOwner = !!session.user?.id && existing.ownerId === session.user.id;

    const ticketsCount = existing._count?.tickets ?? 0;
    const partsCount = existing._count?.participations ?? 0;

    if (ticketsCount > 0 || partsCount > 0) {
      // Solo SUPERADMIN puede borrar con actividad
      if (!isSuper) {
        return new Response(
          JSON.stringify({
            error:
              "No se puede eliminar: hay participantes/tickets. Solo SUPERADMIN puede forzar eliminación.",
          }),
          { status: 400 }
        );
      }
    } else {
      // sin actividad: owner/admin/superadmin pueden borrar
      if (!isOwner && !isAdmin && !isSuper) {
        return new Response(JSON.stringify({ error: "No autorizado para eliminar" }), {
          status: 403,
        });
      }
    }

    // audit best-effort
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
            counters: { ticketsCount, partsCount },
          },
        },
      });
    } catch (e) {
      console.warn("auditLog delete failed (ignored):", e?.message || e);
    }

    await prisma.raffle.delete({ where: { id } });

    return new Response(
      JSON.stringify({ success: true, message: "Sorteo eliminado exitosamente" }),
      { status: 200 }
    );
  } catch (err) {
    console.error("DELETE /api/raffles/[id] error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
    });
  }
}
