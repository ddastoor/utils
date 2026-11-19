// The health calculators' reading of their input (BMI, Calories, Pregnancy Due Date): what is refused and why, and the
// figures the tabs show. The formulas themselves are mathcore's (m_bmi, m_bmr) and the calendar's.
import type { Mathcore } from '../wasm/mathcore';
import { roundDec } from './round';
import { DAY, parseD, addDays, daysBetween } from './dates';

export const IN = 0.0254, LB = 0.45359237; // metres in an inch, kilograms in a pound (exact, by definition)

function within(x: number, lo: number, hi: number, what: string, unit: string) {
  if (!(x >= lo && x <= hi)) throw new Error(`${what} must be between ${lo.toLocaleString('en-IN')} and ${hi.toLocaleString('en-IN')} ${unit}.`);
}

// ------------------------------------------------------------------ BMI
export const BMI_CUTS = { asian: [18.5, 23, 25] as const, who: [18.5, 25, 30] as const };
export const BMI_NAMES = ['Underweight', 'Normal', 'Overweight', 'Obese'] as const;
export interface Bmi {
  /** kg / m² */ bmi: number;
  /** as shown, with one decimal — the category goes by this number, so 76.8 kg at 1.60 m (29.9999…) is 30.0 and obese */
  shown: number;
  category: (typeof BMI_NAMES)[number];
  cuts: readonly [number, number, number];
  /** the weights, in steps of 0.1 kg (or 0.1 lb), that this tab calls Normal at this height: both ends included */
  lo: number; hi: number;
  /** how far the weight is outside that range (negative: below it), 0 inside; in `unit` */
  off: number;
  unit: 'kg' | 'lb';
}
/** height in metres, weight in kilograms */
export const bmiCategory = (shown: number, cuts: readonly [number, number, number]) => BMI_NAMES[shown < cuts[0] ? 0 : shown < cuts[1] ? 1 : shown < cuts[2] ? 2 : 3];
export function bmiOf(m: Mathcore, metres: number, kg: number, which: keyof typeof BMI_CUTS, unit: 'kg' | 'lb' = 'kg'): Bmi {
  within(roundDec(metres * 100, 6), 50, 300, 'The height', unit === 'kg' ? 'cm' : 'cm (1 ft 8 in to 9 ft 10 in)');
  if (unit === 'kg') within(kg, 2, 700, 'The weight', 'kg'); else within(roundDec(kg / LB, 6), 4, 1500, 'The weight', 'lb');
  const cuts = BMI_CUTS[which], per = unit === 'kg' ? 1 : LB; // kilograms in one unit of weight
  const shownAt = (tenths: number) => roundDec(m.bmi((tenths / 10) * per, metres), 1);
  const bmi = m.bmi(kg, metres), shown = roundDec(bmi, 1);
  // the range in tenths of the unit: start from the formula, then step to the exact ends as the tab itself classifies
  let lo = Math.ceil(((cuts[0] - 0.05) * metres * metres / per) * 10), hi = Math.floor(((cuts[1] - 0.05) * metres * metres / per) * 10);
  while (shownAt(lo) < cuts[0]) lo++; while (shownAt(lo - 1) >= cuts[0]) lo--;
  while (shownAt(hi) >= cuts[1]) hi--; while (shownAt(hi + 1) < cuts[1]) hi++;
  const w = kg / per, low = lo / 10, high = hi / 10;
  return { bmi, shown, category: bmiCategory(shown, cuts), cuts, lo: low, hi: high, off: shown < cuts[0] ? Math.min(roundDec(w - low, 1), -0.1) : shown >= cuts[1] ? Math.max(roundDec(w - high, 1), 0.1) : 0, unit };
}
/** feet and inches → metres. Inches may be 12 or more (67 in), feet may be 0. */
export function feetInches(ft: number, inch: number): number {
  const f = Number.isFinite(ft) ? ft : 0, i = Number.isFinite(inch) ? inch : 0;
  if (f < 0 || i < 0) throw new Error('Feet and inches cannot be negative.');
  return (f * 12 + i) * IN;
}

// ------------------------------------------------------------------ Calories (Mifflin–St Jeor)
export const ACTIVITY: Array<[string, string]> = [['1.2', 'Sedentary (little exercise)'], ['1.375', 'Light (1–3 days/week)'], ['1.55', 'Moderate (3–5 days/week)'], ['1.725', 'Active (6–7 days/week)'], ['1.9', 'Very active (physical job)']];
export interface Calories { bmr: number; tdee: number; targets: Array<{ label: string; kcal: number; low: boolean }>; /** kcal a day below which a diet needs supervision */ floor: number }
export function calorieNeeds(m: Mathcore, male: boolean, age: number, cm: number, kg: number, activity: number): Calories {
  within(age, 15, 110, 'The age', 'years (the formula is for adults)');
  within(cm, 100, 250, 'The height', 'cm'); within(kg, 20, 400, 'The weight', 'kg');
  const bmr = m.bmr(male, kg, cm, age), tdee = bmr * activity, floor = male ? 1500 : 1200;
  const t = (label: string, d: number) => ({ label, kcal: tdee + d, low: tdee + d < floor });
  // 7,700 kcal to a kilogram of body fat: 0.25 kg a week is 275 kcal a day
  return { bmr, tdee, floor, targets: [t('Mild weight loss (−0.25 kg/wk)', -275), t('Weight loss (−0.5 kg/wk)', -550), t('Weight gain (+0.25 kg/wk)', 275), t('Weight gain (+0.5 kg/wk)', 550)] };
}

// ------------------------------------------------------------------ Pregnancy due date (Naegele's rule)
export interface DueDate {
  lmp: Date; due: Date; conception: Date; firstEnds: Date; secondEnds: Date;
  /** days of pregnancy completed today (counted from the period, as doctors do), or null when the period lies in the future */
  days: number | null;
  /** days from today to the due date (negative: it has passed) */
  toGo: number;
  trimester: 'First trimester' | 'Second trimester' | 'Third trimester' | null;
}
/** lmp and today as yyyy-mm-dd. An empty cycle box is the usual 28 days. */
export function dueDate(lmpIso: string, cycle: number, todayIso: string): DueDate {
  if (!lmpIso) throw new Error('Pick the first day of the last period.');
  const lmp = parseD(lmpIso), today = parseD(todayIso);
  if (!lmp || !today) throw new Error('First day of last period: a date from the year 1 to 9999, please.');
  const c = Number.isFinite(cycle) ? cycle : 28;
  if (!Number.isInteger(c) || c < 20 || c > 45) throw new Error('Cycle length: a whole number of days from 20 to 45 (28 is usual).');
  const adj = c - 28, at = (n: number) => addDays(lmp, n + adj);
  const due = at(280);
  if (due.getUTCFullYear() > 9999) throw new Error('First day of last period: a date from the year 1 to 9998, please.');
  const since = daysBetween(lmp, today), days = since < 0 ? null : Math.max(0, since - adj);
  return { lmp, due, conception: at(14), firstEnds: at(97), secondEnds: at(195), days, toGo: daysBetween(today, due), trimester: days === null ? null : days < 98 ? 'First trimester' : days < 196 ? 'Second trimester' : 'Third trimester' };
}
export { DAY };
