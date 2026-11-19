// Roman Numerals (#/roman): both directions against the `roman` library (tests/fixtures/numerals/reference.json),
// the additive forms of clock faces and buildings, the parts of a numeral, what is refused and why, phone layout.
import { readFileSync } from 'node:fs';
import { calc } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/numerals/reference.json', import.meta.url), 'utf8'));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/roman`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const L = 'Number (1–3999) or Roman numeral';
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');
  const type = async (x) => { await c.set(L, x); return (await page.locator('.big-result').count()) ? (await page.locator('.big-result').innerText()).replace(/\s+/g, ' ').trim() : `REFUSED: ${await c.warn()}`; };

  // ---- the first view
  ok(await c.big('Roman') === 'MMXXVI' && await c.row('Adds up as') === 'MM (2000) + XX (20) + V (5) + I (1)', `2026 → MMXXVI, taken apart (${await c.row('Adds up as')})`);

  // ---- numbers of the reference, both ways
  let bad = [];
  const pick = [1, 2, 3, 4, 5, 9, 14, 40, 44, 49, 90, 99, 400, 444, 499, 900, 944, 999, 1000, 1444, 1666, 1994, 2024, 2026, 2999, 3000, 3888, 3999, ...Array.from({ length: 60 }, (_, i) => 17 + i * 66)];
  for (const n of pick) {
    const r = ref.roman[n - 1];
    if (await type(n) !== `Roman ${r}`) bad.push(`${n} → ${await type(n)}, not ${r}`);
    if (await type(r) !== `Number ${n}` || await note()) bad.push(`${r} → ${await type(r)}, not ${n}`);
  }
  ok(pick.length >= 80 && !bad.length, `${pick.length} numbers from 1 to 3,999: the numeral the roman library writes, and back ${bad.slice(0, 3).join(' | ')}`);
  await c.set(L, 'MCMXCIV');
  ok(await c.big('Number') === '1994' && await c.row('Adds up as') === 'M (1000) + CM (900) + XC (90) + IV (4)', `MCMXCIV = M + CM + XC + IV (${await c.row('Adds up as')})`);

  // ---- the ways people type a numeral
  for (const [typed, n] of [['mcmlxxxiv', 1984], [' MM XXVI ', 2026], ['Ⅻ', 12], ['ⅳ', 4]]) ok(await type(typed) === `Number ${n}`, `"${typed}" → ${n} (${await type(typed)})`);
  ok(await type('1,994') === 'Roman MCMXCIV', '1,994 with its comma is the number 1994 (it was "Not a valid Roman numeral")');

  // ---- clock faces and buildings: the additive forms are read, and the standard form named
  await c.set(L, 'IIII');
  ok(await c.big('Number') === '4' && await note() === 'The standard way to write 4 is IV; IIII is the older, additive form (as on clock faces).', `IIII is 4 (it was refused) — ${await note()}`);
  await c.set(L, 'MDCCCCX');
  ok(await c.big('Number') === '1910' && /standard way to write 1910 is MCMX/.test(await note()), `MDCCCCX, as carved on buildings, is 1910 (${await note()})`);
  await c.set(L, 'MMMM');
  ok(await c.big('Number') === '4000' && /Above 3,999/.test(await note()), 'MMMM is 4000, with a word about the line above');
  bad = [];
  for (const [w, strict, loose] of ref.strings.filter(([w, s, l]) => /^[IVXLCDM]+$/.test(w) && (s || l || w.length <= 4)).filter((_, i) => i % 4 === 0)) {
    const got = await type(w), want = loose ? `Number ${loose}` : 'REFUSED';
    if (loose ? got !== want || !!(await note()) !== !strict : !got.startsWith('REFUSED: These letters do not make a Roman numeral')) bad.push(`"${w}": ${got} (note: ${await note()}), expected ${want}${strict ? '' : loose ? ' with a note' : ''}`);
  }
  ok(!bad.length, `strings of Roman letters from the reference: standard numerals without a note, additive ones with it, the rest refused ${bad.slice(0, 3).join(' | ')}`);

  // ---- refused, with the reason
  for (const [typed, reason] of [['0', 'There is no Roman numeral for 0 — the Romans had no sign for it.'], ['4000', 'Standard Roman numerals stop at 3,999 (MMMCMXCIX); larger numbers were written with a line above the letters.'], ['-5', 'Roman numerals are for whole numbers from 1 to 3,999 — no minus sign, no decimals.'],
    ['3.5', 'Roman numerals are for whole numbers from 1 to 3,999 — no minus sign, no decimals.'], ['ABC', '“A” is not a Roman numeral letter — they are I, V, X, L, C, D and M.'], ['VX', 'These letters do not make a Roman numeral: the larger ones come first, and only I, X and C are put before a larger letter to subtract (IV, IX, XL, XC, CD, CM).'],
    ['IC', 'These letters do not make a Roman numeral: the larger ones come first, and only I, X and C are put before a larger letter to subtract (IV, IX, XL, XC, CD, CM).'], ['', 'Type a number from 1 to 3,999 or a Roman numeral such as MMXXVI.']]) {
    await c.set(L, typed); const w = await c.warn(); ok(w === reason && !(await page.locator('.big-result').count()), `"${typed}" → "${reason}" (${w})`);
  }
  await c.set(L, '2026');
  ok(await c.big('Roman') === 'MMXXVI' && !/NaN|undefined|null/.test(await page.locator('.calc-result').innerText()), 'after the refusals the answer is back');
  await hookClipboard(page); await page.locator('.big-result').first().click();
  ok((await copied(page)).join() === 'MMXXVI', `a click copies the numeral (${await copied(page)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/roman`); await ph.locator('.big-value').first().waitFor(); const pc = calc(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  await pc.set(L, 3888);
  ok(await pc.big('Roman') === 'MMMDCCCLXXXVIII' && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: the longest numeral (3888) fits; the box is a 44 px touch target');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
