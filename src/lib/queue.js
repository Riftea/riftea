// src/lib/queue.js
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// 🔗 Conexión Redis
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
});

// 🎯 Cola principal de Riftea
const rifteaQueue = new Queue('riftea-jobs', { 
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    }
  }
});

/**
 * 🚀 Encolar un job
 */
export async function enqueueJob(jobName, data, options = {}) {
  try {
    const job = await rifteaQueue.add(jobName, data, {
      delay: options.delay || 0,
      priority: options.priority || 0,
      ...options
    });
    
    console.log(`✅ Job ${jobName} encolado:`, job.id);
    return job;
  } catch (error) {
    console.error(`❌ Error encolando job ${jobName}:`, error);
    throw error;
  }
}

/**
 * 📊 Obtener estadísticas de la cola
 */
export async function getQueueStats() {
  try {
    const waiting = await rifteaQueue.getWaiting();
    const active = await rifteaQueue.getActive();
    const completed = await rifteaQueue.getCompleted();
    const failed = await rifteaQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  } catch (error) {
    console.error('❌ Error obteniendo stats de cola:', error);
    return null;
  }
}

/**
 * 🔄 Reintentar jobs fallidos
 */
export async function retryFailedJobs() {
  try {
    const failedJobs = await rifteaQueue.getFailed();
    const retried = [];

    for (const job of failedJobs) {
      await job.retry();
      retried.push(job.id);
    }

    console.log(`🔄 ${retried.length} jobs reintentados`);
    return retried;
  } catch (error) {
    console.error('❌ Error reintentando jobs:', error);
    throw error;
  }
}

/**
 * 🧹 Limpiar jobs completados y fallidos
 */
export async function cleanQueue() {
  try {
    await rifteaQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'); // 24h
    await rifteaQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');  // 7 días
    console.log('🧹 Cola limpiada');
  } catch (error) {
    console.error('❌ Error limpiando cola:', error);
  }
}

// 📈 Jobs específicos de Riftea
export const JobTypes = {
  GENERATE_TICKETS: 'generateTickets',
  CHECK_RAFFLE_PROGRESS: 'checkRaffleProgress',
  SEND_PURCHASE_CONFIRMATION: 'sendPurchaseConfirmation',
  EXECUTE_RAFFLE: 'executeRaffle',
  SEND_WINNER_NOTIFICATION: 'sendWinnerNotification',
  PROCESS_REFUND: 'processRefund',
  AUDIT_CLEANUP: 'auditCleanup'
};

export default rifteaQueue;