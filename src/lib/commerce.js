// =============================================================
export const TICKETS_PER_AMOUNT_ARSCENTS = 1000_00; // 1000 ARS -> 1 ticket (ajustá a gusto)


/** Devuelve cuántos tickets corresponden dada una suma en centavos ARS */
export function calcTicketsFromAmount(totalCents) {
if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
return Math.floor(totalCents / TICKETS_PER_AMOUNT_ARSCENTS);
}


/** Formatea ARS desde centavos */
export function formatARS(cents) {
const v = (Number(cents || 0) / 100).toFixed(2);
return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v);
}


/** Suma total del carrito */
export function cartTotalCents(items) {
return items.reduce((acc, it) => acc + (it.unitPrice * it.quantity), 0);
}


// Generación de tickets (simple y segura)
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';


/** Genera estructura mínima para crear un Ticket */
export function buildTicketData(userId) {
const uuid = uuidv4();
const code = `T-${uuid.slice(0,8).toUpperCase()}`;
const secret = process.env.TICKETS_HMAC_SECRET || 'dev-secret';
const hash = crypto.createHmac('sha256', secret).update(uuid).digest('hex');
return {
uuid,
code,
hash,
userId,
status: 'AVAILABLE',
isUsed: false,
isWinner: false,
};
}


/** Emite N tickets genéricos para un usuario */
export async function issueGenericTickets(prisma, userId, count) {
if (!count || count <= 0) return [];
const data = Array.from({ length: count }, () => buildTicketData(userId));
const created = await prisma.ticket.createMany({ data, skipDuplicates: true });
// createMany no devuelve registros; los consultamos por codes generados
// Simple: devolvemos count, y que el caller recargue /api/tickets/my
return { count: created.count };
}