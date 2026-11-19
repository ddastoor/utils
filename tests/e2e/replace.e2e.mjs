// Find & Replace (#/replace) in the browser: plain text with special characters taken literally, case, whole words in
// every script, regular expressions as Python's re module answers them (tests/fixtures/replace/reference.json —
// python3 scripts/make-replace-reference.py), line breaks in the replacement, patterns that are refused, a pattern
// that never ends (the page must stay alive), phone layout.
import { readFileSync } from 'node:fs';
import { setValue, until, notes } from './_devdata.mjs';

const REF = JSON.parse(readFileSync(new URL('../fixtures/replace/reference.json', import.meta.url), 'utf8'));

export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } }); await page.goto(`${base}#/replace`);
  const text = page.getByLabel('Text'), find = page.getByLabel('Find'), rep = page.getByLabel('Replace with');
  const result = page.locator('.card').filter({ hasText: 'Result' }), out = result.locator('textarea'), info = result.locator('.muted.small');
  const sw = (name) => page.locator('label.switch').filter({ hasText: new RegExp(`^${name}$`) });
  const state = { 'Regular expression': false, 'Case sensitive': false, 'Whole words': false };
  const want = async (o) => { for (const [k, v] of Object.entries({ 'Regular expression': !!o.regex, 'Case sensitive': !!o.cs, 'Whole words': !!o.word })) if (state[k] !== v) { await sw(k).click(); state[k] = v; } };
  /** set the three boxes and the switches; wait for the answer to this very search (a marker text first, so that an unchanged result is not taken for it) */
  let n = 0;
  const run = async (t, f, r, o = {}) => {
    await want(o);
    const mark = `settle-${++n}`; await setValue(text, mark); await setValue(find, 'settle'); await setValue(rep, 'ok');
    await until(page, (m) => document.querySelectorAll('textarea')[1].value === m.replace('settle', 'ok') || /not a valid|could not/.test(document.querySelector('.note-err')?.textContent || ''), mark);
    await setValue(find, f); await setValue(rep, r); await setValue(text, t);
    await until(page, (m) => document.querySelectorAll('textarea')[1].value !== m.replace('settle', 'ok') && !document.querySelectorAll('textarea')[1].value.startsWith('settle-'), mark);
    await page.waitForTimeout(60);
    return [await out.inputValue(), (await info.textContent()).trim()];
  };
  await text.waitFor();

  // ---- the sample
  ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'color and flavour, color again.') && (await info.textContent()).trim() === '2 replacements', 'default: Colour → color (case-insensitive), 2 replacements');

  // ---- plain text
  let [o, i] = await run('Price: $5.00 (approx.) + tax*', '$5.00 (approx.)', '₹420 $1');
  ok(o === 'Price: ₹420 $1 + tax*' && i === '1 replacement', `special characters taken literally, "$1" in the replacement kept as text (${o})`);
  [o] = await run('Cat cat CAT', 'cat', 'dog', { cs: true }); ok(o === 'Cat dog CAT', 'case sensitive');
  [o, i] = await run('cat category concat cat.', 'cat', 'dog', { word: true }); ok(o === 'dog category concat dog.' && i === '2 replacements', 'whole words only');
  [o, i] = await run('दुनिया और दुनियादारी, राम रामा राम', 'दुनिया', 'world', { word: true });
  ok(o === 'world और दुनियादारी, राम रामा राम' && i === '1 replacement', `whole words in Hindi: दुनिया, not दुनियादारी (the tab found nothing in Hindi with this switch) — ${o}`);
  [o, i] = await run('café cafés Café', 'café', 'tea', { word: true }); ok(o === 'tea cafés tea' && i === '2 replacements', `whole words with an accent at the end: café, not cafés (the tab replaced inside "cafés") — ${o}`);
  [o, i] = await run('nothing here', 'zebra', 'x'); ok(o === 'nothing here' && i === 'No match — nothing was replaced.', `no match is said (${i})`);

  // ---- regular expressions
  [o] = await run('2026-11-16 and 1999-01-31', '(\\d{4})-(\\d{2})-(\\d{2})', '$3/$2/$1', { regex: true }); ok(o === '16/11/2026 and 31/01/1999', `regex groups: ISO → dd/mm/yyyy (${o})`);
  [o] = await run('a  b   c', '\\s+', ' ', { regex: true }); ok(o === 'a b c', 'collapse spaces');
  [o, i] = await run('line1\nline2\nline3', '^', '> ', { regex: true }); ok(o === '> line1\n> line2\n> line3' && i === '3 replacements', `^ matches at every line (the tab changed the first line only) — ${JSON.stringify(o)}`);
  [o, i] = await run('one, two, three', ', ', '\\n', { regex: true }); ok(o === 'one\ntwo\nthree' && i === '2 replacements', `\\n in "Replace with" makes a line break (the tab wrote a backslash and an n) — ${JSON.stringify(o)}`);
  [o] = await run('price 100', '\\d+', '[$0] $&', { regex: true }); ok(o === 'price [100] 100', `$0 and $& are the whole match (${o})`);
  [o] = await run('one, two', ', ', '\\n'); ok(o === 'one\\ntwo', 'without the switch, \\n is a backslash and an n');
  [o] = await run('नमस्ते दुनिया 😀', '.', 'x', { regex: true }); ok(o === 'x'.repeat(15), `"." takes an emoji as one character: 14 letters, signs and spaces and 1 emoji, not 16 (${o.length})`);
  [o, i] = await run('a-b a#b', 'a\\-b|a\\#b', 'X', { regex: true });
  ok(o === 'X X' && /older \(non-Unicode\) mode/.test(await notes(page, '.note')), `a pattern with escapes that JavaScript's Unicode mode refuses is run in the older mode, with a note (the tab said "Invalid escape") — ${o}`);

  // ---- Python's answers through the page: 30 of the reference searches
  const sample = REF.filter((c, k) => c.count && k % 5 === 0).slice(0, 30), bad = [];
  for (const c of sample) { const [got, line] = await run(c.text, c.find, c.rep, c); if (got !== c.result || !line.startsWith(`${c.count} replacement`)) bad.push(`${JSON.stringify(c.find)} in ${JSON.stringify(c.text.slice(0, 30))}: ${JSON.stringify(got.slice(0, 40))} (${line}), Python ${JSON.stringify(c.result.slice(0, 40))} ×${c.count}`); }
  ok(sample.length === 30 && !bad.length, `30 searches of the reference give what Python's re.subn gives ${bad.slice(0, 3).join(' | ')}`);

  // ---- a pattern that cannot be used
  await want({ regex: true }); await setValue(text, 'abc'); await setValue(find, '('); await setValue(rep, 'x');
  ok(await until(page, () => /not a valid regular expression: unterminated group/.test(document.querySelector('.note-err')?.textContent || '')) && await find.evaluate((e) => e.classList.contains('bad')) && (await out.inputValue()) === 'abc', `an invalid pattern: its reason, the box marked, the text unchanged (${await notes(page, '.note-err')})`);
  await setValue(find, 'b'); ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'axc' && !document.querySelector('.note-err')) && !(await find.evaluate((e) => e.classList.contains('bad'))), 'corrected: the note and the mark go');
  await setValue(find, ''); ok(await until(page, () => document.querySelectorAll('textarea')[1].value === 'abc') && (await info.textContent()).trim() === '', 'empty find → text unchanged');

  // ---- a pattern that never ends: the page stays alive, the search is ended
  await setValue(text, 'a'.repeat(40) + '!'); await setValue(find, '(a+)+$'); const t0 = Date.now();
  await page.waitForTimeout(700);
  const alive = await page.evaluate(() => { const t = performance.now(); document.querySelector('textarea').value += ' typed'; return performance.now() - t; });
  ok(alive < 100, `while (a+)+$ runs the page still answers at once (${alive.toFixed(1)} ms) — the tab ran the search on the page and froze`);
  ok(await until(page, () => /Stopped after 5 seconds/.test(document.querySelector('.note-err')?.textContent || ''), null, 9000) && Date.now() - t0 < 8500, `the search is ended after 5 seconds, with the reason (${Math.round((Date.now() - t0) / 100) / 10} s)`);
  await setValue(find, 'a+'); await setValue(rep, 'A');
  ok(await until(page, () => document.querySelectorAll('textarea')[1].value.startsWith('A!')), 'the next search works (a new worker)');

  // ---- a long text
  await want({}); const long = 'The quick brown fox jumps over the lazy dog. '.repeat(20000);
  await setValue(find, 'the'); await setValue(rep, 'a');
  const took = await text.evaluate((e, v) => { e.value = v; const t = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t; }, long);
  ok(took < 50 && await until(page, () => document.querySelector('.card:last-of-type .muted.small')?.textContent.trim() === '40,000 replacements', null, 15000), `0.9 MB: the keystroke returns in ${took.toFixed(1)} ms; 40,000 replacements follow (Indian grouping)`);
  ok(await page.locator('summary', { hasText: 'With a regular expression' }).isVisible() && !page.errors.length, `the rules for regular expressions are a click away; no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__supertoolsLive().workers === 0), 'the worker is ended when the tab is left');

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/replace`); await ph.getByLabel('Text').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  const box = await ph.locator('label.switch').first().boundingBox(), sum = await ph.locator('summary').first().boundingBox();
  ok(box.height >= 44 && sum.height >= 44, `phone: switches and the fold-out are at least 44 px tall (${Math.round(box.height)}, ${Math.round(sum.height)})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
