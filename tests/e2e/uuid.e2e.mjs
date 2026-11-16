// UUID Generator (#/uuid): RFC 9562 v4 and v7 format (version and variant bits), uniqueness, v7 time = now and
// time-ordered across milliseconds, count, upper case, no hyphens, the inspector (v7 time, v4, v1, invalid).
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/uuid`);
  const out = page.locator('textarea').first(), slider = page.locator('input[type=range]'), check = page.getByPlaceholder('Paste a UUID to inspect');
  const list = async () => (await out.inputValue()).split('\n');
  const setN = async (n) => { await slider.fill(String(n)); await slider.dispatchEvent('input'); };
  const kv = (l) => page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent === l); return i >= 0 ? s[i + 1].textContent : null; }, l);
  await out.waitFor();
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  ok((await list()).length === 5 && (await list()).every((u) => V4.test(u)), 'default: 5 v4 UUIDs with version 4 and RFC variant');
  await setN(100);
  const all = new Set(); for (let i = 0; i < 10; i++) { await page.getByRole('button', { name: 'Generate' }).click(); (await list()).forEach((u) => all.add(u)); }
  ok(all.size === 1000 && [...all].every((u) => V4.test(u)), '1,000 v4 UUIDs, all different');
  const hex = [...all].map((u) => u.replace(/-/g, '')).join(''), counts = {}; for (const c of hex) counts[c] = (counts[c] || 0) + 1;
  const randomHex = [...all].map((u) => u.replace(/-/g, '').slice(0, 12) + u.slice(25)).join(''), rc = {}; for (const c of randomHex) rc[c] = (rc[c] || 0) + 1;
  ok(Object.values(rc).every((n) => Math.abs(n - randomHex.length / 16) < randomHex.length / 16 * 0.15), 'random hex digits evenly spread');
  void counts;
  await page.getByRole('radio', { name: 'v7 (time-ordered)', exact: true }).click(); await setN(5);
  const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const a = await list(); await page.waitForTimeout(5); await page.getByRole('button', { name: 'Generate' }).click(); const b = await list();
  const ms = (u) => parseInt(u.replace(/-/g, '').slice(0, 12), 16);
  ok(a.every((u) => V7.test(u)) && Math.abs(ms(a[0]) - Date.now()) < 5000, `v7 format, timestamp = now (${new Date(ms(a[0])).toISOString()})`);
  ok(a.every((u) => b.every((v) => u < v)), 'v7 sorts by time across generations');
  await page.locator('label.switch').filter({ hasText: 'Uppercase' }).click(); await page.locator('label.switch').filter({ hasText: 'Hyphens' }).click();
  ok((await list()).every((u) => /^[0-9A-F]{32}$/.test(u)), 'upper case without hyphens');
  await check.fill('017F22E2-79B0-7CC3-98C4-DC0C0C07398F');
  ok(await kv('Version') === 'v7' && await kv('Variant') === 'RFC 9562' && await kv('Timestamp') === '2022-02-22T19:22:22.000Z', 'inspect: RFC 9562 example v7 → 2022-02-22T19:22:22Z');
  await check.fill('f81d4fae7dec11d0a76500a0c91e6bf6'); ok(await kv('Version') === 'v1', 'inspect v1 (no hyphens accepted)');
  await check.fill('not-a-uuid'); ok(/Not a valid UUID/.test(await page.locator('.note-warn').textContent()), 'invalid UUID');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'uuid');
};
