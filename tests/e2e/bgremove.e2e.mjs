// Background Remover (#/bgremove): real portrait (NASA astronaut photo) → transparent PNG, colour, blur, photo backgrounds.
import { imageInfo, decodeInPage, regionMeans, lum } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/bgremove');
  await page.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
  await page.waitForFunction(() => /Done in|Could not/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 120000 });
  info(await page.locator('[aria-live="polite"].muted').first().textContent());
  const save = () => download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  // astronaut.png: face around (0.45, 0.3); flag top-left (0.1, 0.1) and shuttle right (0.85, 0.3) are background
  const pts = [[0.45, 0.3], [0.08, 0.08], [0.88, 0.25], [0.5, 0.75]];
  const p1 = await save(), i1 = imageInfo(p1);
  ok(i1.type === 'png' && i1.width === 512 && i1.height === 512, `transparent PNG at full size (${i1.width}×${i1.height})`);
  const d1 = await decodeInPage(page, p1, pts);
  info(`alpha: face ${d1.px[0][3]}, flag ${d1.px[1][3]}, shuttle ${d1.px[2][3]}, suit ${d1.px[3][3]}`);
  ok(d1.px[0][3] > 230 && d1.px[3][3] > 200, 'person kept (face and suit opaque)');
  ok(d1.px[1][3] < 30 && d1.px[2][3] < 30, 'background removed (flag and shuttle transparent)');

  await page.getByRole('radio', { name: 'Colour' }).click();
  await page.getByRole('button', { name: 'Blue' }).click();
  const p2 = await save(), d2 = await decodeInPage(page, p2, pts);
  ok(imageInfo(p2).type === 'jpeg', 'colour background saves a JPEG');
  ok(d2.px[1][2] > 180 && d2.px[1][0] < 80, `background replaced with blue (${d2.px[1].slice(0, 3)})`);
  ok(Math.abs(d2.px[0][0] - d1.px[0][0]) < 25, 'face unchanged');

  await page.getByRole('radio', { name: 'Blur' }).click();
  const p3 = await save();
  const [bgO, bgB] = [await regionMeans(page, F('astronaut.png'), [[0.02, 0.02, 0.06, 0.4]]), await regionMeans(page, p3, [[0.02, 0.02, 0.06, 0.4]])];
  ok(Math.abs(lum(bgO[0]) - lum(bgB[0])) < 60, 'blurred background keeps its colours');
  const det = await decodeInPage(page, p3, [[0.05, 0.1], [0.05, 0.12]]);
  ok(Math.abs(det.px[0][0] - det.px[1][0]) < 40, 'background is smooth (blurred)');

  await page.getByRole('radio', { name: 'Photo' }).click();
  await page.locator('input[type=file]').nth(1).setInputFiles(F('coffee.jpg'));
  await page.waitForTimeout(800);
  const p4 = await save(), d4 = await decodeInPage(page, p4, [[0.08, 0.08]]);
  ok(d4.px[0][0] > d4.px[0][2], `coffee photo behind the person (warm tones ${d4.px[0].slice(0, 3)})`);
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/bgremove');
  await phone.waitForSelector('input[type=file]', { state: 'attached' });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
