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
  ok(msg.startsWith(`3 matches at 0x${(1000).toString(16)}, 0x${(50000).toString(16)}, 0x${(69990).toString(16)}`) && /Page 1 of/.test(await page.locator('.tool-body').textContent()), `text search: all hits (${msg})`);
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
  // ---- bug hunt, Nov 2026
  await page.getByRole('radio', { name: '16 bytes/line' }).click(); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(300);
  const hitLine = () => page.locator('.card .muted').filter({ hasText: /match|Not found|Offset/ }).first().textContent().catch(() => '');
  const marked = () => page.$$eval('pre.hexdump mark', (m) => m.map((e) => e.textContent.slice(0, 8)));
  // Enter runs the search; the row of the match is marked; "Next match" walks through them and wraps around
  await q.fill('NEEDLE'); await q.press('Enter'); await page.waitForTimeout(200);
  ok(/showing match 1 \(0x3e8, page 1\)/.test(await hitLine()) && (await marked()).join() === '000003e0', `Enter in the Find box searches; the row holding the match is marked (${await marked()})`);
  const nx = page.getByRole('button', { name: 'Next match' }); await nx.click();
  ok(/showing match 2 \(0xc350, page 13\)/.test(await hitLine()) && (await marked()).join() === '0000c350' && /Page 13 of 18/.test(await page.locator('.tool-body').textContent()), 'Next match → the second hit, on page 13');
  await nx.click(); ok(/showing match 3 \(0x11166, page 18\)/.test(await hitLine()) && (await marked()).join() === '00011160', 'third hit: a match that starts in the last bytes of a row');
  await nx.click(); ok(/showing match 1 /.test(await hitLine()), 'after the last match it starts again from the first');
  // a match that runs over two rows marks both
  const b2 = Buffer.alloc(200, 0x2e); b2.write('ACROSS-ROWS', 26); const f2 = join(tmp, 'two.bin'); writeFileSync(f2, b2);
  await page.locator('.drop input[type=file]').setInputFiles(f2); await page.waitForTimeout(300);
  ok(await hitLine() === '' && await nx.isHidden() && (await marked()).length === 0, 'opening another file clears the match line of the previous one (it used to stay: "3 matches at …")');
  await q.fill('ACROSS-ROWS'); await q.press('Enter'); await page.waitForTimeout(200); ok((await marked()).join() === '00000010,00000020' && await nx.isHidden(), 'a match that crosses a row border marks both rows; one match → no "Next match" button');
  // ignore case
  await q.fill('across-rows'); await q.press('Enter'); await page.waitForTimeout(200); ok(await hitLine() === 'Not found' && (await marked()).length === 0, 'text search is case-sensitive by default');
  await page.locator('label.switch', { hasText: 'Ignore case' }).click(); await q.press('Enter'); await page.waitForTimeout(200); ok(/^1 match at 0x1a/.test(await hitLine()), '"Ignore case" finds it');
  await page.locator('label.switch', { hasText: 'Ignore case' }).click();
  // Go: Enter, forms of the number, the row is marked
  await go.fill('0x20'); await go.press('Enter'); await page.waitForTimeout(150); ok(/Offset 32 \(0x20\) is on page 1/.test(await hitLine()) && (await marked()).join() === '00000020', 'Enter in "Go to offset"; the row is marked');
  for (const [v, n] of [['199', 199], ['0XC7', 199], [' 1_00 ', 100], ['20h', 32]]) { await go.fill(v); await go.press('Enter'); await page.waitForTimeout(120); if (!new RegExp(`Offset ${n} `).test(await hitLine())) ok(false, `go ${v} → ${await hitLine()}`); }
  const refusedGo = []; for (const v of ['200', '-1', '1.9', '12abc', '1e3', '0x', 'xyz', '']) { await go.fill(v); await go.press('Enter'); await page.waitForTimeout(120); if (!/Offset must be a number from 0 to 199 \(0xc7\)/.test(await page.locator('.toast').last().textContent())) refusedGo.push(v); }
  ok(!refusedGo.length, `offsets past the end or not a whole number are refused with the allowed range (12abc used to be read as 12, 1e3 as 1) ${refusedGo.join(' ')}`);
  // more file types by their first bytes
  const t2 = { 'utf32.txt': [Buffer.from([0xff, 0xfe, 0, 0, 0x68, 0, 0, 0]), 'UTF-32 LE text (BOM)'], 'page.html': [Buffer.from('<!DOCTYPE html><html><body>x</body></html>'), 'HTML document'], 'empty.zip': [Buffer.from([0x50, 0x4b, 5, 6, ...new Array(18).fill(0)]), 'ZIP archive (empty)'],
    'song.mp3': [Buffer.from([0xff, 0xf3, 0x84, 0xc4, 0, 0, 0, 0]), 'MP3 / MPEG audio'], 'colour.log': [Buffer.from('\x1b[31mERROR\x1b[0m down\n'), 'Text with terminal escape codes (no other binary bytes in the first 4 KB)'], 'bmw.txt': [Buffer.from('BMW prices rose in November\n'), 'Text (no binary bytes in the first 4 KB)'],
    'photo.heic': [Buffer.from([0, 0, 0, 0x18, ...Buffer.from('ftypmif1'), 0, 0, 0, 0]), 'HEIF image'] };
  const tbad = []; for (const [n, [b, want]] of Object.entries(t2)) { writeFileSync(join(tmp, n), b); const got = await det(join(tmp, n)); if (got !== want) tbad.push(`${n}: ${got}`); }
  ok(!tbad.length, `7 more kinds recognised (UTF-32, HTML, empty zip, MP3 without a tag, coloured log, HEIF; "BMW…" text is not a BMP image) ${tbad.join(' | ')}`);
  // empty file, one byte, exactly one page, one byte more
  writeFileSync(join(tmp, 'one.bin'), Buffer.from([0xff])); await page.locator('.drop input[type=file]').setInputFiles(join(tmp, 'one.bin')); await page.waitForTimeout(250);
  ok((await pre.textContent()).startsWith('00000000  ff ') && /Page 1 of 1 · bytes 0–1/.test(await page.locator('.tool-body').textContent()), 'a one-byte file');
  for (const [n, pages] of [[4096, 1], [4097, 2]]) { writeFileSync(join(tmp, `p${n}.bin`), Buffer.alloc(n, 0x41)); await page.locator('.drop input[type=file]').setInputFiles(join(tmp, `p${n}.bin`)); await page.waitForTimeout(250); if (!new RegExp(`Page 1 of ${pages} `).test(await page.locator('.tool-body').textContent())) ok(false, `${n} bytes → pages`); }
  ok(await page.getByRole('button', { name: 'Next ▶' }).isEnabled() && await page.getByRole('button', { name: '◀ Prev' }).isDisabled(), '4,096 bytes = 1 page, 4,097 = 2; Prev is off on the first page');
  await page.locator('.drop input[type=file]').setInputFiles(join(tmp, 'empty.bin')); await page.waitForTimeout(250); await q.fill('x'); await q.press('Enter'); await page.waitForTimeout(150);
  ok(/Open a file first/.test(await page.locator('.toast').last().textContent()) && await pre.textContent() === '', 'an empty file: nothing to dump, Find says so');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/between 0 and|Offset must be|pairs of hex|Open a file first/.test(e)));
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'hexview');
};
