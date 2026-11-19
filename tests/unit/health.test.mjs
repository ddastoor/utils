// BMI, Calories and Pregnancy Due Date (src/lib/health.ts on mathcore's m_bmi / m_bmr) against
// tests/fixtures/health/reference.json — exact fractions, exact decimals and Python's datetime
// (scripts/make-health-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const H = await load('/src/lib/health.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/health/reference.json'), 'utf8'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
  const of = ([sys, h, w], which) => (sys === 'm' ? H.bmiOf(m, parseFloat(h) / 100, parseFloat(w), which) : H.bmiOf(m, H.feetInches(h[0], h[1]), parseFloat(w) * H.LB, which, 'lb'));

  // ---- 1,141 people, metric and imperial: the BMI, the BMI as shown, the class by both sets of cut-offs
  let bad = [];
  for (const row of ref.bmi) {
    const [sys, h, w, bmi, shown, asian, who] = row, a = of(row, 'asian'), b = of(row, 'who'), at = `${sys === 'm' ? `${h} cm, ${w} kg` : `${h[0]} ft ${h[1]} in, ${w} lb`}`;
    if (rel(a.bmi, bmi) > 1e-14 || a.shown !== shown || a.category !== asian || b.category !== who || a.unit !== (sys === 'm' ? 'kg' : 'lb')) bad.push(`${at}: ${a.bmi} → ${a.shown} ${a.category} / ${b.category}, not ${bmi} → ${shown} ${asian} / ${who}`);
  }
  t.ok(ref.bmi.length === 1141 && !bad.length, `${ref.bmi.length} BMIs: the value to 14 digits, the one decimal that is shown (half up on the exact fraction) and the class it gives, Asian-Indian and WHO ${bad.slice(0, 3).join(' | ')}`);

  // ---- the healthy range is the range this tab itself calls Normal: both ends, found by trying every tenth
  bad = [];
  for (const [sys, h, loA, hiA, loW, hiW] of ref.ranges) {
    const a = of([sys, h, sys === 'm' ? '60' : '130'], 'asian'), b = of([sys, h, sys === 'm' ? '60' : '130'], 'who');
    if (a.lo !== loA || a.hi !== hiA || b.lo !== loW || b.hi !== hiW) bad.push(`${JSON.stringify(h)}: ${a.lo}–${a.hi} / ${b.lo}–${b.hi}, not ${loA}–${hiA} / ${loW}–${hiW}`);
    for (const [which, lo, hi] of [['asian', a.lo, a.hi], ['who', b.lo, b.hi]]) { // … and the tab agrees with itself at the ends and one step outside
      const cat = (x) => of([sys, h, String(Math.round(x * 10) / 10)], which);
      if (lo >= (sys === 'm' ? 2.1 : 4.1) && (cat(lo).category !== 'Normal' || cat(lo).off !== 0 || cat(lo - 0.1).category !== 'Underweight' || cat(lo - 0.1).off !== -0.1)) bad.push(`${JSON.stringify(h)} ${which}: the lower end ${lo}`);
      if (cat(hi).category !== 'Normal' || cat(hi).off !== 0 || cat(hi + 0.1).category !== 'Overweight' || cat(hi + 0.1).off !== 0.1) bad.push(`${JSON.stringify(h)} ${which}: the upper end ${hi}`);
    }
  }
  t.ok(ref.ranges.length === 43 && !bad.length, `${ref.ranges.length} heights: the healthy range is exactly the weights classed Normal — the ends are Normal and "within that range", a tenth beyond is not ${bad.slice(0, 3).join(' | ')}`);

  // ---- known people
  { const b = H.bmiOf(m, 1.7, 68, 'asian'); t.ok(b.shown === 23.5 && b.category === 'Overweight' && b.lo === 53.4 && b.hi === 66.3 && b.off === 1.7, `170 cm, 68 kg: 23.5, overweight by the Indian cut-offs, 1.7 kg above 53.4 – 66.3 (${JSON.stringify(b)})`); }
  { const b = H.bmiOf(m, 1.7, 68, 'who'); t.ok(b.category === 'Normal' && b.hi === 72.1 && b.off === 0, '… Normal by the WHO cut-offs (up to 72.1 kg)'); }
  { const b = H.bmiOf(m, 1.7, 66.5, 'asian'); t.ok(b.shown === 23 && b.category === 'Overweight' && b.off === 0.2, '66.5 kg at 170 cm is 23.0 — overweight: the tab had called 53.5 – 66.5 kg the healthy range'); }
  { const b = H.bmiOf(m, 1.6, 76.8, 'who'); t.ok(b.shown === 30 && b.category === 'Obese', '76.8 kg at 160 cm: 29.9999… is 30.0, obese (WHO)'); }
  { const b = H.bmiOf(m, 1.6, 64, 'asian'); t.ok(b.shown === 25 && b.category === 'Obese', '64 kg at 160 cm: 25.0, obese by the Indian cut-off'); }
  { const b = H.bmiOf(m, 1.6, 46, 'asian'); t.ok(b.shown === 18 && b.category === 'Underweight' && b.off < 0, `46 kg at 160 cm: 18.0, underweight, ${-b.off} kg below`); }
  { const b = H.bmiOf(m, H.feetInches(5, 9), 160 * H.LB, 'who', 'lb'), [, , , , lo, hi] = ref.ranges.find(([sys, h]) => sys === 'i' && h[0] === 5 && h[1] === 9);
    t.ok(b.shown === 23.6 && b.category === 'Normal' && b.unit === 'lb' && b.lo === lo && b.hi === hi && lo === 125 && hi === 168.9, `5 ft 9 in, 160 lb: 23.6 (the CDC's table), healthy range ${b.lo} – ${b.hi} lb (the CDC gives 125 – 168 lb)`); }
  t.near(H.feetInches(5, 7), 1.7018, 1e-12, '5 ft 7 in is 1.7018 m'); t.near(H.feetInches(0, 67), 1.7018, 1e-12, '67 in'); t.near(H.feetInches(5, NaN), 1.524, 1e-12, 'an empty inches box is 0'); t.near(H.feetInches(NaN, 67), 1.7018, 1e-12, 'an empty feet box is 0');
  // ---- refused
  t.eq(why(() => H.bmiOf(m, 0, 68, 'asian')), 'The height must be between 50 and 300 cm.', 'a height of 0 (the tab showed "BMI — · Obese")');
  t.eq(why(() => H.bmiOf(m, 0.017, 68, 'asian')), 'The height must be between 50 and 300 cm.', '1.7 typed as centimetres');
  t.eq(why(() => H.bmiOf(m, -1.7, 68, 'asian')), 'The height must be between 50 and 300 cm.', 'a negative height');
  t.eq(why(() => H.bmiOf(m, 3.01, 68, 'asian')), 'The height must be between 50 and 300 cm.', 'above 3 m');
  t.eq(why(() => H.bmiOf(m, 1.7, 0, 'asian')), 'The weight must be between 2 and 700 kg.', 'a weight of 0');
  t.eq(why(() => H.bmiOf(m, 1.7, -68, 'asian')), 'The weight must be between 2 and 700 kg.', 'a negative weight (it was "Underweight")');
  t.eq(why(() => H.bmiOf(m, 1.7, 701, 'asian')), 'The weight must be between 2 and 700 kg.', 'above 700 kg');
  t.eq(why(() => H.bmiOf(m, H.feetInches(170, 0), 68 * H.LB, 'asian', 'lb')), 'The height must be between 50 and 300 cm (1 ft 8 in to 9 ft 10 in).', '170 feet');
  t.eq(why(() => H.bmiOf(m, H.feetInches(5, 7), 0, 'asian', 'lb')), 'The weight must be between 4 and 1,500 lb.', '0 lb');
  t.eq(why(() => H.feetInches(-5, 7)), 'Feet and inches cannot be negative.', 'negative feet');
  t.ok(H.bmiOf(m, 0.5, 2, 'who').bmi === 8 && H.bmiOf(m, 3, 700, 'who').shown === 77.8, 'the ends of the ranges are taken');

  // ---- calories: Mifflin–St Jeor
  bad = [];
  for (const [male, age, cm, kg, act, bmr, tdee] of ref.calories) {
    const c = H.calorieNeeds(m, !!male, age, cm, kg, act);
    if (rel(c.bmr, bmr) > 1e-14 || rel(c.tdee, tdee) > 1e-14 || c.floor !== (male ? 1500 : 1200) || c.targets.length !== 4 || Math.abs(c.targets[1].kcal - (tdee - 550)) > 1e-9 || c.targets[1].low !== (tdee - 550 < c.floor)) bad.push(`${male ? 'man' : 'woman'} ${age} y ${cm} cm ${kg} kg × ${act}: ${c.bmr} / ${c.tdee}, not ${bmr} / ${tdee}`);
  }
  t.ok(ref.calories.length === 588 && !bad.length, `${ref.calories.length} people: BMR and daily need by the Mifflin–St Jeor equation in exact decimals ${bad.slice(0, 3).join(' | ')}`);
  { const c = H.calorieNeeds(m, true, 30, 180, 80, 1.2); t.ok(c.bmr === 1780 && c.tdee === 2136, 'a man of 30, 180 cm, 80 kg: 800 + 1125 − 150 + 5 = 1,780 kcal at rest'); }
  { const c = H.calorieNeeds(m, false, 30, 180, 80, 1.2); t.eq(c.bmr, 1614, 'a woman of the same size: 166 kcal less'); }
  { const c = H.calorieNeeds(m, true, 30, 170, 70, 1.375); t.ok(c.bmr === 1617.5 && rel(c.tdee, 2224.0625) < 1e-15 && c.targets.map((x) => Math.round(x.kcal)).join() === '1949,1674,2499,2774' && c.targets.every((x) => !x.low), `the example: ${c.targets.map((x) => Math.round(x.kcal))}`); }
  { const c = H.calorieNeeds(m, false, 60, 150, 45, 1.2); t.ok(c.tdee < 1400 && c.targets[0].low && c.targets[1].low && !c.targets[2].low, `a small woman of 60: maintenance ${Math.round(c.tdee)} kcal — both loss targets (${Math.round(c.targets[0].kcal)}, ${Math.round(c.targets[1].kcal)}) lie under 1,200 and are marked`); }
  t.eq(why(() => H.calorieNeeds(m, true, 0, 170, 70, 1.2)), 'The age must be between 15 and 110 years (the formula is for adults).', 'an age of 0');
  t.eq(why(() => H.calorieNeeds(m, true, 8, 170, 70, 1.2)), 'The age must be between 15 and 110 years (the formula is for adults).', 'a child');
  t.eq(why(() => H.calorieNeeds(m, true, -30, 170, 70, 1.2)), 'The age must be between 15 and 110 years (the formula is for adults).', 'a negative age');
  t.eq(why(() => H.calorieNeeds(m, true, 30, 1.7, 70, 1.2)), 'The height must be between 100 and 250 cm.', '1.7 typed as centimetres');
  t.eq(why(() => H.calorieNeeds(m, true, 30, 170, 0, 1.2)), 'The weight must be between 20 and 400 kg.', 'a weight of 0 (the tab showed a daily need all the same)');
  t.eq(why(() => H.calorieNeeds(m, true, 30, 170, -70, 1.2)), 'The weight must be between 20 and 400 kg.', 'a negative weight');

  // ---- due dates: Naegele's rule
  bad = []; const iso = (d) => `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  for (const [lmp, cycle, today, due, conception, first, second, days, toGo] of ref.due) {
    const d = H.dueDate(lmp, cycle, today), tri = days === null ? null : days < 98 ? 'First trimester' : days < 196 ? 'Second trimester' : 'Third trimester';
    if (iso(d.due) !== due || iso(d.conception) !== conception || iso(d.firstEnds) !== first || iso(d.secondEnds) !== second || d.days !== days || d.toGo !== toGo || d.trimester !== tri) bad.push(`LMP ${lmp}, cycle ${cycle}, today ${today}: ${iso(d.due)} ${d.days} ${d.toGo}, not ${due} ${days} ${toGo}`);
  }
  t.ok(ref.due.length > 1200 && !bad.length, `${ref.due.length} pregnancies: due date, conception, the ends of the trimesters, days completed and days to go, as Python's datetime gives them ${bad.slice(0, 3).join(' | ')}`);
  { const d = H.dueDate('2026-01-01', 28, '2026-03-12'); t.ok(iso(d.due) === '2026-10-08' && d.days === 70 && d.trimester === 'First trimester' && d.toGo === 210, 'LMP 1 January 2026: due 8 October 2026; on 12 March 10 weeks 0 days'); }
  { const d = H.dueDate('2026-01-01', 35, '2026-03-12'); t.ok(iso(d.due) === '2026-10-15' && d.days === 63, 'a 35-day cycle: a week later'); }
  { const d = H.dueDate('2026-01-01', NaN, '2026-03-12'); t.eq(iso(d.due), '2026-10-08', 'an empty cycle box is the usual 28 days'); }
  { const d = H.dueDate('2026-03-17', 28, '2026-03-12'); t.ok(d.days === null && d.trimester === null && d.toGo === 285, 'a period that is still to come has no weeks of pregnancy'); }
  { const d = H.dueDate('2026-03-10', 35, '2026-03-12'); t.eq(d.days, 0, 'in the first days of a long cycle the count stays at 0 (it was −5 days)'); }
  t.eq(why(() => H.dueDate('', 28, '2026-03-12')), 'Pick the first day of the last period.', 'no date');
  t.eq(why(() => H.dueDate('2026-02-30', 28, '2026-03-12')), 'First day of last period: a date from the year 1 to 9999, please.', '30 February');
  t.eq(why(() => H.dueDate('2026-01-01', 60, '2026-03-12')), 'Cycle length: a whole number of days from 20 to 45 (28 is usual).', 'a cycle of 60 days');
  t.eq(why(() => H.dueDate('2026-01-01', 28.5, '2026-03-12')), 'Cycle length: a whole number of days from 20 to 45 (28 is usual).', 'a cycle of 28.5 days (the due date fell at noon)');
  t.eq(why(() => H.dueDate('2026-01-01', 0, '2026-03-12')), 'Cycle length: a whole number of days from 20 to 45 (28 is usual).', 'a cycle of 0 (it was silently taken as 28)');
  t.eq(why(() => H.dueDate('9999-06-01', 28, '2026-03-12')), 'First day of last period: a date from the year 1 to 9998, please.', 'a due date beyond the calendar');
};
