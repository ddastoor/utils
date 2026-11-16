// Slideshow Maker (#/slideshow): photos + music → MP4 (WebCodecs + mediabunny, music via our audio.wasm). Checks MP4
// boxes, length, which photo is on screen at known times (vs the photos drawn the same way), reorder, shape, music.
import { readFileSync } from 'node:fs';
import { mp4Info } from './video.e2e.mjs';
const I = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;
const M = (n) => new URL(`../fixtures/media/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(`${base}#/slideshow`);
  const make = async () => { await page.locator('.actions').getByRole('button', { name: 'Make video' }).click(); await page.locator('.vid-result .vid-big').waitFor({ timeout: 180000 }); return download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click()); };
  const photosB64 = Object.fromEntries(['chelsea.png', 'coffee.jpg', 'astronaut.png'].map((n) => [n, readFileSync(I(n)).toString('base64')]));
  /** For each time: mean RGB difference between the video frame and each photo drawn "fill" (cover) at the same shape. */
  const which = (path, times) => page.evaluate(async ([b64, photos, times]) => {
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('cannot play')); });
    const W = 64, H = Math.round((64 * v.videoHeight) / v.videoWidth);
    const grab = (src, sw, sh) => { const c = new OffscreenCanvas(W, H), g = c.getContext('2d'); const s = Math.max(W / sw, H / sh); g.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s); return g.getImageData(0, 0, W, H).data; };
    const refs = {};
    for (const [n, b] of Object.entries(photos)) { const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))])); refs[n] = grab(bmp, bmp.width, bmp.height); }
    const out = [];
    for (const t of times) {
      v.currentTime = t; await new Promise((r) => (v.onseeked = r));
      const f = grab(v, v.videoWidth, v.videoHeight), d = {};
      for (const [n, r] of Object.entries(refs)) { let s = 0; for (let i = 0; i < f.length; i += 4) s += Math.abs(f[i] - r[i]) + Math.abs(f[i + 1] - r[i + 1]) + Math.abs(f[i + 2] - r[i + 2]); d[n] = s / (f.length / 4) / 3; }
      const best = Object.entries(d).sort((a, b) => a[1] - b[1])[0];
      out.push({ t, best: best[0], diff: best[1], d });
    }
    return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, out };
  }, [readFileSync(path).toString('base64'), photosB64, times]);
  const audioFreq = (path) => page.evaluate(async (b64) => {
    const ctx = new AudioContext(), b = await ctx.decodeAudioData(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer), x = b.getChannelData(0);
    const s = Math.floor(x.length * 0.3), e = Math.floor(x.length * 0.6); let first = -1, last = -1, n = 0;
    for (let i = s + 1; i < e; i++) if (x[i - 1] < 0 && x[i] >= 0) { if (first < 0) first = i; else n++; last = i; }
    return { freq: n ? (n * b.sampleRate) / (last - first) : 0, duration: b.duration };
  }, readFileSync(path).toString('base64'));

  await page.locator('input[type=file]').first().setInputFiles([I('chelsea.png'), I('coffee.jpg'), I('astronaut.png')]);
  await page.getByText(/^3 photos · 3\.0 s each/).waitFor({ timeout: 30000 });
  ok(await page.locator('.ss-item').count() === 3, 'three photos listed');
  ok(/1920×1080/.test(await page.getByText(/^3 photos/).textContent()), 'default 1080p landscape on PC');
  // settings: 2 s each, no zoom (exact frames), 720p, crossfade on, music
  await page.getByRole('slider').evaluate((el) => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByText('Gentle zoom (Ken Burns)').click();
  await page.getByRole('radio', { name: '720p (smaller)' }).click();
  await page.locator('input[type=file]').nth(1).setInputFiles(M('tone.mp3'));
  await page.getByText(/tone\.mp3 · 0:02/).waitFor();
  ok(/video 0:06 · 1280×720 · music 0:02 \(repeats\)/.test(await page.getByText(/^3 photos/).textContent()), 'summary: 6 s video, music repeats');
  const f1 = await make(), i1 = mp4Info(readFileSync(f1));
  ok(i1.video?.codec === 'avc1' && i1.video.w === 1280 && i1.video.h === 720, `H.264 1280×720 (${i1.video?.codec})`);
  ok(!!i1.audio && ['mp4a', 'Opus'].includes(i1.audio.codec), `music track (${i1.audio?.codec})`);
  ok(Math.abs(i1.duration - 6) < 0.2, `6 s long (${i1.duration.toFixed(2)} s)`);
  const w1 = await which(f1, [1.0, 3.0, 5.0]);
  ok(w1.out.map((o) => o.best).join(',') === 'chelsea.png,coffee.jpg,astronaut.png' && w1.out.every((o) => o.diff < 20), `photos in order at 1/3/5 s: ${w1.out.map((o) => `${o.best} (${o.diff.toFixed(1)})`).join(', ')}`);
  const a1 = await audioFreq(f1);
  ok(Math.abs(a1.freq - 660) < 3, `music is the 660 Hz tone (${a1.freq.toFixed(1)} Hz), looped over ${a1.duration.toFixed(1)} s`);

  // reorder: third photo one step earlier → chelsea, astronaut, coffee
  await page.getByRole('button', { name: 'Move photo 3 earlier' }).click();
  const f2 = await make(), w2 = await which(f2, [1.0, 3.0, 5.0]);
  ok(w2.out.map((o) => o.best).join(',') === 'chelsea.png,astronaut.png,coffee.jpg', `reordered: ${w2.out.map((o) => o.best).join(', ')}`);

  // portrait reels shape, fit with blurred background
  await page.getByRole('radio', { name: 'Reels / Stories 9:16' }).click();
  await page.getByRole('radio', { name: 'Fit (blurred background)' }).click();
  const f3 = await make(), i3 = mp4Info(readFileSync(f3));
  ok(i3.video.w === 720 && i3.video.h === 1280, `9:16 → 720×1280 (${i3.video.w}×${i3.video.h})`);

  // remove a photo, then fit the slideshow to the music (2 s / 2 photos = 1 s each)
  await page.getByRole('button', { name: 'Remove photo 3' }).click();
  await page.getByText('Fit the slideshow to the music length').click();
  await page.getByText(/^2 photos · 1\.0 s each · video 0:02/).waitFor();
  const f4 = await make(), i4 = mp4Info(readFileSync(f4));
  ok(Math.abs(i4.duration - 2) < 0.15, `fit to music: ${i4.duration.toFixed(2)} s`);

  // preview plays and stops
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.waitForTimeout(400);
  ok(await page.getByRole('button', { name: 'Stop' }).isVisible(), 'preview playing');
  await page.getByRole('button', { name: 'Stop' }).click();
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/slideshow`);
  await ph.locator('input[type=file]').first().setInputFiles([I('chelsea.png'), I('coffee.jpg')]);
  await ph.getByText(/^2 photos/).waitFor({ timeout: 30000 });
  ok(/1080×1920/.test(await ph.getByText(/^2 photos/).textContent()), 'phones default to 9:16 reels');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.getByRole('button', { name: 'Make video' }).isVisible(), 'phone: fits, Make video in the bottom bar');
  info(`frame diffs: ${JSON.stringify(w1.out.map((o) => o.d))}`);
};
