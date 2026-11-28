// "Paste image" in the OCR and the Photo Dictionary (to-do #37; owner, 27 Nov 2026: "Make both ocr app and photo dictionary
// app take images, as input, from the clipboard", "Make a paste button for ocr and photo dictionary apps on the pc too"):
// beside "Use webcam" / "Use camera" on PCs and phones; the picture read with the browser's clipboard API — the real one in
// Chromium (granted, refused) and an in-page stand-in for the answers that cannot be arranged here (an empty clipboard, a
// page without the focus, a slow answer) — reads exactly as the same picture chosen as a file (the OCR's text, the Photo
// Dictionary's words); text instead of a picture, a refusal and an empty clipboard said in words; the camera closed by a
// paste; a newer picture wins over a slow clipboard; Ctrl+V as before; no button where the browser cannot read the
// clipboard; nothing sent anywhere. Suites run side by side in one browser and share its clipboard: a real round trip that
// another suite's copy got in between is tried again.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { fakeTextCamera, live, camButton } from './_camera.mjs';

const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const PAGE = readFileSync(F('page.png')).toString('base64'), BOOK = readFileSync(F('book-page.jpg')).toString('base64');
const say = (p) => p.locator('#paste-say').textContent();

/** the clipboard's answer, stood in for in the page: { image, type } | { text } | {} (empty) | { error: [name, message] };
 *  `delay` ms before it answers */
const fakeClip = (p, spec) => p.evaluate((s) => {
  window.__clipReads = (window.__clipReads || 0);
  navigator.clipboard.read = async () => {
    window.__clipReads++;
    if (s.delay) await new Promise((r) => setTimeout(r, s.delay));
    if (s.error) throw new DOMException(s.error[1], s.error[0]);
    if (s.text !== undefined) return [{ types: ['text/plain'], getType: async () => new Blob([s.text], { type: 'text/plain' }) }];
    if (!s.image) return [];
    const bytes = Uint8Array.from(atob(s.image), (c) => c.charCodeAt(0));
    return [{ types: ['text/html', s.type], getType: async (t) => new Blob([t === s.type ? bytes : '<img>'], { type: t }) }];
  };
}, spec);
/** put a PNG on the real clipboard */
const putPng = (p, b64) => p.evaluate(async (b) => { const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]); }, b64);

export default async ({ base, page: newPage, ok, download, devices }) => {
  // ================================================================ the OCR on a PC
  const page = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const away = []; page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) away.push(r.url()); });
  await page.goto(`${base}#/ocr`);
  const paste = page.getByRole('button', { name: 'Paste image' });
  await paste.waitFor();
  const row = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Paste image'), c = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Use webcam'); return b && c && b.parentElement === c.parentElement && Math.abs(b.getBoundingClientRect().top - c.getBoundingClientRect().top) < 2; });
  ok(row, 'OCR on a PC: "Paste image" stands beside "Use webcam"');
  /** read what is open: English, clean-up as given */
  const extract = async (clean = false) => {
    await page.waitForSelector('.ed-canvas', { state: 'visible' });
    await page.waitForFunction(() => !/confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''));
    await page.getByRole('radio', { name: 'English' }).click();
    const sw = page.locator('label.switch', { hasText: 'Clean up' });
    if ((await sw.locator('input').isChecked()) !== clean) await sw.click();
    await page.getByRole('button', { name: 'Extract text' }).click();
    await page.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
    // the text read goes to the clipboard by itself (to-do #38): its write is over before the next picture is put there
    await page.waitForFunction(() => !document.querySelector('.ocr-text').value.trim() || document.querySelector('.ocr-copied').textContent !== '', null, { timeout: 10000 });
    return page.locator('.ocr-text').inputValue();
  };
  // the reference: the same picture chosen as a file
  await page.locator('input[type=file]').setInputFiles(F('page.png'));
  const fromFile = await extract();
  ok(/segmentation/i.test(fromFile) && /coins/i.test(fromFile), 'the scanned page chosen as a file reads (segmentation, coins)');
  // the real clipboard: a PNG put there, Paste image
  let fromClip = '', tries = 0;
  for (; tries < 3 && !fromClip; tries++) {
    await page.locator('.ocr-text').evaluate((e) => { e.value = ''; });
    await putPng(page, PAGE); await paste.click();
    await page.waitForFunction(() => { const s = document.querySelector('#paste-say')?.textContent || ''; return s === '' || /holds text|no picture/.test(s); }, null, { timeout: 15000 });
    if ((await say(page)) === '') fromClip = await extract();
  }
  ok(fromClip && fromClip === fromFile, `Paste image: the picture on the clipboard reads exactly as the same picture chosen as a file (${fromClip.length} characters${tries > 1 ? `; tried ${tries} times — another suite's copy came in between` : ''})`);
  const txt = await download(page, () => page.getByRole('button', { name: 'Download .txt' }).click());
  ok(/clipboard-\d{8}-\d{6}(-\d+)?\.txt$/.test(txt), `the text is saved under the pasted picture's name (${txt.split(/[\\/]/).pop()})`);
  // what else the clipboard can hold
  await fakeClip(page, { text: 'just a few words' });
  await paste.click(); await page.waitForFunction(() => /holds text/.test(document.querySelector('#paste-say')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/^The clipboard holds text, not a picture\. Copy one first: right-click a picture → Copy image, or a screenshot to the clipboard \(Windows: Win\+Shift\+S; Linux: Shift\+PrtScn/.test(await say(page)) && await page.locator('#paste-say').evaluate((e) => e.classList.contains('err-text')), `text on the clipboard: said, with how to copy a picture on a PC — "${(await say(page)).slice(0, 80)}…"`);
  ok(/segmentation/i.test(await page.locator('.ocr-text').inputValue()), '… and the picture open before stays');
  await fakeClip(page, {});
  await paste.click(); await page.waitForFunction(() => /no picture/.test(document.querySelector('#paste-say')?.textContent || ''));
  ok(/^There is no picture on the clipboard\. Copy one first/.test(await say(page)) && /file manager is pasted with Ctrl\+V/.test(await say(page)), 'an empty clipboard: said (a file copied in the file manager: Ctrl+V)');
  await fakeClip(page, { error: ['NotAllowedError', 'Document is not focused.'] });
  await paste.click(); await page.waitForFunction(() => /focus/.test(document.querySelector('#paste-say')?.textContent || ''));
  ok(/did not have the focus/.test(await say(page)), 'a page without the focus: said (it is no refusal)');
  // a newer picture wins over a slow clipboard
  await fakeClip(page, { image: PAGE, type: 'image/png', delay: 1500 });
  await paste.click();
  await page.locator('input[type=file]').setInputFiles({ name: 'newer.png', mimeType: 'image/png', buffer: readFileSync(F('page.png')) });
  await page.waitForTimeout(2000);
  ok((await say(page)) === '' && await page.evaluate(() => window.__clipReads) >= 1, 'a file chosen while the clipboard is still answering: the file is the picture, the late answer dropped');
  await extract();
  const t2 = await download(page, () => page.getByRole('button', { name: 'Download .txt' }).click());
  ok(/newer\.txt$/.test(t2), `… its name is the file's (${t2.split(/[\\/]/).pop()})`);
  ok(!away.length, `nothing was sent anywhere (${away.slice(0, 2).join(', ')})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- a paste closes the camera; the button steps aside while the camera is open
  const cam = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await cam.addInitScript(fakeTextCamera);
  await cam.goto(`${base}#/ocr`); await cam.getByRole('button', { name: 'Paste image' }).waitFor();
  await camButton(cam).first().click(); await live(cam);
  ok(await cam.getByRole('button', { name: 'Paste image' }).isHidden(), 'while the camera is open, Paste image steps aside with the camera button');
  await cam.getByRole('button', { name: 'Cancel' }).click();
  ok(await cam.getByRole('button', { name: 'Paste image' }).isVisible(), '… and comes back when it closes');
  // Ctrl+V, as before: the same picture on the clipboard
  let viaKey = false;
  for (let k = 0; k < 3 && !viaKey; k++) {
    await putPng(cam, PAGE); await cam.locator('.tool-title').click(); await cam.keyboard.press('Control+V');
    viaKey = await cam.waitForSelector('.ed-canvas', { state: 'visible', timeout: 5000 }).then(() => true, () => false);
  }
  ok(viaKey, 'Ctrl+V opens the picture on the clipboard as before');
  await camButton(cam).first().click(); await live(cam);
  // the button is hidden while the camera is open: a picture pasted (the page's paste event, as Ctrl+V gives it) closes it —
  // the button's picture takes the same way in
  await cam.evaluate((b) => { const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' })); dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }, PAGE);
  ok(await cam.waitForFunction(() => [...document.querySelectorAll('.live-cam')].every((b) => b.hidden), null, { timeout: 5000 }).then(() => true, () => false), 'a picture pasted while the camera is open closes the camera');
  ok(await cam.evaluate(() => window.__tracks.every((t) => t.readyState === 'ended')), '… and lets it go');
  ok(!cam.errors.length, `no page errors ${cam.errors.join(' | ')}`);

  // ---- refused: the browser did not give leave to read the clipboard
  const no = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-write'] });
  await no.goto(`${base}#/ocr`); await no.getByRole('button', { name: 'Paste image' }).click();
  await no.waitForFunction(() => /did not let/.test(document.querySelector('#paste-say')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/^The browser did not let the page read the clipboard\. To allow it: the icon at the left of the address bar → Site settings → Clipboard → Allow; then press Paste image again — or press Ctrl\+V, which needs no leave\.$/.test(await say(no)), `refused (Chromium's own refusal): where to allow it, and Ctrl+V — "${(await say(no)).slice(0, 70)}…"`);
  // a browser that cannot read the clipboard from a button: no button, Ctrl+V as ever
  const old = await newPage({ viewport: { width: 1366, height: 900 } });
  await old.addInitScript(() => { delete Clipboard.prototype.read; });
  await old.goto(`${base}#/ocr`); await camButton(old).first().waitFor();
  ok(!(await old.getByRole('button', { name: 'Paste image' }).count()) && /paste \(Ctrl\+V\)/.test(await old.locator('.drop').first().textContent()), 'a browser without the clipboard API: no Paste image button; the picker still says Ctrl+V');

  // ================================================================ the Photo Dictionary: a phone and a PC
  const quiet = async (p) => { for (const host of ['https://en.wiktionary.org/**', 'https://api.dictionaryapi.dev/**', 'https://en.wikipedia.org/**']) await p.route(host, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"title":"Not found."}', headers: { 'access-control-allow-origin': '*' } })); };
  const STATUS = '.pd-top [aria-live="polite"]';
  const done = (p) => p.waitForFunction((sel) => /uncommon word|No uncommon words|No text found|went wrong/.test(document.querySelector(sel)?.textContent || ''), STATUS, { timeout: 180000 });
  const words = (p) => p.locator('.pd-list .pd-card').evaluateAll((els) => els.map((e) => e.dataset.word));
  // (no leave to write: the clipboard's answers are stood in for here, and each reading would put its text on the browser's
  // clipboard, which the suites share — to-do #38, checked in ocr-copy.e2e.mjs)
  const ph = await newPage({ ...devices['iPhone 13'], permissions: ['clipboard-read'] });
  await quiet(ph); await ph.goto(`${base}#/photodict`);
  const pp = ph.getByRole('button', { name: 'Paste image' }); await pp.waitFor();
  const [b1, b2] = [await camButton(ph).first().boundingBox(), await pp.boundingBox()];
  ok(Math.abs(b1.y - b2.y) < 2 && b2.height >= 44 && b2.width >= 44, `phone: "Paste image" beside "Use camera", and it takes a finger (${Math.round(b2.width)} × ${Math.round(b2.height)} px)`);
  await ph.locator('input[type=file]').first().setInputFiles(F('book-page.jpg'));
  await done(ph); const w1 = await words(ph);
  await ph.evaluate((sel) => { document.querySelector(sel).textContent = ''; }, STATUS);
  await fakeClip(ph, { image: BOOK, type: 'image/jpeg' });
  await pp.tap(); await done(ph); const w2 = await words(ph);
  ok(w1.length > 20 && JSON.stringify(w1) === JSON.stringify(w2), `phone: a book page pasted gives the same ${w2.length} uncommon words as the photo chosen as a file`);
  await fakeClip(ph, { text: 'hello' }); await pp.tap();
  await ph.waitForFunction(() => /holds text/.test(document.querySelector('#paste-say')?.textContent || ''));
  ok(/press and hold a picture → Copy \(in Photos: Share → Copy Photo/.test(await say(ph)), 'phone (an iPhone): how to copy a picture there');
  await fakeClip(ph, { error: ['NotAllowedError', 'The request is not allowed by the user agent.'] }); await pp.tap();
  await ph.waitForFunction(() => /Safari did not paste/.test(document.querySelector('#paste-say')?.textContent || ''));
  ok(/tap “Paste” when Safari offers it/.test(await say(ph)), 'iPhone: a dismissed Paste — tap Safari\'s own "Paste" when it offers it');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no sideways scroll with the message');
  const android = await newPage({ ...devices['Pixel 7'], permissions: ['clipboard-write'] });
  await quiet(android); await android.goto(`${base}#/photodict`); await android.getByRole('button', { name: 'Paste image' }).tap();
  await android.waitForFunction(() => /did not let/.test(document.querySelector('#paste-say')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/^Chrome did not let the page read the clipboard\. To allow it: .*Site settings → Clipboard/.test(await say(android)), 'Android, refused: where to allow it in Chrome');
  const pc = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read'] });
  await quiet(pc); await pc.goto(`${base}#/photodict`); await pc.getByRole('button', { name: 'Paste image' }).waitFor();
  ok(await pc.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Paste image'), c = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Use webcam'); return b && c && b.parentElement === c.parentElement; }), 'Photo Dictionary on a PC: "Paste image" beside "Use webcam" (owner: "on the pc too")');
  await fakeClip(pc, { image: BOOK, type: 'image/jpeg' }); await pc.getByRole('button', { name: 'Paste image' }).click(); await done(pc);
  ok(JSON.stringify(await words(pc)) === JSON.stringify(w1), 'PC: the pasted page gives the same words');
  // (the dictionaries' "no such word" answers that quiet() gives are 404s, which the browser logs as failed loads)
  const errs = [ph, android, pc, old, no].flatMap((p) => p.errors).filter((e) => !/Failed to load resource: the server responded with a status of 404/.test(e));
  ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
};
