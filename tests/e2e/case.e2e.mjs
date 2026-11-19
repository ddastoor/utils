// Case Converter (#/case) in the browser: the thirteen conversions with known answers, the Title Case reference
// (tests/fixtures/caseconv/reference.json — the Python package titlecase on 203 titles) sampled through the page, what
// the tab wrote wrongly before, lines kept, long texts, copy, a failed download of the engine, phone layout.
import { readFileSync } from 'node:fs';
import { setValue, until, hookClipboard, copied, notes } from './_devdata.mjs';

const REF = JSON.parse(readFileSync(new URL('../fixtures/caseconv/reference.json', import.meta.url), 'utf8'));
const DIFFERENT = new Set(['Words with all consonants like cnn are acronyms', 'Mr mr Mrs Ms Mss Dr dr , Mr. and Mrs. Person', 'gst invoice for the upi payment', 'tcp/ip and http/2', 'mccay-mcbut-mcdo mcdonalds/mcby', 'mcfoo-bar, MCFOO-BAR, McFoo-bar, McFoo-Bar, mcfoo-mcbar, foo-mcbar']); // see tests/unit/caseconv.test.mjs

export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } }); await page.goto(`${base}#/case`);
  const ta = page.locator('textarea').first(); await ta.waitFor();
  const rows = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.case-row')].map((r) => [r.querySelector('.case-name').textContent, r.querySelector('.case-val').textContent])));
  /** put a text in the box; wait until the UPPER CASE row has followed (it is never equal to the text before unless both are) */
  let n = 0;
  const conv = async (s) => { const mark = `settle ${++n}`; await setValue(ta, mark); await until(page, (m) => document.querySelector('.case-val').textContent === m.toUpperCase(), mark); await setValue(ta, s); await until(page, (m) => document.querySelector('.case-val').textContent !== m.toUpperCase(), mark); return rows(); };

  // ---- the sample is converted as the tab opens
  ok(await until(page, () => document.querySelector('.case-val')?.textContent === 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG'), 'the sample sentence is converted at once');
  let r = await rows();
  const SAMPLE = { 'UPPER CASE': 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG', 'lower case': 'the quick brown fox jumps over the lazy dog', 'Title Case': 'The Quick Brown Fox Jumps Over the Lazy Dog', 'Sentence case': 'The quick brown fox jumps over the lazy dog', 'Capitalized Case': 'The Quick Brown Fox Jumps Over The Lazy Dog',
    camelCase: 'theQuickBrownFoxJumpsOverTheLazyDog', PascalCase: 'TheQuickBrownFoxJumpsOverTheLazyDog', snake_case: 'the_quick_brown_fox_jumps_over_the_lazy_dog', 'kebab-case': 'the-quick-brown-fox-jumps-over-the-lazy-dog', CONSTANT_CASE: 'THE_QUICK_BROWN_FOX_JUMPS_OVER_THE_LAZY_DOG', 'dot.case': 'the.quick.brown.fox.jumps.over.the.lazy.dog',
    aLtErNaTiNg: 'tHe qUiCk bRoWn fOx jUmPs oVeR ThE LaZy dOg', iNVERSE: 'tHE QUICK BROWN FOX JUMPS OVER THE LAZY DOG' };
  ok(Object.keys(r).join('|') === Object.keys(SAMPLE).join('|'), `thirteen rows in their order (${Object.keys(r).join(', ')})`);
  for (const [k, v] of Object.entries(SAMPLE)) ok(r[k] === v, `${k}: ${r[k]}`);

  // ---- Title Case: 40 titles of the reference, through the page
  const some = REF.titles.filter(([x], i) => !DIFFERENT.has(x) && x && i % 5 === 0), bad = [];
  for (const [text, want] of some) { const got = (await conv(text))['Title Case']; if (got !== want) bad.push(`${JSON.stringify(text)}: ${JSON.stringify(got)}, the package ${JSON.stringify(want)}`); }
  ok(some.length >= 38 && !bad.length, `Title Case: ${some.length} titles as the Python package titlecase writes them ${bad.slice(0, 3).join(' | ')}`);

  // ---- what the tab wrote wrongly
  r = await conv('don’t stop the NASA iPhone app at example.com');
  ok(r['Title Case'] === 'Don’t Stop the NASA iPhone App at example.com', `Title Case keeps a curly apostrophe inside its word, the writer's capitals and an address (it wrote "Don’T Stop the Nasa Iphone App at Example.Com") — ${r['Title Case']}`);
  r = await conv('war and peace\nof mice and men');
  ok(r['Title Case'] === 'War and Peace\nOf Mice and Men', `Title Case: every line is a title (${JSON.stringify(r['Title Case'])})`);
  r = await conv('hello\nworld. "then we left." j\'ai obéi. at 5 p.m. we left');
  ok(r['Sentence case'] === 'Hello\nWorld. "Then we left." J\'ai obéi. At 5 p.m. we left', `Sentence case: a capital for every line and after a quotation mark, none inside "obéi" or after "p.m." (${JSON.stringify(r['Sentence case'])})`);
  r = await conv("HELLO. i think i'm right, i.e. it works! is it? yes");
  ok(r['Sentence case'] === "Hello. I think I'm right, i.e. it works! Is it? Yes", `Sentence case keeps "I" and "I'm", not "i.e." (${r['Sentence case']})`);
  r = await conv("don't stop नमस्ते दुनिया");
  ok(r.snake_case === 'dont_stop_नमस्ते_दुनिया' && r.camelCase === 'dontStopनमस्तेदुनिया', `code cases: an apostrophe is dropped and Hindi words stay whole (it wrote "don_t_stop_नमस_त_द_निया") — ${r.snake_case}`);
  r = await conv('first name\nlast name\n\ndate of birth');
  ok(r.snake_case === 'first_name\nlast_name\n\ndate_of_birth' && r.camelCase === 'firstName\nlastName\n\ndateOfBirth' && r.CONSTANT_CASE === 'FIRST_NAME\nLAST_NAME\n\nDATE_OF_BIRTH', `code cases: one name per line (all lines were joined into one name) — ${JSON.stringify(r.snake_case)}`);
  ok(await page.locator('.case-row', { hasText: 'snake_case' }).locator('.case-val').evaluate((e) => e.getBoundingClientRect().height > 50), '… and the lines are shown as lines');
  r = await conv('XMLHttpRequest parseJSONData user_id v2Api');
  ok(r.snake_case === 'xml_http_request_parse_json_data_user_id_v2_api' && r.PascalCase === 'XmlHttpRequestParseJsonDataUserIdV2Api' && r['kebab-case'] === 'xml-http-request-parse-json-data-user-id-v2-api' && r['dot.case'] === 'xml.http.request.parse.json.data.user.id.v2.api', `acronyms and humps split (${r.snake_case})`);
  r = await conv('Hello, world! How are you?');
  ok(r.camelCase === 'helloWorldHowAreYou' && r.snake_case === 'hello_world_how_are_you' && r['kebab-case'] === 'hello-world-how-are-you', `punctuation dropped in code cases (${r.camelCase})`);
  r = await conv('ÉCOLE élève Straße ΟΔΟΣ');
  ok(r['lower case'] === 'école élève straße οδος' && r['UPPER CASE'] === 'ÉCOLE ÉLÈVE STRASSE ΟΔΟΣ' && r.camelCase === 'écoleÉlèveStraßeΟδος' && r['Capitalized Case'] === 'École Élève Straße Οδος', `Unicode letters: ß → SS, the Greek final sigma (${r['UPPER CASE']}, ${r['lower case']}, ${r.camelCase})`);
  r = await conv("state-of-the-art e-mail from o'neil");
  ok(r['Title Case'] === "State-of-the-Art E-Mail From O'Neil" && r['Capitalized Case'] === "State-Of-The-Art E-Mail From O'neil", `compounds: Title Case leaves small words small inside, Capitalized Case raises every part (${r['Title Case']} / ${r['Capitalized Case']})`);

  // ---- a Turkish browser: the same answers
  const tr = await newPage({ locale: 'tr-TR', viewport: { width: 1366, height: 900 } }); await tr.goto(`${base}#/case`); const taTr = tr.locator('textarea').first(); await taTr.waitFor();
  await setValue(taTr, 'TITLE fish'); await until(tr, () => document.querySelector('.case-val').textContent.startsWith('TITLE F'));
  const rt = await tr.evaluate(() => [...document.querySelectorAll('.case-val')].map((e) => e.textContent));
  ok(rt[0] === 'TITLE FISH' && rt[1] === 'title fish' && rt[5] === 'titleFish', `in a browser set to Turkish, TITLE is still "title" and fish "FISH" (it wrote "tıtle" and "FİSH") — ${rt[0]}, ${rt[1]}`);

  // ---- empty, copy, labels
  r = await conv('');
  ok(Object.values(r).every((v) => v === ''), 'empty input → empty rows');
  await hookClipboard(page);
  await page.getByRole('button', { name: 'Copy CONSTANT_CASE' }).click();
  ok((await copied(page)).length === 0, 'nothing to copy from an empty row');
  await conv('copy me\nand me');
  await page.getByRole('button', { name: 'Copy CONSTANT_CASE' }).click(); await page.getByRole('button', { name: 'Copy Title Case' }).click();
  ok(JSON.stringify(await copied(page)) === JSON.stringify(['COPY_ME\nAND_ME', 'Copy Me\nAnd Me']), `each row has its own copy button, named after it, and copies its text with the line breaks (${JSON.stringify(await copied(page))})`);
  ok((await page.locator('.case-row').first().getAttribute('title')).length > 10 && /a, an, and/.test(await page.locator('.case-row', { hasText: 'Title Case' }).getAttribute('title')), 'each row says what it does (tooltip)');

  // ---- a long text: shown in part, copied whole; typing stays quick
  const long = Array(40000).fill('the quick brown fox').join(' ');
  const took = await ta.evaluate((e, v) => { e.value = v; const t0 = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t0; }, long);
  ok(took < 50, `0.8 MB of text: the keystroke returns in ${took.toFixed(1)} ms (the conversions follow when the typing pauses)`);
  ok(await until(page, () => document.querySelector('.case-val').textContent.startsWith('THE QUICK BROWN FOX THE'), null, 20000), '… and they do');
  const shown = await page.locator('.case-val').first().evaluate((e) => e.textContent.length);
  await page.getByRole('button', { name: 'Copy UPPER CASE' }).click();
  ok(shown === 20001 && (await copied(page)).at(-1).length === long.length && await page.locator('p', { hasText: 'Long results are shown up to' }).isVisible(), `a long result is put on screen up to 20,000 characters (said under the list) and copied whole (${shown} shown, ${(await copied(page)).at(-1).length} copied)`);
  await conv('short again'); ok(await page.locator('p', { hasText: 'Long results are shown up to' }).isHidden(), 'the note goes with the long text');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__supertoolsLive().resources.length === 0), 'the engine is released when the tab is left');

  // ---- the engine cannot be fetched: said, and typing again retries
  const off = await newPage({ viewport: { width: 1366, height: 900 } }); let fail = true;
  await off.route(/textkit-.*\.wasm/, (rt) => (fail ? rt.abort() : rt.continue()));
  await off.goto(`${base}#/case`); await off.locator('textarea').first().waitFor();
  ok(await until(off, () => /could not be loaded/.test(document.querySelector('.note-err')?.textContent || '')), `no engine: the tab says so (${await notes(off)})`);
  fail = false; await setValue(off.locator('textarea').first(), 'now it works');
  ok(await until(off, () => document.querySelector('.case-val').textContent === 'NOW IT WORKS' && !document.querySelector('.note-err')), 'typing again fetches it and the note goes');

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/case`); await ph.locator('.case-row').first().waitFor();
  await setValue(ph.locator('textarea').first(), 'averyveryverylongwordwithoutanyspacesatallthatmustnotwidenthepage '.repeat(3) + '\nsecond line');
  await until(ph, () => document.querySelector('.case-val').textContent.startsWith('AVERY'));
  const btn = await ph.getByRole('button', { name: 'Copy UPPER CASE' }).boundingBox();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll with a very long word');
  ok(btn.height >= 44 && btn.width >= 44, `phone: the copy buttons are at least 44 px (${Math.round(btn.width)} × ${Math.round(btn.height)})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
