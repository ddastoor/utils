// PDF → EPUB for Kindle (Paperwhite / Scribe). MuPDF (official wasm) gives the text of each page — spans with their
// fonts — and its images; reading order and columns come from an XY-cut in textcore.wasm (own C); figures (raster and
// vector) are found as ink outside the text in imgproc.wasm (own C) and drawn by MuPDF at the size the e-reader needs.
// One XHTML file per PDF page keeps the page breaks; columns are labelled "Page N · Column K". EPUB 3 with a nav
// document (the PDF's bookmarks when it has them, else a list of the pages; and a page list) and an NCX for older readers.
import { zipSync, strToU8 } from 'fflate';
import { mupdf } from './pdf';
import { textcore } from '../wasm/textcore';
import { imgprocDirect, type Img } from '../wasm/imgproc';

export interface EpubOptions {
  mode: 'reflow' | 'columns'; width: number; grey: boolean; removeHeaders: boolean; labels: boolean;
  pages?: number[]; title?: string; author?: string;
  /** Asked between pages: false ends the conversion with `Stopped` (a newer PDF was chosen, the tab was left). */
  alive?: () => boolean;
}
export interface PageReport { page: number; columns: number; figures: number; how: 'text' | 'columns' | 'image'; note?: string }
/** What the conversion runs on: the app's engines by default; the unit suite brings its own. */
export interface EpubEngines {
  m: any;
  tc: { xycut(boxes: number[][], gx?: number, gy?: number, minh?: number): { order: number[]; col: number[] } };
  ip: {
    grayscale(i: Img): Img; expand(s: Uint8Array | Uint8ClampedArray, w: number, h: number, comps: number): Img;
    inkRegions(i: Img, skip: Array<[number, number, number, number]>, o?: { thr?: number; dil?: number; minArea?: number; max?: number }): Array<{ x: number; y: number; w: number; h: number }>;
  };
  /** RGBA → JPEG bytes (greyscale JPEG when `grey`). */
  jpeg(img: Img, grey: boolean): Promise<Uint8Array>;
}
/** The conversion ended because `alive()` said so. */
export class Stopped extends Error { constructor() { super('The conversion was stopped.'); this.name = 'Stopped'; } }

type Line = { x0: number; y0: number; x1: number; y1: number; size: number; bold: boolean; italic: boolean; text: string };
type Fig = { x0: number; y0: number; x1: number; y1: number };
type Item = { kind: 'line'; l: Line } | { kind: 'fig'; f: Fig };
type Phase = 'read' | 'pages';

export const DEVICES = { paperwhite: 1236, scribe: 1860 } as const;
/** Characters XML 1.0 does not allow (C0 controls but tab and line ends, lone surrogates, U+FFFE / U+FFFF) and the C1
 *  controls: a PDF's text can hold them (a broken ToUnicode map), and one of them makes the whole page unreadable. */
const NOT_XML = /[^\t\n\r\u0020-\u007E\u00A0-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
export const xmlText = (s: string) => s.replace(NOT_XML, '');
const esc = (s: string) => xmlText(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const median = (a: number[]) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
/** A line whose text cannot be read: more than a tenth of it is U+FFFD, private-use or control characters (a font
 *  without a Unicode map — often the symbols of a formula). */
const garbled = (t: string) => { const bad = (t.match(/[\uFFFD\uE000-\uF8FF\u0000-\u0008]/g) || []).length; return bad > 0 && bad / t.length > 0.1; };
/** A page number on its own: 12, "Page 12", "12 of 30", "– 12 –", or a Roman numeral (xiv — not "ill" or "civil"). */
export const pageNumberLike = /^\s*[-–—]?\s*(?:page\s*)?(?:\d{1,6}|(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))(?:\s*(?:of|\/)\s*\d+)?\s*[-–—]?\s*$/i;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** The PDF's language (/Lang of its catalogue) when it is a language tag, else English. */
export function pdfLang(doc: any): string {
  try {
    const v = doc.getTrailer().get('Root').get('Lang'), s = v?.isString?.() ? String(v.asString()).trim() : '';
    return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(s) ? s : 'en';
  } catch { return 'en'; }
}

/** The lines of a page: MuPDF's spans (each in one font) joined into lines, with the size and weight most of the
 *  line's characters have — a line that starts with a bold word ("Theorem 1.") is not a bold line. Lines that run up
 *  or down the page (a stamp in the margin: arXiv's, the Federal Register's) are kept apart. */
export function readPage(page: any, W: number, H: number): { lines: Line[]; vertical: Line[]; images: Fig[] } {
  const j = JSON.parse(page.toStructuredText('preserve-images,preserve-whitespace,preserve-spans').asJSON());
  const lines: Line[] = [], vertical: Line[] = [], images: Fig[] = [];
  type Acc = Line & { sizes: Map<number, number>; boldN: number; italicN: number; n: number };
  for (const b of j.blocks || []) {
    if (b.type === 'image') { images.push({ x0: b.bbox.x, y0: b.bbox.y, x1: b.bbox.x + b.bbox.w, y1: b.bbox.y + b.bbox.h }); continue; }
    let cur: Acc | null = null;
    const close = () => {
      if (!cur) return;
      const c = cur; cur = null;
      const text = c.text.replace(/\s+/g, ' ').trim();
      if (!text || c.x1 < 0 || c.x0 > W || c.y1 < 0 || c.y0 > H) return;            // nothing, or off the page
      let size = c.size, most = -1; for (const [s, k] of c.sizes) if (k > most || (k === most && s > size)) { most = k; size = s; }
      const l: Line = { x0: Math.max(0, c.x0), y0: Math.max(0, c.y0), x1: Math.min(W, c.x1), y1: Math.min(H, c.y1), size, bold: c.boldN >= 0.85 * c.n, italic: c.italicN >= 0.85 * c.n, text };
      const h = l.y1 - l.y0;
      (h > 2.5 * size && h > 3 * (l.x1 - l.x0) ? vertical : lines).push(l);
    };
    for (const s of b.lines || []) {
      const raw = String(s.text || ''); if (!raw.trim()) continue;
      const sp = { x0: s.bbox.x, y0: s.bbox.y, x1: s.bbox.x + s.bbox.w, y1: s.bbox.y + s.bbox.h, size: s.font?.size || 10, bold: s.font?.weight === 'bold', italic: s.font?.style === 'italic' };
      const n = raw.replace(/\s/g, '').length;
      const c: Acc | null = cur;
      // the next span of the same line: on the same baseline, after the last one, not far off (MuPDF also breaks a
      // justified line at wide word gaps)
      const same = !!c && Math.min(c.y1, sp.y1) - Math.max(c.y0, sp.y0) > 0.6 * Math.min(c.y1 - c.y0, sp.y1 - sp.y0) && sp.x0 > c.x1 - 0.3 * sp.size && sp.x0 - c.x1 < sp.size * 3;
      if (c && same) {
        // a space where the PDF leaves a gap and gives none (a new span right after a word: "x²", "Abstract." + text)
        if (!/\s$/.test(c.text) && !/^\s/.test(raw) && sp.x0 - c.x1 > 0.15 * sp.size) c.text += ' ';
        c.text += raw; c.x1 = Math.max(c.x1, sp.x1); c.y0 = Math.min(c.y0, sp.y0); c.y1 = Math.max(c.y1, sp.y1);
      } else { close(); cur = { ...sp, text: raw, sizes: new Map(), boldN: 0, italicN: 0, n: 0 }; }
      const a = cur!;
      a.sizes.set(sp.size, (a.sizes.get(sp.size) || 0) + n); a.n += n;
      if (sp.bold) a.boldN += n; if (sp.italic) a.italicN += n;
    }
    close();
  }
  return { lines, vertical, images };
}

/** Running headers / footers: lines near the top or bottom that repeat (digits ignored) on many pages, and bare page numbers. */
function headerKeys(pages: Array<{ lines: Line[]; H: number }>) {
  const count = new Map<string, number>();
  // letters only, first 12: page numbers and OCR slips at the end ("VICKSBUEG") still match
  const key = (l: Line) => l.text.toLowerCase().replace(/[^\p{L}]+/gu, '').slice(0, 12) || l.text.replace(/\s+/g, '');
  for (const p of pages) {
    const seen = new Set<string>();
    for (const l of p.lines) if (l.y1 < p.H * 0.1 || l.y0 > p.H * 0.9) seen.add(key(l));
    for (const k of seen) count.set(k, (count.get(k) || 0) + 1);
  }
  const min = Math.max(2, Math.ceil(pages.length * 0.4));
  return (l: Line, H: number) => (l.y1 < H * 0.1 || l.y0 > H * 0.9) && (pageNumberLike.test(l.text) || (count.get(key(l)) || 0) >= min);
}

/** Paragraphs and headings from the lines of one column, in order. */
function toHtml(lines: Line[], body: number, pagePitch: number): string {
  const out: string[] = [];
  // line pitch (top to top) is steadier than the gaps between line boxes
  const pitch = pagePitch || body * 1.2, width = Math.max(...lines.map((l) => l.x1)) - Math.min(...lines.map((l) => l.x0));
  let para = '', kind: 'p' | 'h' = 'p', prev: Line | null = null, hsize = 0;
  const flush = () => { if (para.trim()) out.push(kind === 'h' ? `<h${hsize >= body * 1.6 ? 2 : 3}>${esc(para.trim())}</h${hsize >= body * 1.6 ? 2 : 3}>` : `<p>${esc(para.trim())}</p>`); para = ''; };
  const head = lines.map((l) => l.size >= body * 1.18 || (l.bold && l.text.length < 80 && !/[.,;:]$/.test(l.text) && /^[\p{Lu}\d]/u.test(l.text)));
  // more than three such lines of one size in a row are text set larger than most of the page (a page that is mostly
  // footnotes), not a heading
  for (let i = 0; i < lines.length;) {
    if (!head[i]) { i++; continue; }
    let j = i; while (j < lines.length && head[j] && Math.abs(lines[j].size - lines[i].size) <= 0.5) j++;
    if (j - i > 3) for (let k = i; k < j; k++) head[k] = false;
    i = j;
  }
  for (const [li, l] of lines.entries()) {
    const isHead = head[li];
    const newBlock = !prev || isHead !== (kind === 'h') || (isHead && Math.abs(l.size - hsize) > 0.5) || (Math.abs(l.size - prev.size) > 0.8 && /[.!?:"”)]$/.test(prev.text)) // caption → text (OCR layers vary the size line by line, so only after a sentence end)
      || l.y0 - prev.y0 > pitch * 1.35 + 0.5                                                                    // blank space
      || (!isHead && /[.!?:"”)]$/.test(prev.text) && (l.x0 > prev.x0 + body * 0.8 || prev.x1 < prev.x0 + width * 0.8)); // indent / short last line
    if (newBlock) { flush(); kind = isHead ? 'h' : 'p'; hsize = l.size; para = l.text; }
    else if (/\p{L}{2,}[-\u00ad]$/u.test(para) && /^\p{Ll}/u.test(l.text)) para = para.replace(/[-\u00ad]$/, '') + l.text; // de-hyphenate ("experi-ment")
    else if (/[-\u00ad]$/.test(para)) para += l.text; // "e-reader": a one-letter prefix keeps its hyphen
    else para += ' ' + l.text;
    prev = l;
  }
  flush();
  return out.join('\n');
}

/** Boxes that touch or overlap (within `pad`) become one, until no two touch. */
function mergeBoxes(boxes: Fig[], pad = 4): Fig[] {
  const out = boxes.map((b) => ({ ...b }));
  for (let again = true; again;) {
    again = false;
    for (let a = 0; a < out.length && !again; a++) for (let b = a + 1; b < out.length; b++) {
      const p = out[a], q = out[b];
      if (q.x0 < p.x1 + pad && q.x1 > p.x0 - pad && q.y0 < p.y1 + pad && q.y1 > p.y0 - pad) {
        p.x0 = Math.min(p.x0, q.x0); p.y0 = Math.min(p.y0, q.y0); p.x1 = Math.max(p.x1, q.x1); p.y1 = Math.max(p.y1, q.y1);
        out.splice(b, 1); again = true; break;
      }
    }
  }
  return out;
}

type TocItem = { label: string; file: string; kids: TocItem[] };
/** The PDF's bookmarks pointing at the converted pages (a bookmark of a page left out goes to the next page that is in). */
function outlineToc(doc: any, fileOf: (page: number) => string | null): TocItem[] {
  let items: any[] | null = null;
  try { items = doc.loadOutline(); } catch { return []; }
  const walk = (list: any[] | undefined, depth: number): TocItem[] => {
    const out: TocItem[] = [];
    for (const o of list || []) {
      const kids = depth < 6 ? walk(o.down, depth + 1) : [];
      const label = esc(String(o.title || '').replace(/\s+/g, ' ').trim());
      const file = typeof o.page === 'number' && o.page >= 0 ? fileOf(o.page) : null;
      if (label && file) out.push({ label, file, kids });
      else out.push(...kids);                                   // an entry without a page here: its children move up
    }
    return out;
  };
  return walk(items || [], 0);
}

async function appEngines(): Promise<EpubEngines> {
  const [m, tc, ip, { encodeImg }] = await Promise.all([mupdf(), textcore(), imgprocDirect(), import('./imgio')]);
  return { m, tc, ip, jpeg: async (img, grey) => new Uint8Array(await (await encodeImg(img, 'jpeg', 80, grey ? { color_space: 1 } : {})).arrayBuffer()) };
}

/** Pictures larger than this many pixels (or 16,384 a side) are drawn smaller: they are for an e-reader's screen. */
const MAX_PIXELS = 32e6;

export async function pdfToEpub(doc: any, o: EpubOptions, onProgress?: (done: number, of: number, phase: Phase) => void, engines?: EpubEngines): Promise<{ epub: Uint8Array; report: PageReport[] }> {
  const { m, tc, ip, jpeg } = engines || await appEngines();
  const alive = () => { if (o.alive && !o.alive()) throw new Stopped(); };
  let lastYield = performance.now();
  const pause = async () => { if (performance.now() - lastYield > 30) { await tick(); lastYield = performance.now(); } alive(); };
  const n = doc.countPages(), list = (o.pages?.length ? o.pages : Array.from({ length: n }, (_, i) => i)).filter((i) => i >= 0 && i < n);
  if (!list.length) throw new Error(n ? 'None of the chosen pages is in this PDF.' : 'This PDF has no pages.');
  const lang = pdfLang(doc);
  // pass 1: text of every chosen page (needed to spot running headers)
  const pages: Array<{ i: number; p: any; W: number; H: number; lines: Line[]; vertical: Line[]; images: Fig[] }> = [];
  for (const [k, i] of list.entries()) {
    if (k % 10 === 0) onProgress?.(k, list.length, 'read');
    const p = doc.loadPage(i), [x0, y0, x1, y1] = p.getBounds(), W = x1 - x0, H = y1 - y0;
    pages.push({ i, p, W, H, ...readPage(p, W, H) });
    await pause();
  }
  const isHeader = o.removeHeaders ? headerKeys(pages) : () => false;
  const files: Record<string, any> = {}, report: PageReport[] = [], manifest: string[] = [], spine: string[] = [], toc: TocItem[] = [], fileOfPage = new Map<number, string>();
  let imgNo = 0;
  const addImage = async (img: Img) => {
    const bytes = await jpeg(o.grey ? ip.grayscale(img) : img, o.grey);
    alive();
    const name = `images/i${String(++imgNo).padStart(4, '0')}.jpg`;
    files[`OEBPS/${name}`] = [bytes, { level: 0 }]; manifest.push(`<item id="img${imgNo}" href="${name}" media-type="image/jpeg"/>`);
    return `<img src="${name}" alt=""/>`;
  };
  for (const [k, pg] of pages.entries()) {
    onProgress?.(k, pages.length, 'pages');
    const lines = pg.lines.filter((l) => !isHeader(l, pg.H)), dl = pg.p.toDisplayList();
    // MuPDF draws a part of the page (in points) at `sc` pixels per point, within MAX_PIXELS
    const draw = (r: Fig, sc: number): Img => {
      const w = Math.max(1, r.x1 - r.x0), h = Math.max(1, r.y1 - r.y0);
      sc = Math.min(sc, 16384 / w, 16384 / h, Math.sqrt(MAX_PIXELS / (w * h)));
      const x0 = Math.floor(r.x0 * sc), y0 = Math.floor(r.y0 * sc), box = [x0, y0, x0 + Math.max(1, Math.round(w * sc)), y0 + Math.max(1, Math.round(h * sc))];
      const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, box, false);
      try {
        pix.clear(255);
        const dev = new m.DrawDevice(m.Matrix.identity, pix);
        try { dl.run(dev, m.Matrix.scale(sc, sc)); dev.close(); } finally { dev.destroy?.(); }
        return ip.expand(pix.getPixels(), pix.getWidth(), pix.getHeight(), pix.getNumberOfComponents());
      } finally { pix.destroy?.(); }
    };
    const pageNo = pg.i + 1, file = `p${String(pageNo).padStart(4, '0')}.xhtml`, page = { x0: 0, y0: 0, x1: pg.W, y1: pg.H };
    let html = '', rep: PageReport;
    const coverage = pg.images.reduce((a, b) => Math.max(a, ((b.x1 - b.x0) * (b.y1 - b.y0)) / (pg.W * pg.H)), 0);
    const vText = pg.vertical.reduce((a, l) => a + l.text.length, 0), hText = lines.reduce((a, l) => a + l.text.length, 0);
    if (vText > hText) {
      // most of the text runs up or down the page (a table turned on its side): the page as a picture
      html = `<div class="fig full">${await addImage(draw(page, o.width / pg.W))}</div>`;
      rep = { page: pageNo, columns: 0, figures: 0, how: 'image', note: 'text turned sideways' };
    } else if (lines.length < 2 && (coverage > 0.5 || !lines.length)) {
      // scanned page without a text layer, or an empty page: the page as a picture
      html = `<div class="fig full">${await addImage(draw(page, o.width / pg.W))}</div>`;
      rep = { page: pageNo, columns: 0, figures: 0, how: 'image', note: lines.length ? undefined : 'no text layer' };
    } else {
      // figures: raster images (except a full-page scan under an OCR text layer) + vector drawings found as ink outside the text
      const s2 = 1.5, small = draw(page, s2), sx = small.width / pg.W, sy = small.height / pg.H;
      // every line's ink is text — also of the running headers left out (or their ink would come back as a "figure")
      const skip = [...pg.lines, ...pg.vertical].map((l) => [l.x0 * sx - 2, l.y0 * sy - 2, (l.x1 - l.x0) * sx + 4, (l.y1 - l.y0) * sy + 4] as [number, number, number, number]);
      const ink = ip.inkRegions(small, skip, { thr: 215, dil: 7, minArea: Math.round(36 * 36 * sx * sy) }).map((r) => ({ x0: r.x / sx, y0: r.y / sy, x1: (r.x + r.w) / sx, y1: (r.y + r.h) / sy }));
      const figs = mergeBoxes([...pg.images.filter((b) => ((b.x1 - b.x0) * (b.y1 - b.y0)) / (pg.W * pg.H) < 0.7), ...ink].filter((f) => f.x1 - f.x0 >= 24 && f.y1 - f.y0 >= 18));
      // lines inside a figure (labels in a diagram) belong to the figure
      const textLines = lines.filter((l) => !figs.some((f) => l.x0 >= f.x0 - 1 && l.x1 <= f.x1 + 1 && l.y0 >= f.y0 - 1 && l.y1 <= f.y1 + 1));
      // the body text's size: the size most characters of the page have
      const bySize = new Map<number, number>(); for (const l of textLines) { const k = Math.round(l.size * 2) / 2; bySize.set(k, (bySize.get(k) || 0) + l.text.length); }
      const body = [...bySize].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 10;
      const items: Item[] = [...textLines.map((l) => ({ kind: 'line' as const, l })), ...figs.map((f) => ({ kind: 'fig' as const, f }))];
      // gutters from 0.45 × the body text (the Federal Register's are 7.5 pt); a column holds three lines and is a tenth
      // of the page high (a note in the margin is none)
      const r = tc.xycut(items.map((it) => (it.kind === 'line' ? [it.l.x0, it.l.y0, it.l.x1, it.l.y1] : [it.f.x0, it.f.y0, it.f.x1, it.f.y1])), Math.max(3, 0.45 * body), 2, pg.H * 0.1);
      // the page's usual line pitch (top to top, same column) decides what counts as a blank line
      const sorted = [...textLines].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0), pagePitch = median(sorted.slice(1).map((l, i) => l.y0 - sorted[i].y0).filter((g, i) => g > 0 && g < 40 && Math.abs(sorted[i + 1].x0 - sorted[i].x0) < 30));
      // segments: runs of the same column
      const segs: Array<{ col: number; items: Item[] }> = [];
      r.order.forEach((ix, p) => { const c = r.col[p]; if (!segs.length || segs[segs.length - 1].col !== c) segs.push({ col: c, items: [] }); segs[segs.length - 1].items.push(items[ix]); });
      const columns = new Set(r.col.filter((c) => c > 0)).size;
      const wOf = (its: Item[]) => { const b = its.map((it) => (it.kind === 'line' ? it.l : it.f)); return Math.max(...b.map((x) => x.x1)) - Math.min(...b.map((x) => x.x0)); };
      const colW = Math.min(...segs.filter((sg) => sg.col > 0 || columns < 2).map((sg) => wOf(sg.items)).filter((w) => w > 40), pg.W);
      // figures and column pictures are drawn so that a column is as wide as the e-reader's screen
      const scale = Math.min(o.width / colW, (3 * o.width) / pg.W);
      // (a figure wider than a column — across the page — is drawn as wide as the screen, not wider)
      const crop = (f: Fig) => { const b = { x0: Math.max(0, f.x0), y0: Math.max(0, f.y0), x1: Math.min(pg.W, f.x1), y1: Math.min(pg.H, f.y1) }; return draw(b, Math.min(scale, o.width / Math.max(1, b.x1 - b.x0))); };
      const parts: string[] = [];
      for (const s of segs) {
        if (columns > 1 && s.col > 0 && o.labels) parts.push(`<h4 class="col">Page ${pageNo} · Column ${s.col}</h4>`);
        const segLines = s.items.filter((it) => it.kind === 'line').map((it) => (it as any).l as Line);
        const chars = (ls: Line[]) => ls.reduce((a, l) => a + l.text.length, 0);
        if (o.mode === 'columns' || chars(segLines.filter((l) => garbled(l.text))) > 0.5 * chars(segLines)) {
          // the column as one picture (chosen, or most of its text cannot be read)
          const b = s.items.map((it) => (it.kind === 'line' ? it.l : it.f));
          parts.push(`<div class="fig">${await addImage(crop({ x0: Math.min(...b.map((x) => x.x0)) - 2, y0: Math.min(...b.map((x) => x.y0)) - 2, x1: Math.max(...b.map((x) => x.x1)) + 2, y1: Math.max(...b.map((x) => x.y1)) + 2 }))}</div>`);
          continue;
        }
        // text as text; a figure as a picture; lines that cannot be read (a formula in a font without a Unicode map)
        // as a picture of those lines, in their place
        let run: Line[] = [];
        const unread: { box: Fig | null } = { box: null };
        const emit = async () => {
          if (run.length) parts.push(toHtml(run, body, pagePitch)); run = [];
          const u = unread.box; unread.box = null;
          if (u) parts.push(`<div class="fig">${await addImage(crop({ x0: u.x0 - 2, y0: u.y0 - 3, x1: u.x1 + 2, y1: u.y1 + 3 }))}</div>`);
        };
        for (const it of s.items) {
          if (it.kind === 'line' && garbled(it.l.text)) {
            if (run.length) await emit();
            const l = it.l, u = unread.box;
            unread.box = u ? { x0: Math.min(u.x0, l.x0), y0: Math.min(u.y0, l.y0), x1: Math.max(u.x1, l.x1), y1: Math.max(u.y1, l.y1) } : { x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 };
          } else if (it.kind === 'line') { if (unread.box) await emit(); run.push(it.l); }
          else { await emit(); parts.push(`<div class="fig">${await addImage(crop({ x0: it.f.x0 - 3, y0: it.f.y0 - 3, x1: it.f.x1 + 3, y1: it.f.y1 + 3 }))}</div>`); }
        }
        await emit();
      }
      // text in the margin that runs up or down the page (kept only when running headers are kept)
      if (!o.removeHeaders && pg.vertical.length) parts.push(...pg.vertical.map((l) => `<p class="margin">${esc(l.text)}</p>`));
      html = parts.join('\n');
      rep = { page: pageNo, columns: columns > 1 ? columns : 0, figures: figs.length, how: o.mode === 'columns' ? 'columns' : 'text' };
    }
    dl.destroy?.();
    report.push(rep);
    const firstHeading = /<h[23]>([^<]{1,80})<\/h[23]>/.exec(html)?.[1];
    files[`OEBPS/${file}`] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><meta charset="utf-8"/><title>Page ${pageNo}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body><section class="page" id="page${pageNo}" epub:type="chapter"><p class="pgno">Page ${pageNo}</p>\n${html}\n</section></body></html>\n`);
    manifest.push(`<item id="pg${pageNo}" href="${file}" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="pg${pageNo}"/>`);
    toc.push({ file, label: `Page ${pageNo}${firstHeading ? ` — ${firstHeading}` : ''}`, kids: [] });
    fileOfPage.set(pg.i, file);
    await pause();
  }
  onProgress?.(pages.length, pages.length, 'pages');
  // the PDF's bookmarks are the contents when they point at converted pages (a bookmark of a page left out → the next one)
  const chosen = [...fileOfPage.keys()].sort((a, b) => a - b);
  const fileOf = (p: number) => { const at = chosen.find((c) => c >= p); return at === undefined ? null : fileOfPage.get(at)!; };
  const marks = outlineToc(doc, fileOf), contents = marks.length ? marks : toc;
  const title = esc(o.title || 'Document') || 'Document', author = esc(o.author || ''), id = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const ol = (items: TocItem[]): string => `<ol>${items.map((t) => `<li><a href="${t.file}">${t.label}</a>${t.kids.length ? ol(t.kids) : ''}</li>`).join('')}</ol>`;
  // NCX: every navPoint has its own id; navPoints that lead to the same file share its play order (the NCX rule)
  let ids = 0;
  const plays = new Map<string, number>(), play = (f: string) => { if (!plays.has(f)) plays.set(f, plays.size + 1); return plays.get(f)!; };
  const navPoints = (items: TocItem[]): string => items.map((t) => { const k = ++ids; return `<navPoint id="n${k}" playOrder="${play(t.file)}"><navLabel><text>${t.label}</text></navLabel><content src="${t.file}"/>${navPoints(t.kids)}</navPoint>`; }).join('');
  const pageList = `<nav epub:type="page-list" hidden=""><ol>${report.map((r) => `<li><a href="p${String(r.page).padStart(4, '0')}.xhtml#page${r.page}">${r.page}</a></li>`).join('')}</ol></nav>`;
  files['OEBPS/style.css'] = strToU8(`body { margin: 0 3%; line-height: 1.45; } p { margin: 0 0 0.6em; text-indent: 0; text-align: left; } h2, h3 { margin: 1em 0 0.4em; line-height: 1.25; }
.pgno { font-size: 0.75em; color: #666; margin: 0 0 0.8em; border-bottom: 1px solid #bbb; } .page { page-break-before: always; }
h4.col { font-size: 0.8em; color: #555; font-weight: bold; margin: 1em 0 0.4em; text-transform: none; } p.margin { font-size: 0.75em; color: #555; }
.fig { text-align: center; margin: 0.6em 0; } .fig img { max-width: 100%; height: auto; } .full img { width: 100%; }\n`);
  files['OEBPS/nav.xhtml'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><meta charset="utf-8"/><title>${title}</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1>${ol(contents)}</nav>${pageList}</body></html>\n`);
  files['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${title}</text></docTitle><navMap>${navPoints(contents)}</navMap></ncx>\n`);
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${title}</dc:title>${author ? `<dc:creator>${author}</dc:creator>` : ''}<dc:language>${lang}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>${manifest.join('')}</manifest>
<spine toc="ncx">${spine.join('')}</spine></package>\n`);
  const epub = zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n'),
    ...files,
  });
  return { epub, report };
}
