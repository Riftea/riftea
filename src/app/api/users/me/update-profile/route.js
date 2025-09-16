// app/api/users/update-profile/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { displayName, whatsapp } = body;

    const updateData = {};

    // Si se está actualizando el nombre para mostrar
    if (displayName !== undefined) {
      // Verificar si puede cambiar el nombre (una vez por mes)
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { lastNameChange: true }
      });

      if (user?.lastNameChange) {
        const lastChange = new Date(user.lastNameChange);
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        
        if (lastChange > monthAgo) {
          return Response.json(
            { error: "Solo puedes cambiar tu nombre una vez por mes" }, 
            { status: 400 }
          );
        }
      }

      if (displayName.trim().length < 2 || displayName.trim().length > 30) {
        return Response.json(
          { error: "El nombre debe tener entre 2 y 30 caracteres" }, 
          { status: 400 }
        );
      }

      updateData.displayName = displayName.trim();
      updateData.lastNameChange = new Date();
    }

    // Si se está actualizando WhatsApp
    if (whatsapp !== undefined) {
      const cleanPhone = whatsapp.replace(/\D/g, '');
      
      if (whatsapp && (cleanPhone.length < 10 || cleanPhone.length > 15)) {
        return Response.json(
          { error: "El número de WhatsApp debe tener entre 10 y 15 dígitos" }, 
          { status: 400 }
        );
      }

      updateData.whatsapp = whatsapp || null;
    }

    // Actualizar usuario en la base de datos
    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        image: true,
        whatsapp: true,
        role: true,
        lastNameChange: true
      }
    });

    return Response.json({ 
      success: true, 
      user: updatedUser 
    });

  } catch (error) {
    console.error("Error updating profile:", error);
    return Response.json(
      { error: "Error interno del servidor" }, 
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}