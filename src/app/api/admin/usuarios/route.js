// src/app/api/admin/usuarios/route.js
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { authorize, isSuperAdmin, ROLES, normalizeRole } from '@/lib/authz';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // Si querés que ADMIN también pueda ver la lista, usa [ROLES.SUPERADMIN, ROLES.ADMIN]
    const auth = authorize(session, [ROLES.SUPERADMIN]);
    if (!auth.ok) {
      const status = auth.reason === 'NO_SESSION' ? 401 : 403;
      return NextResponse.json(
        {
          success: false,
          error:
            auth.reason === 'NO_SESSION'
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

export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);

    // Solo SUPERADMIN puede cambiar roles
    if (!isSuperAdmin(session)) {
      const status = !session?.user ? 401 : 403;
      return NextResponse.json(
        {
          success: false,
          error: !session?.user
            ? 'No has iniciado sesión'
            : 'Solo el SUPERADMIN puede cambiar roles de usuario',
        },
        { status }
      );
    }

    const body = await req.json();
    const { userId } = body || {};
    const role = normalizeRole(body?.role);

    // Validar parámetros
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'ID de usuario inválido' },
        { status: 400 }
      );
    }

    // Solo se puede asignar USER o ADMIN (no SUPERADMIN desde esta API)
    if (![ROLES.USER, ROLES.ADMIN].includes(role)) {
      return NextResponse.json(
        {
          success: false,
          error: `Rol inválido. Solo se permite: ${ROLES.USER}, ${ROLES.ADMIN}`,
        },
        { status: 400 }
      );
    }

    // Verificar que el usuario a modificar existe
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Evitar que el SUPERADMIN se auto-degrade
    if (targetUser.id === session.user.id && role !== ROLES.SUPERADMIN) {
      return NextResponse.json(
        { success: false, error: 'No puedes cambiar tu propio rol de SUPERADMIN' },
        { status: 400 }
      );
    }

    // Evitar que un SUPERADMIN cambie el rol de otro SUPERADMIN
    if (normalizeRole(targetUser.role) === ROLES.SUPERADMIN && targetUser.id !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'No puedes cambiar el rol de otro SUPERADMIN' },
        { status: 403 }
      );
    }

    // Evitar dejar al sistema sin SUPERADMIN (no degradar al último)
    if (normalizeRole(targetUser.role) === ROLES.SUPERADMIN && role !== ROLES.SUPERADMIN) {
      const superadmins = await prisma.user.count({ where: { role: ROLES.SUPERADMIN } });
      if (superadmins <= 1) {
        return NextResponse.json(
          {
            success: false,
            error:
              'No puedes degradar al último SUPERADMIN. Crea otro SUPERADMIN (semilla/manual) y luego intenta de nuevo.',
          },
          { status: 400 }
        );
      }
    }

    // Actualizar el rol del usuario
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Rol de usuario actualizado a ${role}`,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error updating user role:', error);

    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}