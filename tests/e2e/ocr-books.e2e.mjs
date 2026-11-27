// Photos of open books in the OCR tab and the Photo Dictionary — potentials #96, the Book Page Flattener as a step of both
// tabs' shared reading path (src/lib/readpage.ts bookPages; the owner, 21 Nov 2026: "the OCR tab and the Photo Dictionary
// then read printed books as well as a Kindle page"). The photos of tests/fixtures/books (scripts/make-book-photos.py: two
// pages bent near the spine, a phone's camera over them; truth.json holds each page's words): a spread, a thick book's
// spread, one page, a spread taken with a phone's 2× lens. Each is read with its pages drawn flat — a spread's left page
// before its right one, every word in order —, the line says so, and the flat pages stand in place of the photo; a Kindle
// page and a document photographed flat are not flattened.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const B = (n) => fileURLToPath(new URL(`../fixtures/books/${n}`, import.meta.url));
const I = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(B('truth.json'), 'utf8'));
const wordsOf = (x) => (x.normalize('NFC').replace(/[’‘]/g, "'").toLowerCase().match(/[a-z0-9']+/g) || []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
const lcs = (a, b) => { let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1); for (let i = 1; i <= a.length; i++) { cur[0] = 0; for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); [prev, cur] = [cur, prev]; } return prev[b.length]; };
const pages = (f) => ['left', 'right'].filter((s) => TRUTH[f].words[s]).map((s) => wordsOf(TRUTH[f].words[s]));
/** the photos, the share of their words to be read right in order at least, and what they are */
const BOOKS = [['spread.jpg', 0.95, 'a spread'], ['thick.jpg', 0.9, 'a thick book’s spread'], ['page.jpg', 0.95, 'one page of a book'], ['tele.jpg', 0.95, 'a spread taken with a 2× lens']];

export default async ({ base, page: newPage, ok, info }) => {
  // ---- the OCR tab
  const page = await newPage();
  await page.goto(base + '#/ocr');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  const line = () => page.locator('.ocr-text ~ [aria-live="polite"]').innerText();
  const recognise = async (file) => {
    await page.locator('input[type=file]').setInputFiles(file);
    await page.waitForSelector('.ed-canvas', { state: 'visible' });
    await page.waitForFunction(() => !/confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''));
    await page.getByRole('button', { name: 'Extract text' }).click();
    await page.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 240000 });
    return page.locator('.ocr-text').inputValue();
  };
  const measured = [];
  for (const [f, min, what] of BOOKS) {
    const text = await recognise(B(f)), said = await line(), got = wordsOf(text), ps = pages(f), truth = ps.flat();
    const right = lcs(truth, got) / truth.length;
    measured.push(`${f} ${(100 * right).toFixed(1)} %`);
    ok(right >= min, `${what}: ${(100 * right).toFixed(1)} % of its ${truth.length} words read right, in order (at least ${100 * min} %)`);
    // a spread's two pages are always flattened; one page only when its flat reading is clearly better than the usual one
    // (a thin book's page reads as well either way: the usual reading is kept, the page found and straightened)
    ok(ps.length === 2 ? /two pages were flattened .* read left, then right/.test(said) : /book’s page was flattened|page was found and straightened/.test(said), `${what}: the line says how it was read (${said.split(' · ').slice(1).join(' · ')})`);
    if (ps.length === 2) {
      // the left page's words before the right page's: each page read right in its own place in the text
      const cut = Math.round(got.length * (ps[0].length / truth.length)), l = lcs(ps[0], got.slice(0, cut + 40)) / ps[0].length, r = lcs(ps[1], got.slice(Math.max(0, cut - 40))) / ps[1].length;
      ok(l >= min - 0.02 && r >= min - 0.02, `${what}: the left page first (${(100 * l).toFixed(0)} % of its words in the first part of the text), then the right (${(100 * r).toFixed(0)} % in the rest)`);
      // the flat pages stand in place of the photo: one above the other, the picture taller than wide (the photo is wider)
      const shape = await page.locator('.ed-canvas').evaluate((c) => c.height / c.width);
      ok(shape > 1.4, `${what}: the two flat pages shown one above the other in place of the photo (height ${shape.toFixed(2)} × the width)`);
    }
  }
  info(`OCR, words read right in order: ${measured.join(' · ')}`);
  // flat pages are not flattened: a Kindle page and a document, found and straightened as before
  for (const [f, what] of [['kindle-page.jpg', 'a Kindle page'], ['doc-memo-still.jpg', 'a memo photographed flat']]) {
    await recognise(I(f));
    const said = await line();
    ok(!/flattened/.test(said) && /page was found and straightened/.test(said), `${what}: not flattened — its page found and straightened as before (${said.split(' · ').slice(1).join(' · ')})`);
  }
  // the clean-up off: the photo as it is, nothing flattened
  { const sw = page.locator('label.switch', { hasText: 'Clean up' });
    await sw.click();
    await recognise(B('spread.jpg'));
    ok(!/flattened|straightened/.test(await line()), 'the clean-up off: the photo read as it is — nothing flattened');
    await sw.click(); }
  ok(!page.errors.length, `OCR: no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- the Photo Dictionary: the page's text in order, its uncommon words — the same as from the flat pages
  const pd = await newPage();
  for (const host of ['https://en.wiktionary.org/**', 'https://api.dictionaryapi.dev/**', 'https://en.wikipedia.org/**']) await pd.route(host, (r) => r.abort('internetdisconnected'));
  await pd.goto(base + '#/photodict');
  const STATUS = '.pd-top [aria-live="polite"]';
  await pd.locator(STATUS).waitFor({ state: 'attached' }); // the tab's code arrives after the page
  const pick = async (file) => {
    await pd.evaluate((sel) => { document.querySelector(sel).textContent = ''; }, STATUS);
    await pd.locator('input[type=file]').first().setInputFiles(file);
    await pd.waitForFunction((sel) => /uncommon word|No uncommon words|No text found|went wrong/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 240000 });
    return { said: await pd.locator(STATUS).textContent(), text: await pd.locator('.pd-textbody').evaluate((e) => e.textContent), cards: await pd.locator('.pd-list .pd-card').evaluateAll((els) => els.map((e) => e.dataset.word)) };
  };
  // the uncommon words of a clean copy of the book's text (its words drawn large on white, left page first): the photo's
  // must hold them (the photodict suite's measure)
  const cleanCopy = async (ws) => Buffer.from(await pd.evaluate(async (ws) => {
    const W = 2000, lh = 66, g0 = new OffscreenCanvas(10, 10).getContext('2d'); g0.font = '44px "DejaVu Serif", "Liberation Serif", serif';
    const lines = []; let l = '';
    for (const w of ws) { if (g0.measureText(l + ' ' + w).width > W - 160) { lines.push(l); l = w; } else l = l ? l + ' ' + w : w; }
    lines.push(l);
    const c = new OffscreenCanvas(W, 120 + lines.length * lh), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = g0.font;
    lines.forEach((t, i) => g.fillText(t, 80, 90 + i * lh));
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
  }, ws), 'base64');
  for (const [f, min, what] of [BOOKS[0], BOOKS[1]]) {
    const raw = ['left', 'right'].filter((sd) => TRUTH[f].words[sd]).map((sd) => TRUTH[f].words[sd]).join(' ').split(/\s+/);
    const ref = (await pick({ name: 'clean-copy.png', mimeType: 'image/png', buffer: await cleanCopy(raw) })).cards;
    const { said, text, cards } = await pick(B(f)), truth = pages(f).flat(), right = lcs(truth, wordsOf(text)) / truth.length;
    ok(/book’s two pages were flattened/.test(said), `Photo Dictionary, ${what}: the line says the two pages were flattened (${said})`);
    ok(right >= min - 0.02, `Photo Dictionary, ${what}: the page's text holds ${(100 * right).toFixed(1)} % of its words in order`);
    const share = ref.filter((w) => cards.includes(w)).length / ref.length;
    ok(ref.length >= 20 && share >= 0.9, `Photo Dictionary, ${what}: ${Math.round(100 * share)} % of the ${ref.length} uncommon words of a clean copy of its text (missing: ${ref.filter((w) => !cards.includes(w)).slice(0, 8).join(', ')})`);
  }
  // the online look-ups are refused here (no network): their failed loads are no fault of the page
  const real = (errs) => errs.filter((e) => !/Failed to load resource: (the server responded with a status of 404|net::ERR_INTERNET_DISCONNECTED)/.test(e));
  ok(!real(pd.errors).length, `Photo Dictionary: no page errors ${real(pd.errors).slice(0, 3).join(' | ')}`);
  info('photos: tests/fixtures/books (scripts/make-book-photos.py)');
};
