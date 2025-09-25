// src/lib/prisma.js
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;
const isProd = process.env.NODE_ENV === 'production';

// ⚠️ Importante: el URL real viene del .env (DATABASE_URL con pgBouncer)
// No pases DIRECT_URL aquí: DIRECT_URL es solo para migraciones.

function createPrismaClient() {
  return new PrismaClient({
    // Aseguramos el datasource explícitamente (evita sorpresas si el env cambia)
    datasources: { db: { url: process.env.DATABASE_URL } },
    // Logs: verbosos en dev, mínimos en prod
    log: isProd ? ['error'] : ['error', 'warn'],
  });
}

// Singleton en dev para evitar "Too many Prisma Clients"
// En prod (serverless) una nueva instancia por lambda está OK.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (!isProd) globalForPrisma.prisma = prisma;

export default prisma;
