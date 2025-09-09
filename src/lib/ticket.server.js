import 'server-only';

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

// Variables obligatorias: deben estar en el .env
export const TICKET_PRICE = requireIntEnv('RAFFLES_TICKET_PRICE');
export const POT_CONTRIBUTION_PER_TICKET = requireIntEnv(
  'RAFFLES_POT_CONTRIBUTION_PER_TICKET'
);

export const TICKET_CONSTANTS = Object.freeze({
  TICKET_PRICE,
  POT_CONTRIBUTION_PER_TICKET,
});

/*
Ejemplos de uso (solo en server):

import { TICKET_PRICE } from '@/lib/ticket.server';
// const total = cantidad * TICKET_PRICE;

import { POT_CONTRIBUTION_PER_TICKET } from '@/lib/ticket.server';
// const minParticipants = Math.ceil(prizeValue / POT_CONTRIBUTION_PER_TICKET);
*/
