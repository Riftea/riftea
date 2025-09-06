// src/server/tickets.js
import prisma from "@/lib/prisma";
import { generateTicketData } from "@/lib/crypto.server";

/**
 * Emite un ticket para un usuario.
 * @param {string} userId - ID del usuario dueño del ticket
 * @param {"PENDING"|"ACTIVE"} status - estado inicial del ticket
 * @returns {Promise<{id:string, uuid:string, code:string, generatedAt:Date, userId:string}>}
 */
export async function emitirTicketParaUsuario(userId, status = "ACTIVE") {
  if (!userId) throw new Error("userId es requerido");

  const t = generateTicketData(userId);
  // t = { uuid, displayCode, hmac, generatedAt, timestamp }

  const ticket = await prisma.ticket.create({
    data: {
      uuid: t.uuid,               // identificador interno único
      code: t.displayCode,        // código visible (TK-XXX-XXXX)
      hash: t.hmac,               // firma HMAC HEX
      generatedAt: t.generatedAt, // clave: timestamp usado en la firma
      userId,
      status                      // "ACTIVE" o "PENDING"
    },
    select: {
      id: true,
      uuid: true,
      code: true,
      generatedAt: true,
      userId: true
    }
  });

  return ticket;
}
