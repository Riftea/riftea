// src/lib/cron-jobs.js — NO-OP (crons deshabilitados)

/**
 * Inicializa cron jobs (no-op).
 * Se deja para compatibilidad con cualquier import/llamada existente.
 */
export function initializeCronJobs() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('⏭️ Cron jobs deshabilitados (no-op).');
  }
}

/**
 * Devuelve el estado de los cron jobs (siempre deshabilitados).
 */
export function getCronStatus() {
  return {
    initialized: false,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    tz: process.env.CRON_TZ || 'America/Argentina/Buenos_Aires',
  };
}

/**
 * Detiene cron jobs (no-op).
 */
export function stopCronJobs() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('🛑 Cron jobs ya estaban detenidos (no-op).');
  }
}

/* =========================
   Handlers opcionales (compat)
   ========================= */

export async function GET() {
  return Response.json(
    {
      success: true,
      message: 'Cron jobs deshabilitados (no-op).',
      ...getCronStatus(),
    },
    { status: 200 }
  );
}

export async function POST() {
  // Mantener idempotencia: responder estado en vez de iniciar nada.
  return GET();
}
