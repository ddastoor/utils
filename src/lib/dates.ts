// The Date Calculator's calendar arithmetic (src/tools/calculators.ts `dates`, and the due-date tab). Dates are days
// of the proleptic Gregorian calendar, handled as UTC midnights so that no time zone or clock change can shift
// them; the calendar itself is the browser's Date (compiled code) — this file is the glue around it, kept in
// TypeScript under the compute rule ("Date / Intl handling"). tests/unit/dates.test.mjs holds it to Python's
// datetime and calendar modules.
export const DAY = 86400000;

/** 'yyyy-mm-dd' → the UTC midnight of that day, for the years 1 … 9999; null when it is not such a date.
 *  (Date.UTC reads the years 0 … 99 as 1900 … 1999, so the year is set separately.) */
export function parseD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return null;
  const t = new Date(0); t.setUTCFullYear(y, mo - 1, d); t.setUTCHours(0, 0, 0, 0);
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t : null;     // 31 February is no date
}
/** the day as yyyy-mm-dd (years 1 … 9999) */
export const isoD = (d: Date) => `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
/** is the date within what a date box can hold (1 January 1 … 31 December 9999)? */
export const inRange = (d: Date) => Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 1 && d.getUTCFullYear() <= 9999;
/** today's date where the reader is — not the date in UTC (which is still yesterday in India until 05:30) */
export const localToday = (now = new Date()) => `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const fmtD = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dim = (y: number, m: number) => { const t = new Date(0); t.setUTCFullYear(y, m + 1, 0); return t.getUTCDate(); };
export const plural = (n: number, word: string) => `${n.toLocaleString('en-IN')} ${word}${n === 1 ? '' : 's'}`;

/** a + n calendar months, clamped to the month's last day (31 Jan + 1 month = 28 / 29 Feb), as Excel's EDATE */
export function addMonths(a: Date, n: number): Date {
  const t = a.getUTCFullYear() * 12 + a.getUTCMonth() + n, y = Math.floor(t / 12), m = t - y * 12;
  const r = new Date(0); r.setUTCFullYear(y, m, Math.min(a.getUTCDate(), dim(y, m))); r.setUTCHours(0, 0, 0, 0);
  return r;
}
export const addDays = (a: Date, n: number) => new Date(a.getTime() + n * DAY);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
/** The span between two dates as whole years and months counted from the earlier one (month ends clamped, so that
 *  it is the opposite of adding: 31 Jan → 28 Feb is one month), then the days left over — never negative. */
export function ymd(a: Date, b: Date): { y: number; m: number; d: number } {
  const [s, e] = a <= b ? [a, b] : [b, a];
  let n = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth();
  if (addMonths(s, n) > e) n--;
  return { y: Math.floor(n / 12), m: n % 12, d: daysBetween(addMonths(s, n), e) };
}
/** start ± (years, months) first — month end clamped — then ± (weeks, days). Whole numbers only. */
export function addSpan(a: Date, sign: 1 | -1, y: number, m: number, w: number, d: number): Date {
  for (const [v, name] of [[y, 'Years'], [m, 'Months'], [w, 'Weeks'], [d, 'Days']] as const) if (!Number.isInteger(v)) throw new Error(`${name}: a whole number, please (${v} is not one).`);
  const months = sign * (12 * y + m), days = sign * (7 * w + d);
  if (Math.abs(months) > 120000 || Math.abs(days) > 3660000) throw new Error('That is further than this calendar reaches (the years 1 to 9999).');
  const r = addDays(addMonths(a, months), days);
  if (!inRange(r)) throw new Error('That is further than this calendar reaches (the years 1 to 9999).');
  return r;
}
/** The birthday on or after `on`. Someone born on 29 February has it on 28 February in years without one. */
export function nextBirthday(dob: Date, on: Date): Date {
  let next = addMonths(dob, (on.getUTCFullYear() - dob.getUTCFullYear()) * 12);
  if (next < on) next = addMonths(dob, (on.getUTCFullYear() + 1 - dob.getUTCFullYear()) * 12);
  return next;
}
