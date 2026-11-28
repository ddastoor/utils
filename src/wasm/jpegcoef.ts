// Wrapper for jpegcoef.wasm (libjpeg-turbo's coefficient reader + our glue: wasm/jpegcoef/glue.c) — a JPEG's stored DCT
// coefficients and quantization tables, and the checks of "Is This Screenshot Real?" made on them (src/lib/realcheck.ts).
// `bindJpegcoef` is environment-neutral (Node unit tests); `jpegcoef()` loads it in the browser. libjpeg ends a file it cannot
// read with a trap (its error_exit must not return): the binding then says why and makes a new instance for the next file.
import { compileWasi, instantiateWasiModule } from './wasi';
import wasmUrl from './bin/jpegcoef.wasm?url';
import { lazyEngine } from '../lifecycle';

export interface JpegComponent { id: number; h: number; v: number; bw: number; bh: number; table: number[] }
export interface JpegFrame {
  width: number; height: number; progressive: boolean; arithmetic: boolean; bits: number;
  /** corrupt-data warnings libjpeg gave (it reads on) and the first of them */
  warnings: number; warning: string;
  /** whether the coefficients were read (false: larger than the limit given) */
  read: boolean;
  components: JpegComponent[];
}

/** what jc_analyse makes of the ghosts: the blocks with detail, the deepest dip and its depth, the earlier save's quality (0:
 *  none), the areas not saved like the rest (in blocks of 8 × 8), the curve from qlo, each block's smoothed excess (−1: not
 *  looked at) */
export interface GhostReading {
  blocks: number; dip: number; depth: number; earlier: number;
  areas: Array<{ blocks: number; x0: number; y0: number; x1: number; y1: number; excess: number }>;
  curve: number[]; qlo: number; map: Float32Array; bw: number; bh: number;
}

/** the standard (ITU T.81 Annex K) luminance and chrominance tables, natural order */
export const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
export const STD_CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...Array(32).fill(99)];
/** the table libjpeg makes for a quality (jpeg_quality_scaling, force_baseline) */
export function stdTable(q: number, chroma = false): number[] {
  q = Math.min(100, Math.max(1, Math.round(q)));
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - 2 * q;
  return (chroma ? STD_CHROMA : STD_LUMA).map((k) => Math.min(255, Math.max(1, Math.floor((k * scale + 50) / 100))));
}
/** the quality whose standard table is closest to this one, and how far (the sum of the differences; 0: exactly libjpeg's) */
export function tableQuality(table: number[], chroma = false): { quality: number; off: number } {
  let best = 1, off = Infinity;
  for (let q = 1; q <= 100; q++) {
    const t = stdTable(q, chroma);
    let d = 0;
    for (let i = 0; i < 64; i++) d += Math.abs(t[i] - table[i]);
    if (d < off || (d === off && q > best)) { off = d; best = q; } // a tie (all ones at 99 and 100): the higher
  }
  return { quality: best, off };
}

export function bindJpegcoef(e: any) {
  const text = (p: number) => { const m = new Uint8Array(e.memory.buffer); let n = p; while (m[n]) n++; return new TextDecoder().decode(m.subarray(p, n)); };
  let src = 0;
  const close = () => { e.jc_close(); if (src) e.jc_free(src); src = 0; };
  return {
    /** Reads a JPEG's header and, when it holds at most maxPx pixels, its coefficients (kept until the next open or close).
     *  Throws with libjpeg's words when the bytes are no JPEG it can read. */
    open(bytes: Uint8Array, maxPx = 100e6): JpegFrame {
      close();
      src = e.jc_malloc(bytes.length);
      new Uint8Array(e.memory.buffer, src, bytes.length).set(bytes);
      let r = 0;
      try { r = e.jc_open(src, bytes.length, maxPx); } catch (err) { const m = text(e.jc_msg()); throw Object.assign(new Error(m || String(err)), { trapped: true }); }
      const o = e.jc_malloc((9 + 32 + 256) * 4);
      try {
        e.jc_info(o);
        const v = new Int32Array(e.memory.buffer.slice(o, o + (9 + 32 + 256) * 4));
        return {
          width: v[1], height: v[2], progressive: !!v[3], arithmetic: !!v[4], bits: v[5], warnings: v[6], warning: text(e.jc_warning()), read: r === 0,
          components: Array.from({ length: v[0] }, (_, c) => ({ id: v[9 + 8 * c], h: v[10 + 8 * c], v: v[11 + 8 * c], bw: v[12 + 8 * c], bh: v[13 + 8 * c], table: Array.from(v.subarray(41 + 64 * c, 105 + 64 * c)) })),
        };
      } finally { e.jc_free(o); }
    },
    /** Component c's blocks quantized again with the standard table at every quality q0 … q1 (jc_ghost): `err[(q − q0) · nb + b]`
     *  the error block b keeps (a pixel's mean squared error), `energy[b]` its detail. */
    ghost(c: number, bw: number, bh: number, q0: number, q1: number): { err: Float32Array; energy: Float32Array } {
      const nb = bw * bh, nq = q1 - q0 + 1, o = e.jc_malloc(Math.max(1, nb * nq) * 4), g = e.jc_malloc(Math.max(1, nb) * 4);
      try {
        e.jc_ghost(c, q0, q1, o, g);
        return { err: new Float32Array(e.memory.buffer.slice(o, o + nb * nq * 4)), energy: new Float32Array(e.memory.buffer.slice(g, g + nb * 4)) };
      } finally { e.jc_free(o); e.jc_free(g); }
    },
    /** How far component c's coefficients lie from the standard table's grid at every quality q0 … q1 (jc_grid): 0 … 0.5 of a
     *  step, −1 where a block says nothing. */
    grid(c: number, bw: number, bh: number, q0: number, q1: number): Float32Array {
      const nb = bw * bh, nq = q1 - q0 + 1, o = e.jc_malloc(Math.max(1, nb * nq) * 4);
      try { e.jc_grid(c, q0, q1, o); return new Float32Array(e.memory.buffer.slice(o, o + nb * nq * 4)); } finally { e.jc_free(o); }
    },
    /** component c's quantized coefficients, 64 a block in natural order (for the tests) */
    coefs(c: number, bw: number, bh: number): Int16Array {
      const o = e.jc_malloc(Math.max(1, bw * bh) * 128);
      try { e.jc_coefs(c, o); return new Int16Array(e.memory.buffer.slice(o, o + bw * bh * 128)); } finally { e.jc_free(o); }
    },
    /** The ghosts read (jc_analyse — the rule and its measurements are in glue.c): `err` / `grid` from ghost() / grid() (or
     *  imgproc's pixel versions for a picture saved without loss), quality-major for q = qlo … qhi; `keep` 0 for a block to
     *  leave out; `qend` the end of the dip search (the file's quality; 99 for a lossless picture). */
    analyse(err: Float32Array, grid: Float32Array, energy: Float32Array, keep: Uint8Array, bw: number, bh: number, qlo: number, qhi: number, qend: number): GhostReading {
      const nb = bw * bh, nq = qhi - qlo + 1, MAXA = 8, outLen = 5 + 6 * MAXA + nq + nb;
      const put = (a: ArrayBufferView) => { const p = e.jc_malloc(Math.max(1, a.byteLength)); new Uint8Array(e.memory.buffer, p, a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); return p; };
      const pe = put(err), pg = put(grid), pn = put(energy), pk = put(keep), po = e.jc_malloc(outLen * 4);
      try {
        const n = e.jc_analyse(pe, pg, pn, pk, bw, bh, qlo, qhi, qend, po);
        const o = new Float32Array(e.memory.buffer.slice(po, po + outLen * 4));
        return {
          blocks: o[0], dip: o[1], depth: o[2], earlier: o[3],
          areas: Array.from({ length: n }, (_, i) => { const a = o.subarray(5 + 6 * i, 11 + 6 * i); return { blocks: a[0], x0: a[1], y0: a[2], x1: a[3], y1: a[4], excess: a[5] }; }).sort((a, b) => b.blocks - a.blocks),
          curve: Array.from(o.subarray(5 + 6 * MAXA, 5 + 6 * MAXA + nq)), qlo,
          map: o.slice(5 + 6 * MAXA + nq), bw, bh,
        };
      } finally { for (const p of [pe, pg, pn, pk, po]) e.jc_free(p); }
    },
    close,
    version: () => { const v = e.jc_version(); return `${Math.floor(v / 1e6)}.${Math.floor(v / 1e3) % 1000}.${v % 1000}`; },
  };
}
export type Jpegcoef = ReturnType<typeof bindJpegcoef>;

let compiled: Promise<WebAssembly.Module> | null = null;
/** a fresh instance (after libjpeg trapped on a file, the old one's state is not to be trusted) */
export const newJpegcoef = async () => bindJpegcoef((await instantiateWasiModule(await (compiled ??= compileWasi(wasmUrl).catch((err) => { compiled = null; throw err; })))).exports);
export const jpegcoef = lazyEngine('jpegcoef', newJpegcoef);
