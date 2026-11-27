// FFmpeg (#/ffmpeg, PC): the fixes and the file information of to-do #32 (owner, 26 Nov 2026), run by the tab's own
// FFmpeg 5.1 (ffmpeg.wasm) in the browser — MKV → MP4, the scene finder, sound out of step, a voice on one side, mains hum,
// a lecture evened out, HDR → SDR, black bars, a logo removed, location and metadata removed, a file analysed — on mono,
// stereo and 5.1 files. The results are read back by the native FFmpeg where it is installed (tests/lib/ffread.mjs:
// pixels, samples, loudness, packets), else by their containers. tests/unit/ffjobs2.test.mjs runs the same commands
// natively; ffmpeg-effects.e2e.mjs has the effects. A page of its own: one FFmpeg core's memory only grows
// (docs/BUGHUNT.md, "FFmpeg after a long session").
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { mp4Info } from './video.e2e.mjs';
import { readWav } from './audio.e2e.mjs';
import { imageInfo, zipEntries } from '../lib/imgcheck.mjs';
import * as F from '../lib/ffread.mjs';
const M = (n) => fileURLToPath(new URL(`../fixtures/media/${n}`, import.meta.url));
const base = (p) => p.split(/[\\/]/).pop().replace(/^\d+-/, ''); // the harness saves downloads as <time>-<name>

export default async ({ base: site, page: newPage, ok, info, download }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(`${site}#/ffmpeg`);
  const native = F.haveNative();
  const t0 = Date.now(), laps = [], lap = (w) => laps.push(`${w} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  let ffWorkers = 0; // each FFmpeg the tab starts is a worker of its own (assets/worker-<hash>.js, @ffmpeg/ffmpeg's)
  page.on('worker', (w) => { if (/\/worker-[\w-]+\.js$/.test(w.url())) ffWorkers++; });
  const combo = (name) => page.getByRole('combobox', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });
  const task = (label) => combo('Task').selectOption({ label });
  const radio = (name) => page.getByRole('radio', { name, exact: true });
  const runBtn = () => page.locator('.actions').getByRole('button', { name: 'Run FFmpeg' });
  const cmdText = () => page.locator('.field', { hasText: 'Command (copy it' }).locator('textarea').inputValue();
  const outNotes = () => page.locator('.card', { has: page.locator('.card-title', { hasText: /^Output$/ }) }).locator('.note').allTextContents();
  /** run the task; the result (an output, a report) or the tab's own error, thrown with the log */
  const done = async () => {
    lap(await combo('Task').evaluate((s) => s.value));
    await runBtn().click();
    await page.waitForFunction(() => { const o = document.querySelector('.ff-out, .ff-report'); return (o && !o.closest('[hidden]')) || document.querySelector('.err-text'); }, null, { timeout: 300000 });
    const err = (await page.locator('.err-text').count()) ? await page.locator('.err-text').first().textContent() : null; // (textContent() would wait 30 s for one)
    if (err) throw new Error(`the run failed: ${err} — log: ${(await page.locator('.ff-log').textContent()).slice(-400)}`);
  };
  const dl = (k = 0) => download(page, () => page.locator('.ff-out').nth(k).getByRole('button', { name: 'Download', exact: true }).click());
  const run = async () => { await done(); return dl(); };
  /** a refusal: the tab's error matches `re` (said before FFmpeg starts, or after its measuring pass) */
  const runFails = async (re) => {
    await runBtn().click();
    return page.locator('.err-text', { hasText: re }).first().waitFor({ timeout: 180000 }).then(() => true, () => false);
  };
  const choose = async (file, re) => {
    await page.locator('input[type=file]').first().setInputFiles(M(file));
    await page.waitForFunction(([n, src]) => { const t = document.querySelector('.ff-info')?.textContent || ''; return t.startsWith(n) && new RegExp(src).test(t); }, [file, re.source], { timeout: 180000 });
  };
  /** a check by the native FFmpeg; without it, by the container (`fb`), or said as not measured */
  const check = (what, nat, fb) => {
    if (native) { const [good, said] = nat(); ok(good, `${what}: ${said}`); return; }
    if (fb) { const [good, said] = fb(); ok(good, `${what} (by the container — no native FFmpeg here): ${said}`); return; }
    ok(true, `${what}: made (no native FFmpeg here — not measured)`);
  };
  const tracks = (p) => mp4Info(readFileSync(p)).tracks.map((x) => `${x.kind}:${x.codec}`).join(' ');

  // ================================================================ MKV → MP4 at once (an OBS recording)
  await choose('obs.mkv', /Subtitle: subrip/);
  await task('MKV → MP4 at once (no re-encoding)');
  const plan = await page.locator('.ff-list li').allTextContents();
  ok(/^Picture: H\.264 320 × 180 — copied/.test(plan[0] || '') && plan.some((l) => /“Mic”: PCM \(uncompressed\) (stereo|2 channels) — made AAC 160 kb\/s/.test(l)) && plan.some((l) => /SRT — made MP4 text subtitles/.test(l)) && plan.some((l) => /An attachment \(ttf\) — left out/.test(l)),
    `what happens to each part, listed before the run: ${plan.join(' / ')}`);
  const rm = await run();
  check('OBS\'s MKV → MP4: the picture copied, both sounds AAC, the SRT as MP4 text, the attachment left out', () => {
    const i = F.info(rm);
    return [base(rm) === 'obs-out.mp4' && i.v.codec_name === 'h264' && F.md5(rm, '0:v') === F.md5(M('obs.mkv'), '0:v') && i.a.length === 2 && i.a.every((a) => a.codec_name === 'aac') && i.s[0]?.codec_name === 'mov_text' && i.r.streams.length === 4
      && F.md5(rm, '0:a:0') === F.md5(M('obs.mkv'), '0:a:0') && F.near(F.loud(rm, '0:a:1'), F.loud(M('obs.mkv'), '0:a:1'), 0.5),
    `${base(rm)}: ${i.r.streams.map((s) => s.codec_name).join(', ')}; the picture and the first sound the same packets, "Mic" at ${F.loud(rm, '0:a:1')} LUFS (it was ${F.loud(M('obs.mkv'), '0:a:1')})`];
  }, () => [/vide:avc1/.test(tracks(rm)) && (tracks(rm).match(/soun:mp4a/g) || []).length === 2, tracks(rm)]);

  // ================================================================ refusals on an ordinary MP4 (before and after measuring)
  await choose('clip.mp4', /Video: h264/);
  await task('MKV → MP4 at once (no re-encoding)');
  ok(await runFails(/This file is an MP4 already/), 'MKV → MP4 of an MP4: said');
  await task('HDR (iPhone, Android) → normal colours');
  ok(await page.getByText(/^This video is not HDR|^FFmpeg finds no HDR colours/).first().isVisible().catch(() => false) || /not HDR|no HDR colours/.test(await page.locator('.note-warn').allTextContents().then((x) => x.join(' '))), 'an SDR video: the HDR task says there is nothing to convert, before it is run');
  ok(await runFails(/not HDR|no HDR colours/), '… and Run says so');
  await task('Voice on one side only (left / right)');
  ok(await runFails(/This sound is mono — it is the same on both sides already/), 'one side of a mono sound: said');
  await task('Remove black bars');
  ok(/cropdetect=.*\n# then, with what the first command finds:\nffmpeg .*crop=W:H:X:Y/s.test(await cmdText()), 'black bars: the command box shows both commands, the second with what the first finds');
  await page.getByRole('button', { name: 'Edit as arguments' }).click();
  ok(await page.getByText(/This task runs two commands/).first().isVisible(), '"Edit as arguments" of a two-command task: said why it cannot');
  ok(await runFails(/No black bars were found — the picture fills the frame/), 'a video without bars: said after the measuring pass');
  const ff0 = ffWorkers;

  // ================================================================ scene finder
  await choose('scenes.mp4', /Video: h264/);
  await task('Scene finder (a picture per scene)');
  await done();
  const scn = await page.locator('.ff-out strong').allTextContents();
  ok(scn.join(', ') === 'scene-001 (0m00.00s).jpg, scene-002 (0m01.00s).jpg, scene-003 (0m02.00s).jpg', `three scenes, each named by its time: ${scn.join(', ')}`);
  const s1 = await dl(0), s2 = await dl(1), si = imageInfo(readFileSync(s1));
  check('the scenes are the red, the blue and the pattern', () => {
    const c = [s1, s2].map((p) => F.mean(F.frame(p, 0), [0.6, 0.05, 0.95, 0.2]).map(Math.round));
    return [c[0][0] > 200 && c[0][2] < 60 && c[1][2] > 200 && c[1][0] < 60 && si.type === 'jpeg' && si.width === 320, `JPEGs of ${si.width} px, the corner ${JSON.stringify(c)}`];
  }, () => [si.type === 'jpeg' && si.width === 320, `${si.type} ${si.width} × ${si.height}`]);
  const zp = await download(page, () => page.getByRole('button', { name: /Download all as \.zip \(3\)/ }).click());
  ok(base(zp) === 'scenes-scenes.zip' && (zipEntries(zp) || []).join(', ') === scn.join(', '), `the scenes as one zip: ${base(zp)} — ${(zipEntries(zp) || []).join(', ')}`);
  ok(ffWorkers === ff0, `the FFmpeg that measured the bars ran the next job: a refusal after a measuring pass is no failure (${ffWorkers - ff0} new FFmpeg)`);

  // ================================================================ sound out of step — mono, stereo and 5.1
  await choose('sync.mp4', /Audio: aac/);
  await task('Sound out of step with the picture');
  ok(await radio('comes too late — move it earlier').getAttribute('aria-checked') === 'true', '"earlier" first: the usual case (a phone\'s or a webcam\'s sound late)');
  await page.getByLabel('By', { exact: true }).fill('0');
  ok(await runFails(/Type how far to move the sound/), 'by nothing: said');
  await page.getByLabel('By', { exact: true }).fill('300');
  const sy = await run();
  check('the sound 300 ms earlier: the beeps on the flashes', () => {
    const x = F.pcm(sy), x0 = F.pcm(M('sync.mp4'));
    const a = F.onset(x, 48000, 0.5), b = F.onset(x, 48000, 1.8), a0 = F.onset(x0, 48000, 0.5);
    return [F.near(a0, 1.3, 0.005) && F.near(a, 1.0, 0.005) && F.near(b, 2.4, 0.005) && F.md5(sy, '0:v') === F.md5(M('sync.mp4'), '0:v') && F.near(F.info(sy).dur, 4, 0.05), `the beeps at ${a.toFixed(3)} and ${b.toFixed(3)} s (at ${a0.toFixed(3)} before), the picture copied, ${F.info(sy).dur} s`];
  }, () => [/vide:avc1/.test(tracks(sy)) && Math.abs(mp4Info(readFileSync(sy)).duration - 4) < 0.1, tracks(sy)]);
  ok((await outNotes()).some((n) => /The sound moved 300 ms earlier/.test(n)), 'the result says what was done');
  /** the shift of two runs, "later" by 100 ms and by 300 ms: their difference is 200 ms whatever the container adds */
  const shifted = async (file, ch, c0, unitS) => {
    await radio('comes too early — move it later').click();
    await combo('Unit').selectOption(unitS ? 's' : 'ms');
    const outs = [];
    for (const v of unitS ? ['0.1', '0.3'] : ['100', '300']) { await page.getByLabel('By', { exact: true }).fill(v); outs.push(await run()); }
    if (!native) return { outs };
    const l1 = F.lagOf(outs[0], M(file), ch, c0, 4400, 5400), l3 = F.lagOf(outs[1], M(file), ch, c0, 14000, 15000);
    return { outs, l1, l3, chs: F.info(outs[1]).a[0].channels, ly: F.info(outs[1]).a[0].channel_layout, lo: F.loud(outs[1]) - F.loud(M(file)), v: F.md5(outs[1], '0:v') === F.md5(M(file), '0:v') };
  };
  await choose('stereo.mp4', /Audio: aac.*stereo/);
  await task('Sound out of step with the picture');
  let sh = await shifted('stereo.mp4', 2, 0, false);
  check('stereo, 100 and 300 ms later: 200 ms apart, two channels, the picture copied', () => [F.near(sh.l3 - sh.l1, 200, 0.1) && F.near(sh.l1, 100, 2) && sh.chs === 2 && sh.v && Math.abs(sh.lo) <= 0.6, `${sh.l1.toFixed(2)} and ${sh.l3.toFixed(2)} ms by correlation, ${sh.ly}, ${sh.lo >= 0 ? '+' : ''}${sh.lo.toFixed(2)} dB`]);
  await choose('surround.mkv', /Audio: ac3/);
  await task('Sound out of step with the picture');
  sh = await shifted('surround.mkv', 6, 2, true); // the voice: 5.1's centre (its sides hold chords, periodic)
  check('5.1, 0.1 and 0.3 s later (in seconds): 200 ms apart, 5.1 kept', () => [F.near(sh.l3 - sh.l1, 200, 0.1) && sh.chs === 6 && sh.ly === '5.1' && sh.v && Math.abs(sh.lo) <= 0.6 && base(sh.outs[1]) === 'surround-out.mkv', `${sh.l1.toFixed(2)} and ${sh.l3.toFixed(2)} ms (MKV adds an offset of its own), ${sh.ly}, ${sh.lo >= 0 ? '+' : ''}${sh.lo.toFixed(2)} dB, ${base(sh.outs[1])}`]);

  // ================================================================ a voice on one side
  await task('Voice on one side only (left / right)');
  ok(await runFails(/This works on stereo sound — this file has 5\.1\(side\)/), 'one side of 5.1: said');
  await choose('left-voice.mp4', /Audio: aac.*stereo/);
  await task('Voice on one side only (left / right)');
  ok(await radio('Find the side').getAttribute('aria-checked') === 'true', '"Find the side" first');
  const lv = await run(), lvn = (await outNotes()).join(' | ');
  ok(/The sound is on the left \(left −\d+\.\d dB, right −\d+\.\d dB\): put on both sides/.test(lvn), `the side found by a measuring pass: ${lvn}`);
  check('the left side on both, at its own level, the picture copied', () => {
    const x = F.pcm(lv, 2), x0 = F.pcm(M('left-voice.mp4'), 2), L = F.rms(x, 0, x.length / 2, 2, 0), R = F.rms(x, 0, x.length / 2, 2, 1), L0 = F.rms(x0, 0, x0.length / 2, 2, 0);
    return [Math.abs(L - R) < 0.1 && F.near(R, L0, 0.3) && F.md5(lv, '0:v') === F.md5(M('left-voice.mp4'), '0:v'), `left ${L0.toFixed(1)} dB → left ${L.toFixed(1)}, right ${R.toFixed(1)} dB`];
  });
  await choose('stereo.mp4', /Audio: aac.*stereo/);
  await task('Voice on one side only (left / right)');
  ok(await runFails(/Both sides hold the sound \(left −[\d.]+ dB, right −[\d.]+ dB\) — choose a side yourself, or Swap/), 'a voice on both sides: said after measuring');
  await radio('Swap left and right').click();
  const sw = await run();
  check('left and right swapped, each at its level', () => {
    const x = F.pcm(sw, 2), x0 = F.pcm(M('stereo.mp4'), 2), at = (y, c) => F.rms(y, 0, y.length / 2, 2, c);
    return [F.near(at(x, 0), at(x0, 1), 0.3) && F.near(at(x, 1), at(x0, 0), 0.3), `left ${at(x0, 0).toFixed(1)} / right ${at(x0, 1).toFixed(1)} → ${at(x, 0).toFixed(1)} / ${at(x, 1).toFixed(1)} dB`];
  });

  // ================================================================ mains hum — stereo (16 kHz WAV), mono without hum, 5.1
  await choose('hum.wav', /Audio: pcm_s16le.*stereo/);
  await task('Remove mains hum (50 / 60 Hz)');
  const hm = await run(), hmn = (await outNotes()).join(' | ');
  ok(/Mains hum found at 50 Hz: it and its overtones up to 500 Hz taken out/.test(hmn) && base(hm) === 'hum-out.wav', `the hum's frequency found first: ${hmn} (${base(hm)})`);
  // the left = speech + hum, the right = the same speech: what the notches do to the speech cancels between them
  const humLeft = (p) => { const x = F.pcm(p, 2, 16000); let hh = 0, s = 0; for (let j = 8000; j < x.length / 2; j++) { hh += (x[2 * j] - x[2 * j + 1]) ** 2; s += x[2 * j + 1] ** 2; } return [10 * Math.log10(hh), 10 * Math.log10(s)]; };
  check('the hum taken out, the speech at its level', () => { const [h0, s0] = humLeft(M('hum.wav')), [h1, s1] = humLeft(hm); return [h1 - h0 < -35 && F.near(s1, s0, 0.6), `the hum ${(h1 - h0).toFixed(1)} dB (after the first 0.5 s), the speech ${(s1 - s0).toFixed(2)} dB`]; },
    () => { const w = readWav(readFileSync(hm)); return [w.data.length === 2 && w.data[0].length === 48000, `${w.data.length} channels, ${w.data[0].length} samples`]; });
  await choose('tone.wav', /Audio: pcm_s16le/);
  await task('Remove mains hum (50 / 60 Hz)');
  await radio('60 Hz (the Americas, parts of Japan)').click();
  await run();
  ok((await outNotes()).some((n) => /No clear mains hum was found, so the notches are at 60 Hz and its overtones exactly/.test(n)), 'a tone without hum, 60 Hz chosen: said, and the notches at 60 Hz');
  await choose('surround.mkv', /Audio: ac3/);
  await task('Remove mains hum (50 / 60 Hz)');
  await radio('50 Hz (India, Europe, most of Asia and Africa)').click();
  const h6 = await run(), h6n = (await outNotes()).join(' | ');
  check('5.1: the six channels kept, the picture copied', () => { const a = F.info(h6).a[0]; return [a.channels === 6 && a.channel_layout === '5.1' && F.md5(h6, '0:v') === F.md5(M('surround.mkv'), '0:v') && /Mains hum|No clear mains hum/.test(h6n), `${a.channel_layout} · ${h6n}`]; });

  // ================================================================ a lecture evened out — mono, 5.1
  await task('Even out a lecture or meeting');
  const e6 = await run();
  check('5.1 evened out: the six channels kept, the picture copied', () => { const a = F.info(e6).a[0]; return [a.channels === 6 && a.channel_layout === '5.1' && F.md5(e6, '0:v') === F.md5(M('surround.mkv'), '0:v'), `${a.codec_name} ${a.channel_layout} ${a.bit_rate ? `${Math.round(a.bit_rate / 1000)} kb/s` : ''}`]; });
  await choose('lecture.wav', /Audio: pcm_s16le/);
  await task('Even out a lecture or meeting');
  const ev = await run();
  const halves = (data) => { const x = data, lev = (a, z) => { const e = []; for (let j = a; j + 800 <= z; j += 800) { let s = 0; for (let k = j; k < j + 800; k++) s += x[k] * x[k]; e.push(s / 800); } e.sort((u, v) => v - u); const tp = e.slice(0, e.length >> 1); return 10 * Math.log10(tp.reduce((u, v) => u + v, 0) / tp.length); }; return lev(64000, 128000) - lev(0, 64000); };
  const w0 = readWav(readFileSync(M('lecture.wav'))), w1 = readWav(readFileSync(ev));
  ok(base(ev) === 'lecture-out.wav' && halves(w0.data[0]) > 18 && halves(w1.data[0]) < 6, `a far and a near speaker ${halves(w0.data[0]).toFixed(1)} dB apart → ${halves(w1.data[0]).toFixed(1)} dB (read from the WAV), still a WAV`);

  // ================================================================ HDR → normal colours (HLG as iPhones film, PQ as Android phones)
  for (const [file, kind, said] of [['hdr.mp4', 'HLG — as iPhones film', 'HLG made SDR'], ['hdr-pq.mp4', 'PQ (HDR10) — as many Android phones film', 'PQ (HDR10) made SDR']]) {
    await choose(file, /Video: hevc|Video: h264/);
    await task('HDR (iPhone, Android) → normal colours');
    ok(await page.getByText(`This video is HDR: ${kind}.`).isVisible(), `${file}: "${kind}" said before the run`);
    const hd = await run();
    ok((await outNotes()).some((n) => n.includes(said)), `${file}: "${said}"`);
    check(`${file} → SDR: the SDR original's colours, the highlights a gradient, tagged BT.709`, () => {
      const X = F.frame(hd, 0.5), sdr = F.frame(M('hdr-sdr.png'), 0), area = [0, 0, 1, 0.93], v = F.info(hd).v;
      const ramp = [0, 0.5, 1].map((x) => F.mean(X, [Math.min(0.97, x * 0.97), 0.955, Math.min(1, x * 0.97 + 0.03), 0.99])[1]);
      return [F.mad(X, sdr, area) < 12 && ramp[0] < ramp[1] && ramp[1] < ramp[2] + 1 && ramp[0] < 245 && v.color_transfer === 'bt709' && v.color_primaries === 'bt709', `${F.mad(X, sdr, area).toFixed(1)} from the SDR picture, the highlights ${ramp.map(Math.round)}, ${v.color_transfer} / ${v.color_primaries}`];
    }, () => [/vide:avc1/.test(tracks(hd)), tracks(hd)]);
  }

  // ================================================================ black bars
  await choose('bars.mp4', /Video: h264/);
  await task('Remove black bars');
  const br = await run(), brn = (await outNotes()).join(' | '), bi = mp4Info(readFileSync(br));
  ok(/The bars cut off: 640 × 272 kept of 640 × 360/.test(brn) && bi.video.w === 640 && bi.video.h === 272 && bi.audio?.codec === 'mp4a', `the bars found and cut off: ${bi.video.w} × ${bi.video.h} · ${brn}`);
  check('the picture where it was', () => { const X = F.frame(br, 1), S = F.frame(M('bars.mp4'), 1, 'crop=640:272:0:44'); return [F.mad(X, S) < 6, `${F.mad(X, S).toFixed(1)} from the original's middle`]; });

  // ================================================================ a logo removed: the box on a picture of the video
  await choose('logo.mp4', /Video: h264/);
  await task('Remove a logo or date stamp');
  const canvas = page.locator('canvas[aria-label^="A picture of the video"]');
  /** the picture of the video at `t` s (empty: the default, 1 s); the mean brightness inside the logo's place (500, 20, 120 × 40) */
  const logoArea = async (t) => {
    if (t) { await page.getByLabel('Picture at (seconds)').fill(t); await page.getByRole('button', { name: 'Show it' }).click(); }
    await page.getByText('Taking a picture of the video…').waitFor({ state: 'hidden', timeout: 60000 });
    return canvas.evaluate((c) => { const d = c.getContext('2d').getImageData(500, 20, 120, 40).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; });
  };
  const atDef = await logoArea(), at05 = await logoArea('0.5'), at15 = await logoArea('1.5');
  ok(Math.abs(atDef - at15) < 1 && at15 - at05 > 50, `the picture is taken where asked: the logo's place ${at05.toFixed(0)} at 0.5 s (before the logo), ${at15.toFixed(0)} at 1.5 s and at the default 1 s (${atDef.toFixed(0)})`);
  // the box: dragged, then typed
  const num = (l) => page.getByLabel(`${l} (pixels)`, { exact: true }).inputValue().then(Number);
  await page.locator('.crop-box').evaluate((e) => e.scrollIntoView({ block: 'center' })); // (to the top edge it would be under the sticky tab rows)
  const bx0 = await num('From the left'), bb = await page.locator('.crop-box').boundingBox(), cb = await canvas.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 - 25, bb.y + bb.height / 2, { steps: 5 }); await page.mouse.move(bb.x + bb.width / 2 - 50, bb.y + bb.height / 2, { steps: 5 }); await page.mouse.up();
  const bx1 = await num('From the left'), want = bx0 - 50 * (640 / cb.width);
  ok(Math.abs(bx1 - want) <= 2 && /delogo=x=/.test(await cmdText()), `the box dragged 50 px to the left: from the left ${bx0} → ${bx1} px (${want.toFixed(0)} by the picture's scale)`);
  for (const [l, v] of [['From the left', '498'], ['From the top', '18'], ['Width', '124'], ['Height', '44']]) await page.getByLabel(`${l} (pixels)`, { exact: true }).fill(v);
  const style = await page.locator('.crop-box').evaluate((e) => [e.style.left, e.style.top, e.style.width, e.style.height].map(parseFloat));
  ok(/delogo=x=498:y=18:w=124:h=44 /.test(await cmdText()) && [498 / 6.4, 18 / 3.6, 124 / 6.4, 44 / 3.6].every((v, k) => Math.abs(v - style[k]) < 0.05), `the box typed in pixels: in the command (${/delogo=\S+/.exec(await cmdText())?.[0]}) and on the picture`);
  const lg = await run();
  check('the logo gone, the rest of the picture unchanged', () => {
    const box = [500 / 640, 20 / 360, 620 / 640, 60 / 360], before = F.frame(M('logo.mp4'), 0.5), withLogo = F.frame(M('logo.mp4'), 1.5), X = F.frame(lg, 1.5);
    return [F.mad(withLogo, before, box) > 60 && F.mad(X, before, box) < 12 && F.mad(X, withLogo, [0, 0.3, 0.75, 0.75]) < 3, `the box ${F.mad(X, before, box).toFixed(1)} from the background without the logo (the logo: ${F.mad(withLogo, before, box).toFixed(1)})`];
  });
  await page.getByLabel('Width (pixels)', { exact: true }).fill('0');
  ok(await runFails(/Draw a box around the logo/), 'no box: said');

  // ================================================================ location and metadata removed (an iPhone's video)
  await choose('phone.mov', /Video: h264/);
  await task('Remove location and metadata');
  const said = await page.locator('.ff-list li').allTextContents(), groups = await page.locator('.ff-list').locator('xpath=preceding-sibling::strong').allTextContents();
  ok(said.some((l) => /28\.6139° N, 77\.2090° E, 215 m/.test(l)) && said.some((l) => /model: iPhone 15 Pro/.test(l)) && said.some((l) => /timecode/.test(l)) && ['Date and time', 'Place', 'Device and software', 'Other tracks'].every((g) => groups.includes(g)),
    `what the file says, listed before the copy is made (${groups.join(', ')}): ${said.slice(0, 4).join(' / ')} …`);
  const mt = await run(), mtn = (await outNotes()).join(' | ');
  ok(base(mt) === 'phone-out.mov' && /Checked: the copy says nothing of where, when or with what it was made/.test(mtn), `the copy read again: ${mtn}`);
  check('the copy: no place, date, device, timecode or chapter; the picture and the sound the same packets', () => {
    const i = F.info(mt), tags = { ...(i.r.format.tags || {}), ...Object.assign({}, ...i.r.streams.map((s) => s.tags || {})) };
    const left = Object.keys(tags).filter((k) => /location|make|model|software|creation_time|date|comment|title|encoder|handler/i.test(k) && !(k === 'handler_name' && /^(Video|Sound|Subtitle|Data)Handler$/.test(tags[k])));
    return [!left.length && i.r.streams.length === 2 && !(i.r.chapters || []).length && F.md5(mt, '0:v') === F.md5(M('phone.mov'), '0:v') && F.md5(mt, '0:a') === F.md5(M('phone.mov'), '0:a'), `left: ${JSON.stringify(tags)}`];
  });

  // ================================================================ a file analysed
  await choose('analyse.mp4', /Video: h264/);
  await task('Analyse a file (loudness, black, silence, frozen)');
  await done();
  const rep = await page.locator('.ff-report').textContent();
  ok(/Integrated loudness: −21\.0 LUFS/.test(rep) && /True peak: −20\.0 dBTP/.test(rep) && /Black picture[^\n]*\n  0:00\.00 – 0:01\.00/.test(rep) && /Frozen picture[^\n]*\n  0:03\.00 – 0:05\.5\d/.test(rep) && /Silence[^\n]*\n  0:00\.00 – 0:01\.00[^\n]*\n  0:05\.50 – 0:06\.5\d/.test(rep) && !(await page.locator('.ff-out').count()),
    `the report (no file made):\n${rep}`);
  const rp = await download(page, () => page.getByRole('button', { name: 'Download analyse-analysis.txt' }).click());
  ok(readFileSync(rp, 'utf8') === `${rep}\n`, 'the report downloaded as analyse-analysis.txt, as shown');
  await radio('The sound only (quicker)').click();
  await done();
  const rep2 = await page.locator('.ff-report').textContent();
  ok(!/Black picture|Frozen/.test(rep2) && /Silence/.test(rep2) && /Integrated loudness: −21\.0 LUFS/.test(rep2), 'the sound only: no picture sections');

  const errs = page.errors.filter((e) => !/FFmpeg failed|MP4 already|not HDR|no HDR colours|mono — it is the same|No black bars|Type how far|stereo sound — this file|Both sides hold|Draw a box/.test(e)); // refusals, logged by the button
  ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  lap('end');
  info(`ffmpeg.wasm 0.12 core (FFmpeg 5.1.4); results read ${native ? 'by the native FFmpeg' : 'by their containers (no native FFmpeg here)'} · started at: ${laps.join(', ')}`);
};
