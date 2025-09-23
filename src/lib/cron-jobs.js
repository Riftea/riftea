// src/lib/cron-jobs.js - CORREGIDO (reemplazar completo)
import cron from 'node-cron';
import prisma from '@/lib/prisma';
import { executeRaffleJob, checkRaffleProgressJob, cleanupExpiredRafflesJob } from '@/jobs/checkProgress';

// Evita doble inicialización en hot-reload dev / múltiples imports
const globalCron = globalThis.__rifteaCron ?? { initialized: false };
globalThis.__rifteaCron = globalCron;

let isInitialized = globalCron.initialized;

export function initializeCronJobs() {
  if (isInitialized) {
    console.log('⚠️ Cron jobs ya están inicializados');
    return;
  }

  console.log('🚀 Inicializando cron jobs para sorteos automáticos...');

  // JOB 1: Verificar sorteos cerca de completarse (cada 30s)
  cron.schedule('*/30 * * * * *', async () => {
    try {
      // ⚠️ REMOVIDO: { maxParticipants: { not: null } } — no hace falta, es no nulo en el schema
      const activeRaffles = await prisma.raffle.findMany({
        where: {
          status: { in: ['ACTIVE', 'PUBLISHED'] },
          drawAt: null, // sin programar aún
        },
        select: {
          id: true,
          maxParticipants: true,
          _count: { select: { participations: true } },
        },
      });

      // Solo verificar sorteos que están al 80% o más de capacidad
      const needsCheck = activeRaffles.filter((r) =>
        typeof r.maxParticipants === 'number' &&
        r.maxParticipants > 0 &&
        r._count.participations >= Math.floor(r.maxParticipants * 0.8)
      );

      if (needsCheck.length > 0) {
        console.log(`📊 Verificando ${needsCheck.length} sorteos cerca de completarse`);
        for (const raffle of needsCheck) {
          try {
            await checkRaffleProgressJob({
              data: {
                raffleId: raffle.id,
                deltaParticipants: 1,
              },
            });
          } catch (error) {
            console.error(`Error verificando progreso ${raffle.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error en cron de verificación:', error);
    }
  });

  // JOB 2: Ejecutar sorteos programados (cada minuto)
  cron.schedule('0 * * * * *', async () => {
    try {
      const now = new Date();

      const readyRaffles = await prisma.raffle.findMany({
        where: {
          status: 'READY_TO_DRAW',
          drawAt: { lte: now },
          drawnAt: null,
          winnerParticipationId: null,
        },
        select: {
          id: true,
          title: true,
          drawAt: true,
        },
      });

      if (readyRaffles.length > 0) {
        console.log(`🎯 Ejecutando ${readyRaffles.length} sorteos programados automáticamente`);
        for (const raffle of readyRaffles) {
          try {
            const result = await executeRaffleJob({
              data: {
                raffleId: raffle.id,
                scheduledBy: 'cron-system',
                reason: 'automatic_scheduled_execution',
              },
            });
            console.log(
              `✅ Sorteo ${raffle.id} (${raffle.title}) ejecutado. Ganador: ${result.winnerUserId || 'N/A'}`
            );
          } catch (error) {
            console.error(`❌ Error ejecutando sorteo ${raffle.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error en cron de ejecución:', error);
    }
  });

  // JOB 3: Limpieza y mantenimiento (cada 10 minutos)
  cron.schedule('0 */10 * * * *', async () => {
    try {
      const result = await cleanupExpiredRafflesJob({});
      if (result.cleanedRaffles > 0) {
        console.log(
          `🧹 Limpieza completada: ${result.cleanedRaffles} sorteos cancelados por vencimiento`
        );
      }
    } catch (error) {
      console.error('❌ Error en cron de limpieza:', error);
    }
  });

  // JOB 4: Verificación de estado general (cada hora)
  cron.schedule('0 0 * * * *', async () => {
    try {
      const stats = await getSystemStats();
      console.log('📊 Estadísticas del sistema:', stats);
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
    }
  });

  isInitialized = true;
  globalCron.initialized = true;
  console.log('✅ Cron jobs inicializados correctamente');
}

// Función auxiliar para estadísticas
async function getSystemStats() {
  const [active, readyToDraw, finished, total] = await Promise.all([
    prisma.raffle.count({ where: { status: 'ACTIVE' } }),
    prisma.raffle.count({ where: { status: 'READY_TO_DRAW' } }),
    prisma.raffle.count({ where: { status: 'FINISHED' } }),
    prisma.raffle.count(),
  ]);

  return {
    raffles: { active, readyToDraw, finished, total },
    timestamp: new Date().toISOString(),
  };
}

// Estado de cron jobs
export function getCronStatus() {
  return {
    initialized: isInitialized,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  };
}

// Detener cron jobs (tests)
export function stopCronJobs() {
  if (isInitialized) {
    cron.destroy();
    isInitialized = false;
    globalCron.initialized = false;
    console.log('🛑 Cron jobs detenidos');
  }
}

// Handlers “manuales” para testear (si lo montás como ruta)
export async function GET() {
  try {
    const now = new Date();
    // ⚠️ REMOVIDO: maxParticipants: { not: null }
    const [activeCount, readyCount] = await Promise.all([
      prisma.raffle.count({
        where: {
          status: { in: ['ACTIVE', 'PUBLISHED'] },
          drawAt: null,
        },
      }),
      prisma.raffle.count({
        where: {
          status: 'READY_TO_DRAW',
          drawAt: { lte: now },
          drawnAt: null,
        },
      }),
    ]);

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      initialized: isInitialized,
      pendingVerification: activeCount,
      readyToExecute: readyCount,
      stats: await getSystemStats(),
    });
  } catch (error) {
    console.error('❌ Error en status manual:', error);
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
