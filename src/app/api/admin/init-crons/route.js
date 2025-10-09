// src/app/api/admin/init-crons/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST: antes disparaba cron jobs. Ahora es un no-op seguro.
export async function POST() {
  return Response.json(
    {
      ok: true,
      initialized: false,
      message: 'Cron jobs deshabilitados (no-op).',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

// GET: estado de cron jobs (siempre deshabilitados)
export async function GET() {
  return Response.json({
    initialized: false,
    message: 'Cron jobs deshabilitados (no-op).',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
