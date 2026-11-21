// Screenshot (#/screenshot, PC): share once (Chromium's fake picker), take shots now / after a delay (with the
// Document Picture-in-Picture countdown and its "Snap now" / "Cancel"), crop, PNG / JPEG / clipboard, gallery.
import { readFileSync } from 'node:fs';

export default async ({ base, page: newPage, ok, info, download }) => {
  const page = await newPage({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await page.addInitScript(() => { // what every share asked the browser for (the pointer setting)
    // and what the browser reports back: Chrome's test screen reports "never" whatever is asked (it has no pointer), so
    // the suite decides — 'echo' (what was asked), a value, or 'none' (a browser that reports nothing)
    const gdm = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices); window.__gdm = []; window.__cursorReport = 'echo';
    navigator.mediaDevices.getDisplayMedia = async (c) => {
      window.__gdm.push(JSON.parse(JSON.stringify(c || {})));
      const s = await gdm(c), t = s.getVideoTracks()[0], gs = t.getSettings.bind(t), m = window.__cursorReport;
      t.getSettings = () => { const r = gs(); if (m === 'echo') r.cursor = c?.video?.cursor; else if (m === 'none') delete r.cursor; else r.cursor = m; return r; };
      return s;
    };
  });
  await page.addInitScript(() => { // every clone of a shared track, to see that none is left running
    const clone = MediaStreamTrack.prototype.clone; window.__clones = [];
    MediaStreamTrack.prototype.clone = function () { const c = clone.call(this); window.__clones.push(c); return c; };
  });
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
  // pick an earlier shot from the gallery: kept as PNG and decoded again, pixel for pixel the shot saved first
  await page.locator('.shot-thumb').last().click();
  await page.waitForTimeout(500);
  ok(/\d+×\d+ · /.test(await page.locator('.shot-stage + .muted').textContent()), 'gallery shot opens in the editor');
  await page.getByText('Crop (drag the box)').click({ force: true }).catch(() => {});
  const cropOnNow = await page.getByRole('checkbox', { name: 'Crop (drag the box)' }).isChecked().catch(() => false);
  if (cropOnNow) await page.getByText('Crop (drag the box)').click();
  const p3 = readFileSync(await download(page, () => btn('PNG').click())), p0 = readFileSync(await download(page, () => btn('PNG').click()));
  ok(p3.equals(p0) && p3.readUInt32BE(16) === W, `an earlier shot reopened from its PNG saves the same picture (${p3.length} bytes, ${p3.readUInt32BE(16)} px wide)`);
  await btn('Stop sharing').click();
  ok(await page.locator('.actions').getByRole('button', { name: 'Share a screen, window or tab' }).isVisible(), 'sharing stopped');
  const clones = await page.evaluate(() => window.__clones.map((t) => t.readyState));
  ok(clones.length >= 3 && clones.every((r) => r === 'ended'), `no copy of the shared screen is left running after "Stop sharing" (${clones.length} shots' copies: ${[...new Set(clones)].join(', ')}; they were left live)`);
  // sharing ended during the countdown: said, no "Cannot read properties of null"
  await page.locator('.actions').getByRole('button', { name: 'Share a screen, window or tab' }).click();
  await page.getByText(/^Sharing .* Press “Take screenshot”/).waitFor({ timeout: 10000 });
  await page.locator('.actions').getByRole('button', { name: 'Take screenshot in 3 s' }).click();
  await page.waitForTimeout(600);
  ok(await page.locator('.actions').getByRole('button', { name: 'Share something else' }).isDisabled(), 'another share cannot start during the countdown');
  await btn('Stop sharing').click();
  await page.getByText('Sharing ended before the shot. Share again to take one.').waitFor({ timeout: 8000 }).catch(() => {});
  ok(await page.getByText('Sharing ended before the shot. Share again to take one.').isVisible(), 'sharing stopped during the countdown: said');

  // the mouse pointer: left out unless asked for; set when sharing starts (Chrome keeps a live track's setting), so a
  // change on an open share ends it and the next share has it (owner, 21 Nov 2026: "include the mouse exclude option")
  const cursors = () => page.evaluate(() => window.__gdm.map((c) => c.video?.cursor));
  ok((await cursors()).every((c) => c === 'never'), `no pointer by default (cursor: ${[...new Set(await cursors())].join(', ')})`);
  const shareB = page.locator('.actions').getByRole('button', { name: 'Share a screen, window or tab' });
  const sharing = async () => { await page.getByText(/^Sharing .* Press “Take screenshot”/).waitFor({ timeout: 10000 }); return page.getByText(/^Sharing /).textContent(); };
  await shareB.click();
  ok(/ · no mouse pointer\. /.test(await sharing()), `the share says the pointer is left out (${await sharing()})`);
  const pointerSw = page.locator('label.switch', { hasText: 'Show the mouse pointer' });
  await pointerSw.click();
  await page.getByText('The mouse pointer is set when sharing starts: share again.').waitFor({ timeout: 5000 });
  ok(await shareB.isVisible() && !(await btn('Stop sharing').isVisible()), 'switched on during a share: that share ends');
  await shareB.click();
  ok((await cursors()).at(-1) === 'always' && / · with the mouse pointer\. /.test(await sharing()), `the next share asks for the pointer (${(await cursors()).at(-1)}; ${await sharing()})`);
  await pointerSw.click(); // off again: ends this share
  await page.getByText('The mouse pointer is set when sharing starts: share again.').waitFor({ timeout: 5000 });
  await page.evaluate(() => (window.__cursorReport = 'motion'));
  await shareB.click();
  ok(/with the mouse pointer: this browser keeps it in, though it was asked to leave it out/.test(await sharing()), `a browser that keeps the pointer in is said to (${await sharing()})`);
  await page.evaluate(() => (window.__cursorReport = 'echo'));
  await page.locator('.actions').getByRole('button', { name: 'Take screenshot in 3 s' }).click();
  await page.waitForTimeout(300);
  ok(await pointerSw.locator('input').isDisabled(), 'the pointer switch is locked during the countdown');
  await page.getByText(/^Captured/).first().waitFor({ timeout: 10000 });
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
};
