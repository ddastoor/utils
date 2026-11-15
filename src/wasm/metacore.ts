// Wrapper for metacore.wasm (own C: wasm/metacore/metacore.c) — EXIF, metadata stripping, JPEG DPI, image sniffing.
// `bindMetacore` is environment-neutral (Node unit tests); `metacore()` loads it in the browser.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/metacore.wasm?url';

export const IMAGE_TYPES = ['unknown', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'avif'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export function bindMetacore(e: any) {
  const withBytes = <T>(b: Uint8Array, extra: number, f: (src: number, dst: number) => T): T => {
    const s = e.m_malloc(b.length), d = e.m_malloc(b.length + extra);
    try { new Uint8Array(e.memory.buffer, s, b.length).set(b); return f(s, d); } finally { e.m_free(s); e.m_free(d); }
  };
  return {
    sniff(b: Uint8Array): { type: ImageType; width: number; height: number } {
      const head = b.subarray(0, Math.min(b.length, 1 << 16));
      return withBytes(head, 0, (s) => {
        const o = e.m_malloc(12);
        try { e.m_sniff(s, head.length, o); const r = new Int32Array(e.memory.buffer, o, 3); return { type: IMAGE_TYPES[r[0]] || 'unknown', width: r[1], height: r[2] }; } finally { e.m_free(o); }
      });
    },
    /** Raw EXIF tags as an object (names as in the EXIF spec), {} if none. */
    exif(b: Uint8Array): Record<string, string | number | number[]> {
      return withBytes(b, 0, (s) => {
        for (let cap = 1 << 16; cap <= 1 << 22; cap <<= 2) {
          const o = e.m_malloc(cap);
          try {
            const n = e.m_exif_json(s, b.length, o, cap);
            if (n >= 0) return n === 0 ? {} : JSON.parse(new TextDecoder().decode(new Uint8Array(e.memory.buffer, o, n)));
          } finally { e.m_free(o); }
        }
        return {};
      });
    },
    /** Metadata removed without re-encoding (JPEG/PNG/WebP), or null for other formats / corrupt files. */
    strip(b: Uint8Array): Uint8Array | null {
      return withBytes(b, 0, (s, d) => { const n = e.m_strip(s, b.length, d); return n > 0 ? new Uint8Array(e.memory.buffer.slice(d, d + n)) : null; });
    },
    /** JPEG with JFIF density set to dpi (inserts a JFIF header if missing); input unchanged if not a JPEG. */
    jpegDpi(b: Uint8Array, dpi: number): Uint8Array {
      return withBytes(b, 18, (s, d) => { const n = e.m_jpeg_set_dpi(s, b.length, d, dpi); return n > 0 ? new Uint8Array(e.memory.buffer.slice(d, d + n)) : b; });
    },
  };
}
export type Metacore = ReturnType<typeof bindMetacore>;
let inst: Promise<Metacore> | null = null;
export const metacore = () => (inst ||= instantiateWasi(wasmUrl).then((x) => bindMetacore(x.exports)));
