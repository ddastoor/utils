// Slideshow Maker, "Whole pictures (nothing cut)" (to-do #19; owner, 26 Nov 2026: "none of the pictures get cut at all …
// the original pictures in their full, original uncut form"). Photos of extreme shapes — a 4 : 1 panorama, a 1 : 3 strip,
// a square — carry a coloured square in each corner; the videos are made in every shape with the gentle zoom on (and
// once off), and frames from the start to the last frame of each photo are read back: all four corner squares must be
// there whole (their full size, square, as far apart as on the photo). The same check on "Fit" with the zoom — the look
// that existed — finds its photos cut (the control: the check sees a cut). Around the pictures: white, black, a chosen
// colour, the blurred photo.
import { readFileSync } from 'node:fs';
import { mp4Info } from './video.e2e.mjs';

const PHOTOS = [['panorama.png', 800, 200], ['strip.png', 200, 600], ['square.png', 400, 400]];
const MARK = 0.18; // a corner square's side, as a share of the photo's short side
const COL = { tl: [230, 30, 30], tr: [30, 200, 30], bl: [30, 30, 230], br: [240, 220, 20] };

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(`${base}#/slideshow`);
  // the photos, drawn in the page: grey with a coloured square in each corner
  const files = await page.evaluate(async ([photos, mark, col]) => {
    const out = [];
    for (const [name, w, h] of photos) {
      const c = new OffscreenCanvas(w, h), g = c.getContext('2d'), m = Math.round(mark * Math.min(w, h));
      g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
      for (const [k, x, y] of [['tl', 0, 0], ['tr', w - m, 0], ['bl', 0, h - m], ['br', w - m, h - m]]) { g.fillStyle = `rgb(${col[k].join(',')})`; g.fillRect(x, y, m, m); }
      const b = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      out.push({ name, mimeType: 'image/png', b64: btoa(s) });
    }
    return out;
  }, [PHOTOS, MARK, COL]);
  await page.locator('input[type=file]').first().setInputFiles(files.map((f) => ({ name: f.name, mimeType: f.mimeType, buffer: Buffer.from(f.b64, 'base64') })));
  await page.getByText(/^3 photos · 3\.0 s each/).waitFor({ timeout: 30000 });
  // one second a photo, no crossfade (frames of one photo only), the zoom on, 720p
  await page.getByRole('slider').evaluate((el) => { el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByText('Crossfade between photos').click();
  await page.getByRole('radio', { name: '720p (smaller)' }).click();
  const thumbTop = () => page.locator('.ss-thumb').first().evaluate((c) => c.getContext('2d').getImageData(48, 2, 1, 1).data[3]);
  ok(await thumbTop() === 255, 'Fill: the panorama\'s thumbnail fills its box (cropped)');
  const around = page.getByRole('group', { name: 'Around the whole picture' });
  ok(!(await around.isVisible()), 'the choice of what is around a picture shows only for Whole pictures');
  await page.getByRole('radio', { name: 'Whole pictures (nothing cut)' }).click();
  ok(await around.isVisible(), 'Whole pictures: "Around the whole picture" appears');
  ok(await thumbTop() === 0, 'Whole pictures: the panorama\'s thumbnail is whole too (nothing above it)');

  const make = async () => { await page.locator('.actions').getByRole('button', { name: 'Make video' }).click(); await page.locator('.vid-result .vid-big').waitFor({ timeout: 180000 }); return download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click()); };
  // frames at the start, middle and last frame of each photo's second: the four corner squares found by their colours
  const TIMES = [0, 1, 2].flatMap((i) => [0.02, 0.25, 0.5, 0.75, 0.97].map((f) => i + f));
  const read = (path, at) => page.evaluate(async ([b64, times, col, probe]) => {
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'video/mp4' }));
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('cannot play')); });
    const W = v.videoWidth, H = v.videoHeight, c = new OffscreenCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    const out = [];
    for (const t of times) {
      v.currentTime = t; await new Promise((r) => (v.onseeked = r));
      g.drawImage(v, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, marks = {};
      for (const [k, [R, G, B]] of Object.entries(col)) {
        const xs = [], ys = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) < 70) { xs.push(x); ys.push(y); } }
        if (xs.length < 20) { marks[k] = null; continue; }
        xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
        const p = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
        const x0 = p(xs, 0.01), x1 = p(xs, 0.99), y0 = p(ys, 0.01), y1 = p(ys, 0.99);
        marks[k] = { n: xs.length, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
      }
      const at = probe ? Array.from(d.subarray((probe[1] * W + probe[0]) * 4, (probe[1] * W + probe[0]) * 4 + 3)) : null;
      out.push({ t, marks, at });
    }
    return { W, H, duration: v.duration, out };
  }, [readFileSync(path).toString('base64'), TIMES, COL, at || null]);
  /** every frame: the four squares whole and in their places — the photo was not cut */
  const whole = (r, zoom) => {
    const bad = [];
    for (const f of r.out) {
      const [name, pw, ph] = PHOTOS[Math.min(2, Math.floor(f.t))], c = Math.min(r.W / pw, r.H / ph), m = Math.round(MARK * Math.min(pw, ph));
      const lo = (zoom ? 0.92 : 1) * c * m, hi = c * m, why = [];
      for (const k of Object.keys(COL)) {
        const q = f.marks[k];
        if (!q) { why.push(`${k} missing`); continue; }
        if (Math.min(q.w, q.h) < lo * 0.85 - 3 || Math.max(q.w, q.h) > hi * 1.15 + 3) why.push(`${k} ${q.w}×${q.h} (${lo.toFixed(0)} – ${hi.toFixed(0)})`);
        else if (Math.abs(q.w - q.h) > 0.2 * Math.max(q.w, q.h) + 3) why.push(`${k} not square ${q.w}×${q.h}`);
      }
      if (!why.length) { // as far apart as on the photo: the shape between the squares' centres is the photo's
        const { tl, tr, bl } = f.marks, ratio = (tr.cx - tl.cx) / (bl.cy - tl.cy), want = (pw - m) / (ph - m);
        if (Math.abs(ratio / want - 1) > 0.06) why.push(`corners ${ratio.toFixed(3)} apart for ${want.toFixed(3)}`);
      }
      if (why.length) bad.push(`${name} at ${f.t.toFixed(2)} s: ${why.join(', ')}`);
    }
    return bad;
  };
  const near = (a, b, tol = 30) => a && a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const SHAPES = [
    ['Landscape 16:9', 1280, 720, 'White', [255, 255, 255], [100, 360]], // the strip leaves white beside it
    ['Reels / Stories 9:16', 720, 1280, 'Black', [0, 0, 0], [360, 100]], // the panorama leaves black above it
    ['Square 1:1', 720, 720, 'Colour', [0x99, 0x33, 0xaa], [360, 100]],
    ['Portrait 4:5', 720, 900, 'Blurred photo', null, null],
  ];
  for (const [shape, W, H, bg, want, probe] of SHAPES) {
    await page.getByRole('radio', { name: shape }).click();
    await around.getByRole('radio', { name: bg }).click();
    if (bg === 'Colour') { const ci = page.getByLabel('Colour around the pictures'); ok(await ci.isVisible(), 'Colour: a colour picker appears'); await ci.fill('#9933aa'); }
    const f = await make(), i = mp4Info(readFileSync(f)), r = await read(f, probe);
    ok(i.video.w === W && i.video.h === H && Math.abs(i.duration - 3) < 0.2, `${shape}: ${i.video.w}×${i.video.h}, ${i.duration.toFixed(2)} s`);
    const bad = whole(r, true);
    ok(!bad.length, `${shape}, gentle zoom on: all four corners of every photo whole in all ${r.out.length} frames read (start to last frame of each)${bad.length ? ' — ' + bad.slice(0, 4).join(' | ') : ''}`);
    if (want) { // where the photo leaves room: the colour chosen (the strip in 16:9 at the first frame, the panorama elsewhere)
      const fr = shape.startsWith('Landscape') ? r.out[5] : r.out[0];
      ok(near(fr.at, want), `${shape}: around the picture is ${bg.toLowerCase()} (${fr.at?.join(',')} at ${probe.join(', ')})`);
    }
  }
  // the zoom off: the fitted size at every moment
  await page.getByText('Gentle zoom (Ken Burns)').click();
  { const f = await make(), r = await read(f), bad = whole(r, false); ok(!bad.length, `Portrait 4:5, zoom off: every photo whole and at its fitted size${bad.length ? ' — ' + bad.slice(0, 4).join(' | ') : ''}`); }
  // the control: "Fit" with the gentle zoom, the look that existed, cuts the panorama's edges in 9:16 — the check sees it
  await page.getByText('Gentle zoom (Ken Burns)').click();
  await page.getByRole('radio', { name: 'Reels / Stories 9:16' }).click();
  await page.getByRole('radio', { name: 'Fit (blurred background)' }).click();
  ok(!(await around.isVisible()), 'Fit: the choice around the picture is hidden again');
  { const f = await make(), r = await read(f), bad = whole(r, true); ok(bad.some((b) => b.startsWith('panorama.png')), `the control — Fit with the gentle zoom is unchanged and cuts the panorama, and the check sees it: ${bad.slice(0, 2).join(' | ')}`); info(`the control (Fit, zoom on, 9:16): ${bad.length} of ${r.out.length} frames cut — ${bad.slice(0, 3).join(' | ')}`); }
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // phones: the three looks and the colours fit the screen
  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/slideshow`);
  await ph.locator('input[type=file]').first().setInputFiles(files.slice(0, 2).map((f) => ({ name: f.name, mimeType: f.mimeType, buffer: Buffer.from(f.b64, 'base64') })));
  await ph.getByText(/^2 photos/).waitFor({ timeout: 30000 });
  await ph.getByRole('radio', { name: 'Whole pictures (nothing cut)' }).click();
  await ph.getByRole('group', { name: 'Around the whole picture' }).getByRole('radio', { name: 'Colour' }).click();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.getByLabel('Colour around the pictures').isVisible(), 'phone: the new choices fit the screen, no sideways scroll');
  info(`frames read per video: ${TIMES.length}`);
};
