// Split PDF (#/pdf-split): ranges → one PDF per range (zip when several), every page, every N pages, bad ranges.
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { pdfInfo } from '../lib/pdfcheck.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
import { makeAnnotated, readBack } from '../lib/pdfannot.mjs';
export default async ({ base, page: newPage, ok, download, tmp, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/pdf-split');
  await page.locator('input[type=file]').first().setInputFiles(P('two-different-pages.pdf'));
  await page.getByText('two-different-pages.pdf: 2 pages').waitFor();
  const split = () => download(page, () => page.getByRole('button', { name: 'Split', exact: true }).click());
  const unzip = (p) => Object.entries(unzipSync(new Uint8Array(readFileSync(p)))).map(([n, b]) => { const f = `${tmp}/${Date.now()}-${n}`; writeFileSync(f, b); return [n, f]; });
  await page.getByPlaceholder('e.g. 1-3, 5, 8-').fill('2');
  const one = await split(), i1 = await pdfInfo(one);
  ok(/p2\.pdf$/.test(one) && i1.pages === 1 && i1.list[0].text.trim() === '2', `one range → one PDF with page 2 (${one.split('/').pop()})`);
  await page.getByPlaceholder('e.g. 1-3, 5, 8-').fill('2, 1-2');
  const z = unzip(await split());
  ok(z.length === 2, `two ranges → zip of two PDFs (${z.map((x) => x[0]).join(', ')})`);
  const a = await pdfInfo(z.find((x) => /p2\.pdf$/.test(x[0]))[1]), b = await pdfInfo(z.find((x) => /p1-2\.pdf$/.test(x[0]))[1]);
  ok(a.pages === 1 && b.pages === 2 && b.list[0].text.trim() === '1', 'each range has the right pages');
  await page.getByPlaceholder('e.g. 1-3, 5, 8-').fill('3');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  ok(await page.getByText('outside 1–2').count() >= 1, 'out-of-range page refused with a clear message');
  await page.getByRole('radio', { name: 'Every page' }).click();
  const z2 = unzip(await split());
  ok(z2.length === 2 && (await pdfInfo(z2[0][1])).pages === 1, 'every page → one PDF per page');
  // a 5-page PDF made by merging, then every 2 pages → 3 files (2, 2, 1)
  const m = await import('mupdf'), src = m.Document.openDocument(readFileSync(P('two-different-pages.pdf')), 'application/pdf').asPDF(), out = new m.PDFDocument();
  for (let k = 0; k < 5; k++) out.graftPage(-1, src, k % 2);
  const five = `${tmp}/five.pdf`; writeFileSync(five, out.saveToBuffer('compress').asUint8Array());
  await page.locator('input[type=file]').first().setInputFiles(five);
  await page.getByText('five.pdf: 5 pages').waitFor();
  await page.getByRole('radio', { name: 'Every N pages' }).click();
  const z3 = unzip(await split()), counts = await Promise.all(z3.map(async ([, f]) => (await pdfInfo(f)).pages));
  ok(counts.sort().join(',') === '1,2,2', `every 2 pages → 2 + 2 + 1 (${counts.join(',')})`);
  const real = page.errors.filter((e) => !/is outside 1–2|Pages per file: a whole number/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  // what is on the pages comes along: pages 3–5 keep the link (p3 → p5, now p1 → p3) and the outline entries of their
  // pages; page 1 keeps its comment (MuPDF's graftPage dropped them); a filled form stays a filled form
  const { annotated, form } = await makeAnnotated(tmp);
  await page.locator('input[type=file]').first().setInputFiles(annotated);
  await page.getByText('annotated.pdf: 6 pages').waitFor();
  await page.getByRole('radio', { name: 'Ranges' }).click();
  await page.getByPlaceholder('e.g. 1-3, 5, 8-').fill('3-5, 1');
  const z4 = unzip(await split());
  const r35 = await readBack(z4.find((x) => /p3-5\.pdf$/.test(x[0]))[1]), r1 = await readBack(z4.find((x) => /p1\.pdf$/.test(x[0]))[1]);
  ok(r35.pages[0].goto.join() === '2' && JSON.stringify(r35.outline) === JSON.stringify([['Chapter', 2]]), `pages 3–5: the link of page 3 goes to page 5 (now 3), the outline keeps its entry (${r35.pages[0].goto}, ${JSON.stringify(r35.outline)})`);
  ok(r1.pages[0].notes.join() === 'note A', 'page 1: its comment is kept');
  // every N pages: a box (it was a slider of 1–50); 4 → 4 + 2 pages; 0 is refused
  await page.getByRole('radio', { name: 'Every N pages' }).click();
  await page.getByLabel('Pages per file').fill('4');
  const z5 = unzip(await split()), c5 = await Promise.all(z5.map(async ([, f]) => (await pdfInfo(f)).pages));
  ok(c5.sort().join(',') === '2,4', `every 4 pages of 6 → 4 + 2 (${c5.join(',')})`);
  await page.getByLabel('Pages per file').fill('0');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  ok(await page.locator('.toast', { hasText: 'Pages per file: a whole number, 1 or more.' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'pages per file 0: refused in words');
  await page.getByRole('radio', { name: 'Ranges' }).click();
  await page.getByPlaceholder('e.g. 1-3, 5, 8-').fill('1 3');
  const z6 = unzip(await split());
  ok(z6.map((x) => x[0]).sort().join() === 'annotated-p1.pdf,annotated-p3.pdf', `"1 3" (spaces only) → two parts (${z6.map((x) => x[0])})`);
  await page.locator('input[type=file]').first().setInputFiles(form);
  await page.getByText('filled-form.pdf: 1 page').waitFor();
  await page.getByPlaceholder('e.g. 1-3, 5, 8-').fill('1');
  const rf = await readBack(await download(page, () => page.getByRole('button', { name: 'Split', exact: true }).click()));
  ok(rf.pages[0].fields.join() === 'foo=Alice' && rf.listed === 1, `a filled form split off: still a form with its value (${rf.pages[0].fields}, ${rf.listed} listed)`);
  const late = page.errors.filter((e) => !/is outside 1–2|Pages per file: a whole number/.test(e));
  ok(late.length === 0, `no unexpected page errors after that: ${late.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-split');
  await phone.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await phone.getByText('crazyones.pdf: 1 page').waitFor();
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
