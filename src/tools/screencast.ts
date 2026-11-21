// Screencast (PC): record a screen, window or tab (Chrome's picker), or a rectangle of one (cropped live), with the
// shared sound and optionally the microphone; the mouse pointer in the picture or not (the capture's `cursor`).
// MediaRecorder (browser's own encoders) → MP4 (H.264) where the browser can, else WebM; long recordings can stream straight to a file (File System Access). WebM/MP4 from MediaRecorder
// lack a duration index, so files kept in memory are remuxed by mediabunny (packet copy, seconds).
import { h, card, field, actions, button, segmented, toggle, select, stack, note, toast, errMsg, fmtBytes, fmtTime, downloadBlob, sleep, type Mount } from '../ui';
import { linuxBanner } from '../linux';
import { finishRecording } from '../lib/aac';

type Mode = 'whole' | 'area';
const MIMES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const even = (v: number) => Math.max(2, Math.floor(v / 2) * 2);

export const mount: Mount = (root) => {
  let mode: Mode = 'whole', withAudio = true, withMic = false, countdown = true, toDisk = false, fps = 30, fmt: 'mp4' | 'webm' = 'mp4', pointer = true;
  let display: MediaStream | null = null, mic: MediaStream | null = null, ac: AudioContext | null = null, rec: MediaRecorder | null = null;
  let chunks: Blob[] = [], bytes = 0, writable: any = null, t0 = 0, pausedAt = 0, pausedTotal = 0, timer = 0, area: [number, number, number, number] | null = null, stopCrop: (() => void) | null = null;
  let outUrl = '', outBlob: Blob | null = null, outName = '', starting = false, live = true, cancelWait: (() => void) | null = null;
  const mimeFor = () => (fmt === 'mp4' ? MIMES.slice(0, 2) : MIMES.slice(2)).find((m) => MediaRecorder.isTypeSupported(m)) || MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || '';

  const preview = h('video', { class: 'sc-preview', muted: true, autoplay: true, playsinline: true }) as HTMLVideoElement;
  const sel = h('div', { class: 'sc-sel', hidden: true });
  const stage = h('div', { class: 'sc-stage' }, preview, sel);
  const stageCard = card('Preview', stage, h('div', { class: 'muted small sc-hint' }, ''));
  stageCard.hidden = true;
  const hint = stageCard.querySelector('.sc-hint') as HTMLElement;
  const timeEl = h('div', { class: 'rec-time' }, '0:00');
  const stateEl = h('div', { class: 'muted small', 'aria-live': 'polite' }, 'Ready');
  const result = h('div', { class: 'stack' });
  const resultCard = card('Recording', result); resultCard.hidden = true;
  const after = h('video', { class: 'vid-prev', controls: true }) as HTMLVideoElement;

  // ------------------------------------------------------------------ area selection on the preview
  let dragFrom: [number, number] | null = null;
  const toVideo = (ev: PointerEvent) => {
    const r = preview.getBoundingClientRect(), vw = preview.videoWidth, vh = preview.videoHeight;
    const s = Math.min(r.width / vw, r.height / vh), ox = (r.width - vw * s) / 2, oy = (r.height - vh * s) / 2; // object-fit: contain
    return [Math.max(0, Math.min(vw, (ev.clientX - r.left - ox) / s)), Math.max(0, Math.min(vh, (ev.clientY - r.top - oy) / s))] as [number, number];
  };
  const drawSel = () => {
    if (!area) { sel.hidden = true; return; }
    const r = preview.getBoundingClientRect(), vw = preview.videoWidth, vh = preview.videoHeight, s = Math.min(r.width / vw, r.height / vh), ox = (r.width - vw * s) / 2, oy = (r.height - vh * s) / 2;
    Object.assign(sel.style, { left: `${ox + area[0] * s}px`, top: `${oy + area[1] * s}px`, width: `${area[2] * s}px`, height: `${area[3] * s}px` });
    sel.hidden = false;
    hint.textContent = `Area ${area[2]}×${area[3]} at ${area[0]},${area[1]} — drag again to change it.`;
  };
  stage.addEventListener('pointerdown', (ev) => { if (mode !== 'area' || rec || !display) return; stage.setPointerCapture(ev.pointerId); dragFrom = toVideo(ev); });
  stage.addEventListener('pointermove', (ev) => {
    if (!dragFrom) return;
    const [x, y] = toVideo(ev), x0 = Math.min(x, dragFrom[0]), y0 = Math.min(y, dragFrom[1]);
    area = [even(x0), even(y0), even(Math.abs(x - dragFrom[0])), even(Math.abs(y - dragFrom[1]))]; drawSel();
  });
  stage.addEventListener('pointerup', () => { dragFrom = null; if (area && (area[2] < 32 || area[3] < 32)) { area = null; drawSel(); } startBtn.disabled = mode === 'area' && !area; });

  // ------------------------------------------------------------------ capture
  async function pick() {
    stopAll();
    const asked = [pointer, withAudio];
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: fps }, cursor: pointer ? 'always' : 'never' }, audio: withAudio ? { suppressLocalAudioPlayback: false } as any : false, selfBrowserSurface: 'exclude', systemAudio: 'include', surfaceSwitching: 'include', monitorTypeSurfaces: 'include' } as any);
    } catch (e: any) { if (e?.name !== 'NotAllowedError') toast(errMsg(e), 'err'); return false; }
    if (asked[0] !== pointer || asked[1] !== withAudio) { // a setting changed while Chrome's picker was open
      display.getTracks().forEach((t) => t.stop()); display = null;
      stateEl.textContent = `${asked[0] !== pointer ? 'The mouse pointer' : 'The sound'} is set when sharing starts: choose what to record again.`;
      return false;
    }
    display.getVideoTracks()[0].addEventListener('ended', () => { if (rec && rec.state !== 'inactive') stop(); else stopAll(); });
    const mine = display;
    preview.srcObject = display;
    // the share can end while its picture is on its way (a setting changed, the tab left): stop waiting then
    await new Promise((r) => { cancelWait = () => r(null); if (preview.readyState >= 1) r(null); else preview.onloadedmetadata = () => r(null); });
    cancelWait = null;
    if (display !== mine) return false;
    stageCard.hidden = false;
    const s = display.getVideoTracks()[0].getSettings();
    hint.textContent = mode === 'area' ? `Drag on the picture to choose the area to record (${s.width}×${s.height}${pointerWords(s)}).` : `${s.width}×${s.height} · ${(s as any).displaySurface || 'screen'}${display.getAudioTracks().length ? ' · with sound' : withAudio ? ' · no sound shared (tick “Share audio” in Chrome’s picker)' : ''}${pointerWords(s)}`;
    area = null; drawSel();
    return true;
  }
  /** What the browser says it does with the pointer (Chrome reports `cursor`; a browser that does not may keep it). */
  const pointerWords = (s: MediaTrackSettings) => {
    const c = (s as any).cursor as string | undefined;
    if (c === 'never') return ' · no mouse pointer';
    if (c) return pointer ? ' · with the mouse pointer' : ' · with the mouse pointer: this browser keeps it in, though it was asked to leave it out';
    return pointer ? '' : ' · this browser may still record the mouse pointer';
  };
  /** The video track to record: the shared one, or the selected rectangle of it (WebCodecs frames, canvas fallback). */
  function videoTrack(): MediaStreamTrack {
    const src = display!.getVideoTracks()[0];
    if (mode !== 'area' || !area) return src;
    const [x, y, w, hh] = area, W = window as any;
    if (W.MediaStreamTrackProcessor && W.MediaStreamTrackGenerator) {
      const proc = new W.MediaStreamTrackProcessor({ track: src }), gen = new W.MediaStreamTrackGenerator({ kind: 'video' });
      const ctl = new AbortController();
      // the rectangle is drawn onto a canvas of its size, frame by frame. A VideoFrame cut with visibleRect recorded
      // black wherever the screen came as BGRA frames (Chrome's usual kind; it worked for I420 only) — Nov 2026
      const oc = new OffscreenCanvas(w, hh), og = oc.getContext('2d', { alpha: false })!;
      proc.readable.pipeThrough(new TransformStream({
        transform(frame: VideoFrame, c) {
          try {
            const vw = frame.displayWidth, vh = frame.displayHeight, cx = Math.min(x, vw - 2), cy = Math.min(y, vh - 2);
            const cw = Math.min(w, vw - cx), ch = Math.min(hh, vh - cy);
            if (cw < w || ch < hh) og.fillRect(0, 0, w, hh); // the shared picture became smaller: black around what is left
            og.drawImage(frame, cx, cy, cw, ch, 0, 0, cw, ch);
            c.enqueue(new VideoFrame(oc, { timestamp: frame.timestamp }));
          } finally { frame.close(); }
        },
      }), { signal: ctl.signal }).pipeTo(gen.writable, { signal: ctl.signal }).catch(() => {});
      stopCrop = () => { ctl.abort(); gen.stop(); };
      return gen as MediaStreamTrack;
    }
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const g = c.getContext('2d')!; let raf = 0;
    const tick = () => { g.drawImage(preview, x, y, w, hh, 0, 0, w, hh); raf = requestAnimationFrame(tick); }; tick();
    const t = c.captureStream(fps).getVideoTracks()[0];
    stopCrop = () => { cancelAnimationFrame(raf); t.stop(); };
    return t;
  }
  async function audioTracks(): Promise<MediaStreamTrack[]> {
    const shared = display!.getAudioTracks();
    if (!withMic) return shared;
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { toast('Microphone not available — recording without it.', 'info'); return shared; }
    ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
    for (const t of [...shared, ...mic.getAudioTracks()]) ac.createMediaStreamSource(new MediaStream([t])).connect(dest);
    return dest.stream.getAudioTracks();
  }
  async function start() {
    if (starting || rec) return; // a second click during the countdown started a second recorder
    starting = true; setButtons();
    try { await begin(); } finally { starting = false; setButtons(); }
  }
  async function begin() {
    if (!display && !(await pick())) return;
    if (mode === 'area' && !area) { toast('Drag on the preview to choose an area first.', 'info'); return; }
    const mime = mimeFor(), ext = mime.includes('mp4') ? 'mp4' : 'webm';
    outName = `screencast-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;
    if (toDisk && (window as any).showSaveFilePicker) {
      try { const fh = await (window as any).showSaveFilePicker({ suggestedName: outName, types: [{ description: 'Video', accept: { [ext === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${ext}`] } }] }); writable = await fh.createWritable(); }
      catch { return; }
    }
    if (countdown) for (let k = 3; k > 0; k--) { stateEl.textContent = `Starting in ${k}…`; timeEl.textContent = String(k); await sleep(1000); if (!live || !display) break; }
    if (!live || !display || display.getVideoTracks()[0]?.readyState !== 'live') { // sharing ended or the tab was left meanwhile
      try { await writable?.abort?.(); } catch { /* */ } writable = null;
      if (live) { stopAll(); stateEl.textContent = 'Sharing ended before the recording started.'; timeEl.textContent = '0:00'; } // the next Start asks again
      return;
    }
    const stream = new MediaStream([videoTrack(), ...(await audioTracks())]);
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
    chunks = []; bytes = 0; pausedTotal = 0;
    let writing = Promise.resolve();
    rec.ondataavailable = (e) => { if (!e.data.size) return; bytes += e.data.size; if (writable) { const d = e.data; writing = writing.then(() => writable.write(d)); } else chunks.push(e.data); };
    rec.onstop = async () => { await writing; finish(mime, ext); };
    rec.start(1000); t0 = performance.now();
    timer = window.setInterval(() => { timeEl.textContent = fmtTime(elapsed()); stateEl.textContent = `${rec?.state === 'paused' ? 'Paused' : 'Recording'} · ${fmtBytes(bytes)}${writable ? ' written to the file' : ''}`; }, 250);
    setButtons();
  }
  const elapsed = () => ((rec?.state === 'paused' ? pausedAt : performance.now()) - t0 - pausedTotal) / 1000;
  function togglePause() { if (!rec) return; if (rec.state === 'recording') { rec.pause(); pausedAt = performance.now(); } else if (rec.state === 'paused') { rec.resume(); pausedTotal += performance.now() - pausedAt; } setButtons(); }
  function stop() { if (rec && rec.state !== 'inactive') { if (rec.state === 'paused') pausedTotal += performance.now() - pausedAt; rec.stop(); } }
  async function finish(mime: string, ext: string) {
    const secs = elapsed(); clearInterval(timer);
    stopCrop?.(); stopCrop = null; mic?.getTracks().forEach((t) => t.stop()); mic = null; ac?.close(); ac = null; rec = null;
    timeEl.textContent = fmtTime(secs);
    if (writable) { await writable.close(); writable = null; stateEl.textContent = `Saved ${outName} (${fmtBytes(bytes)})`; result.replaceChildren(note(`Saved straight to ${outName} — ${fmtBytes(bytes)}, ${fmtTime(secs)}.`, 'ok')); resultCard.hidden = false; setButtons(); return; }
    stateEl.textContent = 'Finishing…';
    let blob = new Blob(chunks, { type: mime.split(';')[0] || `video/${ext}` });
    blob = await finishRecording(blob, ext as 'mp4' | 'webm'); // duration index; an MP4's sound as AAC
    outBlob = blob; URL.revokeObjectURL(outUrl); outUrl = URL.createObjectURL(blob); after.src = outUrl;
    const v = display?.getVideoTracks()[0]?.getSettings();
    result.replaceChildren(h('div', { class: 'vid-big' }, fmtBytes(blob.size)), h('div', { class: 'muted small' }, `${fmtTime(secs)} · ${area ? `${area[2]}×${area[3]} area` : `${v?.width || ''}×${v?.height || ''}`} · ${mime || 'browser default'}`), after);
    resultCard.hidden = false; stateEl.textContent = `Recorded ${fmtTime(secs)}`;
    setButtons();
  }
  function stopAll() { stop(); display?.getTracks().forEach((t) => t.stop()); display = null; cancelWait?.(); preview.srcObject = null; stageCard.hidden = true; hint.textContent = ''; area = null; setButtons(); }
  /** A setting that the browser takes only when sharing starts (the pointer, the shared sound): changed while a share
   *  is open, the share ends, so the recording cannot go on without it (Chrome keeps a live track's `cursor`). */
  function shareSetting(what: string) {
    if (!display || rec || starting) return;
    stopAll();
    stateEl.textContent = `${what} is set when sharing starts: choose what to record again.`;
  }
  function setButtons() {
    const live = !!rec && rec.state !== 'inactive';
    for (const t of [pointerT, soundT]) (t.querySelector('input') as HTMLInputElement).disabled = live || starting;
    fpsSel.disabled = live || starting;
    pickBtn.hidden = live; startBtn.hidden = live; pauseBtn.hidden = !live; stopBtn.hidden = !live;
    pickBtn.disabled = starting; startBtn.disabled = starting;
    pauseBtn.setLabel(rec?.state === 'paused' ? 'Resume' : 'Pause');
    if (!starting) startBtn.disabled = mode === 'area' && !!display && !area;
    pickBtn.setLabel(display ? 'Choose again' : mode === 'area' ? 'Choose a screen' : 'Choose what to record');
    saveBtn.hidden = live || !outBlob;
  }

  const pickBtn = button('Choose what to record', () => pick().then(() => setButtons()), { icon: 'MonitorUp' });
  const startBtn = button('Start recording', () => start(), { icon: 'Circle', variant: 'primary' });
  const pauseBtn = button('Pause', () => togglePause(), { icon: 'Pause' });
  const stopBtn = button('Stop', () => stop(), { icon: 'Square', variant: 'danger' });
  const saveBtn = button('Download', () => outBlob && downloadBlob(outBlob, outName), { icon: 'Download', variant: 'primary' });
  const hasFsa = !!(window as any).showSaveFilePicker;
  const pointerT = toggle('Show the mouse pointer', pointer, (v) => { pointer = v; shareSetting('The mouse pointer'); });
  const soundT = toggle('Record the sound of the tab or screen (tick “Share audio” in the picker)', withAudio, (v) => { withAudio = v; shareSetting('The sound'); });
  const fpsSel = select<string>([['30', '30 fps'], ['60', '60 fps'], ['15', '15 fps (small files)']], String(fps), (v) => {
    fps = +v; // a frame rate can change on an open share
    display?.getVideoTracks()[0]?.applyConstraints({ frameRate: { ideal: fps } }).catch(() => shareSetting('The frame rate'));
  });
  root.append(
    card('What to record', stack(
      field('Record', segmented<Mode>([['whole', 'Screen, window or tab'], ['area', 'An area (rectangle)']], mode, (v) => { mode = v; area = null; drawSel(); setButtons(); if (display) hint.textContent = v === 'area' ? 'Drag on the picture to choose the area to record.' : ''; })),
      h('div', { class: 'row' },
        field('Format', select<string>([['mp4', 'MP4 (H.264)'], ['webm', 'WebM (VP9)']], fmt, (v) => (fmt = v as any))),
        field('Frame rate', fpsSel)),
      soundT,
      pointerT,
      toggle('Add my microphone', withMic, (v) => (withMic = v)),
      toggle('3-second countdown', countdown, (v) => (countdown = v)),
      hasFsa ? toggle('Save straight to a file while recording (for long recordings)', toDisk, (v) => (toDisk = v)) : null,
      h('div', { class: 'row sc-status' }, timeEl, stateEl))),
    ...[linuxBanner()].filter((x): x is HTMLElement => !!x),
    stageCard, resultCard,
    note('A web page cannot draw on your desktop, so an area is chosen on the preview. Windows shares system sound with “Entire screen”; on Linux pick the “Monitor of …” input as a microphone to record system sound.', 'info'),
    actions(pickBtn, startBtn, pauseBtn, stopBtn, saveBtn));
  setButtons();
  return () => { live = false; stopAll(); clearInterval(timer); URL.revokeObjectURL(outUrl); };
};
