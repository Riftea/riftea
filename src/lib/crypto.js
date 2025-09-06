// src/lib/crypto.js - SISTEMA UNIFICADO CON HMAC-SHA256 + ENTEROS + FAIL-FAST
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

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
 * Input: ticketUUID | userId | timestamp
 * Output: hash HEX firmado con clave secreta
 */
export function createTicketHMAC(ticketUUID, userId, timestamp = Date.now()) {
  const input = `${ticketUUID}|${userId}|${timestamp}`;
  return crypto.createHmac("sha256", TICKET_SECRET).update(input).digest("hex");
}

/**
 * Verifica HMAC de un ticket (timingSafeEqual y buffers HEX)
 */
export function verifyTicketHMAC(ticketUUID, userId, hmac, timestamp) {
  if (!hmac || typeof hmac !== "string") return false;

  const expectedHMAC = createTicketHMAC(ticketUUID, userId, timestamp);

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
  const hmac = createTicketHMAC(uuid, userId, timestamp);

  return {
    uuid,
    displayCode,
    hmac,         // hex
    generatedAt,  // Date
    timestamp,    // number (ms) – opcional guardar explícito
  };
}

/**
 * Valida un ticket completo contra un userId
 */
export function validateTicket(ticketData, userId) {
  const { uuid, hmac, generatedAt } = ticketData || {};
  if (!uuid || !hmac || !generatedAt) {
    return { valid: false, error: "Datos incompletos del ticket" };
    }
  const timestamp = new Date(generatedAt).getTime();
  const ok = verifyTicketHMAC(uuid, userId, hmac, timestamp);
  if (!ok) return { valid: false, error: "Firma HMAC inválida" };
  return { valid: true };
}

// ====== Reglas de precios enteros (negocio) ======

/**
 * Valida precios como enteros con reglas de negocio:
 * - Entero
 * - Mínimo 1000
 * - Máximo 8 dígitos
 * - Múltiplo de 1000
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
 * Formatea el input de precios desde el frontend:
 * - Solo dígitos
 * - <1000 => *1000
 * - >=1000 => literal
 * - Valida reglas duras
 */
export function formatTicketPriceInput(input) {
  if (input === undefined || input === null || String(input).trim() === "") {
    throw new Error("El precio es requerido");
  }
  const raw = String(input).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error("El precio debe ser un número entero (sin decimales)");
  }
  let value = Number(raw);
  value = value < 1000 ? value * 1000 : value;

  if (value < 1000) throw new Error("El precio mínimo es 1000");
  if (String(value).length > 8) throw new Error("El precio no puede superar 8 dígitos");
  if (value % 1000 !== 0) throw new Error("El precio debe ser múltiplo de 1000");

  return value;
}

/**
 * Convierte enteros a formato user-friendly para display.
 * Si showAsThousands = true y es múltiplo de 1000, muestra "5" en lugar de "5000".
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
 * Calcula totales con validación de enteros
 */
export function calculateTicketTotal(ticketPrice, quantity) {
  const priceInt = validateIntegerPrice(ticketPrice, "Precio del ticket");
  const qtyInt = Number(quantity);

  if (!Number.isInteger(qtyInt) || qtyInt <= 0) {
    throw new Error("La cantidad debe ser un número entero positivo");
  }

  return {
    ticketPrice: priceInt,
    quantity: qtyInt,
    totalAmount: priceInt * qtyInt,
    priceType: "INTEGER",
  };
}

/**
 * Calcular split con enteros puros 50/50 (por ticket y total)
 */
export function calculateFundSplitInt(ticketPrice, quantity) {
  const priceInt = validateIntegerPrice(ticketPrice, "Precio del ticket");
  const qtyInt = Number(quantity);

  if (!Number.isInteger(qtyInt) || qtyInt <= 0) {
    throw new Error("La cantidad debe ser un número entero positivo");
  }

  const ticketContribution = Math.floor(priceInt / 2);
  const totalTicketContribution = ticketContribution * qtyInt;
  const platformShare = priceInt * qtyInt - totalTicketContribution;

  return {
    ticketContribution,      // aporte por ticket
    totalTicketContribution, // total al fondo
    platformShare,           // para la plataforma
    ticketPrice: priceInt,
    quantity: qtyInt,
    totalAmount: priceInt * qtyInt,
    splitPercentage: Math.round((ticketContribution / priceInt) * 100),
    priceType: "INTEGER",
  };
}

/**
 * Legacy: split a partir de un total entero (50/50)
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
 * considerando que cada ticket aporta floor(precio/2) al fondo.
 */
export function calculateParticipantsNeeded(prizeValue, ticketPrice) {
  const prizeInt = validateIntegerPrice(prizeValue, "Valor del premio");
  const priceInt = validateIntegerPrice(ticketPrice, "Precio del ticket");

  const contributionPerTicket = Math.floor(priceInt / 2);
  if (contributionPerTicket === 0) {
    throw new Error("El precio del ticket es muy bajo para generar contribución");
  }

  const participantsNeeded = Math.ceil(prizeInt / contributionPerTicket);

  return {
    prizeValue: prizeInt,
    ticketPrice: priceInt,
    contributionPerTicket,
    participantsNeeded,
    totalContribution: participantsNeeded * contributionPerTicket,
    platformShare: participantsNeeded * priceInt - participantsNeeded * contributionPerTicket,
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
export function createTicketHash(ticketUUID, userId, timestamp = Date.now()) {
  return createTicketHMAC(ticketUUID, userId, timestamp);
}
