// FFmpeg (PC): FFmpeg 5.1 compiled to WebAssembly (ffmpeg.wasm single-threaded core: libx264/x265, libvpx, LAME,
// Opus, Vorbis, Theora, WebP, freetype/libass, zimg) running in its own worker. Inputs are mounted read-only
// (WORKERFS, not copied into memory). Each task (src/lib/ffjobs.ts) builds an argument list; the equivalent command
// line is shown so it can be copied to a real terminal, or edited in "Your own arguments".
import { h, card, field, actions, button, select, input, segmented, toggle, slider, stack, note, progress, filePicker, outputBox, toast, errMsg, fmtBytes, fmtTime, baseName, extOf, downloadBlob, copy, clear, type Mount } from '../ui';
import { onLeave } from '../lifecycle';
import { JOB_GROUPS, DEFAULTS, EMPTY_PROBE, buildJob, parseProbe, secondFor, asJpegName, keptAudioExt, mp3Of, remuxPlan, personalMeta, otherTracks, slowmoSeconds, type Job, type Probe, type JobCtx, type Built } from '../lib/ffjobs';
import { cropBox } from '../lib/imgtools';
import { loadImg, encodeImg } from '../lib/imgio';
import { liveCamera } from '../lib/livecam';
import './ffmpeg.css';

const FORMATS: Array<[string, string]> = [['mp4', 'MP4 (H.264 + AAC)'], ['webm', 'WebM (VP8 + Opus)'], ['mkv', 'MKV (copy streams)'], ['mov', 'MOV (H.264 + AAC)'], ['mp3', 'MP3 audio'], ['m4a', 'M4A audio (AAC)'], ['wav', 'WAV audio'], ['flac', 'FLAC audio'], ['ogg', 'OGG audio (Opus)'], ['gif', 'GIF']];
const quote = (s: string) => (/^[\w.\-/:=]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`);
const FONTS = ['NotoSans_400Regular.ttf', 'NotoSans_700Bold.ttf'];
/** "Extract audio"'s format and MP3 quality, kept while the page is open — through other files and other tabs (to-do
 *  #22: "the format chosen kept while the tab is open"); nothing is stored (stateless site). */
const keptAudio = { aud: DEFAULTS.aud as string, mp3q: DEFAULTS.mp3q as string };
const MP3Q: Array<[string, string]> = [['v2', 'VBR V2 (≈ 190 kb/s)'], ['128', '128 kb/s'], ['192', '192 kb/s'], ['320', '320 kb/s']];
/** xfade's transitions offered (each looked for in this FFmpeg 5.1) */
const XFADES: Array<[string, string]> = [['fade', 'Cross-fade'], ['fadeblack', 'Fade through black'], ['fadewhite', 'Fade through white'], ['dissolve', 'Dissolve'], ['wipeleft', 'Wipe to the left'], ['wiperight', 'Wipe to the right'],
  ['slideleft', 'Slide to the left'], ['slideright', 'Slide to the right'], ['smoothleft', 'Smooth wipe'], ['circleopen', 'Circle opening'], ['circleclose', 'Circle closing'], ['radial', 'Clock hand'], ['pixelize', 'Pixelize'], ['zoomin', 'Zoom in'], ['hblur', 'Blur'], ['distance', 'Distance']];

export const mount: Mount = (root) => {
  let ff: any = null, loading: Promise<any> | null = null, running = false, onProg: ((p: number) => void) | null = null;
  // a job ended by Stop, by a new file or by leaving the tab says so (it showed "called FFmpeg.terminate()" in red);
  // probes of a second file or of clips wait for a running job (they reset its log and shared its FFmpeg)
  let stopNote = '', live = true, runDone: Promise<void> = Promise.resolve();
  let jobSeq = 0, execing = false; // the job being run (Stop and a new file end it); FFmpeg inside a command
  /** commands run on this FFmpeg for jobs: after RECYCLE of them the next job gets a new one. ffmpeg.wasm runs every command in one
   *  module instance; after about twenty jobs of to-do #32's effects one of them failed with "memory access out of bounds"
   *  — each half of that sequence alone ran clean, and the heap did not grow (67 – 80 MB): state left by earlier commands,
   *  not a leak (docs/BUGHUNT.md, "FFmpeg: 22 new jobs"). A new FFmpeg loads from the browser's cache in a second or two */
  let jobsOnCore = 0;
  const RECYCLE = 12;
  let collect: string[] | null = null; // the whole log of a command whose log is read (a measuring pass, a report, names)
  let main: File | null = null, second: File | null = null, logLines: string[] = [], streams = '';
  let p1: Probe = EMPTY_PROBE, p2: Probe | undefined, probing: Promise<void> = Promise.resolve(), fontsIn = false, loadedOnce = false;
  /** the clips of "Join clips": the chosen file first; each added clip gets the name in3, in4 … inside FFmpeg */
  let clips: Array<{ file: File; name: string; probe: Probe }> = [], clipSeq = 2;
  let job: Job = 'convert';
  const o: Record<string, any> = { ...DEFAULTS, ...keptAudio };
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const cmd = outputBox({ rows: 3, mono: true });
  const opts = h('div', { class: 'stack' });
  const outs = h('div', { class: 'stack' });
  const outCard = card('Output', outs); outCard.hidden = true;
  const logBox = h('pre', { class: 'ff-log' });
  const work = h('div', { class: 'stack', hidden: true });
  const takeSecond = async (f: File) => {
    second = f; p2 = undefined; secondInfo.textContent = `${f.name} · ${fmtBytes(f.size)}`; update();
    if (f.type.startsWith('image/') || /\.(srt|vtt|ass|ssa)$/i.test(f.name)) return;
    const pr = await probeFile(f, in2()).catch(() => undefined);
    if (second === f) { p2 = pr; update(); }
  };
  const secondPick = filePicker({ accept: 'audio/*,image/*,video/*', label: 'Second file', compact: true, onFiles: ([f]) => { secondCam.stop(); return takeSecond(f); } });
  // a job whose second file is a picture (a logo, the picture for sound, a picture-in-picture) can take it with the webcam
  const secondCam = liveCamera({ instead: 'choose a picture instead', onSnap: async (_img, file) => takeSecond(await file()) });
  const secondInfo = h('div', { class: 'muted small' });
  const secondBox = h('div', { class: 'stack' }, secondPick, secondCam.el, secondInfo); secondBox.hidden = true;
  const clipList = h('ol', { class: 'ff-clips' });
  const clipPick = filePicker({ accept: 'video/*,audio/*,.mkv,.avi,.ts,.m2ts,.wmv', multiple: true, label: 'Add clips to join', compact: true, onFiles: (fs) => addClips(fs) });
  const joinBox = h('div', { class: 'stack' }, clipList, clipPick); joinBox.hidden = true;

  const extOfName = (n: string) => (extOf(n) || 'bin').toLowerCase();
  const in1 = () => `in1.${extOfName(main?.name || 'x.mp4')}`, in2 = () => `in2.${extOfName(second?.name || 'x.bin')}`;
  const ctx = (): JobCtx => ({ in1: in1(), in2: second ? in2() : undefined, p: p1, p2, ext: extOfName(main?.name || 'x.mp4'), ext2: second ? extOfName(second.name) : undefined, ins: clips.map((c) => c.name), ps: clips.map((c) => c.probe) });
  const build = () => buildJob(job, o, ctx());
  const realName = (n: string) => (n === in1() ? main?.name : second && n === in2() ? second.name : clips.find((c) => c.name === n)?.file.name) || n;
  function update() {
    if (!main) return;
    try {
      const b = build(), { args } = b;
      const show = (a: string) => (/^in\d+\.\w+$/.test(a) ? realName(a) : /^out\./.test(a) ? `${baseName(main!.name)}-out.${extOf(a)}` : a.replace(/\/in\/(in\d+\.\w+)/g, (_, n) => realName(n)).replace(/\/work\//g, ''));
      const line = (a: string[]) => `ffmpeg ${a.map((x) => quote(show(x))).join(' ')}`;
      cmd.value = b.then ? `${line(args)}\n# then, with what the first command finds:\n${line(b.preview ?? [])}` : `${line(args)}${b.jpeg ? '\n# then PNG → JPEG with MozJPEG (quality 90)' : ''}${b.next ? '\n# made again with fewer pictures a second while it is above 500 KB' : ''}`;
    } catch (e) { cmd.value = errMsg(e); }
  }
  const sel = (label: string, key: string, options: Array<[string, string]>, after?: () => void) => field(label, select<string>(options, o[key], (v) => { o[key] = v; after?.(); update(); }));
  const inp = (label: string, key: string, type = 'text', extra: any = {}) => field(label, input({ type, value: o[key], ...extra, onInput: (v: string) => { o[key] = v; update(); } }));
  const sw = (label: string, key: string) => toggle(label, !!o[key], (v) => { o[key] = v; update(); });
  // (a number: the 360° view's directions are kept as text — '0' — and the slider's label called toFixed on it: the task's
  //  options did not render at all)
  const range = (label: string, key: string, min: number, max: number, unit: string) => slider({ label, min, max, value: Number(o[key]) || 0, unit, onInput: (v) => { o[key] = v; update(); } });
  const info2 = (t: string) => note(t, 'info');
  const CORNERS: Array<[string, string]> = [['br', 'Bottom right'], ['bl', 'Bottom left'], ['tr', 'Top right'], ['tl', 'Top left'], ['c', 'Centre']];
  function renderOpts() {
    const sec = secondFor(job, o);
    secondBox.hidden = !sec;
    if (sec) { secondPick.querySelector('strong')!.textContent = sec.label; secondPick.querySelector('input')!.setAttribute('accept', sec.accept); }
    secondCam.el.hidden = !sec || !/image\//.test(sec.accept); // hidden, its camera closes
    const clipJob = job === 'join' || job === 'transitions' || job === 'stack';
    joinBox.hidden = !clipJob;
    clipPick.querySelector('strong')!.textContent = job === 'stack' ? 'Add the other videos (2 to 4 in all)' : 'Add clips to join';
    if (clipJob) renderClips();
    const parts: Record<Job, () => Array<Node | null>> = {
      convert: () => [sel('To', 'fmt', FORMATS)],
      // to-do #22 (owner: "the extracted audio is by default in the .m4a format. Add an MP3 audio formats also"): the
      // formats in plain sight (they were a list whose first entry was already chosen), MP3 with its quality
      audio: () => [field('Save the sound as', segmented<string>([['copy', p1.audio ? `As it is (.${keptAudioExt(p1)})` : 'As it is'], ['mp3', 'MP3'], ['wav', 'WAV'], ['flac', 'FLAC'], ['ogg', 'OGG (Opus)']], o.aud, (v) => { o.aud = keptAudio.aud = v; renderOpts(); })),
        o.aud === 'mp3' ? field('MP3 quality', segmented<string>(MP3Q, o.mp3q, (v) => { o.mp3q = keptAudio.mp3q = v; update(); })) : null,
        info2(({ copy: 'The sound exactly as it is in the file: nothing lost, done in seconds. The result can be made MP3 with one click ("Download as MP3").',
          mp3: 'VBR V2 is LAME\'s recommended setting — hard to tell from the original at about 190 kb/s; 320 kb/s is the most MP3 holds; 128 kb/s for speech and small files.',
          wav: 'Uncompressed (16-bit PCM): large, opens everywhere.', flac: 'Lossless, about half the size of WAV.',
          ogg: 'Opus at 128 kb/s (more for 5.1): small and very good.' } as Record<string, string>)[o.aud] ?? '')],
      mute: () => [info2('The video is copied as it is; only the sound is removed.')],
      thumb: () => [h('div', { class: 'row' }, inp('At (seconds or mm:ss)', 'thumbAt'), sel('As', 'thumbFmt', [['jpg', 'JPEG'], ['png', 'PNG']]))],
      frames: () => [h('div', { class: 'row' }, sel('One picture every', 'frameFps', [['1', 'second'], ['0.2', '5 seconds'], ['0.1', '10 seconds'], ['5', '0.2 seconds']]), sel('As', 'frameFmt', [['png', 'PNG'], ['jpg', 'JPEG']]))],
      sheet: () => [sel('Grid', 'sheetGrid', [['3x3', '3 × 3 (9 pictures)'], ['4x4', '4 × 4 (16)'], ['5x5', '5 × 5 (25)'], ['4x6', '4 across, 6 down (24)'], ['6x5', '6 across, 5 down (30)']]), info2('Pictures taken evenly over the whole video, in one JPEG.')],
      gif: () => [h('div', { class: 'row' }, sel('Width', 'gifW', [['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['800', '800 px']]), sel('Frames per second', 'gifFps', [['8', '8'], ['10', '10'], ['12', '12'], ['15', '15'], ['20', '20']])), info2('Tip: trim the clip first — GIFs grow quickly.')],
      audio2mp4: () => [field('Make', segmented<string>([['still', 'Picture + sound'], ['waves', 'Animated waveform'], ['m4a', 'M4A audio only']], o.a2m, (v) => { o.a2m = v; renderOpts(); }))],
      trim: () => [h('div', { class: 'row' }, inp('Start (seconds or hh:mm:ss)', 'start'), inp('End (empty = to the end)', 'end')),
        toggle('Exact cut (re-encode; otherwise fast, starts at the nearest key frame)', o.exact, (v) => { o.exact = v; update(); })],
      cutout: () => [h('div', { class: 'row' }, inp('Cut out from (seconds or mm:ss)', 'cutFrom'), inp('to', 'cutTo')), info2('The part between the two times is removed; what is before and after is joined (re-encoded).')],
      join: () => [sw('Fast — clips from the same camera or phone (no re-encoding)', 'joinFast'), info2('Otherwise every clip is fitted to the first clip\'s size (black bars where the shape differs), at 30 frames a second; a clip without sound gets silence.')],
      split: () => [field('Split by', segmented<string>([['time', 'Length of each part'], ['parts', 'Number of parts']], o.splitBy, (v) => { o.splitBy = v; renderOpts(); })),
        o.splitBy === 'time' ? sel('Each part', 'splitSec', [['10', '10 seconds'], ['30', '30 seconds'], ['60', '1 minute'], ['300', '5 minutes'], ['600', '10 minutes']]) : sel('Parts', 'splitParts', [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['10', '10']]),
        info2('No re-encoding: each part starts at a key frame, so the lengths are close to, not exactly, the chosen ones.')],
      loop: () => [sel('Make', 'loopKind', [['2', 'Twice'], ['3', '3 times'], ['5', '5 times'], ['10', '10 times'], ['boomerang', 'Boomerang (forwards, then backwards)']])],
      reverse: () => [info2('The whole clip backwards, picture and sound. It is held in memory: for long videos, trim first.')],
      compress: () => [field(`Quality (CRF ${o.crf}: lower = better, bigger)`, input({ type: 'range', min: 18, max: 35, value: o.crf, onInput: (v: string, el: HTMLInputElement) => { o.crf = +v; (el.closest('.field')!.querySelector('.field-label') as HTMLElement).textContent = `Quality (CRF ${v}: lower = better, bigger)`; update(); } })),
        sel('Encoding speed', 'speedPreset', [['ultrafast', 'Fastest (bigger file)'], ['veryfast', 'Fast'], ['medium', 'Slower (smaller file)']])],
      resize: () => [sel('Height', 'height', [['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p']])],
      crop: () => [sel('Shape (centre crop)', 'crop', [['16:9', '16:9'], ['9:16', '9:16 (Reels)'], ['1:1', '1:1 square'], ['4:5', '4:5'], ['4:3', '4:3']])],
      fit: () => [h('div', { class: 'row' }, sel('Shape', 'fitShape', [['9:16', '9:16 — Reels, Shorts, Stories (720 × 1280)'], ['16:9', '16:9 — YouTube (1280 × 720)'], ['1:1', '1:1 — square (720 × 720)'], ['4:5', '4:5 — Instagram feed (720 × 900)']]),
        sel('Around the video', 'fitBg', [['blur', 'Blurred copy of the video'], ['black', 'Black bars'], ['white', 'White bars']])), info2('The whole picture stays visible (nothing is cut off).')],
      rotate: () => [sel('Turn', 'rot', [['cw', '90° clockwise'], ['ccw', '90° anticlockwise'], ['180', '180°'], ['h', 'Mirror (left ↔ right)'], ['v', 'Flip (upside down)']])],
      fps: () => [sel('Frames per second', 'fps', [['60', '60'], ['30', '30'], ['25', '25'], ['24', '24'], ['15', '15']])],
      colours: () => [range('Brightness', 'bright', -30, 30, ' %'), range('Contrast', 'contrast', 50, 200, ' %'), range('Saturation', 'sat', 0, 300, ' %'), sw('Black and white', 'bw')],
      stabilise: () => [info2('Smooths a shaky hand-held video (FFmpeg\'s deshake): the picture is moved against the shake.')],
      denoise: () => [sel('Strength', 'denoise', [['light', 'Light'], ['medium', 'Medium'], ['strong', 'Strong (softer picture)']]), info2('Removes the grain of videos taken in low light (FFmpeg\'s hqdn3d).')],
      deinterlace: () => [info2('Removes the comb-like lines of interlaced video from old camcorders and TV recordings (FFmpeg\'s bwdif).')],
      fade: () => [h('div', { class: 'row' }, sel('Fade', 'fadeWhich', [['both', 'In and out'], ['in', 'In only'], ['out', 'Out only']]), sel('Length', 'fadeLen', [['0.5', '0.5 s'], ['1', '1 s'], ['2', '2 s'], ['3', '3 s']])), info2('The picture fades from and to black; the sound fades with it.')],
      text: () => [field('Text', h('textarea', { class: 'input', rows: 2, 'aria-label': 'Text', value: o.text, oninput: (e: Event) => { o.text = (e.target as HTMLTextAreaElement).value; update(); } })),
        h('div', { class: 'row' }, sel('Where', 'textPos', [['bottom', 'Bottom'], ['middle', 'Middle'], ['top', 'Top']]), sel('Size', 'textSize', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]), sel('Colour', 'textColour', [['white', 'White'], ['yellow', 'Yellow'], ['black', 'Black']])),
        sw('Dark box behind the text', 'textBox'), info2('For the whole video, in Noto Sans (Latin, Greek, Cyrillic, Devanagari).')],
      logo: () => [h('div', { class: 'row' }, sel('Where', 'logoPos', CORNERS), sel('Width', 'logoSize', [['10', '10 % of the video'], ['15', '15 %'], ['20', '20 %'], ['30', '30 %']]), sel('Opacity', 'logoOpacity', [['100', '100 %'], ['80', '80 %'], ['60', '60 %'], ['40', '40 %']])), info2('A PNG with a transparent background looks best.')],
      pip: () => [h('div', { class: 'row' }, sel('Where', 'pipPos', CORNERS), sel('Width', 'pipSize', [['25', '25 % of the video'], ['33', '33 %'], ['40', '40 %']])), info2('The small video plays in the corner from the start; the sound is the big video\'s.')],
      speed: () => [sel('Speed', 'speed', [['0.5', '0.5× (half speed)'], ['0.75', '0.75×'], ['1.25', '1.25×'], ['1.5', '1.5×'], ['2', '2×'], ['4', '4×']])],
      timelapse: () => [sel('Faster by', 'tlx', [['8', '8×'], ['16', '16×'], ['30', '30×'], ['60', '60× (a minute in a second)']]), info2('Without sound, at 30 frames a second.')],
      volume: () => [sel('Volume', 'vol', [['0.25', '25 % (much quieter)'], ['0.5', '50 %'], ['0.75', '75 %'], ['1.25', '125 %'], ['1.5', '150 %'], ['2', '200 % (twice as loud)'], ['3', '300 %']]), info2('Loud parts can clip above 100 % — "Normalise loudness" raises the level without clipping.')],
      loudnorm: () => [info2('EBU R128 loudness normalisation to −16 LUFS (streaming / podcast level), true peak −1.5 dB: a quiet file comes out louder, a loud one quieter — on purpose. Every other task keeps the sound at its own level.')],
      silence: () => [field('Remove', segmented<string>([['ends', 'At the start and end'], ['all', 'Every pause']], o.silWhere, (v) => { o.silWhere = v; renderOpts(); })),
        h('div', { class: 'row' }, o.silWhere === 'all' ? sel('Pauses longer than', 'silMin', [['0.5', '0.5 s'], ['1', '1 s'], ['2', '2 s']]) : null, sel('Counts as silence', 'silLevel', [['-40', 'Quiet (−40 dB)'], ['-50', 'Very quiet (−50 dB)'], ['-60', 'Almost nothing (−60 dB)']])),
        info2('The result is the sound only (removing time from a video would put picture and sound out of step).')],
      merge: () => [field('The new sound', segmented<string>([['replace', 'Replace the sound'], ['mix', 'Music under the sound']], o.mergeMode, (v) => { o.mergeMode = v; renderOpts(); })),
        o.mergeMode === 'mix' ? sel('Music volume', 'musicVol', [['10', '10 %'], ['20', '20 %'], ['30', '30 %'], ['50', '50 %'], ['100', '100 %']]) : null,
        info2(o.mergeMode === 'mix' ? 'The music repeats until the video ends; the video\'s own sound stays as it is.' : 'Video from the first file, sound from the second (re-encoded to AAC). The output stops at the shorter one.')],
      sound: () => [h('div', { class: 'row' }, sel('Channels', 'channels', [['keep', 'As they are'], ['1', 'Mono'], ['2', 'Stereo']]), sel('Sample rate', 'rate', [['keep', 'As it is'], ['44100', '44.1 kHz'], ['48000', '48 kHz']])),
        info2('Stereo puts a mono sound on both sides at its full level; 5.1 is mixed down as players do. Mono is the average of the two sides (as Audacity mixes them): a voice that is the same on both sides keeps its loudness, sound that differs between the sides comes out up to 3 dB quieter.')],
      subBurn: () => [info2('The subtitles become part of the picture (they show in every player). Text in Noto Sans.')],
      subAdd: () => [sel('Language', 'subLang', [['eng', 'English'], ['hin', 'Hindi'], ['mar', 'Marathi'], ['tam', 'Tamil'], ['tel', 'Telugu'], ['ben', 'Bengali'], ['fra', 'French'], ['spa', 'Spanish'], ['deu', 'German'], ['und', 'Not given']]), info2('A track the viewer can switch on and off. MP4 keeps text subtitles as "mov_text"; MKV keeps them as they are.')],
      subExtract: () => [sel('Save as', 'subFmt', [['srt', 'SRT'], ['vtt', 'WebVTT'], ['ass', 'ASS']])],
      // ================================================================ to-do #32
      remux: () => {
        let lines: string[] = [], why = '';
        try { lines = remuxPlan(p1).lines; } catch (e) { why = errMsg(e); }
        return [main && p1.streams.length ? (why ? note(why, 'warn') : field('What happens to each part', h('ul', { class: 'ff-list small' }, ...lines.map((l) => h('li', null, l))))) : null,
          info2('Copied as it is — an OBS recording takes seconds, the picture is never re-encoded. A sound an MP4 cannot hold as it is is made AAC, at its own level.')];
      },
      scenes: () => [sel('A new scene is', 'scSens', [['medium', 'a clear change (usual)'], ['high', 'any change (more pictures)'], ['low', 'a big change only (fewer pictures)']]),
        info2('A picture of the first frame and of every change of scene, each named by its time, as JPEGs in one zip — a storyboard. (The contact sheet takes pictures evenly instead.)')],
      sticker: () => [h('div', { class: 'row' }, inp('Start (seconds or mm:ss)', 'stStart'), sel('Length', 'stLen', [['1', '1 s'], ['2', '2 s'], ['3', '3 s'], ['5', '5 s'], ['8', '8 s'], ['10', '10 s']])),
        field('The square', segmented<string>([['crop', 'Filled (the middle of the picture)'], ['fit', 'The whole picture, transparent around it']], o.stFill, (v) => { o.stFill = v; update(); })),
        info2('An animated WebP of 512 × 512, at most 500 KB and 10 s — WhatsApp\'s rules for animated stickers. Bigger, it is made again with fewer pictures a second and a lower quality. Add it with a sticker-maker app (WhatsApp takes animated stickers from such apps).')],
      transitions: () => [h('div', { class: 'row' }, sel('Transition', 'xfType', XFADES), sel('Length', 'xfLen', [['0.5', '0.5 s'], ['1', '1 s'], ['1.5', '1.5 s'], ['2', '2 s']])),
        info2('Each clip is fitted to the first one\'s size (black bars where the shape differs), at 30 frames a second; the sound crossfades with the picture, at its level. Every transition overlaps two clips, so the result is that much shorter. Sound files are crossfaded too.')],
      bars: () => [info2('A first quick pass finds the picture inside the black bars (above and below, or at the sides) in the whole video; the bars are then cut off and the picture re-encoded.')],
      v360: () => [field('The video', segmented<string>([['equirect', 'A 360° video'], ['wide', 'A wide lens (GoPro, action camera)']], o.v360In, (v) => { o.v360In = v; renderOpts(); })),
        ...(o.v360In === 'wide'
          ? [sel('Straighten the lines', 'lens', [['medium', 'As a GoPro\'s wide lens needs'], ['light', 'A little'], ['strong', 'A lot']]), info2('The curve of a wide lens taken out (FFmpeg\'s lenscorrection): straight lines become straight; the corners of the picture are cut a little.')]
          : [field('Make', segmented<string>([['flat', 'A normal view'], ['planet', 'A tiny planet']], o.v360Out, (v) => { o.v360Out = v; renderOpts(); })),
            o.v360Out === 'planet' ? info2('The ground below becomes a little round world (1080 × 1080), the sky around it.')
              : stack(range('Look left (−) or right (+)', 'yaw', -180, 180, '°'), range('Look down (−) or up (+)', 'pitch', -90, 90, '°'), sel('Field of view', 'fov', [['60', '60° (closer)'], ['75', '75°'], ['90', '90°'], ['110', '110°'], ['130', '130° (wider)']]), info2('A 1280 × 720 view in that direction, as a normal camera would have filmed it.'))])],
      hdr: () => {
        const kind = p1.trc === 'arib-std-b67' ? 'HLG — as iPhones film' : p1.trc === 'smpte2084' ? 'PQ (HDR10) — as many Android phones film' : '';
        return [main && p1.video ? note(kind ? `This video is HDR: ${kind}.` : `This video is not HDR${p1.trc ? ` (its colours are ${p1.trc})` : ''} — nothing to convert.`, kind ? 'info' : 'warn') : null,
          info2('HDR looks washed out on most PCs, in WhatsApp and in many editors. This makes a normal (SDR) copy: the picture\'s white stays white, brighter highlights (up to 1000 cd/m²) are softly rounded off instead of cut, the colours made BT.709.')];
      },
      delogo: () => delogoPart(),
      chroma: () => [field('The screen\'s colour', segmented<string>([['green', 'Green'], ['blue', 'Blue'], ['custom', 'Another colour']], o.keyColour, (v) => { o.keyColour = v; renderOpts(); })),
        o.keyColour === 'custom' ? field('Colour', input({ type: 'color', value: o.keyCustom, onInput: (v: string) => { o.keyCustom = v; update(); }, attrs: { 'aria-label': 'The screen\'s colour' } })) : null,
        range('How much of the colour goes', 'keySim', 1, 60, ' %'), range('Softness of the edge', 'keyBlend', 0, 40, ' %'),
        info2('The second file — a photo or a video — fills the background (cut to the video\'s shape; a shorter video repeats); green or blue left on the edges is taken out. The sound is the first video\'s.')],
      stack: () => [field('Layout', segmented<string>([['side', 'Side by side'], ['above', 'One above the other'], ['grid', '2 × 2 grid']], o.stackLayout, (v) => { o.stackLayout = v; update(); })),
        sel('Sound', 'stackSound', [['1', 'The first video\'s'], ['2', 'The second\'s'], ['3', 'The third\'s'], ['4', 'The fourth\'s'], ['mix', 'All of them, mixed']]),
        info2('Side by side and one above the other take two videos, the grid three or four. Each is fitted to the first one\'s shape (black bars where the shape differs); a shorter one holds its last picture until the longest ends. Before / after: the two versions side by side.')],
      trails: () => [field('Effect', segmented<string>([['trails', 'Light trails (night traffic, sparklers)'], ['blur', 'Motion blur']], o.trailKind, (v) => { o.trailKind = v; update(); })),
        sel('Length', 'trailLen', [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']]), info2('Light trails: bright things leave a fading trail behind them (best at night, on a tripod). Motion blur: each picture blended with the ones before it.')],
      visualiser: () => [sel('Style', 'visStyle', [['bars', 'Bars and a scrolling picture of the notes'], ['spectrum', 'A scrolling spectrum'], ['scope', 'A stereo scope (stereo sound)']]),
        info2('A 1280 × 720 video at 25 frames a second with the sound at its own level — for a song or a podcast. With a picture chosen above, the bars or the spectrum run along its bottom, the scope in its middle.')],
      soundpic: () => [field('Picture', segmented<string>([['wave', 'Waveform (a strip for each channel)'], ['spectrogram', 'Spectrogram (the frequencies over time)']], o.picKind, (v) => { o.picKind = v; update(); })),
        info2('One PNG of the whole sound.')],
      slowmo: () => {
        const work = main && p1.dur ? slowmoSeconds(p1, +o.smX) : 0;
        return [h('div', { class: 'row' }, sel('Slower by', 'smX', [['2', '2× (half speed)'], ['4', '4×'], ['8', '8×']], () => renderOpts())),
          field('Sound', segmented<string>([['slow', 'Slowed down too (pitch kept)'], ['none', 'None']], o.smSound, (v) => { o.smSound = v; update(); })),
          info2(`Each picture in between is made by following the motion between two real ones (FFmpeg's minterpolate) — smooth, and slow in a browser: for short clips.${work ? ` This video: about ${work < 90 ? `${Math.max(1, Math.round(work))} s` : `${Math.round(work / 60)} min`} of work here.` : ''}`)];
      },
      evenout: () => [sel('How quickly the level follows', 'evenHow', [['moment', 'Moment by moment (a meeting)'], ['gentle', 'Gently (long turns, a lecture)'], ['fast', 'Quickly (a quick exchange)']]),
        info2('Quiet and loud speakers brought to one level as the file goes (FFmpeg\'s dynaudnorm): a quiet one is raised by up to 26 dB, the loudest peaks stay at −0.9 dBFS; the room\'s noise rises with a quiet speaker. "Normalise loudness" sets one level for the whole file instead.')],
      sync: () => [field('The sound', segmented<string>([['earlier', 'comes too late — move it earlier'], ['later', 'comes too early — move it later']], o.syncDir, (v) => { o.syncDir = v; update(); })),
        h('div', { class: 'row' }, inp('By', 'syncAmt', 'text', { attrs: { inputmode: 'decimal' } }), sel('Unit', 'syncUnit', [['ms', 'milliseconds'], ['s', 'seconds']])),
        info2('The picture is copied as it is; the sound is moved by that much (to the sample) and re-encoded, the file keeps its length. Find the amount on a clap, or on a word with clear lips.')],
      side: () => [field('The voice is on', segmented<string>([['auto', 'Find the side'], ['left', 'The left'], ['right', 'The right'], ['swap', 'Swap left and right']], o.sideWhich, (v) => { o.sideWhich = v; update(); })),
        info2('A lapel or phone microphone recorded on one channel: that side is put on both, at its own level, so it plays from both speakers. "Find the side" measures the two sides first.')],
      hum: () => [field('Mains frequency', segmented<string>([['50', '50 Hz (India, Europe, most of Asia and Africa)'], ['60', '60 Hz (the Americas, parts of Japan)']], o.humHz, (v) => { o.humHz = v; update(); })),
        info2('The hum\'s exact frequency is found first (the mains drifts by a tenth of a hertz), then it and its overtones up to ten times it are cut out with narrow notches — speech keeps its level within about half a decibel.')],
      bleep: () => [field('The stretches to bleep (from-to, separated by commas)', input({ value: o.bleepAt, placeholder: '1.2-1.8, 3:05-3:06.5', onInput: (v: string) => { o.bleepAt = v; update(); }, attrs: { 'aria-label': 'The stretches to bleep' } })),
        field('Bleep with', segmented<string>([['beep', 'A beep (1 kHz)'], ['silence', 'Silence']], o.bleepKind, (v) => { o.bleepKind = v; update(); })),
        info2('Times in seconds or minutes:seconds. The picture is copied as it is; the beep is as loud as the file.')],
      sfx: () => [sel('Effect', 'sfx', [['8d', '8D — the sound circling the head (headphones)'], ['slowed', 'Slowed + reverb'], ['bass', 'Bass boost'], ['phone', 'Telephone voice'], ['radio', 'Old radio'], ['echo', 'Echo']], () => renderOpts()),
        info2(`${o.sfx === 'slowed' ? 'Slowed to 85 % with the pitch lowered, as the songs do, with a room\'s reverb — a video\'s picture is slowed with it. ' : o.sfx === '8d' ? 'The sound moves slowly around the listener (once every 8 seconds) — made for headphones; stereo. ' : ''}The result is brought back to the file's own loudness, so the effect does not make it quieter or louder.`)],
      analyse: () => [field('Analyse', segmented<string>([['all', 'Picture and sound'], ['sound', 'The sound only (quicker)']], o.anWhat, (v) => { o.anWhat = v; update(); })),
        info2('Its loudness (LUFS, true peak, loudness range) and the times of black and frozen pictures and of silences — a report to read, copy and save. The file is not changed.')],
      meta: () => metaPart(),
      raw: () => [field('Arguments (inputs are in1.<ext>, in2.<ext>; the last name is the output)', input({ value: o.raw, onInput: (v: string) => { o.raw = v; update(); }, attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': 'FFmpeg arguments' } })),
        note('This single-threaded build cannot use libvpx-vp9 or libx265 (they wait for threads): use libvpx (VP8) or libx264. Its Opus encoder crashes on stereo at the default complexity, so a command that makes Opus without "-compression_level" gets "-compression_level:a 4". Press Stop if a command hangs.', 'warn')],
    };
    clear(opts).append(...parts[job]().filter((x): x is Node => !!x));
    update();
  }
  function renderClips() {
    if (main && !clips.length) clips = [{ file: main, name: in1(), probe: p1 }];
    clear(clipList).append(...clips.map((c, i) => h('li', { class: 'row' }, h('span', { class: 'file-name small' }, `${c.file.name}`), h('span', { class: 'muted small' }, c.probe.dur ? fmtTime(c.probe.dur) : ''),
      Object.assign(button('', () => { [clips[i - 1], clips[i]] = [clips[i], clips[i - 1]]; renderClips(); update(); }, { icon: 'ArrowUp', small: true, variant: 'ghost', title: `Move clip ${i + 1} earlier` }), { disabled: i === 0 }),
      Object.assign(button('', () => { clips.splice(i, 1); renderClips(); update(); }, { icon: 'X', small: true, variant: 'ghost', title: `Remove clip ${i + 1}` }), { disabled: clips.length <= 1 }))));
  }
  async function addClips(fs: File[]) {
    if (!main) return;
    if (!clips.length) clips = [{ file: main, name: in1(), probe: p1 }];
    for (const f of fs) {
      const name = `in${++clipSeq}.${extOfName(f.name)}`;
      const entry = { file: f, name, probe: EMPTY_PROBE };
      clips.push(entry); renderClips(); update();
      entry.probe = await probeFile(f, name).catch(() => EMPTY_PROBE);
      renderClips(); update();
    }
  }
  async function engine() {
    if (ff) return ff;
    return (loading ||= (async () => {
      const saying = loadedOnce ? 'Starting FFmpeg…' : 'Loading FFmpeg (≈ 31 MB, once per visit)…';
      // a note left by the job before ("Stopped: a new file was chosen") stays: the new file's probe needs a new FFmpeg
      // when that job was ended inside a command, and the loader wrote over the note, then cleared it
      if (!status.textContent || /^(Starting|Loading) FFmpeg/.test(status.textContent)) status.textContent = saying;
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const f = new FFmpeg(), at = (p: string) => new URL(p, document.baseURI).href;
      f.on('log', ({ message }: any) => { logLines.push(message); collect?.push(message); if (logLines.length > 400) logLines.splice(0, 100); });
      f.on('progress', ({ progress: p }: any) => onProg?.(Math.max(0, Math.min(1, p))));
      await f.load({ coreURL: at('vendor/ffmpeg/ffmpeg-core.js'), wasmURL: at('vendor/ffmpeg/ffmpeg-core.wasm') });
      ff = f; fontsIn = false; loadedOnce = true; jobsOnCore = 0;
      onLeave('ffmpeg', () => { try { f.terminate(); } catch { /* gone */ } ff = null; loading = null; });
      // only its own words go: "Stopped: a new file was chosen" (written meanwhile by the job it ended) was wiped by the
      // new file's probe starting FFmpeg again
      if (status.textContent === saying) status.textContent = '';
      return f;
    })().catch((e) => { loading = null; throw e; }));
  }
  /** Every file of the job, read in place (WORKERFS) under /in with its in<n> name. */
  async function mountInputs(f: any) {
    try { await f.unmount('/in'); } catch { /* not mounted */ }
    try { await f.createDir('/in'); } catch { /* exists */ }
    const files = [new File([main!], in1(), { type: main!.type }), ...(second ? [new File([second], in2(), { type: second.type })] : []), ...clips.filter((c) => c.name !== in1()).map((c) => new File([c.file], c.name, { type: c.file.type }))];
    await f.mount('WORKERFS', { files }, '/in');
  }
  /** What FFmpeg says about one file (mounted alone at /probe). */
  async function probeFile(file: File, name: string, wait = true): Promise<Probe> {
    if (wait) await runDone.catch(() => {});
    const f = await engine();
    try { await f.unmount('/probe'); } catch { /* */ }
    try { await f.createDir('/probe'); } catch { /* */ }
    await f.mount('WORKERFS', { files: [new File([file], name, { type: file.type })] }, '/probe');
    logLines = [];
    await f.exec(['-hide_banner', '-i', `/probe/${name}`]);
    const log = logLines.join('\n');
    try { await f.unmount('/probe'); } catch { /* */ }
    return parseProbe(log);
  }
  async function probe() {
    const my = main!;
    probing = (async () => {
      try {
        const pr = await probeFile(my, in1());
        if (my !== main) return;
        p1 = pr;
        streams = logLines.filter((l) => /Duration:|Stream #/.test(l)).join('\n');
        if (clips[0]?.file === my) clips[0].probe = pr;
        // a file in which FFmpeg finds no picture, sound or subtitles is said at once (it was only found out by a job)
        const why = !pr.video && !pr.audio && !pr.subs ? (logLines.find((l) => /Invalid data|could not find codec|no such file|end of file|moov atom not found|EBML header parsing failed/i.test(l)) || '').replace(/^.*?: /, '') : '';
        info.textContent = `${my.name} · ${fmtBytes(my.size)}${pr.dur ? ` · ${fmtTime(pr.dur)}` : ''}\n${!pr.video && !pr.audio && !pr.subs ? `FFmpeg finds no video, sound or subtitles in this file${why ? ` (${why.trim()})` : ''} — is it a media file?` : streams.replace(/^\s+/gm, '')}`;
        renderOpts(); // options that show what the file holds ("As it is (.m4a)", the MP4 plan, its metadata, HDR, the logo's picture)
      } catch (e) { info.textContent = `${my.name}: ${errMsg(e)}`; }
    })();
    return probing;
  }
  /** A picture of the main file at `t` s (FFmpeg writes PNG), for drawing the logo's box on. */
  const frames = new Map<string, Promise<Blob>>();
  function frameOf(file: File, t: number): Promise<Blob> {
    const key = `${file.name}|${file.size}|${file.lastModified}|${t}`;
    if (!frames.has(key)) frames.set(key, (async () => {
      await runDone.catch(() => {});
      const f = await engine();
      try { await f.unmount('/probe'); } catch { /* */ }
      try { await f.createDir('/probe'); } catch { /* */ }
      const name = `frame.${extOfName(file.name)}`;
      await f.mount('WORKERFS', { files: [new File([file], name, { type: file.type })] }, '/probe');
      const code = await f.exec(['-hide_banner', '-y', '-ss', String(t), '-i', `/probe/${name}`, '-frames:v', '1', '-update', '1', 'frame.png']);
      try { await f.unmount('/probe'); } catch { /* */ }
      if (code) throw new Error('FFmpeg could not take a picture from this video.');
      const data = await f.readFile('frame.png'); await f.deleteFile('frame.png');
      return new Blob([data as BlobPart], { type: 'image/png' });
    })().catch((e) => { frames.delete(key); throw e; }));
    return frames.get(key)!;
  }
  /** "Remove a logo": a picture of the video with a box to put over the logo — dragged, or typed in pixels. */
  function delogoPart(): Array<Node | null> {
    if (!main || !p1.video) return [info2('Choose a video: a picture of it appears here, with a box to put over the logo or the date stamp.')];
    const W = p1.w || 640, H = p1.h || 360;
    const canvas = h('canvas', { width: W, height: H, 'aria-label': 'A picture of the video: drag the box over the logo' }) as HTMLCanvasElement;
    const boxes: HTMLInputElement[] = [];
    const sync = () => { const r = box.rect(W, H); ['lgX', 'lgY', 'lgW', 'lgH'].forEach((k, i) => { o[k] = String(Math.round([r.x, r.y, r.w, r.h][i])); boxes[i].value = o[k]; }); update(); };
    const box = cropBox(canvas, sync);
    const place = () => { const v = ['lgX', 'lgY', 'lgW', 'lgH'].map((k) => +o[k]); if (v.every(Number.isFinite) && v[2] > 0 && v[3] > 0) box.setRect({ x: v[0] / W, y: v[1] / H, w: v[2] / W, h: v[3] / H }); };
    ['From the left', 'From the top', 'Width', 'Height'].forEach((label, i) => boxes.push(input({ type: 'number', value: o[['lgX', 'lgY', 'lgW', 'lgH'][i]], min: 0, max: i % 2 ? H : W, onInput: (v: string) => { o[['lgX', 'lgY', 'lgW', 'lgH'][i]] = v; place(); update(); }, attrs: { 'aria-label': `${label} (pixels)` } })));
    if (o.lgW === '' || +o.lgX + +o.lgW > W || +o.lgY + +o.lgH > H) box.setRect({ x: 0.74, y: 0.04, w: 0.22, h: 0.12 }); else place(); // logos usually sit at the top right
    const at = Math.max(0, Math.min(+o.lgAt || 0, p1.dur ? p1.dur - 0.05 : 1)), say = h('div', { class: 'muted small', 'aria-live': 'polite' }, 'Taking a picture of the video…');
    const my = main;
    frameOf(my, at).then(async (blob) => {
      if (my !== main) return;
      const bmp = await createImageBitmap(blob); canvas.getContext('2d')!.drawImage(bmp, 0, 0, W, H); bmp.close(); say.textContent = '';
    }).catch((e) => { say.textContent = errMsg(e); });
    return [h('div', { class: 'ff-frame' }, box.el), say,
      h('div', { class: 'row' }, ...boxes.map((b, i) => field(['From the left (px)', 'From the top (px)', 'Width (px)', 'Height (px)'][i], b))),
      h('div', { class: 'row' }, inp('Picture at (seconds)', 'lgAt', 'text', { attrs: { inputmode: 'decimal' } }), button('Show it', () => renderOpts(), { small: true, variant: 'secondary' })),
      info2('The box is filled from the pixels around it (FFmpeg\'s delogo): a logo on a calm background disappears best. Drag the box or its corners, or type where it is.')];
  }
  /** "Remove location and metadata": what the file says, before the copy is made. */
  function metaPart(): Array<Node | null> {
    if (!main) return [info2('Choose a video or a sound file: what it says about where, when and with what it was made is listed here.')];
    const pm = personalMeta(p1), ot = otherTracks(p1), groups = new Map<string, string[]>();
    for (const [g, text, where] of pm) { if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(where ? `${text} (${where})` : text); }
    if (p1.chapters) groups.set('Chapters', [`${p1.chapters} chapter${p1.chapters > 1 ? 's' : ''}${pm.some(([, , w]) => /^chapter/.test(w)) ? '' : ''}`]);
    if (ot.length) groups.set('Other tracks', ot);
    const list = [...groups].map(([g, items]) => h('div', null, h('strong', { class: 'small' }, g), h('ul', { class: 'ff-list small' }, ...items.map((t) => h('li', null, t)))));
    return [p1.streams.length ? (list.length ? field('What this file says', h('div', { class: 'stack' }, ...list)) : note('FFmpeg finds no place, date or device in this file — the copy is made all the same.', 'info')) : null,
      info2('A copy without all of it: the picture and the sound are copied as they are (nothing re-encoded), without the file\'s, the tracks\' and the chapters\' metadata, data tracks (GPS, timecode) and a cover picture. The copy is read again afterwards and what is left is said.')];
  }
  /** What is left in the copy "Remove location and metadata" made. */
  async function leftIn(file: { name: string; blob: Blob }) {
    const ext = extOf(file.name).toLowerCase() || 'bin', q = await probeFile(new File([file.blob], `check.${ext}`), `check.${ext}`, false);
    const left = [...personalMeta(q).map(([, t]) => t), ...otherTracks(q), ...(q.chapters ? [`${q.chapters} chapters`] : [])];
    return left.length ? `Still in the copy: ${left.join(' · ')}` : 'Checked: the copy says nothing of where, when or with what it was made — only the file format\'s own entries are left.';
  }
  async function fonts(f: any) {
    if (fontsIn) return;
    try { await f.createDir('/fonts'); } catch { /* exists */ }
    for (const n of FONTS) await f.writeFile(`/fonts/${n}`, new Uint8Array(await (await fetch(new URL(`vendor/fonts/${n}`, document.baseURI))).arrayBuffer()));
    fontsIn = true;
  }
  function run() { runDone = runJob(); return runDone; }
  async function runJob() {
    if (!main || running) return;
    running = true; stopNote = ''; runBtn.hidden = true; stopBtn.hidden = false; outCard.hidden = true; status.textContent = ''; status.classList.remove('err-text');
    const t0 = performance.now(), m = main, my = ++jobSeq, myJob = job; // the outputs are named after the file the job was run on
    // a job stopped before FFmpeg's command began (FFmpeg still loading, the file being mounted) ends at its next step —
    // it used to go on once FFmpeg had loaded and run to the end, after Stop or a new file
    const alive = () => { if (my !== jobSeq) throw new Error('stopped'); };
    let ran = false;
    try {
      await probing; alive();
      let b: Built = build(); // refusals before FFmpeg starts
      if (jobsOnCore >= RECYCLE && !execing) fresh(); // between jobs, never during one
      const f = await engine(); alive();
      await mountInputs(f); alive();
      /** one command; `keep`: its whole log is read (a measuring pass, a report, names) */
      const exec = async (bb: Built, what: string, keep: boolean) => {
        if (bb.fonts) { await fonts(f); alive(); }
        if (bb.writes) { try { await f.createDir('/work'); } catch { /* exists */ } for (const [path, text] of bb.writes) await f.writeFile(path, new TextEncoder().encode(text)); alive(); }
        const real = bb.args.map((a) => (/^in\d+\.\w+$/.test(a) ? `/in/${a}` : a));
        logLines = []; collect = keep ? [] : null;
        onProg = (p) => prog.set(p, `${what}… ${Math.round(p * 100)} %`);
        prog.set(null, `${what}…`);
        ran = true;
        let code: number;
        execing = true;
        try { code = await f.exec(['-hide_banner', '-y', ...real]); } finally { execing = false; jobsOnCore++; }
        const log = (collect ?? logLines).join('\n'); collect = null;
        alive();
        logBox.textContent = logLines.slice(-60).join('\n');
        if (code) throw new Error(`FFmpeg failed${what === 'Measuring' ? ' while measuring' : ''} (exit ${code}): ${logLines.filter((l) => /error|invalid|no such|failed|unknown|unable/i.test(l)).slice(0, 2).join(' · ') || 'see the log'}`);
        ran = false; // it ran to its end: a refusal after it ("No black bars were found") needs no new FFmpeg
        return log;
      };
      // a first command that only measures (black bars, the side of a voice, the hum, the loudness) decides the job
      if (b.then) b = b.then(await exec(b, 'Measuring', true));
      const notes: string[] = [];
      let files: Array<{ name: string; blob: Blob }> = [], report = '', what = 'Working';
      for (;;) {
        const log = await exec(b, what, !!(b.report || b.names));
        let names = b.outputs;
        if (b.pattern) names = (await f.listDir('/')).map((n: any) => n.name).filter((n: string) => b.pattern!.test(n)).sort();
        const shown = b.names ? b.names(names, log) : names;
        files = [];
        for (const [i, n] of names.entries()) {
          let data: Uint8Array;
          try { data = await f.readFile(n); await f.deleteFile(n); } catch { continue; /* not produced */ }
          let nm = shown[i] ?? n, blob = new Blob([data as BlobPart], { type: mimeOf(nm) });
          if (b.jpeg && nm.endsWith('.png')) { blob = await encodeImg(await loadImg(blob), 'jpeg', 90); nm = asJpegName(nm); } // MozJPEG
          files.push({ name: nm.startsWith('out.') ? `${baseName(m.name)}-out.${extOf(nm)}` : b.pattern ? nm : `${baseName(m.name)}-${nm}`, blob });
        }
        alive();
        if (b.report) report = b.report(log);
        // too big (the sticker): made again with the next settings
        const nx = b.next ? b.next(files.reduce((sum, x) => sum + x.blob.size, 0)) : null;
        if (nx && typeof nx === 'object') { b = nx; what = 'Too big — making it again, smaller'; continue; }
        if (b.note) notes.push(b.note);
        if (typeof nx === 'string') notes.push(nx);
        break;
      }
      if (!files.length && !report) throw new Error('No output file was produced.');
      if (myJob === 'meta' && files[0]) notes.push(await leftIn(files[0]));
      alive();
      if (!live || m !== main) return;
      status.textContent = '';
      showOutputs(files, performance.now() - t0, b.zip, m, myJob, notes, report);
    } catch (e) {
      if (!live) return;
      if (stopNote) { status.textContent = stopNote; return; } // stopped on purpose: no error
      if (ran) fresh();
      status.textContent = errMsg(e); status.classList.add('err-text'); toast(errMsg(e), 'err'); logBox.textContent = logLines.slice(-60).join('\n'); (logBox.parentElement as HTMLDetailsElement).open = /FFmpeg failed/.test(errMsg(e));
    } finally { running = false; collect = null; prog.done(); runBtn.hidden = false; stopBtn.hidden = true; }
  }
  /** End the running job (FFmpeg is busy in one long call: the worker is ended; the next job starts a new one). */
  function stopJob(why: string) {
    if (!running) return;
    stopNote = why; jobSeq++; // the job ends at its next step
    if (!execing) return; // FFmpeg is loading or the files are being mounted: the instance stays for what comes next
    try { ff?.terminate(); } catch { /* gone */ }
    ff = null; loading = null; fontsIn = false;
  }
  /** A new FFmpeg after a job FFmpeg ran and failed — not after a refusal, which never reached it (cheap insurance: ffmpeg.wasm runs every exec in one module instance). The page
   *  crashes and the later "function signature mismatch" of Nov 2026 were the core's JPEG encoder overflowing a buffer
   *  at -q:v 2 (memory damaged for the jobs after it) — JPEG now comes from MozJPEG (`jpeg` in src/lib/ffjobs.ts). */
  function fresh() { try { ff?.terminate(); } catch { /* gone */ } ff = null; loading = null; fontsIn = false; }
  const mimeOf = (n: string) => ({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', gif: 'image/gif', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', mka: 'audio/x-matroska', '3gp': 'video/3gpp', srt: 'application/x-subrip', vtt: 'text/vtt', ass: 'text/x-ssa' } as Record<string, string>)[extOf(n).toLowerCase()] || 'application/octet-stream';
  let urls: string[] = [];
  async function showOutputs(files: Array<{ name: string; blob: Blob }>, ms: number, zip = 'files', m: File = main!, of: Job = job, notes: string[] = [], report = '') {
    urls.forEach(URL.revokeObjectURL); urls = [];
    clear(outs);
    const total = files.reduce((a, f) => a + f.blob.size, 0);
    outs.append(h('div', { class: 'muted small' }, files.length ? `${files.length} file${files.length > 1 ? 's' : ''} · ${fmtBytes(total)} · ${(ms / 1000).toFixed(1)} s` : `${(ms / 1000).toFixed(1)} s`));
    for (const n of notes) outs.append(note(n, /^(Even at|Still in)/.test(n) ? 'warn' : 'info'));
    if (report) {
      const name = `${baseName(m.name)}-analysis.txt`;
      outs.append(h('pre', { class: 'ff-report', tabindex: '0', 'aria-label': 'The report' }, report),
        h('div', { class: 'row' }, button('Copy the report', () => copy(report), { icon: 'Copy', small: true, variant: 'secondary' }), button(`Download ${name}`, () => downloadBlob(new Blob([report + '\n'], { type: 'text/plain' }), name), { icon: 'Download', small: true, variant: 'primary' })));
    }
    if (files.length > 1) {
      outs.append(h('div', { class: 'row' }, button(`Download all as .zip (${files.length})`, async () => { const { zipFiles } = await import('../lib/zip'); downloadBlob(await zipFiles(files), `${baseName(m.name)}-${zip}.zip`); }, { icon: 'Download', variant: 'primary' })));
    }
    for (const f of files.slice(0, 60)) {
      const u = URL.createObjectURL(f.blob); urls.push(u);
      const t = f.blob.type, media = t.startsWith('video/') ? h('video', { src: u, controls: true, class: 'ff-media' }) : t.startsWith('audio/') ? h('audio', { src: u, controls: true }) : t.startsWith('image/') ? h('img', { src: u, class: 'ff-media', alt: f.name }) : null;
      // an extracted sound that is not MP3 can be had as MP3 at once (to-do #22: "Download as MP3" beside the .m4a)
      const asMp3 = of === 'audio' && files.length === 1 && extOf(f.name).toLowerCase() !== 'mp3'
        ? button('Download as MP3', (e: Event) => toMp3(f, e.currentTarget as HTMLButtonElement), { icon: 'Music', small: true, variant: 'secondary', title: 'The sound just extracted, made MP3 at the quality chosen under MP3' }) : null;
      outs.append(h('div', { class: 'ff-out' }, h('div', { class: 'row' }, h('strong', null, f.name), h('span', { class: 'muted small' }, fmtBytes(f.blob.size)),
        button('Download', () => downloadBlob(f.blob, f.name), { icon: 'Download', small: true, variant: files.length > 1 ? 'secondary' : 'primary' }), asMp3), files.length <= 6 ? media : null));
    }
    outCard.hidden = false;
  }

  /** The extracted sound made MP3 by the same FFmpeg — no second run of the job; once made, a second click downloads it. */
  const mp3Made = new WeakMap<Blob, Blob>();
  async function toMp3(f: { name: string; blob: Blob }, btn: HTMLButtonElement) {
    const name = f.name.replace(/\.[^.]+$/, '') + '.mp3', done = mp3Made.get(f.blob);
    if (done) { downloadBlob(done, name); return; }
    if (running) { toast('A job is running — wait for it to end.', 'info'); return; }
    running = true; stopNote = ''; runBtn.hidden = true; stopBtn.hidden = false; btn.disabled = true; status.textContent = ''; status.classList.remove('err-text');
    const my = ++jobSeq, alive = () => { if (my !== jobSeq) throw new Error('stopped'); };
    let ran = false;
    try {
      const fx = await engine(); alive();
      try { await fx.unmount('/mp3in'); } catch { /* not mounted */ }
      try { await fx.createDir('/mp3in'); } catch { /* exists */ }
      const src = `sound.${extOf(f.name).toLowerCase() || 'bin'}`;
      await fx.mount('WORKERFS', { files: [new File([f.blob], src, { type: f.blob.type })] }, '/mp3in'); alive();
      const b = mp3Of(`/mp3in/${src}`, o.mp3q);
      logLines = []; onProg = (p) => prog.set(p, `Making the MP3… ${Math.round(p * 100)} %`); prog.set(null, 'Making the MP3…');
      ran = true;
      let code: number;
      execing = true;
      try { code = await fx.exec(['-hide_banner', '-y', ...b.args]); } finally { execing = false; jobsOnCore++; }
      alive();
      try { await fx.unmount('/mp3in'); } catch { /* */ }
      if (code) throw new Error(`FFmpeg failed (exit ${code}): ${logLines.filter((l) => /error|invalid|failed/i.test(l)).slice(0, 2).join(' · ') || 'see the log'}`);
      const data = await fx.readFile(b.outputs[0]); await fx.deleteFile(b.outputs[0]);
      const mp3 = new Blob([data as BlobPart], { type: 'audio/mpeg' });
      mp3Made.set(f.blob, mp3);
      if (!live) return;
      downloadBlob(mp3, name);
      status.textContent = `${name} · ${fmtBytes(mp3.size)}`;
    } catch (e) {
      if (!live) return;
      if (stopNote) { status.textContent = stopNote; return; }
      if (ran) fresh();
      status.textContent = errMsg(e); status.classList.add('err-text'); toast(errMsg(e), 'err'); logBox.textContent = logLines.slice(-60).join('\n');
    } finally { running = false; prog.done(); runBtn.hidden = false; stopBtn.hidden = true; btn.disabled = false; }
  }

  const info = h('pre', { class: 'ff-info muted small' });
  const takeMain = (f: File) => {
    stopJob(`Stopped: a new file was chosen (${f.name}).`); // the running job was of the file before
    main = f; second = null; p2 = undefined; p1 = EMPTY_PROBE; clips = []; clipSeq = 2; secondInfo.textContent = ''; work.hidden = false; picker.classList.add('drop-compact'); info.textContent = f.name; renderOpts(); probe();
  };
  const picker = filePicker({ accept: 'video/*,audio/*,image/*,.mkv,.flv,.avi,.ts,.m2ts,.wmv,.wma,.opus,.flac', label: 'Choose a video or audio file', hint: 'Any format FFmpeg reads — up to about 2 GB', onFiles: ([f]) => { mainCam.stop(); takeMain(f); } });
  // a picture from the webcam as the file to work on (owner, 21 Nov 2026: the camera wherever a picture can be chosen)
  const mainCam = liveCamera({ instead: 'choose a file instead', onSnap: async (_img, file) => takeMain(await file()) });
  // the task list, in groups (a native select: keyboard, type-ahead and screen readers as everywhere)
  const jobSel = h('select', { class: 'input select', 'aria-label': 'Task' }, ...JOB_GROUPS.map(([g, list]) => h('optgroup', { label: g }, ...list.map(([v, l]) => h('option', { value: v }, l)))));
  jobSel.value = job;
  jobSel.addEventListener('change', () => { job = jobSel.value as Job; renderOpts(); });
  const runBtn = button('Run FFmpeg', () => run(), { icon: 'Play', variant: 'primary' });
  const stopBtn = button('Stop', () => { stopJob('Stopped.'); toast('Stopped', 'info'); }, { icon: 'Square', variant: 'danger' }); stopBtn.hidden = true;
  const editRaw = button('Edit as arguments', () => {
    try {
      const b = build();
      if (b.then) { toast('This task runs two commands — the first measures what the second needs — so it cannot be edited as one.', 'info'); return; }
      job = 'raw'; o.raw = b.args.join(' '); jobSel.value = 'raw'; renderOpts();
    } catch (e) { toast(errMsg(e), 'err'); }
  }, { icon: 'Terminal', small: true, variant: 'ghost' });
  work.append(
    card('Input', info, secondBox),
    card('What to do', stack(field('Task', jobSel), joinBox, opts, field('Command (copy it to run FFmpeg on your computer)', cmd), h('div', { class: 'row' }, editRaw))),
    prog, status, outCard,
    h('details', { class: 'rec-opts' }, h('summary', null, 'FFmpeg log'), logBox));
  root.append(card(null, stack(picker, mainCam.el)), work, actions(runBtn, stopBtn),
    note('FFmpeg 5.1 runs here as WebAssembly on one CPU core: re-encoding is ~10–20× slower than native FFmpeg. Fast tasks (trim without re-encoding, extract audio, remove audio) take seconds.', 'info'));
  return () => { live = false; stopNote = 'left'; urls.forEach(URL.revokeObjectURL); };
};
