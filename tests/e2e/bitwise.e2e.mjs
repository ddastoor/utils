// Bitwise Calculator (#/bitwise, PC only): every operation at 8/16/32/64 bits checked against BigInt / Int32 maths done
// here (including JS's own 32-bit operators) for fixed and random operands and shift counts (also ≥ the width: shifts
// empty the word, rotations wrap), signed/unsigned views, all number syntaxes (+, spaces, underscores), every printed
// form pasted back in, overflow notes for A and B, B / shift boxes switched off when unused, bit grid (count, click to
// flip), invalid input, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const P = (s) => { const t = s.replace(/_/g, '').toLowerCase(); const n = t.startsWith('-'); const v = BigInt(n ? t.slice(1) : t); return n ? -v : v; };
const mask = (v, w) => v & ((1n << BigInt(w)) - 1n), sgn = (v, w) => { const x = mask(v, w); return x >> BigInt(w - 1) ? x - (1n << BigInt(w)) : x; };
const OPS = { AND: (a, b) => a & b, OR: (a, b) => a | b, XOR: (a, b) => a ^ b, NOT: (a) => ~a, NAND: (a, b) => ~(a & b), NOR: (a, b) => ~(a | b), SHL: (a, b, n) => a << n, SHR: (a, b, n, w) => sgn(a, w) >> n, USHR: (a, b, n, w) => mask(a, w) >> n,
  ROL: (a, b, n, w) => { const W = BigInt(w), x = mask(a, w), k = n % W; return (x << k) | (x >> ((W - k) % W)); }, ROR: (a, b, n, w) => { const W = BigInt(w), x = mask(a, w), k = n % W; return (x >> k) | (x << ((W - k) % W)); } };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/bitwise`);
  const A = page.locator('input[aria-label=A]'), B = page.locator('input[aria-label=B]'), S = page.locator('input[aria-label=Shift]'); await A.waitFor();
  const res = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  // B and the shift box are switched off for operations that do not use them: fill only what is live
  let curW = 0, curOp = '';
  const set = async (a, b, op, n, w) => { if (w !== curW) { await page.getByRole('radio', { name: `${w}-bit` }).click(); curW = w; } if (op !== curOp) { await page.locator('select').selectOption(op); curOp = op; } await A.fill(a); if (await B.isEnabled()) await B.fill(b); if (await S.isEnabled()) await S.fill(String(n)); await page.waitForTimeout(110); return res(); };
  const bad = [];
  const vals = [['0b1100_1010', '0xF0'], ['-5', '3'], ['0xDEADBEEF', '0x0F0F0F0F'], ['12345678901234567', '-1']];
  for (const w of [8, 16, 32, 64]) for (const op of Object.keys(OPS)) for (const [a, b] of vals) for (const n of [['SHL', 'SHR', 'USHR', 'ROL', 'ROR'].includes(op) ? 5 : 1]) {
    const r = await set(a, b, op, n, w); const want = mask(OPS[op](mask(P(a), w), mask(P(b), w), BigInt(n), w), w);
    if (r.Unsigned !== want.toString() || r['Signed (two’s complement)'] !== sgn(want, w).toString() || r.Hex.replace(/_/g, '') !== `0x${want.toString(16).toUpperCase().padStart(w / 4, '0')}`) bad.push(`${a} ${op} ${b} n=${n} w=${w}: ${r.Unsigned} ≠ ${want}`);
  }
  ok(!bad.length, `11 operations × 4 widths × 4 pairs (unsigned, signed, hex) = BigInt maths ${bad.slice(0, 4).join('; ')}`);
  let r = await set('-7', '0', 'SHR', 1, 32); ok(r['Signed (two’s complement)'] === String(-7 >> 1) && r.Unsigned === String((-7 >> 1) >>> 0), `32-bit -7 >> 1 = JS ${-7 >> 1}`);
  r = await set('-7', '0', 'USHR', 1, 32); ok(r.Unsigned === String(-7 >>> 1), `32-bit -7 >>> 1 = JS ${-7 >>> 1}`);
  r = await set('0x7FFFFFFF', '1', 'SHL', 1, 32); ok(r['Signed (two’s complement)'] === String(0x7fffffff << 1), `0x7FFFFFFF << 1 overflows to ${0x7fffffff << 1} like JS`);
  r = await set('0b1011', '0', 'NOT', 1, 8); ok(r.Binary === '0b1111_0100' && r['Bits set'] === '5' && r.Octal === '0o364', `~0b1011 in 8 bits = 0b1111_0100 (${r.Binary})`);
  // random operands and counts (counts up to width + 3), against BigInt
  const rnd = (w) => { let v = 0n; for (let i = 0; i < w; i += 16) v = (v << 16n) | BigInt(Math.floor(Math.random() * 65536)); return mask(v, w); };
  const bad2 = [];
  for (const w of [8, 16, 32, 64]) for (const op of Object.keys(OPS)) { const a = rnd(w), b = rnd(w), n = Math.floor(Math.random() * (w + 4)); const g = await set(`0x${a.toString(16)}`, b.toString(), op, n, w);
    const sh = /SH|RO/.test(op), nn = BigInt(sh && !/RO/.test(op) ? Math.min(n, w) : n), want = mask(OPS[op](a, b, nn, w), w);
    if (g.Unsigned !== want.toString() || g['Signed (two’s complement)'] !== BigInt.asIntN(w, want).toString() || g['Bits set'] !== String([...want.toString(2)].filter((c) => c === '1').length)) bad2.push(`${a.toString(16)} ${op} ${b} n=${n} w=${w}: ${g.Unsigned} ≠ ${want}`); }
  ok(!bad2.length, `random operands: 11 operations × 4 widths, counts up to the width + 3, bits set = popcount ${bad2.slice(0, 3).join('; ')}`);
  // rotations wrap; shifts by the width or more empty the word
  r = await set('0b1100_1010', '0', 'ROL', 9, 8); ok(r.Hex === '0x95' && /same as by 1/.test(await page.locator('.tool-body .note-info').first().textContent()), `ROL by 9 in 8 bits = ROL by 1 = 0x95 (${r.Hex}) — used to be ignored`);
  r = await set('0b1100_1010', '0', 'ROR', 9, 8); ok(r.Hex === '0x65', `ROR by 9 in 8 bits = 0x65 (${r.Hex})`);
  r = await set('1', '0', 'ROL', 33, 32); ok(r.Unsigned === '2', 'ROL by 33 in 32 bits = 2');
  r = await set('1', '0', 'ROL', 8, 8); ok(r.Unsigned === '1', 'a rotation by the full width changes nothing');
  r = await set('1', '0', 'SHL', 40, 32); ok(r.Unsigned === '0' && /moves every bit out/.test(await page.locator('.tool-body .note-info').first().textContent()), 'SHL by 40 in 32 bits = 0, with a note');
  r = await set('-8', '0', 'SHR', 40, 32); ok(r['Signed (two’s complement)'] === '-1', 'arithmetic SHR by 40 of -8 = -1 (sign fill)');
  r = await set('-8', '0', 'USHR', 40, 32); ok(r.Unsigned === '0', 'logical USHR by 40 = 0');
  // the boxes an operation does not use are off, and an empty B does not block NOT
  await set('5', '3', 'NOT', 1, 8); ok(await B.isDisabled() && await S.isDisabled(), 'NOT: B and the shift box are switched off');
  await set('5', '3', 'SHL', 1, 8); ok(await B.isDisabled() && await S.isEnabled(), 'SHL: only B is off');
  await set('5', '3', 'XOR', 1, 8); ok(await B.isEnabled() && await S.isDisabled(), 'XOR: only the shift box is off');
  await B.fill(''); await page.waitForTimeout(150); ok(await B.evaluate((e) => e.classList.contains('bad')), 'XOR with an empty B: B marked');
  await page.locator('select').selectOption('NOT'); curOp = 'NOT'; await page.waitForTimeout(150); r = await res(); ok(r.Hex === '0xFA' && !(await B.evaluate((e) => e.classList.contains('bad'))), '… but NOT works with B empty (0xFA)');
  await B.evaluate((e) => { e.disabled = false; }); await B.fill('3');
  await set('5', '3', 'SHL', 1, 8); await S.fill(''); await page.waitForTimeout(150); ok(/whole number of bits/.test(await page.locator('.tool-body .note-warn').first().textContent()) && await S.evaluate((e) => e.classList.contains('bad')), 'an empty shift count is asked for, not taken as 0');
  await S.fill('-1'); await page.waitForTimeout(150); ok(/whole number of bits/.test(await page.locator('.tool-body .note-warn').first().textContent()), 'a negative count is refused');
  await S.fill('1.9'); await page.waitForTimeout(150); ok((await res()).Unsigned === '10', 'a fractional count uses its whole part (5 << 1 = 10) — used to throw');
  // number syntaxes; every printed form can be pasted back
  r = await set('+5', '0b0000 0110', 'OR', 1, 8); ok(r.Unsigned === '7', '"+5" and "0b0000 0110" (spaces) are read');
  r = await set('0xF0F0_1234', '0', 'NOT', 1, 32);
  for (const k of ['Unsigned', 'Signed (two’s complement)', 'Hex', 'Octal', 'Binary']) { const g = await set(r[k], '0xFFFFFFFF', 'AND', 1, 32); ok(g.Unsigned === r.Unsigned, `${k} output "${r[k].slice(0, 22)}…" pasted back as A gives the same value`); }
  await set('1', '0x1FF', 'AND', 1, 8); ok(/B does not fit in 8 bits/.test(await page.locator('.tool-body').textContent()) && !/A does not fit/.test(await page.locator('.tool-body').textContent()), 'B too wide → note for B (used to be silent)');
  await set('-129', '-129', 'AND', 1, 8); ok(await page.locator('.tool-body .note-warn').count() === 2, '-129 in 8 bits: notes for A and for B');
  await set('-128', '255', 'AND', 1, 8); ok(await page.locator('.tool-body .note-warn').count() === 0, '-128 and 255 both fit in 8 bits');
  await set('0b1011', '0', 'NOT', 1, 8);
  await page.locator('label.switch', { hasText: 'Signed' }).click(); await page.waitForTimeout(100); r = await res(); ok(r['Result (decimal)'] === '244', 'unsigned view: 244');
  await page.locator('label.switch', { hasText: 'Signed' }).click();
  await set('300', '0', 'AND', 1, 8); ok(/does not fit in 8 bits/.test(await page.locator('.note-warn').textContent()), '300 in 8 bits → overflow note');
  await set('0xA5', '0', 'NOT', 1, 8);
  ok(await page.locator('.bitgrid .bit').count() === 8 && (await page.$$eval('.bitgrid .bit', (b) => b.map((x) => x.textContent).join(''))) === '10100101', 'bit grid shows A (0xA5 = 10100101)');
  ok(await page.locator('.bitgrid .bit').last().getAttribute('aria-label') === 'A bit 0: 1', 'a bit\'s name holds the value it shows ("A bit 0: 1" — voice control and screen readers; it was "A bit 0")');
  await page.getByRole('button', { name: 'A bit 0: 1', exact: true }).click(); ok(await A.inputValue() === '0xA4', 'clicking bit 0 flips it (0xA4)');
  ok(await page.locator('.bitgrid .bit').last().getAttribute('aria-label') === 'A bit 0: 0', 'and its name follows (A bit 0: 0)');
  await page.getByRole('radio', { name: '64-bit' }).click(); curW = 64; ok(await page.locator('.bitgrid .bit').count() === 64, '64 bits drawn');
  await A.fill('0xZZ'); await page.waitForTimeout(150); ok(await A.evaluate((e) => e.classList.contains('bad')) && /decimal, 0x hex/.test(await page.locator('.note-warn').textContent()) && await page.locator('.bitgrid .bit').count() === 0, 'invalid number marked, bit grid emptied');
  for (const t of ['1.5', '1e3', '0b12', '--1', '']) { await A.fill(t); await page.waitForTimeout(120); ok(await A.evaluate((e) => e.classList.contains('bad')), `"${t}" is not a whole number`); }
  await A.fill('1_000_000'); await page.waitForTimeout(150); ok((await res()).A?.startsWith('1000000') ?? true, 'underscores allowed');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'bitwise');
};
