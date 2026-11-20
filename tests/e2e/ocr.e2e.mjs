// OCR (#/ocr): Tesseract (wasm) on a real scanned page (scikit-image "page") and on French / Spanish / German text
// with accents rendered in the browser; .txt download; low-confidence highlighting; pictures turned (by hand and by
// themselves when they read badly); light text on dark; the newest picture wins; language data that cannot be fetched;
// phone layout with "Take a photo" and a picker that does not force the camera.
import { readFileSync } from 'node:fs';
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

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/ocr');
  await phone.waitForSelector('input[type=file]', { state: 'attached' });
  ok(await phone.locator('input[type=file][capture=environment]').count() === 1 && await phone.getByRole('button', { name: 'Take a photo' }).count() === 1, 'phone: "Take a photo" opens the back camera');
  ok(await phone.locator('input[type=file]:not([capture])').count() === 1, 'phone: the picker does not force the camera — screenshots and photos already taken can be chosen');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
