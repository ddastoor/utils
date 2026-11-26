// FFmpeg tab: the jobs as FFmpeg arguments. Pure functions (no DOM), so the unit suite checks every job's command and
// every refusal; the tab (src/tools/ffmpeg.ts) runs them on ffmpeg.wasm and the e2e suite checks the files they make.
// Inputs are named in1.<ext>, in2.<ext> … (the tab mounts them at /in/ and maps those names); a filter that names a
// file itself writes the /in/ path. Text files a job needs (a concat list, a subtitle script) are in `writes`.

export type Job =
  | 'convert' | 'audio' | 'mute' | 'thumb' | 'frames' | 'sheet' | 'gif' | 'audio2mp4'
  | 'trim' | 'cutout' | 'join' | 'split' | 'loop' | 'reverse'
  | 'compress' | 'resize' | 'crop' | 'fit' | 'rotate' | 'fps'
  | 'colours' | 'stabilise' | 'denoise' | 'deinterlace' | 'fade' | 'text' | 'logo' | 'pip'
  | 'speed' | 'timelapse'
  | 'volume' | 'loudnorm' | 'silence' | 'merge' | 'sound'
  | 'subBurn' | 'subAdd' | 'subExtract'
  | 'raw';

export const JOB_GROUPS: Array<[string, Array<[Job, string]>]> = [
  ['Convert and extract', [['convert', 'Convert format'], ['audio', 'Extract audio'], ['mute', 'Remove audio'], ['thumb', 'Picture at a moment (thumbnail)'], ['frames', 'Extract frames'], ['sheet', 'Contact sheet (grid of frames)'], ['gif', 'Video → GIF'], ['audio2mp4', 'Audio → MP4 video']]],
  ['Cut and join', [['trim', 'Trim / cut'], ['cutout', 'Cut a part out'], ['join', 'Join clips'], ['split', 'Split into equal parts'], ['loop', 'Loop / boomerang'], ['reverse', 'Reverse']]],
  ['Size and shape', [['compress', 'Compress video'], ['resize', 'Resize'], ['crop', 'Crop'], ['fit', 'Fit to a shape (blurred background or bars)'], ['rotate', 'Rotate / flip'], ['fps', 'Frame rate']]],
  ['Picture', [['colours', 'Colours (brightness, contrast, black and white)'], ['stabilise', 'Stabilise a shaky video'], ['denoise', 'Clean up a grainy video'], ['deinterlace', 'Deinterlace (old camcorder / TV)'], ['fade', 'Fade in / fade out'], ['text', 'Text on the video'], ['logo', 'Logo on the video'], ['pip', 'Picture-in-picture']]],
  ['Speed', [['speed', 'Speed up / slow down'], ['timelapse', 'Timelapse (8× – 60×)']]],
  ['Sound', [['volume', 'Volume'], ['loudnorm', 'Normalise loudness'], ['silence', 'Remove silence'], ['merge', 'Add audio / background music'], ['sound', 'Sound settings (mono, stereo, sample rate)']]],
  ['Subtitles', [['subBurn', 'Burn in subtitles'], ['subAdd', 'Add subtitles as a track'], ['subExtract', 'Extract subtitles']]],
  ['Expert', [['raw', 'Your own arguments']]],
];
export const JOBS: Array<[Job, string]> = JOB_GROUPS.flatMap(([, j]) => j);

/** What FFmpeg says about a file (`ffmpeg -i`). */
export interface Probe { dur: number; w: number; h: number; fps: number; video: boolean; vcodec: string; audio: boolean; acodec: string; rate: number; channels: number; layout: string; subs: number; scodec: string }
export const EMPTY_PROBE: Probe = { dur: 0, w: 0, h: 0, fps: 0, video: false, vcodec: '', audio: false, acodec: '', rate: 0, channels: 0, layout: '', subs: 0, scodec: '' };
/** The channels of FFmpeg's layout names (`ffmpeg -layouts`). */
const LAYOUT_CH: Record<string, number> = {
  mono: 1, stereo: 2, '2.1': 3, '3.0': 3, '3.0(back)': 3, '4.0': 4, quad: 4, 'quad(side)': 4, '3.1': 4, '5.0': 5, '5.0(side)': 5, '4.1': 5,
  '5.1': 6, '5.1(side)': 6, '6.0': 6, '6.0(front)': 6, hexagonal: 6, '6.1': 7, '6.1(back)': 7, '6.1(front)': 7, '7.0': 7, '7.0(front)': 7,
  '7.1': 8, '7.1(wide)': 8, '7.1(wide-side)': 8, octagonal: 8, downmix: 2,
};
export function parseProbe(log: string): Probe {
  const p = { ...EMPTY_PROBE };
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  if (d) p.dur = +d[1] * 3600 + +d[2] * 60 + +d[3];
  for (const line of log.split('\n')) {
    const s = /Stream #\d+:\d+.*?: (Video|Audio|Subtitle): (\w+)/.exec(line);
    if (!s) continue;
    if (s[1] === 'Video' && !/attached pic/.test(line) && !p.video) {
      p.video = true; p.vcodec = s[2];
      const wh = /, (\d{2,5})x(\d{2,5})[ ,]/.exec(line); if (wh) { p.w = +wh[1]; p.h = +wh[2]; }
      const f = /, ([\d.]+) (fps|tbr)/.exec(line); if (f) p.fps = +f[1];
    } else if (s[1] === 'Audio' && !p.audio) {
      p.audio = true; p.acodec = s[2];
      const r = /, (\d+) Hz/.exec(line); if (r) p.rate = +r[1];
      // "…, 48000 Hz, 5.1(side), fltp, …": the layout as FFmpeg names it ("6 channels" when it knows none)
      p.layout = /, \d+ Hz, ([^,]+)/.exec(line)?.[1].trim() ?? '';
      p.channels = LAYOUT_CH[p.layout] ?? (/^(\d+) channels/.test(p.layout) ? +/^(\d+)/.exec(p.layout)![1] : 0);
    } else if (s[1] === 'Subtitle') { if (!p.subs) p.scodec = s[2]; p.subs++; }
  }
  return p;
}

export interface JobCtx {
  in1: string; in2?: string; ins?: string[];  // file names inside FFmpeg (ins: the clips of a join, in order)
  p: Probe; p2?: Probe; ps?: Probe[];           // what FFmpeg said about them
  ext: string; ext2?: string;                    // extensions of the two files (lower case)
}
/** jpeg: the PNG outputs are to be made JPEG by MozJPEG (this core's own JPEG encoder overflows a buffer at high
 *  quality — `-q:v 3` and below on a 640 × 360 frame crash the page — so FFmpeg writes PNG here). */
export interface Built { args: string[]; outputs: string[]; pattern?: RegExp; writes?: Array<[string, string]>; fonts?: boolean; zip?: string; jpeg?: boolean }
/** The output names a job lists end in .png when `jpeg` is set; these are the names the user gets. */
export const asJpegName = (n: string) => n.replace(/\.png$/, '.jpg');

/** "90", "1:30", "00:01:30.5", "1.5" → seconds; NaN when it is not a time. */
export function secs(t: string): number {
  const parts = String(t).trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((x) => !/^\d+(\.\d+)?$/.test(x.trim()))) return NaN;
  return parts.reduce((a, x) => a * 60 + +x, 0);
}
const fmtS = (s: number) => String(+s.toFixed(3));
const X264 = (crf = 20) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
// ---------------------------------------------------------------- sound kept at its level (to-do #23)
/** The layouts the AAC and Opus encoders take as they are, by number of channels. FFmpeg's AAC encoder writes any other
 *  layout with a PCE, which ffprobe and players read as "unknown" (the "5.1(side)" of an AC-3 or a DTS); libopus refuses
 *  it ("Invalid channel layout 5.1(side) for specified mapping family -1"). Asked for the standard one, FFmpeg moves the
 *  side channels to the back as they are (gain 1). */
const AAC_LAYOUT: Record<number, string> = { 3: '3.0', 4: '4.0', 5: '5.0', 6: '5.1', 8: '7.1' };
const OPUS_LAYOUT: Record<number, string> = { 3: '3.0', 4: 'quad', 5: '5.0', 6: '5.1', 7: '6.1', 8: '7.1' };
const layoutFix = (std: Record<number, string>, ch: number, layout: string) => (std[ch] && layout && layout !== std[ch] ? ['-ch_layout', std[ch]] : []);
/** A bitrate given for two channels, as much a channel for more: 5.1 at the stereo rate lost detail (Opus 2 dB of its
 *  loudness — the upper bands went). One channel keeps the rate given. */
const kbpsFor = (kbps: number, ch: number) => `${ch > 2 ? Math.round((kbps * ch) / 2) : kbps}k`;
/** AAC at `kbps` (for two channels) for a sound of `ch` channels in `layout`. */
const aacArgs = (kbps: number, ch = 2, layout = '') => ['-c:a', 'aac', '-b:a', kbpsFor(kbps, ch), ...layoutFix(AAC_LAYOUT, ch, layout)];
/** Opus, likewise. **The Opus encoder of this build (libopus 1.3.1 in ffmpeg.wasm 0.12) crashes on two channels and
 *  more** — "memory access out of bounds" at the first frame, with 20 ms frames (and 40, 60) and complexity 5 and above,
 *  which turn on its pitch pre-filter and its late transient check — so they are made at complexity 4, which a
 *  noise-to-mask measure put level with the default at these bitrates (docs/BUGHUNT.md); one channel keeps the default. */
export const OPUS_SAFE = ['-compression_level:a', '4'];
const opusArgs = (kbps: number, ch = 2, layout = '') => ['-c:a', 'libopus', '-b:a', kbpsFor(kbps, ch), ...(ch === 1 ? [] : OPUS_SAFE), ...layoutFix(OPUS_LAYOUT, ch, layout)];
/** The start of a filter chain that takes a sound of `from` channels to `layout`: a mono sound goes on both sides at full
 *  level, as players play it — FFmpeg's own upmix puts it 3 dB lower on each side, and a mono phone video came out
 *  quieter; anything else is left to FFmpeg (a downmix of more channels as players make it). */
const upmix = (from: number, layout: string) => (from === 1 && layout === 'stereo' ? 'pan=stereo|c0=c0|c1=c0,' : '');
/** Two sides made one: their average, as Audacity's "Mix Stereo Down to Mono" — the same sound on both sides keeps its
 *  level (FFmpeg's -ac 1 adds them at 0.71 each: 3 dB louder, and clipping at full scale). More channels are mixed to
 *  two first, as players do. */
const toMono = (from: number) => `${from > 2 ? 'aformat=channel_layouts=stereo,' : ''}pan=mono|c0=0.5*c0+0.5*c1`;
/** Sound into an MP4: copied when MP4 can hold it, else AAC. */
const ACOPY = (p: Probe) => (!p.audio ? [] : /^(aac|mp3|ac3|eac3|alac|opus)$/.test(p.acodec) ? ['-c:a', 'copy'] : aacArgs(160, p.channels, p.layout));
/** The sound file a job on sound makes: the input's own kind where that is a plain sound format, else M4A (AAC);
 *  `ch` / `layout`: the sound it holds. */
function audioOut(ext: string, ch = 2, layout = ''): [string, string[]] {
  if (ext === 'mp3') return ['mp3', ['-c:a', 'libmp3lame', '-q:a', '2']];
  if (ext === 'wav') return ['wav', ['-c:a', 'pcm_s16le']];
  if (ext === 'flac') return ['flac', ['-c:a', 'flac']];
  if (ext === 'ogg' || ext === 'opus') return ['ogg', opusArgs(128, ch, layout)];
  return ['m4a', aacArgs(192, ch, layout)];
}
/** A video whose picture is copied and whose sound is re-encoded: the input's container where that is a common one. */
const videoOutExt = (ext: string) => (/^(mp4|mov|m4v|mkv|webm)$/.test(ext) ? ext : 'mkv');
const reAudioFor = (ext: string, ch = 2, layout = '') => (ext === 'webm' ? opusArgs(128, ch, layout) : aacArgs(192, ch, layout));
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const CORNER: Record<string, (m: number) => string> = {
  tl: (m) => `${m}:${m}`, tr: (m) => `W-w-${m}:${m}`, bl: (m) => `${m}:H-h-${m}`, br: (m) => `W-w-${m}:H-h-${m}`, c: () => '(W-w)/2:(H-h)/2',
};
const AUDIO_EXT: Record<string, string> = { aac: 'm4a', mp3: 'mp3', opus: 'ogg', vorbis: 'ogg', flac: 'flac', pcm_s16le: 'wav', alac: 'm4a' };
const SUB_EXT = /^(srt|vtt|ass|ssa)$/;
const BITMAP_SUBS = /^(dvd_subtitle|hdmv_pgs_subtitle|dvb_subtitle|xsub)$/;
/** Reversing keeps every decoded frame in memory; the limit leaves room in the browser's 2 GB. */
export const REVERSE_BYTES = 700e6;
export function maxReverseSeconds(p: Probe) { return p.w && p.h ? Math.floor(REVERSE_BYTES / (p.w * p.h * 1.5 * (p.fps || 30))) : Infinity; }

/** An ASS script that shows `text` for the whole video (libass shapes every script: Hindi, Arabic, emoji fonts …). */
export function assFor(text: string, o: { pos: string; size: string; colour: string; box: boolean }, w: number, h: number) {
  const W = w || 1280, H = h || 720;
  const fs = Math.round(H * ({ small: 0.045, medium: 0.065, large: 0.09 }[o.size] ?? 0.065));
  const align = { top: 8, middle: 5, bottom: 2 }[o.pos] ?? 2;
  const col = { white: '&H00FFFFFF', yellow: '&H0000FFFF', black: '&H00000000' }[o.colour] ?? '&H00FFFFFF';
  const outline = o.box ? '&H80000000' : o.colour === 'black' ? '&H00FFFFFF' : '&H00000000';
  // ASS reads {…} as style codes and \N, \n, \h as breaks: those characters are shown as their full-width forms
  const t = text.replace(/\r\n?/g, '\n').trim().replace(/\\/g, '＼').replace(/\{/g, '｛').replace(/\}/g, '｝').replace(/\n/g, '\\N');
  return ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: T,Noto Sans,${fs},${col},${col},${outline},&H80000000,-1,0,0,0,100,100,0,0,${o.box ? 3 : 1},${o.box ? Math.round(fs * 0.25) : Math.max(2, Math.round(fs * 0.07))},0,${align},${Math.round(W * 0.04)},${Math.round(W * 0.04)},${Math.round(H * 0.05)},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,0:00:00.00,9:59:59.99,T,,0,0,0,,${t}`, ''].join('\n');
}

export const DEFAULTS: Record<string, any> = {
  fmt: 'mp4', aud: 'copy', start: '0', end: '', exact: false, crf: 28, speedPreset: 'veryfast', height: '720', fps: '30', rot: 'cw', crop: '16:9',
  gifW: '480', gifFps: '12', speed: '2', frameFps: '1', frameFmt: 'png', a2m: 'still', raw: '-i in1.mp4 -vf hflip -c:a copy out.mp4',
  thumbAt: '1', thumbFmt: 'jpg', sheetGrid: '4x4', cutFrom: '1', cutTo: '2', joinFast: false, splitBy: 'time', splitSec: '60', splitParts: '2',
  loopKind: '2', fitShape: '9:16', fitBg: 'blur', bright: 0, contrast: 100, sat: 100, bw: false, denoise: 'medium', fadeLen: '1', fadeWhich: 'both',
  text: 'Hello!', textPos: 'bottom', textSize: 'medium', textColour: 'white', textBox: false, logoSize: '15', logoPos: 'br', logoOpacity: '100',
  pipSize: '33', pipPos: 'br', tlx: '8', vol: '1.5', silWhere: 'ends', silMin: '1', silLevel: '-50', mergeMode: 'replace', musicVol: '30',
  channels: 'keep', rate: 'keep', subLang: 'eng', subFmt: 'srt',
};

const needVideo = (p: Probe) => { if (!p.video) throw new Error('This task needs a video — this file has no picture.'); };
const needAudio = (p: Probe) => { if (!p.audio) throw new Error('This task needs sound — this file has none.'); };
const needDur = (p: Probe) => { if (!(p.dur > 0)) throw new Error('FFmpeg could not tell how long this file is.'); };

/** The FFmpeg arguments for a job. Throws a sentence when the job cannot be done with these files or settings. */
export function buildJob(job: Job, o: Record<string, any>, c: JobCtx): Built {
  const p = c.p, I = ['-i', c.in1], isAudio = !p.video;
  const base = c.ext || 'mp4';
  switch (job) {
    // ---------------------------------------------------------------- convert and extract
    case 'convert': {
      const f = o.fmt, out = `out.${f}`, ch = p.channels, ly = p.layout;
      const enc: Record<string, string[]> = {
        mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', ...aacArgs(160, ch, ly), '-movflags', '+faststart'],
        mov: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', ...aacArgs(160, ch, ly)],
        // VP8: libvpx-vp9 and libx265 wait forever for worker threads in this single-threaded core
        webm: ['-c:v', 'libvpx', '-b:v', '1M', '-crf', '10', '-deadline', 'realtime', '-cpu-used', '8', ...opusArgs(128, ch, ly)],
        mkv: ['-c', 'copy'], mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'], m4a: ['-vn', ...aacArgs(192, ch, ly)], wav: ['-vn', '-c:a', 'pcm_s16le'],
        flac: ['-vn', '-c:a', 'flac'], ogg: ['-vn', ...opusArgs(128, ch, ly)],
        gif: ['-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0'],
      };
      return { args: [...I, ...enc[f], out], outputs: [out] };
    }
    case 'audio': {
      needAudio(p);
      if (o.aud === 'copy') { const out = `audio.${AUDIO_EXT[p.acodec] || 'mka'}`; return { args: [...I, '-vn', '-c:a', 'copy', out], outputs: [out] }; }
      const out = `audio.${o.aud}`;
      return { args: [...I, '-vn', ...(o.aud === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '2'] : ['-c:a', 'pcm_s16le']), out], outputs: [out] };
    }
    case 'mute': { needVideo(p); const out = `out.${base}`; return { args: [...I, '-c:v', 'copy', '-an', out], outputs: [out] }; }
    case 'thumb': {
      needVideo(p);
      const t = secs(o.thumbAt);
      if (!Number.isFinite(t)) throw new Error('The moment is a time — seconds (12.5) or minutes:seconds (1:30).');
      if (p.dur && t >= p.dur) throw new Error(`The video is only ${fmtS(p.dur)} s long.`);
      return { args: ['-ss', fmtS(t), ...I, '-frames:v', '1', 'thumb.png'], outputs: ['thumb.png'], jpeg: o.thumbFmt === 'jpg' };
    }
    case 'frames': needVideo(p); return { args: [...I, '-vf', `fps=${o.frameFps}`, 'frame-%04d.png'], outputs: [], pattern: /^frame-\d{4}\.png$/, zip: 'frames', jpeg: o.frameFmt === 'jpg' };
    case 'sheet': {
      needVideo(p); needDur(p);
      const [cols, rows] = String(o.sheetGrid).split('x').map(Number), n = cols * rows;
      // n frames evenly over the video (fps = n / length), each 320 px wide, on a white sheet
      return { args: [...I, '-vf', `fps=${n}/${fmtS(p.dur)},scale=320:-2,tile=${cols}x${rows}:padding=6:margin=6:color=white`, '-frames:v', '1', 'sheet.png'], outputs: ['sheet.png'], jpeg: true };
    }
    case 'gif': needVideo(p); return { args: [...I, '-vf', `fps=${o.gifFps},scale=${o.gifW}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', 'out.gif'], outputs: ['out.gif'] };
    case 'audio2mp4': {
      needAudio(p);
      const aac = aacArgs(192, p.channels, p.layout);
      if (o.a2m === 'm4a') return { args: [...I, '-vn', ...aac, 'out.m4a'], outputs: ['out.m4a'] };
      if (o.a2m === 'still') {
        if (!c.in2) return { args: [...I, '-f', 'lavfi', '-i', 'color=c=0x1e1b4b:s=1280x720:r=2', '-map', '1:v', '-map', '0:a', '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', ...aac, ...(p.dur ? ['-t', String(p.dur)] : ['-shortest']), 'out.mp4'], outputs: ['out.mp4'] };
        // -t (not -shortest): FFmpeg 5.1 keeps a looped picture going past the end of the sound with -shortest
        return { args: ['-loop', '1', '-framerate', '2', '-i', c.in2, ...I, '-map', '0:v', '-map', '1:a', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-c:v', 'libx264', '-tune', 'stillimage', ...aac, ...(p.dur ? ['-t', String(p.dur)] : ['-shortest']), 'out.mp4'], outputs: ['out.mp4'] };
      }
      return { args: [...I, '-filter_complex', '[0:a]showwaves=s=1280x720:mode=cline:rate=25:colors=0x818cf8,format=yuv420p[v]', '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', ...aac, 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- cut and join
    case 'trim': {
      const out = `out.${base}`, s0 = o.start === '' ? 0 : secs(o.start), s1 = o.end ? secs(o.end) : NaN;
      if (!Number.isFinite(s0)) throw new Error('The start is a time — seconds (12.5) or minutes:seconds (1:30).');
      if (o.end && !Number.isFinite(s1)) throw new Error('The end is a time — seconds (12.5) or minutes:seconds (1:30).');
      if (o.end && !(s1 > s0)) throw new Error('The end must be after the start.');
      if (p.dur && s0 >= p.dur) throw new Error(`The file is only ${fmtS(p.dur)} s long.`);
      const ss = ['-ss', fmtS(s0)], dur = o.end ? ['-t', fmtS(s1 - s0)] : [];
      if (!o.exact) return { args: [...ss, ...I, ...dur, '-c', 'copy', out], outputs: [out] }; // the MP4 edit list starts playback at the cut
      // exact: re-encoded — the sound with its own encoder (the container's default was AAC at 128 kb/s for any number
      // of channels, or libopus, which this build cannot run in stereo); a WebM's picture as H.264 into an MP4
      if (isAudio) { const [ext, enc] = audioOut(base, p.channels, p.layout); return { args: [...I, ...ss, ...dur, ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      const vout = /^(mp4|mov|m4v|mkv)$/.test(base) ? out : 'out.mp4';
      return { args: [...I, ...ss, ...dur, ...X264(20), ...(p.audio ? aacArgs(160, p.channels, p.layout) : []), vout], outputs: [vout] };
    }
    case 'cutout': {
      needDur(p);
      const a = secs(o.cutFrom), b = secs(o.cutTo);
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('"From" and "to" are times — seconds (12.5) or minutes:seconds (1:30).');
      if (!(b > a)) throw new Error('"To" must be after "from".');
      if (a >= p.dur) throw new Error(`The file is only ${fmtS(p.dur)} s long.`);
      if (a <= 0 && b >= p.dur) throw new Error('That is the whole file — nothing would be left.');
      const parts: Array<[string, string]> = [];
      if (a > 0) parts.push([`trim=end=${fmtS(a)}`, `atrim=end=${fmtS(a)}`]);
      if (b < p.dur) parts.push([`trim=start=${fmtS(b)}`, `atrim=start=${fmtS(b)}`]);
      const f: string[] = [];
      parts.forEach(([vt, at], i) => {
        if (p.video) f.push(`[0:v]${vt},setpts=PTS-STARTPTS[v${i}]`);
        if (p.audio) f.push(`[0:a]${at},asetpts=PTS-STARTPTS[a${i}]`);
      });
      const pads = parts.map((_, i) => `${p.video ? `[v${i}]` : ''}${p.audio ? `[a${i}]` : ''}`).join('');
      f.push(`${pads}concat=n=${parts.length}:v=${p.video ? 1 : 0}:a=${p.audio ? 1 : 0}${p.video ? '[v]' : ''}${p.audio ? '[a]' : ''}`);
      const maps = [...(p.video ? ['-map', '[v]'] : []), ...(p.audio ? ['-map', '[a]'] : [])];
      if (isAudio) { const [ext, enc] = audioOut(base, p.channels, p.layout); return { args: [...I, '-filter_complex', f.join(';'), ...maps, ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      return { args: [...I, '-filter_complex', f.join(';'), ...maps, ...X264(20), ...(p.audio ? aacArgs(160, p.channels, p.layout) : []), 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'join': {
      const ins = c.ins || [c.in1], ps = c.ps || [p];
      if (ins.length < 2) throw new Error('Add at least one more clip to join.');
      const videos = ps.filter((x) => x.video).length;
      if (videos && videos < ps.length) throw new Error('Join videos with videos, or sound files with sound files — not both.');
      if (o.joinFast) {
        const a = ps[0];
        const same = ps.every((x) => x.vcodec === a.vcodec && x.w === a.w && x.h === a.h && x.acodec === a.acodec && x.audio === a.audio);
        if (!same) throw new Error('The clips differ in size or format, so they cannot be joined without re-encoding — turn off "Fast".');
        const out = `out.${base}`;
        return { args: ['-f', 'concat', '-safe', '0', '-i', '/work/list.txt', '-c', 'copy', out], outputs: [out], writes: [['/work/list.txt', ins.map((n) => `file '/in/${n}'`).join('\n') + '\n']] };
      }
      const anyAudio = ps.some((x) => x.audio);
      // the sound of the joined file: mono when every clip with sound is mono, 5.1 or 7.1 when all are, else stereo —
      // a mono clip on both sides at full level (FFmpeg's own upmix put it 3 dB lower: the "quieter" joins)
      const counts = [...new Set(ps.filter((x) => x.audio).map((x) => x.channels || 2))];
      const outCh = counts.length === 1 && [1, 2, 6, 8].includes(counts[0]) ? counts[0] : 2;
      const outLy = ({ 1: 'mono', 2: 'stereo', 6: '5.1', 8: '7.1' } as Record<number, string>)[outCh];
      const args: string[] = ins.flatMap((n) => ['-i', n]);
      const f: string[] = [];
      let extra = ins.length;
      const audioSrc = ps.map((x) => {
        if (!anyAudio || x.audio) return null;
        if (!(x.dur > 0)) throw new Error('A clip without sound must have a known length to be joined with clips that have sound.');
        args.push('-f', 'lavfi', '-t', fmtS(x.dur), '-i', `anullsrc=r=48000:cl=${outLy}`); // silence where a clip has no sound
        return extra++;
      });
      if (videos) {
        const W = even(ps[0].w || 1280), H = even(ps[0].h || 720);
        ps.forEach((_, i) => f.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${i}]`));
      }
      if (anyAudio) ps.forEach((x, i) => f.push(`[${audioSrc[i] ?? i}:a]${x.audio ? upmix(x.channels, outLy) : ''}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=${outLy}[a${i}]`));
      f.push(`${ps.map((_, i) => `${videos ? `[v${i}]` : ''}${anyAudio ? `[a${i}]` : ''}`).join('')}concat=n=${ps.length}:v=${videos ? 1 : 0}:a=${anyAudio ? 1 : 0}${videos ? '[v]' : ''}${anyAudio ? '[a]' : ''}`);
      const maps = [...(videos ? ['-map', '[v]'] : []), ...(anyAudio ? ['-map', '[a]'] : [])];
      if (!videos) { const [ext, enc] = audioOut(base, outCh); return { args: [...args, '-filter_complex', f.join(';'), ...maps, ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      return { args: [...args, '-filter_complex', f.join(';'), ...maps, ...X264(21), ...(anyAudio ? aacArgs(160, outCh) : []), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'split': {
      let t: number;
      if (o.splitBy === 'parts') { needDur(p); t = p.dur / +o.splitParts; }
      else { t = +o.splitSec; if (p.dur && t >= p.dur) throw new Error(`The file is only ${fmtS(p.dur)} s long — choose shorter parts.`); }
      return { args: [...I, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-f', 'segment', '-segment_time', fmtS(t), '-reset_timestamps', '1', `part-%03d.${base}`], outputs: [], pattern: new RegExp(`^part-\\d{3}\\.${base}$`), zip: 'parts' };
    }
    case 'loop': {
      if (o.loopKind === 'boomerang') {
        needVideo(p);
        const max = maxReverseSeconds(p);
        if (p.dur > max / 2) throw new Error(`A boomerang keeps every frame in memory: a ${p.w}×${p.h} video can be up to about ${Math.floor(max / 2)} s here — trim it first (this one is ${fmtS(p.dur)} s).`);
        return { args: [...I, '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,format=yuv420p[v]', '-map', '[v]', '-an', ...X264(20), 'out.mp4'], outputs: ['out.mp4'] };
      }
      const n = +o.loopKind, out = `out.${base}`;
      return { args: ['-stream_loop', String(n - 1), ...I, '-c', 'copy', out], outputs: [out] };
    }
    case 'reverse': {
      if (isAudio) { needAudio(p); const [ext, enc] = audioOut(base, p.channels, p.layout); return { args: [...I, '-af', 'areverse', ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      const max = maxReverseSeconds(p);
      if (p.dur > max) throw new Error(`Reversing keeps every frame in memory: a ${p.w}×${p.h} video can be reversed up to about ${max} s here — trim it first (this one is ${fmtS(p.dur)} s).`);
      return { args: [...I, '-vf', 'reverse', ...(p.audio ? ['-af', 'areverse'] : []), ...X264(20), ...(p.audio ? aacArgs(160, p.channels, p.layout) : []), 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- size and shape
    case 'compress': needVideo(p); return { args: [...I, '-c:v', 'libx264', '-preset', o.speedPreset, '-crf', String(o.crf), '-pix_fmt', 'yuv420p', ...aacArgs(128, p.channels, p.layout), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    case 'resize': needVideo(p); return { args: [...I, '-vf', `scale=-2:${o.height}:flags=lanczos,setsar=1`, ...X264(23), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    case 'fps': needVideo(p); return { args: [...I, '-vf', `fps=${o.fps}`, ...X264(23), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    case 'rotate': {
      needVideo(p);
      const vf: Record<string, string> = { cw: 'transpose=1', ccw: 'transpose=2', '180': 'transpose=1,transpose=1', h: 'hflip', v: 'vflip' };
      return { args: [...I, '-vf', vf[o.rot], ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'crop': {
      needVideo(p);
      const [a, b] = String(o.crop).split(':').map(Number);
      return { args: [...I, '-vf', `crop='min(iw,ih*${a}/${b})':'min(ih,iw*${b}/${a})'`, ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'fit': {
      needVideo(p);
      const [tw, th] = ({ '9:16': [720, 1280], '16:9': [1280, 720], '1:1': [720, 720], '4:5': [720, 900] } as Record<string, number[]>)[o.fitShape];
      const fc = o.fitBg === 'blur'
        ? `[0:v]split=2[a][b];[a]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},boxblur=20:2[bg];[b]scale=${tw}:${th}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]`
        : `[0:v]scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:color=${o.fitBg},setsar=1,format=yuv420p[v]`;
      return { args: [...I, '-filter_complex', fc, '-map', '[v]', '-map', '0:a?', ...X264(21), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- picture
    case 'colours': {
      needVideo(p);
      const b = +o.bright, ct = +o.contrast, s = o.bw ? 0 : +o.sat;
      if (!o.bw && b === 0 && ct === 100 && s === 100) throw new Error('Move a slider or choose black and white first — this would change nothing.');
      return { args: [...I, '-vf', `eq=brightness=${fmtS(b / 100)}:contrast=${fmtS(ct / 100)}:saturation=${fmtS(s / 100)}`, ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'stabilise': needVideo(p); return { args: [...I, '-vf', 'deshake', ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    case 'denoise': {
      needVideo(p);
      const v = ({ light: '2:1.5:3:2.25', medium: '4:3:6:4.5', strong: '8:6:12:9' } as Record<string, string>)[o.denoise];
      return { args: [...I, '-vf', `hqdn3d=${v}`, ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'deinterlace': needVideo(p); return { args: [...I, '-vf', 'bwdif=mode=send_frame:parity=auto:deint=all', ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    case 'fade': {
      needDur(p);
      const d = +o.fadeLen, inn = o.fadeWhich !== 'out', out = o.fadeWhich !== 'in';
      if ((inn && out ? 2 * d : d) > p.dur) throw new Error(`The file is only ${fmtS(p.dur)} s long — choose shorter fades.`);
      const st = fmtS(p.dur - d);
      const vf = [inn && `fade=t=in:st=0:d=${d}`, out && `fade=t=out:st=${st}:d=${d}`].filter(Boolean).join(',');
      const af = [inn && `afade=t=in:st=0:d=${d}`, out && `afade=t=out:st=${st}:d=${d}`].filter(Boolean).join(',');
      if (isAudio) { needAudio(p); const [ext, enc] = audioOut(base, p.channels, p.layout); return { args: [...I, '-af', af, ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      return { args: [...I, '-vf', vf, ...(p.audio ? ['-af', af, ...aacArgs(160, p.channels, p.layout)] : []), ...X264(20), 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'text': {
      needVideo(p);
      if (!String(o.text).trim()) throw new Error('Type the text to put on the video.');
      const ass = assFor(o.text, { pos: o.textPos, size: o.textSize, colour: o.textColour, box: !!o.textBox }, p.w, p.h);
      return { args: [...I, '-vf', 'ass=filename=/work/text.ass:fontsdir=/fonts', ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'], writes: [['/work/text.ass', ass]], fonts: true };
    }
    case 'logo': {
      needVideo(p);
      if (!c.in2) throw new Error('Choose the logo picture.');
      const lw = even(((p.w || 1280) * +o.logoSize) / 100), m = Math.round((p.w || 1280) * 0.03);
      const fc = `[1:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=${fmtS(+o.logoOpacity / 100)}[l];[0:v][l]overlay=${CORNER[o.logoPos](m)}:format=auto,format=yuv420p[v]`;
      return { args: [...I, '-i', c.in2, '-filter_complex', fc, '-map', '[v]', '-map', '0:a?', ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'pip': {
      needVideo(p);
      if (!c.in2) throw new Error('Choose the small video (or a picture).');
      const pw = even(((p.w || 1280) * +o.pipSize) / 100), m = Math.round((p.w || 1280) * 0.03);
      const fc = `[1:v]scale=${pw}:-2[p];[0:v][p]overlay=${CORNER[o.pipPos](m)}:eof_action=pass,format=yuv420p[v]`;
      return { args: [...I, '-i', c.in2, '-filter_complex', fc, '-map', '[v]', '-map', '0:a?', ...X264(21), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- speed
    case 'speed': {
      const x = +o.speed, at: string[] = []; let r = x;
      while (r > 2) { at.push('atempo=2'); r /= 2; } while (r < 0.5) { at.push('atempo=0.5'); r /= 0.5; } at.push(`atempo=${+r.toFixed(4)}`);
      if (isAudio) { needAudio(p); const [ext, enc] = audioOut(base === 'mp3' ? 'mp3' : 'm4a', p.channels, p.layout); return { args: [...I, '-af', at.join(','), ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      if (!p.audio) return { args: [...I, '-vf', `setpts=PTS/${x}`, ...X264(21), 'out.mp4'], outputs: ['out.mp4'] };
      return { args: [...I, '-filter_complex', `[0:v]setpts=PTS/${x}[v];[0:a]${at.join(',')}[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', ...aacArgs(160, p.channels, p.layout), 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'timelapse': {
      needVideo(p);
      const x = +o.tlx;
      if (p.dur && p.dur / x < 0.5) throw new Error(`At ${x}× this ${fmtS(p.dur)} s video would last under half a second — choose a slower speed.`);
      return { args: [...I, '-vf', `setpts=PTS/${x},fps=30`, '-an', ...X264(21), 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- sound
    case 'volume': {
      needAudio(p);
      const af = `volume=${o.vol}`;
      if (isAudio) { const [ext, enc] = audioOut(base, p.channels, p.layout); return { args: [...I, '-af', af, ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      const ext = videoOutExt(base);
      return { args: [...I, '-af', af, '-c:v', 'copy', ...reAudioFor(ext, p.channels, p.layout), `out.${ext}`], outputs: [`out.${ext}`] };
    }
    case 'loudnorm': {
      needAudio(p);
      const out = isAudio ? `out.${base === 'mp3' ? 'mp3' : 'm4a'}` : 'out.mp4';
      const a = out.endsWith('mp3') ? ['-c:a', 'libmp3lame', '-q:a', '2'] : aacArgs(192, p.channels, p.layout);
      return { args: [...I, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', ...(isAudio ? ['-vn'] : ['-c:v', 'copy']), ...a, '-ar', '48000', out], outputs: [out] };
    }
    case 'silence': {
      needAudio(p);
      const L = `${o.silLevel}dB`;
      const af = o.silWhere === 'ends'
        ? `silenceremove=start_periods=1:start_threshold=${L}:start_silence=0.1,areverse,silenceremove=start_periods=1:start_threshold=${L}:start_silence=0.1,areverse`
        : `silenceremove=start_periods=1:start_threshold=${L}:start_silence=0.1:stop_periods=-1:stop_duration=${o.silMin}:stop_threshold=${L}:stop_silence=0.25`;
      const [ext, enc] = audioOut(isAudio ? base : 'm4a', p.channels, p.layout);
      return { args: [...I, '-vn', '-af', af, ...enc, `out.${ext}`], outputs: [`out.${ext}`] };
    }
    case 'merge': {
      if (!c.in2) throw new Error('Choose the audio file to add.');
      if (c.p2 && !c.p2.audio) throw new Error('The second file has no sound.');
      if (o.mergeMode === 'mix') {
        if (!p.audio) throw new Error('This file has no sound to put the music under — choose "Replace the sound".');
        // both brought to one layout before they are mixed — the file's own (mono when both are mono), a mono one on both
        // sides at full level (amix took FFmpeg's upmix: a mono voice under stereo music came out 3 dB lower)
        const m = c.p2?.channels || 2, outCh = p.channels === 1 && m === 1 ? 1 : p.channels > 2 && [6, 8].includes(p.channels) ? p.channels : 2;
        const ly = ({ 1: 'mono', 2: 'stereo', 6: '5.1', 8: '7.1' } as Record<number, string>)[outCh];
        const fc = `[0:a]${upmix(p.channels, ly)}aformat=channel_layouts=${ly}[s];[1:a]volume=${fmtS(+o.musicVol / 100)},${upmix(m, ly)}aformat=channel_layouts=${ly}[m];[s][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
        if (isAudio) { const [ext, enc] = audioOut(base, outCh); return { args: [...I, '-stream_loop', '-1', '-i', c.in2, '-filter_complex', fc, '-map', '[a]', ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
        return { args: [...I, '-stream_loop', '-1', '-i', c.in2, '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', ...aacArgs(192, outCh), 'out.mp4'], outputs: ['out.mp4'] };
      }
      needVideo(p);
      return { args: [...I, '-i', c.in2, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', ...aacArgs(192, c.p2?.channels || 2, c.p2?.layout || ''), '-shortest', 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'sound': {
      needAudio(p);
      const want = o.channels === 'keep' ? 0 : +o.channels, from = p.channels, ar = o.rate === 'keep' ? [] : ['-ar', o.rate];
      // stereo: a mono sound on both sides at full level (FFmpeg's -ac 2 put it 3 dB lower on each), more channels mixed
      // down as players do (-ac 2); mono: the average of the two sides
      const ch = !want || want === from ? [] : want === 1 ? ['-af', toMono(from)] : from === 1 ? ['-af', 'pan=stereo|c0=c0|c1=c0'] : ['-ac', '2'];
      if (!ch.length && !ar.length) throw new Error(want ? `The sound is already ${want === 1 ? 'mono' : 'stereo'} — choose the other, or a sample rate.` : 'Choose mono or stereo, or a sample rate — this would change nothing.');
      const outCh = want || from, ly = want ? '' : p.layout;
      if (isAudio) { const [ext, enc] = audioOut(base, outCh, ly); return { args: [...I, ...ch, ...ar, ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      const ext = videoOutExt(base);
      return { args: [...I, '-c:v', 'copy', ...ch, ...ar, ...reAudioFor(ext, outCh, ly), `out.${ext}`], outputs: [`out.${ext}`] };
    }
    // ---------------------------------------------------------------- subtitles
    case 'subBurn': {
      needVideo(p);
      let vf: string;
      if (c.in2) {
        if (!SUB_EXT.test(c.ext2 || '')) throw new Error('The subtitle file must be .srt, .vtt, .ass or .ssa.');
        // this FFmpeg has no system fonts: subtitles that name another font (Arial, an .ass file's own) would draw nothing
        vf = `subtitles=filename=/in/${c.in2}:fontsdir=/fonts:force_style='${/^(srt|vtt)$/.test(c.ext2!) ? 'FontName=Noto Sans,FontSize=20,Outline=2' : 'FontName=Noto Sans'}'`;
      } else {
        if (!p.subs) throw new Error('Choose a subtitle file (.srt, .vtt, .ass) — this video has no subtitle track of its own.');
        if (BITMAP_SUBS.test(p.scodec)) throw new Error('This video\'s subtitles are pictures (DVD / Blu-ray), which this build cannot burn in — choose a subtitle file.');
        vf = `subtitles=filename=/in/${c.in1}:si=0:fontsdir=/fonts:force_style='${/^(ass|ssa)$/.test(p.scodec) ? 'FontName=Noto Sans' : 'FontName=Noto Sans,FontSize=20,Outline=2'}'`;
      }
      return { args: [...I, '-vf', vf, ...X264(20), ...ACOPY(p), 'out.mp4'], outputs: ['out.mp4'], fonts: true };
    }
    case 'subAdd': {
      needVideo(p);
      if (!c.in2) throw new Error('Choose the subtitle file (.srt, .vtt, .ass).');
      if (!SUB_EXT.test(c.ext2 || '')) throw new Error('The subtitle file must be .srt, .vtt, .ass or .ssa.');
      const mkv = base === 'mkv', out = mkv ? 'out.mkv' : 'out.mp4';
      return { args: [...I, '-i', c.in2, '-map', '0:v', '-map', '0:a?', '-map', '1:0', '-c:v', 'copy', ...(mkv ? ['-c:a', 'copy'] : ACOPY(p)), '-c:s', mkv ? (/^(ass|ssa)$/.test(c.ext2!) ? 'ass' : 'srt') : 'mov_text', '-metadata:s:s:0', `language=${o.subLang}`, out], outputs: [out] };
    }
    case 'subExtract': {
      if (!p.subs) throw new Error('This file has no subtitle track.');
      if (BITMAP_SUBS.test(p.scodec)) throw new Error('These subtitles are pictures (DVD / Blu-ray) — they cannot be saved as text.');
      const codec = ({ srt: 'srt', vtt: 'webvtt', ass: 'ass' } as Record<string, string>)[o.subFmt];
      return { args: [...I, '-map', '0:s:0', '-c:s', codec, `subtitles.${o.subFmt}`], outputs: [`subtitles.${o.subFmt}`] };
    }
    case 'raw': {
      const args = (String(o.raw).match(/"[^"]*"|'[^']*'|\S+/g) || []).map((a) => a.replace(/^["']|["']$/g, ''));
      if (args[0] === 'ffmpeg') args.shift();
      const out = args[args.length - 1];
      // this core's JPEG encoder (mjpeg) overflows a buffer when it spends many bits on a block — -q:v 3 on a 640 × 360
      // frame, -q:v 4 on a detailed one — and takes the whole page down with it: no JPEG from FFmpeg here
      const mjpeg = args.some((a, i) => /^-(c|codec|vcodec)(:v)?$/.test(a) && /^mjpeg$/i.test(args[i + 1] || ''));
      if (mjpeg || args.some((a, i) => i > 0 && !/^-/.test(args[i - 1] || '-') && /\.(jpe?g|mjpe?g)$/i.test(a)) || /\.(jpe?g|mjpe?g)$/i.test(out || ''))
        throw new Error('This FFmpeg build can crash the page while writing JPEG — write .png instead, or use "Picture at a moment" or "Extract frames", which make their JPEGs with MozJPEG.');
      // its Opus encoder crashes on two channels and more at the default complexity (OPUS_SAFE): a command that makes
      // Opus — named, or a .webm / .opus output without an audio codec of its own — and sets no complexity gets 4
      const codec = (i: number) => /^-(c|codec|acodec)(:a)?(:\d+)?$/.test(args[i]) && i + 1 < args.length;
      const opus = args.some((a, i) => codec(i) && /^libopus$/i.test(args[i + 1]))
        || (/\.(webm|opus)$/i.test(out || '') && !args.includes('-an') && !args.some((a, i) => codec(i)));
      if (opus && out && !args.some((a) => /^-compression_level(:a)?(:\d+)?$/.test(a))) args.splice(args.length - 1, 0, ...OPUS_SAFE);
      return { args, outputs: out && !out.startsWith('-') && !/^in\d+\./.test(out) ? [out] : [] };
    }
  }
}

/** The second file each job asks for (null: none). */
export function secondFor(job: Job, o: Record<string, any>): { label: string; accept: string; optional?: boolean } | null {
  if (job === 'merge') return { label: o.mergeMode === 'mix' ? 'Choose the music' : 'Choose the audio file', accept: 'audio/*,video/*' };
  if (job === 'audio2mp4' && o.a2m === 'still') return { label: 'Choose a picture (optional)', accept: 'image/*', optional: true };
  if (job === 'logo') return { label: 'Choose the logo picture', accept: 'image/*' };
  if (job === 'pip') return { label: 'Choose the small video (or a picture)', accept: 'video/*,image/*' };
  if (job === 'subBurn') return { label: 'Choose the subtitle file (.srt, .vtt, .ass) — or none to use the video\'s own', accept: '.srt,.vtt,.ass,.ssa', optional: true };
  if (job === 'subAdd') return { label: 'Choose the subtitle file (.srt, .vtt, .ass)', accept: '.srt,.vtt,.ass,.ssa' };
  return null;
}
