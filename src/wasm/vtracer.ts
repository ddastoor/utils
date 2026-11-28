// Wrapper for vtracer.wasm: visioncortex's VTracer 0.6.5 (wasm/vtracer, our build of the latest release) — a picture's pixels in, an
// SVG out — for the Image to SVG and Clipart Maker tabs. `bindVtracer(exports)` is environment-neutral so the Node unit tests can use
// it too.
export interface VtOptions {
  /** colour (default) or black and white */ color?: boolean;
  /** shapes cut out of one another instead of stacked */ cutout?: boolean;
  /** 'spline' (smooth curves), 'polygon' (straight lines) or 'pixel' (the pixels' own edges) */ mode?: 'spline' | 'polygon' | 'pixel';
  /** areas smaller than this many pixels (side length × side length) left out */ filterSpeckle?: number;
  /** bits of each colour channel that count (1 – 8) */ colorPrecision?: number;
  /** how far apart two layers' colours must be (0 – 255) */ layerDifference?: number;
  /** degrees: a sharper turn is a corner */ cornerThreshold?: number;
  /** shortest segment, in pixels (3.5 – 10) */ lengthThreshold?: number;
  maxIterations?: number;
  /** degrees: a turn above it splits a spline */ spliceThreshold?: number;
  /** decimals of the path's numbers */ precision?: number;
}
export function bindVtracer(e: any) {
  const dec = new TextDecoder();
  return {
    trace(img: { data: ArrayLike<number>; width: number; height: number }, o: VtOptions = {}): string {
      const n = img.width * img.height * 4, p = e.vt_alloc(n);
      try {
        new Uint8Array(e.memory.buffer, p, n).set(img.data as any);
        const r = e.vt_trace(p, img.width, img.height, o.color === false ? 0 : 1, o.cutout ? 1 : 0, o.mode === 'pixel' ? 0 : o.mode === 'polygon' ? 1 : 2,
          o.filterSpeckle ?? 4, o.colorPrecision ?? 6, o.layerDifference ?? 16, o.cornerThreshold ?? 60, o.lengthThreshold ?? 4, o.maxIterations ?? 10,
          o.spliceThreshold ?? 45, o.precision ?? 2);
        const text = dec.decode(new Uint8Array(e.memory.buffer, e.vt_out_ptr(), e.vt_out_len()));
        if (r !== 0) throw new Error(`The picture could not be traced: ${text}`);
        return text;
      } finally { e.vt_free(p, n); }
    },
  };
}
export type Vtracer = ReturnType<typeof bindVtracer>;
