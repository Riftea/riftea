// src/server/tickets.js
import "server-only";
import prisma from "@/lib/prisma";
import { generateTicketData } from "@/lib/crypto.server";

/*
 * Este módulo emite tickets firmados con HMAC (generateTicketData)
 * y persiste la firma en el campo `hash` (HEX) + metadata mínima.
 * No expone `hash` ni otros secretos hacia afuera.
 */

/* =========================
   Config & helpers
   ========================= */
const VALID_STATUSES = new Set(["AVAILABLE", "ACTIVE", "PENDING"]);

function normalizeStatus(s) {
  const up = String(s || "AVAILABLE").toUpperCase();
  return VALID_STATUSES.has(up) ? up : "AVAILABLE";
}

/** Selección “segura” para devolver tickets sin exponer secretos */
const TICKET_SAFE_SELECT = {
  id: true,          // si no existe en tu tabla, podés quitarlo
  uuid: true,
  code: true,
  status: true,
  userId: true,
  raffleId: true,
  generatedAt: true,
  createdAt: true,
  isUsed: true,
  isWinner: true,
};

/* =========================
   Core de emisión
   ========================= */

/**
 * Emite 1 ticket para un usuario.
 * - Firma HMAC provista por generateTicketData (usa TICKET_SECRET en server).
 * - Guarda la firma en `hash` (HEX) y la fecha como `generatedAt`.
 * - No expone `hash` al cliente.
 *
 * @param {string} userId
 * @param {string} status  "AVAILABLE" | "ACTIVE" | "PENDING"
 * @param {object} opts    { raffleId?, purchaseId?, code? }
 * @param {import('@prisma/client').PrismaClient} tx  transacción opcional
 * @returns {Promise<object>} ticket seguro (según TICKET_SAFE_SELECT)
 */
export async function emitirTicketParaUsuario(
  userId,
  status = "AVAILABLE",
  opts = {},
  tx = prisma
) {
  const st = normalizeStatus(status);

  // generateTicketData(userId) debe devolver:
  // { uuid, displayCode, hmac, generatedAt }
  const t = generateTicketData(userId, opts?.seed);

  // Si querés forzar un code custom (no recomendado en general), se respeta:
  const code = opts.code || t.displayCode;

  const created = await tx.ticket.create({
    data: {
      uuid: t.uuid,
      code,                 // legible en UI (últimos 8 del uuid, por defecto)
      hash: t.hmac,         // 🔐 HMAC HEX (NO exponer)
      generatedAt: t.generatedAt,
      userId,
      status: st,
      // opcionales:
      raffleId: opts.raffleId ?? null,
      purchaseId: opts.purchaseId ?? null,
      isUsed: false,
      isWinner: false,
    },
    select: TICKET_SAFE_SELECT,
  });

  return created;
}

/**
 * Emite N tickets en una sola transacción.
 * - Reintenta hasta 5 veces por ticket ante colisiones (P2002).
 * - Devuelve array de tickets en formato seguro.
 *
 * @param {string} userId
 * @param {number} cantidad  1..100
 * @param {string} status
 * @param {object} opts       { raffleId?, purchaseId? }
 * @returns {Promise<object[]>}
 */
export async function emitirNTicketsParaUsuario(
  userId,
  cantidad = 1,
  status = "AVAILABLE",
  opts = {}
) {
  const count = Math.max(1, Math.min(100, Number.isFinite(cantidad) ? Math.trunc(cantidad) : 1));
  const out = [];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < count; i++) {
      let done = false;
      let attempts = 0;

      while (!done && attempts < 5) {
        attempts++;
        try {
          const t = await emitirTicketParaUsuario(userId, status, opts, tx);
          out.push(t);
          done = true;
        } catch (e) {
          // P2002 = unique constraint failed (uuid/code)
          if (e?.code === "P2002" && attempts < 5) continue;
          throw e;
        }
      }
    }
  });

  return out;
}

/* =========================
   Helpers de conveniencia
   ========================= */

/**
 * Emite N tickets vinculados a una compra (purchaseId).
 * Útil si querés trazar el origen de los tickets generados por una venta.
 *
 * @param {string} userId
 * @param {number} cantidad
 * @param {string} purchaseId
 * @param {string} status
 */
export async function emitirTicketsParaCompra(
  userId,
  cantidad,
  purchaseId,
  status = "AVAILABLE"
) {
  return emitirNTicketsParaUsuario(userId, cantidad, status, { purchaseId });
}
