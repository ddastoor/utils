// FFmpeg (#/ffmpeg, PC): the effects of to-do #32 (owner, 26 Nov 2026), run by the tab's own FFmpeg 5.1 (ffmpeg.wasm) in
// the browser — an animated WhatsApp sticker, clips joined with transitions, green screen, split screen and grid, light
// trails and motion blur, a music visualiser, the sound as a picture, smooth slow motion, 360° and wide-lens video, sound
// effects at the file's loudness, a bleep — on mono, stereo and 5.1 files. The results are read back by the native
// FFmpeg where it is installed (tests/lib/ffread.mjs), else by their containers. tests/unit/ffjobs2.test.mjs runs the same
// commands natively; ffmpeg-fixes.e2e.mjs has the fixes. A page of its own (docs/BUGHUNT.md, "FFmpeg after a long session").
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mp4Info } from './video.e2e.mjs';
import { readWav } from './audio.e2e.mjs';
import { imageInfo } from '../lib/imgcheck.mjs';
import { execFileSync } from '../lib/child.mjs';
import * as F from '../lib/ffread.mjs';
const M = (n) => fileURLToPath(new URL(`../fixtures/media/${n}`, import.meta.url));
const I = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const base = (p) => p.split(/[\\/]/).pop().replace(/^\d+-/, ''); // the harness saves downloads as <time>-<name>

export default async ({ base: site, page: newPage, ok, info, download, tmp }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(`${site}#/ffmpeg`);
  const native = F.haveNative();
  const combo = (name) => page.getByRole('combobox', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });
  const task = (label) => combo('Task').selectOption({ label });
  const radio = (name) => page.getByRole('radio', { name, exact: true });
  const runBtn = () => page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' });
  const outNotes = () => page.locator('.card', { has: page.locator('.card-title', { hasText: /^Output$/ }) }).locator('.note').allTextContents();
  const done = async () => {
    await runBtn().click();
    await page.waitForFunction(() => { const o = document.querySelector('.ff-out, .ff-report'); return (o && !o.closest('[hidden]')) || document.querySelector('.err-text'); }, null, { timeout: 300000 });
    const err = (await page.locator('.err-text').count()) ? await page.locator('.err-text').first().textContent() : null; // (textContent() would wait 30 s for one)
    if (err) throw new Error(`the run failed: ${err} — log: ${(await page.locator('.ff-log').textContent()).slice(-400)}`);
  };
  const run = async () => { await done(); return download(page, () => page.locator('.ff-out').first().getByRole('button', { name: 'Download', exact: true }).click()); };
  const runFails = async (re) => {
    await runBtn().click();
    return page.locator('.err-text', { hasText: re }).first().waitFor({ timeout: 180000 }).then(() => true, () => false);
  };
  const choose = async (path, re) => {
    await page.locator('input[type=file]').first().setInputFiles(path);
    await page.waitForFunction(([n, src]) => { const t = document.querySelector('.ff-info')?.textContent || ''; return t.startsWith(n) && new RegExp(src).test(t); }, [base(path), re.source], { timeout: 180000 });
  };
  const second = (path) => page.locator('input[type=file]').nth(1).setInputFiles(path);
  /** clips added to "Join clips with transitions" or the split screen, each probed before the next step */
  const addClips = async (...paths) => {
    const n0 = await page.locator('.ff-clips li').count();
    await page.locator('input[type=file]').nth(2).setInputFiles(paths);
    await page.waitForFunction((n) => { const li = [...document.querySelectorAll('.ff-clips li')]; return li.length === n && li.every((l) => /\d:\d\d/.test(l.textContent)); }, n0 + paths.length, { timeout: 120000 });
  };
  const check = (what, nat, fb) => {
    if (native) { const [good, said] = nat(); ok(good, `${what}: ${said}`); return; }
    if (fb) { const [good, said] = fb(); ok(good, `${what} (by the container — no native FFmpeg here): ${said}`); return; }
    ok(true, `${what}: made (no native FFmpeg here — not measured)`);
  };
  const mp4 = (p) => mp4Info(readFileSync(p));
  const sides = (p) => { const x = F.pcm(p, 2); return [F.rms(x, 0, x.length / 2, 2, 0), F.rms(x, 0, x.length / 2, 2, 1)]; };

  // ================================================================ an animated WhatsApp sticker
  await choose(M('clip.mp4'), /Video: h264/);
  await task('Animated WhatsApp sticker');
  const st = await run(), w = F.webp(st);
  ok(base(st) === 'clip-sticker.webp' && w.riff && (w.flags & 2) && w.w === 512 && w.h === 512 && w.frames === 45 && w.loop === 0 && w.size <= 500_000,
    `an animated WebP of 512 × 512, 45 frames (3 s at 15 a second), looping, ${w.size} bytes ≤ 500 KB (${base(st)}) · ${(await outNotes()).join(' | ')}`);
  await radio('The whole picture, transparent around it').click(); await combo('Length').selectOption('2');
  const sf = F.webp(await run());
  ok((sf.flags & 16) && sf.frames === 30 && sf.w === 512, `the whole picture in the square: transparency around it (VP8X flags ${sf.flags}), 30 frames`);
  await page.getByLabel('Start (seconds or mm:ss)').fill('4');
  ok(await runFails(/The video is only 3 s long/), 'a sticker that starts after the end: said');
  if (native) {
    // four seconds of moving noise: above 500 KB at the first settings (natively 1,102 KB, then 723, then 458), so made again
    // with fewer pictures and a lower quality until it fits
    const noisy = join(tmp, 'noise.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=4,noise=alls=16:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', noisy]);
    await choose(noisy, /Video: h264/);
    await page.getByLabel('Start (seconds or mm:ss)').fill('0'); await combo('Length').selectOption('5'); await radio('Filled (the middle of the picture)').click();
    const nz = F.webp(await run()), nn = (await outNotes()).join(' | ');
    ok(nz.size <= 500_000 && !/15 pictures a second, quality 75/.test(nn) && /4 s, \d+ pictures a second, quality \d+ of 100/.test(nn), `moving noise: made again smaller until it fits — ${nz.size} bytes, ${nz.frames} frames · ${nn}`);
  } else info('the sticker\'s tries are not run here: the noise clip is made by the native FFmpeg');

  // ================================================================ clips joined with transitions — videos, sound files, 5.1
  await choose(M('clip.mp4'), /Video: h264/);
  await task('Join clips with transitions');
  ok(await runFails(/Add at least one more clip — a transition goes between two/), 'one clip: said');
  await addClips(M('kf6.mp4'));
  await combo('Transition').selectOption('fade'); await combo('Length').selectOption('1');
  const xf = await run(), xi = mp4(xf);
  ok(Math.abs(xi.duration - 8) < 0.12 && xi.video?.codec === 'avc1' && xi.video.w === 640 && xi.audio?.codec === 'mp4a', `a 3 s and a 6 s clip with a 1 s cross-fade: ${xi.duration.toFixed(2)} s, 640 wide, with sound`);
  check('half-way through the cross-fade the picture is half of each', () => {
    const A = F.frame(M('clip.mp4'), 2.5, 'scale=640:360'), B = F.frame(M('kf6.mp4'), 0.5, 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2'), X = F.frame(xf, 2.5);
    const mix = { w: A.w, h: A.h, d: A.d.map((v, k) => (v + B.d[k]) / 2) };
    return [F.mad(X, mix) < F.mad(X, A) / 2 && F.mad(X, mix) < F.mad(X, B) / 2, `${F.mad(X, mix).toFixed(1)} from the mix, ${F.mad(X, A).toFixed(1)} / ${F.mad(X, B).toFixed(1)} from each`];
  });
  await addClips(M('silent-320.mp4'));
  await combo('Length').selectOption('2');
  ok(await runFails(/The transition \(2 s\) must be shorter than every clip — clip 3 is 1\.5\d* s/), 'a transition longer than a clip: said, the clip named');
  await choose(M('tone.wav'), /Audio: pcm_s16le/);
  await task('Join clips with transitions'); await combo('Length').selectOption('1');
  await addClips(M('tone.mp3'));
  const xa = await run(), xw = readWav(readFileSync(xa));
  const lv = (d, a, z) => { let s = 0; for (let i = Math.floor(a * xw.sr); i < Math.floor(z * xw.sr); i++) s += d[i] * d[i]; return 10 * Math.log10(s / (Math.floor(z * xw.sr) - Math.floor(a * xw.sr))); };
  const [a0, mid, z0] = [lv(xw.data[0], 0.5, 0.9), lv(xw.data[0], 1.45, 1.55), lv(xw.data[0], 2.1, 2.5)];
  ok(base(xa) === 'tone-out.wav' && Math.abs(xw.data[0].length / xw.sr - 3.04) < 0.06 && Math.abs(mid - (a0 + z0) / 2) < 1, `two sound files crossfaded: ${(xw.data[0].length / xw.sr).toFixed(2)} s, the level ${a0.toFixed(1)} → ${mid.toFixed(1)} in the middle → ${z0.toFixed(1)} dB (equal power: no dip; read from the WAV)`);
  await choose(M('surround.mkv'), /Audio: ac3/);
  await task('Join clips with transitions');
  await addClips(M('surround.mkv'));
  const x6 = await run();
  // (the whole of 5 s against the original's 3: R128's gating of another stretch of the same sound moves it within ±1 LU —
  // what this checks is that 5.1 is not mixed down or given a stereo bitrate: 3 dB and more)
  check('two 5.1 clips with a transition: 5.1 kept, at its loudness', () => { const a = F.info(x6).a[0], d = F.loud(x6) - F.loud(M('surround.mkv')); return [a.channels === 6 && a.channel_layout === '5.1' && F.near(F.info(x6).dur, 5.06, 0.15) && Math.abs(d) <= 1, `${a.channel_layout}, ${F.info(x6).dur} s, ${d >= 0 ? '+' : ''}${d.toFixed(2)} dB`]; },
    () => [!!mp4(x6).audio, 'sound present']);

  // ================================================================ green screen
  await choose(M('green.mp4'), /Video: h264/);
  await task('Green screen');
  ok(await page.getByText('Choose the background (a photo or a video)').isVisible() && await runFails(/Choose the background — a photo or a video/), 'green screen: the second picker asks for the background, and Run says so without one');
  for (const [bg, what] of [[I('chelsea.png'), 'a photo'], [M('clip.mp4'), 'a video']]) {
    await second(bg); await page.waitForTimeout(800);
    const gs = await run();
    check(`green screen with ${what}: the green replaced, the red square kept`, () => {
      const X = F.frame(gs, 1), B = F.frame(bg, bg.endsWith('.png') ? 0 : 1, 'scale=320:240:force_original_aspect_ratio=increase,crop=320:240'), sq = F.mean(X, [140 / 320, 100 / 240, 180 / 320, 140 / 240]);
      return [F.mad(X, B, [0, 0, 1, 0.3]) < 20 && F.mad(X, B, [0, 0.62, 1, 1]) < 20 && sq[0] > 180 && sq[1] < 70 && sq[2] < 70, `${F.mad(X, B, [0, 0, 1, 0.3]).toFixed(1)} from the background, the square ${sq.map(Math.round)}`];
    }, () => [mp4(gs).video?.w === 320, `${mp4(gs).video?.w} × ${mp4(gs).video?.h}`]);
  }

  // ================================================================ split screen and grid
  await choose(M('clip.mp4'), /Video: h264/);
  await task('Split screen, grid, before / after');
  ok(await runFails(/Add the second video/), 'a split screen of one video: said');
  await addClips(M('silent-320.mp4'));
  const sb = await run(), sbi = mp4(sb);
  ok(sbi.video.w === 1280 && sbi.video.h === 360 && Math.abs(sbi.duration - 3) < 0.12 && sbi.audio?.codec === 'mp4a', `side by side: ${sbi.video.w} × ${sbi.video.h}, ${sbi.duration.toFixed(2)} s (the longer one), the first video's sound`);
  check('the first video on the left, its sound at its loudness', () => {
    const X = F.frame(sb, 1), A = F.frame(M('clip.mp4'), 1), left = { w: 640, h: 360, d: Buffer.alloc(640 * 360 * 3) };
    for (let y = 0; y < 360; y++) X.d.copy(left.d, y * 640 * 3, y * 1280 * 3, y * 1280 * 3 + 640 * 3);
    return [F.mad(left, A) < 8 && F.near(F.loud(sb), F.loud(M('clip.mp4')), 0.5), `${F.mad(left, A).toFixed(1)} from the first video, ${F.loud(sb)} LUFS (${F.loud(M('clip.mp4'))})`];
  });
  await radio('2 × 2 grid').click();
  ok(await runFails(/A 2 × 2 grid takes 3 or 4 videos/), 'a grid of two: said');
  await addClips(M('stereo.mp4'));
  await combo('Sound').selectOption('mix');
  const gr = await run(), gri = mp4(gr);
  ok(gri.video.w === 1280 && gri.video.h === 720 && Math.abs(gri.duration - 3) < 0.12, `a 2 × 2 grid of three: ${gri.video.w} × ${gri.video.h}, ${gri.duration.toFixed(2)} s`);
  check('the fourth tile black, the three sounds mixed at their own levels', () => {
    const q4 = F.mean(F.frame(gr, 1), [0.55, 0.55, 0.95, 0.95]), want = 10 * Math.log10(10 ** (F.loud(M('clip.mp4')) / 10) + 10 ** (F.loud(M('stereo.mp4')) / 10)); // (silent-320 has no sound)
    return [q4.every((c) => c < 10) && F.info(gr).a[0].channels === 2 && F.near(F.loud(gr), want, 1), `the fourth tile ${q4.map(Math.round)}, stereo, ${F.loud(gr)} LUFS (their sum ${want.toFixed(1)})`];
  });

  // ================================================================ light trails and motion blur
  await choose(M('dot.mp4'), /Video: h264/);
  await task('Light trails / motion blur');
  const tr = await run();
  const trailOf = (p) => { const f = F.frame(p, 1.5); let s = 0; for (let x = 60; x < 160; x++) s += f.d[(90 * f.w + x) * 3]; return s / 100; }; // behind the dot (at x ≈ 215 at 1.5 s)
  check('light trails: the dot\'s path behind it lit', () => [trailOf(tr) > 30 && trailOf(M('dot.mp4')) < 5, `${trailOf(tr).toFixed(0)} (black before: ${trailOf(M('dot.mp4')).toFixed(0)})`], () => [mp4(tr).video?.w === 320, 'made']);
  await radio('Motion blur').click();
  const mb = await run();
  check('motion blur: the dot dimmer and longer', () => {
    const peak = (p) => { const f = F.frame(p, 1.5); let m2 = 0, wide = 0; for (let x = 0; x < f.w; x++) { const v = f.d[(90 * f.w + x) * 3]; m2 = Math.max(m2, v); if (v > 40) wide++; } return [m2, wide]; };
    const [a1, w0] = peak(M('dot.mp4')), [a2, w1] = peak(mb); return [a2 < a1 - 40 && w1 > w0 + 8, `${a1} → ${a2}, ${w0} → ${w1} px`];
  });

  // ================================================================ music visualiser — mono, stereo, over a picture
  const lit = (p) => { const X = F.frame(p, 1); let k = 0; for (let j = 0; j < X.d.length; j += 3) if (X.d[j] + X.d[j + 1] + X.d[j + 2] > 150) k++; return k / (X.d.length / 3); };
  await choose(M('tone.wav'), /Audio: pcm_s16le/);
  await task('Music visualiser video');
  await combo('Style').selectOption('scope');
  ok(await runFails(/this one is mono/), 'a stereo scope of a mono sound: said');
  await combo('Style').selectOption('bars');
  const vb = await run(), vbi = mp4(vb);
  ok(vbi.video.w === 1280 && vbi.video.h === 720 && Math.abs(vbi.duration - 2) < 0.12 && vbi.audio?.codec === 'mp4a', `bars of a mono tone: ${vbi.video.w} × ${vbi.video.h}, ${vbi.duration.toFixed(2)} s, with its sound`);
  check('… the bars drawn, the sound at its loudness', () => [lit(vb) > 0.01 && F.near(F.loud(vb), F.loud(M('tone.wav')), 0.5), `${(lit(vb) * 100).toFixed(1)} % of the picture lit, ${F.loud(vb)} LUFS (${F.loud(M('tone.wav'))})`]);
  await choose(M('stereo.mp4'), /Audio: aac.*stereo/);
  await task('Music visualiser video'); await combo('Style').selectOption('spectrum');
  const vs = await run();
  check('a scrolling spectrum of stereo speech: drawn, stereo at its loudness', () => [lit(vs) > 0.01 && F.info(vs).a[0].channels === 2 && F.near(F.loud(vs), F.loud(M('stereo.mp4')), 0.5), `${(lit(vs) * 100).toFixed(1)} % lit, ${F.loud(vs)} LUFS`], () => [mp4(vs).video?.w === 1280, 'made']);
  await combo('Style').selectOption('scope');
  ok(await page.getByText('Choose a picture to show behind it (optional)').isVisible(), 'a picture behind it is offered (optional)');
  await second(I('chelsea.png')); await page.waitForTimeout(800);
  const vp = await run();
  check('the stereo scope over a picture: the picture at the sides', () => { const X = F.frame(vp, 1), P = F.frame(I('chelsea.png'), 0, 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720'); return [F.mad(X, P, [0, 0, 0.18, 1]) < 6 && lit(vp) > 0.01, `${F.mad(X, P, [0, 0, 0.18, 1]).toFixed(1)} from the picture beside the scope`]; });

  // ================================================================ the sound as a picture — stereo waveform, spectrogram, 5.1
  await task('The sound as a picture (waveform, spectrogram)');
  const wv = await run(), wvi = imageInfo(readFileSync(wv));
  ok(base(wv) === 'stereo-waveform.png' && wvi.type === 'png' && wvi.width === 1920 && wvi.height === 480, `a waveform of a stereo sound: ${base(wv)}, ${wvi.width} × ${wvi.height} (a strip for each side)`);
  await choose(M('pauses.wav'), /Audio: pcm_s16le/);
  await task('The sound as a picture (waveform, spectrogram)');
  const wp = await run();
  check('the waveform of tone, pause, tone: ink where the tones are, none in the pauses', () => {
    const f = F.frame(wp, 0), col = (x0, x1) => { let k = 0; for (let x = Math.floor(x0 * f.w); x < Math.floor(x1 * f.w); x++) for (let y = 0; y < f.h; y++) if (f.d[(y * f.w + x) * 3 + 2] > 100) { k++; break; } return k / (Math.floor(x1 * f.w) - Math.floor(x0 * f.w)); };
    return [f.w === 1920 && col(0.2, 0.34) > 0.9 && col(0.66, 0.8) > 0.9 && col(0.02, 0.16) < 0.05 && col(0.4, 0.6) < 0.05, `${col(0.2, 0.34).toFixed(2)}, ${col(0.66, 0.8).toFixed(2)} / ${col(0.02, 0.16).toFixed(2)}, ${col(0.4, 0.6).toFixed(2)}`];
  });
  await choose(M('tone.wav'), /Audio: pcm_s16le/);
  await task('The sound as a picture (waveform, spectrogram)'); await radio('Spectrogram (the frequencies over time)').click();
  const sp = await run(), spi = imageInfo(readFileSync(sp));
  ok(base(sp) === 'tone-spectrogram.png' && spi.type === 'png' && spi.width > 1600, `a spectrogram: ${base(sp)}, ${spi.width} × ${spi.height} (with its legend)`);
  // (FFmpeg 5.1's showspectrumpic drew this black — the job draws with the scrolling showspectrum: 512 rows of 0 … 8 kHz, the
  // sound across 1600 columns inside the legend)
  ok((await outNotes()).some((n) => /^Time from the start \(left\) to 0:02\.00 \(right\); frequencies from 0 \(bottom\) to 8 kHz \(top\)$/.test(n)), 'the spectrogram\'s span said');
  check('… a 440 Hz tone at its row, lit to the right edge', () => {
    const f = F.frame(sp, 0), top = (f.h - 512) / 2, left = (f.w - 1600) / 2, lum = (y, x0, x1) => { let v = 0; for (let x = left + x0; x < left + x1; x++) { const i = (y * f.w + x) * 3; v += f.d[i] + f.d[i + 1] + f.d[i + 2]; } return v / (x1 - x0) / 3; };
    let best = 0, by = 0; for (let y = top; y < top + 512; y++) { const v = lum(y, 100, 1500); if (v > best) { best = v; by = y; } }
    const want = Math.round(top + 512 * (1 - 440 / 8000));
    return [F.near(by, want, 2) && lum(by, 1500, 1598) > 100, `the brightest row ${by} (440 Hz is row ${want}), at the right edge ${lum(by, 1500, 1598).toFixed(0)}`];
  });
  await choose(M('surround.mkv'), /Audio: ac3/);
  await task('The sound as a picture (waveform, spectrogram)'); await radio('Waveform (a strip for each channel)').click();
  const w6 = imageInfo(readFileSync(await run()));
  ok(w6.width === 1920 && w6.height === 1200, `a waveform of 5.1: ${w6.width} × ${w6.height} (six strips)`);

  // ================================================================ sound effects at the file's loudness — mono, stereo, 5.1
  const fx = async (effect, file, re) => {
    if (file) { await choose(M(file), re); await task('Sound effects (8D, slowed + reverb, bass, phone …)'); }
    await combo('Effect').selectOption(effect);
    return run();
  };
  await task('Sound effects (8D, slowed + reverb, bass, phone …)');
  let ef = await fx('bass', null);
  check('bass boost on 5.1: the six channels, at the file\'s loudness', () => { const a = F.info(ef).a[0], d = F.loud(ef) - F.loud(M('surround.mkv')); return [a.channels === 6 && Math.abs(d) <= 0.8, `${a.channel_layout}, ${d >= 0 ? '+' : ''}${d.toFixed(2)} dB`]; });
  ok((await outNotes()).some((n) => /^Bass boost, at the file's loudness \(−[\d.]+ LUFS; the effect alone −[\d.]+\)/.test(n)), 'the loudness of the file and of the effect alone said');
  ef = await fx('8d', 'clip.mp4', /Video: h264/);
  check('8D of a mono video: stereo, moving between the sides, at its loudness', () => {
    const x = F.pcm(ef, 2), sd = []; for (let s = 0; s + 1 <= 3; s += 0.5) sd.push(F.rms(x, s * 48000, (s + 0.5) * 48000, 2, 0) - F.rms(x, s * 48000, (s + 0.5) * 48000, 2, 1));
    const d = F.loud(ef) - F.loud(M('clip.mp4'));
    return [F.info(ef).a[0].channels === 2 && Math.max(...sd) - Math.min(...sd) > 4 && Math.abs(d) <= 0.8, `left − right ${sd.map((v) => v.toFixed(1)).join(', ')} dB, ${d >= 0 ? '+' : ''}${d.toFixed(2)} dB`];
  });
  ef = await fx('slowed', 'stereo.mp4', /Audio: aac.*stereo/);
  const efi = mp4(ef);
  ok(Math.abs(efi.duration - 3.01 / 0.85) < 0.15 && efi.video?.codec === 'avc1', `slowed + reverb: ${efi.duration.toFixed(2)} s (3 s at 85 %, the picture slowed with it)`);
  ef = await fx('phone', null);
  check('telephone voice: the voice band kept, below 150 Hz and above 6 kHz cut, at its loudness', () => {
    const x = F.pcm(ef), x0 = F.pcm(M('stereo.mp4')), band = (y, lo, hi) => { let s = 0; for (let f = lo; f <= hi; f += 25) s += 10 ** (F.goertzel(y, 48000, f, 0, y.length) / 10); return 10 * Math.log10(s); };
    const lo = band(x, 50, 150) - band(x0, 50, 150), hi = band(x, 6000, 8000) - band(x0, 6000, 8000), md = band(x, 900, 1100) - band(x0, 900, 1100), d = F.loud(ef) - F.loud(M('stereo.mp4'));
    return [lo < md - 15 && hi < md - 15 && Math.abs(d) <= 0.8, `below 150 Hz ${(lo - md).toFixed(0)} dB, above 6 kHz ${(hi - md).toFixed(0)} dB against the voice band, ${d >= 0 ? '+' : ''}${d.toFixed(2)} dB`];
  });
  ef = await fx('echo', 'tone.mp3', /Audio: mp3/);
  check('echo of an MP3: still an MP3, longer by its echoes', () => [base(ef) === 'tone-out.mp3' && F.near(F.info(ef).dur, 2.04 + 0.7, 0.12), `${base(ef)}, ${F.info(ef).dur} s`], () => [base(ef) === 'tone-out.mp3', base(ef)]);

  // ================================================================ bleep — mono, stereo, 5.1
  await choose(M('tone.wav'), /Audio: pcm_s16le/);
  await task('Bleep a word');
  ok(await runFails(/Type the stretches/), 'no stretch: said');
  await page.getByLabel('The stretches to bleep').fill('2-1');
  ok(await runFails(/end must be after the start/), 'a stretch backwards: said');
  await page.getByLabel('The stretches to bleep').fill('0.5-1.0');
  const bl = await run(), bw = readWav(readFileSync(bl)), R = bw.sr, g = (f, a, z) => F.goertzel(bw.data[0], R, f, a * R, z * R);
  const lvl = (a, z) => { let s = 0; for (let i = Math.floor(a * R); i < Math.floor(z * R); i++) s += bw.data[0][i] ** 2; return 10 * Math.log10(s / (Math.floor(z * R) - Math.floor(a * R))); };
  ok(g(1000, 0.55, 0.95) - g(440, 0.55, 0.95) > 40 && g(440, 0.1, 0.45) - g(1000, 0.1, 0.45) > 40 && Math.abs(lvl(0.55, 0.95) - lvl(1.1, 1.9)) < 1.5,
    `0.5 – 1 s is a 1 kHz beep, the rest the tone, the beep as loud (${lvl(0.55, 0.95).toFixed(1)} against ${lvl(1.1, 1.9).toFixed(1)} dB; read from the WAV) · ${(await outNotes()).join(' | ')}`);
  await choose(M('stereo.mp4'), /Audio: aac.*stereo/);
  await task('Bleep a word'); await page.getByLabel('The stretches to bleep').fill('1-1.5, 0:02-0:02.2'); await radio('Silence').click();
  const bs = await run();
  ok((await outNotes()).some((n) => /2 stretches \(0\.7 s\) made silent/.test(n)), 'two stretches, one in minutes:seconds: made silent');
  check('stereo: the stretches silent on both sides, the rest kept, the picture copied', () => { const x = F.pcm(bs, 2); return [F.rms(x, 1.05 * 48000, 1.45 * 48000, 2, 0) < -60 && F.rms(x, 1.05 * 48000, 1.45 * 48000, 2, 1) < -60 && F.rms(x, 1.6 * 48000, 1.95 * 48000, 2, 0) > -40 && F.md5(bs, '0:v') === F.md5(M('stereo.mp4'), '0:v'), `${F.rms(x, 1.05 * 48000, 1.45 * 48000, 2, 0).toFixed(0)} dB inside, ${F.rms(x, 1.6 * 48000, 1.95 * 48000, 2, 0).toFixed(0)} dB after`]; });
  await choose(M('surround.mkv'), /Audio: ac3/);
  await task('Bleep a word'); await page.getByLabel('The stretches to bleep').fill('1-1.5'); await radio('A beep (1 kHz)').click();
  const b6 = await run();
  check('5.1: the beep in the centre channel too, six channels kept', () => { const x = F.pcm(b6, 6, 48000), c = x.filter((_, j) => j % 6 === 2); return [F.goertzel(c, 48000, 1000, 1.05 * 48000, 1.45 * 48000) > -40 && F.info(b6).a[0].channels === 6, `the centre's 1 kHz ${F.goertzel(c, 48000, 1000, 1.05 * 48000, 1.45 * 48000).toFixed(0)} dB`]; });

  // ================================================================ 360° and wide-lens video
  await choose(M('equirect.mp4'), /Video: h264/);
  await task('360° or wide-lens video → a normal view');
  const centre = (p) => F.mean(F.frame(p, 1), [0.48, 0.48, 0.52, 0.52]).map(Math.round);
  for (const [yaw, pitch, want, what] of [['0', '0', [250, 250, 0], 'ahead: the yellow square'], ['90', '0', [250, 0, 0], '90° right: the red square'], ['0', '40', null, 'up: the sky']]) {
    await page.getByRole('slider', { name: 'Look left (−) or right (+)' }).fill(yaw); await page.getByRole('slider', { name: 'Look down (−) or up (+)' }).fill(pitch);
    const v = await run(), vi = mp4(v);
    check(`360° → a normal view, ${what} in the middle`, () => { const c = centre(v); return [vi.video.w === 1280 && vi.video.h === 720 && (want ? c.every((x, k) => F.near(x, want[k], 30)) : c[2] > 180 && c[0] < 150), `${vi.video.w} × ${vi.video.h}, the middle ${c}`]; }, () => [vi.video.w === 1280 && vi.video.h === 720, `${vi.video.w} × ${vi.video.h}`]);
  }
  await radio('A tiny planet').click();
  const pl = await run();
  check('a tiny planet: the ground in the middle, the sky in the corner', () => { const c = centre(pl), k = F.mean(F.frame(pl, 1), [0, 0, 0.04, 0.04]).map(Math.round); return [mp4(pl).video.w === 1080 && c[1] > c[0] + 40 && c[1] > c[2] + 40 && k[2] > 180, `${c} / ${k}`]; }, () => [mp4(pl).video.w === 1080, 'made']);
  await choose(M('clip.mp4'), /Video: h264/);
  await task('360° or wide-lens video → a normal view'); await radio('A 360° video').click();
  ok(await runFails(/twice as wide as it is high — this one is 640 × 360/), 'a 16:9 video as 360°: said, with the wide lens named');
  await choose(M('fisheye.mp4'), /Video: h264/);
  await task('360° or wide-lens video → a normal view'); await radio('A wide lens (GoPro, action camera)').click();
  const fe = await run();
  // the x of the grid's second vertical line at the top, the middle and the bottom (straight: the same)
  const bow = (p) => { const f = F.frame(p, 1), xs = [0.12, 0.5, 0.88].map((yy) => { const y = Math.round(yy * f.h); let best = 0, bx = 0; for (let x = 40; x < 110; x++) { const v = f.d[(y * f.w + x) * 3]; if (v > best) { best = v; bx = x; } } return bx; }); return Math.max(...xs) - Math.min(...xs); };
  check('the wide lens straightened', () => [bow(fe) < bow(M('fisheye.mp4')) / 2, `a grid line bends by ${bow(fe)} px (it bent by ${bow(M('fisheye.mp4'))})`]);

  // ================================================================ smooth slow motion (last: the slowest)
  await choose(M('clip.mp4'), /Video: h264/);
  await task('Smooth slow motion');
  ok(await page.getByText(/This video: about \d+ s of work here\./).isVisible(), `the work it takes is said before: ${await page.getByText(/This video: about/).textContent()}`);
  const sm = await run(), smi = mp4(sm);
  ok(Math.abs(smi.duration - 6) < 0.12 && smi.audio?.codec === 'mp4a', `2× slower: ${smi.duration.toFixed(2)} s, with the sound`);
  check('every picture in between made (not doubled), the sound slowed with its pitch kept', () => {
    const frames = +execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', sm]).toString().trim();
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', sm, '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 }), N = 160 * 90;
    let same = 0; for (let k = 1; k < raw.length / N; k++) { let d = 0; for (let j = 0; j < N; j++) d += Math.abs(raw[k * N + j] - raw[(k - 1) * N + j]); if (d / N < 0.3) same++; }
    const x = F.pcm(sm, 1, 48000); let zc = 0; for (let j = 48000; j < 4 * 48000; j++) if (x[j - 1] < 0 && x[j] >= 0) zc++;
    return [F.near(frames, 150, 3) && same < 10 && F.near(zc / 3, 440, 3), `${frames} frames, ${same} the same as the one before, the tone at ${(zc / 3).toFixed(0)} Hz`];
  });

  const errs = page.errors.filter((e) => !/FFmpeg failed|only 3 s long|at least one more clip|must be shorter|Choose the background|Add the second video|3 or 4 videos|this one is mono|Type the stretches|end must be after|twice as wide/.test(e)); // refusals, logged by the button
  ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  info(`ffmpeg.wasm 0.12 core (FFmpeg 5.1.4); results read ${native ? 'by the native FFmpeg' : 'by their containers (no native FFmpeg here)'}`);
};
