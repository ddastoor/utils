// Bitwise Calculator (#/bitwise, PC only): every operation at 8/16/32/64 bits checked against BigInt / Int32 maths done
// here (including JS's own 32-bit operators), signed/unsigned views, all number syntaxes, overflow note, bit grid
// (count, click to flip), invalid input, phone note.
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
  const set = async (a, b, op, n, w) => { await page.getByRole('radio', { name: `${w}-bit` }).click(); await page.locator('select').selectOption(op); await A.fill(a); await B.fill(b); await S.fill(String(n)); await page.waitForTimeout(150); return res(); };
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
  r = await set('0b1011', '0', 'NOT', 1, 8); ok(r.Binary === '1111 0100' && r['Bits set'] === '5' && r.Octal === '0o364', `~0b1011 in 8 bits = 1111 0100 (${r.Binary})`);
  await page.locator('label.switch', { hasText: 'Signed' }).click(); await page.waitForTimeout(100); r = await res(); ok(r['Result (decimal)'] === '244', 'unsigned view: 244');
  await page.locator('label.switch', { hasText: 'Signed' }).click();
  await set('300', '0', 'AND', 1, 8); ok(/does not fit in 8 bits/.test(await page.locator('.note-warn').textContent()), '300 in 8 bits → overflow note');
  await set('0xA5', '0', 'NOT', 1, 8);
  ok(await page.locator('.bitgrid .bit').count() === 8 && (await page.$$eval('.bitgrid .bit', (b) => b.map((x) => x.textContent).join(''))) === '10100101', 'bit grid shows A (0xA5 = 10100101)');
  await page.locator('.bitgrid .bit[aria-label="A bit 0"]').click(); ok(await A.inputValue() === '0xA4', 'clicking bit 0 flips it (0xA4)');
  await page.getByRole('radio', { name: '64-bit' }).click(); ok(await page.locator('.bitgrid .bit').count() === 64, '64 bits drawn');
  await A.fill('0xZZ'); await page.waitForTimeout(150); ok(await A.evaluate((e) => e.classList.contains('bad')) && /decimal, 0x hex/.test(await page.locator('.note-warn').textContent()), 'invalid number marked');
  await A.fill('1_000_000'); await page.waitForTimeout(150); ok((await res()).A?.startsWith('1000000') ?? true, 'underscores allowed');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'bitwise');
};
