// Wrapper for audio.wasm (wasm/audio): LAME 4.0 MP3 encoder (C, LGPL-2.0) + our own audio C — WAV writer, waveform
// peaks, levels, gain/fades, windowed-sinc resampler, WSOLA time stretch. Audio is planar Float32Array per channel.
// In the browser call it through src/lib/audio-client.ts (runs in a worker); bindAudio() is used there and in tests.

export interface Mp3Options { vbr?: boolean; rate?: number; quality?: number }
export function bindAudio(e: any) {
  const mem = () => e.memory.buffer as ArrayBuffer;
  const err = () => { const p = e.a_error(), m = new Uint8Array(mem()); let n = p; while (m[n]) n++; return new TextDecoder().decode(m.subarray(p, n)) || 'audio engine error'; };
  /** Copies planar channels into wasm memory; returns the pointer (caller frees). */
  const putPlanar = (chs: Float32Array[]) => {
    const n = chs[0]?.length || 0, p = e.a_malloc(n * chs.length * 4);
    chs.forEach((c, i) => new Float32Array(mem(), p + i * n * 4, n).set(c));
    return { p, n };
  };
  const takeBytes = (out: number) => { if (!out) throw new Error(err()); try { return new Uint8Array(mem(), out, e.a_outlen()).slice(); } finally { e.a_free(out); } };
  const takePlanar = (out: number, ch: number) => {
    if (!out) throw new Error(err());
    try { const n = e.a_outlen(); return Array.from({ length: ch }, (_, i) => new Float32Array(mem(), out + i * n * 4, n).slice()); } finally { e.a_free(out); }
  };
  const withMono = <T>(x: Float32Array, f: (p: number) => T): T => { const p = e.a_malloc(x.length * 4); new Float32Array(mem(), p, x.length).set(x); try { return f(p); } finally { e.a_free(p); } };
  return {
    version(): string { const p = e.a_lame_version(), m = new Uint8Array(mem()); let n = p; while (m[n]) n++; return new TextDecoder().decode(m.subarray(p, n)); },
    /** RIFF/WAVE, 16-bit PCM (default) or 32-bit float. */
    wav(chs: Float32Array[], sr: number, bits: 16 | 32 = 16): Uint8Array {
      const { p, n } = putPlanar(chs);
      try { return takeBytes(e.a_wav(p, n, chs.length, sr, bits)); } finally { e.a_free(p); }
    },
    /** MP3 with LAME: CBR `rate` kbps (default 192) or VBR quality `rate` 0–9. More than 2 channels are mixed down. */
    mp3(chs: Float32Array[], sr: number, o: Mp3Options = {}): Uint8Array {
      const use = chs.length > 2 ? [this.mixMono(chs)] : chs;
      const { p, n } = putPlanar(use);
      try { return takeBytes(e.a_mp3(p, n, use.length, sr, o.vbr ? 1 : 0, o.rate ?? (o.vbr ? 2 : 192), o.quality ?? 2)); } finally { e.a_free(p); }
    },
    /** [min, max] pairs for `buckets` equal slices (waveform drawing). */
    peaks(x: Float32Array, buckets: number): Float32Array {
      const o = e.a_malloc(buckets * 8);
      try { withMono(x, (p) => e.a_peaks(p, x.length, buckets, o)); return new Float32Array(mem(), o, buckets * 2).slice(); } finally { e.a_free(o); }
    },
    levels(x: Float32Array): { peak: number; rms: number } {
      const o = e.a_malloc(8);
      try { withMono(x, (p) => e.a_levels(p, x.length, o)); const r = new Float32Array(mem(), o, 2); return { peak: r[0], rms: r[1] }; } finally { e.a_free(o); }
    },
    gain(chs: Float32Array[], g: number): Float32Array[] {
      return chs.map((c) => withMono(c, (p) => { e.a_gain(p, c.length, g); return new Float32Array(mem(), p, c.length).slice(); }));
    },
    fade(chs: Float32Array[], fadeIn: number, fadeOut: number): Float32Array[] {
      const { p, n } = putPlanar(chs);
      try { e.a_fade(p, n, chs.length, fadeIn, fadeOut); return chs.map((_, i) => new Float32Array(mem(), p + i * n * 4, n).slice()); } finally { e.a_free(p); }
    },
    /** ga·a + gb·b per channel (same lengths), clamped to ±1. */
    mix2(a: Float32Array[], b: Float32Array[], ga: number, gb: number): Float32Array[] {
      return a.map((x, i) => {
        const n = x.length, pa = e.a_malloc(n * 4), pb = e.a_malloc(n * 4);
        try {
          new Float32Array(mem(), pa, n).set(x); new Float32Array(mem(), pb, n).set(b[i].subarray(0, n));
          e.a_mix2(pa, pb, n, ga, gb);
          return new Float32Array(mem(), pa, n).slice();
        } finally { e.a_free(pa); e.a_free(pb); }
      });
    },
    mixMono(chs: Float32Array[]): Float32Array {
      if (chs.length === 1) return chs[0];
      const { p, n } = putPlanar(chs), o = e.a_malloc(n * 4);
      try { e.a_mix_mono(p, n, chs.length, o); return new Float32Array(mem(), o, n).slice(); } finally { e.a_free(p); e.a_free(o); }
    },
    /** Resample by ratio = new rate / old rate (windowed sinc, Kaiser β 8.6). */
    resample(chs: Float32Array[], ratio: number): Float32Array[] {
      const { p, n } = putPlanar(chs);
      try { return takePlanar(e.a_resample(p, n, chs.length, ratio), chs.length); } finally { e.a_free(p); }
    },
    /** Tempo change without pitch change (WSOLA). tempo 2 = twice as fast. */
    stretch(chs: Float32Array[], sr: number, tempo: number): Float32Array[] {
      const { p, n } = putPlanar(chs);
      try { return takePlanar(e.a_wsola(p, n, chs.length, sr, tempo), chs.length); } finally { e.a_free(p); }
    },
    /** Tempo × and pitch in semitones, independently: stretch by tempo/pitch-ratio, then resample by 1/pitch-ratio. */
    tempoPitch(chs: Float32Array[], sr: number, tempo: number, semitones: number): Float32Array[] {
      const r = 2 ** (semitones / 12);
      if (Math.abs(semitones) < 1e-6) return Math.abs(tempo - 1) < 1e-6 ? chs : this.stretch(chs, sr, tempo);
      const s = this.stretch(chs, sr, tempo / r);
      return this.resample(s, 1 / r);
    },
  };
}
export type AudioEngine = ReturnType<typeof bindAudio>;
