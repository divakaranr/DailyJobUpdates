import { normalizeCompany, normalizeLocation, normalizeTitle, urlFingerprint } from './text';

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  const clean = s.replace(/\s+/g, ' ');
  for (let i = 0; i < clean.length - 1; i++) {
    const g = clean.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice coefficient over character bigrams (0..1). */
export function diceCoefficient(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, n] of A) overlap += Math.min(n, B.get(g) ?? 0);
  const total = [...A.values()].reduce((x, y) => x + y, 0) + [...B.values()].reduce((x, y) => x + y, 0);
  return (2 * overlap) / total;
}

export function tokenJaccard(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function textSimilarity(a: string, b: string): number {
  return Math.max(diceCoefficient(a, b), tokenJaccard(a, b));
}

export interface DuplicateComparable {
  title: string;
  companyName: string;
  location?: string | null;
  sourceUrl?: string | null;
  applicationUrl?: string | null;
}

export interface DuplicateScore {
  score: number;
  reasons: string[];
}

export const DUPLICATE_THRESHOLD = 0.85;
export const POSSIBLE_DUPLICATE_THRESHOLD = 0.65;

/**
 * Scores how likely two job records describe the same posting, combining URL
 * identity with fuzzy company/title/location similarity.
 */
export function scoreDuplicate(a: DuplicateComparable, b: DuplicateComparable): DuplicateScore {
  const reasons: string[] = [];
  const srcA = urlFingerprint(a.sourceUrl);
  const srcB = urlFingerprint(b.sourceUrl);
  if (srcA && srcA === srcB) return { score: 1, reasons: ['Same source URL'] };

  const company = textSimilarity(normalizeCompany(a.companyName), normalizeCompany(b.companyName));
  const title = textSimilarity(normalizeTitle(a.title), normalizeTitle(b.title));
  const locA = normalizeLocation(a.location);
  const locB = normalizeLocation(b.location);
  const location = !locA || !locB ? 0.5 : textSimilarity(locA, locB);

  const appA = urlFingerprint(a.applicationUrl);
  const appB = urlFingerprint(b.applicationUrl);
  if (appA && appA === appB && title >= 0.6) {
    reasons.push('Same application URL');
    return { score: Math.max(0.95, title), reasons };
  }

  let score: number;
  if (company >= 0.85) {
    score = 0.2 * company + 0.6 * title + 0.2 * location;
    reasons.push('Same company');
  } else {
    score = 0.5 * title + 0.1 * location;
  }
  if (title >= 0.85) reasons.push('Very similar title');
  else if (title >= 0.6) reasons.push('Similar title');
  if (locA && locB && location >= 0.85) reasons.push('Same location');
  return { score: Math.round(score * 100) / 100, reasons };
}
