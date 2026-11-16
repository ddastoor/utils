// Wrapper for rnnoise.wasm: Xiph RNNoise 0.2 (C, BSD-3) built by us (wasm/rnnoise). Works at 48 kHz; planar float.
export function bindRnnoise(e: any) {
  const mem = () => e.memory.buffer as ArrayBuffer;
  return {
    /** Denoise planar 48 kHz audio. mix 1 = fully cleaned, 0 = original. Returns channels + voice probability per 10 ms. */
    denoise(chs: Float32Array[], mix = 1): { chs: Float32Array[]; vad: Float32Array } {
      const n = chs[0]?.length || 0, ch = chs.length, frames = Math.ceil(n / 480);
      const p = e.n_malloc(n * ch * 4), v = e.n_malloc(frames * 4 + 4);
      try {
        chs.forEach((c, i) => new Float32Array(mem(), p + i * n * 4, n).set(c));
        const out = e.n_denoise(p, n, ch, mix, v);
        if (!out) throw new Error('Out of memory');
        try { return { chs: chs.map((_, i) => new Float32Array(mem(), out + i * n * 4, n).slice()), vad: new Float32Array(mem(), v, frames).slice() }; } finally { e.n_free(out); }
      } finally { e.n_free(p); e.n_free(v); }
    },
  };
}
export type Rnnoise = ReturnType<typeof bindRnnoise>;
