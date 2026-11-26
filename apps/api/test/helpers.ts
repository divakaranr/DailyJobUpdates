import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_TAXONOMY, type Role } from '@jobs/shared';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createContainer, type ContainerOverrides } from '../src/container';
import type { BrowserRenderer } from '../src/modules/extraction/browser';
import type { FetchResult, PageFetcher } from '../src/modules/extraction/fetcher';
import { InProcessQueue } from '../src/modules/extraction/queue';
import { ExtractionError } from '../src/lib/errors';

export const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;

/** In-memory fetcher: maps URLs to HTML bodies (or HTTP status codes). */
export class FakeFetcher implements PageFetcher {
  calls: string[] = [];
  constructor(public pages: Record<string, string | number> = {}) {}
  async fetchPage(url: string, opts: { allowErrorStatus?: boolean } = {}): Promise<FetchResult> {
    this.calls.push(url);
    const page = this.pages[url];
    if (page === undefined) throw new ExtractionError(`Could not reach the page: ENOTFOUND ${url}`, true);
    if (typeof page === 'number') {
      if (!opts.allowErrorStatus) throw new ExtractionError(`The page returned HTTP ${page}`);
      return { url, status: page, contentType: 'text/html', body: '', redirects: [] };
    }
    return { url, status: 200, contentType: 'text/html; charset=utf-8', body: page, redirects: [] };
  }
  async assertRobotsAllowed(): Promise<void> {}
}

export class FakeBrowser implements BrowserRenderer {
  constructor(public html: string | null = null) {}
  async render(url: string) {
    if (!this.html) throw new Error('Browser unavailable in tests');
    return { html: this.html, finalUrl: url, status: 200 };
  }
  async close() {}
}

export function testEnv(extra: Record<string, string> = {}) {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB_URL ?? 'postgresql://invalid',
    LOG_LEVEL: 'silent',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    ENABLE_BROWSER_RENDERING: 'true',
    FETCH_HOST_INTERVAL_MS: '0',
    LLM_PROVIDER: 'heuristic',
    AUTH_RATE_LIMIT_PER_MIN: '100000',
    ...extra,
  });
}

export async function resetDatabase(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Bookmark","JobTag","JobSkill","JobSource","ExtractionLog","Extraction","Job","Company","Skill","Tag","AuditLog","Setting","User" RESTART IDENTITY CASCADE',
  );
  for (const t of DEFAULT_TAXONOMY) {
    await prisma.tag.create({ data: { name: t.name, slug: t.slug, category: t.category, synonyms: t.synonyms, isSystem: true } });
  }
}

export async function createUser(prisma: PrismaClient, role: Role, email = `${role.toLowerCase()}@test.local`) {
  return prisma.user.create({
    data: { name: `${role} User`, email, role, passwordHash: await bcrypt.hash('Password123', 4) },
  });
}

export async function createTestApp(overrides: ContainerOverrides = {}) {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  const queue = new InProcessQueue(1);
  const container = createContainer(testEnv(), prisma, {
    queue,
    fetcher: new FakeFetcher(),
    browser: new FakeBrowser(),
    // Fixture hosts (*.example) do not resolve; pretend they map to a public IP.
    resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    ...overrides,
  });
  container.queue.startWorker((id) => container.pipeline.run(id));
  const app = await buildApp(container, { logger: false });
  await app.ready();

  const cookies = new Map<string, string>();
  async function login(email: string, password = 'Password123') {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'fetch' },
      payload: { email, password },
    });
    const cookie = res.cookies.find((c) => c.name === 'jp_session');
    if (!cookie) throw new Error(`login failed: ${res.body}`);
    cookies.set(email, `jp_session=${cookie.value}`);
    return `jp_session=${cookie.value}`;
  }

  function req(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, opts: { as?: string; body?: unknown } = {}) {
    return app.inject({
      method,
      url,
      headers: { 'x-requested-with': 'fetch', ...(opts.as ? { cookie: cookies.get(opts.as)! } : {}) },
      payload: opts.body as object | undefined,
    });
  }

  return { app, prisma, container, queue, login, req };
}
