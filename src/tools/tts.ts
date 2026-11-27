// Text-to-Speech: natural neural voices on this device. US and British English: Kokoro-82M; Indian English: Piper
// (L2-ARCTIC speakers whose first language is Hindi). Phonemes from our own eSpeak NG wasm, the networks on ONNX
// Runtime Web (WebAssembly) in a worker; playback starts with the first sentence. MP3 via our LAME wasm, or WAV.
// "System voices" (Web Speech, on-device voices only) can play but not be saved (browsers cannot capture them).
// On a PC, a second mode, "Offline on this PC" (./tts-offline.ts, owner 21 Nov 2026): large voices that run on the
// computer itself — the page writes a script for Windows or Linux. Phones see the in-browser mode only.
import { h, card, field, actions, button, slider, select, segmented, stack, note, progress, filePicker, toast, errMsg, fmtTime, downloadBlob, shareOrDownload, type Mount } from '../ui';
import { audio, int16Asymmetric } from '../lib/audio-client';
import { decodeText } from '../lib/sheetdata';
import { trackWorker } from '../lifecycle';
import { take } from '../lib/handoff';
import { VOICES, V, type Voice } from '../lib/voices';
import './tts.css';

export { VOICES };
const SAMPLE = 'Welcome to SuperUtils. This voice is made on your own device, so the text you type never leaves it. You can change the speed, pick another voice, and save the result as an MP3.';
/** Markdown → plain text for reading aloud (headings, emphasis, links, code fences, list markers). */
export const mdToText = (s: string) => s.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, '$1.').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\d+[.)]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, '$2').replace(/^\s*[-*_]{3,}\s*$/gm, '').replace(/\|/g, ' ');

let worker: Worker | null = null, seq = 0;
const handlers = new Map<number, (m: any) => void>();
function engine() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/tts.worker.ts', import.meta.url), { type: 'module' }), 'tts-worker', () => { handlers.clear(); worker = null; });
    worker.onmessage = (e) => handlers.get(e.data.id)?.(e.data);
    worker.onerror = (e) => { for (const f of handlers.values()) f({ type: 'error', error: e.message || 'Speech engine crashed' }); handlers.clear(); worker = null; };
  }
  return worker;
}

export const mount: Mount = (root, ctx) => {
  let voice: Voice = VOICES[0][1][0], speed = 1, fmt: 'mp3' | 'wav' = 'mp3', runId = 0, ac: AudioContext | null = null, playAt = 0;
  let parts: Float32Array[] = [], sr = 24000, nodes: AudioBufferSourceNode[] = [], sysVoices: SpeechSynthesisVoice[] = [], shows: number[] = [];
  // the run being waited for: Stop ends the wait at once (the Speak button stayed busy for good after Stop — the
  // worker's "cancelled" carried the old run's number and was ignored)
  let endRun: (() => void) | null = null;
  const ta = h('textarea', { class: 'input textarea tts-text', rows: 8, 'aria-label': 'Text to read', spellcheck: 'true' }) as HTMLTextAreaElement;
  ta.value = take('tts') ?? SAMPLE; // a text another tab handed over ("Read aloud" in the Newspaper Clipper), else the sample
  const count = h('div', { class: 'muted small' });
  const syncCount = () => { const w = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; count.textContent = `${w.toLocaleString()} words · about ${fmtTime((w / 150) * 60 / speed)} at this speed`; };
  ta.addEventListener('input', syncCount);
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const now = h('div', { class: 'tts-now', 'aria-live': 'polite' });
  const vsel = h('select', { class: 'input', 'aria-label': 'Voice' }) as HTMLSelectElement;
  const fillVoices = () => {
    vsel.replaceChildren(...VOICES.map(([g, vs]) => h('optgroup', { label: g }, ...vs.map((v) => h('option', { value: v.id }, v.label)))),
      ...(sysVoices.length ? [h('optgroup', { label: 'System voices (play only, cannot be saved)' }, ...sysVoices.map((v, i) => h('option', { value: `sys:${i}` }, `${v.name} (${v.lang})`)))] : []));
    vsel.value = voice.engine === 'system' ? `sys:${voice.speaker}` : voice.id;
  };
  vsel.addEventListener('change', () => {
    const v = vsel.value;
    voice = v.startsWith('sys:') ? V(v, sysVoices[+v.slice(4)].name, 'system', 'a', +v.slice(4)) : VOICES.flatMap(([, vs]) => vs).find((x) => x.id === v)!;
    saveBtn.hidden = true; fmtBox.hidden = voice.engine === 'system';
    hint.textContent = voice.engine === 'piper' ? 'Indian English: L2-ARCTIC speakers (first language Hindi), Piper voice model — 77 MB the first time.' : voice.engine === 'kokoro' ? 'Kokoro neural voice — the 92 MB model is downloaded once per visit.' : 'A voice installed on this device (Web Speech): plays, but browsers cannot record it.';
  });
  const loadSys = () => { try { sysVoices = speechSynthesis.getVoices().filter((v) => v.localService && /^en/i.test(v.lang)); fillVoices(); } catch { /* no Web Speech */ } };
  if ('speechSynthesis' in window) { loadSys(); speechSynthesis.addEventListener?.('voiceschanged', loadSys); } else fillVoices();
  const hint = h('div', { class: 'muted small' }, 'Kokoro neural voice — the 92 MB model is downloaded once per visit.');

  function stopAll() {
    runId++; if (worker) worker.postMessage({ id: runId - 1, op: 'cancel' });
    endRun?.(); endRun = null;
    for (const n of nodes) { try { n.stop(); } catch { /* ended */ } } nodes = [];
    for (const t of shows) clearTimeout(t); shows = []; now.textContent = '';
    try { speechSynthesis?.cancel(); } catch { /* none */ }
    prog.done(); speakBtn.hidden = false; stopBtn.hidden = true;
  }
  // each sentence is shown when it is heard (it was shown when it was made — ahead of the sound on a fast computer)
  function schedule(a: Float32Array, rate: number, text: string) {
    ac ||= new AudioContext();
    const b = ac.createBuffer(1, a.length, rate); b.copyToChannel(a as Float32Array<ArrayBuffer>, 0);
    const n = ac.createBufferSource(); n.buffer = b; n.connect(ac.destination);
    playAt = Math.max(playAt, ac.currentTime + 0.05); n.start(playAt);
    shows.push(window.setTimeout(() => { now.textContent = text; }, Math.max(0, (playAt - ac.currentTime) * 1000)));
    playAt += b.duration; nodes.push(n);
    return n;
  }
  async function speak() {
    const text = ta.value.trim();
    if (!text) { toast('Type or open some text first.', 'info'); return; }
    stopAll(); const id = ++runId;
    speakBtn.hidden = true; stopBtn.hidden = false; saveBtn.hidden = true; parts = []; now.textContent = '';
    if (voice.engine === 'system') {
      const u = new SpeechSynthesisUtterance(text); u.voice = sysVoices[voice.speaker]; u.rate = speed;
      u.onend = () => { if (id === runId) { status.textContent = 'Done.'; speakBtn.hidden = false; stopBtn.hidden = true; } };
      // a voice that fails (removed, busy) left the Stop button up and said nothing
      u.onerror = (ev: SpeechSynthesisErrorEvent) => { if (id === runId && ev.error !== 'interrupted' && ev.error !== 'canceled') { status.textContent = `The system voice could not speak (${ev.error}).`; speakBtn.hidden = false; stopBtn.hidden = true; } };
      speechSynthesis.speak(u); status.textContent = `Speaking with ${sysVoices[voice.speaker].name}…`; return;
    }
    ac ||= new AudioContext(); await ac.resume(); playAt = ac.currentTime + 0.1;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      endRun = () => { handlers.delete(id); resolve(); };
      handlers.set(id, (m) => {
        if (id !== runId) return;
        if (m.type === 'progress') prog.set(m.loaded / m.total, `Loading ${m.what}… ${Math.round((m.loaded / m.total) * 100)} %`);
        else if (m.type === 'ready') { prog.set(0, `Reading 1 of ${m.parts}…`); status.textContent = ''; }
        else if (m.type === 'chunk') {
          sr = m.sr; parts.push(m.audio); schedule(m.audio, m.sr, m.text);
          prog.set((m.index + 1) / m.total, `Reading ${m.index + 1} of ${m.total}…`);
          if (m.index === 0) status.textContent = `First sound after ${((performance.now() - t0) / 1000).toFixed(1)} s`;
        } else if (m.type === 'done' || m.type === 'error' || m.type === 'cancelled') {
          handlers.delete(id); prog.done();
          if (m.type === 'error') { toast(m.error, 'err'); status.textContent = m.error; }
          if (m.type === 'done') {
            const secs = parts.reduce((a, p) => a + p.length, 0) / sr;
            status.textContent = `${fmtTime(secs)} of speech made in ${(m.ms / 1000).toFixed(1)} s (${(secs / (m.ms / 1000)).toFixed(1)}× real time)`;
            saveBtn.hidden = false;
            const left = Math.max(0, (playAt - (ac?.currentTime || 0)) * 1000);
            setTimeout(() => { if (id === runId) { speakBtn.hidden = false; stopBtn.hidden = true; now.textContent = ''; } }, left);
          }
          endRun = null; resolve();
        }
      });
      engine().postMessage({ id, op: 'speak', base: document.baseURI, engine: voice.engine, voice: voice.id, lang: voice.lang, speaker: voice.speaker, speed, text });
    });
    if (id === runId && !parts.length) { speakBtn.hidden = false; stopBtn.hidden = true; }
  }
  async function save() {
    if (!parts.length) return;
    const all = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let k = 0; for (const p of parts) { all.set(p, k); k += p.length; }
    const bytes = fmt === 'wav' ? await audio('wav', [all], sr, 16, await int16Asymmetric()) : await audio('mp3', [all], sr, { rate: 96 });
    const name = `speech-${voice.id.replace(/^in_/, 'indian-')}.${fmt}`, blob = new Blob([bytes as BlobPart], { type: fmt === 'wav' ? 'audio/wav' : 'audio/mpeg' });
    ctx.isMobile ? await shareOrDownload(blob, name) : downloadBlob(blob, name);
  }

  const speakBtn = button('Speak', () => speak(), { icon: 'Play', variant: 'primary' });
  const stopBtn = button('Stop', () => { stopAll(); status.textContent = 'Stopped.'; }, { icon: 'Square', variant: 'danger' }); stopBtn.hidden = true;
  const saveBtn = button(ctx.isMobile ? 'Save' : 'Download', () => save(), { icon: 'Download' }); saveBtn.hidden = true;
  const fmtBox = field('Save as', select<string>([['mp3', 'MP3'], ['wav', 'WAV']], fmt, (v) => (fmt = v as any)));
  const open = filePicker({ accept: '.txt,.md,.markdown,text/plain,text/markdown', label: 'Open a .txt or .md file', compact: true, onFiles: async ([f]) => {
    // UTF-8, UTF-16 or Windows-1252 (as Notepad saves); a file that is not text is refused
    try { const { text: t, how } = decodeText(new Uint8Array(await f.arrayBuffer())); ta.value = /\.(md|markdown)$/i.test(f.name) ? mdToText(t) : t; syncCount(); toast(`Opened ${f.name}${how ? ` (read as ${how})` : ''}`, 'ok'); } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
  } });
  const voiceCard = card('Voice', stack(field('Voice', vsel), hint,
    slider({ label: 'Speed', min: 0.5, max: 2, step: 0.05, value: 1, fmt: (v) => `${+v.toFixed(2)}×`, onInput: (v) => { speed = v; syncCount(); } }), fmtBox));
  const here = note('Everything runs on this device: the voices are downloaded from this site once per visit and your text is never sent anywhere.', 'info');
  const acts = actions(speakBtn, stopBtn, saveBtn);
  const browserParts: HTMLElement[] = [voiceCard, now, status, here, acts];
  // PC only: the offline mode, loaded when it is chosen (its catalogue is 100 KB)
  const offlineBox = h('div', { class: 'stack', hidden: true });
  let offline: Promise<void> | null = null;
  const mode = ctx.isMobile ? null : segmented<'browser' | 'offline'>([['browser', 'In this browser'], ['offline', 'Offline on this PC']], 'browser', (m) => {
    if (m === 'offline') {
      stopAll(); status.textContent = '';
      for (const e of browserParts) e.hidden = true;
      offlineBox.hidden = false;
      offline ||= import('./tts-offline').then(({ offlinePanel }) => { offlineBox.append(offlinePanel({ text: () => ta.value, speed })); })
        .catch((e) => { offline = null; offlineBox.append(note(`The offline mode could not be loaded: ${errMsg(e)}`, 'err')); });
    } else {
      for (const e of browserParts) e.hidden = false;
      offlineBox.hidden = true;
    }
  });
  root.append(
    ...(mode ? [card('Mode', stack(mode, h('div', { class: 'muted small' }, 'Offline on this PC: large voices that run on this computer itself (Windows or Linux) — this page writes the script that does it.')))] : []),
    card(null, stack(ta, count, open)),
    voiceCard, prog, now, status, here, acts, offlineBox);
  fillVoices(); syncCount();
  return () => { stopAll(); ac?.close(); };
};
