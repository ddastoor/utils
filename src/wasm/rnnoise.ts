// RNNoise 0.2 (Xiph, C, BSD-3: a recurrent neural network trained on speech and noise) as Jitsi builds it for Jitsi
// Meet — @jitsi/rnnoise-wasm 0.2.1 (Apache-2.0, Emscripten). Its "sync" file carries the 0.2 model with the
// WebAssembly inlined; the package's separate rnnoise.wasm still has the 0.1 model and is not used.
// The module cleans one 10 ms frame of 480 samples at 48 kHz on the ±32768 scale of 16-bit audio and returns the
// probability that the frame holds a voice; what comes out lags what goes in by two frames.
// Ours here (glue): the framing, the alignment and the voice probability over all channels. The scaling and the
// resampling around it are audio.wasm's (src/workers/noise.worker.ts).

/** The parts of the Emscripten module that are used. */
export interface RnnoiseModule {
  _rnnoise_create(model: number): number;
  _rnnoise_destroy(st: number): void;
  _rnnoise_process_frame(st: number, out: number, input: number): number;
  _malloc(n: number): number;
  _free(p: number): void;
  HEAPF32: Float32Array;
}
/** Samples in a frame (10 ms at 48 kHz), and the frames by which the output lags the input. */
export const FRAME = 480, DELAY = 2;

export function bindRnnoise(M: RnnoiseModule) {
  return {
    /** Clean planar 48 kHz audio on the ±32768 scale. The cleaned channels are as long as the input and line up with
     *  it; vad holds one voice probability per 10 ms frame — the largest of the channels (a voice may be on one only). */
    denoise(chs: Float32Array[]): { chs: Float32Array[]; vad: Float32Array } {
      const n = chs[0]?.length || 0, frames = Math.ceil(n / FRAME), vad = new Float32Array(frames);
      const pi = M._malloc(FRAME * 4), po = M._malloc(FRAME * 4);
      try {
        if (!pi || !po) throw new Error('Out of memory');
        const out = chs.map((src) => {
          const dst = new Float32Array(n), st = M._rnnoise_create(0);
          if (!st) throw new Error('Out of memory');
          try {
            for (let k = 0; k < frames + DELAY; k++) { // DELAY more frames of silence bring out the last ones
              const a = Math.min(k * FRAME, n), b = Math.min(a + FRAME, n);
              M.HEAPF32.fill(0, pi >> 2, (pi >> 2) + FRAME); // (re-read: the heap may grow and get a new view)
              if (b > a) M.HEAPF32.set(src.subarray(a, b), pi >> 2);
              const p = M._rnnoise_process_frame(st, po, pi);
              if (k < DELAY) continue;
              const f = k - DELAY, at = f * FRAME, len = Math.min(FRAME, n - at);
              if (p > vad[f]) vad[f] = p;
              dst.set(M.HEAPF32.subarray(po >> 2, (po >> 2) + len), at);
            }
          } finally { M._rnnoise_destroy(st); }
          return dst;
        });
        return { chs: out, vad };
      } finally { if (pi) M._free(pi); if (po) M._free(po); }
    },
  };
}
export type Rnnoise = ReturnType<typeof bindRnnoise>;
