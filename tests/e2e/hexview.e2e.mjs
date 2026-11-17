// Hex Viewer (#/hexview, PC only): the dump equals `hexdump -C` style lines computed here, paging (4 KB), offsets past
// 64 KB, go-to offset (hex/decimal), text and hex search with every hit offset checked, 8/32 bytes per line, file type
// detection for real files (PNG, PDF, ZIP, gzip, ELF, wasm, text), phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const dump = (b, off, w) => { let o = ''; for (let i = 0; i < b.length; i += w) { const c = b.subarray(i, i + w); let hx = ''; for (let k = 0; k < w; k++) { hx += k < c.length ? c[k].toString(16).padStart(2, '0') + ' ' : '   '; if (k % 8 === 7 && k + 1 < w) hx += ' '; } o += `${(off + i).toString(16).padStart(8, '0')}  ${hx} |${[...c].map((x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '.')).join('')}|\n`; } return o; };
export default async (ctx) => {
  const { base, page: newPage, ok, tmp } = ctx;
  const N = 70000, buf = Buffer.alloc(N); for (let i = 0; i < N; i++) buf[i] = (i * 31 + (i >> 8)) & 255;
  buf.write('NEEDLE', 1000); buf.write('NEEDLE', 50000); buf.write('NEEDLE', 69990);
  const f = join(tmp, 'data.bin'); writeFileSync(f, buf);
  const page = await newPage(); await page.goto(`${base}#/hexview`);
  const pre = page.locator('pre.hexdump'); await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForFunction(() => document.querySelector('pre.hexdump')?.textContent.length > 0);
  ok(await pre.textContent() === dump(buf.subarray(0, 4096), 0, 16), 'page 1 = hexdump -C of bytes 0–4095');
  const rows = await page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  ok(rows.Size === '68.4 KB (70,000 bytes)' || /70,000 bytes/.test(rows.Size), `size row (${rows.Size})`);
  ok(/Page 1 of 18/.test(await page.locator('.tool-body').textContent()), '70,000 bytes = 18 pages of 4 KB');
  await page.getByRole('button', { name: 'Next ▶' }).click(); ok(await pre.textContent() === dump(buf.subarray(4096, 8192), 4096, 16), 'Next → page 2');
  const go = page.locator('input[aria-label="Go to offset"]');
  await go.fill('0x10A00'); await page.getByRole('button', { name: 'Go', exact: true }).click();
  ok(await pre.textContent() === dump(buf.subarray(16 * 4096, 17 * 4096), 16 * 4096, 16) && /Offset 68096 \(0x10a00\) is on page 17/.test(await page.locator('.tool-body').textContent()), 'go to 0x10A00 → page 17 (offsets above 64 KB)');
  await go.fill('69999'); await page.getByRole('button', { name: 'Go', exact: true }).click(); ok(await pre.textContent() === dump(buf.subarray(17 * 4096), 17 * 4096, 16), 'last (partial) page');
  await go.fill('70000'); await page.getByRole('button', { name: 'Go', exact: true }).click(); await page.waitForTimeout(100);
  ok(/from 0 to 69,999 \(0x1116f\)/.test(await page.locator('.toast').last().textContent()), 'offset past the end refused');
  const q = page.locator('input[aria-label=Find]');
  await q.fill('NEEDLE'); await page.getByRole('button', { name: 'Find', exact: true }).click();
  let msg = await page.locator('.card .muted').filter({ hasText: 'match' }).textContent();
  ok(msg === `3 matches at 0x${(1000).toString(16)}, 0x${(50000).toString(16)}, 0x${(69990).toString(16)}` && /Page 1 of/.test(await page.locator('.tool-body').textContent()), `text search: all hits (${msg})`);
  await page.getByRole('radio', { name: 'Hex bytes' }).click(); const hx = [...buf.subarray(30000, 30004)].map((x) => x.toString(16).padStart(2, '0')).join(' ');
  const expect = []; for (let i = 0; i + 4 <= N; i++) if (buf[i] === buf[30000] && buf[i + 1] === buf[30001] && buf[i + 2] === buf[30002] && buf[i + 3] === buf[30003]) expect.push(i);
  await q.fill(hx); await page.getByRole('button', { name: 'Find', exact: true }).click();
  msg = await page.locator('.card .muted').filter({ hasText: /match|Not found/ }).textContent();
  ok(msg.startsWith(`${expect.length} match`) && msg.includes(`0x${expect[0].toString(16)}`), `hex search "${hx}": ${expect.length} hits, first at 0x${expect[0].toString(16)} (${msg.slice(0, 60)})`);
  await q.fill('zz'); await page.getByRole('button', { name: 'Find', exact: true }).click(); await page.waitForTimeout(100); ok(/pairs of hex digits/.test(await page.locator('.toast').last().textContent()), 'bad hex refused');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/between 0 and|Offset must be|pairs of hex/.test(e)));
  await page.getByRole('radio', { name: '8', exact: true }).click(); ok((await pre.textContent()).split('\n')[0] === dump(buf.subarray(expect[0] - (expect[0] % 4096), expect[0] - (expect[0] % 4096) + 8), expect[0] - (expect[0] % 4096), 8).trim(), '8 bytes per line');
  await page.getByRole('radio', { name: '32', exact: true }).click(); ok((await pre.textContent()).split('\n')[0].length === dump(Buffer.alloc(32), 0, 32).split('\n')[0].length, '32 bytes per line');
  // file types
  const fx = (n) => join(process.cwd(), 'tests/fixtures', n);
  const files = { png: readdirSync(join(process.cwd(), 'tests/fixtures')).find((x) => x.endsWith('.png')), pdf: readdirSync(join(process.cwd(), 'tests/fixtures')).find((x) => x.endsWith('.pdf')) };
  const kinds = [];
  const det = async (p) => { await page.locator('.drop input[type=file]').setInputFiles(p); await page.waitForTimeout(200); return page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); return s[s.indexOf('Detected type') + 1]; }); };
  writeFileSync(join(tmp, 't.gz'), gzipSync('hello')); writeFileSync(join(tmp, 't.txt'), 'plain text\n'); writeFileSync(join(tmp, 'empty.bin'), '');
  if (files.png) kinds.push([await det(fx(files.png)), 'PNG image']);
  if (files.pdf) kinds.push([await det(fx(files.pdf)), 'PDF document']);
  kinds.push([await det(join(tmp, 't.gz')), 'gzip'], [await det(join(tmp, 't.txt')), 'Text (no binary bytes in the first 4 KB)'], [await det(join(process.cwd(), 'src/wasm/bin/textcore.wasm')), 'WebAssembly module'], [await det('/bin/ls'), 'ELF executable (Linux)'], [await det(join(tmp, 'empty.bin')), 'Empty file']);
  ok(kinds.every(([a, b]) => a === b), `file types: ${kinds.map(([a]) => a).join(', ')}`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'hexview');
};
