// scripts/verifyTicket.js
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { verifyTicketHMAC } from '../src/lib/crypto.server.js';


async function main() {
  const ticketIdOrCode = process.argv[2];
  if (!ticketIdOrCode) {
    console.error('Uso: node scripts/verifyTicket.js <ticketId|ticketCode>');
    process.exit(1);
  }

  let ticket = await prisma.ticket.findUnique({ where: { id: ticketIdOrCode } });
  if (!ticket) {
    ticket = await prisma.ticket.findUnique({ where: { code: ticketIdOrCode } });
  }
  if (!ticket) {
    console.error('❌ Ticket no encontrado');
    process.exit(1);
  }

  console.log('🎟️ Ticket:', {
    id: ticket.id,
    code: ticket.code,
    uuid: ticket.uuid,
    userId: ticket.userId,
    generatedAt: ticket.generatedAt ?? ticket.createdAt,
    hashFirst8: ticket.hash?.slice(0, 8) + '...',
  });

  const ts = ticket.generatedAt ?? ticket.createdAt;
  if (!ts) {
    console.error('❌ El ticket no tiene fecha de generación');
    process.exit(1);
  }

  const timestampInput = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  const ok = verifyTicketHMAC(ticket.uuid, ticket.userId, ticket.hash, timestampInput);

  console.log('🔐 TICKET_SECRET presente:', !!process.env.TICKET_SECRET);
  console.log('🧪 Timestamp usado:', timestampInput);
  console.log('✅ ¿Firma válida?:', ok);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
