import type { PrismaClient } from '@prisma/client';
import type { Env } from './config/env';
import { DashboardService } from './modules/admin/dashboard.service';
import { AuditService } from './modules/audit/audit.service';
import { AuthService, UsersService } from './modules/auth/auth.service';
import { DuplicatesService } from './modules/duplicates/duplicates.service';
import { MaintenanceService } from './modules/expiry/maintenance.service';
import { VerifyService } from './modules/expiry/verify.service';
import { PlaywrightRenderer, type BrowserRenderer } from './modules/extraction/browser';
import { ExtractionService } from './modules/extraction/extraction.service';
import { SafeFetcher, type PageFetcher } from './modules/extraction/fetcher';
import type { SsrfOptions } from './modules/extraction/ssrf';
import { ExtractionPipeline } from './modules/extraction/pipeline';
import { BullMqQueue, InProcessQueue, type ExtractionQueue } from './modules/extraction/queue';
import { JobsService } from './modules/jobs/jobs.service';
import { LlmService } from './modules/llm/llm.service';
import { createProviders } from './modules/llm/providers';
import type { LlmProvider } from './modules/llm/types';
import { PostgresSearchProvider, type SearchProvider } from './modules/search/search.service';
import { SettingsService } from './modules/settings/settings.service';
import { TagsService } from './modules/tags/tags.service';
import type { LlmProviderName } from '@jobs/shared';

export interface ContainerOverrides {
  fetcher?: PageFetcher;
  browser?: BrowserRenderer;
  queue?: ExtractionQueue;
  llmProviders?: Partial<Record<LlmProviderName, LlmProvider>>;
  search?: SearchProvider;
  /** DNS resolver used for submit-time SSRF validation (tests stub this). */
  resolveHost?: SsrfOptions['resolve'];
}

/** Wires services together (manual dependency injection). Tests pass overrides. */
export function createContainer(env: Env, prisma: PrismaClient, overrides: ContainerOverrides = {}) {
  const settings = new SettingsService(prisma, env);
  const audit = new AuditService(prisma);
  const tags = new TagsService(prisma, audit);
  const duplicates = new DuplicatesService(prisma);
  const search = overrides.search ?? new PostgresSearchProvider(prisma);
  const jobs = new JobsService(prisma, tags, duplicates, settings, audit, search);
  const auth = new AuthService(prisma, audit);
  const users = new UsersService(prisma, auth, audit);
  const fetcher = overrides.fetcher ?? new SafeFetcher(env);
  const browser = overrides.browser ?? new PlaywrightRenderer(env);
  const queue =
    overrides.queue ?? (env.REDIS_URL ? new BullMqQueue(env.REDIS_URL, env.EXTRACTION_CONCURRENCY) : new InProcessQueue(env.EXTRACTION_CONCURRENCY));
  const llm = new LlmService(overrides.llmProviders ?? createProviders(env), settings, async (entry) => {
    await prisma.extractionLog.create({
      data: {
        extractionId: entry.extractionId ?? null,
        sourceUrl: entry.sourceUrl,
        stage: entry.stage,
        status: entry.status,
        provider: entry.provider,
        model: entry.model,
        promptVersion: entry.promptVersion,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        totalTokens: entry.promptTokens + entry.completionTokens,
        estimatedCost: entry.estimatedCost,
        durationMs: entry.durationMs,
        errorMessage: entry.errorMessage?.slice(0, 2000) ?? null,
      },
    });
  });
  const pipeline = new ExtractionPipeline(prisma, env, fetcher, browser, llm, tags, duplicates, settings);
  const extraction = new ExtractionService(prisma, env, queue, jobs, audit, overrides.resolveHost);
  const maintenance = new MaintenanceService(prisma, settings, audit);
  const verify = new VerifyService(prisma, fetcher, settings, audit);
  const dashboard = new DashboardService(prisma, duplicates);

  return {
    env,
    prisma,
    settings,
    audit,
    tags,
    duplicates,
    search,
    jobs,
    auth,
    users,
    fetcher,
    browser,
    queue,
    llm,
    pipeline,
    extraction,
    maintenance,
    verify,
    dashboard,
    async close() {
      await queue.close();
      await browser.close();
      if (fetcher instanceof SafeFetcher) await fetcher.close();
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
