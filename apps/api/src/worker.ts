/**
 * Standalone extraction worker. Use with REDIS_URL set and
 * RUN_WORKER_IN_PROCESS=false on the API to scale extraction separately.
 */
import { loadEnv } from './config/env';
import { createContainer } from './container';
import { createPrisma } from './lib/prisma';

async function main() {
  const env = loadEnv();
  if (!env.REDIS_URL) {
    console.error('The standalone worker requires REDIS_URL (BullMQ). Without Redis the API runs extractions in-process.');
    process.exit(1);
  }
  const prisma = createPrisma();
  const container = createContainer(env, prisma);
  container.queue.startWorker((id) => container.pipeline.run(id));
  console.log(`Extraction worker started (concurrency ${env.EXTRACTION_CONCURRENCY})`);

  const shutdown = async () => {
    await container.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
