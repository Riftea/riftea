// app/api/tickets/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...]/route";
import { prisma } from "../../../../lib/prisma";

export async function GET(req) {
  // si viene query raffleId, traer tickets de esa rifa (solo públicos o propios)
  const url = new URL(req.url);
  const raffleId = url.searchParams.get("raffleId");
  if (!raffleId) return NextResponse.json({ error: "raffleId required" }, { status: 400 });

  const tickets = await prisma.ticket.findMany({ where: { raffleId } });
  return NextResponse.json(tickets);
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Crear ticket(s) — por simplicidad un ticket por request o quantity en body
  const { raffleId, quantity = 1 } = await req.json();
  if (!raffleId) return NextResponse.json({ error: "raffleId required" }, { status: 400 });

  // Aquí podés usar tu función createTickets (generateTickets.js)
  // simple ejemplo: creación mínima
  const created = [];
  for (let i = 0; i < quantity; i++) {
    const t = await prisma.ticket.create({
      data: { raffleId, ownerId: session.user.id, code: `RFT-${Math.random().toString(36).slice(2,8).toUpperCase()}` },
    });
    created.push(t);
  }

  return NextResponse.json(created, { status: 201 });
}
