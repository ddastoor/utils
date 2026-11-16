// FFmpeg (#/ffmpeg, PC): ffmpeg.wasm presets on real clips; outputs checked by container bytes, MP4 boxes and by
// decoding them in the browser.
import { readFileSync } from 'node:fs';
import { mp4Info } from './video.e2e.mjs';
import { mp3Frames, readWav } from './audio.e2e.mjs';
const M = (n) => new URL(`../fixtures/media/${n}`, import.meta.url).pathname;
const I = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(`${base}#/ffmpeg`);
  const combo = (name) => page.getByRole('combobox', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });
  const task = (label) => combo('Task').selectOption({ label });
  const run = async (dlName = 'Download') => {
    await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
    await page.locator('.ff-out').first().waitFor({ timeout: 180000 });
    const p = await download(page, () => page.locator('.ff-out').first().getByRole('button', { name: dlName }).click());
    return p;
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

  // merge: clip video + 660 Hz MP3
  await task('Add audio to video');
  await page.locator('input[type=file]').nth(1).setInputFiles(M('tone.mp3'));
  const mg = await run(), mi = mp4Info(readFileSync(mg)), ma = await audioOf(mg);
  ok(mi.video?.codec === 'avc1' && mi.audio?.codec === 'mp4a' && Math.abs(ma.freq - 660) < 3, `video + new sound (660 Hz: ${ma.freq.toFixed(1)})`);

  // raw arguments: mirror
  await task('Your own arguments');
  await page.getByLabel('FFmpeg arguments').fill('-i in1.mp4 -vf hflip -c:v libx264 -preset ultrafast -c:a copy out.mp4');
  const rw = mp4Info(readFileSync(await run()));
  ok(rw.video?.codec === 'avc1' && rw.video.w === 640, 'own arguments run (hflip)');
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
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
  info('ffmpeg.wasm 0.12 core (FFmpeg 5.1.4)');
};
