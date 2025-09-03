// app/api/raffles/[id]/route.js
import { getServerSession } from "next-auth/next";
// Desde src/app/api/raffles/[id]/ hacia src/lib/
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function GET(req, { params }) {
  try {
    // Awaiting params si es una Promise
    const resolvedParams = await params;
    const { id } = resolvedParams;
    
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
        }
      },
    });
    
    if (!raffle) {
      return new Response(JSON.stringify({ error: "Sorteo no encontrado" }), { status: 404 });
    }
    
    return new Response(JSON.stringify(raffle), { status: 200 });
  } catch (err) {
    console.error("GET /api/raffles/[id] error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }

    // Awaiting params si es una Promise
    const resolvedParams = await params;
    const { id } = resolvedParams;
    
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
      return new Response(JSON.stringify({ error: "Sorteo no encontrado" }), { status: 404 });
    }

    // Normalizar role para comparación case-insensitive
    const role = (session.user.role || "").toString().toLowerCase();
    const isAdmin = role === "admin";
    const isSuper = role === "superadmin";
    const isOwner = session.user.id && raffle.ownerId === session.user.id;
    
    console.log("[PUT /api/raffles/[id]] Authorization check:", {
      userId: session.user.id,
      userRole: session.user.role,
      normalizedRole: role,
      raffleOwnerId: raffle.ownerId,
      isAdmin,
      isSuper,
      isOwner
    });
    
    if (!isOwner && !isAdmin && !isSuper) {
      return new Response(JSON.stringify({ error: "No autorizado para modificar este sorteo" }), { status: 403 });
    }

    const body = await req.json();
    console.log("[PUT DEBUG] Body received:", body);
    
    // Validaciones si se están actualizando ciertos campos
    if (body.ticketPrice !== undefined && body.ticketPrice <= 0) {
      return new Response(JSON.stringify({ error: "El precio del ticket debe ser mayor a 0" }), { status: 400 });
    }

    if (body.endsAt && new Date(body.endsAt) <= new Date()) {
      return new Response(JSON.stringify({ error: "La fecha de finalización debe ser futura" }), { status: 400 });
    }

    // Preparar datos para actualizar
    const data = {};
    
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.ticketPrice !== undefined) data.ticketPrice = parseFloat(body.ticketPrice);
    if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    
    // Mapear 'published' a 'publishedAt' según el schema de Prisma
    if (body.published !== undefined) {
      if (body.published) {
        data.publishedAt = new Date(); // Establecer fecha de publicación actual
        data.status = "PUBLISHED"; // Cambiar estado a publicado
      } else {
        data.publishedAt = null; // Quitar fecha de publicación
        data.status = "DRAFT"; // Cambiar estado a borrador
      }
    }
    
    // Manejar participantLimit - mapear al campo correcto del schema
    if (body.participantLimit !== undefined) {
      data.maxParticipants = body.participantLimit === null ? null : parseInt(body.participantLimit, 10);
    }

    console.log("[PUT DEBUG] Data to update:", data);

    const updated = await prisma.raffle.update({ 
      where: { id }, 
      data,
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
        }
      }
    });
    
    console.log("[PUT /api/raffles/[id]] Sorteo actualizado:", id, "por:", session.user.email);
    return new Response(JSON.stringify(updated), { status: 200 });
  } catch (err) {
    console.error("PUT /api/raffles/[id] error:", err);
    console.error("Error stack:", err.stack);
    return new Response(JSON.stringify({ 
      error: "Error al actualizar sorteo",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }), { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }

    // Awaiting params si es una Promise
    const resolvedParams = await params;
    const { id } = resolvedParams;
    
    const raffle = await prisma.raffle.findUnique({
      where: { id },
      include: { 
        _count: { 
          select: { 
            tickets: true, 
            participations: true 
          } 
        } 
      },
    });

    if (!raffle) {
      return new Response(JSON.stringify({ error: "Sorteo no encontrado" }), { status: 404 });
    }

    // Normalizar role para comparación case-insensitive
    const role = (session.user.role || "").toString().toLowerCase();
    const isSuper = role === "superadmin";
    const isAdmin = role === "admin";
    const isOwner = session.user.id && raffle.ownerId === session.user.id;
    
    // Debug detallado para troubleshooting
    console.log("[DELETE /api/raffles/[id]] Authorization check:", {
      raffleId: id,
      sessionUserId: session.user.id,
      sessionUserEmail: session.user.email,
      sessionUserRole: session.user.role,
      normalizedRole: role,
      raffleOwnerId: raffle.ownerId,
      isAdmin,
      isSuper,
      isOwner,
      ticketsCount: raffle._count?.tickets ?? 0,
      participationsCount: raffle._count?.participations ?? 0
    });

    if (!isSuper && !isAdmin && !isOwner) {
      console.log("[DELETE] Access denied - insufficient permissions");
      return new Response(JSON.stringify({ error: "No autorizado para eliminar este sorteo" }), { status: 403 });
    }

    // Solo SUPERADMIN puede forzar borrado si hay tickets/participaciones
    const ticketsCount = raffle._count?.tickets ?? 0;
    const partsCount = raffle._count?.participations ?? 0;
    
    if (!isSuper && (ticketsCount > 0 || partsCount > 0)) {
      console.log("[DELETE] Blocked - raffle has participants:", { ticketsCount, partsCount });
      return new Response(JSON.stringify({ 
        error: `No se puede eliminar: hay ${ticketsCount} tickets y ${partsCount} participaciones. Solo SUPERADMIN puede forzar eliminación.` 
      }), { status: 400 });
    }

    // Log de auditoría opcional (si tienes modelo AuditLog)
    try {
      if (prisma.auditLog) {
        await prisma.auditLog.create({
          data: {
            action: "delete_raffle",
            userId: session.user.id,
            targetId: raffle.id,
            newValues: JSON.stringify({ 
              raffleTitle: raffle.title,
              ticketsCount,
              participationsCount: partsCount,
              deletedBy: role,
              forced: isSuper && (ticketsCount > 0 || partsCount > 0)
            }),
          },
        });
      }
    } catch (auditError) {
      console.warn("Audit log failed (non-critical):", auditError);
    }

    // Proceder con eliminación
    await prisma.raffle.delete({ where: { id } });
    
    console.log(`[DELETE] Sorteo eliminado exitosamente: ${id} por ${session.user.email} (${role})`);
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Sorteo eliminado exitosamente" 
    }), { status: 200 });
  } catch (err) {
    console.error("DELETE /api/raffles/[id] error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 });
  }
}