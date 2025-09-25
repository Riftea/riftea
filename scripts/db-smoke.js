// scripts/db-smoke.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

(async () => {
  const p = new PrismaClient();
  try {
    await p.$queryRawUnsafe('SELECT 1');
    console.log('DB OK');
  } catch (e) {
    console.error('DB ERROR:', e.code, e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
