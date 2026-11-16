// OCR (#/ocr): Tesseract (wasm) on a real scanned page (scikit-image "page") and on French / Spanish / German text
// with accents rendered in the browser; .txt download; low-confidence highlighting; phone layout.
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
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const idb = await page.evaluate(async () => (await indexedDB.databases?.())?.length ?? 0);
  ok(idb === 0, 'no IndexedDB databases created (models are not cached — stateless)');

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/ocr');
  await phone.waitForSelector('input[type=file]', { state: 'attached' });
  ok(await phone.locator('input[type=file][capture=environment]').count() === 1, 'phone: back camera');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
