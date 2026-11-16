// Video Compressor (#/video): WebCodecs (H.264 / AV1) + mediabunny. Checks the MP4 boxes (codecs, size), plays the
// result in the browser (duration, dimensions) and compares a decoded frame with the original.
import { readFileSync } from 'node:fs';
const M = (n) => new URL(`../fixtures/media/${n}`, import.meta.url).pathname;

/** Minimal ISO-BMFF walk: track kinds, sample-entry codes, tkhd sizes, movie duration. */
export function mp4Info(b) {
  const tracks = []; let duration = 0;
  const walk = (s, e, path) => {
    let o = s;
    while (o + 8 <= e) {
      let size = b.readUInt32BE(o); const type = b.toString('latin1', o + 4, o + 8); let hdr = 8;
      if (size === 1) { size = Number(b.readBigUInt64BE(o + 8)); hdr = 16; } else if (size === 0) size = e - o;
      if (size < 8) break;
      const p = [...path, type];
      if (type === 'mvhd') { const v = b[o + hdr]; const ts = v ? b.readUInt32BE(o + hdr + 20) : b.readUInt32BE(o + hdr + 12); const d = v ? Number(b.readBigUInt64BE(o + hdr + 24)) : b.readUInt32BE(o + hdr + 16); duration = d / ts; }
      if (type === 'trak') tracks.push({});
      if (type === 'tkhd') { const t = tracks[tracks.length - 1]; t.w = b.readUInt32BE(o + size - 8) / 65536; t.h = b.readUInt32BE(o + size - 4) / 65536; }
      if (type === 'hdlr') tracks[tracks.length - 1].kind = b.toString('latin1', o + hdr + 8, o + hdr + 12);
      if (type === 'stsd') tracks[tracks.length - 1].codec = b.toString('latin1', o + hdr + 12, o + hdr + 16);
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) walk(o + hdr, o + size, p);
      o += size;
    }
  };
  walk(0, b.length, []);
  return { duration, tracks, video: tracks.find((t) => t.kind === 'vide'), audio: tracks.find((t) => t.kind === 'soun') };
}

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(`${base}#/video`);
  const compress = async () => { await page.locator('.actions').getByRole('button', { name: /^Compress/ }).click(); await page.locator('.vid-result .vid-big').waitFor({ timeout: 120000 }); return download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click()); };
  /** decode in the browser: duration, size, mean RGB difference of the frame at 1.0 s vs the original */
  const play = (path, orig) => page.evaluate(async ([b64, o64]) => {
    const load = async (b) => { const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))])); await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('cannot play')); }); return v; };
    const frame = async (v, w, h) => { v.currentTime = 1.0; await new Promise((r) => (v.onseeked = r)); const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(v, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
    const a = await load(b64), bb = await load(o64);
    const fa = await frame(a, 160, 90), fb = await frame(bb, 160, 90);
    let d = 0; for (let i = 0; i < fa.length; i += 4) d += Math.abs(fa[i] - fb[i]) + Math.abs(fa[i + 1] - fb[i + 1]) + Math.abs(fa[i + 2] - fb[i + 2]);
    return { duration: a.duration, w: a.videoWidth, h: a.videoHeight, diff: d / (fa.length / 4) / 3 };
  }, [readFileSync(path).toString('base64'), readFileSync(orig).toString('base64')]);

  // ---- MP4 (H.264 + AAC), medium quality
  await page.locator('input[type=file]').setInputFiles(M('clip.mp4'));
  await page.getByText(/clip\.mp4: .* 640×360 · 25 fps · AVC/).waitFor({ timeout: 20000 });
  ok(await page.getByText(/sound AAC/).isVisible(), 'original info: AVC video, AAC sound');
  const f1 = await compress(), i1 = mp4Info(readFileSync(f1)), size0 = readFileSync(M('clip.mp4')).length;
  ok(readFileSync(f1).length < size0 * 0.8, `Medium: smaller (${Math.round(size0 / 1024)} → ${Math.round(readFileSync(f1).length / 1024)} KB)`);
  ok(i1.video?.codec === 'avc1' && i1.video.w === 640 && i1.video.h === 360, `H.264 640×360 (${i1.video?.codec} ${i1.video?.w}×${i1.video?.h})`);
  ok(i1.audio?.codec === 'mp4a', 'AAC sound copied (no re-encoding)');
  ok(Math.abs(i1.duration - 3) < 0.15, `duration kept (${i1.duration.toFixed(2)} s)`);
  const p1 = await play(f1, M('clip.mp4'));
  ok(Math.abs(p1.duration - 3) < 0.15 && p1.w === 640 && p1.diff < 12, `plays: ${p1.duration.toFixed(2)} s, frame at 1 s matches the original (mean diff ${p1.diff.toFixed(1)})`);
  ok(/-small\.mp4$/.test(f1), 'file name ends with -small.mp4');

  // ---- 240p, no sound
  await page.getByLabel('Resolution').selectOption('240');
  await page.getByLabel('Sound').selectOption('remove');
  const f2 = await compress(), i2 = mp4Info(readFileSync(f2));
  ok(i2.video.w === 426 && i2.video.h === 240 && !i2.audio, `240p without sound (${i2.video.w}×${i2.video.h}, ${i2.tracks.length} track)`);

  // ---- target size 150 KB (with sound), retried if the encoder overshoots
  await page.getByLabel('Resolution').selectOption('0'); await page.getByLabel('Sound').selectOption('keep');
  await page.getByRole('radio', { name: 'To a size' }).click();
  await page.getByRole('combobox', { name: /^Target/ }).selectOption('custom');
  await page.getByLabel('Target size (MB)').fill('0.15');
  const f3 = await compress(), s3 = readFileSync(f3).length;
  ok(s3 <= 0.15 * 1048576 && s3 > 0.08 * 1048576, `target 150 KB → ${Math.round(s3 / 1024)} KB`);
  await page.getByLabel('Target size (MB)').fill('0.005');
  await page.locator('.actions').getByRole('button', { name: /^Compress/ }).click();
  ok(await page.getByText(/is too small for/).first().isVisible({ timeout: 5000 }).catch(() => false) || await page.getByText(/is too small for/).first().isVisible(), 'impossible target explained');

  // ---- AV1 when the browser can encode it
  await page.getByRole('radio', { name: 'By quality' }).click();
  const av1 = page.getByRole('radio', { name: /AV1/ });
  if (await av1.count()) {
    await av1.click();
    const f4 = await compress(), i4 = mp4Info(readFileSync(f4));
    ok(i4.video.codec === 'av01', `AV1 output (${i4.video.codec})`);
    const p4 = await play(f4, M('clip.mp4'));
    ok(p4.diff < 14, `AV1 frame matches (mean diff ${p4.diff.toFixed(1)})`);
  } else info('AV1 encoder not available here');

  // ---- WebM (VP8 + Vorbis) → MP4: Vorbis cannot go into MP4, so the sound is re-encoded
  await page.locator('input[type=file]').setInputFiles(M('clip.webm'));
  await page.getByText(/clip\.webm: .* VP8/).waitFor({ timeout: 20000 });
  await page.getByRole('radio', { name: /H\.264/ }).click();
  const f5 = await compress(), i5 = mp4Info(readFileSync(f5));
  ok(i5.video.codec === 'avc1' && !!i5.audio && i5.audio.codec !== 'vorb', `WebM → MP4 H.264, sound ${i5.audio?.codec}`);
  const p5 = await play(f5, M('clip.webm'));
  ok(p5.diff < 14 && Math.abs(p5.duration - 3) < 0.2, `WebM converted frame matches (diff ${p5.diff.toFixed(1)})`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // phone layout
  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/video`);
  await ph.locator('input[type=file]').setInputFiles(M('clip.mp4'));
  await ph.getByText(/640×360/).first().waitFor({ timeout: 20000 });
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.getByRole('button', { name: 'Compress' }).isVisible(), 'phone: fits, Compress in the bottom bar');
};
