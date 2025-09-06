// src/lib/crypto.server.js
import 'server-only';
import crypto from 'crypto';

const SECRET = process.env.TICKET_SECRET || process.env.NEXTAUTH_SECRET || 'change-me-in-prod';

function hmacHex(...parts) {
  const h = crypto.createHmac('sha256', SECRET);
  for (const p of parts) h.update(String(p));
  return h.digest('hex');
}

/**
 * uuid legible/estable
 */
export function generateTicketUUID() {
  // cuid-like simple
  const rnd = crypto.randomBytes(16).toString('hex');
  const ts = Date.now().toString(36);
  return `t_${ts}_${rnd}`;
}

/**
 * código corto para mostrar: TK-XXX-XXXX (8–10 chars máx)
 */
export function generateTicketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const take = (n) => Array.from(crypto.randomFillSync(new Uint8Array(n))).map(b => alphabet[b % alphabet.length]).join('');
  return `TK-${take(3)}-${take(4)}`;
}

/**
 * HMAC canónico (v2): uuid | userId | issuedAtMs
 */
export function createTicketHMAC(uuid, userId, issuedAtMs) {
  return hmacHex(uuid, '|', userId, '|', issuedAtMs);
}

/**
 * Verificación flexible: admite issuedAt como número o string
 */
export function verifyTicketHMAC(uuid, userId, hash, issuedAt) {
  const ts = typeof issuedAt === 'number' ? issuedAt : Number(new Date(issuedAt).getTime());
  if (!uuid || !userId || !hash || !Number.isFinite(ts)) return false;
  const expect = createTicketHMAC(uuid, userId, ts);
  // timingSafeEqual
  const a = Buffer.from(hash);
  const b = Buffer.from(expect);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
