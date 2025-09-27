// src/lib/ticket.server.js
import 'server-only';
import crypto from 'crypto';

/**
 * Obtiene una variable de entorno obligatoria y la convierte en entero > 0.
 * Si falta o es inválida, lanza un error y evita que el server arranque.
 *
 * @param {string} name - Nombre de la variable de entorno
 * @returns {number} - Valor entero > 0
 */
function requireIntEnv(name) {
  const raw = process.env?.[name];

  if (!raw) {
    throw new Error(
      `[ticket config] Falta la variable de entorno requerida: ${name}`
    );
  }

  const cleaned = String(raw).replace(/[_\s]/g, '');
  const value = Number.parseInt(cleaned, 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `[ticket config] Valor inválido para ${name}="${raw}". Debe ser un entero mayor a 0.`
    );
  }

  return value;
}

/* =========================
   Configuración obligatoria
   ========================= */
export const TICKET_PRICE = requireIntEnv('RAFFLES_TICKET_PRICE');
export const POT_CONTRIBUTION_PER_TICKET = requireIntEnv(
  'RAFFLES_POT_CONTRIBUTION_PER_TICKET'
);

// Secreto usado para HMAC
const TICKET_SECRET = process.env.TICKET_SECRET;
if (!TICKET_SECRET) {
  throw new Error('[ticket config] Falta TICKET_SECRET en el entorno');
}

export const TICKET_CONSTANTS = Object.freeze({
  TICKET_PRICE,
  POT_CONTRIBUTION_PER_TICKET,
});

/* =========================
   Seguridad de tickets (HMAC)
   ========================= */

/**
 * Calcula el HMAC de un ticket.
 * 
 * @param {object} t - Ticket con al menos uuid, userId, issuedAt y nonce
 * @returns {string} firma HMAC en hex
 */
export function computeTicketHMAC(t) {
  const payload = `${t.uuid}|${t.userId}|${t.issuedAt}|${t.nonce}`;
  return crypto
    .createHmac('sha256', TICKET_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Verifica si un ticket tiene un HMAC válido.
 * 
 * @param {object} t - Ticket desde la DB (con campos uuid, userId, issuedAt, nonce, hmac)
 * @returns {boolean} true si la firma coincide
 */
export function verifyTicketHMAC(t) {
  if (!t?.hmac) return false;
  const expected = computeTicketHMAC(t);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(t.hmac));
}

/**
 * Genera los metadatos de emisión para un ticket nuevo.
 * 
 * @param {object} opts
 * @param {string} opts.uuid - UUID único del ticket
 * @param {string} opts.userId - Dueño del ticket
 * @returns {{issuedAt: string, nonce: string, hmac: string}}
 */
export function generateTicketIssuance({ uuid, userId }) {
  const issuedAt = new Date().toISOString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const hmac = computeTicketHMAC({ uuid, userId, issuedAt, nonce });
  return { issuedAt, nonce, hmac };
}

/*
Ejemplos de uso (solo en server):

import { TICKET_PRICE, computeTicketHMAC, verifyTicketHMAC, generateTicketIssuance } from '@/lib/ticket.server';

// Crear ticket:
const { issuedAt, nonce, hmac } = generateTicketIssuance({ uuid, userId });

// Guardar en DB junto con uuid, userId, issuedAt, nonce, hmac.

// Verificar ticket:
const valido = verifyTicketHMAC(ticket);
*/
