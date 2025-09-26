export const runtime = 'nodejs';
// app/api/tickets/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { generateTicketData } from "@/lib/crypto.server";
import { TICKET_PRICE } from "@/lib/ticket.server";

/** Normaliza rol para checks simples */
function normalizeRole(session) {
  const r = session?.user?.role;
  return typeof r === "string" ? r.toUpperCase() : "";
}

/**
 * POST: emitir N tickets GENÉRICOS (sin rifa asignada)
 * Body: { quantity?: number }
 */
export async function POST(request) {
  try {
    // 1) Auth
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "No autorizado. Debes iniciar sesión.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // 2) Obtener user ID
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

    // 3) Body + validaciones
    const body = await request.json().catch(() => ({}));
    const quantityNum = Number.parseInt(body?.quantity ?? 1, 10);

    if (!Number.isInteger(quantityNum) || quantityNum <= 0 || quantityNum > 50) {
      return NextResponse.json(
        { error: "La cantidad debe ser un número entre 1 y 50", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // 4) Crear tickets genéricos con HMAC en transacción
    const createdTickets = await prisma.$transaction(async (tx) => {
      const results = [];
      for (let i = 0; i < quantityNum; i++) {
        const t = generateTicketData(dbUser.id);
        // t = { uuid, displayCode, hmac, generatedAt, timestamp }

        const created = await tx.ticket.create({
          data: {
            uuid: t.uuid,
            code: t.displayCode,      // visible único (TK-XXX-XXXX)
            hash: t.hmac,             // HMAC-SHA256 hex
            generatedAt: t.generatedAt,
            userId: dbUser.id,        // dueño del ticket
            raffleId: null,           // GENÉRICO: sin rifa asignada
            status: "AVAILABLE",      // disponible para usar luego
          },
          select: { id: true, uuid: true, code: true, generatedAt: true, userId: true, status: true },
        });
        results.push(created);
      }
      return results;
    });

    // 5) Audit log (best-effort)
    try {
      await prisma.auditLog.create({
        data: {
          action: "issue_generic_tickets",
          userId: dbUser.id,
          targetType: "ticket",
          targetId: createdTickets[0]?.id ?? undefined,
          newValues: {
            quantity: createdTickets.length,
            type: "GENERIC",
          },
        },
      });
    } catch (e) {
      console.warn("auditLog create failed (ignored):", e?.message || e);
    }

    // 6) Notificación (best-effort)
    try {
      await prisma.notification.create({
        data: {
          userId: dbUser.id,
          type: "PURCHASE_CONFIRMATION",
          title: "Tickets generados",
          message: `Se generaron ${createdTickets.length} ticket(s) genérico(s). Podés usarlos en cualquier sorteo disponible.`,
        },
      });
    } catch (e) {
      console.warn("notification create failed (ignored):", e?.message || e);
    }

    return NextResponse.json(
      {
        success: true,
        message: `${createdTickets.length} ticket(s) genérico(s) creado(s) exitosamente`,
        tickets: {
          items: createdTickets,
          count: createdTickets.length,
        },
        code: "TICKETS_ISSUED_GENERIC",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error issuing generic tickets:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        code: "INTERNAL_SERVER_ERROR",
        details: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET: listar tickets (paginado/filtrado)
 * Query: page, limit, raffleId, userId, status, mine=1
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "10", 10), 50);
    const raffleId = searchParams.get("raffleId");
    const userIdParam = searchParams.get("userId");
    const status = searchParams.get("status"); // TicketStatus
    const mine = searchParams.get("mine"); // "1" para mis tickets

    const skip = Math.max(0, (Math.max(1, page) - 1) * limit);
    const where = {};

    if (mine === "1") {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "No autorizado. Debes iniciar sesión.", code: "UNAUTHORIZED" },
          { status: 401 }
        );
      }
      const me = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      if (!me) {
        return NextResponse.json(
          { error: "Usuario no encontrado en la base de datos", code: "USER_NOT_FOUND" },
          { status: 400 }
        );
      }
      where.userId = me.id;
    } else if (userIdParam) {
      where.userId = userIdParam;
    }

    if (raffleId) where.raffleId = raffleId;

    // Filtrar sólo por valores válidos del enum
    const VALID_STATUSES = new Set([
      "PENDING",
      "ACTIVE",
      "AVAILABLE",
      "IN_RAFFLE",
      "WINNER",
      "LOST",
      "DELETED",
    ]);
    if (status && VALID_STATUSES.has(status)) {
      where.status = status;
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        include: {
          raffle: {
            select: {
              id: true,
              title: true,
              status: true,
              // ❌ ticketPrice eliminado del select
              endsAt: true,
              imageUrl: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    // ✅ Inyectar unitPrice (server) sin leer DB
    const decoratedTickets = tickets.map((t) => ({
      ...t,
      unitPrice: TICKET_PRICE,
      raffle: t.raffle
        ? {
            ...t.raffle,
            unitPrice: TICKET_PRICE,
          }
        : null,
    }));

    return NextResponse.json({
      success: true,
      tickets: decoratedTickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
      filters: { raffleId, userId: userIdParam, status, mine },
      code: "TICKETS_FETCHED",
    });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return NextResponse.json(
      {
        error: "Error al obtener los tickets",
        code: "FETCH_ERROR",
        details: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PUT: acciones sobre ticket (cancel/restore)
 * Body: { id: string, action: "cancel" | "restore" }
 *
 * - cancel:   AVAILABLE -> DELETED
 * - restore:  DELETED   -> AVAILABLE
 */
export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado", code: "UNAUTHORIZED" }, { status: 401 });
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

    const body = await request.json();
    const id = String(body?.id || "").trim();
    const action = String(body?.action || "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "ID de ticket requerido", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        raffle: true,
        user: true,
      },
    });
    if (!existingTicket) {
      return NextResponse.json({ error: "Ticket no encontrado", code: "TICKET_NOT_FOUND" }, { status: 404 });
    }

    const role = normalizeRole({ user: { role: dbUser.role } });
    const isOwner = existingTicket.userId === dbUser.id;
    const isRaffleOwner = existingTicket.raffle ? existingTicket.raffle.ownerId === dbUser.id : false;

    if (!isOwner && !isRaffleOwner && role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "No tienes permisos para modificar este ticket", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    let updateObject = {};
    switch (action) {
      case "cancel": {
        // Solo cancelar si todavía está disponible
        if (existingTicket.status !== "AVAILABLE") {
          return NextResponse.json(
            { error: "Solo se pueden cancelar tickets disponibles", code: "INVALID_STATUS" },
            { status: 400 }
          );
        }
        updateObject = { status: "DELETED" };
        break;
      }
      case "restore": {
        if (existingTicket.status !== "DELETED") {
          return NextResponse.json(
            { error: "Solo se pueden restaurar tickets cancelados", code: "INVALID_STATUS" },
            { status: 400 }
          );
        }
        updateObject = { status: "AVAILABLE" };
        break;
      }
      default:
        return NextResponse.json({ error: "Acción no válida", code: "INVALID_ACTION" }, { status: 400 });
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id },
      data: updateObject,
      include: {
        raffle: { select: { id: true, title: true, status: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message:
        action === "cancel"
          ? "Ticket cancelado exitosamente"
          : "Ticket restaurado exitosamente",
      ticket: updatedTicket,
      code: `TICKET_${action.toUpperCase()}`,
    });
  } catch (error) {
    console.error("Error updating ticket:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Ticket no encontrado", code: "TICKET_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "Error al actualizar el ticket",
        code: "UPDATE_ERROR",
        details: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: eliminar ticket por id (guardas básicas)
 * Query: ?id=...
 */
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado", code: "UNAUTHORIZED" }, { status: 401 });
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
    const id = String(searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json(
        { error: "ID de ticket requerido", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id },
      include: { raffle: true },
    });
    if (!existingTicket) {
      return NextResponse.json({ error: "Ticket no encontrado", code: "TICKET_NOT_FOUND" }, { status: 404 });
    }

    const role = normalizeRole({ user: { role: dbUser.role } });
    const isOwner = existingTicket.userId === dbUser.id;
    const isRaffleOwner = existingTicket.raffle ? existingTicket.raffle.ownerId === dbUser.id : false;

    if (!isOwner && !isRaffleOwner && role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "No tienes permisos para eliminar este ticket", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // Si el ticket ya está en rifa finalizada, no permitir borrar
    if (existingTicket.raffle && existingTicket.raffle.status === "FINISHED") {
      return NextResponse.json(
        { error: "No se pueden eliminar tickets de rifas finalizadas", code: "RAFFLE_FINISHED" },
        { status: 400 }
      );
    }

    await prisma.ticket.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Ticket eliminado exitosamente",
      code: "TICKET_DELETED",
    });
  } catch (error) {
    console.error("Error deleting ticket:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Ticket no encontrado", code: "TICKET_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "Error al eliminar el ticket",
        code: "DELETE_ERROR",
        details: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined,
      },
      { status: 500 }
    );
  }
}

