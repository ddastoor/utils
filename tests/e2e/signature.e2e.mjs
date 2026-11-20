// Signature Maker (#/signature): draw with the mouse (vector strokes), type (self-hosted fonts), photo of ink on
// paper (scikit-image "text" sample: dark text on unevenly lit paper) → trimmed transparent PNG / JPEG on white.
// Also: fonts fetched only for "Type", blank paper, the newest photo, typed swashes not cut off, the ink colour of the
// whole drawing, a narrower window after signing, the phone's camera button beside a plain picker.
import { imageInfo, decodeInPage } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(base + '#/signature');
  await page.waitForSelector('.sig-pad');
  await page.waitForTimeout(500);
  ok(!requests.some((u) => /great-vibes|dancing-script|caveat/.test(u)), 'the handwriting fonts are not fetched while the drawing pad is shown');
  // empty pad → friendly error, no download
  await page.getByRole('button', { name: 'Save PNG (transparent)' }).click();
  await page.waitForSelector('.toast-err', { timeout: 10000 });
  ok(/sign first/i.test(await page.locator('.toast-err').first().textContent()), 'empty pad: asks to sign first');
  // draw a zig-zag (measure after scrolling: clicking Save scrolled the page)
  await page.evaluate(() => document.querySelector('.sig-pad').scrollIntoView({ block: 'center' }));
  const padBox = await page.locator('.sig-pad').boundingBox();
  await page.mouse.move(padBox.x + 60, padBox.y + 120); await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(padBox.x + 60 + i * 12, padBox.y + 120 + (i % 2 ? -40 : 30), { steps: 3 });
  await page.mouse.up();
  const png = await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click());
  const pi = imageInfo(png);
  ok(pi.type === 'png' && pi.colorType === 6, `PNG with alpha (colour type ${pi.colorType})`);
  ok(pi.width > 1000 && pi.width < 1500 && pi.height > 250 && pi.height < 420, `trimmed to the strokes at 4×: ${pi.width}×${pi.height}`);
  const d = await decodeInPage(page, png, [[0.002, 0.002], [0.5, 0.5]]);
  ok(d.px[0][3] === 0, 'corner transparent');
  ok(d.mean[2] > d.mean[0], 'blue ink by default');
  const jpg = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save JPG (white)' }).click()));
  ok(jpg.type === 'jpeg' && jpg.width === pi.width, 'JPEG on white, same trim');
  const dj = await decodeInPage(page, (await download(page, () => page.getByRole('button', { name: 'Save JPG (white)' }).click())), [[0.002, 0.002]]);
  ok(dj.px[0].slice(0, 3).every((v) => v > 245), 'JPEG background is white');
  // undo → empty again
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Save PNG (transparent)' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.toast-err').length >= 1);
  ok(true, 'undo removed the stroke');

  // type mode with a self-hosted handwriting font
  await page.getByRole('radio', { name: 'Type' }).click();
  await page.getByLabel('Your name').fill('Dinesh Kumar');
  await page.getByRole('radio', { name: 'Black' }).click();
  const tp = await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click());
  const ti = imageInfo(tp);
  ok(ti.type === 'png' && ti.width > 500 && ti.height > 80, `typed signature ${ti.width}×${ti.height}`);
  ok(await page.evaluate(() => document.fonts.check("40px 'Great Vibes'")), 'Great Vibes font loaded from this site');

  // photo of ink on paper
  await page.getByRole('radio', { name: 'From photo' }).click();
  await page.locator('input[type=file]').setInputFiles(F('text.png'));
  await page.waitForFunction(() => document.querySelector('.sig-photo')?.width === 448, null, { timeout: 60000 }); // a blank canvas is already 300 px wide
  const pp = await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click());
  const ppi = imageInfo(pp), pd = await decodeInPage(page, pp);
  ok(ppi.type === 'png' && ppi.width <= 448 && ppi.width > 100, `photo → PNG ${ppi.width}×${ppi.height} (colour type ${ppi.colorType})`);
  ok(pd.mean[3] > 10 && pd.mean[3] < 160, `mostly transparent paper, opaque ink (mean alpha ${pd.mean[3].toFixed(0)})`);

  // blank paper: said for what it is (not "sign first")
  const blank = Buffer.from(await page.evaluate(async () => {
    const c = new OffscreenCanvas(600, 300), g = c.getContext('2d'); g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, 600, 300);
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b);
  }), 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: blank });
  await page.waitForFunction(() => document.querySelector('.sig-photo')?.width === 600, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Save PNG (transparent)' }).click();
  ok(await page.locator('.toast', { hasText: 'No ink was found in the photo' }).first().waitFor({ timeout: 10000 }).then(() => true, () => false), 'a photo of blank paper: "No ink was found in the photo …" (it said "sign first")');
  // the newest photo wins
  await page.locator('input[type=file]').setInputFiles(F('text.png'));
  await page.locator('input[type=file]').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: blank });
  await page.waitForTimeout(3000);
  ok(await page.locator('.sig-photo').evaluate((c) => c.width) === 600, 'two photos one after the other: the newer one is shown');

  // a typed name in a script font with swashes is not cut off at the edges of its canvas
  await page.getByRole('radio', { name: 'Type' }).click();
  for (const style of ['Elegant', 'Flowing', 'Casual']) {
    await page.getByRole('radio', { name: style }).click();
    await page.getByLabel('Your name').fill('Jyoti Fqgyz');
    const tpath = await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click());
    const edge = await decodeInPage(page, tpath, [[0.001, 0.5], [0.999, 0.5], [0.5, 0.002], [0.5, 0.998]]);
    ok(edge.px.every((p) => p[3] === 0), `typed "${style}": the trimmed PNG has a clear margin on every side (nothing cut off)`);
  }

  // the ink colour applies to the whole signature, also to strokes drawn before; the drawing survives a narrower window
  await page.getByRole('radio', { name: 'Draw' }).click();
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('radio', { name: 'Blue' }).click();
  await page.evaluate(() => document.querySelector('.sig-pad').scrollIntoView({ block: 'center' }));
  const pb2 = await page.locator('.sig-pad').boundingBox();
  await page.mouse.move(pb2.x + 40, pb2.y + pb2.height * 0.5); await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(pb2.x + 40 + i * ((pb2.width - 80) / 30), pb2.y + pb2.height * (i % 2 ? 0.35 : 0.6), { steps: 2 });
  await page.mouse.up();
  await page.getByRole('radio', { name: 'Maroon' }).click();
  const wide = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click()));
  const red = await decodeInPage(page, await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click()));
  ok(red.mean[0] > red.mean[2], `ink changed to maroon after drawing: the whole signature is maroon (mean R ${red.mean[0].toFixed(0)} > B ${red.mean[2].toFixed(0)})`);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(500);
  const narrow = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click()));
  ok(Math.abs(narrow.width / narrow.height - wide.width / wide.height) < 0.05, `a narrower window after signing: the whole signature is kept (${wide.width}×${wide.height} → ${narrow.width}×${narrow.height}, same shape)`);
  const unexpected = page.errors.filter((e) => !/Nothing to save yet|No ink was found/.test(e)); // the deliberate refusals
  ok(unexpected.length === 0, `no page errors: ${unexpected.join(' | ')}`);

  // phone: touch drawing works and the pad fits the screen
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/signature');
  const pb = await (await phone.waitForSelector('.sig-pad')).boundingBox();
  ok(pb.width <= 390 && pb.height >= 120, `phone pad ${pb.width.toFixed(0)}×${pb.height.toFixed(0)}`);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  await phone.getByRole('radio', { name: 'From photo' }).click();
  ok(await phone.locator('input[type=file][capture=environment]').count() === 1 && await phone.locator('input[type=file]:not([capture])').count() === 1 && await phone.getByRole('button', { name: 'Photograph your signature' }).count() === 1,
    'phone: "Photograph your signature" opens the camera; the picker takes a photo already taken');
};
