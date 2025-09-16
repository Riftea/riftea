// src/workers/worker.js
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { JobTypes } from '@/lib/queue';

// Jobs imports
import { createTickets } from '@/services/tickets.service';
import {
  checkRaffleProgressJob,
  executeRaffleJob,
  cleanupExpiredRafflesJob,
} from '@/jobs/checkProgress.job';

// 🔗 Conexión Redis
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
});

// 📧 Mock de servicio de notificaciones (implementar según tu proveedor)
const notificationService = {
  async sendEmail({ to, subject, html, template = null, data = {} }) {
    // 🚀 Integración real: SendGrid/Resend/etc.
    console.log(`📧 EMAIL: ${to} - ${subject}`);
    if (process.env.NODE_ENV === 'development') {
      console.log('📄 Content:', html || `Template: ${template}`, data);
    }
    return { sent: true, provider: 'mock' };
  },

  async sendSMS({ to, message }) {
    // 📱 Integración real: Twilio/etc.
    console.log(`📱 SMS: ${to} - ${message}`);
    return { sent: true, provider: 'mock' };
  },
};

/**
 * ⚙️ Worker principal de Riftea
 */
const worker = new Worker(
  'riftea-jobs',
  async (job) => {
    const { name, data } = job;

    console.log(`🚀 Procesando job: ${name} (ID: ${job.id})`);

    try {
      switch (name) {
        // 🎟️ Generar tickets después de una compra
        case JobTypes.GENERATE_TICKETS:
          return await handleGenerateTickets(data);

        // 📊 Verificar progreso de la rifa (cupo/participaciones)
        case JobTypes.CHECK_RAFFLE_PROGRESS:
          return await checkRaffleProgressJob(job);

        // 🎲 Ejecutar sorteo automáticamente (cuando drawAt llega)
        case JobTypes.EXECUTE_RAFFLE:
          return await executeRaffleJob(job);

        // 📧 Confirmación de compra
        case JobTypes.SEND_PURCHASE_CONFIRMATION:
          return await handlePurchaseConfirmation(data);

        // 🏆 Notificar ganador
        case JobTypes.SEND_WINNER_NOTIFICATION:
          return await handleWinnerNotification(data);

        // 💰 Procesar reembolso
        case JobTypes.PROCESS_REFUND:
          return await handleRefundProcess(data);

        // 🧹 Limpieza de auditoría
        case JobTypes.AUDIT_CLEANUP:
          return await handleAuditCleanup(data);

        // 🎊 Notificación sorteo completado (participantes)
        case 'sendRaffleCompleteNotification':
          return await handleRaffleCompleteNotification(data);

        // 🔔 Notificación “casi lleno” (90%+ de participaciones)
        case 'sendRaffleAlmostFullNotification':
          return await handleAlmostFullNotification(data);

        // 😢 Notificación de consolación
        case 'sendConsolationNotification':
          return await handleConsolationNotification(data);

        // 🚨 Alerta admin
        case 'sendAdminAlert':
          return await handleAdminAlert(data);

        // 🧹 Limpiar rifas vencidas sin ganador
        case 'cleanupExpiredRaffles':
          return await cleanupExpiredRafflesJob(job);

        default:
          throw new Error(`Job desconocido: ${name}`);
      }
    } catch (error) {
      console.error(`❌ Error procesando job ${name}:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 5, // procesar hasta 5 jobs simultáneamente
    removeOnComplete: 50,
    removeOnFail: 20,
  }
);

// 🎟️ Handler: Generar tickets
async function handleGenerateTickets({ userId, raffleId, purchaseId, quantity }) {
  const tickets = await createTickets({
    userId,
    raffleId,
    purchaseId,
    quantity,
  });

  console.log(`✅ ${quantity} tickets generados para usuario ${userId}`);
  return { ticketsCreated: tickets.length, tickets: tickets.map((t) => t.uuid) };
}

// 📧 Handler: Confirmación de compra
async function handlePurchaseConfirmation({ userId, purchaseId, ticketCount }) {
  const prisma = (await import('@/lib/prisma')).default;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) throw new Error('Usuario no encontrado');

  await notificationService.sendEmail({
    to: user.email,
    subject: '🎟️ ¡Tickets de sorteo recibidos!',
    html: `
      <h1>¡Gracias por tu compra, ${user.name}!</h1>
      <p>Has recibido <strong>${ticketCount} tickets</strong> para participar en nuestros sorteos.</p>
      <p>🎁 <em>Los tickets son un regalo por confiar en nosotros.</em></p>
      <p>👀 <a href="${process.env.NEXT_PUBLIC_BASE_URL}/mis-sorteos">Ver mis tickets</a></p>
    `,
  });

  return { emailSent: true, recipient: user.email };
}

// 🏆 Handler: Notificar ganador
async function handleWinnerNotification({ winnerId, raffleId, raffleTitle, ticketCode, prizeAmount }) {
  const prisma = (await import('@/lib/prisma')).default;

  const winner = await prisma.user.findUnique({
    where: { id: winnerId },
    select: { email: true, name: true, phone: true },
  });

  if (!winner) throw new Error('Ganador no encontrado');

  // 📧 Email al ganador
  await notificationService.sendEmail({
    to: winner.email,
    subject: '🏆 ¡FELICITACIONES! Has ganado el sorteo',
    html: `
      <h1 style="color: gold;">🎉 ¡GANASTE! 🎉</h1>
      <p>Estimado/a <strong>${winner.name}</strong>,</p>
      <p>¡Tu ticket <code>${ticketCode}</code> ha sido seleccionado como <strong>GANADOR</strong> del sorteo:</p>
      <h2 style="color: #333;">${raffleTitle}</h2>
      ${prizeAmount != null ? `<p style="font-size: 24px;">💰 Premio: <strong>$${prizeAmount}</strong></p>` : ''}
      <hr>
      <p>📞 Nos pondremos en contacto contigo en las próximas 24 horas para coordinar la entrega del premio.</p>
      <p><small>Conserva este email como comprobante de tu premio.</small></p>
    `,
  });

  // 📱 SMS si tiene teléfono
  if (winner.phone) {
    await notificationService.sendSMS({
      to: winner.phone,
      message: `🏆 ¡GANASTE! Tu ticket ${ticketCode} ${prizeAmount != null ? `ganó $${prizeAmount}` : 'resultó ganador'} en Riftea. Revisa tu email para más detalles.`,
    });
  }

  return {
    emailSent: true,
    smsSent: !!winner.phone,
    winner: winner.name,
    prizeAmount: prizeAmount ?? null,
  };
}

// 🎊 Handler: Sorteo completado (a participantes)
async function handleRaffleCompleteNotification({ userId, raffleId, raffleTitle, executeDate }) {
  const prisma = (await import('@/lib/prisma')).default;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  await notificationService.sendEmail({
    to: user.email,
    subject: `🎯 Sorteo "${raffleTitle}" completado - ¡Ya podemos sortear!`,
    html: `
      <h1>¡El sorteo está listo! 🎊</h1>
      <p>Hola ${user.name},</p>
      <p>¡Excelente noticia! El sorteo <strong>"${raffleTitle}"</strong> alcanzó el cupo de participantes.</p>
      <p>🎲 <strong>El sorteo se realizará automáticamente el:</strong><br>
         📅 ${new Date(executeDate).toLocaleString('es-AR')}</p>
      <p>🤞 ¡Que tengas suerte!</p>
    `,
  });

  return { sent: true };
}

// 🔔 Handler: Notificación “casi lleno”
async function handleAlmostFullNotification({ raffleId, percent, remaining }) {
  const prisma = (await import('@/lib/prisma')).default;

  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: {
      title: true,
      participations: {
        select: {
          ticket: {
            select: { user: { select: { email: true, name: true } } },
          },
        },
      },
    },
  });

  const recipients = Array.from(
    new Set(
      raffle?.participations
        ?.map((p) => p?.ticket?.user?.email)
        .filter(Boolean)
    )
  );

  for (const email of recipients) {
    await notificationService.sendEmail({
      to: email,
      subject: `⏳ ¡Tu sorteo está al ${percent}%!`,
      html: `
        <h1>¡Estamos muy cerca! ⏳</h1>
        <p>El sorteo <strong>"${raffle?.title || 'Sorteo'}"</strong> está al <strong>${percent}%</strong> de su cupo.</p>
        <p>Quedan <strong>${remaining}</strong> lugares. ¡Invitá a tus amigos para que se complete y podamos sortear! 🎲</p>
      `,
    });
  }

  return { notified: recipients.length, percent, remaining };
}

// 😢 Handler: Consolación a perdedores
async function handleConsolationNotification({ userId, raffleId, raffleTitle, winnerName }) {
  const prisma = (await import('@/lib/prisma')).default;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  await notificationService.sendEmail({
    to: user.email,
    subject: `Resultado del sorteo: "${raffleTitle}"`,
    html: `
      <h1>Gracias por participar 💙</h1>
      <p>Hola ${user.name},</p>
      <p>El sorteo <strong>"${raffleTitle}"</strong> ya finalizó.</p>
      <p>🏆 El ganador fue: <strong>${winnerName}</strong></p>
      <p>Aunque esta vez no ganaste, ¡gracias por participar! 🙏</p>
      <p>🎁 Seguí participando en nuestros sorteos.</p>
      <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}">Ver nuevos sorteos</a></p>
    `,
  });

  return { sent: true };
}

// 💰 Handler: Procesar reembolso
async function handleRefundProcess({ purchaseId, reason, refundAmount }) {
  const prisma = (await import('@/lib/prisma')).default;

  // 🔍 Obtener datos de la compra
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      user: { select: { email: true, name: true } },
    },
  });

  if (!purchase) throw new Error('Compra no encontrada');

  // 🏦 Integración real con proveedor de pagos (Stripe/etc.) iría aquí

  // 📝 Actualizar estado (ajusta estos campos si tu esquema difiere)
  await prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      status: 'REFUNDED',
      // Si tu esquema no tiene estos campos, quítalos o adáptalos:
      // refundedAt: new Date(),
      // refundAmount,
      // refundReason: reason,
    },
  });

  // 📧 Notificar al usuario
  await notificationService.sendEmail({
    to: purchase.user.email,
    subject: '💰 Reembolso procesado',
    html: `
      <h1>Reembolso procesado</h1>
      <p>Hola ${purchase.user.name},</p>
      <p>Hemos procesado tu reembolso por <strong>$${refundAmount}</strong>.</p>
      <p><strong>Motivo:</strong> ${reason}</p>
      <p>El dinero será acreditado en tu método de pago original en unos días hábiles.</p>
    `,
  });

  console.log(`💰 Reembolso procesado: $${refundAmount} para ${purchase.user.email}`);

  return {
    refunded: true,
    amount: refundAmount,
    user: purchase.user.email,
  };
}

// 🚨 Handler: Alerta admin
async function handleAdminAlert({ type, raffleId, error, ...metadata }) {
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || ['admin@riftea.com'];

  for (const adminEmail of adminEmails) {
    await notificationService.sendEmail({
      to: adminEmail,
      subject: `🚨 Alerta Riftea: ${type}`,
      html: `
        <h1 style="color: red;">🚨 Alerta del Sistema</h1>
        <p><strong>Tipo:</strong> ${type}</p>
        <p><strong>Sorteo ID:</strong> ${raffleId}</p>
        <p><strong>Error:</strong> ${error}</p>
        <pre>${JSON.stringify(metadata, null, 2)}</pre>
        <p><em>Timestamp: ${new Date().toISOString()}</em></p>
      `,
    });
  }

  return { alertsSent: adminEmails.length };
}

// 🧹 Handler: Limpiar logs de auditoría viejos
async function handleAuditCleanup({ olderThanDays = 90 }) {
  const prisma = (await import('@/lib/prisma')).default;

  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const deleted = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate }, // <-- en tu schema es createdAt, no "timestamp"
      action: { notIn: ['RAFFLE_EXECUTED', 'FINANCIAL_PURCHASE'] }, // conservar críticos
    },
  });

  console.log(`🧹 ${deleted.count} logs de auditoría eliminados (>${olderThanDays} días)`);
  return { deleted: deleted.count };
}

// 🎧 Event listeners
worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.name} completado:`, job.id);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.name} falló:`, job?.id, err.message);
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

console.log('⚙️ Worker de Riftea iniciado - Esperando jobs...');

export default worker;
