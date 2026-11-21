// QR & Barcode Scanner (#/scan): image upload (one code, two codes in one picture, a photo with none), duplicates
// shown once, "Open link" for URLs, copy, and the live camera path with a camera that shows a QR code (getUserMedia
// replaced by a canvas stream), Stop releasing the camera; Wi-Fi / UPI / contact / event codes shown field by field
// (copy the password, save the contact or event), no link for javascript:, a refused camera said in words, a second
// Start not leaving the first camera on, a pasted image scanned, Clear.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const FLOWER = fileURLToPath(new URL('../fixtures/images/flower.jpg', import.meta.url));
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
  // codes that hold more than text
  const wifiQ = await make('WIFI:T:WPA;S:Chai\\;Point 5G;P:masala\\:chai\\;123;;'), upiQ = await make('upi://pay?pa=chaipoint@okhdfcbank&pn=Chai%20Point&am=49.50&cu=INR&tn=Order%2012');
  const vcQ = await make('BEGIN:VCARD\nVERSION:3.0\nN:Iyer;Anaya;;;\nFN:Anaya Iyer\nORG:Tata Sons\\; Mumbai\nTEL;TYPE=CELL:+91 98200 12345\nEND:VCARD');
  const evQ = await make('BEGIN:VEVENT\nSUMMARY:Diwali party\nDTSTART:20261108T140000Z\nDTEND:20261108T173000Z\nLOCATION:Bandra\nEND:VEVENT'), jsQ = await make('javascript:alert(1)');
  const cardOf = (title) => page.locator('.card').filter({ has: page.locator('.card-title', { hasText: title }) }).first();
  const fieldsOf = (title) => cardOf(title).locator('.scan-fields tr').evaluateAll((rs) => Object.fromEntries(rs.map((r) => [r.querySelector('th').textContent, r.querySelector('td').textContent])));
  await page.locator('input[type=file]').setInputFiles(wifiQ); await cardOf('Wi-Fi network').waitFor();
  ok(JSON.stringify(await fieldsOf('Wi-Fi network')) === JSON.stringify({ Network: 'Chai;Point 5G', Password: 'masala:chai;123', Security: 'WPA / WPA2 / WPA3' }) && /^QR code · Wi-Fi network$/.test(await cardOf('Wi-Fi network').locator('.card-title').textContent()), `a Wi-Fi code: network, password and security, escapes undone (${JSON.stringify(await fieldsOf('Wi-Fi network'))})`);
  await cardOf('Wi-Fi network').getByRole('button', { name: 'Copy password' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'masala:chai;123', 'Copy password gives the password alone');
  await page.locator('input[type=file]').setInputFiles(upiQ); await cardOf('UPI payment').waitFor();
  ok(JSON.stringify(await fieldsOf('UPI payment')) === JSON.stringify({ 'Pay to': 'Chai Point', 'UPI ID': 'chaipoint@okhdfcbank', Amount: '₹49.50', Note: 'Order 12' }) && (await cardOf('UPI payment').locator('a', { hasText: 'Pay with a UPI app' }).getAttribute('href')).startsWith('upi://pay?pa=chaipoint@okhdfcbank'), 'a UPI code: payee, ID, amount, note, and a link for the UPI app');
  await page.locator('input[type=file]').setInputFiles(vcQ); await cardOf('Contact').waitFor();
  const vcf = await download(page, () => cardOf('Contact').getByRole('button', { name: 'Save contact (.vcf)' }).click());
  ok(/Anaya Iyer\.vcf$/.test(vcf) && /\r\nFN:Anaya Iyer\r\n/.test(readFileSync(vcf, 'utf8')) && (await fieldsOf('Contact')).Company === 'Tata Sons; Mumbai', 'a contact: fields shown, saved as "Anaya Iyer.vcf" (CRLF, as phones import it)');
  await page.locator('input[type=file]').setInputFiles(evQ); await cardOf('Calendar event').waitFor();
  const ics = await download(page, () => cardOf('Calendar event').getByRole('button', { name: 'Add to calendar (.ics)' }).click());
  ok(/Diwali party\.ics$/.test(ics) && /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/.test(readFileSync(ics, 'utf8')) && (await fieldsOf('Calendar event')).Place === 'Bandra', 'an event: shown, saved as an .ics calendar file');
  await page.locator('input[type=file]').setInputFiles(jsQ); await page.locator('.scan-text', { hasText: 'javascript:alert(1)' }).waitFor();
  ok(!(await page.locator('.card', { hasText: 'javascript:alert(1)' }).locator('a').count()), 'javascript: is shown as text, never as a link');
  // paste and Clear
  await page.getByRole('button', { name: 'Clear' }).click();
  ok(!(await page.locator('.scan-text').count()), 'Clear empties the list');
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), dt = new DataTransfer();
    dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, readFileSync(q1).toString('base64'));
  await page.locator('.scan-text').first().waitFor({ timeout: 10000 });
  ok((await texts()).join() === 'https://example.com/menu', 'a pasted screenshot is scanned (and after Clear the same code shows again)');
  // the camera: refused, and a second Start
  const deny = await newPage();
  await deny.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; });
  await deny.goto(`${base}#/scan`); await deny.getByRole('button', { name: 'Start camera' }).click();
  ok(/The camera was not allowed — allow it in the browser's site settings/.test(await deny.locator('.toast').last().textContent({ timeout: 10000 })), 'a refused camera: said in words (it was "NotAllowedError: Permission denied")');
  const twice = await newPage();
  await twice.addInitScript(() => { window.__streams = []; navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d').fillRect(0, 0, 320, 240); const s = c.captureStream(5); window.__streams.push(s); return s; }; });
  await twice.goto(`${base}#/scan`);
  await twice.getByRole('button', { name: 'Start camera' }).click(); await twice.waitForFunction(() => window.__streams.length === 1);
  await twice.getByRole('button', { name: 'Start camera' }).click(); await twice.waitForFunction(() => window.__streams.length === 2);
  ok(await twice.evaluate(() => window.__streams[0].getTracks().every((t) => t.readyState === 'ended') && window.__streams[1].getTracks().every((t) => t.readyState === 'live')), 'a second Start ends the first camera stream (it stayed on)');
  await twice.goto(`${base}#/`);
  ok(await twice.evaluate(() => window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'))), 'leaving the tab ends the camera');
  ok(!page.errors.length && !cam.errors.length && !g.errors.length && !twice.errors.length, `no page errors ${[...page.errors, ...cam.errors, ...twice.errors].join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/scan`); await ph.getByRole('button', { name: 'Start camera' }).waitFor();
  ok(/back camera/.test(await ph.locator('.note').last().textContent()) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: back camera note, no horizontal scroll');
};
