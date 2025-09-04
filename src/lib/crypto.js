// src/lib/crypto.js - SISTEMA UNIFICADO CON HMAC-SHA256 + INT CORREGIDO + SEGURIDAD MÁXIMA
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

// Clave secreta para HMAC - FAIL FAST SI NO ESTÁ CONFIGURADA
const TICKET_SECRET = process.env.TICKET_SECRET;
if (!TICKET_SECRET) {
  // Fail fast en cualquier entorno: más seguro detectar el error rápido
  throw new Error("TICKET_SECRET no está configurado. Definí la env var antes de iniciar el servidor.");
}

/**
 * Genera UUID v4 único para tickets
 */
export function generateTicketUUID() {
  return uuidv4();
}

/**
 * Genera código de display legible para usuarios
 * Formato: TK-ABC123 (6 caracteres alfanuméricos)
 */
export function generateDisplayCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TK-${timestamp.slice(-3)}-${random}`;
}

/**
 * HMAC-SHA256 seguro para validar tickets
 * Input: ticketUUID + userId + timestamp
 * Output: hash HMAC firmado con clave secreta
 */
export function createTicketHMAC(ticketUUID, userId, timestamp = Date.now()) {
  const input = `${ticketUUID}|${userId}|${timestamp}`;
  return crypto.createHmac("sha256", TICKET_SECRET).update(input).digest("hex");
}

/**
 * Verifica HMAC de un ticket (imposible de falsificar sin la clave secreta)
 */
export function verifyTicketHMAC(ticketUUID, userId, hmac, timestamp) {
  if (!hmac || typeof hmac !== "string") return false;

  const expectedHMAC = createTicketHMAC(ticketUUID, userId, timestamp);

  try {
    const a = Buffer.from(expectedHMAC, "hex");
    const b = Buffer.from(hmac, "hex");

    // timingSafeEqual requiere mismo tamaño
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    // error al parsear hex u otro fallo -> no válido
    return false;
  }
}

/**
 * Genera ticket completo con todos los campos necesarios
 * 🔄 CORREGIDO: Usar generatedAt como timestamp del HMAC
 */
export function generateTicketData(userId) {
  const uuid = generateTicketUUID();
  const displayCode = generateDisplayCode();
  const generatedAt = new Date();
  const timestamp = generatedAt.getTime(); // Usar el timestamp de generatedAt
  const hmac = createTicketHMAC(uuid, userId, timestamp);
  
  return {
    uuid,
    displayCode,
    hmac,
    generatedAt, // Fecha completa para guardar en DB
    timestamp    // Timestamp para HMAC
  };
}

/**
 * Valida un ticket completo
 */
export function validateTicket(ticketData, userId) {
  const { uuid, hmac, generatedAt } = ticketData;
  
  if (!uuid || !hmac || !generatedAt) {
    return { valid: false, error: "Datos incompletos del ticket" };
  }
  
  // Usar timestamp de generatedAt para validación
  const timestamp = new Date(generatedAt).getTime();
  
  if (!verifyTicketHMAC(uuid, userId, hmac, timestamp)) {
    return { valid: false, error: "Firma HMAC inválida" };
  }
  
  return { valid: true };
}

/**
 * 🔄 NUEVA: Función para calcular split con enteros puros
 * Calcula división 50/50 automática para fondos trabajando solo con enteros
 */
export function calculateFundSplitInt(ticketPrice, quantity) {
  // Validar inputs como enteros
  const priceInt = validateIntegerPrice(ticketPrice, "Precio del ticket");
  const qtyInt = Number(quantity);
  
  if (!Number.isInteger(qtyInt) || qtyInt <= 0) {
    throw new Error("La cantidad debe ser un número entero positivo");
  }
  
  // Contribución por ticket: mitad del precio (división entera)
  const ticketContribution = Math.floor(priceInt / 2);
  
  // Total de contribución al fondo de tickets
  const totalTicketContribution = ticketContribution * qtyInt;
  
  // Lo que queda para la plataforma
  const platformShare = (priceInt * qtyInt) - totalTicketContribution;
  
  return {
    ticketContribution,      // Por ticket individual
    totalTicketContribution, // Total para el fondo
    platformShare,           // Para la plataforma
    ticketPrice: priceInt,
    quantity: qtyInt,
    totalAmount: priceInt * qtyInt,
    splitPercentage: Math.round((ticketContribution / priceInt) * 100),
    priceType: 'INTEGER'
  };
}

/**
 * 🔄 CORREGIDA: Función legacy mantenida para compatibilidad
 */
export function calculateFundSplit(totalAmount) {
  const totalInt = Number(totalAmount);
  
  if (!Number.isInteger(totalInt) || totalInt <= 0) {
    throw new Error("El monto total debe ser un número entero positivo");
  }
  
  // División entera: la mitad va al fondo de tickets
  const ticketFund = Math.floor(totalInt / 2);
  const platformFund = totalInt - ticketFund;
  
  return {
    ticketFund,
    platformFund,
    splitPercentage: 50,
    totalAmount: totalInt,
    priceType: 'INTEGER'
  };
}

/**
 * Función para validar precios como enteros - CON REGLAS DE NEGOCIO
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
 * 🔄 NUEVA: Función para formatear input de precios desde el frontend
 * REGLAS EXACTAS: < 1000 → *1000, ≥ 1000 → literal, solo enteros, múltiplos de 1000
 */
export function formatTicketPriceInput(input) {
  if (input === undefined || input === null || String(input).trim() === "") {
    throw new Error("El precio es requerido");
  }
  // Aceptamos solo dígitos (sin decimales, sin símbolos)
  const raw = String(input).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error("El precio debe ser un número entero (sin decimales)");
  }
  let value = Number(raw);
  // Regla de miles
  value = value < 1000 ? value * 1000 : value;
  // Validaciones duras
  if (value < 1000) throw new Error("El precio mínimo es 1000");
  if (String(value).length > 8) throw new Error("El precio no puede superar 8 dígitos");
  if (value % 1000 !== 0) throw new Error("El precio debe ser múltiplo de 1000");
  return value;
}

/**
 * 🔄 NUEVA: Función para formatear precios al mostrar
 * Convierte enteros a formato user-friendly
 */
export function formatTicketPriceDisplay(priceInt, showAsThousands = true) {
  const price = Number(priceInt);
  
  if (!Number.isInteger(price)) {
    return '0';
  }

  if (showAsThousands && price >= 1000 && price % 1000 === 0) {
    // Mostrar como "5" en lugar de "5000" si es múltiplo de 1000
    return (price / 1000).toString();
  }

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

/**
 * Función para calcular totales con validación de enteros
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
    priceType: 'INTEGER'
  };
}

/**
 * 🔄 NUEVA: Calcular participantes necesarios para cubrir un premio
 */
export function calculateParticipantsNeeded(prizeValue, ticketPrice) {
  const prizeInt = validateIntegerPrice(prizeValue, "Valor del premio");
  const priceInt = validateIntegerPrice(ticketPrice, "Precio del ticket");
  
  // Cada ticket contribuye con la mitad de su precio al fondo
  const contributionPerTicket = Math.floor(priceInt / 2);
  
  if (contributionPerTicket === 0) {
    throw new Error("El precio del ticket es muy bajo para generar contribución");
  }
  
  // Participantes necesarios para cubrir el premio
  const participantsNeeded = Math.ceil(prizeInt / contributionPerTicket);
  
  return {
    prizeValue: prizeInt,
    ticketPrice: priceInt,
    contributionPerTicket,
    participantsNeeded,
    totalContribution: participantsNeeded * contributionPerTicket,
    platformShare: (participantsNeeded * priceInt) - (participantsNeeded * contributionPerTicket)
  };
}

/**
 * Función para formatear precios como enteros para mostrar (legacy)
 */
export function formatIntegerPrice(price, currency = 'ARS') {
  return formatTicketPriceDisplay(price, false);
}

// Backwards-compatible aliases
export function generateTicketCode() {
  return generateDisplayCode();
}

export function createTicketHash(ticketUUID, userId, timestamp = Date.now()) {
  return createTicketHMAC(ticketUUID, userId, timestamp);
}