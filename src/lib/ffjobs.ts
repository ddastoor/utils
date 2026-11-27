// FFmpeg tab: the jobs as FFmpeg arguments. Pure functions (no DOM), so the unit suite checks every job's command and
// every refusal; the tab (src/tools/ffmpeg.ts) runs them on ffmpeg.wasm and the e2e suite checks the files they make.
// Inputs are named in1.<ext>, in2.<ext> … (the tab mounts them at /in/ and maps those names); a filter that names a
// file itself writes the /in/ path. Text files a job needs (a concat list, a subtitle script) are in `writes`.

export type Job =
  | 'convert' | 'remux' | 'audio' | 'mute' | 'thumb' | 'frames' | 'sheet' | 'scenes' | 'gif' | 'sticker' | 'audio2mp4'
  | 'trim' | 'cutout' | 'join' | 'transitions' | 'split' | 'loop' | 'reverse'
  | 'compress' | 'resize' | 'crop' | 'bars' | 'fit' | 'rotate' | 'fps' | 'v360'
  | 'colours' | 'hdr' | 'stabilise' | 'denoise' | 'deinterlace' | 'delogo' | 'fade' | 'text' | 'logo' | 'pip'
  | 'chroma' | 'stack' | 'trails' | 'visualiser' | 'soundpic'
  | 'speed' | 'slowmo' | 'timelapse'
  | 'volume' | 'loudnorm' | 'evenout' | 'silence' | 'sync' | 'side' | 'hum' | 'bleep' | 'sfx' | 'merge' | 'sound'
  | 'subBurn' | 'subAdd' | 'subExtract'
  | 'analyse' | 'meta'
  | 'raw';

export const JOB_GROUPS: Array<[string, Array<[Job, string]>]> = [
  ['Convert and extract', [['convert', 'Convert format'], ['remux', 'MKV → MP4 at once (no re-encoding)'], ['audio', 'Extract audio'], ['mute', 'Remove audio'], ['thumb', 'Picture at a moment (thumbnail)'], ['frames', 'Extract frames'], ['sheet', 'Contact sheet (grid of frames)'], ['scenes', 'Scene finder (a picture per scene)'], ['gif', 'Video → GIF'], ['sticker', 'Animated WhatsApp sticker'], ['audio2mp4', 'Audio → MP4 video']]],
  ['Cut and join', [['trim', 'Trim / cut'], ['cutout', 'Cut a part out'], ['join', 'Join clips'], ['transitions', 'Join clips with transitions'], ['split', 'Split into equal parts'], ['loop', 'Loop / boomerang'], ['reverse', 'Reverse']]],
  ['Size and shape', [['compress', 'Compress video'], ['resize', 'Resize'], ['crop', 'Crop'], ['bars', 'Remove black bars'], ['fit', 'Fit to a shape (blurred background or bars)'], ['rotate', 'Rotate / flip'], ['fps', 'Frame rate'], ['v360', '360° or wide-lens video → a normal view']]],
  ['Picture', [['colours', 'Colours (brightness, contrast, black and white)'], ['hdr', 'HDR (iPhone, Android) → normal colours'], ['stabilise', 'Stabilise a shaky video'], ['denoise', 'Clean up a grainy video'], ['deinterlace', 'Deinterlace (old camcorder / TV)'], ['delogo', 'Remove a logo or date stamp'], ['fade', 'Fade in / fade out'], ['text', 'Text on the video'], ['logo', 'Logo on the video'], ['pip', 'Picture-in-picture']]],
  ['Effects', [['chroma', 'Green screen'], ['stack', 'Split screen, grid, before / after'], ['trails', 'Light trails / motion blur'], ['visualiser', 'Music visualiser video'], ['soundpic', 'The sound as a picture (waveform, spectrogram)']]],
  ['Speed', [['speed', 'Speed up / slow down'], ['slowmo', 'Smooth slow motion'], ['timelapse', 'Timelapse (8× – 60×)']]],
  ['Sound', [['volume', 'Volume'], ['loudnorm', 'Normalise loudness'], ['evenout', 'Even out a lecture or meeting'], ['silence', 'Remove silence'], ['sync', 'Sound out of step with the picture'], ['side', 'Voice on one side only (left / right)'], ['hum', 'Remove mains hum (50 / 60 Hz)'], ['bleep', 'Bleep a word'], ['sfx', 'Sound effects (8D, slowed + reverb, bass, phone …)'], ['merge', 'Add audio / background music'], ['sound', 'Sound settings (mono, stereo, sample rate)']]],
  ['Subtitles', [['subBurn', 'Burn in subtitles'], ['subAdd', 'Add subtitles as a track'], ['subExtract', 'Extract subtitles']]],
  ['Information and privacy', [['analyse', 'Analyse a file (loudness, black, silence, frozen)'], ['meta', 'Remove location and metadata']]],
  ['Expert', [['raw', 'Your own arguments']]],
];
export const JOBS: Array<[Job, string]> = JOB_GROUPS.flatMap(([, j]) => j);

/** One stream of a file as `ffmpeg -i` lists it (kind, codec, its tag — "hvc1", "tmcd" —, a cover picture, language,
 *  the channels of a sound, its title). */
export interface Stream { kind: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment'; codec: string; tag: string; pic: boolean; lang: string; ch: number; layout: string; title: string }
/** What FFmpeg says about a file (`ffmpeg -i`): the first picture's and the first sound's details, every stream, the
 *  metadata as [where — '' for the file, "stream 2", "chapter 1" —, key, value], the chapters; the picture's colours
 *  (pix: its pixel format; trc / prim / matrix: transfer, primaries, matrix — HDR is trc arib-std-b67 (HLG) or smpte2084
 *  (PQ)), the Dolby Vision profile (0: none) and the display rotation. */
export interface Probe {
  dur: number; w: number; h: number; fps: number; video: boolean; vcodec: string; audio: boolean; acodec: string; rate: number; channels: number; layout: string; subs: number; scodec: string;
  pix: string; trc: string; prim: string; matrix: string; dovi: number; rot: number; streams: Stream[]; meta: Array<[string, string, string]>; chapters: number;
}
export const EMPTY_PROBE: Probe = { dur: 0, w: 0, h: 0, fps: 0, video: false, vcodec: '', audio: false, acodec: '', rate: 0, channels: 0, layout: '', subs: 0, scodec: '', pix: '', trc: '', prim: '', matrix: '', dovi: 0, rot: 0, streams: [], meta: [], chapters: 0 };
/** The channels of FFmpeg's layout names (`ffmpeg -layouts`). */
const LAYOUT_CH: Record<string, number> = {
  mono: 1, stereo: 2, '2.1': 3, '3.0': 3, '3.0(back)': 3, '4.0': 4, quad: 4, 'quad(side)': 4, '3.1': 4, '5.0': 5, '5.0(side)': 5, '4.1': 5,
  '5.1': 6, '5.1(side)': 6, '6.0': 6, '6.0(front)': 6, hexagonal: 6, '6.1': 7, '6.1(back)': 7, '6.1(front)': 7, '7.0': 7, '7.0(front)': 7,
  '7.1': 8, '7.1(wide)': 8, '7.1(wide-side)': 8, octagonal: 8, downmix: 2,
};
/** "a (b, c), d(e, f), g" → ["a (b, c)", "d(e, f)", "g"]: commas inside brackets do not split. */
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** The names of colour spaces that FFmpeg prints alone when matrix, primaries and transfer share it ("yuv420p(tv, bt709)"). */
const ONE_COLOUR = /^(bt709|smpte170m|smpte240m|bt470bg|bt2020nc|bt2020c|fcc|ycgco|gbr|unknown)$/;
export function parseProbe(log: string): Probe {
  const p: Probe = { ...EMPTY_PROBE, streams: [], meta: [] };
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  if (d) p.dur = +d[1] * 3600 + +d[2] * 60 + +d[3];
  let where = '', metaIndent = -1, last = -1;
  for (const line of log.split('\n')) {
    const ind = line.length - line.trimStart().length;
    // the entries of a "Metadata:" block are indented under it; "                  : more" continues the value before
    if (metaIndent >= 0) {
      if (ind > metaIndent && line.trim()) {
        const cont = /^\s+: (.*)$/.exec(line);
        if (cont && last >= 0) { p.meta[last][2] += `\n${cont[1].trim()}`; continue; }
        const kv = /^\s+(\S.*?)\s*: (.*)$/.exec(line);
        if (kv) { p.meta.push([where, kv[1], kv[2].trim()]); last = p.meta.length - 1; continue; }
      }
      metaIndent = -1; last = -1;
    }
    if (/^\s*Metadata:\s*$/.test(line)) { metaIndent = ind; continue; }
    if (/^Input #/.test(line)) { where = ''; continue; }
    const chap = /^\s*Chapter #\d+:(\d+)/.exec(line);
    if (chap) { p.chapters++; where = `chapter ${+chap[1] + 1}`; continue; }
    const rot = /displaymatrix: rotation of (-?[\d.]+) degrees/.exec(line);
    if (rot) { if (where === `stream ${p.streams.findIndex((x) => x.kind === 'video' && !x.pic)}`) p.rot = +rot[1]; continue; }
    const dv = /DOVI configuration record:.*?profile: (\d+)/.exec(line);
    if (dv) { p.dovi = +dv[1]; continue; }
    const s = /Stream #\d+:(\d+)(\S*?): (Video|Audio|Subtitle|Data|Attachment): (\w+)(.*)$/.exec(line);
    if (!s) continue;
    const kind = s[3].toLowerCase() as Stream['kind'], rest = s[5], st: Stream = { kind, codec: s[4], tag: /\((\w{4}) \/ 0x/.exec(rest)?.[1] ?? '', pic: /attached pic/.test(line), lang: /\(([a-z]{2,3})\)$/.exec(s[2])?.[1] ?? '', ch: 0, layout: '', title: '' };
    where = `stream ${p.streams.length}`;
    p.streams.push(st);
    if (kind === 'video' && !st.pic && !p.video) {
      p.video = true; p.vcodec = s[4];
      const wh = /, (\d{2,5})x(\d{2,5})[ ,]/.exec(line); if (wh) { p.w = +wh[1]; p.h = +wh[2]; }
      const f = /, ([\d.]+) (fps|tbr)/.exec(line); if (f) p.fps = +f[1];
      // "hevc (Main 10) (hvc1 / 0x…), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67, progressive), 640x360 …"
      const pf = /^(\w+)(?:\((.*)\))?$/.exec(splitTop(rest.replace(/^[^,]*?(?=,|$)/, '')).find((x) => /^\w+(\(|$)/.test(x) && !/^\d/.test(x)) ?? '');
      if (pf) {
        p.pix = pf[1];
        for (const item of (pf[2] ?? '').split(',').map((x) => x.trim())) {
          if (item.includes('/')) { [p.matrix, p.prim, p.trc] = item.split('/'); break; }
          if (ONE_COLOUR.test(item)) { p.matrix = p.prim = p.trc = item; break; }
        }
      }
    } else if (kind === 'audio') {
      st.layout = /, \d+ Hz, ([^,]+)/.exec(line)?.[1].trim() ?? '';
      st.ch = LAYOUT_CH[st.layout] ?? (/^(\d+) channels/.test(st.layout) ? +/^(\d+)/.exec(st.layout)![1] : 0);
      if (!p.audio) {
        p.audio = true; p.acodec = s[4];
        const r = /, (\d+) Hz/.exec(line); if (r) p.rate = +r[1];
        // "…, 48000 Hz, 5.1(side), fltp, …": the layout as FFmpeg names it ("6 channels" when it knows none)
        p.layout = st.layout; p.channels = st.ch;
      }
    } else if (kind === 'subtitle') { if (!p.subs) p.scodec = s[4]; p.subs++; }
  }
  // a stream's title (an OBS track named "Mic") from its metadata
  for (const [w, k, v] of p.meta) { const m = /^stream (\d+)$/.exec(w); if (m && /^title$/i.test(k)) p.streams[+m[1]].title = v; }
  return p;
}

export interface JobCtx {
  in1: string; in2?: string; ins?: string[];  // file names inside FFmpeg (ins: the clips of a join, in order)
  p: Probe; p2?: Probe; ps?: Probe[];           // what FFmpeg said about them
  ext: string; ext2?: string;                    // extensions of the two files (lower case)
}
/** jpeg: the PNG outputs are to be made JPEG by MozJPEG (this core's own JPEG encoder overflows a buffer at high
 *  quality — `-q:v 3` and below on a 640 × 360 frame crash the page — so FFmpeg writes PNG here). */
export interface Built {
  args: string[]; outputs: string[]; pattern?: RegExp; writes?: Array<[string, string]>; fonts?: boolean; zip?: string; jpeg?: boolean;
  /** `args` only measure (its output is FFmpeg's null muxer): the job is what then(log) gives — or a refusal, a sentence */
  then?: (log: string) => Built;
  /** the command `then` will give, for the command box — what the first command finds in capitals (W:H:X:Y) */
  preview?: string[];
  /** the outputs' names from the log: the scene finder names each picture by its time */
  names?: (made: string[], log: string) => string[];
  /** a report made from the log, shown in the page and saved as .txt (Analyse a file); the job has no output file */
  report?: (log: string) => string;
  /** after a run, by the size of what it made: the next try (the sticker: lower quality, fewer pictures a second), or a
   *  sentence to show with the result (no try left), or null — done */
  next?: (bytes: number) => Built | string | null;
  /** said under the result ("the mains hum at 50.05 Hz", "the loudness matched: −2.1 dB") */
  note?: string;
}
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
export const aacArgs = (kbps: number, ch = 2, layout = '') => ['-c:a', 'aac', '-b:a', kbpsFor(kbps, ch), ...layoutFix(AAC_LAYOUT, ch, layout)];
/** Opus, likewise. **The Opus encoder of this build (libopus 1.3.1 in ffmpeg.wasm 0.12) crashes on two channels and
 *  more** — "memory access out of bounds" at the first frame, with 20 ms frames (and 40, 60) and complexity 5 and above,
 *  which turn on its pitch pre-filter and its late transient check — so they are made at complexity 4, which a
 *  noise-to-mask measure put level with the default at these bitrates (docs/BUGHUNT.md); one channel keeps the default. */
export const OPUS_SAFE = ['-compression_level:a', '4'];
export const opusArgs = (kbps: number, ch = 2, layout = '') => ['-c:a', 'libopus', '-b:a', kbpsFor(kbps, ch), ...(ch === 1 ? [] : OPUS_SAFE), ...layoutFix(OPUS_LAYOUT, ch, layout)];
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
/** The file a sound is kept in as it is (no re-encoding): AAC in .m4a, Opus and Vorbis in .ogg …, else Matroska audio. */
export const keptAudioExt = (p: Probe) => AUDIO_EXT[p.acodec] || 'mka';
/** MP3 by LAME at `q`: "v2" — LAME's VBR -V 2, its recommended setting (≈ 190 kb/s) — or a constant 128 / 192 / 320 kb/s. */
export const mp3Args = (q = 'v2') => ['-c:a', 'libmp3lame', ...(/^(128|192|320)$/.test(q) ? ['-b:a', `${q}k`] : ['-q:a', '2'])];
/** "Download as MP3" on an extracted sound (to-do #22): that file made MP3, at the quality chosen for MP3. */
export const mp3Of = (input: string, q = 'v2'): Built => ({ args: ['-i', input, '-vn', ...mp3Args(q), 'mp3.mp3'], outputs: ['mp3.mp3'] });
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
  channels: 'keep', rate: 'keep', subLang: 'eng', subFmt: 'srt', mp3q: 'v2',
  // to-do #32
  scSens: 'medium', stStart: '0', stLen: '3', stFill: 'crop', xfType: 'fade', xfLen: '1', v360In: 'equirect', v360Out: 'flat', yaw: '0', pitch: '0', fov: '90',
  lens: 'medium', lgX: '', lgY: '', lgW: '', lgH: '', lgAt: '1', keyColour: 'green', keyCustom: '#00ff00', keySim: 15, keyBlend: 8, stackLayout: 'side', stackSound: '1',
  trailKind: 'trails', trailLen: 'medium', visStyle: 'bars', picKind: 'wave', smX: '2', smSound: 'slow', evenHow: 'moment', syncDir: 'earlier', syncAmt: '200',
  syncUnit: 'ms', sideWhich: 'auto', humHz: '50', bleepAt: '', bleepKind: 'beep', sfx: '8d', anWhat: 'all',
};

const needVideo = (p: Probe) => { if (!p.video) throw new Error('This task needs a video — this file has no picture.'); };
const needAudio = (p: Probe) => { if (!p.audio) throw new Error('This task needs sound — this file has none.'); };
const needDur = (p: Probe) => { if (!(p.dur > 0)) throw new Error('FFmpeg could not tell how long this file is.'); };

// ---------------------------------------------------------------- to-do #32: what the 22 jobs share
const minus = (x: number, d = 1) => (x === -Infinity ? '−∞' : `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`);
/** m:ss.ss — the times of reports and names */
export function clock(t: number) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; }
const num = (v: string) => +String(v ?? '').trim().replace(',', '.');
/** The integrated loudness (LUFS), loudness range (LU) and true peak (dBTP) of every ebur128 of a log, in the order of
 *  the filters in the graph — the last summary of each (FFmpeg 5.1 configures a graph twice: the first prints −70). */
export function loudnessOf(log: string): Array<{ i: number; lra: number; peak: number }> {
  const by = new Map<number, { i: number; lra: number; peak: number }>();
  let cur: { i: number; lra: number; peak: number } | null = null;
  const val = (s: string) => (/^-inf$/.test(s) ? -Infinity : +s);
  for (const line of log.split('\n')) {
    const h = /\[Parsed_ebur128_(\d+) @ [^\]]*\] Summary:/.exec(line);
    if (h) { cur = { i: NaN, lra: NaN, peak: NaN }; by.set(+h[1], cur); continue; }
    if (!cur) continue;
    if (/^\[/.test(line)) { cur = null; continue; }
    const i = /^\s+I:\s+(-?[\d.]+|-inf) LUFS/.exec(line); if (i) cur.i = val(i[1]);
    const r = /^\s+LRA:\s+([\d.]+) LU\b/.exec(line); if (r) cur.lra = +r[1];
    const k = /^\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(line); if (k) cur.peak = val(k[1]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}
/** astats' RMS levels (dB) of a log by filter, in graph order: per channel and overall (the last report of each). */
export function rmsOf(log: string): Array<{ ch: number[]; overall: number }> {
  const by = new Map<number, { ch: number[]; overall: number; at: number }>();
  for (const line of log.split('\n')) {
    const m = /\[Parsed_astats_(\d+) @ [^\]]*\] (Channel: (\d+)|Overall|RMS level dB: (-?[\d.]+|-inf))/.exec(line);
    if (!m) continue;
    const e = by.get(+m[1]) ?? { ch: [], overall: NaN, at: 0 }; by.set(+m[1], e);
    if (m[3]) e.at = +m[3]; else if (m[2] === 'Overall') e.at = 0;
    else if (m[4]) { const v = m[4] === '-inf' ? -Infinity : +m[4]; if (e.at) e.ch[e.at - 1] = v; else e.overall = v; }
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => ({ ch: v.ch, overall: v.overall }));
}
/** The black, silent and frozen stretches a log reports ([start, end]; Infinity: to the end of the file). */
export function stretchesOf(log: string) {
  const black: Array<[number, number]> = [], silence: Array<[number, number]> = [], freeze: Array<[number, number]> = [];
  let s0 = NaN, f0 = NaN;
  for (const line of log.split('\n')) {
    const b = /black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)/.exec(line); if (b) black.push([+b[1], +b[2]]);
    const ss = /silence_start: (-?[\d.]+)/.exec(line); if (ss) s0 = Math.max(0, +ss[1]);
    const se = /silence_end: (-?[\d.]+)/.exec(line); if (se && Number.isFinite(s0)) { silence.push([s0, +se[1]]); s0 = NaN; }
    const fs = /freeze_start: (-?[\d.]+)/.exec(line); if (fs) f0 = +fs[1];
    const fe = /freeze_end: (-?[\d.]+)/.exec(line); if (fe && Number.isFinite(f0)) { freeze.push([f0, +fe[1]]); f0 = NaN; }
  }
  if (Number.isFinite(s0)) silence.push([s0, Infinity]);
  if (Number.isFinite(f0)) freeze.push([f0, Infinity]);
  return { black, silence, freeze };
}
/** "Analyse a file": what the log found, as text to read and copy. */
export function analyseReport(log: string, p: Probe): string {
  const L = loudnessOf(log).pop(), { black, silence, freeze } = stretchesOf(log), out: string[] = [];
  out.push(`Length ${clock(p.dur)}${p.video ? ` · picture ${p.w} × ${p.h}${p.fps ? ` at ${p.fps} frames a second` : ''}` : ''}${p.audio ? ` · sound ${p.layout || `${p.channels} channels`} at ${p.rate} Hz` : ''}`);
  if (p.audio) {
    out.push('', 'Loudness (EBU R128; a mono sound as heard on two speakers)');
    if (!L || !Number.isFinite(L.i) || L.i <= -70) out.push('  The sound is silent — nothing to measure.');
    else {
      out.push(`  Integrated loudness: ${minus(L.i)} LUFS — streaming services play at about −14 to −16 LUFS, broadcast at −23`);
      out.push(`  Loudness range: ${L.lra.toFixed(1)} LU — how much the level moves (speech about 5 – 10, a film up to 20)`);
      out.push(`  True peak: ${minus(L.peak)} dBTP${L.peak > -1 ? ' — above −1 dBTP: it can distort when it is made MP3 or AAC' : ''}`);
    }
  }
  const list = (title: string, st: Array<[number, number]>) => {
    out.push('', title);
    if (!st.length) out.push('  none');
    for (const [a, b] of st) out.push(`  ${clock(a)} – ${b === Infinity ? `${clock(p.dur)} (the end)` : clock(b)}   ${((b === Infinity ? p.dur : b) - a).toFixed(2)} s`);
  };
  if (p.video) { list('Black picture (nearly black, 0.5 s and longer)', black); list('Frozen picture (2 s and longer)', freeze); }
  if (p.audio) list('Silence (below −50 dB, 0.5 s and longer)', silence);
  return out.join('\n');
}
/** The metadata a file carries that says where, when, with what or by whom — not the container's own technical entries.
 *  [group, what it is, where it is ('' — the file, "stream 1" …)] */
const GENERIC_HANDLER = /^((Video|Sound|Subtitle|Data|Text|TimeCode|Hint)Handler|)$/;
export function personalMeta(p: Probe): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const [w, k, v] of p.meta) {
    if (/^(major_brand|minor_version|compatible_brands|duration|mimetype|filename|language)$/i.test(k)) continue;
    if (/^handler_name$/i.test(k) && GENERIC_HANDLER.test(v)) continue;
    if (/^vendor_id$/i.test(k) && /^(\[0\]){4}$|^FFMP$/.test(v)) continue;
    const iso = /([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\/?$/.exec(v);
    const group = /location|iso6709|xyz|gps|latitude|longitude/i.test(k) ? 'Place'
      : /creation|date|^time|timecode|year/i.test(k) ? 'Date and time'
      : /make|model|manufacturer|software|version|encoder|vendor|handler|device|firmware|com\.(apple|android|samsung)/i.test(k) ? 'Device and software'
      : 'Names and notes';
    const shown = group === 'Place' && iso ? `${Math.abs(+iso[1]).toFixed(4)}° ${+iso[1] < 0 ? 'S' : 'N'}, ${Math.abs(+iso[2]).toFixed(4)}° ${+iso[2] < 0 ? 'W' : 'E'}${iso[3] ? `, ${Math.round(+iso[3])} m` : ''}` : v.replace(/\n/g, ' ');
    out.push([group, `${k}: ${shown}`, w]);
  }
  return out;
}
/** What else a file holds that is not picture, sound or subtitles: data tracks (a phone's or a camera's sensors and GPS, a
 *  timecode) and attachments. */
const DATA_TAGS: Record<string, string> = { gpmd: 'GoPro\'s sensor and GPS track', mebx: 'Apple\'s frame-by-frame metadata', djmd: 'DJI\'s flight data (GPS)', dbgi: 'DJI\'s debug data', tmcd: 'a timecode (the time of day it was filmed)', text: 'a text track (chapters)', rtmd: 'Sony\'s real-time metadata', camm: 'camera motion data' };
export function otherTracks(p: Probe): string[] {
  return p.streams.filter((s) => s.kind === 'data' || s.kind === 'attachment' || s.pic).map((s) => (s.pic ? 'a cover picture' : s.kind === 'attachment' ? `an attachment (${s.codec})` : `a data track: ${DATA_TAGS[s.tag] ?? s.tag ?? s.codec}`));
}

const CODEC_NAME: Record<string, string> = { h264: 'H.264', hevc: 'H.265 (HEVC)', av1: 'AV1', vp9: 'VP9', vp8: 'VP8', mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2', mpeg1video: 'MPEG-1', theora: 'Theora', prores: 'ProRes', mjpeg: 'Motion JPEG',
  aac: 'AAC', mp3: 'MP3', ac3: 'AC-3 (Dolby Digital)', eac3: 'E-AC-3 (Dolby Digital Plus)', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', alac: 'ALAC', dts: 'DTS', truehd: 'TrueHD', mp2: 'MP2',
  subrip: 'SRT', ass: 'ASS', ssa: 'SSA', webvtt: 'WebVTT', mov_text: 'MP4 text', hdmv_pgs_subtitle: 'PGS (Blu-ray pictures)', dvd_subtitle: 'DVD (pictures)', dvb_subtitle: 'DVB (pictures)' };
const codecName = (c: string) => CODEC_NAME[c] ?? (/^pcm_/.test(c) ? 'PCM (uncompressed)' : c);
const MP4_VIDEO = /^(h264|hevc|av1|vp9|mpeg4|mpeg2video|mpeg1video)$/, MP4_AUDIO = /^(aac|mp3|ac3|eac3|alac)$/, TEXT_SUBS = /^(subrip|srt|ass|ssa|webvtt|mov_text|text)$/;
/** "MKV → MP4 at once": what is copied, what is made AAC or mov_text, what an MP4 cannot hold — and the arguments. */
export function remuxPlan(p: Probe): { args: string[]; lines: string[] } {
  const v = p.streams.filter((s) => s.kind === 'video' && !s.pic);
  if (!v.length) throw new Error('This file has no picture — "Convert format → M4A" makes its sound an M4A.');
  if (!MP4_VIDEO.test(v[0].codec)) throw new Error(`The picture (${codecName(v[0].codec)}) cannot go into an MP4 as it is — "Convert format → MP4" re-encodes it.`);
  const args = ['-map', '0:V:0', '-c:v', 'copy', ...(v[0].codec === 'hevc' ? ['-tag:v', 'hvc1'] : [])];
  const lines = [`Picture: ${codecName(v[0].codec)}${p.w ? ` ${p.w} × ${p.h}` : ''} — copied`];
  if (v.length > 1) lines.push(`${v.length - 1} more picture track${v.length > 2 ? 's' : ''} — left out (an MP4 player shows one)`);
  p.streams.filter((s) => s.kind === 'audio').forEach((s, k) => {
    const name = `Sound ${k + 1}${s.title ? ` “${s.title}”` : ''}${s.lang && s.lang !== 'und' ? ` (${s.lang})` : ''}: ${codecName(s.codec)}${s.layout ? ` ${s.layout}` : ''}`;
    args.push('-map', `0:a:${k}`);
    if (MP4_AUDIO.test(s.codec)) { args.push(`-c:a:${k}`, 'copy'); lines.push(`${name} — copied`); return; }
    const ch = s.ch || 2, lay = AAC_LAYOUT[ch];
    args.push(`-c:a:${k}`, 'aac', `-b:a:${k}`, kbpsFor(160, ch), ...(lay && s.layout && s.layout !== lay ? [`-ch_layout:a:${k}`, lay] : []));
    lines.push(`${name} — made AAC ${kbpsFor(160, ch).replace('k', ' kb/s')} (an MP4 that plays everywhere cannot hold ${codecName(s.codec)} as it is)`);
  });
  let j = 0;
  p.streams.filter((s) => s.kind === 'subtitle').forEach((s, k) => {
    const name = `Subtitles ${k + 1}${s.lang && s.lang !== 'und' ? ` (${s.lang})` : ''}: ${codecName(s.codec)}`;
    if (!TEXT_SUBS.test(s.codec)) { lines.push(`${name} — left out (an MP4 cannot hold subtitles that are pictures)`); return; }
    args.push('-map', `0:s:${k}`, `-c:s:${j++}`, 'mov_text');
    lines.push(`${name} — made MP4 text subtitles${/^(ass|ssa)$/.test(s.codec) ? ' (their styling is lost)' : ''}`);
  });
  for (const t of otherTracks(p).filter((x) => !/cover picture/.test(x))) lines.push(`${t[0].toUpperCase()}${t.slice(1)} — left out (an MP4 has no place for it)`);
  if (p.chapters) lines.push(`${p.chapters} chapter${p.chapters > 1 ? 's' : ''} — kept`);
  return { args: [...args, '-movflags', '+faststart'], lines };
}
/** "1.2-1.8, 3:05-3:06.5" → the stretches in seconds, sorted, overlapping ones merged; a sentence for what is wrong. */
export function parseStretches(text: string, dur: number): Array<[number, number]> {
  const parts = String(text ?? '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Type the stretches to bleep — from and to, e.g. 1.2-1.8, 3:05-3:06.5');
  if (parts.length > 50) throw new Error('At most 50 stretches at a time.');
  const st = parts.map((x) => {
    const m = /^(.+?)\s*(?:-|–|—|to)\s*(.+)$/.exec(x);
    const a = m ? secs(m[1]) : NaN, b = m ? secs(m[2]) : NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`“${x}” is not a stretch of time — write it as from-to, e.g. 1.2-1.8 or 3:05-3:06.5.`);
    if (!(b > a)) throw new Error(`“${x}”: the end must be after the start.`);
    if (dur && a >= dur) throw new Error(`“${x}” starts after the end of the file (${fmtS(dur)} s).`);
    return [a, dur ? Math.min(b, dur) : b] as [number, number];
  }).sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const s of st) { const l = out[out.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else out.push([...s]); }
  return out;
}
/** The loudness weights of BS.1770 for the channels of a layout (the LFE counts nothing, surrounds 1.41) — for a beep that
 *  is as loud as the file. */
function channelWeight(p: Probe) {
  const ch = p.channels || 1;
  if (ch === 1) return 2; // as heard on two speakers (dual mono)
  if (ch === 2) return 2;
  const surr = /^(5\.1|5\.0|6\.1|7\.1)/.test(p.layout) || ch >= 5 ? (ch >= 8 ? 4 : 2) : 0, lfe = /\.1/.test(p.layout) ? 1 : 0;
  return ch - lfe - surr + surr * 1.41;
}
/** A job on the first sound: a video's picture copied (its container kept where common), a sound file in its own kind. */
function soundJob(c: JobCtx, base: string, af: string, ch: number, ly = '', note?: string): Built {
  if (!c.p.video) { const [ext, enc] = audioOut(base, ch, ly); return { args: ['-i', c.in1, '-map', '0:a:0', '-af', af, ...enc, `out.${ext}`], outputs: [`out.${ext}`], note }; }
  const ext = videoOutExt(base);
  return { args: ['-i', c.in1, '-map', '0:V:0', '-map', '0:a:0', '-c:v', 'copy', '-af', af, ...reAudioFor(ext, ch, ly), `out.${ext}`], outputs: [`out.${ext}`], note };
}
/** Ten notches at the mains frequency (as found) and its overtones, 3 + 0.3·k Hz wide: the hum 50 dB down once they
 *  have settled (half a second), speech within 0.4 dB of its level (docs/BUGHUNT.md, "Mains hum"). */
export const humNotches = (f0: number) => Array.from({ length: 10 }, (_, i) => `bandreject=f=${fmtS(f0 * (i + 1))}:width_type=h:width=${fmtS(3 + 0.3 * (i + 1))}`).join(',');
/** The sound effects (the chain, and what the picture does: 'slowed' slows it with the sound). */
const SFX: Record<string, { af: (rate: number) => string; stereo?: boolean; slow?: number; name: string }> = {
  '8d': { name: '8D (the sound circling the head)', stereo: true, af: () => 'apulsator=hz=0.125:amount=0.85' },
  slowed: { name: 'Slowed + reverb', slow: 0.85, af: (r) => `asetrate=${Math.round(r * 0.85)},aresample=${r},aecho=0.8:0.85:43|71|113:0.35|0.25|0.15` },
  bass: { name: 'Bass boost', af: () => 'bass=g=9:f=100:width_type=q:width=0.7' },
  phone: { name: 'Telephone voice', af: () => 'highpass=f=300,highpass=f=300,lowpass=f=3400,lowpass=f=3400,acrusher=bits=10:mode=log:aa=1:mix=0.25' },
  radio: { name: 'Old radio', af: () => 'highpass=f=250,highpass=f=250,lowpass=f=4500,lowpass=f=4500,acrusher=bits=12:mode=log:aa=1:mix=0.4' },
  echo: { name: 'Echo', af: () => 'aecho=0.8:0.8:350|700:0.35|0.18' },
};
/** The sticker's tries, best first: [pictures a second, WebP quality]. WhatsApp takes an animated sticker of 512 × 512 up to
 *  500 KB and 10 s (its sticker guidelines). */
const STICKER_TRIES: Array<[number, number]> = [[15, 75], [15, 55], [12, 45], [10, 35], [8, 25]];
export const STICKER_BYTES = 500_000;
/** Smooth slow motion's work here, in seconds: minterpolate made about 2.6 million output pixels a second in ffmpeg.wasm
 *  (Node, one core; 3 s of 640 × 360 at 25 fps, twice as slow, in 13 s) — 2 million counted for a browser. */
export const slowmoSeconds = (p: Probe, x: number) => Math.round(((p.w || 1280) * (p.h || 720) * (p.fps || 30) * x * (p.dur || 0)) / 2.0e6);

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
      if (o.aud === 'copy') { const out = `audio.${keptAudioExt(p)}`; return { args: [...I, '-vn', '-c:a', 'copy', out], outputs: [out] }; }
      // to-do #22: MP3 (with its quality), WAV, FLAC, OGG (Opus) — the sound at its own level (to-do #23)
      const enc: Record<string, string[]> = { mp3: mp3Args(o.mp3q), wav: ['-c:a', 'pcm_s16le'], flac: ['-c:a', 'flac'], ogg: opusArgs(128, p.channels, p.layout) };
      if (!enc[o.aud]) throw new Error(`"${o.aud}" is not a sound format here — choose MP3, WAV, FLAC or OGG.`);
      const out = `audio.${o.aud}`;
      return { args: [...I, '-vn', ...enc[o.aud], out], outputs: [out] };
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
    // ================================================================ to-do #32: 22 jobs on the same FFmpeg
    // ---------------------------------------------------------------- convert and extract
    case 'remux': {
      if (/^(mp4|m4v)$/.test(base)) throw new Error('This file is an MP4 already.');
      const plan = remuxPlan(p);
      return { args: [...I, ...plan.args, 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'scenes': {
      needVideo(p);
      const th = ({ low: 0.4, medium: 0.3, high: 0.2 } as Record<string, number>)[o.scSens] ?? 0.3;
      // the first picture, then one at every change of scene (a score of 0 – 1 for how different a frame is); showinfo
      // writes each picture's time in the log, which names the files
      return {
        args: [...I, '-map', '0:V:0', '-vf', `select='eq(n\\,0)+gt(scene\\,${th})',showinfo`, '-fps_mode', 'vfr', 'scene-%04d.png'],
        outputs: [], pattern: /^scene-\d{4}\.png$/, zip: 'scenes', jpeg: true,
        names: (made, log) => {
          const t = [...log.matchAll(/\[Parsed_showinfo_\d+ @ [^\]]*\] n:\s*\d+ pts:\s*-?\d+ pts_time:(-?[\d.]+)/g)].map((m) => +m[1]);
          return made.map((n, k) => (Number.isFinite(t[k]) ? `scene-${String(k + 1).padStart(3, '0')} (${clock(t[k]).replace(':', 'm')}s).png` : n));
        },
      };
    }
    case 'sticker': {
      needVideo(p);
      const s0 = o.stStart === '' ? 0 : secs(o.stStart), L = num(o.stLen);
      if (!Number.isFinite(s0)) throw new Error('The start is a time — seconds (12.5) or minutes:seconds (1:30).');
      if (!(L >= 0.5 && L <= 10)) throw new Error('A sticker lasts up to 10 seconds (WhatsApp\'s limit) — choose 0.5 to 10.');
      if (p.dur && s0 >= p.dur) throw new Error(`The video is only ${fmtS(p.dur)} s long.`);
      const len = p.dur ? Math.min(L, p.dur - s0) : L;
      const tryAt = (k: number): Built => {
        const [fps, q] = STICKER_TRIES[k];
        const fit = o.stFill === 'fit'
          ? `fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
          : `fps=${fps},scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1`;
        return {
          args: ['-ss', fmtS(s0), '-t', fmtS(len), ...I, '-map', '0:V:0', '-vf', fit, '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', String(q), '-compression_level', '4', '-loop', '0', '-an', 'sticker.webp'],
          outputs: ['sticker.webp'], note: `${fmtS(len)} s, ${fps} pictures a second, quality ${q} of 100`,
          next: (bytes) => (bytes <= STICKER_BYTES ? null : k + 1 < STICKER_TRIES.length ? tryAt(k + 1)
            : `Even at the lowest quality the sticker is ${Math.round(bytes / 1000)} KB — WhatsApp takes up to 500 KB: make it shorter, or choose a calmer part.`),
        };
      };
      return tryAt(0);
    }
    // ---------------------------------------------------------------- cut and join
    case 'transitions': {
      const ins = c.ins || [c.in1], ps = c.ps || [p], T = num(o.xfLen);
      if (ins.length < 2) throw new Error('Add at least one more clip — a transition goes between two.');
      const videos = ps.filter((x) => x.video).length;
      if (videos && videos < ps.length) throw new Error('Join videos with videos, or sound files with sound files — not both.');
      ps.forEach((x, i) => {
        if (!(x.dur > 0)) throw new Error(`FFmpeg could not tell how long clip ${i + 1} is.`);
        if (x.dur <= T + 0.1) throw new Error(`The transition (${fmtS(T)} s) must be shorter than every clip — clip ${i + 1} is ${fmtS(x.dur)} s.`);
      });
      const anyAudio = ps.some((x) => x.audio);
      const counts = [...new Set(ps.filter((x) => x.audio).map((x) => x.channels || 2))];
      const outCh = counts.length === 1 && [1, 2, 6, 8].includes(counts[0]) ? counts[0] : 2;
      const outLy = ({ 1: 'mono', 2: 'stereo', 6: '5.1', 8: '7.1' } as Record<number, string>)[outCh];
      const args: string[] = ins.flatMap((n) => ['-i', n]), f: string[] = [];
      let extra = ins.length;
      const aSrc = ps.map((x) => { if (!anyAudio || x.audio) return null; args.push('-f', 'lavfi', '-t', fmtS(x.dur), '-i', `anullsrc=r=48000:cl=${outLy}`); return extra++; });
      // every clip exactly as long as FFmpeg says (the last picture held, silence after a shorter sound), so that each
      // transition starts where it should and picture and sound stay together
      if (videos) {
        const W = even(ps[0].w || 1280), H = even(ps[0].h || 720);
        ps.forEach((x, i) => f.push(`[${i}:V:0]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=${fmtS(T + 1)},trim=duration=${fmtS(x.dur)},setpts=PTS-STARTPTS[v${i}]`));
      }
      if (anyAudio) ps.forEach((x, i) => f.push(`[${aSrc[i] ?? i}:a:0]${x.audio ? upmix(x.channels, outLy) : ''}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=${outLy},apad,atrim=duration=${fmtS(x.dur)},asetpts=PTS-STARTPTS[a${i}]`));
      let L = ps[0].dur, vl = 'v0', al = 'a0';
      for (let i = 1; i < ps.length; i++) {
        const last = i === ps.length - 1;
        if (videos) { f.push(`[${vl}][v${i}]xfade=transition=${o.xfType}:duration=${fmtS(T)}:offset=${fmtS(L - T)}[${last ? 'v' : `x${i}`}]`); vl = `x${i}`; }
        // equal power (quarter sines): two different sounds keep their loudness through the crossfade
        if (anyAudio) { f.push(`[${al}][a${i}]acrossfade=d=${fmtS(T)}:c1=qsin:c2=qsin[${last ? 'a' : `y${i}`}]`); al = `y${i}`; }
        L += ps[i].dur - T;
      }
      const maps = [...(videos ? ['-map', '[v]'] : []), ...(anyAudio ? ['-map', '[a]'] : [])];
      if (!videos) { const [ext, enc] = audioOut(base, outCh); return { args: [...args, '-filter_complex', f.join(';'), ...maps, ...enc, `out.${ext}`], outputs: [`out.${ext}`] }; }
      return { args: [...args, '-filter_complex', f.join(';'), ...maps, ...X264(21), ...(anyAudio ? aacArgs(160, outCh) : []), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- size and shape
    case 'bars': {
      needVideo(p);
      // the largest picture area of every frame (reset=0) — of the key frames only in a long video (seconds instead of
      // minutes; the bars are the same all through)
      const out = ['-vf', 'crop=W:H:X:Y', ...X264(20), ...ACOPY(p), '-movflags', '+faststart', 'out.mp4'];
      return {
        args: [...(p.dur > 60 ? ['-skip_frame', 'nokey'] : []), ...I, '-map', '0:V:0', '-vf', 'cropdetect=limit=24:round=2:reset=0:skip=0', '-an', '-f', 'null', '-'], outputs: [],
        preview: [...I, ...out],
        then: (log) => {
          const m = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
          if (!m) throw new Error('FFmpeg read no picture of this video to measure.');
          const [W, H, X, Y] = m.slice(1).map(Number), fw = p.w || W, fh = p.h || H;
          if (W >= fw - 2 && H >= fh - 2) throw new Error('No black bars were found — the picture fills the frame.');
          if (W < 16 || H < 16 || W * H < 0.2 * fw * fh) throw new Error('The picture is almost all black — the bars cannot be told apart from it.');
          return { args: [...I, '-vf', `crop=${W}:${H}:${X}:${Y}`, ...out.slice(2)], outputs: ['out.mp4'], note: `The bars cut off: ${W} × ${H} kept of ${fw} × ${fh}` };
        },
      };
    }
    case 'v360': {
      needVideo(p);
      if (o.v360In === 'wide') {
        const k = ({ light: [-0.12, -0.012], medium: [-0.227, -0.022], strong: [-0.32, -0.035] } as Record<string, number[]>)[o.lens] ?? [-0.227, -0.022];
        return { args: [...I, '-vf', `lenscorrection=k1=${k[0]}:k2=${k[1]}:i=bilinear`, ...X264(20), ...ACOPY(p), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
      }
      if (p.w && p.h && Math.abs(p.w / p.h - 2) > 0.06) throw new Error(`A 360° video is twice as wide as it is high — this one is ${p.w} × ${p.h}. For a GoPro or another wide lens choose “Wide lens”.`);
      if (o.v360Out === 'planet') return { args: [...I, '-vf', 'v360=input=e:output=sg:pitch=-90:h_fov=200:v_fov=200:w=1080:h=1080,setsar=1', ...X264(20), ...ACOPY(p), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
      const yaw = num(o.yaw), pitch = num(o.pitch), F = num(o.fov);
      if (!(yaw >= -180 && yaw <= 180)) throw new Error('Left / right is −180° to 180°.');
      if (!(pitch >= -90 && pitch <= 90)) throw new Error('Up / down is −90° to 90°.');
      if (!(F >= 30 && F <= 150)) throw new Error('The field of view is 30° to 150°.');
      const VF = (2 * Math.atan(Math.tan((F * Math.PI) / 360) * (9 / 16)) * 180) / Math.PI;
      return { args: [...I, '-vf', `v360=input=e:output=flat:yaw=${fmtS(yaw)}:pitch=${fmtS(pitch)}:h_fov=${fmtS(F)}:v_fov=${fmtS(VF)}:w=1280:h=720,setsar=1`, ...X264(20), ...ACOPY(p), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- picture
    case 'hdr': {
      needVideo(p);
      const kind = p.trc === 'arib-std-b67' ? 'HLG' : p.trc === 'smpte2084' ? 'PQ (HDR10)' : '';
      if (!kind) throw new Error(p.trc && p.trc !== 'unknown' ? `This video is not HDR (its colours are ${p.trc}) — nothing to convert.` : 'FFmpeg finds no HDR colours in this video (HLG or PQ) — nothing to convert.');
      if (p.dovi === 5) throw new Error('This is Dolby Vision profile 5: its colours need Dolby\'s own processing, which FFmpeg does not have.');
      // BT.2408: HDR's reference white (203 cd/m²) becomes SDR white; above it a soft knee (mobius) up to 1000 cd/m², what
      // phones record — chosen by measurement on an HLG and a PQ picture made by BT.2100's formulas (docs/BUGHUNT.md). zimg
      // applies HLG's system gamma to each colour (BT.2100: to the luminance) — saturated colours come out a little richer
      const vf = 'zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:param=0.6:desat=0:peak=4.926,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';
      return { args: [...I, '-vf', vf, ...X264(20), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', ...ACOPY(p), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'], note: `${kind} made SDR (BT.709)` };
    }
    case 'delogo': {
      needVideo(p);
      let [x, y, w, hh] = [o.lgX, o.lgY, o.lgW, o.lgH].map((v) => Math.round(num(v)));
      if (![x, y, w, hh].every(Number.isFinite) || w < 2 || hh < 2) throw new Error('Draw a box around the logo on the picture (or type where it is).');
      const W = p.w || 1e9, H = p.h || 1e9;
      if (x >= W - 2 || y >= H - 2 || x + w <= 1 || y + hh <= 1) throw new Error('The box is outside the picture.');
      // delogo fills the box from the pixels around it: the box must stay a pixel inside the frame
      if (x < 1) { w -= 1 - x; x = 1; } if (y < 1) { hh -= 1 - y; y = 1; }
      w = Math.min(w, W - 1 - x); hh = Math.min(hh, H - 1 - y);
      return { args: [...I, '-vf', `delogo=x=${x}:y=${y}:w=${w}:h=${hh}`, ...X264(20), ...ACOPY(p), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- effects
    case 'chroma': {
      needVideo(p);
      if (!c.in2) throw new Error('Choose the background — a photo or a video.');
      const hex = o.keyColour === 'green' ? '00FF00' : o.keyColour === 'blue' ? '0000FF' : /^#?[0-9a-f]{6}$/i.test(String(o.keyCustom)) ? String(o.keyCustom).replace('#', '').toUpperCase() : '';
      if (!hex) throw new Error('The colour is written as #RRGGBB, e.g. #00ff00.');
      const W = even(p.w || 1280), H = even(p.h || 720), fps = p.fps || 30, photo = /^(png|jpe?g|webp|bmp|gif|tiff?|heic)$/.test(c.ext2 || '') || (c.p2 ? !c.p2.video || c.p2.dur === 0 : false);
      const sim = Math.max(1, Math.min(60, num(o.keySim))) / 100, blend = Math.max(0, Math.min(40, num(o.keyBlend))) / 100;
      const despill = o.keyColour === 'green' ? ',despill=type=green' : o.keyColour === 'blue' ? ',despill=type=blue' : '';
      const fc = `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}[bg];[0:V:0]scale=${W}:${H},setsar=1,chromakey=color=0x${hex}:similarity=${fmtS(sim)}:blend=${fmtS(blend)}${despill}[fg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[v]`;
      return { args: [...I, ...(photo ? ['-loop', '1', '-framerate', String(fps)] : ['-stream_loop', '-1']), '-i', c.in2, '-filter_complex', fc, '-map', '[v]', '-map', '0:a?', ...X264(20), ...ACOPY(p), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'stack': {
      const ins = c.ins || [c.in1], ps = c.ps || [p], n = ins.length, lay = o.stackLayout;
      if (ps.some((x) => !x.video)) throw new Error('A split screen is made of videos — one of these files has no picture.');
      if (lay !== 'grid' && n !== 2) throw new Error(n < 2 ? 'Add the second video.' : 'Side by side and one above the other take two videos — remove the others, or choose the 2 × 2 grid.');
      if (lay === 'grid' && (n < 3 || n > 4)) throw new Error(n < 3 ? 'A 2 × 2 grid takes 3 or 4 videos — add more.' : 'A 2 × 2 grid takes at most 4 videos.');
      const cols = lay === 'above' ? 1 : 2, rows = lay === 'side' ? 1 : 2, p0 = ps[0], w0 = p0.w || 640, h0 = p0.h || 360;
      // tiles of the first video's shape, the whole at most 1920 × 1080 (1080 × 1920 one above the other)
      const s = Math.min(1, (lay === 'above' ? 1080 : 1920) / cols / w0, (lay === 'above' ? 1920 : 1080) / rows / h0), tw = even(w0 * s), th = even(h0 * s);
      const f = ps.map((_, i) => `[${i}:V:0]scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${i}]`);
      if (lay === 'grid' && n === 3) f.push(`color=c=black:s=${tw}x${th}:r=30,trim=duration=${fmtS(Math.max(...ps.map((x) => x.dur || 0)) || 1)}[v3]`);
      f.push(lay === 'side' ? '[v0][v1]hstack=inputs=2[v]' : lay === 'above' ? '[v0][v1]vstack=inputs=2[v]' : '[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[v]');
      let amap: string[] = [], aenc: string[] = [];
      if (o.stackSound === 'mix') {
        const withA = ps.map((x, i) => [x, i] as const).filter(([x]) => x.audio);
        if (withA.length) {
          const outCh = withA.every(([x]) => x.channels === 1) ? 1 : 2, ly = outCh === 1 ? 'mono' : 'stereo';
          withA.forEach(([x, i]) => f.push(`[${i}:a:0]${upmix(x.channels, ly)}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=${ly}[a${i}]`));
          // each at its own level, added — the limiter only touches peaks above −0.3 dBFS
          f.push(`${withA.map(([, i]) => `[a${i}]`).join('')}amix=inputs=${withA.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.97:level=false:latency=true[a]`);
          amap = ['-map', '[a]']; aenc = aacArgs(160, outCh);
        }
      } else {
        const k = Math.max(1, Math.min(n, Math.round(num(o.stackSound)) || 1)) - 1;
        if (ps[k].audio) { amap = ['-map', `${k}:a:0`]; aenc = ACOPY(ps[k]); }
      }
      return { args: [...ins.flatMap((x) => ['-i', x]), '-filter_complex', f.join(';'), '-map', '[v]', ...amap, ...X264(21), ...aenc, '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'trails': {
      needVideo(p);
      const len = o.trailLen === 'short' ? 0 : o.trailLen === 'long' ? 2 : 1;
      // light trails in RGB (a red light leaves a red trail); motion blur: the average of the last frames
      const vf = o.trailKind === 'blur' ? `tmix=frames=${[3, 5, 9][len]},format=yuv420p` : `format=gbrp,lagfun=decay=${[0.9, 0.96, 0.985][len]},format=yuv420p`;
      return { args: [...I, '-vf', vf, ...X264(20), ...ACOPY(p), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'visualiser': {
      needAudio(p); needDur(p);
      if (o.visStyle === 'scope' && p.channels < 2) throw new Error('The stereo scope shows the two sides of a stereo sound — this one is mono. Choose the bars or the spectrum.');
      // the spectrum's heights are powers of two: FFmpeg 5.1's transform is fast only for those (a spectrogram 800 rows high
      // took 100 s for 2 s of sound here, 1024 rows 0.2 s). Over a picture: the bars or the spectrum along the bottom, the
      // scope in the middle, their black made transparent
      const pic = !!c.in2, st = o.visStyle;
      // the spectrum scrolls a column every 256 samples (overlap 0.875; the default moved 23 columns a second), frequencies
      // and levels on log scales; the bars at twice their default volume (speech left them flat)
      const vis = st === 'spectrum' ? `showspectrum=s=1280x${pic ? 256 : 512}:mode=combined:slide=scroll:color=rainbow:scale=log:fscale=log:overlap=0.875:fps=25${pic ? '' : ',scale=1280:720'}`
        : st === 'scope' ? `avectorscope=s=720x720:zoom=1.5:draw=line:rate=25${pic ? '' : ',pad=1280:720:280:0:black'}`
          : `showcqt=s=1280x${pic ? '360:sono_h=0:axis_h=0' : 720}:fps=25:bar_v=48:sono_v=32`;
      const fc = pic
        ? `[0:a:0]${vis},colorkey=0x000000:0.1:0.1[s];[1:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1[b];[b][s]overlay=${st === 'scope' ? '(W-w)/2:0' : '0:H-h'}:shortest=1:format=auto,format=yuv420p[v]`
        : `[0:a:0]${vis},format=yuv420p[v]`;
      // x264's fastest preset: the drawing takes a tenth of the time, the encoding the rest (2.6 times quicker than veryfast)
      return { args: [...I, ...(pic ? ['-loop', '1', '-framerate', '25', '-i', c.in2!] : []), '-filter_complex', fc, '-map', '[v]', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', ...aacArgs(192, p.channels, p.layout), '-t', fmtS(p.dur), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    case 'soundpic': {
      needAudio(p);
      if (p.dur > 1800) throw new Error(`The picture is drawn from the whole sound, held in memory here: up to 30 minutes — trim it first (this one is ${Math.round(p.dur / 60)} min).`);
      // 1024 rows: a power of two (see the visualiser — 800 rows took 100 s in this FFmpeg)
      if (o.picKind === 'spectrogram') return { args: [...I, '-filter_complex', '[0:a:0]showspectrumpic=s=1600x1024:legend=1:color=intensity:scale=log[v]', '-map', '[v]', '-frames:v', '1', 'spectrogram.png'], outputs: ['spectrogram.png'] };
      const ch = Math.max(1, Math.min(p.channels || 1, 8)), cols = ['0x6366f1', '0x0ea5e9', '0x10b981', '0xf59e0b', '0xef4444', '0x8b5cf6', '0x14b8a6', '0xf97316'];
      return { args: [...I, '-filter_complex', `[0:a:0]${p.dur > 300 ? 'aresample=8000,' : ''}showwavespic=s=1920x${Math.min(1200, 240 * ch)}:split_channels=1:colors=${cols.slice(0, ch).join('|')}[v]`, '-map', '[v]', '-frames:v', '1', 'waveform.png'], outputs: ['waveform.png'] };
    }
    // ---------------------------------------------------------------- speed
    case 'slowmo': {
      needVideo(p); needDur(p);
      const x = num(o.smX), fps = Math.min(p.fps || 30, 60), work = slowmoSeconds(p, x);
      if (work > 1200) throw new Error(`Smooth slow motion makes every new picture by following the motion — about ${Math.round(work / 60)} minutes of work here for this video. Trim it to about ${Math.max(1, Math.floor((p.dur * 1200) / work))} s first.`);
      const vf = `minterpolate=fps=${fmtS(fps * x)}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=${x}*PTS`;
      const at = x === 2 ? 'atempo=0.5' : x === 4 ? 'atempo=0.5,atempo=0.5' : 'atempo=0.5,atempo=0.5,atempo=0.5';
      const sound = p.audio && o.smSound === 'slow';
      return { args: [...I, '-map', '0:V:0', ...(sound ? ['-map', '0:a:0', '-af', at, ...aacArgs(160, p.channels, p.layout)] : ['-an']), '-vf', vf, '-r', fmtS(fps), ...X264(20), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
    }
    // ---------------------------------------------------------------- sound
    case 'evenout': {
      needAudio(p);
      const [f, g] = ({ gentle: [500, 15], moment: [250, 9], fast: [150, 7] } as Record<string, number[]>)[o.evenHow] ?? [250, 9];
      // dynaudnorm: the gain of every moment (f ms) follows a window of g of them — quiet speakers raised up to 26 dB, the
      // peaks at −0.9 dBFS. (speechnorm evened nothing out in FFmpeg 5.1, this FFmpeg: docs/BUGHUNT.md.)
      return soundJob(c, base, `dynaudnorm=f=${f}:g=${g}:p=0.9:m=20`, p.channels, p.layout);
    }
    case 'sync': {
      needVideo(p); needAudio(p);
      const v = num(o.syncAmt), sec = o.syncUnit === 's' ? v : v / 1000;
      if (!(sec > 0)) throw new Error('Type how far to move the sound — e.g. 200 ms or 1.5 s.');
      if (p.dur && sec >= p.dur) throw new Error(`The file is only ${fmtS(p.dur)} s long.`);
      // the sound moved by whole samples; the file keeps its length (the end cut, or silence added)
      const later = o.syncDir === 'later', n = Math.round(sec * (p.rate || 48000));
      const af = later ? `adelay=delays=${n}S:all=1${p.dur ? `,atrim=end=${fmtS(p.dur)}` : ''}` : `atrim=start=${fmtS(sec)},asetpts=PTS-${fmtS(sec)}/TB,apad=pad_dur=${fmtS(sec)}`;
      return soundJob(c, base, af, p.channels, p.layout, `The sound moved ${fmtS(sec * 1000)} ms ${later ? 'later' : 'earlier'}`);
    }
    case 'side': {
      needAudio(p);
      if (p.channels === 1) throw new Error('This sound is mono — it is the same on both sides already.');
      if (p.channels > 2) throw new Error(`This works on stereo sound — this file has ${p.layout || `${p.channels} channels`}.`);
      const pans: Record<string, string> = { left: 'pan=stereo|c0=c0|c1=c0', right: 'pan=stereo|c0=c1|c1=c1', swap: 'pan=stereo|c0=c1|c1=c0' };
      const said: Record<string, string> = { left: 'The left side put on both sides', right: 'The right side put on both sides', swap: 'Left and right swapped' };
      if (o.sideWhich !== 'auto') return soundJob(c, base, pans[o.sideWhich] ?? pans.left, 2, 'stereo', said[o.sideWhich]);
      return {
        args: [...I, '-map', '0:a:0', '-af', 'astats=measure_overall=none:measure_perchannel=RMS_level', '-f', 'null', '-'], outputs: [],
        preview: soundJob(c, base, 'pan=stereo|c0=SIDE|c1=SIDE', 2, 'stereo').args,
        then: (log) => {
          const [l, r] = rmsOf(log).pop()?.ch ?? [];
          if (!Number.isFinite(l) && !Number.isFinite(r)) throw new Error('This sound is silent on both sides.');
          if (Math.abs((l ?? -Infinity) - (r ?? -Infinity)) < 6) throw new Error(`Both sides hold the sound (left ${minus(l)} dB, right ${minus(r)} dB) — choose a side yourself, or Swap.`);
          const side = l > r ? 'left' : 'right';
          return soundJob(c, base, pans[side], 2, 'stereo', `The sound is on the ${side} (left ${minus(l)} dB, right ${minus(r)} dB): put on both sides`);
        },
      };
    }
    case 'hum': {
      needAudio(p);
      const f0 = num(o.humHz) === 60 ? 60 : 50, cand = Array.from({ length: 9 }, (_, i) => +(f0 - 0.2 + i * 0.05).toFixed(2));
      // the mains frequency drifts (49.9 – 50.1 Hz), and the 10th overtone 10 times as much — narrow notches 0.1 Hz off
      // took out a third of the hum. So it is found first: the band around the fundamental (speech has little there), a
      // notch at each candidate, measured once the notch has settled (0.5 s) — the quietest is the hum's frequency
      const band = f0 === 60 ? 'highpass=f=38,lowpass=f=95,lowpass=f=95' : 'highpass=f=30,lowpass=f=80,lowpass=f=80', settle = p.dur > 1.5 ? 'atrim=start=0.5,' : '';
      const fc = `[0:a:0]${band},asplit=${cand.length}${cand.map((_, i) => `[c${i}]`).join('')};${cand.map((f, i) => `[c${i}]bandreject=f=${f}:width_type=h:width=3.3,${settle}astats=measure_perchannel=none:measure_overall=RMS_level[o${i}]`).join(';')}`;
      return {
        args: ['-t', '60', ...I, '-filter_complex', fc, ...cand.flatMap((_, i) => ['-map', `[o${i}]`]), '-f', 'null', '-'], outputs: [],
        preview: soundJob(c, base, humNotches(f0).replace(/f=[\d.]+/g, 'f=F'), p.channels, p.layout).args,
        then: (log) => {
          const r = rmsOf(log).map((x) => x.overall);
          if (r.length !== cand.length || !r.every(Number.isFinite)) throw new Error('FFmpeg could not measure the sound.');
          // a hum makes a valley: the quietest candidate inside the range, the others rising on both sides (a hum 50 dB
          // down, 0.01 dB deep); without one the band is empty (below −75 dB) or the levels only drift one way
          const k = r.indexOf(Math.min(...r)), atEnd = k === 0 || k === r.length - 1;
          if (Math.max(...r) < -75 || (atEnd && Math.max(...r) - Math.min(...r) < 0.05)) return soundJob(c, base, humNotches(f0), p.channels, p.layout, `No clear mains hum was found, so the notches are at ${f0} Hz and its overtones exactly`);
          const best = cand[k];
          return soundJob(c, base, humNotches(best), p.channels, p.layout, `Mains hum found at ${fmtS(best)} Hz: it and its overtones up to ${fmtS(best * 10)} Hz taken out`);
        },
      };
    }
    case 'bleep': {
      needAudio(p);
      const st = parseStretches(o.bleepAt, p.dur), g = st.map(([a, b]) => `between(t,${fmtS(a)},${fmtS(b)})`).join('+');
      const said = `${st.length} stretch${st.length > 1 ? 'es' : ''} (${fmtS(st.reduce((s, [a, b]) => s + b - a, 0))} s)`;
      if (o.bleepKind === 'silence') return soundJob(c, base, `aeval=exprs='val(ch)*(1-(${g}))':c=same`, p.channels, p.layout, `${said} made silent`);
      // a 1 kHz beep as loud as the file (BS.1770: a 1 kHz sine's K-weighting is 0 dB; the LFE counts nothing)
      const beep = (A: number) => `aeval=exprs='val(ch)*(1-(${g}))+(${g})*${A.toFixed(5)}*sin(2*PI*1000*t)':c=same`;
      return {
        args: [...I, '-map', '0:a:0', '-af', 'ebur128=framelog=verbose:dualmono=true', '-f', 'null', '-'], outputs: [],
        preview: soundJob(c, base, beep(0.1).replace(/\*0\.10000\*/, '*LEVEL*'), p.channels, p.layout).args,
        then: (log) => {
          const L = loudnessOf(log).pop()?.i ?? NaN, ok = Number.isFinite(L) && L > -70;
          const A = ok ? Math.min(0.5, Math.sqrt((2 * 10 ** (L / 10)) / channelWeight(p))) : 0.1;
          return soundJob(c, base, beep(A), p.channels, p.layout, `${said} bleeped with a 1 kHz beep${ok ? ` as loud as the file (${minus(L)} LUFS)` : ''}`);
        },
      };
    }
    case 'sfx': {
      needAudio(p);
      const e = SFX[o.sfx] ?? SFX['8d'], rate = p.rate || 48000;
      const pre = e.stereo ? (p.channels === 1 ? 'pan=stereo|c0=c0|c1=c0,' : p.channels > 2 ? 'aformat=channel_layouts=stereo,' : '') : '';
      const ch = e.stereo ? 2 : p.channels, ly = e.stereo ? 'stereo' : p.layout, fx = `${pre}${e.af(rate)}`;
      // the effect's own loudness is measured with the file's, and the result brought back to the file's loudness (the
      // telephone took out 4 dB, the bass boost added 3) — the limiter only touches peaks above −1 dBFS
      const build = (gain: number, note?: string): Built => {
        const af = `${fx},volume=${gain.toFixed(2)}dB,alimiter=limit=0.891:level=false:latency=true`;
        if (!(e.slow && p.video)) return soundJob(c, base, af, ch, ly, note);
        return { args: [...I, '-filter_complex', `[0:V:0]setpts=PTS/${e.slow}[v];[0:a:0]${af}[a]`, '-map', '[v]', '-map', '[a]', ...X264(20), ...aacArgs(160, ch, ly), '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'], note };
      };
      return {
        args: [...I, '-filter_complex', `[0:a:0]asplit=2[a][b];[a]ebur128=framelog=verbose:dualmono=true[x];[b]${fx},ebur128=framelog=verbose:dualmono=true[y]`, '-map', '[x]', '-map', '[y]', '-f', 'null', '-'], outputs: [],
        preview: build(0).args.map((a) => a.replace('volume=0.00dB', 'volume=GAIN')),
        then: (log) => {
          const [a, b] = loudnessOf(log).map((x) => x.i);
          const ok = Number.isFinite(a) && Number.isFinite(b) && a > -70 && b > -70;
          return build(ok ? a - b : 0, `${e.name}${ok ? `, at the file's loudness (${minus(a)} LUFS; the effect alone ${minus(b)})` : ''}`);
        },
      };
    }
    // ---------------------------------------------------------------- information and privacy
    case 'analyse': {
      if (!p.video && !p.audio) throw new Error('FFmpeg finds no picture or sound in this file.');
      const v = p.video && o.anWhat !== 'sound', a = p.audio;
      const fc = [v ? '[0:V:0]blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=2[v]' : '', a ? '[0:a:0]ebur128=peak=true:framelog=verbose:dualmono=true,silencedetect=n=-50dB:d=0.5[a]' : ''].filter(Boolean).join(';');
      const q: Probe = { ...p, video: v };
      return { args: [...I, '-filter_complex', fc, ...(v ? ['-map', '[v]'] : []), ...(a ? ['-map', '[a]'] : []), '-f', 'null', '-'], outputs: [], report: (log) => analyseReport(log, q) };
    }
    case 'meta': {
      if (!p.video && !p.audio) throw new Error('FFmpeg finds no picture or sound in this file.');
      const ext = /^(mp4|mov|m4v|mkv|webm|3gp|mp3|m4a|flac|ogg|opus|wav)$/.test(base) ? base : p.video ? 'mkv' : 'mka';
      // copied as it is, without the file's, the streams' and the chapters' metadata; data tracks (GPS, timecode) and a
      // cover picture are not mapped; bitexact: FFmpeg writes no "encoder" of its own
      return { args: [...I, '-map', '0:V?', '-map', '0:a?', '-map', '0:s?', '-map_metadata', '-1', '-map_metadata:s', '-1', '-map_chapters', '-1', '-c', 'copy', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', `out.${ext}`], outputs: [`out.${ext}`] };
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
  if (job === 'chroma') return { label: 'Choose the background (a photo or a video)', accept: 'image/*,video/*' };
  if (job === 'visualiser') return { label: 'Choose a picture to show behind it (optional)', accept: 'image/*', optional: true };
  return null;
}
