import {
  dedupeSkills,
  isHttpUrl,
  isPastDate,
  jobInputSchema,
  normalizeCompany,
  normalizeUrl,
  parseDateLoose,
  parseExperience,
  phraseText,
  urlFingerprint,
  type ExtractionFlag,
  type FieldMeta,
  type JobInput,
  type LlmExtraction,
} from '@jobs/shared';
import type { ExtractionContext } from '../llm/types';

const KNOWN_FIELDS = new Set([
  'title', 'companyName', 'location', 'workMode', 'employmentType', 'qualification', 'experienceText',
  'minExperience', 'maxExperience', 'isFresherFriendly', 'skills', 'preferredSkills', 'summary', 'description',
  'responsibilities', 'salaryMin', 'salaryMax', 'currency', 'salaryType', 'applicationUrl', 'deadline',
  'walkInDate', 'postedDate', 'industry', 'openings', 'category',
]);
const FIELD_ALIASES: Record<string, string> = {
  minExperienceYears: 'minExperience',
  maxExperienceYears: 'maxExperience',
  salaryCurrency: 'currency',
};

const CURRENCY_HINTS: [RegExp, string][] = [
  [/₹|\brs\.?\s|\binr\b|\blpa\b|lakh/i, 'INR'],
  [/\$|\busd\b/i, 'USD'],
  [/€|\beur\b/i, 'EUR'],
  [/£|\bgbp\b/i, 'GBP'],
];

/** Every number in the text, expanded for k / lakh / LPA / crore suffixes. */
export function numbersInText(text: string): Set<number> {
  const out = new Set<number>();
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakhs?|lpa|lacs?|cr|crores?)?\b/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    out.add(n);
    const unit = (m[2] ?? '').toLowerCase();
    if (unit === 'k') out.add(n * 1_000);
    if (/^(l|lakhs?|lpa|lacs?)$/.test(unit)) out.add(Math.round(n * 100_000));
    if (/^(cr|crores?)$/.test(unit)) out.add(Math.round(n * 10_000_000));
  }
  return out;
}

function resolveUrl(candidate: string | null, base: string): string | null {
  if (!candidate) return null;
  try {
    const u = new URL(candidate.trim(), base).toString();
    return isHttpUrl(u) ? u : null;
  } catch {
    return null;
  }
}

export interface DraftBuildResult {
  draft: JobInput;
  fieldMeta: FieldMeta;
  flags: ExtractionFlag[];
}

/**
 * Turns raw model output into a validated draft job and attaches review flags.
 * Applies anti-hallucination grounding checks: values that cannot be found in
 * the source page (salary figures, company, application URL) are flagged or removed.
 */
export function buildDraft(x: LlmExtraction, ctx: ExtractionContext, submittedUrl: string, now = new Date()): DraftBuildResult {
  const flags: ExtractionFlag[] = [];
  const inferred = new Set<string>(
    x.inferredFields.map((f) => FIELD_ALIASES[f] ?? f).filter((f) => KNOWN_FIELDS.has(f)),
  );
  const ambiguities = x.ambiguities.map((a) => ({ field: FIELD_ALIASES[a.field] ?? a.field, issue: a.issue.slice(0, 300) }));
  for (const a of ambiguities) flags.push({ level: 'warning', field: a.field, message: a.issue });

  const pageText = `${ctx.pageTitle ?? ''}\n${ctx.text}\n${ctx.jsonLd ? JSON.stringify(ctx.jsonLd) : ''}`;
  const pagePhrases = phraseText(pageText);

  // Title & company
  let title = x.title?.trim() ?? '';
  if (!title && ctx.pageTitle) {
    title = ctx.pageTitle.trim();
    inferred.add('title');
    flags.push({ level: 'warning', field: 'title', message: 'Job title was taken from the page title — please verify.' });
  }
  if (!title) flags.push({ level: 'error', field: 'title', message: 'No job title found.' });

  let companyName = x.companyName?.trim() ?? '';
  if (!companyName && ctx.meta.siteName) {
    companyName = ctx.meta.siteName;
    inferred.add('companyName');
    flags.push({ level: 'warning', field: 'companyName', message: 'Company name was taken from the website name — please verify.' });
  }
  if (companyName && inferred.has('companyName') && !flags.some((f) => f.field === 'companyName')) {
    flags.push({ level: 'warning', field: 'companyName', message: `Company name "${companyName}" was inferred (e.g. from the site name) — please verify.` });
  }
  if (!companyName) flags.push({ level: 'error', field: 'companyName', message: 'No company name found.' });
  else if (!pagePhrases.includes(` ${normalizeCompany(companyName).split(' ')[0] ?? ''} `)) {
    flags.push({ level: 'warning', field: 'companyName', message: `Company "${companyName}" does not appear verbatim on the page.` });
  }

  // Experience
  let minExperience = x.minExperienceYears;
  let maxExperience = x.maxExperienceYears;
  const parsedExp = parseExperience(x.experienceText);
  if (minExperience == null && maxExperience == null) {
    minExperience = parsedExp.min;
    maxExperience = parsedExp.max;
  }
  if (minExperience != null && maxExperience != null && minExperience > maxExperience) {
    flags.push({ level: 'warning', field: 'experience', message: `Experience range looked inverted (${minExperience}-${maxExperience}); it was swapped.` });
    [minExperience, maxExperience] = [maxExperience, minExperience];
  }
  const isFresherFriendly = x.isFresherFriendly ?? parsedExp.fresher;

  // Dates
  const date = (field: 'deadline' | 'walkInDate' | 'postedDate', raw: string | null) => {
    if (!raw) return null;
    const parsed = parseDateLoose(raw);
    if (!parsed) flags.push({ level: 'warning', field, message: `Could not interpret date "${raw}" — please enter it manually.` });
    return parsed;
  };
  const deadline = date('deadline', x.deadline);
  const walkInDate = date('walkInDate', x.walkInDate);
  const postedDate = date('postedDate', x.postedDate);
  if (deadline && isPastDate(deadline, now)) {
    flags.push({ level: 'error', field: 'deadline', message: `Application deadline (${deadline}) has passed — this job appears to be expired.` });
  }
  if (walkInDate && isPastDate(walkInDate, now) && !deadline) {
    flags.push({ level: 'error', field: 'walkInDate', message: `Walk-in date (${walkInDate}) has passed — this job appears to be expired.` });
  }
  const ldValidThrough = parseDateLoose((ctx.jsonLd as Record<string, unknown> | null)?.validThrough);
  if (ldValidThrough && deadline && ldValidThrough !== deadline) {
    flags.push({ level: 'warning', field: 'deadline', message: `Conflicting deadlines: page metadata says ${ldValidThrough}, extracted ${deadline}.` });
  }

  // Application URL — must exist on the page, never invented or rewritten.
  const known = new Set([...ctx.links, ...ctx.applyLinks].map((l) => urlFingerprint(l)).filter(Boolean) as string[]);
  let applicationUrl = resolveUrl(x.applicationUrl, ctx.sourceUrl);
  if (applicationUrl) {
    const fp = urlFingerprint(applicationUrl);
    const onPage = (fp && known.has(fp)) || pageText.includes(x.applicationUrl ?? '\u0000') || fp === urlFingerprint(ctx.sourceUrl);
    if (!onPage) {
      flags.push({ level: 'warning', field: 'applicationUrl', message: `The AI-suggested application link (${applicationUrl}) was not found on the page and was discarded.` });
      applicationUrl = null;
    }
  }
  if (!applicationUrl && ctx.applyLinks[0]) {
    applicationUrl = ctx.applyLinks[0];
    inferred.add('applicationUrl');
    flags.push({ level: 'info', field: 'applicationUrl', message: 'Application link detected from an "Apply" link on the page — please verify.' });
  }
  if (!applicationUrl) {
    applicationUrl = submittedUrl;
    flags.push({ level: 'info', field: 'applicationUrl', message: 'No separate application link found; the original job URL is used.' });
  }

  // Salary — only keep figures that appear in the source text.
  let salaryMin = x.salaryMin;
  let salaryMax = x.salaryMax;
  if (salaryMin != null || salaryMax != null) {
    const nums = numbersInText(pageText);
    const grounded = [salaryMin, salaryMax].every((v) => v == null || nums.has(v) || nums.has(Math.round(v)));
    if (!grounded) {
      flags.push({ level: 'warning', field: 'salary', message: 'Salary figures could not be found in the page text and were removed. Add them manually if they are stated.' });
      salaryMin = null;
      salaryMax = null;
    }
  }
  let currency = x.salaryCurrency?.trim().toUpperCase() ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) currency = null;
  if ((salaryMin != null || salaryMax != null) && !currency) {
    currency = CURRENCY_HINTS.find(([re]) => re.test(pageText))?.[1] ?? null;
    if (currency) inferred.add('currency');
  }
  if (salaryMin == null && salaryMax == null) currency = null;

  // Work mode grounding
  if (x.workMode === 'WFH' && !/work\s*from\s*home|\bwfh\b/i.test(pageText)) inferred.add('workMode');
  if (x.workMode === 'REMOTE' && !/remote|telecommute|anywhere/i.test(pageText)) inferred.add('workMode');

  const skills = dedupeSkills(x.skills);
  const skillKeys = new Set(skills.map((s) => s.toLowerCase()));
  const preferredSkills = dedupeSkills(x.preferredSkills).filter((s) => !skillKeys.has(s.toLowerCase()));

  let description = x.description?.trim() || null;
  if (!description) {
    const ldDesc = (ctx.jsonLd as Record<string, any> | null)?.description;
    description = typeof ldDesc === 'string' ? ldDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ctx.text.slice(0, 8000);
    flags.push({ level: 'info', field: 'description', message: 'Description is taken from the raw page text — consider tidying it.' });
  }
  if (x.summary) inferred.add('summary');

  const org = (ctx.jsonLd as Record<string, any> | null)?.hiringOrganization;
  const companyWebsite = resolveUrl(typeof org?.sameAs === 'string' ? org.sameAs : typeof org?.url === 'string' ? org.url : null, ctx.sourceUrl);

  const candidate = {
    title,
    companyName,
    companyWebsite,
    companyLogoUrl: ctx.logoUrl,
    location: x.location,
    workMode: x.workMode,
    employmentType: x.employmentType,
    qualification: x.qualification,
    experienceText: x.experienceText,
    minExperience,
    maxExperience,
    isFresherFriendly: !!isFresherFriendly,
    skills,
    preferredSkills,
    summary: x.summary,
    description: description?.slice(0, 30_000) ?? null,
    responsibilities: x.responsibilities.map((r) => r.slice(0, 1000)).slice(0, 60),
    salaryMin,
    salaryMax,
    currency,
    salaryType: salaryMin != null || salaryMax != null ? x.salaryType : null,
    applicationUrl,
    sourceUrl: normalizeUrl(submittedUrl),
    deadline,
    walkInDate,
    postedDate,
    industry: x.industry,
    openings: x.openings != null && x.openings >= 1 ? Math.round(x.openings) : null,
    tagIds: [],
    autoTag: false,
    action: 'draft' as const,
    fieldMeta: { inferred: [...inferred], ambiguities },
  };

  const parsed = jobInputSchema.safeParse(candidate);
  let draft: JobInput;
  if (parsed.success) {
    draft = parsed.data;
  } else {
    // Keep the draft editable; surface each validation problem to the reviewer.
    for (const issue of parsed.error.issues) {
      flags.push({ level: 'error', field: issue.path.join('.'), message: issue.message });
    }
    draft = candidate as unknown as JobInput;
  }
  return { draft, fieldMeta: { inferred: [...inferred], ambiguities }, flags };
}
