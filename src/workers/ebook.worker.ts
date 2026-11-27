// The EPUB Reader's worker: MuPDF (Artifex's official WebAssembly build, the one every PDF tab uses) opens the book, lays
// it out and draws its pages here, so turning a page or laying out a long book never holds up the page. One book at a
// time; the worker — and the book's memory with it — ends when the tab is left (src/lib/ebook-client.ts). The engine:
// src/lib/ebook.ts. Literata and Noto Sans (TTF, on the site) are fetched the first time the look asks for them.
import {
  openFile, openDoc, layOut, info, metaOf, contents, drawPage, pageSize, pageText, anchorOf, findAnchor, searchPage, linksOf,
  selectText, wordAt, fontHook, Refused, NeedsUnpacking, type Opened, type Look, type FontFiles,
} from '../lib/ebook';

const post = (m: unknown, transfer: Transferable[] = []) => (self as any).postMessage(m, transfer);
const files: FontFiles = {}, missing = new Set<string>();
// MuPDF is imported here, not at the top: its module waits for its WebAssembly (a top-level await), and a message that
// reaches a module worker while it waits finds no handler and is lost — the first book never opened
let mupdf: typeof import('mupdf');
const ready = import('mupdf').then((m) => {
  mupdf = m;
  m.setLog({ warning: () => {}, error: () => {} });   // MuPDF's own notes ("unknown epub version: 3.0") stay out of the console
  m.installLoadFontFunction(fontHook(m, files, missing));
});

let doc: any = null, opened: Opened | null = null, name = '', base = '';
const stopped = new Set<number>();

const FONT_FILES = {
  literata: ['Literata_400Regular', 'Literata_400Regular_Italic', 'Literata_700Bold', 'Literata_700Bold_Italic'],
  noto: ['NotoSans_400Regular', 'NotoSans_700Bold', 'NotoSans_400Regular_Italic'],
} as const;
const fonts = new Map<string, Promise<void>>();
/** The TTFs the look needs, fetched once (a failure is forgotten, so the next layout tries again). */
function needFonts(look: Look): Promise<void> {
  const key = look.font === 'literata' ? 'literata' : look.font === 'sans' ? 'noto' : '';
  if (!key) return Promise.resolve();
  let p = fonts.get(key);
  if (!p) {
    p = Promise.all(FONT_FILES[key].map(async (f) => {
      const r = await fetch(new URL(`vendor/fonts/${f}.ttf`, base).href);
      if (!r.ok) throw new Error(`the font ${f} could not be fetched (HTTP ${r.status})`);
      return new Uint8Array(await r.arrayBuffer());
    })).then((b) => { files[key] = b; }).catch((e) => { fonts.delete(key); throw e; });
    fonts.set(key, p);
  }
  return p;
}

const pages = () => doc.countPages();
const missingNow = () => [...missing].sort();

async function handle(m: any): Promise<unknown> {
  await ready;
  switch (m.op) {
    case 'open': {
      base = m.base; name = m.name;
      doc = null; opened = null; missing.clear();
      try { opened = openFile(m.bytes, m.name); }
      catch (e) {
        if (e instanceof Refused) return { refused: e.message };
        if (e instanceof NeedsUnpacking) return { unpack: e.format };
        throw e;
      }
      await needFonts(m.look);
      try { doc = openDoc(mupdf, opened); } catch (e: any) { opened = null; return { refused: `${m.name} could not be opened as ${/epub/i.test(m.name) ? 'an EPUB' : 'a book'}: ${String(e?.message || e).replace(/^.*?: /, '')}.` }; }
      const meta = metaOf(doc);   // before the book is styled: see metaOf
      layOut(doc, opened.kind, m.look, m.w, m.h);
      return { info: info(doc, opened, name, meta), note: opened.note || '', missing: missingNow() };
    }
    case 'layout': {
      if (!doc || !opened) throw new Error('No book is open.');
      await needFonts(m.look);
      const before = m.anchor as string, share = m.share as number;
      layOut(doc, opened.kind, m.look, m.w, m.h);
      const n = pages();
      const page = findAnchor(doc, before, Math.round(share * n));
      return { pages: n, contents: contents(doc), page, missing: missingNow() };
    }
    case 'draw': {
      const r = drawPage(mupdf, doc, m.i, m.scale, m.bg);
      return { result: r, transfer: [r.rgba.buffer] };
    }
    case 'size': return pageSize(doc, m.i);
    case 'anchor': return anchorOf(doc, m.i);
    case 'text': {
      // the text from page `from` on, up to `max` characters (Read aloud)
      let out = '';
      for (let i = m.from; i < pages() && out.length < m.max; i++) out += pageText(doc, i) + '\n';
      return out.slice(0, m.max);
    }
    case 'pagetext': return pageText(doc, m.i);
    case 'links': return linksOf(doc, m.i);
    case 'select': return selectText(doc, m.i, m.a, m.b);
    case 'word': return wordAt(doc, m.i, m.at);
    case 'search': {
      // page by page from `from`, round to the page before it; hits sent as they are found; a pause every 30 ms so a stop
      // (or a page turn) is heard
      const n = pages(), q = String(m.query);
      let found = 0, t0 = performance.now();
      for (let k = 0; k < n; k++) {
        if (stopped.has(m.id)) { stopped.delete(m.id); return { stopped: true, found }; }
        const i = (m.from + k) % n, hits = searchPage(doc, i, q);
        if (hits.length) { found += hits.length; post({ id: m.id, type: 'hits', hits }); }
        if (found >= 1000) return { found, capped: true };
        if (performance.now() - t0 > 30) { post({ id: m.id, type: 'progress', done: k + 1, total: n }); await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
      }
      return { found };
    }
    default: throw new Error(`unknown request ${m.op}`);
  }
}

const reply = async (m: any) => {
  try {
    const r: any = await handle(m);
    if (r && r.transfer) post({ id: m.id, type: 'done', result: r.result }, r.transfer);
    else post({ id: m.id, type: 'done', result: r });
  } catch (e: any) {
    post({ id: m.id, type: 'error', message: String(e?.message || e) });
  }
};
let chain: Promise<unknown> = Promise.resolve();
self.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  if (m.op === 'stop') { stopped.add(m.target); return; }
  // a search runs beside the other requests: it pauses every 30 ms, and a page to draw is drawn in such a pause (the
  // page stops a search before it lays the book out again); everything else one at a time, in order
  if (m.op === 'search') { void reply(m); return; }
  chain = chain.then(() => reply(m));
};
