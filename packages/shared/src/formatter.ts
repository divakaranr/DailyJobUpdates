import { formatYmd } from './dates';
import {
  EMPLOYMENT_TYPE_LABELS,
  SALARY_TYPE_LABELS,
  WORK_MODE_LABELS,
  type EmploymentType,
  type SalaryType,
  type WorkMode,
} from './enums';
import { formatExperience } from './experience';
import { toHashtag } from './tagging';
import { hostnameOf } from './text';

export interface PostableJob {
  title: string;
  companyName: string;
  location?: string | null;
  workMode?: WorkMode | null;
  employmentType?: EmploymentType | null;
  qualification?: string | null;
  experienceText?: string | null;
  minExperience?: number | null;
  maxExperience?: number | null;
  isFresherFriendly?: boolean | null;
  skills?: string[];
  summary?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  salaryType?: SalaryType | null;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
  deadline?: string | null;
  walkInDate?: string | null;
  openings?: number | null;
  tags?: { name: string; category: string }[];
}

export interface PostPreferences {
  /** Show "Not specified" lines for missing fields instead of omitting them. */
  showUnavailable: boolean;
  notSpecifiedText: string;
  includeHashtags: boolean;
  includeSource: boolean;
}

export const DEFAULT_POST_PREFERENCES: PostPreferences = {
  showUnavailable: true,
  notSpecifiedText: 'Not specified',
  includeHashtags: true,
  includeSource: true,
};

export function formatSalary(job: Pick<PostableJob, 'salaryMin' | 'salaryMax' | 'currency' | 'salaryType'>): string | null {
  const { salaryMin, salaryMax, currency, salaryType } = job;
  if (salaryMin == null && salaryMax == null) return null;
  const code = (currency || '').toUpperCase();
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(locale, code ? { style: 'currency', currency: code, maximumFractionDigits: 0 } : { maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${code} ${n.toLocaleString(locale)}`.trim();
    }
  };
  const range =
    salaryMin != null && salaryMax != null && salaryMin !== salaryMax
      ? `${fmt(salaryMin)} - ${fmt(salaryMax)}`
      : fmt((salaryMin ?? salaryMax) as number);
  const prefix = salaryMin == null ? 'Up to ' : salaryMax == null ? 'From ' : '';
  return `${prefix}${range}${salaryType ? ` ${SALARY_TYPE_LABELS[salaryType]}` : ''}`;
}

/** Builds the hashtag list: tags first, then up to three skills, then the company. */
export function buildHashtags(job: PostableJob, max = 10): string[] {
  const out: string[] = [];
  const push = (name: string | null | undefined) => {
    if (!name) return;
    const h = toHashtag(name);
    if (h && !out.some((x) => x.toLowerCase() === h.toLowerCase())) out.push(h);
  };
  const tags = job.tags ?? [];
  const order = ['EXPERIENCE', 'WORK_MODE', 'JOB_CATEGORY', 'SKILL', 'EMPLOYMENT_TYPE', 'QUALIFICATION', 'OTHER'];
  for (const cat of order) for (const t of tags.filter((x) => x.category === cat)) push(t.name);
  if ((job.minExperience ?? 0) >= 1 || /experienced/i.test(job.experienceText ?? '')) push('Experienced');
  for (const s of (job.skills ?? []).slice(0, 3)) push(s);
  if (job.companyName) push(`${job.companyName.split(/\s+/).slice(0, 2).join(' ')} Jobs`);
  return out.slice(0, max);
}

/** Headline in the form "Company Recruitment | Title (Work Mode) @ Location". */
export function buildHeadline(job: PostableJob): string {
  const mode = job.workMode ? WORK_MODE_LABELS[job.workMode] : null;
  const titleHasMode = mode ? job.title.toLowerCase().includes(mode.toLowerCase()) : true;
  let headline = `${job.companyName} Recruitment | ${job.title}`;
  if (mode && !titleHasMode) headline += ` (${mode})`;
  if (job.location) headline += ` @ ${job.location}`;
  return headline;
}

/**
 * Renders a LinkedIn-style plain-text job post from structured data. It only
 * prints values that exist; missing fields are omitted or shown as
 * "Not specified" depending on preferences. The application URL is printed verbatim.
 */
export function formatJobPost(job: PostableJob, prefs: PostPreferences = DEFAULT_POST_PREFERENCES): string {
  const lines: string[] = [buildHeadline(job), ''];
  if (job.summary) lines.push(job.summary.trim(), '');

  const field = (label: string, value: string | null | undefined, alwaysShow = prefs.showUnavailable) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
    else if (alwaysShow) lines.push(`${label}: ${prefs.notSpecifiedText}`);
  };

  field('Qualification', job.qualification);
  field('Experience', formatExperience(job.minExperience, job.maxExperience, !!job.isFresherFriendly, job.experienceText));
  field('Work Mode', job.workMode ? WORK_MODE_LABELS[job.workMode] : null);
  field('Employment Type', job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] : null, false);
  field('Location', job.location);
  field('Skills', (job.skills ?? []).join(', '));
  field('Salary', formatSalary(job), false);
  field('Openings', job.openings ? String(job.openings) : null, false);
  field('Apply Link', job.applicationUrl ?? job.sourceUrl ?? null);
  field('Walk-in Date', formatYmd(job.walkInDate));
  field('Application Deadline', formatYmd(job.deadline));

  if (prefs.includeHashtags) {
    const tags = buildHashtags(job);
    if (tags.length) lines.push('', `Tags: ${tags.join(' ')}`);
  }
  if (prefs.includeSource && job.sourceUrl) {
    lines.push('', `Source: ${hostnameOf(job.sourceUrl) ?? job.sourceUrl}`);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
