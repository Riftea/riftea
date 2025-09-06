// src/app/api/admin/tickets/issue/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { TicketsService } from "@/services/tickets.service";

/**
 * POST /api/admin/tickets/issue
 * Body: { userId: string, quantity?: number }
 * - Emite N tickets GENÉRICOS (raffleId = null, status = "AVAILABLE") para el userId indicado.
 * - Requiere rol SUPERADMIN.
 */
export async function POST(req) {
  try {
    // Guardia SUPERADMIN
    const session = await getServerSession(authOptions);
    const role = String(session?.user?.role || "").toUpperCase();
    if (!session || role !== "SUPERADMIN") {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    const { userId, quantity = 1 } = await req.json();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId es requerido" }, { status: 400 });
    }
    const qty = Number.parseInt(quantity ?? 1, 10);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 50) {
      return NextResponse.json({ ok: false, error: "quantity debe ser un entero entre 1 y 50" }, { status: 400 });
    }

    const items = await TicketsService.createTickets({ userId, quantity: qty });

    return NextResponse.json({
      ok: true,
      tickets: { items, count: items.length },
      message: `Se emitieron ${items.length} ticket(s) genéricos (disponibles para cualquier sorteo).`,
    });
  } catch (err) {
    console.error("[admin/tickets/issue] error:", err);
    return NextResponse.json(
      { ok: false, error: "Error emitiendo tickets" },
      { status: 500 }
    );
  }
}
