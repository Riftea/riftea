// src/lib/crypto.js
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

/**
 * 🎟️ Genera UUID v4 único para tickets
 */
export function generateTicketUUID() {
  return uuidv4();
}

/**
 * 🔐 Crea hash SHA256 para verificar propiedad del ticket
 * Combina: ticketUUID + userId + timestamp para máxima seguridad
 */
export function createTicketHash(ticketUUID, userId, timestamp = Date.now()) {
  const input = `${ticketUUID}|${userId}|${timestamp}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * ✅ Verifica si un ticket pertenece a un usuario
 */
export function verifyTicketOwnership(ticketUUID, userId, hash, timestamp) {
  const expectedHash = createTicketHash(ticketUUID, userId, timestamp);
  return expectedHash === hash;
}

/**
 * 🔢 Genera código ticket legible (backup UUID)
 * Formato: RFT-A1B2C3 (para mostrar a usuarios)
 */
export function generateTicketCode() {
  return `RFT-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
}

/**
 * 💰 Calcula división 50/50 automática
 */
export function calculateFundSplit(totalAmount) {
  const ticketFund = Math.floor(totalAmount * 0.5 * 100) / 100; // redondeo
  const platformFund = totalAmount - ticketFund;
  
  return {
    ticketFund,
    platformFund,
    splitPercentage: 50
  };
}