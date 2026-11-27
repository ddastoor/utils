// Wrapper for audio.wasm (wasm/audio): LAME 4.0 MP3 encoder (C, LGPL-2.0) + our own audio C — WAV writer, waveform
// peaks, levels, gain/fades, windowed-sinc resampler (tempo and pitch: Signalsmith Stretch, src/lib/stretch.ts), and the
// Noise Remover's Studio voice (wasm/audio/studio.c: DeepFilterNet 3's signal processing, the studio finish, BS.1770
// loudness and true peak). Audio is planar Float32Array per channel.
// In the browser call it through src/lib/audio-client.ts (runs in a worker); bindAudio() is used there and in tests.

export interface Mp3Options { vbr?: boolean; rate?: number; quality?: number }
/** What the studio finish did (wasm/audio/studio.c): loudness before and after (LUFS as heard on two speakers), the true
 *  peak after (dBTP), the expander's mean reduction below its threshold, the compressor's, de-esser's and limiter's
 *  largest reductions (dB), and the gain of the loudness step (dB). */
export interface FinishReport { before: number; after: number; peak: number; expander: number; compressor: number; deesser: number; gain: number; limiter: number }
/** The finish's steps (bits of a_studio_finish's flags) */
export const FINISH = { rumble: 1, expander: 2, eq: 4, compressor: 8, deesser: 16, loudness: 32, all: 63 } as const;
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
    /** the module's memory in bytes (the tests: a long stream keeps it flat) */
    memoryBytes(): number { return mem().byteLength; },
    version(): string { const p = e.a_lame_version(), m = new Uint8Array(mem()); let n = p; while (m[n]) n++; return new TextDecoder().decode(m.subarray(p, n)); },
    /** RIFF/WAVE, 16-bit PCM (default) or 32-bit float. chromium: write 16-bit samples as Chromium reads them (above
     *  zero ×32767, below ×32768; int16Asymmetric() in src/lib/audio-client.ts tells), else ×32768 for both. */
    wav(chs: Float32Array[], sr: number, bits: 16 | 32 = 16, chromium = false): Uint8Array {
      const { p, n } = putPlanar(chs);
      try { return takeBytes(e.a_wav(p, n, chs.length, sr, bits, chromium ? 1 : 0)); } finally { e.a_free(p); }
    },
    /** MP3 with LAME: CBR `rate` kbps (default 192) or VBR quality `rate` 0–9. More than 2 channels are mixed down. */
    mp3(chs: Float32Array[], sr: number, o: Mp3Options = {}): Uint8Array {
      const use = chs.length > 2 ? [this.mixMono(chs)] : chs;
      const { p, n } = putPlanar(use);
      try { return takeBytes(e.a_mp3(p, n, use.length, sr, o.vbr ? 1 : 0, o.rate ?? (o.vbr ? 2 : 192), o.quality ?? 2)); } finally { e.a_free(p); }
    },
    /** MP3 as a stream (a_mp3s_*: a long recording fed a piece at a time — never held whole as samples). `tags` are ID3v2.3
     *  text frames (UTF-16): TIT2 title, TALB album, TPE1 artist, TRCK "3/12", TCON genre, TLAN language …; `art` a JPEG,
     *  PNG or GIF cover. The file = head, then the bytes of every feed() and of end(); then `tag` is written over the
     *  first frame, at head.length (writeOver). Not through the audio worker: a stream lives in one instance. */
    mp3Stream(sr: number, ch: 1 | 2, o: Mp3Options = {}, tags: Record<string, string> = {}, art?: Uint8Array) {
      const h = e.a_mp3s_open(ch, sr, o.vbr ? 1 : 0, o.rate ?? (o.vbr ? 2 : 192), o.quality ?? 2);
      if (!h) throw new Error(err());
      let closed = false;
      const close = () => { if (!closed) { closed = true; e.a_mp3s_close(h); } };
      try {
        for (const [id, text] of Object.entries(tags)) {
          const t = text.replace(/\0/g, '').trim();
          if (!/^[A-Z][A-Z0-9]{3}$/.test(id) || !t) continue;
          const pid = e.a_malloc(5), pt = e.a_malloc((t.length + 2) * 2);
          try {
            new Uint8Array(mem(), pid, 5).set([...id].map((c) => c.charCodeAt(0)).concat(0));
            const u = new Uint16Array(mem(), pt, t.length + 2);
            u[0] = 0xfeff; for (let i = 0; i < t.length; i++) u[i + 1] = t.charCodeAt(i); u[t.length + 1] = 0;
            const r = e.a_mp3s_tag(h, pid, pt);
            if (r !== 0) throw new Error(`the ID3 frame ${id} could not be set (LAME ${r})`);
          } finally { e.a_free(pid); e.a_free(pt); }
        }
        if (art?.length) {
          const p = e.a_malloc(art.length);
          try { new Uint8Array(mem(), p, art.length).set(art); if (e.a_mp3s_art(h, p, art.length) !== 0) throw new Error('the cover is not a JPEG, PNG or GIF picture'); } finally { e.a_free(p); }
        }
        const head = takeBytes(e.a_mp3s_begin(h));
        return {
          head,
          /** planar channels (as many as the stream was opened with; one for a stereo stream is put on both sides) → the MP3
           *  bytes they gave (often none yet) */
          feed(chs: Float32Array[]): Uint8Array {
            if (closed) throw new Error('the MP3 stream is closed');
            if (chs.length !== ch && !(ch === 2 && chs.length === 1)) throw new Error(`the MP3 stream takes ${ch} channel${ch > 1 ? 's' : ''}`);
            const { p, n } = putPlanar(chs.length === ch ? chs : [chs[0], chs[0]]);
            try { return n ? takeBytes(e.a_mp3s_feed(h, p, n)) : new Uint8Array(0); } finally { e.a_free(p); }
          },
          /** the last bytes, and the LAME / Xing frame to write over the first frame (the stream is closed) */
          end(): { tail: Uint8Array; tag: Uint8Array } {
            if (closed) throw new Error('the MP3 stream is closed');
            try { const tail = takeBytes(e.a_mp3s_end(h)); return { tail, tag: takeBytes(e.a_mp3s_lametag(h)) }; } finally { close(); }
          },
          close,
        };
      } catch (x) { close(); throw x; }
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
    /** x·g per channel, not clamped (gain clamps to ±1). */
    scale(chs: Float32Array[], g: number): Float32Array[] {
      return chs.map((c) => withMono(c, (p) => { e.a_scale(p, c.length, g); return new Float32Array(mem(), p, c.length).slice(); }));
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
    /** DeepFilterNet 3, one segment of mono 48 kHz sound: its STFT is kept in the module; returns the frames T and the
     *  network's inputs feat_erb [1, 1, T, 32] and feat_spec [1, 2, T, 96] (copies). */
    dfnPrepare(x: Float32Array): { T: number; ferb: Float32Array; fspec: Float32Array } {
      const T = withMono(x, (p) => e.a_dfn_prepare(p, x.length));
      if (!T) throw new Error(err());
      const pe = e.a_dfn_ferb(), ps = e.a_dfn_fspec(); // (pointers first: a call may grow the memory and detach a view's buffer)
      return { T, ferb: new Float32Array(mem(), pe, T * 32).slice(), fspec: new Float32Array(mem(), ps, T * 96 * 2).slice() };
    },
    /** The noisy STFT of the prepared segment, [T][481][2] (the tests) */
    dfnSpec(T: number): Float32Array { const p = e.a_dfn_spec(); return new Float32Array(mem(), p, T * 481 * 2).slice(); },
    /** The network's erb_mask [1, 1, T, 32] and df_coefs [1, 5, T, 96, 2] → the cleaned segment, as long as the input */
    dfnApply(mask: Float32Array, coefs: Float32Array): Float32Array {
      const pm = e.a_malloc(mask.length * 4), pc = e.a_malloc(coefs.length * 4);
      try {
        new Float32Array(mem(), pm, mask.length).set(mask); new Float32Array(mem(), pc, coefs.length).set(coefs);
        return takePlanar(e.a_dfn_apply(pm, pc), 1)[0];
      } finally { e.a_free(pm); e.a_free(pc); e.a_dfn_release(); }
    },
    dfnErbWidths(): Int32Array { const p = e.a_dfn_erb_widths(); return new Int32Array(mem(), p, 32).slice(); },
    /** ITU-R BS.1770-4 integrated loudness (LUFS; each channel weighted 1, as FFmpeg's ebur128 measures) of 48 kHz audio */
    loudness(chs: Float32Array[]): number { const { p, n } = putPlanar(chs); try { return e.a_loudness(p, n, chs.length); } finally { e.a_free(p); } },
    /** The true peak (dBTP, 4× oversampled) */
    truePeak(chs: Float32Array[]): number { const { p, n } = putPlanar(chs); try { return e.a_true_peak(p, n, chs.length); } finally { e.a_free(p); } },
    /** The studio finish of 48 kHz audio (FINISH flags; −16 LUFS as heard on two speakers, −1.5 dBTP) */
    studioFinish(chs: Float32Array[], flags: number = FINISH.all, target = -16, ceiling = -1.5): { chs: Float32Array[]; report: FinishReport } {
      const { p, n } = putPlanar(chs), r = e.a_malloc(64);
      try {
        const out = takePlanar(e.a_studio_finish(p, n, chs.length, flags, target, ceiling, r), chs.length);
        const v = new Float64Array(mem(), r, 8);
        return { chs: out, report: { before: v[0], after: v[1], peak: v[2], expander: v[3], compressor: v[4], deesser: v[5], gain: v[6], limiter: v[7] } };
      } finally { e.a_free(p); e.a_free(r); }
    },
    /** Resample by ratio = new rate / old rate (windowed sinc, Kaiser β 8.6). */
    resample(chs: Float32Array[], ratio: number): Float32Array[] {
      const { p, n } = putPlanar(chs);
      try { return takePlanar(e.a_resample(p, n, chs.length, ratio), chs.length); } finally { e.a_free(p); }
    },
  };
}
export type AudioEngine = ReturnType<typeof bindAudio>;
export type Mp3Stream = ReturnType<AudioEngine['mp3Stream']>;
/** Writes `bytes` at `offset` of the stream that `parts` make one after another (the LAME tag frame over the first frame:
 *  it may begin in one part and end in the next). The parts are changed in place. */
export function writeOver(parts: Uint8Array[], offset: number, bytes: Uint8Array) {
  let at = 0, k = 0;
  for (const p of parts) {
    const end = at + p.length;
    if (end > offset + k && k < bytes.length) {
      const from = offset + k - at, n = Math.min(p.length - from, bytes.length - k);
      p.set(bytes.subarray(k, k + n), from); k += n;
    }
    at = end;
    if (k >= bytes.length) break;
  }
  if (k < bytes.length) throw new Error('the MP3 stream is shorter than its tag frame');
}
