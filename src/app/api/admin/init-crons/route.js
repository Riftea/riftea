export const runtime = 'nodejs';
// src/app/api/admin/init-crons/route.js
import { initializeCronJobs } from '@/lib/cron-jobs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req) {
  try {
    // Verificar autenticación de admin (opcional pero recomendado)
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    // TODO: Verificar si el usuario es admin
    // if (session.user.role !== 'admin') {
    //   return Response.json({ error: 'Requiere permisos de administrador' }, { status: 403 });
    // }

    console.log('🔧 Inicialización manual de cron jobs solicitada por:', session.user.email);
    
    initializeCronJobs();
    
    return Response.json({ 
      success: true, 
      message: 'Cron jobs inicializados correctamente',
      timestamp: new Date().toISOString(),
      initialized: true
    });
  } catch (error) {
    console.error('❌ Error en inicialización manual:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

export async function GET() {
  // Status de cron jobs
  return Response.json({
    initialized: global.cronJobsInitialized || false,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
}
