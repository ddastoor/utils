// The health calculators' reading of their input (BMI, Calories, Pregnancy Due Date, Body Fat, Ideal Weight, Sleep
// Cycle): what is refused and why, and the figures the tabs show. The formulas themselves are mathcore's (m_bmi, m_bmr,
// m_bodyfat, m_idealweight) and the calendar's.
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
  const bmi = m.bmi(kg, metres), shown = roundDec(bmi, 1);
  const { lo: low, hi: high } = healthyRange(m, metres, cuts, per), w = kg / per;
  return { bmi, shown, category: bmiCategory(shown, cuts), cuts, lo: low, hi: high, off: shown < cuts[0] ? Math.min(roundDec(w - low, 1), -0.1) : shown >= cuts[1] ? Math.max(roundDec(w - high, 1), 0.1) : 0, unit };
}
/** The weights — in steps of 0.1 kg, or 0.1 lb with `per` = LB — whose BMI, shown with one decimal, is Normal at this
 *  height: both ends included. The BMI tab and the Ideal Weight tab show the same range. */
export function healthyRange(m: Mathcore, metres: number, cuts: readonly [number, number, number], per = 1): { lo: number; hi: number } {
  const shownAt = (tenths: number) => roundDec(m.bmi((tenths / 10) * per, metres), 1);
  // in tenths of the unit: start from the formula, then step to the exact ends as the tabs themselves classify
  let lo = Math.ceil(((cuts[0] - 0.05) * metres * metres / per) * 10), hi = Math.floor(((cuts[1] - 0.05) * metres * metres / per) * 10);
  while (shownAt(lo) < cuts[0]) lo++; while (shownAt(lo - 1) >= cuts[0]) lo--;
  while (shownAt(hi) >= cuts[1]) hi--; while (shownAt(hi + 1) < cuts[1]) hi++;
  return { lo: lo / 10, hi: hi / 10 };
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

// ------------------------------------------------------------------ Body fat (US Navy: Hodgdon & Beckett, 1984)
/** American Council on Exercise chart: where Athletic, Fit, Average and Obese begin; below `essential` is less fat than a body needs */
export const BF_CHART = { m: { essential: 2, cuts: [6, 14, 18, 25] }, f: { essential: 10, cuts: [14, 21, 25, 32] } } as const;
export const BF_NAMES = ['Essential fat', 'Athletic', 'Fit', 'Average', 'Obese'] as const;
export interface BodyFat {
  /** per cent, as the formula gives it */ pct: number;
  /** as shown, with one decimal — the category goes by this number */ shown: number;
  category: (typeof BF_NAMES)[number] | 'Below essential fat';
  /** fat and lean mass in kg (one decimal; they add up to the weight), when a weight was given */
  fat: number | null; lean: number | null;
}
export const bodyFatCategory = (shown: number, male: boolean): BodyFat['category'] => {
  const c = BF_CHART[male ? 'm' : 'f'];
  return shown < c.essential ? 'Below essential fat' : BF_NAMES[c.cuts.filter((x) => shown >= x).length];
};
/** Circumferences and height in cm; the hip only counts for women; an empty weight box (NaN) leaves the masses out. */
export function bodyFat(m: Mathcore, male: boolean, cm: number, neck: number, waist: number, hip: number, kg: number): BodyFat {
  within(cm, 100, 250, 'The height', 'cm'); within(neck, 20, 80, 'The neck', 'cm'); within(waist, 40, 250, 'The waist', 'cm');
  if (!male) within(hip, 50, 250, 'The hip', 'cm');
  if (male && !(waist > neck)) throw new Error('The waist must be larger than the neck.');
  const weighed = Number.isFinite(kg);
  if (weighed) within(kg, 20, 400, 'The weight', 'kg');
  const pct = m.bodyfat(male, cm, neck, waist, male ? 0 : hip), shown = roundDec(pct, 1);
  // the formula is a fit to ordinary bodies: outside them it runs below nothing and above everything
  if (!(shown > 0 && shown < 75)) throw new Error(`The formula gives ${Number.isFinite(shown) ? `${shown < 0 ? '−' : ''}${Math.abs(shown).toFixed(1)} %` : 'no answer'} for these measurements, which no body has — check ${male ? 'the neck and the waist' : 'the neck, the waist and the hip'}.`);
  const fat = weighed ? roundDec((kg * shown) / 100, 1) : null;
  return { pct, shown, category: bodyFatCategory(shown, male), fat, lean: fat === null ? null : roundDec(kg - fat, 1) };
}

// ------------------------------------------------------------------ Ideal weight
/** 5 feet: the four formulas count the inches above it and say nothing about shorter people */
export const IW_FROM_CM = 152.4;
export interface IdealWeight {
  /** healthy BMI ranges at this height, as the BMI tab shows them */
  asian: { lo: number; hi: number }; who: { lo: number; hi: number };
  /** Devine, Robinson, Miller, Hamwi — null below 5 feet */
  formulas: Array<[name: string, weight: number]> | null;
  unit: 'kg' | 'lb';
}
export function idealWeight(m: Mathcore, male: boolean, metres: number, unit: 'kg' | 'lb' = 'kg'): IdealWeight {
  const cm = roundDec(metres * 100, 6), per = unit === 'kg' ? 1 : LB;
  within(cm, 100, 250, 'The height', unit === 'kg' ? 'cm' : 'cm (3 ft 4 in to 8 ft 2 in)');
  const w = cm < IW_FROM_CM ? null : m.idealWeight(male, cm);
  return {
    asian: healthyRange(m, metres, BMI_CUTS.asian, per), who: healthyRange(m, metres, BMI_CUTS.who, per), unit,
    formulas: w && [['Devine (1974)', w.devine / per], ['Robinson (1983)', w.robinson / per], ['Miller (1983)', w.miller / per], ['Hamwi (1964)', w.hamwi / per]],
  };
}

// ------------------------------------------------------------------ Sleep cycle
export const SLEEP_CYCLE = 90, SLEEP_CYCLES = [6, 5, 4, 3] as const;
export interface SleepRow { cycles: number; /** hours asleep */ hours: number; /** minute of the day, 0 – 1439 */ at: number; /** −1 the day before, 0 the same day, 1 the next day */ day: -1 | 0 | 1 }
/** "hh:mm" (24 hours) → minute of the day, or null */
export function clockMinutes(time: string): number | null {
  const t = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(time ?? '').trim());
  return t && +t[1] < 24 && +t[2] < 60 ? +t[1] * 60 + +t[2] : null;
}
/** When to go to bed to wake at `time`, or when to wake after going to bed at `time`: whole 90-minute cycles plus the
 *  minutes it takes to fall asleep (an empty box counts as 0). */
export function sleepTimes(mode: 'wake' | 'bed', time: string, fall: number): SleepRow[] {
  const base = clockMinutes(time);
  if (base === null) throw new Error('Choose a time.');
  const f = Number.isFinite(fall) ? fall : 0;
  if (!Number.isInteger(f) || f < 0 || f > 180) throw new Error('Time to fall asleep: a whole number of minutes from 0 to 180.');
  return SLEEP_CYCLES.map((cycles) => {
    const t = mode === 'wake' ? base - cycles * SLEEP_CYCLE - f : base + f + cycles * SLEEP_CYCLE, day = Math.floor(t / 1440) as -1 | 0 | 1;
    return { cycles, hours: (cycles * SLEEP_CYCLE) / 60, at: t - day * 1440, day };
  });
}
/** a minute of the day as the reader's locale writes the time ("9:15 pm", "21:15") */
export function clockText(minute: number, locale?: string): string {
  return new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60).toLocaleTimeString(locale ?? [], { hour: 'numeric', minute: '2-digit' });
}
