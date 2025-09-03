// src/app/api/admin/sorteos/route.js - CORREGIDO
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import prisma from "@/lib/prisma";
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    // Verificar que el usuario esté autenticado y sea ADMIN o SUPERADMIN
    if (!session || !['ADMIN', 'SUPERADMIN'].includes(session.user.role?.toUpperCase())) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 403 }
      );
    }

    let raffles;
    
    if (session.user.role?.toUpperCase() === "SUPERADMIN") {
      // SUPERADMIN ve todos los sorteos
      raffles = await prisma.raffle.findMany({
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          endsAt: true,
          createdAt: true,
          ownerId: true,
          owner: {
            select: {
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              tickets: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // ADMIN solo ve sus propios sorteos
      raffles = await prisma.raffle.findMany({
        where: {
          ownerId: session.user.id
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          endsAt: true,
          createdAt: true,
          ownerId: true,
          _count: {
            select: {
              tickets: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    return NextResponse.json({
      success: true,
      raffles
    });
    
  } catch (error) {
    console.error("Error obteniendo sorteos:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}