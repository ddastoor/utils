// What a media file holds, read by the native FFmpeg (Ubuntu's 6.1, `apt install ffmpeg`; the Windows runner's from
// choco): its streams (ffprobe), a frame's pixels, the sound as samples, levels and tones, the loudness (EBU R128, a mono
// file as heard on two speakers), the MD5 of a stream's packets, where a sound starts, an animated WebP's chunks. Shared by
// the FFmpeg tab's suites: tests/unit/ffjobs2.test.mjs (the jobs' commands run natively) and tests/e2e/ffmpeg-fixes.e2e.mjs,
// ffmpeg-effects.e2e.mjs (the same jobs run by the tab's FFmpeg 5.1 in the browser).
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from './child.mjs';

/** the native ffmpeg and ffprobe are installed */
export const haveNative = () => ['ffmpeg', 'ffprobe'].every((c) => { try { return spawnSync(c, ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; } });
/** what `ffmpeg -i` says about a file (the tab's probe reads this) */
export const probeLog = (p) => spawnSync('ffmpeg', ['-hide_banner', '-i', p], { encoding: 'utf8' }).stderr;
export const ffprobe = (p) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-show_chapters', '-of', 'json', p]).toString());
/** the length, the first picture stream, the sound streams, the subtitle streams and ffprobe's whole answer */
export const info = (p) => { const r = ffprobe(p); return { dur: +r.format.duration, v: r.streams.find((s) => s.codec_type === 'video'), a: r.streams.filter((s) => s.codec_type === 'audio'), s: r.streams.filter((s) => s.codec_type === 'subtitle'), r }; };
export const near = (a, b, e) => Math.abs(a - b) <= e;
/** a frame as RGB (`d`: w × h × 3 bytes) at `at` s; `vf` scales or crops it first (its first two numbers are its size) */
export const frame = (p, at, vf = '') => {
  const { v } = info(p);
  const raw = execFileSync('ffmpeg', ['-v', 'error', ...(at > 0 ? ['-ss', String(at)] : []), '-i', p, ...(vf ? ['-vf', vf] : []), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 27 });
  return { w: vf ? +/(\d+):(\d+)/.exec(vf)?.[1] || v.width : v.width, h: vf ? +/(\d+):(\d+)/.exec(vf)?.[2] || v.height : v.height, d: raw };
};
/** the mean colour of a rectangle (fractions of the picture: x0, y0, x1, y1) */
export const mean = (f, [x0, y0, x1, y1]) => { let r = 0, g = 0, b = 0, k = 0; for (let y = Math.floor(y0 * f.h); y < Math.floor(y1 * f.h); y++) for (let x = Math.floor(x0 * f.w); x < Math.floor(x1 * f.w); x++) { const i = (y * f.w + x) * 3; r += f.d[i]; g += f.d[i + 1]; b += f.d[i + 2]; k++; } return [r / k, g / k, b / k]; };
/** the mean absolute difference of two frames of one size, per colour value (0 – 255), in a rectangle */
export const mad = (a, b, [x0, y0, x1, y1] = [0, 0, 1, 1]) => { let s = 0, k = 0; for (let y = Math.floor(y0 * a.h); y < Math.floor(y1 * a.h); y++) for (let x = Math.floor(x0 * a.w); x < Math.floor(x1 * a.w); x++) for (let ch = 0; ch < 3; ch++) { const i = (y * a.w + x) * 3 + ch; s += Math.abs(a.d[i] - b.d[i]); k++; } return s / k; };
/** the sound as float samples, `ch` channels interleaved, at `rate` */
export const pcm = (p, ch = 1, rate = 48000, map = '0:a:0') => { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', p, '-map', map, '-ac', String(ch), '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
/** the level in dB of the frames a … z of one channel (`step` channels interleaved, the channel `off`) */
export const rms = (x, a = 0, z = x.length, step = 1, off = 0) => { let s = 0, k = 0; for (let i = Math.floor(a) * step + off; i < Math.floor(z) * step; i += step) { s += x[i] * x[i]; k++; } return 10 * Math.log10(s / Math.max(1, k)); };
/** the power of one frequency in samples a … z (Goertzel), in dB */
export const goertzel = (x, rate, f, a, z) => { const w = (2 * Math.PI * f) / rate, cw = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = Math.floor(a); i < Math.floor(z); i++) { const s0 = x[i] + cw * s1 - s2; s2 = s1; s1 = s0; } return 10 * Math.log10(Math.max(1e-30, (s1 * s1 + s2 * s2 - cw * s1 * s2) / ((z - a) ** 2))); };
/** the integrated loudness, LUFS (ebur128's last summary) */
export const loud = (p, map = '0:a:0') => { const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-map', map, '-af', 'ebur128=dualmono=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr; return +/I:\s+(-?[\d.]+) LUFS/.exec(e.slice(e.lastIndexOf('Summary:')))?.[1]; };
/** the MD5 of a stream's packets — the same when it was copied */
export const md5 = (p, map) => /MD5=(\w+)/.exec(execFileSync('ffmpeg', ['-v', 'error', '-i', p, '-map', map, '-c', 'copy', '-f', 'md5', '-']).toString())?.[1];
/** the time (s) the sound first rises above `th` after `from` s */
export const onset = (x, rate, from, th = 0.1) => { for (let i = Math.floor(from * rate); i < x.length; i++) if (Math.abs(x[i]) > th) return i / rate; return NaN; };
/** how far (ms) `a`'s sound lies behind `b`'s: the lag in from … to samples at 48 kHz where they correlate best (channel c0 of ch) */
export const lagOf = (a, b, ch, c0, from, to) => { const x = pcm(a, ch, 48000), x0 = pcm(b, ch, 48000); let best = -Infinity, bl = 0; for (let l = from; l <= to; l++) { let s = 0; for (let j = 20000; j < 100000; j++) s += x[(j + l) * ch + c0] * x0[j * ch + c0]; if (s > best) { best = s; bl = l; } } return bl / 48; };
/** an (animated) WebP's chunks: RIFF / WEBP, the VP8X flags (2: animation, 16: alpha), size, frames, loop count, bytes */
export const webp = (p) => {
  const b = readFileSync(p), ch = [];
  for (let o = 12; o + 8 <= b.length;) { const id = b.toString('latin1', o, o + 4), sz = b.readUInt32LE(o + 4); ch.push([id, o + 8, sz]); o += 8 + sz + (sz & 1); }
  const x = ch.find(([id]) => id === 'VP8X'), an = ch.find(([id]) => id === 'ANIM');
  return { riff: b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP', flags: x ? b[x[1]] : 0, w: x ? 1 + b.readUIntLE(x[1] + 4, 3) : 0, h: x ? 1 + b.readUIntLE(x[1] + 7, 3) : 0, frames: ch.filter(([id]) => id === 'ANMF').length, loop: an ? b.readUInt16LE(an[1] + 4) : -1, size: b.length };
};
