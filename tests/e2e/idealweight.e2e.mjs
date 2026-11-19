// Ideal Weight (#/idealweight): Devine, Robinson, Miller and Hamwi and the healthy BMI ranges against exact fractions
// (tests/fixtures/body/reference.json), in kg and in lb; the same range as the BMI tab; below 5 feet; what is
// refused; phone layout.
import { readFileSync } from 'node:fs';
import { calc } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/body/reference.json', import.meta.url), 'utf8'));
const NAMES = ['Devine (1974)', 'Robinson (1983)', 'Miller (1983)', 'Hamwi (1964)'], ASIAN = 'Healthy BMI range (Asian 18.5–23)', WHO = 'Healthy BMI range (WHO 18.5–25)';
const n1 = (x) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(+x);
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/idealweight`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');
  { const r = await c.rows();
    ok(await c.big(ASIAN) === '53.4 – 66.3 kg' && r[WHO] === '53.4 – 72.1 kg' && NAMES.map((k) => r[k]).join(' ') === '65.9 kg 65.2 kg 66 kg 66.7 kg' && !(await note()),
      `a man of 170 cm: 53.4 – 66.3 kg (it said 53.5 – 66.5: at 66.5 kg the BMI tab says "23.0, Overweight"); Devine 65.9, Robinson 65.2, Miller 66, Hamwi 66.7 (${await c.big(ASIAN)}, ${JSON.stringify(r)})`); }
  // the BMI tab shows the same range for the same height
  { const b = await newPage(); await b.goto(`${base}#/bmi`); const bc = calc(b); await b.locator('.big-value').first().waitFor();
    let same = [];
    for (const cm of [170, 152, 183.5, 140]) {
      await bc.set('Height (cm)', cm); await c.set('Height', cm);
      const asian = await bc.row('Healthy weight range'); await bc.seg('Cut-offs', 'WHO international'); const who = await bc.row('Healthy weight range'); await bc.seg('Cut-offs', 'Asian / Indian');
      if (asian !== await c.big(ASIAN) || who !== await c.row(WHO)) same.push(`${cm} cm: BMI tab ${asian} / ${who}, here ${await c.big(ASIAN)} / ${await c.row(WHO)}`);
    }
    ok(!same.length, `the BMI tab and this tab show the same healthy ranges for four heights ${same.join(' | ')}`); await b.close(); }
  await c.seg('Sex', 'Female'); await c.set('Height', 170);
  ok((await Promise.all(NAMES.map((k) => c.row(k)))).join(' ') === '61.4 kg 60.8 kg 62.5 kg 60.7 kg', `a woman of 170 cm (${JSON.stringify(await c.rows())})`);

  // ---- heights of the reference, in centimetres
  let bad = [], short = 0;
  for (const row of ref.idealweight.filter((r) => r[1] === 'kg').filter((_, i) => i % 6 === 0 || i < 12)) {
    const [male, , cm, formulas, asian, who] = row;
    await c.seg('Sex', male ? 'Male' : 'Female'); await c.set('Height', cm);
    const r = await c.rows(), at = `${male ? 'man' : 'woman'} ${cm} cm`;
    if (await c.big(ASIAN) !== `${n1(asian[0])} – ${n1(asian[1])} kg` || r[WHO] !== `${n1(who[0])} – ${n1(who[1])} kg`) bad.push(`${at}: ${await c.big(ASIAN)} / ${r[WHO]}, not ${asian} / ${who}`);
    if (formulas === null) { short++; if (NAMES.some((k) => k in r) || !/start at a height of 5 feet \(152\.4 cm\)/.test(await note())) bad.push(`${at}: below 5 feet, yet ${JSON.stringify(r)} "${await note()}"`); }
    else if (NAMES.map((k) => r[k]).join(' ') !== formulas.map((x) => `${n1(x)} kg`).join(' ') || await note()) bad.push(`${at}: ${NAMES.map((k) => r[k])}, not ${formulas}`);
  }
  ok(short >= 5 && !bad.length, `58 heights of the reference: the four formulas with one decimal, both healthy ranges; below 5 feet (${short} heights) the formulas are left out with a note — a height of 140 cm got "Devine 50 kg", the weight of 152.4 cm ${bad.slice(0, 2).join(' | ')}`);
  // ---- feet and inches, pounds
  await c.seg('Units', 'Imperial');
  bad = [];
  for (const row of ref.idealweight.filter((r) => r[1] === 'lb').filter((_, i) => i % 4 === 0 || i < 8)) {
    const [male, , ft, inch, formulas, asian, who] = row;
    await c.seg('Sex', male ? 'Male' : 'Female'); await c.set('Height (feet)', ft); await c.set('and inches', inch);
    const r = await c.rows(), at = `${male ? 'man' : 'woman'} ${ft} ft ${inch} in`;
    if (await c.big(ASIAN) !== `${n1(asian[0])} – ${n1(asian[1])} lb` || r[WHO] !== `${n1(who[0])} – ${n1(who[1])} lb` || (formulas === null ? NAMES.some((k) => k in r) : NAMES.map((k) => r[k]).join(' ') !== formulas.map((x) => `${n1(x)} lb`).join(' '))) bad.push(`${at}: ${await c.big(ASIAN)} / ${JSON.stringify(r)}, not ${formulas} / ${asian} / ${who}`);
  }
  ok(!bad.length, `heights in feet and inches, weights in pounds (5 ft 0 in is 5 feet: the formulas' first height) ${bad.slice(0, 2).join(' | ')}`);
  await c.seg('Sex', 'Male'); await c.set('Height (feet)', ''); await c.set('and inches', 67);
  ok(await c.row('Devine (1974)') === '145.7 lb', `67 inches without feet: Devine 50 + 2.3 × 7 = 66.1 kg = 145.7 lb (${await c.row('Devine (1974)')})`);

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await c.set('and inches', ''); await refused('no height in feet or inches', 'Fill in all the numbers.');
  await c.set('Height (feet)', -5); await refused('−5 feet', 'Feet and inches cannot be negative.');
  await c.set('Height (feet)', 9); await refused('9 feet', 'The height must be between 100 and 250 cm (3 ft 4 in to 8 ft 2 in).');
  await c.seg('Units', 'Metric');
  await c.set('Height', 0); await refused('a height of 0 (it showed "0 – 0 kg" and Devine 50 kg)', 'The height must be between 100 and 250 cm.');
  await c.set('Height', -170); await refused('−170 cm (it showed the BMI range of 170 cm)', 'The height must be between 100 and 250 cm.');
  await c.set('Height', 1000); await refused('ten metres (it showed "Devine 817.5 kg")', 'The height must be between 100 and 250 cm.');
  await c.set('Height', ''); await refused('an empty box', 'Fill in all the numbers.');
  await c.set('Height', 170);
  ok(await c.big(ASIAN) === '53.4 – 66.3 kg' && /doses of medicine/.test(await page.locator('.tool-body').innerText()), 'after the refusals the answer is back; the note says what the formulas were made for');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/idealweight`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .seg-btn, .tool-body input')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().height >= 44)), 'phone: boxes and choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
