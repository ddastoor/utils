// FFmpeg (PC): FFmpeg 5.1 compiled to WebAssembly (ffmpeg.wasm single-threaded core: libx264/x265, libvpx, LAME,
// Opus, Vorbis, Theora, WebP, freetype/libass, zimg) running in its own worker. Inputs are mounted read-only
// (WORKERFS, not copied into memory). Each task (src/lib/ffjobs.ts) builds an argument list; the equivalent command
// line is shown so it can be copied to a real terminal, or edited in "Your own arguments".
import { h, card, field, actions, button, select, input, segmented, toggle, slider, stack, note, progress, filePicker, outputBox, toast, errMsg, fmtBytes, fmtTime, baseName, extOf, downloadBlob, clear, type Mount } from '../ui';
import { onLeave } from '../lifecycle';
import { JOB_GROUPS, DEFAULTS, EMPTY_PROBE, buildJob, parseProbe, secondFor, asJpegName, type Job, type Probe, type JobCtx } from '../lib/ffjobs';
import { loadImg, encodeImg } from '../lib/imgio';
import { liveCamera } from '../lib/livecam';

const FORMATS: Array<[string, string]> = [['mp4', 'MP4 (H.264 + AAC)'], ['webm', 'WebM (VP8 + Opus)'], ['mkv', 'MKV (copy streams)'], ['mov', 'MOV (H.264 + AAC)'], ['mp3', 'MP3 audio'], ['m4a', 'M4A audio (AAC)'], ['wav', 'WAV audio'], ['flac', 'FLAC audio'], ['ogg', 'OGG audio (Opus)'], ['gif', 'GIF']];
const quote = (s: string) => (/^[\w.\-/:=]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`);
const FONTS = ['NotoSans_400Regular.ttf', 'NotoSans_700Bold.ttf'];

export const mount: Mount = (root) => {
  let ff: any = null, loading: Promise<any> | null = null, running = false, onProg: ((p: number) => void) | null = null;
  // a job ended by Stop, by a new file or by leaving the tab says so (it showed "called FFmpeg.terminate()" in red);
  // probes of a second file or of clips wait for a running job (they reset its log and shared its FFmpeg)
  let stopNote = '', live = true, runDone: Promise<void> = Promise.resolve();
  let jobSeq = 0, execing = false; // the job being run (Stop and a new file end it); FFmpeg inside a command
  let main: File | null = null, second: File | null = null, logLines: string[] = [], streams = '';
  let p1: Probe = EMPTY_PROBE, p2: Probe | undefined, probing: Promise<void> = Promise.resolve(), fontsIn = false, loadedOnce = false;
  /** the clips of "Join clips": the chosen file first; each added clip gets the name in3, in4 … inside FFmpeg */
  let clips: Array<{ file: File; name: string; probe: Probe }> = [], clipSeq = 2;
  let job: Job = 'convert';
  const o: Record<string, any> = { ...DEFAULTS };
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
      cmd.value = `ffmpeg ${args.map((a) => quote(show(a))).join(' ')}${b.jpeg ? '\n# then PNG → JPEG with MozJPEG (quality 90)' : ''}`;
    } catch (e) { cmd.value = errMsg(e); }
  }
  const sel = (label: string, key: string, options: Array<[string, string]>, after?: () => void) => field(label, select<string>(options, o[key], (v) => { o[key] = v; after?.(); update(); }));
  const inp = (label: string, key: string, type = 'text', extra: any = {}) => field(label, input({ type, value: o[key], ...extra, onInput: (v: string) => { o[key] = v; update(); } }));
  const sw = (label: string, key: string) => toggle(label, !!o[key], (v) => { o[key] = v; update(); });
  const range = (label: string, key: string, min: number, max: number, unit: string) => slider({ label, min, max, value: o[key], unit, onInput: (v) => { o[key] = v; update(); } });
  const info2 = (t: string) => note(t, 'info');
  const CORNERS: Array<[string, string]> = [['br', 'Bottom right'], ['bl', 'Bottom left'], ['tr', 'Top right'], ['tl', 'Top left'], ['c', 'Centre']];
  function renderOpts() {
    const sec = secondFor(job, o);
    secondBox.hidden = !sec;
    if (sec) { secondPick.querySelector('strong')!.textContent = sec.label; secondPick.querySelector('input')!.setAttribute('accept', sec.accept); }
    secondCam.el.hidden = !sec || !/image\//.test(sec.accept); // hidden, its camera closes
    joinBox.hidden = job !== 'join';
    if (job === 'join') renderClips();
    const parts: Record<Job, () => Array<Node | null>> = {
      convert: () => [sel('To', 'fmt', FORMATS)],
      audio: () => [sel('Audio as', 'aud', [['copy', 'Keep the original codec (no quality loss)'], ['mp3', 'MP3'], ['wav', 'WAV']])],
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
      f.on('log', ({ message }: any) => { logLines.push(message); if (logLines.length > 400) logLines.splice(0, 100); });
      f.on('progress', ({ progress: p }: any) => onProg?.(Math.max(0, Math.min(1, p))));
      await f.load({ coreURL: at('vendor/ffmpeg/ffmpeg-core.js'), wasmURL: at('vendor/ffmpeg/ffmpeg-core.wasm') });
      ff = f; fontsIn = false; loadedOnce = true;
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
  async function probeFile(file: File, name: string): Promise<Probe> {
    await runDone.catch(() => {});
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
        if (job === 'join') renderClips();
        update();
      } catch (e) { info.textContent = `${my.name}: ${errMsg(e)}`; }
    })();
    return probing;
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
    const t0 = performance.now(), m = main, my = ++jobSeq; // the outputs are named after the file the job was run on
    // a job stopped before FFmpeg's command began (FFmpeg still loading, the file being mounted) ends at its next step —
    // it used to go on once FFmpeg had loaded and run to the end, after Stop or a new file
    const alive = () => { if (my !== jobSeq) throw new Error('stopped'); };
    let ran = false;
    try {
      await probing; alive();
      const b = build(); // refusals before FFmpeg starts
      const f = await engine(); alive();
      await mountInputs(f); alive();
      if (b.fonts) { await fonts(f); alive(); }
      if (b.writes) { try { await f.createDir('/work'); } catch { /* exists */ } for (const [path, text] of b.writes) await f.writeFile(path, new TextEncoder().encode(text)); alive(); }
      const real = b.args.map((a) => (/^in\d+\.\w+$/.test(a) ? `/in/${a}` : a));
      logLines = [];
      onProg = (p) => prog.set(p, `Working… ${Math.round(p * 100)} %`);
      prog.set(null, 'Working…');
      ran = true;
      let code: number;
      execing = true;
      try { code = await f.exec(['-hide_banner', '-y', ...real]); } finally { execing = false; }
      alive();
      let names = b.outputs;
      if (b.pattern) names = (await f.listDir('/')).map((n: any) => n.name).filter((n: string) => b.pattern!.test(n)).sort();
      const files: Array<{ name: string; blob: Blob }> = [];
      for (const n of names) {
        let data: Uint8Array;
        try { data = await f.readFile(n); await f.deleteFile(n); } catch { continue; /* not produced */ }
        let blob = new Blob([data as BlobPart], { type: mimeOf(n) }), nm = n;
        if (b.jpeg && n.endsWith('.png')) { blob = await encodeImg(await loadImg(blob), 'jpeg', 90); nm = asJpegName(n); } // MozJPEG
        files.push({ name: nm.startsWith('out.') ? `${baseName(m.name)}-out.${extOf(nm)}` : b.pattern ? nm : `${baseName(m.name)}-${nm}`, blob });
      }
      alive();
      logBox.textContent = logLines.slice(-60).join('\n');
      if (code) throw new Error(`FFmpeg failed (exit ${code}): ${logLines.filter((l) => /error|invalid|no such|failed|unknown|unable/i.test(l)).slice(0, 2).join(' · ') || 'see the log'}`);
      if (!files.length) throw new Error('No output file was produced.');
      if (!live || m !== main) return;
      status.textContent = '';
      showOutputs(files, performance.now() - t0, b.zip, m);
    } catch (e) {
      if (!live) return;
      if (stopNote) { status.textContent = stopNote; return; } // stopped on purpose: no error
      if (ran) fresh();
      status.textContent = errMsg(e); status.classList.add('err-text'); toast(errMsg(e), 'err'); logBox.textContent = logLines.slice(-60).join('\n'); (logBox.parentElement as HTMLDetailsElement).open = true;
    } finally { running = false; prog.done(); runBtn.hidden = false; stopBtn.hidden = true; }
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
  const mimeOf = (n: string) => ({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', gif: 'image/gif', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', mka: 'audio/x-matroska', srt: 'application/x-subrip', vtt: 'text/vtt', ass: 'text/x-ssa' } as Record<string, string>)[extOf(n)] || 'application/octet-stream';
  let urls: string[] = [];
  async function showOutputs(files: Array<{ name: string; blob: Blob }>, ms: number, zip = 'files', m: File = main!) {
    urls.forEach(URL.revokeObjectURL); urls = [];
    clear(outs);
    const total = files.reduce((a, f) => a + f.blob.size, 0);
    outs.append(h('div', { class: 'muted small' }, `${files.length} file${files.length > 1 ? 's' : ''} · ${fmtBytes(total)} · ${(ms / 1000).toFixed(1)} s`));
    if (files.length > 1) {
      outs.append(h('div', { class: 'row' }, button(`Download all as .zip (${files.length})`, async () => { const { zipFiles } = await import('../lib/zip'); downloadBlob(await zipFiles(files), `${baseName(m.name)}-${zip}.zip`); }, { icon: 'Download', variant: 'primary' })));
    }
    for (const f of files.slice(0, 60)) {
      const u = URL.createObjectURL(f.blob); urls.push(u);
      const t = f.blob.type, media = t.startsWith('video/') ? h('video', { src: u, controls: true, class: 'ff-media' }) : t.startsWith('audio/') ? h('audio', { src: u, controls: true }) : t.startsWith('image/') ? h('img', { src: u, class: 'ff-media', alt: f.name }) : null;
      outs.append(h('div', { class: 'ff-out' }, h('div', { class: 'row' }, h('strong', null, f.name), h('span', { class: 'muted small' }, fmtBytes(f.blob.size)),
        button('Download', () => downloadBlob(f.blob, f.name), { icon: 'Download', small: true, variant: files.length > 1 ? 'secondary' : 'primary' })), files.length <= 6 ? media : null));
    }
    outCard.hidden = false;
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
  const editRaw = button('Edit as arguments', () => { try { const a = build().args.join(' '); job = 'raw'; o.raw = a; jobSel.value = 'raw'; renderOpts(); } catch (e) { toast(errMsg(e), 'err'); } }, { icon: 'Terminal', small: true, variant: 'ghost' });
  work.append(
    card('Input', info, secondBox),
    card('What to do', stack(field('Task', jobSel), joinBox, opts, field('Command (copy it to run FFmpeg on your computer)', cmd), h('div', { class: 'row' }, editRaw))),
    prog, status, outCard,
    h('details', { class: 'rec-opts' }, h('summary', null, 'FFmpeg log'), logBox));
  root.append(card(null, stack(picker, mainCam.el)), work, actions(runBtn, stopBtn),
    note('FFmpeg 5.1 runs here as WebAssembly on one CPU core: re-encoding is ~10–20× slower than native FFmpeg. Fast tasks (trim without re-encoding, extract audio, remove audio) take seconds.', 'info'));
  return () => { live = false; stopNote = 'left'; urls.forEach(URL.revokeObjectURL); };
};
