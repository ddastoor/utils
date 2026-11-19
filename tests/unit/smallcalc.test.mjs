// Tip & Bill Splitter, Fuel Cost and GPA (src/lib/smallcalc.ts) against exact arithmetic on the typed numbers
// (tests/fixtures/smallcalc/reference.json — Python's decimal and fractions, scripts/make-smallcalc-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, root }) => {
  const S = await load('/src/lib/smallcalc.ts');
  const { fmtN } = await load('/src/lib/form.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/smallcalc/reference.json'), 'utf8'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
  const P = (x) => Math.round(x * 100);

  // ---- 2,112 bills: every figure to the paisa, and the figures add up
  let bad = [];
  for (const [bill, pct, people, rnd, tip, total, each, collected] of ref.tip) {
    const r = S.tipSplit(parseFloat(bill), parseFloat(pct), people, rnd), at = `₹${bill} + ${pct} % ÷ ${people} (${rnd})`;
    if (P(r.tip) !== tip || P(r.total) !== total || P(r.each) !== each || P(r.collected) !== collected) bad.push(`${at}: ${[P(r.tip), P(r.total), P(r.each), P(r.collected)]} ≠ ${[tip, total, each, collected]}`);
    if (P(r.each) * people !== P(r.collected) || P(r.collected) - P(r.total) !== P(r.extra) || r.extra < 0) bad.push(`${at}: the shares do not add up`);
    const step = rnd === 'no' ? 1 : +rnd * 100;
    if (P(r.each) % step !== 0 || P(r.extra) >= people * step) bad.push(`${at}: not rounded up by the least possible`);
  }
  t.ok(ref.tip.length === 2112 && !bad.length, `${ref.tip.length} bills: tip, total, each share and the collection in whole paise; share × people = collected, never less than the bill, never a whole step too much ${bad.slice(0, 3).join(' | ')}`);
  // ---- known bills
  const show = (r) => [r.each, r.total, r.tip, r.collected, r.extra].join(' ');
  t.eq(show(S.tipSplit(2400, 10, 4, 'no')), '660 2640 240 2640 0', '₹2,400 + 10 % among 4: ₹660 each');
  t.eq(show(S.tipSplit(1000, 15, 3, 'no')), '383.34 1150 150 1150.02 0.02', '₹1,150 among 3: ₹383.34 each — three times ₹383.33 would leave a paisa unpaid (the tab showed ₹383.33 and "Collected ₹1,150")');
  t.eq(show(S.tipSplit(1000, 15, 3, '1')), '384 1150 150 1152 2', 'to the rupee: ₹384 each, ₹2 over');
  t.eq(show(S.tipSplit(1000, 15, 3, '10')), '390 1150 150 1170 20', 'to ₹10: ₹390 each, ₹20 over');
  t.eq(show(S.tipSplit(1000, 0, 1, 'no')), '1000 1000 0 1000 0', 'no tip, one person');
  t.eq(show(S.tipSplit(100, 12.5, 2, 'no')), '56.25 112.5 12.5 112.5 0', 'a tip of 12.5 %');
  t.eq(show(S.tipSplit(1.005, 0, 1, 'no')), '1.01 1.01 0 1.01 0', 'a bill of ₹1.005 is ₹1.01');
  t.eq(show(S.tipSplit(0.05, 50, 1, 'no')), '0.08 0.08 0.03 0.08 0', 'half a paisa of tip is rounded up: 5 paise + 50 % = 8 paise');
  t.eq(S.tipSplit(1e13, 10, 3, 'no').total, 1.1e13, '₹10 lakh crore');
  for (const [args, reason] of [[[0, 10, 4], 'The bill must be more than 0.'], [[-2400, 10, 4], 'The bill must be more than 0.'], [[2e13, 10, 4], 'The bill is too large — this calculator goes up to ₹10 lakh crore.'], [[2400, -10, 4], 'The tip cannot be negative.'], [[2400, 1001, 4], 'The tip is too high — at most 1,000 %.'],
    [[2400, 10, 0], 'The number of people must be a whole number, 1 or more.'], [[2400, 10, -3], 'The number of people must be a whole number, 1 or more.'], [[2400, 10, 2.5], 'The number of people must be a whole number, 1 or more.'], [[2400, 10, 1e6], 'Too many people — at most 1,00,000.']])
    t.eq(why(() => S.tipSplit(...args, 'no')), reason, `tipSplit(${args}) is refused`);

  // ---- 245 trips
  bad = [];
  for (const [dist, eff, price, trips, people, km, litres, cost, per, perKm] of ref.fuel) {
    const f = S.fuelCost(parseFloat(dist), parseFloat(eff), parseFloat(price), trips, people);
    if (f.km !== km || rel(f.litres, litres) > 1e-15 || rel(f.cost, cost) > 4e-16 || rel(f.perPerson, per) > 6e-16 || rel(f.perKm, perKm) > 3e-16) bad.push(`${dist} km × ${trips} at ${eff} km/l, ₹${price}/l ÷ ${people}: ${JSON.stringify(f)} ≠ ${[km, litres, cost, per, perKm]}`);
  }
  t.ok(ref.fuel.length === 245 && !bad.length, `${ref.fuel.length} trips: distance, litres, cost, cost a person and cost a kilometre to the last digits ${bad.slice(0, 3).join(' | ')}`);
  { const f = S.fuelCost(350, 15, 105, 1, 1); t.ok(f.cost === 2450 && f.perKm === 7 && f.km === 350 && S.litresText(f.litres) === '23.3 litres', '350 km at 15 km/l and ₹105 a litre: ₹2,450, 23.3 litres, ₹7 a km'); }
  { const f = S.fuelCost(350, 15, 105, 2, 4); t.ok(f.cost === 4900 && f.perPerson === 1225 && f.km === 700, 'there and back among four: ₹1,225 each'); }
  t.eq(S.fuelCost(350, 15, 105, 1, NaN).perPerson, 2450, 'an empty "people" box is one person');
  t.eq(S.fuelCost(350, 15, 0, 1, 1).cost, 0, 'free fuel costs nothing');
  for (const [l, text] of [[23.333, '23.3 litres'], [1, '1 litre'], [1.04, '1 litre'], [0.96, '0.96 litres'], [2, '2 litres'], [0.0451, '0.045 litres'], [1234.56, '1,234.6 litres'], [0.5, '0.5 litres'], [1.05, '1.1 litres']]) t.eq(S.litresText(l), text, `litresText(${l})`);
  for (const [args, reason] of [[[0, 15, 105, 1, 1], 'The distance must be more than 0.'], [[-350, 15, 105, 1, 1], 'The distance must be more than 0.'], [[350, 0, 105, 1, 1], 'The mileage must be more than 0 km/l.'], [[350, -15, 105, 1, 1], 'The mileage must be more than 0 km/l.'],
    [[350, 15, -105, 1, 1], 'The fuel price cannot be negative.'], [[350, 15, 105, 1, 0], 'The number of people must be a whole number, 1 or more.'], [[350, 15, 105, 1, 2.5], 'The number of people must be a whole number, 1 or more.'], [[2e9, 15, 105, 1, 1], 'The distance is too long — at most 100 crore km.'],
    [[350, 2e6, 105, 1, 1], 'The mileage is too high — at most 10,00,000 km/l.'], [[350, 15, 2e7, 1, 1], 'The fuel price is too high — at most ₹1 crore a litre.']])
    t.eq(why(() => S.fuelCost(...args)), reason, `fuelCost(${args}) is refused`);

  // ---- 400 grade sheets
  bad = [];
  for (const [scale, rows, mean, text, pct, credits] of ref.gpa) {
    const r = S.gpaOf(rows.map(([g, c]) => ({ g: parseFloat(g), c: parseFloat(c) })), scale), at = `${scale}-point ${JSON.stringify(rows)}`;
    if (mean === null) { if (!Number.isNaN(r.gpa) || r.credits !== 0) bad.push(`${at}: no credits, yet ${r.gpa}`); continue; }
    if (rel(r.gpa, mean) > 1e-14 || r.credits !== credits || r.subjects !== rows.length || r.problems.length) bad.push(`${at}: ${JSON.stringify(r)} ≠ ${mean}`);
    if (fmtN(r.gpa, 2) !== text || (pct !== null && fmtN(r.gpa * 9.5, 2) !== pct)) bad.push(`${at}: shown as ${fmtN(r.gpa, 2)} / ${fmtN(r.gpa * 9.5, 2)}%, exact ${text} / ${pct}%`);
  }
  t.ok(ref.gpa.length === 400 && !bad.length, `${ref.gpa.length} grade sheets: the weighted mean, and the two decimals the tab shows of it and of the percentage, as exact fractions rounded half up ${bad.slice(0, 3).join(' | ')}`);
  { const r = S.gpaOf([{ g: 9, c: 4 }, { g: 8, c: 3 }, { g: 10, c: 2 }], 10); t.ok(fmtN(r.gpa, 2) === '8.89' && fmtN(r.gpa * 9.5, 2) === '84.44' && r.credits === 9 && r.subjects === 3, 'the example: 80 / 9 = 8.89, 84.44 %'); }
  { const r = S.gpaOf([{ g: 8.67, c: 3 }, { g: 8.68, c: 3 }], 10); t.eq(fmtN(r.gpa, 2), '8.68', '8.675 exactly is written 8.68'); }
  { const r = S.gpaOf([{ g: 9, c: 4 }, { g: NaN, c: NaN }, { g: 8, c: 3 }], 10); t.ok(r.subjects === 2 && !r.problems.length, 'an empty row is skipped without a word'); }
  { const r = S.gpaOf([{ g: 9, c: 4 }, { g: 11, c: 3 }, { g: -1, c: 3 }, { g: 8, c: -2 }, { g: NaN, c: 4 }, { g: 7, c: NaN }], 10);
    t.eq(r.problems.join(' | '), 'Subject 2: a grade point of 11 is outside the 10-point scale — left out. | Subject 3: a grade point of -1 is outside the 10-point scale — left out. | Subject 4: credits cannot be negative — left out. | Subject 5: the grade point is missing — left out. | Subject 6: the credits are missing — left out.', 'rows that cannot be counted are named (an 11 on a 10-point scale was counted; negative credits were subtracted)');
    t.ok(r.gpa === 9 && r.credits === 4 && r.subjects === 1, '… and left out of the mean'); }
  { const r = S.gpaOf([{ g: 4.3, c: 3 }], 4); t.ok(r.problems.length === 1 && Number.isNaN(r.gpa), 'a 4.3 on the 4-point scale is outside it'); }
  { const r = S.gpaOf([{ g: 9, c: 0 }, { g: 8, c: 0 }], 10); t.ok(Number.isNaN(r.gpa) && r.credits === 0 && r.subjects === 2 && !r.problems.length, 'subjects without credits: no mean'); }
  { const r = S.gpaOf([], 10); t.ok(Number.isNaN(r.gpa) && r.subjects === 0, 'nothing entered'); }
  { const r = S.gpaOf([{ g: 10, c: 3 }, { g: 0, c: 3 }], 10); t.eq(r.gpa, 5, 'a 0 counts'); }
};
