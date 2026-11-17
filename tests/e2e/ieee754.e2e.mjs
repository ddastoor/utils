// IEEE-754 Inspector (#/ieee754, PC only): bits, hex, kind, exponent and neighbours for doubles and floats compared with
// Node's DataView / Buffer here; the exact decimal of 0.1 (0.1000000000000000055511151231257827021181583404541015625);
// float32 rounding (16777217 → 16777216) and exact ties (no double rounding) against exact rational arithmetic
// (tests/fixtures/ieee/reference.json); −0, subnormals, Infinity, NaN payloads; too large / too small notes; a
// million-digit exponent does not freeze the page; invalid input; chips; hex → value; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const bits64 = (x) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return b.toString('hex').toUpperCase(); }, bits32 = (x) => { const b = Buffer.alloc(4); b.writeFloatBE(x); return b.toString('hex').toUpperCase(); };
const next64 = (x, d) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); let v = b.readBigUInt64BE(); v = x === 0 ? (d > 0 ? 1n : (1n << 63n) | 1n) : (x > 0) === (d > 0) ? v + 1n : v - 1n; b.writeBigUInt64BE(v); return b.readDoubleBE(); };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/ieee754`);
  const val = page.locator('input[aria-label=Number]'), hex = page.locator('input[aria-label="Hex bits"]'); await val.waitFor();
  const kv = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  let r = await kv();
  ok(r['Exact decimal'] === '0.1000000000000000055511151231257827021181583404541015625' && await hex.inputValue() === '3FB999999999999A', `0.1 as a double: exact value and bits 3FB999999999999A (${r['Exact decimal']})`);
  ok(r.Exponent === '01111111011 = 1019 − 1023 = -4' && r.Kind === 'Normal', `exponent breakdown (${r.Exponent})`);
  ok(r['Stored − typed'] === '0.0000000000000000055511151231257827021181583404541015625' && /cannot be stored exactly/.test(await page.locator('.tool-body .note').last().textContent()), `0.1 is not stored exactly: error 5.55e-18 shown exactly (${r['Stored − typed']}) — was "0 (exact)"`);
  await val.fill('0.5'); ok((await kv())['Stored − typed'] === '0 (stored exactly)', '0.5 is stored exactly');
  const pyErr = (t) => execFileSync('python3', ['-c', 'import sys; from decimal import Decimal, getcontext; getcontext().prec = 400; d = Decimal(float(sys.argv[1])) - Decimal(sys.argv[1]); print(format(d.normalize(), "f"))', t]).toString().trim();
  for (const t of ['1e-2', '123.456', '-7.1', '1e22', '2.5e-5']) { await val.fill(t); const got = (await kv())['Stored − typed']; ok(got === (pyErr(t) === '0' ? '0 (stored exactly)' : pyErr(t)), `"${t}": stored − typed = Python Decimal (${got})`); }
  const bad = [];
  for (const x of [1, -2.5, 3.141592653589793, 1e308, 5e-324, 2.2250738585072014e-308, 123456789.123, 9007199254740993, 0.30000000000000004, -1e-310]) {
    await val.fill(String(x)); r = await kv();
    if (await hex.inputValue() !== bits64(x) || r['Stored value'] !== String(x) || r['Next larger'] !== String(next64(x, 1)) || r['Next smaller'] !== String(next64(x, -1))) bad.push(`${x}: ${await hex.inputValue()} vs ${bits64(x)}, next ${r['Next larger']} vs ${next64(x, 1)}`);
  }
  ok(!bad.length, `10 doubles: bits = Buffer.writeDoubleBE, neighbours = ±1 ulp ${bad.slice(0, 3).join('; ')}`);
  await val.fill('5e-324'); r = await kv(); ok(r.Kind === 'Subnormal' && r['Next smaller'] === '0', 'smallest subnormal; next smaller is 0');
  await val.fill('-0'); r = await kv(); ok(r.Kind === 'Zero' && r.Sign === '1 (negative)' && await hex.inputValue() === '8000000000000000' && r['Stored value'] === '-0', 'negative zero');
  await val.fill('Infinity'); r = await kv(); ok(r.Kind === 'Infinity' && await hex.inputValue() === '7FF0000000000000', 'Infinity');
  await val.fill('NaN'); r = await kv(); ok(r.Kind === 'NaN' && /^7FF8/.test(await hex.inputValue()), 'NaN');
  await val.fill('9007199254740993'); ok(/cannot be stored exactly/.test(await page.locator('.tool-body .note').last().textContent()) && (await kv())['Stored − typed'] === '-1' && (await kv())['Stored value'] === '9007199254740992', '2^53 + 1 is stored as 2^53 (note shown)');
  await page.getByRole('radio', { name: 'float (32-bit)' }).click();
  const bad32 = [];
  for (const x of [0.1, 1, -2.5, 16777217, 3.4028235e38, 1e-45, 1e39]) { await val.fill(String(x)); r = await kv(); if (await hex.inputValue() !== bits32(x) || r['Stored value'] !== String(Math.fround(x))) bad32.push(`${x}: ${await hex.inputValue()} vs ${bits32(x)}`); }
  ok(!bad32.length, `7 floats: bits = Buffer.writeFloatBE, stored = Math.fround ${bad32.join('; ')}`);
  await val.fill('0.1'); r = await kv(); ok(r['Exact decimal'] === '0.100000001490116119384765625' && r.Exponent === '01111011 = 123 − 127 = -4', `float 0.1 exact = 0.100000001490116119384765625 (${r['Exact decimal']})`);
  await val.fill('1e39'); ok((await kv()).Kind === 'Infinity', 'too big for a float → Infinity');
  await hex.fill('40490FDB'); ok(await val.inputValue() === String(Math.fround(Math.PI)) && (await kv()).Kind === 'Normal', 'hex 40490FDB → π as a float');
  await page.getByRole('radio', { name: 'double (64-bit)' }).click(); await hex.fill('400921FB54442D18'); ok(await val.inputValue() === String(Math.PI), 'hex 400921FB54442D18 → π');
  await hex.fill('123'); ok(await hex.evaluate((e) => e.classList.contains('bad')), 'short hex marked');
  ok(await page.locator('.ieee-bits .b-exp').textContent() === '10000000000' && (await page.locator('.ieee-bits').textContent()).length === 64, 'bit strip: 1 + 11 + 52 = 64 bits');
  await val.fill('abc'); ok(await val.evaluate((e) => e.classList.contains('bad')) && /is not a number/.test(await page.locator('.tool-body .note-warn').textContent()) && await page.locator('.ieee-bits').textContent() === '' && await hex.inputValue() === '' && Object.keys(await kv()).length === 0, 'non-number: marked, explained, and the old result is cleared (it used to stay on screen)');
  await val.fill(''); ok(/Type a number/.test(await page.locator('.tool-body .note-warn').textContent()), 'empty box asks for a number');
  await val.fill('2'); ok(await hex.inputValue() === '4000000000000000' && !(await val.evaluate((e) => e.classList.contains('bad'))) && (await kv()).Kind === 'Normal', 'a valid number after that works again');
  // exact rational rounding (Python fractions): doubles, and floats where rounding through a double first goes wrong
  const ref = JSON.parse(readFileSync(new URL('../fixtures/ieee/reference.json', import.meta.url), 'utf8')).rows;
  const some = ref.filter((_, i) => i % 9 === 0), bad64 = [];
  for (const row of some) { await val.fill(row.text); const g = await kv(); if (await hex.inputValue() !== row.f64 || (g['Exact decimal'] ?? '') !== row.exact64) bad64.push(row.text); }
  ok(!bad64.length, `${some.length} decimals as doubles: bits and exact decimal = exact rational arithmetic ${bad64.slice(0, 3).join(', ')}`);
  await page.getByRole('radio', { name: 'float (32-bit)' }).click();
  const b32 = (x) => { const b = Buffer.alloc(4); b.writeFloatBE(x); return b.toString('hex').toUpperCase(); };
  const tricky = ref.filter((row) => b32(Math.fround(Number(row.text))) !== row.f32), plain = ref.filter((_, i) => i % 13 === 0), badF = [];
  for (const row of [...tricky, ...plain]) { await val.fill(row.text); const g = await kv(); if (await hex.inputValue() !== row.f32 || (g['Exact decimal'] ?? '') !== row.exact32) badF.push(`${row.text} → ${await hex.inputValue()} ≠ ${row.f32}`); }
  ok(tricky.length >= 15 && !badF.length, `${tricky.length} decimals that sit on or next to a float32 tie (where rounding via a double gives the wrong float) + ${plain.length} others: correct bits ${badF.slice(0, 2).join('; ')}`);
  await val.fill('1.0000000596046447753906251'); ok(await hex.inputValue() === '3F800001', 'just above the tie between 1 and the next float → 3F800001 (was 3F800000)');
  await val.fill('1.000000059604644775390625'); ok(await hex.inputValue() === '3F800000', 'exactly on the tie → the even mantissa, 3F800000');
  await val.fill('3.4028235677973366e38'); ok(await hex.inputValue() === '7F7FFFFF' && !/Too large/.test(await page.locator('.tool-body').textContent()), 'a hair below half-way between the largest float and 2^128 stays the largest float (rounding through a double made it Infinity)');
  await val.fill('340282356779733661637539395458142568448'); ok(await hex.inputValue() === '7F800000' && /Too large for a 32-bit float/.test(await page.locator('.tool-body').textContent()), 'exactly half-way rounds to Infinity (the even side), with a note');
  await val.fill('340282356779733661637539395458142568447'); ok(await hex.inputValue() === '7F7FFFFF', '… one less stays the largest float');
  await val.fill('7.006492321624086e-46'); ok(await hex.inputValue() === '00000001', 'just above half the smallest float → the smallest float');
  await val.fill('7e-46'); ok(await hex.inputValue() === '00000000' && /Too small for a 32-bit float/.test(await page.locator('.tool-body').textContent()), 'below half the smallest float → 0, with a note');
  await val.fill('16777217'); r = await kv(); ok(r['Stored value'] === '16777216' && r['Stored − typed'] === '-1' && r['Next larger'] === '16777218', '2^24 + 1 as a float is 16777216; the next float is 16777218');
  await page.getByRole('radio', { name: 'double (64-bit)' }).click(); ok((await kv())['Stored value'] === '16777217' && await val.inputValue() === '16777217', 'switching to double keeps the typed number and stores it exactly');
  // limits and special values
  await val.fill('1e400'); r = await kv(); ok(r.Kind === 'Infinity' && r['Next larger'] === '—' && r['Next smaller'] === '1.7976931348623157e+308' && /Too large for a 64-bit float/.test(await page.locator('.tool-body').textContent()), '1e400 → Infinity with a note; nothing lies above Infinity');
  await val.fill('-Infinity'); r = await kv(); ok(r['Next smaller'] === '—' && r['Next larger'] === '-1.7976931348623157e+308' && !/Too large/.test(await page.locator('.tool-body').textContent()), '-Infinity typed as such: no "too large" note');
  await val.fill('NaN'); r = await kv(); ok(r['Next larger'] === '—' && r['Next smaller'] === '—' && r['Exact decimal'] === 'NaN', 'NaN has no neighbours');
  let t0 = Date.now(); await val.fill('1e-400'); r = await kv(); ok(r.Kind === 'Zero' && /Too small for a 64-bit float/.test(await page.locator('.tool-body').textContent()) && !/cannot be stored exactly/.test(await page.locator('.tool-body').textContent()), '1e-400 → 0 with one note (too small)');
  t0 = Date.now(); await val.fill('1e-1000000'); r = await kv(); ok(Date.now() - t0 < 3000 && r.Kind === 'Zero' && r['Stored − typed'] === '—', `1e-1000000 answers at once (${Date.now() - t0} ms) — it used to freeze the page`);
  t0 = Date.now(); await val.fill(`0.${'0'.repeat(9000)}1`); r = await kv(); ok(Date.now() - t0 < 3000 && r.Kind === 'Zero', 'a 9,000-digit fraction answers at once');
  await hex.fill('7FF0000000000001'); r = await kv(); ok(r.Kind === 'NaN' && await val.inputValue() === 'NaN' && await page.locator('.ieee-bits .b-man').textContent() === `${'0'.repeat(51)}1`, 'a NaN payload typed as hex is kept in the bit view');
  await hex.fill('0x3FF0 0000_0000 0000'); ok(await val.inputValue() === '1' && !(await hex.evaluate((e) => e.classList.contains('bad'))), 'hex with 0x, spaces and underscores');
  await hex.fill('8000000000000000'); ok(await val.inputValue() === '-0' && (await kv()).Kind === 'Zero', 'hex of negative zero → -0');
  for (const [chip, want] of [['0.1', '3FB999999999999A'], ['-0', '8000000000000000'], ['1e-310', '000012688B70E62B'], ['Infinity', '7FF0000000000000'], ['9007199254740993', '4340000000000000']]) { await page.locator('.chip-btn', { hasText: new RegExp(`^${chip.replace(/[.+]/g, '\\$&')}$`) }).click(); ok(await hex.inputValue() === want, `chip ${chip} → ${want}`); }
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'ieee754');
};
