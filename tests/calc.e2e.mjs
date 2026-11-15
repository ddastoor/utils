// Calculators: known-answer checks in real Chromium.
import { preview } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await preview({ preview: { port: 4322 }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };
const bigText = async () => (await page.locator('.big-value').allTextContents()).join(' | ');
const check = async (route, re, label) => { await page.goto(base + '#/' + route); await page.waitForSelector('.big-value, .kv', { timeout: 10000 }); const t = await bigText(); ok(re.test(t), `${label}: ${t.slice(0, 120)}`); };

await check('emi', /₹21,696/, 'EMI 25L @8.5% 20y');
await check('gst', /₹1,180/, 'GST 1000 + 18%');
await check('words', /Rupees Twelve Lakh Thirty-Four Thousand Five Hundred and Sixty-Seven and Fifty Paise Only/, 'Number to words');
await check('roman', /MMXXVI/, 'Roman 2026');
await check('bmi', /23\.5/, 'BMI 170cm 68kg');
await check('sip', /₹50,45,/, 'SIP 10k @12% 15y (≈ ₹50.4 L)');
await check('fd', /₹1,41,4/, 'FD 1L @7% 5y quarterly');
await check('fuel', /₹2,450/, 'Fuel 350km 15kmpl ₹105');
await check('tip', /₹660/, 'Tip split');
await page.goto(base + '#/base'); await page.waitForSelector('input.mono');
ok((await page.locator('input.mono').nth(3).inputValue()) === 'FF', 'Base: 255 → FF');
await page.goto(base + '#/calc'); await page.waitForSelector('.calc-expr');
await page.locator('.calc-expr').fill('2^10 + sin(30)'); await page.keyboard.press('Enter');
ok((await page.locator('.calc-expr').inputValue()) === '1024.5', 'Scientific: 2^10 + sin(30°) = 1024.5');
for (const r of ['units', 'dates', 'percent', 'timezone', 'calories', 'duedate', 'gpa']) {
  await page.goto(base + '#/' + r); await page.waitForTimeout(250);
  ok(await page.locator('.note-warn').count() === 0 && await page.locator('.tool-body').innerText().then((t) => !/being built/.test(t)), `${r} renders without warnings`);
}
ok(!errs.length, 'no console errors ' + errs.join(' | '));
await browser.close(); server.httpServer.close();
process.exit(fail ? 1 : 0);
