// app/api/raffles/[id]/assign-tickets/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/src/lib/auth';
import prisma from "@/src/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });

    const role = (session.user.role || "").toString().toLowerCase();
    if (role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Solo superadmin" }), { status: 403 });
    }

    const { id: raffleId } = params;
    const { userId, quantity = 1 } = await req.json();
    if (!userId || !quantity || quantity < 1) return new Response(JSON.stringify({ error: "Faltan datos" }), { status: 400 });

    const raffle = await prisma.raffle.findUnique({ where: { id: raffleId } });
    if (!raffle) return new Response(JSON.stringify({ error: "Raffle no encontrado" }), { status: 404 });

    // crear una compra simbólica para asignar los tickets (totalAmount 0)
    // Si tu schema usa "amount" en lugar de "totalAmount" adapta aquí.
    const purchase = await prisma.purchase.create({
      data: {
        userId,
        raffleId,
        totalAmount: 0
      },
    });

    const created = [];
    for (let i = 0; i < quantity; i++) {
      let tries = 0;
      while (tries < 5) {
        try {
          const code = uuidv4();
          const hash = sha256(code + "|" + userId);

          const t = await prisma.ticket.create({
            data: {
              code,
              hash,
              userId,
              raffleId,
              purchaseId: purchase.id,
            },
          });

          created.push(t);
          break;
        } catch (err) {
          // si choca unique constraint, reintentar
          tries++;
          if (tries === 5) throw err;
        }
      }
    }

    return new Response(JSON.stringify({ purchase, tickets: created }), { status: 201 });
  } catch (err) {
    console.error("POST /api/raffles/:id/assign-tickets error:", err);
    return new Response(JSON.stringify({ error: "Error al asignar tickets" }), { status: 500 });
  }
}
