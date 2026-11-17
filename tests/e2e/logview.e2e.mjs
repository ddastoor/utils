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
  ok(await page.locator('.logline').count() === 2 && await status() === '2 of 2 lines', 'pasted text replaces the file; "Hide matches" with an empty filter hides nothing (it used to hide every line)');
  // ---- bug hunt, Nov 2026
  const paste = async (t) => { await page.locator('textarea').fill(t); await page.waitForTimeout(330); };
  const chipsNow = () => page.$$eval('.chips .chip-btn', (c) => Object.fromEntries(c.map((e) => e.textContent.split(' ')).map(([k, v]) => [k, +v])));
  const lineLv = () => page.$$eval('.logline', (r) => r.map((e) => `${[...e.classList].find((c) => c.startsWith('lv-')).slice(3).toUpperCase()} ${e.lastElementChild.textContent}`));
  for (const [label, want] of [['Hide matches', false], ['Regular expression', false], ['Readable JSON', true]]) { const sw = page.locator('label.switch', { hasText: label }); if (await sw.locator('input').isChecked() !== want) await sw.click(); }
  for (const k of ['INFO', 'DEBUG', 'TRACE', 'OTHER']) { const c = page.locator('.chips .chip-btn', { hasText: new RegExp(`^${k} `) }); if (await c.getAttribute('aria-pressed') === 'false') await c.click(); }
  // colour codes from terminals; one-letter and numeric level formats; words in the message that are not levels
  await paste(['\x1b[31mERROR\x1b[0m database down', '\x1b[33mWARN\x1b[39m slow query', '11-17 10:00:00.000  1234  1234 E MyTag: logcat', 'W1117 10:00:00.000000       1 klog.go:1] klog warning', '<3>kernel: syslog priority', '<134>Nov 17 app: info', '{"log":{"level":"error"},"message":"ECS"}',
    '10:00:01 user info updated for id 7', 'GET /api/errors 200 12ms', '10:00:01 [worker-1] Finished without error', 'ERRORS=0 WARNINGS=0'].join('\n'));
  const got1 = await lineLv();
  ok(JSON.stringify(got1.map((x) => x.split(' ')[0])) === JSON.stringify(['ERROR', 'WARN', 'ERROR', 'WARN', 'ERROR', 'INFO', 'ERROR', 'OTHER', 'OTHER', 'OTHER', 'OTHER']), `coloured lines, logcat, klog, syslog <priority> and nested JSON levels are recognised; "user info updated" and "/api/errors" are not levels (${got1.map((x) => x.split(' ')[0]).join(' ')})`);
  ok(got1[0] === 'ERROR ERROR database down' && !(await page.locator('.logview').textContent()).includes('\x1b'), 'colour codes are not shown as junk characters');
  // a stack trace stays with its error
  await paste('2026-11-17 10:00:00 INFO start\n2026-11-17 10:00:01 ERROR Unhandled exception\njava.lang.NullPointerException: boom\n\tat com.example.App.main(App.java:10)\nCaused by: java.io.IOException: disk\n\t... 3 more\n2026-11-17 10:00:02 INFO recovered\n');
  ok(JSON.stringify(await chipsNow()) === JSON.stringify({ FATAL: 0, ERROR: 5, WARN: 0, INFO: 2, DEBUG: 0, TRACE: 0, OTHER: 0 }), `the four lines of a stack trace count with their ERROR (${JSON.stringify(await chipsNow())})`);
  await page.locator('.chips .chip-btn', { hasText: /^INFO / }).click(); ok(await page.locator('.logline').count() === 5 && /\.\.\. 3 more/.test(await page.locator('.logview').textContent()), '"errors only" keeps the whole trace (the trace lines used to be OTHER and vanish or stay behind)');
  await page.locator('.chips .chip-btn', { hasText: /^INFO / }).click();
  // the filter sees what is on screen: the readable form of JSON lines, with the match marked
  await paste('{"time":"2026-11-17T10:00:00Z","level":"info","msg":"login ok","user":42}\n{"time":"2026-11-17T10:00:01Z","level":"error","msg":"payment failed","user":7}\nplain line');
  await q.fill('user=42'); await page.waitForTimeout(250);
  ok(await status() === '1 of 3 lines' && (await page.locator('.logline mark').allTextContents()).join() === 'user=42', 'filter "user=42" finds the readable JSON line and marks the match (it used to find nothing: only the raw JSON was searched)');
  await q.fill('"user":42'); await page.waitForTimeout(250); ok(await status() === '1 of 3 lines', 'the raw JSON text still matches too');
  await q.fill('10:00:01Z payment'); await page.waitForTimeout(250); ok(await status() === '1 of 3 lines' && await page.locator('.logline mark').count() === 1, 'a filter across two readable fields');
  await page.locator('label.switch', { hasText: 'Hide matches' }).click(); await page.waitForTimeout(200); ok(await status() === '2 of 3 lines', 'Hide matches = the other two');
  await q.fill(''); await page.waitForTimeout(250); ok(await status() === '3 of 3 lines', 'clearing the filter with Hide matches on shows everything');
  await page.locator('label.switch', { hasText: 'Hide matches' }).click();
  // regex mode: groups, anchors, a zero-length pattern cannot hang, special characters are literal in plain mode
  await paste('a.b\naxb\n[x] (y) $z ^w\nerror: 5 + 5 = 10\n'); await q.fill('a.b'); await page.waitForTimeout(250); ok(await status() === '1 of 4 lines', 'plain filter: "." is a dot, not "any character"');
  await q.fill('[x] (y) $z ^w'); await page.waitForTimeout(250); ok(await status() === '1 of 4 lines', 'plain filter with [ ] ( ) $ ^');
  await page.locator('label.switch', { hasText: 'Regular expression' }).click(); await q.fill('a.b'); await page.waitForTimeout(250); ok(await status() === '2 of 4 lines', 'regular expression: a.b matches a.b and axb');
  for (const z of ['^', 'x*', '(?:)', 'a|']) { await q.fill(z); await page.waitForTimeout(250); if (await status() !== '4 of 4 lines') ok(false, `regex ${z}: ${await status()}`); }
  ok(!page.errors.length, 'patterns that match nothing-long (^, x*, a|) show every line and do not hang');
  await q.fill('(\\d+) \\+ \\1'); await page.waitForTimeout(250); ok(await status() === '1 of 4 lines' && (await page.locator('.logline mark').textContent()) === '5 + 5', 'back-reference (\\d+) \\+ \\1 marks "5 + 5"');
  await page.locator('label.switch', { hasText: 'Regular expression' }).click(); await q.fill('');
  // Windows line ends, blank lines, very long line, more-button
  await paste('ERROR one\r\n\r\nWARN two\r\n'); ok(await status() === '3 of 3 lines' && (await lineLv()).join('|') === 'ERROR ERROR one|OTHER |WARN WARN two', 'CRLF line ends: no stray characters, blank line kept');
  const many = Array.from({ length: 4500 }, (_, i) => `${i % 3 ? 'INFO' : 'DEBUG'} row ${i}`).join('\n'); await page.evaluate((t) => { const ta = document.querySelector('textarea'); ta.value = t; ta.dispatchEvent(new Event('input')); }, many); await page.waitForTimeout(600);
  ok(await page.locator('.logline').count() === 2000 && /Show 2000 more/.test(await page.getByRole('button', { name: /Show \d+ more/ }).textContent()), '4,500 lines: first 2,000 shown, "Show 2000 more"');
  await page.getByRole('button', { name: /Show \d+ more/ }).click(); await page.getByRole('button', { name: /Show \d+ more/ }).click(); await page.waitForTimeout(200);
  ok(await page.locator('.logline').count() === 4500 && await page.getByRole('button', { name: /Show \d+ more/ }).count() === 0, 'two more presses show all 4,500');
  ok((await page.locator('.logline .ln').last().textContent()) === '4500', 'line numbers are those of the file');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'logview');
};
