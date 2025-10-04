export const runtime = 'nodejs';
// app/api/users/me/update-profile/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * PATCH /api/users/me/update-profile
 * Body: { name?: string, whatsapp?: string, bypassLimit?: boolean }
 *
 * Cambios clave:
 * - Si session.user.role === "SUPERADMIN" y viene { bypassLimit: true }, NO se aplica cooldown.
 * - Unicidad del nombre (case-insensitive) para todos (incluye SUPERADMIN).
 * - WhatsApp validado (10–15 dígitos).
 * - Devuelve "sessionPatch" para usar con session.update(sessionPatch).
 */
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);

    const userId = session?.user?.id || null;
    const userEmail = session?.user?.email || null;
    const sessionRole = session?.user?.role || null;

    if (!userId && !userEmail) {
      return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { name, whatsapp, bypassLimit } = body || {};

    // Traemos datos actuales (y rol como fallback por si no viene en JWT)
    const currentUser = await prisma.user.findFirst({
      where: userId ? { id: userId } : { email: userEmail },
      select: {
        id: true,
        name: true,
        lastNameChange: true,
        whatsapp: true,
        role: true,
      },
    });

    if (!currentUser) {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const effectiveRole = sessionRole || currentUser.role || "USER";
    const canBypassLimit = effectiveRole === "SUPERADMIN" && bypassLimit === true;

    const updates = {};
    const sessionPatch = {};

    // === Nombre con UNICIDAD (case-insensitive) y cooldown (salteable por SUPERADMIN con bypass) ===
    if (name !== undefined) {
      const trimmed = String(name).normalize("NFKC").trim().replace(/\s+/g, " ");
      if (trimmed.length < 2 || trimmed.length > 30) {
        return Response.json(
          { error: "El nombre debe tener entre 2 y 30 caracteres" },
          { status: 400 }
        );
      }

      const isSameName =
        (currentUser?.name || "").trim().toLowerCase() === trimmed.toLowerCase();

      if (!isSameName) {
        // 1) Chequear duplicado (case-insensitive), excluyéndome a mí
        const notMe = { id: { not: currentUser.id } };
        const duplicate = await prisma.user.findFirst({
          where: {
            AND: [
              notMe,
              { name: { equals: trimmed, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });

        if (duplicate) {
          return Response.json(
            { error: "Ese nombre ya está en uso. Elegí otro." },
            { status: 409 }
          );
        }

        // 2) Cooldown ~30 días (solo si NO bypass)
        if (!canBypassLimit && currentUser?.lastNameChange) {
          const last = new Date(currentUser.lastNameChange);
          const next = new Date(last);
          next.setMonth(next.getMonth() + 1);
          const now = new Date();
          if (now < next) {
            return Response.json(
              {
                error: "Sólo puedes cambiar el nombre cada 30 días",
                nextChange: next.toISOString(),
                nextChangeHuman: next.toLocaleDateString(),
              },
              { status: 400 }
            );
          }
        }

        // Guardamos cambio (igual registramos lastNameChange para trazabilidad)
        const now = new Date();
        updates.name = trimmed;
        updates.lastNameChange = now;
        sessionPatch.name = trimmed; // para session.update()
      }
    }

    // === WhatsApp (10–15 dígitos) ===
    if (whatsapp !== undefined) {
      const clean = String(whatsapp || "").replace(/\D/g, "");
      if (whatsapp && (clean.length < 10 || clean.length > 15)) {
        return Response.json(
          { error: "El número de WhatsApp debe tener entre 10 y 15 dígitos" },
          { status: 400 }
        );
      }

      const isSameWA = String(currentUser?.whatsapp || "") === String(whatsapp || "");
      if (!isSameWA) {
        updates.whatsapp = whatsapp || null; // se guarda como lo envías (validado)
        sessionPatch.whatsapp = updates.whatsapp; // para session.update()
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: "No se enviaron cambios válidos (o no hay diferencias)" },
        { status: 400 }
      );
    }

    // Guardar en DB
    let updatedUser;
    try {
      updatedUser = await prisma.user.update({
        where: { id: currentUser.id },
        data: updates,
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          whatsapp: true,
          role: true,
          lastNameChange: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e) {
      // Si existe índice único en DB, mapeamos a 409
      const msg = String(e?.message || "");
      if (e?.code === "P2002" || msg.includes("duplicate key") || msg.includes("unique")) {
        return Response.json(
          { error: "Ese nombre ya está en uso. Elegí otro." },
          { status: 409 }
        );
      }
      throw e;
    }

    // Asegurar sessionPatch con lo último de DB
    if (updates.name !== undefined) sessionPatch.name = updatedUser.name ?? null;
    if (updates.whatsapp !== undefined) sessionPatch.whatsapp = updatedUser.whatsapp ?? null;

    return Response.json(
      {
        success: true,
        message: "Perfil actualizado correctamente",
        user: updatedUser,
        shouldSessionUpdate: true,
        sessionPatch,
        bypassApplied: canBypassLimit === true, // útil para debug en el front
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("update-profile error", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
