// The Audiobook tab's speech worker: one track at a time — its paragraphs said by the voice (src/lib/speech.ts: Kokoro or
// Piper on ONNX Runtime Web), with the pauses of a book read aloud, straight into an MP3 stream (audio.wasm's LAME,
// a_mp3s_*) that carries the track's ID3 tags; only the MP3 is kept (an hour of speech is 29 MB at 64 kbps — 345 MB as
// samples). The tab runs one of these per speech engine it uses at once; Stop ends the worker.
import { speechEngine, PIECE_GAP, type SpeechVoice } from '../lib/speech';
import { speechText } from '../lib/speechtext';
import { instantiateWasi } from '../wasm/wasi';
import { bindAudio, writeOver, type AudioEngine, type Mp3Stream } from '../wasm/audio';
import audioUrl from '../wasm/bin/audio.wasm?url';

export interface MakeMsg {
  id: number; op: 'make'; base: string; voice: SpeechVoice; speed: number; kbps: number;
  tags: Record<string, string>; art?: Uint8Array;
  blocks: Array<{ kind: 'heading' | 'text' | 'break'; text: string }>;
  /** a sample to listen to: short silences at its ends */
  sample?: boolean;
}
/** The pauses of a book read aloud, in seconds at speed 1 (shorter when faster): room at the start and the end of a
 *  track (an audiobook's: half a second to a second before, one to five after), a paragraph, a heading, a break between
 *  scenes. */
export const PAUSE = { start: 0.75, paragraph: 0.6, beforeHeading: 0.5, afterHeading: 1.0, scene: 1.6, end: 1.4 } as const;

const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);
const sp = speechEngine(post);
let lame: Promise<AudioEngine> | null = null;
const cancelled = new Set<number>();
let chain: Promise<unknown> = Promise.resolve();

self.onmessage = (ev: MessageEvent<MakeMsg | { id: number; op: 'cancel' }>) => {
  const m = ev.data;
  if (m.op === 'cancel') { cancelled.add(m.id); return; }
  chain = chain.then(() => make(m)).finally(() => cancelled.delete(m.id));
};

async function make(m: MakeMsg) {
  sp.setBase(m.base);
  let enc: Mp3Stream | null = null;
  try {
    const t0 = performance.now();
    const [sr, audio] = await Promise.all([sp.load(m.voice, m.id), lame ||= instantiateWasi(audioUrl).then((x) => bindAudio(x.exports)).catch((e) => { lame = null; throw e; })]);
    post({ id: m.id, type: 'ready', sr, loadMs: performance.now() - t0 });
    const t1 = performance.now();
    enc = audio.mp3Stream(sr, 1, { rate: m.kbps }, m.tags, m.art);
    const parts: Uint8Array[] = [enc.head], e = enc;
    let samples = 0, done = 0, last = 0;
    const put = (x: Float32Array) => { const b = e.feed([x]); if (b.length) parts.push(b); samples += x.length; };
    const quiet = (s: number) => { const n = Math.round((sr * s) / m.speed); if (n > 0) put(new Float32Array(n)); };
    const total = m.blocks.reduce((s, b) => s + b.text.length, 0) || 1;
    quiet(m.sample ? 0.15 : PAUSE.start);
    for (let k = 0; k < m.blocks.length; k++) {
      const b = m.blocks[k];
      if (b.kind === 'break') { quiet(PAUSE.scene); continue; }
      const pieces = await sp.pieces(m.voice, speechText(b.text));
      if (b.kind === 'heading' && k > 0) quiet(PAUSE.beforeHeading);
      for (let i = 0; i < pieces.length; i++) {
        if (cancelled.has(m.id)) { e.close(); post({ id: m.id, type: 'cancelled' }); return; }
        put(await sp.say(m.voice, pieces[i], m.speed, m.id));
        if (i < pieces.length - 1) quiet(PIECE_GAP[m.voice.engine]);
        const now = performance.now();
        if (now - last > 200) { last = now; post({ id: m.id, type: 'step', done: done + (b.text.length * (i + 1)) / pieces.length, of: total, seconds: samples / sr, ms: now - t1, text: pieces[i].text }); }
      }
      done += b.text.length;
      if (k < m.blocks.length - 1 || !m.sample) quiet(b.kind === 'heading' ? PAUSE.afterHeading : PAUSE.paragraph);
    }
    quiet(m.sample ? 0.1 : PAUSE.end);
    const { tail, tag } = e.end();
    parts.push(tail);
    writeOver(parts, e.head.length, tag);
    const file = new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
    post({ id: m.id, type: 'done', file, seconds: samples / sr, bytes: file.size, ms: performance.now() - t1 });
  } catch (err: any) {
    enc?.close();
    post({ id: m.id, type: 'error', error: err?.message || String(err) });
  }
}
