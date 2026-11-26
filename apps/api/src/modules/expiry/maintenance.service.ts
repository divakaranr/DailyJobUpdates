import type { PrismaClient } from '@prisma/client';
import { addDays, todayYmd, ymdToDate } from '@jobs/shared';
import type { AuditService } from '../audit/audit.service';
import type { SettingsService } from '../settings/settings.service';

export interface MaintenanceReport {
  published: number;
  expiredByDeadline: number;
  expiredByWalkIn: number;
  expiredByRule: number;
  backfilledExpiry: number;
}

/**
 * Periodic job lifecycle maintenance:
 *  - publishes scheduled jobs whose time has come;
 *  - expires jobs past their deadline / walk-in date / default expiry window.
 * Expired jobs are retained (never deleted) for history.
 */
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async run(now: Date = new Date()): Promise<MaintenanceReport> {
    const general = await this.settings.getGeneral();
    const today = ymdToDate(todayYmd(now));

    const due = await this.prisma.job.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, select: { id: true, scheduledAt: true, expiresAt: true } });
    for (const job of due) {
      const publishedAt = job.scheduledAt ?? now;
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'PUBLISHED', publishedAt, scheduledAt: null, expiresAt: job.expiresAt ?? addDays(publishedAt, general.defaultExpiryDays) },
      });
      await this.audit.log(null, 'JOB_AUTO_PUBLISH', 'Job', job.id, { scheduledAt: job.scheduledAt });
    }

    const expire = async (where: object, reason: string) => {
      const jobs = await this.prisma.job.findMany({ where: { status: 'PUBLISHED', ...where }, select: { id: true } });
      if (jobs.length === 0) return 0;
      await this.prisma.job.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: { status: 'EXPIRED', expiredAt: now, expiryReason: reason },
      });
      await this.prisma.auditLog.createMany({
        data: jobs.map((j) => ({ action: 'JOB_AUTO_EXPIRE', entityType: 'Job', entityId: j.id, details: { reason } })),
      });
      return jobs.length;
    };

    const expiredByDeadline = await expire({ deadline: { lt: today } }, 'DEADLINE_PASSED');
    const expiredByWalkIn = await expire({ deadline: null, walkInDate: { lt: today } }, 'WALKIN_DATE_PASSED');
    const expiredByRule = await expire({ expiresAt: { lte: now } }, 'AUTO_EXPIRY_RULE');

    // Older rows without an expiry get one from the default rule (never "active forever").
    const missing = await this.prisma.job.findMany({ where: { status: 'PUBLISHED', expiresAt: null }, select: { id: true, publishedAt: true } });
    for (const job of missing) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: { expiresAt: addDays(job.publishedAt ?? now, general.defaultExpiryDays) },
      });
    }

    return { published: due.length, expiredByDeadline, expiredByWalkIn, expiredByRule, backfilledExpiry: missing.length };
  }
}
