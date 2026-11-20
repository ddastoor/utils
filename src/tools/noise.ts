// Noise Remover: Xiph RNNoise 0.2 (a recurrent neural network trained on speech and noise; Jitsi's WebAssembly build)
// in a worker, at 48 kHz (audio.wasm resamples in and out). Open a file or record; strength = how much of the cleaned
// sound is mixed with the original (the worker keeps both, so a new strength is mixed at once, not cleaned again);
// compare original and cleaned on the waveform; save MP3 (LAME, our build) or WAV.
import { h, card, actions, button, slider, stack, filePicker, note, toast, errMsg, baseName, type Mount } from '../ui';
import { recorder, waveEditor, savePanel, type Recording } from '../lib/audioui';
import { decodeAudio, channelsOf } from '../lib/audio-client';
import { trackWorker } from '../lifecycle';

type Reply = { chs: Float32Array[]; vad?: Float32Array; ms?: number };
let worker: Worker | null = null, seq = 0;
const pend = new Map<number, { res: (v: Reply) => void; rej: (e: Error) => void }>();
function engine(msg: { op: 'clean'; chs: Float32Array[]; sr: number; mix: number } | { op: 'mix'; mix: number }): Promise<Reply> {
  if (msg.op === 'clean' && worker && pend.size) { // a newer file: what the worker still does is for an older one
    for (const p of pend.values()) p.rej(new Error('superseded'));
    pend.clear(); worker.terminate(); worker = null;
  }
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/noise.worker.ts', import.meta.url), { type: 'module' }), 'noise-worker', () => { pend.clear(); worker = null; });
    worker.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data); };
    worker.onerror = (e) => { for (const p of pend.values()) p.rej(new Error(e.message || 'The noise engine stopped')); pend.clear(); worker?.terminate(); worker = null; };
  }
  const id = ++seq;
  return new Promise((res, rej) => { pend.set(id, { res, rej }); worker!.postMessage({ id, ...msg }); });
}
const toBuffer = (chs: Float32Array[], sr: number) => {
  const b = new AudioBuffer({ length: Math.max(1, chs[0].length), numberOfChannels: chs.length, sampleRate: sr });
  chs.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return b;
};

export const mount: Mount = (root, ctx) => {
  let src: AudioBuffer | null = null, name = 'audio', mix = 1, timer = 0, live = true;
  let fileSeq = 0, gen = 0;               // the newest file; the newest result asked for (clean or mix)
  let cleaned: AudioBuffer | null = null; // the result for this file at this strength (null while one is on its way)
  let shownFor: AudioBuffer | null = null, showing: 'clean' | 'orig' = 'clean';
  let job: Promise<void> = Promise.resolve(), failed = '', info = '';
  const editor = waveEditor();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const work = h('div', { class: 'stack', hidden: true });
  const strength = slider({
    label: 'Strength', min: 0, max: 100, step: 5, value: 100, fmt: (v) => `${v} %`,
    onInput: (v) => {
      mix = v / 100; clearTimeout(timer); timer = 0;
      if (!src) return;
      cleaned = null;
      timer = window.setTimeout(() => { timer = 0; job = remix(); }, 150);
    },
  });
  const abBtn = button('Hear the original', () => toggleAB(), { icon: 'Repeat', small: true });

  async function toggleAB() {
    if (!src || !cleaned) return;
    const [a, b] = editor.range;
    showing = showing === 'clean' ? 'orig' : 'clean';
    await editor.set(showing === 'clean' ? cleaned : src);
    editor.setRange(a, b);
    abBtn.setLabel(showing === 'clean' ? 'Hear the original' : 'Hear the cleaned audio');
    status.textContent = showing === 'clean' ? info : 'Showing the ORIGINAL (noisy) audio';
  }
  /** Put a result on the waveform: the selection stays when only the strength changed. */
  async function show(chs: Float32Array[], s: AudioBuffer, my: number) {
    const keep = shownFor === s && editor.buffer ? editor.range : null;
    const b = toBuffer(chs, s.sampleRate);
    showing = 'clean'; abBtn.setLabel('Hear the original');
    await editor.set(b);
    if (!live || my !== gen) return;
    if (keep && (keep[0] > 0 || keep[1] < s.duration)) editor.setRange(keep[0], keep[1]);
    cleaned = b; shownFor = s; failed = '';
    status.textContent = info;
  }
  async function clean() {
    const s = src!, my = ++gen, file = fileSeq;
    status.textContent = 'Removing noise…'; failed = '';
    try {
      const r = await engine({ op: 'clean', chs: channelsOf(s), sr: s.sampleRate, mix });
      if (!live || file !== fileSeq) return;
      const vad = r.vad!, speech = vad.filter((v) => v > 0.5).length / Math.max(1, vad.length);
      info = `${s.duration.toFixed(1)} s cleaned in ${(r.ms! / 1000).toFixed(1)} s · speech detected in ${Math.round(speech * 100)} % of the recording`;
      if (my === gen) await show(r.chs, s, my);
    } catch (e) {
      if (live && file === fileSeq && my === gen) { failed = `Could not clean the sound: ${errMsg(e)}`; status.textContent = failed; }
    }
  }
  async function remix() {
    const s = src!, my = ++gen, file = fileSeq;
    try {
      const r = await engine({ op: 'mix', mix });
      if (live && my === gen && file === fileSeq) await show(r.chs, s, my);
    } catch {
      // the worker was ended (and its copy with it): clean the file again at this strength
      if (live && my === gen && file === fileSeq) await clean();
    }
  }
  const load = (blob: Blob, fname: string) => {
    const my = ++fileSeq;
    status.textContent = 'Reading the audio…';
    job = (async () => {
      let b: AudioBuffer;
      try {
        b = await decodeAudio(blob);
        if (!b.duration) throw new Error('there is no sound in this file');
      } catch (e) {
        if (my === fileSeq && live) { status.textContent = src ? info : ''; toast(`Cannot read this audio: ${errMsg(e)}`, 'err'); }
        return; // what was open stays open
      }
      if (my !== fileSeq || !live) return;
      clearTimeout(timer); timer = 0;
      src = b; name = baseName(fname); cleaned = null; info = '';
      work.hidden = false; bar.hidden = false; picker.classList.add('drop-compact');
      editor.stop();
      await clean();
    })();
  };
  const save = savePanel({
    isMobile: ctx.isMobile,
    name: () => `${name}-clean`,
    pcm: async () => {
      if (timer) { clearTimeout(timer); timer = 0; job = remix(); } // a strength still waiting for its turn
      await job;
      if (!cleaned) throw new Error(failed || 'The cleaned sound is not ready — open a recording first.');
      if (showing !== 'clean') await toggleAB();
      return { chs: editor.selection(), sr: cleaned.sampleRate };
    },
  });
  const rec = recorder({ isMobile: ctx.isMobile, voice: false, onDone: (r: Recording) => load(r.blob, 'recording') });
  const picker = filePicker({ accept: 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm', label: 'Open a voice recording', hint: 'Voice notes, interviews, lectures, calls — MP3, M4A, WAV, OGG, FLAC, WebM or a video’s sound', onFiles: ([f]) => load(f, f.name) });
  const recBox = h('details', { class: 'rec-opts' }, h('summary', null, 'Or record with the microphone'), stack(rec.el, h('div', { class: 'row' }, ...rec.bar)));
  const bar = actions(editor.playBtn, save.saveButton());
  bar.hidden = true;
  work.append(
    card('Cleaning', stack(strength, h('div', { class: 'row' }, abBtn),
      note('RNNoise is trained on speech: it removes steady noise (fans, hum, hiss, traffic, keyboard) and keeps voices. Music is not its job.', 'info'))),
    card('Result', editor.el),
    card('Save', save.el));
  root.append(card(null, picker, recBox, status), work, bar);
  return () => { live = false; fileSeq++; gen++; clearTimeout(timer); rec.dispose(); editor.dispose(); };
};
