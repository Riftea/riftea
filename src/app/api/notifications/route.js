export const runtime = 'nodejs';
// app/api/notifications/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET    -> lista notificaciones del usuario logueado (con filtros opcionales)
 * POST   -> crear notificación (ADMIN o SUPERADMIN)
 * PUT    -> marcar como leída (1, varias o todas, sólo dueñx)
 * DELETE -> eliminar (1, varias o todas, sólo dueñx)
 *
 * Campos soportados en Notification (según tu schema):
 * - id, userId, type, title, message, read, readAt, raffleId, ticketId, createdAt, expiresAt
 * - actionUrl (opcional), isActionable (opcional)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function roleIsAdminish(role) {
  const r = String(role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPERADMIN";
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return json({ error: "No autorizado" }, 401);

    const { searchParams } = new URL(req.url);
    const unread = searchParams.get("unread");        // "true"/"1"
    const actionable = searchParams.get("actionable"); // "true"/"1"
    const takeParam = parseInt(searchParams.get("take") || "100", 10);
    const take = Number.isFinite(takeParam) ? Math.min(Math.max(takeParam, 1), 500) : 100;

    const where = { userId: session.user.id };
    if (unread === "true" || unread === "1") where.read = false;
    if (actionable === "true" || actionable === "1") where.isActionable = true;

    const items = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
    });

    return json(items, 200);
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    return json({ error: "Error" }, 500);
  }
}

export async function POST(req) {
  // Crear notificación (admin/superadmin)
  try {
    const session = await getServerSession(authOptions);
    if (!session || !roleIsAdminish(session.user.role)) {
      return json({ error: "No autorizado" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const {
      userId,
      type = "SYSTEM_ALERT",
      title = "",
      message,
      actionUrl = null,
      isActionable = true,
      raffleId = null,
      ticketId = null,
      expiresAt = null,
    } = body || {};

    if (!userId || !message) {
      return json({ error: "Campos faltan: userId, message" }, 400);
    }

    const data = {
      userId,
      type,
      title,
      message,
      actionUrl,
      isActionable,
      raffleId,
      ticketId,
      // si viene expiresAt en string/fecha la normalizamos
      ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
    };

    const note = await prisma.notification.create({ data });
    return json(note, 201);
  } catch (err) {
    console.error("POST /api/notifications error:", err);
    return json({ error: "Error" }, 500);
  }
}

export async function PUT(req) {
  // Marcar como leída: una, varias o todas (dueñx)
  try {
    const session = await getServerSession(authOptions);
    if (!session) return json({ error: "No autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const { id, ids, all } = body || {};

    // === ALL: marcar todas como leídas
    if (all === true) {
      const result = await prisma.notification.updateMany({
        where: { userId: session.user.id, read: false },
        data: { read: true, readAt: new Date() },
      });
      return json({ success: true, count: result.count }, 200);
    }

    // === VARIAS: por ids[]
    if (Array.isArray(ids) && ids.length > 0) {
      // Sólo las del usuario
      const result = await prisma.notification.updateMany({
        where: { userId: session.user.id, id: { in: ids } },
        data: { read: true, readAt: new Date() },
      });
      return json({ success: true, count: result.count }, 200);
    }

    // === UNA: por id
    if (!id) return json({ error: "id requerido" }, 400);

    // Verificar propiedad
    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif) return json({ error: "No encontrado" }, 404);
    if (notif.userId !== session.user.id) return json({ error: "No autorizado" }, 403);

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
    return json(updated, 200);
  } catch (err) {
    console.error("PUT /api/notifications error:", err);
    return json({ error: "Error" }, 500);
  }
}

export async function DELETE(req) {
  // Eliminar: una, varias o todas (dueñx)
  try {
    const session = await getServerSession(authOptions);
    if (!session) return json({ error: "No autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const { id, ids, all } = body || {};

    // === ALL: eliminar todas del usuario
    if (all === true) {
      const result = await prisma.notification.deleteMany({
        where: { userId: session.user.id },
      });
      return json({ success: true, count: result.count }, 200);
    }

    // === VARIAS: por ids[]
    if (Array.isArray(ids) && ids.length > 0) {
      const result = await prisma.notification.deleteMany({
        where: { userId: session.user.id, id: { in: ids } },
      });
      return json({ success: true, count: result.count }, 200);
    }

    // === UNA: por id
    if (!id) return json({ error: "id requerido" }, 400);

    // Verificar propiedad
    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif) return json({ error: "No encontrado" }, 404);
    if (notif.userId !== session.user.id) return json({ error: "No autorizado" }, 403);

    await prisma.notification.delete({ where: { id } });
    return json({ success: true, message: "Notificación eliminada" }, 200);
  } catch (err) {
    console.error("DELETE /api/notifications error:", err);
    return json({ error: "Error interno del servidor" }, 500);
  }
}
