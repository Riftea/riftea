// src/app/api/admin/raffles/[id]/route.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request, { params }) {
  try {
    const { id } = await params; // ✅ Usar await params
    console.log('GET admin raffle with ID:', id);

    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que sea admin o superadmin
    const userRole = session.user.role?.toLowerCase();
    if (userRole !== "admin" && userRole !== "superadmin") {
      return Response.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tickets: true,
            participations: true
          }
        },
        owner: {
          select: {
            name: true,
            email: true
          }
        },
        winner: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!raffle) {
      return Response.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    // Si es admin (no superadmin), solo puede ver sus propios sorteos
    if (userRole === "admin" && raffle.ownerId !== session.user.id) {
      return Response.json({ error: "No autorizado para ver este sorteo" }, { status: 403 });
    }

    console.log('Raffle found:', raffle.id);
    return Response.json(raffle);
  } catch (error) {
    console.error('Error in GET /api/admin/raffles/[id]:', error);
    return Response.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params; // ✅ Usar await params
    console.log('PUT admin raffle with ID:', id);

    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que sea admin o superadmin
    const userRole = session.user.role?.toLowerCase();
    if (userRole !== "admin" && userRole !== "superadmin") {
      return Response.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    // Buscar el sorteo actual
    const currentRaffle = await prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tickets: true,
            participations: true
          }
        }
      }
    });

    if (!currentRaffle) {
      return Response.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    // Si es admin (no superadmin), solo puede editar sus propios sorteos
    if (userRole === "admin" && currentRaffle.ownerId !== session.user.id) {
      return Response.json({ error: "No autorizado para editar este sorteo" }, { status: 403 });
    }

    // Parsear el body de la request
    let body;
    try {
      body = await request.json();
      console.log('Request body received:', body);
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return Response.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
    }

    // Validaciones
    if (body.ticketPrice !== undefined && body.ticketPrice <= 0) {
      return Response.json({ error: "El precio del ticket debe ser mayor a 0" }, { status: 400 });
    }

    if (body.endsAt && new Date(body.endsAt) <= new Date()) {
      return Response.json({ error: "La fecha de finalización debe ser futura" }, { status: 400 });
    }

    // Preparar datos para actualizar, mapeando campos del frontend al schema
    const updateData = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.ticketPrice !== undefined) updateData.ticketPrice = parseFloat(body.ticketPrice);
    if (body.endsAt !== undefined) updateData.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    
    // Mapear participantLimit a maxParticipants (schema)
    if (body.participantLimit !== undefined) {
      updateData.maxParticipants = body.participantLimit ? parseInt(body.participantLimit) : null;
    }

    // Manejar published -> status y publishedAt
    if (body.published !== undefined) {
      if (body.published) {
        updateData.status = 'PUBLISHED';
        updateData.publishedAt = new Date();
      } else {
        updateData.status = 'DRAFT';
        updateData.publishedAt = null;
      }
    }

    console.log('Data to update:', updateData);

    // Actualizar el sorteo
    const updatedRaffle = await prisma.raffle.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            tickets: true,
            participations: true
          }
        },
        owner: {
          select: {
            name: true,
            email: true
          }
        },
        winner: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    console.log('Raffle updated successfully:', id);
    return Response.json(updatedRaffle);

  } catch (error) {
    console.error('Error in PUT /api/admin/raffles/[id]:', error);
    return Response.json(
      { error: "Error al actualizar sorteo", details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params; // ✅ Usar await params
    console.log('DELETE admin raffle with ID:', id);

    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que sea admin o superadmin
    const userRole = session.user.role?.toLowerCase();
    if (userRole !== "admin" && userRole !== "superadmin") {
      return Response.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    // Buscar el sorteo con conteos
    const raffle = await prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tickets: true,
            participations: true
          }
        }
      }
    });

    if (!raffle) {
      return Response.json({ error: "Sorteo no encontrado" }, { status: 404 });
    }

    // Si es admin (no superadmin), solo puede eliminar sus propios sorteos
    if (userRole === "admin" && raffle.ownerId !== session.user.id) {
      return Response.json({ error: "No autorizado para eliminar este sorteo" }, { status: 403 });
    }

    // Solo SUPERADMIN puede eliminar sorteos con participantes
    const hasParticipants = raffle._count.tickets > 0 || raffle._count.participations > 0;
    if (hasParticipants && userRole !== "superadmin") {
      return Response.json({
        error: `No se puede eliminar: hay ${raffle._count.tickets} tickets y ${raffle._count.participations} participaciones. Solo SUPERADMIN puede forzar eliminación.`
      }, { status: 400 });
    }

    // Eliminar el sorteo (Prisma maneja las relaciones con onDelete: Cascade)
    await prisma.raffle.delete({
      where: { id }
    });

    console.log('Raffle deleted successfully:', id);
    return Response.json({
      success: true,
      message: "Sorteo eliminado exitosamente"
    });

  } catch (error) {
    console.error('Error in DELETE /api/admin/raffles/[id]:', error);
    return Response.json(
      { error: "Error al eliminar sorteo", details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}