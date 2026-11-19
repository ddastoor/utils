// Graphviz in a worker: lays out and renders DOT.
//  - A fresh instance of the module for every drawing (≈ 5 ms): nothing an odd graph leaves behind — or a trap,
//    Graphviz aborts on some fatal errors — can reach the next one. The page compiles the module once and sends it.
//  - Text is measured here with the fonts the browser will draw the SVG with (supertools.text_width → a canvas);
//    Graphviz's built-in tables know the widths of a few Latin fonts only.
import { instantiateWasiModule } from '../wasm/wasi';
import { bindGraphviz, graphvizHost, type GvFont } from '../wasm/graphviz';

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong']);
const STRETCH = new Set(['ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'normal', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded']);
/** The CSS `font` value for what Graphviz writes into the SVG (font-family, -weight, -style, -stretch, -size).
 *  Words CSS does not know ("book", "demi", "narrow") are dropped: the browser ignores them in the SVG too. */
export function cssFont(f: GvFont): string {
  const families = f.family.split(',').map((s) => s.trim().replace(/^(["'])(.*)\1$/, '$2')).filter(Boolean)
    .map((s) => (GENERIC.has(s.toLowerCase()) ? s.toLowerCase() : `"${s.replace(/[\\"]/g, '\\$&')}"`));
  const w = f.weight.toLowerCase(), weight = /^(bold|bolder|lighter|[1-9]00)$/.test(w) ? w : '';
  const s = f.style.toLowerCase(), style = s === 'italic' || s === 'oblique' ? s : '';
  const t = f.stretch.toLowerCase(), stretch = STRETCH.has(t) && t !== 'normal' ? t : '';
  return [style, weight, stretch, `${f.size}px`, families.join(', ') || 'serif'].filter(Boolean).join(' ');
}
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
const reason = (e: any): string => {
  const m = String(e?.message || e);
  if (e instanceof RangeError || /call stack/i.test(m)) return 'the graph nests deeper than the browser\'s call stack allows';
  if (/out of memory|memory access out of bounds|Out of bounds|grow/i.test(m)) return 'it ran out of memory';
  if (/unreachable/i.test(m)) return 'Graphviz gave up inside the layout (an internal check failed or the memory ran out)';
  return m;
};
self.onmessage = async (ev: MessageEvent) => {
  const { id, module, src, engine, formats, index } = ev.data;
  try {
    const host = graphvizHost(measure);
    const inst = await instantiateWasiModule(module, host.imports);
    host.attach(inst.exports);
    const gv = bindGraphviz(inst.exports);
    measured = 0; widths.clear(); lastFont = '';
    const t0 = performance.now();
    const r = gv.renderAll(src, engine, formats, index);
    (self as any).postMessage({ id, result: { ...r, ms: performance.now() - t0, version: gv.version(), measured: measured > 0 } });
  } catch (e: any) {
    (self as any).postMessage({ id, error: `Graphviz could not finish this graph: ${reason(e)}. Try another layout engine or a smaller graph.` });
  }
};
