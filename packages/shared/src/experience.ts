export interface ExperienceRange {
  min: number | null;
  max: number | null;
  fresher: boolean;
}

const NUM = '(\\d{1,2}(?:\\.\\d)?)';
const YRS = '(?:\\+\\s*)?(?:years?|yrs?)';

/**
 * Parses experience phrases such as "0-2 years", "3+ yrs", "Freshers / Experienced",
 * "minimum 2 years" or "up to 1 year". Returns nulls when nothing explicit is found.
 */
export function parseExperience(text: string | null | undefined): ExperienceRange {
  const result: ExperienceRange = { min: null, max: null, fresher: false };
  if (!text) return result;
  const s = text.toLowerCase();

  if (/\bfreshers?\b|\bno experience\b|\bentry[- ]level\b|\b0 years?\b/.test(s)) {
    result.fresher = true;
    result.min = 0;
  }

  let m = s.match(new RegExp(`${NUM}\\s*(?:-|–|to)\\s*${NUM}\\s*${YRS}`));
  if (m) {
    result.min = Number(m[1]);
    result.max = Number(m[2]);
  } else if ((m = s.match(new RegExp(`${NUM}\\s*\\+\\s*(?:years?|yrs?)`)))) {
    result.min = Number(m[1]);
  } else if ((m = s.match(new RegExp(`(?:minimum|min\\.?|at least|atleast)\\s*(?:of\\s*)?${NUM}\\s*${YRS}`)))) {
    result.min = Number(m[1]);
  } else if ((m = s.match(new RegExp(`(?:up to|upto|maximum|max\\.?)\\s*${NUM}\\s*${YRS}`)))) {
    result.min = result.min ?? 0;
    result.max = Number(m[1]);
  } else if ((m = s.match(new RegExp(`${NUM}\\s*${YRS}`)))) {
    result.min = Number(m[1]);
  }

  if (result.min === 0) result.fresher = true;
  if (result.min != null && result.max != null && result.min > result.max) {
    [result.min, result.max] = [result.max, result.min];
  }
  return result;
}

export interface ExperienceBucket {
  slug: string;
  name: string;
  min: number;
  max: number;
}

/** Half-open year ranges [min, max) used for experience tags. */
export const EXPERIENCE_BUCKETS: ExperienceBucket[] = [
  { slug: '0-1-years', name: '0-1 Years', min: 0, max: 1 },
  { slug: '1-3-years', name: '1-3 Years', min: 1, max: 3 },
  { slug: '3-5-years', name: '3-5 Years', min: 3, max: 5 },
  { slug: '5-8-years', name: '5-8 Years', min: 5, max: 8 },
  { slug: '8-plus-years', name: '8+ Years', min: 8, max: Number.POSITIVE_INFINITY },
];

export const FRESHERS_SLUG = 'freshers';

/** Returns experience tag slugs (including `freshers`) that overlap the given range. */
export function experienceBucketSlugs(
  min: number | null | undefined,
  max: number | null | undefined,
  fresher = false,
): string[] {
  const slugs: string[] = [];
  if (fresher || min === 0) slugs.push(FRESHERS_SLUG);
  if (min == null && max == null) return slugs;
  const lo = min ?? 0;
  const hi = max ?? lo;
  for (const b of EXPERIENCE_BUCKETS) {
    const overlaps = lo === hi ? lo >= b.min && lo < b.max : lo < b.max && hi > b.min;
    if (overlaps) slugs.push(b.slug);
  }
  return slugs;
}

/** Human-readable experience line used in generated posts and cards. */
export function formatExperience(
  min: number | null | undefined,
  max: number | null | undefined,
  fresher = false,
  fallbackText?: string | null,
): string | null {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (min != null && max != null) {
    if (min === 0) return `Freshers / 0-${fmt(max)} Years`;
    return `${fmt(min)}-${fmt(max)} Years`;
  }
  if (min != null && min > 0) return `${fmt(min)}+ Years`;
  if (max != null) return `Up to ${fmt(max)} Years`;
  if (fallbackText) return fallbackText;
  if (fresher || min === 0) return 'Freshers';
  return null;
}
