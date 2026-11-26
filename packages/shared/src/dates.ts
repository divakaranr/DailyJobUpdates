/**
 * Date helpers. All job dates are stored as calendar dates in `YYYY-MM-DD` form.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

function build(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Parses common human date formats into `YYYY-MM-DD`. Numeric dates are read
 * day-first (DD/MM/YYYY) unless `dayFirst` is false. Returns null when the
 * input cannot be parsed unambiguously — it never guesses a missing year.
 */
export function parseDateLoose(input: unknown, opts: { dayFirst?: boolean } = {}): string | null {
  const dayFirst = opts.dayFirst ?? true;
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input.toISOString().slice(0, 10);
  }
  if (typeof input !== 'string') return null;
  const s = input
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s].*)?$/);
  if (m) return build(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return build(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    return dayFirst ? build(y, b, a) : build(y, a, b);
  }

  // 15 March 2025 / 15-Mar-2025
  m = s.match(/^(\d{1,2})[\s-]+([a-z]+)\.?[\s-]+(\d{2,4})$/);
  if (m && MONTHS[m[2]]) return build(+m[3], MONTHS[m[2]], +m[1]);

  // March 15 2025
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2})\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) return build(+m[3], MONTHS[m[1]], +m[2]);

  return null;
}

export function todayYmd(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True when the calendar date lies strictly before today. */
export function isPastDate(ymd: string | null | undefined, now: Date = new Date()): boolean {
  if (!ymd) return false;
  return ymd < todayYmd(now);
}

export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function dateToYmd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function endOfDayUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

const DISPLAY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2025-03-15` → `15 Mar 2025` (locale-independent so server and client render identically). */
export function formatYmd(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  return `${+m[3]} ${DISPLAY_MONTHS[+m[2] - 1]} ${m[1]}`;
}
