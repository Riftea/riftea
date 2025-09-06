// src/app/api/tickets/verify/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateTicket } from "@/lib/crypto.server";

export async function POST(req) {
  try {
    const { uuid, code } = await req.json();

    if (!uuid && !code) {
      return NextResponse.json(
        { ok: false, error: "Falta uuid o code" },
        { status: 400 }
      );
    }

    const ticket = await prisma.ticket.findFirst({
      where: {
        OR: [
          uuid ? { uuid } : undefined,
          code ? { code } : undefined
        ].filter(Boolean)
      },
      select: {
        uuid: true,
        hash: true,          // HMAC guardado en DB
        generatedAt: true,
        userId: true
      }
    });

    if (!ticket) {
      return NextResponse.json(
        { ok: false, error: "Ticket no existe" },
        { status: 404 }
      );
    }

    const res = validateTicket(
      { uuid: ticket.uuid, hmac: ticket.hash, generatedAt: ticket.generatedAt },
      ticket.userId
    );

    return NextResponse.json({ ok: res.valid, error: res.error ?? null });
  } catch (err) {
    console.error("Error verifying ticket:", err);
    return NextResponse.json(
      { ok: false, error: "Error procesando la verificación" },
      { status: 500 }
    );
  }
}
