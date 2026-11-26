import type { PrismaClient } from '@prisma/client';
import { JOB_STATUSES, type DashboardDTO, type JobStatus } from '@jobs/shared';
import type { DuplicatesService } from '../duplicates/duplicates.service';

export class DashboardService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly duplicates: DuplicatesService,
  ) {}

  async get(): Promise<DashboardDTO> {
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const since14 = new Date(Date.now() - 13 * 86_400_000);
    since14.setUTCHours(0, 0, 0, 0);

    const [byStatus, extractionGroups, usage, usageFailures, recent, pending, publishedRows, possibleDuplicates, bookmarks, users] = await Promise.all([
      this.prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.extraction.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.extractionLog.aggregate({
        where: { stage: 'LLM', createdAt: { gte: since30 } },
        _count: { _all: true },
        _sum: { totalTokens: true, promptTokens: true, completionTokens: true, estimatedCost: true },
      }),
      this.prisma.extractionLog.count({ where: { status: 'FAILURE', createdAt: { gte: since30 } } }),
      this.prisma.extraction.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.job.findMany({ where: { status: 'PENDING_APPROVAL' }, include: { company: true }, orderBy: { createdAt: 'asc' }, take: 8 }),
      this.prisma.job.findMany({ where: { publishedAt: { gte: since14 } }, select: { publishedAt: true } }),
      this.duplicates.recentPairs(),
      this.prisma.bookmark.count(),
      this.prisma.user.count(),
    ]);

    const jobs = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
    for (const g of byStatus) jobs[g.status] = g._count._all;
    const ex = Object.fromEntries(extractionGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;

    const perDay = new Map<string, number>();
    for (let i = 0; i < 14; i++) perDay.set(new Date(since14.getTime() + i * 86_400_000).toISOString().slice(0, 10), 0);
    for (const r of publishedRows) {
      const k = r.publishedAt!.toISOString().slice(0, 10);
      if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }

    return {
      jobs: { ...jobs, total: Object.values(jobs).reduce((a, b) => a + b, 0) },
      extractions: {
        total: Object.values(ex).reduce((a, b) => a + b, 0),
        ready: ex.READY ?? 0,
        failed: ex.FAILED ?? 0,
        published: ex.PUBLISHED ?? 0,
        inProgress: (ex.QUEUED ?? 0) + (ex.FETCHING ?? 0) + (ex.EXTRACTING ?? 0),
      },
      llmUsage30d: {
        requests: usage._count._all,
        tokens: (usage._sum.promptTokens ?? 0) + (usage._sum.completionTokens ?? 0),
        cost: Math.round((usage._sum.estimatedCost ?? 0) * 10_000) / 10_000,
        failures: usageFailures,
      },
      publishedPerDay: [...perDay.entries()].map(([date, count]) => ({ date, count })),
      recentExtractions: recent.map((r) => ({ id: r.id, sourceUrl: r.sourceUrl, status: r.status, pageTitle: r.pageTitle, createdAt: r.createdAt.toISOString(), error: r.error })),
      pendingJobs: pending.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        createdAt: j.createdAt.toISOString(),
        company: { id: j.company.id, name: j.company.name, website: j.company.website, logoUrl: j.company.logoUrl },
      })),
      possibleDuplicates,
      bookmarks,
      users,
    };
  }
}
