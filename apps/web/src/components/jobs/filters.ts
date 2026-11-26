import { EMPLOYMENT_TYPES, WORK_MODES } from '@jobs/shared';

export const LIST_KEYS = ['workMode', 'employmentType', 'experienceLevel', 'category', 'skills', 'qualification'] as const;
export const SCALAR_KEYS = ['q', 'sort', 'experience', 'location', 'company', 'postedWithin', 'status'] as const;
export type ListKey = (typeof LIST_KEYS)[number];
export type ScalarKey = (typeof SCALAR_KEYS)[number];

export type Filters = { [K in ListKey]: string[] } & { [K in ScalarKey]: string };

export function parseFilters(sp: URLSearchParams): Filters {
  const f = {} as Filters;
  for (const k of LIST_KEYS) f[k] = (sp.get(k) ?? '').split(',').filter(Boolean);
  for (const k of SCALAR_KEYS) f[k] = sp.get(k) ?? '';
  f.workMode = f.workMode.filter((m) => (WORK_MODES as readonly string[]).includes(m));
  f.employmentType = f.employmentType.filter((m) => (EMPLOYMENT_TYPES as readonly string[]).includes(m));
  return f;
}

export function filtersToSearch(f: Partial<Filters>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (Array.isArray(v) ? v.length : v) sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  for (const k of LIST_KEYS) n += f[k].length;
  for (const k of ['experience', 'location', 'company', 'postedWithin'] as const) if (f[k]) n++;
  if (f.status && f.status !== 'active') n++;
  return n;
}

export const POSTED_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];
