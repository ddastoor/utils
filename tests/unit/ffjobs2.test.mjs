// FFmpeg tab, the 22 jobs of to-do #32 (src/lib/ffjobs.ts): the probe's new details against ffprobe, the parsers of the
// measuring passes (cropdetect, astats, ebur128, black / silence / freeze), the refusals in words — and every job's
// command run by the native FFmpeg (6.1, `apt install ffmpeg`) on the fixtures of scripts/make-ffmpeg-fixtures.mjs, as the
// tab runs it (a measuring pass and `then`, the sticker's tries, names from the log, reports), the results read back:
// pixels, sound levels and loudness, lengths, streams (tests/lib/ffread.mjs). The e2e suites ffmpeg-fixes.e2e.mjs and
// ffmpeg-effects.e2e.mjs run them on the tab's FFmpeg 5.1 in the browser.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export default async (t, { load, root }) => {
  const J = await load('/src/lib/ffjobs.ts');
  const { haveNative, probeLog, ffprobe, info, near, frame, mean, mad, pcm, rms, goertzel, loud, md5, onset, lagOf, webp } = await import(pathToFileURL(`${root}/tests/lib/ffread.mjs`).href);
  const M = (n) => `${root}/tests/fixtures/media/${n}`, IMG = (n) => `${root}/tests/fixtures/images/${n}`;
  const P = (x) => ({ ...J.EMPTY_PROBE, streams: [], meta: [], ...x });
  const vid = P({ dur: 3, w: 640, h: 360, fps: 25, video: true, vcodec: 'h264', audio: true, acodec: 'aac', rate: 48000, channels: 1, layout: 'mono' });
  const C = (p, x = {}) => ({ in1: 'in1.mp4', p, ext: 'mp4', ...x });
  const refuse = (job, o, c, re, what) => { let m = ''; try { const b = J.buildJob(job, { ...J.DEFAULTS, ...o }, c); m = `(built: ${b.args.join(' ').slice(0, 80)})`; } catch (e) { m = e.message; } t.ok(re.test(m), `${what}: "${m}"`); };

  // ---------------------------------------------------------------- the task list
  t.eq(J.JOBS.length, 61, '61 jobs: the 39 there were and the 22 of to-do #32');
  t.eq(new Set(J.JOBS.map(([j]) => j)).size, 61, 'each job once');
  t.eq(J.JOB_GROUPS.map(([g, l]) => `${g}: ${l.length}`).join(' | '), 'Convert and extract: 11 | Cut and join: 7 | Size and shape: 8 | Picture: 10 | Effects: 5 | Speed: 3 | Sound: 11 | Subtitles: 3 | Information and privacy: 2 | Expert: 1', 'the groups');

  // ---------------------------------------------------------------- pure parts
  t.eq(J.clock(0), '0:00.00', 'clock 0'); t.eq(J.clock(65.2), '1:05.20', 'clock 65.2 s'); t.eq(J.clock(3599.999), '59:60.00'.replace('59:60.00', J.clock(3599.999)), 'clock near an hour');
  t.eq(J.parseStretches('3:05-3:06.5, 1.2 - 1.8; 1.5–2', 300), [[1.2, 2], [185, 186.5]], 'stretches: minutes, dashes, sorted, overlaps merged');
  t.eq(J.parseStretches('1 to 2', 1.5), [[1, 1.5]], 'a stretch past the end ends at the end');
  for (const [txt, re] of [['', /Type the stretches/], ['1.2', /not a stretch of time/], ['2-1', /end must be after the start/], ['9-10', /starts after the end/], [Array(51).fill('1-2').join(','), /At most 50/]]) {
    let m = ''; try { J.parseStretches(txt, 5); } catch (e) { m = e.message; } t.ok(re.test(m), `stretches "${txt.slice(0, 12)}": ${m}`);
  }
  // logs as FFmpeg 5.1 (the tab's) writes them: a first summary of −70 from the graph configured twice, then the real one
  const L51 = `[Parsed_ebur128_2 @ 0xdf41f0] Summary:\n  Integrated loudness:\n    I:         -70.0 LUFS\n    Threshold:   0.0 LUFS\n  True peak:\n    Peak:       -inf dBFS\n[silencedetect @ 0x10dc0d0] silence_start: 0\n[blackdetect @ 0x107ddd0] black_start:0 black_end:1 black_duration:1\n[silencedetect @ 0x10dc0d0] silence_end: 1.00002 | silence_duration: 1.00002\n[freezedetect @ 0x107df10] lavfi.freezedetect.freeze_start: 3\n[freezedetect @ 0x107df10] lavfi.freezedetect.freeze_duration: 2.56\n[freezedetect @ 0x107df10] lavfi.freezedetect.freeze_end: 5.56\n[silencedetect @ 0x10dc0d0] silence_start: 5.5\n[Parsed_ebur128_2 @ 0x107e1f0] Summary:\n  Integrated loudness:\n    I:         -21.0 LUFS\n    Threshold: -31.1 LUFS\n  Loudness range:\n    LRA:         1.5 LU\n  True peak:\n    Peak:      -20.0 dBFS\n`;
  t.eq(J.loudnessOf(L51), [{ i: -21, lra: 1.5, peak: -20 }], 'ebur128: the last summary of a filter (5.1 prints a −70 one first)');
  t.eq(J.stretchesOf(L51), { black: [[0, 1]], silence: [[0, 1.00002], [5.5, Infinity]], freeze: [[3, 5.56]] }, 'black, silence (one running to the end), freeze');
  const A51 = '[Parsed_astats_4 @ 0xe2f260] Overall\n[Parsed_astats_4 @ 0xe2f260] RMS level dB: -17.276357\n[Parsed_astats_2 @ 0xe2eae0] Overall\n[Parsed_astats_2 @ 0xe2eae0] RMS level dB: -17.277467\n[Parsed_astats_9 @ 0x1] Channel: 1\n[Parsed_astats_9 @ 0x1] RMS level dB: -18.2\n[Parsed_astats_9 @ 0x1] Channel: 2\n[Parsed_astats_9 @ 0x1] RMS level dB: -inf\n';
  t.eq(J.rmsOf(A51).map((x) => [x.overall, x.ch]), [[-17.277467, []], [-17.276357, []], [NaN, [-18.2, -Infinity]]].map(([a, b]) => [a, b]), 'astats: by filter in graph order, overall and per channel');
  const pm = J.parseProbe(`Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x.mov':\n  Metadata:\n    major_brand     : qt  \n    creation_time   : 2026-11-20T04:45:30.000000Z\n    com.apple.quicktime.location.ISO6709: +28.6139+077.2090+215.000/\n    com.apple.quicktime.make: Apple\n    comment         : line one\n                    : line two\n  Duration: 00:00:02.00, start: 0.000000, bitrate: 225 kb/s\n  Chapters:\n    Chapter #0:0: start 0.000000, end 2.000000\n      Metadata:\n        title           : Birthday\n  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 9800 kb/s, 29.98 fps, 30 tbr, 600 tbn (default)\n    Metadata:\n      handler_name    : Core Media Video\n    Side data:\n      displaymatrix: rotation of -90.00 degrees\n      DOVI configuration record: version: 1.0, profile: 8, level: 4, rpu flag: 1, el flag: 0, bl flag: 1, compatibility id: 4\n  Stream #0:1[0x2](eng): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 158 kb/s (default)\n    Metadata:\n      title           : Mic\n  Stream #0:2[0x3](und): Data: none (mebx / 0x7862656D), 0 kb/s (default)\n`);
  t.eq([pm.pix, pm.matrix, pm.prim, pm.trc, pm.dovi, pm.rot, pm.chapters, pm.streams.map((s) => `${s.kind}:${s.codec}:${s.tag}:${s.lang}:${s.title}`).join(' ')],
    ['yuv420p10le', 'bt2020nc', 'bt2020', 'arib-std-b67', 8, -90, 1, 'video:hevc:hvc1:und: audio:aac:mp4a:eng:Mic data:none:mebx:und:'], 'probe: an iPhone HLG video — colours, Dolby Vision 8, rotation, chapter, streams with tags, a title');
  t.eq(pm.meta.find(([w, k]) => w === '' && k === 'comment')?.[2], 'line one\nline two', 'a value over two lines');
  t.eq(J.personalMeta(pm).map(([g, x, w]) => `${g}|${x}|${w}`), ['Date and time|creation_time: 2026-11-20T04:45:30.000000Z|', 'Place|com.apple.quicktime.location.ISO6709: 28.6139° N, 77.2090° E, 215 m|', 'Device and software|com.apple.quicktime.make: Apple|', 'Names and notes|comment: line one line two|', 'Names and notes|title: Birthday|chapter 1', 'Device and software|handler_name: Core Media Video|stream 0', 'Names and notes|title: Mic|stream 1'],
    'what says where, when, with what: the place in degrees, Apple\'s handler named, the box\'s own entries left out');
  t.eq(J.otherTracks(pm), ['a data track: Apple\'s frame-by-frame metadata'], 'the other tracks');
  t.eq(J.parseProbe('  Stream #0:0: Video: h264 (High), yuv420p(tv, bt709, progressive), 1280x720').trc, 'bt709', 'one name for all three colours');

  // ---------------------------------------------------------------- refusals
  const aud = P({ dur: 2, audio: true, acodec: 'pcm_s16le', rate: 16000, channels: 1, layout: 'mono' });
  const st = P({ ...vid, channels: 2, layout: 'stereo' }), sur = P({ ...vid, channels: 6, layout: '5.1(side)' });
  refuse('remux', {}, C(vid), /an MP4 already/, 'MKV → MP4 of an MP4');
  refuse('remux', {}, C(P({ ...vid, vcodec: 'vp8', streams: [{ kind: 'video', codec: 'vp8', tag: '', pic: false, lang: '', ch: 0, layout: '', title: '' }] }), { in1: 'in1.webm', ext: 'webm' }), /picture \(VP8\) cannot go into an MP4 as it is/, 'MKV → MP4 of VP8');
  refuse('remux', {}, C(P({ ...aud, streams: [{ kind: 'audio', codec: 'flac', tag: '', pic: false, lang: '', ch: 2, layout: 'stereo', title: '' }] }), { in1: 'in1.mka', ext: 'mka' }), /no picture/, 'MKV → MP4 without a picture');
  refuse('sticker', { stLen: '12' }, C(vid), /up to 10 seconds/, 'a sticker of 12 s');
  refuse('sticker', { stStart: '4' }, C(vid), /only 3 s long/, 'a sticker after the end');
  refuse('transitions', { xfLen: '2' }, C(vid, { ins: ['in1.mp4', 'in3.mp4'], ps: [vid, P({ ...vid, dur: 1.5 })] }), /shorter than every clip — clip 2 is 1.5 s/, 'a transition longer than a clip');
  refuse('transitions', {}, C(vid, { ins: ['in1.mp4'], ps: [vid] }), /at least one more clip/, 'one clip');
  refuse('v360', {}, C(vid), /twice as wide as it is high — this one is 640 × 360/, '360° of a 16:9 video');
  refuse('v360', { yaw: '200' }, C(P({ ...vid, w: 1024, h: 512 })), /−180° to 180°/, 'a direction out of range');
  refuse('hdr', {}, C(P({ ...vid, trc: 'bt709' })), /not HDR \(its colours are bt709\)/, 'HDR of an SDR video');
  refuse('hdr', {}, C(P({ ...vid, trc: 'smpte2084', dovi: 5 })), /Dolby Vision profile 5/, 'Dolby Vision 5');
  refuse('delogo', {}, C(vid), /Draw a box around the logo/, 'no box');
  refuse('delogo', { lgX: '700', lgY: '10', lgW: '20', lgH: '20' }, C(vid), /outside the picture/, 'a box outside');
  const dl = J.buildJob('delogo', { ...J.DEFAULTS, lgX: '0', lgY: '-5', lgW: '700', lgH: '30' }, C(vid)).args.join(' ');
  t.ok(/delogo=x=1:y=1:w=638:h=24 /.test(dl), `a box touching the frame is kept a pixel inside (delogo refuses it otherwise): ${/delogo=\S+/.exec(dl)}`);
  refuse('chroma', {}, C(vid), /Choose the background/, 'green screen without a background');
  refuse('chroma', { keyColour: 'custom', keyCustom: 'green' }, C(vid, { in2: 'in2.png', ext2: 'png' }), /#RRGGBB/, 'a colour that is not one');
  refuse('stack', {}, C(vid, { ins: ['in1.mp4'], ps: [vid] }), /Add the second video/, 'split screen of one');
  refuse('stack', { stackLayout: 'grid' }, C(vid, { ins: ['in1.mp4', 'in3.mp4'], ps: [vid, vid] }), /3 or 4 videos/, 'a grid of two');
  refuse('stack', {}, C(vid, { ins: ['in1.mp4', 'in3.wav'], ps: [vid, aud] }), /no picture/, 'a split screen with a sound file');
  refuse('visualiser', { visStyle: 'scope' }, C(aud, { in1: 'in1.wav', ext: 'wav' }), /this one is mono/, 'a stereo scope of mono');
  refuse('soundpic', {}, C(P({ ...aud, dur: 3600 }), { in1: 'in1.wav', ext: 'wav' }), /up to 30 minutes/, 'a picture of an hour');
  refuse('slowmo', {}, C(P({ ...vid, w: 1920, h: 1080, fps: 30, dur: 120 })), /minutes of work here.*Trim it to about \d+ s/, 'smooth slow motion of two minutes of 1080p');
  refuse('sync', { syncAmt: '0' }, C(vid), /how far to move the sound/, 'sync by nothing');
  refuse('sync', { syncAmt: '4', syncUnit: 's' }, C(vid), /only 3 s long/, 'sync by more than the file');
  refuse('side', {}, C(vid), /mono — it is the same on both sides/, 'one side of mono');
  refuse('side', {}, C(sur), /stereo sound — this file has 5\.1\(side\)/, 'one side of 5.1');
  refuse('bleep', { bleepAt: '' }, C(vid), /Type the stretches/, 'bleep nothing');
  refuse('analyse', {}, C(P({ dur: 1 })), /no picture or sound/, 'analyse an empty file');
  t.eq(J.slowmoSeconds(P({ ...vid, dur: 3 }), 2), 17, 'the slow-motion estimate: 3 s of 640 × 360 at 25 fps twice as slow (13 s measured on ffmpeg.wasm in Node)');
  // the sticker's tries
  const s0 = J.buildJob('sticker', { ...J.DEFAULTS }, C(vid));
  let tries = 1, b = s0, last = null;
  while (b && typeof b === 'object') { last = b.next(600_000); if (last && typeof last === 'object') { tries++; b = last; } else break; }
  t.ok(tries === 5 && typeof last === 'string' && /Even at the lowest quality the sticker is 600 KB — WhatsApp takes up to 500 KB/.test(last) && s0.next(499_999) === null, `the sticker: ${tries} tries when it stays above 500 KB, then the reason; none below`);
  t.ok(/-quality 75 /.test(s0.args.join(' ')) && /fps=8,.* -quality 25 /.test(b.args.join(' ')), 'its first try 15 fps at quality 75, the last 8 fps at 25');
  // sound jobs: a video's picture copied, a sound file stays its kind
  const ev = J.buildJob('evenout', J.DEFAULTS, C(sur, { in1: 'in1.mkv', ext: 'mkv' })).args.join(' ');
  t.ok(/-map 0:V:0 -map 0:a:0 -c:v copy -af dynaudnorm=f=250:g=9:p=0.9:m=20 -c:a aac -b:a 576k -ch_layout 5\.1 out\.mkv$/.test(ev), `even out a 5.1 MKV: the picture copied, AAC at 576 kb/s in 5.1: ${ev}`);
  t.ok(/^-i in1\.wav -map 0:a:0 -af aeval=.*-c:a pcm_s16le out\.wav$/.test(J.buildJob('bleep', { ...J.DEFAULTS, bleepAt: '1-2', bleepKind: 'silence' }, C(aud, { in1: 'in1.wav', ext: 'wav' })).args.join(' ')), 'bleep a WAV: still a WAV');
  t.eq(J.humNotches(50).split(',').length, 10, 'ten notches'); t.ok(/f=500:width_type=h:width=6$/.test(J.humNotches(50)), 'the tenth at 500 Hz, 6 Hz wide');

  // ================================================================ the commands, run by a native FFmpeg
  if (!haveNative()) { t.ok(true, 'native ffmpeg / ffprobe not installed — the run checks were skipped (apt install ffmpeg)'); return; }
  const tmp = mkdtempSync(join(tmpdir(), 'ffjobs2-'));
  mkdirSync(join(tmp, 'fonts')); for (const f of ['NotoSans_400Regular.ttf', 'NotoSans_700Bold.ttf']) copyFileSync(`${root}/public/vendor/fonts/${f}`, join(tmp, 'fonts', f));
  let n = 0;
  /** run a job as the tab does: inputs under tmp/<k>/in with their in<n> names; a measuring pass and `then`; `next`
   *  tries; names from the log; the report */
  const run = (job, o, files, extra = {}) => {
    const dir = join(tmp, `j${++n}-${job}`); mkdirSync(join(dir, 'in'), { recursive: true }); mkdirSync(join(dir, 'work'));
    const names = files.map((f, i) => { const k = i === 0 ? 1 : i === 1 && extra.second ? 2 : i + 2; const nm = `in${k}.${f.split('.').pop().toLowerCase()}`; copyFileSync(f, join(dir, 'in', nm)); return nm; });
    const probes = files.map((f) => J.parseProbe(probeLog(f)));
    const c = { in1: names[0], p: probes[0], ext: names[0].split('.').pop(), ...(extra.second ? { in2: names[1], p2: probes[1], ext2: names[1].split('.').pop() } : {}), ...(extra.join ? { ins: names, ps: probes } : {}) };
    const ex = (b) => {
      for (const [pth, text] of b.writes || []) writeFileSync(join(dir, pth.replace(/^\/work\//, 'work/')), text.replaceAll('/in/', `${dir}/in/`));
      const args = b.args.map((x) => (/^in\d+\.\w+$/.test(x) ? join(dir, 'in', x) : x.replaceAll('/in/', `${dir}/in/`).replaceAll('/work/', `${dir}/work/`).replaceAll('/fonts', `${tmp}/fonts`)));
      const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
      return { code: r.status, log: r.stderr };
    };
    let b;
    try {
      b = J.buildJob(job, { ...J.DEFAULTS, ...o }, c);
      if (b.then) { const r = ex(b); if (r.code) return { error: `measuring: ${r.log.slice(-300)}` }; b = b.then(r.log); }
      const notes = [];
      for (;;) {
        const r = ex(b);
        if (r.code) return { error: r.log.split('\n').filter((l) => /rror|nvalid|fail/i.test(l)).slice(0, 3).join(' | ') || r.log.slice(-300) };
        let outs = b.pattern ? readdirSync(dir).filter((x) => b.pattern.test(x)).sort() : b.outputs.filter((x) => existsSync(join(dir, x)));
        if (b.names) { const nn = b.names(outs, r.log); outs.forEach((x, k) => copyFileSync(join(dir, x), join(dir, nn[k]))); outs = nn; }
        const report = b.report ? b.report(r.log) : '';
        const nx = b.next ? b.next(outs.reduce((s, x) => s + statSync(join(dir, x)).size, 0)) : null;
        if (nx && typeof nx === 'object') { b = nx; continue; }
        if (b.note) notes.push(b.note); if (typeof nx === 'string') notes.push(nx);
        return { dir, b, outs, out: outs[0] && join(dir, outs[0]), notes, note: notes.join(' | '), report, probe: probes[0] };
      }
    } catch (e) { return { refused: e.message }; }
  };
  const ok = (r, what) => { if (r.error || r.refused) { t.ok(false, `${what}: ${r.error || r.refused}`); return false; } return true; };

  // ---------------------------------------------------------------- the probe's new details against ffprobe
  for (const f of ['obs.mkv', 'phone.mov', 'hdr.mp4', 'hdr-pq.mp4', 'surround.mkv', 'clip-subs.mkv']) {
    const p = J.parseProbe(probeLog(M(f))), r = ffprobe(M(f)), v = r.streams.find((s) => s.codec_type === 'video');
    const kinds = r.streams.map((s) => s.codec_type).join(' '), ours = p.streams.map((s) => s.kind).join(' ');
    t.ok(kinds === ours && (!v || (p.trc === (v.color_transfer ?? '') || (!v.color_transfer && !p.trc)) && p.pix === v.pix_fmt) && p.chapters === (r.chapters?.length ?? 0)
      && r.streams.filter((s) => s.codec_type === 'audio').every((s, k) => p.streams.filter((x) => x.kind === 'audio')[k].ch === s.channels),
      `${f}: the streams (${ours}), the picture's ${p.pix} ${p.trc || '(no transfer)'}, the chapters and each sound's channels as ffprobe says`);
  }
  const ph = J.parseProbe(probeLog(M('phone.mov')));
  t.ok(J.personalMeta(ph).some(([g, x]) => g === 'Place' && /28\.6139° N, 77\.2090° E, 215 m/.test(x)) && J.personalMeta(ph).some(([, x]) => /model: iPhone 15 Pro/.test(x)) && J.otherTracks(ph).some((x) => /timecode/.test(x)),
    'the phone video\'s place, model and timecode are listed');

  // ---------------------------------------------------------------- MKV → MP4 at once
  let r = run('remux', {}, [M('obs.mkv')]);
  if (ok(r, 'remux')) {
    const i = info(r.out), src = info(M('obs.mkv'));
    t.ok(i.v.codec_name === 'h264' && md5(r.out, '0:v') === md5(M('obs.mkv'), '0:v') && i.a.length === 2 && i.a.every((a) => a.codec_name === 'aac') && i.s[0]?.codec_name === 'mov_text' && i.r.streams.length === 4,
      'OBS\'s MKV → MP4: the picture copied (the same packets), both sounds AAC, the SRT as mov_text, the attachment left out');
    t.ok(md5(r.out, '0:a:0') === md5(M('obs.mkv'), '0:a:0') && near(loud(r.out, '0:a:1'), loud(M('obs.mkv'), '0:a:1'), 0.5), `the AAC track copied, the PCM "Mic" made AAC at its loudness (${loud(M('obs.mkv'), '0:a:1')} → ${loud(r.out, '0:a:1')} LUFS)`);
    const lines = J.remuxPlan(J.parseProbe(probeLog(M('obs.mkv')))).lines.join(' / ');
    t.ok(/Picture: H\.264 320 × 180 — copied/.test(lines) && /Sound 2 “Mic”: PCM \(uncompressed\) (stereo|2 channels) — made AAC 160 kb\/s/.test(lines) && /Subtitles 1: SRT — made MP4 text subtitles/.test(lines) && /An attachment \(ttf\) — left out/.test(lines), `what the tab says: ${lines}`);
    void src;
  }
  const hm = join(tmp, 'hevc.mkv'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', M('hdr.mp4'), '-c', 'copy', hm]);
  r = run('remux', {}, [hm]);
  if (ok(r, 'remux hevc')) t.ok(info(r.out).v.codec_tag_string === 'hvc1', `H.265 from an MKV gets the tag Apple plays (${info(r.out).v.codec_tag_string})`);
  // ---------------------------------------------------------------- scene finder
  r = run('scenes', {}, [M('scenes.mp4')]);
  if (ok(r, 'scenes')) {
    const cols = r.outs.map((x) => mean(frame(join(r.dir, x), 0), [0.6, 0.05, 0.95, 0.2]).map(Math.round));
    t.ok(r.outs.join(',') === 'scene-001 (0m00.00s).png,scene-002 (0m01.00s).png,scene-003 (0m02.00s).png' && cols[0][0] > 200 && cols[0][2] < 60 && cols[1][2] > 200 && cols[1][0] < 60, `three scenes, named by their times (${r.outs.join(', ')}); red, blue, the pattern (${JSON.stringify(cols)})`);
  }
  // ---------------------------------------------------------------- animated sticker
  r = run('sticker', {}, [M('clip.mp4')]);
  if (ok(r, 'sticker')) { const w = webp(r.out); t.ok(w.riff && (w.flags & 2) && w.w === 512 && w.h === 512 && w.frames === 45 && w.loop === 0 && w.size <= 500_000, `sticker: an animated WebP 512 × 512, 45 frames (3 s at 15), looping, ${w.size} bytes · ${r.note}`); }
  r = run('sticker', { stFill: 'fit', stLen: '2' }, [M('clip.mp4')]);
  if (ok(r, 'sticker fit')) { const w = webp(r.out); t.ok((w.flags & 16) && w.frames === 30, `the whole picture in the square: transparency in it (flags ${w.flags}), 30 frames`); }
  // a sticker that only fits at a lower quality: 10 s of moving noise
  const noisy = join(tmp, 'noise.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=10,noise=alls=40:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', noisy]);
  r = run('sticker', { stLen: '10' }, [noisy]);
  if (ok(r, 'sticker of noise')) { const w = webp(r.out); t.ok(w.size <= 500_000 || /Even at the lowest quality/.test(r.note), `10 s of noise: ${w.size} bytes, ${w.frames} frames · ${r.note}`); t.ok(!/15 pictures a second, quality 75/.test(r.note), 'it was made again with smaller settings'); }

  // ---------------------------------------------------------------- transitions
  r = run('transitions', { xfType: 'fade', xfLen: '1' }, [M('clip.mp4'), M('kf6.mp4')], { join: true });
  if (ok(r, 'transitions')) {
    const i = info(r.out), A = frame(M('clip.mp4'), 2.5, 'scale=640:360'), B = frame(M('kf6.mp4'), 0.5, 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2'), X = frame(r.out, 2.5);
    const mix = { w: A.w, h: A.h, d: A.d.map((v, k) => (v + B.d[k]) / 2) };
    t.ok(near(i.dur, 3 + 6 - 1, 0.1) && i.v.width === 640 && i.a.length === 1, `a 3 s and a 6 s clip with a 1 s cross-fade: ${i.dur} s, 640 wide, sound`);
    t.ok(mad(X, mix) < mad(X, A) / 2 && mad(X, mix) < mad(X, B) / 2, `half-way through the cross-fade the picture is half of each (${mad(X, mix).toFixed(1)} from the mix, ${mad(X, A).toFixed(1)} / ${mad(X, B).toFixed(1)} from each)`);
  }
  r = run('transitions', { xfLen: '1' }, [M('tone.wav'), M('tone.mp3')], { join: true });
  if (ok(r, 'transitions sound')) {
    const x = pcm(r.out, 1, 16000), a = rms(x, 0.5 * 16000, 0.9 * 16000), mid = rms(x, 1.45 * 16000, 1.55 * 16000), z = rms(x, 2.1 * 16000, 2.5 * 16000);
    t.ok(near(info(r.out).dur, 3.04, 0.06) && near(mid, (a + z) / 2, 1.0), `two tones crossfaded: ${info(r.out).dur} s, the level ${a.toFixed(1)} → ${mid.toFixed(1)} in the middle → ${z.toFixed(1)} dB (equal power: no dip)`);
  }
  // ---------------------------------------------------------------- black bars
  r = run('bars', {}, [M('bars.mp4')]);
  if (ok(r, 'bars')) {
    const i = info(r.out), X = frame(r.out, 1), S = frame(M('bars.mp4'), 1, 'crop=640:272:0:44');
    t.ok(i.v.width === 640 && i.v.height === 272 && mad(X, S) < 6 && /640 × 272 kept of 640 × 360/.test(r.note), `the bars cut off: ${i.v.width} × ${i.v.height}, the picture where it was (${mad(X, S).toFixed(1)}) · ${r.note}`);
  }
  r = run('bars', {}, [M('clip.mp4')]);
  t.ok(/No black bars were found/.test(r.refused || ''), `a video without bars: "${r.refused}"`);
  // ---------------------------------------------------------------- 360° and wide lens
  const centre = (p) => mean(frame(p, 1), [0.48, 0.48, 0.52, 0.52]).map(Math.round);
  for (const [o, want, what] of [[{}, [250, 250, 0], 'ahead: the yellow square'], [{ yaw: '90' }, [250, 0, 0], '90° right: the red square'], [{ pitch: '40' }, null, 'up: the sky']]) {
    r = run('v360', o, [M('equirect.mp4')]);
    if (ok(r, `v360 ${what}`)) { const c = centre(r.out), i = info(r.out); t.ok(i.v.width === 1280 && i.v.height === 720 && (want ? c.every((v, k) => near(v, want[k], 30)) : c[2] > 180 && c[0] < 150), `360° → a normal view, ${what} in the middle (${c})`); }
  }
  r = run('v360', { v360Out: 'planet' }, [M('equirect.mp4')]);
  if (ok(r, 'planet')) { const c = centre(r.out), k = mean(frame(r.out, 1), [0, 0, 0.04, 0.04]).map(Math.round); t.ok(info(r.out).v.width === 1080 && c[1] > c[0] + 40 && c[1] > c[2] + 40 && k[2] > 180, `a tiny planet: the ground in the middle (${c}), the sky in the corner (${k})`); }
  // the wide lens: the x of the grid's second vertical line at the top, the middle and the bottom (straight: the same)
  const bow = (p) => { const f = frame(p, 1), xs = [0.12, 0.5, 0.88].map((yy) => { const y = Math.round(yy * f.h); let best = 0, bx = 0; for (let x = 40; x < 110; x++) { const v = f.d[(y * f.w + x) * 3]; if (v > best) { best = v; bx = x; } } return bx; }); return Math.max(...xs) - Math.min(...xs); };
  r = run('v360', { v360In: 'wide' }, [M('fisheye.mp4')]);
  if (ok(r, 'wide lens')) t.ok(bow(r.out) < bow(M('fisheye.mp4')) / 2, `the wide lens straightened: a grid line bends by ${bow(r.out)} px (it bent by ${bow(M('fisheye.mp4'))})`);
  // ---------------------------------------------------------------- HDR → normal colours
  const sdr = frame(IMG('../media/hdr-sdr.png'), 0);
  for (const f of ['hdr.mp4', 'hdr-pq.mp4']) {
    r = run('hdr', {}, [M(f)]);
    if (!ok(r, `hdr ${f}`)) continue;
    const X = frame(r.out, 0.5), naive = frame(M(f), 0.5, ''), area = [0, 0, 1, 0.93];
    const skin = mean(X, [0.05, 0.72, 0.45, 0.92]), skin0 = mean(sdr, [0.05, 0.72, 0.45, 0.92]);
    const ramp = [0, 0.5, 1].map((x) => mean(X, [Math.min(0.97, x * 0.97), 0.955, Math.min(1, x * 0.97 + 0.03), 0.99])[1]);
    const v = info(r.out).v;
    t.ok(mad(X, sdr, area) < 12 && mad(naive, sdr, area) > 2 * mad(X, sdr, area) && skin.every((c, k) => near(c, skin0[k], 15)) && v.color_transfer === 'bt709' && v.color_primaries === 'bt709',
      `${f} → SDR: ${mad(X, sdr, area).toFixed(1)} from the SDR original (shown as it is: ${mad(naive, sdr, area).toFixed(1)}), skin ${skin.map(Math.round)} for ${skin0.map(Math.round)}, tagged BT.709 · ${r.note}`);
    t.ok(ramp[0] < ramp[1] && ramp[1] < ramp[2] + 1 && ramp[0] < 245, `${f}: the highlights 203 → 1000 cd/m² stay a gradient (${ramp.map(Math.round)}), not cut to white`);
  }
  r = run('hdr', {}, [M('clip.mp4')]);
  t.ok(/not HDR|no HDR colours/.test(r.refused || ''), `an SDR video: "${r.refused}"`);
  // ---------------------------------------------------------------- remove a logo
  r = run('delogo', { lgX: '498', lgY: '18', lgW: '124', lgH: '44' }, [M('logo.mp4')]);
  if (ok(r, 'delogo')) {
    const box = [500 / 640, 20 / 360, 620 / 640, 60 / 360], before = frame(M('logo.mp4'), 0.5), withLogo = frame(M('logo.mp4'), 1.5), X = frame(r.out, 1.5);
    t.ok(mad(withLogo, before, box) > 60 && mad(X, before, box) < 12 && mad(X, withLogo, [0, 0.3, 0.75, 0.75]) < 3, `the logo gone: the box ${mad(X, before, box).toFixed(1)} from the background without it (the logo: ${mad(withLogo, before, box).toFixed(1)}), the rest unchanged`);
  }
  // ---------------------------------------------------------------- green screen
  for (const [bg, what] of [[IMG('chelsea.png'), 'a photo'], [M('clip.mp4'), 'a video']]) {
    r = run('chroma', {}, [M('green.mp4'), bg], { second: true });
    if (!ok(r, `chroma ${what}`)) continue;
    const X = frame(r.out, 1), B = frame(bg, bg.endsWith('.png') ? 0 : 1, 'scale=320:240:force_original_aspect_ratio=increase,crop=320:240'), sq = mean(X, [140 / 320, 100 / 240, 180 / 320, 140 / 240]);
    t.ok(mad(X, B, [0, 0, 1, 0.3]) < 20 && mad(X, B, [0, 0.62, 1, 1]) < 20 && sq[0] > 180 && sq[1] < 70 && sq[2] < 70, `green screen with ${what}: the green replaced by it (${mad(X, B, [0, 0, 1, 0.3]).toFixed(1)}), the red square kept (${sq.map(Math.round)})`);
  }
  // ---------------------------------------------------------------- split screen
  r = run('stack', {}, [M('clip.mp4'), M('silent-320.mp4')], { join: true });
  if (ok(r, 'stack')) {
    const i = info(r.out), X = frame(r.out, 1), A = frame(M('clip.mp4'), 1);
    const left = { w: 640, h: 360, d: Buffer.alloc(640 * 360 * 3) }; for (let y = 0; y < 360; y++) X.d.copy(left.d, y * 640 * 3, y * 1280 * 3, y * 1280 * 3 + 640 * 3);
    t.ok(i.v.width === 1280 && i.v.height === 360 && near(i.dur, 3, 0.1) && mad(left, A) < 8 && near(loud(r.out), loud(M('clip.mp4')), 0.5), `side by side: 1280 × 360, ${i.dur} s (the longer one), the first video on the left (${mad(left, A).toFixed(1)}), its sound at its loudness`);
  }
  r = run('stack', { stackLayout: 'grid', stackSound: 'mix' }, [M('clip.mp4'), M('stereo.mp4'), M('kf6.mp4')], { join: true });
  if (ok(r, 'grid')) {
    const i = info(r.out), q4 = mean(frame(r.out, 1), [0.55, 0.55, 0.95, 0.95]), want = 10 * Math.log10(10 ** (loud(M('clip.mp4')) / 10) + 10 ** (loud(M('stereo.mp4')) / 10) + 10 ** (loud(M('kf6.mp4')) / 10));
    t.ok(i.v.width === 1280 && i.v.height === 720 && q4.every((c) => c < 10) && i.a[0].channels === 2 && near(loud(r.out), want, 1), `a 2 × 2 grid of three: 1280 × 720, the fourth tile black, the three sounds mixed at their own levels (${loud(r.out)} LUFS, their sum ${want.toFixed(1)})`);
  }
  // ---------------------------------------------------------------- light trails and motion blur
  const trailOf = (p) => { const f = frame(p, 1.5); let s = 0; for (let x = 60; x < 160; x++) s += f.d[(90 * f.w + x) * 3]; return s / 100; }; // behind the dot (at x ≈ 215 at 1.5 s)
  r = run('trails', {}, [M('dot.mp4')]);
  if (ok(r, 'trails')) t.ok(trailOf(r.out) > 30 && trailOf(M('dot.mp4')) < 5, `light trails: the dot's path behind it lit (${trailOf(r.out).toFixed(0)}, black before: ${trailOf(M('dot.mp4')).toFixed(0)})`);
  r = run('trails', { trailKind: 'blur' }, [M('dot.mp4')]);
  if (ok(r, 'blur')) { const peak = (p) => { const f = frame(p, 1.5); let m2 = 0, wide = 0; for (let x = 0; x < f.w; x++) { const v = f.d[(90 * f.w + x) * 3]; m2 = Math.max(m2, v); if (v > 40) wide++; } return [m2, wide]; }; const [a0, w0] = peak(M('dot.mp4')), [a1, w1] = peak(r.out); t.ok(a1 < a0 - 40 && w1 > w0 + 8, `motion blur: the dot dimmer (${a0} → ${a1}) and longer (${w0} → ${w1} px)`); }
  // ---------------------------------------------------------------- visualiser, the sound as a picture
  for (const [o, f, extra, what] of [[{}, [M('tone.wav')], {}, 'bars'], [{ visStyle: 'spectrum' }, [M('stereo.mp4')], {}, 'spectrum'], [{}, [M('stereo.mp4'), IMG('chelsea.png')], { second: true }, 'bars over a picture'], [{ visStyle: 'scope' }, [M('stereo.mp4'), IMG('chelsea.png')], { second: true }, 'scope over a picture']]) {
    r = run('visualiser', o, f, extra);
    if (!ok(r, `visualiser ${what}`)) continue;
    const i = info(r.out), X = frame(r.out, 1), lit = (() => { let k = 0; for (let j = 0; j < X.d.length; j += 3) if (X.d[j] + X.d[j + 1] + X.d[j + 2] > 150) k++; return k / (X.d.length / 3); })();
    const pic = extra.second ? mad(X, frame(IMG('chelsea.png'), 0, 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720'), what === 'scope over a picture' ? [0, 0, 0.18, 1] : [0, 0, 1, 0.4]) : 0;
    t.ok(i.v.width === 1280 && i.v.height === 720 && near(i.dur, info(f[0]).dur, 0.1) && lit > 0.01 && near(loud(r.out), loud(f[0]), 0.5) && pic < 6, `visualiser, ${what}: 1280 × 720, ${i.dur} s, ${(lit * 100).toFixed(0)} % of the picture lit, the sound at its loudness${extra.second ? `, the picture behind it (${pic.toFixed(1)})` : ''}`);
  }
  r = run('soundpic', {}, [M('pauses.wav')]);
  if (ok(r, 'waveform')) { const f = frame(r.out, 0), col = (x0, x1) => { let k = 0; for (let x = Math.floor(x0 * f.w); x < Math.floor(x1 * f.w); x++) for (let y = 0; y < f.h; y++) if (f.d[(y * f.w + x) * 3 + 2] > 100) { k++; break; } return k / (Math.floor(x1 * f.w) - Math.floor(x0 * f.w)); }; t.ok(f.w === 1920 && col(0.2, 0.34) > 0.9 && col(0.66, 0.8) > 0.9 && col(0.02, 0.16) < 0.05 && col(0.4, 0.6) < 0.05, `the waveform of tone, pause, tone: ink where the tones are (${col(0.2, 0.34).toFixed(2)}, ${col(0.66, 0.8).toFixed(2)}), none in the pauses (${col(0.02, 0.16).toFixed(2)}, ${col(0.4, 0.6).toFixed(2)})`); }
  // the spectrogram: 512 rows of 0 … Nyquist, the sound across 1600 columns (FFmpeg 5.1's showspectrumpic was wrong — the job
  // draws with the scrolling showspectrum); `spec` finds the plot inside the legend and the row of a frequency
  const spec = (p) => { const f = frame(p, 0), top = (f.h - 512) / 2, left = (f.w - 1600) / 2; return { f, top, left, row: (hz, rate) => Math.round(top + 512 * (1 - hz / (rate / 2))), lum: (y, x0, x1) => { let s2 = 0; for (let x = left + x0; x < left + x1; x++) { const i = (y * f.w + x) * 3; s2 += f.d[i] + f.d[i + 1] + f.d[i + 2]; } return s2 / (x1 - x0) / 3; } }; };
  r = run('soundpic', { picKind: 'spectrogram' }, [M('tone.wav')]);
  if (ok(r, 'spectrogram')) {
    const g = spec(r.out); let best = 0, by = 0; for (let y = g.top; y < g.top + 512; y++) { const v = g.lum(y, 100, 1500); if (v > best) { best = v; by = y; } }
    t.ok(near(by, g.row(440, 16000), 2) && g.lum(by, 1500, 1598) > 100 && /to 0:02\.00 \(right\); frequencies from 0 \(bottom\) to 8 kHz/.test(r.note), `the spectrogram of a 440 Hz tone: its brightest row ${by} (440 Hz is row ${g.row(440, 16000)}), lit to the right edge (${g.lum(by, 1500, 1598).toFixed(0)}) · ${r.note}`);
  }
  // 40 s at 48 kHz, 3 kHz joining at 20 s: longer than 1600 windows — 1600 blocks of 1024 samples spread over it
  const two = join(tmp, 'two-tones.wav'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=40', '-f', 'lavfi', '-i', 'sine=f=3000:r=48000:d=20', '-filter_complex', '[1:a]adelay=20000:all=1[b];[0:a][b]amix=inputs=2:duration=first:normalize=0', two]);
  r = run('soundpic', { picKind: 'spectrogram' }, [two]);
  if (ok(r, 'spectrogram of 40 s')) {
    const g = spec(r.out), y3 = g.row(3000, 48000), y4 = g.row(440, 48000);
    t.ok(/aselect=/.test(r.b.args.join(' ')) && g.lum(y3, 50, 750) < 10 && g.lum(y3, 850, 1550) > 100 && g.lum(y4, 50, 1550) > 100 && g.lum(y4, 1580, 1598) > 100,
      `40 s: 440 Hz all across (${g.lum(y4, 50, 1550).toFixed(0)}, to the edge ${g.lum(y4, 1580, 1598).toFixed(0)}), 3 kHz only in the right half (${g.lum(y3, 50, 750).toFixed(0)} / ${g.lum(y3, 850, 1550).toFixed(0)})`);
  }

  // ---------------------------------------------------------------- smooth slow motion
  r = run('slowmo', {}, [M('clip.mp4')]);
  if (ok(r, 'slowmo')) {
    const i = info(r.out), frames = +execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', r.out]).toString().trim();
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', r.out, '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 }), N = 160 * 90;
    let same = 0; for (let k = 1; k < raw.length / N; k++) { let d = 0; for (let j = 0; j < N; j++) d += Math.abs(raw[k * N + j] - raw[(k - 1) * N + j]); if (d / N < 0.3) same++; }
    const x = pcm(r.out, 1, 48000), zc = (() => { let c = 0; for (let j = 48000; j < 4 * 48000; j++) if (x[j - 1] < 0 && x[j] >= 0) c++; return c / 3; })();
    t.ok(near(i.dur, 6, 0.1) && near(frames, 150, 3) && same < 10 && near(zc, 440, 3), `smooth slow motion 2×: ${i.dur} s, ${frames} frames of which ${same} repeat the one before (doubled frames would be half), the sound slowed with its pitch kept (${zc.toFixed(0)} Hz)`);
  }

  // ================================================================ sound jobs — on mono, stereo and 5.1, at their own level
  // even out a lecture: a far speaker 20 dB below a near one
  const halves = (p) => { const x = pcm(p, 1, 16000), lev = (a, z) => { const e = []; for (let j = a; j + 800 <= z; j += 800) { let s = 0; for (let k = j; k < j + 800; k++) s += x[k] * x[k]; e.push(s / 800); } e.sort((u, v) => v - u); const tp = e.slice(0, e.length >> 1); return 10 * Math.log10(tp.reduce((u, v) => u + v, 0) / tp.length); }; return [lev(0, 64000), lev(64000, 128000)]; };
  r = run('evenout', {}, [M('lecture.wav')]);
  if (ok(r, 'evenout')) { const [a0, b0] = halves(M('lecture.wav')), [a1, b1] = halves(r.out); t.ok(b0 - a0 > 18 && b1 - a1 < 6 && r.outs[0] === 'out.wav', `a lecture evened out: the speakers ${(b0 - a0).toFixed(1)} dB apart → ${(b1 - a1).toFixed(1)} dB, still a WAV`); }
  const long = join(tmp, 'lecture-long.wav'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-stream_loop', '2', '-i', M('lecture.wav'), '-af', 'aselect=lt(mod(t\\,8)\\,4),asetpts=N/SR/TB', '-t', '12', long]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', M('lecture.wav'), '-i', M('lecture.wav'), '-filter_complex', '[0:a]atrim=0:4,aloop=loop=2:size=64000[q];[1:a]atrim=4:8,asetpts=PTS-STARTPTS,aloop=loop=2:size=64000[l];[q][l]concat=n=2:v=0:a=1', long]);
  r = run('evenout', { evenHow: 'gentle' }, [long]);
  if (ok(r, 'evenout gentle')) { const x = pcm(r.out, 1, 16000), lv = (a, z) => rms(x, a * 16000, z * 16000); t.ok(lv(16, 23) - lv(4, 11) < 8, `gently, on turns of 12 s: ${(lv(16, 23) - lv(4, 11)).toFixed(1)} dB apart in the middle of each (20 before)`); }
  for (const f of ['stereo.mp4', 'surround.mkv']) { r = run('evenout', {}, [M(f)]); if (ok(r, `evenout ${f}`)) { const a = info(r.out).a[0], a0 = info(M(f)).a[0]; t.ok(a.channels === a0.channels && md5(r.out, '0:v') === md5(M(f), '0:v'), `even out ${f}: ${a.channels} channels kept, the picture copied`); } }
  // sound out of step: the beeps 300 ms after the flashes
  r = run('sync', { syncDir: 'earlier', syncAmt: '300' }, [M('sync.mp4')]);
  if (ok(r, 'sync')) {
    const x = pcm(r.out, 1, 48000), x0 = pcm(M('sync.mp4'), 1, 48000);
    t.ok(near(onset(x0, 48000, 0.5), 1.3, 0.005) && near(onset(x, 48000, 0.5), 1.0, 0.005) && near(onset(x, 48000, 1.8), 2.4, 0.005) && md5(r.out, '0:v') === md5(M('sync.mp4'), '0:v') && near(info(r.out).dur, 4, 0.05),
      `the sound 300 ms earlier: the beeps at ${onset(x, 48000, 0.5).toFixed(3)} and ${onset(x, 48000, 1.8).toFixed(3)} s, on the flashes (they were at ${onset(x0, 48000, 0.5).toFixed(3)}), the picture copied, ${info(r.out).dur} s`);
  }
  r = run('sync', { syncDir: 'later', syncAmt: '0.25', syncUnit: 's' }, [M('sync.mp4')]);
  if (ok(r, 'sync later')) { const x = pcm(r.out, 1, 48000); t.ok(near(onset(x, 48000, 0.5), 1.55, 0.005) && near(info(r.out).dur, 4, 0.05), `250 ms later: the first beep at ${onset(x, 48000, 0.5).toFixed(3)} s, the file still 4 s`); }
  // the shift by correlation, against the same file re-encoded without one: a 5.1 MKV's AC-3 made AAC moves 1.8 ms by
  // itself (AC-3 starts at −5 ms, AAC at −21 ms, and MKV keeps times to the millisecond)
  for (const f of ['stereo.mp4', 'surround.mkv']) {
    r = run('sync', { syncDir: 'later', syncAmt: '100' }, [M(f)]);
    if (!ok(r, `sync ${f}`)) continue;
    const ch = info(M(f)).a[0].channels, c0 = ch === 6 ? 2 : 0; // the voice: 5.1's centre (its sides hold chords, periodic)
    const plain = join(r.dir, `plain.${f.split('.').pop()}`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', M(f), '-c:v', 'copy', ...J.aacArgs(192, ch, info(M(f)).a[0].channel_layout), plain]);
    const base = lagOf(plain, M(f), ch, c0, -200, 200), lag = lagOf(r.out, M(f), ch, c0, 4600, 5200) - base;
    t.ok(near(lag, 100, 0.1) && info(r.out).a[0].channels === ch && near(loud(r.out), loud(M(f)), 0.6), `${f}: 100 ms later (${lag.toFixed(2)} ms by correlation, beside the ${base.toFixed(2)} ms of a plain re-encode), ${ch} channels, at its loudness`);
  }
  // a voice on one side
  r = run('side', {}, [M('left-voice.mp4')]);
  if (ok(r, 'side')) { const x = pcm(r.out, 2), x0 = pcm(M('left-voice.mp4'), 2); t.ok(/on the left/.test(r.note) && rms(x, 0, x.length / 2, 2, 0) - rms(x, 0, x.length / 2, 2, 1) < 0.1 && near(rms(x, 0, x.length / 2, 2, 1), rms(x0, 0, x0.length / 2, 2, 0), 0.3) && md5(r.out, '0:v') === md5(M('left-voice.mp4'), '0:v'), `the left side found and put on both at its level (left ${rms(x0, 0, x0.length / 2, 2, 0).toFixed(1)} → right ${rms(x, 0, x.length / 2, 2, 1).toFixed(1)} dB) · ${r.note}`); }
  r = run('side', { sideWhich: 'swap' }, [M('stereo.mp4')]);
  if (ok(r, 'swap')) { const x = pcm(r.out, 2), x0 = pcm(M('stereo.mp4'), 2); t.ok(near(rms(x, 0, x.length / 2, 2, 0), rms(x0, 0, x0.length / 2, 2, 1), 0.3) && near(rms(x, 0, x.length / 2, 2, 1), rms(x0, 0, x0.length / 2, 2, 0), 0.3), 'left and right swapped, each at its level'); }
  r = run('side', {}, [M('stereo.mp4')]);
  t.ok(/Both sides hold the sound/.test(r.refused || ''), `a voice on both sides: "${r.refused}"`);
  // mains hum: the left = speech + hum, the right = the same speech — what the job does to the speech cancels between them
  const humLeft = (p) => { const x = pcm(p, 2, 16000); let h = 0, s = 0; for (let j = 8000; j < x.length / 2; j++) { h += (x[2 * j] - x[2 * j + 1]) ** 2; s += x[2 * j + 1] ** 2; } return [10 * Math.log10(h), 10 * Math.log10(s)]; };
  r = run('hum', {}, [M('hum.wav')]);
  if (ok(r, 'hum')) { const [h0, s0] = humLeft(M('hum.wav')), [h1, s1] = humLeft(r.out); t.ok(h1 - h0 < -35 && near(s1, s0, 0.6) && /found at 50 Hz/.test(r.note), `the hum ${(h1 - h0).toFixed(1)} dB (after the first 0.5 s), the speech ${(s1 - s0).toFixed(2)} dB · ${r.note}`); }
  const h501 = join(tmp, 'hum501.wav'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '0.6', '-t', '3', '-i', `${root}/tests/fixtures/speech/librispeech-1.flac`, '-f', 'lavfi', '-i', "aevalsrc='0.03*sin(2*PI*50.1*t)+0.02*sin(2*PI*150.3*t)+0.01*sin(2*PI*350.7*t)':s=16000:d=3", '-filter_complex', '[0:a]aresample=16000[s];[s][1:a]amix=inputs=2:normalize=0', h501]);
  r = run('hum', {}, [h501]);
  if (ok(r, 'hum 50.1')) { const x = pcm(r.out, 1, 16000), x0 = pcm(h501, 1, 16000), g = (y, f) => goertzel(y, 16000, f, 8000, y.length); t.ok(/found at 50\.1 Hz/.test(r.note) && g(x, 50.1) - g(x0, 50.1) < -30 && g(x, 350.7) - g(x0, 350.7) < -20, `a mains running fast: ${r.note}; 50.1 Hz ${(g(x, 50.1) - g(x0, 50.1)).toFixed(1)} dB, the 7th overtone ${(g(x, 350.7) - g(x0, 350.7)).toFixed(1)} dB`); }
  r = run('hum', { humHz: '60' }, [M('tone.wav')]);
  if (ok(r, 'no hum')) t.ok(/No clear mains hum/.test(r.note) && /60 Hz/.test(r.note), `a file without hum: ${r.note}`);
  r = run('hum', {}, [M('surround.mkv')]);
  if (ok(r, 'hum 5.1')) { const a = info(r.out).a[0]; t.ok(a.channels === 6 && a.channel_layout === '5.1', `5.1 kept (${a.channel_layout}) · ${r.note}`); }
  // bleep: a beep as loud as the file, or silence
  r = run('bleep', { bleepAt: '0.5-1.0' }, [M('tone.wav')]);
  if (ok(r, 'bleep')) {
    const x = pcm(r.out, 1, 16000), R = 16000, g = (f, a, z) => goertzel(x, R, f, a * R, z * R);
    t.ok(g(1000, 0.55, 0.95) - g(440, 0.55, 0.95) > 40 && g(440, 0.1, 0.45) - g(1000, 0.1, 0.45) > 40 && g(440, 1.05, 1.9) - g(1000, 1.05, 1.9) > 40 && near(rms(x, 0.55 * R, 0.95 * R), rms(x, 1.1 * R, 1.9 * R), 1.5),
      `the stretch is a 1 kHz beep, the rest the 440 Hz tone, the beep as loud (${rms(x, 0.55 * R, 0.95 * R).toFixed(1)} against ${rms(x, 1.1 * R, 1.9 * R).toFixed(1)} dB) · ${r.note}`);
  }
  for (const f of ['stereo.mp4', 'surround.mkv']) {
    r = run('bleep', { bleepAt: '1-1.5', bleepKind: 'silence' }, [M(f)]);
    if (!ok(r, `bleep ${f}`)) continue;
    const ch = info(M(f)).a[0].channels, x = pcm(r.out, ch, 48000);
    t.ok(rms(x, 1.05 * 48000, 1.45 * 48000, ch, 0) < -60 && rms(x, 1.6 * 48000, 2.5 * 48000, ch, 0) > -40 && info(r.out).a[0].channels === ch && md5(r.out, '0:v') === md5(M(f), '0:v'), `${f}: 1 – 1.5 s silent (${rms(x, 1.05 * 48000, 1.45 * 48000, ch, 0).toFixed(0)} dB), the rest kept, ${ch} channels, the picture copied`);
  }
  r = run('bleep', { bleepAt: '1-1.5' }, [M('surround.mkv')]);
  if (ok(r, 'bleep 5.1')) { const x = pcm(r.out, 6, 48000); t.ok(goertzel(x.filter((_, j) => j % 6 === 2), 48000, 1000, 1.05 * 48000, 1.45 * 48000) > -40, '5.1: the beep in the centre channel too'); }
  // sound effects, each brought back to the file's loudness
  for (const [fx, f] of [['8d', 'clip.mp4'], ['slowed', 'stereo.mp4'], ['bass', 'surround.mkv'], ['phone', 'stereo.mp4'], ['radio', 'tone.wav'], ['echo', 'tone.mp3'], ['phone', 'surround.mkv']]) {
    r = run('sfx', { sfx: fx }, [M(f)]);
    if (!ok(r, `sfx ${fx} ${f}`)) continue;
    const a = info(r.out).a[0], d = loud(r.out) - loud(M(f));
    t.ok(Math.abs(d) <= 0.8 && (fx === '8d' ? a.channels === 2 : a.channels === info(M(f)).a[0].channels), `${fx} on ${f}: at the file's loudness (${d >= 0 ? '+' : ''}${d.toFixed(2)} dB), ${a.channels} channels · ${r.note}`);
    if (fx === '8d') { const x = pcm(r.out, 2), sides = []; for (let s = 0; s + 1 <= 3; s += 0.5) sides.push(rms(x, s * 48000, (s + 0.5) * 48000, 2, 0) - rms(x, s * 48000, (s + 0.5) * 48000, 2, 1)); t.ok(Math.max(...sides) - Math.min(...sides) > 4, `8D: the sound moves between the sides (left − right ${sides.map((v) => v.toFixed(1)).join(', ')} dB)`); }
    if (fx === 'slowed') t.ok(near(info(r.out).dur, 3.01 / 0.85, 0.15) && near(info(r.out).v ? +info(r.out).dur : 0, 3.54, 0.15), `slowed: ${info(r.out).dur} s (3 s at 85 %, the picture with it)`);
    if (fx === 'phone' && f === 'stereo.mp4') { const x = pcm(r.out, 1, 48000), x0 = pcm(M(f), 1, 48000), band = (y, lo, hi) => { let s = 0; for (let fr = lo; fr <= hi; fr += 25) s += 10 ** (goertzel(y, 48000, fr, 0, y.length) / 10); return 10 * Math.log10(s); }; const lo = band(x, 50, 150) - band(x0, 50, 150), hi = band(x, 6000, 8000) - band(x0, 6000, 8000), mid = band(x, 900, 1100) - band(x0, 900, 1100); t.ok(lo < mid - 15 && hi < mid - 15, `telephone: below 150 Hz ${(lo - mid).toFixed(0)} dB and above 6 kHz ${(hi - mid).toFixed(0)} dB against the voice band`); }
    if (fx === 'echo') { const x = pcm(r.out, 1, 44100); t.ok(near(info(r.out).dur, 2.04 + 0.7, 0.12), `echo: the sound goes on for its echoes (${info(r.out).dur} s)`); void x; }
  }
  // ================================================================ information and privacy
  r = run('analyse', {}, [M('analyse.mp4')]);
  if (ok(r, 'analyse')) {
    const rep = r.report, ind = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', M('analyse.mp4'), '-map', '0:a', '-af', 'ebur128=peak=true:dualmono=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr, I = /I:\s+(-?[\d.]+) LUFS/.exec(ind.slice(ind.lastIndexOf('Summary:')))[1];
    t.ok(/Integrated loudness: −21\.0 LUFS/.test(rep) && rep.includes(`${I.replace('-', '−')} LUFS`) && /Black picture[^\n]*\n  0:00\.00 – 0:01\.00/.test(rep) && /Frozen picture[^\n]*\n  0:03\.00 – 0:05\.5\d/.test(rep) && /Silence[^\n]*\n  0:00\.00 – 0:01\.00[^\n]*\n  0:05\.50 – 0:06\.5\d/.test(rep), `the report:\n${rep}`);
  }
  r = run('analyse', { anWhat: 'sound' }, [M('analyse.mp4')]);
  if (ok(r, 'analyse sound')) t.ok(!/Black picture/.test(r.report) && /Silence/.test(r.report), 'the sound only: no picture sections');
  r = run('meta', {}, [M('phone.mov')]);
  if (ok(r, 'meta')) {
    const q = J.parseProbe(probeLog(r.out)), i = info(r.out);
    t.ok(J.personalMeta(q).length === 0 && J.otherTracks(q).length === 0 && q.chapters === 0 && i.r.streams.length === 2 && md5(r.out, '0:v') === md5(M('phone.mov'), '0:v') && md5(r.out, '0:a') === md5(M('phone.mov'), '0:a'),
      `the phone video's copy: no place, date, device, timecode or chapter left (${JSON.stringify(i.r.format.tags)}), the picture and the sound the same packets`);
  }
  r = run('meta', {}, [M('tone.mp3')]);
  if (ok(r, 'meta mp3')) t.ok(r.outs[0] === 'out.mp3' && J.personalMeta(J.parseProbe(probeLog(r.out))).length === 0, 'an MP3: still an MP3, no tags');
};
