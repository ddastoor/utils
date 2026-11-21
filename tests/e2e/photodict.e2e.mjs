// Photo Dictionary (#/photodict, PC + mobile — owner, 21 Nov 2026; it was mobile only): a photographed book page (tests/fixtures/images/book-page.jpg, made by
// scripts/make-page-photo.mjs) → OCR → every uncommon word, rarest first, with Wiktionary meanings from the bundle and a
// Wikipedia summary under each (the upgrade of 21 Nov 2026: also the page's text first, a selected phrase looked up on
// Wikipedia, words broken over two lines put together).
// Online fallback is mocked with responses in the real APIs' formats (the sandbox and CI never reach them):
// snollygoster → Wiktionary REST, mumpsimus → Wiktionary 404 then Free Dictionary API, quidnunc → nowhere (Not found).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { tiltedJpeg, CLOSE_UP } from './_tilt.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const STATUS = '.pd-top [aria-live="polite"]';
/** A photo turned `deg` degrees to the right (90: a phone held sideways one way, 270: the other, 180: upside down), as a
 *  JPEG made in the page (the browser's own decoder and encoder: no tool outside the browser). */
const turnedPhoto = async (pg, file, deg) => Buffer.from(await pg.evaluate(async ([b64, deg]) => {
  const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
  const q = deg % 180 !== 0, c = new OffscreenCanvas(q ? bmp.height : bmp.width, q ? bmp.width : bmp.height), g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer());
  let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
}, [readFileSync(file).toString('base64'), deg]), 'base64');
let kindleWords = [];

// Zipf×10 of every word, from the same table the tool uses
const Z = new Map();
for (const l of readFileSync(new URL('../../public/data/dict/freq.txt', import.meta.url), 'utf8').split('\n')) { const [z, ...ws] = l.split(' '); for (const w of ws) if (!Z.has(w)) Z.set(w, +z); }
const RARE = ['sesquipedalian', 'perspicacious', 'magnanimously', 'scriptorium', 'punctilious', 'pusillanimous', 'sycophancy', 'crepuscular', 'lugubrious', 'obsequious', 'ebullient', 'quixotic', 'inveterate', 'courtier', 'recalcitrant'];

const WIKT = {
  snollygoster: { en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [{
    definition: '<span class="usage-label-sense"><span>(<a rel="mw:WikiLink" href="/wiki/US">US</a>, <a href="/wiki/slang">slang</a>)</span></span> A <a href="/wiki/shrewd">shrewd</a>, <a href="/wiki/unprincipled">unprincipled</a> person.<script>window.__pwned=1</script><img src="https://evil.example/x.png" onerror="window.__pwned=2">',
    examples: ['A <b>snollygoster</b> is a fellow who wants office, regardless of party, platform or principles.'] }] }] },
};
const FREEDICT = {
  mumpsimus: [{ word: 'mumpsimus', phonetic: '/ˈmʌmpsɪməs/', phonetics: [{ text: '/ˈmʌmpsɪməs/' }], meanings: [{ partOfSpeech: 'noun', definitions: [
    { definition: 'A person who obstinately adheres to old customs or ideas, in spite of evidence that they are unreasonable.', example: 'He is a mumpsimus about spelling.' }] }] }],
};

// Wikipedia's page summaries (REST API, the format of en.wikipedia.org): an article, a page of several meanings, none
const WIKI = {
  Sesquipedalian: { type: 'standard', title: 'Sesquipedalianism', extract: 'Sesquipedalianism is a linguistic style that involves the use of long words. <b>Not HTML</b> is shown as text.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Sesquipedalianism' } } },
  Quixotic: { type: 'disambiguation', title: 'Quixotic', extract: 'Quixotic may refer to:', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Quixotic' } } },
  Courtier: { type: 'standard', title: 'Courtier', extract: 'A courtier is a person who attends the royal court of a monarch or other royalty. The earliest historical examples of courtiers were part of the retinues of rulers. Historically the court was the centre of government as well as the official residence of the monarch. '.repeat(3), content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Courtier' } } },
  'The_scriptorium': { type: 'standard', title: 'Scriptorium', extract: 'A scriptorium is a writing room of medieval European monasteries for the copying and illuminating of manuscripts.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Scriptorium' } } },
};
async function mockWiki(page, log, mode = { now: 'ok' }) {
  await page.route('https://en.wikipedia.org/**', (route) => {
    const u = route.request().url(); log.push(u);
    if (mode.now === 'down') return route.abort('internetdisconnected');
    const t = decodeURIComponent(u.split('/').pop().split('?')[0]), key = t.charAt(0).toUpperCase() + t.slice(1);
    const body = WIKI[key] || WIKI[t];
    return route.fulfill({ status: body ? 200 : 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body || { type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found', title: 'Not found.' }) });
  });
}
async function mockApis(page, log, mode = 'ok', wikiLog = []) {
  await mockWiki(page, wikiLog, { now: mode });
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route('https://en.wiktionary.org/**', (route) => {
    const u = route.request().url(); log.push(u);
    if (mode === 'down') return route.abort('internetdisconnected');
    const w = decodeURIComponent(u.split('/').pop());
    return WIKT[w] ? json(route, 200, WIKT[w]) : json(route, 404, { type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found', title: 'Not found.' });
  });
  await page.route('https://api.dictionaryapi.dev/**', (route) => {
    const u = route.request().url(); log.push(u);
    if (mode === 'down') return route.abort('internetdisconnected');
    const w = decodeURIComponent(u.split('/').pop());
    return FREEDICT[w] ? json(route, 200, FREEDICT[w]) : json(route, 404, { title: 'No Definitions Found', message: "Sorry pal, we couldn't find definitions for the word you were looking for." });
  });
  await page.route('https://evil.example/**', (route) => { log.push(route.request().url()); return route.abort(); });
}
const cardWords = (page) => page.locator('.pd-list .pd-card').evaluateAll((els) => els.map((e) => e.dataset.word));
const waitDone = (page) => page.waitForFunction((sel) => /uncommon word|No uncommon words|No text found|went wrong/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 180000 });

export default async ({ base, page: newPage, ok, info, devices }) => {
  const phone = { ...devices['iPhone 13'] };
  const page = await newPage(phone), log = [], wlog = [];
  await mockApis(page, log, 'ok', wlog);
  await page.goto(base + '#/photodict');
  await page.getByRole('button', { name: 'Use camera' }).waitFor();
  ok(await page.getByRole('button', { name: 'Use camera' }).isVisible(), 'phone: camera button shown');
  ok(await page.getByRole('button', { name: 'Share list' }).isHidden(), 'no Share button before there are results');
  await page.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  await waitDone(page);
  const st = await page.locator(STATUS).textContent();
  info(st);
  const words = await cardWords(page);
  info(`cards: ${words.join(', ')}`);
  ok(/^\d+ uncommon words?, A → Z/.test(st), `status reports the result: "${st}"`);
  // every uncommon word of the page, not a fixed 20 (owner, 21 Nov 2026)
  const said = +/^(\d+)/.exec(st)[1];
  ok(words.length === said && words.length > 20 && new Set(words).size === words.length, `every uncommon word is listed, each once: ${words.length} (it was cut at 20)`);
  const missing = RARE.filter((w) => !words.includes(w));
  ok(!missing.length, `all ${RARE.length} rare words of the page are in the list${missing.length ? ` — missing ${missing.join(', ')}` : ''}`);
  ok(!words.some((w) => ['the', 'and', 'of', 'a', 'she', 'went', 'home', 'town'].includes(w)), 'common words left out');
  // order: A → Z (to-do #12, owner: "don't change the list of words, just sort them in alphabetical order") — case and
  // accents not counted; the list is the same words the ranking chose (the checks above)
  const AZ = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  ok(words.every((w, i) => i === 0 || AZ.compare(words[i - 1], w) <= 0), `A → Z (${words.slice(0, 6).join(' · ')} …)`);
  ok(words.includes('snollygoster') && words.includes('sesquipedalian') && words.indexOf('sesquipedalian') < words.indexOf('snollygoster'), 'sesquipedalian before snollygoster: by the letters, not by rarity');
  void Z;

  // a card: word, rarity, part of speech · IPA, meanings with an example, in the reading font
  const sesq = page.locator('.pd-card[data-word="sesquipedalian"]');
  const meta = await sesq.locator('.pd-meta').textContent(), sense = await sesq.locator('.pd-senses li').first().textContent();
  ok(/adjective/.test(meta) && /\/.*ˈdeɪ.*\//.test(meta), `card shows part of speech and IPA ("${meta.trim()}")`);
  ok(/long|polysyllabic/i.test(sense), `card shows the meaning ("${sense.slice(0, 60)}…")`);
  ok(await sesq.locator('.pd-ex').count() >= 1, 'card shows an example sentence');
  ok(/very rare|rare/.test(await sesq.locator('.pd-rarity').textContent()), 'card shows how rare the word is');
  ok(await page.evaluate(() => document.fonts.check('16px Literata')), 'Literata reading font loaded');
  ok(/Literata/.test(await sesq.evaluate((e) => getComputedStyle(e).fontFamily)), 'cards use the reading font');
  // the line-break hyphenated word was joined
  ok(words.includes('lugubrious'), '"lugu-/brious" across a line break read as lugubrious');

  // online fallback: Wiktionary, then the Free Dictionary API; plain text only
  const sn = page.locator('.pd-card[data-word="snollygoster"]');
  ok(/from Wiktionary online/.test(await sn.textContent()), 'snollygoster: looked up online (Wiktionary)');
  ok(/shrewd, unprincipled person/.test(await sn.locator('.pd-senses li').first().textContent()), 'online definition shown as plain text');
  ok(!(await sn.innerHTML()).includes('<a ') && !(await sn.innerHTML()).includes('<img') && (await page.evaluate(() => window.__pwned)) === undefined, 'HTML in the online answer is never rendered (no links, images or scripts)');
  ok(/from the Free Dictionary online/.test(await page.locator('.pd-card[data-word="mumpsimus"]').textContent()), 'mumpsimus: Wiktionary has none → Free Dictionary API');
  ok(!log.some((u) => u.includes('evil.example')), 'no request for the image inside the online answer');
  const sent = log.map((u) => decodeURIComponent(u.split('/').pop()));
  ok(log.length > 0 && log.length <= 50 && sent.every((w) => /^[\p{L}'-]+$/u.test(w)), `online requests carry one word each (${log.length}: ${[...new Set(sent)].join(', ')})`);
  ok(!sent.some((w) => RARE.includes(w) || w === 'the'), 'words in the bundled dictionary are never sent online');
  ok(log.every((u) => /^https:\/\/(en\.wiktionary\.org\/api\/rest_v1\/page\/definition|api\.dictionaryapi\.dev\/api\/v2\/entries\/en)\/[^/?#]+$/.test(u)), 'only the two approved endpoints are used');
  await page.getByText(/^Not found \(/).click();
  ok(/quidnunc/.test(await page.locator('details.pd-more').filter({ hasText: 'Not found' }).textContent()), 'quidnunc (unknown everywhere) listed under Not found');
  await page.getByText(/^Names skipped/).click();
  ok(/thaddeus/.test(await page.locator('details.pd-more').filter({ hasText: 'Names skipped' }).textContent()), 'Thaddeus treated as a name and skipped');

  // more meanings on tap
  const mw = await page.locator('.pd-card').filter({ has: page.getByRole('button', { name: /More meanings/ }) }).first().getAttribute('data-word').catch(() => null);
  if (mw) {
    const many = page.locator(`.pd-list .pd-card[data-word="${mw}"]`), before = await many.locator('.pd-senses li').count();
    await many.getByRole('button', { name: /More meanings/ }).click();
    ok(await many.locator('.pd-senses li').count() > before, '"More meanings" shows all senses');
  } else ok(true, 'no card needed "More meanings"');

  // the Wikipedia box under a meaning: loaded as its card comes near the screen; plain text with its link; a page of
  // several meanings, no article
  const box = (w) => page.locator(`.pd-list .pd-card[data-word="${w}"] .pd-wiki`);
  await page.locator('.pd-card[data-word="sesquipedalian"]').scrollIntoViewIfNeeded();
  await box('sesquipedalian').getByText('Read on Wikipedia ↗').waitFor({ timeout: 10000 });
  ok(/Sesquipedalianism — Sesquipedalianism is a linguistic style/.test(await box('sesquipedalian').innerText()) && (await box('sesquipedalian').innerHTML()).includes('&lt;b&gt;Not HTML&lt;/b&gt;'), 'a Wikipedia summary under the meaning, as plain text (HTML in it stays text)');
  ok(await box('sesquipedalian').getByRole('link').getAttribute('href') === 'https://en.wikipedia.org/wiki/Sesquipedalianism', 'its link opens the article');
  await page.locator('.pd-card[data-word="quixotic"]').scrollIntoViewIfNeeded();
  await box('quixotic').getByText(/several meanings/).waitFor({ timeout: 10000 });
  ok(/“Quixotic” has several meanings on Wikipedia/.test(await box('quixotic').innerText()), 'a page of several meanings: said, with its link');
  await page.locator('.pd-card[data-word="courtier"]').scrollIntoViewIfNeeded();
  await box('courtier').getByText('Read on Wikipedia ↗').waitFor({ timeout: 10000 });
  ok((await box('courtier').innerText()).length < 600, `a long article: a few sentences of it (${(await box('courtier').innerText()).length} characters)`);
  await page.locator('.pd-card[data-word="punctilious"]').scrollIntoViewIfNeeded();
  await box('punctilious').getByText(/No Wikipedia article/).waitFor({ timeout: 10000 });
  ok(true, 'no article: said');
  const wsent = wlog.map((u) => decodeURIComponent(u.split('/').pop().split('?')[0]));
  ok(wlog.every((u) => /^https:\/\/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/[^/?#]+\?redirect=true$/.test(u)) && wsent.every((w) => /^[\p{L}'_-]+$/u.test(w)), `Wikipedia gets one word per request, at the summary endpoint (${wlog.length})`);
  ok(wlog.length < words.length, `the boxes load as their cards come near the screen: ${wlog.length} of ${words.length} so far`);
  await page.locator('.pd-list .pd-card').last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  for (const c of await page.locator('.pd-list .pd-card').all()) await c.scrollIntoViewIfNeeded();
  await page.waitForFunction((n) => document.querySelectorAll('.pd-list .pd-wiki .pd-wiki-body:not(.muted), .pd-list .pd-wiki .pd-wiki-body').length >= n, words.length, { timeout: 20000 });
  ok(new Set(wlog.map((u) => u.toLowerCase())).size === words.length, `… and every card's box once scrolled to (${new Set(wlog).size} requests for ${words.length} cards)`);

  // the page's text comes first, its words broken over two lines put together ("lugu-" + "brious" in the photo)
  const text = page.locator('.pd-text');
  ok(await page.evaluate(() => { const t = document.querySelector('.pd-text'), l = document.querySelector('.pd-list'); return !!(t && l && t.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'the page’s text stands before the word list');
  ok(/lugubrious/.test(await text.innerText()) && !/lugu-/.test(await text.innerText()), 'the text shows "lugu-/brious" as lugubrious');
  // a phrase selected in the text → "Look up on Wikipedia" → a phrase card at the top of the list
  await page.evaluate(() => {
    const body = document.querySelector('.pd-textbody'), toks = [...body.querySelectorAll('.pd-tok')];
    const a = toks.find((t) => t.textContent === 'the'), b = toks[toks.indexOf(a) + 1];
    const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(b.firstChild, b.textContent.length);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); window.__phrase = `${a.textContent} ${b.textContent}`;
  });
  const sel = page.locator('.pd-selbtn');
  await sel.waitFor({ state: 'visible', timeout: 5000 });
  ok(await sel.isVisible(), 'a selected phrase: the "Look up on Wikipedia" button appears beside it');
  const phrase = await page.evaluate(() => window.__phrase);
  await sel.click();
  const pc = page.locator('.pd-list .pd-phrase').first();
  await pc.waitFor();
  ok((await pc.locator('.pd-word').innerText()) === `“${phrase}”` && await page.locator('.pd-list .pd-card').first().evaluate((e) => e.classList.contains('pd-phrase')), `the phrase gets a card at the top of the list (“${phrase}”)`);
  await pc.locator('.pd-wiki-body:not(.muted)').or(pc.getByText(/No Wikipedia article|Read on Wikipedia/)).first().waitFor({ timeout: 10000 });
  ok(wlog.some((u) => u.includes(`/summary/${encodeURIComponent(phrase.replace(/ /g, '_'))}?`)), `the phrase is looked up on Wikipedia as one title (${phrase.replace(/ /g, '_')})`);
  ok(await sel.isHidden(), 'the button goes away with the selection');
  await pc.getByRole('button', { name: `Remove “${phrase}”` }).click();
  ok(await page.locator('.pd-list .pd-phrase').count() === 0, 'a phrase card can be removed');
  // tap a word in the recognised text: "geese" → goose, "plural of goose"; a common word works too
  await page.locator('.pd-tok', { hasText: /^geese$/ }).first().click();
  await page.waitForSelector('.pd-looked .pd-card');
  const lk = page.locator('.pd-looked .pd-card');
  ok(await lk.getAttribute('data-word') === 'goose' && /plural of goose/.test(await lk.textContent()), `tapping "geese" shows goose (plural of goose)`);
  await page.locator('.pd-tok', { hasText: /^library$/ }).first().click();
  await page.waitForFunction(() => document.querySelector('.pd-looked .pd-card')?.dataset.word === 'library');
  ok(/collection of books|place/i.test(await page.locator('.pd-looked .pd-card').textContent()), 'tapping a common word (library) shows its meaning');

  // share / copy the list
  await page.evaluate(() => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; });
  ok(await page.getByRole('button', { name: 'Share list' }).isVisible(), 'Share list appears once there are results');
  await page.getByRole('button', { name: 'Share list' }).click();
  const shared = await page.evaluate(() => window.__shared?.text || '');
  ok(/^\w+ \(\w+\): .+/m.test(shared) && shared.split('\n').length === words.length, `share sends every word with its meaning (${shared.split('\n').length}: ${shared.split('\n')[0].slice(0, 60)}…)`);
  ok(JSON.stringify(shared.split('\n').map((l) => l.split(' (')[0])) === JSON.stringify(await page.locator('.pd-list .pd-card:not(.pd-phrase) .pd-word').allTextContents()), 'Share list gives the words in the order shown, A → Z');
  // the browser logs every mocked "not found" (404) answer of the dictionary APIs; anything else is a real error
  const real = (errs) => errs.filter((e) => !/Failed to load resource: (the server responded with a status of 404|net::ERR_INTERNET_DISCONNECTED)/.test(e));
  ok(real(page.errors).length === 0, `no page errors: ${real(page.errors).join(' | ')}`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  const tok = await page.locator('details.pd-more summary').first().evaluate((e) => e.getBoundingClientRect().height);
  ok(tok >= 44, `phone: collapsible rows are tall enough to tap (${Math.round(tok)} px)`);

  // online look-ups turned off: nothing leaves the phone; unknown words go to Not found
  const p2 = await newPage(phone), log2 = [], wlog2 = [];
  await mockApis(p2, log2, 'ok', wlog2);
  await p2.goto(base + '#/photodict');
  await p2.getByText('Look up missing words online').click();
  await p2.getByText('A Wikipedia summary under each word').click();
  await p2.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  await waitDone(p2);
  const w2 = await cardWords(p2);
  ok(log2.length === 0 && wlog2.length === 0 && await p2.locator('.pd-wiki').count() === 0, `online and Wikipedia off: no requests, no boxes (${log2.length} + ${wlog2.length})`);
  ok(!w2.includes('snollygoster') && !w2.includes('mumpsimus') && RARE.every((w) => w2.includes(w)), 'online off: bundled words still shown, unknown ones not');
  await p2.getByText(/^Not found \(/).click();
  ok(/snollygoster/.test(await p2.locator('details.pd-more').filter({ hasText: 'Not found' }).textContent()), 'online off: snollygoster listed under Not found');

  // APIs unreachable: a short note, local results kept
  const p3 = await newPage(phone), log3 = [];
  await mockApis(p3, log3, 'down');
  await p3.goto(base + '#/photodict');
  await p3.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  await waitDone(p3);
  ok(await p3.getByText('could not be looked up online').count() === 1, 'offline: a note says some words could not be looked up');
  await p3.locator('.pd-list .pd-card').first().scrollIntoViewIfNeeded();
  await p3.getByText(/Wikipedia could not be reached/).first().waitFor({ timeout: 15000 });
  ok(await p3.locator('.pd-wiki').first().getByRole('button', { name: 'Try again' }).isVisible(), 'Wikipedia unreachable: said in the box, with "Try again"');
  ok((await cardWords(p3)).filter((w) => RARE.includes(w)).length === RARE.length, 'offline: bundled results still shown');
  ok(p2.errors.length === 0 && real(p3.errors).length === 0, `no page errors (online off / offline): ${[...p2.errors, ...real(p3.errors)].join(' | ')}`);

  // a phone's photo of a Kindle page (owner, 21 Nov 2026: "especially when I take pictures of my Kindle"): the same
  // uncommon words as a clean copy of the page — the page's own words (tests/fixtures/images/kindle-page.txt) drawn large
  // on white — found and straightened first; a frame of the live video too
  { const pk = await newPage(phone); await mockApis(pk, []);
    await pk.goto(base + '#/photodict');
    const pick = async (file) => {
      // the line still says the photo before's result until the new one is decoded: wait for this photo's own result
      await pk.evaluate((sel) => { document.querySelector(sel).textContent = ''; }, STATUS);
      await pk.locator('input[type=file]').first().setInputFiles(file);
      await pk.waitForFunction((sel) => /uncommon word|No uncommon words|No text found|went wrong/.test(document.querySelector(sel)?.textContent || '') && !/new photo/.test(document.querySelector(sel).textContent), STATUS, { timeout: 180000 });
      return cardWords(pk);
    };
    const cleanCopy = async (txt) => Buffer.from(await pk.evaluate(async (ws) => {
      const c = new OffscreenCanvas(2000, 2600), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 2000, 2600); g.fillStyle = '#111'; g.font = '44px "DejaVu Serif", "Liberation Serif", serif';
      let y = 90, l = '';
      for (const w of ws) { if (g.measureText(l + ' ' + w).width > 1840) { g.fillText(l, 80, y); y += 66; l = w; } else l = l ? l + ' ' + w : w; }
      g.fillText(l, 80, y);
      const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
    }, readFileSync(F(txt), 'utf8').trim().split(/\s+/)), 'base64');
    // (kindle-blur and kindle-comfortaa: upright photos whose letters run together — the letter-based check took one for
    // upside down and the other for sideways, and the turn spoiled them: 2 % and 0 % of their words; 21 Nov 2026)
    for (const [photo, txt, min, what] of [['kindle-page.jpg', 'kindle-page.txt', 0.9, "a phone's still"], ['kindle-frame.jpg', 'kindle-frame.txt', 0.8, 'a frame of the live video'],
      ['kindle-blur.jpg', 'kindle-blur.txt', 0.85, 'a soft still whose letters run together'], ['kindle-comfortaa.jpg', 'kindle-comfortaa.txt', 0.6, 'a frame of the live video in Comfortaa']]) {
      const ref = await pick({ name: 'clean-copy.png', mimeType: 'image/png', buffer: await cleanCopy(txt) });
      const got = await pick(F(photo)), share = ref.filter((w) => got.includes(w)).length / ref.length, said = await pk.locator(STATUS).textContent();
      ok(ref.length >= 8 && share >= min, `${what} of a Kindle page finds ${Math.round(100 * share)} % (at least ${100 * min} %) of the ${ref.length} uncommon words of a clean copy of it — missing: ${ref.filter((w) => !got.includes(w)).join(', ') || 'none'}`);
      ok(await pk.locator('.pd-advice').innerText() === '', `${what}: read well, so no "snap again" hint`);
      ok(!/turned/.test(said), `${what}: upright, read the way it stands — not turned (${said})`);
    }
    // a photo too soft to read well (a frame of the live video, out of focus, with moiré): what was read is shown, and
    // the tab says why and what to do — not a list of misread words passed off as the page's
    await pick(F('kindle-soft.jpg'));
    const tip = await pk.locator('.pd-advice').innerText();
    ok(/reads poorly|Only \d+ words? (was|were) read/.test(tip) && /Hold the phone steady and a little closer, in good light, and snap again/.test(tip), `a blurred photo: the tab says it reads poorly and to snap again (${tip})`);
    kindleWords = await pick(F('kindle-page.jpg'));
    ok(await pk.locator('.pd-advice').innerText() === '', 'the next, sharp photo: the hint is gone');
    // the phone held sideways (owner, 21 Nov 2026: "when I take my phone and turn it 90 degrees horizontally, either with
    // my left hand or my right hand … it can't understand a thing" — to-do #11): the same photo turned a quarter either
    // way, and upside down, gives the same uncommon words, and the line says how it was turned
    for (const [deg, how] of [[90, 'a quarter to the left'], [270, 'a quarter to the right'], [180, 'upside down']]) {
      const got = await pick({ name: `kindle-${deg}.jpg`, mimeType: 'image/jpeg', buffer: await turnedPhoto(pk, F('kindle-page.jpg'), deg) });
      const share = kindleWords.filter((w) => got.includes(w)).length / kindleWords.length, said = await pk.locator(STATUS).textContent();
      ok(kindleWords.length >= 8 && share >= 0.9 && said.includes(`the photo was turned ${how} to read it`), `the Kindle photo turned ${deg}°: ${Math.round(100 * share)} % of the upright photo's uncommon words, turned ${how} first (${said})`);
    }
    // photos taken at an angle (owner, 21 Nov 2026: "when I click it at different angles"): the whole photo turned 30° on
    // a desk, and a close-up of the screen (no edge to find) turned 20° and −25° — the lines levelled first, the same
    // uncommon words as the photo upright / the close-up as it is
    { const got = await pick({ name: 'kindle-tilt30.jpg', mimeType: 'image/jpeg', buffer: await tiltedJpeg(pk, F('kindle-page.jpg'), 30) });
      const share = kindleWords.filter((w) => got.includes(w)).length / kindleWords.length;
      ok(share >= 0.9, `the Kindle photo turned 30°: ${Math.round(100 * share)} % of the upright photo's uncommon words (${await pk.locator(STATUS).textContent()})`); }
    { const level = await pick({ name: 'closeup.jpg', mimeType: 'image/jpeg', buffer: await tiltedJpeg(pk, F('kindle-page.jpg'), 0, CLOSE_UP) });
      for (const deg of [20, -25]) {
        const got = await pick({ name: `closeup${deg}.jpg`, mimeType: 'image/jpeg', buffer: await tiltedJpeg(pk, F('kindle-page.jpg'), deg, CLOSE_UP) }), said = await pk.locator(STATUS).textContent();
        const share = level.filter((w) => got.includes(w)).length / Math.max(1, level.length);
        ok(level.length >= 8 && share >= 0.9 && /the photo was levelled \(\d+°\)/.test(said), `a close-up of the screen turned ${deg}°: ${Math.round(100 * share)} % of the close-up's uncommon words as it is, levelled first (${said})`);
      } }
    await pick(F('kindle-page.jpg'));
    ok(!(await pk.locator(STATUS).textContent()).includes('was turned'), 'an upright photo is read as it is (nothing turned)');
    ok(real(pk.errors).length === 0, `no page errors with the Kindle photos ${real(pk.errors).join(' | ')}`); }

  // live camera (Chromium's fake camera shows a test pattern: no words) → Snap runs the pipeline
  const p4 = await newPage(phone);
  await mockApis(p4, []);
  await p4.goto(base + '#/photodict');
  await p4.getByRole('button', { name: 'Use camera' }).click();
  await p4.waitForFunction(() => document.querySelector('video.live-cam-video')?.videoWidth > 0, null, { timeout: 15000 });
  ok(await p4.locator('.live-cam').isVisible(), 'camera viewfinder shown (the shared live camera)');
  ok(await p4.evaluate(() => getComputedStyle(document.querySelector('.actions')).display === 'none'), 'phone: no fixed bar over the camera');
  await p4.locator('.live-cam-ctl').getByRole('button', { name: 'Snap' }).click();
  await waitDone(p4);
  ok(await p4.locator('.live-cam').isHidden(), 'camera closed after the snap');
  ok(/No text found|No uncommon words|uncommon word/.test(await p4.locator(STATUS).textContent()), `snap was read: "${await p4.locator(STATUS).textContent()}"`);

  // a second photo chosen while the first is being read: the newer one is read, the older result is not shown
  // (the second photo was dropped without a word, and the first page's words stayed on screen)
  { const p5 = await newPage(phone); await mockApis(p5, []);
    await p5.goto(base + '#/photodict'); const file = p5.locator('input[type=file]').first();
    await file.setInputFiles(F('astronaut.png')); await p5.waitForTimeout(300);
    await file.setInputFiles(F('book-page.jpg'));
    ok(await p5.waitForFunction((sel) => document.querySelector(sel)?.textContent === 'A new photo — it is read as soon as the one before is done.', STATUS, { timeout: 10000 }).then(() => true, () => false), 'a photo chosen while another is read: the tab says it comes next');
    await p5.waitForFunction((sel) => /uncommon word/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 180000 });
    const w5 = await cardWords(p5);
    ok(w5.length === words.length && RARE.every((w) => w5.includes(w)), `… and the newer photo (the book page) is the one read: ${w5.length} words`);
    const thumb = await p5.locator('.pd-thumb').evaluate((c) => c.width / c.height);
    ok(Math.abs(thumb - 480 / 347) < 0.02, `the thumbnail is the newer photo (${thumb.toFixed(2)})`);
    // and the other way round: the page first, then a photo without text — the page's words do not stay
    await file.setInputFiles(F('book-page.jpg')); await p5.waitForTimeout(300);
    await file.setInputFiles(F('astronaut.png'));
    await p5.waitForFunction((sel) => /No text found|No uncommon words|uncommon word/.test(document.querySelector(sel)?.textContent || '') && !/new photo/.test(document.querySelector(sel).textContent), STATUS, { timeout: 180000 });
    const after = await cardWords(p5);
    ok(!after.some((w) => RARE.includes(w)), `the page read first does not show its words over the newer photo (${await p5.locator(STATUS).textContent()})`);
    ok(real(p5.errors).length === 0, `no page errors ${real(p5.errors).join(' | ')}`); }
  // Snap pressed before the camera's first frame: it waits for it (it did nothing)
  { const p6 = await newPage(phone); await mockApis(p6, []);
    await p6.goto(base + '#/photodict'); await p6.getByRole('button', { name: 'Use camera' }).click();
    await p6.locator('.live-cam-ctl').getByRole('button', { name: 'Snap' }).click();
    await waitDone(p6);
    ok(await p6.locator('.live-cam').isHidden() && /No text found|No uncommon words|uncommon word/.test(await p6.locator(STATUS).textContent()), 'Snap at once: the picture is taken when the first frame arrives'); }

  // phones: Snap takes the camera's own still where the browser can (ImageCapture.takePhoto — Android Chrome), at its
  // full size; a frame of the live video (about 1920 × 1080) is softer and smaller (owner, 21 Nov 2026: the phone read a
  // Kindle page worse than the webcam). Here the video shows a sentence with no rare word, the still the book page: the
  // words found say which one was read.
  const stillCam = async (mode, file = 'book-page.jpg') => {
    const p = await newPage(phone); await mockApis(p, []);
    const still = `data:image/jpeg;base64,${readFileSync(F(file)).toString('base64')}`;
    await p.addInitScript(([url, mode]) => {
      window.__tracks = []; window.__photos = []; window.__focus = [];
      navigator.mediaDevices.getUserMedia = async () => {
        const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d'); // the live picture: landscape
        const paint = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#111'; g.font = '48px serif'; g.fillText('The cat sat on the mat.', 40, 360); };
        paint(); setInterval(paint, 100);
        const s = cv.captureStream(10), t = s.getVideoTracks()[0];
        t.getCapabilities = () => ({ focusMode: ['manual', 'single-shot', 'continuous'] });
        const ac = t.applyConstraints.bind(t); t.applyConstraints = async (c) => { window.__focus.push(JSON.stringify(c)); return ac({}); };
        window.__tracks.push(t); return s;
      };
      navigator.mediaDevices.enumerateDevices = async () => [{ deviceId: 'back', kind: 'videoinput', label: 'Back camera', groupId: 'back' }];
      if (mode === 'none') { delete window.ImageCapture; return; }
      window.ImageCapture = class {
        constructor(track) { this.track = track; }
        async getPhotoCapabilities() { return { imageWidth: { min: 640, max: 8160, step: 1 }, imageHeight: { min: 480, max: 6120, step: 1 } }; }
        async takePhoto(settings) {
          window.__photos.push(settings || null);
          if (mode === 'refuse') throw new DOMException('the camera is busy', 'OperationError');
          const img = new Image(); img.src = url; await img.decode();
          // portrait: a still that comes the sensor's way round, the scene turned a quarter to the left (no EXIF turn);
          // portrait-cw: the same the other way (the tab's turn to the live picture's shape then leaves it upside down);
          // side-90 / side-270: the phone held sideways, the page lying across the still as in the live picture
          const deg = { portrait: -90, 'portrait-cw': 90, 'side-90': 90, 'side-270': 270 }[mode];
          if (!deg) return (await fetch(url)).blob();
          const c = new OffscreenCanvas(img.naturalHeight, img.naturalWidth), g = c.getContext('2d');
          g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          return c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        }
      };
    }, [still, mode]);
    await p.goto(base + '#/photodict');
    await p.getByRole('button', { name: 'Use camera' }).click();
    await p.waitForFunction(() => document.querySelector('video.live-cam-video')?.videoWidth > 0, null, { timeout: 15000 });
    await p.locator('.live-cam-ctl').getByRole('button', { name: 'Snap' }).click();
    await waitDone(p);
    return { p, words: await cardWords(p), photos: await p.evaluate(() => window.__photos), focus: await p.evaluate(() => window.__focus) };
  };
  { const r = await stillCam('still');
    ok(r.photos.length === 1 && RARE.filter((w) => r.words.includes(w)).length >= RARE.length - 1, `Snap on a phone: the camera's own still is read, not the video frame (${r.words.length} words: ${r.words.slice(0, 4).join(', ')} …)`);
    ok(r.photos[0]?.imageWidth === 4096, `a still of a 50-megapixel camera is asked for at 4096 px wide, not 8160 (${JSON.stringify(r.photos[0])})`);
    ok(r.focus.some((c) => /"focusMode":"continuous"/.test(c)), `the camera is asked to keep focusing (continuous autofocus) where it can (${r.focus.join(' | ')})`);
    ok(await r.p.evaluate(() => window.__tracks.every((t) => t.readyState === 'ended')), 'the camera is off after the snap');
    const [dl] = await Promise.all([r.p.waitForEvent('download'), r.p.getByRole('button', { name: 'Save this photo' }).click()]);
    const saved = readFileSync(await dl.path());
    ok(saved[0] === 0xff && saved[1] === 0xd8 && saved.length > 100000, `Save this photo gives the still that was read (${saved.length} bytes)`); }
  { const r = await stillCam('portrait');
    ok(RARE.filter((w) => r.words.includes(w)).length >= RARE.length - 1, `a still that came the sensor's way round (portrait, the live picture landscape) is turned before it is read (${r.words.length} words)`); }
  { const r = await stillCam('portrait-cw');
    ok(RARE.filter((w) => r.words.includes(w)).length >= RARE.length - 1 && /turned upside down to read it/.test(await r.p.locator(STATUS).textContent()), `a still turned the other way (upside down after the turn to the live picture's shape) is set upright before it is read (${await r.p.locator(STATUS).textContent()})`); }
  // the phone held sideways in either hand (owner, 21 Nov 2026 — to-do #11): the Kindle page lies across the still
  for (const [mode, how] of [['side-90', 'a quarter to the left'], ['side-270', 'a quarter to the right']]) {
    const r = await stillCam(mode, 'kindle-page.jpg'), share = kindleWords.filter((w) => r.words.includes(w)).length / Math.max(1, kindleWords.length);
    ok(kindleWords.length >= 8 && share >= 0.9 && (await r.p.locator(STATUS).textContent()).includes(`turned ${how} to read it`), `the phone held sideways (${mode}): ${Math.round(100 * share)} % of the upright photo's uncommon words (${await r.p.locator(STATUS).textContent()})`);
  }
  { const r = await stillCam('refuse');
    ok(r.photos.length === 1 && !RARE.some((w) => r.words.includes(w)) && /No uncommon words|uncommon word|No text found/.test(await r.p.locator(STATUS).textContent()), 'a still the camera refuses: the video frame is read instead');
    ok(real(r.p.errors).length === 0, `no page errors when the still is refused ${real(r.p.errors).join(' | ')}`); }
  { const r = await stillCam('none');
    ok(r.photos.length === 0 && !RARE.some((w) => r.words.includes(w)), 'a browser without ImageCapture (Safari): the video frame is read'); }

  // PC (owner, 21 Nov 2026: "PC + phone", the photo from the webcam): a webcam that shows the book page → Snap → the
  // same words as the photo file; and a photo file on a PC
  { const desk = await newPage({ viewport: { width: 1366, height: 900 } }); await mockApis(desk, []);
    const shot = `data:image/jpeg;base64,${readFileSync(F('book-page.jpg')).toString('base64')}`;
    await desk.addInitScript((url) => {
      window.__tracks = [];
      navigator.mediaDevices.getUserMedia = async () => {
        const img = new Image(); img.src = url; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; const g = cv.getContext('2d');
        const paint = () => g.drawImage(img, 0, 0); paint(); setInterval(paint, 100);
        const s = cv.captureStream(10); window.__tracks.push(s.getVideoTracks()[0]); return s;
      };
      navigator.mediaDevices.enumerateDevices = async () => [{ deviceId: 'cam-a', kind: 'videoinput', label: 'Webcam', groupId: 'cam-a' }];
    }, shot);
    await desk.goto(base + '#/photodict');
    await desk.getByRole('button', { name: 'Use webcam' }).waitFor();
    ok(await desk.getByText('made for phones').count() === 0 && await desk.locator('.tool-title .badge').count() === 0, 'PC: the tool itself, not a "made for phones" note');
    await desk.getByRole('button', { name: 'Use webcam' }).click();
    await desk.waitForFunction(() => document.querySelector('video.live-cam-video')?.videoWidth > 0, null, { timeout: 15000 });
    await desk.locator('.live-cam-ctl').getByRole('button', { name: 'Snap' }).click();
    await desk.waitForFunction((sel) => /uncommon word|No text found|went wrong/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 180000 });
    const [dls] = await Promise.all([desk.waitForEvent('download'), desk.getByRole('button', { name: 'Save this photo' }).click()]);
    ok(/^camera-\d{8}-\d{6}(-\d+)?\.jpg$/.test(dls.suggestedFilename()), `Save this photo after a Snap: the frame that was read (${dls.suggestedFilename()})`);
    const wd = await cardWords(desk);
    ok(wd.length === words.length && RARE.every((w) => wd.includes(w)), `PC: the webcam's photo of the page gives the same words (${wd.length}: ${wd.slice(0, 5).join(', ')} …)`);
    ok(await desk.evaluate(() => window.__tracks.every((t) => t.readyState === 'ended')), 'PC: the webcam is off after the Snap');
    ok(await desk.getByRole('button', { name: 'Share list' }).isVisible(), 'PC: Share list once there is a list');
    await desk.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
    await desk.waitForFunction((sel) => !/uncommon word/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 20000 });
    ok(true, 'PC: a new photo clears the line of the result before');
    await desk.waitForFunction((sel) => /uncommon word/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 180000 });
    ok((await cardWords(desk)).length === words.length, 'PC: a photo file works as well');
    // "Save this photo": the picture that was read, as chosen (here: the file itself)
    const [dlp] = await Promise.all([desk.waitForEvent('download'), desk.getByRole('button', { name: 'Save this photo' }).click()]);
    ok(dlp.suggestedFilename() === 'book-page.jpg', `Save this photo gives the photo that was read (${dlp.suggestedFilename()})`);
    // PC: a phrase selected with the mouse (a drag over two words) is no look-up of a word, and gets the button
    const toks = desk.locator('.pd-textbody .pd-tok');
    await toks.nth(3).scrollIntoViewIfNeeded();
    const t1 = await toks.nth(3).boundingBox(), t2 = await toks.nth(4).boundingBox();
    await desk.mouse.move(t1.x + 1, t1.y + t1.height / 2); await desk.mouse.down();
    await desk.mouse.move(t2.x + t2.width - 1, t2.y + t2.height / 2, { steps: 6 }); await desk.mouse.up();
    await desk.locator('.pd-selbtn').waitFor({ state: 'visible', timeout: 5000 });
    ok(await desk.locator('.pd-looked .pd-card').count() === 0 && (await desk.evaluate(() => getSelection().toString())).trim().split(/\s+/).length >= 2, 'PC: a drag over two words selects them — no look-up of a word, the Wikipedia button shows');
    await desk.evaluate(() => getSelection().removeAllRanges());
    // the keyboard: one tab stop for the text; the arrow keys go from word to word, Enter looks the word up
    await desk.locator('.pd-textbody').focus();
    for (let k = 0; k < 4; k++) await desk.keyboard.press('ArrowRight');
    const kwd = await desk.locator('.pd-tok.pd-kw').textContent();
    ok(kwd === await toks.nth(3).textContent(), `keyboard: the fourth word is the current one (${kwd})`);
    await desk.keyboard.press('Enter');
    await desk.locator('.pd-looked .pd-card, .pd-looked .note').first().waitFor({ timeout: 10000 });
    ok(await desk.locator('.pd-looked').getByText(new RegExp(kwd, 'i')).count() > 0, `keyboard: Enter looks “${kwd}” up`);
    ok(await desk.locator('.pd-textbody .pd-tok[tabindex]').count() === 0, 'the words are no tab stops of their own (one stop for the text)');
    // words broken over two lines, read from a photo: a page drawn here with "magnani-", "lugu-", "well-" at line ends
    const shotB64 = await desk.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1400; c.height = 720; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = '46px Georgia, serif';
      ['It was a truly magnani-', 'mous gesture, and the', 'lugu- brious mood of the', 'well- known old hall lifted', 'for a moment at least.']
        .forEach((l, i) => g.fillText(l.replace('lugu- ', 'lugu-').replace('well- ', 'well-'), 60, 110 + i * 120));
      return c.toDataURL('image/png').split(',')[1];
    });
    // (the third and fourth lines carry the second halves: redraw them as "lugu-" / "brious mood" …)
    const page2 = await desk.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1400; c.height = 840; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = '46px Georgia, serif';
      ['It was a truly magnani-', 'mous gesture, and the lugu-', 'brious mood of the well-', 'known old hall lifted for', 'a moment at least.']
        .forEach((l, i) => g.fillText(l, 60, 110 + i * 130));
      return c.toDataURL('image/png').split(',')[1];
    });
    void shotB64;
    await desk.locator('input[type=file]').first().setInputFiles({ name: 'broken-words.png', mimeType: 'image/png', buffer: Buffer.from(page2, 'base64') });
    await desk.waitForFunction((sel) => !/uncommon word/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 20000 });
    await desk.waitForFunction((sel) => /uncommon word|No uncommon words|No text found/.test(document.querySelector(sel)?.textContent || '') && !/new photo/.test(document.querySelector(sel).textContent), STATUS, { timeout: 180000 });
    const shown = (await desk.locator('.pd-textbody').innerText()).replace(/\s+/g, ' ');
    ok(/magnanimous/.test(shown) && /lugubrious/.test(shown) && /well-known/.test(shown) && !/magnani-|lugu-/.test(shown), `words broken over two lines are one word in the text (magnanimous, lugubrious) and a compound keeps its hyphen (well-known): “${shown.slice(0, 120)}”`);
    const bw = await cardWords(desk);
    ok(bw.includes('magnanimous') && bw.includes('lugubrious') && !bw.includes('magnani') && !bw.includes('mous'), `… and in the word list (${bw.join(', ')})`);
    ok(real(desk.errors).length === 0, `PC: no page errors ${real(desk.errors).join(' | ')}`); }
};
