// src/app/api/admin/usuarios/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { authorize, isSuperAdmin, ROLES, normalizeRole } from "@/lib/authz";

// Utils
const intOr = (v, fallback) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const parseSortBy = (v) => (["name", "email", "role", "isActive"].includes(v) ? v : "name");
const parseSortDir = (v) => (v === "desc" ? "desc" : "asc");

/**
 * GET /api/admin/usuarios
 * Query:
 *  - search: string
 *  - sortBy: "name" | "email" | "role" | "isActive"
 *  - sortDir: "asc" | "desc"
 *  - page: 1-based
 *  - pageSize: 10 | 25 | 50
 *
 * Respuesta: { success: true, users: [...], total: number }
 */
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    // Si querés que ADMIN también pueda ver la lista, cambiá a [ROLES.SUPERADMIN, ROLES.ADMIN]
    const auth = authorize(session, [ROLES.SUPERADMIN]);
    if (!auth.ok) {
      const status = auth.reason === "NO_SESSION" ? 401 : 403;
      return NextResponse.json(
        {
          success: false,
          error:
            auth.reason === "NO_SESSION"
              ? "No has iniciado sesión"
              : "No tienes permisos para acceder a esta función",
        },
        { status }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const sortBy = parseSortBy(searchParams.get("sortBy") || "name");
    const sortDir = parseSortDir(searchParams.get("sortDir") || "asc");
    const page = intOr(searchParams.get("page"), 1);
    const rawPageSize = intOr(searchParams.get("pageSize"), 10);
    const pageSize = clamp(rawPageSize, 1, 100);

    // Filtro
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { role: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    // Orden
    // Nota: si querés ranking custom por rol (SUPERADMIN > ADMIN > USER) habría que usar queryRaw o ordenar luego,
    // acá usamos orden directo por el campo.
    const orderBy =
      sortBy === "isActive"
        ? { isActive: sortDir }
        : sortBy === "email"
        ? { email: sortDir }
        : sortBy === "role"
        ? { role: sortDir }
        : { name: sortDir };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({ success: true, users, total });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/usuarios
 * Body: { userId: string, role: "USER" | "ADMIN" }
 * - Solo SUPERADMIN
 * - No puede cambiarse a sí mismo
 * - No tocar a otro SUPERADMIN
 * - No degradar al último SUPERADMIN
 */
export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!isSuperAdmin(session)) {
      const status = !session?.user ? 401 : 403;
      return NextResponse.json(
        {
          success: false,
          error: !session?.user
            ? "No has iniciado sesión"
            : "Solo el SUPERADMIN puede cambiar roles de usuario",
        },
        { status }
      );
    }

    const body = await req.json();
    const { userId } = body || {};
    const role = normalizeRole(body?.role);

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, error: "ID de usuario inválido" },
        { status: 400 }
      );
    }

    if (![ROLES.USER, ROLES.ADMIN].includes(role)) {
      return NextResponse.json(
        { success: false, error: `Rol inválido. Solo se permite: ${ROLES.USER}, ${ROLES.ADMIN}` },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Evitar auto-degradación de SUPERADMIN
    if (targetUser.id === session.user.id && role !== ROLES.SUPERADMIN) {
      return NextResponse.json(
        { success: false, error: "No puedes cambiar tu propio rol de SUPERADMIN" },
        { status: 400 }
      );
    }

    // No modificar a otro SUPERADMIN
    if (normalizeRole(targetUser.role) === ROLES.SUPERADMIN && targetUser.id !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "No puedes cambiar el rol de otro SUPERADMIN" },
        { status: 403 }
      );
    }

    // No dejar al sistema sin SUPERADMIN
    if (normalizeRole(targetUser.role) === ROLES.SUPERADMIN && role !== ROLES.SUPERADMIN) {
      const superadmins = await prisma.user.count({ where: { role: ROLES.SUPERADMIN } });
      if (superadmins <= 1) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No puedes degradar al último SUPERADMIN. Crea otro SUPERADMIN (semilla/manual) y luego intenta de nuevo.",
          },
          { status: 400 }
        );
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return NextResponse.json({
      success: true,
      message: `Rol de usuario actualizado a ${role}`,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    if (error?.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
