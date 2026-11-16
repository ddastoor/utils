// Screenshot (#/screenshot, PC): share once (Chromium's fake picker), take shots now / after a delay (with the
// Document Picture-in-Picture countdown and its "Snap now" / "Cancel"), crop, PNG / JPEG / clipboard, gallery.
import { readFileSync } from 'node:fs';

export default async ({ base, page: newPage, ok, info, download }) => {
  const page = await newPage({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await page.goto(`${base}#/screenshot`);
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const png = (p) => { const b = readFileSync(p); return { sig: b.subarray(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20), size: b.length }; };
  await page.getByRole('combobox', { name: /^Delay/ }).selectOption('0');
  await page.locator('.actions').getByRole('button', { name: 'Take screenshot' }).click();
  await page.getByText(/^Captured \d+×\d+/).waitFor({ timeout: 20000 });
  const [W, H] = (/Captured (\d+)×(\d+)/.exec(await page.getByText(/^Captured/).textContent())).slice(1).map(Number);
  ok(W >= 640 && H >= 360, `captured the shared screen at full size (${W}×${H})`);
  const p1 = png(await download(page, () => btn('PNG').click()));
  ok(p1.sig === '89504e470d0a1a0a' && p1.w === W && p1.h === H, `PNG ${p1.w}×${p1.h} (${p1.size} bytes)`);
  const j = readFileSync(await download(page, () => btn('JPEG').click()));
  ok(j[0] === 0xff && j[1] === 0xd8, 'JPEG saved');
  // crop: the default box is 84 % of each side
  await page.getByText('Crop (drag the box)').click();
  const p2 = png(await download(page, () => btn('PNG').click()));
  ok(Math.abs(p2.w - W * 0.84) <= 2 && Math.abs(p2.h - H * 0.84) <= 2, `cropped PNG ${p2.w}×${p2.h}`);
  // clipboard
  await btn('Copy').click();
  await page.getByText('Copied').waitFor({ timeout: 5000 });
  const clip = await page.evaluate(async () => { const items = await navigator.clipboard.read(); return items.flatMap((i) => i.types); });
  ok(clip.includes('image/png'), `copied to the clipboard as PNG (${clip.join(', ')})`);

  // delayed shot with the countdown window
  await page.getByRole('combobox', { name: /^Delay/ }).selectOption('3');
  const t0 = Date.now();
  await page.locator('.actions').getByRole('button', { name: 'Take screenshot in 3 s' }).click();
  await page.getByText(/^Screenshot in 3 s/).waitFor({ timeout: 5000 });
  const pip = await page.evaluate(() => !!window.documentPictureInPicture?.window);
  info(`Document Picture-in-Picture countdown window: ${pip ? 'opened' : 'not available (in-page countdown)'}`);
  await page.getByText(/^Captured/).waitFor({ timeout: 10000 });
  const took = (Date.now() - t0) / 1000;
  ok(took >= 2.8 && took < 6, `waited for the delay (${took.toFixed(1)} s)`);
  ok(await page.locator('.shot-thumb').count() === 2, 'gallery holds both shots');
  if (pip) {
    await page.locator('.actions').getByRole('button', { name: 'Take screenshot in 3 s' }).click();
    await page.waitForFunction(() => !!window.documentPictureInPicture?.window?.document.getElementById('s'));
    const t1 = Date.now();
    await page.evaluate(() => window.documentPictureInPicture.window.document.getElementById('s').click());
    await page.waitForFunction(() => document.querySelectorAll('.shot-thumb').length === 3, null, { timeout: 5000 });
    ok((Date.now() - t1) / 1000 < 1.5, '“Snap now” in the countdown window takes the shot at once');
    await page.locator('.actions').getByRole('button', { name: 'Take screenshot in 3 s' }).click();
    await page.waitForFunction(() => !!window.documentPictureInPicture?.window?.document.getElementById('c'));
    await page.evaluate(() => window.documentPictureInPicture.window.document.getElementById('c').click());
    await page.getByText('Cancelled.').waitFor({ timeout: 3000 });
    ok(await page.locator('.shot-thumb').count() === 3, '“Cancel” takes no shot');
  }
  // pick an earlier shot from the gallery
  await page.locator('.shot-thumb').last().click();
  ok(/\d+×\d+ · /.test(await page.locator('.shot-stage + .muted').textContent()), 'gallery shot opens in the editor');
  await btn('Stop sharing').click();
  ok(await page.locator('.actions').getByRole('button', { name: 'Share a screen, window or tab' }).isVisible(), 'sharing stopped');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
};
