// Fraction Calculator (#/fraction): expressions of fractions worked out exactly — against
// tests/fixtures/fraction/reference.json (Python's fractions; scripts/make-fraction-reference.py): fraction, mixed
// number and the decimal with its repeating part; numbers beyond 64 bits; every refusal with its reason; copy; phone.
import { readFileSync } from 'node:fs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/fraction/reference.json', import.meta.url), 'utf8'));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/fraction`);
  const ex = page.getByLabel('Expression');
  const vals = () => page.locator('.big-result').evaluateAll((bs) => Object.fromEntries(bs.map((b) => [b.querySelector('.big-label').textContent.trim(), b.querySelector('.big-value').textContent.trim()])));
  const warn = async () => (await page.locator('.card .note').allTextContents()).map((s) => s.trim()).join(' | ');
  const run = async (s) => { await ex.fill(s); const v = await vals(); return `${v.Fraction} | ${v['Mixed number']} | ${v.Decimal}`; };
  await page.locator('.big-value').first().waitFor();
  ok(await run('3/4 + 5/6 × 2 1/2') === '17/6 | 2 5/6 | 2.8(3)', `the sample: 3/4 + 5/6 × 2½ = 17/6 = 2 5/6 = 2.8(3) — the decimal says which digit repeats (${await run('3/4 + 5/6 × 2 1/2')})`);
  await hookClipboard(page); await page.locator('.big-result').nth(1).click();
  ok((await copied(page))[0] === '2 5/6', 'a click copies');

  // ---- expressions of the reference
  let bad = [], n = 0;
  const mixed = (N, D) => { const w = N / D, r = (N < 0n ? -N : N) % D; return (D === 1n || w === 0n ? (D === 1n ? `${N}` : `${N}/${D}`) : `${w} ${r}/${D}`).replace('-', '−'); };
  for (const [text, num, den] of ref.expressions.filter((_, i) => i < 28 || i % 9 === 0)) {
    await ex.fill(text); n++;
    if (den === undefined) { const w = await warn(); if (w !== (num === 'zero' ? 'A division by zero.' : 'The numbers grow beyond 38 digits — too large to keep exact here.') || await page.locator('.big-result').count()) bad.push(`${text}: "${w}", expected ${num}`); continue; }
    const v = await vals(), N = BigInt(num), D = BigInt(den), want = (D === 1n ? `${N}` : `${N}/${D}`).replace('-', '−');
    if (v.Fraction !== want || v['Mixed number'] !== mixed(N, D)) bad.push(`${text}: ${v.Fraction} | ${v['Mixed number']} (${await warn()}), not ${want} | ${mixed(N, D)}`);
  }
  ok(n >= 100 && !bad.length, `${n} expressions of the reference: the fraction in lowest terms and the mixed number ${bad.slice(0, 3).join(' | ')}`);
  bad = [];
  for (const [num, den, text] of ref.decimals.filter((_, i) => i < 26 || i % 10 === 0)) { await ex.fill(`${num}/${den}`); const v = await vals(); if (v.Decimal !== text) bad.push(`${num}/${den}: ${v.Decimal}, not ${text}`); }
  ok(!bad.length, `63 decimals of the reference: 1/7 = 0.(142857), 3/8 = 0.375, 1/97 with its first forty digits ${bad.slice(0, 3).join(' | ')}`);

  // ---- what was wrong
  ok(await run('(1/2)^100') === '1/1267650600228229401496703205376 | 1/1267650600228229401496703205376 | 0.0000000000000000000000000000007888609052…', `(1/2)¹⁰⁰ = 1/2¹⁰⁰ — the tab said "Division by zero" (${(await run('(1/2)^100')).slice(0, 40)})`);
  ok(await run('9223372036854775807 + 1') === '9223372036854775808 | 9223372036854775808 | 9223372036854775808' && (await run('2^100')).startsWith('1267650600228229401496703205376 |'), 'numbers beyond 64 bits are kept — "Numbers too large" stopped at 9.2 × 10¹⁸');
  ok(await run('1/3 + 1/7 + 1/11 + 1/13 + 1/17 + 1/19 + 1/23 + 1/29 + 1/31 + 1/37 + 1/41 + 1/43 + 1/47 + 1/53 + 1/59 + 1/61') !== '' && !(await warn()).includes('too large'), 'sixteen unit fractions with prime denominators still add up exactly');
  ok(await run('-2 1/2') === '−5/2 | −2 1/2 | −2.5', 'a real minus sign in the answer');
  ok(await run('½ + ¼') === '3/4 | 3/4 | 0.75' && await run('2½ × 2') === '5 | 5 | 5', `the characters ½ and ¼ are read — "Could not read the expression" (${await run('½ + ¼')})`);
  ok(await run('1e3 / 4') === '250 | 250 | 250' && await run('1.5e-3') === '3/2000 | 3/2000 | 0.0015', 'powers of ten are read');
  ok(await run('4 : 2') === '2 | 2 | 2' && await run('1 ⁄ 2') === '1/2 | 1/2 | 0.5', 'the ratio colon and the fraction slash divide');
  ok(await run('1/3 ÷ 2/3') === '1/2 | 1/2 | 0.5' && await run('2/3^2') === '2/9 | 2/9 | 0.(2)' && await run('(2/3)^2') === '4/9 | 4/9 | 0.(4)' && /2\/3 written without spaces is one number/.test(await page.locator('.tool-body').innerText()), 'what binds to what — and the tab explains it');
  // ---- refused, with the reason
  for (const [src, reason] of [['1/2 +', 'The expression stops too soon — a number is missing at the end.'], ['abc', 'Could not read "abc".'], ['1,5', 'Could not read ",5".'], ['2 3', 'Could not read "3".'], ['(1/2', 'A bracket is not closed.'], ['1/2)', 'A closing bracket has no opening one.'],
    ['1/0', 'A division by zero.'], ['2^0.5', 'Only whole-number powers (up to 1,000) keep fractions exact.'], ['2^1000', 'The numbers grow beyond 38 digits — too large to keep exact here.']]) {
    await ex.fill(src); const w = await warn();
    ok(w === reason && !(await page.locator('.big-result').count()), `"${src}" → "${reason}" (${w})`);
  }
  await ex.fill('');
  ok(await warn() === 'Type fractions and signs — for example 3/4 + 1 1/2, or 2/3 × 5.' && !(await page.locator('.note-warn').count()), `an empty box gets a hint, not a warning — it said "Could not read the expression" (${await warn()})`);
  ok(await run('6/8') === '3/4 | 3/4 | 0.75' && !(await warn()), 'and the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/fraction`); await ph.locator('.big-value').first().waitFor();
  await ph.getByLabel('Expression').fill('1/3 + 1/7 + 1/11 + 1/13 + 1/17 + 1/19 + 1/23 + 1/29 + 1/31 + 1/37 + 1/41 + 1/43 + 1/47 + 1/53');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: a fraction of 38 digits does not push the page sideways');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
