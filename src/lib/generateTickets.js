// lib/generateTickets.js
import prisma from "@/src/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

/**
 * Genera SHA256 hex a partir de input
 */
function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

/**
 * createTickets
 * - userId: id del usuario dueño
 * - raffleId: id de la rifa
 * - quantity: cantidad de tickets a crear
 * - purchaseId: id de la compra asociada (opcional, en devMode puede ser null)
 * - options: { devMode: boolean } -> si true permite generar sin purchaseId
 */
export async function createTickets({
  userId,
  raffleId,
  quantity = 1,
  purchaseId = null,
  options = { devMode: false },
}) {
  if (!userId || !raffleId) {
    throw new Error("userId y raffleId son requeridos");
  }
  if (!options.devMode && !purchaseId) {
    throw new Error("purchaseId requerido en modo no-dev");
  }

  const created = [];

  // Ejecutamos en transacción para evitar inconsistencias
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < quantity; i++) {
      let code = uuidv4();
      let attempts = 0;

      // asegurar no colisión (aunque uuidv4 tiene probabilidad mínima)
      while (attempts < 5) {
        const exists = await tx.ticket.findUnique({ where: { code } });
        if (!exists) break;
        code = uuidv4();
        attempts++;
      }
      if (attempts >= 5) {
        throw new Error("No fue posible generar un código único para el ticket");
      }

      const hash = sha256(code + "|" + userId); // ligado a userId

      const ticketData = {
        code,
        hash,
        raffleId,
        userId,
        purchaseId,
      };

      const t = await tx.ticket.create({ data: ticketData });
      created.push(t);
    }
  });

  return created;
}

/**
 * helper para generar tickets en modo desarrollo sin compra
 * conveniente para pruebas locales
 */
export async function createDevTickets({ userId, raffleId, quantity = 1 }) {
  return createTickets({
    userId,
    raffleId,
    quantity,
    purchaseId: null,
    options: { devMode: true },
  });
}
