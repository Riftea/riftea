// src/app/api/raffles/[id]/manual-draw/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { executeManualDraw } from "@/services/raffles.service";

/**
 * Helpers
 */
function json(data, init) {
  return Response.json(data, init);
}

async function getCurrentUser(session) {
  // Intenta por id y si no, por email
  if (session?.user?.id) {
    const byId = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, email: true, name: true },
    });
    if (byId) return byId;
  }
  if (session?.user?.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true, email: true, name: true },
    });
    if (byEmail) return byEmail;
  }
  return null;
}

/**
 * POST: Ejecuta el sorteo manualmente (ADMIN / SUPER_ADMIN)
 */
export async function POST(req, { params }) {
  try {
    // 1) Autenticación
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return json({ error: "No autorizado" }, { status: 401 });
    }

    // 2) Permisos
    const user = await getCurrentUser(session);
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return json(
        {
          error: "Acceso denegado. Se requieren permisos de administrador.",
        },
        { status: 403 }
      );
    }

    // 3) Params
    const raffleId = params?.id;
    if (!raffleId) {
      return json({ error: "ID de sorteo requerido" }, { status: 400 });
    }

    // 4) Validaciones del sorteo
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        title: true,
        status: true,
        drawAt: true,
        drawnAt: true,
        winnerParticipationId: true,
        _count: { select: { participations: true } },
      },
    });

    if (!raffle) {
      return json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    if (raffle.drawnAt || raffle.winnerParticipationId) {
      return json(
        {
          error: "El sorteo ya fue ejecutado anteriormente",
          drawnAt: raffle.drawnAt,
        },
        { status: 409 }
      );
    }

    if (!["READY_TO_DRAW", "ACTIVE"].includes(raffle.status)) {
      return json(
        {
          error: `No se puede ejecutar sorteo en estado: ${raffle.status}`,
          validStates: ["READY_TO_DRAW", "ACTIVE"],
        },
        { status: 409 }
      );
    }

    if (raffle._count.participations < 2) {
      return json(
        {
          error:
            "Se requieren al menos 2 participaciones para ejecutar el sorteo",
          currentParticipations: raffle._count.participations,
        },
        { status: 409 }
      );
    }

    // 5) Ejecutar sorteo (servicio unificado)
    console.log(`🎲 Admin ${user.email} ejecutando sorteo manual: ${raffleId}`);

    const result = await executeManualDraw(raffleId, {
      triggeredBy: user.id,
      triggeredByLabel: `admin-${user.email ?? user.id}`,
      reason: "manual_admin_execution",
      force: true, // Permite ejecución aunque no haya llegado drawAt
    });

    console.log(
      `✅ Sorteo ${raffleId} ejecutado exitosamente por admin ${user.email}`
    );

    return json({
      success: true,
      message: "Sorteo ejecutado exitosamente",
      result: {
        raffleId,
        raffleTitle: raffle.title,
        executedBy: user.email,
        executedAt: new Date().toISOString(),
        ...result,
      },
    });
  } catch (error) {
    console.error("❌ Error en ejecución manual de sorteo:", error);
    return json(
      {
        success: false,
        error: "Error interno al ejecutar el sorteo",
        message: error?.message,
        details:
          process.env.NODE_ENV === "development" ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Verifica si el sorteo puede ejecutarse
 */
export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await getCurrentUser(session);
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return json({ error: "Acceso denegado" }, { status: 403 });
    }

    const raffleId = params?.id;
    if (!raffleId) {
      return json({ error: "ID de sorteo requerido" }, { status: 400 });
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        title: true,
        status: true,
        drawAt: true,
        drawnAt: true,
        winnerParticipationId: true,
        _count: { select: { participations: true } },
      },
    });

    if (!raffle) {
      return json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    const canExecute =
      !raffle.drawnAt &&
      !raffle.winnerParticipationId &&
      ["READY_TO_DRAW", "ACTIVE"].includes(raffle.status) &&
      raffle._count.participations >= 2;

    return json({
      raffleId: raffle.id,
      title: raffle.title,
      status: raffle.status,
      participations: raffle._count.participations,
      canExecute,
      alreadyExecuted: !!(raffle.drawnAt || raffle.winnerParticipationId),
      drawAt: raffle.drawAt,
      drawnAt: raffle.drawnAt,
      reasons: !canExecute
        ? [
            raffle.drawnAt ? "Ya ejecutado" : null,
            !["READY_TO_DRAW", "ACTIVE"].includes(raffle.status)
              ? `Estado inválido: ${raffle.status}`
              : null,
            raffle._count.participations < 2
              ? "Faltan participaciones"
              : null,
          ].filter(Boolean)
        : [],
    });
  } catch (error) {
    return json(
      {
        error: "Error interno",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
