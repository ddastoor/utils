// Rent Receipt (#/rent): one receipt per month, three per A4 page, amount in words, PAN and revenue-stamp rules.
import { pdfDoc } from '../lib/docgen-check.mjs';
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(base + '#/rent');
  await page.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  const pdf = async () => pdfDoc(await download(page, () => page.getByRole('button', { name: 'Download PDF' }).click()));
  await page.getByLabel('From month').fill('2026-04'); await page.getByLabel('To month').fill('2027-03');
  let d = await pdf();
  ok(d.pages.length === 4 && d.pages.every((p) => (p.text.match(/RENT RECEIPT/g) || []).length === 3), `12 months → 12 receipts, 3 per page (${d.pages.map((p) => (p.text.match(/RENT RECEIPT/g) || []).length)})`);
  ok(/Receipt No\.\s*1\b/.test(d.pages[0].text) && /Receipt No\.\s*12\b/.test(d.pages[3].text), 'numbered 1–12');
  ok(/01\/04\/2026 to 30\/04\/2026/.test(d.text) && /01\/02\/2027 to 28\/02\/2027/.test(d.text) && /31\/03\/2027/.test(d.text), 'each month’s exact period (February has 28 days)');
  ok(/Rupees Twenty-Five Thousand Only/.test(d.text.replace(/\s+/g, ' ')), 'amount in words');
  ok(await page.getByText('will ask for the landlord’s PAN').count() === 1, '₹3 lakh a year without PAN: warning');
  await page.getByLabel('Landlord PAN').fill('abcde1234f');
  ok(await page.getByText('will ask for the landlord’s PAN').count() === 0, 'warning gone once the PAN is given');
  await page.getByRole('radio', { name: 'Cash' }).click();
  await page.getByLabel('To month').fill('2026-05');
  d = await pdf();
  ok(d.pages.length === 1 && /PAN: ABCDE1234F/.test(d.text) && /Revenue/.test(d.text) && /Cash/.test(d.text), 'cash above ₹5,000: revenue stamp box; PAN printed');
  await page.getByRole('radio', { name: 'First day' }).click();
  d = await pdf();
  ok(/Date: 01\/05\/2026/.test(d.text), 'receipt dated on the first day');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/rent');
  await phone.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
