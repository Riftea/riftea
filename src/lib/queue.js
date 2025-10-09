// src/lib/queue.js — NO-OP (colas deshabilitadas)

export const JobTypes = {};

export async function enqueueJob() { return { enqueued: false, reason: 'DISABLED' }; }
export async function getQueueStats() { return { waiting: 0, active: 0, completed: 0, failed: 0, total: 0 }; }
export async function retryFailedJobs() { return []; }
export async function cleanQueue() {}

// ✅ default export con nombre (evita 'import/no-anonymous-default-export')
const DisabledQueue = null;
export default DisabledQueue;
