// API Key Generator (#/apikey, PC only): each format's alphabet and length for the chosen byte count, prefix, count,
// all keys different, bits label, GitHub-style CRC32 checksum verified with Node's zlib.crc32 + base62 here, χ² of
// alphanumeric characters; a prefix re-labels the keys shown, exact lengths for every byte count, the fixed-length
// GitHub style, 400 keys without a repeat, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { crc32 } from 'node:zlib';
import { chiUniform } from './_stats.mjs';
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const b62 = (v, w) => { let s = ''; while (v > 0) { s = B62[v % 62] + s; v = Math.floor(v / 62); } return s.padStart(w, '0'); };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/apikey`);
  const out = page.locator('textarea'); await page.waitForFunction(() => document.querySelector('textarea')?.value.length > 0);
  const keys = async () => (await out.inputValue()).split('\n');
  const setS = async (i, v) => { const r = page.locator('input[type=range]').nth(i); await r.fill(String(v)); await r.dispatchEvent('input'); };
  let k = await keys(); ok(k.length === 5 && k.every((x) => /^[A-Za-z0-9_-]{43}$/.test(x)) && new Set(k).size === 5, 'default: 5 Base64url keys of 32 bytes (43 chars), all different');
  ok(/256 bits/.test(await page.locator('.muted', { hasText: 'bits' }).textContent()), '256 bits');
  await page.locator('select').selectOption('hex'); await setS(0, 16); k = await keys(); ok(k.every((x) => /^[0-9a-f]{32}$/.test(x)), 'hex: 16 bytes = 32 hex digits');
  await page.locator('select').selectOption('base32'); await setS(0, 20); k = await keys(); ok(k.every((x) => /^[a-z2-7]{32}$/.test(x)), 'Base32: 20 bytes = 32 characters, lower case');
  await page.locator('select').selectOption('alnum'); await setS(0, 32); k = await keys(); ok(k.every((x) => /^[A-Za-z0-9]{43}$/.test(x)) && /25[6-9] bits/.test(await page.locator('.muted', { hasText: 'bits' }).textContent()), 'letters + digits: 43 characters ≥ 256 bits');
  await page.locator('input[aria-label=Prefix]').fill('sk_live_'); k = await keys(); ok(k.every((x) => x.startsWith('sk_live_') && x.length === 51), 'prefix added');
  await setS(1, 20); k = await keys(); ok(k.length === 20 && new Set(k).size === 20, '20 keys, all different');
  const chars = []; for (let i = 0; i < 15; i++) { await page.getByRole('button', { name: 'Generate again' }).click(); (await keys()).forEach((x) => chars.push(...x.slice(8))); }
  const c = chiUniform([...B62].map((ch) => chars.filter((x) => x === ch).length)); ok(c.pass, `characters uniform over 62 symbols: ${c.text}`);
  await page.locator('input[aria-label=Prefix]').fill('ghp_'); await page.locator('select').selectOption('github'); k = await keys();
  ok(k.every((x) => /^ghp_[A-Za-z0-9]{36}$/.test(x) && x.slice(-6) === b62(crc32(x.slice(4, -6)), 6)), 'GitHub-style: 30 random + CRC32 in base62 (checked with zlib.crc32)');
  ok(/checksum/.test(await page.locator('.muted', { hasText: 'bits' }).textContent()), 'checksum explained');
  // ---- bug hunt, Nov 2026
  const pre = page.locator('input[aria-label=Prefix]'), body = (x, p) => x.slice(p.length);
  await page.locator('select').selectOption('hex'); await pre.fill(''); await setS(0, 24); await setS(1, 6); const before = await keys();
  await pre.pressSequentially('pk_test_'); const after = await keys();
  ok(after.every((x, i) => x === `pk_test_${before[i]}`), 'typing a prefix re-labels the keys already shown (each keystroke used to throw them away and make new ones)');
  await pre.fill('sk_'); ok((await keys()).every((x, i) => x === `sk_${before[i]}`), 'changing the prefix again keeps the same random parts');
  await page.getByRole('button', { name: 'Generate again' }).click(); const fresh = await keys(); ok(fresh.every((x) => x.startsWith('sk_')) && fresh.every((x) => !before.includes(body(x, 'sk_'))), '"Generate again" makes new random parts');
  await pre.fill('my key "x" '); ok(/awkward in URLs/.test(await page.locator('.note-warn').textContent()), 'a prefix with spaces or quotes gets a warning');
  await pre.fill('team-1_'); ok(await page.locator('.note-warn').count() === 0, 'letters, digits, - and _ are fine');
  await pre.fill('');
  // lengths for every byte count (exact formulas), every format
  const lens = [];
  for (const [fmt, len, re] of [['hex', (n) => 2 * n, /^[0-9a-f]+$/], ['base64url', (n) => Math.ceil((4 * n) / 3), /^[A-Za-z0-9_-]+$/], ['base32', (n) => Math.ceil((8 * n) / 5), /^[a-z2-7]+$/], ['alnum', (n) => Math.ceil((8 * n) / Math.log2(62)), /^[A-Za-z0-9]+$/]]) {
    await page.locator('select').selectOption(fmt);
    for (const n of [16, 17, 23, 31, 32, 33, 48, 64]) { await setS(0, n); const ks = await keys(); const bitsTxt = await page.locator('.muted', { hasText: 'bits' }).textContent(); const wantBits = fmt === 'alnum' ? Math.floor(len(n) * Math.log2(62)) : 8 * n;
      if (!ks.every((x) => x.length === len(n) && re.test(x)) || !bitsTxt.startsWith(`${wantBits} bits`)) lens.push(`${fmt}/${n}: ${ks[0].length} chars, ${bitsTxt.slice(0, 12)}`); }
  }
  ok(!lens.length, `4 formats × 8 byte counts: exact length, alphabet and bits label ${lens.slice(0, 4).join(' | ')}`);
  // GitHub style: the length is fixed, so the bytes slider is switched off (it used to look active and do nothing)
  await page.locator('select').selectOption('github'); const rng = page.locator('input[type=range]').first();
  ok(await rng.isDisabled() && /always has 30 random characters/.test(await page.locator('.muted', { hasText: 'bits' }).textContent()) && /^178 bits/.test(await page.locator('.muted', { hasText: 'bits' }).textContent()), 'GitHub style: "Random bytes" is disabled, 178 bits explained');
  k = await keys(); ok(k.every((x) => x.length === 36 && x.slice(-6) === b62(crc32(x.slice(0, -6)), 6)), 'GitHub style without a prefix: checksum still right');
  await page.locator('select').selectOption('hex'); ok(await rng.isEnabled(), 'back to hex: the slider works again');
  await setS(1, 1); ok((await keys()).length === 1, 'one key'); await setS(1, 20);
  // randomness: no repeated key in 400, every hex digit and bit position used evenly
  await setS(0, 16); const many = []; for (let i = 0; i < 20; i++) { await page.getByRole('button', { name: 'Generate again' }).click(); many.push(...await keys()); }
  const digits = many.join(''); const cHex = chiUniform([...'0123456789abcdef'].map((ch) => digits.split(ch).length - 1));
  ok(many.length === 400 && new Set(many).size === 400 && cHex.pass, `400 keys: none repeated, hex digits uniform (${cHex.text})`);
  const firstCh = chiUniform([...'0123456789abcdef'].map((ch) => many.filter((x) => x[0] === ch).length)), lastCh = chiUniform([...'0123456789abcdef'].map((ch) => many.filter((x) => x.at(-1) === ch).length));
  ok(firstCh.pass && lastCh.pass, `first and last characters are uniform too (${firstCh.text}; ${lastCh.text})`);
  const ctx2 = page.context(); await ctx2.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.getByRole('button', { name: 'Copy all' }).click(); const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  if (clip !== null) ok(clip === (await keys()).join('\n'), 'Copy all puts every key on the clipboard, one per line');
  ok(await pre.getAttribute('maxlength') === '64', 'the prefix is limited to 64 characters');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'apikey');
};
