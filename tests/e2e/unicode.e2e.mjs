// Unicode Inspector (#/unicode, PC only): code points, UTF-8 / UTF-16 bytes (from TextEncoder / charCodeAt here),
// counts (code points vs graphemes vs UTF-16 units vs bytes, Intl.Segmenter), general categories and scripts checked
// against Python's unicodedata, invisible / look-alike detection, homograph warning, clean-up buttons, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/unicode`);
  const ta = page.locator('textarea'); await ta.waitFor();
  const rows = () => page.$$eval('.utbl tbody tr', (r) => r.map((e) => [...e.children].map((c) => c.textContent)));
  const sum = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  const text = 'Aé€😀👍🏽न्​ x';
  await ta.fill(text);
  const r = await rows(), cps = [...text];
  ok(r.length === cps.length, `one row per code point (${r.length})`);
  const bad = [];
  r.forEach((x, i) => {
    const cp = cps[i].codePointAt(0);
    if (x[1] !== `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`) bad.push(`cp ${i}`);
    if (x[2] !== [...new TextEncoder().encode(cps[i])].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')) bad.push(`utf8 ${i}`);
    if (x[3] !== cps[i].split('').map((u) => u.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ')) bad.push(`utf16 ${i}`);
  });
  ok(!bad.length, `code point, UTF-8 and UTF-16 columns (${bad})`);
  const cats = JSON.parse(execFileSync('python3', ['-c', 'import unicodedata,json,sys; print(json.dumps([unicodedata.category(c) for c in sys.argv[1]]))', text]).toString());
  const NAME = { Lu: 'Letter, uppercase', Ll: 'Letter, lowercase', Lo: 'Letter, other', Mn: 'Mark, nonspacing (combining)', Mc: 'Mark, spacing', Sc: 'Symbol, currency', So: 'Symbol, other', Sk: 'Symbol, modifier', Cf: 'Format (invisible)', Zs: 'Separator, space', Nd: 'Number, digit' };
  ok(r.every((x, i) => x[4] === NAME[cats[i]]), `general categories = Python unicodedata (${cats.join(' ')})`);
  ok(r[0][5] === 'Latin' && r[6][5] === 'Devanagari' && r[7][5] === 'Devanagari' && r[2][5] === 'Common', 'scripts: Latin, Devanagari, virama also Devanagari, Common');
  const s = await sum();
  ok(s['Characters (code points)'] === String(cps.length) && s['UTF-16 units (JS .length)'] === String(text.length) && s['UTF-8 bytes'] === String(Buffer.byteLength(text)), 'counts: code points, UTF-16 units, UTF-8 bytes');
  ok(s['Graphemes (what you see)'] === String([...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length), `graphemes (emoji + skin tone = 1, न् = 1): ${s['Graphemes (what you see)']}`);
  ok(/ZERO WIDTH SPACE \(invisible\)/.test(await page.locator('.note-warn').textContent()) && /NO-BREAK SPACE/.test(r[9][6]), 'zero-width space and no-break space flagged');
  await ta.fill('pаypal.com'); // Cyrillic а
  ok(/looks like “a”/.test(await page.locator('.note-warn').textContent()) && /homograph/.test(await page.locator('.note-err').textContent()) && (await sum()).Scripts === 'Latin, Cyrillic', 'Cyrillic "а" in a domain → look-alike + homograph warning');
  await page.getByRole('button', { name: 'Replace look-alikes' }).click(); ok(await ta.inputValue() === 'paypal.com' && /No invisible/.test(await page.locator('.note-ok').textContent()), 'Replace look-alikes → plain ASCII, all clear');
  await ta.fill('a​b‍c﻿d‮e'); await page.getByRole('button', { name: 'Remove invisible' }).click(); ok(await ta.inputValue() === 'abcde', 'Remove invisible (ZWSP, ZWJ, BOM, RLO)');
  await ta.fill('a b c　d'); await page.getByRole('button', { name: 'Normalise spaces' }).click(); ok(await ta.inputValue() === 'a b c d', 'Normalise spaces');
  await ta.fill('é'); ok(/^no/.test((await sum())['NFC = NFD?']), 'decomposed é: NFC ≠ NFD');
  await page.getByRole('button', { name: 'NFC', exact: true }).click(); ok(await ta.inputValue() === 'é' && [...await ta.inputValue()].length === 1, 'NFC composes e + ◌́ into é');
  await ta.fill('ﬁ ①'); await page.getByRole('button', { name: 'NFKC', exact: true }).click(); ok(await ta.inputValue() === 'fi 1', 'NFKC: ligature ﬁ → fi, ① → 1');
  await page.getByRole('button', { name: 'Copy', exact: true }).click(); ok(await page.evaluate(() => navigator.clipboard.readText()) === 'fi 1', 'Copy');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'unicode');
};
