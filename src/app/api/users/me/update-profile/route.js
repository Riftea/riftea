// app/api/users/me/update-profile/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * PATCH /api/users/me/update-profile
 * Body: { name?: string, whatsapp?: string }
 * - Actualiza "name" con cooldown de 30 días (usa lastNameChange)
 * - Valida WhatsApp (10–15 dígitos) y guarda el valor que envíes (con o sin formato)
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

    const updates = {};

    // === Nombre con cooldown de 30 días ===
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (trimmed.length < 2 || trimmed.length > 30) {
        return Response.json(
          { error: "El nombre debe tener entre 2 y 30 caracteres" },
          { status: 400 }
        );
      }

      // Traemos la fecha del último cambio
      const currentUser = await prisma.user.findFirst({
        where: userId ? { id: userId } : { email: userEmail },
        select: { lastNameChange: true },
      });

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
      // Guardamos el valor tal cual lo mandás (validado)
      updates.whatsapp = whatsapp || null;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: "No se enviaron cambios válidos" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
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

    return Response.json(
      {
        success: true,
        message: "Perfil actualizado correctamente",
        user: updatedUser,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("update-profile error", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
