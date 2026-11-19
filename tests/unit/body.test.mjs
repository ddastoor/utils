// Body Fat, Ideal Weight and Sleep Cycle (src/lib/health.ts on mathcore's m_bodyfat / m_idealweight / m_bmi) against
// tests/fixtures/body/reference.json — the US Navy equations in mpmath, the four ideal-weight formulas and the healthy
// BMI ranges as exact fractions, bed and wake times by Python's datetime (scripts/make-body-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const H = await load('/src/lib/health.ts');
  const { fmtN } = await load('/src/lib/form.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/body/reference.json'), 'utf8'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));

  // ================================================================== body fat
  let bad = [], refused = 0, classes = new Set();
  for (const [male, h, neck, waist, hip, pct, shown, cat] of ref.bodyfat) {
    const at = `${male ? 'man' : 'woman'} ${h} / ${neck} / ${waist} / ${hip}`;
    if (rel(m.bodyfat(!!male, h, neck, waist, male ? 0 : hip), pct) > 2e-12) bad.push(`${at}: engine ${m.bodyfat(!!male, h, neck, waist, hip)} ≠ ${pct}`);
    if (cat === null) {
      refused++;
      const w = why(() => H.bodyFat(m, !!male, h, neck, waist, hip, NaN)), sign = parseFloat(shown) < 0 ? '−' : '';
      if (w !== `The formula gives ${sign}${Math.abs(parseFloat(shown)).toFixed(1)} % for these measurements, which no body has — check ${male ? 'the neck and the waist' : 'the neck, the waist and the hip'}.`) bad.push(`${at}: ${shown} % should be refused — "${w}"`);
      continue;
    }
    const b = H.bodyFat(m, !!male, h, neck, waist, hip, NaN); classes.add(`${male}${b.category}`);
    if (b.shown.toFixed(1) !== shown || b.category !== cat || b.fat !== null || b.lean !== null) bad.push(`${at}: ${b.shown} ${b.category}, not ${shown} ${cat}`);
  }
  t.ok(ref.bodyfat.length === 700 && !bad.length, `${ref.bodyfat.length} bodies: the engine to 12 digits; the one decimal that is shown (half up on the exact value) and the class it gives on the ACE chart; ${refused} sets of measurements that give less than nothing or 75 % and more are refused with the figure ${bad.slice(0, 3).join(' | ')}`);
  t.ok(classes.size === 12, `every class is met for men and for women, "Below essential fat" included (${classes.size} of 12)`);
  // ---- known bodies
  { const b = H.bodyFat(m, true, 175, 38, 85, 95, 75); t.ok(b.shown === 16.9 && b.category === 'Fit' && b.fat === 12.7 && b.lean === 62.3, `the example: 16.9 %, Fit, 12.7 kg of fat and 62.3 kg lean (${JSON.stringify(b)})`); }
  { const b = H.bodyFat(m, true, 178, 50, 96, 0, NaN); t.ok(b.shown === 15.7 && b.category === 'Fit', `178 cm, neck 50, waist 96: 15.7 % (${b.shown})`); }
  { const b = H.bodyFat(m, false, 175, 38, 85, 95, 75); t.ok(b.shown === 26.8 && b.category === 'Average' && b.fat === 20.1 && b.lean === 54.9, `a woman with the same tape: 26.8 %, Average (${JSON.stringify(b)})`); }
  t.eq(H.bodyFat(m, true, 175, 38, 85, 9999, 75).shown, 16.9, 'the hip does not count for a man — whatever the hidden box holds');
  t.eq(H.bodyFat(m, true, 175, 38, 85, NaN, NaN).shown, 16.9, '… also when it is empty');
  { const b = H.bodyFat(m, true, 175, 38, 85, 95, 75.25); t.ok(b.fat === 12.7 && b.lean === 62.6 && Math.abs(b.fat + b.lean - 75.25) < 0.06, 'fat + lean = the weight (to the decimal shown)'); }
  // the class goes by the number shown
  for (const [male, shown, cat] of [[true, 1.9, 'Below essential fat'], [true, 2, 'Essential fat'], [true, 5.9, 'Essential fat'], [true, 6, 'Athletic'], [true, 13.9, 'Athletic'], [true, 14, 'Fit'], [true, 17.9, 'Fit'], [true, 18, 'Average'], [true, 24.9, 'Average'], [true, 25, 'Obese'],
    [false, 9.9, 'Below essential fat'], [false, 10, 'Essential fat'], [false, 13.9, 'Essential fat'], [false, 14, 'Athletic'], [false, 20.9, 'Athletic'], [false, 21, 'Fit'], [false, 24.9, 'Fit'], [false, 25, 'Average'], [false, 31.9, 'Average'], [false, 32, 'Obese']])
    t.eq(H.bodyFatCategory(shown, male), cat, `${male ? 'men' : 'women'}: ${shown} % is ${cat}`);
  { // a body whose value rounds up onto a boundary is in the class of the number it shows
    let found = null;
    for (let w = 7500; w < 9000 && !found; w++) { const b = H.bodyFat(m, true, 175, 38, w / 100, 0, NaN); if (b.pct < 18 && b.shown === 18) found = b; }
    t.ok(found && found.category === 'Average', `a man at ${found?.pct.toFixed(3)} % is shown as 18.0 % and classed Average — not "18.0 %, Fit"`);
  }
  // ---- refused, with the reason
  for (const [args, reason] of [
    [[true, 175, 38, 30, 95, 75], 'The waist must be between 40 and 250 cm.'], [[true, 175, 50, 50, 95, 75], 'The waist must be larger than the neck.'], [[true, 175, 60, 55, 95, 75], 'The waist must be larger than the neck.'],
    [[true, 0, 38, 85, 95, 75], 'The height must be between 100 and 250 cm.'], [[true, -175, 38, 85, 95, 75], 'The height must be between 100 and 250 cm.'], [[true, 175, 5, 85, 95, 75], 'The neck must be between 20 and 80 cm.'],
    [[true, 175, 38, 900, 95, 75], 'The waist must be between 40 and 250 cm.'], [[false, 175, 38, 85, NaN, 75], 'The hip must be between 50 and 250 cm.'], [[false, 175, 38, 85, 20, 75], 'The hip must be between 50 and 250 cm.'],
    [[true, 175, 38, 85, 95, -75], 'The weight must be between 20 and 400 kg.'], [[true, 175, 38, 85, 95, 0], 'The weight must be between 20 and 400 kg.'], [[true, 175, 38, 85, 95, 1000], 'The weight must be between 20 and 400 kg.'],
    [[true, 195, 42, 62, 0, 75], 'The formula gives −15.1 % for these measurements, which no body has — check the neck and the waist.'], [[true, 175, 38, 250, 0, 75], 'The formula gives 79.2 % for these measurements, which no body has — check the neck and the waist.'],
  ]) t.eq(why(() => H.bodyFat(m, ...args)), reason, `bodyFat(${args.slice(0, 1)}, ${args.slice(1)}) is refused`);

  // ================================================================== ideal weight
  bad = []; let below = 0;
  for (const row of ref.idealweight) {
    const [male, unit] = row, metric = unit === 'kg', [formulas, asian, who] = row.slice(metric ? 3 : 4);
    const metres = metric ? row[2] / 100 : H.feetInches(row[2], row[3]), w = H.idealWeight(m, !!male, metres, unit), at = `${male ? 'man' : 'woman'} ${metric ? `${row[2]} cm` : `${row[2]} ft ${row[3]} in`}`;
    const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1), range = (r) => [n1(r.lo), n1(r.hi)].join(' ');
    if (range(w.asian) !== asian.map((x) => (+x).toFixed(1)).join(' ') || range(w.who) !== who.map((x) => (+x).toFixed(1)).join(' ')) bad.push(`${at}: ranges ${range(w.asian)} / ${range(w.who)}, not ${asian} / ${who}`);
    if (formulas === null) { below++; if (w.formulas !== null) bad.push(`${at}: below 5 feet, yet ${JSON.stringify(w.formulas)}`); continue; }
    const got = w.formulas?.map(([, x]) => fmtN(x, 1));
    if (!got || got.join(' ') !== formulas.map((x) => String(+x)).join(' ') || w.unit !== unit) bad.push(`${at}: ${got} ${w.unit}, not ${formulas}`);
  }
  t.ok(ref.idealweight.length === 384 && below >= 40 && !bad.length, `${ref.idealweight.length} heights in cm and in feet and inches: Devine, Robinson, Miller and Hamwi as shown (one decimal of the exact fraction, kg or lb), no formula below 5 feet (${below} heights), the healthy BMI ranges by both cut-offs ${bad.slice(0, 3).join(' | ')}`);
  { const w = H.idealWeight(m, true, 1.7); t.eq(w.formulas.map(([k, x]) => `${k} ${fmtN(x, 1)}`).join(', '), 'Devine (1974) 65.9, Robinson (1983) 65.2, Miller (1983) 66, Hamwi (1964) 66.7', 'a man of 170 cm');
    t.ok(w.asian.lo === 53.4 && w.asian.hi === 66.3 && w.who.hi === 72.1, `healthy range 53.4 – 66.3 kg, as the BMI tab says for 170 cm (the tab showed 53.5 – 66.5: at 66.5 kg the BMI tab says "23.0, Overweight") — ${JSON.stringify(w.asian)} ${JSON.stringify(w.who)}`);
    const b = H.bmiOf(m, 1.7, 60, 'asian'); t.ok(b.lo === w.asian.lo && b.hi === w.asian.hi, 'the same range as the BMI tab: one routine'); }
  { const w = H.idealWeight(m, false, 1.7); t.eq(w.formulas.map(([, x]) => fmtN(x, 1)).join(' '), '61.4 60.8 62.5 60.7', 'a woman of 170 cm'); }
  { const w = H.idealWeight(m, true, 1.524); t.eq(w.formulas.map(([, x]) => x).join(' '), '50 52 56.2 48', 'exactly 5 feet: the base weights'); }
  { const w = H.idealWeight(m, true, H.feetInches(5, 0), 'lb'); t.ok(w.formulas !== null && fmtN(w.formulas[0][1], 1) === '110.2', '5 ft 0 in typed in feet is 5 feet (60 × 0.0254 m is a hair under 1.524 in binary)'); }
  { const w = H.idealWeight(m, true, 1.4); t.ok(w.formulas === null && w.asian.lo === 36.2 && w.asian.hi === 44.9, `140 cm: no formula (it showed the weights of 152.4 cm: "Devine 50 kg"), the BMI range stays (${JSON.stringify(w.asian)})`); }
  t.ok(Number.isNaN(m.idealWeight(true, 140).devine) && m.idealWeight(true, 152.4).devine === 50, 'the engine itself has no answer below 5 feet');
  for (const [args, reason] of [[[true, 0], 'The height must be between 100 and 250 cm.'], [[true, -1.7], 'The height must be between 100 and 250 cm.'], [[true, 10], 'The height must be between 100 and 250 cm.'], [[true, 0.99], 'The height must be between 100 and 250 cm.'],
    [[true, 2.6, 'lb'], 'The height must be between 100 and 250 cm (3 ft 4 in to 8 ft 2 in).'], [[true, NaN], 'The height must be between 100 and 250 cm.']])
    t.eq(why(() => H.idealWeight(m, ...args)), reason, `idealWeight(${args}) is refused`);

  // ================================================================== sleep
  bad = [];
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  for (const [mode, time, fall, rows] of ref.sleep) {
    const got = H.sleepTimes(mode, time, fall).map((r) => [r.cycles, hhmm(r.at), r.day]);
    if (JSON.stringify(got) !== JSON.stringify(rows)) bad.push(`${mode} ${time} +${fall}: ${JSON.stringify(got)} ≠ ${JSON.stringify(rows)}`);
  }
  t.ok(ref.sleep.length === 400 && !bad.length, `${ref.sleep.length} nights by Python's datetime: the time of each of 6, 5, 4 and 3 cycles and the day it falls on ${bad.slice(0, 2).join(' | ')}`);
  t.eq(H.sleepTimes('wake', '06:30', 15).map((r) => `${r.cycles}:${hhmm(r.at)}${r.day}:${r.hours}`).join(' '), '6:21:15-1:9 5:22:45-1:7.5 4:00:150:6 3:01:450:4.5', 'up at 06:30: to bed at 21:15 or 22:45 the day before, 00:15 or 01:45 the same day');
  t.eq(H.sleepTimes('bed', '23:00', 15).map((r) => `${hhmm(r.at)}+${r.day}`).join(' '), '08:15+1 06:45+1 05:15+1 03:45+1', 'to bed at 23:00: up at 08:15, 06:45 …, the next day');
  t.eq(H.sleepTimes('bed', '00:10', 0).map((r) => `${hhmm(r.at)}+${r.day}`).join(' '), '09:10+0 07:40+0 06:10+0 04:40+0', 'to bed after midnight: the same day');
  t.eq(H.sleepTimes('wake', '06:30', NaN)[0].at, 21 * 60 + 30, 'an empty box for falling asleep counts as 0');
  t.eq(H.sleepTimes('wake', '6:30', 15)[0].at, 21 * 60 + 15, '"6:30" is read as 06:30');
  t.eq(H.sleepTimes('wake', '06:30:00', 15)[0].at, 21 * 60 + 15, 'a time with seconds');
  for (const [args, reason] of [[['wake', '', 15], 'Choose a time.'], [['wake', '25:00', 15], 'Choose a time.'], [['wake', '06:61', 15], 'Choose a time.'], [['wake', 'soon', 15], 'Choose a time.'], [['wake', undefined, 15], 'Choose a time.'],
    [['wake', '06:30', -30], 'Time to fall asleep: a whole number of minutes from 0 to 180.'], [['wake', '06:30', 15.5], 'Time to fall asleep: a whole number of minutes from 0 to 180.'], [['bed', '06:30', 100000], 'Time to fall asleep: a whole number of minutes from 0 to 180.'], [['bed', '06:30', 181], 'Time to fall asleep: a whole number of minutes from 0 to 180.']])
    t.eq(why(() => H.sleepTimes(...args)), reason, `sleepTimes(${args}) is refused`);
  t.eq([0, 59, 60, 13 * 60 + 5, 1439].map((x) => H.clockText(x, 'en-GB')).join(' '), '0:00 0:59 1:00 13:05 23:59', 'clock text, 24 hours');
  t.eq([0, 12 * 60, 21 * 60 + 15].map((x) => H.clockText(x, 'en-US').replace(/ /g, ' ')).join(', '), '12:00 AM, 12:00 PM, 9:15 PM', 'clock text, 12 hours');
  t.eq(JSON.stringify(['00:00', '23:59', '24:00', '7:5', ' 07:05 ', '12:60'].map(H.clockMinutes)), '[0,1439,null,null,425,null]', 'clockMinutes');
};
