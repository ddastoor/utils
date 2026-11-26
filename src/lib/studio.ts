// The Noise Remover's "Studio voice" (to-do #20 — owner, 26 Nov 2026: "when I record my voice, say out in the open, in
// traffic or outside, when I remove the noise, there should be a new option so that it should sound as if I'm speaking in
// the studio"): DeepFilterNet 3 over a recording of any length, and the words for what the studio finish did. No DOM — the
// noise worker and the unit suite run it.
//
// The network (DeepFilterNet 3, 48 kHz; soniqo/DeepFilterNet3-ONNX on ONNX Runtime Web) sees a whole segment at once and
// keeps a memory (its GRUs) from the segment's start, so a recording is cleaned in segments of 10 s, each read from 3 s
// before to 1 s after it, joined by crossfades of 0.5 s: measured on a 31 s recording, 40 dB apart from one pass over the
// whole and as clean (SI-SDR and DNSMOS the same; docs/WASM-AUDIT.md, Noise Remover) — and the network's memory and time
// stay those of 14.5 s, on a phone too. Each segment's signal processing (STFT, the features, the mask and the deep
// filter, overlap-add) is audio.wasm's (wasm/audio/studio.c).
import type { AudioEngine, FinishReport } from '../wasm/audio';

/** The network: feat_erb [1, 1, T, 32] and feat_spec [1, 2, T, 96] → erb_mask [1, 1, T, 32] and df_coefs [1, 5, T, 96, 2] */
export type DfnNet = (ferb: Float32Array, fspec: Float32Array, T: number) => Promise<{ mask: Float32Array; coefs: Float32Array }>;
export const SR = 48000;
export const SEG = 10 * SR, PRE = 3 * SR, POST = 1 * SR, FADE = SR / 2;

/** Where the segments of n samples start */
export const segmentStarts = (n: number) => { const s: number[] = []; for (let a = 0; a < n; a += SEG) s.push(a); return s; };

/** One channel at 48 kHz cleaned by DeepFilterNet 3, as long as the input and lined up with it. `stale()` true ends it
 *  (null); `onProgress(done, total)` hears of each segment (samples). */
export async function deepFilter(x: Float32Array, au: AudioEngine, net: DfnNet, onProgress?: (done: number, total: number) => void, stale?: () => boolean): Promise<Float32Array | null> {
  const n = x.length, out = new Float32Array(n), starts = segmentStarts(n);
  for (let s = 0; s < starts.length; s++) {
    if (stale?.()) return null;
    const a = starts[s], next = starts[s + 1], b = next === undefined ? n : Math.min(n, next + FADE);
    const lo = Math.max(0, a - PRE), hi = Math.min(n, b + POST);
    const { T, ferb, fspec } = au.dfnPrepare(x.subarray(lo, hi));
    const { mask, coefs } = await net(ferb, fspec, T);
    if (stale?.()) return null;
    const y = au.dfnApply(mask, coefs);
    // the crossfades: this segment fades in over the first FADE samples after its start and out over the next one's
    for (let i = a; i < b; i++) {
      let w = 1;
      if (s > 0 && i < a + FADE) w = (i - a + 0.5) / FADE;
      if (next !== undefined && i >= next) w = 1 - (i - next + 0.5) / FADE;
      out[i] += w * y[i - lo];
    }
    onProgress?.(next === undefined ? n : next, n);
  }
  return out;
}

/** Are all channels the same sound (a mono microphone recorded as stereo)? Then one is cleaned and copied. */
export const sameChannels = (chs: Float32Array[]) => chs.every((c) => {
  if (c === chs[0]) return true;
  for (let i = 0; i < c.length; i++) if (c[i] !== chs[0][i]) return false;
  return true;
});

const dB = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)} dB`;
/** The line under the result: what the studio finish did */
export function finishWords(r: FinishReport): string {
  const parts: string[] = [];
  if (Number.isFinite(r.before) && Number.isFinite(r.after)) parts.push(`${r.before.toFixed(1).replace('-', '−')} → ${r.after.toFixed(1).replace('-', '−')} LUFS, peaks at ${r.peak.toFixed(1).replace('-', '−')} dBTP`);
  if (r.expander < -0.5) parts.push(`the pauses lowered by ${dB(r.expander).slice(1)}`);
  if (r.compressor < -0.5) parts.push(`the loudest words evened out (up to ${dB(r.compressor)})`);
  if (r.deesser < -0.5) parts.push(`“s” sounds softened (up to ${dB(r.deesser)})`);
  return parts.length ? `Studio finish: ${parts.join(' · ')}` : 'Studio finish: there is no voice to finish';
}
