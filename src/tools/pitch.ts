// Pitch & Speed: change tempo and pitch independently. Engine: our audio.wasm (WSOLA time stretch + Kaiser windowed-
// sinc resampler, own C) in a worker. Open any audio (or video) file the browser can decode → result shown on the
// waveform (trim it) → MP3 (own LAME wasm) or WAV.
import { h, card, actions, button, slider, stack, filePicker, note, toast, errMsg, baseName, type Mount } from '../ui';
import { waveEditor, savePanel } from '../lib/audioui';
import { audio, decodeAudio, channelsOf } from '../lib/audio-client';

const PRESETS: Array<[string, number, number]> = [
  ['Original', 1, 0], ['Practice (75 %)', 0.75, 0], ['Half speed', 0.5, 0], ['Faster (1.25×)', 1.25, 0], ['Podcast 1.5×', 1.5, 0],
  ['Up one tone', 1, 2], ['Down one tone', 1, -2], ['Nightcore', 1.25, 3], ['Slowed', 0.85, -2], ['Deep voice', 1, -5], ['Chipmunk', 1, 7],
];
const fmtSt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} semitone${Math.abs(v) === 1 ? '' : 's'}`;

export const mount: Mount = (root, ctx) => {
  let src: AudioBuffer | null = null, name = 'audio', tempo = 1, semis = 0, tok = 0, timer = 0, ready = false;
  const editor = waveEditor();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const work = h('div', { class: 'stack', hidden: true });
  const tempoS = slider({ label: 'Speed (tempo)', min: 0.5, max: 2, step: 0.05, value: 1, fmt: (v) => `${+v.toFixed(2)}× · ${Math.round(v * 100)} %`, onInput: (v) => { tempo = v; schedule(); } });
  const pitchS = slider({ label: 'Pitch', min: -12, max: 12, step: 1, value: 0, fmt: fmtSt, onInput: (v) => { semis = v; schedule(); } });
  const presets = h('div', { class: 'row chips' }, ...PRESETS.map(([label, t, p]) => button(label, () => { tempoS.value = t; pitchS.value = p; tempo = t; semis = p; schedule(0); }, { small: true })));

  function schedule(ms = 350) { ready = false; clearTimeout(timer); timer = window.setTimeout(run, ms); }
  async function run() {
    if (!src) return;
    const my = ++tok, t0 = performance.now();
    status.textContent = 'Processing…';
    try {
      const chs = channelsOf(src);
      const out = Math.abs(tempo - 1) < 1e-6 && semis === 0 ? chs : await audio('tempoPitch', chs, src.sampleRate, tempo, semis);
      if (my !== tok) return;
      const b = new AudioBuffer({ length: Math.max(1, out[0].length), numberOfChannels: out.length, sampleRate: src.sampleRate });
      out.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
      await editor.set(b);
      ready = true;
      status.textContent = `${src.duration.toFixed(1)} s → ${b.duration.toFixed(1)} s · ${+tempo.toFixed(2)}× speed · ${fmtSt(semis)} · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    } catch (e) { if (my === tok) status.textContent = `Could not process: ${errMsg(e)}`; }
  }
  const open = async (f: File) => {
    status.textContent = 'Reading the audio…';
    try {
      const b = await decodeAudio(f);
      if (!b.duration) throw new Error('No audio in this file.');
      src = b; name = baseName(f.name); work.hidden = false; bar.hidden = false; picker.classList.add('drop-compact');
      await run();
    } catch (e) { status.textContent = ''; toast(`Cannot read this audio: ${errMsg(e)}`, 'err'); }
  };
  const save = savePanel({
    isMobile: ctx.isMobile, defaultRate: '192',
    name: () => `${name}-${+tempo.toFixed(2)}x${semis ? `-${semis > 0 ? 'up' : 'down'}${Math.abs(semis)}` : ''}`,
    pcm: async () => {
      if (!ready) { clearTimeout(timer); await run(); }
      return { chs: editor.selection(), sr: editor.buffer!.sampleRate };
    },
  });
  const bar = actions(editor.playBtn, save.saveButton());
  bar.hidden = true;
  work.append(
    card('Speed and pitch', stack(tempoS, pitchS, presets,
      note('Speed keeps the pitch; pitch keeps the length. Double-click a value to reset it.', 'info'))),
    card('Result', editor.el),
    card('Save', save.el));
  const picker = filePicker({ accept: 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm', label: 'Open a song or recording', hint: 'MP3, M4A, WAV, OGG, FLAC, WebM — or a video’s sound', onFiles: ([f]) => open(f) });
  root.append(card(null, picker, status), work, bar);
  return () => { clearTimeout(timer); editor.dispose(); };
};
