import type { Prisma, PrismaClient } from '@prisma/client';
import {
  normalizeUrl,
  urlFingerprint,
  type ExtractionDTO,
  type ExtractionResultDTO,
  type JobDTO,
  type JobInput,
} from '@jobs/shared';
import type { Env } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';
import type { AuditService } from '../audit/audit.service';
import type { Actor, JobsService } from '../jobs/jobs.service';
import type { ExtractionQueue } from './queue';
import { assertSafeUrl, SsrfError, type SsrfOptions } from './ssrf';

type ExtractionRow = Prisma.ExtractionGetPayload<{ include: { submittedBy: { select: { id: true; name: true } } } }>;

export function toExtractionDTO(e: ExtractionRow): ExtractionDTO {
  return {
    id: e.id,
    sourceUrl: e.sourceUrl,
    status: e.status,
    fetchMethod: e.fetchMethod,
    httpStatus: e.httpStatus,
    pageTitle: e.pageTitle,
    error: e.error,
    attempts: e.attempts,
    jobId: e.jobId,
    result: (e.result as unknown as ExtractionResultDTO) ?? null,
    submittedBy: e.submittedBy ? { id: e.submittedBy.id, name: e.submittedBy.name } : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
  };
}

const include = { submittedBy: { select: { id: true, name: true } } } as const;

export class ExtractionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
    private readonly queue: ExtractionQueue,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly resolveHost?: SsrfOptions['resolve'],
  ) {}

  async submit(rawUrl: string, actor: Actor, opts: { forceBrowser?: boolean } = {}) {
    let url: string;
    try {
      url = normalizeUrl(rawUrl);
      await assertSafeUrl(url, { allowLoopback: this.env.ALLOW_LOOPBACK_FETCH, resolve: this.resolveHost });
    } catch (err) {
      throw badRequest(err instanceof SsrfError ? err.message : 'Invalid URL');
    }
    const key = urlFingerprint(url)!;
    const existingJob = await this.prisma.job.findFirst({
      where: { sourceUrlKey: key },
      select: { id: true, title: true, status: true },
    });
    const extraction = await this.prisma.extraction.create({
      data: { sourceUrl: url, sourceUrlKey: key, submittedById: actor.id, forceBrowser: !!opts.forceBrowser },
      include,
    });
    await this.audit.log(actor.id, 'EXTRACTION_SUBMIT', 'Extraction', extraction.id, { url });
    await this.queue.enqueue(extraction.id);
    return { extraction: toExtractionDTO(extraction), existingJob };
  }

  async list(params: { page: number; pageSize: number; status?: string }) {
    const where: Prisma.ExtractionWhereInput = params.status ? { status: params.status as never } : {};
    const [total, rows] = await Promise.all([
      this.prisma.extraction.count({ where }),
      this.prisma.extraction.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => ({ ...toExtractionDTO(r), result: null })),
      meta: { page: params.page, pageSize: params.pageSize, total, totalPages: Math.max(1, Math.ceil(total / params.pageSize)) },
    };
  }

  async get(id: string): Promise<ExtractionDTO> {
    const row = await this.prisma.extraction.findUnique({ where: { id }, include });
    if (!row) throw notFound('Extraction');
    return toExtractionDTO(row);
  }

  async retry(id: string, actor: Actor, opts: { forceBrowser?: boolean } = {}): Promise<ExtractionDTO> {
    const row = await this.prisma.extraction.findUnique({ where: { id } });
    if (!row) throw notFound('Extraction');
    if (row.status === 'PUBLISHED') throw badRequest('This extraction has already been published');
    if (['QUEUED', 'FETCHING', 'EXTRACTING'].includes(row.status)) throw badRequest('This extraction is already in progress');
    await this.prisma.extraction.update({
      where: { id },
      data: { status: 'QUEUED', error: null, forceBrowser: opts.forceBrowser ?? row.forceBrowser },
    });
    await this.audit.log(actor.id, 'EXTRACTION_SUBMIT', 'Extraction', id, { retry: true });
    await this.queue.enqueue(id);
    return this.get(id);
  }

  async discard(id: string, actor: Actor): Promise<ExtractionDTO> {
    const row = await this.prisma.extraction.findUnique({ where: { id } });
    if (!row) throw notFound('Extraction');
    if (row.status === 'PUBLISHED') throw badRequest('Published extractions cannot be discarded');
    await this.prisma.extraction.update({ where: { id }, data: { status: 'DISCARDED' } });
    await this.audit.log(actor.id, 'EXTRACTION_DISCARD', 'Extraction', id);
    return this.get(id);
  }

  /**
   * Saves the reviewed draft through the shared publishing pipeline. When
   * `updateJobId` is set the existing (duplicate) listing is updated instead.
   */
  async publish(id: string, input: JobInput, actor: Actor, opts: { updateJobId?: string } = {}): Promise<JobDTO> {
    const row = await this.prisma.extraction.findUnique({ where: { id } });
    if (!row) throw notFound('Extraction');
    if (row.status !== 'READY') throw badRequest(`Extraction is ${row.status.toLowerCase()} — only ready extractions can be published`);
    const payload: JobInput = { ...input, sourceUrl: input.sourceUrl ?? row.sourceUrl };
    const job = opts.updateJobId
      ? await this.jobs.update(opts.updateJobId, payload, actor)
      : await this.jobs.create(payload, actor, { sourceType: 'URL', contentHash: row.contentHash });
    await this.prisma.extraction.update({ where: { id }, data: { status: 'PUBLISHED', jobId: job.id } });
    return job;
  }

  /** Re-queues extractions that were interrupted (e.g. by a restart) — in-process mode only. */
  async requeueStale(): Promise<number> {
    const stale = await this.prisma.extraction.findMany({
      where: { status: { in: ['QUEUED', 'FETCHING', 'EXTRACTING'] } },
      select: { id: true },
    });
    for (const s of stale) await this.queue.enqueue(s.id);
    return stale.length;
  }
}
