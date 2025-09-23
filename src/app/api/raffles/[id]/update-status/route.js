// src/app/api/raffles/[id]/update-status/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import prisma from '@/lib/prisma';

export async function POST(req, { params }) {
  try {
    const resolvedParams = (await params) || params || {};
    const { id } = resolvedParams;
    
    if (!id) {
      return Response.json({ error: 'Falta id' }, { status: 400 });
    }

    // Usar transacción para consistencia
    const result = await prisma.$transaction(async (tx) => {
      // Obtener raffle con conteo actual
      const raffle = await tx.raffle.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          maxParticipants: true,
          drawAt: true,
          startsAt: true,
          endsAt: true,
          _count: { select: { participations: true } }
        },
      });

      if (!raffle) {
        throw new Error('RAFFLE_NOT_FOUND');
      }

      const now = new Date();
      const currentParticipations = raffle._count.participations;
      const isFull = raffle.maxParticipants && currentParticipations >= raffle.maxParticipants;
      
      let newStatus = raffle.status;
      let newDrawAt = raffle.drawAt;
      let shouldUpdate = false;
      const changes = [];

      // 1. Verificar transición PUBLISHED → ACTIVE
      if (newStatus === 'PUBLISHED' && raffle.startsAt && now >= new Date(raffle.startsAt)) {
        newStatus = 'ACTIVE';
        shouldUpdate = true;
        changes.push('PUBLISHED → ACTIVE (fecha de inicio alcanzada)');
      }

      // 2. Verificar transición ACTIVE → READY_TO_DRAW (capacidad llena)
      if (isFull && newStatus === 'ACTIVE') {
        newStatus = 'READY_TO_DRAW';
        shouldUpdate = true;
        changes.push(`ACTIVE → READY_TO_DRAW (capacidad llena: ${currentParticipations}/${raffle.maxParticipants})`);
        
        // Auto-programar sorteo si no tiene drawAt
        if (!newDrawAt) {
          newDrawAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutos
          changes.push(`Auto-programado sorteo para: ${newDrawAt.toISOString()}`);
        }
      }

      // 3. Verificar transición por fecha de fin
      if (
        ['ACTIVE', 'READY_TO_DRAW', 'PUBLISHED'].includes(newStatus) &&
        raffle.endsAt &&
        now >= new Date(raffle.endsAt)
      ) {
        newStatus = 'FINISHED';
        shouldUpdate = true;
        changes.push('→ FINISHED (fecha de fin alcanzada)');
      }

      // Actualizar si hay cambios
      if (shouldUpdate) {
        const updateData = { status: newStatus, updatedAt: now };
        if (newDrawAt !== raffle.drawAt) {
          updateData.drawAt = newDrawAt;
        }

        await tx.raffle.update({
          where: { id },
          data: updateData,
        });

        console.log(`✅ Sorteo ${id} actualizado:`, changes.join(', '));
      }

      return {
        id: raffle.id,
        previousStatus: raffle.status,
        newStatus,
        changed: shouldUpdate,
        changes,
        drawAt: newDrawAt,
        participationsCount: currentParticipations,
        isFull,
      };
    });

    return Response.json({
      success: true,
      raffle: result,
    });

  } catch (error) {
    console.error('❌ Error en POST /api/raffles/[id]/update-status:', error);
    
    if (error.message === 'RAFFLE_NOT_FOUND') {
      return Response.json({ error: 'Sorteo no encontrado' }, { status: 404 });
    }

    return Response.json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, { status: 500 });
  }
}