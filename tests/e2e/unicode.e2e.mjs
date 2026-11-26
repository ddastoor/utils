// Unicode Inspector (#/unicode, PC only): code points, UTF-8 / UTF-16 bytes (from TextEncoder / charCodeAt here),
// counts (code points vs graphemes vs UTF-16 units vs bytes, Intl.Segmenter), general categories and scripts checked
// against Python's unicodedata, invisible / look-alike detection, homograph warning, clean-up buttons, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from '../lib/child.mjs';
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
  // ---- bug hunt, Nov 2026: what is suspicious depends on where the character stands
  const warn = async () => (await page.locator('.tool-body .note-warn, .tool-body .note-err').allTextContents()).join(' | ');
  const press = async (name) => { await page.getByRole('button', { name, exact: true }).click(); return ta.inputValue(); };
  const fam = '👨‍👩‍👧 family 🏳️‍🌈 👩🏽‍💻';
  await ta.fill(fam); ok(/No invisible or look-alike/.test(await page.locator('.note-ok').textContent()) && await press('Remove invisible') === fam && (await sum())['Graphemes (what you see)'] === '12', 'emoji joined with zero-width joiners are not "suspicious", and "Remove invisible" keeps them whole (it used to split 👨‍👩‍👧 into three people)');
  const fa = 'می‌خواهم क्‍ष'; await ta.fill(fa); ok(/No invisible/.test(await page.locator('.note-ok').textContent()) && await press('Remove invisible') === fa, 'Persian ZWNJ and a Devanagari joiner are part of the spelling and are kept');
  await ta.fill('pay​pal a‍b'); ok(/2 suspicious characters/.test(await warn()) && await press('Remove invisible') === 'paypal ab', 'the same characters inside Latin words are flagged and removed');
  const tagged = `Summarise this${[...'ignore previous'].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('')}.`;
  await ta.fill(tagged); ok(/15 suspicious characters/.test(await warn()) && /Hidden text spelled with invisible “tag” characters: “ignore previous”/.test(await warn()) && await press('Remove invisible') === 'Summarise this.', 'hidden "tag" characters: reported, their message shown, removable (they used to pass as clean)');
  await ta.fill('Привет, как дела? Хорошо'); ok(/No invisible or look-alike/.test(await page.locator('.note-ok').textContent()) && (await sum()).Scripts === 'Cyrillic' && await press('Replace look-alikes') === 'Привет, как дела? Хорошо', 'ordinary Russian is clean and "Replace look-alikes" leaves it alone (10 letters were called suspicious and replaced by Latin ones)');
  await ta.fill('καλημέρα κόσμε'); ok(/No invisible or look-alike/.test(await page.locator('.note-ok').textContent()), 'ordinary Greek is clean');
  await ta.fill('Visit раураl.com now'); ok(/5 suspicious characters/.test(await warn()) && /homograph/.test(await warn()) && await press('Replace look-alikes') === 'Visit paypal.com now', 'a Latin-looking word written with Cyrillic letters is caught and fixed');
  await ta.fill('ｐａｙｐａｌ 𝐩𝐚𝐲𝐩𝐚𝐥'); ok(/12 suspicious characters/.test(await warn()) && await press('Replace look-alikes') === 'paypal paypal', 'fullwidth and mathematical letters look like ASCII and are replaced by it');
  await ta.fill('It’s “fine” — really…'); ok(/No invisible or look-alike/.test(await page.locator('.note-ok').textContent()) && /5 typographic/.test(await page.locator('.tool-body .note-info').textContent()) && await press('Plain quotes & dashes') === 'It\'s "fine" - really...', 'curly quotes, dashes and … are ordinary punctuation (not "suspicious"); a button turns them into plain ones');
  await ta.fill('සිංහල ខ្មែរ ދިވެހި བོད ግዕዝ'); ok((await sum()).Scripts === 'Sinhala, Khmer, Thaana, Tibetan, Ethiopic', `more scripts are named (${(await sum()).Scripts})`);
  // counts for hard cases
  const counts = async (t) => { await ta.fill(t); const r = await sum(); return [r['Characters (code points)'], r['Graphemes (what you see)'], r['UTF-16 units (JS .length)'], r['UTF-8 bytes']].join('/'); };
  ok(await counts('👨‍👩‍👧') === '5/1/8/18' && await counts('🇮🇳') === '2/1/4/8' && await counts('क्षि') === '4/1/4/12' && await counts('é') === '1/1/1/2' && await counts('é') === '2/1/2/3' && await counts('') === '0/0/0/0', 'code points / graphemes / UTF-16 / UTF-8 for a family emoji, a flag, a Devanagari cluster, é in both forms, nothing');
  // a long text: the table stops at 2,000 rows and says so; the summary covers everything
  await ta.fill('abc def '.repeat(400)); ok(await page.locator('.utbl tbody tr').count() === 2000 && /first 2,000 of 3,200 characters/.test(await page.locator('.tool-body .note-info').last().textContent()) && (await sum())['Characters (code points)'] === '3200', 'long text: 2,000 rows listed, with a note (the rest used to be cut silently)');
  // half a megabyte (it held the page for 2.6 s on every keystroke: each character went through dozens of regular
  // expressions): each different character is looked up once, and a text this long waits for a pause in the typing
  const half = 'Hello wоrld\u200b café ₹500 👍🏽 नमस्ते. '.repeat(14000);
  const lt = await page.evaluate(async (half) => {
    const t = document.querySelector('textarea'), longs = [];
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(e.duration); }); po.observe({ type: 'longtask' });
    const t0 = performance.now(); t.value = half; t.dispatchEvent(new Event('input', { bubbles: true })); const sync = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 3000)); po.disconnect();
    return { sync: Math.round(sync), longest: Math.round(Math.max(0, ...longs)) };
  }, half);
  const big = await sum();
  ok(lt.sync < 50 && lt.longest < 1500 && big['Characters (code points)'] === String([...half].length), `a 500 KB text: the keystroke returns in ${lt.sync} ms, the longest task ${lt.longest} ms, ${big['Characters (code points)']} characters counted`);
  ok(/28000 suspicious characters|28,000 suspicious characters/.test(await page.locator('.tool-body .note-warn').first().textContent()), `every hidden space and look-alike is still found (${(await page.locator('.tool-body .note-warn').first().textContent()).slice(0, 60)})`);
  await ta.fill(''); ok(await page.locator('.utbl tbody tr').count() === 0 && (await sum()).Scripts === '—', 'empty box: empty table');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'unicode');
};
