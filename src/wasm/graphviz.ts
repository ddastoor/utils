// Wrapper for graphviz.wasm (Graphviz 16.1.0 C / C++ + Expat, built by us with one fix — wasm/graphviz). Used inside
// src/workers/graphviz.worker.ts (a layout can take long; the worker can be terminated) and by the unit suite.
export interface GvResult { output: string; messages: string; code: number }
export interface GvRender {
  /** 0 ok, 1 syntax error, 2 layout failed, 3 a format could not be written */
  code: number;
  /** one text per format asked for, in that order ('' where it failed) */
  outputs: string[];
  /** Graphviz's warnings and errors, one per line */
  messages: string;
  nodes: number; edges: number; directed: boolean;
  /** how many graphs the text holds, and which one was drawn (from 0) */
  graphs: number; index: number;
  /** the engine that laid it out: the graph's own `layout` attribute wins over the one asked for, as with dot */
  engine: string;
}
/** What Graphviz knows about the font of a piece of text — the same words its SVG output will carry. */
export interface GvFont { family: string; weight: string; style: string; stretch: string; size: number }
export type GvMeasure = (font: GvFont, text: string) => number;
const enc = new TextEncoder(), dec = new TextDecoder();
export const ENGINES = ['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork'] as const;

/** The import the module needs beside WASI: supertools.text_width. `measure` gives the width of a text in the
 *  units of the font size, or a negative number for "use Graphviz's own font tables" (what happens without one). */
export function graphvizHost(measure?: GvMeasure) {
  let memory: WebAssembly.Memory | null = null;
  const str = (p: number) => { const m = new Uint8Array(memory!.buffer); let e = p; while (m[e]) e++; return dec.decode(m.subarray(p, e)); };
  return {
    imports: { supertools: { text_width: (family: number, weight: number, style: number, stretch: number, size: number, text: number): number => {
      if (!measure || !memory) return -1;
      try { return measure({ family: str(family), weight: str(weight), style: str(style), stretch: str(stretch), size }, str(text)); } catch { return -1; }
    } } },
    attach(exports: any) { memory = exports.memory; },
  };
}
export function bindGraphviz(e: any) {
  const cstr = (s: string) => { const b = enc.encode(s); const p = e.gv_alloc(b.length + 1); const m = new Uint8Array(e.memory.buffer, p, b.length + 1); m.set(b); m[b.length] = 0; return p; };
  const text = (ptr: number, len: number) => dec.decode(new Uint8Array(e.memory.buffer, ptr, len));
  const zstr = (p: number) => { const m = new Uint8Array(e.memory.buffer); let k = p; while (m[k]) k++; return dec.decode(m.subarray(p, k)); };
  const messages = () => text(e.gv_err(), e.gv_err_len()).trim();
  /** Lay out graph number `index` of `src` once and write it in every format of `formats`. */
  function renderAll(src: string, engine = 'dot', formats: string[] = ['svg'], index = 0): GvRender {
    const ps = cstr(src), pe = cstr(engine);
    try {
      const code = e.gv_layout(ps, pe, index);
      const graphs = Math.max(0, e.gv_count(4)), drawn = Math.max(0, e.gv_count(5));
      const used = zstr(e.gv_engine()) || engine;
      if (code) return { code, outputs: formats.map(() => ''), messages: messages(), nodes: 0, edges: 0, directed: false, graphs, index: drawn, engine: used };
      const info = { nodes: e.gv_count(0), edges: e.gv_count(1), directed: e.gv_count(2) === 1 };
      let rc = 0; const outputs: string[] = [];
      for (const f of formats) {
        const pf = cstr(f);
        try { const c = e.gv_format(pf); if (c) rc ||= c; outputs.push(c ? '' : text(e.gv_out(), e.gv_out_len())); } finally { e.gv_free(pf); }
      }
      const msg = messages();
      e.gv_done();
      return { code: rc, outputs, messages: msg, ...info, graphs, index: drawn, engine: used };
    } finally { e.gv_free(ps); e.gv_free(pe); }
  }
  return {
    /** the Graphviz release this module was built from */
    version: (): string => zstr(e.gv_version()),
    renderAll,
    /** One format. code: 0 ok, 1 syntax error, 2 layout failed, 3 render failed. */
    render(src: string, engine = 'dot', format = 'svg'): GvResult { const r = renderAll(src, engine, [format]); return { code: r.code, output: r.outputs[0], messages: r.messages }; },
  };
}
