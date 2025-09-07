// src/server/tickets.js
import prisma from "@/lib/prisma";
import { generateTicketData } from "@/lib/crypto.server";

/** Emite 1 ticket genérico (AVAILABLE) con HMAC y generatedAt */
export async function emitirTicketParaUsuario(userId, status = "AVAILABLE", tx = prisma) {
  const t = generateTicketData(userId);
  const ticket = await tx.ticket.create({
    data: {
      uuid: t.uuid,
      code: t.displayCode,
      hash: t.hmac,         // HMAC HEX (no se expone hacia afuera)
      generatedAt: t.generatedAt,
      userId,
      status,               // por defecto AVAILABLE (genérico)
    },
    select: {
      id: true, uuid: true, code: true, generatedAt: true, status: true, userId: true,
    },
  });
  return ticket;
}

/** Emite N tickets genéricos (con reintentos por colisiones únicas) */
export async function emitirNTicketsParaUsuario(userId, cantidad = 1, status = "AVAILABLE") {
  const out = [];
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < cantidad; i++) {
      let done = false, attempts = 0;
      while (!done && attempts < 5) {
        attempts++;
        try {
          const t = await emitirTicketParaUsuario(userId, status, tx);
          out.push(t);
          done = true;
        } catch (e) {
          if (e?.code === "P2002" && attempts < 5) continue;
          throw e;
        }
      }
    }
  });
  return out;
}
