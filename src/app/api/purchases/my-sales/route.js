// app/api/purchases/my-sales/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.js';
import prisma from '@/lib/prisma.js';

export async function GET() {
  console.log('💰 [MY-SALES] ===== INICIO DE SOLICITUD =====');
  
  try {
    // Obtener sesión
    console.log('💰 [MY-SALES] Obteniendo sesión...');
    const session = await getServerSession(authOptions);
    console.log('💰 [MY-SALES] Sesión obtenida:', {
      exists: !!session,
      userExists: !!session?.user,
      emailExists: !!session?.user?.email,
      email: session?.user?.email
    });

    if (!session?.user?.email) {
      console.log('💰 [MY-SALES] Usuario no autenticado');
      return NextResponse.json({ 
        error: 'No autorizado',
        code: 'UNAUTHORIZED'
      }, { status: 401 });
    }

    console.log('💰 [MY-SALES] Usuario autenticado:', session.user.email);
    
    // Verificar conexión a la base de datos
    console.log('💰 [MY-SALES] Verificando conexión a BD...');
    try {
      await prisma.$connect();
      console.log('💰 [MY-SALES] Conexión a BD establecida');
    } catch (dbError) {
      console.error('💰 [MY-SALES] Error conectando a BD:', {
        message: dbError.message,
        code: dbError.code,
        stack: dbError.stack
      });
      return NextResponse.json({
        error: 'Error de conexión a base de datos',
        code: 'DB_CONNECTION_ERROR',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      }, { status: 500 });
    }

    // Buscar usuario
    console.log('💰 [MY-SALES] Buscando usuario en BD...');
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, email: true }
    });

    console.log('💰 [MY-SALES] Resultado búsqueda usuario:', {
      found: !!dbUser,
      id: dbUser?.id,
      name: dbUser?.name
    });

    if (!dbUser) {
      console.log('💰 [MY-SALES] Usuario no encontrado en BD');
      return NextResponse.json({ 
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      }, { status: 404 });
    }

    console.log('💰 [MY-SALES] Buscando raffles del usuario...');
    
    // Buscar raffles del usuario (sus ventas) - Verificar que existe el modelo
    let userRaffles;
    try {
      userRaffles = await prisma.raffle.findMany({
        where: { 
          ownerId: dbUser.id 
        },
        include: {
          _count: {
            select: {
              tickets: true,
              participations: {
                where: {
                  // Solo participaciones válidas si necesario
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (raffleError) {
      console.error('💰 [MY-SALES] Error buscando raffles:', {
        message: raffleError.message,
        code: raffleError.code
      });
      
      // Si el modelo no existe o hay error de schema, devolver respuesta vacía
      return NextResponse.json({
        success: true,
        sales: [],
        stats: {
          totalRaffles: 0,
          totalTicketsSold: 0,
          totalRevenue: 0,
          activeRaffles: 0,
          completedRaffles: 0
        },
        count: 0,
        code: 'NO_RAFFLES_MODEL_OR_DATA',
        message: 'El modelo Raffle no está disponible o no hay datos'
      });
    }

    console.log('💰 [MY-SALES] Raffles encontrados:', userRaffles.length);

    // Calcular estadísticas de ventas
    console.log('💰 [MY-SALES] Calculando estadísticas...');
    const salesStats = userRaffles.reduce((stats, raffle) => {
      const ticketsSold = raffle._count?.tickets || 0;
      const revenue = ticketsSold * (raffle.ticketPrice || 0);
      
      stats.totalRaffles += 1;
      stats.totalTicketsSold += ticketsSold;
      stats.totalRevenue += revenue;
      
      if (raffle.status === 'ACTIVE') {
        stats.activeRaffles += 1;
      } else if (raffle.status === 'FINISHED' || raffle.status === 'DRAWN') {
        stats.completedRaffles += 1;
      }
      
      return stats;
    }, {
      totalRaffles: 0,
      totalTicketsSold: 0,
      totalRevenue: 0,
      activeRaffles: 0,
      completedRaffles: 0
    });

    console.log('💰 [MY-SALES] Estadísticas calculadas:', salesStats);

    // Preparar datos de ventas con información adicional
    console.log('💰 [MY-SALES] Preparando datos de respuesta...');
    const salesData = userRaffles.map(raffle => ({
      id: raffle.id,
      title: raffle.title,
      description: raffle.description,
      ticketPrice: raffle.ticketPrice,
      maxTickets: raffle.maxTickets,
      status: raffle.status,
      createdAt: raffle.createdAt,
      endsAt: raffle.endsAt,
      drawnAt: raffle.drawnAt,
      winnerId: raffle.winnerId,
      
      // Estadísticas de la rifa
      stats: {
        ticketsSold: raffle._count?.tickets || 0,
        participationsCount: raffle._count?.participations || 0,
        revenue: (raffle._count?.tickets || 0) * (raffle.ticketPrice || 0),
        selloutPercentage: raffle.maxTickets ? 
          Math.round(((raffle._count?.tickets || 0) / raffle.maxTickets) * 100) : 0
      },
      
      // Estado calculado
      isActive: raffle.status === 'ACTIVE',
      isCompleted: raffle.status === 'FINISHED' || raffle.status === 'DRAWN',
      hasWinner: !!raffle.winnerId,
      isExpired: raffle.endsAt ? new Date() > new Date(raffle.endsAt) : false
    }));

    console.log('💰 [MY-SALES] Datos preparados, enviando respuesta...');

    const response = {
      success: true,
      sales: salesData,
      stats: salesStats,
      count: userRaffles.length,
      code: 'SALES_FETCHED'
    };

    console.log('💰 [MY-SALES] ===== RESPUESTA EXITOSA =====');
    return NextResponse.json(response);

  } catch (error) {
    console.error('💰 [MY-SALES] ===== ERROR CAPTURADO =====');
    console.error('💰 [MY-SALES] Error tipo:', error.constructor.name);
    console.error('💰 [MY-SALES] Error mensaje:', error.message);
    console.error('💰 [MY-SALES] Error código:', error.code);
    console.error('💰 [MY-SALES] Error stack completo:');
    console.error(error.stack);
    
    // Verificar si es un error específico de Prisma
    if (error.code && (error.code.startsWith('P') || error.code.includes('PRISMA'))) {
      console.error('💰 [MY-SALES] Error de Prisma detectado:', error.code);
    }
    
    return NextResponse.json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
      errorType: error.constructor.name,
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        stack: error.stack
      } : undefined
    }, { status: 500 });
  } finally {
    console.log('💰 [MY-SALES] Ejecutando cleanup...');
    try {
      await prisma.$disconnect();
      console.log('💰 [MY-SALES] Prisma desconectado');
    } catch (disconnectError) {
      console.error('💰 [MY-SALES] Error desconectando Prisma:', disconnectError);
    }
    console.log('💰 [MY-SALES] ===== FIN DE SOLICITUD =====');
  }
}