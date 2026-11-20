// OCR (#/ocr): Tesseract (wasm) on a real scanned page (scikit-image "page") and on French / Spanish / German text
// with accents rendered in the browser; .txt download; low-confidence highlighting; pictures turned (by hand and by
// themselves when they read badly); light text on dark; the newest picture wins; language data that cannot be fetched;
// the camera (owner, 20 Nov 2026): the PC's webcam and the phone's back camera, live in the page with Snap — a stand-in
// camera shows a sentence, and what Snap takes is what is read; Switch, Cancel, a file instead, leaving the tab, a late or
// refused answer, a camera that stops by itself; phone layout with a picker that does not force the camera.
import { readFileSync } from 'node:fs';
import { fakeTextCamera, live, stopped } from './_camera.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/ocr');
  const recognise = async (file, langLabel, clean = true) => {
    await page.locator('input[type=file]').setInputFiles(file);
    await page.waitForSelector('.ed-canvas', { state: 'visible' });
    if (langLabel) await page.getByRole('radio', { name: langLabel }).click();
    const sw = page.locator('label.switch', { hasText: 'Clean up' }).locator('input');
    if ((await sw.isChecked()) !== clean) await page.locator('label.switch', { hasText: 'Clean up' }).click();
    await page.getByRole('button', { name: 'Extract text' }).click();
    await page.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
    return page.locator('.ocr-text').inputValue();
  };
  const t1 = await recognise(F('page.png'), 'English', false);
  info(`page.png → ${JSON.stringify(t1.slice(0, 120))}`);
  ok(/segmentation/i.test(t1) && /markers/i.test(t1) && /coins/i.test(t1), 'English: real scanned page read (segmentation, markers, coins)');
  const txt = readFileSync(await download(page, () => page.getByRole('button', { name: 'Download .txt' }).click()), 'utf8');
  ok(txt === t1, '.txt download equals the recognised text');

  // render a sentence as an image in the browser (system serif font, black on white)
  const render = async (s) => Buffer.from(await page.evaluate(async (s) => {
    const c = new OffscreenCanvas(1500, 160), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1500, 160); g.fillStyle = '#111'; g.font = '44px "DejaVu Serif", "Liberation Serif", serif';
    g.fillText(s, 30, 95);
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
  }, s), 'base64');
  const cases = [
    ['Français', 'Le cœur a ses raisons que la raison ne connaît point.', ['raisons', 'connaît', 'cœur']],
    ['Español', 'El niño comió una manzana en España mañana.', ['niño', 'España', 'mañana']],
    ['Deutsch', 'Die Größe der Straße über dem Fluss.', ['Größe', 'Straße', 'über']],
  ];
  for (const [label, sentence, words] of cases) {
    const got = await recognise({ name: 'line.png', mimeType: 'image/png', buffer: await render(sentence) }, label);
    const hits = words.filter((w) => got.includes(w));
    info(`${label}: ${JSON.stringify(got)}`);
    ok(hits.length >= words.length - 1, `${label}: accented words recognised (${hits.join(', ')})`);
  }
  const mixed = await recognise({ name: 'mix.png', mimeType: 'image/png', buffer: await render('Größe et raisons in English') }, 'Mixed / not sure');
  ok(/Größe/.test(mixed) && /raisons/.test(mixed), `mixed languages: ${mixed}`);

  // a picture that is sideways or upside down: tried the other ways round and read the best way
  const turnedPng = async (deg) => Buffer.from(await page.evaluate(async ([b64, deg]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const q = deg % 180 !== 0, c = new OffscreenCanvas(q ? bmp.height : bmp.width, q ? bmp.width : bmp.height), g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
  }, [readFileSync(F('page.png')).toString('base64'), deg]), 'base64');
  for (const [deg, how] of [[90, 'a quarter to the left'], [270, 'a quarter to the right'], [180, 'upside down']]) {
    const got = await recognise({ name: `turned-${deg}.png`, mimeType: 'image/png', buffer: await turnedPng(deg) }, 'English', false);
    const said = await page.locator('.ocr-text + div').textContent();
    ok(/segmentation/i.test(got) && /markers/i.test(got) && said.includes(`the picture was turned ${how}`), `page turned ${deg}°: read after turning it ${how} (${said})`);
  }
  // turning by hand: the buttons turn the picture that is read
  await page.locator('input[type=file]').setInputFiles({ name: 'by-hand.png', mimeType: 'image/png', buffer: await turnedPng(90) });
  await page.getByRole('button', { name: 'Turn the picture left' }).click();
  await page.waitForTimeout(300);
  const [cw, chh] = await page.locator('.ed-canvas').evaluate((c) => [c.width, c.height]);
  ok(cw > chh, `"Turn the picture left" turns the picture (${cw}×${chh})`);
  await page.getByRole('button', { name: 'Extract text' }).click();
  await page.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
  ok(/segmentation/i.test(await page.locator('.ocr-text').inputValue()) && !/was turned/.test(await page.locator('.ocr-text + div').textContent()), 'turned by hand: read at once, nothing more to turn');

  // a screenshot in dark mode with the clean-up on: no stray characters (the clean-up expects dark text on paper)
  const dark = Buffer.from(await page.evaluate(async () => {
    const c = new OffscreenCanvas(900, 72), g = c.getContext('2d');
    g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, 900, 72); g.fillStyle = '#e8e8e8'; g.font = '24px "DejaVu Sans", sans-serif';
    g.fillText('The quick brown fox jumps over the lazy dog near the river bank.', 10, 44);
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
  }), 'base64');
  const dk = await recognise({ name: 'dark.png', mimeType: 'image/png', buffer: dark }, 'English', true);
  ok(dk.replace(/\s+/g, ' ') === 'The quick brown fox jumps over the lazy dog near the river bank.', `light text on dark, cleaned up: exactly the sentence (${JSON.stringify(dk)})`);

  // Copy and Download with nothing read yet are refused in words
  await page.locator('input[type=file]').setInputFiles(F('coffee.jpg'));
  await page.getByRole('button', { name: 'Copy' }).click();
  ok(await page.locator('.toast', { hasText: 'There is no text yet' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'Copy with no text: "There is no text yet …"');
  ok(page.errors.filter((e) => !/There is no text yet/.test(e)).length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const idb = await page.evaluate(async () => (await indexedDB.databases?.())?.length ?? 0);
  ok(idb === 0, 'no IndexedDB databases created (models are not cached — stateless)');

  // the newest picture wins: a reading started for one picture is never shown for the next (the language data held back)
  const slow = await newPage();
  let hold = true;
  await slow.route(/eng\.traineddata/, async (r) => { while (hold) await new Promise((res) => setTimeout(res, 100)); await r.continue(); });
  await slow.goto(base + '#/ocr');
  await slow.locator('input[type=file]').setInputFiles(F('page.png'));
  await slow.getByRole('button', { name: 'Extract text' }).click();
  await slow.waitForTimeout(800);
  await slow.locator('input[type=file]').setInputFiles({ name: 'line.png', mimeType: 'image/png', buffer: await render('Le cœur a ses raisons.') });
  hold = false;
  await slow.waitForTimeout(8000);
  ok(await slow.locator('.ocr-text').inputValue() === '' && !/words/.test(await slow.locator('.ocr-text + div').textContent()), 'a new picture while the old one was being read: the old reading is not shown');
  await slow.getByRole('button', { name: 'Extract text' }).click();
  await slow.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
  ok(/raisons/.test(await slow.locator('.ocr-text').inputValue()), 'the new picture is read when asked');
  ok(slow.errors.length === 0, `no page errors: ${slow.errors.join(' | ')}`);

  // the language data cannot be fetched: said in words, the button is free again, the next try works
  const broken = await newPage();
  await broken.route(/eng\.traineddata/, (r) => r.abort());
  await broken.goto(base + '#/ocr');
  await broken.locator('input[type=file]').setInputFiles(F('page.png'));
  await broken.getByRole('button', { name: 'Extract text' }).click();
  ok(await broken.locator('.toast', { hasText: 'could not be fetched' }).first().waitFor({ timeout: 30000 }).then(() => true, () => false), 'the language data cannot be fetched: "The text engine or its language data could not be fetched …" (it was stuck at "Loading the text engine…" for ever)');
  await broken.unroute(/eng\.traineddata/);
  await broken.getByRole('button', { name: 'Extract text' }).click({ timeout: 5000 });
  await broken.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
  ok(/segmentation/i.test(await broken.locator('.ocr-text').inputValue()), 'the next try loads the engine afresh and reads the page');
  ok(broken.errors.filter((e) => !/could not be fetched/.test(e)).length === 0, `no uncaught errors (Tesseract.js threw "Failed to fetch" from its message handler): ${broken.errors.join(' | ')}`);

  // ------------------------------------------------------------- the camera: the PC's webcam, the phone's back camera
  // the stand-in camera (tests/e2e/_camera.mjs) shows a sentence: what Snap takes is what "Extract text" reads
  const readIt = async (p) => {
    await p.getByRole('button', { name: 'Extract text' }).click();
    await p.waitForFunction(() => /confidence|No text found/.test(document.querySelector('.ocr-text')?.parentElement?.textContent || ''), null, { timeout: 120000 });
    return p.locator('.ocr-text').inputValue();
  };
  const cam = await newPage();
  await cam.addInitScript(fakeTextCamera);
  await cam.goto(base + '#/ocr');
  const useCam = cam.getByRole('button', { name: 'Use webcam' });
  await useCam.waitFor();
  ok(await cam.locator('input[type=file]').count() === 1 && await cam.locator('input[type=file][capture]').count() === 0, 'PC: "Use webcam" beside the picker');
  await useCam.click();
  await live(cam);
  const c0 = (await cam.evaluate(() => window.__gumCalls))[0];
  ok(c0.audio === false && c0.video && !('facingMode' in c0.video) && !('deviceId' in c0.video) && c0.video.width?.ideal === 3840 && c0.video.height?.ideal === 2160,
    `PC: the default webcam is asked for, at up to 4K, without sound (${JSON.stringify(c0)})`);
  ok(await cam.getByRole('button', { name: 'Switch camera' }).isVisible(), 'two webcams: "Switch camera" is offered');
  ok(await cam.locator('.live-cam-video').evaluate((v) => getComputedStyle(v).transform === 'none' && getComputedStyle(v).objectFit === 'contain'), 'the live view is the whole picture and not mirrored (text reads the right way)');
  await cam.getByRole('button', { name: 'Snap' }).click();
  await cam.waitForSelector('.ed-canvas', { state: 'visible' });
  ok(await stopped(cam) && await cam.locator('.live-cam').isHidden() && await useCam.isVisible(), 'Snap: the camera is closed (its track stopped) and the photo is in the editor');
  const [ew, eh] = await cam.locator('.ed-canvas').evaluate((c) => [c.width, c.height]);
  ok(ew === 1280 && eh === 720, `the photo is the camera's whole frame (${ew}×${eh})`);
  ok(/Choose another photo/.test(await cam.locator('.drop').first().textContent()), 'the drop zone makes room once a photo is taken ("Choose another photo")');
  const snapped = await readIt(cam);
  ok(/webcam reads this sentence well/.test(snapped), `the photo from the webcam is read: ${JSON.stringify(snapped)}`);
  const camTxt = await download(cam, () => cam.getByRole('button', { name: 'Download .txt' }).click());
  ok(/camera-\d{8}-\d{6}(-\d+)?\.txt$/.test(camTxt) && readFileSync(camTxt, 'utf8') === snapped, `its text downloads under the photo's name, as a phone names photos (${camTxt.split('/').pop()})`);
  // Switch: the other webcam; the photo comes from it
  await useCam.click();
  await live(cam);
  ok(await cam.locator('.ed-canvas').isVisible() && await cam.evaluate(() => document.documentElement.classList.contains('cam-open')), 'while the camera is open the last photo stays below it (html.cam-open: on phones the fixed bar steps aside)');
  await cam.getByRole('button', { name: 'Switch camera' }).click();
  await cam.waitForFunction(() => window.__gumCalls.length === 3, null, { timeout: 15000 });
  await live(cam);
  const c2 = (await cam.evaluate(() => window.__gumCalls))[2];
  ok(c2.video.deviceId?.exact === 'cam-b' && await cam.evaluate(() => window.__tracks[1].readyState === 'ended' && window.__tracks[2].readyState === 'live'),
    `"Switch camera" opens the other webcam (${JSON.stringify(c2.video.deviceId)}) and closes the first`);
  await cam.getByRole('button', { name: 'Snap' }).click();
  await cam.waitForSelector('.ed-canvas', { state: 'visible' });
  const second = await readIt(cam);
  ok(/second camera shows this line/.test(second), `the photo comes from the camera switched to: ${JSON.stringify(second)}`);
  // Cancel: the camera closes, the last photo and its text are still there
  await useCam.click();
  await live(cam);
  ok((await cam.evaluate(() => window.__gumCalls.at(-1))).video.deviceId?.exact === 'cam-b', 'the camera opens again with the webcam switched to');
  await cam.getByRole('button', { name: 'Cancel' }).click();
  ok(await stopped(cam) && await cam.locator('.live-cam').isHidden() && await cam.locator('.ed-canvas').isVisible() && /second camera/.test(await cam.locator('.ocr-text').inputValue()),
    'Cancel: the camera is closed, the last photo and its text are still there');
  // a file chosen while the camera is open: the camera closes and the file is shown
  await useCam.click();
  await live(cam);
  await cam.locator('input[type=file]').setInputFiles(F('page.png'));
  // (the camera closes as the file is chosen, the picture changes once the file is read: wait for the file's 384 × 191)
  await cam.waitForFunction(() => { const c = document.querySelector('.ed-canvas'); return document.querySelector('.live-cam').hidden && c.width === 384 && c.height === 191; }, null, { timeout: 10000 }).catch(() => {});
  ok(await stopped(cam) && await cam.locator('.ocr-text').inputValue() === '' && await cam.locator('.ed-canvas').evaluate((c) => c.width === 384 && c.height === 191),
    'a file chosen while the camera is open: the camera is closed and the file is the picture');
  // the camera stops by itself (unplugged, taken by another app): said, and closed
  await useCam.click();
  await live(cam);
  await cam.evaluate(() => window.__tracks.at(-1).dispatchEvent(new Event('ended')));
  ok(await cam.locator('.toast', { hasText: 'The camera stopped' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false) && await cam.locator('.live-cam').isHidden() && await useCam.isVisible(),
    'a camera that stops by itself: "The camera stopped — it was unplugged, or another app took it." and the view closes');
  // leaving the tab with the camera open closes it
  await useCam.click();
  await live(cam);
  await cam.evaluate(() => { location.hash = '#/'; }); await cam.locator('.tile').first().waitFor();
  ok(await stopped(cam), 'leaving the tab with the camera open: the camera is closed');
  // an answer that comes after the person has moved on (the permission question still open): stopped at once
  await cam.evaluate(() => { location.hash = '#/ocr'; window.__gumDelay = 1500; });
  await useCam.click();
  await cam.waitForTimeout(200);
  ok(/Asking for the camera/.test(await cam.locator('.live-cam-wrap').textContent()), 'while the browser asks the person: "Asking for the camera…"');
  await cam.evaluate(() => { location.hash = '#/'; });
  await cam.waitForTimeout(2500);
  ok(await stopped(cam), 'a camera that answers after the tab was left is stopped at once (it stayed on, unseen)');
  await cam.evaluate(() => { location.hash = '#/ocr'; });
  await useCam.click();
  await cam.waitForTimeout(200);
  await cam.locator('input[type=file]').setInputFiles(F('page.png'));
  await cam.waitForTimeout(2500);
  ok(await stopped(cam) && await cam.locator('.live-cam').isHidden() && await cam.locator('.ed-canvas').isVisible(), 'a file chosen before the camera answered: the camera is stopped when it answers and the file stays');
  // refused or missing: said with what to do instead
  await cam.evaluate(() => { window.__gumDelay = 0; window.__gumError = 'NotAllowedError'; });
  await useCam.click();
  ok(/The camera was not allowed — allow it in the browser's site settings.*choose an image instead/.test(await cam.locator('.toast').last().textContent({ timeout: 10000 })) && await useCam.isEnabled(),
    'a refused camera: said with what to do, and the button works again');
  await cam.evaluate(() => { window.__gumError = 'NotFoundError'; });
  await useCam.click();
  ok(await cam.locator('.toast', { hasText: 'No camera was found — choose an image instead.' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'no camera: "No camera was found — choose an image instead."');
  await cam.evaluate(() => { window.__gumError = undefined; window.__oneCam = true; });
  await useCam.click();
  await live(cam);
  ok(await cam.getByRole('button', { name: 'Switch camera' }).isHidden(), 'one webcam: no "Switch camera"');
  await cam.getByRole('button', { name: 'Cancel' }).click();
  ok(cam.errors.length === 0, `camera: no page errors ${cam.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.addInitScript(fakeTextCamera);
  await phone.goto(base + '#/ocr');
  await phone.waitForSelector('input[type=file]', { state: 'attached' });
  ok(await phone.locator('input[type=file]').count() === 1 && await phone.locator('input[type=file][capture]').count() === 0, 'phone: the picker does not force the camera — screenshots and photos already taken can be chosen');
  await phone.getByRole('button', { name: 'Use camera' }).click();
  await live(phone);
  ok((await phone.evaluate(() => window.__gumCalls))[0].video.facingMode?.ideal === 'environment', 'phone: "Use camera" opens the back camera');
  await phone.waitForTimeout(300);
  const lay = await phone.evaluate(() => {
    const nav = document.querySelector('.navwrap').getBoundingClientRect().bottom, box = document.querySelector('.live-cam').getBoundingClientRect();
    const btns = [...document.querySelectorAll('.live-cam-ctl > button')].map((b) => b.getBoundingClientRect());
    return { nav, boxTop: box.top, vh: innerHeight, tops: btns.map((r) => Math.round(r.top)), bottom: Math.max(...btns.map((r) => r.bottom)), minH: Math.min(...btns.map((r) => r.height)), snapW: btns[0].width };
  });
  ok(lay.boxTop >= lay.nav - 1 && lay.bottom <= lay.vh, `phone: the whole camera view and its buttons are on the screen, below the tab rows (${JSON.stringify(lay)})`);
  ok(new Set(lay.tops).size === 1 && lay.minH >= 44 && lay.snapW > 150, 'phone: Snap, Switch and Cancel on one line, at least 44 px tall, Snap the widest');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll with the camera open');
  await phone.getByRole('button', { name: 'Switch camera' }).click();
  await phone.waitForFunction(() => window.__gumCalls.length === 2, null, { timeout: 15000 });
  await live(phone);
  ok((await phone.evaluate(() => window.__gumCalls))[1].video.facingMode?.ideal === 'user' && await phone.evaluate(() => window.__tracks[0].readyState === 'ended'), 'phone: "Switch camera" turns to the front camera (the back one closed first — an iPhone cannot hold both)');
  await phone.getByRole('button', { name: 'Switch camera' }).click();
  await phone.waitForFunction(() => window.__gumCalls.length === 3, null, { timeout: 15000 });
  await live(phone);
  await phone.getByRole('button', { name: 'Snap' }).click();
  await phone.waitForSelector('.ed-canvas', { state: 'visible' });
  ok((await phone.evaluate(() => window.__gumCalls))[2].video.facingMode?.ideal === 'environment' && await stopped(phone), 'phone: back to the back camera, Snap closes it');
  ok(await phone.evaluate(() => document.querySelector('.ed-canvas').closest('.card').getBoundingClientRect().top >= document.querySelector('.navwrap').getBoundingClientRect().bottom - 1),
    'phone: after Snap the photo is in view, not under the tab rows');
  ok(/webcam reads this sentence well/.test(await readIt(phone)), 'phone: the photo is read');
  // the fixed "Extract text" bar steps aside while the camera is open (it would cover Snap) and comes back after
  await phone.getByRole('button', { name: 'Use camera' }).click();
  await live(phone);
  const barHidden = await phone.evaluate(() => getComputedStyle(document.querySelector('.actions')).display === 'none');
  await phone.locator('.live-cam-ctl').getByRole('button', { name: 'Cancel' }).click();
  const barBack = await phone.evaluate(() => getComputedStyle(document.querySelector('.actions')).display !== 'none' && !document.documentElement.classList.contains('cam-open'));
  ok(barHidden && barBack, `phone: the fixed "Extract text" bar steps aside while the camera is open and comes back after (${barHidden}, ${barBack})`);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  ok(phone.errors.length === 0, `phone: no page errors ${phone.errors.join(' | ')}`);
};
