// Text on Image (#/caption): meme text (bundled Anton font), caption style with band, wrapping, formats.
import { imageInfo, regionMeans, lum } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/caption');
  await page.locator('input[type=file]').setInputFiles(F('coffee.jpg'));
  await page.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  const save = () => download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  const TOP = [0.05, 0.03, 0.95, 0.16], BOT = [0.05, 0.84, 0.95, 0.97], MID = [0.3, 0.4, 0.7, 0.6];
  const orig = await regionMeans(page, F('coffee.jpg'), [TOP, BOT, MID]);
  const fontOk = await page.evaluate(() => document.fonts.check('40px Anton'));
  ok(fontOk, 'Anton font (self-hosted) loaded');

  // default meme: top + bottom text drawn, middle untouched
  const m1 = await save(); const i1 = imageInfo(m1);
  ok(i1.type === 'jpeg' && i1.width === 600 && i1.height === 400, 'JPEG 600×400');
  const [t1, b1, c1] = await regionMeans(page, m1, [TOP, BOT, MID]);
  const diff = (a, b) => Math.abs(lum(a) - lum(b));
  ok(diff(t1, orig[0]) > 5 && diff(b1, orig[1]) > 5, `top and bottom text drawn (${diff(t1, orig[0]).toFixed(1)}, ${diff(b1, orig[1]).toFixed(1)})`);
  ok(diff(c1, orig[2]) < 3, 'middle of the picture untouched');

  // clearing the top text leaves the top untouched
  await page.getByLabel('Top text').fill('');
  const [t2] = await regionMeans(page, await save(), [TOP]);
  ok(diff(t2, orig[0]) < 3, 'empty top text → top untouched');

  // long text wraps onto several lines (more of the bottom covered)
  await page.getByLabel('Bottom text').fill('this is a deliberately long caption that must wrap across several lines on a small photo');
  const tall = [0.05, 0.5, 0.95, 0.83];
  const [w1] = await regionMeans(page, await save(), [tall]);
  ok(diff(w1, (await regionMeans(page, F('coffee.jpg'), [tall]))[0]) > 4, 'long text wraps upward into the picture');

  // caption style with dark band → bottom darker
  await page.getByRole('radio', { name: 'Caption' }).click();
  await page.getByLabel('Bottom text').fill('Morning coffee ☕');
  await page.locator('label.switch', { hasText: 'Dark band' }).click();
  await page.getByRole('radio', { name: 'PNG' }).click();
  const pb = await save(); const pi = imageInfo(pb);
  ok(pi.type === 'png', 'PNG output');
  const [b3] = await regionMeans(page, pb, [[0.0, 0.9, 0.04, 0.97]]); // band edge (no text there)
  const [o3] = await regionMeans(page, F('coffee.jpg'), [[0.0, 0.9, 0.04, 0.97]]);
  ok(lum(b3) < lum(o3) - 15, `dark band behind caption (${lum(o3).toFixed(0)} → ${lum(b3).toFixed(0)})`);
  // Hindi text renders (system Devanagari font) without errors
  await page.getByLabel('Bottom text').fill('सुप्रभात');
  await save();
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/caption');
  await phone.locator('input[type=file]').setInputFiles(F('coffee.jpg'));
  await phone.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  ok(await phone.getByRole('button', { name: 'Share' }).isVisible(), 'phone: Share button');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
