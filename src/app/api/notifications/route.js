export const runtime = 'nodejs';
// app/api/notifications/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET -> devuelve notificaciones del usuario logueado (no accesible para otros usuarios)
 * POST -> crear notificación: solo ADMIN puede crear notificaciones para cualquier user
 * PUT -> marcar notificación como leída (user debe ser dueño)
 * DELETE -> eliminar notificación (user debe ser dueño)
 */

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });

    const userId = session.user.id;
    const items = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return new Response(JSON.stringify(items), { status: 200 });
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    return new Response(JSON.stringify({ error: "Error" }), { status: 500 });
  }
}

export async function POST(req) {
  // Crear notificación (admin)
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403 });
    }

    const body = await req.json();
    const { userId, message } = body;
    if (!userId || !message) return new Response(JSON.stringify({ error: "Campos faltan" }), { status: 400 });

    const note = await prisma.notification.create({
      data: { userId, message },
    });
    return new Response(JSON.stringify(note), { status: 201 });
  } catch (err) {
    console.error("POST /api/notifications error:", err);
    return new Response(JSON.stringify({ error: "Error" }), { status: 500 });
  }
}

export async function PUT(req) {
  // marcar notificación leída por su dueño
  try {
    const session = await getServerSession(authOptions);
    if (!session) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });

    const body = await req.json();
    const { id } = body;
    if (!id) return new Response(JSON.stringify({ error: "id requerido" }), { status: 400 });

    // verificar propiedad
    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif) return new Response(JSON.stringify({ error: "No encontrado" }), { status: 404 });
    if (notif.userId !== session.user.id) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403 });

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    return new Response(JSON.stringify(updated), { status: 200 });
  } catch (err) {
    console.error("PUT /api/notifications error:", err);
    return new Response(JSON.stringify({ error: "Error" }), { status: 500 });
  }
}

export async function DELETE(req) {
  // Eliminar notificación (user debe ser dueño)
  try {
    const session = await getServerSession(authOptions);
    if (!session) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });

    const body = await req.json();
    const { id } = body;
    if (!id) return new Response(JSON.stringify({ error: "id requerido" }), { status: 400 });

    // verificar propiedad antes de eliminar
    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif) return new Response(JSON.stringify({ error: "No encontrado" }), { status: 404 });
    if (notif.userId !== session.user.id) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403 });

    // Eliminar la notificación
    await prisma.notification.delete({
      where: { id }
    });
    
    return new Response(JSON.stringify({ success: true, message: "Notificación eliminada" }), { status: 200 });
  } catch (err) {
    console.error("DELETE /api/notifications error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 });
  }
}
