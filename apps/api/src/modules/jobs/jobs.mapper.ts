import type { Prisma } from '@prisma/client';
import { dateToYmd, type FieldMeta, type JobDTO } from '@jobs/shared';

export const jobInclude = {
  company: true,
  skills: { include: { skill: true } },
  tags: { include: { tag: true } },
  sources: { orderBy: { extractionTimestamp: 'desc' }, take: 1 },
} satisfies Prisma.JobInclude;

export type JobWithRelations = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

const TAG_ORDER = ['EXPERIENCE', 'WORK_MODE', 'JOB_CATEGORY', 'SKILL', 'EMPLOYMENT_TYPE', 'QUALIFICATION', 'OTHER'];

export function toJobDTO(job: JobWithRelations, opts: { full?: boolean; bookmarked?: boolean } = {}): JobDTO {
  const full = opts.full ?? true;
  const source = job.sources[0];
  return {
    id: job.id,
    title: job.title,
    company: { id: job.company.id, name: job.company.name, website: job.company.website, logoUrl: job.company.logoUrl },
    location: job.location,
    workMode: job.workMode,
    employmentType: job.employmentType,
    qualification: job.qualification,
    experienceText: job.experienceText,
    minExperience: job.minExperience,
    maxExperience: job.maxExperience,
    isFresherFriendly: job.isFresherFriendly,
    summary: job.summary,
    description: full ? job.description : null,
    responsibilities: full ? job.responsibilities : [],
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    salaryType: job.salaryType,
    applicationUrl: job.applicationUrl,
    sourceUrl: job.sourceUrl,
    sourceWebsite: job.sourceWebsite,
    deadline: dateToYmd(job.deadline),
    walkInDate: dateToYmd(job.walkInDate),
    postedDate: dateToYmd(job.postedDate),
    industry: job.industry,
    openings: job.openings,
    status: job.status,
    sourceType: job.sourceType,
    publishedAt: job.publishedAt?.toISOString() ?? null,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    expiredAt: job.expiredAt?.toISOString() ?? null,
    expiryReason: job.expiryReason,
    generatedPost: full ? job.generatedPost : null,
    skills: job.skills.filter((s) => !s.isPreferred).map((s) => s.skill.name),
    preferredSkills: job.skills.filter((s) => s.isPreferred).map((s) => s.skill.name),
    tags: job.tags
      .map((t) => ({ id: t.tag.id, name: t.tag.name, slug: t.tag.slug, category: t.tag.category }))
      .sort((a, b) => TAG_ORDER.indexOf(a.category) - TAG_ORDER.indexOf(b.category)),
    fieldMeta: (job.fieldMeta as FieldMeta | null) ?? null,
    lastVerifiedAt: source?.lastVerifiedAt?.toISOString() ?? null,
    lastVerifyStatus: source?.lastVerifyStatus ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    ...(opts.bookmarked !== undefined ? { bookmarked: opts.bookmarked } : {}),
  };
}
