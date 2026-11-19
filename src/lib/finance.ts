// The finance calculators' reading of their input (EMI, SIP, FD / RD, GST): what is refused and why, how a period
// becomes whole months, and the numbers the tabs show. The arithmetic is mathcore's (wasm/mathcore); this file checks,
// asks and shapes — so that a tab and the unit suite (tests/unit/finance.test.mjs) go through the same code.
import type { Mathcore } from '../wasm/mathcore';

/** ₹10 lakh crore: up to here a double holds every paisa, and the amounts are still amounts of money */
export const MAX_MONEY = 1e13;
/** 100 years: longer than any loan, deposit or plan — and the schedules have a row per year */
export const MAX_MONTHS = 1200;
/** percent a year */
export const MAX_RATE = 1000;
/** a result beyond this (₹10,000 lakh crore) has no exact rupees left in a double and is no answer to a real question */
export const MAX_RESULT = 1e16;

const WHOLE = 1e-9; // a period this close to a whole number of months is whole (0.1 + 0.2 years)

/** an amount of money: above zero, at most ₹10 lakh crore */
export function money(x: number, name: string) {
  if (!(x > 0)) throw new Error(`${name} must be more than 0.`);
  if (x > MAX_MONEY) throw new Error(`${name} is too large — this calculator goes up to ₹10 lakh crore.`);
}
/** an interest rate in percent a year: 0 … 1,000 */
export function rate(x: number, name = 'The interest rate') {
  if (x < 0) throw new Error(`${name} cannot be negative.`);
  if (x > MAX_RATE) throw new Error(`${name} is too high — at most 1,000 % a year.`);
}
/** "20 years", "1 year 6 months", "1 month" */
export function span(months: number): string {
  const y = Math.floor(months / 12), m = months % 12, s = (n: number, w: string) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;
  return [y ? s(y, 'year') : '', m || !y ? s(m, 'month') : ''].filter(Boolean).join(' ');
}
/** A period typed in years or months, as whole months (1 … 1,200). `rounded`: what was typed is not a whole number
 *  of months — instalments are monthly, so the nearest month is taken, and the tab says so. */
export function wholeMonths(n: number, unit: 'y' | 'm', name = 'The tenure'): { months: number; rounded: boolean } {
  const exact = unit === 'y' ? n * 12 : n;
  if (!(exact > 0)) throw new Error(`${name} must be more than 0.`);
  if (exact > MAX_MONTHS + 0.5) throw new Error(`${name} is too long — at most 100 years (1,200 months).`);
  const months = Math.round(exact);
  if (months < 1) throw new Error(`${name} must be at least 1 month.`);
  return { months, rounded: Math.abs(months - exact) > WHOLE };
}
/** a period in years that need not be whole months (a deposit, a lump sum): above 0, at most 100 years */
export function years(n: number, name = 'The period') {
  if (!(n > 0)) throw new Error(`${name} must be more than 0.`);
  if (n > MAX_MONTHS / 12) throw new Error(`${name} is too long — at most 100 years.`);
}
function result(...xs: number[]) {
  if (xs.some((x) => !Number.isFinite(x) || Math.abs(x) > MAX_RESULT)) throw new Error('The result is beyond ₹10,000 lakh crore — more than this calculator can show. Check the rate and the period.');
}

// ------------------------------------------------------------------ EMI
export interface EmiPlan {
  months: number; rounded: boolean;
  /** the instalment, not rounded (the tab rounds it to rupees, as lenders print it) */
  emi: number;
  /** instalment × months and what of it is interest — on the exact instalment, as the lenders' own calculators show it */
  total: number; interest: number;
  /** principal as a percentage of everything paid */
  principalShare: number;
  years: Array<{ principal: number; interest: number; balance: number }>;
}
export function emiPlan(m: Mathcore, p: number, r: number, n: number, unit: 'y' | 'm'): EmiPlan {
  money(p, 'The loan amount'); rate(r);
  const { months, rounded } = wholeMonths(n, unit);
  const emi = m.emi(p, r, months), total = emi * months;
  result(emi, total);
  return { months, rounded, emi, total, interest: total - p, principalShare: (p / total) * 100, years: m.amortizeYearly(p, r, months) };
}

// ------------------------------------------------------------------ SIP / lump sum
export interface SipPlan { months: number | null; rounded: boolean; invested: number; value: number; gains: number; multiple: number }
export function sipPlan(m: Mathcore, mode: 'sip' | 'lump', amount: number, r: number, y: number, stepup: number): SipPlan {
  money(amount, mode === 'sip' ? 'The monthly amount' : 'The amount');
  if (r <= -100) throw new Error('The expected return must be above −100 % a year (at −100 % everything is lost).');
  rate(Math.max(r, 0), 'The expected return');
  let months: number | null = null, rounded = false;
  if (mode === 'sip') {
    ({ months, rounded } = wholeMonths(y, 'y', 'The period'));
    if (stepup < 0) throw new Error('The yearly step-up cannot be negative.');
    if (stepup > MAX_RATE) throw new Error('The yearly step-up is too high — at most 1,000 %.');
  } else years(y);
  const { invested, value } = m.sip(amount, r, mode === 'sip' ? months! / 12 : y, mode === 'sip' ? stepup : 0, mode === 'lump');
  result(invested, value);
  return { months, rounded, invested, value, gains: value - invested, multiple: value / invested };
}

// ------------------------------------------------------------------ FD / RD
export interface FdPlan { months: number | null; rounded: boolean; invested: number; value: number; interest: number; /** percent a year; null for simple interest */ yield: number | null }
export function fdPlan(m: Mathcore, kind: 'fd' | 'rd', amount: number, r: number, y: number, comp: number): FdPlan {
  money(amount, kind === 'fd' ? 'The deposit' : 'The monthly instalment'); rate(r);
  let months: number | null = null, rounded = false;
  if (kind === 'rd') ({ months, rounded } = wholeMonths(y, 'y')); else years(y, 'The tenure');
  const { invested, value } = m.fd(amount, r, kind === 'rd' ? months! / 12 : y, comp, kind === 'rd');
  result(invested, value);
  // what ₹100 earns in one year at this rate and compounding
  return { months, rounded, invested, value, interest: value - invested, yield: comp ? m.fd(100, r, 1, comp, false).value - 100 : null };
}

// ------------------------------------------------------------------ GST
export interface GstSplit { rate: number; base: number; cgst: number; sgst: number; igst: number; tax: number; total: number; /** the amount had more than two decimals and was rounded to paise */ rounded: boolean }
/** GST on an amount (before tax, or containing it), in whole paise as on an invoice. A negative amount (a credit
 *  note, a refund) gives the mirror image. */
export function gstSplit(m: Mathcore, amount: number, ratePct: number, inclusive: boolean, intra: boolean): GstSplit {
  if (Math.abs(amount) > MAX_MONEY) throw new Error('The amount is too large — this calculator goes up to ₹10 lakh crore.');
  if (ratePct < 0) throw new Error('The GST rate cannot be negative.');
  if (ratePct > 100) throw new Error('The GST rate is too high — at most 100 %.');
  const r = Math.round(ratePct * 1000) / 1000, g = m.gst(amount, r, inclusive, intra);
  if (!g) throw new Error('These numbers are out of range.');
  const typed = inclusive ? g.total : g.base;
  return { rate: r, ...g, tax: g.cgst + g.sgst + g.igst, rounded: Math.abs(typed - amount) > 1e-9 * Math.max(1, Math.abs(amount)) };
}
