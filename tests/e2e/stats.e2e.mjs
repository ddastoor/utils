// Statistics (#/stats): every figure of the summary and the regression line against
// tests/fixtures/stats/reference.json (exact fractions of the doubles, cross-checked with Python's statistics module;
// scripts/make-stats-reference.py); what is left out of the two boxes is said; reasons where a figure has no value;
// copy; phone layout.
import { readFileSync } from 'node:fs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/stats/reference.json', import.meta.url), 'utf8'));
const num = (s) => (s === '—' ? null : s === '∞' ? Infinity : s === '−∞' ? -Infinity : Number(String(s).replace(/−/g, '-').replace(/,/g, '')));
/** equal to the digits shown: twelve, or ten with an exponent */
const shown = (got, want) => (want === null ? got === null || !Number.isFinite(got) : got !== null && (Math.abs(got - want) <= 6e-10 * Math.max(Math.abs(got), Math.abs(want)) || Math.abs(got - want) < 1e-300));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/stats`);
  const data = page.locator('textarea').first(), xy = page.locator('textarea').nth(1);
  await page.locator('.big-value').first().waitFor();
  const cardOf = (title) => page.locator('.card').filter({ has: page.locator('h3, .card-title', { hasText: title }) });
  const big = (card) => card.evaluate((c) => Object.fromEntries([...c.querySelectorAll('.big-result')].map((b) => [b.querySelector('.big-label').textContent.trim(), b.querySelector('.big-value').textContent.trim()])));
  const rows = (card) => card.evaluate((c) => { const s = [...c.querySelectorAll('.kv > span')].map((e) => e.textContent.trim()); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  const notes = async (card) => (await card.locator('.note').allTextContents()).map((s) => s.trim()).join(' | ');
  const S = cardOf('Summary'), L = cardOf('Linear regression');
  const set = async (text) => { await data.fill(text); };

  // ---- the first view
  { const b = await big(S), r = await rows(S);
    ok(b.Mean === '20.3333333333' && b.Median === '21' && b.Mode === '24' && b['Std dev (population)'] === '5.43650214343' && r.Count === '9' && r.Sum === '183' && r['Q1 (25%)'] === '15' && r['Q3 (75%)'] === '24' && r.IQR === '9' && r.Range === '18'
      && r['Variance (sample)'] === '33.25' && r['Std dev (sample)'] === '5.76628129734' && r.Sorted === '12, 15, 15, 18, 21, 24, 24, 24, 30' && 'Skewness (population)' in r,
      `the sample: mean 20.3333333333, median 21, mode 24, quartiles 15 and 24, sample variance 33.25 (${JSON.stringify(b)}, ${JSON.stringify(r)})`);
    ok(/Quartiles by linear interpolation between the sorted values \(Excel's QUARTILE\.INC, NumPy's default\)/.test(await S.innerText()) && !(await L.count()), 'the tab says how its quartiles are worked out; no regression card without pairs'); }
  await hookClipboard(page); await S.locator('.big-result').first().click();
  ok((await copied(page))[0] === '20.3333333333', 'a click copies the figure');

  // ---- data sets of the reference
  const KEYS = [['Sum', 'sum'], ['Min', 'min'], ['Max', 'max'], ['Range', 'range'], ['Q1 (25%)', 'q1'], ['Q3 (75%)', 'q3'], ['IQR', 'iqr'], ['Variance (population)', 'varP'], ['Variance (sample)', 'varS'], ['Std dev (sample)', 'sdS'], ['Geometric mean', 'geomean'], ['Harmonic mean', 'harmmean'], ['Skewness (population)', 'skew']];
  let bad = [], n = 0;
  for (const [texts, want] of ref.summaries.filter((_, i) => i < 20 || i % 8 === 0)) {
    await set(texts.join(', ')); n++;
    const b = await big(S), r = await rows(S), at = `[${texts.slice(0, 5).join(', ')}${texts.length > 5 ? ', …' : ''}] (${texts.length})`;
    if (r.Count !== String(want.count) || !shown(num(b.Mean), want.mean) || !shown(num(b.Median), want.median) || !shown(num(b['Std dev (population)']), want.sdP)) bad.push(`${at}: ${JSON.stringify(b)} count ${r.Count}, not mean ${want.mean}, median ${want.median}, sd ${want.sdP}`);
    for (const [label, key] of KEYS) if (!(shown(num(r[label]), want[key]) || (key === 'skew' && want.skew !== null && Math.abs(num(r[label]) - want.skew) < 1e-9))) bad.push(`${at}: ${label} = ${r[label]}, not ${want[key]}`);
    const modes = b.Mode === 'none' ? [] : b.Mode.split(', ').map(num);
    if (modes.length !== Math.min(want.modes.length, 20) || modes.some((v, i) => !shown(v, want.modes[i]))) bad.push(`${at}: mode ${b.Mode}, not ${want.modes}`);
  }
  ok(n >= 55 && !bad.length, `${n} data sets of the reference: every figure of the summary to the digits shown ${bad.slice(0, 3).join(' | ')}`);

  // ---- what was wrong
  await set('1e16, 1, -1e16');
  ok((await rows(S)).Sum === '1' && (await big(S)).Mean === '0.333333333333', `10¹⁶ + 1 − 10¹⁶: the sum is 1 and the mean ⅓ — the tab said 0 and 0 (${(await rows(S)).Sum}, ${(await big(S)).Mean})`);
  await set('−3, –4, 5');
  ok((await rows(S)).Count === '3' && (await rows(S)).Sum === '−2' && !/Left out/.test(await notes(S)), `numbers with a real minus sign count — "−3" was left out without a word (count ${(await rows(S)).Count}, sum ${(await rows(S)).Sum})`);
  await set('12, abc, 15, 12x, 1.2.3');
  ok((await rows(S)).Count === '2' && await notes(S) === 'Left out — not numbers: abc, 12x, 1.2.3', `what is not a number is named (${await notes(S)})`);
  await set('12 15 oops');
  ok(await notes(S) === 'Left out — not a number: oops', 'one piece left out');
  await set('0, 1, 2');
  { const r = await rows(S); ok(r['Geometric mean'] === '0' && r['Harmonic mean'] === '0' && await notes(S) === 'With a 0 among the numbers the geometric and the harmonic mean are 0.', `a zero among the numbers: both means are 0, with the reason — they showed "—" (${await notes(S)})`); }
  await set('-1, 1, 2');
  { const r = await rows(S); ok(r['Geometric mean'] === '—' && r['Harmonic mean'] === '—' && r.Min === '−1' && await notes(S) === 'The geometric and the harmonic mean are for numbers above 0 — there is a negative one.', `a negative number: no such means, and why (${await notes(S)})`); }
  await set('5');
  { const r = await rows(S), b = await big(S); ok(b.Mean === '5' && b.Mode === 'none' && r['Variance (sample)'] === '—' && r['Std dev (sample)'] === '—' && /^One number: the sample variance and standard deviation need two\.$/.test(await notes(S)), `one number: the sample figures have no value, and why (${await notes(S)})`); }
  await set('0.1, 0.2, 0.3');
  ok((await rows(S))['Skewness (population)'] === '0' && (await rows(S)).Sum === '0.6' && (await big(S)).Mean === '0.2', `0.1, 0.2, 0.3 lie evenly: skewness 0 — not 5.3 × 10⁻¹⁶ (${(await rows(S))['Skewness (population)']})`);
  await set('3, 3, 3');
  ok((await rows(S))['Skewness (population)'] === '—' && /All the numbers are equal: no skewness\./.test(await notes(S)) && (await big(S)).Mode === '3', 'equal numbers: no skewness, mode 3');
  await set('1 1 2 2 3'); ok((await big(S)).Mode === '1, 2', 'two modes');
  await set('');
  ok(await S.innerText() !== '' && await notes(S) === 'Type some numbers — separated by commas, spaces or new lines.' && !(await S.locator('.big-result').count()), `an empty box: a hint — the result area was simply empty (${await notes(S)})`);
  await set('abc def'); ok(/No numbers among what was typed\./.test(await notes(S)) && /Left out — not numbers: abc, def/.test(await notes(S)), 'only words');
  // a long list: the sorted row does not grow without end
  await set(Array.from({ length: 5000 }, (_, i) => (i * 7919) % 1000).join(' '));
  { const r = await rows(S); ok(r.Count === '5,000' && / … and 4,000 more$/.test(r.Sorted) && r.Sorted.split(', ').length === 1000, `5,000 numbers: all counted, the first 1,000 of the sorted list shown (${r.Sorted.slice(-30)})`); }

  // ---- regression
  await set('12, 15, 15, 18, 21, 24, 24, 24, 30'); await xy.fill('1, 2\n2, 4\n3, 7');
  { const b = await big(L), r = await rows(L); ok(b['Best-fit line'] === 'y = 2.5x − 0.666667' && r['Correlation r'] === '0.993399' && r['R²'] === '0.986842' && r.Pairs === '3', `(1, 2), (2, 4), (3, 7): y = 2.5x − 0.666667, r = 0.993399 (${JSON.stringify(b)}, ${JSON.stringify(r)})`); }
  bad = [];
  for (const [pairs, want] of ref.lines.filter((_, i) => i < 10 || i % 7 === 0)) {
    await xy.fill(pairs.map((p) => p.join(', ')).join('\n'));
    const at = JSON.stringify(pairs.slice(0, 2)), r = (await L.count()) ? await rows(L) : {}, b = (await L.count()) ? await big(L) : {}, text = (await L.count()) ? await notes(L) : '';
    if (pairs.length < 2) { if (text !== 'One pair — a line needs at least two.') bad.push(`${at}: "${text}"`); continue; }
    if (want.slope === null) { if (!/All the x values are equal/.test(text) || b['Best-fit line']) bad.push(`${at}: no line expected, got ${JSON.stringify(b)} "${text}"`); continue; }
    const m = /^y = (−?)([\d.e+-]*)x(?: ([+−]) ([\d.e+-]+))?$/.exec(b['Best-fit line'] || '');
    const slope = m ? (m[1] ? -1 : 1) * (m[2] === '' ? 1 : Number(m[2])) : NaN, icpt = m ? (m[3] === '−' ? -1 : 1) * Number(m[4] ?? 0) : NaN, tol = (a, w) => Math.abs(a - w) <= 6e-6 * Math.max(Math.abs(w), 1e-300) + 1e-12;
    if (!m || !tol(slope, want.slope) || !tol(icpt, want.intercept) || (want.r === null ? r['Correlation r'] !== '—' : !tol(num(r['Correlation r']), want.r)) || r.Pairs !== String(pairs.length)) bad.push(`${at}: ${b['Best-fit line']} r ${r['Correlation r']}, not ${JSON.stringify(want)}`);
  }
  ok(!bad.length, `sets of pairs of the reference: the line and r to the six digits shown; no line where all x are equal; one pair ${bad.slice(0, 2).join(' | ')}`);
  await xy.fill('1, 5\n1, 7\n1, 9');
  ok(/^All the x values are equal: the points stand above each other, and no line y = ax \+ b fits them\.$/.test(await notes(L)) && (await rows(L))['Correlation r'] === '—', `three points above each other: no line, and why — the tab showed "y = Errorx + Error" (${await notes(L)})`);
  await xy.fill('1, 4\n2, 4\n3, 4');
  ok((await big(L))['Best-fit line'] === 'y = 0x + 4' && (await rows(L))['Correlation r'] === '—' && /All the y values are equal: the line is level, and a correlation is not defined\./.test(await notes(L)), `a level line: y = 4, no correlation — it showed "Error" (${JSON.stringify(await big(L))})`);
  await xy.fill('1, 2\n5\n3, 4, 5\n6, x\n7, 9');
  ok((await rows(L)).Pairs === '2' && await notes(L) === 'Line 2: one number — a pair is two (x, y); the line is left out. | Line 3: 3 numbers — a pair is two (x, y); the line is left out. | Line 4: "x" is not a number — the line is left out.', `lines that are not pairs are named — "3, 4, 5" was taken as (3, 4) (${await notes(L)})`);
  await xy.fill('1, 2'); ok(await notes(L) === 'One pair — a line needs at least two.', 'one pair');
  await xy.fill(''); ok(!(await L.count()), 'no pairs: no regression card');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/stats`); await ph.locator('.big-value').first().waitFor();
  await ph.locator('textarea').first().fill(Array.from({ length: 300 }, (_, i) => 1000000 + i).join(', '));
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll, also with a long sorted list');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
