// Audio Recorder (#/audio): record the (fake) microphone, trim on the waveform, MP3 (own LAME wasm) / WAV / original
// codec (mediabunny copy) downloads, normalise + fades; known answers from a generated 440 Hz / silence / 880 Hz WAV.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 16-bit PCM WAV from planar float channels. */
export function makeWav(chs, sr) {
  const n = chs[0].length, c = chs.length, b = Buffer.alloc(44 + n * c * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * c * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * c * 2, 28); b.writeUInt16LE(c * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * c * 2, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chs[k][i])) * 32767), 44 + (i * c + k) * 2);
  return b;
}
export function readWav(buf) {
  const sr = buf.readUInt32LE(24), ch = buf.readUInt16LE(22), bits = buf.readUInt16LE(34);
  let o = 12; while (o < buf.length && buf.toString('latin1', o, o + 4) !== 'data') o += 8 + buf.readUInt32LE(o + 4);
  const len = buf.readUInt32LE(o + 4), n = len / ch / (bits / 8), data = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) data[k][i] = bits === 16 ? buf.readInt16LE(o + 8 + (i * ch + k) * 2) / 32768 : buf.readFloatLE(o + 8 + (i * ch + k) * 4);
  return { sr, ch, bits, n, data, riff: buf.toString('latin1', 0, 4) + buf.toString('latin1', 8, 12) };
}
export const freqOf = (x, sr) => { const s = Math.floor(x.length * 0.2), e = Math.floor(x.length * 0.8); let first = -1, last = -1, n = 0; for (let i = s + 1; i < e; i++) if (x[i - 1] < 0 && x[i] >= 0) { const at = i - 1 + -x[i - 1] / (x[i] - x[i - 1]); if (first < 0) first = at; else n++; last = at; } return n ? (n * sr) / (last - first) : 0; };
export const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
/** Valid chain of MPEG audio frames? Returns { ok, frames, sr }. */
export function mp3Frames(b) {
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let o = 0, n = 0, sr = 0;
  const rates = []; // the bitrate of every frame, kb/s (the first of LAME's files is its Info / Xing frame)
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) o = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]); // skip an ID3v2 tag
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return { ok: false, frames: n, sr, rates };
    const ver = (b[o + 1] >> 3) & 3, br = (ver === 3 ? BR1 : BR2)[b[o + 2] >> 4]; sr = SR[ver][(b[o + 2] >> 2) & 3]; rates.push(br);
    o += Math.floor(((ver === 3 ? 144 : 72) * br * 1000) / sr) + ((b[o + 2] >> 1) & 1); n++;
  }
  return { ok: o === b.length, frames: n, sr, samplesPerFrame: 1152, rates };
}

export default async ({ base, page: newPage, ok, info, download, tmp }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${base}#/audio`);
  const save = () => download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click())
    .catch(async (e) => { throw new Error(`${e.message.split('\n')[0]} — status: ${(await page.locator('[aria-live]').allTextContents()).join(' | ')}`); });
  const fmt = (name) => page.getByRole('radio', { name, exact: true }).click();
  /** decode a downloaded file with the browser's own decoder */
  const decode = (path) => page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(bytes.buffer); const x = buf.getChannelData(0);
    let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
    const s = Math.floor(x.length * 0.3), e = Math.floor(x.length * 0.7); let first = -1, last = -1, n = 0;
    for (let i = s + 1; i < e; i++) if (x[i - 1] < 0 && x[i] >= 0) { if (first < 0) first = i; else n++; last = i; }
    return { duration: buf.duration, sr: buf.sampleRate, ch: buf.numberOfChannels, peak: pk, freq: n ? (n * buf.sampleRate) / (last - first) : 0 };
  }, readFileSync(path).toString('base64'));

  // ---- 1. record the fake microphone for ~2.5 s
  ok(await page.getByRole('button', { name: 'Record' }).isEnabled(), 'Record button ready');
  // wall-clock times of each click, so the check holds even on a busy machine
  const now = () => page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Record' }).click();
  await page.getByText('Recording…').waitFor({ timeout: 10000 });
  const tStart = await now();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Pause' }).click();
  const tPause = await now();
  await page.waitForTimeout(700);
  ok(await page.getByText('Paused').isVisible(), 'pause');
  await page.getByRole('button', { name: 'Resume' }).click();
  const tResume = await now();
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Stop' }).click();
  const tStop = await now();
  await page.getByText(/^Recording: \d/).waitFor({ timeout: 15000 });
  const recSecs = +(/Recording: ([\d.]+) s/.exec(await page.getByText(/^Recording: \d/).textContent())[1]);
  const expect = (tStop - tStart - (tResume - tPause)) / 1000;
  ok(Math.abs(recSecs - expect) < 0.7 && recSecs < (tStop - tStart) / 1000 - 0.3, `recorded ≈ ${expect.toFixed(1)} s without the paused part (${recSecs} s)`);
  ok(await page.locator('canvas.wave').isVisible(), 'waveform editor shown');

  const mp3 = await save(), m = mp3Frames(readFileSync(mp3)), dm = await decode(mp3);
  ok(mp3.endsWith('.mp3') && m.ok, `MP3 download: valid MPEG frames (${m.frames} frames, ${m.sr} Hz)`);
  ok(Math.abs(dm.duration - recSecs) < 0.15, `MP3 plays for the recorded time (${dm.duration.toFixed(2)} s)`);
  await fmt('WAV');
  const wav = readWav(readFileSync(await save()));
  ok(wav.riff === 'RIFFWAVE' && wav.bits === 16 && Math.abs(wav.n / wav.sr - recSecs) < 0.06, `WAV download: ${wav.n} samples at ${wav.sr} Hz`);
  await fmt('Original');
  const orig = await save(), ob = readFileSync(orig);
  ok(orig.endsWith('.webm') && ob.readUInt32BE(0) === 0x1a45dfa3, 'Original: WebM (Opus) as recorded');
  const dorig = await decode(orig);
  ok(Math.abs(dorig.duration - recSecs) < 0.1, `Original remuxed with a duration (${dorig.duration.toFixed(2)} s)`);

  // ---- 2. known answers: 440 Hz (1 s) · silence (1 s) · 880 Hz (1 s), 44.1 kHz stereo
  const sr = 44100, N = sr * 3, L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) { const t = i / sr, v = t < 1 ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : t < 2 ? 0 : 0.5 * Math.sin(2 * Math.PI * 880 * t); L[i] = v; R[i] = v * 0.5; }
  const fx = join(tmp, 'tones.wav'); writeFileSync(fx, makeWav([L, R], sr));
  await page.locator('input[type=file]').setInputFiles(fx);
  await page.getByText(/tones\.wav: 3\.0 s · 2 channels/).waitFor({ timeout: 15000 });
  // the file's own rate (a plain AudioContext decoded at the device's rate, and saved so)
  const ctxRate = +(/([\d,]+) Hz/.exec(await page.getByText(/tones\.wav: 3\.0 s/).textContent())[1].replace(/,/g, ''));
  ok(ctxRate === 44100, `the file's rate is shown and kept: ${ctxRate} Hz`);
  await page.getByLabel('Start (seconds)').fill('2');
  await page.getByLabel('End (seconds)').fill('3');
  ok(/Selection 0:02\.0\d* – 0:03\.0\d* · 1\.00 s/.test(await page.getByText(/^Selection/).textContent()), 'selection set from the time boxes');
  await fmt('WAV');
  const w2 = readWav(readFileSync(await save()));
  ok(w2.ch === 2 && w2.sr === 44100 && w2.n === 44100, `trimmed WAV is exactly 1 s at the file's 44.1 kHz, stereo (${w2.n} samples at ${w2.sr} Hz)`);
  // the samples themselves: the WAV holds the file's samples from 2.00 s on, unchanged but for 16-bit rounding
  { let worst = 0; for (let i = 0; i < 44100; i++) worst = Math.max(worst, Math.abs(w2.data[0][i] - Math.round(L[2 * 44100 + i] * 32767) / 32768)); ok(worst === 0, `sample for sample the file's own, exactly (largest difference ${(worst * 32768).toFixed(2)} of a 16-bit step; saving with ×32767 made it 1)`); }
  ok(Math.abs(freqOf(w2.data[0], w2.sr) - 880) < 2 && Math.abs(peakOf(w2.data[0]) - 0.5) < 0.02 && Math.abs(peakOf(w2.data[1]) - 0.25) < 0.02, `trimmed part is the 880 Hz tone (${freqOf(w2.data[0], w2.sr).toFixed(1)} Hz), channel levels kept`);
  await fmt('MP3');
  await page.getByLabel('MP3 quality').selectOption('320');
  const m2 = await save(), dm2 = await decode(m2);
  ok(mp3Frames(readFileSync(m2)).ok && Math.abs(dm2.duration - 1) < 0.06 && Math.abs(dm2.freq - 880) < 3 && dm2.ch === 2, `trimmed MP3 320 kbps: ${dm2.duration.toFixed(3)} s, ${dm2.freq.toFixed(1)} Hz, stereo`);
  await fmt('Original');
  const o2 = readWav(readFileSync(await save()));
  ok(o2.sr === 44100 && Math.abs(o2.n - 44100) < 50 && Math.abs(freqOf(o2.data[0], 44100) - 880) < 2, `Original (WAV) cut without resampling: ${o2.n} samples at ${o2.sr} Hz`);

  // drag the left edge on the waveform: start moves to about a third
  const box = await page.locator('canvas.wave').boundingBox();
  await page.mouse.move(box.x + box.width * 0.66, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
  const st = +(await page.getByLabel('Start (seconds)').inputValue());
  ok(Math.abs(st - 1) < 0.05, `dragging the start edge on the waveform (${st} s)`);
  await page.getByRole('button', { name: 'Whole recording' }).click();
  ok(+(await page.getByLabel('End (seconds)').inputValue()) === 3 && +(await page.getByLabel('Start (seconds)').inputValue()) === 0, 'reset to the whole file');

  // ---- 3. normalise + fades
  await page.getByText('Even out the volume').click();
  await page.getByText('Fade in and out').click();
  await fmt('WAV');
  const w3 = readWav(readFileSync(await save())), x = w3.data[0], r = w3.sr;
  ok(Math.abs(peakOf(x) - 10 ** (-1 / 20)) < 0.01, `normalised: loudest point −1 dB (${peakOf(x).toFixed(3)})`);
  const env = (t) => peakOf(x.subarray(Math.round(t * r), Math.round((t + 0.01) * r)));
  ok(env(0) < 0.05 && Math.abs(env(0.15) / peakOf(x) - 0.5) < 0.1 && env(0.6) / peakOf(x) > 0.95 && env(2.99) < 0.06, `fades: start ${env(0).toFixed(2)}, 0.15 s ${(env(0.15) / peakOf(x)).toFixed(2)}, end ${env(2.99).toFixed(2)}`);
  await fmt('Original');
  await page.locator('.actions').getByRole('button', { name: 'Download' }).click();
  ok(await page.getByText('need re-encoding').first().isVisible(), 'Original with volume/fade changes explains MP3/WAV are needed');

  // ---- 4. play the selection
  await page.locator('.actions').getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('.actions').getByRole('button', { name: 'Stop' }).isVisible(), 'Play turns into Stop while playing');
  await page.locator('.actions').getByRole('button', { name: 'Stop' }).click();
  info(`context rate ${ctxRate} Hz; recording ${recSecs} s`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
};
