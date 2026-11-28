// Reading aloud piece by piece, with the piece being heard told — the Camera Reader (potentials #81). The neural voices of the
// Text-to-Speech tab (Kokoro, Piper: src/lib/speech.ts, in the Text-to-Speech worker), one request a piece and three made
// ahead, the sound laid end to end on one AudioContext with each piece's pause after it; or a voice of the device (Web Speech,
// on-device voices only), one utterance a piece. Pause and resume, a piece back or on, from any piece; a new voice or speed
// goes on from the piece being heard. The piece being heard is the one whose sound has begun by the AudioContext's clock — so
// a pause (the clock stands still) keeps it, and nothing runs ahead of the sound.
import { trackWorker } from '../lifecycle';
import type { Voice } from './voices';

export type SayState = 'idle' | 'loading' | 'playing' | 'waiting' | 'paused' | 'ended';
export interface SayPiece { say: string; pause: number }
export interface SayerOpts {
  /** the piece being heard (-1: none) */
  onPiece(i: number): void;
  onState(s: SayState): void;
  /** a voice's model coming (0 … 1, null: no download under way) */
  onLoad(p: number | null, text: string): void;
  onError(msg: string): void;
}

/** pieces asked for ahead of the one being heard */
const AHEAD = 3;
let worker: Worker | null = null, reqSeq = 0;
const handlers = new Map<number, (m: any) => void>();
function engine() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/tts.worker.ts', import.meta.url), { type: 'module' }), 'reader-tts', () => { handlers.clear(); worker = null; });
    worker.onmessage = (e) => handlers.get(e.data.id)?.(e.data);
    worker.onerror = (e) => { const hs = [...handlers.values()]; handlers.clear(); worker = null; for (const f of hs) f({ type: 'error', error: e.message || 'The speech engine stopped.' }); };
  }
  return worker;
}

export function sayer(o: SayerOpts) {
  let pieces: SayPiece[] = [], voice: Voice | null = null, sysVoice: SpeechSynthesisVoice | null = null, speed = 1;
  let ac: AudioContext | null = null, run = 0, next = 0, inflight = 0, playAt = 0, endAt = 0, current = -1, state: SayState = 'idle';
  let timer = 0, sysTimer = 0, replay = false, spoke = false;
  const live = new Set<number>();
  let nodes: AudioBufferSourceNode[] = [], sched: Array<{ i: number; t0: number; t1: number }> = [];
  const set = (s: SayState) => { if (s !== state) { state = s; o.onState(s); } };
  const heard = (i: number) => { if (i !== current) { current = i; o.onPiece(i); } };
  const isSys = () => voice?.engine === 'system';

  /** everything of the run under way ended (requests cancelled, sound stopped) */
  function halt() {
    run++;
    for (const id of live) { worker?.postMessage({ id, op: 'cancel' }); handlers.delete(id); }
    live.clear(); inflight = 0;
    for (const n of nodes) { try { n.stop(); } catch { /* ended */ } }
    nodes = []; sched = [];
    clearInterval(timer); clearTimeout(sysTimer); timer = sysTimer = 0;
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch { /* none */ }
  }

  function play(from: number) {
    halt();
    replay = false;
    if (!pieces.length || !voice) { set('idle'); return; }
    from = Math.max(0, Math.min(pieces.length - 1, from));
    const my = run;
    heard(from); set('loading');
    if (isSys()) { sys(my, from); return; }
    ac ||= new AudioContext();
    void ac.resume();
    playAt = ac.currentTime + 0.15; endAt = Infinity; next = from;
    pump(my);
    timer = window.setInterval(() => tick(my), 60);
  }
  function pump(my: number) { while (my === run && inflight < AHEAD && next < pieces.length) ask(my, next++); }
  function ask(my: number, i: number) {
    const id = ++reqSeq, chunks: Float32Array[] = [], v = voice!;
    let sr = 24000;
    live.add(id); inflight++;
    handlers.set(id, (m) => {
      if (my !== run) return;
      if (m.type === 'progress') o.onLoad(m.loaded / m.total, `Loading ${m.what}… ${Math.round((m.loaded / m.total) * 100)} %`);
      else if (m.type === 'chunk') { chunks.push(m.audio); sr = m.sr; }
      else if (m.type === 'done' || m.type === 'error' || m.type === 'cancelled') {
        handlers.delete(id); live.delete(id); inflight--;
        if (m.type === 'cancelled') return;
        if (m.type === 'error') o.onError(m.error);
        o.onLoad(null, '');
        lay(i, chunks, sr);
        pump(my);
      }
    });
    engine().postMessage({ id, op: 'speak', base: document.baseURI, engine: v.engine, voice: v.id, lang: v.lang, speaker: v.speaker, speed, text: pieces[i].say });
  }
  /** a piece's sound laid after the one before (the requests come back in order), its pause after it */
  function lay(i: number, chunks: Float32Array[], sr: number) {
    const a = ac!, n = chunks.reduce((s, c) => s + c.length, 0);
    const t0 = Math.max(playAt, a.currentTime + 0.05);
    let t1 = t0;
    if (n) {
      const b = a.createBuffer(1, n, sr), d = b.getChannelData(0);
      let k = 0;
      for (const c of chunks) { d.set(c, k); k += c.length; }
      const node = a.createBufferSource();
      node.buffer = b; node.connect(a.destination); node.start(t0);
      node.onended = () => { nodes = nodes.filter((x) => x !== node); };
      nodes.push(node); t1 = t0 + b.duration;
    }
    sched.push({ i, t0, t1 });
    playAt = t1 + pieces[i].pause / speed;
    if (i === pieces.length - 1) endAt = t1;
  }
  function tick(my: number) {
    if (my !== run || !ac || state === 'paused') return;
    const now = ac.currentTime;
    let cur = -1, sounding = false;
    for (const s of sched) { if (s.t0 <= now + 0.02) cur = s.i; if (s.t0 <= now && now < s.t1 + 0.6) sounding = true; }
    if (cur >= 0) { heard(cur); sched = sched.filter((s) => s.i >= cur); }
    if (now >= endAt) { halt(); heard(-1); set('ended'); return; }
    if (sounding) set('playing');
    else if (now >= playAt) set(cur < 0 ? 'loading' : 'waiting');
  }

  /** Web Speech: a piece an utterance, the next after its pause */
  function sys(my: number, from: number) {
    const say = (i: number) => {
      if (my !== run) return;
      if (i >= pieces.length) { heard(-1); set('ended'); return; }
      const u = new SpeechSynthesisUtterance(pieces[i].say);
      if (sysVoice) { u.voice = sysVoice; u.lang = sysVoice.lang; }
      u.rate = speed;
      u.onstart = () => { if (my === run) { heard(i); set('playing'); } };
      u.onend = () => { if (my === run) sysTimer = window.setTimeout(() => say(i + 1), (pieces[i].pause / speed) * 1000); };
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        if (my !== run || e.error === 'interrupted' || e.error === 'canceled') return;
        o.onError(`This device's voice could not speak (${e.error}).`); halt(); set('idle');
      };
      speechSynthesis.speak(u);
    };
    say(from);
  }

  return {
    get state() { return state; },
    get current() { return current; },
    /** In a tap or a key press: let the sound start later (Safari starts an AudioContext, and Web Speech, only in a user's
     *  gesture; Chrome once the page has had one). */
    unlock() {
      try { ac ||= new AudioContext(); if (ac.state === 'suspended' && state !== 'paused') void ac.resume(); } catch { /* none */ }
      try { if (!spoke && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); spoke = true; } } catch { /* none */ }
    },
    /** whether sound can start now, without a tap */
    canStart: () => isSys() ? spoke : !!ac && ac.state === 'running',
    setPieces(p: SayPiece[]) { halt(); pieces = p; heard(-1); set('idle'); },
    setVoice(v: Voice, sv?: SpeechSynthesisVoice) { voice = v; sysVoice = sv ?? null; this.again(); },
    setSpeed(s: number) { speed = s; this.again(); },
    /** a new voice or speed: what is being read goes on from the piece being heard */
    again() {
      if (state === 'playing' || state === 'loading' || state === 'waiting') play(Math.max(0, current));
      else if (state === 'paused') { halt(); replay = true; }
    },
    play,
    pause() {
      if (state !== 'playing' && state !== 'loading' && state !== 'waiting') return;
      if (isSys()) { halt(); replay = true; } else void ac?.suspend();
      set('paused');
    },
    resume() {
      if (state !== 'paused') return;
      if (replay || isSys()) { play(Math.max(0, current)); return; }
      void ac?.resume();
      set('playing');
    },
    stop() { halt(); heard(-1); set('idle'); },
    dispose() { halt(); void ac?.close(); ac = null; },
  };
}
export type Sayer = ReturnType<typeof sayer>;
