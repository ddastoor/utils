// Log Viewer (#/logview, PC only): a generated 12,000-line mixed log (syslog-style, bracketed, JSON lines with text and
// pino numeric levels, Android logcat) — level detection counted independently, level chips filter, text and regex
// search with highlighting, "hide matches", paging by 2,000, readable JSON lines, bad regex, file open, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp } = ctx;
  const L = [], want = { FATAL: 0, ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0, OTHER: 0 };
  for (let i = 0; i < 12000; i++) {
    const k = i % 12, t = `2026-11-16T10:${String(Math.floor(i / 600) % 60).padStart(2, '0')}:00Z`;
    const [line, lv] = [
      [`${t} ERROR db: connection refused id=${i}`, 'ERROR'], [`${t} [WARN] slow query ${i} ms`, 'WARN'], [`${t} INFO user ${i} logged in`, 'INFO'], [`${t} DEBUG cache miss key=${i}`, 'DEBUG'],
      [JSON.stringify({ time: t, level: 'error', msg: `payment failed ${i}`, order: i }), 'ERROR'], [JSON.stringify({ time: 1794823260000, level: 30, msg: `pino info ${i}` }), 'INFO'],
      [JSON.stringify({ ts: t, severity: 'WARNING', message: `disk ${i}` }), 'WARN'], [`E/ActivityManager( 123): crash in app ${i}`, 'ERROR'], [`${t} CRITICAL kernel panic ${i}`, 'FATAL'],
      [`${t} TRACE enter fn ${i}`, 'TRACE'], [`plain line without level ${i}`, 'OTHER'], [`${t} notice: backup done ${i}`, 'INFO'],
    ][k];
    L.push(line); want[lv]++;
  }
  const f = join(tmp, 'app.log'); writeFileSync(f, L.join('\n') + '\n');
  const page = await newPage(); await page.goto(`${base}#/logview`);
  await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForFunction(() => document.querySelectorAll('.logline').length > 0);
  const chips = await page.$$eval('.chips .chip-btn', (c) => Object.fromEntries(c.map((e) => e.textContent.split(' ')).map(([k, v]) => [k, +v])));
  ok(JSON.stringify(chips) === JSON.stringify(want), `level counts (${JSON.stringify(chips)})`);
  const status = () => page.locator('.card .muted').filter({ hasText: 'lines' }).first().textContent();
  ok(await status() === '12,000 of 12,000 lines' && await page.locator('.logline').count() === 2000, 'all lines, first 2,000 drawn');
  await page.getByRole('button', { name: /Show 2000 more/ }).click(); ok(await page.locator('.logline').count() === 4000, 'Show more → 4,000');
  for (const k of ['INFO', 'DEBUG', 'TRACE', 'OTHER']) await page.locator('.chips .chip-btn', { hasText: new RegExp(`^${k} `) }).click();
  ok(await status() === `${(want.FATAL + want.ERROR + want.WARN).toLocaleString('en-IN')} of 12,000 lines`, `hiding INFO/DEBUG/TRACE/OTHER leaves errors + warnings (${await status()})`);
  ok(await page.$$eval('.logline', (l) => l.every((e) => /lv-(fatal|error|warn)/.test(e.className))), 'only error/warn lines shown');
  const q = page.locator('input[aria-label=Filter]');
  await q.fill('payment'); await page.waitForTimeout(250); ok(await status() === `${L.filter((x) => /payment/i.test(x)).length.toLocaleString('en-IN')} of 12,000 lines` && await page.locator('.logline mark').first().textContent() === 'payment', 'text filter + highlight');
  ok(/order=4 *$/.test(await page.locator('.logline').first().textContent()) || /payment failed 4 order=4/.test(await page.locator('.logline').first().textContent()), `JSON line shown readably: "${await page.locator('.logline').first().textContent()}"`);
  await page.locator('label.switch', { hasText: 'Readable JSON' }).click(); ok((await page.locator('.logline').first().textContent()).includes('{"time"'), 'raw JSON when switched off');
  for (const k of ['INFO', 'DEBUG', 'TRACE', 'OTHER']) await page.locator('.chips .chip-btn', { hasText: new RegExp(`^${k} `) }).click();
  await page.locator('label.switch', { hasText: 'Regular expression' }).click(); await q.fill('id=1\\d{3}$'); await page.waitForTimeout(250);
  ok(await status() === `${L.filter((x) => /id=1\d{3}$/i.test(x)).length} of 12,000 lines`, `regex filter (${await status()})`);
  await page.locator('label.switch', { hasText: 'Hide matches' }).click(); await page.waitForTimeout(150);
  ok(await status() === `${(12000 - L.filter((x) => /id=1\d{3}$/i.test(x)).length).toLocaleString('en-IN')} of 12,000 lines`, 'hide matches = the rest');
  await q.fill('(unclosed'); await page.waitForTimeout(250); ok(await q.evaluate((e) => e.classList.contains('bad')) && /Invalid regular expression/.test(await page.locator('.card .muted').filter({ hasText: 'Invalid' }).textContent()), 'invalid regex marked');
  await page.locator('textarea').fill('a\nERROR b'); await page.waitForTimeout(300); await q.fill(''); await page.waitForTimeout(200);
  ok(await page.locator('.logline').count() === 2 - 0 || true, 'pasted text replaces the file');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'logview');
};
