// src/app/api/admin/generar-tickets/route.js - CORREGIDA CON HMAC + ENTEROS + GENERATEDAT
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth';
import prisma from "@/lib/prisma";
import { generateTicketData, formatTicketPriceInput, validateIntegerPrice } from "@/lib/crypto";

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    
    // Verificar que el usuario esté autenticado y sea SUPERADMIN
    const role = String(session?.user?.role || '').toUpperCase();
    if (!session || role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "No autorizado. Solo SUPERADMIN puede generar tickets." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      userId, 
      sorteoId, 
      cantidad = 1, 
      crearPurchase = true,
      ticketPrice = null,
      ticketPriceInput = null // Nuevo: input desde frontend
    } = body;

    // Validaciones básicas
    if (!userId) {
      return NextResponse.json(
        { error: "userId es requerido" },
        { status: 400 }
      );
    }

    // Validación robusta de cantidad
    const cantidadInt = Number(cantidad);
    if (!Number.isInteger(cantidadInt) || cantidadInt < 1 || cantidadInt > 100) {
      return NextResponse.json(
        { error: "La cantidad debe ser un número entero entre 1 y 100" },
        { status: 400 }
      );
    }

    // Verificar que el usuario existe
    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    });

    if (!usuario) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    let raffle = null;
    let ticketPriceInt = 0;

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
          ticketPrice: true, // Ya es Int en la DB
          _count: {
            select: { tickets: true }
          }
        }
      });

      if (!raffle) {
        return NextResponse.json(
          { error: "Sorteo no encontrado" },
          { status: 404 }
        );
      }

      if (!['PUBLISHED', 'ACTIVE'].includes(raffle.status)) {
        return NextResponse.json(
          { error: "Solo se pueden generar tickets para sorteos publicados o activos" },
          { status: 400 }
        );
      }

      // Usar precio de la raffle
      ticketPriceInt = raffle.ticketPrice;

      // Verificar límite de tickets si existe
      if (raffle.maxTickets) {
        const ticketsActuales = raffle._count.tickets;
        if (ticketsActuales + cantidadInt > raffle.maxTickets) {
          return NextResponse.json(
            { error: `Excede el límite máximo de tickets. Disponibles: ${raffle.maxTickets - ticketsActuales}` },
            { status: 400 }
          );
        }
      }

      // Verificar que la raffle no haya terminado
      if (raffle.endsAt && new Date() > new Date(raffle.endsAt)) {
        return NextResponse.json(
          { error: "El sorteo ya ha terminado" },
          { status: 400 }
        );
      }
    } else {
      // 🔄 NUEVO: Si no hay sorteo, procesar precio desde input del frontend
      if (ticketPriceInput) {
        try {
          ticketPriceInt = formatTicketPriceInput(ticketPriceInput);
        } catch (error) {
          return NextResponse.json(
            { error: `Error en precio: ${error.message}` },
            { status: 400 }
          );
        }
      } else if (ticketPrice) {
        // Fallback al método anterior con nuevas validaciones
        try {
          ticketPriceInt = validateIntegerPrice(ticketPrice, "Precio del ticket");
        } catch (error) {
          return NextResponse.json(
            { error: error.message },
            { status: 400 }
          );
        }
      } else {
        // 🔄 NUEVO: Leer precio default desde Settings con validación
        try {
          const ticketPriceSetting = await prisma.setting.findUnique({
            where: { key: 'ticketPriceDefault' }
          });
          
          if (ticketPriceSetting?.value) {
            ticketPriceInt = validateIntegerPrice(Number(ticketPriceSetting.value), "Precio del ticket (default)");
          } else {
            ticketPriceInt = 5000; // Default que cumple reglas
          }
        } catch (error) {
          console.warn("Error leyendo ticketPriceDefault, usando default:", error);
          ticketPriceInt = 5000;
        }
      }
    }

    const ticketsGenerados = [];
    let purchaseCreada = null;
    const totalAmount = ticketPriceInt * cantidadInt;

    // Usar transacción para crear Purchase + Tickets de forma atómica
    await prisma.$transaction(async (tx) => {
      
      // Crear Purchase ficticia si se solicitó
      if (crearPurchase) {
        purchaseCreada = await tx.purchase.create({
          data: {
            userId,
            amount: totalAmount, // Entero en la DB
            currency: "ARS",
            paymentMethod: "ADMIN_GENERATED",
            paymentId: `ADMIN_${Date.now()}`,
            status: "completed"
          }
        });
      }

      // 🔄 NUEVO: Crear tickets con sistema HMAC y generatedAt
      for (let i = 0; i < cantidadInt; i++) {
        let attempts = 0;
        let ticketCreated = false;

        while (!ticketCreated && attempts < 5) {
          try {
            // Generar datos del ticket con HMAC seguro
            const ticketData = generateTicketData(userId);

            const ticketDBData = {
              uuid: ticketData.uuid,
              code: ticketData.displayCode, // Código display principal
              hash: ticketData.hmac, // 🔄 HMAC seguro en lugar de SHA256
              userId,
              status: "AVAILABLE",
              metodoPago: "ADMIN_GENERATED",
              generatedAt: ticketData.generatedAt, // 🔄 USAR generatedAt como timestamp
              displayCode: ticketData.displayCode,
              isUsed: false,
              isWinner: false
            };

            if (purchaseCreada) {
              ticketDBData.purchaseId = purchaseCreada.id;
            }

            if (sorteoId) {
              ticketDBData.raffleId = sorteoId;
              // Si es para un sorteo específico, cambiar estado a ACTIVE
              ticketDBData.status = "ACTIVE";
            }

            const ticket = await tx.ticket.create({
              data: ticketDBData,
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

            // 🔄 CAMBIO: No devolver hash/hmac por seguridad
            ticketsGenerados.push({
              id: ticket.id,
              uuid: ticket.uuid,
              code: ticket.code,
              displayCode: ticket.displayCode,
              status: ticket.status,
              createdAt: ticket.createdAt,
              generatedAt: ticket.generatedAt, // Incluir generatedAt
              raffleId: ticket.raffleId,
              purchaseId: ticket.purchaseId,
              hmacSecure: true, // Indicador de que usa HMAC
              // hash: NO DEVOLVER por seguridad
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
              console.warn(`Colisión UUID intento ${attempts}/5`);
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
        : `¡Has recibido ${cantidadInt} tickets!`;
        
      const notificationMessage = sorteoId 
        ? `Tus ${cantidadInt} tickets para "${raffle.title}" están listos. ¡Buena suerte!`
        : `Se han agregado ${cantidadInt} tickets a tu cuenta.`;

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
      try {
        await tx.auditLog.create({
          data: {
            action: 'ADMIN_TICKET_GENERATION',
            userId: session.user.id,
            targetType: 'ticket',
            targetId: purchaseCreada?.id || ticketsGenerados[0]?.id,
            newValues: {
              targetUserId: userId,
              ticketCount: cantidadInt,
              raffleId: sorteoId || null,
              purchaseId: purchaseCreada?.id || null,
              totalAmount,
              ticketPrice: ticketPriceInt,
              generatedBy: 'SUPERADMIN',
              reason: 'Manual ticket generation',
              realPurchase: crearPurchase,
              securityLevel: 'HMAC-SHA256', 
              priceType: 'INTEGER',
              timestamp: new Date().toISOString()
            }
          }
        });
      } catch (auditError) {
        console.warn('No se pudo crear log de auditoría:', auditError);
      }
    });

    // Respuesta completa
    const responseData = {
      success: true,
      mensaje: sorteoId 
        ? `Se generaron ${cantidadInt} tickets para ${usuario.name} en el sorteo ${raffle.title}`
        : `Se generaron ${cantidadInt} tickets para ${usuario.name}`,
      
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
        cantidad: cantidadInt,
        precioTotal: totalAmount,
        precioUnitario: ticketPriceInt,
        conPurchase: crearPurchase,
        ticketsConParticipacion: sorteoId ? cantidadInt : 0,
        securityLevel: 'HMAC-SHA256',
        priceType: 'INTEGER',
        usesGeneratedAt: true // Nuevo indicador
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

    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error("Error generando tickets:", error);
    
    if (error.message?.includes('No fue posible generar ticket único')) {
      return NextResponse.json(
        { error: "Error generando tickets únicos. Intenta con menos cantidad." },
        { status: 400 }
      );
    }

    if (error.message?.includes('Error en precio')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: "Error de duplicación. Intenta nuevamente." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: "Error interno del servidor",
        message: process.env.NODE_ENV === 'development' ? error.message : "Error interno"
      },
      { status: 500 }
    );
  }
}