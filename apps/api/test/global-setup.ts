import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Applies migrations to the test database once before integration tests run. */
export default function setup() {
  for (const file of ['.env.test', '.env']) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn('\n[tests] TEST_DATABASE_URL not set — database integration tests will be skipped.\n');
    return;
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
