// Passport Photo (#/passport): real portrait with a busy background (NASA photo: flag + space shuttle) → background
// replaced by each preset's required colour, framed to the head-height rule, 300 dpi, digital upload limits, sheets; a
// photo without a face after a good one shows no stale result; custom sizes checked; Cancel during the camera's
// countdown takes no photo; a refused camera said in words.
import { imageInfo, decodeInPage, regionMeans } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/passport');
  await page.waitForSelector('select[aria-label="Country and document"]');
  ok((await page.locator('select[aria-label="Country and document"]').inputValue()) === 'in-passport', 'India passport is the default');
  await page.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
  await page.waitForSelector('.checks li', { timeout: 120000 });
  const checksText = async () => page.locator('.checks').innerText();
  info(await checksText());
  ok(/head height \d/.test(await checksText()) && !(await page.locator('.checks li.bad', { hasText: 'head height' }).count()), 'head height within the India rule (31.5–36 mm)');
  const savePhoto = () => download(page, () => page.getByRole('button', { name: 'Download photo (300 dpi)' }).click());
  const corners = [[0.03, 0.03], [0.97, 0.03], [0.03, 0.5], [0.97, 0.5], [0.5, 0.02]];
  const near = (p, rgb, tol = 8) => p.slice(0, 3).every((v, i) => Math.abs(v - rgb[i]) <= tol);

  const p1 = await savePhoto(), i1 = imageInfo(p1);
  ok(i1.type === 'jpeg' && i1.width === 413 && i1.height === 531, `35×45 mm at 300 dpi = 413×531 px (${i1.width}×${i1.height})`);
  ok(i1.dpi === 300 && !i1.exif, `300 dpi in the file, no EXIF (${i1.dpi})`);
  const d1 = await decodeInPage(page, p1, [...corners, [0.5, 0.35], [0.5, 0.85]]);
  ok(d1.px.slice(0, 5).every((p) => near(p, [255, 255, 255])), `busy background (flag, shuttle) replaced by pure white: ${JSON.stringify(d1.px.slice(0, 5).map((p) => p.slice(0, 3)))}`);
  ok(d1.px[5][0] > d1.px[5][2] + 20, 'face in the middle of the photo (skin tones)');
  ok(!near(d1.px[6], [255, 255, 255], 30), 'shoulders/suit at the bottom (not background)');

  // UK: light grey, or cream
  await page.locator('select[aria-label="Country and document"]').selectOption('uk-passport');
  await page.waitForTimeout(1500);
  const d2 = await decodeInPage(page, await savePhoto(), corners);
  ok(d2.px.every((p) => near(p, [0xdc, 0xdf, 0xe2])), `UK: plain light grey (${d2.px[0].slice(0, 3)})`);
  await page.locator('.bg-chip', { hasText: 'Cream' }).click();
  await page.waitForTimeout(1500);
  const d3 = await decodeInPage(page, await savePhoto(), corners);
  ok(d3.px.every((p) => near(p, [0xf3, 0xea, 0xd7])), `UK alternative: cream (${d3.px[0].slice(0, 3)})`);

  // custom size + red
  await page.locator('select[aria-label="Country and document"]').selectOption('custom');
  await page.getByLabel('Width (mm)').fill('30'); await page.getByLabel('Height (mm)').fill('40');
  await page.locator('.bg-chip', { hasText: 'Red' }).click();
  await page.waitForTimeout(1500);
  const p4 = await savePhoto(), i4 = imageInfo(p4), d4 = await decodeInPage(page, p4, corners);
  ok(i4.width === 354 && i4.height === 472, `custom 30×40 mm = 354×472 px (${i4.width}×${i4.height})`);
  ok(d4.px.every((p) => near(p, [0xc8, 0x10, 0x2e], 10)), `red background (${d4.px[0].slice(0, 3)})`);

  // US: digital upload — square 600–1200 px, ≤ 240 KB
  await page.locator('select[aria-label="Country and document"]').selectOption('us-passport');
  await page.waitForTimeout(1500);
  const up = imageInfo(await download(page, () => page.getByRole('button', { name: 'Download for online upload' }).click()));
  ok(up.width === up.height && up.width >= 600 && up.width <= 1200 && up.size <= 240 * 1024, `US upload: ${up.width}×${up.height}, ${(up.size / 1024).toFixed(0)} KB`);
  const e = await page.locator('.checks').innerText();
  const eyes = parseFloat(/eyes ([\d.]+) mm/.exec(e)?.[1] || '0');
  ok(eyes >= 28 && eyes <= 35, `US: eyes ${eyes} mm from the bottom (rule 28–35)`);

  // print sheet + fine-tune
  const sheet = imageInfo(await download(page, () => page.getByRole('button', { name: '4×6 inch sheet' }).click()));
  ok(sheet.width === 1800 && sheet.height === 1200 && sheet.dpi === 300, `4×6 in sheet 1800×1200 @300 dpi (${sheet.width}×${sheet.height})`);
  const before = await checksText();
  await page.locator('.slider', { hasText: 'Head size' }).locator('input').fill('1.1');
  await page.waitForTimeout(500);
  ok((await checksText()) !== before, 'Head size slider re-frames the photo');
  // custom sizes that make no photo
  await page.locator('select[aria-label="Country and document"]').selectOption('custom');
  await page.getByLabel('Width (mm)').fill('0');
  ok(/The width is a size of 10 – 150 mm/.test(await page.locator('.note-err').first().textContent()), 'custom width 0 mm: said (it fell back to 35 mm without a word)');
  await page.getByLabel('Width (mm)').fill('30');
  ok(!(await page.locator('.note-err').count()), '… and the note goes when the size is right');
  // a photo without a face after a good one: the earlier person's photo is not left on screen
  await page.locator('input[type=file]').first().setInputFiles(F('page.png'));
  await page.waitForFunction(() => /No face found/.test(document.querySelector('.note-err')?.textContent || ''), null, { timeout: 60000 });
  ok(!(await page.getByRole('button', { name: 'Download photo (300 dpi)' }).isVisible()) && !(await page.locator('.pp-out').isVisible()), 'a photo without a face: said, and the previous photo with its download buttons is hidden (it stayed)');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // live camera (Chromium fake camera: a test pattern, no face) → graceful message
  const cam = await newPage();
  await cam.goto(base + '#/passport');
  await cam.getByRole('button', { name: 'Use camera' }).click();
  await cam.waitForFunction(() => document.querySelector('.pp-video')?.videoWidth > 0, null, { timeout: 15000 });
  await cam.getByRole('button', { name: 'Take photo (3 s timer)' }).click();
  ok(await cam.getByRole('button', { name: 'Take photo (3 s timer)' }).isDisabled(), 'the button is disabled during the countdown');
  await cam.waitForFunction(() => /No face found/.test(document.body.innerText), null, { timeout: 60000 });
  ok(true, 'camera capture works; a frame without a face gets a clear message');
  await cam.getByRole('button', { name: 'Use camera' }).click();
  await cam.waitForFunction(() => document.querySelector('.pp-video')?.videoWidth > 0, null, { timeout: 15000 });
  await cam.getByRole('button', { name: 'Take photo (3 s timer)' }).click();
  await cam.waitForTimeout(1200); await cam.getByRole('button', { name: 'Cancel' }).click();
  await cam.waitForTimeout(2500);
  ok(!cam.errors.length && (await cam.locator('.pp-count').textContent()) === '', `Cancel during the countdown: no photo is taken, no error (it drew a 0 × 0 frame: IndexSizeError) ${cam.errors.join(' | ')}`);
  const deny = await newPage();
  await deny.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; });
  await deny.goto(base + '#/passport'); await deny.getByRole('button', { name: 'Use camera' }).click();
  ok(/The camera was not allowed — allow it in the browser's site settings.*upload a photo instead/.test(await deny.locator('.toast').last().textContent({ timeout: 10000 })), 'a refused camera: said with what to do (it was "Camera unavailable: NotAllowedError: Permission denied")');

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/passport');
  await phone.waitForSelector('input[type=file]', { state: 'attached' });
  ok(await phone.locator('input[type=file][capture=user]').count() === 1, 'phone: front camera for selfies');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
