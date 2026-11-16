// ASCII Table (#/ascii, PC only): all 128 codes, each row's hex / octal / 8-bit binary computed independently, printable
// characters = String.fromCharCode, control-code names (NUL, LF, CR, ESC, DEL), HTML entities, Latin-1 extension to 255,
// search, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/ascii`);
  const q = page.locator('input[aria-label=Filter]'); await q.waitFor();
  const rows = () => page.$$eval('.ref-tbl tbody tr', (r) => r.map((e) => [...e.children].map((c) => c.textContent)));
  let r = await rows(); ok(r.length === 128, `128 rows (${r.length})`);
  const bad = [];
  r.forEach((x, c) => {
    if (x[0] !== String(c) || x[1] !== `0x${c.toString(16).toUpperCase().padStart(2, '0')}` || x[2] !== c.toString(8).padStart(3, '0') || x[3] !== c.toString(2).padStart(8, '0')) bad.push(c);
    if (c > 32 && c < 127 && x[4] !== String.fromCharCode(c)) bad.push(`char ${c}`);
  });
  ok(!bad.length, `dec/hex/oct/binary and characters right for 0–127 (${bad.slice(0, 5)})`);
  const named = { 0: 'NUL', 9: 'HT', 10: 'LF', 13: 'CR', 27: 'ESC', 32: 'Space', 127: 'DEL' };
  ok(Object.entries(named).every(([c, n]) => r[c][4] === n), 'control names NUL HT LF CR ESC Space DEL');
  ok(/\\n/.test(r[10][6]) && /\\t/.test(r[9][6]) && /Ctrl\+C/.test(r[3][6]), 'descriptions mention \\n, \\t, Ctrl+C');
  ok(r[60][5] === '&lt;' && r[62][5] === '&gt;' && r[38][5] === '&amp;' && r[34][5] === '&quot;' && r[65][5] === '&#65;' && r[10][5] === '', 'HTML entities (&lt; &gt; &amp; &quot; &#65;), none for control codes');
  const s = async (v) => { await q.fill(v); return rows(); };
  r = await s('0x41'); ok(r.length === 1 && r[0][4] === 'A', 'search 0x41 → A');
  r = await s('newline'); ok(r.length === 0 || r.every((x) => /line/i.test(x.join(' '))), 'search by word works');
  r = await s('line feed'); ok(r.length === 1 && r[0][0] === '10', '"line feed" → 10');
  r = await s('upper-case'); ok(r.length === 26, '"upper-case" → 26 letters');
  await q.fill(''); await page.locator('label.switch').filter({ hasText: 'Latin-1' }).click(); await page.locator('input[aria-label=Filter]').waitFor();
  r = await rows(); ok(r.length === 256 && r[233][4] === 'é' && r[169][5] === '&copy;' && r[160][6] === 'No-break space' && /C1 control/.test(r[150][4]), 'Latin-1: 256 rows, 233 = é, © entity, 160 = no-break space, 128–159 = C1 controls');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'ascii');
};
