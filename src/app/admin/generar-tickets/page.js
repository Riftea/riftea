// src/app/api/admin/generar-tickets/route.js - CORREGIDO
import { getServerSession } from "next-auth/next";
// ✅ CORRECCIÓN: Importar desde lib/auth.js en lugar de route.js
import { authOptions } from "../../../../lib/auth.js";
import { generateTicketUUID, generateTicketCode } from "@/src/lib/crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    
    // ✅ CORRECCIÓN: Cambiar "SUPERADMIN" por "superadmin" (línea 15)
    if (!session || session.user.role !== "superadmin") {
      return Response.json(
        { error: "No autorizado. Solo SUPERADMIN puede generar tickets." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      userId, 
      sorteoId, // ✅ Cambié raffleId por sorteoId para que coincida con el frontend
      cantidad = 1, 
      crearPurchase = true,
      ticketPrice = 0
    } = body;

    // Validaciones básicas
    if (!userId) {
      return Response.json(
        { error: "userId es requerido" },
        { status: 400 }
      );
    }

    if (cantidad < 1 || cantidad > 100) {
      return Response.json(
        { error: "La cantidad debe ser entre 1 y 100" },
        { status: 400 }
      );
    }

    // Verificar que el usuario existe
    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    });

    if (!usuario) {
      return Response.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    let raffle = null;

    // Si se especifica sorteoId, validar la raffle
    if (sorteoId) {
      raffle = await prisma.raffle.findUnique({
        where: { id: sorteoId },
        select: { 
          id: true, 
          title: true, 
          status: true, 
          endsAt: true,
          maxTickets: true,
          ticketPrice: true,
          _count: {
            select: { tickets: true }
          }
        }
      });

      if (!raffle) {
        return Response.json(
          { error: "Sorteo no encontrado" },
          { status: 404 }
        );
      }

      if (!['PUBLISHED', 'ACTIVE'].includes(raffle.status)) {
        return Response.json(
          { error: "Solo se pueden generar tickets para sorteos publicados o activos" },
          { status: 400 }
        );
      }

      // Verificar límite de tickets si existe
      if (raffle.maxTickets) {
        const ticketsActuales = raffle._count.tickets;
        if (ticketsActuales + cantidad > raffle.maxTickets) {
          return Response.json(
            { error: `Excede el límite máximo de tickets. Disponibles: ${raffle.maxTickets - ticketsActuales}` },
            { status: 400 }
          );
        }
      }

      // Verificar que la raffle no haya terminado
      if (raffle.endsAt && new Date() > new Date(raffle.endsAt)) {
        return Response.json(
          { error: "El sorteo ya ha terminado" },
          { status: 400 }
        );
      }
    }

    const ticketsGenerados = [];
    let purchaseCreada = null;
    
    const totalAmount = sorteoId ? 
      (raffle.ticketPrice * cantidad) : 
      (ticketPrice * cantidad);

    // Usar transacción para crear Purchase + Tickets de forma atómica
    await prisma.$transaction(async (tx) => {
      
      // Crear Purchase ficticia si se solicitó
      if (crearPurchase) {
        purchaseCreada = await tx.purchase.create({
          data: {
            userId,
            amount: totalAmount,
            currency: "ARS",
            paymentMethod: "ADMIN_GENERATED",
            paymentId: `ADMIN_${Date.now()}`,
            status: "completed"
          }
        });
      }

      // Crear tickets
      for (let i = 0; i < cantidad; i++) {
        let attempts = 0;
        let ticketCreated = false;

        while (!ticketCreated && attempts < 5) {
          try {
            const uuid = generateTicketUUID();
            const code = generateTicketCode();

            const ticketData = {
              uuid,
              code,
              userId,
              status: "ACTIVE",
              metodoPago: "ADMIN_GENERATED",
              generatedAt: new Date(),
              displayCode: code,
              isUsed: false,
              isWinner: false
            };

            if (purchaseCreada) {
              ticketData.purchaseId = purchaseCreada.id;
            }

            if (sorteoId) {
              ticketData.raffleId = sorteoId;
            }

            const ticket = await tx.ticket.create({
              data: ticketData,
              include: {
                purchase: true,
                raffle: {
                  select: { id: true, title: true }
                }
              }
            });

            // Si es para una raffle específica, crear participación automáticamente
            if (sorteoId) {
              await tx.participation.create({
                data: {
                  ticketId: ticket.id,
                  raffleId: sorteoId,
                  isActive: true
                }
              });
            }

            ticketsGenerados.push({
              id: ticket.id,
              uuid: ticket.uuid,
              code: ticket.code,
              displayCode: ticket.displayCode,
              status: ticket.status,
              createdAt: ticket.createdAt,
              raffleId: ticket.raffleId,
              purchaseId: ticket.purchaseId,
              purchase: ticket.purchase ? {
                id: ticket.purchase.id,
                amount: ticket.purchase.amount,
                status: ticket.purchase.status,
                paymentMethod: ticket.purchase.paymentMethod
              } : null,
              raffle: ticket.raffle
            });

            ticketCreated = true;

          } catch (error) {
            attempts++;
            
            if (error.code === 'P2002') {
              console.warn(`🔄 Colisión UUID intento ${attempts}/5`);
              if (attempts >= 5) {
                throw new Error("No fue posible generar ticket único tras 5 intentos");
              }
            } else {
              throw error;
            }
          }
        }
      }

      // Crear notificación
      const notificationTitle = sorteoId 
        ? `¡Tickets comprados para ${raffle.title}!`
        : `¡Has recibido ${cantidad} tickets!`;
        
      const notificationMessage = sorteoId 
        ? `Tus ${cantidad} tickets para "${raffle.title}" están listos. ¡Buena suerte!`
        : `Se han agregado ${cantidad} tickets a tu cuenta.`;

      await tx.notification.create({
        data: {
          userId,
          title: notificationTitle,
          message: notificationMessage,
          type: sorteoId ? 'PURCHASE_CONFIRMATION' : 'SYSTEM_ALERT',
          raffleId: sorteoId || null,
          ticketId: ticketsGenerados[0]?.id
        }
      });

      // Log de auditoría
      await tx.auditLog.create({
        data: {
          action: 'ADMIN_TICKET_GENERATION',
          userId: session.user.id,
          targetType: 'ticket',
          targetId: purchaseCreada?.id || ticketsGenerados[0]?.id,
          newValues: {
            targetUserId: userId,
            ticketCount: cantidad,
            raffleId: sorteoId || null,
            purchaseId: purchaseCreada?.id || null,
            totalAmount,
            generatedBy: 'SUPERADMIN',
            reason: 'Manual ticket generation',
            realPurchase: crearPurchase
          }
        }
      });
    });

    // Respuesta completa
    const responseData = {
      success: true,
      mensaje: sorteoId 
        ? `Se generaron ${cantidad} tickets para ${usuario.name} en el sorteo ${raffle.title}`
        : `Se generaron ${cantidad} tickets para ${usuario.name}`,
      
      tickets: ticketsGenerados,
      
      purchase: purchaseCreada ? {
        id: purchaseCreada.id,
        amount: purchaseCreada.amount,
        status: purchaseCreada.status,
        paymentMethod: purchaseCreada.paymentMethod,
        createdAt: purchaseCreada.createdAt
      } : null,
      
      usuario: {
        name: usuario.name,
        email: usuario.email
      },
      
      resumen: {
        tipo: sorteoId ? 'sorteo_tickets' : 'generic_tickets',
        cantidad,
        precioTotal: totalAmount,
        conPurchase: crearPurchase,
        ticketsConParticipacion: sorteoId ? cantidad : 0
      },
      
      generadoPor: {
        name: session.user.name,
        email: session.user.email,
        role: session.user.role
      },
      
      fecha: new Date().toISOString()
    };

    if (raffle) {
      responseData.sorteo = {
        id: raffle.id,
        title: raffle.title,
        precioOriginal: raffle.ticketPrice
      };
    }

    return Response.json(responseData);
    
  } catch (error) {
    console.error("Error generando tickets:", error);
    
    if (error.message?.includes('No fue posible generar ticket único')) {
      return Response.json(
        { error: "Error generando tickets únicos. Intenta con menos cantidad." },
        { status: 400 }
      );
    }

    if (error.code === 'P2002') {
      return Response.json(
        { error: "Error de duplicación. Intenta nuevamente." },
        { status: 400 }
      );
    }

    return Response.json(
      { 
        error: "Error interno del servidor",
        message: process.env.NODE_ENV === 'development' ? error.message : "Error interno"
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}