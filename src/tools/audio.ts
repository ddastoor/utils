// Audio Recorder: record the microphone (MediaRecorder: Opus/WebM, or AAC/M4A on Safari) with a live meter, or open
// any audio file; trim on the waveform, optional volume normalising and fades; save as MP3 (our LAME 4.0 wasm),
// WAV (our wasm) or the original codec cut without re-encoding (mediabunny packet copy).
import { h, card, actions, button, toggle, stack, filePicker, note, toast, errMsg, baseName, type Mount } from '../ui';
import { recorder, waveEditor, savePanel, copyTrim, extForMime, type Recording } from '../lib/audioui';
import { audio, decodeAudio } from '../lib/audio-client';

const stamp = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `recording-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

export const mount: Mount = (root, ctx) => {
  let src: { blob: Blob; name: string; recorded: boolean } | null = null, normalise = false, fades = false, seq = 0, live = true;
  const editor = waveEditor();
  const editCards = h('div', { class: 'stack', hidden: true });
  const bar = actions();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });

  // the newest file (or recording) wins; nothing is shown after the tab is left
  const load = async (blob: Blob, name: string, recorded: boolean) => {
    const my = ++seq;
    status.textContent = 'Reading the audio…';
    try {
      const buf = await decodeAudio(blob);
      if (my !== seq || !live) return;
      if (!buf.duration) throw new Error('No audio in this file.');
      src = { blob, name, recorded };
      await editor.set(buf);
      if (my !== seq || !live) return;
      status.textContent = `${recorded ? 'Recording' : name}: ${buf.duration.toFixed(1)} s · ${buf.numberOfChannels === 1 ? 'mono' : `${buf.numberOfChannels} channels`} · ${buf.sampleRate.toLocaleString('en-IN')} Hz`;
      editCards.hidden = false; showEdit();
    } catch (e) { if (my === seq && live) { status.textContent = ''; toast(`Cannot read this audio: ${errMsg(e)}`, 'err'); } }
  };
  const rec = recorder({ isMobile: ctx.isMobile, onStart: () => { editCards.hidden = true; editor.stop(); }, onDone: (r: Recording) => load(r.blob, `${stamp()}.${extForMime(r.mime)}`, true) });

  const save = savePanel({
    isMobile: ctx.isMobile,
    name: () => (src ? (src.recorded ? baseName(src.name) : `${baseName(src.name)}-edited`) : 'audio'),
    pcm: async () => {
      const b = editor.buffer!; let chs = editor.selection();
      if (normalise) {
        const lv = await Promise.all(chs.map((c) => audio('levels', c)));
        const pk = Math.max(...lv.map((l) => l.peak));
        if (pk > 1e-4) chs = await audio('gain', chs, 10 ** (-1 / 20) / pk);
      }
      if (fades) { const n = Math.min(Math.round(b.sampleRate * 0.3), Math.floor(chs[0].length / 3)); chs = await audio('fade', chs, n, n); }
      return { chs, sr: b.sampleRate };
    },
    original: () => {
      if (!src) return null;
      if (normalise || fades) throw new Error('Volume and fade changes need re-encoding: choose MP3 or WAV.');
      const [a, b] = editor.range;
      if (!editor.trimmed && !src.recorded) return Promise.resolve({ blob: src.blob, ext: (src.name.split('.').pop() || 'audio').toLowerCase() });
      return copyTrim(src.blob, editor.trimmed ? a : null, editor.trimmed ? b : null);
    },
  });

  const again = button(ctx.isMobile ? 'New' : 'New recording', () => { editor.stop(); editCards.hidden = true; src = null; status.textContent = ''; showRec(); }, { icon: 'Mic' });
  function showRec() { bar.replaceChildren(...rec.bar); }
  function showEdit() { bar.replaceChildren(again, editor.playBtn, save.saveButton()); }

  editCards.append(
    card('Trim', editor.el),
    card('Clean up', stack(
      toggle('Even out the volume (loudest point to −1 dB)', normalise, (v) => (normalise = v)),
      toggle('Fade in and out (0.3 s)', fades, (v) => (fades = v)))),
    card('Save', save.el));
  root.append(
    card('Record', rec.el,
      note(ctx.isMobile ? 'Keep this page open while recording; the screen stays on.' : 'Recording stays in this browser — nothing is uploaded.', 'info')),
    card(null, filePicker({ accept: 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm', label: 'Or open an audio file to trim', compact: true, onFiles: ([f]) => load(f, f.name, false) }), status),
    editCards, bar);
  showRec();
  return () => { live = false; seq++; rec.dispose(); editor.dispose(); };
};
