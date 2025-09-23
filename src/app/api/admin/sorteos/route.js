// src/app/api/admin/sorteos/route.js

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Evita cache en esta ruta y fuerza ejecución en servidor Node
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role ? String(session.user.role).toUpperCase() : "";

    // Autorización básica: requiere sesión y ser ADMIN o SUPERADMIN
    if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const baseSelect = {
      id: true,
      title: true,
      description: true,
      status: true,
      endsAt: true,
      createdAt: true,
      ownerId: true,
      _count: {
        select: {
          tickets: true,
        },
      },
    };

    let raffles;

    if (role === "SUPERADMIN") {
      // SUPERADMIN ve todos los sorteos
      raffles = await prisma.raffle.findMany({
        select: {
          ...baseSelect,
          owner: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      // ADMIN ve solo sus propios sorteos
      raffles = await prisma.raffle.findMany({
        where: {
          ownerId: session.user.id,
        },
        select: baseSelect,
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({ success: true, raffles });
  } catch (error) {
    console.error("Error obteniendo sorteos:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
