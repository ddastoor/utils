// Speech to Text: whisper.cpp (our own wasm build) with OpenAI's English Whisper models, on this device. Record or open
// audio/video → transcript, timestamped segments, .txt / .srt / .vtt. "Accurate" = small.en (default on PC; best for
// Indian, UK and US accents), "Fast" = base.en (default on phones). A "names and terms" box primes the spelling
// (Whisper's initial prompt). Not live dictation: GitHub Pages cannot enable the threads that would need.
import { h, card, field, actions, button, segmented, toggle, textarea, stack, note, progress, filePicker, toast, errMsg, fmtTime, baseName, downloadBlob, shareOrDownload, copy, clear, type Mount } from '../ui';
import { recorder, type Recording } from '../lib/audioui';
import { decodeAudio, channelsOf } from '../lib/audio-client';
import { trackWorker } from '../lifecycle';

export interface Segment { t0: number; t1: number; text: string } // t0/t1 in centiseconds (whisper.cpp)
const ts = (cs: number, sep: ',' | '.') => { const ms = cs * 10, h2 = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000; return `${String(h2).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`; };
export const toSrt = (segs: Segment[]) => segs.map((s, i) => `${i + 1}\n${ts(s.t0, ',')} --> ${ts(s.t1, ',')}\n${s.text.trim()}\n`).join('\n');
export const toVtt = (segs: Segment[]) => `WEBVTT\n\n${segs.map((s) => `${ts(s.t0, '.')} --> ${ts(s.t1, '.')}\n${s.text.trim()}\n`).join('\n')}`;
export const toText = (segs: Segment[]) => segs.map((s) => s.text.trim()).join(' ').replace(/\s+/g, ' ').trim();

let worker: Worker | null = null, seq = 0;
const handlers = new Map<number, (m: any) => void>();
const engine = () => {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/stt.worker.ts', import.meta.url), { type: 'module' }), 'stt-worker', () => { handlers.clear(); worker = null; });
    worker.onmessage = (e) => handlers.get(e.data.id)?.(e.data);
    worker.onerror = (e) => { for (const f of handlers.values()) f({ type: 'error', error: e.message || 'The speech engine stopped (out of memory?)' }); handlers.clear(); worker = null; };
  }
  return worker;
};

export const mount: Mount = (root, ctx) => {
  let model: 'small' | 'base' = ctx.isMobile ? 'base' : 'small', beam = false, src: { buf: AudioBuffer; name: string; url: string } | null = null, segs: Segment[] = [], running = 0;
  let pickSeq = 0, live = true;
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const hintTa = textarea({ rows: 2, placeholder: 'e.g. Ahmedabad, Kubernetes, GSTIN, Dr Iyer, SuperTools' }) as HTMLTextAreaElement;
  hintTa.setAttribute('aria-label', 'Names and terms');
  // Whisper reads at most 223 tokens of it (whisper.cpp keeps the end of a longer prompt); a rare name is 3 – 4 tokens
  const hintNote = h('div', { class: 'muted small', 'aria-live': 'polite' });
  hintTa.addEventListener('input', () => { const n = hintTa.value.trim().split(/[\s,;]+/).filter(Boolean).length; hintNote.textContent = n > 60 ? `${n} words: Whisper reads only about the last 60 – 100 of them (223 tokens) — keep the list to the names and terms that matter.` : ''; });
  const player = h('audio', { controls: true, class: 'stt-player' }) as HTMLAudioElement;
  const out = h('textarea', { class: 'input textarea stt-out', rows: 10, 'aria-label': 'Transcript', spellcheck: 'true' }) as HTMLTextAreaElement;
  const list = h('div', { class: 'stt-segs' });
  const resultCard = card('Transcript', stack(out, h('div', { class: 'row' },
    button('Copy', () => copy(out.value), { icon: 'Copy', small: true }),
    button('.txt', () => save(new Blob([`${out.value}\n`], { type: 'text/plain;charset=utf-8' }), 'txt'), { icon: 'Download', small: true }),
    button('.srt', () => save(new Blob([toSrt(segs)], { type: 'application/x-subrip;charset=utf-8' }), 'srt'), { icon: 'Captions', small: true, title: 'Subtitles (SubRip)' }),
    button('.vtt', () => save(new Blob([toVtt(segs)], { type: 'text/vtt;charset=utf-8' }), 'vtt'), { icon: 'Captions', small: true, title: 'Subtitles (WebVTT)' })),
  h('details', { class: 'rec-opts' }, h('summary', null, 'Segments with times (click to listen)'), list)));
  resultCard.hidden = true;
  const save = async (b: Blob, ext: string) => { const n = `${baseName(src?.name || 'transcript')}.${ext}`; ctx.isMobile ? await shareOrDownload(b, n) : downloadBlob(b, n); };
  const inputInfo = h('div', { class: 'muted small' });

  /** rough seconds of work per second of audio on a typical PC (one thread), plus the fixed 30 s window of the encoder */
  function estimate() {
    if (!src) return;
    const rate = model === 'small' ? 3 : 1.2, d = src.buf.duration;
    inputInfo.textContent = `${src.name}: ${fmtTime(d)} · transcribing takes roughly ${fmtTime(Math.max(d, 15) * rate)} with this model on a typical PC`;
  }
  async function setSource(blob: Blob, name: string) {
    const my = ++pickSeq;
    inputInfo.textContent = 'Reading the audio…'; goBtn.disabled = true;
    try {
      const buf = await decodeAudio(blob, 16000); // what Whisper reads: 16 kHz (the player keeps the file itself)
      if (my !== pickSeq || !live) return;
      if (!buf.duration) throw new Error('there is no sound in this file');
      if (running) stop();
      if (src) URL.revokeObjectURL(src.url);
      src = { buf, name, url: URL.createObjectURL(blob) };
      player.src = src.url;
      // the transcript belonged to the file before (its downloads would take this file's name, its segments play this one)
      segs = []; out.value = ''; clear(list); resultCard.hidden = true; status.textContent = '';
      estimate();
      goBtn.disabled = false; picker.classList.add('drop-compact');
    } catch (e) {
      if (my !== pickSeq || !live) return;
      inputInfo.textContent = ''; estimate(); goBtn.disabled = !src; // what was open stays open
      toast(`Cannot read this audio: ${errMsg(e)}`, 'err');
    }
  }
  function show(result: { segments: Segment[] }) {
    segs = result.segments.filter((s) => s.text.trim() && !/^\s*[[(](blank_audio|music|silence|inaudible)[\])]\s*$/i.test(s.text));
    out.value = toText(segs);
    if (!segs.length) { clear(list); resultCard.hidden = true; return; } // the status line says no speech was found
    clear(list).append(...segs.map((s) => h('button', { class: 'stt-seg', type: 'button', onclick: () => { player.currentTime = s.t0 / 100; player.play().catch(() => {}); } },
      h('span', { class: 'stt-t' }, fmtTime(s.t0 / 100)), h('span', null, s.text.trim()))));
    resultCard.hidden = false;
  }
  async function run() {
    if (!src || running) return;
    const id = ++seq; running = id;
    goBtn.hidden = true; stopBtn.hidden = false; status.textContent = '';
    await new Promise<void>((resolve) => {
      handlers.set(id, (m) => {
        if (m.type === 'progress') {
          prog.set(m.stage === 'load' ? null : m.p, m.stage === 'download' ? `Loading ${m.what}… ${Math.round(m.p * 100)} %` : m.stage === 'load' ? 'Preparing the model…' : `Transcribing… ${Math.round(m.p * 100)} %`);
          return;
        }
        handlers.delete(id); prog.done();
        if (m.type === 'error') { toast(m.error, 'err'); status.textContent = m.error; }
        else { show(m.result); status.textContent = `${fmtTime(m.seconds)} of audio transcribed in ${(m.ms / 1000).toFixed(1)} s${m.loadMs > 1500 ? ` (+ ${(m.loadMs / 1000).toFixed(1)} s loading the model)` : ''} · ${segs.length ? `${segs.length} segment${segs.length === 1 ? '' : 's'}` : 'no speech was found in this recording'}`; }
        resolve();
      });
      const chs = channelsOf(src!.buf);
      engine().postMessage({ id, op: 'transcribe', base: document.baseURI, model, chs, sr: src!.buf.sampleRate, prompt: hintTa.value.trim(), beam: beam ? 5 : 0 }, chs.map((c) => c.buffer));
    });
    if (running === id) running = 0;
    goBtn.hidden = false; stopBtn.hidden = true;
  }
  function stop() { // the engine is busy in one long call: end the worker (the model is fetched again from the cache)
    worker?.terminate(); worker = null; handlers.clear(); running = 0; prog.done();
    goBtn.hidden = false; stopBtn.hidden = true; status.textContent = 'Stopped.';
  }

  const rec = recorder({ isMobile: ctx.isMobile, onDone: (r: Recording) => setSource(r.blob, 'recording') });
  const picker = filePicker({ accept: 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm,.mp4,.mov,.mkv', label: 'Open a recording or video', hint: 'Voice notes, meetings, lectures, interviews, videos — it stays on this device', onFiles: ([f]) => setSource(f, f.name) });
  const recBox = h('details', { class: 'rec-opts' }, h('summary', null, 'Or record with the microphone'), stack(rec.el, h('div', { class: 'row' }, ...rec.bar)));
  const goBtn = button('Transcribe', () => run(), { icon: 'FileText', variant: 'primary', disabled: true });
  const stopBtn = button('Stop', () => stop(), { icon: 'Square', variant: 'danger' }); stopBtn.hidden = true;
  root.append(
    card(null, picker, recBox, inputInfo, player),
    card('Settings', stack(
      field('Model', segmented<'small' | 'base'>([['small', 'Accurate (190 MB, slower)'], ['base', 'Fast (60 MB)']], model, (v) => { model = v; estimate(); })),
      field('Names and terms (optional)', hintTa, 'Spellings to expect — names, places, jargon. They guide Whisper through the whole recording but are not forced.'), hintNote,
      toggle('Best accuracy (beam search; about 2× slower)', beam, (v) => (beam = v)))),
    prog, status, resultCard,
    note('English only (US, UK, Indian and other accents). Whisper runs on this device; the audio never leaves it. Long recordings take a while: about 1–3 seconds of work per second of audio on a PC.', 'info'),
    actions(goBtn, stopBtn));
  return () => { live = false; pickSeq++; stop(); rec.dispose(); if (src) URL.revokeObjectURL(src.url); };
};
