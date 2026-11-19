// Graphviz in a worker: lays out and renders DOT.
//  - A fresh instance of the module for every drawing (≈ 5 ms): nothing an odd graph leaves behind — or a trap,
//    Graphviz aborts on some fatal errors — can reach the next one. The page compiles the module once and sends it.
//  - Text is measured here with the fonts the browser will draw the SVG with (supertools.text_width → a canvas);
//    Graphviz's built-in tables know the widths of a few Latin fonts only.
import { instantiateWasiModule } from '../wasm/wasi';
import { bindGraphviz, graphvizHost, type GvFont } from '../wasm/graphviz';
import { cssFont, trapReason } from '../lib/graphviz-text';

let ctx: OffscreenCanvasRenderingContext2D | null | undefined;
let lastFont = '', measured = 0;
const widths = new Map<string, number>();
function measure(f: GvFont, text: string): number {
  if (ctx === undefined) { try { ctx = new OffscreenCanvas(8, 8).getContext('2d'); } catch { ctx = null; } }
  if (!ctx || !(f.size > 0) || !Number.isFinite(f.size)) return -1;      // Graphviz's own tables
  const font = cssFont(f), key = `${font}\n${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    if (font !== lastFont) { ctx.font = font; lastFont = font; }
    w = ctx.measureText(text).width;
    if (!Number.isFinite(w)) return -1;
    if (widths.size > 200_000) widths.clear();
    widths.set(key, w);
  }
  measured++;
  return w;
}
self.onmessage = async (ev: MessageEvent) => {
  const { id, module, src, engine, formats, index } = ev.data;
  let stderr = '';
  try {
    const host = graphvizHost(measure);
    const inst = await instantiateWasiModule(module, host.imports, (text) => { if (stderr.length < 20000) stderr += text; });
    host.attach(inst.exports);
    const gv = bindGraphviz(inst.exports);
    measured = 0; widths.clear(); lastFont = '';
    const t0 = performance.now();
    const r = gv.renderAll(src, engine, formats, index);
    (self as any).postMessage({ id, result: { ...r, ms: performance.now() - t0, version: gv.version(), measured: measured > 0 } });
  } catch (e: any) {
    (self as any).postMessage({ id, error: `Graphviz could not finish this graph: ${trapReason(String(e?.message || e), stderr)}. Try another layout engine or other attributes.` });
  }
};
