// The neural voices, for a worker: our espeak.wasm (eSpeak NG → IPA) + ONNX Runtime Web (Microsoft's official WebAssembly
// build) running Kokoro-82M (US and British voices, 24 kHz) or Piper en_US-l2arctic-medium (Indian English speakers,
// 22.05 kHz). Models are served from this site (public/models, SHA-256 pinned in scripts/assets.json), fetched once a visit
// with their progress. Used by the Text-to-Speech worker and the Audiobook worker.
import * as ort from 'onnxruntime-web/wasm';
import { instantiateWasi } from '../wasm/wasi';
import { bindEspeak, type Espeak } from '../wasm/espeak';
import espeakUrl from '../wasm/bin/espeak.wasm?url';
import { chunks, tokenize, sentences } from './kokoro';
import { sentencePhonemes, phonemeIds, type PiperConfig } from './piper';

export interface SpeechVoice { engine: 'kokoro' | 'piper'; voice: string; lang: 'a' | 'b'; speaker: number }
/** What is said in one run of the network: a sentence (Piper) or sentences merged up to the model's length (Kokoro). */
export interface Piece { text: string; phonemes: string }
/** The silence after a piece inside a paragraph, as the Text-to-Speech tab has always put it (seconds). */
export const PIECE_GAP = { kokoro: 0.12, piper: 0.2 } as const;

/** `post` receives { id, type: 'progress', what, loaded, total } while a model downloads. */
export function speechEngine(post: (m: any) => void) {
  let base = '', es: Espeak | null = null, kokoro: Promise<ort.InferenceSession> | null = null, piper: Promise<{ s: ort.InferenceSession; cfg: PiperConfig }> | null = null;
  const voices = new Map<string, Promise<Float32Array>>();
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
    // the runtime's .wasm is bundled by Vite as a hashed asset next to the worker (ort's own new URL(…, import.meta.url))
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

  return {
    /** The site's address (models are fetched from it). */
    setBase(b: string) { base = b; },
    espeak,
    /** The pieces a text is said in: Kokoro's chunks (sentences, merged while short, at most 510 phoneme symbols), or
     *  Piper's sentences, a line of phonemes each. */
    async pieces(v: SpeechVoice, text: string): Promise<Piece[]> {
      const e = await espeak();
      return v.engine === 'kokoro' ? chunks(e, text, v.lang) : sentences(text).flatMap((t) => sentencePhonemes(e, t).map((ph) => ({ text: t, phonemes: ph })));
    },
    /** The voice's model (and its style) loaded; its sample rate. */
    async load(v: SpeechVoice, id: number): Promise<number> {
      if (v.engine === 'kokoro') { await Promise.all([kokoroSession(id), kokoroVoice(v.voice, id)]); return 24000; }
      return (await piperSession(id)).cfg.audio.sample_rate;
    },
    /** One piece said: the network's waveform, nothing added. */
    async say(v: SpeechVoice, p: Piece, speed: number, id: number): Promise<Float32Array> {
      if (v.engine === 'kokoro') {
        const [s, style] = await Promise.all([kokoroSession(id), kokoroVoice(v.voice, id)]);
        const ids = tokenize(p.phonemes), n = Math.min(Math.max(ids.length - 2, 0), 509);
        const out = await s.run({
          input_ids: new ort.Tensor('int64', i64(ids), [1, ids.length]),
          style: new ort.Tensor('float32', style.slice(n * 256, n * 256 + 256), [1, 256]),
          speed: new ort.Tensor('float32', new Float32Array([speed]), [1]),
        });
        return (out.waveform.data as Float32Array).slice();
      }
      const { s, cfg } = await piperSession(id), inf = cfg.inference;
      const { ids } = phonemeIds(p.phonemes, cfg.phoneme_id_map);
      const feeds: Record<string, ort.Tensor> = {
        input: new ort.Tensor('int64', i64(ids), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', i64([ids.length]), [1]),
        scales: new ort.Tensor('float32', new Float32Array([inf.noise_scale, inf.length_scale / speed, inf.noise_w]), [3]),
      };
      if ((cfg.num_speakers || 1) > 1) feeds.sid = new ort.Tensor('int64', i64([v.speaker]), [1]);
      const out = await s.run(feeds);
      return (out[s.outputNames[0]].data as Float32Array).slice();
    },
  };
}
