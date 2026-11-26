// Starts a local PostgreSQL server without Docker using the `embedded-postgres`
// package (downloads real PostgreSQL binaries for your platform).
// Usage: pnpm db:local   (Ctrl+C to stop)
import { existsSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const databaseDir = resolve(process.cwd(), '.local-db', 'data');
const url = `postgresql://postgres:postgres@localhost:${port}/jobportal`;

function portInUse(p) {
  return new Promise((done) => {
    const socket = net.connect({ port: p, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });
}

if (await portInUse(port)) {
  console.log(`PostgreSQL is already running on port ${port} — nothing to do.`);
  console.log(`DATABASE_URL=${url}`);
  console.log('(To restart it, stop the existing server first, or set LOCAL_PG_PORT to use another port.)');
  process.exit(0);
}

// Imported lazily: the package installs exit hooks that print noise on early exit.
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const firstRun = !existsSync(databaseDir);
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  // Force UTF-8 regardless of the OS code page (Windows defaults to WIN1252).
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (msg) => {
    const text = String(msg ?? '').trim();
    if (text) console.error(`[postgres] ${text}`);
  },
});

try {
  if (firstRun) {
    console.log('Initialising local PostgreSQL cluster in', databaseDir);
    await pg.initialise();
  }
  await pg.start();
} catch (err) {
  console.error(`\nCould not start PostgreSQL on port ${port}.`);
  if (err) console.error(err instanceof Error ? err.message : err);
  if (existsSync(join(databaseDir, 'postmaster.pid'))) {
    console.error(
      `A postmaster.pid lock file exists in ${databaseDir}.\n` +
        'Another PostgreSQL process may still be using this data folder — stop it (e.g. close the other terminal running `pnpm db:local`) and try again.',
    );
  }
  process.exit(1);
}

for (const db of ['jobportal', 'jobportal_test']) {
  try {
    await pg.createDatabase(db);
    console.log(`Created database ${db}`);
  } catch {
    /* already exists */
  }
}
console.log(`\nLocal PostgreSQL running on port ${port}`);
console.log(`DATABASE_URL=${url}`);
console.log('Press Ctrl+C to stop.\n');

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping PostgreSQL...');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
