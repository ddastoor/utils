// PDF Page Numbers (#/pdf-pagenum): styles, start number, skip cover, position — read back as text and as pixels,
// including a page with /Rotate 90 (number must sit at the visual bottom) and a protected input.
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
import { pdfInfo, renderGrey } from '../lib/pdfcheck.mjs';
import { makeLong, raceRun } from '../lib/pdfannot.mjs';
const P = (n) => fileURLToPath(new URL(`../fixtures/pdf/${n}`, import.meta.url));
export default async ({ base, page: newPage, ok, download, tmp, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/pdf-pagenum');
  const go = () => download(page, () => page.getByRole('button', { name: 'Add page numbers' }).click());
  await page.locator('input[type=file]').first().setInputFiles(P('two-different-pages.pdf'));
  await page.getByText('two-different-pages.pdf: 2 pages').waitFor();
  await page.getByRole('combobox').nth(1).selectOption('pageof');
  const f1 = await go(), i1 = await pdfInfo(f1);
  ok(/Page 1 of 2/.test(i1.list[0].text) && /Page 2 of 2/.test(i1.list[1].text), 'Page 1 of 2, Page 2 of 2');
  const g = await renderGrey(f1, 0, 1), o = await renderGrey(P('two-different-pages.pdf'), 0, 1);
  ok(g.dark(0.35, 0.94, 0.65, 0.99) > o.dark(0.35, 0.94, 0.65, 0.99) + 0.003, 'number drawn at the bottom centre');
  ok(Math.abs(g.dark(0, 0, 1, 0.9) - o.dark(0, 0, 1, 0.9)) < 0.001, 'the rest of the page is unchanged');
  // skip cover + start at 5 + top right
  await page.getByText('Skip the first page (cover)').click();
  await page.getByRole('spinbutton').fill('5');
  await page.getByRole('combobox').first().selectOption('tr');
  await page.getByRole('combobox').nth(1).selectOption('n');
  const f2 = await go(), i2 = await pdfInfo(f2), g2 = await renderGrey(f2, 1, 1);
  ok(i2.list[0].text.trim() === '1' && /(^|\s)5(\s|$)/.test(i2.list[1].text), `cover not numbered, second page is 5 (${JSON.stringify(i2.list.map((p) => p.text.trim()))})`);
  ok(g2.dark(0.8, 0.01, 0.99, 0.06) > 0.002, 'number at the top right');
  // a page rotated 90°: the number goes to the visual bottom
  const m = await import('mupdf'), d = m.Document.openDocument(readFileSync(P('crazyones.pdf')), 'application/pdf').asPDF();
  d.loadPage(0).getObject().put('Rotate', 90);
  const rot = `${tmp}/rotated.pdf`; writeFileSync(rot, d.saveToBuffer('compress').asUint8Array());
  await page.getByText('Skip the first page (cover)').click();
  await page.getByRole('combobox').first().selectOption('bc');
  await page.getByRole('spinbutton').fill('1');
  await page.getByRole('combobox').nth(1).selectOption('dash');
  await page.locator('input[type=file]').first().setInputFiles(rot);
  await page.getByText('rotated.pdf: 1 page').waitFor();
  const f3 = await go(), g3 = await renderGrey(f3, 0, 1), o3 = await renderGrey(rot, 0, 1);
  ok(g3.w > g3.h, 'rotated page renders landscape');
  ok(g3.dark(0.4, 0.93, 0.6, 0.995) > o3.dark(0.4, 0.93, 0.6, 0.995) + 0.003, 'rotated page: number at the visual bottom centre');
  ok(/1/.test((await pdfInfo(f3)).list[0].text), 'number is real text');
  // protected input → numbered output without password
  await page.locator('input[type=file]').first().setInputFiles(P('aes256-asdfzxcv.pdf'));
  await page.getByPlaceholder('Password').fill('asdfzxcv'); await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByText('aes256-asdfzxcv.pdf: 1 page').waitFor();
  const i4 = await pdfInfo(await go());
  ok(!i4.encrypted && /encryption test/.test(i4.list[0].text) && /– 1 –/.test(i4.list[0].text), 'protected PDF numbered (– 1 –), result opens without password');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  // a long PDF: progress shown; another PDF chosen during the run gets no result (it got the first one's pages under
  // its own name); leaving the tab during a run downloads nothing afterwards
  const race = await raceRun(newPage, base, '#/pdf-pagenum', 'Add page numbers', await makeLong(tmp, 900), P('crazyones.pdf'));
  ok(race.progress, 'a 900-page PDF: "Page n of 900…" while it runs');
  ok(race.afterSwitch === 0, `another PDF chosen during the run: no download (${race.afterSwitch})`);
  ok(race.afterLeave === 0, `the tab left during a run: no download afterwards (${race.afterLeave})`);
  ok(race.errors.length === 0, `no page errors in those runs: ${race.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-pagenum');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
