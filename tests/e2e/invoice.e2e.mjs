// GST Invoice (#/invoice): MuPDF-made PDF read back in Node — CGST/SGST vs IGST vs UTGST, totals and round-off from
// mathcore (integer paise), amount in words, GSTIN check, UPI QR, Bill of supply, Hindi text, save/load details.
import { readFileSync, writeFileSync } from 'node:fs';
import { pdfDoc, pdfQr } from '../lib/docgen-check.mjs';
export default async ({ base, page: newPage, ok, info, download, tmp, devices }) => {
  const page = await newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(base + '#/invoice');
  const status = page.locator('[aria-live="polite"].muted').first();
  await page.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  ok(await page.locator('.dg-pages canvas').count() === 1, `live preview shows the PDF (${await status.textContent()})`);
  const pdf = async () => pdfDoc(await download(page, () => page.getByRole('button', { name: 'Download PDF' }).click()));
  const gst = page.getByLabel('GSTIN').first();
  await gst.fill('27AAPFU0939F1ZW'); ok(await page.getByText('check the GSTIN').count() === 1, 'wrong GSTIN check character flagged');
  await gst.fill('27aapfu0939f1zv'); await page.getByText('✓ valid GSTIN').waitFor(); ok(await gst.inputValue() === '27AAPFU0939F1ZV', 'valid GSTIN accepted (upper-cased)');
  // two items: ₹25,000 @18 % and ₹6,000 @5 % (intra-state Maharashtra → Maharashtra)
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Description').nth(1).fill('Hosting (12 months)');
  await page.getByLabel('Rate (₹)').nth(1).fill('6000');
  await page.locator('.dg-row').nth(1).locator('select').selectOption('5');
  let d = await pdf();
  info(`invoice: ${d.pages.length} page, ${Math.round(d.bytes / 1024)} KB, fonts ${d.fonts.join(' ')}`);
  ok(/TAX INVOICE/.test(d.text) && /INV-001/.test(d.text) && /27AAPFU0939F1ZV/.test(d.text), 'title, number and GSTIN printed');
  ok(/CGST/.test(d.text) && /SGST/.test(d.text) && !/IGST/.test(d.text), 'same state: CGST + SGST');
  ok(/35,800\.00/.test(d.text) && /31,000\.00/.test(d.text) && /2,400\.00/.test(d.text), 'totals: ₹31,000 + ₹2,400 + ₹2,400 = ₹35,800');
  ok(/Rupees Thirty-Five Thousand Eight Hundred Only/.test(d.text.replace(/\s+/g, ' ')), 'amount in words');
  ok(d.fonts.some((f) => /Noto/.test(f)) && d.bytes < 150000, `Noto Sans embedded and subset (${Math.round(d.bytes / 1024)} KB)`);
  ok(/₹/.test(d.text), 'rupee sign in the text');
  // customer in Karnataka → IGST
  await page.locator('.card', { hasText: 'Bill to (customer)' }).locator('select').selectOption('29');
  d = await pdf();
  ok(/IGST/.test(d.text) && !/CGST/.test(d.text) && /Karnataka \(29\)/.test(d.text), 'other state: IGST, place of supply Karnataka');
  // both in Chandigarh (UT without legislature) → CGST + UTGST
  await page.locator('.card', { hasText: 'From (your business)' }).locator('select').selectOption('04');
  await page.locator('.card', { hasText: 'Bill to (customer)' }).locator('select').selectOption('04');
  await gst.fill('');
  d = await pdf();
  ok(/UTGST/.test(d.text) && /CGST/.test(d.text) && !/SGST/.test(d.text), 'union territory: CGST + UTGST');
  // round-off: one item ₹999.99 @18 % → ₹1,179.99 → ₹1,180.00 (+0.01)
  await page.locator('.dg-row').nth(1).getByRole('button', { name: 'Remove' }).click();
  await page.getByLabel('Rate (₹)').first().fill('999.99');
  d = await pdf();
  ok(/1,180\.00/.test(d.text) && /Round off/.test(d.text) && /0\.01/.test(d.text), 'rounded to the rupee with a round-off line');
  await page.getByText('Round the total to the nearest rupee').click();
  d = await pdf();
  ok(/1,179\.99/.test(d.text) && !/Round off/.test(d.text), 'round-off can be switched off');
  // UPI QR + bank
  await page.getByLabel('UPI ID (adds a pay-by-UPI QR code)').fill('shop@okaxis');
  d = await pdf();
  ok(d.images >= 1 && /Scan to pay with UPI/.test(d.text) && /shop@okaxis/.test(d.text), 'UPI QR code printed');
  // the code holds the UPI link as the QR tab writes it (NPCI): the @ of the UPI ID as it is — it was %40
  const qr = await pdfQr(await download(page, () => page.getByRole('button', { name: 'Download PDF' }).click()));
  if (qr === null) info('zbarimg not installed — the QR code is not read back');
  else ok(qr === 'upi://pay?pa=shop@okaxis&pn=Your%20Business%20Name&am=1179.99&cu=INR&tn=INV-001', `the QR code read back by zbar: ${qr}`);
  await page.getByLabel('UPI ID (adds a pay-by-UPI QR code)').fill('shop');
  ok(await page.getByText('does not look like a UPI ID').first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'a UPI ID that does not look like one: said under the box');
  await page.getByLabel('UPI ID (adds a pay-by-UPI QR code)').fill('shop@okaxis');
  ok(await page.getByText('does not look like a UPI ID').count() === 0, 'and the note goes when it does');
  // a due date before the invoice date
  await page.getByLabel('Due date (optional)').fill('2020-01-01');
  ok(await page.getByText('The due date is before the invoice date.').count() === 1, 'a due date before the date: said');
  await page.getByLabel('Due date (optional)').fill('');
  // the business's e-mail address is a link in the PDF
  await page.locator('.card', { hasText: 'From (your business)' }).getByLabel('Email').fill('billing@example.com');
  d = await pdf();
  ok(d.links.includes('mailto:billing@example.com'), `the e-mail address is a link (${d.links.join(' ')})`);
  // bill of supply: no GST
  await page.getByRole('radio', { name: 'Bill of Supply' }).click();
  d = await pdf();
  ok(/BILL OF SUPPLY/.test(d.text) && !/CGST|IGST|UTGST/.test(d.text) && /999\.99/.test(d.text), 'bill of supply: no GST lines');
  // Hindi customer name
  await page.getByRole('radio', { name: 'Tax Invoice' }).click();
  await page.locator('.card', { hasText: 'Bill to (customer)' }).getByLabel('Name').fill('राम कुमार');
  d = await pdf();
  ok(/राम कुमार/.test(d.text) && d.fonts.every((f) => /Noto/.test(f)), 'Hindi name printed (Noto Sans covers Devanagari)');
  // save / load details
  const jf = await download(page, () => page.getByRole('button', { name: 'Save details' }).click()), j = JSON.parse(readFileSync(jf, 'utf8'));
  ok(j.kind === 'invoice' && j.buyer.name === 'राम कुमार' && j.items[0].rate === 999.99, 'details saved to a JSON file');
  j.number = 'INV-777'; const jf2 = `${tmp}/inv.json`; writeFileSync(jf2, JSON.stringify(j));
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Load details' }).click(); await (await chooser).setFiles(jf2);
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'INV-777'));
  ok(/INV-777/.test((await pdf()).text), 'details loaded back from the file');
  // a details file with a document in a box and a thousand rows (like a pasted document, it kept the preview busy for
  // minutes): every box is cut to its limit and the rows to 100, each said, and the preview follows
  const huge = { ...j, number: 'INV-BIG', buyer: { ...j.buyer, address: 'Plot 7, Ring Road, Surat 395002. '.repeat(16000) }, items: Array.from({ length: 1000 }, (_, i) => ({ ...j.items[0], desc: `Item${i + 1} ${'x'.repeat(5000)}` })) };
  const jf3 = `${tmp}/inv-big.json`; writeFileSync(jf3, JSON.stringify(huge));
  const t0 = Date.now();
  const ch3 = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Load details' }).click(); await (await ch3).setFiles(jf3);
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'INV-BIG'), null, { timeout: 30000 });
  const buyer = page.locator('.card', { hasText: 'Bill to (customer)' });
  const lens = await page.evaluate(() => [...document.querySelectorAll('.dg-row input')].filter((i) => i.type === 'text' && /^Item\d/.test(i.value)).map((i) => i.value.length));
  ok(lens.length === 100 && lens.every((n) => n === 200), `1,000 rows of 5,000 characters → 100 rows of 200 (${lens.length} rows, longest ${Math.max(...lens)})`);
  ok(await page.getByText('Only the first 100 were kept.').isVisible() && await page.getByRole('button', { name: 'Add item' }).isDisabled(), 'the row limit is said and Add item is off');
  ok((await buyer.getByLabel('Address').inputValue()).length === 500 && await buyer.getByText('At most 500 characters — the rest is left out.').isVisible(), 'the 512 KB address is cut to 500 characters, said under the box');
  await page.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || '') && [...document.querySelectorAll('input')].some((i) => i.value === 'INV-BIG'), null, { timeout: 60000 });
  const big = await pdf(), secs = (Date.now() - t0) / 1000;
  ok(/INV-BIG/.test(big.text) && /Item100\b/.test(big.text) && !/Item101\b/.test(big.text) && secs < 45, `the PDF has the 100 rows (${big.pages.length} pages) — loaded and made in ${secs.toFixed(1)} s`);
  const ch4 = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Load details' }).click(); await (await ch4).setFiles(jf2);
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'INV-777'));
  ok(!(await page.getByText('Only the first 100 were kept.').count()) && await page.getByRole('button', { name: 'Add item' }).isEnabled(), 'loading a normal file again: no note, Add item on');
  // the logo goes into the details file and comes back from it (it was lost); a download waits for a picture being read
  await page.locator('input[type=file]').first().setInputFiles(new URL('../fixtures/images/astronaut.png', import.meta.url).pathname);
  const withLogo = await pdf();
  ok(withLogo.images >= 2, `a download straight after choosing the logo has it (${withLogo.images} pictures with the QR code)`);
  const jl = await download(page, () => page.getByRole('button', { name: 'Save details' }).click()), jj = JSON.parse(readFileSync(jl, 'utf8'));
  ok(/^data:image\/png;base64,/.test(jj.images?.logo || ''), 'the logo is in the details file');
  const fresh = await newPage({ viewport: { width: 1400, height: 1000 } });
  await fresh.goto(base + '#/invoice');
  await fresh.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  const ch2 = fresh.waitForEvent('filechooser'); await fresh.getByRole('button', { name: 'Load details' }).click(); await (await ch2).setFiles(jl);
  await fresh.getByText('logo (from the details file)').waitFor({ timeout: 10000 });
  const back = await pdfDoc(await download(fresh, () => fresh.getByRole('button', { name: 'Download PDF' }).click()));
  ok(back.images >= 2 && /INV-777/.test(back.text), `loaded in a fresh tab: the logo is back (${back.images} pictures)`);
  // leaving the tab while the preview waits: nothing after it
  await fresh.locator('.card', { hasText: 'Bill to (customer)' }).getByLabel('Name').fill('Someone else');
  await fresh.goto(base + '#/');
  await fresh.waitForTimeout(1500);
  ok(fresh.errors.length === 0, `leaving the tab mid-update: no errors (${fresh.errors.join(' | ')})`);
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/invoice');
  await phone.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
