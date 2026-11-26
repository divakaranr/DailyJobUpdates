import type { JobStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  EMPLOYMENT_TYPE_LABELS,
  WORK_MODE_LABELS,
  addDays,
  assignTags,
  dedupeSkills,
  endOfDayUtc,
  formatJobPost,
  hasRole,
  hostnameOf,
  isPastDate,
  normalizeCompany,
  normalizeKey,
  normalizeTitle,
  urlFingerprint,
  ymdToDate,
  type ExtractionFlag,
  type GeneralSettings,
  type JobDTO,
  type JobInput,
  type JobPreviewDTO,
  type Role,
  type TagAssignment,
} from '@jobs/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { AuditAction, AuditService } from '../audit/audit.service';
import type { DuplicatesService } from '../duplicates/duplicates.service';
import type { SearchProvider } from '../search/search.service';
import type { SettingsService } from '../settings/settings.service';
import type { TagsService } from '../tags/tags.service';
import { jobInclude, toJobDTO } from './jobs.mapper';

export interface Actor {
  id: string;
  role: Role;
}

export interface SaveContext {
  sourceType?: 'MANUAL' | 'URL';
  contentHash?: string | null;
}

export type JobTransition = 'approve' | 'reject' | 'publish' | 'expire' | 'archive' | 'restore';

const PUBLIC_STATUSES: JobStatus[] = ['PUBLISHED', 'EXPIRED'];

export class JobsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tags: TagsService,
    private readonly duplicates: DuplicatesService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly search: SearchProvider,
  ) {}

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private canPublish(role: Role, general: GeneralSettings) {
    return hasRole(role, 'ADMIN') || (hasRole(role, 'EDITOR') && !general.requireApprovalForEditors);
  }

  private computeExpiresAt(input: Pick<JobInput, 'deadline' | 'walkInDate'>, base: Date, general: GeneralSettings): Date {
    if (input.deadline) return endOfDayUtc(input.deadline);
    if (input.walkInDate) return endOfDayUtc(input.walkInDate);
    return addDays(base, general.defaultExpiryDays);
  }

  private async resolveTags(input: JobInput): Promise<{ assignments: TagAssignment[]; tagRows: { tagId: string; source: 'AUTO' | 'MANUAL' }[] }> {
    const taxonomy = await this.tags.taxonomy();
    const auto = assignTags(
      {
        title: input.title,
        skills: input.skills,
        preferredSkills: input.preferredSkills,
        qualification: input.qualification,
        workMode: input.workMode,
        employmentType: input.employmentType,
        minExperience: input.minExperience,
        maxExperience: input.maxExperience,
        isFresherFriendly: input.isFresherFriendly,
      },
      taxonomy,
    );
    const autoIds = new Set(auto.map((a) => a.id).filter(Boolean) as string[]);
    const wanted = new Set(input.tagIds);
    if (input.autoTag || input.tagIds.length === 0) for (const id of autoIds) wanted.add(id);
    const existing = await this.prisma.tag.findMany({ where: { id: { in: [...wanted] } }, select: { id: true } });
    return {
      assignments: auto,
      tagRows: existing.map((t) => ({ tagId: t.id, source: autoIds.has(t.id) ? 'AUTO' : 'MANUAL' })),
    };
  }

  private buildSearchText(input: JobInput, tagNames: string[]): string {
    return [
      input.companyName,
      input.location,
      input.qualification,
      input.experienceText,
      input.industry,
      input.workMode ? WORK_MODE_LABELS[input.workMode] : null,
      input.employmentType ? EMPLOYMENT_TYPE_LABELS[input.employmentType] : null,
      ...input.skills,
      ...input.preferredSkills,
      ...tagNames,
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 5000);
  }

  private async upsertCompany(tx: Prisma.TransactionClient, input: JobInput) {
    const normalizedName = normalizeCompany(input.companyName) || normalizeKey(input.companyName) || input.companyName.toLowerCase();
    return tx.company.upsert({
      where: { normalizedName },
      create: { name: input.companyName, normalizedName, website: input.companyWebsite ?? null, logoUrl: input.companyLogoUrl ?? null },
      update: {
        ...(input.companyWebsite ? { website: input.companyWebsite } : {}),
        ...(input.companyLogoUrl ? { logoUrl: input.companyLogoUrl } : {}),
      },
    });
  }

  private async upsertSkills(tx: Prisma.TransactionClient, input: JobInput) {
    const required = dedupeSkills(input.skills);
    const requiredKeys = new Set(required.map(normalizeKey));
    const preferred = dedupeSkills(input.preferredSkills).filter((s) => !requiredKeys.has(normalizeKey(s)));
    const rows: { skillId: string; isPreferred: boolean }[] = [];
    for (const [list, isPreferred] of [
      [required, false],
      [preferred, true],
    ] as const) {
      for (const name of list) {
        const normalizedName = normalizeKey(name);
        if (!normalizedName) continue;
        const skill = await tx.skill.upsert({ where: { normalizedName }, create: { name, normalizedName }, update: {} });
        rows.push({ skillId: skill.id, isPreferred });
      }
    }
    return { rows, required, preferred };
  }

  private async renderPost(input: JobInput, tagIds: string[]): Promise<string> {
    const general = await this.settings.getGeneral();
    const tags = tagIds.length ? await this.prisma.tag.findMany({ where: { id: { in: tagIds } } }) : [];
    return formatJobPost(
      { ...input, currency: input.currency ?? null, tags: tags.map((t) => ({ name: t.name, category: t.category })) },
      {
        showUnavailable: general.showUnavailableFields,
        notSpecifiedText: general.notSpecifiedText,
        includeHashtags: true,
        includeSource: general.includeSourceAttribution,
      },
    );
  }

  private warningsFor(input: JobInput): ExtractionFlag[] {
    const w: ExtractionFlag[] = [];
    if (input.deadline && isPastDate(input.deadline)) w.push({ level: 'error', field: 'deadline', message: 'The application deadline has already passed.' });
    if (input.walkInDate && isPastDate(input.walkInDate)) w.push({ level: 'warning', field: 'walkInDate', message: 'The walk-in date has already passed.' });
    if (!input.applicationUrl && !input.sourceUrl) w.push({ level: 'warning', field: 'applicationUrl', message: 'No application link — candidates will not know how to apply.' });
    if (input.skills.length === 0) w.push({ level: 'info', field: 'skills', message: 'No skills listed.' });
    return w;
  }

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  async preview(input: JobInput, opts: { excludeJobId?: string } = {}): Promise<JobPreviewDTO> {
    const { assignments, tagRows } = await this.resolveTags(input);
    const tagIds = input.tagIds.length && !input.autoTag ? input.tagIds : tagRows.map((t) => t.tagId);
    const [post, duplicates] = await Promise.all([
      this.renderPost(input, tagIds),
      this.duplicates.findCandidates(
        { title: input.title, companyName: input.companyName, location: input.location, sourceUrl: input.sourceUrl, applicationUrl: input.applicationUrl },
        { excludeJobId: opts.excludeJobId },
      ),
    ]);
    return { post, suggestedTags: assignments, duplicates, warnings: this.warningsFor(input) };
  }

  // -------------------------------------------------------------------------
  // Create / update (shared publishing pipeline for manual + extracted jobs)
  // -------------------------------------------------------------------------

  private resolveStatus(
    input: JobInput,
    actor: Actor,
    general: GeneralSettings,
    current?: { status: JobStatus; publishedAt: Date | null },
  ): { status: JobStatus; publishedAt: Date | null; scheduledAt: Date | null; auditAction: AuditAction } {
    const canPublish = this.canPublish(actor.role, general);
    const now = new Date();
    switch (input.action) {
      case 'draft':
        if (current && ['PUBLISHED', 'EXPIRED', 'ARCHIVED'].includes(current.status)) {
          // Saving edits to a live listing keeps its status.
          return { status: current.status, publishedAt: current.publishedAt, scheduledAt: null, auditAction: 'JOB_UPDATE' };
        }
        return { status: 'DRAFT', publishedAt: null, scheduledAt: null, auditAction: current ? 'JOB_UPDATE' : 'JOB_CREATE' };
      case 'submit':
        return { status: 'PENDING_APPROVAL', publishedAt: null, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null, auditAction: 'JOB_SUBMIT' };
      case 'schedule': {
        const at = new Date(input.scheduledAt!);
        if (!canPublish) return { status: 'PENDING_APPROVAL', publishedAt: null, scheduledAt: at, auditAction: 'JOB_SUBMIT' };
        if (at <= now) return { status: 'PUBLISHED', publishedAt: now, scheduledAt: null, auditAction: 'JOB_PUBLISH' };
        return { status: 'SCHEDULED', publishedAt: null, scheduledAt: at, auditAction: 'JOB_SCHEDULE' };
      }
      case 'publish':
      default:
        if (!canPublish) return { status: 'PENDING_APPROVAL', publishedAt: null, scheduledAt: null, auditAction: 'JOB_SUBMIT' };
        return {
          status: 'PUBLISHED',
          publishedAt: current?.status === 'PUBLISHED' && current.publishedAt ? current.publishedAt : now,
          scheduledAt: null,
          auditAction: 'JOB_PUBLISH',
        };
    }
  }

  async create(input: JobInput, actor: Actor, ctx: SaveContext = {}): Promise<JobDTO> {
    if (!input.confirmDuplicate) {
      const dups = await this.duplicates.findCandidates({
        title: input.title,
        companyName: input.companyName,
        location: input.location,
        sourceUrl: input.sourceUrl,
        applicationUrl: input.applicationUrl,
      });
      const likely = dups.filter((d) => d.isLikelyDuplicate);
      if (likely.length) {
        throw conflict('DUPLICATE_JOB', 'This job looks like a duplicate of an existing listing.', { candidates: likely });
      }
    }
    return this.save(null, input, actor, ctx);
  }

  async update(id: string, input: JobInput, actor: Actor): Promise<JobDTO> {
    return this.save(id, input, actor, {});
  }

  private async save(id: string | null, input: JobInput, actor: Actor, ctx: SaveContext): Promise<JobDTO> {
    const general = await this.settings.getGeneral();
    const current = id ? await this.prisma.job.findUnique({ where: { id } }) : null;
    if (id && !current) throw notFound('Job');

    const resolved = this.resolveStatus(input, actor, general, current ?? undefined);
    let { status } = resolved;
    let expiredAt: Date | null = current?.expiredAt ?? null;
    let expiryReason: string | null = current?.expiryReason ?? null;

    if (status === 'PUBLISHED' && ((input.deadline && isPastDate(input.deadline)) || (!input.deadline && input.walkInDate && isPastDate(input.walkInDate)))) {
      status = 'EXPIRED';
      expiredAt = new Date();
      expiryReason = input.deadline ? 'DEADLINE_PASSED' : 'WALKIN_DATE_PASSED';
    }
    if (status === 'PUBLISHED' && current?.status === 'EXPIRED') {
      expiredAt = null;
      expiryReason = null;
    }

    const base = resolved.publishedAt ?? resolved.scheduledAt ?? new Date();
    const expiresAt = this.computeExpiresAt(input, base, general);
    const { tagRows } = await this.resolveTags(input);
    const tagIds = tagRows.map((t) => t.tagId);
    const tagNames = tagIds.length ? (await this.prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { name: true } })).map((t) => t.name) : [];
    const generatedPost = await this.renderPost(input, tagIds);

    const job = await this.prisma.$transaction(async (tx) => {
      const company = await this.upsertCompany(tx, input);
      const skills = await this.upsertSkills(tx, input);
      const data = {
        companyId: company.id,
        title: input.title,
        normalizedTitle: normalizeTitle(input.title),
        location: input.location ?? null,
        workMode: input.workMode ?? null,
        employmentType: input.employmentType ?? null,
        qualification: input.qualification ?? null,
        experienceText: input.experienceText ?? null,
        minExperience: input.minExperience ?? null,
        maxExperience: input.maxExperience ?? null,
        isFresherFriendly: input.isFresherFriendly || input.minExperience === 0,
        summary: input.summary ?? null,
        description: input.description ?? null,
        responsibilities: input.responsibilities,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        currency: input.salaryMin != null || input.salaryMax != null ? (input.currency ?? null) : null,
        salaryType: input.salaryType ?? null,
        applicationUrl: input.applicationUrl ?? null,
        applicationUrlKey: urlFingerprint(input.applicationUrl),
        sourceUrl: input.sourceUrl ?? null,
        sourceUrlKey: urlFingerprint(input.sourceUrl),
        sourceWebsite: hostnameOf(input.sourceUrl),
        deadline: input.deadline ? ymdToDate(input.deadline) : null,
        walkInDate: input.walkInDate ? ymdToDate(input.walkInDate) : null,
        postedDate: input.postedDate ? ymdToDate(input.postedDate) : null,
        industry: input.industry ?? null,
        openings: input.openings ?? null,
        status,
        publishedAt: status === 'EXPIRED' && !resolved.publishedAt ? new Date() : resolved.publishedAt,
        scheduledAt: resolved.scheduledAt,
        expiresAt,
        expiredAt,
        expiryReason,
        archivedAt: status === 'ARCHIVED' ? (current?.archivedAt ?? new Date()) : null,
        generatedPost,
        fieldMeta: (input.fieldMeta ?? undefined) as Prisma.InputJsonValue | undefined,
        searchText: this.buildSearchText(input, tagNames),
      };

      let saved;
      if (id) {
        await tx.jobSkill.deleteMany({ where: { jobId: id } });
        await tx.jobTag.deleteMany({ where: { jobId: id } });
        saved = await tx.job.update({
          where: { id },
          data: {
            ...data,
            approvedById: status === 'PUBLISHED' && current?.status !== 'PUBLISHED' ? actor.id : undefined,
            skills: { create: skills.rows },
            tags: { create: tagRows },
          },
        });
      } else {
        saved = await tx.job.create({
          data: {
            ...data,
            sourceType: ctx.sourceType ?? 'MANUAL',
            createdById: actor.id,
            approvedById: status === 'PUBLISHED' ? actor.id : null,
            skills: { create: skills.rows },
            tags: { create: tagRows },
          },
        });
      }

      if (input.sourceUrl) {
        const existingSource = await tx.jobSource.findFirst({ where: { jobId: saved.id, sourceUrl: input.sourceUrl } });
        if (!existingSource) {
          await tx.jobSource.create({ data: { jobId: saved.id, sourceUrl: input.sourceUrl, extractedContentHash: ctx.contentHash ?? null } });
        }
      }
      await this.search.reindex(saved.id, tx);
      await this.audit.log(actor.id, resolved.auditAction, 'Job', saved.id, { title: input.title, status }, tx);
      return saved;
    });

    return this.getById(job.id);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getById(id: string): Promise<JobDTO> {
    const job = await this.prisma.job.findUnique({ where: { id }, include: jobInclude });
    if (!job) throw notFound('Job');
    return toJobDTO(job);
  }

  /** Public read: only published/expired jobs are visible to non-staff. */
  async getForViewer(id: string, viewer: { id: string; role: Role } | null): Promise<JobDTO> {
    const job = await this.prisma.job.findUnique({ where: { id }, include: jobInclude });
    if (!job) throw notFound('Job');
    const isStaff = hasRole(viewer?.role, 'EDITOR');
    if (!isStaff && !PUBLIC_STATUSES.includes(job.status)) throw notFound('Job');
    let bookmarked: boolean | undefined;
    if (viewer) {
      bookmarked = !!(await this.prisma.bookmark.findUnique({ where: { userId_jobId: { userId: viewer.id, jobId: id } } }));
    }
    return toJobDTO(job, { bookmarked });
  }

  async similar(id: string, limit = 4): Promise<JobDTO[]> {
    const job = await this.prisma.job.findUnique({ where: { id }, include: { tags: true } });
    if (!job) throw notFound('Job');
    const tagIds = job.tags.map((t) => t.tagId);
    const jobs = await this.prisma.job.findMany({
      where: {
        id: { not: id },
        status: 'PUBLISHED',
        OR: [{ companyId: job.companyId }, { tags: { some: { tagId: { in: tagIds }, tag: { category: { in: ['JOB_CATEGORY', 'SKILL'] } } } } }],
      },
      include: jobInclude,
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
    return jobs.map((j) => toJobDTO(j, { full: false }));
  }

  async adminList(params: { q?: string; status?: JobStatus; sourceType?: 'MANUAL' | 'URL'; page: number; pageSize: number }) {
    const where: Prisma.JobWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.sourceType ? { sourceType: params.sourceType } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: 'insensitive' } },
              { company: { name: { contains: params.q, mode: 'insensitive' } } },
              { location: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, jobs] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        include: jobInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ]);
    return {
      data: jobs.map((j) => toJobDTO(j, { full: false })),
      meta: { page: params.page, pageSize: params.pageSize, total, totalPages: Math.max(1, Math.ceil(total / params.pageSize)) },
    };
  }

  // -------------------------------------------------------------------------
  // Workflow transitions
  // -------------------------------------------------------------------------

  async transition(id: string, action: JobTransition, actor: Actor, opts: { reason?: string } = {}): Promise<JobDTO> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw notFound('Job');
    const general = await this.settings.getGeneral();
    const now = new Date();
    let data: Prisma.JobUpdateInput;
    let audit: AuditAction;

    switch (action) {
      case 'approve':
      case 'publish': {
        if (!hasRole(actor.role, 'ADMIN')) throw forbidden('Only administrators can approve or publish jobs');
        if (!['PENDING_APPROVAL', 'DRAFT', 'SCHEDULED', 'EXPIRED', 'ARCHIVED'].includes(job.status) && job.status !== 'PUBLISHED') {
          throw badRequest(`Cannot ${action} a job in status ${job.status}`);
        }
        const deadlineYmd = job.deadline?.toISOString().slice(0, 10) ?? null;
        if (deadlineYmd && isPastDate(deadlineYmd)) throw badRequest('The application deadline has passed — update it before publishing.');
        const futureSchedule = job.scheduledAt && job.scheduledAt > now;
        if (futureSchedule && action === 'approve') {
          data = { status: 'SCHEDULED', approvedBy: { connect: { id: actor.id } } };
        } else {
          const publishedAt = job.publishedAt && job.status !== 'DRAFT' && job.status !== 'PENDING_APPROVAL' ? job.publishedAt : now;
          data = {
            status: 'PUBLISHED',
            publishedAt,
            scheduledAt: null,
            expiredAt: null,
            expiryReason: null,
            archivedAt: null,
            approvedBy: { connect: { id: actor.id } },
            expiresAt:
              job.deadline || job.walkInDate
                ? job.expiresAt
                : job.expiresAt && job.expiresAt > now
                  ? job.expiresAt
                  : addDays(now, general.defaultExpiryDays),
          };
        }
        audit = action === 'approve' ? 'JOB_APPROVE' : 'JOB_PUBLISH';
        break;
      }
      case 'reject':
        if (!hasRole(actor.role, 'ADMIN')) throw forbidden('Only administrators can reject jobs');
        if (job.status !== 'PENDING_APPROVAL') throw badRequest('Only jobs awaiting approval can be rejected');
        data = { status: 'DRAFT' };
        audit = 'JOB_REJECT';
        break;
      case 'expire':
        if (!hasRole(actor.role, 'ADMIN')) throw forbidden();
        data = { status: 'EXPIRED', expiredAt: now, expiryReason: 'MANUAL' };
        audit = 'JOB_EXPIRE';
        break;
      case 'archive':
        if (!hasRole(actor.role, 'ADMIN')) throw forbidden();
        data = { status: 'ARCHIVED', archivedAt: now };
        audit = 'JOB_ARCHIVE';
        break;
      case 'restore':
        if (!hasRole(actor.role, 'ADMIN')) throw forbidden();
        if (job.status !== 'ARCHIVED') throw badRequest('Only archived jobs can be restored');
        data = { status: 'DRAFT', archivedAt: null };
        audit = 'JOB_RESTORE';
        break;
    }
    await this.prisma.job.update({ where: { id }, data });
    await this.audit.log(actor.id, audit, 'Job', id, { from: job.status, reason: opts.reason });
    return this.getById(id);
  }

  async remove(id: string, actor: Actor): Promise<void> {
    if (!hasRole(actor.role, 'ADMIN')) throw forbidden('Only administrators can delete jobs');
    const job = await this.prisma.job.findUnique({ where: { id }, include: { company: true } });
    if (!job) throw notFound('Job');
    await this.prisma.job.delete({ where: { id } });
    await this.audit.log(actor.id, 'JOB_DELETE', 'Job', id, { title: job.title, company: job.company.name, status: job.status });
  }
}
