// FFmpeg (#/ffmpeg, PC): the sound of the results at the original's level (to-do #23) and "Extract audio" as MP3 (to-do
// #22) — split from ffmpeg.e2e.mjs on 26 Nov 2026: the two together ran past the harness's 30 minutes a suite on Windows
// (check run 15), and on a page of their own they also keep clear of the long-session crash of one FFmpeg core on one
// page (docs/BUGHUNT.md: its memory only grows; the headless shell's renderer crashed at 5.1 → MP4 after the Stop checks).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { mp3Frames } from './audio.e2e.mjs';
import { spawnSync, execFileSync } from '../lib/child.mjs';
const M = (n) => fileURLToPath(new URL(`../fixtures/media/${n}`, import.meta.url));

export default async ({ base, page: newPage, ok, info, download }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(`${base}#/ffmpeg`);
  const combo = (name) => page.getByRole('combobox', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });
  const task = (label) => combo('Task').selectOption({ label });
  const radio = (name) => page.getByRole('radio', { name, exact: true });
  const run = async (dlName = 'Download') => {
    await page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' }).click();
    await page.waitForFunction(() => { const o = document.querySelector('.ff-out'); return (o && !o.closest('[hidden]')) || document.querySelector('.err-text'); }, null, { timeout: 180000 });
    const err = (await page.locator('.err-text').count()) ? await page.locator('.err-text').first().textContent() : null; // (textContent() would wait 30 s for one)
    if (err) throw new Error(`the run failed: ${err} — log: ${(await page.locator('.ff-log').textContent()).slice(-400)}`);
    return download(page, () => page.locator('.ff-out').first().getByRole('button', { name: dlName, exact: true }).click());
  };
  const choose = async (path, re) => { await page.locator('input[type=file]').first().setInputFiles(path); await page.locator('.ff-info').getByText(re).first().waitFor({ timeout: 120000 }); };

  // ================================================================ sound at its own level (to-do #23)
  // The owner: "the audio volume of the output … seems to be lower than … the original" — it was, for a mono sound made
  // stereo (joins, "Stereo": 3 dB lower) and for 5.1 as Opus; and this core's Opus encoder crashed on stereo ("memory
  // access out of bounds"), unseen while every fixture was mono. The loudness (EBU R128, a mono file as heard on two
  // speakers) and the channels are read by the native FFmpeg where it is installed (apt; choco on the Windows runner).
  const nativeFF = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
  const loud = (p) => { const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-map', '0:a:0', '-af', 'ebur128=dualmono=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr; return +/I:\s+(-?[\d.]+) LUFS/.exec(e.slice(e.lastIndexOf('Summary:')))?.[1]; };
  const lay = (p) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,channels,channel_layout', '-of', 'csv=p=0', p]).toString().trim();
  /** the level of what is heard — the loudest half of 50 ms frames, as power, in dB — for a speed change: a new time scale
   *  moves the R128 integrated loudness of a 3 s clip by up to ±1 LU (its gating and 400 ms blocks fall otherwise) while
   *  the voice's own level stays within 0.2 dB (measured natively, docs/BUGHUNT.md) */
  const active = (p) => {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', p, '-vn', '-ac', '2', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), n = 4800, e = [];
    for (let i = 0; i + n <= x.length; i += n) { let s = 0; for (let k = i; k < i + n; k++) s += x[k] * x[k]; e.push(s / n); }
    e.sort((a, b) => b - a); const top = e.slice(0, Math.max(1, e.length >> 1));
    return +(10 * Math.log10(top.reduce((a, b) => a + b, 0) / top.length)).toFixed(2);
  };
  /** the run's output against `src`: its sound `want` (codec,channels,layout), its loudness within [lo, hi] dB of src's */
  const level = async (src, what, want, [lo, hi] = [-0.5, 0.5], cut = 0, measure = loud) => {
    let out;
    try { out = await run(); } catch (e) { ok(false, `${what}: ${e.message.slice(0, 300)}`); return; }
    if (!nativeFF) { ok(true, `${what}: made (no native FFmpeg here — the loudness is not measured)`); return; }
    let m = out;
    if (cut) { m = `${out}.part.wav`; execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', out, '-t', String(cut), '-vn', m]); }
    const a = measure(src), b = measure(m), l = lay(out);
    ok(b - a >= lo && b - a <= hi && want.test(l), `${what}: ${l}, ${a} → ${b} LUFS`);
  };
  await choose(M('stereo.mp4'), /Audio: aac.*stereo/);
  await task('Convert format'); await combo('To').selectOption('webm');
  await level(M('stereo.mp4'), 'stereo → WebM: it runs (this build\'s Opus crashed on stereo), Opus in stereo, the same loudness', /^opus,2,stereo$/);
  await combo('To').selectOption('ogg');
  await level(M('stereo.mp4'), 'stereo → OGG: Opus in stereo, the same loudness', /^opus,2,stereo$/);
  await task('Your own arguments'); await page.getByLabel('FFmpeg arguments').fill('-i in1.mp4 -vn -c:a libopus -b:a 96k out.ogg');
  await level(M('stereo.mp4'), 'own arguments making stereo Opus: "-compression_level:a 4" added, it runs', /^opus,2,stereo$/);
  await task('Speed up / slow down');
  await level(M('stereo.mp4'), 'stereo speech at 2×: the voice at the same level', /^aac,2,stereo$/, [-0.5, 0.5], 0, active);
  await choose(M('surround.mkv'), /Audio: ac3/);
  await task('Convert format'); await combo('To').selectOption('webm');
  await level(M('surround.mkv'), '5.1(side) AC-3 → WebM: it runs (libopus refused the layout), Opus in 5.1, the same loudness', /^opus,6,5\.1$/);
  await combo('To').selectOption('mp4');
  await level(M('surround.mkv'), '5.1(side) AC-3 → MP4: AAC in 5.1 (the layout was written as "unknown"), the same loudness', /^aac,6,5\.1$/);
  await task('Sound settings (mono, stereo, sample rate)'); await combo('Channels').selectOption('2');
  await level(M('surround.mkv'), '5.1 → stereo: mixed down as players do (R128 counts the surround channels 1.5 dB more in 5.1)', /^aac,2,stereo$/, [-1, 0]);
  await choose(M('clip.mp4'), /Video: h264/);
  await level(M('clip.mp4'), 'mono → stereo: on both sides at full level (it was 3 dB lower)', /^aac,2,stereo$/);
  await task('Join clips');
  await page.locator('input[type=file]').nth(2).setInputFiles(M('stereo.mp4'));
  await page.locator('.ff-clips li').nth(1).waitFor({ timeout: 30000 });
  await level(M('clip.mp4'), 'join a mono clip and a stereo one: stereo, the mono clip at its own loudness (it was 3 dB lower)', /^aac,2,stereo$/, [-0.5, 0.5], 2.9);
  await page.getByRole('button', { name: 'Remove clip 2' }).click();
  await page.locator('input[type=file]').nth(2).setInputFiles(M('clip.mp4'));
  await page.waitForTimeout(1500);
  await level(M('clip.mp4'), 'join two mono clips: mono, the same loudness', /^aac,1,mono$/);
  // to-do #22: the MP3 at the original's loudness; the format and quality kept through another file, and through
  // leaving the tab and coming back (while the page is open — nothing is stored). Chosen here for the file open (this
  // suite has a page of its own: the choice made in ffmpeg.e2e.mjs was on another page)
  await task('Extract audio');
  await radio('MP3').click(); await radio('320 kb/s').click();
  await choose(M('stereo.mp4'), /Audio: aac.*stereo/);
  await task('Extract audio');
  ok(await radio('MP3').getAttribute('aria-checked') === 'true' && await radio('320 kb/s').getAttribute('aria-checked') === 'true', 'MP3 at 320 kb/s still chosen for another file');
  await level(M('stereo.mp4'), 'the stereo sound as MP3 at 320 kb/s: the same loudness', /^mp3,2,stereo$/);
  await page.goto(`${base}#/hash`); await page.getByRole('heading', { name: /Hash/ }).first().waitFor();
  await page.goto(`${base}#/ffmpeg`);
  await choose(M('stereo.mp4'), /Audio: aac.*stereo/);
  await task('Extract audio');
  ok(await radio('MP3').getAttribute('aria-checked') === 'true' && await radio('320 kb/s').getAttribute('aria-checked') === 'true', 'the choice kept after leaving the tab and coming back');
  await radio('As it is (.m4a)').click();
  await run();
  const sm = await download(page, () => page.locator('.ff-out').first().getByRole('button', { name: 'Download as MP3' }).click());
  const smf = mp3Frames(readFileSync(sm));
  if (nativeFF) { const a = loud(M('stereo.mp4')), b = loud(sm); ok(smf.ok && smf.rates.slice(1).every((r) => r === 320) && Math.abs(b - a) <= 0.5 && /^mp3,2,stereo$/.test(lay(sm)), `"Download as MP3" of the stereo .m4a: 320 kb/s as chosen, ${lay(sm)}, ${a} → ${b} LUFS`); }
  else ok(smf.ok && smf.rates.slice(1).every((r) => r === 320), '"Download as MP3" of the stereo .m4a: 320 kb/s as chosen');
  const errs = page.errors.filter((e) => !/FFmpeg failed|change nothing/.test(e)); // refusals, logged by the button
  ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  info('ffmpeg.wasm 0.12 core (FFmpeg 5.1.4)');
};
