// src/jobs/checkProgress.job.js
import prisma from "@/lib/prisma";
import { enqueueJob, JobTypes } from "@/lib/queue";
import { logAuditEvent } from "@/services/audit.service";
import { maybeTriggerAutoDraw, drawRaffle } from "@/services/raffles.service";

/**
 * 📊 Verifica si una rifa alcanzó el cupo y programa el sorteo automáticamente.
 * - Usa maxParticipants vs participations (no "funding").
 * - Si llega al cupo y no tiene drawAt, cambia a READY_TO_DRAW y setea drawAt (countdown).
 */
export async function checkRaffleProgressJob(job) {
  const { raffleId, deltaParticipants } = job?.data || {};

  try {
    console.log(`📊 Verificando progreso de la rifa ${raffleId}...`);

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        title: true,
        status: true,
        maxParticipants: true,
        drawAt: true,
        endsAt: true,
        _count: { select: { participations: true } },
      },
    });

    if (!raffle) {
      throw new Error(`Rifa ${raffleId} no encontrada`);
    }

    const total = raffle._count.participations ?? 0;
    const target = raffle.maxParticipants ?? null;
    const percent = target ? (total / target) * 100 : null;

    console.log(
      `📈 ${raffle.title} — ${percent != null ? percent.toFixed(2) + "%" : "sin objetivo"} (${total}${target ? "/" + target : ""})`
    );

    // Si llenó cupo y aún no está programado, programar autodraw
    if (
      target &&
      total >= target &&
      ["PUBLISHED", "ACTIVE"].includes(raffle.status) &&
      !raffle.drawAt
    ) {
      await maybeTriggerAutoDraw(raffleId);
      await logAuditEvent({
        action: "RAFFLE_READY_TO_DRAW",
        entityType: "RAFFLE",
        entityId: raffleId,
        metadata: {
          totalParticipants: total,
          maxParticipants: target,
          statusFrom: raffle.status,
          scheduled: true,
        },
      });
      return {
        status: "READY_TO_DRAW",
        totalParticipants: total,
        maxParticipants: target,
        scheduled: true,
      };
    }

    // Hitos (25/50/75/90) basados en participantes
    if (target && percent != null && deltaParticipants != null) {
      const prevPercent = ((total - Number(deltaParticipants || 0)) / target) * 100;
      const milestones = [25, 50, 75, 90];
      for (const m of milestones) {
        if (prevPercent < m && percent >= m) {
          await logAuditEvent({
            action: "RAFFLE_MILESTONE_REACHED",
            entityType: "RAFFLE",
            entityId: raffleId,
            metadata: {
              milestone: `${m}%`,
              totalParticipants: total,
              maxParticipants: target,
              percent: percent.toFixed(2),
            },
          });

          // Notificación especial en 90% (urgencia)
          if (m === 90) {
            await enqueueJob("sendRaffleAlmostFullNotification", {
              raffleId,
              percent: Number(percent.toFixed(2)),
              remaining: Math.max(0, target - total),
            });
          }
          break;
        }
      }
    }

    return {
      status: raffle.status,
      totalParticipants: total,
      maxParticipants: target,
      percent: percent != null ? Number(percent.toFixed(2)) : null,
      scheduled: Boolean(raffle.drawAt),
    };
  } catch (error) {
    console.error(`❌ Error verificando progreso de la rifa ${raffleId}:`, error);

    await logAuditEvent({
      action: "RAFFLE_PROGRESS_CHECK_FAILED",
      entityType: "RAFFLE",
      entityId: raffleId,
      metadata: {
        error: String(error?.message || error),
        deltaParticipants,
        ts: new Date().toISOString(),
      },
    });

    throw error;
  }
}

/**
 * 🎲 Ejecutar sorteo automáticamente (cuando drawAt llega o si se fuerza).
 * - Requiere status READY_TO_DRAW (o ACTIVE con drawAt vencido y condiciones).
 * - Usa drawRaffle() del service (marca ganador y FINISHED).
 */
export async function executeRaffleJob(job) {
  const { raffleId, force = false, scheduledBy = "system", reason = "scheduled" } = job?.data || {};

  try {
    console.log(`🎲 Ejecutando sorteo ${raffleId}...`);

    // Cargar rifa + participaciones mínimas
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        title: true,
        status: true,
        drawAt: true,
        drawnAt: true,
        maxParticipants: true,
        winnerParticipationId: true,
        _count: { select: { participations: true } },
      },
    });

    if (!raffle) {
      throw new Error(`Rifa ${raffleId} no encontrada`);
    }
    if (raffle.drawnAt || raffle.winnerParticipationId) {
      throw new Error(`Rifa ${raffleId} ya fue sorteada`);
    }

    const now = new Date();
    const canRunTime = raffle.drawAt && new Date(raffle.drawAt) <= now;
    const canRunStatus = ["READY_TO_DRAW", "ACTIVE"].includes(raffle.status);

    if (!force) {
      if (!canRunStatus) {
        throw new Error(`Estado inválido para ejecutar (${raffle.status})`);
      }
      if (!canRunTime) {
        throw new Error(`Aún no es el horario del sorteo (drawAt: ${raffle.drawAt || "—"})`);
      }
    }

    // Validar cupo (si aplica)
    const total = raffle._count.participations ?? 0;
    if (raffle.maxParticipants && total < raffle.maxParticipants) {
      throw new Error(`La rifa no alcanzó el cupo (${total}/${raffle.maxParticipants})`);
    }
    if (total < 2) {
      throw new Error("Se requieren al menos 2 participaciones para sortear");
    }

    // Ejecutar draw (marca FINISHED, drawnAt y winnerParticipationId)
    await drawRaffle(raffleId);

    // Cargar datos para notificación
    const updated = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        id: true,
        title: true,
        status: true,
        drawnAt: true,
        winnerParticipationId: true,
        participations: {
          select: {
            id: true,
            isWinner: true,
            ticket: {
              select: {
                id: true,
                code: true,
                userId: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    const winnerPart = updated?.participations?.find((p) => p.id === updated?.winnerParticipationId);
    const winnerUser = winnerPart?.ticket?.user || null;

    // Auditoría
    await logAuditEvent({
      action: "RAFFLE_EXECUTED",
      entityType: "RAFFLE",
      entityId: raffleId,
      userId: winnerUser?.id ?? null,
      metadata: {
        winnerParticipationId: updated?.winnerParticipationId,
        winnerUserId: winnerUser?.id,
        status: updated?.status,
        drawnAt: updated?.drawnAt,
        scheduledBy,
        reason,
        executionTime: new Date().toISOString(),
      },
    });

    // Notificar ganador (si existe JobTypes)
    try {
      if (winnerUser?.id) {
        await enqueueJob(JobTypes.SEND_WINNER_NOTIFICATION, {
          winnerId: winnerUser.id,
          raffleId,
          raffleTitle: updated?.title,
          ticketCode: winnerPart?.ticket?.code,
        }, { priority: 100 });
      }
    } catch (e) {
      console.warn("Winner notification enqueue failed (non-critical):", e?.message || e);
    }

    console.log(`✅ Sorteo ${updated?.title} ejecutado. Ganador: ${winnerUser?.name || "—"}`);

    return {
      status: updated?.status,
      raffleId,
      winnerUserId: winnerUser?.id ?? null,
      winnerTicketCode: winnerPart?.ticket?.code ?? null,
      drawnAt: updated?.drawnAt ?? null,
    };
  } catch (error) {
    console.error(`❌ Error ejecutando sorteo ${raffleId}:`, error);

    await logAuditEvent({
      action: "RAFFLE_EXECUTION_FAILED",
      entityType: "RAFFLE",
      entityId: raffleId,
      metadata: {
        error: String(error?.message || error),
        scheduledBy,
        reason,
        ts: new Date().toISOString(),
      },
    });

    // Notificar admins (best-effort)
    try {
      await enqueueJob("sendAdminAlert", {
        type: "RAFFLE_EXECUTION_FAILED",
        raffleId,
        error: String(error?.message || error),
      });
    } catch (e) {
      console.warn("Admin alert enqueue failed (non-critical):", e?.message || e);
    }

    throw error;
  }
}

/**
 * 🧹 Limpieza: cancelar rifas vencidas sin ganador.
 * - Cancela rifas con endsAt pasado y sin winner, en estados activos.
 * - No toca tickets (no hay estado CANCELLED en TicketStatus).
 */
export async function cleanupExpiredRafflesJob(_job) {
  try {
    console.log("🧹 Limpiando rifas vencidas...");

    const now = new Date();

    const expired = await prisma.raffle.findMany({
      where: {
        endsAt: { lt: now },
        winnerParticipationId: null,
        status: { in: ["PUBLISHED", "ACTIVE", "READY_TO_DRAW"] },
      },
      select: { id: true, title: true, endsAt: true },
    });

    const results = [];

    for (const r of expired) {
      await prisma.raffle.update({
        where: { id: r.id },
        data: { status: "CANCELLED" },
      });

      await logAuditEvent({
        action: "RAFFLE_CANCELLED_EXPIRED",
        entityType: "RAFFLE",
        entityId: r.id,
        metadata: {
          reason: "EXPIRED_WITHOUT_WINNER",
          endedAt: r.endsAt,
        },
      });

      results.push({ raffleId: r.id, title: r.title });
      console.log(`❌ Rifa cancelada por vencimiento: ${r.title}`);
    }

    console.log(`🧹 Limpieza completada: ${results.length} rifas canceladas`);
    return { cleanedRaffles: results.length, details: results };
  } catch (error) {
    console.error("❌ Error en limpieza de rifas:", error);
    throw error;
  }
}
