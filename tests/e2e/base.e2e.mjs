// Number Base Converter (#/base): every box updates from any other, numbers of any length, prefixes read in their own
// base, signs and separators, a custom base — against Python's int() and numpy's base_repr
// (tests/fixtures/numerals/reference.json); what is not a number is said, and nothing stale is left on show.
import { readFileSync } from 'node:fs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/numerals/reference.json', import.meta.url), 'utf8'));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/base`);
  const f = (l) => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${l.replace(/[()]/g, '\\$&')}$`) }) }).locator('input');
  const B = { 2: 'Binary (base 2)', 8: 'Octal (base 8)', 10: 'Decimal (base 10)', 16: 'Hexadecimal (base 16)', 36: 'Base 36 (base 36)' };
  const cust = f('Custom base'), out = f('Value in custom base');
  const set = async (b, v) => { const el = b === 'c' ? out : f(B[b]); await el.fill(v); await el.dispatchEvent('input'); };
  const setBase = async (b) => { await cust.fill(String(b)); await cust.dispatchEvent('input'); };
  const all = async () => Object.fromEntries([...await Promise.all(Object.entries(B).map(async ([b, l]) => [b, await f(l).inputValue()])), ['c', await out.inputValue()]]);
  const warn = async () => (await page.locator('.card .note-warn').allInnerTexts()).map((x) => x.trim()).join(' | ');
  const isBad = (b) => (b === 'c' ? out : f(B[b])).evaluate((e) => e.classList.contains('bad'));
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '11111111'));

  // ---- the first view
  let v = await all();
  ok(v[2] === '11111111' && v[8] === '377' && v[10] === '255' && v[16] === 'FF' && v[36] === '73' && v.c === '100110' && !(await warn()), `255 → 11111111 / 377 / FF / 73, and 100110 in base 3 (${JSON.stringify(v)})`);

  // ---- numbers of the reference, typed in the box of their base, read in all the others
  const typedIn = (from) => (B[from] ? String(from) : 'c');
  let bad = [], n = 0;
  for (const [text, from, answers] of ref.bases.filter(([t]) => t.length <= 1300).filter((_, i) => i % 6 === 0)) {
    if (!B[from]) await setBase(from);
    await set(typedIn(from), text); v = await all(); n++;
    for (const [to, want] of Object.entries(answers)) {
      if (+to === from) continue; // the box typed in keeps what was typed
      if (!B[to]) { await setBase(to); v = await all(); if (B[from] ? v.c !== want : false) bad.push(`${text.slice(0, 24)} (base ${from}) in base ${to}: ${v.c.slice(0, 30)} ≠ ${want.slice(0, 30)}`); continue; }
      if (v[to] !== want) bad.push(`${text.slice(0, 24)} (base ${from}) in base ${to}: ${v[to].slice(0, 30)} ≠ ${want.slice(0, 30)}`);
    }
    if (await warn()) bad.push(`${text.slice(0, 24)} (base ${from}): ${await warn()}`);
  }
  ok(n >= 60 && !bad.length, `${n} numbers of the reference, up to 4,096 bits: typed in one box, the others show what Python gives ${bad.slice(0, 3).join(' | ')}`);
  await setBase(3);

  // ---- known numbers
  await set(16, 'DEADBEEF'); v = await all();
  ok(v[10] === '3735928559' && v[2] === (0xdeadbeef).toString(2) && v[8] === (0xdeadbeef).toString(8) && v[16] === 'DEADBEEF', 'hex DEADBEEF → 3735928559; the box typed in keeps what was typed');
  await set(10, (2n ** 128n).toString()); v = await all();
  ok(v[16] === '1' + '0'.repeat(32) && v[2] === '1' + '0'.repeat(128) && v[36] === (2n ** 128n).toString(36).toUpperCase(), '2¹²⁸ exactly');
  await set(10, '-255'); v = await all();
  ok(v[16] === '-FF' && v[2] === '-11111111', `a negative number keeps its sign (${v[16]})`);
  await set(10, '+255'); ok((await all())[16] === 'FF' && !(await warn()), 'a plus sign is read (it was refused)');
  await set(10, '−255'); ok((await all())[16] === '-FF' && !(await warn()), 'a typographic minus is a minus');
  await set(10, '1,00,000'); ok((await all())[16] === '186A0', 'commas between digits are skipped');

  // ---- a prefix is read in its own base only
  await set(2, '0b1010_1010'); ok((await all())[10] === '170', '0b and _ in binary');
  await set(16, '0x7f'); ok((await all())[10] === '127', '0x in hexadecimal');
  await set(8, '0o17'); ok((await all())[10] === '15', '0o in octal');
  await set(16, '0b1'); ok((await all())[10] === '177' && !(await warn()), `in hexadecimal "0b1" is the number B1 = 177 (it was read as binary 1) — ${(await all())[10]}`);
  await set(36, '0x1f'); ok((await all())[10] === '42819', `in base 36 "0x1f" is four digits: 42,819 (it was 51) — ${(await all())[10]}`);
  await set(36, 'zz'); ok((await all())[10] === '1295', 'base 36 zz = 1295');

  // ---- what is not a number: the reason is given and the other boxes are emptied
  await set(2, '1021'); v = await all();
  ok(await isBad(2) && await warn() === '“2” is not a binary digit (0–1).' && v[10] === '' && v[16] === '' && v.c === '' && v[2] === '1021', `a 2 in binary: the box is marked, the reason given, and the other boxes do not go on showing the number of before (they showed 1295) — ${await warn()}; ${JSON.stringify(v)}`);
  await set(2, '101'); ok(!(await isBad(2)) && !(await warn()) && (await all())[10] === '5', 'corrected: everything is back');
  await set(8, '78'); ok(await warn() === '“8” is not an octal digit (0–7).', `an 8 in octal (${await warn()})`);
  await set(16, '12g'); ok(await warn() === '“g” is not a hexadecimal digit (0–9 and A–F).', `a g in hexadecimal (${await warn()})`);
  await set(10, '10.5'); ok(await warn() === 'Only whole numbers can be converted — there is a point in this one.', `a fraction (${await warn()})`);
  await set(10, '5-3'); ok(await warn() === 'A sign belongs in front of the number.', 'a sign in the middle');
  await set(10, ''); v = await all();
  ok(!(await isBad(10)) && !(await warn()) && v[2] === '' && v[16] === '', 'an emptied box is not an error; the others are emptied with it (it was marked wrong and the others kept their number)');
  await set(10, '1'.repeat(10001)); ok(await warn() === 'Too long — at most 10,000 digits.', 'more than ten thousand digits');
  { const t0 = Date.now(); await set(10, '9'.repeat(10000)); v = await all(); const ms = Date.now() - t0; ok(v[2].length === 33220 && v[16].length === 8305 && ms < 3000, `ten thousand digits in ${ms} ms → ${v[2].length} bits`); }

  // ---- the custom base
  await set(10, '255'); await setBase(7);
  ok((await all()).c === (255).toString(7) && !(await warn()), 'custom base 7');
  await set('c', '666'); v = await all();
  ok(v[10] === '342' && v[16] === '156', `typed in the custom box (base 7): 666 = 342 (${v[10]})`);
  await setBase(9); ok((await all()).c === (342).toString(9) && (await all())[10] === '342', 'changing the base rewrites the custom box, the number stays');
  await set('c', '89'); ok(await warn() === '“9” is not a base-9 digit (0–8).', `a 9 in base 9 (${await warn()})`);
  await set(10, '255');
  for (const b of [40, 1, 0, 2.5, '']) { await setBase(b); ok(await warn() === 'The custom base must be a whole number from 2 to 36.' && (await all()).c === '' && (await all())[16] === 'FF', `a custom base of "${b}" is refused and its box left empty (40 was quietly taken as 36, 1 as 2) — the other boxes go on`); }
  await setBase(36); ok((await all()).c === '73' && !(await warn()), 'base 36 is the largest');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/base`); await ph.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '11111111'));
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  { const el = ph.locator('.field').filter({ hasText: 'Decimal (base 10)' }).locator('input'); await el.fill((2n ** 256n).toString()); await el.dispatchEvent('input');
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: a 256-bit number does not widen the page; the boxes are 44 px touch targets'); }
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
