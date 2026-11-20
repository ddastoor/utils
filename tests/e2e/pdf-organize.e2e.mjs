// Organize PDF (#/pdf-organize): thumbnails; move, rotate, delete, reset → saved PDF has exactly that order/rotation.
import { pdfInfo } from '../lib/pdfcheck.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
import { makeAnnotated, readBack } from '../lib/pdfannot.mjs';
export default async ({ base, page: newPage, ok, download, devices, tmp }) => {
  const page = await newPage();
  await page.goto(base + '#/pdf-organize');
  await page.locator('input[type=file]').first().setInputFiles(P('two-different-pages.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('.pdf-tile').length === 2);
  const drawn = await page.locator('.pdf-tile canvas').evaluateAll((cs) => cs.every((c) => c.width > 50 && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 !== 3 && v < 128)));
  ok(drawn, 'page thumbnails are rendered');
  await page.getByRole('button', { name: 'Move page 2 earlier' }).click();
  await page.getByRole('button', { name: 'Rotate page 1 right' }).click();
  ok(/was 2/.test(await page.locator('.pdf-tile').first().textContent()), 'tile shows the original page number');
  const save = () => download(page, () => page.getByRole('button', { name: 'Save PDF' }).click());
  const i1 = await pdfInfo(await save());
  ok(i1.pages === 2 && i1.list[0].text.trim() === '2' && i1.list[1].text.trim() === '1', 'pages reordered (2, 1)');
  ok(i1.list[0].rot === 90 && i1.list[1].rot === 0, `first page rotated 90° (${i1.list.map((p) => p.rot)})`);
  ok(i1.list[0].w === 842 && i1.list[0].h === 596, `rotated page is landscape (${i1.list[0].w}×${i1.list[0].h})`);
  await page.getByRole('button', { name: 'Delete page 2' }).click();
  const i2 = await pdfInfo(await save());
  ok(i2.pages === 1 && i2.list[0].text.trim() === '2', 'deleted page is gone');
  await page.getByRole('button', { name: 'Reset' }).click();
  const i3 = await pdfInfo(await save());
  ok(i3.pages === 2 && i3.list[0].text.trim() === '1' && i3.list.every((p) => p.rot === 0), 'reset restores order, rotation and deleted pages');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  // what is on the pages comes along: page 5 moved first, page 6 deleted — the link of page 3 follows page 5, the
  // comment page 1, the outline the pages (MuPDF's graftPage dropped them)
  const { annotated } = await makeAnnotated(tmp);
  await page.locator('input[type=file]').first().setInputFiles(annotated);
  await page.waitForFunction(() => document.querySelectorAll('.pdf-tile').length === 6);
  for (let k = 5; k > 1; k--) await page.getByRole('button', { name: `Move page ${k} earlier` }).click();
  await page.getByRole('button', { name: 'Delete page 6' }).click();
  const ro = await readBack(await save());
  ok(ro.pages.length === 5 && ro.pages[3].goto.join() === '0' && ro.pages[1].notes.join() === 'note A', `page 5 first: the link of (old) page 3 goes to it, the comment stays on (old) page 1 (${ro.pages[3].goto}, ${ro.pages[1].notes})`);
  ok(JSON.stringify(ro.outline) === JSON.stringify([['Start', 1], ['Chapter', 0]]), `the outline follows, the entry of the deleted page is gone (${JSON.stringify(ro.outline)})`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-organize');
  await phone.locator('input[type=file]').first().setInputFiles(P('two-different-pages.pdf'));
  await phone.waitForFunction(() => document.querySelectorAll('.pdf-tile').length === 2);
  const tb = await phone.getByRole('button', { name: 'Rotate page 1 right' }).boundingBox();
  ok(tb.height >= 40 && tb.width >= 40, `phone: page buttons are big enough to tap (${Math.round(tb.width)}×${Math.round(tb.height)})`);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
