// QR Generator (#/qr): every payload type built with the right escaping (Wi-Fi, UPI, vCard 3.0, mailto, SMSTO, tel,
// VEVENT in UTC), then saved as PNG and read back by the Scanner tab (zxing) — exact text; error-correction levels
// change the symbol size; colours; PNG size; SVG; too much data reported.
import { readFileSync } from 'node:fs';
import { scanFile } from './_scanback.mjs';
const pngSize = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage({ timezoneId: 'Asia/Kolkata' }); await page.goto(`${base}#/qr`);
  const reader = await newPage();
  const type = (v) => page.getByLabel('Type').selectOption(v);
  const fill = async (l, v) => { const el = page.getByLabel(l, { exact: true }); await el.fill(String(v)); await el.dispatchEvent('input'); };
  const roundTrip = async () => { await page.locator('.code-preview svg').waitFor(); const f = await download(page, () => page.locator('.actions').getByRole('button', { name: 'PNG' }).click()); return { f, codes: await scanFile(reader, base, f) }; };
  await page.locator('.code-preview svg').waitFor();
  let r = await roundTrip();
  ok(r.codes.length === 1 && r.codes[0].text === 'https://ddastoor.github.io/utils/' && /QR/i.test(r.codes[0].format), `default link round trip (${r.codes[0]?.format}: ${r.codes[0]?.text})`);
  ok(pngSize(readFileSync(r.f))[0] >= 1000, `PNG ~1024 px (${pngSize(readFileSync(r.f))})`);
  const cases = [
    ['wifi', async () => { await fill('Network name (SSID)', 'My;Home,Net'); await fill('Password', 'p@ss:w"rd\\1'); }, String.raw`WIFI:T:WPA;S:My\;Home\,Net;P:p@ss\:w\"rd\\1;;`, 'Wi-Fi with ; , : " \\ escaped'],
    ['wifi', async () => { await fill('Network name (SSID)', 'Guest'); await page.getByRole('radio', { name: 'Open', exact: true }).click(); await page.locator('label.switch').filter({ hasText: 'Hidden network' }).click(); }, 'WIFI:T:nopass;S:Guest;H:true;;', 'open, hidden Wi-Fi'],
    ['upi', async () => { await fill('UPI ID (e.g. name@okbank)', 'chaipoint@okhdfcbank'); await fill('Payee name', 'Chai Point'); await fill('Amount ₹ (optional)', '49.5'); await fill('Note (optional)', 'Order 12'); }, 'upi://pay?pa=chaipoint%40okhdfcbank&pn=Chai%20Point&am=49.50&cu=INR&tn=Order%2012', 'UPI payment with amount (2 decimals, INR) and note'],
    ['vcard', async () => { await fill('First name', 'Anaya'); await fill('Last name', 'Iyer'); await fill('Phone', '+91 98200 12345'); await fill('Email', 'anaya@example.com'); await fill('Company', 'Tata Sons; Mumbai, India'); }, 'BEGIN:VCARD\nVERSION:3.0\nN:Iyer;Anaya;;;\nFN:Anaya Iyer\nORG:Tata Sons\\; Mumbai\\, India\nTEL;TYPE=CELL:+91 98200 12345\nEMAIL:anaya@example.com\nEND:VCARD', 'vCard 3.0 with ; and , escaped in the company'],
    ['email', async () => { await fill('To', 'help@example.com'); await fill('Subject', 'Refund & order #7'); await fill('Message', 'Hello there'); }, 'mailto:help@example.com?subject=Refund%20%26%20order%20%237&body=Hello%20there', 'mailto with an encoded subject'],
    ['sms', async () => { await fill('Phone number', '+919820012345'); await fill('Message', 'Running late'); }, 'SMSTO:+919820012345:Running late', 'SMS'],
    ['tel', async () => { await fill('Phone number', '+91 22 2345 6789'); }, 'tel:+912223456789', 'phone call (spaces removed)'],
    ['event', async () => { await fill('Event title', 'Diwali party'); await fill('Starts', '2026-11-08T19:30'); await fill('Ends', '2026-11-08T23:00'); await fill('Location', 'Bandra'); }, 'BEGIN:VEVENT\nSUMMARY:Diwali party\nDTSTART:20261108T140000Z\nDTEND:20261108T173000Z\nLOCATION:Bandra\nEND:VEVENT', 'calendar event, IST times converted to UTC'],
  ];
  for (const [t, setup, want, why] of cases) {
    await type(t); await setup();
    r = await roundTrip();
    ok(r.codes[0]?.text === want, `${why}: ${JSON.stringify(r.codes[0]?.text)}`);
  }
  await type('url'); await fill('Link or text', 'नमस्ते SuperTools 🙏');
  r = await roundTrip(); ok(r.codes[0]?.text === 'नमस्ते SuperTools 🙏', 'Unicode text round trip');
  const modules = async () => page.locator('.code-preview svg').evaluate((s) => parseFloat(s.getAttribute('width'))); // zint SVG: width = modules × scale
  await fill('Link or text', 'https://example.com/a-fairly-long-link?with=parameters&and=more');
  const sizes = {};
  for (const [lv, name] of [['L', 'Low 7%'], ['M', 'Medium 15%'], ['Q', 'Quartile 25%'], ['H', 'High 30%']]) { await page.getByRole('radio', { name, exact: true }).click(); await page.waitForTimeout(150); sizes[lv] = await modules(); }
  ok(sizes.L < sizes.M && sizes.M <= sizes.Q && sizes.Q < sizes.H, `more error correction → larger symbol (${JSON.stringify(sizes)})`);
  r = await roundTrip(); ok(r.codes[0]?.text.startsWith('https://example.com/a-fairly'), 'level H still reads back');
  await page.locator('input[type=color]').first().evaluate((e) => { e.value = '#1d4ed8'; e.dispatchEvent(new Event('input')); });
  await page.locator('input[type=color]').nth(1).evaluate((e) => { e.value = '#fef3c7'; e.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(200);
  const svgF = await download(page, () => page.locator('.actions').getByRole('button', { name: 'SVG' }).click()), svg = readFileSync(svgF, 'utf8');
  ok(/^<svg/.test(svg.trim()) && /#1d4ed8/i.test(svg) && /#fef3c7/i.test(svg) && !/#000000/i.test(svg), 'SVG download with the chosen colours');
  r = await roundTrip(); ok(r.codes[0]?.text.startsWith('https://example.com/a-fairly'), 'dark blue on cream still scans');
  await page.locator('input[type=range]').fill('512'); await page.locator('input[type=range]').dispatchEvent('input');
  r = await roundTrip(); ok(pngSize(readFileSync(r.f))[0] <= 512 && pngSize(readFileSync(r.f))[0] > 400, `PNG size 512 (${pngSize(readFileSync(r.f))})`);
  await fill('Link or text', 'x'.repeat(5000));
  await page.waitForTimeout(300);
  ok(await page.locator('.note-warn').count() > 0 && !(await page.locator('.code-preview svg').count()), `too much data for a QR code → message (${await page.locator('.note-warn').first().textContent()})`);
  ok(!page.errors.length && !reader.errors.length, `no page errors ${[...page.errors, ...reader.errors].join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/qr`); await ph.locator('.code-preview svg').waitFor();
  const w = await ph.locator('.code-preview svg').evaluate((s) => s.getBoundingClientRect().width);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && w > 150 && w <= 390, `phone: QR fits (${w.toFixed(0)} px), no horizontal scroll`);
};
