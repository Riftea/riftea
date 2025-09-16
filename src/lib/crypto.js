// src/lib/crypto.js - SISTEMA UNIFICADO CON HMAC-SHA256 + ENTEROS + FAIL-FAST (endurecido)
// - Parche seguro SIN migraciones: el HMAC ahora incluye también el displayCode.
// - Mantiene compatibilidad con tus helpers y alias existentes.

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  TICKET_PRICE,
  POT_CONTRIBUTION_PER_TICKET,
} from "@/lib/ticket.server";

// ====== Configuración de secreto (FAIL FAST) ======
const TICKET_SECRET = process.env.TICKET_SECRET;
if (!TICKET_SECRET) {
  throw new Error(
    "TICKET_SECRET no está configurado. Definí la variable de entorno antes de iniciar el servidor."
  );
}

// ====== Generación de identificadores ======

/**
 * Genera UUID v4 único para tickets
 */
export function generateTicketUUID() {
  return uuidv4();
}

/**
 * Genera código legible para mostrar a usuarios
 * Ej: TK-ABC-1234 (longitud corta, alfanumérico)
 */
export function generateDisplayCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres confusos
  const take = (n) =>
    Array.from(crypto.randomFillSync(new Uint8Array(n)))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `TK-${take(3)}-${take(4)}`;
}

// ====== HMAC ======

/**
 * HMAC-SHA256 seguro para validar tickets
 * Input: ticketUUID | userId | timestamp | displayCode (endurecido)
 * Output: hash HEX firmado con clave secreta
 */
export function createTicketHMAC(
  ticketUUID,
  userId,
  timestamp = Date.now(),
  displayCode = ""
) {
  const input = `${ticketUUID}|${userId}|${timestamp}|${displayCode}`;
  return crypto.createHmac("sha256", TICKET_SECRET).update(input).digest("hex");
}

/**
 * Verifica HMAC de un ticket (timingSafeEqual y buffers HEX)
 * Debe recibir el mismo displayCode que se emitió para ese ticket.
 */
export function verifyTicketHMAC(
  ticketUUID,
  userId,
  hmac,
  timestamp,
  displayCode = ""
) {
  if (!hmac || typeof hmac !== "string") return false;

  const expectedHMAC = createTicketHMAC(
    ticketUUID,
    userId,
    timestamp,
    displayCode
  );

  try {
    const a = Buffer.from(expectedHMAC, "hex");
    const b = Buffer.from(hmac, "hex");
    if (a.length !== b.length) return false; // timingSafeEqual requiere mismo tamaño
    return crypto.timingSafeEqual(a, b);
  } catch {
    // error al parsear hex u otro fallo -> no válido
    return false;
  }
}

// ====== Ticket helpers ======

/**
 * Genera ticket completo con todos los campos necesarios
 * Usamos generatedAt como timestamp de la firma para consistencia
 */
export function generateTicketData(userId) {
  const uuid = generateTicketUUID();
  const displayCode = generateDisplayCode();
  const generatedAt = new Date();
  const timestamp = generatedAt.getTime();
  // HMAC endurecido: incluye displayCode
  const hmac = createTicketHMAC(uuid, userId, timestamp, displayCode);

  return {
    uuid,
    displayCode, // se persiste en tu modelo actual (sin migraciones)
    hmac,        // hex: NUNCA exponer al cliente
    generatedAt, // Date
    timestamp,   // number (ms) – opcional guardar explícito
  };
}

/**
 * Valida un ticket completo contra un userId (incluye displayCode)
 * ticketData debe contener: { uuid, hmac, generatedAt, displayCode }
 */
export function validateTicket(ticketData, userId) {
  const { uuid, hmac, generatedAt, displayCode } = ticketData || {};
  if (!uuid || !hmac || !generatedAt) {
    return { valid: false, error: "Datos incompletos del ticket" };
  }
  const timestamp = new Date(generatedAt).getTime();
  const ok = verifyTicketHMAC(uuid, userId, hmac, timestamp, displayCode || "");
  if (!ok) return { valid: false, error: "Firma HMAC inválida" };
  return { valid: true };
}

// ====== Reglas de precios enteros (negocio) ======

/**
 * Valida enteros genéricos con reglas de negocio:
 * - Entero
 * - Mínimo 1000
 * - Máximo 8 dígitos
 * - Múltiplo de 1000
 *
 * Útil p/ validar prizeValue u otros montos configurables.
 */
export function validateIntegerPrice(price, fieldName = "precio") {
  const priceInt = Number(price);
  if (!Number.isInteger(priceInt)) {
    throw new Error(`${fieldName} debe ser un número entero`);
  }
  if (priceInt < 1000) {
    throw new Error(`${fieldName} debe ser como mínimo 1000`);
  }
  if (String(priceInt).length > 8) {
    throw new Error(`${fieldName} no puede superar 8 dígitos`);
  }
  if (priceInt % 1000 !== 0) {
    throw new Error(`${fieldName} debe ser múltiplo de 1000`);
  }
  return priceInt;
}

/**
 * (Opcional / Legacy)
 * Sanitiza una entrada numérica PARA DISPLAY genérico (no edita el precio del sistema).
 * - Mantiene solo dígitos
 * - Devuelve entero (0 si vacío)
 */
export function formatTicketPriceInput(input) {
  const raw = String(input ?? "").replace(/[^\d]/g, "");
  return raw ? Number(raw) : 0;
}

/**
 * Convierte enteros a formato user-friendly para display.
 * Si showAsThousands = true y es múltiplo de 1000, muestra "5" en lugar de "5000".
 * Úsalo para mostrar TICKET_PRICE o montos de server.
 */
export function formatTicketPriceDisplay(priceInt, showAsThousands = true) {
  const price = Number(priceInt);
  if (!Number.isInteger(price)) return "0";

  if (showAsThousands && price >= 1000 && price % 1000 === 0) {
    return (price / 1000).toString();
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Calcula totales usando el precio FIJO del sistema.
 * Firma nueva: calculateTicketTotal(quantity)
 */
export function calculateTicketTotal(quantity) {
  const qtyInt = Number(quantity);
  if (!Number.isInteger(qtyInt) || qtyInt <= 0) {
    throw new Error("La cantidad debe ser un número entero positivo");
  }

  return {
    ticketPrice: TICKET_PRICE,
    quantity: qtyInt,
    totalAmount: TICKET_PRICE * qtyInt,
    priceType: "INTEGER",
  };
}

/**
 * Calcular split con enteros puros usando constantes del sistema.
 * Firma nueva: calculateFundSplitInt(quantity)
 * - Aporte por ticket: POT_CONTRIBUTION_PER_TICKET
 * - Precio por ticket: TICKET_PRICE
 */
export function calculateFundSplitInt(quantity) {
  const qtyInt = Number(quantity);
  if (!Number.isInteger(qtyInt) || qtyInt <= 0) {
    throw new Error("La cantidad debe ser un número entero positivo");
  }

  const ticketContribution = POT_CONTRIBUTION_PER_TICKET;
  const totalTicketContribution = ticketContribution * qtyInt;
  const platformShare = (TICKET_PRICE - ticketContribution) * qtyInt;

  return {
    ticketContribution, // aporte por ticket
    totalTicketContribution, // total al fondo
    platformShare, // para la plataforma
    ticketPrice: TICKET_PRICE,
    quantity: qtyInt,
    totalAmount: TICKET_PRICE * qtyInt,
    splitPercentage: Math.round((ticketContribution / TICKET_PRICE) * 100),
    priceType: "INTEGER",
  };
}

/**
 * Legacy: split a partir de un total entero (50/50)
 * (Se mantiene por compatibilidad con llamadas antiguas que ya pasaban un total)
 */
export function calculateFundSplit(totalAmount) {
  const totalInt = Number(totalAmount);
  if (!Number.isInteger(totalInt) || totalInt <= 0) {
    throw new Error("El monto total debe ser un número entero positivo");
  }
  const ticketFund = Math.floor(totalInt / 2);
  const platformFund = totalInt - ticketFund;

  return {
    ticketFund,
    platformFund,
    splitPercentage: 50,
    totalAmount: totalInt,
    priceType: "INTEGER",
  };
}

/**
 * Calcula cuántos participantes necesitás para cubrir un premio
 * usando el aporte fijo del sistema (POT_CONTRIBUTION_PER_TICKET).
 * Firma nueva: calculateParticipantsNeeded(prizeValue)
 */
export function calculateParticipantsNeeded(prizeValue) {
  const prizeInt = validateIntegerPrice(prizeValue, "Valor del premio");

  const contributionPerTicket = POT_CONTRIBUTION_PER_TICKET;
  if (contributionPerTicket <= 0) {
    throw new Error("La contribución por ticket no es válida");
  }

  const participantsNeeded = Math.ceil(prizeInt / contributionPerTicket);

  return {
    prizeValue: prizeInt,
    ticketPrice: TICKET_PRICE,
    contributionPerTicket,
    participantsNeeded,
    totalContribution: participantsNeeded * contributionPerTicket,
    platformShare:
      participantsNeeded * TICKET_PRICE -
      participantsNeeded * contributionPerTicket,
  };
}

/**
 * Formateo de enteros como precio (alias legacy)
 */
export function formatIntegerPrice(price, currency = "ARS") {
  // Mantener comportamiento: devuelve moneda completa
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price) || 0);
}

// ====== Aliases de compatibilidad ======
export function generateTicketCode() {
  return generateDisplayCode();
}
export function createTicketHash(
  ticketUUID,
  userId,
  timestamp = Date.now(),
  displayCode = ""
) {
  // alias que respeta la nueva firma endurecida (incluye displayCode)
  return createTicketHMAC(ticketUUID, userId, timestamp, displayCode);
}
