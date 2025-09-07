// src/app/api/admin/tickets/issue/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { emitirTicketParaUsuario, emitirNTicketsParaUsuario } from "@/server/tickets";

/** GET para verificar que la ruta existe */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/admin/tickets/issue" });
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const role = String(session?.user?.role || "").toUpperCase();
    if (!session || role !== "SUPERADMIN") {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const userId = String(body?.userId || "").trim();
    const cantidad = Number.isInteger(body?.cantidad) ? body.cantidad : 1;
    const status = body?.status ? String(body.status).toUpperCase() : "AVAILABLE";

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId es requerido" }, { status: 400 });
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) {
      return NextResponse.json({ ok: false, error: "cantidad debe ser entero 1..100" }, { status: 400 });
    }
    if (!["AVAILABLE", "ACTIVE", "PENDING"].includes(status)) {
      return NextResponse.json({ ok: false, error: "status inválido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const tickets =
      cantidad === 1
        ? [await emitirTicketParaUsuario(userId, status)]
        : await emitirNTicketsParaUsuario(userId, cantidad, status);

    // Notificación best-effort
    try {
      await prisma.notification.create({
        data: {
          userId,
          title: `Se te asignaron ${cantidad} ticket(s)`,
          message: `El superadmin emitió ${cantidad} ticket(s) a tu favor.`,
          type: "SYSTEM_ALERT",
          ticketId: tickets[0]?.id ?? null,
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, count: tickets.length, tickets });
  } catch (err) {
    console.error("[ADMIN/TICKETS/ISSUE] error:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
