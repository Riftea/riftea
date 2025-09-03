// src/app/api/admin/sorteos/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    // Verificar que el usuario esté autenticado y sea ADMIN o SUPERADMIN
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
      return Response.json(
        { error: "No autorizado" },
        { status: 403 }
      );
    }

    let sorteos;
    
    if (session.user.role === "SUPERADMIN") {
      // SUPERADMIN ve todos los sorteos
      sorteos = await prisma.sorteo.findMany({
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          categoria: true,
          estado: true,
          fechaFinalizacion: true,
          createdAt: true,
          creadorId: true,
          creador: {
            select: {
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              Ticket: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // ADMIN solo ve sus propios sorteos
      sorteos = await prisma.sorteo.findMany({
        where: {
          creadorId: session.user.id
        },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          categoria: true,
          estado: true,
          fechaFinalizacion: true,
          createdAt: true,
          creadorId: true,
          _count: {
            select: {
              Ticket: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    return Response.json(sorteos);
    
  } catch (error) {
    console.error("Error obteniendo sorteos:", error);
    return Response.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}