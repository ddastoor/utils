// Device tests and phone sensors. Everything uses standard browser APIs on the device; nothing leaves it.
import { h, card, field, button, segmented, toggle, slider, select, clear, stack, note, downloadBlob, canvasToBlob, type Mount } from '../ui';
import { isIOS } from '../platform';

const stopStream = (s?: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());
const kv = (rows: Array<[string, string]>) => h('div', { class: 'kv' }, rows.flatMap(([k, v]) => [h('span', null, k), h('span', null, v)]));
const permErr = (e: any) => note(e?.name === 'NotAllowedError' ? 'Permission was denied. Allow access in the browser\'s site settings (padlock icon) and try again.' : e?.name === 'NotFoundError' ? 'No such device was found.' : `Could not start: ${e?.message || e}`, 'err');

// ------------------------------------------------------------------ Webcam
export const webcam: Mount = (root) => {
  let stream: MediaStream | null = null, mirror = true;
  const video = h('video', { class: 'cam-video', autoplay: true, playsinline: true, muted: true });
  const info = h('div');
  const devSel = h('select', { class: 'input select' });
  let res = '1080';
  const RES: Record<string, [number, number]> = { '480': [640, 480], '720': [1280, 720], '1080': [1920, 1080], '2160': [3840, 2160] };
  const start = async () => {
    stopStream(stream);
    clear(info);
    try {
      const [w, hh] = RES[res];
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: devSel.value ? { exact: devSel.value } : undefined, width: { ideal: w }, height: { ideal: hh } }, audio: false });
      video.srcObject = stream;
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const cur = stream.getVideoTracks()[0].getSettings().deviceId;
      devSel.replaceChildren(...devices.map((d, i) => h('option', { value: d.deviceId }, d.label || `Camera ${i + 1}`)));
      if (cur) devSel.value = cur;
      const s = stream.getVideoTracks()[0].getSettings();
      info.append(kv([['Camera', stream.getVideoTracks()[0].label || '—'], ['Resolution', `${s.width} × ${s.height}`], ['Frame rate', s.frameRate ? `${Math.round(s.frameRate)} fps` : '—'], ['Facing', (s as any).facingMode || '—'], ['Cameras found', String(devices.length)]]));
    } catch (e) { info.append(permErr(e)); }
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
  return () => stopStream(stream);
};

// ------------------------------------------------------------------ Microphone test
export const mic: Mount = (root) => {
  let stream: MediaStream | null = null, ctx: AudioContext | null = null, raf = 0, rec: MediaRecorder | null = null;
  const canvas = h('canvas', { class: 'wave' });
  const meter = h('div', { class: 'meter' }, h('span'));
  const info = h('div'), playback = h('div');
  const devSel = h('select', { class: 'input select' });
  const start = async () => {
    stopStream(stream); cancelAnimationFrame(raf); clear(info);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: devSel.value ? { exact: devSel.value } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const cur = stream.getAudioTracks()[0].getSettings();
      devSel.replaceChildren(...devices.map((d, i) => h('option', { value: d.deviceId }, d.label || `Microphone ${i + 1}`)));
      if (cur.deviceId) devSel.value = cur.deviceId;
      info.append(kv([['Microphone', stream.getAudioTracks()[0].label || '—'], ['Sample rate', cur.sampleRate ? `${cur.sampleRate} Hz` : '—'], ['Channels', String(cur.channelCount ?? '—')], ['Microphones found', String(devices.length)]]));
      ctx ||= new AudioContext();
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 2048; src.connect(an);
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
    } catch (e) { info.append(permErr(e)); }
  };
  devSel.addEventListener('change', start);
  const record = async () => {
    if (!stream) await start();
    if (!stream) return;
    clear(playback).append(note('Recording 5 seconds… speak now.'));
    const chunks: Blob[] = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => { const a = h('audio', { controls: true, src: URL.createObjectURL(new Blob(chunks, { type: rec!.mimeType })) }); clear(playback).append(a); a.play().catch(() => {}); };
    rec.start(); setTimeout(() => rec?.state === 'recording' && rec.stop(), 5000);
  };
  root.append(card(null, meter, canvas, info), card('Options', field('Microphone', devSel)), card('Playback test', playback),
    h('div', { class: 'actions' }, button('Start', start, { variant: 'primary', icon: 'Mic' }), button('Record 5 s', record, { icon: 'Circle' })));
  return () => { cancelAnimationFrame(raf); stopStream(stream); ctx?.close(); };
};

// ------------------------------------------------------------------ Speaker test
export const speaker: Mount = (root) => {
  let ctx: AudioContext | null = null, osc: OscillatorNode | null = null;
  let freq = 440;
  const ac = () => (ctx ||= new AudioContext());
  const stop = () => { try { osc?.stop(); } catch { /* */ } osc = null; };
  const tone = (pan: number, secs = 1.2, f = freq) => {
    stop();
    const c = ac(), o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
    o.frequency.value = f; p.pan.value = pan;
    g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + 0.05); g.gain.setValueAtTime(0.3, c.currentTime + secs - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + secs);
    o.connect(g).connect(p).connect(c.destination); o.start(); o.stop(c.currentTime + secs); osc = o;
  };
  const say = (text: string, pan: number) => { tone(pan, 0.8); if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); speechSynthesis.cancel(); speechSynthesis.speak(u); } };
  const sweep = () => {
    stop();
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(20, c.currentTime); o.frequency.exponentialRampToValueAtTime(20000, c.currentTime + 10);
    g.gain.value = 0.2; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 10); osc = o;
  };
  root.append(card('Stereo', h('div', { class: 'spk-row' },
    button('Left', () => say('Left', -1), { variant: 'primary', icon: 'ArrowLeft' }), button('Both', () => say('Centre', 0), { icon: 'Volume2' }), button('Right', () => say('Right', 1), { variant: 'primary', icon: 'ArrowRight' }))),
  card('Tone generator', stack(slider({ label: 'Frequency', min: 20, max: 20000, value: freq, unit: ' Hz', onInput: (v) => { freq = v; if (osc) osc.frequency.value = v; } }),
    h('div', { class: 'row' }, button('Play tone', () => tone(0, 3), { icon: 'Play' }), button('Sweep 20 Hz → 20 kHz', sweep, { icon: 'AudioLines' }), button('Stop', stop, { icon: 'Square' })))),
  note('Start with low volume. Most adults hear up to ~15–17 kHz; small speakers often can\'t reproduce below ~100 Hz.'));
  return () => { stop(); ctx?.close(); speechSynthesis?.cancel(); };
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
const LABEL = (code: string) => code.replace(/^Key|^Digit/, '').replace('Backquote', '`').replace('Minus', '-').replace('Equal', '=').replace('BracketLeft', '[').replace('BracketRight', ']').replace('Backslash', '\\').replace('Semicolon', ';').replace('Quote', "'").replace('Comma', ',').replace('Period', '.').replace('Slash', '/').replace(/Left$|Right$/, (m) => (/Arrow/.test(code) ? m : '')).replace('Control', 'Ctrl').replace('Escape', 'Esc').replace('ContextMenu', 'Menu').replace('Meta', 'Win').replace(/^Arrow(Left|Right|Up|Down)$/, (_, d) => ({ Left: '←', Right: '→', Up: '↑', Down: '↓' } as any)[d]);
export const keyboard: Mount = (root) => {
  const keys = new Map<string, HTMLElement>();
  const kb = h('div', { class: 'kb', tabindex: '0' }, ROWS.map((r) => h('div', { class: 'kb-row' }, r.map((code) => { const k = h('div', { class: `kb-key kb-${code}` }, LABEL(code)); keys.set(code, k); return k; }))));
  const last = h('div', { class: 'kv' });
  const tested = h('div', { class: 'muted' });
  const down = (e: KeyboardEvent) => {
    if (!kb.contains(document.activeElement) && document.activeElement !== kb) return;
    e.preventDefault(); e.stopPropagation(); // the app's own shortcuts (/ and Ctrl+K → search) must not steal the focus
    const k = keys.get(e.code); k?.classList.add('down', 'hit');
    clear(last).append(...([['key', JSON.stringify(e.key)], ['code', e.code], ['keyCode', String(e.keyCode)], ['location', String(e.location)], ['modifiers', [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', e.metaKey && 'Meta'].filter(Boolean).join(' + ') || 'none'], ['repeat', String(e.repeat)]] as Array<[string, string]>).flatMap(([a, b]) => [h('span', null, a), h('code', null, b)]));
    tested.textContent = `${[...keys.values()].filter((x) => x.classList.contains('hit')).length} of ${keys.size} keys tested`;
  };
  const up = (e: KeyboardEvent) => keys.get(e.code)?.classList.remove('down');
  addEventListener('keydown', down, true); addEventListener('keyup', up, true); // capture: runs before document listeners
  root.append(note('Click the keyboard below, then press keys. Keys turn green once they register; stuck keys stay highlighted.'), card(null, h('div', { class: 'scroll-x' }, kb), tested), card('Last key event', last),
    h('div', { class: 'actions' }, button('Reset', () => { keys.forEach((k) => k.classList.remove('hit', 'down')); tested.textContent = ''; kb.focus(); }, { icon: 'RotateCcw' })));
  setTimeout(() => kb.focus(), 50);
  return () => { removeEventListener('keydown', down, true); removeEventListener('keyup', up, true); };
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
  const end = (e: PointerEvent) => { active.delete(e.pointerId); last.delete(e.pointerId); };
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
  const measureHz = () => new Promise<number>((res) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 60) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); });
  const render = async () => {
    const dpr = devicePixelRatio, sw = screen.width, sh = screen.height;
    const mm = (q: string) => matchMedia(q).matches;
    const hz = await measureHz();
    const uad = (navigator as any).userAgentData;
    let ua: Record<string, string> = {};
    try { ua = uad ? await uad.getHighEntropyValues(['platform', 'platformVersion', 'model', 'fullVersionList']) : {}; } catch { /* */ }
    clear(out).append(
      card('Display', kv([['Screen (CSS px)', `${sw} × ${sh}`], ['Physical pixels', `${Math.round(sw * dpr)} × ${Math.round(sh * dpr)}`], ['Device pixel ratio', String(dpr)], ['Viewport', `${innerWidth} × ${innerHeight}`], ['Available area', `${screen.availWidth} × ${screen.availHeight}`],
        ['Colour depth', `${screen.colorDepth}-bit`], ['Colour gamut', mm('(color-gamut: rec2020)') ? 'Rec. 2020' : mm('(color-gamut: p3)') ? 'Display P3' : 'sRGB'], ['HDR', mm('(dynamic-range: high)') ? 'Yes' : 'No'], ['Refresh rate (measured)', `~${hz} Hz`],
        ['Orientation', (screen.orientation as any)?.type || '—'], ['Dark mode', mm('(prefers-color-scheme: dark)') ? 'On' : 'Off'], ['Touch points', String(navigator.maxTouchPoints || 0)]])),
      card('Browser & device', kv([['Browser', uad?.brands ? uad.brands.filter((b: any) => !/Not/.test(b.brand)).map((b: any) => `${b.brand} ${b.version}`).join(', ') : navigator.userAgent], ['Platform', ua.platform ? `${ua.platform} ${ua.platformVersion || ''}` : navigator.platform], ['Model', ua.model || '—'],
        ['CPU threads', String(navigator.hardwareConcurrency || '—')], ['Memory (approx.)', (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory} GB+` : '—'], ['Language', navigator.language], ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone], ['WebGPU', 'gpu' in navigator ? 'Available' : 'No'], ['User agent', navigator.userAgent]])),
    );
  };
  addEventListener('resize', render);
  root.append(out);
  render();
  return () => removeEventListener('resize', render);
};
export { screen_ as screen };

// ------------------------------------------------------------------ Bubble level (mobile)
async function motionPermission(): Promise<boolean> {
  const D: any = (window as any).DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') { try { return (await D.requestPermission()) === 'granted'; } catch { return false; } }
  return true;
}
export const level: Mount = (root) => {
  let zb = 0, zg = 0, b = 0, g = 0, got = false;
  const bubble = h('div', { class: 'bubble' });
  const vial = h('div', { class: 'vial' }, h('div', { class: 'vial-ring' }), bubble);
  const readout = h('div', { class: 'big-value center' }, '—');
  const status = h('div');
  const on = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    got = true; b = e.beta; g = e.gamma;
    const x = Math.max(-45, Math.min(45, g - zg)), y = Math.max(-45, Math.min(45, b - zb));
    bubble.style.transform = `translate(${(-x / 45) * 100}px, ${(-y / 45) * 100}px)`;
    const tilt = Math.hypot(x, y);
    readout.textContent = `${x.toFixed(1)}° · ${y.toFixed(1)}°`;
    bubble.classList.toggle('level', tilt < 0.6);
  };
  const start = async () => {
    clear(status);
    if (!(await motionPermission())) { status.append(note('Motion access was denied. On iPhone: allow it when asked (Settings › Safari › Motion & Orientation Access).', 'err')); return; }
    addEventListener('deviceorientation', on);
    setTimeout(() => { if (!got) status.append(note('No motion sensor data — this device or browser has no tilt sensor (most PCs).', 'warn')); }, 1500);
  };
  root.append(card(null, vial, readout, status), h('div', { class: 'actions' }, button('Start', start, { variant: 'primary', icon: 'Crosshair' }), button('Calibrate (set zero)', () => { zb = b; zg = g; }, { icon: 'RotateCcw' })),
    note('Lay the phone flat on the surface. Turns green when level. Calibrate on a known-flat surface for best accuracy.'));
  return () => removeEventListener('deviceorientation', on);
};

// ------------------------------------------------------------------ Compass (mobile)
export const compass: Mount = (root) => {
  let got = false;
  const dial = h('div', { class: 'dial' }, ...['N', 'E', 'S', 'W'].map((d, i) => h('span', { class: `dial-${d}`, style: { transform: `rotate(${i * 90}deg) translateY(-112px) rotate(${-i * 90}deg)` } }, d)), h('div', { class: 'dial-needle' }));
  const readout = h('div', { class: 'big-value center' }, '—');
  const status = h('div');
  const card8 = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
  const on = (e: any) => {
    let heading: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading; // iOS (true north)
    else if (e.absolute && e.alpha != null) heading = (360 - e.alpha) % 360; // Android absolute (magnetic north)
    if (heading == null) return;
    got = true;
    dial.style.transform = `rotate(${-heading}deg)`;
    readout.textContent = `${Math.round(heading)}° ${card8(heading)}`;
  };
  const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  const start = async () => {
    clear(status);
    if (!(await motionPermission())) { status.append(note('Motion access was denied.', 'err')); return; }
    addEventListener(evt, on);
    setTimeout(() => { if (!got) status.append(note('No compass data — this device has no magnetometer, or the browser does not expose it.', 'warn')); }, 1500);
  };
  root.append(card(null, h('div', { class: 'dial-wrap' }, dial), readout, status), h('div', { class: 'actions' }, button('Start', start, { variant: 'primary', icon: 'Compass' })),
    note(isIOS ? 'Shows true north (iOS).' : 'Shows magnetic north. Keep away from magnets and metal; wave the phone in a figure-8 to calibrate.'));
  return () => removeEventListener(evt, on);
};

// ------------------------------------------------------------------ Sound meter
export const soundmeter: Mount = (root) => {
  let stream: MediaStream | null = null, ctx: AudioContext | null = null, raf = 0, offset = 90;
  let min = Infinity, max = -Infinity, sum = 0, n = 0;
  const big = h('div', { class: 'big-value center db' }, '—');
  const stats = h('div', { class: 'muted center' });
  const hist = h('canvas', { class: 'wave' });
  const series: number[] = [];
  const level = (db: number) => (db < 40 ? 'Quiet room' : db < 60 ? 'Conversation' : db < 75 ? 'Busy street' : db < 90 ? 'Loud — limit exposure' : 'Very loud — hearing risk');
  const start = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      ctx ||= new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 4096; ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        let s = 0; for (const v of buf) s += v * v;
        const db = 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-12) + offset;
        if (isFinite(db)) { min = Math.min(min, db); max = Math.max(max, db); sum += db; n++; series.push(db); if (series.length > 300) series.shift(); }
        big.textContent = `${db.toFixed(0)} dB`; stats.textContent = `${level(db)} · min ${min.toFixed(0)} · avg ${(sum / n).toFixed(0)} · max ${max.toFixed(0)}`;
        const W = (hist.width = hist.clientWidth * devicePixelRatio), H = (hist.height = hist.clientHeight * devicePixelRatio), g = hist.getContext('2d')!;
        g.clearRect(0, 0, W, H); g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
        series.forEach((d, i) => { const hh = Math.max(1, ((d - 20) / 100) * H); g.fillRect((i / 300) * W, H - hh, Math.max(1, W / 300), hh); });
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) { root.append(permErr(e)); }
  };
  root.append(card(null, big, stats, hist), card('Calibration', slider({ label: 'Offset (adjust to match a reference meter)', min: 60, max: 120, value: offset, unit: ' dB', onInput: (v) => (offset = v) })),
    h('div', { class: 'actions' }, button('Start', start, { variant: 'primary', icon: 'Gauge' }), button('Reset stats', () => { min = Infinity; max = -Infinity; sum = 0; n = 0; series.length = 0; }, { icon: 'RotateCcw' })),
    note('Phone and laptop microphones are not calibrated instruments; readings are approximate (±5–10 dB).'));
  return () => { cancelAnimationFrame(raf); stopStream(stream); ctx?.close(); };
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
    cardBox.style.width = `${85.6 * pxPerMm}px`; cardBox.style.height = `${53.98 * pxPerMm}px`;
  };
  const cal = slider({ label: 'Calibration', min: 2, max: 8, step: 0.005, value: pxPerMm, fmt: (v) => `${v.toFixed(3)} px/mm`, onInput: (v) => { pxPerMm = v; draw(); } });
  root.append(card(null, h('div', { class: 'ruler-wrap' }, rulerEl)), card(null, field('Units', segmented([['cm', 'Centimetres'], ['in', 'Inches']], unit, (v) => { unit = v; draw(); }))),
    card('Calibrate with a bank/ID card', stack(h('p', { class: 'muted' }, 'Hold any standard card (credit, debit, Aadhaar PVC, driving licence — 85.6 × 54 mm) against the screen and drag the slider until the outline matches it exactly.'), cardBox, cal)),
    note('Calibration is kept only while this tab is open.'));
  requestAnimationFrame(draw);
  addEventListener('resize', draw);
  return () => removeEventListener('resize', draw);
};
void select;
