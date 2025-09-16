// app/api/users/update-photo/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const photo = formData.get('photo');

    if (!photo || !photo.size) {
      return Response.json({ error: "No se proporcionó imagen" }, { status: 400 });
    }

    // Verificar tipo de archivo
    if (!photo.type.startsWith('image/')) {
      return Response.json({ error: "Solo se permiten archivos de imagen" }, { status: 400 });
    }

    // Verificar tamaño (5MB máximo)
    if (photo.size > 5 * 1024 * 1024) {
      return Response.json({ error: "La imagen debe ser menor a 5MB" }, { status: 400 });
    }

    // Generar nombre único para el archivo
    const fileExtension = photo.type.split('/')[1];
    const fileName = `${uuidv4()}.${fileExtension}`;
    
    // Crear directorio si no existe
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'avatars');
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (error) {
      // El directorio ya existe
    }

    // Guardar archivo
    const filePath = join(uploadDir, fileName);
    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // URL pública del archivo
    const imageUrl = `/uploads/avatars/${fileName}`;

    // Actualizar usuario en la base de datos
    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: { image: imageUrl },
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        image: true,
        whatsapp: true,
        role: true
      }
    });

    return Response.json({ 
      success: true, 
      imageUrl,
      user: updatedUser 
    });

  } catch (error) {
    console.error("Error uploading photo:", error);
    return Response.json(
      { error: "Error interno del servidor" }, 
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}