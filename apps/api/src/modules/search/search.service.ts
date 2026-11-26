import { Prisma, type PrismaClient } from '@prisma/client';
import type { JobDTO, JobQuery, Paginated } from '@jobs/shared';
import { jobInclude, toJobDTO } from '../jobs/jobs.mapper';

/**
 * Search abstraction. The default implementation uses PostgreSQL full-text
 * search; an Elasticsearch/OpenSearch provider can implement the same contract.
 */
export interface SearchProvider {
  search(query: JobQuery, opts?: { userId?: string }): Promise<Paginated<JobDTO>>;
  reindex(jobId: string, tx?: Prisma.TransactionClient): Promise<void>;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Builds a prefix-matching tsquery ("java dev" → "java:* & dev:*"). */
export function buildTsQuery(q: string): string | null {
  const tokens = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(' & ');
}

export function buildJobWhere(query: JobQuery): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [];
  if (query.status === 'active') and.push({ status: 'PUBLISHED' });
  else if (query.status === 'expired') and.push({ status: 'EXPIRED' });
  else and.push({ status: { in: ['PUBLISHED', 'EXPIRED'] } });

  if (query.workMode.length) and.push({ workMode: { in: query.workMode } });
  if (query.employmentType.length) and.push({ employmentType: { in: query.employmentType } });
  if (query.experience === 'freshers') and.push({ OR: [{ isFresherFriendly: true }, { minExperience: 0 }] });
  if (query.experience === 'experienced') and.push({ minExperience: { gte: 1 } });

  const tagFilter = (category: Prisma.EnumTagCategoryFilter['equals'], slugs: string[]) => {
    if (slugs.length) and.push({ tags: { some: { tag: { category, slug: { in: slugs } } } } });
  };
  tagFilter('EXPERIENCE', query.experienceLevel);
  tagFilter('JOB_CATEGORY', query.category);
  tagFilter('SKILL', query.skills);
  tagFilter('QUALIFICATION', query.qualification);
  if (query.tags.length) and.push({ tags: { some: { tag: { slug: { in: query.tags } } } } });

  if (query.location) and.push({ location: { contains: query.location, mode: 'insensitive' } });
  if (query.company) and.push({ company: { name: { contains: query.company, mode: 'insensitive' } } });
  if (query.postedWithin) and.push({ publishedAt: { gte: new Date(Date.now() - query.postedWithin * 86_400_000) } });
  return { AND: and };
}

export class PostgresSearchProvider implements SearchProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async reindex(jobId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.$executeRaw`
      UPDATE "Job" SET "searchVector" =
        setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("searchText", '')), 'B') ||
        setweight(to_tsvector('simple', left(coalesce("summary", '') || ' ' || coalesce("description", ''), 50000)), 'C')
      WHERE "id" = ${jobId}`;
  }

  /** Returns matching job ids with a relevance rank for a keyword query. */
  private async rankedIds(q: string): Promise<Map<string, number>> {
    const tsq = buildTsQuery(q);
    const like = `%${escapeLike(q)}%`;
    const rows = tsq
      ? await this.prisma.$queryRaw<{ id: string; rank: number }[]>`
          SELECT "id",
            (ts_rank("searchVector", to_tsquery('simple', ${tsq}))
              + CASE WHEN "title" ILIKE ${like} THEN 0.5 ELSE 0 END)::float AS rank
          FROM "Job"
          WHERE "status" IN ('PUBLISHED', 'EXPIRED')
            AND ("searchVector" @@ to_tsquery('simple', ${tsq}) OR "title" ILIKE ${like} OR "searchText" ILIKE ${like})
          LIMIT 5000`
      : await this.prisma.$queryRaw<{ id: string; rank: number }[]>`
          SELECT "id", (CASE WHEN "title" ILIKE ${like} THEN 1 ELSE 0.5 END)::float AS rank
          FROM "Job"
          WHERE "status" IN ('PUBLISHED', 'EXPIRED') AND ("title" ILIKE ${like} OR "searchText" ILIKE ${like})
          LIMIT 5000`;
    return new Map(rows.map((r) => [r.id, Number(r.rank)]));
  }

  async search(query: JobQuery, opts: { userId?: string } = {}): Promise<Paginated<JobDTO>> {
    const where = buildJobWhere(query);
    const skip = (query.page - 1) * query.pageSize;
    const q = query.q?.trim();

    let ids: string[] | null = null;
    let total: number;
    if (q) {
      const ranks = await this.rankedIds(q);
      (where.AND as Prisma.JobWhereInput[]).push({ id: { in: [...ranks.keys()] } });
      if (query.sort === 'relevance') {
        const matching = await this.prisma.job.findMany({ where, select: { id: true, publishedAt: true } });
        matching.sort(
          (a, b) => (ranks.get(b.id) ?? 0) - (ranks.get(a.id) ?? 0) || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
        );
        total = matching.length;
        ids = matching.slice(skip, skip + query.pageSize).map((m) => m.id);
      } else {
        total = await this.prisma.job.count({ where });
      }
    } else {
      total = await this.prisma.job.count({ where });
    }

    const order: Prisma.SortOrder = query.sort === 'oldest' ? 'asc' : 'desc';
    const jobs = ids
      ? await this.prisma.job.findMany({ where: { id: { in: ids } }, include: jobInclude })
      : await this.prisma.job.findMany({
          where,
          include: jobInclude,
          orderBy: [{ publishedAt: order }, { createdAt: order }, { id: order }],
          skip,
          take: query.pageSize,
        });
    if (ids) jobs.sort((a, b) => ids!.indexOf(a.id) - ids!.indexOf(b.id));

    let bookmarked = new Set<string>();
    if (opts.userId && jobs.length) {
      const rows = await this.prisma.bookmark.findMany({
        where: { userId: opts.userId, jobId: { in: jobs.map((j) => j.id) } },
        select: { jobId: true },
      });
      bookmarked = new Set(rows.map((r) => r.jobId));
    }

    return {
      data: jobs.map((j) => toJobDTO(j, { full: false, bookmarked: opts.userId ? bookmarked.has(j.id) : undefined })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  }
}
