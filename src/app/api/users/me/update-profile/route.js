// app/api/users/me/update-profile/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * PATCH /api/users/me/update-profile
 * Body: { name?: string, whatsapp?: string }
 * - Nombre único (case-insensitive) + cooldown de 30 días (lastNameChange)
 * - WhatsApp 10–15 dígitos (se guarda tal cual lo envíes, validado)
 * - Devuelve "sessionPatch" para usar con session.update(sessionPatch)
 */
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);

    const userId = session?.user?.id || null;
    const userEmail = session?.user?.email || null;
    if (!userId && !userEmail) {
      return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { name, whatsapp } = body || {};

    // Traemos datos actuales para comparar/validar
    const currentUser = await prisma.user.findFirst({
      where: userId ? { id: userId } : { email: userEmail },
      select: { id: true, name: true, lastNameChange: true, whatsapp: true },
    });

    const updates = {};
    const sessionPatch = {};

    // === Nombre con UNICIDAD (case-insensitive) y cooldown ===
    if (name !== undefined) {
      const trimmed = String(name).trim();

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
        const notMe = userId
          ? { id: { not: userId } }
          : { email: { not: userEmail } };

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

        // 2) Cooldown 30 días
        const now = new Date();
        if (currentUser?.lastNameChange) {
          const last = new Date(currentUser.lastNameChange);
          const next = new Date(last);
          next.setMonth(next.getMonth() + 1);
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
        where: userId ? { id: userId } : { email: userEmail },
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
      // Si existe índice único a nivel DB (recomendado), mapeamos el error a 409
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
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("update-profile error", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
