// FFmpeg (#/ffmpeg, PC): ffmpeg.wasm presets on real clips; outputs checked by container bytes, MP4 boxes and by
// decoding them in the browser.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { mp4Info } from './video.e2e.mjs';
import { mp3Frames, readWav } from './audio.e2e.mjs';
import { imageInfo } from '../lib/imgcheck.mjs';
const M = (n) => fileURLToPath(new URL(`../fixtures/media/${n}`, import.meta.url));
const I = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));

export default async ({ base, page: newPage, ok, info, download }) => {
  let page = await newPage({ viewport: { width: 1280, height: 1100 } }); // a fresh page for the Stop checks: see there
  await page.goto(`${base}#/ffmpeg`);
  const combo = (name) => page.getByRole('combobox', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });
  const task = (label) => combo('Task').selectOption({ label });
  const run = async (dlName = 'Download') => {
    await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
    // the result, or the tab's own error (said at once instead of a silent time-out)
    await page.waitForFunction(() => { const o = document.querySelector('.ff-out'); return (o && !o.closest('[hidden]')) || document.querySelector('.err-text'); }, null, { timeout: 180000 });
    const err = await page.locator('.err-text').first().textContent().catch(() => null);
    if (err) throw new Error(`the run failed: ${err} — log: ${(await page.locator('.ff-log').textContent()).slice(-400)}`);
    const p = await download(page, () => page.locator('.ff-out').first().getByRole('button', { name: dlName }).click());
    return p;
  };
  const runFails = async (re) => {
    await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
    return page.locator('.err-text', { hasText: re }).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  };
  const media = (path) => page.evaluate(async (b64) => {
    const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]);
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob);
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('cannot play')); });
    return { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
  }, readFileSync(path).toString('base64'));
  const audioOf = (path) => page.evaluate(async (b64) => {
    const ctx = new AudioContext(), b = await ctx.decodeAudioData(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer), x = b.getChannelData(0);
    const s = Math.floor(x.length * 0.3), e = Math.floor(x.length * 0.7); let first = -1, last = -1, n = 0, pk = 0;
    for (let i = s + 1; i < e; i++) { pk = Math.max(pk, Math.abs(x[i])); if (x[i - 1] < 0 && x[i] >= 0) { if (first < 0) first = i; else n++; last = i; } }
    return { duration: b.duration, freq: n ? (n * b.sampleRate) / (last - first) : 0, peak: pk };
  }, readFileSync(path).toString('base64'));

  await page.locator('input[type=file]').first().setInputFiles(M('clip.mp4'));
  await page.getByText(/Stream #0:0.*Video: h264/).waitFor({ timeout: 120000 });
  ok(/Audio: aac/.test(await page.locator('.ff-info').textContent()), 'streams probed by FFmpeg (h264 + aac)');
  ok((await page.getByRole('textbox').first().inputValue()).startsWith('ffmpeg -i clip.mp4 -c:v libx264'), `command line shown with the real file name`);

  // convert → WebM (VP9 + Opus)
  await combo('To').selectOption('webm');
  const w = await run(), wb = readFileSync(w);
  ok(wb.readUInt32BE(0) === 0x1a45dfa3 && w.endsWith('-out.webm'), 'MP4 → WebM (EBML header)');
  const wm = await media(w);
  ok(Math.abs(wm.duration - 3) < 0.2 && wm.w === 640, `WebM plays: ${wm.duration.toFixed(2)} s, ${wm.w}×${wm.h}`);

  // extract audio: copy (AAC in M4A), and as MP3
  await task('Extract audio');
  const a1 = mp4Info(readFileSync(await run()));
  ok(a1.audio?.codec === 'mp4a' && !a1.video, 'audio copied to .m4a without re-encoding');
  await combo('Audio as').selectOption('mp3');
  const a2 = await run(), f2 = mp3Frames(readFileSync(a2)), au2 = await audioOf(a2);
  ok(f2.ok && Math.abs(au2.freq - 440) < 3, `audio as MP3: valid frames, 440 Hz (${au2.freq.toFixed(1)})`);

  // remove audio
  await task('Remove audio');
  const m = mp4Info(readFileSync(await run()));
  ok(m.video?.codec === 'avc1' && !m.audio, 'remove audio: video copied, no sound track');

  // trim (fast copy) 1 → 2 s, and exact
  await task('Trim / cut');
  await page.getByLabel('Start (seconds or hh:mm:ss)').fill('1'); await page.getByLabel('End (empty = to the end)').fill('2');
  const t1 = await media(await run());
  ok(Math.abs(t1.duration - 1) < 0.25, `fast trim ≈ 1 s (${t1.duration.toFixed(2)} s)`);
  await page.getByText('Exact cut').click();
  const t2 = await media(await run());
  ok(Math.abs(t2.duration - 1) < 0.08, `exact trim = 1 s (${t2.duration.toFixed(2)} s)`);

  // resize to 240p
  await task('Resize'); await combo('Height').selectOption('240');
  const r = mp4Info(readFileSync(await run()));
  ok(r.video.w === 426 && r.video.h === 240 && r.audio?.codec === 'mp4a', `240p (${r.video.w}×${r.video.h}), sound copied`);

  // rotate 90°
  await task('Rotate / flip');
  const ro = mp4Info(readFileSync(await run()));
  ok(ro.video.w === 360 && ro.video.h === 640, `rotated 90° (${ro.video.w}×${ro.video.h})`);

  // crop to square
  await task('Crop'); await combo('Shape (centre crop)').selectOption('1:1');
  const cr = mp4Info(readFileSync(await run()));
  ok(cr.video.w === 360 && cr.video.h === 360, `square crop (${cr.video.w}×${cr.video.h})`);

  // GIF
  await task('Video → GIF'); await combo('Width').selectOption('320');
  const g = readFileSync(await run());
  ok(g.toString('latin1', 0, 6) === 'GIF89a' && g.readUInt16LE(6) === 320, `GIF89a, 320 px wide (${g.length} bytes)`);

  // speed 2×
  await task('Speed up / slow down');
  const sp = await media(await run());
  ok(Math.abs(sp.duration - 1.5) < 0.12, `2× speed: ${sp.duration.toFixed(2)} s`);

  // frames → zip of 3 PNGs (1 per second)
  await task('Extract frames');
  await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
  await page.getByText(/^3 files/).waitFor({ timeout: 120000 });
  const z = readFileSync(await download(page, () => page.getByRole('button', { name: /Download all as \.zip \(3\)/ }).click()));
  ok(z.readUInt32LE(0) === 0x04034b50 && (z.toString('latin1').match(/frame-000\d\.png/g) || []).length >= 3, 'three frames zipped');
  // JPEG frames: this core's own JPEG encoder crashed the page at -q:v 2 (the tab's old JPEG option) — MozJPEG now
  await combo('As').selectOption('jpg');
  await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
  await page.getByText(/^3 files/).waitFor({ timeout: 120000 });
  const jnames = await page.locator('.ff-out strong').allTextContents();
  const j1 = imageInfo(readFileSync(await download(page, () => page.locator('.ff-out').first().getByRole('button', { name: 'Download' }).click())));
  ok(jnames.join() === 'frame-0001.jpg,frame-0002.jpg,frame-0003.jpg' && j1.type === 'jpeg' && j1.width === 640, `three JPEG frames, made by MozJPEG, the page alive (${jnames.join(', ')})`);
  await combo('As').selectOption('png');

  // merge: clip video + 660 Hz MP3
  await task('Add audio / background music');
  await page.locator('input[type=file]').nth(1).setInputFiles(M('tone.mp3'));
  const mg = await run(), mi = mp4Info(readFileSync(mg)), ma = await audioOf(mg);
  ok(mi.video?.codec === 'avc1' && mi.audio?.codec === 'mp4a' && Math.abs(ma.freq - 660) < 3, `video + new sound (660 Hz: ${ma.freq.toFixed(1)})`);

  // raw arguments: mirror
  await task('Your own arguments');
  await page.getByLabel('FFmpeg arguments').fill('-i in1.mp4 -vf hflip -c:v libx264 -preset ultrafast -c:a copy out.mp4');
  const rw = mp4Info(readFileSync(await run()));
  ok(rw.video?.codec === 'avc1' && rw.video.w === 640, 'own arguments run (hflip)');
  await page.getByLabel('FFmpeg arguments').fill('-i in1.mp4 -frames:v 1 -q:v 2 shot.jpg');
  ok(await runFails(/crash the page while writing JPEG/), 'own arguments writing a JPEG: refused before FFmpeg runs (its JPEG encoder crashes the page)');
  await page.getByLabel('FFmpeg arguments').fill('-i in1.mp4 -vf nosuchfilter out.mp4');
  await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
  await page.locator('.err-text', { hasText: /FFmpeg failed/ }).first().waitFor({ timeout: 60000 });
  ok(/No such filter/i.test(await page.locator('.err-text').first().textContent()) && /nosuchfilter/.test(await page.locator('.ff-log').textContent()), 'a bad command is reported with FFmpeg’s own error and log');

  // audio file: loudness normalise + audio → MP4 waveform
  await page.locator('input[type=file]').first().setInputFiles(M('tone.wav'));
  await page.getByText(/Audio: pcm_s16le/).waitFor({ timeout: 60000 });
  await task('Normalise loudness');
  const ln = await run(), la = await audioOf(ln), orig = readWav(readFileSync(M('tone.wav')));
  const origPeak = orig.data[0].reduce((mx, v) => Math.max(mx, Math.abs(v)), 0);
  ok(Math.abs(la.freq - 440) < 3 && Math.abs(la.peak - origPeak) > 0.05, `loudness normalised (peak ${origPeak.toFixed(2)} → ${la.peak.toFixed(2)})`);
  await task('Audio → MP4 video');
  await page.getByRole('radio', { name: 'Animated waveform' }).click();
  const wv = mp4Info(readFileSync(await run()));
  ok(wv.video?.codec === 'avc1' && wv.video.w === 1280 && wv.audio?.codec === 'mp4a', 'audio → MP4 with an animated waveform (1280×720)');
  await page.getByRole('radio', { name: 'Picture + sound' }).click();
  await page.locator('input[type=file]').nth(1).setInputFiles(I('chelsea.png'));
  const st = mp4Info(readFileSync(await run()));
  ok(st.video?.codec === 'avc1' && st.audio && Math.abs(st.duration - 2) < 0.3, `picture + sound MP4 (${st.duration.toFixed(2)} s)`);

  // ================================================================ the 21 new uses (owner, 20 Nov 2026)
  // the mean colour of a rectangle of a frame, and the share of its pixels that differ from another video's frame
  const frame = (path, t) => page.evaluate(async ({ b64, t }) => {
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('cannot play')); });
    v.currentTime = t; await new Promise((r) => { v.onseeked = r; });
    const c = new OffscreenCanvas(v.videoWidth, v.videoHeight), g = c.getContext('2d'); g.drawImage(v, 0, 0);
    return { w: c.width, h: c.height, d: [...g.getImageData(0, 0, c.width, c.height).data] };
  }, { b64: readFileSync(path).toString('base64'), t });
  const mean = (f, [x0, y0, x1, y1]) => { let r = 0, g = 0, b = 0, n = 0; for (let y = Math.floor(y0 * f.h); y < Math.floor(y1 * f.h); y++) for (let x = Math.floor(x0 * f.w); x < Math.floor(x1 * f.w); x++) { const i = (y * f.w + x) * 4; r += f.d[i]; g += f.d[i + 1]; b += f.d[i + 2]; n++; } return [r / n, g / n, b / n]; };
  const changed = (a, b, [x0, y0, x1, y1]) => { let c = 0, n = 0; for (let y = Math.floor(y0 * a.h); y < Math.floor(y1 * a.h); y++) for (let x = Math.floor(x0 * a.w); x < Math.floor(x1 * a.w); x++) { const i = (y * a.w + x) * 4; n++; if (Math.abs(a.d[i] - b.d[i]) > 60 || Math.abs(a.d[i + 1] - b.d[i + 1]) > 60 || Math.abs(a.d[i + 2] - b.d[i + 2]) > 60) c++; } return c / n; };
  const choose = async (path, re) => { await page.locator('input[type=file]').first().setInputFiles(path); await page.locator('.ff-info').getByText(re).first().waitFor({ timeout: 60000 }); };
  const groups = await combo('Task').evaluate((s) => [...s.querySelectorAll('optgroup')].map((g) => `${g.label}: ${g.children.length}`));
  ok(groups.join(' | ') === 'Convert and extract: 8 | Cut and join: 6 | Size and shape: 6 | Picture: 8 | Speed: 2 | Sound: 5 | Subtitles: 3 | Expert: 1', `tasks in groups: ${groups.join(' | ')}`);

  await choose(M('clip.mp4'), /Video: h264/);
  const orig1 = await frame(M('clip.mp4'), 1);
  // picture at a moment, contact sheet
  await task('Picture at a moment (thumbnail)'); await page.getByLabel('At (seconds or mm:ss)').fill('1.5');
  let im = imageInfo(readFileSync(await run()));
  ok(im.type === 'jpeg' && im.width === 640 && im.height === 360, `thumbnail at 1.5 s: a 640 × 360 JPEG`);
  await page.getByLabel('At (seconds or mm:ss)').fill('9');
  ok(/only 3 s long/.test(await page.locator('.field', { hasText: 'Command (copy it' }).locator('textarea').inputValue()), 'a moment after the end: the command box says why');
  ok(await runFails(/only 3 s long/), '… and Run says so without starting FFmpeg');
  await task('Contact sheet (grid of frames)'); await combo('Grid').selectOption('3x3');
  im = imageInfo(readFileSync(await run()));
  ok(im.type === 'jpeg' && im.width === 6 + 3 * 326 && im.height === 6 + 3 * 186, `contact sheet 3 × 3: ${im.width} × ${im.height}`);
  // cut a part out, loop, boomerang, reverse
  await task('Cut a part out'); await page.getByLabel('Cut out from (seconds or mm:ss)').fill('1'); await page.getByLabel('to', { exact: true }).fill('2');
  let ci = mp4Info(readFileSync(await run()));
  ok(Math.abs(ci.duration - 2) < 0.12 && ci.video && ci.audio, `cut out 1 – 2 s: ${ci.duration.toFixed(2)} s with picture and sound`);
  await task('Loop / boomerang'); await combo('Make').selectOption('2');
  ok(Math.abs((await media(await run())).duration - 6) < 0.15, 'loop twice: 6 s');
  await combo('Make').selectOption('boomerang');
  const bo = await run(); ci = mp4Info(readFileSync(bo));
  ok(Math.abs(ci.duration - 6) < 0.15 && !ci.audio, `boomerang: ${ci.duration.toFixed(2)} s, no sound`);
  await task('Reverse');
  const rv = await run(), rvLast = await frame(M('clip.mp4'), 2.96), rvFirst = await frame(rv, 0);
  ok(changed(rvLast, rvFirst, [0.1, 0.1, 0.9, 0.9]) < 0.05, 'reverse: the first picture is the original\'s last');
  // size and shape
  await task('Fit to a shape (blurred background or bars)');
  let fs = await frame(await run(), 1);
  ok(fs.w === 720 && fs.h === 1280 && !mean(fs, [0.1, 0.02, 0.9, 0.15]).every((x) => x < 15), `fit to 9:16 with a blurred copy: 720 × 1280, the top not black`);
  await combo('Around the video').selectOption('black');
  fs = await frame(await run(), 1);
  ok(mean(fs, [0.1, 0.02, 0.9, 0.15]).every((x) => x < 12), 'fit to 9:16 with black bars');
  // picture
  await task('Colours (brightness, contrast, black and white)');
  ok(await runFails(/change nothing/), 'colours with nothing changed: said');
  await page.locator('label.switch', { hasText: 'Black and white' }).click();
  const bwf = await frame(await run(), 1);
  let grey = 0; for (let i = 0; i < bwf.d.length; i += 4) if (Math.max(bwf.d[i], bwf.d[i + 1], bwf.d[i + 2]) - Math.min(bwf.d[i], bwf.d[i + 1], bwf.d[i + 2]) <= 8) grey++;
  const greyShare = grey / (bwf.d.length / 4);
  let grey0 = 0; for (let i = 0; i < orig1.d.length; i += 4) if (Math.max(orig1.d[i], orig1.d[i + 1], orig1.d[i + 2]) - Math.min(orig1.d[i], orig1.d[i + 1], orig1.d[i + 2]) <= 8) grey0++;
  ok(greyShare > 0.97 && grey0 / (orig1.d.length / 4) < 0.5, `black and white: ${(greyShare * 100).toFixed(1)} % of the pixels grey (the original ${(grey0 / (orig1.d.length / 4) * 100).toFixed(0)} %)`);
  for (const t of ['Stabilise a shaky video', 'Clean up a grainy video', 'Deinterlace (old camcorder / TV)']) {
    await task(t);
    const r = mp4Info(readFileSync(await run()));
    ok(r.video?.w === 640 && Math.abs(r.duration - 3) < 0.12 && r.audio, `${t}: 640 px, 3 s, sound kept`);
  }
  await task('Fade in / fade out');
  const fd = await run();
  ok(mean(await frame(fd, 0), [0, 0, 1, 1]).every((x) => x < 10) && mean(await frame(fd, 1.5), [0, 0, 1, 1]).some((x) => x > 40), 'fade: black at the start, the picture in the middle');
  await task('Text on the video');
  await page.getByLabel('Text', { exact: true }).fill('SUPERTOOLS'); await combo('Size').selectOption('large'); await combo('Colour').selectOption('yellow');
  const tx = await frame(await run(), 1);
  ok(changed(orig1, tx, [0.1, 0.8, 0.9, 0.97]) > 0.03 && changed(orig1, tx, [0.1, 0.1, 0.9, 0.5]) < 0.01, `text at the bottom (${(changed(orig1, tx, [0.1, 0.8, 0.9, 0.97]) * 100).toFixed(1)} % of that strip changed), the rest untouched`);
  await page.getByLabel('Text', { exact: true }).fill(' ');
  ok(await runFails(/Type the text/), 'empty text: said');
  await task('Logo on the video');
  ok(await runFails(/Choose the logo picture/), 'logo without a picture: said');
  await page.locator('input[type=file]').nth(1).setInputFiles(I('astronaut.png'));
  await combo('Width').selectOption('20');
  const lg = await frame(await run(), 1);
  ok(changed(orig1, lg, [0.78, 0.6, 0.96, 0.96]) > 0.3 && changed(orig1, lg, [0.03, 0.03, 0.3, 0.3]) < 0.01, 'logo in the bottom-right corner only');
  await task('Picture-in-picture');
  await page.locator('input[type=file]').nth(1).setInputFiles(M('clip.webm'));
  ci = mp4Info(readFileSync(await run()));
  ok(ci.video?.w === 640 && Math.abs(ci.duration - 3) < 0.12, 'picture-in-picture: the big video\'s size and length');
  // speed
  await task('Timelapse (8× – 60×)');
  ok(await runFails(/under half a second/), 'timelapse of a 3 s clip at 8×: said');
  // sound
  await task('Volume'); await combo('Volume').selectOption('0.5');
  const vo = await run(), vi = mp4Info(readFileSync(vo)), va = await audioOf(vo), vOrig = await audioOf(M('clip.mp4'));
  ok(vi.video?.codec === 'avc1' && Math.abs(va.peak / vOrig.peak - 0.5) < 0.06, `volume 50 % of a video: picture copied, peak ${vOrig.peak.toFixed(2)} → ${va.peak.toFixed(2)}`);
  await task('Add audio / background music'); await page.getByRole('radio', { name: 'Music under the sound' }).click();
  await page.locator('input[type=file]').nth(1).setInputFiles(M('tone.mp3'));
  ci = mp4Info(readFileSync(await run()));
  ok(ci.video?.codec === 'avc1' && ci.audio?.codec === 'mp4a' && Math.abs(ci.duration - 3) < 0.15, `music under the sound: ${ci.duration.toFixed(2)} s (the 2 s music repeats)`);
  await task('Sound settings (mono, stereo, sample rate)');
  ok(await runFails(/change nothing/), 'sound settings unchanged: said');
  await combo('Channels').selectOption('2');
  const st2 = await run(), ch = await page.evaluate(async (b64) => { const c = new AudioContext(); const b = await c.decodeAudioData(Uint8Array.from(atob(b64), (x) => x.charCodeAt(0)).buffer); return b.numberOfChannels; }, readFileSync(st2).toString('base64'));
  ok(ch === 2 && mp4Info(readFileSync(st2)).video?.codec === 'avc1', 'stereo from a mono video, picture copied');
  // subtitles
  await task('Add subtitles as a track');
  await page.locator('input[type=file]').nth(1).setInputFiles(M('subs.srt'));
  const sa = readFileSync(await run());
  ok(sa.includes(Buffer.from('tx3g')) && sa.includes(Buffer.from('Hello from SuperTools')), 'subtitles added to the MP4 as a text track (tx3g)');
  await task('Burn in subtitles');
  const sb = await frame(await run(), 0.6), o06 = await frame(M('clip.mp4'), 0.6);
  ok(changed(o06, sb, [0.15, 0.82, 0.85, 1]) > 0.03 && changed(o06, sb, [0.1, 0.2, 0.9, 0.6]) < 0.01, `burn in subtitles: text at the bottom (${(changed(o06, sb, [0.15, 0.82, 0.85, 1]) * 100).toFixed(1)} %)`);
  // a video with its own subtitle track
  await choose(M('clip-subs.mkv'), /Subtitle: subrip/);
  await task('Extract subtitles');
  const srt = readFileSync(await run(), 'utf8');
  ok(/Hello from SuperTools/.test(srt) && /Second line — with a dash/.test(srt) && /00:00:02,500 --> 00:00:02,900/.test(srt), 'subtitles extracted from the MKV as SRT ');
  await task('Burn in subtitles');
  const sb2 = await frame(await run(), 0.6);
  ok(changed(o06, sb2, [0.15, 0.82, 0.85, 1]) > 0.03, 'burn in the video\'s own subtitle track');
  // joining: the clip, a silent 320 × 240 clip
  await choose(M('clip.mp4'), /Video: h264/);
  await task('Join clips');
  ok(await runFails(/Add at least one more clip/), 'join one clip: said');
  await page.locator('input[type=file]').nth(2).setInputFiles(M('silent-320.mp4'));
  await page.locator('.ff-clips li').nth(1).getByText('00:01').waitFor({ timeout: 30000 }).catch(() => {});
  const jn = await run(); ci = mp4Info(readFileSync(jn));
  ok(Math.abs(ci.duration - 4.5) < 0.2 && ci.video?.w === 640 && ci.video?.h === 360 && ci.audio, `join a 3 s clip and a silent 320 × 240 one: ${ci.duration.toFixed(2)} s, 640 × 360, with sound`);
  ok(mean(await frame(jn, 3.8), [0, 0, 0.08, 1]).every((x) => x < 20), '… black bars beside the smaller clip');
  await page.locator('label.switch', { hasText: 'Fast — clips from the same camera' }).click();
  ok(await runFails(/differ in size or format/), 'fast join of different clips: said');
  await page.getByRole('button', { name: 'Remove clip 2' }).click();
  await page.locator('input[type=file]').nth(2).setInputFiles(M('clip.mp4'));
  await page.waitForTimeout(1500);
  ok(Math.abs((await media(await run())).duration - 6) < 0.15, 'fast join of the clip twice: 6 s');
  // splitting and timelapse: a 6 s clip with a key frame every second
  await choose(M('kf6.mp4'), /Video: h264/);
  await task('Split into equal parts'); await page.getByRole('radio', { name: 'Number of parts' }).click(); await combo('Parts').selectOption('3');
  await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
  await page.getByText(/^3 files/).waitFor({ timeout: 120000 });
  const parts = await page.locator('.ff-out strong').allTextContents();
  ok(parts.join() === 'part-000.mp4,part-001.mp4,part-002.mp4', `split into 3 parts: ${parts.join(', ')}`);
  const pz = readFileSync(await download(page, () => page.getByRole('button', { name: /Download all as \.zip \(3\)/ }).click()));
  ok(pz.readUInt32LE(0) === 0x04034b50 && /kf6-parts\.zip$/.test(await page.evaluate(() => 'kf6-parts.zip')), 'the parts as one zip');
  await task('Timelapse (8× – 60×)');
  ci = mp4Info(readFileSync(await run()));
  ok(Math.abs(ci.duration - 0.75) < 0.1 && !ci.audio, `timelapse 8× of 6 s: ${ci.duration.toFixed(2)} s, no sound`);
  // sound files: silence removal (FFmpeg 5.1's reading), fades
  await choose(M('pauses.wav'), /Audio: pcm_s16le/);
  await task('Remove silence');
  let sl = await audioOf(await run());
  ok(Math.abs(sl.duration - 3.7) < 0.2, `remove silence at the start and end of 1 + 1 + 1.5 + 1 + 1 s: ${sl.duration.toFixed(2)} s`);
  // FFmpeg 5.1 (this core): a pause longer than the setting is cut to 0.25 s; the last pause of exactly 1 s is not
  // longer than 1 s and stays
  await page.getByRole('radio', { name: 'Every pause' }).click();
  sl = await audioOf(await run());
  ok(Math.abs(sl.duration - 3.47) < 0.15, `remove every pause over 1 s: ${sl.duration.toFixed(2)} s (the 1.5 s pause cut short, the closing 1 s one kept)`);
  await combo('Pauses longer than').selectOption('0.5');
  sl = await audioOf(await run());
  ok(Math.abs(sl.duration - 2.85) < 0.2, `remove every pause over 0.5 s: ${sl.duration.toFixed(2)} s (both pauses cut short)`);
  await task('Fade in / fade out');
  const fw = await run();
  ok(/\.wav$/.test(fw) && readWav(readFileSync(fw)).data[0].length > 0, 'fade on a WAV: still a WAV');
  await task('Remove audio');
  ok(await runFails(/needs a video — this file has no picture/), 'a video task on a sound file: said');
  // Stop: said as stopped, not as an error (it showed "called FFmpeg.terminate()" in red); a new file during a job ends
  // the job (its probe reset the job's log, and the outputs took the new file's name).
  // On a fresh page: on this long session's page (about 60 jobs on one FFmpeg) Chromium's renderer segfaulted — signal 11
  // inside its own compiled code, always at the same place — when Stop ended a command and Run started a new FFmpeg
  // (4 runs of 4, the headless shell of Chrome for Testing 153.0.8010.12; never in a short session; a 2 s pause before
  // the new FFmpeg did not help). A page cannot make the browser segfault: docs/BUGHUNT.md, "FFmpeg after a long session".
  // (E2E_FF_SAME_PAGE=1 keeps the long session's page, to look at that crash again — with E2E_CHANNEL=chromium too)
  const longErrors = process.env.E2E_FF_SAME_PAGE ? [] : page.errors;
  if (!process.env.E2E_FF_SAME_PAGE) { page = await newPage({ viewport: { width: 1280, height: 1100 } }); await page.goto(`${base}#/ffmpeg`); }
  await choose(M('clip.mp4'), /Video: h264/);
  // (Stop once FFmpeg is inside its command: a fixed 1.5 s wait raced the end of a job that takes 1.6 s on a warm engine)
  await task('Stabilise a shaky video');
  await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
  await page.getByText(/^Working/).first().waitFor({ timeout: 60000 });
  await page.locator('.actions').getByRole('button', { name: 'Stop' }).click();
  await page.waitForTimeout(500);
  ok(await page.getByText('Stopped.', { exact: true }).isVisible() && !(await page.locator('.err-text').count()) && await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).isVisible(), 'Stop: "Stopped.", no error, Run again');
  // Stop while FFmpeg is still loading (the Stop above ended it inside a command, so this Run loads a new one): the job
  // ended after the load and ran to the end anyway
  await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
  await page.waitForTimeout(150); await page.locator('.actions').getByRole('button', { name: 'Stop' }).click();
  // "Stopped." comes once FFmpeg has loaded (the job ends at its next step) — then nothing may run: no output, no "Working"
  // (a fixed 12 s wait was too short for a load after a long session on the full Chromium, and could not see a job that
  // went on later)
  const stoppedSaid = await page.getByText('Stopped.', { exact: true }).waitFor({ timeout: 60000 }).then(() => true, () => false);
  await page.waitForTimeout(5000);
  const outVisible = await page.locator('.ff-out').evaluateAll((els) => els.some((e) => e.offsetParent)), working = await page.getByText(/^Working/).first().isVisible().catch(() => false);
  ok(stoppedSaid && !outVisible && !working && await page.getByText('Stopped.', { exact: true }).isVisible(), `Stop while FFmpeg loads: "Stopped." — and the job does not run after the load (it did) (said: ${stoppedSaid}, output: ${outVisible}, working: ${working})`);
  // a new file while the command runs: the job ends, and its note stays while the new file is read (the probe loads a
  // new FFmpeg, and the loader wrote over the note, then cleared it)
  await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
  await page.getByText(/^Working/).first().waitFor({ timeout: 60000 });
  await choose(M('kf6.mp4'), /Video: h264/);
  ok(await page.getByText('Stopped: a new file was chosen (kf6.mp4).').isVisible() && !(await page.locator('.err-text').count()), 'a new file during a job ends the job, without an error — the note stays while the new file is read');
  await task('Remove audio');
  const kn = await run();
  ok(/kf6-out\.mp4$/.test(kn), `the next job is of the new file and named after it (${kn.split('/').pop()})`);
  const errs = [...longErrors, ...page.errors].filter((e) => !/FFmpeg failed|only 3 s long|change nothing|Type the text|Choose the logo|under half a second|at least one more clip|differ in size|needs a video/.test(e)); // refusals, logged by the button
  ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  info('ffmpeg.wasm 0.12 core (FFmpeg 5.1.4)');
};
