// GST Invoice (#/invoice): MuPDF-made PDF read back in Node — CGST/SGST vs IGST vs UTGST, totals and round-off from
// mathcore (integer paise), amount in words, GSTIN check, UPI QR, Bill of supply, Hindi text, save/load details.
import { readFileSync, writeFileSync } from 'node:fs';
import { pdfDoc } from '../lib/docgen-check.mjs';
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
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/invoice');
  await phone.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
