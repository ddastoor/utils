// Shared audio UI: microphone recorder (MediaRecorder + live meter/waveform), waveform trim editor with playback,
// and a save panel (MP3 via our LAME wasm, WAV, or the original codec trimmed without re-encoding via mediabunny).
// Used by Audio Recorder, Noise Remover, Pitch & Speed and Speech to Text.
import { h, button, field, select, toggle, segmented, note, clear, toast, errMsg, downloadBlob, shareOrDownload, fmtTime, input } from '../ui';
import { audio, channelsOf, int16Asymmetric } from './audio-client';

// ------------------------------------------------------------------ recorder
export interface Recording { blob: Blob; mime: string; seconds: number }
const MIMES = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
export const recordMime = () => (typeof MediaRecorder === 'undefined' ? '' : MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || '');
export const extForMime = (m: string) => (/mp4|aac|m4a/.test(m) ? 'm4a' : /ogg/.test(m) ? 'ogg' : 'webm');

export function recorder(o: { onDone: (r: Recording) => void; onStart?: () => void; isMobile: boolean; voice?: boolean }) {
  let stream: MediaStream | null = null, rec: MediaRecorder | null = null, ctx: AudioContext | null = null, an: AnalyserNode | null = null;
  let raf = 0, t0 = 0, pausedAt = 0, pausedTotal = 0, lock: any = null, chunks: Blob[] = [];
  let clean = o.voice !== false, stereo = false, deviceId = '';
  const hist: number[] = [];
  const time = h('div', { class: 'rec-time', 'aria-live': 'off' }, '0:00.0');
  const state = h('div', { class: 'muted small', 'aria-live': 'polite' }, 'Ready');
  const fill = h('div', { class: 'meter-fill' }), clip = h('div', { class: 'meter-clip', title: 'Too loud: move back from the microphone' });
  const meter = h('div', { class: 'meter', role: 'meter', 'aria-label': 'Input level', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill, clip);
  const live = h('canvas', { class: 'rec-live', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const micSel = select<string>([['', 'Default microphone']], '', (v) => (deviceId = v));
  const recBtn = button('Record', () => start(), { icon: 'Mic', variant: 'primary' });
  const pauseBtn = button('Pause', () => togglePause(), { icon: 'Pause', disabled: true });
  const stopBtn = button('Stop', () => stop(), { icon: 'Square', variant: 'danger', disabled: true });
  recBtn.classList.add('rec-btn');
  const elapsed = () => (rec ? ((rec.state === 'paused' ? pausedAt : performance.now()) - t0 - pausedTotal) / 1000 : 0);

  const draw = () => {
    raf = requestAnimationFrame(draw);
    if (!an) return;
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let pk = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; } // ≤ 2048 samples per frame (§3a)
    const db = pk > 0 ? 20 * Math.log10(pk) : -100, pct = Math.max(0, Math.min(100, (db + 60) / 60 * 100));
    fill.style.width = `${pct}%`; meter.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (pk > 0.99) clip.classList.add('on');
    time.textContent = fmtTime(elapsed(), true).replace(/\.(\d)\d*$/, '.$1');
    if (rec?.state === 'recording') { hist.push(pk); if (hist.length > 2000) hist.splice(0, hist.length - 2000); }
    const dpr = devicePixelRatio || 1, W = live.clientWidth * dpr, H = live.clientHeight * dpr;
    if (live.width !== W || live.height !== H) { live.width = W; live.height = H; }
    const g = live.getContext('2d')!; g.clearRect(0, 0, W, H);
    g.fillStyle = getComputedStyle(live).color;
    const bw = 3 * dpr, n = Math.floor(W / bw);
    for (let i = 0; i < n && i < hist.length; i++) { const v = hist[hist.length - 1 - i], bh = Math.max(dpr, v * H * 0.95); g.fillRect(W - (i + 1) * bw, (H - bh) / 2, bw - dpr, bh); }
  };
  const fillMics = async () => {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const cur = micSel.value;
      clear(micSel).append(...[['', 'Default microphone'], ...devs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => [d.deviceId, d.label || `Microphone ${i + 1}`])].map(([v, l]) => h('option', { value: v }, l)));
      micSel.value = cur;
    } catch { /* labels need permission; keep the default */ }
  };
  async function start() {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot record audio.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: clean, noiseSuppression: clean, autoGainControl: clean, channelCount: stereo ? 2 : 1 } });
    } catch (e: any) {
      const why: Record<string, string> = {
        NotAllowedError: 'Microphone permission was denied. Allow it in the browser’s site settings and try again.',
        NotFoundError: 'No microphone found.',
        NotReadableError: 'The microphone is in use by another program (or the system refuses it). Close the other program and try again.',
        OverconstrainedError: 'The chosen microphone is no longer there. Choose another one under “Microphone options”.',
        SecurityError: 'This page may not use the microphone (the browser blocks it here).',
        AbortError: 'The microphone could not be started. Try again.',
      };
      if (e?.name === 'OverconstrainedError') { deviceId = ''; micSel.value = ''; } // the next try uses the default microphone
      throw new Error(why[e?.name] || errMsg(e));
    }
    fillMics();
    const mime = recordMime();
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
    chunks = []; hist.length = 0; clip.classList.remove('on'); pausedTotal = 0;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const secs = elapsed(), type = rec?.mimeType || mime || 'audio/webm';
      release();
      const blob = new Blob(chunks, { type });
      state.textContent = `Recorded ${fmtTime(secs)}`;
      o.onDone({ blob, mime: type, seconds: secs });
    };
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    an = ctx.createAnalyser(); an.fftSize = 2048; ctx.createMediaStreamSource(stream).connect(an);
    rec.start(1000);
    t0 = performance.now();
    try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { lock = null; } // keep the phone awake while recording
    o.onStart?.();
    recBtn.disabled = true; pauseBtn.disabled = false; stopBtn.disabled = false; pauseBtn.setLabel('Pause');
    state.textContent = 'Recording…';
    cancelAnimationFrame(raf); draw();
  }
  function togglePause() {
    if (!rec) return;
    if (rec.state === 'recording') { rec.pause(); pausedAt = performance.now(); pauseBtn.setLabel('Resume'); state.textContent = 'Paused'; }
    else if (rec.state === 'paused') { rec.resume(); pausedTotal += performance.now() - pausedAt; pauseBtn.setLabel('Pause'); state.textContent = 'Recording…'; }
  }
  function stop() { if (rec && rec.state !== 'inactive') { if (rec.state === 'paused') pausedTotal += performance.now() - pausedAt; rec.requestData?.(); rec.stop(); } }
  function release() {
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    ctx?.close().catch(() => {}); ctx = null; an = null;
    lock?.release?.().catch?.(() => {}); lock = null;
    cancelAnimationFrame(raf); fill.style.width = '0';
    recBtn.disabled = false; pauseBtn.disabled = true; stopBtn.disabled = true;
  }
  const opts = h('details', { class: 'rec-opts' }, h('summary', null, 'Microphone options'),
    h('div', { class: 'stack' }, field('Microphone', micSel),
      toggle('Voice clean-up (echo, noise and volume control by the browser)', clean, (v) => (clean = v)),
      toggle('Stereo, if the microphone has two channels', stereo, (v) => (stereo = v))));
  const el = h('div', { class: 'stack rec' }, h('div', { class: 'rec-head' }, time, state), meter, live, opts);
  const bar = [recBtn, pauseBtn, stopBtn];
  return { el, bar, stop, dispose: () => { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } release(); }, get recording() { return !!rec && rec.state !== 'inactive'; } };
}

// ------------------------------------------------------------------ waveform trim editor + playback
export function waveEditor(o: { onChange?: () => void } = {}) {
  let buf: AudioBuffer | null = null, peaks: Float32Array | null = null, sel: [number, number] = [0, 0];
  let ctx: AudioContext | null = null, src: AudioBufferSourceNode | null = null, playStart = 0, playFrom = 0, raf = 0, playhead = -1, drag = -1, setSeq = 0;
  const canvas = h('canvas', { class: 'wave', 'aria-label': 'Waveform: drag the edges to trim' }) as HTMLCanvasElement;
  const wrap = h('div', { class: 'wave-wrap' }, canvas);
  const sIn = input({ type: 'number', min: 0, step: 0.01, onInput: (v) => setSel(+v, sel[1], true) }) as HTMLInputElement;
  const eIn = input({ type: 'number', min: 0, step: 0.01, onInput: (v) => setSel(sel[0], +v, true) }) as HTMLInputElement;
  sIn.setAttribute('aria-label', 'Start (seconds)'); eIn.setAttribute('aria-label', 'End (seconds)');
  const info = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const playBtn = button('Play', () => (src ? stopPlay() : play()), { icon: 'Play' });
  const resetBtn = button('Whole recording', () => setSel(0, buf?.duration || 0), { icon: 'Maximize2', variant: 'ghost', small: true });
  const dur = () => buf?.duration || 0;
  function setSel(a: number, b: number, fromInput = false) {
    const d = dur();
    a = Math.max(0, Math.min(isFinite(a) ? a : 0, d)); b = Math.max(0, Math.min(isFinite(b) ? b : d, d));
    if (b - a < 0.05) { if (drag === 0) a = Math.max(0, b - 0.05); else b = Math.min(d, a + 0.05); }
    sel = [a, b];
    if (!fromInput || document.activeElement !== sIn) sIn.value = a.toFixed(2);
    if (!fromInput || document.activeElement !== eIn) eIn.value = b.toFixed(2);
    info.textContent = `Selection ${fmtTime(a, true)} – ${fmtTime(b, true)} · ${(b - a).toFixed(2)} s of ${d.toFixed(2)} s`;
    if (src) stopPlay();
    redraw(); o.onChange?.();
  }
  function redraw() {
    const dpr = devicePixelRatio || 1, W = Math.max(1, wrap.clientWidth) * dpr, H = canvas.clientHeight * dpr || 120 * dpr;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext('2d')!, cs = getComputedStyle(canvas), d = dur();
    g.clearRect(0, 0, W, H);
    if (!peaks || !d) return;
    const x = (t: number) => (t / d) * W, n = peaks.length / 2;
    g.fillStyle = cs.getPropertyValue('--wave-sel') || 'rgba(37,99,235,.12)'; g.fillRect(x(sel[0]), 0, x(sel[1]) - x(sel[0]), H);
    for (let px = 0; px < W; px++) {
      const b0 = Math.floor((px / W) * n), b1 = Math.max(b0 + 1, Math.floor(((px + 1) / W) * n));
      let lo = 0, hi = 0; for (let b = b0; b < b1 && b < n; b++) { lo = Math.min(lo, peaks[2 * b]); hi = Math.max(hi, peaks[2 * b + 1]); }
      const t = (px / W) * d, inSel = t >= sel[0] && t <= sel[1];
      g.fillStyle = inSel ? cs.color : cs.getPropertyValue('--wave-dim') || '#9ca3af';
      g.fillRect(px, H / 2 - hi * H * 0.48, 1, Math.max(1, (hi - lo) * H * 0.48));
    }
    g.fillStyle = cs.getPropertyValue('--wave-handle') || '#2563eb';
    for (const t of sel) { g.fillRect(x(t) - dpr, 0, 2 * dpr, H); g.beginPath(); g.arc(Math.min(Math.max(x(t), 7 * dpr), W - 7 * dpr), H / 2, 7 * dpr, 0, 7); g.fill(); }
    if (playhead >= 0) { g.fillStyle = '#ef4444'; g.fillRect(x(playhead) - dpr / 2, 0, dpr, H); }
  }
  const tAt = (ev: PointerEvent) => { const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * dur(); };
  canvas.addEventListener('pointerdown', (ev) => {
    if (!buf) return;
    const t = tAt(ev);
    drag = Math.abs(t - sel[0]) <= Math.abs(t - sel[1]) ? 0 : 1; // the nearer edge follows the finger
    canvas.setPointerCapture(ev.pointerId);
    drag === 0 ? setSel(t, sel[1]) : setSel(sel[0], t);
  });
  canvas.addEventListener('pointermove', (ev) => { if (drag < 0) return; const t = tAt(ev); drag === 0 ? setSel(t, sel[1]) : setSel(sel[0], t); });
  const endDrag = () => { drag = -1; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  const ro = new ResizeObserver(() => redraw()); ro.observe(wrap);

  function play() {
    if (!buf) return;
    ctx ||= new (window.AudioContext || (window as any).webkitAudioContext)();
    ctx.resume?.();
    src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
    playFrom = sel[0]; playStart = ctx.currentTime;
    src.onended = () => stopPlay();
    src.start(0, sel[0], sel[1] - sel[0]);
    playBtn.setLabel('Stop');
    const tick = () => { if (!src || !ctx) return; playhead = playFrom + (ctx.currentTime - playStart); redraw(); raf = requestAnimationFrame(tick); };
    tick();
  }
  function stopPlay() { if (src) { src.onended = null; try { src.stop(); } catch { /* already ended */ } src.disconnect(); src = null; } cancelAnimationFrame(raf); playhead = -1; playBtn.setLabel('Play'); redraw(); }

  const el = h('div', { class: 'stack wave-editor' }, wrap, info,
    h('div', { class: 'row wave-times' }, field('Start (s)', sIn), field('End (s)', eIn), resetBtn));
  return {
    el, playBtn,
    async set(b: AudioBuffer) {
      stopPlay(); buf = b;
      const my = ++setSeq, N = 4096, chs = channelsOf(b), per = await Promise.all(chs.slice(0, 2).map((c) => audio('peaks', c, N)));
      if (my !== setSeq) return; // a newer sound was set meanwhile: its peaks, not these
      peaks = per[0];
      if (per[1]) for (let i = 0; i < N; i++) { peaks[2 * i] = Math.min(peaks[2 * i], per[1][2 * i]); peaks[2 * i + 1] = Math.max(peaks[2 * i + 1], per[1][2 * i + 1]); }
      setSel(0, b.duration);
    },
    get buffer() { return buf; },
    get range() { return sel; },
    get trimmed() { return !!buf && (sel[0] > 0.0005 || sel[1] < buf.duration - 0.0005); },
    /** The selected samples, planar. */
    selection(): Float32Array[] {
      if (!buf) return [];
      const a = Math.round(sel[0] * buf.sampleRate), b = Math.round(sel[1] * buf.sampleRate);
      return Array.from({ length: buf.numberOfChannels }, (_, i) => buf!.getChannelData(i).slice(a, b));
    },
    stop() { stopPlay(); },
    setRange(a: number, b: number) { setSel(a, b); },
    dispose() { stopPlay(); ro.disconnect(); ctx?.close().catch(() => {}); ctx = null; },
  };
}

// ------------------------------------------------------------------ save panel
export type SaveFmt = 'mp3' | 'wav' | 'orig';
const MP3_RATES: Array<[string, string]> = [['64', '64 kbps (voice, smallest)'], ['128', '128 kbps (good)'], ['192', '192 kbps (high)'], ['320', '320 kbps (best)'], ['v2', 'VBR V2 (high, variable)']];
/** Remux/trim without re-encoding (mediabunny, packet copy): keeps the recorded codec, fixes MediaRecorder's missing duration. */
export async function copyTrim(blob: Blob, start: number | null, end: number | null): Promise<{ blob: Blob; ext: string }> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const f = await input.getFormat();
  const [fmt, ext, type] = f === mb.WEBM || f === mb.MATROSKA ? [new mb.WebMOutputFormat(), 'webm', 'audio/webm'] : f === mb.MP4 || f === mb.QTFF ? [new mb.Mp4OutputFormat(), 'm4a', 'audio/mp4']
    : f === mb.MP3 ? [new mb.Mp3OutputFormat(), 'mp3', 'audio/mpeg'] : f === mb.OGG ? [new mb.OggOutputFormat(), 'ogg', 'audio/ogg'] : f === mb.WAVE ? [new mb.WavOutputFormat(), 'wav', 'audio/wav']
    : f === mb.FLAC ? [new mb.FlacOutputFormat(), 'flac', 'audio/flac'] : f === mb.ADTS ? [new mb.AdtsOutputFormat(), 'aac', 'audio/aac'] : [null, '', ''];
  if (!fmt) throw new Error('This format cannot be cut without re-encoding: choose MP3 or WAV.');
  const lossless = f === mb.WAVE || f === mb.FLAC; // PCM/FLAC re-encoding is bit-exact, so it may transcode; lossy codecs are packet-copied only
  const output = new mb.Output({ format: fmt as any, target: new mb.BufferTarget() });
  const conv = await mb.Conversion.init({ input, output, video: { discard: true }, ...(start !== null || end !== null ? { trim: { start: start ?? undefined, end: end ?? undefined } } : {}), copy: { mode: lossless ? 'preferred' : 'forced' } } as any);
  if (!conv.isValid) throw new Error('This file cannot be cut without re-encoding: choose MP3 or WAV.');
  await conv.execute();
  return { blob: new Blob([output.target.buffer!], { type }), ext };
}
export function savePanel(o: { isMobile: boolean; name: () => string; pcm: () => Promise<{ chs: Float32Array[]; sr: number }>; original?: () => Promise<{ blob: Blob; ext: string }> | null; defaultRate?: string; formats?: SaveFmt[] }) {
  const fmts = o.formats || (o.original ? ['mp3', 'wav', 'orig'] : ['mp3', 'wav']);
  let fmt: SaveFmt = fmts[0], rate = o.defaultRate || '128';
  const rateSel = field('MP3 quality', select<string>(MP3_RATES, rate, (v) => (rate = v)));
  const origNote = note('Original keeps the recorded codec and quality (no re-encoding); the cut lands on the nearest audio packet (≈ 20 ms).', 'info');
  const sync = () => { rateSel.hidden = fmt !== 'mp3'; origNote.hidden = fmt !== 'orig'; };
  const labels: Record<SaveFmt, string> = { mp3: 'MP3', wav: 'WAV', orig: 'Original' };
  const seg = segmented(fmts.map((f) => [f, labels[f]] as [SaveFmt, string]), fmt, (v) => { fmt = v; sync(); });
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  async function make(): Promise<{ blob: Blob; file: string }> {
    status.textContent = 'Encoding…';
    try {
      if (fmt === 'orig') { const r = await o.original!(); if (!r) throw new Error('Original format not available'); return { blob: r.blob, file: `${o.name()}.${r.ext}` }; }
      const { chs, sr } = await o.pcm();
      if (!chs.length || !chs[0].length) throw new Error('Nothing selected.');
      const t0 = performance.now();
      const bytes = fmt === 'wav' ? await audio('wav', chs, sr, 16, await int16Asymmetric()) : await audio('mp3', chs, sr, rate === 'v2' ? { vbr: true, rate: 2 } : { rate: +rate });
      status.textContent = `${fmt.toUpperCase()} · ${(bytes.length / 1024 / 1024).toFixed(2)} MB · encoded in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
      return { blob: new Blob([bytes as BlobPart], { type: fmt === 'wav' ? 'audio/wav' : 'audio/mpeg' }), file: `${o.name()}.${fmt}` };
    } catch (e) { status.textContent = errMsg(e); throw e; }
  }
  const save = async () => {
    let r: { blob: Blob; file: string };
    try { r = await make(); } catch (e) { toast(errMsg(e), 'err'); return; } // shown to the user; not a page error
    const { blob, file } = r; o.isMobile ? await shareOrDownload(blob, file) : downloadBlob(blob, file); if (fmt === 'orig') status.textContent = `Saved ${file} (${(blob.size / 1024).toFixed(0)} KB)`; };
  sync();
  return { el: h('div', { class: 'stack' }, field('Format', seg), rateSel, origNote, status), save, make, saveButton: (label = o.isMobile ? 'Save' : 'Download') => button(label, save, { icon: 'Download', variant: 'primary' }) };
}
