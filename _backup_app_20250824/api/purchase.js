import prisma from "../../src/lib/prisma";
import { createTickets } from "../../lib/generateTickets";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId, raffleId, quantity } = req.body;

  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId } });
  if (!raffle || !raffle.isActive) {
    return res.status(400).json({ error: "Sorteo no disponible" });
  }

  const totalAmount = raffle.pricePerTicket * quantity;

  const purchase = await prisma.purchase.create({
    data: {
      userId,
      totalAmount,
    },
  });

  await createTickets(userId, raffleId, quantity, purchase.id);

  return res.status(200).json({ success: true });
}
