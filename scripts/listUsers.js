// scripts/listUsers.js
import prisma from "../src/lib/prisma.js";

async function main() {
  const url = process.env.DATABASE_URL || "NO_DB";
  console.log("DATABASE_URL (slice):", url ? url.slice(0,50) : url);
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true }, take: 50 });
  console.log("Usuarios en DB:", users);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });

