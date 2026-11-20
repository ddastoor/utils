// Wrapper for markdown.wasm: cmark-gfm 0.29.0.gfm.13 (C, BSD-2) built by us (wasm/markdown). Raw HTML is never
// rendered (cmark's safe mode) and unsafe link schemes are dropped, so the HTML can be shown in the page.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/markdown.wasm?url';
import { lazyEngine } from '../lifecycle';

/** unsafe: raw HTML and every link kept — for the spec tests only; the app never passes it. */
export interface MdOptions { smart?: boolean; hardBreaks?: boolean; footnotes?: boolean; unsafe?: boolean }
export function bindMarkdown(e: any) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  return {
    html(src: string, o: MdOptions = {}): string {
      const b = enc.encode(src), p = e.md_malloc(b.length), lenP = e.md_malloc(4);
      new Uint8Array(e.memory.buffer, p, b.length).set(b);
      const flags = (o.smart ? 1 : 0) | (o.hardBreaks ? 2 : 0) | (o.footnotes !== false ? 4 : 0) | (o.unsafe ? 8 : 0);
      const out = e.md_html(p, b.length, flags, lenP);
      try { return dec.decode(new Uint8Array(e.memory.buffer, out, new Int32Array(e.memory.buffer, lenP, 1)[0])); }
      finally { e.md_free(out); e.md_free(p); e.md_free(lenP); }
    },
    version(): string { const p = e.md_version(), m = new Uint8Array(e.memory.buffer); let n = p; while (m[n]) n++; return dec.decode(m.subarray(p, n)); },
  };
}
export const markdown = lazyEngine('markdown', () => instantiateWasi(wasmUrl).then((x) => bindMarkdown(x.exports)));
