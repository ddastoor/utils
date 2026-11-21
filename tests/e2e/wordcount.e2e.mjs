// Word Counter (#/wordcount) in the browser: the counts of tests/fixtures/wordcount/reference.json (what wc -w / Word,
// Python's regex module and pySBD say about 34 texts in 16 languages — python3 scripts/make-wordcount-reference.py)
// read from the page; what the tab showed wrongly before; the engine fetched with the first text only; a book-length
// text; copying; a failed download of the engine; phone layout.
import { readFileSync } from 'node:fs';
import { setValue, until, hookClipboard, copied, notes } from './_devdata.mjs';

const DIR = new URL('../fixtures/wordcount/', import.meta.url);
const CORPUS = JSON.parse(readFileSync(new URL('corpus.json', DIR), 'utf8')), REF = JSON.parse(readFileSync(new URL('reference.json', DIR), 'utf8'));
const PYSBD_WRONG = { 'en-web': 3, 'en-tech': 3 }; // see tests/unit/wordcount.test.mjs

export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = []; page.on('request', (r) => fetched.push(r.url().split('/').pop()));
  await page.goto(`${base}#/wordcount`);
  const ta = page.locator('textarea').first(); await ta.waitFor();
  const big = (l) => page.locator('.big-result').filter({ has: page.locator('.big-label', { hasText: new RegExp(`^${l}$`) }) }).locator('.big-value').textContent();
  const kv = (l) => page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent === l); return i >= 0 ? s[i + 1].textContent : null; }, l);
  const num = (s) => Number(String(s).replace(/,/g, ''));
  /** put a text in the box and wait until the page shows `words` words */
  const set = async (s, words) => { await setValue(ta, s); return words === undefined ? true : until(page, (w) => document.querySelector('.big-value').textContent.replace(/,/g, '') === String(w), words); };
  const shown = async () => ({ words: num(await big('Words')), chars: num(await big('Characters')), sentences: num(await big('Sentences')), noSpace: num(await kv('Characters (no spaces)')), paragraphs: num(await kv('Paragraphs')), lines: num(await kv('Lines')) });
  const chips = () => page.locator('.chip').allTextContents();

  // ---- an empty tab: nothing counted, nothing fetched
  await page.waitForTimeout(300);
  ok(await big('Words') === '0' && await big('Characters') === '0' && await big('Sentences') === '0' && await big('Reading time') === '—' && await kv('Speaking time') === '—' && await kv('Avg word length') === '—' && await kv('Lines') === '0', 'empty: 0 words, characters, sentences and lines; no times, no average');
  ok((await page.locator('.chips').textContent()) === 'The words used most often will be listed here.' && !(await chips()).length, 'empty: a line where the keywords will be');
  ok(!fetched.some((f) => /\.wasm/.test(f)), `no engine is fetched while the box is empty (${fetched.filter((f) => /\.wasm/.test(f)).join(', ')})`);

  // ---- the reference texts, read from the page
  const bad = [];
  for (const c of CORPUS) {
    const r = { ...REF.texts[c.id] }; if (c.id in PYSBD_WRONG) r.sentences = PYSBD_WRONG[c.id];
    if (!(await set(c.text, r.words))) { bad.push(`${c.id}: words ${await big('Words')}, reference ${r.words}`); continue; }
    const s = await shown();
    for (const k of Object.keys(r)) if (s[k] !== r[k]) bad.push(`${c.id}: ${k} ${s[k]}, reference ${r[k]}`);
  }
  ok(CORPUS.length === 34 && !bad.length, `${CORPUS.length} texts in 16 languages: the page shows the words of wc -w / Word, the characters of Python's regex module, the lines and paragraphs, and for English the sentences of pySBD ${bad.slice(0, 4).join(' | ')}`);
  const wasm = fetched.filter((f) => /\.wasm/.test(f));
  ok(wasm.length === 1 && /^textkit-/.test(wasm[0]), `the first text fetched the engine, once, and nothing else (${wasm.join(', ')})`);

  // ---- what the tab showed wrongly
  for (const [text, want, what] of [
    ['The U.S.A. is big, e.g. Texas.', { words: 6, sentences: 1 }, '"U.S.A." and "e.g." are one word each (Chrome counted their letters: 9 words)'],
    ['See https://example.com/path?x=1 or write to a.b@example.co.in today', { words: 7, sentences: 1 }, 'a web address and an e-mail address are one word each (they were 6 and 5)'],
    ['on 10/11/2026 at 9:30', { words: 4 }, 'a date and a time are one word each (they were 3 and 2)'],
    ['Dr. Smith met Mr. Rao. They spoke.', { words: 7, sentences: 2 }, 'no sentence ends after "Dr." or "Mr." (the tab said 4)'],
    ['A. P. J. Abdul Kalam spoke.', { words: 6, sentences: 1 }, 'initials end no sentence (the tab said 4)'],
    ['Hello.\n\n***\n\nWorld.', { sentences: 2, paragraphs: 2, lines: 5 }, 'a row of asterisks is neither a sentence nor a paragraph'],
    ['First line\nsecond line\n', { lines: 2, paragraphs: 2 }, 'a final line break starts no third line (the tab said 3 lines, 1 paragraph)'],
    ['Para one.\nPara two.\nPara three.', { paragraphs: 3, lines: 3 }, 'without blank lines every line is a paragraph (the tab said 1)'],
    ['👍🏽 नमस्ते दुनिया café', { words: 3, chars: 14, noSpace: 11 }, 'emoji with skin tone, Hindi conjuncts and accents: 14 characters'],
    ['中华人民共和国', { words: 7, chars: 7 }, 'Chinese: a word a character'],
  ]) {
    await set(text, want.words); const s = await shown();
    ok(Object.entries(want).every(([k, v]) => s[k] === v), `${JSON.stringify(text)}: ${what} (${Object.keys(want).map((k) => `${k} ${s[k]}`).join(', ')})`);
  }
  // Thai has no spaces: the browser's dictionary finds the words
  { const thai = 'สวัสดีครับผมชื่อสมชาย ราคา100บาท', dict = await page.evaluate((s) => [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(s.replace(/100/, ' '))].filter((x) => x.isWordLike).length, thai);
    ok(await set(thai, dict + 1) && dict >= 6, `Thai: the ${dict} words the browser's dictionary finds, and the number between them`); }

  // ---- times, average, grouping
  await set(Array(476).fill('word').join(' '), 476);
  ok(await big('Reading time') === '2 min' && await kv('Speaking time') === '3 min' && await kv('Avg word length') === '4.0', 'reading at 238 words a minute (476 words = 2 min), speaking at 150 (3 min)');
  await set('Hello world', 2); ok(await big('Reading time') === '1 sec' && await kv('Speaking time') === '1 sec', 'a very short text: seconds');
  await set('"Stop." (now) नमस्ते', 3); ok(await kv('Avg word length') === '3.3', `average word length in characters, without the marks around a word (${await kv('Avg word length')})`);
  await set(Array(50000).fill('lorem ipsum').join(' '), 100000);
  ok(await big('Words') === '1,00,000' && await big('Reading time') === '7 hr 0 min' && await kv('Speaking time') === '11 hr 7 min' && await big('Characters') === '5,99,999', `100,000 words: Indian grouping, hours and minutes (${await big('Words')}, ${await big('Reading time')}, ${await kv('Speaking time')})`);

  // ---- copy: the plain number
  await hookClipboard(page);
  await page.locator('.big-result', { hasText: 'Words' }).click(); await page.locator('.big-result', { hasText: 'Characters' }).click();
  ok(JSON.stringify(await copied(page)) === '["100000","599999"]', `a click on a count copies the number without commas (${JSON.stringify(await copied(page))})`);
  await set('', 0); await page.locator('.big-result', { hasText: 'Reading time' }).click();
  ok((await copied(page)).length === 2 && await big('Words') === '0' && await kv('Lines') === '0', 'emptied: back to 0; "—" copies nothing');

  // ---- keywords
  await set('Mumbai trains. Mumbai rains and Mumbai food. The trains are crowded; the food is great, great food.', 17);
  ok((await chips()).join(', ') === 'mumbai · 3, food · 3, trains · 2, great · 2', `the words used at least twice, most used first, no stop words (${(await chips()).join(', ')})`);
  await set("It's very very simple: India’s roads, India's trains.", 8);
  ok((await chips()).join(', ') === 'india · 2', `"very" and "it's" are no keywords; India’s and India's count as India (${(await chips()).join(', ')})`);
  await set('Every word here appears once.', 5);
  ok(!(await chips()).length && (await page.locator('.chips').textContent()) === 'No word is used more than once.', 'no repeated word: said so');

  // ---- how it is counted: said in the tab
  await page.locator('summary', { hasText: 'How these are counted' }).click();
  const how = await page.locator('details ul').textContent();
  ok(/Microsoft Word/.test(how) && /stop—go/.test(how) && /Dr\./.test(how) && /blank line/.test(how) && /238 words a minute/.test(how), 'the rules are written under the counts');

  // ---- a book: typing stays quick, the counts follow when the typing pauses
  const para = CORPUS.find((c) => c.id === 'en-plain').text, book = Array(5000).fill(para).join('\n\n'), bookWords = REF.texts['en-plain'].words * 5000;
  const took = await ta.evaluate((e, v) => { e.value = v; const t0 = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); const a = performance.now() - t0; e.value = v + ' more'; const t1 = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); return [a, performance.now() - t1]; }, book);
  ok(took[0] < 50 && took[1] < 50, `1.2 MB of text: a keystroke costs ${took.map((x) => x.toFixed(1)).join(' and ')} ms (each used to cost about 800 ms: the tab counted before the next key could be taken)`);
  ok(await until(page, (w) => document.querySelector('.big-value').textContent.replace(/,/g, '') === String(w), bookWords + 1, 15000) && num(await kv('Paragraphs')) === 5000 && num(await big('Sentences')) === REF.texts['en-plain'].sentences * 5000, `… and ${(bookWords + 1).toLocaleString('en-IN')} words, 5,000 paragraphs are counted right when the typing pauses`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- leaving: the engine is released; coming back and leaving while it loads does no harm
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__superutilsLive().resources.length === 0), 'the engine is released when the tab is left');
  await page.goto(`${base}#/wordcount`); await ta.waitFor(); await setValue(ta, 'two words'); await page.goto(`${base}#/case`); await page.waitForTimeout(400);
  ok(!page.errors.length, `leaving while the engine is on its way: no error ${page.errors.join(' | ')}`);

  // ---- the engine cannot be fetched: said, and typing again retries
  const off = await newPage({ viewport: { width: 1366, height: 900 } }); let fail = true;
  await off.route(/textkit-.*\.wasm/, (r) => (fail ? r.abort() : r.continue()));
  await off.goto(`${base}#/wordcount`); const ta2 = off.locator('textarea').first(); await ta2.waitFor(); await setValue(ta2, 'three small words');
  ok(await until(off, () => /could not be loaded/.test(document.querySelector('.note-err')?.textContent || '')), `no engine: the tab says so (${await notes(off)})`);
  fail = false; await setValue(ta2, 'three small words now');
  ok(await until(off, () => document.querySelector('.big-value').textContent === '4' && !document.querySelector('.note-err')), 'typing again fetches it and the note goes');

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/wordcount`); const ta3 = ph.locator('textarea').first(); await ta3.waitFor();
  await setValue(ta3, CORPUS.find((c) => c.id === 'en-web').text); await until(ph, () => document.querySelector('.big-value').textContent === '19');
  const box = await ph.locator('summary').first().boundingBox(), tiles = await ph.locator('.big-result').evaluateAll((e) => e.map((x) => x.getBoundingClientRect().height));
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll with a long web address in the box');
  ok(box.height >= 44 && tiles.every((x) => x >= 44), `phone: the counts and "How these are counted" are at least 44 px tall (${Math.round(box.height)}; ${tiles.map(Math.round).join(', ')})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
