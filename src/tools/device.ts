// Device tests and phone sensors. Everything uses standard browser APIs on the device; nothing leaves it.
import { h, card, field, button, segmented, toggle, slider, clear, stack, note, errMsg, downloadBlob, canvasToBlob, type Mount } from '../ui';
import { isIOS } from '../platform';
import { modernZone } from '../lib/tz';
import { headingOf, platformName, screenTilt } from '../lib/sensors';

const stopStream = (s?: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());
const kv = (rows: Array<[string, string]>) => h('div', { class: 'kv' }, rows.flatMap(([k, v]) => [h('span', null, k), h('span', null, v)]));
/** getUserMedia's errors in words. */
function mediaError(e: any, device: 'camera' | 'microphone'): string {
  const n = e?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return `Permission was denied. Allow the ${device} in the browser's site settings (the icon in the address bar) and try again.`;
  if (n === 'NotFoundError') return `No ${device} was found — check that one is connected.`;
  if (n === 'OverconstrainedError') return `The chosen ${device} is no longer there — the next Start uses the default one.`;
  if (n === 'NotReadableError' || n === 'AbortError') return `The ${device} is busy (another app or tab is using it). Close that, then try again.`;
  if (!navigator.mediaDevices?.getUserMedia) return `This browser gives no access to a ${device} here (it needs a secure https:// page).`;
  return `Could not start the ${device}: ${errMsg(e)}`;
}
/** The newest camera / microphone request wins, and none outlives the tab: a second request while the browser was still
 *  asking (a camera, a microphone or a resolution chosen, Record pressed) left the first stream running, and a stream
 *  that arrived after the tab was left was never stopped — the camera light stayed on. Such a stream is stopped at
 *  once; `get` gives null for it (and drops an error of a request that is no longer the newest). */
function mediaGate() {
  let seq = 0, live = true;
  return {
    async get(c: MediaStreamConstraints): Promise<MediaStream | null> {
      const my = ++seq;
      let s: MediaStream;
      try { s = await navigator.mediaDevices.getUserMedia(c); } catch (e) { if (my !== seq || !live) return null; throw e; }
      if (my !== seq || !live) { stopStream(s); return null; }
      return s;
    },
    end() { live = false; seq++; },
    get live() { return live; },
  };
}
/** The screen's rotation from the phone's natural (portrait) position, 0 / 90 / 180 / 270 — 90 = turned
 *  counter-clockwise, its top edge to the left. iPhones: window.orientation (Safari's screen.orientation.angle has been
 *  seen to disagree with it — WebKit bug 254863). */
function screenAngle(): number {
  const w = (window as any).orientation, a = typeof w === 'number' ? w : (screen.orientation?.angle ?? 0);
  return ((a % 360) + 360) % 360;
}

// ------------------------------------------------------------------ Webcam
export const webcam: Mount = (root) => {
  let stream: MediaStream | null = null, mirror = true;
  const gate = mediaGate();
  const video = h('video', { class: 'cam-video', autoplay: true, playsinline: true, muted: true });
  const info = h('div');
  const devSel = h('select', { class: 'input select', 'aria-label': 'Camera' });
  let res = '1080';
  const RES: Record<string, [number, number]> = { '480': [640, 480], '720': [1280, 720], '1080': [1920, 1080], '2160': [3840, 2160] };
  const start = async () => {
    stopStream(stream); stream = null; video.srcObject = null; // a camera may not open twice: the old stream goes first
    clear(info);
    const [w, hh] = RES[res];
    let s: MediaStream | null;
    try { s = await gate.get({ video: { deviceId: devSel.value ? { exact: devSel.value } : undefined, width: { ideal: w }, height: { ideal: hh } }, audio: false }); }
    catch (e: any) { if (e?.name === 'OverconstrainedError') devSel.value = ''; clear(info).append(note(mediaError(e, 'camera'), 'err')); return; }
    if (!s) return; // a newer request, or the tab was left
    stream = s; video.srcObject = s;
    const track = s.getVideoTracks()[0];
    track.addEventListener('ended', () => { if (stream === s) info.prepend(note('The camera stopped — unplugged, or taken by another app. Press Start camera to try again.', 'warn')); });
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    if (stream !== s) return;
    const st = track.getSettings();
    devSel.replaceChildren(...devices.map((d, i) => h('option', { value: d.deviceId }, d.label || `Camera ${i + 1}`)));
    if (st.deviceId) devSel.value = st.deviceId;
    clear(info).append(kv([['Camera', track.label || '—'], ['Resolution', `${st.width} × ${st.height}`], ['Frame rate', st.frameRate ? `${Math.round(st.frameRate)} fps` : '—'], ['Facing', (st as any).facingMode || '—'], ['Cameras found', String(devices.length)]]));
  };
  devSel.addEventListener('change', start);
  const snap = async () => {
    if (!video.videoWidth) throw new Error('Start the camera first.');
    const c = h('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d')!; if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); } g.drawImage(video, 0, 0);
    downloadBlob(await canvasToBlob(c, 'image/jpeg', 0.92), `webcam-${Date.now()}.jpg`);
  };
  root.append(card(null, h('div', { class: 'cam-wrap' }, video), info),
    card('Options', stack(field('Camera', devSel), field('Requested resolution', segmented([['480', '480p'], ['720', '720p'], ['1080', '1080p'], ['2160', '4K']], res, (v) => { res = v; start(); })),
      toggle('Mirror preview', true, (v) => { mirror = v; video.style.transform = v ? 'scaleX(-1)' : ''; }))),
    h('div', { class: 'actions' }, button('Start camera', start, { variant: 'primary', icon: 'Webcam' }), button('Snapshot', snap, { icon: 'Camera' })));
  video.style.transform = 'scaleX(-1)';
  return () => { gate.end(); stopStream(stream); stream = null; };
};

// ------------------------------------------------------------------ Microphone test
export const mic: Mount = (root) => {
  let stream: MediaStream | null = null, ctx: AudioContext | null = null, raf = 0, rec: MediaRecorder | null = null, src: MediaStreamAudioSourceNode | null = null, url = '';
  const gate = mediaGate();
  const canvas = h('canvas', { class: 'wave' });
  const meter = h('div', { class: 'meter' }, h('span'));
  const info = h('div'), playback = h('div');
  const devSel = h('select', { class: 'input select', 'aria-label': 'Microphone' });
  const start = async () => {
    cancelAnimationFrame(raf); clear(info); stopStream(stream); stream = null; src?.disconnect(); src = null;
    // the audio engine is opened in the tap itself: Safari starts audio only from one (after the permission question it
    // stayed suspended and the meter showed nothing)
    try { ctx ||= new AudioContext(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); } catch { /* no Web Audio */ }
    let s: MediaStream | null;
    try { s = await gate.get({ audio: { deviceId: devSel.value ? { exact: devSel.value } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (e: any) { if (e?.name === 'OverconstrainedError') devSel.value = ''; clear(info).append(note(mediaError(e, 'microphone'), 'err')); return; }
    if (!s) return;
    stream = s;
    const track = s.getAudioTracks()[0];
    track.addEventListener('ended', () => { if (stream === s) info.prepend(note('The microphone stopped — unplugged, or taken by another app. Press Start to try again.', 'warn')); });
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    if (stream !== s) return;
    const cur = track.getSettings();
    devSel.replaceChildren(...devices.map((d, i) => h('option', { value: d.deviceId }, d.label || `Microphone ${i + 1}`)));
    if (cur.deviceId) devSel.value = cur.deviceId;
    info.append(kv([['Microphone', track.label || '—'], ['Sample rate', cur.sampleRate ? `${cur.sampleRate} Hz` : '—'], ['Channels', String(cur.channelCount ?? '—')], ['Microphones found', String(devices.length)]]));
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const an = ctx.createAnalyser(); an.fftSize = 2048; src = ctx.createMediaStreamSource(s); src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const draw = () => {
      an.getFloatTimeDomainData(buf);
      let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v));
      (meter.firstChild as HTMLElement).style.width = `${Math.min(100, peak * 100)}%`;
      const W = (canvas.width = canvas.clientWidth * devicePixelRatio), H = (canvas.height = canvas.clientHeight * devicePixelRatio), g = canvas.getContext('2d')!;
      g.clearRect(0, 0, W, H); g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent'); g.lineWidth = 2 * devicePixelRatio; g.beginPath();
      for (let i = 0; i < buf.length; i++) { const x = (i / buf.length) * W, y = H / 2 - buf[i] * H / 2; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke(); raf = requestAnimationFrame(draw);
    };
    draw();
  };
  devSel.addEventListener('change', start);
  const record = async () => {
    if (rec?.state === 'recording') return; // one recording at a time (a second press started another one over it)
    if (!stream) await start();
    if (!stream || !gate.live) return;
    clear(playback).append(note('Recording 5 seconds… speak now.'));
    const chunks: Blob[] = [], r = new MediaRecorder(stream);
    rec = r;
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      if (!gate.live || rec !== r) return; // the tab was left meanwhile: no playback (it played after the tab was left)
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob(chunks, { type: r.mimeType }));
      const a = h('audio', { controls: true, src: url }); clear(playback).append(a); a.play().catch(() => {});
    };
    r.start(); setTimeout(() => { if (r.state === 'recording') r.stop(); }, 5000);
  };
  root.append(card(null, meter, canvas, info), card('Options', field('Microphone', devSel)), card('Playback test', playback),
    h('div', { class: 'actions' }, button('Start', start, { variant: 'primary', icon: 'Mic' }), button('Record 5 s', record, { icon: 'Circle' })));
  return () => {
    gate.end(); cancelAnimationFrame(raf);
    if (rec?.state === 'recording') rec.stop();
    rec = null; stopStream(stream); stream = null; ctx?.close(); ctx = null;
    if (url) URL.revokeObjectURL(url);
  };
};

// ------------------------------------------------------------------ Speaker test
export const speaker: Mount = (root) => {
  let ctx: AudioContext | null = null, osc: OscillatorNode | null = null, gain: GainNode | null = null;
  let freq = 440;
  const ac = () => { ctx ||= new AudioContext(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); return ctx; };
  /** The sound ends with a 20 ms fade: cut off at once, it clicked in the speakers. */
  const stop = () => {
    const o = osc, g = gain; osc = null; gain = null;
    if (!o || !g || !ctx) return;
    const t = ctx.currentTime;
    try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02); o.stop(t + 0.025); } catch { /* already over */ }
  };
  const tone = (pan: number, secs = 1.2, f = freq) => {
    stop();
    const c = ac(), o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
    o.frequency.value = f; p.pan.value = pan;
    g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + 0.05); g.gain.setValueAtTime(0.3, c.currentTime + secs - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + secs);
    o.connect(g).connect(p).connect(c.destination); o.start(); o.stop(c.currentTime + secs); osc = o; gain = g;
  };
  const say = (text: string, pan: number) => { tone(pan, 0.8); if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); speechSynthesis.cancel(); speechSynthesis.speak(u); } };
  const sweep = () => {
    stop();
    const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.frequency.setValueAtTime(20, t); o.frequency.exponentialRampToValueAtTime(20000, t + 10);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.05); g.gain.setValueAtTime(0.2, t + 9.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 10); // no click at either end
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 10); osc = o; gain = g;
  };
  const stopAll = () => { stop(); if ('speechSynthesis' in window) speechSynthesis.cancel(); };
  root.append(card('Stereo', h('div', { class: 'spk-row' },
    button('Left', () => say('Left', -1), { variant: 'primary', icon: 'ArrowLeft' }), button('Both', () => say('Centre', 0), { icon: 'Volume2' }), button('Right', () => say('Right', 1), { variant: 'primary', icon: 'ArrowRight' }))),
  card('Tone generator', stack(slider({ label: 'Frequency', min: 20, max: 20000, value: freq, unit: ' Hz', onInput: (v) => { freq = v; if (osc) osc.frequency.value = v; } }),
    h('div', { class: 'row' }, button('Play tone', () => tone(0, 3), { icon: 'Play' }), button('Sweep 20 Hz → 20 kHz', sweep, { icon: 'AudioLines' }), button('Stop', stopAll, { icon: 'Square' })))),
  note('Start with low volume. Most adults hear up to ~15–17 kHz; small speakers often can\'t reproduce below ~100 Hz.'));
  return () => { osc = null; gain = null; ctx?.close(); ctx = null; if ('speechSynthesis' in window) speechSynthesis.cancel(); };
};

// ------------------------------------------------------------------ Keyboard test (PC)
const ROWS: string[][] = [
  ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
  ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
  ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'],
];
// the keys beside the main block on full-size keyboards (Delete, Home, End … were not drawn — a laptop's Delete key could
// not be checked); keys on no drawing (the ISO key beside left Shift, F13 …) are listed by name
const NAV: string[][] = [['PrintScreen', 'ScrollLock', 'Pause'], ['Insert', 'Home', 'PageUp'], ['Delete', 'End', 'PageDown']];
const NUMPAD: string[][] = [['NumLock', 'NumpadDivide', 'NumpadMultiply', 'NumpadSubtract'], ['Numpad7', 'Numpad8', 'Numpad9', 'NumpadAdd'], ['Numpad4', 'Numpad5', 'Numpad6'], ['Numpad1', 'Numpad2', 'Numpad3', 'NumpadEnter'], ['Numpad0', 'NumpadDecimal']];
const NAMES: Record<string, string> = { Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Win', MetaRight: 'Win', Escape: 'Esc', ContextMenu: 'Menu', CapsLock: 'CapsLock',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Insert: 'Ins', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn',
  NumLock: 'Num', NumpadDivide: '/', NumpadMultiply: '*', NumpadSubtract: '−', NumpadAdd: '+', NumpadEnter: 'Enter', NumpadDecimal: '.' };
const LABEL = (code: string) => NAMES[code] ?? code.replace(/^Key|^Digit|^Numpad/, '');
export const keyboard: Mount = (root) => {
  const keys = new Map<string, HTMLElement>(), main = new Set(ROWS.flat()), other = new Set<string>();
  const block = (rows: string[][], cls: string) => h('div', { class: `kb-block ${cls}` }, rows.map((r) => h('div', { class: 'kb-row' }, r.map((code) => { const k = h('div', { class: `kb-key kb-${code}` }, LABEL(code)); keys.set(code, k); return k; }))));
  const kb = h('div', { class: 'kb', tabindex: '0', 'aria-label': 'Keyboard — press keys to test them' }, block(ROWS, 'kb-main'), block(NAV, 'kb-side kb-nav'), block(NUMPAD, 'kb-side kb-num'));
  const last = h('div', { class: 'kv' });
  const tested = h('div', { class: 'muted' });
  const count = () => {
    const hit = [...keys].filter(([, k]) => k.classList.contains('hit')), m = hit.filter(([c]) => main.has(c)).length, x = hit.length - m;
    tested.textContent = `${m} of ${main.size} keys tested${x ? ` · ${x} more (navigation and number pad)` : ''}${other.size ? ` · other keys: ${[...other].join(', ')}` : ''}`;
  };
  const down = (e: KeyboardEvent) => {
    if (!kb.contains(document.activeElement) && document.activeElement !== kb) return;
    e.preventDefault(); e.stopPropagation(); // the app's own shortcuts (/ and Ctrl+K → search) must not steal the focus
    const k = keys.get(e.code);
    if (k) k.classList.add('down', 'hit'); else if (e.code && e.code !== 'Unidentified') other.add(e.code);
    clear(last).append(...([['key', JSON.stringify(e.key)], ['code', e.code], ['keyCode', String(e.keyCode)], ['location', String(e.location)], ['modifiers', [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', e.metaKey && 'Meta'].filter(Boolean).join(' + ') || 'none'], ['repeat', String(e.repeat)]] as Array<[string, string]>).flatMap(([a, b]) => [h('span', null, a), h('code', null, b)]));
    count();
  };
  const up = (e: KeyboardEvent) => keys.get(e.code)?.classList.remove('down');
  // a key held while the window loses the focus (Alt+Tab, Win+D) never sends its key-up: it showed as stuck
  const lost = () => keys.forEach((k) => k.classList.remove('down'));
  addEventListener('keydown', down, true); addEventListener('keyup', up, true); addEventListener('blur', lost); // capture: runs before document listeners
  root.append(note('Click the keyboard below, then press keys. Keys turn green once they register; a key that stays dark blue after you let go is stuck. Every key is captured while the keyboard has the focus (Tab too) — click anywhere outside it to stop.'),
    card(null, h('div', { class: 'scroll-x' }, kb), tested), card('Last key event', last),
    h('div', { class: 'actions' }, button('Reset', () => { keys.forEach((k) => k.classList.remove('hit', 'down')); other.clear(); tested.textContent = ''; kb.focus(); }, { icon: 'RotateCcw' })));
  setTimeout(() => kb.focus(), 50);
  return () => { removeEventListener('keydown', down, true); removeEventListener('keyup', up, true); removeEventListener('blur', lost); };
};

// ------------------------------------------------------------------ Dead pixel test
export const pixels: Mount = (root) => {
  const COLORS = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080', '#ffff00', '#00ffff', '#ff00ff'];
  let close: (() => void) | null = null;
  const start = async () => {
    close?.();
    let i = 0;
    const panel = h('div', { class: 'pixel-panel', style: { background: COLORS[0] } }, h('div', { class: 'pixel-hint' }, 'Tap / click or press → for next colour · Esc to exit'));
    document.body.append(panel);
    const show = () => { panel.style.background = COLORS[i]; panel.firstElementChild?.remove(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close?.();
      else if (['ArrowRight', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); i = (i + 1) % COLORS.length; show(); }
      else if (e.key === 'ArrowLeft') { i = (i + COLORS.length - 1) % COLORS.length; show(); }
    };
    // not { once: true }: entering full screen fires this event too, and the exit must still close the panel
    const fs = () => { if (!document.fullscreenElement) close?.(); };
    close = () => {
      close = null; panel.remove(); removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    panel.addEventListener('click', () => { i = (i + 1) % COLORS.length; show(); });
    addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', fs);
    try { await panel.requestFullscreen(); } catch { /* iOS: fixed panel still covers the page */ }
  };
  root.append(card(null, stack(h('p', null, 'Fills the screen with solid colours (black, white, red, green, blue, grey, yellow, cyan, magenta). Look closely for dots that stay a different colour — dead (always dark) or stuck (always lit) pixels — and for uneven backlight on black.'),
    h('div', { class: 'swatches' }, COLORS.map((c) => h('span', { style: { background: c } }))))), h('div', { class: 'actions' }, button('Start full-screen test', start, { variant: 'primary', icon: 'Maximize' })));
  return () => close?.(); // leaving the tab (e.g. the phone's Back button) must not leave the panel over the app
};

// ------------------------------------------------------------------ Touch test (mobile)
export const touch: Mount = (root) => {
  const canvas = h('canvas', { class: 'touch-canvas' });
  const info = h('div', { class: 'muted center' }, 'Draw with one or more fingers');
  let maxTouches = 0;
  const colors = ['#4f46e5', '#e11d48', '#059669', '#d97706', '#0891b2', '#7c3aed', '#db2777', '#65a30d', '#ea580c', '#0d9488'];
  const last = new Map<number, [number, number]>();
  const resize = () => { canvas.width = canvas.clientWidth * devicePixelRatio; canvas.height = canvas.clientHeight * devicePixelRatio; };
  const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio] as [number, number]; };
  const active = new Set<number>();
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); active.add(e.pointerId); maxTouches = Math.max(maxTouches, active.size); last.set(e.pointerId, pos(e)); info.textContent = `${active.size} touch${active.size > 1 ? 'es' : ''} · max ${maxTouches} · pressure ${e.pressure.toFixed(2)}`; });
  canvas.addEventListener('pointermove', (e) => {
    const p = last.get(e.pointerId); if (!p) return;
    const g = canvas.getContext('2d')!, n = pos(e);
    g.strokeStyle = colors[e.pointerId % colors.length]; g.lineWidth = Math.max(3, (e.width || 8) * devicePixelRatio * 0.6); g.lineCap = 'round';
    g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(n[0], n[1]); g.stroke(); last.set(e.pointerId, n);
  });
  const end = (e: PointerEvent) => {
    active.delete(e.pointerId); last.delete(e.pointerId);
    info.textContent = active.size ? `${active.size} touch${active.size > 1 ? 'es' : ''} · max ${maxTouches}` : `No finger on the screen · max ${maxTouches}`; // it kept saying "2 touches" after they lifted
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  root.append(card(null, canvas, info), h('div', { class: 'actions' }, button('Clear', () => { canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); maxTouches = 0; info.textContent = 'Draw with one or more fingers'; }, { icon: 'Eraser' })),
    note(`This device reports up to ${navigator.maxTouchPoints || 0} simultaneous touch points. Draw lines across every edge to find dead zones.`));
  requestAnimationFrame(resize);
  addEventListener('resize', resize); // rotating the phone: keep the canvas at the real pixel size (no stretched lines)
  return () => removeEventListener('resize', resize);
};

// ------------------------------------------------------------------ Screen info
export const screen_: Mount = (root) => {
  const out = h('div');
  let hz = 0, ua: Record<string, any> = {}, gpu = '…', seq = 0, timer = 0, live = true;
  /** The refresh rate from the frames' own time stamps: the median gap of 60 frames (one late frame does not count;
   *  starting the clock before the first frame put "~59 Hz" on 60 Hz screens). */
  const measureHz = () => new Promise<number>((res) => {
    const ts: number[] = [];
    const f = (t: number) => { ts.push(t); if (ts.length < 61) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); res(Math.round(1000 / d[d.length >> 1])); } };
    requestAnimationFrame(f);
  });
  const uad = (navigator as any).userAgentData;
  const render = () => {
    if (!live) return;
    const dpr = devicePixelRatio, sw = screen.width, sh = screen.height; // read when drawn: a resize during a measurement showed the old size
    const mm = (q: string) => matchMedia(q).matches;
    const brands = (ua.fullVersionList || uad?.brands || []).filter((b: any) => !/Not/.test(b.brand));
    clear(out).append(
      card('Display', kv([['Screen (CSS px)', `${sw} × ${sh}`], ['Physical pixels', `${Math.round(sw * dpr)} × ${Math.round(sh * dpr)}`], ['Device pixel ratio', String(dpr)], ['Viewport', `${innerWidth} × ${innerHeight}`], ['Available area', `${screen.availWidth} × ${screen.availHeight}`],
        ['Colour depth', `${screen.colorDepth}-bit`], ['Colour gamut', mm('(color-gamut: rec2020)') ? 'Rec. 2020' : mm('(color-gamut: p3)') ? 'Display P3' : 'sRGB'], ['HDR', mm('(dynamic-range: high)') ? 'Yes' : 'No'], ['Refresh rate (measured)', hz ? `~${hz} Hz` : 'measuring…'],
        ['Orientation', (screen.orientation as any)?.type || '—'], ['Dark mode', mm('(prefers-color-scheme: dark)') ? 'On' : 'Off'], ['Touch points', String(navigator.maxTouchPoints || 0)]])),
      card('Browser & device', kv([['Browser', brands.length ? brands.map((b: any) => `${b.brand} ${b.version}`).join(', ') : navigator.userAgent], ['Platform', platformName(ua.platform || '', ua.platformVersion || '') || navigator.platform], ['Model', ua.model || '—'],
        ['CPU threads', String(navigator.hardwareConcurrency || '—')], ['Memory (approx.)', (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory} GB+` : '—'], ['Language', navigator.language], ['Time zone', modernZone(Intl.DateTimeFormat().resolvedOptions().timeZone)], ['WebGPU', gpu], ['User agent', navigator.userAgent]])),
    );
  };
  const measure = async () => { const my = ++seq; const v = await measureHz(); if (my === seq && live) { hz = v; render(); } };
  /** WebGPU is there only when the browser finds an adapter ("Available" was shown wherever navigator.gpu existed). */
  const findGpu = async () => {
    const g = (navigator as any).gpu;
    if (!g) { gpu = 'Not in this browser'; return; }
    try {
      const a = await Promise.race([g.requestAdapter(), new Promise((r) => setTimeout(() => r(undefined), 3000))]) as any;
      if (!a) { gpu = 'Not available on this device (no adapter)'; return; }
      const i = a.info || (typeof a.requestAdapterInfo === 'function' ? await a.requestAdapterInfo() : null);
      gpu = `Available${i?.vendor ? ` (${[i.vendor, i.architecture].filter(Boolean).join(' ')})` : ''}`;
    } catch { gpu = 'Not available on this device'; }
  };
  const resized = () => { render(); clearTimeout(timer); timer = window.setTimeout(measure, 300); }; // sizes at once, the rate once the window rests
  const dark = matchMedia('(prefers-color-scheme: dark)');
  addEventListener('resize', resized); dark.addEventListener('change', render);
  root.append(out);
  render(); void measure();
  void (async () => { try { if (uad?.getHighEntropyValues) ua = await uad.getHighEntropyValues(['platform', 'platformVersion', 'model', 'fullVersionList']); } catch { /* */ } render(); })();
  void findGpu().then(render);
  return () => { live = false; seq++; clearTimeout(timer); removeEventListener('resize', resized); dark.removeEventListener('change', render); };
};
export { screen_ as screen };

// ------------------------------------------------------------------ Bubble level (mobile)
async function motionPermission(): Promise<boolean> {
  const D: any = (window as any).DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') { try { return (await D.requestPermission()) === 'granted'; } catch { return false; } }
  return true;
}
const deg1 = (v: number) => `${(Math.abs(v) < 0.05 ? 0 : v).toFixed(1)}°`; // never "-0.0°"
export const level: Mount = (root) => {
  let zb = 0, zg = 0, b = 0, g = 0, got = false, warn = 0;
  const bubble = h('div', { class: 'bubble' });
  const vial = h('div', { class: 'vial' }, h('div', { class: 'vial-ring' }), bubble);
  const readout = h('div', { class: 'big-value center' }, '—');
  const caption = h('div', { class: 'muted small center' }, 'left–right · front–back (degrees)');
  const status = h('div');
  const clamp = (v: number) => Math.max(-45, Math.min(45, v));
  const on = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    got = true; b = e.beta; g = e.gamma;
    // the tilt as the screen shows it: in landscape the phone's sides are the screen's top and bottom (the bubble ran
    // along the wrong axis there)
    const { right, top } = screenTilt(b - zb, g - zg, screenAngle()); // right side lower, top edge higher
    bubble.style.transform = `translate(${(-clamp(right) / 45) * 100}px, ${(-clamp(top) / 45) * 100}px)`; // the bubble stops at the rim…
    readout.textContent = `${deg1(right)} · ${deg1(top)}`; // …the reading does not
    bubble.classList.toggle('level', Math.hypot(right, top) < 0.6);
  };
  const start = async () => {
    clear(status); clearTimeout(warn);
    if (!(await motionPermission())) { status.append(note('Motion access was denied. On iPhone: allow it when asked (Settings › Safari › Motion & Orientation Access).', 'err')); return; }
    addEventListener('deviceorientation', on);
    warn = window.setTimeout(() => { if (!got) clear(status).append(note('No motion sensor data — this device or browser has no tilt sensor (most PCs).', 'warn')); }, 1500);
  };
  root.append(card(null, vial, readout, caption, status), h('div', { class: 'actions' }, button('Start', start, { variant: 'primary', icon: 'Crosshair' }), button('Calibrate (set zero)', () => { zb = b; zg = g; }, { icon: 'RotateCcw' })),
    note('Lay the phone flat on the surface. Turns green when level. Calibrate on a known-flat surface for best accuracy.'));
  return () => { clearTimeout(warn); removeEventListener('deviceorientation', on); };
};

// ------------------------------------------------------------------ Compass (mobile)
export const compass: Mount = (root) => {
  let got = false, rot = 0, warn = 0;
  const dial = h('div', { class: 'dial' }, ...['N', 'E', 'S', 'W'].map((d, i) => h('span', { class: `dial-${d}`, style: { transform: `rotate(${i * 90}deg) translateY(-112px) rotate(${-i * 90}deg)` } }, d)), h('div', { class: 'dial-needle' }));
  const readout = h('div', { class: 'big-value center' }, '—');
  const status = h('div');
  const card8 = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
  const on = (e: any) => {
    let heading: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') heading = (e.webkitCompassHeading + screenAngle()) % 360; // iPhone: the phone's top, in portrait
    else if (e.absolute && e.alpha != null) heading = headingOf(e.alpha, e.beta ?? 0, e.gamma ?? 0, screenAngle()); // Android
    if (heading == null) return;
    got = true;
    rot += ((-heading - rot) % 360 + 540) % 360 - 180; // shortest turn: 359° → 1° moves 2°, not a full spin back
    dial.style.transform = `rotate(${rot}deg)`;
    readout.textContent = `${Math.round(heading) % 360}° ${card8(heading)}`; // 359.6° → "0° N", not "360° N"
  };
  const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  const start = async () => {
    clear(status); clearTimeout(warn);
    if (!(await motionPermission())) { status.append(note('Motion access was denied.', 'err')); return; }
    addEventListener(evt, on);
    warn = window.setTimeout(() => { if (!got) clear(status).append(note('No compass data — this device has no magnetometer, or the browser does not expose it.', 'warn')); }, 1500);
  };
  root.append(card(null, h('div', { class: 'dial-wrap' }, dial), readout, status), h('div', { class: 'actions' }, button('Start', start, { variant: 'primary', icon: 'Compass' })),
    // iPhones too: Safari's webkitCompassHeading is measured from magnetic north (it said "true north")
    note(`Shows magnetic north. Hold the phone flat, or upright to aim with the back camera. Keep away from magnets and metal${isIOS ? '' : '; wave the phone in a figure-8 to calibrate'}.`));
  return () => { clearTimeout(warn); removeEventListener(evt, on); };
};

// ------------------------------------------------------------------ Sound meter
export const soundmeter: Mount = (root) => {
  let stream: MediaStream | null = null, ctx: AudioContext | null = null, raf = 0, offset = 90, src: MediaStreamAudioSourceNode | null = null;
  // levels are kept as the microphone gives them (dB of the digital full scale) and the offset is added when shown: a new
  // offset moves min, average and max with the reading (they mixed offsets)
  let min = Infinity, max = -Infinity, energy = 0, n = 0;
  const gate = mediaGate();
  const big = h('div', { class: 'big-value center db' }, '—');
  const stats = h('div', { class: 'muted center' });
  const hist = h('canvas', { class: 'wave' });
  const series: number[] = [];
  const level = (db: number) => (db < 40 ? 'Quiet room' : db < 60 ? 'Conversation' : db < 75 ? 'Busy street' : db < 90 ? 'Loud — limit exposure' : 'Very loud — hearing risk');
  const shown = (raw: number) => Math.max(0, raw + offset); // digital silence → 0 dB, not −150
  const status = h('div');
  const start = async () => {
    clear(status); cancelAnimationFrame(raf); stopStream(stream); stream = null; src?.disconnect(); src = null; // Start again: one stream, one loop
    try { ctx ||= new AudioContext(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); } catch { /* no Web Audio */ } // in the tap (Safari)
    let s: MediaStream | null;
    try { s = await gate.get({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (e) { clear(status).append(note(mediaError(e, 'microphone'), 'err')); return; }
    if (!s) return;
    if (!ctx) { stopStream(s); clear(status).append(note('This browser has no Web Audio — the level cannot be measured.', 'err')); return; }
    stream = s;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const an = ctx.createAnalyser(); an.fftSize = 4096; src = ctx.createMediaStreamSource(s); src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      let sq = 0; for (const v of buf) sq += v * v;
      const ms = sq / buf.length, raw = 10 * Math.log10(ms + 1e-24); // 20·log10(RMS)
      min = Math.min(min, raw); max = Math.max(max, raw); energy += ms; n++; series.push(raw); if (series.length > 300) series.shift();
      // the average is the energy average (Leq), as sound level meters give it — the mean of the dB values said 60 dB for
      // a minute of 80 and a minute of 40 (Leq: 77)
      const db = shown(raw), avg = 10 * Math.log10(energy / n + 1e-24);
      big.textContent = `${db.toFixed(0)} dB`; stats.textContent = `${level(db)} · min ${shown(min).toFixed(0)} · avg ${shown(avg).toFixed(0)} · max ${shown(max).toFixed(0)}`;
      const W = (hist.width = hist.clientWidth * devicePixelRatio), H = (hist.height = hist.clientHeight * devicePixelRatio), g = hist.getContext('2d')!;
      g.clearRect(0, 0, W, H); g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
      series.forEach((d, i) => { const hh = Math.max(1, ((shown(d) - 20) / 100) * H); g.fillRect((i / 300) * W, H - hh, Math.max(1, W / 300), hh); });
      raf = requestAnimationFrame(loop);
    };
    loop();
  };
  root.append(card(null, big, stats, hist, status), card('Calibration', slider({ label: 'Offset (adjust to match a reference meter)', min: 60, max: 120, value: offset, unit: ' dB', onInput: (v) => (offset = v) })),
    h('div', { class: 'actions' }, button('Start', start, { variant: 'primary', icon: 'Gauge' }), button('Reset stats', () => { min = Infinity; max = -Infinity; energy = 0; n = 0; series.length = 0; }, { icon: 'RotateCcw' })),
    note('Phone and laptop microphones are not calibrated instruments; readings are approximate (±5–10 dB), unweighted (not dB(A)). The average is the energy average (Leq).'));
  return () => { gate.end(); cancelAnimationFrame(raf); stopStream(stream); stream = null; ctx?.close(); ctx = null; };
};

// ------------------------------------------------------------------ Ruler
export const ruler: Mount = (root) => {
  // CSS px per mm. 96 CSS px per inch is the web standard but real screens differ — calibrate with a card (85.60 mm).
  let pxPerMm = 96 / 25.4;
  let unit = 'cm';
  const rulerEl = h('div', { class: 'ruler' });
  const cardBox = h('div', { class: 'card-outline' }, 'Card');
  const draw = () => {
    clear(rulerEl);
    const width = rulerEl.clientWidth || 600;
    const step = unit === 'cm' ? pxPerMm : (pxPerMm * 25.4) / 16; // mm or 1/16 inch
    const n = Math.floor(width / step);
    for (let i = 0; i <= n; i++) {
      const major = unit === 'cm' ? i % 10 === 0 : i % 16 === 0, mid = unit === 'cm' ? i % 5 === 0 : i % 8 === 0;
      rulerEl.append(h('span', { class: `tick ${major ? 'major' : mid ? 'mid' : ''}`, style: { left: `${i * step}px` } }, major ? h('b', null, String(unit === 'cm' ? i / 10 : i / 16)) : null));
    }
    // A card (85.6 mm) is wider than a phone held upright: draw it upright there so it is never squeezed by the screen
    // edge (a squeezed outline would make the user calibrate to the wrong size).
    const avail = cardBox.parentElement?.clientWidth || Infinity, upright = 85.6 * pxPerMm > avail;
    cardBox.style.width = `${(upright ? 53.98 : 85.6) * pxPerMm}px`; cardBox.style.height = `${(upright ? 85.6 : 53.98) * pxPerMm}px`;
    cardBox.textContent = upright ? 'Card (upright)' : 'Card';
  };
  const cal = slider({ label: 'Calibration', min: 2, max: 8, step: 0.005, value: pxPerMm, fmt: (v) => `${v.toFixed(3)} px/mm`, onInput: (v) => { pxPerMm = v; draw(); } });
  root.append(card(null, h('div', { class: 'ruler-wrap' }, rulerEl)), card(null, field('Units', segmented([['cm', 'Centimetres'], ['in', 'Inches']], unit, (v) => { unit = v; draw(); }))),
    card('Calibrate with a bank/ID card', stack(h('p', { class: 'muted' }, 'Hold any standard card (credit, debit, Aadhaar PVC, driving licence — 85.6 × 54 mm) against the screen and drag the slider until the outline matches it exactly. On a phone, hold the card upright and match its long edge.'), cardBox, cal)),
    note('Calibration is kept only while this tab is open.'));
  requestAnimationFrame(draw);
  addEventListener('resize', draw);
  return () => removeEventListener('resize', draw);
};
