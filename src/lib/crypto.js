// src/lib/crypto.js - SISTEMA UNIFICADO CON HMAC-SHA256
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

// Clave secreta para HMAC (debe estar en .env)
const TICKET_SECRET = process.env.TICKET_SECRET || "tu-clave-secreta-muy-segura-cambiar-en-produccion";

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
  if (!TICKET_SECRET) {
    // En desarrollo se puede permitir, pero conviene fallar o avisar.
    console.warn("TICKET_SECRET no configurado. Verificación HMAC deshabilitada.");
    return false;
  }

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
 */
export function generateTicketData(userId) {
  const uuid = generateTicketUUID();
  const displayCode = generateDisplayCode();
  const timestamp = Date.now();
  const hmac = createTicketHMAC(uuid, userId, timestamp);
  
  return {
    uuid,
    displayCode,
    hmac,
    timestamp,
    generatedAt: new Date(timestamp)
  };
}

/**
 * Valida un ticket completo
 */
export function validateTicket(ticketData, userId) {
  const { uuid, hmac, timestamp } = ticketData;
  
  if (!uuid || !hmac || !timestamp) {
    return { valid: false, error: "Datos incompletos del ticket" };
  }
  
  if (!verifyTicketHMAC(uuid, userId, hmac, timestamp)) {
    return { valid: false, error: "Firma HMAC inválida" };
  }
  
  return { valid: true };
}

/**
 * Calcula división 50/50 automática para fondos
 */
export function calculateFundSplit(totalAmount) {
  const ticketFund = Math.floor(totalAmount * 0.5 * 100) / 100;
  const platformFund = totalAmount - ticketFund;
  
  return {
    ticketFund,
    platformFund,
    splitPercentage: 50
  };
}

// Función para validar la configuración
export function validateCryptoConfig() {
  if (!TICKET_SECRET || TICKET_SECRET.length < 32) {
    const msg = "TICKET_SECRET no configurado o muy corto. Usar clave segura en producción.";
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    } else {
      console.warn("⚠️ " + msg);
      return false;
    }
  }
  return true;
}

// Validar configuración al importar
validateCryptoConfig();

// Backwards-compatible aliases (mantenemos la API antigua para servicios que aún la importan)
export function generateTicketCode() {
  // alias a la nueva función de display code
  return generateDisplayCode();
}

/**
 * Alias para compatibilidad: createTicketHash -> createTicketHMAC
 * Nota: la firma es (ticketUUID, userId, timestamp?)
 * Si en otras partes esperabas SHA256(userId+uuid) — entonces hay que migrar esos lugares.
 */
export function createTicketHash(ticketUUID, userId, timestamp = Date.now()) {
  return createTicketHMAC(ticketUUID, userId, timestamp);
}