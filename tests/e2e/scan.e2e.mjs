// QR & Barcode Scanner (#/scan): image upload (one code, two codes in one picture, a photo with none), duplicates
// shown once, "Open link" for URLs, copy, and the live camera path with a camera that shows a QR code (getUserMedia
// replaced by a canvas stream), Stop releasing the camera.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const FLOWER = new URL('../fixtures/images/flower.jpg', import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, tmp, devices }) => {
  // make two QR codes with the QR tab
  const g = await newPage(); await g.goto(`${base}#/qr`); await g.locator('.code-preview svg').waitFor();
  const make = async (t) => { await g.getByLabel('Link or text', { exact: true }).fill(t); await g.getByLabel('Link or text', { exact: true }).dispatchEvent('input'); await g.waitForTimeout(200); return download(g, () => g.locator('.actions').getByRole('button', { name: 'PNG' }).click()); };
  const q1 = await make('https://example.com/menu'), q2 = await make('Table 7 · order 1234');
  // a picture with both codes side by side
  const both = await g.evaluate(async ([a, b]) => { const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; }); const [x, y] = await Promise.all([load(a), load(b)]); const c = document.createElement('canvas'); c.width = x.width + y.width + 120; c.height = Math.max(x.height, y.height) + 80; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(x, 40, 40); ctx.drawImage(y, x.width + 80, 40); return c.toDataURL('image/png').split(',')[1]; }, [`data:image/png;base64,${readFileSync(q1).toString('base64')}`, `data:image/png;base64,${readFileSync(q2).toString('base64')}`]);
  const bothF = join(tmp, 'two-codes.png'); writeFileSync(bothF, Buffer.from(both, 'base64'));
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/scan`);
  const texts = () => page.$$eval('.scan-text', (t) => t.map((e) => e.textContent));
  await page.locator('input[type=file]').setInputFiles(q1); await page.locator('.scan-text').first().waitFor();
  ok((await texts()).join() === 'https://example.com/menu', 'one QR from an image');
  ok(await page.locator('a', { hasText: 'Open link' }).getAttribute('href') === 'https://example.com/menu' && await page.locator('a', { hasText: 'Open link' }).getAttribute('rel') === 'noopener noreferrer', '"Open link" for URLs (noopener)');
  await page.locator('input[type=file]').setInputFiles(q1); await page.waitForTimeout(800);
  ok((await texts()).length === 1, 'the same code is listed once');
  await page.locator('input[type=file]').setInputFiles(bothF); await page.waitForFunction(() => document.querySelectorAll('.scan-text').length >= 2);
  ok((await texts()).sort().join(' | ') === 'Table 7 · order 1234 | https://example.com/menu', 'two codes in one picture');
  await page.locator('.card').filter({ hasText: 'Table 7' }).getByRole('button', { name: 'Copy' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'Table 7 · order 1234', 'copy');
  await page.locator('input[type=file]').setInputFiles(FLOWER); await page.getByText('No code found in that image.').waitFor();
  ok(true, 'photo without a code → "No code found"');
  // live camera: a fake camera that shows the second QR code
  const cam = await newPage();
  await cam.addInitScript((b64) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const ctx = c.getContext('2d');
      const draw = () => { ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, 1280, 720); ctx.drawImage(img, 440, 160, 400, 400); };
      draw(); setInterval(draw, 100); window.__camStream = c.captureStream(15); return window.__camStream;
    };
  }, readFileSync(q2).toString('base64'));
  await cam.goto(`${base}#/scan`);
  await cam.getByRole('button', { name: 'Start camera' }).click();
  await cam.locator('.scan-text').first().waitFor({ timeout: 20000 });
  ok((await cam.$$eval('.scan-text', (t) => t.map((e) => e.textContent))).join() === 'Table 7 · order 1234', 'live camera reads the QR code');
  await cam.getByRole('button', { name: 'Stop' }).click();
  ok(await cam.evaluate(() => window.__camStream.getTracks().every((t) => t.readyState === 'ended')), 'Stop releases the camera');
  ok(!page.errors.length && !cam.errors.length && !g.errors.length, `no page errors ${[...page.errors, ...cam.errors].join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/scan`); await ph.getByRole('button', { name: 'Start camera' }).waitFor();
  ok(/back camera/.test(await ph.locator('.note').last().textContent()) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: back camera note, no horizontal scroll');
};
