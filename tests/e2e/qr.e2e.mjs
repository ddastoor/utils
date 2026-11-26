// QR Generator (#/qr): every payload type built with the right escaping (Wi-Fi, UPI, vCard 3.0, mailto, SMSTO, tel,
// VEVENT in UTC), then saved as PNG and read back by the Scanner tab (zxing) and by zbar (an independent decoder,
// `apt install zbar-tools`) — exact text; checks on what was typed (amounts, Wi-Fi passwords, event times, colours);
// error-correction levels change the symbol size; colours; PNG size; SVG; too much data reported.
import { readFileSync } from 'node:fs';
import { spawnSync } from '../lib/child.mjs';
import { scanFile } from './_scanback.mjs';
const hasZbar = spawnSync('sh', ['-c', 'command -v zbarimg']).status === 0;
/** zbar's reading of a PNG: the bytes of the symbol as UTF-8 (null when zbar is not installed). */
const zbar = (f) => (hasZbar ? spawnSync('zbarimg', ['--raw', '-q', '-Sbinary', f]).stdout.toString('utf8').replace(/\n$/, '') : null);
const pngSize = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage({ timezoneId: 'Asia/Kolkata' }); await page.goto(`${base}#/qr`);
  const reader = await newPage();
  const type = (v) => page.getByLabel('Type').selectOption(v);
  const fill = async (l, v) => { const el = page.getByLabel(l, { exact: true }); await el.fill(String(v)); await el.dispatchEvent('input'); };
  const roundTrip = async () => { await page.locator('.code-preview svg').waitFor(); await page.waitForTimeout(150); const f = await download(page, () => page.locator('.actions').getByRole('button', { name: 'PNG' }).click()); return { f, codes: await scanFile(reader, base, f), zbar: zbar(f) }; };
  const notes = () => page.locator('.note').allTextContents();
  const held = () => page.locator('.qr-held textarea').inputValue();
  if (!hasZbar) ok(true, 'zbar not installed — the independent reading is skipped');
  await page.locator('.code-preview svg').waitFor();
  let r = await roundTrip();
  ok(r.codes.length === 1 && r.codes[0].text === 'https://ddastoor.github.io/utils/' && /QR/i.test(r.codes[0].format), `default link round trip (${r.codes[0]?.format}: ${r.codes[0]?.text})`);
  ok(pngSize(readFileSync(r.f))[0] >= 1000, `PNG ~1024 px (${pngSize(readFileSync(r.f))})`);
  ok(/qr-code\.png$/.test(r.f) && (!hasZbar || r.zbar === 'https://ddastoor.github.io/utils/'), `saved as qr-code.png; zbar reads it too (${r.zbar})`);
  const cases = [
    ['wifi', async () => { await fill('Network name (SSID)', 'My;Home,Net'); await fill('Password', 'p@ss:w"rd\\1'); }, String.raw`WIFI:T:WPA;S:My\;Home\,Net;P:p@ss\:w\"rd\\1;;`, 'Wi-Fi with ; , : " \\ escaped'],
    ['wifi', async () => { await fill('Network name (SSID)', 'Guest'); await page.getByRole('radio', { name: 'Open', exact: true }).click(); await page.locator('label.switch').filter({ hasText: 'Hidden network' }).click(); }, 'WIFI:T:nopass;S:Guest;H:true;;', 'open, hidden Wi-Fi'],
    ['upi', async () => { await fill('UPI ID (e.g. name@okbank)', 'chaipoint@okhdfcbank'); await fill('Payee name', 'Chai Point'); await fill('Amount ₹ (optional)', '49.5'); await fill('Note (optional)', 'Order 12'); }, 'upi://pay?pa=chaipoint@okhdfcbank&pn=Chai%20Point&am=49.50&cu=INR&tn=Order%2012', 'UPI payment with amount (2 decimals, INR) and note; the @ as NPCI writes it'],
    ['upi', async () => { await fill('UPI ID (e.g. name@okbank)', 'chaipoint@okhdfcbank'); await fill('Payee name', 'Chai Point'); await fill('Amount ₹ (optional)', '₹ 1,000'); await fill('Note (optional)', 'Order 12'); }, 'upi://pay?pa=chaipoint@okhdfcbank&pn=Chai%20Point&am=1000.00&cu=INR&tn=Order%2012', 'an amount with ₹ and a digit comma (the number box dropped it without a word)'],
    ['vcard', async () => { await fill('First name', 'Anaya'); await fill('Last name', 'Iyer'); await fill('Phone', '+91 98200 12345'); await fill('Email', 'anaya@example.com'); await fill('Company', 'Tata Sons; Mumbai, India'); }, 'BEGIN:VCARD\nVERSION:3.0\nN:Iyer;Anaya;;;\nFN:Anaya Iyer\nORG:Tata Sons\\; Mumbai\\, India\nTEL;TYPE=CELL:+91 98200 12345\nEMAIL:anaya@example.com\nEND:VCARD', 'vCard 3.0 with ; and , escaped in the company'],
    ['email', async () => { await fill('To', 'help@example.com'); await fill('Subject', 'Refund & order #7'); await fill('Message', 'Hello there'); }, 'mailto:help@example.com?subject=Refund%20%26%20order%20%237&body=Hello%20there', 'mailto with an encoded subject'],
    ['sms', async () => { await fill('Phone number', '+91 98200 12345'); await fill('Message', 'Running late'); }, 'SMSTO:+919820012345:Running late', 'SMS (the number without its spaces)'],
    ['tel', async () => { await fill('Phone number', '+91 22 2345 6789'); }, 'tel:+912223456789', 'phone call (spaces removed)'],
    ['event', async () => { await fill('Event title', 'Diwali party, rooftop'); await fill('Starts', '2026-11-08T19:30'); await fill('Ends', '2026-11-08T23:00'); await fill('Location', 'Bandra; Mumbai'); }, 'BEGIN:VEVENT\nSUMMARY:Diwali party\\, rooftop\nDTSTART:20261108T140000Z\nDTEND:20261108T173000Z\nLOCATION:Bandra\\; Mumbai\nEND:VEVENT', 'calendar event, IST times converted to UTC, , and ; escaped (RFC 5545)'],
  ];
  for (const [t, setup, want, why] of cases) {
    await type(t); await setup();
    r = await roundTrip();
    ok(r.codes[0]?.text === want && await held() === want && (!hasZbar || r.zbar === want), `${why}: ${JSON.stringify(r.codes[0]?.text)} (zbar: ${JSON.stringify(r.zbar)}; "What the code holds" shows it)`);
  }
  // what was typed, checked
  await type('upi'); await fill('UPI ID (e.g. name@okbank)', 'chaipoint@okhdfcbank'); await fill('Amount ₹ (optional)', '49,50'); await page.waitForTimeout(200);
  ok((await notes()).some((n) => /The amount "49,50" is not a number of rupees/.test(n)) && !(await page.locator('.code-preview svg').count()), 'a decimal comma in an amount: said, and no code (it is not read as ₹4,950)');
  await fill('Amount ₹ (optional)', '2,50,000'); await page.waitForTimeout(200);
  ok((await notes()).some((n) => /above ₹1,00,000/.test(n)) && await page.locator('.code-preview svg').count() === 1, 'above ₹1 lakh: warned, the code is made');
  await type('wifi'); await fill('Network name (SSID)', 'Home'); await fill('Password', 'short'); await page.waitForTimeout(200);
  ok((await notes()).some((n) => /A WPA password has 8 – 63 characters; this one has 5/.test(n)), 'a WPA password of 5 characters: warned');
  await type('event'); await fill('Event title', 'Meeting'); await fill('Starts', '2026-11-08T19:30'); await fill('Ends', '2026-11-08T18:00'); await page.waitForTimeout(200);
  ok((await notes()).some((n) => /ends before it starts/.test(n)) && !(await page.locator('.code-preview svg').count()), 'an event that ends before it starts: refused');
  // the newest text wins (zxing answers asynchronously)
  await type('url'); const box = page.getByLabel('Link or text', { exact: true });
  for (const x of ['a', 'ab', 'abc', 'abcd', 'abcde-final']) { await box.fill(x); await box.dispatchEvent('input'); }
  r = await roundTrip(); ok(r.codes[0]?.text === 'abcde-final', `typing fast: the code shows the last text (${r.codes[0]?.text})`);
  await fill('Link or text', 'नमस्ते SuperTools 🙏');
  r = await roundTrip(); ok(r.codes[0]?.text === 'नमस्ते SuperTools 🙏' && (!hasZbar || r.zbar === 'नमस्ते SuperTools 🙏'), `Unicode text round trip (zbar: ${r.zbar})`);
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
  r = await roundTrip(); ok(r.codes[0]?.text.startsWith('https://example.com/a-fairly') && !(await notes()).some((n) => /contrast|light code/.test(n)), 'dark blue on cream still scans, no colour warning');
  await page.locator('input[type=color]').first().evaluate((e) => { e.value = '#ffffff'; e.dispatchEvent(new Event('input')); });
  await page.locator('input[type=color]').nth(1).evaluate((e) => { e.value = '#111111'; e.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(200);
  ok((await notes()).some((n) => /A light code on a dark background/.test(n)), 'white on near-black: warned (many phone cameras cannot read it)');
  await page.locator('input[type=color]').first().evaluate((e) => { e.value = '#1d4ed8'; e.dispatchEvent(new Event('input')); });
  await page.locator('input[type=color]').nth(1).evaluate((e) => { e.value = '#fef3c7'; e.dispatchEvent(new Event('input')); });
  await page.locator('input[type=range]').fill('512'); await page.locator('input[type=range]').dispatchEvent('input');
  r = await roundTrip(); ok(pngSize(readFileSync(r.f))[0] <= 512 && pngSize(readFileSync(r.f))[0] > 400, `PNG size 512 (${pngSize(readFileSync(r.f))})`);
  await fill('Link or text', 'x'.repeat(5000));
  await page.waitForTimeout(300);
  ok((await notes()).some((n) => /Too much for one QR code/.test(n)) && !(await page.locator('.code-preview svg').count()), `too much data for a QR code → said in words (${(await notes()).join(' | ')})`);
  ok(!page.errors.length && !reader.errors.length, `no page errors ${[...page.errors, ...reader.errors].join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/qr`); await ph.locator('.code-preview svg').waitFor();
  const w = await ph.locator('.code-preview svg').evaluate((s) => s.getBoundingClientRect().width);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && w > 150 && w <= 390, `phone: QR fits (${w.toFixed(0)} px), no horizontal scroll`);
};
