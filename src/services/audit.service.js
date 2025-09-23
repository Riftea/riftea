// src/services/audit.service.js
import crypto from "crypto";

/**
 * 🔍 Registra eventos de auditoría para compliance y trazabilidad
 */
export async function logAuditEvent({
  action,
  entityType,
  entityId,
  userId = null,
  metadata = {},
  ipAddress = null,
  userAgent = null,
  tx = null // transacción de Prisma opcional
}) {
  const prismaClient = tx || (await import("@/lib/prisma")).default;
  
  // 🔐 Crear hash de integridad para prevenir manipulación
  const timestamp = new Date();
  const integrityData = `${action}|${entityType}|${entityId}|${userId}|${timestamp.toISOString()}`;
  const integrityHash = crypto.createHash("sha256").update(integrityData).digest("hex");

  const auditLog = await prismaClient.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      userId,
      timestamp,
      metadata,
      ipAddress,
      userAgent,
      integrityHash,
      version: "1.0"
    }
  });

  return auditLog;
}

/**
 * 📊 Obtener historial de auditoría para una entidad específica
 */
export async function getEntityAuditHistory(entityType, entityId, limit = 50) {
  const prisma = (await import("@/lib/prisma")).default;
  
  return await prisma.auditLog.findMany({
    where: {
      entityType,
      entityId
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: { timestamp: 'desc' },
    take: limit
  });
}

/**
 * 🔍 Verificar integridad de logs de auditoría
 */
export async function verifyAuditIntegrity(auditLogId) {
  const prisma = (await import("@/lib/prisma")).default;
  
  const log = await prisma.auditLog.findUnique({
    where: { id: auditLogId }
  });

  if (!log) {
    return { valid: false, error: "Log no encontrado" };
  }

  // 🔐 Recalcular hash de integridad
  const integrityData = `${log.action}|${log.entityType}|${log.entityId}|${log.userId}|${log.timestamp.toISOString()}`;
  const expectedHash = crypto.createHash("sha256").update(integrityData).digest("hex");

  const isValid = expectedHash === log.integrityHash;

  return {
    valid: isValid,
    log: {
      id: log.id,
      action: log.action,
      timestamp: log.timestamp,
      expectedHash,
      actualHash: log.integrityHash
    }
  };
}

/**
 * 📈 Generar reporte de actividad por usuario
 */
export async function generateUserActivityReport(userId, startDate, endDate) {
  const prisma = (await import("@/lib/prisma")).default;
  
  const activities = await prisma.auditLog.findMany({
    where: {
      userId,
      timestamp: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: { timestamp: 'desc' }
  });

  // 📊 Agrupar por acción
  const summary = activities.reduce((acc, activity) => {
    acc[activity.action] = (acc[activity.action] || 0) + 1;
    return acc;
  }, {});

  return {
    userId,
    period: { from: startDate, to: endDate },
    totalActivities: activities.length,
    summary,
    activities: activities.map(a => ({
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      timestamp: a.timestamp,
      metadata: a.metadata
    }))
  };
}

/**
 * 🚨 Detectar actividad sospechosa
 */
export async function detectSuspiciousActivity(userId, timeWindowMinutes = 60) {
  const prisma = (await import("@/lib/prisma")).default;
  
  const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
  
  const recentActivity = await prisma.auditLog.findMany({
    where: {
      userId,
      timestamp: { gte: since }
    }
  });

  // 🔍 Reglas de detección
  const suspiciousPatterns = [];

  // Demasiadas compras en poco tiempo
  const purchases = recentActivity.filter(a => a.action === 'PURCHASE_CREATED');
  if (purchases.length > 10) {
    suspiciousPatterns.push({
      type: 'EXCESSIVE_PURCHASES',
      count: purchases.length,
      timeWindow: timeWindowMinutes
    });
  }

  // Muchas verificaciones de tickets
  const verifications = recentActivity.filter(a => a.action === 'TICKET_VERIFIED');
  if (verifications.length > 50) {
    suspiciousPatterns.push({
      type: 'EXCESSIVE_VERIFICATIONS',
      count: verifications.length,
      timeWindow: timeWindowMinutes
    });
  }

  // Intentos de acceso desde múltiples IPs
  const uniqueIPs = new Set(recentActivity.map(a => a.ipAddress).filter(Boolean));
  if (uniqueIPs.size > 5) {
    suspiciousPatterns.push({
      type: 'MULTIPLE_IP_ADDRESSES',
      ipCount: uniqueIPs.size,
      ips: Array.from(uniqueIPs)
    });
  }

  return {
    userId,
    timeWindow: timeWindowMinutes,
    totalActivities: recentActivity.length,
    suspicious: suspiciousPatterns.length > 0,
    patterns: suspiciousPatterns,
    recommendation: suspiciousPatterns.length > 0 ? 'REVIEW_ACCOUNT' : 'NO_ACTION'
  };
}

/**
 * 🏆 Auditar evento de sorteo completo
 */
export async function auditRaffleExecution({
  raffleId,
  winnerTicketId,
  totalParticipants,
  finalFunding,
  executorUserId,
  randomSeed = null,
  tx = null
}) {
  await logAuditEvent({
    action: 'RAFFLE_EXECUTED',
    entityType: 'RAFFLE',
    entityId: raffleId,
    userId: executorUserId,
    metadata: {
      winnerTicketId,
      totalParticipants,
      finalFunding,
      randomSeed: randomSeed || 'system-generated',
      executedAt: new Date().toISOString()
    },
    tx
  });

  // 🎫 Log específico del ticket ganador
  await logAuditEvent({
    action: 'TICKET_WON',
    entityType: 'TICKET',
    entityId: winnerTicketId,
    userId: executorUserId,
    metadata: {
      raffleId,
      totalParticipants,
      winningProbability: (1 / totalParticipants * 100).toFixed(4) + '%'
    },
    tx
  });
}

/**
 * 💰 Auditar transacciones financieras
 */
export async function auditFinancialTransaction({
  transactionType, // 'PURCHASE', 'REFUND', 'PRIZE_PAYOUT'
  amount,
  fromUserId = null,
  toUserId = null,
  raffleId = null,
  paymentProvider = null,
  providerTransactionId = null,
  tx = null
}) {
  await logAuditEvent({
    action: `FINANCIAL_${transactionType}`,
    entityType: 'TRANSACTION',
    entityId: providerTransactionId || crypto.randomUUID(),
    userId: fromUserId || toUserId,
    metadata: {
      type: transactionType,
      amount,
      fromUserId,
      toUserId,
      raffleId,
      provider: paymentProvider,
      providerTransactionId,
      processedAt: new Date().toISOString()
    },
    tx
  });
}