// Noise Remover: Xiph RNNoise 0.2 (recurrent neural network trained on speech + noise, C → our own wasm build) in a
// worker, at 48 kHz (our audio.wasm resamples in and out). Open a file or record; strength = wet/dry mix; compare
// original vs cleaned on the waveform; save MP3 (own LAME wasm) or WAV.
import { h, card, actions, button, slider, stack, filePicker, note, toast, errMsg, baseName, type Mount } from '../ui';
import { recorder, waveEditor, savePanel, type Recording } from '../lib/audioui';
import { decodeAudio, channelsOf } from '../lib/audio-client';
import { trackWorker } from '../lifecycle';

let worker: Worker | null = null, seq = 0;
const pend = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
function denoise(chs: Float32Array[], sr: number, mix: number): Promise<{ chs: Float32Array[]; vad: Float32Array; ms: number }> {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/noise.worker.ts', import.meta.url), { type: 'module' }), 'noise-worker', () => { pend.clear(); worker = null; });
    worker.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data); };
    worker.onerror = (e) => { for (const p of pend.values()) p.rej(new Error(e.message || 'Noise engine failed')); pend.clear(); worker = null; };
  }
  const id = ++seq;
  return new Promise((res, rej) => { pend.set(id, { res, rej }); worker!.postMessage({ id, chs, sr, mix }); });
}
const toBuffer = (chs: Float32Array[], sr: number) => {
  const b = new AudioBuffer({ length: Math.max(1, chs[0].length), numberOfChannels: chs.length, sampleRate: sr });
  chs.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return b;
};

export const mount: Mount = (root, ctx) => {
  let src: AudioBuffer | null = null, name = 'audio', mix = 1, tok = 0, timer = 0, ready = false, showing: 'clean' | 'orig' = 'clean', cleaned: AudioBuffer | null = null;
  const editor = waveEditor();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const work = h('div', { class: 'stack', hidden: true });
  const strength = slider({ label: 'Strength', min: 0, max: 100, step: 5, value: 100, fmt: (v) => `${v} %`, onInput: (v) => { mix = v / 100; ready = false; clearTimeout(timer); timer = window.setTimeout(run, 400); } });
  const abBtn = button('Hear the original', () => toggleAB(), { icon: 'Repeat', small: true });

  async function toggleAB() {
    if (!src || !cleaned) return;
    const [a, b] = editor.range;
    showing = showing === 'clean' ? 'orig' : 'clean';
    await editor.set(showing === 'clean' ? cleaned : src);
    editor.setRange(a, b);
    abBtn.setLabel(showing === 'clean' ? 'Hear the original' : 'Hear the cleaned audio');
    status.textContent = showing === 'clean' ? status.dataset.clean || '' : 'Showing the ORIGINAL (noisy) audio';
  }
  async function run() {
    if (!src) return;
    const my = ++tok;
    status.textContent = 'Removing noise…';
    try {
      const r = await denoise(channelsOf(src), src.sampleRate, mix);
      if (my !== tok) return;
      cleaned = toBuffer(r.chs, src.sampleRate);
      const [a, b] = editor.buffer ? editor.range : [0, src.duration];
      showing = 'clean'; abBtn.setLabel('Hear the original');
      await editor.set(cleaned);
      if (editor.buffer && (a > 0 || b < src.duration)) editor.setRange(a, b);
      ready = true;
      const speech = r.vad.filter((v) => v > 0.5).length / Math.max(1, r.vad.length);
      status.textContent = status.dataset.clean = `${src.duration.toFixed(1)} s cleaned in ${(r.ms / 1000).toFixed(1)} s · speech detected in ${Math.round(speech * 100)} % of the recording`;
    } catch (e) { if (my === tok) status.textContent = `Could not clean: ${errMsg(e)}`; }
  }
  const load = async (blob: Blob, fname: string) => {
    status.textContent = 'Reading the audio…';
    try {
      const b = await decodeAudio(blob);
      if (!b.duration) throw new Error('No audio in this file.');
      src = b; name = baseName(fname); cleaned = null; work.hidden = false; bar.hidden = false; picker.classList.add('drop-compact');
      editor.stop();
      await run();
    } catch (e) { status.textContent = ''; toast(`Cannot read this audio: ${errMsg(e)}`, 'err'); }
  };
  const save = savePanel({
    isMobile: ctx.isMobile,
    name: () => `${name}-clean`,
    pcm: async () => {
      if (!ready) { clearTimeout(timer); await run(); }
      if (showing !== 'clean') await toggleAB();
      return { chs: editor.selection(), sr: editor.buffer!.sampleRate };
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
  return () => { clearTimeout(timer); rec.dispose(); editor.dispose(); };
};
