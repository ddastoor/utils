// Body Fat (#/bodyfat): the US Navy tape-measure equations against mpmath (tests/fixtures/body/reference.json), the
// class on the ACE chart by the number shown, fat and lean mass; what is refused and why; phone layout.
import { readFileSync } from 'node:fs';
import { calc, num } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/body/reference.json', import.meta.url), 'utf8'));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/bodyfat`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const hip = page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Hip$/ }) });
  const set = async (male, h, neck, waist, hipCm) => { await c.seg('Sex', male ? 'Male' : 'Female'); await c.set('Height', h); await c.set('Neck', neck); await c.set('Waist', waist); if (!male) await c.set('Hip', hipCm); };
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');
  { const r = await c.rows();
    ok(await c.big('Body fat') === '16.9%' && await c.big('Category (ACE)') === 'Fit' && r['Fat mass'] === '12.7 kg' && r['Lean mass'] === '62.3 kg' && r['Chart used (men)'] === '<6 essential · <14 athletic · <18 fit · <25 average · ≥25 obese',
      `a man of 175 cm, neck 38, waist 85, 75 kg: 16.9 %, Fit, 12.7 kg fat + 62.3 kg lean (${await c.big('Body fat')}, ${JSON.stringify(r)})`);
    ok(!(await hip.isVisible()), 'the hip box is put away for men (it was shown as "Hip (women)" and ignored)'); }
  await hookClipboard(page); await page.locator('.big-result').first().click();
  ok((await copied(page))[0] === '16.9%', 'a click copies the figure');
  await c.seg('Sex', 'Female');
  ok(await hip.isVisible() && await c.big('Body fat') === '26.8%' && await c.big('Category (ACE)') === 'Average' && await c.row('Chart used (women)') === '<14 essential · <21 athletic · <25 fit · <32 average · ≥32 obese', `a woman with the same tape and a hip of 95: 26.8 %, Average; her chart (${await c.big('Body fat')})`);

  // ---- bodies of the reference
  let bad = [], seen = new Set();
  const firstOf = new Set(), sample = ref.bodyfat.filter((b, i) => { const k = `${b[0]}${b[7]}`, first = !firstOf.has(k); firstOf.add(k); return first || i % 13 === 0 || i < 7; }); // every class of both charts at least once
  for (const [male, h, neck, waist, hipCm, , shown, cat] of sample) {
    await set(male, h, neck, waist, hipCm);
    const at = `${male ? 'man' : 'woman'} ${h} / ${neck} / ${waist} / ${hipCm}`, w = await c.warn();
    if (cat === null) {
      const inRange = h >= 100 && h <= 250 && neck >= 20 && neck <= 80 && waist >= 40 && waist <= 250 && (male || (hipCm >= 50 && hipCm <= 250));
      if (inRange ? w !== `The formula gives ${parseFloat(shown) < 0 ? '−' : ''}${Math.abs(parseFloat(shown)).toFixed(1)} % for these measurements, which no body has — check ${male ? 'the neck and the waist' : 'the neck, the waist and the hip'}.` : !w) bad.push(`${at}: ${shown} % should be refused ("${w}")`);
      seen.add('refused'); continue;
    }
    const got = [await c.big('Body fat').catch(() => w), await c.big('Category (ACE)').catch(() => '')], fat = num(await c.row('Fat mass')), lean = num(await c.row('Lean mass'));
    if (got[0] !== `${shown}%` || got[1] !== cat || Math.abs(fat - 75 * shown / 100) > 0.051 || Math.abs(fat + lean - 75) > 0.001) bad.push(`${at}: ${got} / ${fat} + ${lean}, not ${shown}% ${cat}`);
    seen.add(cat);
  }
  ok(sample.length >= 60 && seen.size === 7 && !bad.length, `${sample.length} bodies of the reference: the figure with one decimal, its class (${[...seen].join(', ')}), fat + lean = the weight; impossible results refused with the figure ${bad.slice(0, 2).join(' | ')}`);
  // ---- less fat than a body needs
  { const lean = ref.bodyfat.find((b) => b[7] === 'Below essential fat' && b[0] === 1); await set(...lean.slice(0, 5));
    ok(await c.big('Category (ACE)') === 'Below essential fat' && await note() === 'Less than the fat a body needs to work (about 2 % for men) — check the measurements.', `${lean[6]} % for a man: below essential fat, with a note to check the tape (${await note()})`); }
  // ---- the weight is optional
  await set(1, 175, 38, 85); await c.set('Weight (optional)', '');
  ok(await c.big('Body fat') === '16.9%' && await c.row('Fat mass') === null && await c.row('Lean mass') === null, 'without a weight: the percentage alone');
  await c.set('Weight (optional)', 75);

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await set(1, 195, 42, 62); await refused('a slim tall man, waist 62 and neck 42 (it said "waist must be larger than neck")', 'The formula gives −15.1 % for these measurements, which no body has — check the neck and the waist.');
  await set(1, 175, 38, 900); await refused('a waist of 9 metres (it showed "Body fat 154.3%" and a lean mass of −40.8 kg)', 'The waist must be between 40 and 250 cm.');
  await set(1, 175, 50, 45); await refused('a waist smaller than the neck', 'The waist must be larger than the neck.');
  await set(1, 0, 38, 85); await refused('no height (it blamed the waist)', 'The height must be between 100 and 250 cm.');
  await set(1, 175, 5, 85); await refused('a neck of 5 cm', 'The neck must be between 20 and 80 cm.');
  await set(1, 175, 38, 85); await c.set('Weight (optional)', -75); await refused('a weight of −75 kg (it showed a fat mass of −12.7 kg)', 'The weight must be between 20 and 400 kg.');
  await c.set('Weight (optional)', 75); await set(0, 175, 38, 85, ''); await refused('a woman without a hip measurement (it blamed the waist)', 'Fill in all the numbers.');
  await c.set('Hip', 20); await refused('a hip of 20 cm', 'The hip must be between 50 and 250 cm.');
  await c.seg('Sex', 'Male');
  ok(await c.big('Body fat') === '16.9%' && !(await c.warn()), 'back to a man: what the hidden hip box holds does not matter');
  await c.set('Neck', ''); await refused('an empty box', 'Fill in all the numbers.');
  await c.set('Neck', 38);
  ok(await c.big('Body fat') === '16.9%' && /Hodgdon and Beckett/.test(await page.locator('.tool-body').innerText()), 'after the refusals the answer is back; the method is named');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/bodyfat`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll (also with the chart row)');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .seg-btn, .tool-body input')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().height >= 44)), 'phone: boxes and choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
