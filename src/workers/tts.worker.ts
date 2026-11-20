// Text-to-Speech engine (worker): our espeak.wasm (eSpeak NG → IPA) + ONNX Runtime Web (official WebAssembly build)
// running Kokoro-82M (US/UK voices, 24 kHz) or Piper en_US-l2arctic-medium (Indian English speakers, 22.05 kHz).
// Models are served from this site (public/models, SHA-256 pinned in scripts/assets.json). Audio is sent back one
// chunk (sentence) at a time so playback can start before the whole text is done.
import * as ort from 'onnxruntime-web/wasm';
import { instantiateWasi } from '../wasm/wasi';
import { bindEspeak, type Espeak } from '../wasm/espeak';
import espeakUrl from '../wasm/bin/espeak.wasm?url';
import { chunks, tokenize, sentences } from '../lib/kokoro';
import { sentencePhonemes, phonemeIds, type PiperConfig } from '../lib/piper';

type Msg = { id: number; op: 'speak'; base: string; engine: 'kokoro' | 'piper'; voice: string; lang: 'a' | 'b'; speaker: number; speed: number; text: string } | { id: number; op: 'cancel' } | { id: number; op: 'phonemes'; base: string; engine: 'kokoro' | 'piper'; lang: 'a' | 'b'; text: string };
const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);
let base = '', es: Espeak | null = null, kokoro: Promise<ort.InferenceSession> | null = null, piper: Promise<{ s: ort.InferenceSession; cfg: PiperConfig }> | null = null;
const voices = new Map<string, Promise<Float32Array>>();
// runs one after the other: a new Speak while one runs used to run both on the same ONNX session at once
const cancelled = new Set<number>();
let chain: Promise<unknown> = Promise.resolve();
const at = (p: string) => new URL(p, base).href;

async function fetchBytes(url: string, what: string, id: number): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${what} (${r.status})`);
  const total = +(r.headers.get('content-length') || 0);
  if (!r.body || !total) return new Uint8Array(await r.arrayBuffer());
  let out = new Uint8Array(total), got = 0, last = 0;
  const rd = r.body.getReader();
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    // (a server that compresses the file sends more bytes than Content-Length says: the buffer grows)
    if (got + value.length > out.length) { const bigger = new Uint8Array(Math.max(out.length * 2, got + value.length)); bigger.set(out.subarray(0, got)); out = bigger; }
    out.set(value, got); got += value.length;
    if (got - last > total / 50) { last = got; post({ id, type: 'progress', what, loaded: Math.min(got, total), total }); }
  }
  return got === out.length ? out : out.slice(0, got);
}
async function espeak() {
  if (!es) es = bindEspeak((await instantiateWasi(espeakUrl)).exports);
  return es;
}
async function session(bytes: Uint8Array) {
  ort.env.wasm.numThreads = 1; // GitHub Pages cannot enable cross-origin isolation (no threads)
  ort.env.wasm.proxy = false;
  // the runtime's .wasm is bundled by Vite as a hashed asset next to this worker (ort's own new URL(…, import.meta.url))
  return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}
const kokoroSession = (id: number) => (kokoro ||= fetchBytes(at('models/kokoro/model_quantized.onnx'), 'the Kokoro voice model (92 MB, once per visit)', id).then(session).catch((e) => { kokoro = null; throw e; }));
const kokoroVoice = (v: string, id: number) => {
  let p = voices.get(v);
  if (!p) { p = fetchBytes(at(`models/kokoro/voices/${v}.bin`), `voice ${v}`, id).then((b) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)); voices.set(v, p); p.catch(() => voices.delete(v)); }
  return p;
};
const piperSession = (id: number) => (piper ||= (async () => {
  const cfg = await (await fetch(at('models/piper/en_US-l2arctic-medium.onnx.json'))).json() as PiperConfig;
  return { cfg, s: await session(await fetchBytes(at('models/piper/en_US-l2arctic-medium.onnx'), 'the Indian English voice model (77 MB, once per visit)', id)) };
})().catch((e) => { piper = null; throw e; }));
const i64 = (a: number[]) => BigInt64Array.from(a.map((x) => BigInt(x)));
const silence = (sr: number, s: number) => new Float32Array(Math.round(sr * s));

self.onmessage = (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  if (m.op === 'cancel') { cancelled.add(m.id); return; }
  chain = chain.then(() => (cancelled.has(m.id) ? post({ id: m.id, type: 'cancelled' }) : run(m))).finally(() => cancelled.delete(m.id));
};
async function run(m: Exclude<Msg, { op: 'cancel' }>) {
  base = m.base;
  try {
    const e = await espeak();
    if (m.op === 'phonemes') { post({ id: m.id, type: 'phonemes', phonemes: m.engine === 'kokoro' ? chunks(e, m.text, m.lang).map((c) => c.phonemes) : sentencePhonemes(e, m.text) }); return; }
    const t0 = performance.now();
    if (m.engine === 'kokoro') {
      const parts = chunks(e, m.text, m.lang);
      if (!parts.length) throw new Error('Nothing to read: type some words.');
      const [s, style] = await Promise.all([kokoroSession(m.id), kokoroVoice(m.voice, m.id)]);
      post({ id: m.id, type: 'ready', parts: parts.length, loadMs: performance.now() - t0 });
      for (let k = 0; k < parts.length; k++) {
        if (cancelled.has(m.id)) return post({ id: m.id, type: 'cancelled' });
        const ids = tokenize(parts[k].phonemes), n = Math.min(Math.max(ids.length - 2, 0), 509);
        const out = await s.run({
          input_ids: new ort.Tensor('int64', i64(ids), [1, ids.length]),
          style: new ort.Tensor('float32', style.slice(n * 256, n * 256 + 256), [1, 256]),
          speed: new ort.Tensor('float32', new Float32Array([m.speed]), [1]),
        });
        const wav = (out.waveform.data as Float32Array).slice();
        const audio = k < parts.length - 1 ? concat([wav, silence(24000, 0.12)]) : wav;
        post({ id: m.id, type: 'chunk', index: k, total: parts.length, sr: 24000, text: parts[k].text, phonemes: parts[k].phonemes, audio }, [audio.buffer]);
      }
    } else {
      const lines = sentences(m.text).flatMap((t) => sentencePhonemes(e, t).map((ph) => ({ t, ph })));
      if (!lines.length) throw new Error('Nothing to read: type some words.');
      const { s, cfg } = await piperSession(m.id), sr = cfg.audio.sample_rate, inf = cfg.inference;
      post({ id: m.id, type: 'ready', parts: lines.length, loadMs: performance.now() - t0 });
      for (let k = 0; k < lines.length; k++) {
        if (cancelled.has(m.id)) return post({ id: m.id, type: 'cancelled' });
        const { ids } = phonemeIds(lines[k].ph, cfg.phoneme_id_map);
        const feeds: Record<string, ort.Tensor> = {
          input: new ort.Tensor('int64', i64(ids), [1, ids.length]),
          input_lengths: new ort.Tensor('int64', i64([ids.length]), [1]),
          scales: new ort.Tensor('float32', new Float32Array([inf.noise_scale, inf.length_scale / m.speed, inf.noise_w]), [3]),
        };
        if ((cfg.num_speakers || 1) > 1) feeds.sid = new ort.Tensor('int64', i64([m.speaker]), [1]);
        const out = await s.run(feeds);
        const wav = (out[s.outputNames[0]].data as Float32Array).slice();
        const audio = concat([wav, silence(sr, 0.2)]); // piper's sentence silence
        post({ id: m.id, type: 'chunk', index: k, total: lines.length, sr, text: lines[k].t, phonemes: lines[k].ph, audio }, [audio.buffer]);
      }
    }
    post({ id: m.id, type: 'done', ms: performance.now() - t0 });
  } catch (err: any) {
    post({ id: m.id, type: 'error', error: err?.message || String(err) });
  }
}
function concat(parts: Float32Array[]) { const o = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; }
