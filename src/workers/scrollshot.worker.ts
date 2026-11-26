// A scrolling screenshot's views joined off the page's main thread (Screenshot tab, to-do #28): the frames of the shared
// screen, window or tab arrive as VideoFrames, are read as RGBA and placed by src/lib/scrollstitch.ts on imgproc.wasm.
// One capture at a time; "finish" hands back the picture in parts (their pixels transferred, not copied).
import { instantiateWasi } from '../wasm/wasi';
import { bindImgproc, type Imgproc } from '../wasm/imgproc';
import wasmUrl from '../wasm/bin/imgproc.wasm?url';
import { stitcher } from '../lib/scrollstitch';

let ip: Promise<Imgproc> | null = null, st: ReturnType<typeof stitcher> | null = null;
let canvas: OffscreenCanvas | null = null, g: OffscreenCanvasRenderingContext2D | null = null;
const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);

self.onmessage = async (ev: MessageEvent<{ id: number; op: 'frame' | 'finish' | 'drop'; frame?: VideoFrame; hint?: number }>) => {
  const { id, op } = ev.data;
  try {
    ip ||= instantiateWasi(wasmUrl).then((x) => bindImgproc(x.exports));
    const p = await ip;
    if (op === 'frame') {
      const f = ev.data.frame!, w = f.displayWidth, h = f.displayHeight;
      try {
        if (!canvas || canvas.width !== w || canvas.height !== h) { canvas = new OffscreenCanvas(w, h); g = canvas.getContext('2d', { willReadFrequently: true }); }
        g!.drawImage(f, 0, 0);
      } finally { f.close(); }
      const px = g!.getImageData(0, 0, w, h).data;
      st ||= stitcher(p);
      const s = st.add(px, w, h, ev.data.hint);
      post({ id, op, step: { kind: s.kind, d: s.d, height: s.height, views: s.views, width: st.width } });
    } else if (op === 'finish') {
      const parts = st ? st.finish() : [];
      st = null;
      post({ id, op, parts: parts.map((x) => ({ data: x.data, width: x.width, height: x.height })) }, parts.map((x) => x.data.buffer));
    } else { st?.drop(); st = null; post({ id, op }); }
  } catch (e: any) {
    try { ev.data.frame?.close(); } catch { /* closed */ }
    post({ id, op, error: e?.message || String(e) });
  }
};
