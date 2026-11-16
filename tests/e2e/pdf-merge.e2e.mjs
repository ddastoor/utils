// Merge PDF (#/pdf-merge): three real PDFs (one AES-256 protected → password box) → one PDF in the chosen order.
import { pdfInfo } from '../lib/pdfcheck.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/pdf-merge');
  await page.locator('input[type=file]').first().setInputFiles([P('crazyones.pdf'), P('two-different-pages.pdf'), P('aes256-asdfzxcv.pdf')]);
  const pw = page.getByPlaceholder('Password');
  await pw.waitFor();
  ok(/aes256-asdfzxcv\.pdf/.test(await page.locator('.pdf-pw').textContent()), 'protected PDF asks for its password');
  await pw.fill('nope'); await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByText('wrong password, try again').waitFor();
  ok(true, 'a wrong password is refused');
  await page.getByPlaceholder('Password').fill('asdfzxcv'); await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.pdf-row').length === 3);
  ok(/3 files, 4 pages in total/.test(await page.locator('.muted.small').filter({ hasText: 'in total' }).textContent()), 'three files, four pages listed');
  const merge = () => download(page, () => page.getByRole('button', { name: 'Merge PDFs' }).click());
  const i1 = await pdfInfo(await merge());
  ok(i1.pages === 4 && !i1.encrypted, `merged: 4 pages, no password (${i1.pages}, encrypted ${i1.encrypted})`);
  ok(/Crazy Ones/.test(i1.list[0].text) && i1.list[1].text.trim() === '1' && i1.list[2].text.trim() === '2' && /encryption test/.test(i1.list[3].text), 'pages in file order (crazyones, 1, 2, encrypted file)');
  // move the protected file to the top, remove the first original
  await page.getByRole('button', { name: 'Move aes256-asdfzxcv.pdf up' }).click();
  await page.getByRole('button', { name: 'Move aes256-asdfzxcv.pdf up' }).click();
  await page.getByRole('button', { name: 'Remove crazyones.pdf' }).click();
  const i2 = await pdfInfo(await merge());
  ok(i2.pages === 3 && /encryption test/.test(i2.list[0].text) && i2.list[1].text.trim() === '1', 'reordered and removed files are respected');
  await page.getByRole('button', { name: 'Remove two-different-pages.pdf' }).click();
  await page.getByRole('button', { name: 'Merge PDFs' }).click();
  ok(await page.getByText('Choose at least two PDFs').count() >= 1, 'needs two files');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 not really') });
  await page.waitForTimeout(500);
  ok(await page.locator('.pdf-row').count() === 1, 'a broken file is rejected with a message');
  // expected: our own validation message, and MuPDF's warnings while it tries to repair the deliberately broken file
  const real = page.errors.filter((e) => !/Choose at least two PDFs|Not a readable PDF|broken\.pdf|syntax error|cannot|no objects found|^warning: /i.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-merge');
  await phone.locator('input[type=file]').first().setInputFiles([P('crazyones.pdf'), P('jpeg.pdf')]);
  await phone.waitForFunction(() => document.querySelectorAll('.pdf-row').length === 2);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
