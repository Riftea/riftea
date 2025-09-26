export const runtime = 'nodejs';
// src/app/api/tickets/use/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { TicketsService } from "@/services/tickets.service";

/**
 * POST /api/tickets/use
 * Body: { ticketId: string, raffleId: string }
 * - Aplica un ticket GENÉRICO (AVAILABLE/PENDING/ACTIVE y sin uso previo ni rifa) a una rifa.
 * - Cambia el ticket a IN_RAFFLE, setea raffleId y crea Participation.
 * - Valida HMAC internamente vía TicketsService.
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Body inválido: se esperaba JSON" },
        { status: 400 }
      );
    }

    const { ticketId, raffleId } = body || {};
    if (!ticketId || !raffleId) {
      return NextResponse.json(
        { error: "ticketId y raffleId son requeridos" },
        { status: 400 }
      );
    }

    // 1) Compatibilidad y reglas antes de aplicar
    const compatibility = await TicketsService.canApplyTicketToRaffle(
      ticketId,
      raffleId,
      session.user.id
    );

    if (!compatibility.canUse) {
      return NextResponse.json(
        {
          error: compatibility.reason,
          // Reintentar solo si no es final/definitivo
          canRetry: !/no disponible|límite máximo|finalizad|asociado|usado/i.test(
            compatibility.reason || ""
          ),
        },
        { status: 400 }
      );
    }

    // 2) Aplicar ticket a la rifa
    const participation = await TicketsService.applyTicketToRaffle(
      ticketId,
      raffleId,
      session.user.id
    );

    return NextResponse.json(
      {
        success: true,
        message: "Ticket usado exitosamente en el sorteo",
        participation,
        ticketInfo: {
          id: participation.ticket.id,
          code: participation.ticket.code,
          wasGeneric: participation.ticket.raffleId === raffleId, // debe ser true tras aplicar
        },
        raffleInfo: {
          id: participation.raffle.id,
          title: participation.raffle.title,
          endsAt: participation.raffle.endsAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[tickets/use] error:", error);

    const map = {
      "Ticket no encontrado": 404,
      "Este ticket no te pertenece": 403,
      "Ticket inválido (firma HMAC inválida)": 400,
      "Rifa no encontrada": 404,
      "Rifa no disponible": 400,
      "La rifa ya ha finalizado": 400,
      "El propietario no puede participar en su propia rifa": 403,
      "La rifa alcanzó el límite máximo de participantes": 400,
      "El ticket no está disponible para usar": 409,
      "El ticket ya está asociado a una rifa": 409,
      "Este ticket ya está participando en esta rifa": 409,
      "El ticket ya fue usado": 409,
    };

    const statusCode = map[error?.message] || 400;

    return NextResponse.json(
      {
        error: error?.message || "Error al usar el ticket",
        timestamp: new Date().toISOString(),
      },
      { status: statusCode }
    );
  }
}

