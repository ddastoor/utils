// API Key Generator (#/apikey, PC only): each format's alphabet and length for the chosen byte count, prefix, count,
// all keys different, bits label, GitHub-style CRC32 checksum verified with Node's zlib.crc32 + base62 here, χ² of
// alphanumeric characters, phone note.
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
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'apikey');
};
