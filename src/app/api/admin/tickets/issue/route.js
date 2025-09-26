export const runtime = 'nodejs';
// src/app/api/admin/tickets/issue/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  emitirTicketParaUsuario,
  emitirNTicketsParaUsuario,
} from "@/server/tickets";

/** Salud */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/admin/tickets/issue" });
}

const safeJson = (obj, status = 200) =>
  new NextResponse(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function parseCantidad(n) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 100) {
    throw new Error("cantidad debe ser entero 1..100");
  }
  return v;
}

function normalizeStatus(s) {
  const status = String(s ?? "AVAILABLE").toUpperCase();
  // Ajustá a tu enum real si difiere
  const allowed = ["AVAILABLE", "ACTIVE", "PENDING"];
  if (!allowed.includes(status)) {
    throw new Error("status inválido");
  }
  return status;
}

export async function POST(req) {
  try {
    // ---- Auth: solo SUPERADMIN
    let session;
    try {
      session = await getServerSession(authOptions);
    } catch (e) {
      console.error("[ISSUE] getServerSession error:", e);
      return safeJson({ ok: false, error: "AUTH_ERROR" }, 401);
    }
    const role = String(session?.user?.role || "").toUpperCase();
    if (!session || role !== "SUPERADMIN") {
      return safeJson({ ok: false, error: "No autorizado" }, 403);
    }

    // ---- Body
    let body = {};
    try {
      const ct = req.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        return safeJson(
          { ok: false, error: "Content-Type debe ser application/json" },
          415
        );
      }
      body = await req.json();
    } catch (e) {
      console.error("[ISSUE] req.json() error:", e);
      return safeJson({ ok: false, error: "JSON inválido" }, 400);
    }

    const cantidad = parseCantidad(body?.cantidad ?? 1);
    const status = normalizeStatus(body?.status);

    // ---- Destinatarios: userIds[] | all=true | userId (legacy)
    let targetUserIds = [];

    if (Array.isArray(body?.userIds) && body.userIds.length > 0) {
      targetUserIds = body.userIds.map((x) => String(x).trim()).filter(Boolean);
    } else if (body?.all === true) {
      const all = await prisma.user.findMany({ select: { id: true } });
      targetUserIds = all.map((u) => u.id);
      if (targetUserIds.length === 0) {
        return safeJson(
          { ok: false, error: "No hay usuarios para emitir tickets" },
          400
        );
      }
    } else if (body?.userId) {
      targetUserIds = [String(body.userId).trim()];
    } else {
      return safeJson(
        { ok: false, error: "userIds es requerido (o all=true, o userId)" },
        400
      );
    }

    // Sanitizar / deduplicar
    targetUserIds = [...new Set(targetUserIds)].filter(Boolean);
    if (targetUserIds.length === 0) {
      return safeJson({ ok: false, error: "userIds vacío (o inválido)" }, 400);
    }

    // Validar existencia
    const existing = await prisma.user.findMany({
      where: { id: { in: targetUserIds } },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((u) => u.id));
    const missing = targetUserIds.filter((id) => !existingSet.has(id));
    if (missing.length > 0) {
      return safeJson(
        { ok: false, error: `Usuarios inválidos: ${missing.join(", ")}` },
        400
      );
    }

    // ---- Emisión usando TUS HELPERS (compatibles con tu schema)
    let totalCreated = 0;
    const results = []; // { userId, count, ok, error? }

    for (const uid of targetUserIds) {
      try {
        if (cantidad === 1) {
          const t = await emitirTicketParaUsuario(uid, status);
          totalCreated += t ? 1 : 0;
          results.push({ userId: uid, count: t ? 1 : 0, ok: !!t });
        } else {
          const list = await emitirNTicketsParaUsuario(uid, cantidad, status);
          const c = Array.isArray(list) ? list.length : Number(list?.count || 0);
          totalCreated += c;
          results.push({ userId: uid, count: c, ok: c > 0 });
        }
      } catch (e) {
        console.error(`[ISSUE] Emisión fallida para user ${uid}:`, e);
        results.push({
          userId: uid,
          count: 0,
          ok: false,
          error: e?.message || String(e),
        });
      }
    }

    // ✅ NOTIFICACIONES MEJORADAS - Mensaje de obsequio amigable
    try {
      const okUsers = results.filter((r) => r.ok && r.count > 0).map((r) => r.userId);
      if (okUsers.length > 0) {
        await prisma.notification.createMany({
          data: okUsers.map((uid) => ({
            userId: uid,
            title: "¡Felicitaciones!",
            message: `¡Recibiste ${cantidad} ticket${cantidad > 1 ? 's' : ''} de obsequio! Ya puedes participar en cualquier sorteo.`,
            type: "SYSTEM_ALERT",
            ticketId: null,
          })),
        });
        console.log(`[ISSUE] ${okUsers.length} notificaciones de obsequio enviadas`);
      }
    } catch (e) {
      console.warn("[ISSUE] notificaciones fallidas:", e?.message || e);
    }

    // Si alguno falló, devolvemos 207 Multi-Status (no existe en NextResponse),
    // usamos 200 con detalle parcial:
    const someFailed = results.some((r) => !r.ok);
    return safeJson({
      ok: !someFailed,
      count: totalCreated,
      usersAffected: targetUserIds.length,
      perUser: cantidad,
      status,
      results, // detalle por usuario
    });
  } catch (err) {
    console.error("[ADMIN/TICKETS/ISSUE] error no controlado:", err);
    return safeJson(
      { ok: false, error: "INTERNAL_ERROR", detail: String(err?.message || err) },
      500
    );
  }
}
