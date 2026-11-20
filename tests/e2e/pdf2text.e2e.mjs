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
  // the text is made page by page in the background: wait for the new text (an empty box passed "no markers" by itself)
  const fresh = () => page.waitForFunction(() => /The Crazy Ones/.test(document.querySelector('textarea')?.value || ''), null, { timeout: 10000 });
  await page.getByText('Mark page breaks').click();
  await fresh();
  ok(!(await area.inputValue()).includes('--- Page'), 'page markers can be turned off');
  await page.getByText('Keep the spacing and the hyphens at line ends as in the PDF').click();
  await fresh();
  const lay = await area.inputValue();
  ok(/The Crazy Ones/.test(lay) && lay.split('\n').length <= t.split('\n').length + 2, 'the spacing option keeps whole lines (it never set columns side by side, as its old label said)');
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
  // a filled form: the values typed into its fields are listed under the page (MuPDF's text leaves widgets out)
  const { makeForm } = await import('../lib/makeform.mjs');
  const m2 = await import('mupdf'), fd = m2.Document.openDocument(await makeForm(), 'application/pdf').asPDF();
  for (const w of fd.loadPage(0).getWidgets()) { if (w.getName() === 'full_name') { w.setTextValue('Asha Rao'); w.update(); } if (w.getName() === 'agree') { w.toggle(); w.update(); } }
  const formPath = `${tmp}/filled-app.pdf`; writeFileSync(formPath, fd.saveToBuffer('compress').asUint8Array());
  await page.locator('input[type=file]').first().setInputFiles(formPath);
  await page.waitForFunction(() => /Form fields:/.test(document.querySelector('textarea')?.value || ''), null, { timeout: 10000 });
  const ft = await page.locator('textarea').inputValue();
  ok(/Application form[\s\S]*Form fields:\nFull name: Asha Rao\nI agree: ticked\nReference: ABC-123/.test(ft), `a filled form: its values listed under the page (${JSON.stringify(ft.slice(0, 120))})`);
  // a long PDF: page by page with progress; a PDF chosen meanwhile wins
  const big = new m2.PDFDocument(), src2 = m2.Document.openDocument(readFileSync(P('vicksburg-ocr.pdf')), 'application/pdf').asPDF();
  for (let k = 0; k < 300; k++) big.graftPage(-1, src2, k % 6);
  const bigPath = `${tmp}/long.pdf`; writeFileSync(bigPath, big.saveToBuffer('compress').asUint8Array());
  await page.locator('input[type=file]').first().setInputFiles(bigPath);
  await page.waitForTimeout(150);
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.waitForFunction(() => /The Crazy Ones/.test(document.querySelector('textarea')?.value || ''), null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  const after = await page.locator('textarea').inputValue();
  ok(/The Crazy Ones/.test(after) && !/--- Page 2 ---/.test(after), 'a 300-page PDF replaced while it was read: only the new PDF\'s text is shown');
  // nothing to copy
  await page.locator('input[type=file]').first().setInputFiles(scan);
  await page.getByText('looks like a scanned PDF').waitFor();
  await page.getByRole('button', { name: 'Copy' }).click();
  ok(await page.locator('.toast', { hasText: 'There is no text to copy' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'Copy with no text: said');
  ok(page.errors.filter((e) => !/There is no text to copy/.test(e)).length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf2text');
  await phone.locator('input[type=file]').first().setInputFiles(P('jpeg.pdf'));
  await phone.waitForFunction(() => /A PDF with a JPEG image/.test(document.querySelector('textarea')?.value || ''));
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: text extracted, no horizontal scroll');
};
