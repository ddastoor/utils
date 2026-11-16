// Photo & Signature Resizer (#/formphoto): exact pixels + KB ranges for Indian portals with real images:
// NASA portrait (face auto-framing), scikit-image "text" scan as a signature on paper (clean-up + padding to minimum).
import { imageInfo, decodeInPage, regionMeans, lum } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/formphoto');
  const make = () => download(page, () => page.getByRole('button', { name: 'Make & download' }).click());
  const pick = async (f) => { await page.locator('input[type=file]').setInputFiles(F(f)); await page.waitForSelector('.crop-box:not([hidden])', { timeout: 30000 }); await page.waitForTimeout(1500); };
  ok(/200 × 230 px, 20–50 KB/.test(await page.locator('body').innerText()), 'IBPS photo spec shown by default');

  // IBPS photo 200×230, 20–50 KB, framed on the face
  await pick('astronaut.png');
  let p = await make(), i = imageInfo(p);
  ok(i.type === 'jpeg' && i.width === 200 && i.height === 230, `IBPS photo 200×230 (${i.width}×${i.height})`);
  ok(i.size >= 20 * 1024 && i.size <= 50 * 1024, `IBPS photo 20–50 KB (${(i.size / 1024).toFixed(1)} KB)`);
  ok(!i.exif && i.dpi === 300, `no EXIF, 300 dpi (${i.dpi})`);
  ok(/✓ .*allowed 20–50 KB/.test(await page.locator('.checks').innerText()), 'result checklist all green');
  const [mid, top] = await regionMeans(page, p, [[0.35, 0.3, 0.65, 0.6], [0.0, 0.0, 1.0, 0.05]]);
  ok(mid[0] > mid[2] + 15, `face (skin tones) in the middle of the frame (${mid.slice(0, 3).map(Math.round)})`);

  // IBPS signature: 140×60, 10–20 KB (tiny JPEG → padded to the minimum), paper cleaned to white
  await page.getByRole('radio', { name: 'Signature' }).click();
  ok(/140 × 60 px, 10–20 KB/.test(await page.locator('body').innerText()), 'signature spec shown');
  await pick('text.png');
  p = await make(); i = imageInfo(p);
  ok(i.width === 140 && i.height === 60 && i.size >= 10 * 1024 && i.size <= 20 * 1024, `signature 140×60, ${(i.size / 1024).toFixed(1)} KB`);
  ok(/padded to the minimum/.test(await page.locator('.checks').innerText()), 'padding reported');
  const d = await decodeInPage(page, p, [[0.02, 0.05]]);
  ok(d.width === 140 && d.mean[0] > 150, 'padded JPEG decodes; mostly white paper');

  // SSC photo with DPI, then a custom edit of the size fields
  await page.locator('select').selectOption('ssc');
  await pick('astronaut.png');
  p = await make(); i = imageInfo(p);
  ok(i.width === 413 && i.height === 531 && i.dpi === 300 && i.size <= 50 * 1024 && i.size >= 20 * 1024, `SSC photo 413×531 @300 dpi, ${(i.size / 1024).toFixed(1)} KB`);
  await page.getByLabel('Width (px)').fill('300'); await page.getByLabel('Height (px)').fill('400');
  await page.getByLabel('Maximum KB').fill('15'); await page.getByLabel('Minimum KB').fill('5');
  await page.waitForTimeout(800);
  p = await make(); i = imageInfo(p);
  ok(i.width === 300 && i.height === 400 && i.size <= 15 * 1024, `custom 300×400 ≤ 15 KB (${(i.size / 1024).toFixed(1)} KB)`);
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/formphoto');
  await phone.locator('input[type=file]').setInputFiles(F('astronaut.png'));
  await phone.waitForSelector('.crop-box:not([hidden])', { timeout: 30000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
