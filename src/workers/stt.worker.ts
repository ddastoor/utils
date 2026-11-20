// Speech to Text engine (worker): whisper.cpp 1.8.3 built by us (whisper.wasm, single thread, WebAssembly SIMD) with
// OpenAI's English Whisper models (ggml q5_1, served from this site). Audio is mixed to mono and resampled to 16 kHz by
// our audio.wasm here, so the page only hands over the decoded channels.
import { instantiateWasi } from '../wasm/wasi';
import { bindAudio, type AudioEngine } from '../wasm/audio';
import whisperUrl from '../wasm/bin/whisper.wasm?url';
import audioUrl from '../wasm/bin/audio.wasm?url';

export type SttModel = 'base' | 'small';
const MODELS: Record<SttModel, { file: string; split: boolean; label: string }> = {
  base: { file: 'models/whisper/ggml-base.en-q5_1.bin', split: false, label: 'the fast English model (60 MB)' },
  small: { file: 'models/whisper/ggml-small.en-q5_1.bin', split: true, label: 'the accurate English model (190 MB)' },
};
type Msg = { id: number; op: 'transcribe'; base: string; model: SttModel; chs: Float32Array[]; sr: number; prompt: string; beam: number };
const post = (m: any) => (self as any).postMessage(m);
let cur = 0, w: any = null, au: AudioEngine | null = null, loaded: SttModel | null = null, base = '';
const at = (p: string) => new URL(p, base).href;

async function engine() {
  if (!w) w = (await instantiateWasi(whisperUrl, { env: { w_progress: (p: number) => post({ id: cur, type: 'progress', stage: 'transcribe', p: p / 100 }) } })).exports;
  if (!au) au = bindAudio((await instantiateWasi(audioUrl)).exports);
  return w;
}
/** Streams the model (whole file, or the parts listed in <file>.parts.json) straight into wasm memory, then loads it.
 *  The size comes from the parts list (exact) or from a HEAD request; a server that compresses the file sends more bytes
 *  than it announced, so the buffer grows (it was written past its end). */
async function loadModel(name: SttModel, id: number) {
  if (loaded === name) return;
  const e = await engine(), m = MODELS[name];
  const urls: string[] = [], sizes: number[] = [];
  const offline = (why: unknown) => new Error(`Could not download ${m.label} — check the connection and try again (${why instanceof Error ? why.message : why}).`);
  try {
    if (m.split) {
      const r = await fetch(at(`${m.file}.parts.json`));
      if (!r.ok) throw new Error(`${r.status}`);
      const man = await r.json();
      man.parts.forEach((n: number, i: number) => { urls.push(at(`${m.file}.${i}`)); sizes.push(n); });
    } else {
      urls.push(at(m.file));
      const r = await fetch(urls[0], { method: 'HEAD' });
      if (!r.ok) throw new Error(`${r.status}`);
      sizes.push(+(r.headers.get('content-length') || 0));
    }
  } catch (err) { throw offline(err); }
  const total = sizes.reduce((a, b) => a + b, 0);
  e.w_unload(); loaded = null;
  let cap = Math.max(total, 1 << 20), ptr = e.w_malloc(cap);
  if (!ptr) throw new Error('Not enough memory for the model.');
  let off = 0, last = 0;
  try {
    for (const u of urls) {
      let r: Response;
      try { r = await fetch(u); } catch (err) { throw offline(err); }
      if (!r.ok || !r.body) throw offline(r.status);
      const rd = r.body.getReader();
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await rd.read(); } catch { throw new Error(`The download of ${m.label} was interrupted — try again.`); }
        if (chunk.done) break;
        const value = chunk.value;
        if (off + value.length > cap) { // more than announced: grow
          const np = e.w_malloc(Math.max(cap * 2, off + value.length));
          if (!np) throw new Error('Not enough memory for the model.');
          new Uint8Array(e.memory.buffer).copyWithin(np, ptr, ptr + off);
          e.w_free(ptr); ptr = np; cap = Math.max(cap * 2, off + value.length);
        }
        new Uint8Array(e.memory.buffer, ptr + off, value.length).set(value); off += value.length;
        if (off - last > (total || cap) / 100) { last = off; post({ id, type: 'progress', stage: 'download', p: Math.min(1, off / (total || cap)), what: m.label }); }
      }
    }
    if ((m.split && off !== total) || off < total || !off) throw new Error(`The download of ${m.label} was incomplete — try again.`);
    post({ id, type: 'progress', stage: 'load', p: 1, what: m.label });
    if (e.w_load(ptr, off) !== 0) throw new Error('The model could not be loaded.');
    loaded = name;
  } finally { e.w_free(ptr); }
}

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  cur = m.id; base = m.base;
  try {
    const t0 = performance.now();
    await loadModel(m.model, m.id);
    const tLoad = performance.now() - t0;
    const mono = au!.mixMono(m.chs);
    const [pcm] = m.sr === 16000 ? [mono] : au!.resample([mono], 16000 / m.sr);
    const e = w, enc = new TextEncoder();
    const pp = e.w_malloc(pcm.length * 4), pb = enc.encode(`${m.prompt || ''}\0`), pr = e.w_malloc(pb.length), lp = e.w_malloc(4);
    new Float32Array(e.memory.buffer, pp, pcm.length).set(pcm);
    new Uint8Array(e.memory.buffer, pr, pb.length).set(pb);
    const t1 = performance.now();
    post({ id: m.id, type: 'progress', stage: 'transcribe', p: 0 });
    const out = e.w_transcribe(pp, pcm.length, pr, m.beam, lp);
    try {
      if (!out) throw new Error('Transcription failed.');
      const json = new TextDecoder().decode(new Uint8Array(e.memory.buffer, out, new Uint32Array(e.memory.buffer, lp, 1)[0]));
      post({ id: m.id, type: 'done', result: JSON.parse(json), seconds: pcm.length / 16000, loadMs: tLoad, ms: performance.now() - t1 });
    } finally { if (out) e.w_free(out); e.w_free(pp); e.w_free(pr); e.w_free(lp); }
  } catch (err: any) {
    post({ id: m.id, type: 'error', error: err?.message || String(err) });
  }
};
