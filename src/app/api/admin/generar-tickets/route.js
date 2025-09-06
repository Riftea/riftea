// src/app/api/admin/generar-tickets/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { TicketsService } from "@/services/tickets.service";

/**
 * POST /api/admin/generar-tickets
 * Body: { userId: string, quantity?: number }
 * - Emite N tickets GENÉRICOS (raffleId = null, status = "AVAILABLE") para el userId indicado.
 * - Requiere rol SUPERADMIN.
 * - Sin precios, sin purchases, sin asignación a rifa.
 */
export async function POST(request) {
  try {
    // Auth + rol
    const session = await getServerSession(authOptions);
    const role = String(session?.user?.role || "").toUpperCase();
    if (!session || role !== "SUPERADMIN") {
      return NextResponse.json(
        { ok: false, error: "No autorizado. Solo SUPERADMIN puede generar tickets." },
        { status: 403 }
      );
    }

    const { userId, quantity = 1 } = await request.json();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId es requerido" }, { status: 400 });
    }

    const qty = Number.parseInt(quantity ?? 1, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      return NextResponse.json(
        { ok: false, error: "quantity debe ser un entero entre 1 y 50" },
        { status: 400 }
      );
    }

    const items = await TicketsService.createTickets({ userId, quantity: qty });

    // Audit best-effort
    try {
      await import("@/lib/prisma").then(async ({ default: prisma }) => {
        await prisma.auditLog.create({
          data: {
            action: "ADMIN_TICKET_GENERATION_GENERIC",
            userId: session.user.id,
            targetType: "ticket",
            targetId: items[0]?.id,
            newValues: {
              targetUserId: userId,
              ticketCount: items.length,
              type: "GENERIC",
              timestamp: new Date().toISOString(),
            },
          },
        });
      });
    } catch (e) {
      console.warn("[audit] generar-tickets:", e?.message || e);
    }

    return NextResponse.json({
      ok: true,
      tickets: { items, count: items.length },
      message: `Se emitieron ${items.length} ticket(s) genéricos (disponibles para cualquier sorteo).`,
    });
  } catch (err) {
    console.error("[admin/generar-tickets] error:", err);
    return NextResponse.json({ ok: false, error: "Error emitiendo tickets" }, { status: 500 });
  }
}
