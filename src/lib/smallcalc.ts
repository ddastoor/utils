// Tip & Bill Splitter, Fuel Cost and GPA: what each refuses and why, and the figures it shows. A handful of numbers
// each — money in whole paise so that what is shown adds up, grades as a weighted mean.
import { roundDec } from './round';

const MAX_MONEY = 1e13; // ₹10 lakh crore, as in the finance calculators
const whole = (x: number) => Number.isInteger(x);
/** rupees → whole paise, as the amount is written (1.005 is 101 paise) */
const paise = (rupees: number) => Math.round(roundDec(rupees, 2) * 100);

// ------------------------------------------------------------------ Tip & split
export interface TipSplit { tip: number; total: number; each: number; collected: number; /** collected − total: what rounding each share up leaves over */ extra: number }
/** Each person's share is rounded UP — to the paisa, the rupee or ₹10 — so that the bill is always covered; `extra`
 *  says by how much the collection then exceeds it. */
export function tipSplit(bill: number, tipPct: number, people: number, round: 'no' | '1' | '10'): TipSplit {
  if (!(bill > 0)) throw new Error('The bill must be more than 0.');
  if (bill > MAX_MONEY) throw new Error('The bill is too large — this calculator goes up to ₹10 lakh crore.');
  if (tipPct < 0) throw new Error('The tip cannot be negative.');
  if (tipPct > 1000) throw new Error('The tip is too high — at most 1,000 %.');
  if (!whole(people) || people < 1) throw new Error('The number of people must be a whole number, 1 or more.');
  if (people > 100000) throw new Error('Too many people — at most 1,00,000.');
  const B = paise(bill), T = roundDec((B * tipPct) / 100, 0), total = B + T, step = round === 'no' ? 1 : +round * 100;
  const each = Math.ceil(total / (people * step)) * step, collected = each * people; // one division of whole numbers: exact where the bill divides
  return { tip: T / 100, total: total / 100, each: each / 100, collected: collected / 100, extra: (collected - total) / 100 };
}

// ------------------------------------------------------------------ Fuel
export interface FuelCost { km: number; litres: number; cost: number; perPerson: number; perKm: number }
export function fuelCost(distance: number, mileage: number, price: number, trips: 1 | 2, people: number): FuelCost {
  if (!(distance > 0)) throw new Error('The distance must be more than 0.');
  if (distance > 1e9) throw new Error('The distance is too long — at most 100 crore km.');
  if (!(mileage > 0)) throw new Error('The mileage must be more than 0 km/l.');
  if (mileage > 1e6) throw new Error('The mileage is too high — at most 10,00,000 km/l.');
  if (price < 0) throw new Error('The fuel price cannot be negative.');
  if (price > 1e7) throw new Error('The fuel price is too high — at most ₹1 crore a litre.');
  const n = Number.isFinite(people) ? people : 1; // an empty box: one person
  if (!whole(n) || n < 1) throw new Error('The number of people must be a whole number, 1 or more.');
  if (n > 100000) throw new Error('Too many people — at most 1,00,000.');
  const km = distance * trips, litres = km / mileage, cost = litres * price;
  return { km, litres, cost, perPerson: cost / n, perKm: price / mileage };
}
/** "23.3 litres", "1 litre", "0.045 litres" — small amounts keep three decimals */
export function litresText(l: number): string {
  const shown = roundDec(l, l < 1 ? 3 : 1);
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(shown)} ${shown === 1 ? 'litre' : 'litres'}`;
}

// ------------------------------------------------------------------ GPA
export interface Gpa { gpa: number; credits: number; subjects: number; /** rows left out, with the reason */ problems: string[] }
/** Credit-weighted mean of the grade points. A row with both boxes empty is skipped without a word; a row that cannot
 *  be used (one box empty, a grade outside the scale, negative credits) is left out and named. */
export function gpaOf(rows: Array<{ g: number; c: number }>, scale: 10 | 4): Gpa {
  let sum = 0, credits = 0, subjects = 0; const problems: string[] = [];
  rows.forEach(({ g, c }, i) => {
    const hasG = Number.isFinite(g), hasC = Number.isFinite(c), name = `Subject ${i + 1}`;
    if (!hasG && !hasC) return;
    if (!hasG) return void problems.push(`${name}: the grade point is missing — left out.`);
    if (!hasC) return void problems.push(`${name}: the credits are missing — left out.`);
    if (g < 0 || g > scale) return void problems.push(`${name}: a grade point of ${g} is outside the ${scale}-point scale — left out.`);
    if (c < 0) return void problems.push(`${name}: credits cannot be negative — left out.`);
    sum += g * c; credits += c; subjects++;
  });
  return { gpa: credits > 0 ? sum / credits : NaN, credits, subjects, problems };
}
