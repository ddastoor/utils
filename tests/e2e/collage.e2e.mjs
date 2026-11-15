// Collage Maker (#/collage): real photos; grid and fixed layouts; canvas sizes; spacing/background; reorder/remove.
import { imageInfo, decodeInPage, regionMeans, lum } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/collage');
  await page.locator('input[type=file]').setInputFiles(['coffee.jpg', 'chelsea.png', 'astronaut.png', 'page.png'].map(F));
  await page.waitForFunction(() => document.querySelectorAll('.collage-item').length === 4, null, { timeout: 30000 });
  const save = () => download(page, () => page.getByRole('button', { name: 'Save collage' }).click());

  // 2×2 grid, square 2048, white background with gaps
  let p = await save(), i = imageInfo(p);
  ok(i.type === 'jpeg' && i.width === 2048 && i.height === 2048, `square 2048²: ${i.width}×${i.height}`);
  let d = await decodeInPage(page, p, [[0.002, 0.002], [0.5, 0.5], [0.25, 0.25], [0.75, 0.75]]);
  ok(d.px[0].slice(0, 3).every((v) => v > 245), 'outer gap is the white background');
  ok(d.px[1].slice(0, 3).every((v) => v > 245), 'centre cross gap is white');
  ok(!d.px[2].slice(0, 3).every((v) => v > 245) && !d.px[3].slice(0, 3).every((v) => v > 240), 'cells contain photos');

  // reorder: move photo 2 (chelsea) first → top-left cell content changes
  const tl = [0.05, 0.05, 0.45, 0.45];
  const [before] = await regionMeans(page, p, [tl]);
  await page.getByRole('button', { name: 'Move photo 2 earlier' }).click();
  const [after] = await regionMeans(page, await save(), [tl]);
  ok(Math.abs(lum(after) - lum(before)) > 5 || Math.abs(after[2] - before[2]) > 5, 'reorder changes the first cell');

  // remove one → 3 photos with "1 + 2" layout
  await page.getByRole('button', { name: 'Remove photo 4' }).click();
  ok((await page.locator('.collage-item').count()) === 3, 'removed one photo');
  await page.getByRole('radio', { name: '1 + 2' }).click();
  d = await decodeInPage(page, await save(), [[0.3, 0.5], [0.8, 0.25], [0.8, 0.75], [0.6, 0.5]]);
  ok(d.px.slice(0, 3).every((px) => !px.slice(0, 3).every((v) => v > 245)), '1 + 2: big left cell and two right cells filled');
  ok(d.px[3].slice(0, 3).every((v) => v > 245), '1 + 2: vertical gap at 60%');

  // story 9:16, black background, no spacing
  await page.getByRole('radio', { name: 'Story 9:16' }).click();
  await page.locator('input[type=color]').fill('#000000');
  await page.getByRole('radio', { name: 'PNG' }).click();
  p = await save(); i = imageInfo(p);
  ok(i.type === 'png' && i.width === 1152 && i.height === 2048, `story PNG 1152×2048: ${i.width}×${i.height}`);
  d = await decodeInPage(page, p, [[0.002, 0.002]]);
  ok(d.px[0].slice(0, 3).every((v) => v < 10), 'black background');
  await page.locator('.slider', { hasText: 'Spacing' }).locator('input').fill('0');
  await page.locator('.slider', { hasText: 'Rounded corners' }).locator('input').fill('0');
  d = await decodeInPage(page, await save(), [[0.001, 0.001]]);
  ok(!d.px[0].slice(0, 3).every((v) => v < 10), 'no spacing, no rounding: photo reaches the corner');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/collage');
  await phone.locator('input[type=file]').setInputFiles(['coffee.jpg', 'chelsea.png'].map(F));
  await phone.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  ok(phone.errors.length === 0, `phone: no errors: ${phone.errors.join(' | ')}`);
};
