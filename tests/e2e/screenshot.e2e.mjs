// Screenshot (#/screenshot, PC): share once (Chromium's fake picker), take shots now / after a delay (with the
// Document Picture-in-Picture countdown and its "Snap now" / "Cancel"), crop, PNG / JPEG / clipboard, gallery; an area
// drawn on the frozen screen with the mouse, the keys or a finger (to-do #24), its pixels held to the whole shot's.
import { readFileSync } from 'node:fs';
import { readPng } from '../lib/png.mjs';

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

  // ---------------------------------------------------------------- an area drawn on the frozen screen (to-do #24)
  // owner, 26 Nov 2026: "add the ability for the user to draw a rectangular area with his mouse also as an option to take
  // the screenshot". The shared picture is a known one — fixed noise, every pixel unlike its neighbours, so a rectangle
  // one pixel off never matches — and the area's PNG is held, byte for byte, to the same rectangle of the whole shot.
  const a = await newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
  await a.addInitScript(() => {
    window.__share = { w: 640, h: 360, surface: 'window' };
    navigator.mediaDevices.getDisplayMedia = async () => {
      const { w, h, surface } = window.__share, c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'), id = g.createImageData(w, h);
      let s = 99;
      for (let i = 0; i < id.data.length; i += 4) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; id.data[i] = s >>> 24; id.data[i + 1] = (s >>> 16) & 255; id.data[i + 2] = (s >>> 8) & 255; id.data[i + 3] = 255; }
      const draw = () => g.putImageData(id, 0, 0); // a canvas sends a frame when it is drawn
      draw(); const iv = setInterval(draw, 50);
      const st = c.captureStream(20), t = st.getVideoTracks()[0], gs = t.getSettings.bind(t);
      t.getSettings = () => ({ ...gs(), displaySurface: surface, width: w, height: h });
      t.addEventListener('ended', () => clearInterval(iv));
      return st;
    };
  });
  await a.goto(`${base}#/screenshot`);
  const abtn = (name) => a.locator('.actions').getByRole('button', { name, exact: true });
  const say = () => a.locator('.area-say').textContent();
  await a.getByRole('combobox', { name: /^Delay/ }).selectOption('0');
  const takeWhole = async () => {
    await a.getByRole('radio', { name: 'The whole picture' }).click();
    await abtn('Take screenshot').click();
    await a.getByText(/^Captured \d+×\d+\. Crop/).waitFor({ timeout: 15000 });
    return readPng(readFileSync(await download(a, () => a.getByRole('button', { name: 'PNG', exact: true }).click())));
  };
  const crop = (img, x, y, w, h) => { const o = new Uint8ClampedArray(w * h * 4); for (let r = 0; r < h; r++) o.set(img.data.subarray(((y + r) * img.width + x) * 4, ((y + r) * img.width + x + w) * 4), r * w * 4); return o; };
  const same = (p, img, [x, y, w, h]) => p.width === w && p.height === h && Buffer.from(p.data).equals(Buffer.from(crop(img, x, y, w, h)));
  const whole = await takeWhole();
  ok(whole.width === 640 && whole.height === 360, `the whole shared window first: ${whole.width}×${whole.height}`);
  const lastPng = async () => readPng(readFileSync(await download(a, () => a.getByRole('button', { name: 'PNG', exact: true }).click())));
  const thumbs = () => a.locator('.shot-thumb').count();
  // where the frame is drawn: 1:1 and centred on whole pixels when it fits (src/lib/areageom.ts layoutOf), else fitted
  const frameOn = async (W, H) => {
    const b = await a.locator('.area-canvas').boundingBox(), s = Math.min(1, b.width / W, b.height / H);
    return { b, s, ox: s === 1 ? Math.floor((b.width - W) / 2) : (b.width - W * s) / 2, oy: s === 1 ? Math.floor((b.height - H) / 2) : (b.height - H * s) / 2 };
  };
  const at = (F, fx, fy) => [F.b.x + F.ox + fx * F.s, F.b.y + F.oy + fy * F.s];
  const dragOn = async (from, to) => { await a.mouse.move(...from); await a.mouse.down(); await a.mouse.move(...to, { steps: 8 }); await a.mouse.up(); };
  const openArea = async () => {
    await a.getByRole('radio', { name: 'An area (draw a rectangle)' }).click();
    await abtn('Choose an area').click();
    await a.locator('.area-pick').waitFor({ timeout: 15000 });
    await a.waitForFunction(() => document.querySelector('.area-canvas')?.width > 0);
  };

  // the mouse: a rectangle dragged, its size shown as it grows, Enter takes it
  await openArea();
  ok(await a.getByText(/^The screen is frozen: drag a rectangle on it/).count() === 1, 'the tab says the screen is frozen');
  ok(await a.evaluate(() => document.fullscreenElement?.classList.contains('area-pick')), 'the frozen screen is shown full screen at once (the click that started it is still fresh: the share was open)');
  ok(await a.evaluate(() => [...document.body.children].filter((e) => !e.classList.contains('area-pick')).every((e) => e.inert)), 'the rest of the page cannot be reached meanwhile');
  let F = await frameOn(640, 360);
  ok(F.s === 1, `the 640 × 360 window at its own pixels in the ${Math.round(F.b.width)} × ${Math.round(F.b.height)} view`);
  await a.mouse.move(...at(F, 100, 50)); await a.mouse.down(); await a.mouse.move(...at(F, 200, 100), { steps: 4 });
  ok(/^Area 100 × 50 at 100, 50/.test(await say()), `its size is shown as it grows (${await say()})`);
  await a.mouse.move(...at(F, 300, 150), { steps: 4 }); await a.mouse.up();
  ok(/^Area 200 × 100 at 100, 50/.test(await say()), `the rectangle dragged: ${await say()}`);
  await a.keyboard.press('Enter');
  await a.getByText(/^Captured 200×100: the area at 100, 50 of the 640×360 screen/).waitFor({ timeout: 10000 });
  ok(!(await a.locator('.area-pick').count()) && !(await a.evaluate(() => document.fullscreenElement)) && await a.evaluate(() => [...document.body.children].every((e) => !e.inert)), 'Enter takes it: the frozen screen and full screen are gone, the page is back');
  ok(same(await lastPng(), whole, [100, 50, 200, 100]), 'the PNG holds exactly those pixels: byte for byte the same rectangle of the whole shot, at full resolution');
  ok(/200×100 · an area at 100, 50 of 640×360 · /.test(await a.locator('.shot-stage + .muted').textContent()), 'the editor says where the area was');

  // a corner adjusted, the rectangle moved, a double-click takes it
  await openArea(); F = await frameOn(640, 360);
  await dragOn(at(F, 50, 40), at(F, 250, 140));
  await dragOn(at(F, 250, 140), at(F, 290, 160));
  ok(/^Area 240 × 120 at 50, 40/.test(await say()), `the bottom right corner dragged out by (40, 20): ${await say()}`);
  await dragOn(at(F, 290, 100), at(F, 270, 100));
  ok(/^Area 220 × 120 at 50, 40/.test(await say()), `the right edge dragged in by 20: ${await say()}`);
  await dragOn(at(F, 150, 100), at(F, 180, 120));
  ok(/^Area 220 × 120 at 80, 60/.test(await say()), `a drag inside moves it by (30, 20): ${await say()}`);
  await a.mouse.move(...at(F, 181, 121));
  ok(await a.locator('.area-canvas').evaluate((c) => c.style.cursor) === 'move', 'the pointer shows "move" over the area');
  await a.mouse.move(...at(F, 300, 121));
  ok(await a.locator('.area-canvas').evaluate((c) => c.style.cursor) === 'ew-resize', '… and a sideways arrow over its right edge');
  await a.mouse.dblclick(...at(F, 150, 100));
  await a.getByText(/^Captured 220×120/).waitFor({ timeout: 10000 });
  ok(same(await lastPng(), whole, [80, 60, 220, 120]), 'a double-click takes it: exactly the adjusted rectangle');

  // Esc cancels: nothing taken
  const before = await thumbs();
  await openArea(); F = await frameOn(640, 360);
  await dragOn(at(F, 10, 10), at(F, 60, 60));
  await a.keyboard.press('Escape');
  await a.getByText('Cancelled — no shot was taken.').waitFor({ timeout: 5000 });
  ok(!(await a.locator('.area-pick').count()) && await thumbs() === before && !(await a.evaluate(() => document.fullscreenElement)), 'Esc cancels: no shot, the frozen screen gone');

  // the keys alone: an arrow key starts the middle half, Shift moves by 10, Ctrl with an arrow sizes it
  await openArea();
  await a.locator('.area-canvas').focus();
  await a.keyboard.press('ArrowRight');
  ok(/^Area 320 × 180 at 160, 90/.test(await say()), `an arrow key without an area starts one: the middle half (${await say()})`);
  await a.keyboard.press('Shift+ArrowRight'); await a.keyboard.press('Shift+ArrowDown'); await a.keyboard.press('Control+ArrowDown'); await a.keyboard.press('Control+ArrowLeft');
  await a.keyboard.press('ArrowLeft');
  ok(/^Area 319 × 181 at 169, 100/.test(await say()), `Shift + → / ↓ move by 10, Ctrl + ↓ / ← size by one, ← moves by one (${await say()})`);
  await a.keyboard.press('Enter');
  await a.getByText(/^Captured 319×181/).waitFor({ timeout: 10000 });
  ok(same(await lastPng(), whole, [169, 100, 319, 181]), 'taken with the keys: exactly that rectangle');

  // "Whole picture" from the frozen screen
  await openArea();
  await a.locator('.area-bar').getByRole('button', { name: 'Whole picture' }).click();
  await a.getByText(/^Captured 640×360\. Crop/).waitFor({ timeout: 10000 });
  ok(same(await lastPng(), whole, [0, 0, 640, 360]), '“Whole picture” takes all of it');

  // a finger: a touch drag draws the rectangle too
  await openArea(); F = await frameOn(640, 360);
  { const cdp = await a.context().newCDPSession(a), touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, force: 0.5, radiusX: 4, radiusY: 4 })) });
    await touch('touchStart', [at(F, 400, 200)]);
    for (const k of [0.25, 0.5, 0.75, 1]) await touch('touchMove', [at(F, 400 + 160 * k, 200 + 100 * k)]);
    await touch('touchEnd', []); }
  ok(/^Area 160 × 100 at 400, 200/.test(await say()), `a finger's drag draws it too (${await say()})`);
  await a.locator('.area-bar').getByRole('button', { name: 'Take this area' }).click();
  await a.getByText(/^Captured 160×100/).waitFor({ timeout: 10000 });
  ok(same(await lastPng(), whole, [400, 200, 160, 100]), '“Take this area” takes the finger\'s rectangle');

  // with a delay: the countdown first, then the frozen screen
  await a.getByRole('combobox', { name: /^Delay/ }).selectOption('3');
  const ta = Date.now();
  await abtn('Choose an area in 3 s').click();
  await a.locator('.area-pick').waitFor({ timeout: 10000 });
  const waited = (Date.now() - ta) / 1000;
  ok(waited >= 2.8 && waited < 6, `with a 3 s delay the frozen screen comes after the countdown (${waited.toFixed(1)} s)`);
  // full screen at once only while the click that started it lasts (Chrome: 5 s, used up by the countdown window where
  // there is one); else the button offers it
  if (await a.evaluate(() => !!document.fullscreenElement)) {
    info('after the 3 s countdown the frozen screen came full screen at once (the click was still fresh)');
    await a.locator('.area-bar').getByRole('button', { name: 'Leave full screen' }).click();
    await a.waitForFunction(() => !document.fullscreenElement);
  }
  ok(await a.locator('.area-bar').getByRole('button', { name: 'Full screen' }).isVisible(), 'not full screen: a “Full screen” button offers it');
  await a.locator('.area-bar').getByRole('button', { name: 'Full screen' }).click();
  await a.waitForFunction(() => document.fullscreenElement?.classList.contains('area-pick'), null, { timeout: 5000 }).catch(() => {});
  ok(await a.evaluate(() => document.fullscreenElement?.classList.contains('area-pick')) && await a.locator('.area-bar').getByRole('button', { name: 'Leave full screen' }).isVisible(), '… which shows it full screen');
  await a.locator('.area-bar').getByRole('button', { name: 'Cancel' }).click();
  await a.getByText('Cancelled — no shot was taken.').waitFor({ timeout: 5000 });
  ok(!(await a.evaluate(() => document.fullscreenElement)), 'Cancel leaves full screen too');
  await a.getByRole('combobox', { name: /^Delay/ }).selectOption('0');

  // a whole screen larger than the view: fitted, and the pointer still lands on the right pixels
  await abtn('Stop sharing').click();
  await a.evaluate(() => (window.__share = { w: 1920, h: 1080, surface: 'monitor' }));
  const big = await takeWhole();
  ok(big.width === 1920 && big.height === 1080, `a 1920 × 1080 screen shared (${big.width}×${big.height})`);
  await openArea(); F = await frameOn(1920, 1080);
  ok(F.s < 1, `fitted into the view (scale ${F.s.toFixed(3)})`);
  const m0 = [Math.round(F.b.x + F.ox + 300 * F.s), Math.round(F.b.y + F.oy + 200 * F.s)], m1 = [Math.round(F.b.x + F.ox + 1500 * F.s), Math.round(F.b.y + F.oy + 900 * F.s)];
  await dragOn(m0, m1);
  const want = [m0, m1].map(([x, y]) => [Math.round((x - F.b.x - F.ox) / F.s), Math.round((y - F.b.y - F.oy) / F.s)]);
  const rr = [want[0][0], want[0][1], want[1][0] - want[0][0], want[1][1] - want[0][1]];
  ok((await say()).startsWith(`Area ${rr[2]} × ${rr[3]} at ${rr[0]}, ${rr[1]}`), `the drag on the fitted screen: ${await say()} (the pointer's points: ${rr.join(', ')})`);
  await a.keyboard.press('Enter');
  await a.getByText(new RegExp(`^Captured ${rr[2]}×${rr[3]}`)).waitFor({ timeout: 10000 });
  ok(same(await lastPng(), big, rr), 'at full resolution: the area of the 1920 × 1080 screen, not of its picture on the view');

  // leaving the tab with the frozen screen open closes it
  await openArea();
  await a.evaluate(() => { location.hash = '#/stopwatch'; });
  await a.waitForTimeout(500);
  ok(!(await a.locator('.area-pick').count()) && await a.evaluate(() => [...document.body.children].every((e) => !e.inert) && !document.fullscreenElement), 'leaving the tab closes the frozen screen and gives the page back');
  ok(!a.errors.length, `no page errors with the area ${a.errors.slice(0, 3).join(' | ')}`);
};
