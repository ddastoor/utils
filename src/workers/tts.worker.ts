// Text-to-Speech engine (worker): the neural voices of src/lib/speech.ts — our espeak.wasm (eSpeak NG → IPA) + ONNX
// Runtime Web running Kokoro-82M (US/UK voices, 24 kHz) or Piper en_US-l2arctic-medium (Indian English speakers,
// 22.05 kHz). Audio is sent back one chunk (sentence) at a time so playback can start before the whole text is done.
import { speechEngine, PIECE_GAP } from '../lib/speech';
import { chunks } from '../lib/kokoro';
import { sentencePhonemes } from '../lib/piper';

type Msg = { id: number; op: 'speak'; base: string; engine: 'kokoro' | 'piper'; voice: string; lang: 'a' | 'b'; speaker: number; speed: number; text: string } | { id: number; op: 'cancel' } | { id: number; op: 'phonemes'; base: string; engine: 'kokoro' | 'piper'; lang: 'a' | 'b'; text: string };
const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);
const sp = speechEngine(post);
// runs one after the other: a new Speak while one runs used to run both on the same ONNX session at once
const cancelled = new Set<number>();
let chain: Promise<unknown> = Promise.resolve();
const silence = (sr: number, s: number) => new Float32Array(Math.round(sr * s));

self.onmessage = (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  if (m.op === 'cancel') { cancelled.add(m.id); return; }
  chain = chain.then(() => (cancelled.has(m.id) ? post({ id: m.id, type: 'cancelled' }) : run(m))).finally(() => cancelled.delete(m.id));
};
async function run(m: Exclude<Msg, { op: 'cancel' }>) {
  sp.setBase(m.base);
  try {
    if (m.op === 'phonemes') { const e = await sp.espeak(); post({ id: m.id, type: 'phonemes', phonemes: m.engine === 'kokoro' ? chunks(e, m.text, m.lang).map((c) => c.phonemes) : sentencePhonemes(e, m.text) }); return; }
    const t0 = performance.now(), v = { engine: m.engine, voice: m.voice, lang: m.lang, speaker: m.speaker };
    const parts = await sp.pieces(v, m.text);
    if (!parts.length) throw new Error('Nothing to read: type some words.');
    const sr = await sp.load(v, m.id);
    post({ id: m.id, type: 'ready', parts: parts.length, loadMs: performance.now() - t0 });
    for (let k = 0; k < parts.length; k++) {
      if (cancelled.has(m.id)) return post({ id: m.id, type: 'cancelled' });
      const wav = await sp.say(v, parts[k], m.speed, m.id);
      // Kokoro: a short pause between chunks (none after the last); Piper: its sentence silence after every sentence
      const audio = m.engine === 'kokoro' ? (k < parts.length - 1 ? concat([wav, silence(sr, PIECE_GAP.kokoro)]) : wav) : concat([wav, silence(sr, PIECE_GAP.piper)]);
      post({ id: m.id, type: 'chunk', index: k, total: parts.length, sr, text: parts[k].text, phonemes: parts[k].phonemes, audio }, [audio.buffer]);
    }
    post({ id: m.id, type: 'done', ms: performance.now() - t0 });
  } catch (err: any) {
    post({ id: m.id, type: 'error', error: err?.message || String(err) });
  }
}
function concat(parts: Float32Array[]) { const o = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; }
