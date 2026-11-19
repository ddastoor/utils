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

// ------------------------------------------------------------------ Loan prepayment
export interface PrepayPlan {
  months: number; emi: number;
  /** interest over the loan without prepaying, and with it */
  baseInterest: number; interest: number; saved: number;
  monthsTaken: number; monthsSaved: number;
  /** the instalment after the prepayment(s): the same in 'emi' mode */
  newEmi: number;
  /** what was actually prepaid (a prepayment is never more than what is owed) */
  prepaid: number;
  /** a prepayment — not an instalment — paid the loan off */
  paidOff: boolean;
}
export function prepayPlan(m: Mathcore, p: number, r: number, years: number, pp: number, when: number, yearly: boolean, keepTenure: boolean): PrepayPlan {
  money(p, 'The outstanding principal'); rate(r);
  const { months } = wholeMonths(years, 'y', 'The remaining tenure');
  money(pp, 'The prepayment');
  if (!Number.isInteger(when) || when < 0) throw new Error('Prepay after: a whole number of months, 0 or more (0 = before the next instalment).');
  if (when >= months) throw new Error(`Prepay after: the loan has only ${months.toLocaleString('en-IN')} months left — choose a month before its last.`);
  const x = m.prepay(p, r, months, pp, when, yearly, keepTenure);
  result(x.emi, x.baseInterest, x.interest);
  return { months, emi: x.emi, baseInterest: x.baseInterest, interest: x.interest, saved: x.baseInterest - x.interest, monthsTaken: x.monthsTaken, monthsSaved: months - x.monthsTaken, newEmi: x.newEmi, prepaid: x.prepaid,
    paidOff: x.paidOff };
}

// ------------------------------------------------------------------ PPF
export const PPF_MIN = 500, PPF_MAX = 150000;
export interface PpfPlan { years: number; balance: number; invested: number; interest: number; /** the account matures after 15 years and then in blocks of 5 */ atMaturity: boolean }
export function ppfPlan(m: Mathcore, yearly: number, r: number, y: number): PpfPlan {
  if (!(yearly >= PPF_MIN)) throw new Error('A PPF account needs at least ₹500 a year.');
  if (yearly > PPF_MAX) throw new Error('The PPF limit is ₹1,50,000 per financial year.');
  rate(r);
  if (!Number.isInteger(y) || y < 1 || y > 50) throw new Error('Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).');
  const balance = m.ppf(yearly, r, y), invested = yearly * y;
  result(balance);
  return { years: y, balance, invested, interest: balance - invested, atMaturity: y >= 15 && y % 5 === 0 };
}

// ------------------------------------------------------------------ EPF
export interface EpfPlan { years: number; corpus: number; own: number; employer: number; eps: number; interest: number; opening: number }
export function epfPlan(m: Mathcore, basic: number, age: number, retire: number, balance: number, inc: number, r: number): EpfPlan {
  money(basic, 'The monthly basic + DA');
  if (!Number.isInteger(age) || age < 15 || age > 74) throw new Error('Current age: a whole number of years from 15 to 74.');
  if (!Number.isInteger(retire) || retire <= age || retire > 75) throw new Error(`Retirement age: a whole number of years above ${age}, at most 75.`);
  const opening = Number.isFinite(balance) ? balance : 0, raise = Number.isFinite(inc) ? inc : 0; // empty boxes: nothing yet, no raise
  if (opening < 0) throw new Error('The current EPF balance cannot be negative.');
  if (opening > MAX_MONEY) throw new Error('The current EPF balance is too large — this calculator goes up to ₹10 lakh crore.');
  if (raise < 0) throw new Error('The yearly salary increase cannot be negative.');
  if (raise > 100) throw new Error('The yearly salary increase is too high — at most 100 %.');
  rate(r, 'The EPF interest rate');
  const x = m.epf(basic, age, retire, opening, raise, r);
  result(x.corpus);
  return { years: retire - age, corpus: x.corpus, own: x.own, employer: x.employer, eps: x.eps, interest: x.interest, opening };
}

// ------------------------------------------------------------------ NPS
/** the least share of the corpus that must buy an annuity at 60: government employees 40 %; everyone else 20 %
 *  since PFRDA's exit rules of December 2025 (40 % before) */
export const NPS_MIN_ANNUITY = { gov: 40, other: 20 } as const;
export interface NpsPlan { months: number; corpus: number; lump: number; annuity: number; pension: number; invested: number }
export function npsPlan(m: Mathcore, monthly: number, age: number, r: number, sector: keyof typeof NPS_MIN_ANNUITY, annuityPct: number, annuityRate: number): NpsPlan {
  money(monthly, 'The monthly contribution');
  if (!Number.isInteger(age) || age < 18 || age > 59) throw new Error('Current age: a whole number of years from 18 to 59 (this calculator runs to the age of 60).');
  rate(r, 'The expected return');
  const least = NPS_MIN_ANNUITY[sector];
  if (!(annuityPct >= least)) throw new Error(`At least ${least} % of the corpus must buy an annuity (${sector === 'gov' ? 'government subscribers' : 'non-government subscribers, since December 2025'}).`);
  if (annuityPct > 100) throw new Error('The annuity cannot take more than 100 % of the corpus.');
  if (annuityRate < 0) throw new Error('The annuity rate cannot be negative.');
  if (annuityRate > 100) throw new Error('The annuity rate is too high — at most 100 % a year.');
  const x = m.nps(monthly, age, r, annuityPct, annuityRate);
  result(x.corpus);
  return { months: (60 - age) * 12, corpus: x.corpus, lump: x.lump, annuity: x.corpus - x.lump, pension: x.pension, invested: x.invested };
}

// ------------------------------------------------------------------ Inflation
export interface Inflation { future: number; worth: number; factor: number; lostPct: number; /** years for prices to double (rate above 0) or to halve (below 0); null at 0 % */ doubling: number | null }
export function inflation(m: Mathcore, amount: number, r: number, y: number): Inflation {
  money(amount, 'The amount');
  if (r <= -100) throw new Error('The inflation rate must be above −100 % a year.');
  rate(Math.max(r, 0), 'The inflation rate');
  years(y, 'The number of years');
  const future = m.sip(amount, r, y, 0, true).value, factor = future / amount; // (1 + r)^y, by the engine's growth()
  result(future, amount / factor);
  return { future, worth: amount / factor, factor, lostPct: (1 - 1 / factor) * 100, doubling: r === 0 ? null : Math.log(r > 0 ? 2 : 0.5) / Math.log1p(r / 100) };
}
