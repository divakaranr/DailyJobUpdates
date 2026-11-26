import {
  DEFAULT_TAXONOMY,
  canonicalizeSkill,
  containsPhrase,
  llmExtractionSchema,
  normalizeEmploymentType,
  parseDateLoose,
  parseExperience,
  splitList,
  type LlmExtraction,
} from '@jobs/shared';
import type { ExtractionContext } from './types';

const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function ldLocation(ld: Record<string, any>): string | null {
  const parts = new Set<string>();
  for (const loc of asArray(ld.jobLocation)) {
    const addr = (loc as any)?.address;
    if (typeof addr === 'string') parts.add(addr);
    else if (addr && typeof addr === 'object') {
      const country = typeof addr.addressCountry === 'string' ? addr.addressCountry : addr.addressCountry?.name;
      const piece = [addr.addressLocality, addr.addressRegion].filter((x) => typeof x === 'string' && x.trim()).join(', ');
      if (piece) parts.add(piece);
      else if (country) parts.add(country);
    }
  }
  return parts.size ? [...parts].slice(0, 3).join(' / ') : null;
}

const CURRENCY_SYMBOLS: Record<string, string> = { '₹': 'INR', rs: 'INR', 'rs.': 'INR', inr: 'INR', $: 'USD', usd: 'USD', '€': 'EUR', eur: 'EUR', '£': 'GBP', gbp: 'GBP' };

function multiplier(unit: string | undefined): number {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === 'k') return 1_000;
  if (['l', 'lakh', 'lakhs', 'lpa'].includes(u)) return 100_000;
  return 1;
}

function salaryFromText(text: string) {
  const unit = '(k|l|lakhs?|lpa)?';
  const cur = '(₹|rs\\.?|inr|\\$|usd|€|eur|£|gbp)';
  const re = new RegExp(
    `${cur}\\s*([\\d,]+(?:\\.\\d+)?)\\s*${unit}\\s*(?:-|–|to)\\s*(?:₹|rs\\.?|inr|\\$|usd|€|eur|£|gbp)?\\s*([\\d,]+(?:\\.\\d+)?)\\s*${unit}\\s*(per\\s+(?:annum|year|month|hour)|\\/\\s*(?:yr|year|month|mo|hr|hour)|p\\.?a\\.?|annually|monthly|lpa)?`,
    'i',
  );
  const m = text.match(re);
  if (m) {
    const num = (s: string) => Number(s.replace(/,/g, ''));
    const period = (m[6] ?? m[5] ?? m[3] ?? '').toLowerCase();
    return {
      salaryCurrency: CURRENCY_SYMBOLS[m[1].toLowerCase()] ?? null,
      salaryMin: num(m[2]) * multiplier(m[3] ?? m[5]),
      salaryMax: num(m[4]) * multiplier(m[5] ?? m[3]),
      salaryType: /month|mo\b/.test(period) ? 'MONTHLY' : /hour|hr/.test(period) ? 'HOURLY' : /annum|year|yr|p\.?a|lpa|annual/.test(period) ? 'ANNUAL' : null,
    };
  }
  const lpa = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs? per annum)/i);
  if (lpa) {
    return { salaryCurrency: 'INR', salaryMin: Number(lpa[1]) * 100_000, salaryMax: Number(lpa[2]) * 100_000, salaryType: 'ANNUAL' };
  }
  return null;
}

function labelledValue(text: string, label: RegExp): string | null {
  for (const line of text.split('\n')) {
    const m = line.match(label);
    if (m && m[1] && m[1].trim().length > 1) return m[1].trim().slice(0, 200);
  }
  return null;
}

function dateAfter(text: string, label: RegExp): string | null {
  const raw = labelledValue(text, label);
  if (!raw) return null;
  const words = raw.replace(/[()]/g, ' ').split(/\s+/);
  for (let n = Math.min(words.length, 5); n >= 1; n--) {
    for (let i = 0; i + n <= Math.min(words.length, 8); i++) {
      const d = parseDateLoose(words.slice(i, i + n).join(' '));
      if (d) return d;
    }
  }
  return null;
}

const SKILL_TERMS = DEFAULT_TAXONOMY.filter((t) => t.category === 'SKILL').flatMap((t) => [t.name, ...t.synonyms]).filter((s) => s.length >= 3);

/**
 * Rule-based extractor used when no LLM is configured, or as the last-resort
 * fallback. Reads schema.org JobPosting data and explicit labelled lines only;
 * it never generates prose.
 */
export function heuristicExtract(ctx: ExtractionContext): LlmExtraction {
  const ld = (ctx.jsonLd ?? {}) as Record<string, any>;
  const text = ctx.text;
  const inferred: string[] = [];
  const ambiguities: { field: string; issue: string }[] = [];

  const org = ld.hiringOrganization;
  let companyName = asString(typeof org === 'string' ? org : org?.name);
  if (!companyName && ctx.meta.siteName) {
    companyName = ctx.meta.siteName;
    inferred.push('companyName');
  }

  let title = asString(ld.title);
  if (!title && ctx.pageTitle) {
    title = ctx.pageTitle;
    inferred.push('title');
    ambiguities.push({ field: 'title', issue: 'No structured job title found; the page heading was used — verify it is the job title.' });
  }

  const ldDescription = asString(ld.description) ? htmlToText(ld.description) : null;
  const fullText = [ldDescription, text].filter(Boolean).join('\n');

  // Work mode
  let workMode: string | null = ld.jobLocationType === 'TELECOMMUTE' ? 'REMOTE' : null;
  if (!workMode) {
    if (/work\s*from\s*home|\bwfh\b/i.test(fullText)) workMode = 'WFH';
    else if (/\bhybrid\b/i.test(fullText)) workMode = 'HYBRID';
    else if (/\b(fully\s+)?remote\b/i.test(fullText)) workMode = 'REMOTE';
  }

  // Employment type
  let employmentType = normalizeEmploymentType(asArray(ld.employmentType).find((x) => typeof x === 'string'));
  if (!employmentType) {
    const found = new Set(
      ['full time', 'full-time', 'part time', 'part-time', 'internship', 'contract']
        .filter((k) => containsPhrase(fullText, k))
        .map((k) => normalizeEmploymentType(k)),
    );
    if (found.size === 1) employmentType = [...found][0];
    else if (found.size > 1) ambiguities.push({ field: 'employmentType', issue: 'Multiple employment types mentioned' });
  }

  // Experience
  let experienceText: string | null = null;
  const ldExp = ld.experienceRequirements;
  let minExp: number | null = null;
  let maxExp: number | null = null;
  if (typeof ldExp === 'object' && ldExp?.monthsOfExperience != null) {
    minExp = Math.round((Number(ldExp.monthsOfExperience) / 12) * 10) / 10;
  } else if (typeof ldExp === 'string') {
    experienceText = ldExp.slice(0, 200);
  }
  if (!experienceText) {
    experienceText =
      labelledValue(fullText, /^\s*(?:experience|exp\.?|experience required)\s*[:\-–]\s*(.+)$/i) ??
      fullText.split('\n').find((l) => /\b(fresher|\d+\s*(?:\+|-|to)?\s*\d*\s*(?:years?|yrs?))\b/i.test(l) && /experience|fresher/i.test(l))?.trim().slice(0, 200) ??
      null;
  }
  const parsedExp = parseExperience(experienceText);
  if (minExp == null) {
    minExp = parsedExp.min;
    maxExp = parsedExp.max;
  }

  // Qualification
  const ldEdu = ld.educationRequirements;
  const qualification =
    asString(typeof ldEdu === 'string' ? ldEdu : ldEdu?.credentialCategory) ??
    labelledValue(fullText, /^\s*(?:qualification|qualifications|education|eligibility)\s*[:\-–]\s*(.+)$/i);

  // Skills
  let skills: string[] = [];
  const ldSkills = asArray(ld.skills).flatMap((s) => (typeof s === 'string' ? splitList(s) : []));
  const labelled = labelledValue(fullText, /^\s*(?:skills|key skills|skills required|required skills|technical skills)\s*[:\-–]\s*(.+)$/i);
  skills = [...ldSkills, ...(labelled ? splitList(labelled) : [])];
  if (skills.length === 0) {
    for (const term of SKILL_TERMS) if (containsPhrase(fullText, term)) skills.push(canonicalizeSkill(term));
  }

  const salary =
    ld.baseSalary && typeof ld.baseSalary === 'object'
      ? {
          salaryCurrency: asString(ld.baseSalary.currency),
          salaryMin: ld.baseSalary.value?.minValue ?? ld.baseSalary.value?.value ?? null,
          salaryMax: ld.baseSalary.value?.maxValue ?? null,
          salaryType: ld.baseSalary.value?.unitText ?? null,
        }
      : salaryFromText(fullText);

  const responsibilities = asArray(ld.responsibilities)
    .flatMap((r) => (typeof r === 'string' ? htmlToText(r).split('\n') : []))
    .map((s) => s.replace(/^[•\-*]\s*/, '').trim())
    .filter((s) => s.length > 3)
    .slice(0, 30);

  const openingsMatch = fullText.match(/(?:openings|vacancies|no\.? of positions|positions)\s*[:\-–]\s*(\d{1,4})\b/i) ?? fullText.match(/\b(\d{1,4})\s+(?:openings|vacancies|positions)\b/i);

  return llmExtractionSchema.parse({
    title,
    companyName,
    location: ldLocation(ld) ?? labelledValue(fullText, /^\s*(?:location|job location|work location)\s*[:\-–]\s*(.+)$/i),
    workMode,
    employmentType,
    qualification,
    experienceText,
    minExperienceYears: minExp,
    maxExperienceYears: maxExp,
    isFresherFriendly: parsedExp.fresher || null,
    skills,
    preferredSkills: [],
    summary: null,
    description: (ldDescription ?? text).slice(0, 12_000),
    responsibilities,
    ...(salary ?? {}),
    applicationUrl: ctx.applyLinks[0] ?? null,
    deadline: parseDateLoose(asString(ld.validThrough)) ?? dateAfter(fullText, /(?:last date(?: to apply)?|apply by|apply before|deadline|closing date)\s*[:\-–]?\s*(.+)$/i),
    walkInDate: dateAfter(fullText, /walk[- ]?in(?:\s+(?:date|interview|drive))?\s*(?:on|date)?\s*[:\-–]\s*(.+)$/i),
    postedDate: parseDateLoose(asString(ld.datePosted)),
    category: null,
    industry: asString(ld.industry),
    openings: ld.totalJobOpenings ?? (openingsMatch ? Number(openingsMatch[1]) : null),
    inferredFields: inferred,
    ambiguities,
    suggestedTags: [],
  });
}
