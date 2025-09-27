// src/app/api/tickets/[id]/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/authz";

/* ----------------- helpers ----------------- */
const json = (d, i) => NextResponse.json(d, i);
const truthy = (v) => /^(1|true|yes)$/i.test(String(v ?? ""));

function pickDeleteWhere(ticket) {
  // Si tenés PK numérica 'id', podés borrar por id; si usás uuid como PK, borro por uuid.
  if (ticket?.uuid) return { uuid: ticket.uuid };
  return { id: ticket.id };
}

async function findTicketByAny(identifier) {
  const key = String(identifier || "").trim();
  if (!key) return null;
  return prisma.ticket.findFirst({
    where: {
      OR: [
        { id: key },       // por si viniera un id stringeado
        { uuid: key },     // ✅ tu caso principal (no tenés id)
        { code: key },     // opcional: por si la UI vieja manda el code visible
      ],
    },
    select: {
      id: true,
      uuid: true,
      code: true,
      userId: true,
      raffleId: true,
      status: true,
      isUsed: true,
    },
  });
}

/* ----------------- DELETE ----------------- */
export async function DELETE(req, ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return json({ error: "No autorizado" }, { status: 401 });
    }

    const params = (ctx && (await ctx.params)) || {};
    const { id } = params;
    if (!id) return json({ error: "Falta identificador" }, { status: 400 });

    const url = new URL(req.url);
    const force = truthy(url.searchParams.get("force"));
    // asUser es solo informativo (impersonación en UI). No cambia permisos acá.
    const asUser = (url.searchParams.get("asUser") || "").trim();

    const ticket = await findTicketByAny(id);
    if (!ticket) return json({ error: "Ticket no encontrado" }, { status: 404 });

    const iAmSuper = isSuperAdmin(session);
    const iAmOwner = session.user.id === ticket.userId;

    if (iAmSuper) {
      // SUPERADMIN: puede borrar todo; si está en sorteo requiere ?force=1
      if (ticket.raffleId && !force) {
        return json(
          { error: "El ticket participa en un sorteo. Para forzar usa ?force=1" },
          { status: 409 }
        );
      }
    } else if (iAmOwner) {
      // Dueño: solo si no participa y no está usado
      if (ticket.raffleId) {
        return json(
          { error: "No puedes eliminar un ticket que está participando en un sorteo." },
          { status: 409 }
        );
      }
      if (ticket.isUsed) {
        return json(
          { error: "No puedes eliminar un ticket ya usado." },
          { status: 409 }
        );
      }
    } else {
      return json({ error: "Sin permisos para eliminar este ticket." }, { status: 403 });
    }

    // Si querés hacer limpieza adicional cuando está en sorteo y venís con force=1,
    // acá podrías eliminar participación/es relacionadas antes de borrar el ticket.
    // Ejemplo (opcional, si tu schema lo requiere):
    // if (iAmSuper && force && ticket.raffleId) {
    //   await prisma.participation.deleteMany({ where: { ticketId: ticket.id } });
    // }

    await prisma.ticket.delete({ where: pickDeleteWhere(ticket) });

    // (Opcional) Auditoría best-effort si tenés tabla Audit
    // try {
    //   await prisma.auditLog.create({
    //     data: {
    //       userId: session.user.id,
    //       action: "TICKET_DELETE",
    //       entity: "Ticket",
    //       entityId: ticket.uuid || String(ticket.id),
    //       metadata: { asUser: asUser || null, forced: !!force, code: ticket.code || null },
    //     },
    //   });
    // } catch (e) {
    //   console.warn("[audit] no se pudo registrar auditoría:", e?.message || e);
    // }

    return json({
      ok: true,
      message: "Ticket eliminado correctamente",
      ticket: { uuid: ticket.uuid || null, id: ticket.id || null, code: ticket.code || null },
      forced: !!force,
    });
  } catch (e) {
    console.error("[DELETE /api/tickets/[id]]", e);
    return json(
      { error: "Error interno al eliminar el ticket", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
