/**
 * Text normalisation helpers shared by the tagging engine, duplicate detection
 * and search indexing.
 */

/** Collapses a string to a comparison key: lowercase alphanumerics only. */
export function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/c\+\+/g, 'cplusplus')
    .replace(/c#/g, 'csharp')
    .replace(/\.net\b/g, 'dotnet')
    .replace(/[^a-z0-9]+/g, '');
}

/** Lowercase words separated by single spaces, padded, for whole-phrase matching. */
export function phraseText(input: string): string {
  const words = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/c\+\+/g, ' cplusplus ')
    .replace(/c#/g, ' csharp ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${words} `;
}

/** True when `phrase` occurs in `text` on word boundaries (case/punctuation-insensitive). */
export function containsPhrase(text: string, phrase: string): boolean {
  const p = phraseText(phrase);
  if (p.trim().length === 0) return false;
  return phraseText(text).includes(p);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/#/g, ' sharp ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const TITLE_NOISE = [
  'urgent',
  'urgently',
  'hiring',
  'immediate',
  'immediately',
  'opening',
  'openings',
  'vacancy',
  'vacancies',
  'required',
  'wanted',
  'job',
  'jobs',
  'for',
  'walk',
  'in',
  'walkin',
  'drive',
];

/** Normalises a job title for duplicate detection: drops parenthesised notes and noise words. */
export function normalizeTitle(title: string): string {
  const stripped = title.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  return phraseText(stripped)
    .trim()
    .split(' ')
    .filter((w) => w && !TITLE_NOISE.includes(w))
    .join(' ');
}

const COMPANY_SUFFIXES = [
  'pvt',
  'private',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'llc',
  'llp',
  'corp',
  'corporation',
  'co',
  'company',
  'plc',
  'gmbh',
  'sa',
  'the',
  'recruitment',
  'careers',
  'jobs',
];

export function normalizeCompany(name: string): string {
  return phraseText(name)
    .trim()
    .split(' ')
    .filter((w) => w && !COMPANY_SUFFIXES.includes(w))
    .join(' ');
}

export function normalizeLocation(location: string | null | undefined): string {
  if (!location) return '';
  return phraseText(location.replace(/bengaluru/gi, 'bangalore').replace(/gurugram/gi, 'gurgaon'))
    .trim();
}

const TRACKING_PARAMS = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'ref',
  'refid',
  'referrer',
  'trk',
  'trackingid',
  'src',
  'source',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
]);

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Canonical form of a URL: strips tracking params, fragments, default ports and trailing slashes. */
export function normalizeUrl(value: string): string {
  const u = new URL(value.trim());
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !k.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = '';
  for (const [k, v] of params) u.searchParams.append(k, v);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

/** Protocol- and www-insensitive fingerprint used for duplicate matching. */
export function urlFingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(normalizeUrl(value));
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname.toLowerCase();
    return `${host}${path}${u.search}`;
  } catch {
    return null;
  }
}

export function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Splits free-text lists ("Java, SQL / AWS and Docker") into trimmed items. */
export function splitList(input: string): string[] {
  return input
    .split(/[,;|\n•·]|\s\/\s|\band\b/gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max - 1).trimEnd()}…`;
}
