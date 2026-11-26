// FFmpeg tab jobs (src/lib/ffjobs.ts): the probe reader against ffprobe, the refusals in words, and every job's
// command run by a native FFmpeg (Ubuntu's 6.1, `apt install ffmpeg`) on the media fixtures — the results read back
// by ffprobe (streams, sizes, lengths) and by decoded pixels / sound levels. The e2e suite runs the same jobs on
// ffmpeg.wasm (FFmpeg 5.1) in the browser.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const have = (c) => { try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };

export default async (t, { load, root }) => {
  const J = await load('/src/lib/ffjobs.ts');
  const M = (n) => `${root}/tests/fixtures/media/${n}`, IMG = (n) => `${root}/tests/fixtures/images/${n}`;

  // ---------------------------------------------------------------- pure checks
  t.eq([J.secs('90'), J.secs('1:30'), J.secs('00:01:30.5'), J.secs('1.5'), J.secs(' 2 ')], [90, 90, 90.5, 1.5, 2], 'times: seconds, mm:ss, hh:mm:ss.s');
  t.ok([J.secs('abc'), J.secs('1:'), J.secs('-1'), J.secs('1:2:3:4'), J.secs('')].every(Number.isNaN), 'not times: NaN');
  t.eq(J.JOBS.length, 39, '39 jobs: the 16 there were and 23 for the 21 new uses (subtitles are three jobs, text and logo two)');
  t.eq(new Set(J.JOBS.map(([j]) => j)).size, 39, 'each job once');
  t.ok(J.JOBS.every(([j]) => j === 'raw' || Object.keys(J.DEFAULTS).length > 0), 'defaults exist');
  const P = (x) => ({ ...J.EMPTY_PROBE, ...x });
  const vid = P({ dur: 3, w: 640, h: 360, fps: 25, video: true, vcodec: 'h264', audio: true, acodec: 'aac', rate: 48000, channels: 1 });
  const aud = P({ dur: 2, audio: true, acodec: 'pcm_s16le', rate: 16000, channels: 1 });
  const C = (p, x = {}) => ({ in1: 'in1.mp4', p, ext: 'mp4', ...x });
  const refuse = (job, o, c, re, what) => { let m = ''; try { J.buildJob(job, { ...J.DEFAULTS, ...o }, c); } catch (e) { m = e.message; } t.ok(re.test(m), `${what}: "${m}"`); };
  refuse('mute', {}, C(aud, { in1: 'in1.wav', ext: 'wav' }), /needs a video — this file has no picture/, 'remove audio of a sound file');
  refuse('volume', {}, C(P({ dur: 1, video: true, w: 10, h: 10 })), /needs sound — this file has none/, 'volume of a silent video');
  refuse('trim', { start: '5' }, C(vid), /only 3 s long/, 'trim after the end');
  refuse('trim', { start: 'x' }, C(vid), /start is a time/, 'trim start not a time');
  refuse('trim', { start: '2', end: '1' }, C(vid), /end must be after the start/, 'trim end before start');
  refuse('thumb', { thumbAt: '3' }, C(vid), /only 3 s long/, 'thumbnail at the very end');
  refuse('cutout', { cutFrom: '0', cutTo: '3' }, C(vid), /whole file — nothing would be left/, 'cut out everything');
  refuse('cutout', { cutFrom: '2', cutTo: '1' }, C(vid), /"To" must be after "from"/, 'cut out backwards');
  refuse('join', {}, C(vid, { ins: ['in1.mp4'], ps: [vid] }), /at least one more clip/, 'join one clip');
  refuse('join', {}, C(vid, { ins: ['in1.mp4', 'in3.wav'], ps: [vid, aud] }), /videos with videos, or sound files with sound files/, 'join a video and a sound file');
  refuse('join', { joinFast: true }, C(vid, { ins: ['in1.mp4', 'in3.mp4'], ps: [vid, P({ ...vid, w: 320, h: 240 })] }), /differ in size or format.*turn off "Fast"/, 'fast join of different clips');
  refuse('reverse', {}, C(P({ ...vid, w: 1920, h: 1080, fps: 30, dur: 120 })), /up to about 7 s here/, 'reverse a long 1080p video (700 MB of frames: 7 s of 1080p at 30 fps)');
  refuse('loop', { loopKind: 'boomerang' }, C(P({ ...vid, w: 1920, h: 1080, fps: 30, dur: 10 })), /boomerang keeps every frame/, 'boomerang of a long 1080p video');
  refuse('fade', { fadeLen: '2', fadeWhich: 'both' }, C(vid), /choose shorter fades/, 'fades longer than the clip');
  refuse('timelapse', { tlx: '8' }, C(vid), /under half a second/, 'timelapse of a 3 s clip at 8×');
  refuse('colours', {}, C(vid), /change nothing/, 'colours unchanged');
  refuse('sound', {}, C(vid), /change nothing/, 'sound settings unchanged');
  refuse('text', { text: '  ' }, C(vid), /Type the text/, 'empty text');
  refuse('logo', {}, C(vid), /Choose the logo picture/, 'logo without a picture');
  refuse('pip', {}, C(vid), /Choose the small video/, 'picture-in-picture without a second video');
  refuse('merge', {}, C(vid), /Choose the audio file/, 'add audio without a file');
  refuse('merge', { mergeMode: 'mix' }, C(P({ ...vid, audio: false, acodec: '' }), { in2: 'in2.mp3', ext2: 'mp3', p2: aud }), /no sound to put the music under/, 'music under a silent video');
  refuse('merge', {}, C(vid, { in2: 'in2.mp4', ext2: 'mp4', p2: P({ ...vid, audio: false }) }), /second file has no sound/, 'add a silent file as audio');
  refuse('subBurn', {}, C(vid), /this video has no subtitle track of its own/, 'burn in without subtitles');
  refuse('subBurn', {}, C(vid, { in2: 'in2.txt', ext2: 'txt' }), /must be \.srt, \.vtt, \.ass or \.ssa/, 'burn in a .txt');
  refuse('subBurn', {}, C(P({ ...vid, subs: 1, scodec: 'hdmv_pgs_subtitle' })), /subtitles are pictures/, 'burn in Blu-ray picture subtitles');
  refuse('subExtract', {}, C(vid), /no subtitle track/, 'extract from a file without subtitles');
  refuse('subExtract', {}, C(P({ ...vid, subs: 1, scodec: 'dvd_subtitle' })), /pictures \(DVD \/ Blu-ray\)/, 'extract DVD subtitles');
  refuse('split', { splitSec: '10' }, C(vid), /choose shorter parts/, 'split into parts longer than the file');
  refuse('sheet', {}, C(P({ ...vid, dur: 0 })), /could not tell how long/, 'contact sheet of a file of unknown length');
  // a few exact commands
  const th = J.buildJob('thumb', { ...J.DEFAULTS, thumbAt: '1:02.5' }, C(P({ ...vid, dur: 100 })));
  t.eq([th.args, th.jpeg], [['-ss', '62.5', '-i', 'in1.mp4', '-frames:v', '1', 'thumb.png'], true], 'thumbnail at 1:02.5: FFmpeg writes PNG, MozJPEG makes the JPEG');
  t.eq(J.buildJob('thumb', { ...J.DEFAULTS, thumbFmt: 'png' }, C(vid)).jpeg, false, 'thumbnail as PNG: no JPEG step');
  t.ok(J.buildJob('sheet', J.DEFAULTS, C(vid)).jpeg === true && J.buildJob('frames', { ...J.DEFAULTS, frameFmt: 'jpg' }, C(vid)).jpeg === true && J.buildJob('frames', { ...J.DEFAULTS, frameFmt: 'png' }, C(vid)).jpeg === false, 'contact sheet and JPEG frames: MozJPEG too');
  t.ok(['-i in1.mp4 -frames:v 1 -q:v 2 out.jpg', '-i in1.mp4 -frames:v 1 out.jpeg', '-i in1.mp4 -c:v mjpeg out.avi', '-i in1.mp4 -vcodec MJPEG out.mov'].every((raw) => { try { J.buildJob('raw', { ...J.DEFAULTS, raw }, C(vid)); return false; } catch (e) { return /crash the page while writing JPEG/.test(e.message); } }), 'own arguments: JPEG from FFmpeg refused (its encoder crashes the page)');
  t.eq(J.buildJob('raw', { ...J.DEFAULTS, raw: '-i in1.jpg -vf hflip out.png' }, C(vid)).outputs, ['out.png'], 'own arguments: a JPEG input is fine');
  t.eq(J.asJpegName('frame-0001.png'), 'frame-0001.jpg', 'the JPEG keeps the PNG\'s name');
  t.eq(J.buildJob('loop', { ...J.DEFAULTS, loopKind: '3' }, C(vid)).args, ['-stream_loop', '2', '-i', 'in1.mp4', '-c', 'copy', 'out.mp4'], 'loop 3 times: two extra loops, no re-encoding');
  t.eq(J.buildJob('volume', { ...J.DEFAULTS, vol: '2' }, C(P({ ...vid, acodec: 'vorbis' }), { in1: 'in1.webm', ext: 'webm' })).args, ['-i', 'in1.webm', '-af', 'volume=2', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '128k', 'out.webm'], 'volume of a WebM: picture copied, sound as Opus');
  const jf = J.buildJob('join', { ...J.DEFAULTS, joinFast: true }, C(vid, { ins: ['in1.mp4', 'in3.mp4'], ps: [vid, vid] }));
  t.eq([jf.args, jf.writes], [['-f', 'concat', '-safe', '0', '-i', '/work/list.txt', '-c', 'copy', 'out.mp4'], [['/work/list.txt', "file '/in/in1.mp4'\nfile '/in/in3.mp4'\n"]]], 'fast join: the concat list');
  t.eq(J.parseProbe('  Duration: 00:01:02.50, start: 0\n  Stream #0:0: Video: mjpeg, yuvj420p, 600x600, 90k tbr (attached pic)\n  Stream #0:1: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s').video, false, 'cover art is not a picture stream');
  // ---------------------------------------------------------------- sound at its own level (to-do #23): the arguments
  const au = (line) => { const q = J.parseProbe(`  Duration: 00:00:03.00, start: 0\n  Stream #0:0: Audio: ${line}`); return [q.channels, q.layout]; };
  t.eq([au('ac3, 48000 Hz, 5.1(side), fltp, 320 kb/s'), au('pcm_s16le ([1][0][0][0] / 0x0001), 48000 Hz, 2 channels, s16, 1536 kb/s'), au('aac (LC), 48000 Hz, 7.1, fltp'), au('opus, 48000 Hz, mono, fltp'), au('aac (LC), 44100 Hz, stereo, fltp, 128 kb/s (default)')],
    [[6, '5.1(side)'], [2, '2 channels'], [8, '7.1'], [1, 'mono'], [2, 'stereo']], 'the probe reads the layout and its channels (5.1(side), "2 channels", 7.1)');
  const st = P({ ...vid, channels: 2, layout: 'stereo' }), sur = P({ ...vid, acodec: 'ac3', channels: 6, layout: '5.1(side)' }), mo = P({ ...vid, layout: 'mono' });
  const A = (job, o, c) => J.buildJob(job, { ...J.DEFAULTS, ...o }, c).args.join(' ');
  t.ok(/-c:a libopus -b:a 128k -compression_level:a 4 out\.webm$/.test(A('convert', { fmt: 'webm' }, C(st))) && !/compression_level/.test(A('convert', { fmt: 'webm' }, C(mo))),
    'Opus in stereo at complexity 4 (this build\'s stereo encoder crashes above it), mono at the default');
  t.ok(/-c:a libopus -b:a 384k -compression_level:a 4 -ch_layout 5\.1 out\.webm$/.test(A('convert', { fmt: 'webm' }, C(sur))) && /-c:a aac -b:a 480k -ch_layout 5\.1 /.test(A('convert', { fmt: 'mp4' }, C(sur))),
    '5.1(side): the bitrate per channel as for stereo (384 / 480 kb/s), the layout the encoders take (5.1)');
  t.ok(/-c:a aac -b:a 160k -movflags/.test(A('convert', { fmt: 'mp4' }, C(st))) && /-c:a aac -b:a 160k -movflags/.test(A('convert', { fmt: 'mp4' }, C(mo))), 'mono and stereo keep the bitrates they had');
  t.ok(/-af pan=stereo\|c0=c0\|c1=c0 /.test(A('sound', { channels: '2' }, C(mo))) && /-af pan=mono\|c0=0\.5\*c0\+0\.5\*c1 /.test(A('sound', { channels: '1' }, C(st))) && /-af aformat=channel_layouts=stereo,pan=mono/.test(A('sound', { channels: '1' }, C(sur))) && /-ac 2 /.test(A('sound', { channels: '2' }, C(sur))),
    'stereo from mono: the sound on both sides at full level; mono: the average of the sides (5.1 mixed to two first); 5.1 to stereo: FFmpeg\'s downmix');
  refuse('sound', { channels: '1' }, C(mo), /already mono — choose the other, or a sample rate/, 'mono of a mono sound');
  refuse('sound', { channels: '2' }, C(st), /already stereo/, 'stereo of a stereo sound');
  const jm = A('join', {}, C(mo, { ins: ['in1.mp4', 'in3.mp4', 'in4.mp4'], ps: [mo, mo, P({ ...vid, audio: false, acodec: '', channels: 0 })] }));
  t.ok(/anullsrc=r=48000:cl=mono/.test(jm) && /\[0:a\]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono\[a0\]/.test(jm) && /-c:a aac -b:a 160k/.test(jm), 'join of mono clips (and one without sound): mono, silence in mono');
  const jx = A('join', {}, C(mo, { ins: ['in1.mp4', 'in3.mp4'], ps: [mo, st] }));
  t.ok(/\[0:a\]pan=stereo\|c0=c0\|c1=c0,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo\[a0\]/.test(jx) && /\[1:a\]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo\[a1\]/.test(jx), 'join of a mono and a stereo clip: stereo, the mono one on both sides at full level');
  t.ok(/channel_layouts=5\.1\[a1\]/.test(A('join', {}, C(sur, { ins: ['in1.mkv', 'in3.mkv'], ps: [sur, sur] }))) && /-b:a 480k/.test(A('join', {}, C(sur, { ins: ['in1.mkv', 'in3.mkv'], ps: [sur, sur] }))), 'join of 5.1 clips: 5.1 at 480 kb/s');
  const mx = A('merge', { mergeMode: 'mix' }, C(mo, { in2: 'in2.mp3', ext2: 'mp3', p2: P({ ...aud, channels: 2, layout: 'stereo' }) }));
  t.ok(/\[0:a\]pan=stereo\|c0=c0\|c1=c0,aformat=channel_layouts=stereo\[s\];\[1:a\]volume=0\.3,aformat=channel_layouts=stereo\[m\]/.test(mx), 'music under a mono voice: the voice on both sides at full level');
  const raw = (x) => J.buildJob('raw', { ...J.DEFAULTS, raw: x }, C(vid)).args.join(' ');
  t.eq([raw('-i in1.wav -c:a libopus out.ogg'), raw('-i in1.mp4 -c:v libvpx out.webm'), raw('-i in1.mp4 -c:a libopus -compression_level 10 out.ogg'), raw('-i in1.mp4 -c copy out.webm'), raw('-i in1.mp4 -an -c:v libvpx out.webm')],
    ['-i in1.wav -c:a libopus -compression_level:a 4 out.ogg', '-i in1.mp4 -c:v libvpx -compression_level:a 4 out.webm', '-i in1.mp4 -c:a libopus -compression_level 10 out.ogg', '-i in1.mp4 -c copy out.webm', '-i in1.mp4 -an -c:v libvpx out.webm'],
    'own arguments that make Opus get complexity 4, unless they set one (or copy, or have no sound)');
  const tw = J.buildJob('trim', { ...J.DEFAULTS, start: '1', end: '2', exact: true }, C(P({ ...vid, vcodec: 'vp8', acodec: 'vorbis', channels: 2, layout: 'stereo' }), { in1: 'in1.webm', ext: 'webm' }));
  t.ok(tw.outputs[0] === 'out.mp4' && /-c:a aac -b:a 160k out\.mp4$/.test(tw.args.join(' ')), 'exact trim of a WebM: H.264 needs an MP4 (it went into the WebM and failed)');
  // the ASS text file
  const a = J.assFor('Line one\n{bold} a\\b', { pos: 'top', size: 'large', colour: 'yellow', box: true }, 640, 360);
  t.ok(/PlayResX: 640\nPlayResY: 360/.test(a) && /Style: T,Noto Sans,32,&H0000FFFF,&H0000FFFF,&H80000000,/.test(a) && /,3,8,0,8,26,26,18,1$/m.test(a), 'ASS style: size 9 % of the height, yellow, box, top');
  t.ok(/,,Line one\\N｛bold｝ a＼b$/m.test(a), 'ASS text: line break as \\N, braces and backslash shown, never read as codes');

  // ---------------------------------------------------------------- the commands, run by a native FFmpeg
  if (!have('ffmpeg') || !have('ffprobe')) { t.ok(true, 'native ffmpeg / ffprobe not installed — the run checks were skipped (apt install ffmpeg)'); return; }
  const tmp = mkdtempSync(join(tmpdir(), 'ffjobs-'));
  mkdirSync(join(tmp, 'fonts')); for (const f of ['NotoSans_400Regular.ttf', 'NotoSans_700Bold.ttf']) copyFileSync(`${root}/public/vendor/fonts/${f}`, join(tmp, 'fonts', f));
  const probeLog = (p) => { try { execFileSync('ffmpeg', ['-hide_banner', '-i', p], { stdio: 'pipe' }); return ''; } catch (e) { return String(e.stderr); } };
  const ffprobe = (p) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', p]).toString());
  // parseProbe against ffprobe on every fixture
  for (const f of ['clip.mp4', 'clip.webm', 'clip-subs.mkv', 'silent-320.mp4', 'tone.wav', 'tone.mp3', 'pauses.wav']) {
    const p = J.parseProbe(probeLog(M(f))), r = ffprobe(M(f));
    const v = r.streams.find((s) => s.codec_type === 'video'), au = r.streams.find((s) => s.codec_type === 'audio');
    t.ok(Math.abs(p.dur - +r.format.duration) < 0.011 && p.video === !!v && p.audio === !!au && (!v || (p.w === v.width && p.h === v.height && p.vcodec === v.codec_name)) && (!au || (p.acodec === au.codec_name && p.rate === +au.sample_rate && p.channels === au.channels)) && p.subs === r.streams.filter((s) => s.codec_type === 'subtitle').length,
      `${f}: the probe reader agrees with ffprobe (${JSON.stringify(p)})`);
  }
  let n = 0;
  /** Run a job natively: inputs copied under tmp/<k>/in with their in<n> names, /in /work /fonts mapped. */
  const runJob = (job, o, files, extra = {}) => {
    const dir = join(tmp, `j${++n}`); mkdirSync(join(dir, 'in'), { recursive: true }); mkdirSync(join(dir, 'work'));
    const names = files.map((f, i) => { const k = i === 0 ? 1 : i === 1 && extra.second ? 2 : i + 2; const nm = `in${k}.${f.split('.').pop()}`; copyFileSync(f, join(dir, 'in', nm)); return nm; });
    const probes = files.map((f) => J.parseProbe(probeLog(f)));
    const c = { in1: names[0], p: probes[0], ext: names[0].split('.').pop(), ...(extra.second ? { in2: names[1], p2: probes[1], ext2: names[1].split('.').pop() } : {}), ...(extra.join ? { ins: names, ps: probes } : {}) };
    const b = J.buildJob(job, { ...J.DEFAULTS, ...o }, c);
    for (const [pth, text] of b.writes || []) writeFileSync(join(dir, pth.replace(/^\/work\//, 'work/')), text.replaceAll('/in/', `${dir}/in/`));
    const args = b.args.map((x) => (/^in\d+\.\w+$/.test(x) ? join(dir, 'in', x) : x.replaceAll('/in/', `${dir}/in/`).replaceAll('/work/', `${dir}/work/`).replaceAll('/fonts', `${tmp}/fonts`)));
    try { execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: dir, stdio: 'pipe' }); }
    catch (e) { return { error: String(e.stderr).slice(0, 400), dir, b }; }
    const outs = b.pattern ? readdirSync(dir).filter((x) => b.pattern.test(x)).sort() : b.outputs.filter((x) => existsSync(join(dir, x)));
    return { dir, b, outs, out: outs[0] && join(dir, outs[0]) };
  };
  const info = (p) => { const r = ffprobe(p); const v = r.streams.find((s) => s.codec_type === 'video'), a = r.streams.find((s) => s.codec_type === 'audio'), s = r.streams.find((x) => x.codec_type === 'subtitle'); return { dur: +r.format.duration, v, a, s, r }; };
  /** mean RGB of a rectangle of a frame (fractions of the picture), decoded by ffmpeg */
  const pixels = (p, at, [x0, y0, x1, y1]) => {
    const { v } = info(p), W = v.width, H = v.height;
    const raw = execFileSync('ffmpeg', ['-v', 'error', ...(at > 0 ? ['-ss', String(at)] : []), '-i', p, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64e6 });
    let r = 0, g = 0, b = 0, k = 0;
    for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) { const i = (y * W + x) * 3; r += raw[i]; g += raw[i + 1]; b += raw[i + 2]; k++; }
    return [r / k, g / k, b / k];
  };
  const level = (p, extra = []) => { const out = execFileSync('ffmpeg', ['-hide_banner', '-i', p, ...extra, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: 'pipe' }).toString(); return out; };
  const maxVol = (p) => { try { level(p); } catch { /* */ } const e = (() => { try { execFileSync('ffmpeg', ['-hide_banner', '-i', p, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: 'pipe' }); return ''; } catch (x) { return String(x.stderr); } })(); return e; };
  const vol = (p) => { const r = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${p}" -af volumedetect -f null - 2>&1`]).toString(); return { max: +/max_volume: (-?[\d.]+) dB/.exec(r)?.[1], mean: +/mean_volume: (-?[\d.]+) dB/.exec(r)?.[1] }; };
  void maxVol; void level;
  const near = (a, b, e) => Math.abs(a - b) <= e;
  /** share of the pixels of a rectangle that changed by more than 60 in some channel between two videos at a time */
  const changed = (pa, pb, at, [x0, y0, x1, y1]) => {
    // the same frame by its number (25 fps), not by time: an input may start a few milliseconds late
    const fr = (p) => execFileSync('ffmpeg', ['-v', 'error', '-i', p, '-vf', `select=eq(n\\,${Math.round(at * 25)})`, '-fps_mode', 'passthrough', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64e6 });
    const A = fr(pa), B = fr(pb), { v } = info(pa), W = v.width, H = v.height;
    let c = 0, k = 0;
    for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) { const i = (y * W + x) * 3; k++; if (Math.abs(A[i] - B[i]) > 60 || Math.abs(A[i + 1] - B[i + 1]) > 60 || Math.abs(A[i + 2] - B[i + 2]) > 60) c++; }
    return c / k;
  };
  const ok = (r, what) => { if (r.error) { t.ok(false, `${what}: ${r.error}`); return false; } return true; };

  // convert and extract
  let r = runJob('thumb', { thumbAt: '1.5' }, [M('clip.mp4')]);
  if (ok(r, 'thumbnail')) { const i = info(r.out); t.ok(i.v.codec_name === 'png' && i.v.width === 640 && i.v.height === 360, 'thumbnail: a 640 × 360 PNG from FFmpeg (the tab makes the JPEG)'); }
  r = runJob('sheet', { sheetGrid: '4x4' }, [M('clip.mp4')]);
  if (ok(r, 'contact sheet')) { const i = info(r.out); t.eq([i.v.width, i.v.height], [6 + 4 * 326, 6 + 4 * 186], 'contact sheet 4 × 4: 320 × 180 pictures, 6 px apart, on white'); t.ok(pixels(r.out, 0, [0, 0, 0.004, 0.004]).every((x) => x > 240), '… the margin is white'); }
  // cut and join
  r = runJob('cutout', { cutFrom: '1', cutTo: '2' }, [M('clip.mp4')]);
  if (ok(r, 'cut out')) { const i = info(r.out); t.ok(near(i.dur, 2, 0.1) && i.v && i.a, `cut out 1 – 2 s of a 3 s video: ${i.dur} s, picture and sound`); }
  r = runJob('cutout', { cutFrom: '0', cutTo: '0.5' }, [M('tone.wav')]);
  if (ok(r, 'cut out (sound)')) t.ok(near(info(r.out).dur, 1.5, 0.05) && r.outs[0] === 'out.wav', `cut out the first 0.5 s of a 2 s WAV: ${info(r.out).dur} s, still WAV`);
  r = runJob('join', {}, [M('clip.mp4'), M('silent-320.mp4')], { join: true });
  if (ok(r, 'join')) { const i = info(r.out); t.ok(near(i.dur, 4.5, 0.15) && i.v.width === 640 && i.v.height === 360 && i.a, `join a 3 s video and a 1.5 s silent 320 × 240 one: ${i.dur} s, 640 × 360, with sound`); t.ok(pixels(r.out, 3.8, [0, 0, 0.08, 1]).every((x) => x < 20), '… the smaller clip gets black bars'); }
  r = runJob('join', { joinFast: true }, [M('clip.mp4'), M('clip.mp4')], { join: true });
  if (ok(r, 'fast join')) t.ok(near(info(r.out).dur, 6, 0.1), `fast join of two 3 s clips: ${info(r.out).dur} s`);
  r = runJob('join', {}, [M('tone.wav'), M('tone.mp3')], { join: true });
  if (ok(r, 'join sound')) t.ok(near(info(r.out).dur, 4.05, 0.1) && !info(r.out).v, `join two sound files: ${info(r.out).dur} s of sound`);
  const kf = M('kf6.mp4'); // 6 s, a key frame every second
  r = runJob('split', { splitBy: 'parts', splitParts: '3' }, [kf]);
  if (ok(r, 'split')) t.ok(r.outs.length === 3 && r.outs.every((x) => near(info(join(r.dir, x)).dur, 2, 0.15)), `split a 6 s video into 3 parts: ${r.outs.map((x) => info(join(r.dir, x)).dur).join(', ')} s`);
  r = runJob('loop', { loopKind: '3' }, [M('clip.mp4')]);
  if (ok(r, 'loop')) t.ok(near(info(r.out).dur, 9, 0.15), `loop 3 times: ${info(r.out).dur} s`);
  r = runJob('loop', { loopKind: 'boomerang' }, [M('clip.mp4')]);
  if (ok(r, 'boomerang')) { const i = info(r.out); t.ok(near(i.dur, 6, 0.15) && !i.a, `boomerang: ${i.dur} s, no sound`); const f0 = pixels(r.out, 0.02, [0.3, 0.3, 0.7, 0.7]), fe = pixels(r.out, 5.95, [0.3, 0.3, 0.7, 0.7]); t.ok(f0.every((x, k) => near(x, fe[k], 12)), '… it ends where it began'); }
  r = runJob('reverse', {}, [M('clip.mp4')]);
  if (ok(r, 'reverse')) { const i = info(r.out); t.ok(near(i.dur, 3, 0.1) && i.a, `reverse: ${i.dur} s with sound`); const last = pixels(M('clip.mp4'), 2.95, [0.3, 0.3, 0.7, 0.7]), first = pixels(r.out, 0, [0.3, 0.3, 0.7, 0.7]); t.ok(last.every((x, k) => near(x, first[k], 12)), '… its first picture is the original\'s last'); }
  // size and shape
  for (const [bg, corner] of [['blur', null], ['black', 0], ['white', 255]]) {
    r = runJob('fit', { fitShape: '9:16', fitBg: bg }, [M('clip.mp4')]);
    if (ok(r, `fit ${bg}`)) { const i = info(r.out); const top = pixels(r.out, 1, [0.1, 0.02, 0.9, 0.2]); t.ok(i.v.width === 720 && i.v.height === 1280 && (corner === null ? !top.every((x) => x < 15 || x > 240) : top.every((x) => near(x, corner, 12))), `fit to 9:16 with ${bg}: 720 × 1280, above the video ${top.map(Math.round)}`); }
  }
  // picture
  r = runJob('colours', { bw: true }, [M('clip.mp4')]);
  if (ok(r, 'black and white')) { const px = pixels(r.out, 1, [0.1, 0.1, 0.9, 0.9]); t.ok(near(px[0], px[1], 3) && near(px[1], px[2], 3), `black and white: grey (${px.map(Math.round)})`); }
  r = runJob('colours', { bright: 30 }, [M('clip.mp4')]);
  if (ok(r, 'brightness')) { const a0 = pixels(M('clip.mp4'), 1, [0.1, 0.1, 0.9, 0.9]), a1 = pixels(r.out, 1, [0.1, 0.1, 0.9, 0.9]); t.ok(a1.reduce((x, y) => x + y) > a0.reduce((x, y) => x + y) + 30, 'brightness +30 % is brighter'); }
  for (const [job, o] of [['stabilise', {}], ['denoise', { denoise: 'strong' }], ['deinterlace', {}]]) {
    r = runJob(job, o, [M('clip.mp4')]);
    if (ok(r, job)) { const i = info(r.out); t.ok(i.v.width === 640 && near(i.dur, 3, 0.1) && i.a, `${job}: 640 × 360, 3 s, sound kept`); }
  }
  r = runJob('fade', { fadeLen: '1', fadeWhich: 'both' }, [M('clip.mp4')]);
  if (ok(r, 'fade')) { t.ok(pixels(r.out, 0, [0, 0, 1, 1]).every((x) => x < 8) && pixels(r.out, 1.5, [0, 0, 1, 1]).some((x) => x > 40), 'fade: black at the start, the picture in the middle'); }
  r = runJob('fade', { fadeLen: '0.5', fadeWhich: 'in' }, [M('tone.wav')]);
  if (ok(r, 'fade sound')) t.ok(r.outs[0] === 'out.wav' && near(info(r.out).dur, 2, 0.05), 'fade in a WAV: still a 2 s WAV');
  r = runJob('text', { text: 'SUPERTOOLS', textPos: 'bottom', textSize: 'large', textColour: 'yellow' }, [M('clip.mp4')]);
  if (ok(r, 'text')) { const o0 = pixels(M('clip.mp4'), 1, [0.2, 0.8, 0.8, 0.92]), o1 = pixels(r.out, 1, [0.2, 0.8, 0.8, 0.92]), top0 = pixels(M('clip.mp4'), 1, [0.2, 0.05, 0.8, 0.2]), top1 = pixels(r.out, 1, [0.2, 0.05, 0.8, 0.2]); t.ok(Math.abs(o1[2] - o0[2]) > 8 && top0.every((x, k) => near(x, top1[k], 4)), `text at the bottom (blue ${Math.round(o0[2])} → ${Math.round(o1[2])}), the top untouched`); }
  r = runJob('logo', { logoPos: 'br', logoSize: '20' }, [M('clip.mp4'), IMG('astronaut.png')], { second: true });
  if (ok(r, 'logo')) { const br0 = pixels(M('clip.mp4'), 1, [0.8, 0.7, 0.95, 0.95]), br1 = pixels(r.out, 1, [0.8, 0.7, 0.95, 0.95]), tl0 = pixels(M('clip.mp4'), 1, [0.03, 0.03, 0.2, 0.2]), tl1 = pixels(r.out, 1, [0.03, 0.03, 0.2, 0.2]); t.ok(br0.some((x, k) => Math.abs(x - br1[k]) > 15) && tl0.every((x, k) => near(x, tl1[k], 4)), 'logo in the bottom-right corner only'); }
  r = runJob('pip', { pipPos: 'tl', pipSize: '33' }, [M('clip.mp4'), M('clip.webm')], { second: true });
  if (ok(r, 'pip')) { const i = info(r.out); t.ok(i.v.width === 640 && near(i.dur, 3, 0.1), 'picture-in-picture: the big video\'s size and length'); }
  // speed
  r = runJob('timelapse', { tlx: '8' }, [kf]);
  if (ok(r, 'timelapse')) { const i = info(r.out); t.ok(near(i.dur, 0.75, 0.1) && !i.a, `timelapse 8× of 6 s: ${i.dur} s, no sound`); }
  // sound
  r = runJob('volume', { vol: '2' }, [M('tone.wav')]);
  if (ok(r, 'volume')) { const a0 = vol(M('tone.wav')), a1 = vol(r.out); t.ok(near(a1.mean - a0.mean, 6.02, 0.3), `volume 200 %: +6 dB (${a0.mean} → ${a1.mean} dB)`); }
  r = runJob('volume', { vol: '0.5' }, [M('clip.mp4')]);
  if (ok(r, 'volume video')) { const i = info(r.out); t.ok(i.v.codec_name === 'h264' && i.a.codec_name === 'aac' && near(vol(r.out).mean - vol(M('clip.mp4')).mean, -6.02, 0.5), 'volume 50 % of a video: picture copied, −6 dB'); }
  r = runJob('silence', { silWhere: 'ends', silLevel: '-50' }, [M('pauses.wav')]);
  if (ok(r, 'silence ends')) t.ok(near(info(r.out).dur, 3.7, 0.25), `remove silence at the ends of 1 + 1 + 1.5 + 1 + 1 s: ${info(r.out).dur} s (≈ 3.5 + the 0.1 s kept each side)`);
  // FFmpeg 6.1 rewrote silenceremove: stop_duration became the length a pause is cut DOWN to (5.1, the tab's engine:
  // pauses longer than it are removed, stop_silence kept). Native 6.1 here: the 1.5 s pause becomes 1 + 0.25 s; the
  // browser suite checks 5.1's answer (≈ 2.6 s).
  r = runJob('silence', { silWhere: 'all', silMin: '1', silLevel: '-50' }, [M('pauses.wav')]);
  if (ok(r, 'silence all')) t.ok(near(info(r.out).dur, 4.37, 0.1), `remove every pause over 1 s (FFmpeg 6.1's reading): ${info(r.out).dur} s`);
  r = runJob('merge', { mergeMode: 'mix', musicVol: '30' }, [M('clip.mp4'), M('tone.mp3')], { second: true });
  if (ok(r, 'music under')) { const i = info(r.out); t.ok(near(i.dur, 3, 0.1) && i.v.codec_name === 'h264' && i.a, `music under the sound: ${i.dur} s (the 2 s music repeats)`); }
  r = runJob('merge', { mergeMode: 'replace' }, [M('clip.mp4'), M('tone.mp3')], { second: true });
  if (ok(r, 'replace sound')) t.ok(info(r.out).a.codec_name === 'aac', 'replace the sound');
  r = runJob('sound', { channels: '2', rate: '44100' }, [M('clip.mp4')]);
  if (ok(r, 'sound settings')) { const i = info(r.out); t.ok(i.a.channels === 2 && +i.a.sample_rate === 44100 && i.v.codec_name === 'h264', 'sound: stereo at 44.1 kHz, picture copied'); }
  const st3 = join(tmp, 'stereo.mp3'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', M('stereo.mp4'), '-vn', '-c:a', 'libmp3lame', '-q:a', '2', st3]);
  r = runJob('sound', { channels: '1' }, [st3]);
  if (ok(r, 'mono')) t.ok(info(r.out).a.channels === 1 && r.outs[0] === 'out.mp3', 'mono MP3 from a stereo one');
  // subtitles
  r = runJob('subAdd', { subLang: 'fra' }, [M('clip.mp4'), M('subs.srt')], { second: true });
  if (ok(r, 'add subtitles')) { const i = info(r.out); t.ok(i.s && i.s.codec_name === 'mov_text' && i.s.tags?.language === 'fra' && i.v.codec_name === 'h264', 'subtitles added to an MP4 as mov_text, language fra'); }
  r = runJob('subAdd', {}, [M('clip-subs.mkv'), M('subs.srt')], { second: true });
  if (ok(r, 'add subtitles mkv')) t.ok(info(r.out).s?.codec_name === 'subrip' && r.outs[0] === 'out.mkv', 'subtitles added to an MKV as SRT');
  r = runJob('subExtract', { subFmt: 'srt' }, [M('clip-subs.mkv')]);
  if (ok(r, 'extract subtitles')) {
    // times within 30 ms (SRT has milliseconds, the MKV track milliseconds too)
    const txt = readFileSync(r.out, 'utf8'), src = readFileSync(M('subs.srt'), 'utf8');
    const cues = (x) => [...x.matchAll(/(\d\d):(\d\d):(\d\d),(\d{3}) --> [^\n]*\n([^\n]+)/g)].map((m) => [+m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, m[5].trim()]);
    const a = cues(txt), b = cues(src);
    t.ok(a.length === 3 && a.every(([tm, tx], k) => tx === b[k][1] && near(tm, b[k][0], 0.03)), `subtitles extracted as SRT: the three lines , times within 30 ms (${a.map(([tm]) => tm).join(', ')})`);
  }
  r = runJob('subExtract', { subFmt: 'vtt' }, [M('clip-subs.mkv')]);
  if (ok(r, 'extract vtt')) t.ok(/^WEBVTT/.test(readFileSync(r.out, 'utf8')), 'and as WebVTT');
  for (const [what, files, extra] of [['a subtitle file', [M('clip.mp4'), M('subs.srt')], { second: true }], ['the video\'s own track', [M('clip-subs.mkv')], {}]]) {
    r = runJob('subBurn', {}, files, extra);
    if (ok(r, `burn ${what}`)) { const sh = changed(files[0], r.out, 0.6, [0.2, 0.82, 0.8, 1]), top = changed(files[0], r.out, 0.6, [0.2, 0.3, 0.8, 0.6]); /* against its own input */ t.ok(sh > 0.03 && top < 0.01, `burn in ${what}: the text is in the picture at the bottom (${(sh * 100).toFixed(1)} % of it changed, the middle ${(top * 100).toFixed(1)} %)`); }
  }
  // ---------------------------------------------------------------- sound at its own level (to-do #23): run natively
  // integrated loudness (EBU R128) of input and output — a mono file as heard on two speakers (dualmono), as players
  // play it. The owner: "the audio volume of the output … seems to be lower than … the original".
  const loud = (p) => { const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-map', '0:a:0', '-af', 'ebur128=dualmono=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr; return +/I:\s+(-?[\d.]+) LUFS/.exec(e.slice(e.lastIndexOf('Summary:')))?.[1]; };
  const lay = (p) => { const a = info(p).a; return `${a.codec_name} ${a.channels} ${a.channel_layout ?? ''}`.trim(); };
  const LEVEL = [ // [what, job, options, the files, extra] — jobs that do not set out to change the level
    ['convert to MP4', 'convert', { fmt: 'mp4' }], ['convert to WebM', 'convert', { fmt: 'webm' }], ['convert to M4A', 'convert', { fmt: 'm4a' }], ['convert to OGG', 'convert', { fmt: 'ogg' }],
    ['convert to FLAC', 'convert', { fmt: 'flac' }], ['extract (as it is)', 'audio', { aud: 'copy' }], ['extract as WAV', 'audio', { aud: 'wav' }],
    ['exact trim', 'trim', { start: '0.5', end: '2.5', exact: true }, 'part'], ['cut out', 'cutout', { cutFrom: '1', cutTo: '1.5' }, 'cut'], ['join (twice)', 'join', {}, 'join'],
    ['reverse', 'reverse', {}], ['compress', 'compress', { crf: 30, speedPreset: 'ultrafast' }], ['speed 1.5×', 'speed', { speed: '1.5' }], ['44.1 kHz', 'sound', { rate: '44100' }],
  ];
  const surround = M('surround.mkv'), stereo = M('stereo.mp4');
  for (const [file, kinds] of [[M('clip.mp4'), 'mono'], [M('tone.wav'), 'mono'], [stereo, 'stereo'], [surround, '5.1']]) {
    const whole = loud(file), rows = [];
    // a part of the file is compared with the same part of the original, decoded losslessly
    const part = (name, af) => { const q = join(tmp, `${name}-${file.split('/').pop()}.wav`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vn', '-af', af, '-c:a', 'pcm_f32le', q]); return loud(q); };
    for (const [what, job, o, extra] of LEVEL) {
      if (file.endsWith('.wav') && /MP4|WebM|exact trim|compress|M4A/.test(what)) continue; // jobs for videos, or the same as for MP4
      // the stretch crossfades its pieces: sound like noise (the room noise on 5.1's sides) loses up to 1.3 dB — below
      if (kinds === '5.1' && /speed/.test(what)) continue;
      const res = runJob(job, o, extra === 'join' ? [file, file] : [file], extra === 'join' ? { join: true } : {});
      if (!ok(res, `${kinds} ${what}`)) continue;
      const base = extra === 'part' ? part('part', 'atrim=0.5:2.5') : extra === 'cut' ? part('cut', 'aselect=not(between(t\\,1\\,1.5)),asetpts=N/SR/TB') : whole;
      const d = loud(res.out) - base;
      rows.push(`${what} ${d >= 0 ? '+' : ''}${d.toFixed(1)}`);
      t.ok(Math.abs(d) <= 0.5, `${kinds} (${file.split('/').pop()}) — ${what}: the same loudness (${base} → ${loud(res.out)} LUFS, ${lay(res.out)})`);
      if (kinds === '5.1' && /WebM|MP4|M4A|OGG|join|reverse/.test(what)) t.ok(/ 6 5\.1$/.test(lay(res.out)), `5.1(side) — ${what}: 5.1 as the encoders write it (${lay(res.out)})`);
      if (kinds !== '5.1' && /WebM|OGG/.test(what)) t.ok(lay(res.out).startsWith(`opus ${kinds === 'mono' ? 1 : 2}`), `${kinds} — ${what}: Opus in ${kinds} (${lay(res.out)})`);
    }
  }
  // the stretch on 5.1 with room noise on the sides: noise-like sound loses up to 1.3 dB as the stretch crossfades it (the
  // voice and the chords keep theirs — speed on speech and on music: within 0.4 dB, docs/BUGHUNT.md)
  r = runJob('speed', { speed: '1.5' }, [surround]);
  if (ok(r, '5.1 speed')) { const d = loud(r.out) - loud(surround); t.ok(d < 0 && d > -1.0, `5.1 with room noise at 1.5×: ${d.toFixed(1)} dB (the crossfaded noise)`); }
  // mono → stereo: on both sides at full level (FFmpeg's -ac 2 put it 3 dB lower — what made mono phone videos quieter)
  for (const f of [M('clip.mp4'), M('tone.wav')]) {
    r = runJob('sound', { channels: '2' }, [f]);
    if (ok(r, 'stereo from mono')) t.ok(info(r.out).a.channels === 2 && near(loud(r.out), loud(f), 0.5), `${f.split('/').pop()}: stereo from mono at the same loudness (${loud(f)} → ${loud(r.out)} LUFS)`);
  }
  r = runJob('join', {}, [M('clip.mp4'), stereo], { join: true });
  if (ok(r, 'join mono + stereo')) {
    const first = join(r.dir, 'first.wav'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', r.out, '-t', '2.9', '-vn', first]);
    t.ok(info(r.out).a.channels === 2 && near(loud(first), loud(M('clip.mp4')), 0.5), `join a mono clip and a stereo one: stereo, the mono part at its loudness (${loud(M('clip.mp4'))} → ${loud(first)} LUFS)`);
  }
  // mono from the same sound on both sides: the average keeps it (FFmpeg's -ac 1 made it 3 dB louder)
  const twin = join(tmp, 'twin.wav'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', M('tone.wav'), '-af', 'pan=stereo|c0=c0|c1=c0', twin]);
  r = runJob('sound', { channels: '1' }, [twin]);
  if (ok(r, 'mono from twins')) t.ok(info(r.out).a.channels === 1 && near(loud(r.out), loud(twin), 0.3), `mono from the same sound on both sides: the same loudness (${loud(twin)} → ${loud(r.out)} LUFS)`);
  // 5.1 mixed into two (MP3 holds two; "Stereo"): FFmpeg's downmix, as players make it — R128 counts the surround
  // channels 1.5 dB more in 5.1 than in two, so the two-channel file measures up to a dB lower
  for (const [what, job, o] of [['stereo', 'sound', { channels: '2' }], ['MP3', 'convert', { fmt: 'mp3' }]]) {
    r = runJob(job, o, [surround]);
    if (ok(r, `5.1 to ${what}`)) { const d = loud(r.out) - loud(surround); t.ok(info(r.out).a.channels === 2 && d <= 0 && d > -1.0, `5.1 to ${what}: two channels, ${d.toFixed(1)} dB (the downmix)`); }
  }
  // the music under a mono voice: the voice on both sides at full level — the mix measures as the voice alone, put on
  // both sides as it is, with the music added at 30 %
  r = runJob('merge', { mergeMode: 'mix', musicVol: '30' }, [M('clip.mp4'), st3], { second: true });
  if (ok(r, 'music under a mono voice')) {
    const ref = join(r.dir, 'ref.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', M('clip.mp4'), '-stream_loop', '-1', '-i', st3, '-filter_complex', '[0:a]pan=stereo|c0=c0|c1=c0[s];[1:a]volume=0.3[m];[s][m]amix=inputs=2:duration=first:normalize=0[a]', '-map', '[a]', ref]);
    t.ok(info(r.out).a.channels === 2 && near(loud(r.out), loud(ref), 0.5), `music under a mono voice: as loud as the voice at full level + the music (${loud(ref)} / ${loud(r.out)} LUFS)`);
  }
  // own arguments making stereo Opus: complexity 4 is added — the command runs (natively it ran before too; the e2e
  // suite runs it on the tab's FFmpeg, where it crashed)
  r = runJob('raw', { raw: '-i in1.mp4 -vn -c:a libopus -b:a 128k out.ogg' }, [stereo]);
  if (ok(r, 'own arguments, Opus')) t.ok(lay(r.out).startsWith('opus 2') && near(loud(r.out), loud(stereo), 0.5), `own arguments making stereo Opus: ${lay(r.out)}, the same loudness`);

  // the rest of the old jobs still run
  for (const [job, o] of [['convert', { fmt: 'webm' }], ['audio', { aud: 'copy' }], ['mute', {}], ['trim', { start: '1', end: '2', exact: true }], ['compress', { crf: 30, speedPreset: 'ultrafast' }], ['resize', { height: '240' }], ['fps', { fps: '15' }], ['rotate', { rot: 'cw' }], ['crop', { crop: '1:1' }], ['gif', {}], ['speed', { speed: '2' }], ['loudnorm', {}], ['frames', { frameFps: '1' }]]) {
    r = runJob(job, o, [M('clip.mp4')]);
    if (ok(r, job)) t.ok(r.outs.length >= 1, `${job}: made ${r.outs.join(', ')}`);
  }
};
