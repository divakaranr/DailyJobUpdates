import type { PrismaClient } from '@prisma/client';
import { errorMessage, notFound, badRequest } from '../../lib/errors';
import type { AuditService } from '../audit/audit.service';
import type { PageFetcher } from '../extraction/fetcher';
import { parseHtml } from '../extraction/html';
import type { SettingsService } from '../settings/settings.service';

export type VerifyStatus = 'ACTIVE' | 'LIKELY_CLOSED' | 'UNREACHABLE';

export interface VerifyResult {
  status: VerifyStatus;
  httpStatus: number | null;
  note: string;
  checkedAt: string;
}

const CLOSED_PHRASES = [
  /no longer accepting applications/i,
  /(job|position|posting|vacancy) (has been|is) (closed|filled|expired)/i,
  /this (job|position|posting) (has )?expired/i,
  /no longer (available|active|open)/i,
  /applications? (are|is) (now )?closed/i,
  /position (has been )?filled/i,
];

/** Re-checks a job's original source page to see whether it is still live. */
export class VerifyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fetcher: PageFetcher,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async verify(jobId: string, actorId: string): Promise<VerifyResult> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { sources: { orderBy: { extractionTimestamp: 'desc' }, take: 1 } } });
    if (!job) throw notFound('Job');
    const url = job.sourceUrl ?? job.applicationUrl;
    if (!url) throw badRequest('This job has no source URL to verify');
    const general = await this.settings.getGeneral();

    let result: VerifyResult;
    try {
      const res = await this.fetcher.fetchPage(url, { checkRobots: general.respectRobotsTxt, allowErrorStatus: true });
      if (res.status === 404 || res.status === 410) {
        result = { status: 'LIKELY_CLOSED', httpStatus: res.status, note: `Source returned HTTP ${res.status}`, checkedAt: new Date().toISOString() };
      } else if (res.status >= 400) {
        result = { status: 'UNREACHABLE', httpStatus: res.status, note: `Source returned HTTP ${res.status}`, checkedAt: new Date().toISOString() };
      } else {
        const page = parseHtml(res.body, res.url);
        const phrase = CLOSED_PHRASES.find((re) => re.test(page.text));
        const ldValid = (page.jsonLd as Record<string, unknown> | null)?.validThrough;
        const ldExpired = typeof ldValid === 'string' && new Date(ldValid).getTime() < Date.now();
        if (phrase || ldExpired) {
          result = {
            status: 'LIKELY_CLOSED',
            httpStatus: res.status,
            note: phrase ? `Page says: "${page.text.match(phrase)?.[0]}"` : `Page metadata validThrough ${ldValid} has passed`,
            checkedAt: new Date().toISOString(),
          };
        } else {
          result = { status: 'ACTIVE', httpStatus: res.status, note: 'Page is reachable and shows no closure notice', checkedAt: new Date().toISOString() };
        }
      }
    } catch (err) {
      result = { status: 'UNREACHABLE', httpStatus: null, note: errorMessage(err), checkedAt: new Date().toISOString() };
    }

    const source = job.sources[0];
    if (source) {
      await this.prisma.jobSource.update({
        where: { id: source.id },
        data: { lastVerifiedAt: new Date(result.checkedAt), lastVerifyStatus: result.status, lastVerifyNote: result.note.slice(0, 500) },
      });
    } else {
      await this.prisma.jobSource.create({
        data: { jobId, sourceUrl: url, lastVerifiedAt: new Date(result.checkedAt), lastVerifyStatus: result.status, lastVerifyNote: result.note.slice(0, 500) },
      });
    }
    await this.audit.log(actorId, 'JOB_VERIFY', 'Job', jobId, { ...result });
    return result;
  }
}
