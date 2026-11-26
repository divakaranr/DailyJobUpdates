import type { PrismaClient } from '@prisma/client';
import {
  DUPLICATE_THRESHOLD,
  POSSIBLE_DUPLICATE_THRESHOLD,
  normalizeCompany,
  normalizeTitle,
  scoreDuplicate,
  urlFingerprint,
  type DuplicateCandidateDTO,
  type DuplicateComparable,
} from '@jobs/shared';

export class DuplicatesService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds existing jobs that may describe the same posting. Candidates are
   * pre-selected by URL keys, company and normalised title, then scored with
   * fuzzy similarity.
   */
  async findCandidates(input: DuplicateComparable, opts: { excludeJobId?: string; limit?: number } = {}): Promise<DuplicateCandidateDTO[]> {
    const sourceKey = urlFingerprint(input.sourceUrl);
    const appKey = urlFingerprint(input.applicationUrl);
    const companyKey = normalizeCompany(input.companyName || '');
    const titleKey = normalizeTitle(input.title || '');
    const firstWord = titleKey.split(' ').find((w) => w.length > 2);

    const or: object[] = [];
    if (sourceKey) or.push({ sourceUrlKey: sourceKey });
    if (appKey) or.push({ applicationUrlKey: appKey });
    if (companyKey) or.push({ company: { normalizedName: companyKey } });
    if (titleKey) or.push({ normalizedTitle: titleKey });
    if (firstWord && companyKey) {
      or.push({ AND: [{ normalizedTitle: { contains: firstWord } }, { company: { normalizedName: { contains: companyKey.split(' ')[0] } } }] });
    }
    if (or.length === 0) return [];

    const jobs = await this.prisma.job.findMany({
      where: { OR: or, ...(opts.excludeJobId ? { id: { not: opts.excludeJobId } } : {}) },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return jobs
      .map((j) => {
        const s = scoreDuplicate(input, {
          title: j.title,
          companyName: j.company.name,
          location: j.location,
          sourceUrl: j.sourceUrl,
          applicationUrl: j.applicationUrl,
        });
        return {
          jobId: j.id,
          title: j.title,
          companyName: j.company.name,
          location: j.location,
          status: j.status,
          publishedAt: j.publishedAt?.toISOString() ?? null,
          score: s.score,
          reasons: s.reasons,
          isLikelyDuplicate: s.score >= DUPLICATE_THRESHOLD,
        };
      })
      .filter((c) => c.score >= POSSIBLE_DUPLICATE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 5);
  }

  /** Pairs of likely-duplicate live jobs, for the admin dashboard. */
  async recentPairs(days = 60, limit = 10) {
    const since = new Date(Date.now() - days * 86_400_000);
    const jobs = await this.prisma.job.findMany({
      where: { createdAt: { gte: since }, status: { in: ['PUBLISHED', 'PENDING_APPROVAL', 'SCHEDULED', 'DRAFT'] } },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const byCompany = new Map<string, typeof jobs>();
    for (const j of jobs) {
      const list = byCompany.get(j.company.normalizedName) ?? [];
      list.push(j);
      byCompany.set(j.company.normalizedName, list);
    }
    const pairs: { a: { id: string; title: string; company: string }; b: { id: string; title: string; company: string }; score: number }[] = [];
    for (const list of byCompany.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          const a = list[i];
          const b = list[k];
          const s = scoreDuplicate(
            { title: a.title, companyName: a.company.name, location: a.location, sourceUrl: a.sourceUrl, applicationUrl: a.applicationUrl },
            { title: b.title, companyName: b.company.name, location: b.location, sourceUrl: b.sourceUrl, applicationUrl: b.applicationUrl },
          );
          if (s.score >= DUPLICATE_THRESHOLD) {
            pairs.push({
              a: { id: a.id, title: a.title, company: a.company.name },
              b: { id: b.id, title: b.title, company: b.company.name },
              score: s.score,
            });
          }
        }
      }
    }
    return pairs.sort((x, y) => y.score - x.score).slice(0, limit);
  }
}
