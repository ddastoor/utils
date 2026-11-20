// Pitch & Speed: change tempo and pitch independently. Engine: Signalsmith Stretch (C++, MIT; its authors' WebAssembly /
// AudioWorklet release) rendered offline by the browser's audio engine (src/lib/stretch.ts). Open any audio (or video)
// file the browser can decode → result shown on the waveform (trim it) → MP3 (LAME, our build) or WAV.
import { h, card, actions, button, slider, stack, filePicker, note, toast, errMsg, baseName, type Mount } from '../ui';
import { waveEditor, savePanel } from '../lib/audioui';
import { decodeAudio, channelsOf } from '../lib/audio-client';
import { stretchAudio } from '../lib/stretch';

const PRESETS: Array<[string, number, number]> = [
  ['Original', 1, 0], ['Practice (75 %)', 0.75, 0], ['Half speed', 0.5, 0], ['Faster (1.25×)', 1.25, 0], ['Podcast 1.5×', 1.5, 0],
  ['Up one tone', 1, 2], ['Down one tone', 1, -2], ['Nightcore', 1.25, 3], ['Slowed', 0.85, -2], ['Deep voice', 1, -5], ['Chipmunk', 1, 7],
];
const fmtSt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} semitone${Math.abs(v) === 1 ? '' : 's'}`;
const toBuffer = (chs: Float32Array[], sr: number) => {
  const b = new AudioBuffer({ length: Math.max(1, chs[0].length), numberOfChannels: chs.length, sampleRate: sr });
  chs.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return b;
};

export const mount: Mount = (root, ctx) => {
  let src: AudioBuffer | null = null, name = 'audio', tempo = 1, semis = 0, timer = 0, live = true;
  let pickSeq = 0, srcSeq = 0;            // the newest file chosen; the file being worked on
  let result: { buf: AudioBuffer; tempo: number; semis: number; file: number } | null = null; // what the waveform shows
  let busy: Promise<void> | null = null, loading: Promise<void> = Promise.resolve(), failed = '', info = '';
  const editor = waveEditor();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const work = h('div', { class: 'stack', hidden: true });
  const tempoS = slider({ label: 'Speed (tempo)', min: 0.5, max: 2, step: 0.05, value: 1, fmt: (v) => `${+v.toFixed(2)}× · ${Math.round(v * 100)} %`, onInput: (v) => { tempo = v; schedule(); } });
  const pitchS = slider({ label: 'Pitch', min: -12, max: 12, step: 1, value: 0, fmt: fmtSt, onInput: (v) => { semis = v; schedule(); } });
  const presets = h('div', { class: 'row chips' }, ...PRESETS.map(([label, t, p]) => button(label, () => { tempoS.value = t; pitchS.value = p; tempo = t; semis = p; schedule(0); }, { small: true })));
  const current = () => !!result && result.file === srcSeq && result.tempo === tempo && result.semis === semis;

  function schedule(ms = 350) { clearTimeout(timer); timer = window.setTimeout(() => { timer = 0; kick(); }, ms); }
  /** One rendering at a time: when one ends and the settings (or the file) changed meanwhile, the newest are rendered —
   *  moving a slider never queues a rendering per step. */
  function kick(): Promise<void> {
    busy ||= (async () => {
      await null; // so that `busy` holds this promise before the finally below can clear it (with nothing to render the
      // body ran to its end synchronously, cleared `busy` first and left this settled promise in it: nothing rendered again)
      try {
        while (live && src && !current()) {
          const s = src, file = srcSeq, t = tempo, p = semis, t0 = performance.now();
          status.textContent = 'Processing…'; failed = '';
          let out: Float32Array[];
          try { out = Math.abs(t - 1) < 1e-9 && p === 0 ? channelsOf(s) : await stretchAudio(channelsOf(s), s.sampleRate, t, p); }
          catch (e) { if (live && file === srcSeq) { failed = `Could not process: ${errMsg(e)}`; status.textContent = failed; } return; }
          if (!live || file !== srcSeq) continue;
          // the same passage stays selected: a selection made at one speed lasts tempo-old ÷ tempo-new as long at another
          const keep = result && result.file === file && editor.trimmed ? editor.range.map((x) => (x * result!.tempo) / t) : null;
          const b = toBuffer(out, s.sampleRate);
          await editor.set(b);
          if (!live || file !== srcSeq) continue;
          if (keep) editor.setRange(keep[0], keep[1]);
          result = { buf: b, tempo: t, semis: p, file };
          info = `${s.duration.toFixed(1)} s → ${b.duration.toFixed(1)} s · ${+t.toFixed(2)}× speed · ${fmtSt(p)} · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
          status.textContent = info;
        }
      } finally { busy = null; }
    })();
    return busy;
  }
  const open = (f: File) => {
    const my = ++pickSeq;
    status.textContent = 'Reading the audio…';
    loading = (async () => {
      let b: AudioBuffer;
      try {
        b = await decodeAudio(f);
        if (!b.duration) throw new Error('there is no sound in this file');
      } catch (e) {
        if (my === pickSeq && live) { status.textContent = src ? info : ''; toast(`Cannot read this audio: ${errMsg(e)}`, 'err'); }
        return; // what was open stays open
      }
      if (my !== pickSeq || !live) return;
      src = b; srcSeq++; name = baseName(f.name); work.hidden = false; bar.hidden = false; picker.classList.add('drop-compact');
      editor.stop();
      await kick();
    })();
  };
  const save = savePanel({
    isMobile: ctx.isMobile, defaultRate: '192',
    name: () => `${name}-${+tempo.toFixed(2)}x${semis ? `-${semis > 0 ? 'up' : 'down'}${Math.abs(semis)}` : ''}`,
    pcm: async () => {
      await loading;
      if (timer) { clearTimeout(timer); timer = 0; }
      await kick();
      if (!current()) throw new Error(failed || 'Open a song or recording first.');
      return { chs: editor.selection(), sr: result!.buf.sampleRate };
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
  return () => { live = false; pickSeq++; clearTimeout(timer); editor.dispose(); };
};
