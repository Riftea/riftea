// src/app/api/admin/usuarios/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { authorize } from '@/lib/authz';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // Permitir múltiples roles si lo necesitás (p.ej. SUPERADMIN y ADMIN)
    const auth = authorize(session, ['SUPERADMIN']); // agrega 'ADMIN' si corresponde

    if (!auth.ok) {
      const status = auth.reason === 'NO_SESSION' ? 401 : 403;
      return NextResponse.json(
        {
          success: false,
          error: auth.reason === 'NO_SESSION'
            ? 'No has iniciado sesión'
            : 'No tienes permisos para acceder a esta función',
        },
        { status }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
