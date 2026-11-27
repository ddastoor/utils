// Wrapper for article.wasm (Rust, built by us — wasm/article): Mozilla Readability's algorithm (the dom_smoothie crate)
// finds the article in a web page and writes it as XHTML for an EPUB; the readers of Chrome's MHTML and Safari's web
// archives. Used by the Articles → Kindle tab (src/lib/articles.ts).
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/article.wasm?url';
import { lazyEngine } from '../lifecycle';

/** What the engine found: the article's metadata, its XHTML (pictures as `<img src="⟦n⟧" …/>`), its text. */
export interface Found {
  title: string; byline: string | null; excerpt: string | null; siteName: string | null; published: string | null; modified: string | null;
  lang: string | null; dir: string | null; image: string | null; url: string | null;
  /** Readability's own guess that the page is an article */
  readable: boolean;
  xhtml: string; text: string; words: number;
  /** each picture's addresses, the best first, with their sizes (srcset's w; x × 1000; 0 = none given) */
  images: Array<{ alt: string; urls: Array<[string, number]> }>;
  dropped: { videos: number; embeds: number; svg: number; forms: number };
}
/** A file of a saved page: its type, character set, address, Content-ID and bytes. */
export interface SavedPart { type: string; charset: string; url: string; cid: string; bytes: Uint8Array }
export interface Unpacked { url: string; subject: string; parts: SavedPart[] }

export class NoArticle extends Error {}

const enc = new TextEncoder(), dec = new TextDecoder();
export function bindArticle(e: any) {
  const put = (b: Uint8Array) => { const p = e.ar_alloc(b.length); new Uint8Array(e.memory.buffer, p, b.length).set(b); return p; };
  const out = () => JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.ar_out_ptr(), e.ar_out_len())));
  const unpack = (fn: 'ar_mhtml' | 'ar_webarchive', bytes: Uint8Array): Unpacked => {
    const p = put(bytes);
    let code: number;
    try { code = e[fn](p, bytes.length); } finally { e.ar_free(p, bytes.length); }
    const r = out();
    if (code) throw new Error(r.error || 'it could not be read');
    // the parts' bytes are copied out of the module's memory, which is then let go
    const blob = new Uint8Array(e.memory.buffer, e.ar_blob_ptr(), e.ar_blob_len());
    const parts: SavedPart[] = r.parts.map((x: any) => ({ type: x.type, charset: x.charset, url: x.url, cid: x.cid, bytes: blob.slice(x.at, x.at + x.len) }));
    e.ar_blob_free();
    return { url: r.url, subject: r.subject, parts };
  };
  return {
    /** The article of a page (`whole`: the page as it is — a pasted selection; `strict`: text hidden by styles left out). */
    read(html: string, url: string, o: { whole?: boolean; strict?: boolean } = {}): Found {
      const h = enc.encode(html), u = enc.encode(url || '');
      const ph = put(h), pu = put(u);
      let code: number;
      try { code = e.ar_read(ph, h.length, pu, u.length, (o.whole ? 1 : 0) | (o.strict ? 2 : 0)); } finally { e.ar_free(ph, h.length); e.ar_free(pu, u.length); }
      const r = out();
      if (code === 1) throw new NoArticle(r.error || 'no article was found');
      if (code) throw new Error(r.error || 'the page could not be read');
      return r;
    },
    mhtml: (bytes: Uint8Array) => unpack('ar_mhtml', bytes),
    webarchive: (bytes: Uint8Array) => unpack('ar_webarchive', bytes),
  };
}
export type ArticleEngine = ReturnType<typeof bindArticle>;
/** The engine, fetched on first use (a download that fails is not remembered: the next call tries again). */
export const articleEngine = lazyEngine('article', () => instantiateWasi(wasmUrl).then((x) => bindArticle(x.exports)));
