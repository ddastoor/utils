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

  // ---------------------------------------------------------------- scrolling screenshots (to-do #28)
  // owner, 26 Nov 2026: "Make a new option also for scrolling screenshots in the screenshot app." The shared surface is a
  // made-up page seen through a 640 × 480 view: a sticky header (40 rows), 410 rows of the page, a footer (30 rows); the
  // page — 2,400 rows of glyph-like lines and coloured boxes, every row its own — is moved by window.__scroll. Chrome's
  // forwardWheel is stood in for: the wheel over the element scrolls the made-up page. The joined picture must be the
  // header, the whole page and the footer, row for row (FNV-1a of every row of the PNG against the page drawn whole).
  const sp = await newPage({ viewport: { width: 1280, height: 900 } });
  await sp.addInitScript(() => {
    const W = 640, VH = 480, HEAD = 40, FOOT = 30, REG = VH - HEAD - FOOT, PH = 2400;
    window.__surface = 'browser'; window.__scroll = 0; window.__fwdCalls = [];
    const pageCanvas = () => {
      if (window.__page) return window.__page;
      const pc = document.createElement('canvas'); pc.width = W; pc.height = PH;
      const g = pc.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, PH);
      let s = 9; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 8) / 16777216;
      for (let y = 10; y < PH - 24; y += 22) {
        let x = 12 + Math.floor(r() * 20); const end = W - 20 - Math.floor(r() * 200);
        while (x < end) { const gw = 4 + Math.floor(r() * 8), gh = 8 + Math.floor(r() * 6); g.fillStyle = `rgb(${Math.floor(r() * 80)},${Math.floor(r() * 80)},${100 + Math.floor(r() * 120)})`; g.fillRect(x, y + 14 - gh, gw, gh); x += gw + 2 + (r() < 0.2 ? 6 : 0); }
        if (r() < 0.15) { g.fillStyle = `hsl(${Math.floor(r() * 360)} 70% 60%)`; g.fillRect(Math.floor(r() * (W - 120)), y, 100, 18); }
      }
      return (window.__page = pc);
    };
    const head = (g) => { g.fillStyle = '#1e293b'; g.fillRect(0, 0, W, HEAD); g.fillStyle = '#fbbf24'; g.fillRect(16, 10, 90, 20); g.fillRect(W - 120, 10, 100, 20); };
    const foot = (g, y) => { g.fillStyle = '#e2e8f0'; g.fillRect(0, y, W, FOOT); g.fillStyle = '#64748b'; g.fillRect(W / 2 - 40, y + 8, 80, 14); };
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas'); c.width = W; c.height = VH;
      const g = c.getContext('2d'), pg = pageCanvas();
      const draw = () => { head(g); g.drawImage(pg, 0, window.__scroll, W, REG, 0, HEAD, W, REG); foot(g, VH - FOOT); };
      draw(); const iv = setInterval(draw, 30);
      const st = c.captureStream(30), t = st.getVideoTracks()[0], gs = t.getSettings.bind(t);
      t.getSettings = () => ({ ...gs(), displaySurface: window.__surface, width: W, height: VH });
      t.addEventListener('ended', () => clearInterval(iv));
      return st;
    };
    // Chrome forwards the wheel turned over the element to the shared tab: here it moves the made-up page
    CaptureController.prototype.forwardWheel = async function (el) {
      window.__fwdCalls.push(el ? el.tagName : null);
      if (window.__fwdEl) window.__fwdEl.removeEventListener('wheel', window.__fwdFn);
      window.__fwdEl = el;
      if (!el) return;
      window.__fwdFn = (e) => { window.__scroll = Math.max(0, Math.min(PH - REG, window.__scroll + Math.round(e.deltaY))); };
      el.addEventListener('wheel', window.__fwdFn, { passive: true });
    };
    // the picture the capture must make: header, the page whole, footer — FNV-1a of every row
    window.__wantRows = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = HEAD + PH + FOOT;
      const g = c.getContext('2d'); head(g); g.drawImage(pageCanvas(), 0, HEAD); foot(g, HEAD + PH);
      const d = g.getImageData(0, 0, W, c.height).data, rows = [];
      for (let y = 0; y < c.height; y++) { let hsh = 0x811c9dc5; for (let i = y * W * 4; i < (y + 1) * W * 4; i++) hsh = Math.imul(hsh ^ d[i], 16777619) >>> 0; rows.push(hsh); }
      return rows;
    };
  });
  await sp.goto(`${base}#/screenshot`);
  const sbtn = (name) => sp.locator('.actions').getByRole('button', { name, exact: true });
  const sstat = () => sp.locator('.tool-body [aria-live="polite"]').first().textContent();
  const rowsOf = (img) => { const o = []; for (let y = 0; y < img.height; y++) { let hsh = 0x811c9dc5; for (let i = y * img.width * 4; i < (y + 1) * img.width * 4; i++) hsh = Math.imul(hsh ^ img.data[i], 16777619) >>> 0; o.push(hsh); } return o; };
  const wantRows = await sp.evaluate(() => window.__wantRows());
  const compare = (img) => { const got = rowsOf(img); const n = Math.min(got.length, wantRows.length); for (let y = 0; y < n; y++) if (got[y] !== wantRows[y]) return `row ${y} differs`; return got.length === wantRows.length ? 'the same' : `${got.length} rows, not ${wantRows.length}`; };
  await sp.getByRole('combobox', { name: /^Delay/ }).selectOption('0');
  await sp.getByRole('radio', { name: 'A scrolling page' }).click();
  ok(await sbtn('Start a scrolling capture').isVisible(), 'the button says what it does: “Start a scrolling capture”');

  // a shared tab, scrolled with the wheel over its picture here (Chrome's Captured Surface Control)
  await sbtn('Start a scrolling capture').click();
  await sp.waitForFunction(() => /1 view · 640 × 480 px/.test(document.querySelector('.tool-body [aria-live="polite"]')?.textContent || ''), null, { timeout: 15000 });
  ok(await sp.locator('video.shot-live').isVisible() && (await sp.evaluate(() => window.__fwdCalls)).join() === 'VIDEO' && await sp.getByText(/^Scroll with the mouse wheel over the picture of the shared tab below/).isVisible(), 'a shared tab: its picture is shown here, the wheel over it is forwarded to it (forwardWheel), and the tab says so');
  ok(await sbtn('Stop').isVisible() && await sbtn('Capturing…').isDisabled(), '“Stop” is offered while it runs (the start button says “Capturing…”)');
  for (let i = 0; i < 60 && await sp.evaluate(() => window.__scroll) < 1990; i++) {
    const b = await sp.locator('video.shot-live').boundingBox();
    await sp.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await sp.mouse.wheel(0, 100);
    await sp.waitForTimeout(140);
  }
  await sp.waitForTimeout(600);
  const mid = await sstat();
  ok(/\d+ views · 640 × 2,470 px/.test(mid), `the picture grows as the tab is scrolled to its end: ${mid.slice(0, 60)}`);
  await sbtn('Stop').click();
  await sp.getByText(/^Captured a scrolling picture 640 × 2,470 px from \d+ views\./).waitFor({ timeout: 20000 });
  ok((await sp.evaluate(() => window.__fwdCalls)).join() === 'VIDEO,' && !(await sp.locator('video.shot-live').count()), 'Stop: the wheel is no longer forwarded and the picture of the tab goes away');
  const t1 = readPng(readFileSync(await download(sp, () => sp.getByRole('button', { name: 'PNG', exact: true }).click())));
  ok(t1.width === 640 && t1.height === 2470 && compare(t1) === 'the same', `the PNG is the header once, the whole page and the footer once — every row as the page drawn whole (${t1.width}×${t1.height}: ${compare(t1)})`);
  ok(/640×2470 · a scrolling capture of \d+ views · /.test(await sp.locator('.shot-stage + .muted').textContent()) && await sp.locator('.shot-stage.tall').count() === 1, 'the editor says it is a scrolling capture and shows the long picture in a box that scrolls');

  // a window (no wheel to forward): scrolled by hand while the tab takes the views; a jump too far is said, and going
  // back to where it fits carries on
  await sbtn('Stop sharing').click();
  await sp.evaluate(() => { window.__surface = 'window'; window.__scroll = 0; });
  await sbtn('Start a scrolling capture').click();
  await sp.getByText(/^Now scroll the shared window yourself/).waitFor({ timeout: 15000 });
  ok(!(await sp.locator('video.shot-live').count()) && (await sp.evaluate(() => window.__fwdCalls)).length === 2, 'a window: no picture of it here, nothing forwarded — scrolled by hand, as the tab says');
  const to = async (y) => { await sp.evaluate((v) => { window.__scroll = v; }, y); await sp.waitForTimeout(220); };
  for (let y = 70; y <= 700; y += 70) await to(y);
  await to(1300); // 600 rows at once: more than the 410 the view shows
  await sp.waitForFunction(() => /does not fit the picture/.test(document.querySelector('.tool-body [aria-live="polite"]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  ok(/that view does not fit the picture \(scrolled too fast, or sideways\)/.test(await sstat()), `a jump of 600 rows is said: ${(await sstat()).slice(0, 90)}`);
  for (let y = 900; y <= 1990; y += 90) await to(Math.min(y, 1990));
  await to(1990);
  await sbtn('Stop').click();
  await sp.getByText(/^Captured a scrolling picture 640 × 2,470 px/).waitFor({ timeout: 20000 });
  const t2 = readPng(readFileSync(await download(sp, () => sp.getByRole('button', { name: 'PNG', exact: true }).click())));
  ok(compare(t2) === 'the same', `scrolled by hand, with a jump on the way: still every row of the page (${t2.width}×${t2.height}: ${compare(t2)})`);
  ok(await sp.locator('.shot-thumb').count() === 2, 'both pictures are in the gallery');

  // leaving the tab during a capture: it ends, nothing left running
  await sp.evaluate(() => { window.__scroll = 0; });
  await sbtn('Start a scrolling capture').click();
  await sp.getByText(/^Now scroll the shared window yourself/).waitFor({ timeout: 15000 });
  await to(100);
  await sp.evaluate(() => { location.hash = '#/stopwatch'; });
  await sp.waitForTimeout(800);
  const live = await sp.evaluate(() => globalThis.__superutilsLive?.());
  ok(!live || live.workers === 0, `leaving the tab during a scrolling capture ends it: no worker left (${JSON.stringify(live)})`);
  ok(!sp.errors.length, `no page errors with the scrolling capture ${sp.errors.slice(0, 3).join(' | ')}`);
};
