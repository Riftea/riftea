// src/app/api/admin/generar-tickets/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { emitirTicketParaUsuario, emitirNTicketsParaUsuario } from "@/server/tickets";

/** GET de ping */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/admin/generar-tickets" });
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const role = String(session?.user?.role || "").toUpperCase();
    if (!session || role !== "SUPERADMIN") {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const userId = String(body?.userId || session.user.id || "").trim();
    const cantidad = Number.isInteger(body?.cantidad) ? body.cantidad : 1;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId es requerido" }, { status: 400 });
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) {
      return NextResponse.json({ ok: false, error: "cantidad debe ser entero 1..100" }, { status: 400 });
    }

    const tickets =
      cantidad === 1
        ? [await emitirTicketParaUsuario(userId, "AVAILABLE")]
        : await emitirNTicketsParaUsuario(userId, cantidad, "AVAILABLE");

    return NextResponse.json({ ok: true, count: tickets.length, tickets });
  } catch (err) {
    console.error("[ADMIN/GENERAR-TICKETS] error:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
