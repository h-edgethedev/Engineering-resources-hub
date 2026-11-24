import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './infrastructure/database.js';
import { scheduleExpiredTrash } from './modules/resources/governance.service.js';

const app = createApp();
const server = app.listen(env.apiPort, () => {
  console.info(`Engineering Resources Hub API listening on http://localhost:${env.apiPort}`);
});

let purgeSweepRunning = false;
async function runPurgeSweep() {
  if (purgeSweepRunning) return;
  purgeSweepRunning = true;
  try { await scheduleExpiredTrash(); }
  catch (error) { console.error('Resource Trash purge sweep failed.', error); }
  finally { purgeSweepRunning = false; }
}
const purgeTimer = setInterval(() => { void runPurgeSweep(); }, env.resourcePurgeIntervalMs);
purgeTimer.unref();
void runPurgeSweep();

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; closing API server.`);

  server.close(async (error) => {
    clearInterval(purgeTimer);
    if (error) {
      console.error('API server shutdown failed.');
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
