import { buildApp } from './app';
import { loadEnv } from './config/env';
import { createContainer } from './container';
import { createPrisma } from './lib/prisma';

async function main() {
  const env = loadEnv();
  const prisma = createPrisma();
  const container = createContainer(env, prisma);
  const app = await buildApp(container);

  if (env.RUN_WORKER_IN_PROCESS || container.queue.kind === 'in-process') {
    container.queue.startWorker((id) => container.pipeline.run(id));
    if (container.queue.kind === 'in-process') {
      const n = await container.extraction.requeueStale();
      if (n) app.log.info(`Re-queued ${n} interrupted extraction(s)`);
    }
    app.log.info(`Extraction worker running in-process (${container.queue.kind} queue)`);
  }

  const runMaintenance = async () => {
    try {
      const report = await container.maintenance.run();
      if (Object.values(report).some((v) => v > 0)) app.log.info({ report }, 'Maintenance run');
    } catch (err) {
      app.log.error({ err }, 'Maintenance run failed');
    }
  };
  await runMaintenance();
  const timer = setInterval(runMaintenance, env.MAINTENANCE_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    clearInterval(timer);
    await app.close();
    await container.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.HOST, port: env.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
