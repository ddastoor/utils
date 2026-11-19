// GPA / CGPA (#/gpa): credit-weighted mean, CBSE / AICTE percentage (× 9.5), the 4-point scale, adding and removing
// subjects — against exact fractions (tests/fixtures/smallcalc/reference.json); rows that cannot be counted are named.
import { readFileSync } from 'node:fs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/smallcalc/reference.json', import.meta.url), 'utf8'));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/gpa`);
  await page.locator('.big-value').first().waitFor();
  const big = async (l) => { const b = page.locator('.big-result').filter({ hasText: l }); return (await b.count()) ? (await b.locator('.big-value').textContent()).trim() : null; };
  const rowsIn = () => page.locator('.gpa-row');
  const setRow = async (i, g, cr) => { const r = rowsIn().nth(i); for (const [k, v] of [[0, g], [1, cr]]) { const inp = r.locator('input').nth(k); await inp.fill(String(v)); await inp.dispatchEvent('input'); } };
  const sheet = async (rows) => { // make the page hold exactly these rows
    while (await rowsIn().count() < rows.length) await page.getByRole('button', { name: 'Add subject' }).click();
    while (await rowsIn().count() > rows.length) await rowsIn().last().getByRole('button', { name: 'Remove' }).click();
    for (let i = 0; i < rows.length; i++) await setRow(i, rows[i][0], rows[i][1]);
  };
  const warns = async () => (await page.locator('.card .note-warn').allInnerTexts()).map((x) => x.trim());
  const scale = (name) => page.getByRole('radio', { name, exact: true }).click();

  // ---- the first view
  ok(await big('GPA / CGPA') === '8.89' && await big('Percentage') === '84.44%' && await big('Total credits') === '9' && !(await warns()).length, `the example 9 × 4, 8 × 3, 10 × 2 → 80 / 9 = 8.89, 84.44 %, 9 credits (${await big('GPA / CGPA')}, ${await big('Percentage')}, ${await big('Total credits')})`);

  // ---- grade sheets of the reference, on both scales
  let bad = [], n = 0;
  for (const [sc, rows, mean, text, pct, credits] of ref.gpa.filter((x) => x[1].length <= 6).filter((_, i) => i % 9 === 0)) {
    await scale(sc === 10 ? '10-point' : '4-point'); await sheet(rows); n++;
    const got = [await big('GPA / CGPA'), await big('Percentage'), await big('Total credits')];
    const want = [mean === null ? '—' : text, sc === 10 ? (mean === null ? '—' : `${pct}%`) : null, String(credits)];
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${sc}-point ${JSON.stringify(rows)}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  }
  ok(n >= 25 && !bad.length, `${n} grade sheets of the reference: the mean with two decimals, the percentage on the 10-point scale, the credits ${bad.slice(0, 3).join(' | ')}`);

  // ---- adding and removing
  await scale('10-point'); await sheet([[9, 4], [8, 3], [10, 2]]);
  await page.getByRole('button', { name: 'Add subject' }).click(); await setRow(3, 6, 1);
  ok(await big('GPA / CGPA') === '8.6' && await big('Total credits') === '10', `adding 6 × 1 credit → 86 / 10 = 8.6 (${await big('GPA / CGPA')})`);
  await rowsIn().nth(0).getByRole('button', { name: 'Remove' }).click();
  ok(await rowsIn().count() === 3 && await big('GPA / CGPA') === '8.33', `removing 9 × 4 → 50 / 6 = 8.33 (${await big('GPA / CGPA')})`);
  await sheet([[8.67, 3], [8.68, 3]]);
  ok(await big('GPA / CGPA') === '8.68', `8.675 exactly is written 8.68 (${await big('GPA / CGPA')})`);

  // ---- rows that cannot be counted are named, and left out
  await sheet([[9, 4], [11, 3], [8, 3]]);
  ok(await big('GPA / CGPA') === '8.57' && (await warns()).join() === 'Subject 2: a grade point of 11 is outside the 10-point scale — left out.', `an 11 on the 10-point scale is left out and named (it was counted: 9.2) — ${await big('GPA / CGPA')}; ${await warns()}`);
  await setRow(1, 8, -2);
  ok(await big('GPA / CGPA') === '8.57' && (await warns()).join() === 'Subject 2: credits cannot be negative — left out.', `negative credits are left out (they were subtracted) — ${await warns()}`);
  await setRow(1, '', 4);
  ok(await big('GPA / CGPA') === '8.57' && (await warns()).join() === 'Subject 2: the grade point is missing — left out.', `a row without its grade is left out, and said (it was skipped without a word) — ${await warns()}`);
  await setRow(1, 7, '');
  ok((await warns()).join() === 'Subject 2: the credits are missing — left out.', 'a row without its credits');
  await setRow(1, '', '');
  ok(await big('GPA / CGPA') === '8.57' && !(await warns()).length, 'an empty row is skipped without a word');
  await scale('4-point');
  ok(await big('GPA / CGPA') === '—' && (await warns()).length === 2 && await big('Percentage') === null && await big('Total credits') === '0', `on the 4-point scale a 9 and an 8 are outside it: no mean, both rows named, no percentage (${await warns()})`);
  await sheet([[4, 3], [3.7, 4], [3.3, 3]]);
  ok(await big('GPA / CGPA') === '3.67' && await big('Total credits') === '10' && !(await warns()).length, `4-point: (12 + 14.8 + 9.9) / 10 = 3.67, 10 credits (${await big('GPA / CGPA')})`);
  await sheet([[4, 0], [3, 0]]);
  ok(await big('GPA / CGPA') === '—' && (await warns()).join() === 'The credits add up to 0 — give at least one subject its credits.', `subjects without credits: no mean, and the reason (${await warns()})`);
  await sheet([['', ''], ['', '']]);
  ok(await big('GPA / CGPA') === '—' && !(await warns()).length, 'nothing entered → a dash, no complaint');
  await sheet([]);
  ok(await rowsIn().count() === 0 && await big('GPA / CGPA') === '—', 'every subject removed');
  ok(!/NaN|undefined|Infinity/.test(await page.locator('.tool-body').innerText()), 'never NaN on the page');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/gpa`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  await ph.getByRole('button', { name: 'Add subject' }).click();
  ok(await ph.locator('.gpa-row').count() === 4 && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body input, .tool-body .seg-btn')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: a fourth subject fits; boxes and choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
