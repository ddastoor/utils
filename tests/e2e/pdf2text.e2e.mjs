// PDF → Text (#/pdf2text): known text of real PDFs, page markers, layout option, protected PDF, scanned-PDF hint.
import { writeFileSync, readFileSync } from 'node:fs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, info, download, tmp, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/pdf2text');
  const area = page.getByLabel('Extracted text');
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.waitForFunction(() => document.querySelector('textarea')?.value.length > 100);
  const t = await area.inputValue();
  ok(t.startsWith('--- Page 1 ---') && /The Crazy Ones/.test(t) && /October 14, 1998/.test(t), 'text of the page with a page marker');
  await page.getByText('Mark page breaks').click();
  ok(!(await area.inputValue()).includes('--- Page'), 'page markers can be turned off');
  await page.getByText('Keep the page layout').click();
  const lay = await area.inputValue();
  ok(/The Crazy Ones/.test(lay) && lay.split('\n').length <= t.split('\n').length + 2, 'layout mode keeps whole lines');
  const f = await download(page, () => page.getByRole('button', { name: 'Download .txt' }).click());
  ok(/crazyones\.txt$/.test(f) && /The Crazy Ones/.test(readFileSync(f, 'utf8')), '.txt download');
  await page.locator('input[type=file]').first().setInputFiles(P('aes128-asdfzxcv.pdf'));
  await page.getByPlaceholder('Password').fill('asdfzxcv'); await page.getByPlaceholder('Password').press('Enter');
  try { await page.waitForFunction(() => /encryption test/.test(document.querySelector('textarea')?.value || ''), null, { timeout: 15000 }); }
  catch (e) { info(`after password: ${JSON.stringify((await area.inputValue()).slice(0, 120))} pw boxes ${await page.locator('.pdf-pw').count()} errors ${page.errors.join(' / ')}`); throw e; }
  ok(true, 'protected PDF opened with its password (Enter key)');
  // a scanned page (image only, no text layer)
  const m = await import('mupdf'), doc = new m.PDFDocument();
  const img = doc.addImage(new m.Image(readFileSync(new URL('../fixtures/images/page.png', import.meta.url).pathname)));
  doc.insertPage(-1, doc.addPage([0, 0, 400, 500], 0, doc.addObject({ XObject: { I: img } }), 'q 400 0 0 500 0 0 cm /I Do Q'));
  const scan = `${tmp}/scan.pdf`; writeFileSync(scan, doc.saveToBuffer('compress').asUint8Array());
  await page.locator('input[type=file]').first().setInputFiles(scan);
  await page.getByText('looks like a scanned PDF').waitFor();
  ok(true, 'scanned PDF → hint to use OCR');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf2text');
  await phone.locator('input[type=file]').first().setInputFiles(P('jpeg.pdf'));
  await phone.waitForFunction(() => /A PDF with a JPEG image/.test(document.querySelector('textarea')?.value || ''));
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: text extracted, no horizontal scroll');
};
