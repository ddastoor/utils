// Photo Dictionary (#/photodict, mobile only): a photographed book page (tests/fixtures/images/book-page.jpg, made by
// scripts/make-page-photo.mjs) → OCR → the hardest words, rarest first, with Wiktionary meanings from the bundle.
// Online fallback is mocked with responses in the real APIs' formats (the sandbox and CI never reach them):
// snollygoster → Wiktionary REST, mumpsimus → Wiktionary 404 then Free Dictionary API, quidnunc → nowhere (Not found).
import { readFileSync } from 'node:fs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;
const STATUS = '.pd-top [aria-live="polite"]';

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

async function mockApis(page, log, mode = 'ok') {
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
const waitDone = (page) => page.waitForFunction((sel) => /hardest word|No hard words|No text found|went wrong/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 180000 });

export default async ({ base, page: newPage, ok, info, devices }) => {
  const phone = { ...devices['iPhone 13'] };
  const page = await newPage(phone), log = [];
  await mockApis(page, log);
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
  ok(/^\d+ hardest words?, rarest first/.test(st), `status reports the result: "${st}"`);
  ok(words.length === 20, `20 words shown (${words.length})`);
  const missing = RARE.filter((w) => !words.includes(w));
  ok(!missing.length, `all ${RARE.length} rare words of the page are in the list${missing.length ? ` — missing ${missing.join(', ')}` : ''}`);
  ok(!words.some((w) => ['the', 'and', 'of', 'a', 'she', 'went', 'home', 'town'].includes(w)), 'common words left out');
  // order: rarest first (Zipf of the form on the page; online words are unknown to wordfreq → first)
  const zs = await page.locator('.pd-list .pd-card').evaluateAll((els) => els.map((e) => e.dataset.word));
  const zOf = (w) => (Z.has(w) ? Z.get(w) : -1);
  const local = zs.filter((w) => RARE.includes(w));
  ok(local.every((w, i) => i === 0 || zOf(local[i - 1]) <= zOf(w)), `rarest first (${local.map((w) => `${w} ${zOf(w)}`).join(' · ')})`);
  ok(words.indexOf('snollygoster') >= 0 && words.indexOf('snollygoster') < words.indexOf('sesquipedalian'), 'words unknown to the frequency list come first');

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

  // tap a word in the recognised text: "geese" → goose, "plural of goose"; a common word works too
  await page.getByText('Recognised text — tap any word to look it up').click();
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
  ok(/^\w+ \(\w+\): .+/m.test(shared) && shared.split('\n').length === 20, `share sends the 20 words with meanings (${shared.split('\n')[0].slice(0, 60)}…)`);
  // the browser logs every mocked "not found" (404) answer of the dictionary APIs; anything else is a real error
  const real = (errs) => errs.filter((e) => !/Failed to load resource: (the server responded with a status of 404|net::ERR_INTERNET_DISCONNECTED)/.test(e));
  ok(real(page.errors).length === 0, `no page errors: ${real(page.errors).join(' | ')}`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  const tok = await page.locator('details.pd-more summary').first().evaluate((e) => e.getBoundingClientRect().height);
  ok(tok >= 44, `phone: collapsible rows are tall enough to tap (${Math.round(tok)} px)`);

  // online look-ups turned off: nothing leaves the phone; unknown words go to Not found
  const p2 = await newPage(phone), log2 = [];
  await mockApis(p2, log2);
  await p2.goto(base + '#/photodict');
  await p2.getByText('Look up missing words online').click();
  await p2.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  await waitDone(p2);
  const w2 = await cardWords(p2);
  ok(log2.length === 0, `online off: no requests (${log2.length})`);
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
  ok((await cardWords(p3)).filter((w) => RARE.includes(w)).length === RARE.length, 'offline: bundled results still shown');
  ok(p2.errors.length === 0 && real(p3.errors).length === 0, `no page errors (online off / offline): ${[...p2.errors, ...real(p3.errors)].join(' | ')}`);

  // live camera (Chromium's fake camera shows a test pattern: no words) → Snap runs the pipeline
  const p4 = await newPage(phone);
  await mockApis(p4, []);
  await p4.goto(base + '#/photodict');
  await p4.getByRole('button', { name: 'Use camera' }).click();
  await p4.waitForFunction(() => document.querySelector('video.pd-video')?.videoWidth > 0, null, { timeout: 15000 });
  ok(await p4.locator('.pd-cam').isVisible(), 'camera viewfinder shown');
  await p4.getByRole('button', { name: 'Snap' }).click();
  await waitDone(p4);
  ok(await p4.locator('.pd-cam').isHidden(), 'camera closed after the snap');
  ok(/No text found|No hard words|hardest word/.test(await p4.locator(STATUS).textContent()), `snap was read: "${await p4.locator(STATUS).textContent()}"`);

  // a second photo chosen while the first is being read: the newer one is read, the older result is not shown
  // (the second photo was dropped without a word, and the first page's words stayed on screen)
  { const p5 = await newPage(phone); await mockApis(p5, []);
    await p5.goto(base + '#/photodict'); const file = p5.locator('input[type=file]').first();
    await file.setInputFiles(F('astronaut.png')); await p5.waitForTimeout(300);
    await file.setInputFiles(F('book-page.jpg'));
    ok(await p5.waitForFunction((sel) => document.querySelector(sel)?.textContent === 'A new photo — it is read as soon as the one before is done.', STATUS, { timeout: 10000 }).then(() => true, () => false), 'a photo chosen while another is read: the tab says it comes next');
    await p5.waitForFunction((sel) => /hardest word/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 180000 });
    const w5 = await cardWords(p5);
    ok(w5.length === 20 && RARE.every((w) => w5.includes(w)), `… and the newer photo (the book page) is the one read: ${w5.length} words`);
    const thumb = await p5.locator('.pd-thumb').evaluate((c) => c.width / c.height);
    ok(Math.abs(thumb - 480 / 347) < 0.02, `the thumbnail is the newer photo (${thumb.toFixed(2)})`);
    // and the other way round: the page first, then a photo without text — the page's words do not stay
    await file.setInputFiles(F('book-page.jpg')); await p5.waitForTimeout(300);
    await file.setInputFiles(F('astronaut.png'));
    await p5.waitForFunction((sel) => /No text found|No hard words|hardest word/.test(document.querySelector(sel)?.textContent || '') && !/new photo/.test(document.querySelector(sel).textContent), STATUS, { timeout: 180000 });
    const after = await cardWords(p5);
    ok(!after.some((w) => RARE.includes(w)), `the page read first does not show its words over the newer photo (${await p5.locator(STATUS).textContent()})`);
    ok(real(p5.errors).length === 0, `no page errors ${real(p5.errors).join(' | ')}`); }
  // Snap pressed before the camera's first frame: it waits for it (it did nothing)
  { const p6 = await newPage(phone); await mockApis(p6, []);
    await p6.goto(base + '#/photodict'); await p6.getByRole('button', { name: 'Use camera' }).click();
    await p6.getByRole('button', { name: 'Snap' }).click();
    await waitDone(p6);
    ok(await p6.locator('.pd-cam').isHidden() && /No text found|No hard words|hardest word/.test(await p6.locator(STATUS).textContent()), 'Snap at once: the picture is taken when the first frame arrives'); }

  // desktop: the tool is for phones
  const desk = await newPage({ viewport: { width: 1366, height: 900 } });
  await desk.goto(base + '#/photodict');
  ok(await desk.getByText('made for phones').count() === 1, 'desktop: explains the tool is for phones');
};
