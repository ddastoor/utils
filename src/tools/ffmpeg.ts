// FFmpeg (PC): FFmpeg 5.1 compiled to WebAssembly (ffmpeg.wasm single-threaded core: libx264/x265, libvpx, LAME,
// Opus, Vorbis, Theora, WebP, freetype/libass, zimg) running in its own worker. Inputs are mounted read-only
// (WORKERFS, not copied into memory). Each preset builds an argument list; the equivalent command line is shown
// so it can be copied to a real terminal, or edited in "Your own arguments".
import { h, card, field, actions, button, select, input, segmented, toggle, stack, note, progress, filePicker, outputBox, toast, errMsg, fmtBytes, fmtTime, baseName, extOf, downloadBlob, clear, type Mount } from '../ui';
import { onLeave } from '../lifecycle';

type Preset = 'convert' | 'audio' | 'mute' | 'trim' | 'compress' | 'resize' | 'fps' | 'rotate' | 'crop' | 'gif' | 'merge' | 'loudnorm' | 'speed' | 'frames' | 'audio2mp4' | 'raw';
const PRESETS: Array<[Preset, string]> = [
  ['convert', 'Convert format'], ['audio', 'Extract audio'], ['mute', 'Remove audio'], ['trim', 'Trim / cut'], ['compress', 'Compress video'],
  ['resize', 'Resize'], ['fps', 'Frame rate'], ['rotate', 'Rotate / flip'], ['crop', 'Crop'], ['gif', 'Video → GIF'], ['merge', 'Add audio to video'],
  ['loudnorm', 'Normalise loudness'], ['speed', 'Speed up / slow down'], ['frames', 'Extract frames'], ['audio2mp4', 'Audio → MP4 video'], ['raw', 'Your own arguments'],
];
const FORMATS: Array<[string, string]> = [['mp4', 'MP4 (H.264 + AAC)'], ['webm', 'WebM (VP8 + Opus)'], ['mkv', 'MKV (copy streams)'], ['mov', 'MOV (H.264 + AAC)'], ['mp3', 'MP3 audio'], ['m4a', 'M4A audio (AAC)'], ['wav', 'WAV audio'], ['flac', 'FLAC audio'], ['ogg', 'OGG audio (Opus)'], ['gif', 'GIF']];
const AUDIO_EXT: Record<string, string> = { aac: 'm4a', mp3: 'mp3', opus: 'ogg', vorbis: 'ogg', flac: 'flac', pcm_s16le: 'wav', alac: 'm4a' };
const AUDIO_ONLY = /^(mp3|m4a|aac|wav|flac|ogg|opus|wma)$/i;
/** "90", "1:30", "00:01:30.5" → seconds */
const secs = (t: string) => String(t).trim().split(':').reduce((a, p) => a * 60 + (+p || 0), 0);
const quote = (s: string) => (/^[\w.\-/:=]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`);

export const mount: Mount = (root) => {
  let ff: any = null, loading: Promise<any> | null = null, running = false, onProg: ((p: number) => void) | null = null;
  let main: File | null = null, second: File | null = null, logLines: string[] = [], streams = '', mainDur = 0;
  let preset: Preset = 'convert';
  const o: Record<string, any> = { fmt: 'mp4', aud: 'copy', start: '0', end: '', exact: false, crf: 28, speedPreset: 'veryfast', height: '720', fps: '30', rot: 'cw', crop: '16:9', gifW: '480', gifFps: '12', speed: '2', frameFps: '1', frameFmt: 'png', a2m: 'still', raw: '-i in1.mp4 -vf hflip -c:a copy out.mp4' };
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const cmd = outputBox({ rows: 3, mono: true });
  const opts = h('div', { class: 'stack' });
  const outs = h('div', { class: 'stack' });
  const outCard = card('Output', outs); outCard.hidden = true;
  const logBox = h('pre', { class: 'ff-log' });
  const work = h('div', { class: 'stack', hidden: true });
  const secondPick = filePicker({ accept: 'audio/*,image/*,video/*', label: 'Second file', compact: true, onFiles: ([f]) => { second = f; secondInfo.textContent = `${f.name} · ${fmtBytes(f.size)}`; update(); } });
  const secondInfo = h('div', { class: 'muted small' });
  const secondBox = h('div', { class: 'stack' }, secondPick, secondInfo); secondBox.hidden = true;

  const in1 = () => `in1.${extOf(main?.name || 'x.mp4') || 'bin'}`, in2 = () => `in2.${extOf(second?.name || 'x.bin') || 'bin'}`;
  const isAudio = () => !!main && (main.type.startsWith('audio/') || AUDIO_ONLY.test(extOf(main.name)));
  /** Arguments for ffmpeg (input names in1.*, in2.*), and the output file names to collect. */
  function build(): { args: string[]; outputs: string[]; pattern?: RegExp } {
    const I = ['-i', in1()];
    switch (preset) {
      case 'convert': {
        const f = o.fmt, out = `out.${f}`;
        const enc: Record<string, string[]> = {
          mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
          mov: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'],
          // VP8: libvpx-vp9 and libx265 wait forever for worker threads in this single-threaded core
          webm: ['-c:v', 'libvpx', '-b:v', '1M', '-crf', '10', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-b:a', '128k'],
          mkv: ['-c', 'copy'], mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'], m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'], wav: ['-vn', '-c:a', 'pcm_s16le'],
          flac: ['-vn', '-c:a', 'flac'], ogg: ['-vn', '-c:a', 'libopus', '-b:a', '128k'],
          gif: ['-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0'],
        };
        return { args: [...I, ...enc[f], out], outputs: [out] };
      }
      case 'audio': {
        const m = /Audio: (\w+)/.exec(streams)?.[1] || 'aac';
        if (o.aud === 'copy') { const out = `audio.${AUDIO_EXT[m] || 'mka'}`; return { args: [...I, '-vn', '-c:a', 'copy', out], outputs: [out] }; }
        const out = `audio.${o.aud}`;
        return { args: [...I, '-vn', ...(o.aud === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '2'] : ['-c:a', 'pcm_s16le']), out], outputs: [out] };
      }
      case 'mute': { const out = `out.${extOf(main!.name) || 'mp4'}`; return { args: [...I, '-c:v', 'copy', '-an', out], outputs: [out] }; }
      case 'trim': {
        const out = `out.${extOf(main!.name) || 'mp4'}`, s0 = secs(o.start || '0'), s1 = o.end ? secs(o.end) : NaN;
        if (o.end && !(s1 > s0)) throw new Error('The end must be after the start.');
        const ss = ['-ss', String(s0)], dur = o.end ? ['-t', String(+(s1 - s0).toFixed(3))] : [];
        return o.exact ? { args: [...I, ...ss, ...dur, ...(isAudio() ? [] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p']), out], outputs: [out] }
          : { args: [...ss, ...I, ...dur, '-c', 'copy', out], outputs: [out] }; // the MP4 edit list starts playback at the cut
      }
      case 'compress': return { args: [...I, '-c:v', 'libx264', '-preset', o.speedPreset, '-crf', String(o.crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'out.mp4'], outputs: ['out.mp4'] };
      case 'resize': return { args: [...I, '-vf', `scale=-2:${o.height}:flags=lanczos,setsar=1`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'copy', 'out.mp4'], outputs: ['out.mp4'] };
      case 'fps': return { args: [...I, '-vf', `fps=${o.fps}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'copy', 'out.mp4'], outputs: ['out.mp4'] };
      case 'rotate': {
        const vf: Record<string, string> = { cw: 'transpose=1', ccw: 'transpose=2', '180': 'transpose=1,transpose=1', h: 'hflip', v: 'vflip' };
        return { args: [...I, '-vf', vf[o.rot], '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', 'out.mp4'], outputs: ['out.mp4'] };
      }
      case 'crop': {
        const [a, b] = String(o.crop).split(':').map(Number);
        const vf = `crop='min(iw,ih*${a}/${b})':'min(ih,iw*${b}/${a})'`;
        return { args: [...I, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', 'out.mp4'], outputs: ['out.mp4'] };
      }
      case 'gif': return { args: [...I, '-vf', `fps=${o.gifFps},scale=${o.gifW}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', 'out.gif'], outputs: ['out.gif'] };
      case 'merge': return { args: [...I, '-i', in2(), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', 'out.mp4'], outputs: ['out.mp4'] };
      case 'loudnorm': {
        const out = isAudio() ? `out.${extOf(main!.name) === 'mp3' ? 'mp3' : 'm4a'}` : 'out.mp4';
        const a = out.endsWith('mp3') ? ['-c:a', 'libmp3lame', '-q:a', '2'] : ['-c:a', 'aac', '-b:a', '192k'];
        return { args: [...I, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', ...(isAudio() ? ['-vn'] : ['-c:v', 'copy']), ...a, '-ar', '48000', out], outputs: [out] };
      }
      case 'speed': {
        const x = +o.speed, at: string[] = []; let r = x;
        while (r > 2) { at.push('atempo=2'); r /= 2; } while (r < 0.5) { at.push('atempo=0.5'); r /= 0.5; } at.push(`atempo=${+r.toFixed(4)}`);
        if (isAudio()) { const out = `out.${extOf(main!.name) === 'mp3' ? 'mp3' : 'm4a'}`; return { args: [...I, '-af', at.join(','), ...(out.endsWith('mp3') ? ['-c:a', 'libmp3lame', '-q:a', '2'] : ['-c:a', 'aac']), out], outputs: [out] }; }
        return { args: [...I, '-filter_complex', `[0:v]setpts=PTS/${x}[v];[0:a]${at.join(',')}[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'out.mp4'], outputs: ['out.mp4'] };
      }
      case 'frames': return { args: [...I, '-vf', `fps=${o.frameFps}`, ...(o.frameFmt === 'jpg' ? ['-q:v', '2'] : []), `frame-%04d.${o.frameFmt}`], outputs: [], pattern: new RegExp(`^frame-\\d{4}\\.${o.frameFmt}$`) };
      case 'audio2mp4': {
        if (o.a2m === 'm4a') return { args: [...I, '-vn', '-c:a', 'aac', '-b:a', '192k', 'out.m4a'], outputs: ['out.m4a'] };
        if (o.a2m === 'still') {
          if (!second) return { args: [...I, '-f', 'lavfi', '-i', 'color=c=0x1e1b4b:s=1280x720:r=2', '-map', '1:v', '-map', '0:a', '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', ...(mainDur ? ['-t', String(mainDur)] : ['-shortest']), 'out.mp4'], outputs: ['out.mp4'] };
          // -t (not -shortest): FFmpeg 5.1 keeps a looped picture going past the end of the sound with -shortest
          return { args: ['-loop', '1', '-framerate', '2', '-i', in2(), ...I, '-map', '0:v', '-map', '1:a', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-c:v', 'libx264', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '192k', ...(mainDur ? ['-t', String(mainDur)] : ['-shortest']), 'out.mp4'], outputs: ['out.mp4'] };
        }
        return { args: [...I, '-filter_complex', '[0:a]showwaves=s=1280x720:mode=cline:rate=25:colors=0x818cf8,format=yuv420p[v]', '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', 'out.mp4'], outputs: ['out.mp4'] };
      }
      case 'raw': {
        const args = (String(o.raw).match(/"[^"]*"|'[^']*'|\S+/g) || []).map((a) => a.replace(/^["']|["']$/g, ''));
        if (args[0] === 'ffmpeg') args.shift();
        const out = args[args.length - 1];
        return { args, outputs: out && !out.startsWith('-') && !/^in\d\./.test(out) ? [out] : [] };
      }
    }
  }
  function update() {
    if (!main) return;
    try {
      const { args } = build();
      const names: Record<string, string> = { [in1()]: main.name, ...(second ? { [in2()]: second.name } : {}) };
      cmd.value = `ffmpeg ${args.map((a) => quote(names[a] || (/^out\./.test(a) ? `${baseName(main!.name)}-out.${extOf(a)}` : a))).join(' ')}`;
    } catch (e) { cmd.value = errMsg(e); }
  }
  const sel = (label: string, key: string, options: Array<[string, string]>) => field(label, select<string>(options, o[key], (v) => { o[key] = v; update(); }));
  const inp = (label: string, key: string, type = 'text', extra: any = {}) => field(label, input({ type, value: o[key], ...extra, onInput: (v: string) => { o[key] = v; update(); } }));
  function renderOpts() {
    secondBox.hidden = !(preset === 'merge' || (preset === 'audio2mp4' && o.a2m === 'still'));
    secondPick.querySelector('strong')!.textContent = preset === 'merge' ? 'Choose the audio file' : 'Choose a picture (optional)';
    const parts: Record<Preset, () => Node[]> = {
      convert: () => [sel('To', 'fmt', FORMATS)],
      audio: () => [sel('Audio as', 'aud', [['copy', 'Keep the original codec (no quality loss)'], ['mp3', 'MP3'], ['wav', 'WAV']])],
      mute: () => [note('The video is copied as it is; only the sound is removed.', 'info')],
      trim: () => [h('div', { class: 'row' }, inp('Start (seconds or hh:mm:ss)', 'start'), inp('End (empty = to the end)', 'end')),
        toggle('Exact cut (re-encode; otherwise fast, starts at the nearest key frame)', o.exact, (v) => { o.exact = v; update(); })],
      compress: () => [field(`Quality (CRF ${o.crf}: lower = better, bigger)`, input({ type: 'range', min: 18, max: 35, value: o.crf, onInput: (v: string, el: HTMLInputElement) => { o.crf = +v; (el.closest('.field')!.querySelector('.field-label') as HTMLElement).textContent = `Quality (CRF ${v}: lower = better, bigger)`; update(); } })),
        sel('Encoding speed', 'speedPreset', [['ultrafast', 'Fastest (bigger file)'], ['veryfast', 'Fast'], ['medium', 'Slower (smaller file)']])],
      resize: () => [sel('Height', 'height', [['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p']])],
      fps: () => [sel('Frames per second', 'fps', [['60', '60'], ['30', '30'], ['25', '25'], ['24', '24'], ['15', '15']])],
      rotate: () => [sel('Turn', 'rot', [['cw', '90° clockwise'], ['ccw', '90° anticlockwise'], ['180', '180°'], ['h', 'Mirror (left ↔ right)'], ['v', 'Flip (upside down)']])],
      crop: () => [sel('Shape (centre crop)', 'crop', [['16:9', '16:9'], ['9:16', '9:16 (Reels)'], ['1:1', '1:1 square'], ['4:5', '4:5'], ['4:3', '4:3']])],
      gif: () => [h('div', { class: 'row' }, sel('Width', 'gifW', [['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['800', '800 px']]), sel('Frames per second', 'gifFps', [['8', '8'], ['10', '10'], ['12', '12'], ['15', '15'], ['20', '20']])),
        note('Tip: trim the clip first — GIFs grow quickly.', 'info')],
      merge: () => [note('Video from the first file, sound from the second (re-encoded to AAC). The output stops at the shorter one.', 'info')],
      loudnorm: () => [note('EBU R128 loudness normalisation to −16 LUFS (streaming / podcast level), true peak −1.5 dB.', 'info')],
      speed: () => [sel('Speed', 'speed', [['0.5', '0.5× (half speed)'], ['0.75', '0.75×'], ['1.25', '1.25×'], ['1.5', '1.5×'], ['2', '2×'], ['4', '4×']])],
      frames: () => [h('div', { class: 'row' }, sel('One picture every', 'frameFps', [['1', 'second'], ['0.2', '5 seconds'], ['0.1', '10 seconds'], ['5', '0.2 seconds']]), sel('As', 'frameFmt', [['png', 'PNG'], ['jpg', 'JPEG']]))],
      audio2mp4: () => [field('Make', segmented<string>([['still', 'Picture + sound'], ['waves', 'Animated waveform'], ['m4a', 'M4A audio only']], o.a2m, (v) => { o.a2m = v; renderOpts(); update(); }))],
      raw: () => [field('Arguments (inputs are in1.<ext>, in2.<ext>; the last name is the output)', input({ value: o.raw, onInput: (v: string) => { o.raw = v; update(); }, attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': 'FFmpeg arguments' } })),
        note('This single-threaded build cannot use libvpx-vp9 or libx265 (they wait for threads): use libvpx (VP8) or libx264. Press Stop if a command hangs.', 'warn')],
    };
    clear(opts).append(...parts[preset]());
    update();
  }
  async function engine() {
    if (ff) return ff;
    return (loading ||= (async () => {
      status.textContent = 'Loading FFmpeg (≈ 31 MB, once per visit)…';
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const f = new FFmpeg(), at = (p: string) => new URL(p, document.baseURI).href;
      f.on('log', ({ message }: any) => { logLines.push(message); if (logLines.length > 400) logLines.splice(0, 100); });
      f.on('progress', ({ progress: p }: any) => onProg?.(Math.max(0, Math.min(1, p))));
      await f.load({ coreURL: at('vendor/ffmpeg/ffmpeg-core.js'), wasmURL: at('vendor/ffmpeg/ffmpeg-core.wasm') });
      ff = f;
      onLeave('ffmpeg', () => { try { f.terminate(); } catch { /* gone */ } ff = null; loading = null; });
      status.textContent = '';
      return f;
    })().catch((e) => { loading = null; throw e; }));
  }
  async function mountInputs(f: any) {
    try { await f.unmount('/in'); } catch { /* not mounted */ }
    try { await f.createDir('/in'); } catch { /* exists */ }
    const files = [new File([main!], in1(), { type: main!.type }), ...(second ? [new File([second], in2(), { type: second.type })] : [])];
    await f.mount('WORKERFS', { files }, '/in');
  }
  async function probe() {
    try {
      const f = await engine(); await mountInputs(f);
      logLines = []; await f.exec(['-hide_banner', '-i', `/in/${in1()}`]);
      streams = logLines.filter((l) => /Duration:|Stream #/.test(l)).join('\n');
      const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(streams);
      mainDur = d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0;
      info.textContent = `${main!.name} · ${fmtBytes(main!.size)}${d ? ` · ${fmtTime(+d[1] * 3600 + +d[2] * 60 + +d[3])}` : ''}\n${streams.replace(/^\s+/gm, '')}`;
      update();
    } catch (e) { info.textContent = `${main!.name}: ${errMsg(e)}`; }
  }
  async function run() {
    if (!main || running) return;
    if ((preset === 'merge') && !second) return toast('Choose the audio file to add.', 'err');
    running = true; runBtn.hidden = true; stopBtn.hidden = false; outCard.hidden = true; status.textContent = ''; status.classList.remove('err-text');
    const t0 = performance.now();
    try {
      const f = await engine(); await mountInputs(f);
      const { args, outputs, pattern } = build();
      const real = args.map((a) => (a === in1() || a === in2() ? `/in/${a}` : a));
      logLines = [];
      onProg = (p) => prog.set(p, `Working… ${Math.round(p * 100)} %`);
      prog.set(null, 'Working…');
      const code = await f.exec(['-hide_banner', '-y', ...real]);
      let names = outputs;
      if (pattern) names = (await f.listDir('/')).map((n: any) => n.name).filter((n: string) => pattern.test(n)).sort();
      const files: Array<{ name: string; blob: Blob }> = [];
      for (const n of names) {
        try { const data = await f.readFile(n); files.push({ name: n.startsWith('out.') ? `${baseName(main.name)}-out.${extOf(n)}` : n, blob: new Blob([data as BlobPart], { type: mimeOf(n) }) }); await f.deleteFile(n); }
        catch { /* not produced */ }
      }
      logBox.textContent = logLines.slice(-60).join('\n');
      if (code) throw new Error(`FFmpeg failed (exit ${code}): ${logLines.filter((l) => /error|invalid|no such|failed|unknown|unable/i.test(l)).slice(0, 2).join(' · ') || 'see the log'}`);
      if (!files.length) throw new Error('No output file was produced.');
      status.textContent = '';
      showOutputs(files, performance.now() - t0);
    } catch (e) { status.textContent = errMsg(e); status.classList.add('err-text'); toast(errMsg(e), 'err'); logBox.textContent = logLines.slice(-60).join('\n'); (logBox.parentElement as HTMLDetailsElement).open = true; }
    finally { running = false; prog.done(); runBtn.hidden = false; stopBtn.hidden = true; }
  }
  const mimeOf = (n: string) => ({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', gif: 'image/gif', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', mka: 'audio/x-matroska' } as Record<string, string>)[extOf(n)] || 'application/octet-stream';
  let urls: string[] = [];
  async function showOutputs(files: Array<{ name: string; blob: Blob }>, ms: number) {
    urls.forEach(URL.revokeObjectURL); urls = [];
    clear(outs);
    const total = files.reduce((a, f) => a + f.blob.size, 0);
    outs.append(h('div', { class: 'muted small' }, `${files.length} file${files.length > 1 ? 's' : ''} · ${fmtBytes(total)} · ${(ms / 1000).toFixed(1)} s`));
    if (files.length > 1) {
      outs.append(h('div', { class: 'row' }, button(`Download all as .zip (${files.length})`, async () => { const { zipFiles } = await import('../lib/zip'); downloadBlob(await zipFiles(files), `${baseName(main!.name)}-frames.zip`); }, { icon: 'Download', variant: 'primary' })));
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
  const picker = filePicker({ accept: 'video/*,audio/*,image/*,.mkv,.flv,.avi,.ts,.m2ts,.wmv,.wma,.opus,.flac', label: 'Choose a video or audio file', hint: 'Any format FFmpeg reads — up to about 2 GB', onFiles: ([f]) => { main = f; second = null; secondInfo.textContent = ''; work.hidden = false; picker.classList.add('drop-compact'); info.textContent = f.name; renderOpts(); probe(); } });
  const presetSel = select<string>(PRESETS, preset, (v) => { preset = v as Preset; renderOpts(); });
  const runBtn = button('Run FFmpeg', () => run(), { icon: 'Play', variant: 'primary' });
  const stopBtn = button('Stop', () => { try { ff?.terminate(); } catch { /* */ } ff = null; loading = null; toast('Stopped', 'info'); }, { icon: 'Square', variant: 'danger' }); stopBtn.hidden = true;
  const editRaw = button('Edit as arguments', () => { const a = build().args.join(' '); preset = 'raw'; o.raw = a; presetSel.value = 'raw'; renderOpts(); }, { icon: 'Terminal', small: true, variant: 'ghost' });
  work.append(
    card('Input', info, secondBox),
    card('What to do', stack(field('Task', presetSel), opts, field('Command (copy it to run FFmpeg on your computer)', cmd), h('div', { class: 'row' }, editRaw))),
    prog, status, outCard,
    h('details', { class: 'rec-opts' }, h('summary', null, 'FFmpeg log'), logBox));
  root.append(card(null, picker), work, actions(runBtn, stopBtn),
    note('FFmpeg 5.1 runs here as WebAssembly on one CPU core: re-encoding is ~10–20× slower than native FFmpeg. Fast tasks (trim without re-encoding, extract audio, remove audio) take seconds.', 'info'));
  return () => { urls.forEach(URL.revokeObjectURL); };
};
