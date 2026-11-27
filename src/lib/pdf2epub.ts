// PDF → EPUB for Kindle (Paperwhite / Scribe). MuPDF (official wasm) gives the text of each page — spans with their
// fonts —, its images and, through a device of our own, its ruled lines; reading order, columns and the page's parts
// come from an XY-cut in textcore.wasm (own C); figures (raster and vector) are found as ink outside the text in
// imgproc.wasm (own C) and drawn by MuPDF at the size the e-reader needs.
// The owner's rule (21 Nov 2026): what stands side by side in a PDF page — columns, a figure beside text, blocks left and
// right — is laid out one after another, top to bottom, spaced apart, each piece under a marker of our own: "Page 1,
// part 1", "Page 1, part 2" … (never words of the PDF). One XHTML file per PDF page keeps the page breaks. Tables and
// display equations are pictures, exactly as printed (an equation's number stays text beside it); a formula inside a
// sentence whose font gives no text is a small picture in the line; raised and lowered marks are <sup> / <sub>.
// EPUB 3 with a nav document (the PDF's bookmarks when it has them, else a list of the pages; and a page list) and an
// NCX for older readers.
import { zipSync, strToU8 } from 'fflate';
import { mupdf } from './pdf';
import { textcore } from '../wasm/textcore';
import { imgprocDirect, type Img } from '../wasm/imgproc';

export interface EpubOptions {
  mode: 'reflow' | 'columns'; width: number; grey: boolean; removeHeaders: boolean;
  /** mark the parts of a page laid out side by side: "Page N, part K" */
  labels: boolean;
  pages?: number[]; title?: string; author?: string;
  /** Asked between pages: false ends the conversion with `Stopped` (a newer PDF was chosen, the tab was left). */
  alive?: () => boolean;
}
export interface PageReport {
  page: number;
  /** text columns side by side (0: one) */
  columns: number;
  /** pieces laid out one after another under "Page N, part K" (0: the page reads top to bottom as it is) */
  parts: number;
  figures: number; tables: number; equations: number;
  how: 'text' | 'columns' | 'image'; note?: string;
}
/** What the conversion runs on: the app's engines by default; the unit suite brings its own. */
export interface EpubEngines {
  m: any;
  tc: { xycut(boxes: number[][], gx?: number, gy?: number, minh?: number, heavy?: boolean[], hd?: number): { order: number[]; col: number[]; part: number[] } };
  ip: {
    grayscale(i: Img): Img; expand(s: Uint8Array | Uint8ClampedArray, w: number, h: number, comps: number): Img;
    inkRegions(i: Img, skip: Array<[number, number, number, number]>, o?: { thr?: number; dil?: number; minArea?: number; max?: number }): Array<{ x: number; y: number; w: number; h: number }>;
  };
  /** RGBA → JPEG bytes (greyscale JPEG when `grey`; quality 80 unless given). */
  jpeg(img: Img, grey: boolean, quality?: number): Promise<Uint8Array>;
}
/** The conversion ended because `alive()` said so. */
export class Stopped extends Error { constructor() { super('The conversion was stopped.'); this.name = 'Stopped'; } }

type Box = { x0: number; y0: number; x1: number; y1: number };
type Fig = Box;
/** A piece of a line: text with its marks, or a piece the PDF gives no text for (a formula in a font without a Unicode
 *  map) — drawn as a small picture in the line. */
type Run = { t: string; sup?: boolean; sub?: boolean; b?: boolean; i?: boolean } | { pic: Box; html?: string };
export type Line = Box & {
  size: number; bold: boolean; italic: boolean;
  /** the plain text (U+FFFC where a piece is drawn as a picture) */
  text: string;
  runs: Run[];
  /** baseline of the line's main text; top and bottom of that text (without raised or lowered marks) */
  base: number; cy0: number; cy1: number;
  /** characters other than spaces; of them, without a Unicode meaning (U+FFFD, private use, controls); in a maths font */
  chars: number; bad: number; math: number;
  /** stretches of the line between gaps of more than an em (a table row's cells) */
  frags: Array<[number, number]>;
  /** a line of its own: an entry of a contents page with its page number (no paragraph runs on from it) */
  keep?: boolean;
};
type Item =
  | { kind: 'line'; l: Line }
  | { kind: 'fig'; f: Fig }
  | { kind: 'table'; f: Fig }
  | { kind: 'eq'; f: Fig; label: string; lines: Line[] }
  | { kind: 'hr'; f: Fig };
type Phase = 'read' | 'pages';

export const DEVICES = { paperwhite: 1236, scribe: 1860 } as const;
/** Characters XML 1.0 does not allow (C0 controls but tab and line ends, lone surrogates, U+FFFE / U+FFFF) and the C1
 *  controls: a PDF's text can hold them (a broken ToUnicode map), and one of them makes the whole page unreadable. */
const NOT_XML = /[^\t\n\r\u0020-\u007E\u00A0-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
export const xmlText = (s: string) => s.replace(NOT_XML, '');
const esc = (s: string) => xmlText(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const median = (a: number[]) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
/** Characters without a Unicode meaning: what a font without a Unicode map gives (often the symbols of a formula). */
const BAD = /[\uFFFD\uE000-\uF8FF\u0000-\u0008]/g;
/** Fonts of mathematics: TeX's (CMMI, CMSY, CMEX, AMS, Latin Modern Math …), Word's Cambria Math, STIX, Symbol, MathType's. */
const MATH_FONT = /^(?:CM(?:MI|SY|EX|BSY|MIB)\d*|MSAM|MSBM|EU[FSRB][MB]?\d*|RSFS|LM(?:Math|MathItalic|MathSymbols|MathExtension)|LatinModernMath|STIX|XITS|Cambria ?Math|Asana|TeXGyre\w*Math|NewCM\w*Math|Fira ?Math|Libertinus ?Math|Symbol|MT ?(?:SY|MI|EX|Extra)|Euclid|t[xp](?:sy|ex|mi)|ntx(?:sy|mi|ex)|zxlr|esint|wasy|stmary|bbold|dsrom|MathJax|\w*Math\b)/i;
/** An equation's number on its own: (3), (S12), (2.1a), (7'), [4], "Equation 7'.", "Eq. (5)". */
/** fonts whose characters are pictures although MuPDF reads letters from them (a chess font gives "KQRNBp") */
const PICTURE_FONT = /Skak|Chess|Figurine|Wingding|Webding|Marvosym|bbding|ifsym|FontAwesome|Starburst/i;
const LABEL = /^\s*(?:\(\s*[A-Za-z]{0,2}\s*\d+(?:[.-]\d+)*\s*[a-z]?\s*['′]*\s*\)|\[\s*\d+(?:\.\d+)*[a-z]?\s*\]|(?:Equation|Eqn?\.?)\s*\(?\s*[A-Z]{0,2}\d+(?:\.\d+)*[a-z]?['′]*\s*\)?\.?)\s*$/i;
/** A page number on its own: 12, "Page 12", "12 of 30", "– 12 –", or a Roman numeral (xiv — not "ill" or "civil"). */
export const pageNumberLike = /^\s*[-–—]?\s*(?:page\s*)?(?:\d{1,6}|(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))(?:\s*(?:of|\/)\s*\d+)?\s*[-–—]?\s*$/i;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const unionAll = (bs: Box[]): Box => bs.reduce(union);
const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const touches = (a: Box, b: Box, pad = 0) => a.x0 <= b.x1 + pad && b.x0 <= a.x1 + pad && a.y0 <= b.y1 + pad && b.y0 <= a.y1 + pad;
const inside = (b: Box, f: Box, pad = 1) => b.x0 >= f.x0 - pad && b.x1 <= f.x1 + pad && b.y0 >= f.y0 - pad && b.y1 <= f.y1 + pad;
const centreIn = (b: Box, f: Box, pad = 0) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return cx >= f.x0 - pad && cx <= f.x1 + pad && cy >= f.y0 - pad && cy <= f.y1 + pad; };
const box = (b: Box): Box => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });

/** The PDF's language (/Lang of its catalogue) when it is a language tag, else English. */
export function pdfLang(doc: any): string {
  try {
    const v = doc.getTrailer().get('Root').get('Lang'), s = v?.isString?.() ? String(v.asString()).trim() : '';
    return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(s) ? s : 'en';
  } catch { return 'en'; }
}

/** TeX sets an accent as a glyph of its own before its letter (\\"o: "¨" then "o") and ≠ as "=" with a slash drawn over
 *  it (MuPDF puts the slash after the letter before the sign): both are put together again — "Gröbner", "a ≠ 0". A
 *  cedilla and an ogonek come after their letter. Not in monospace text (code: a backtick is a backtick). */
const ACCENT_BEFORE: Record<string, string> = { '¨': '\u0308', '´': '\u0301', '`': '\u0300', 'ˆ': '\u0302', '˜': '\u0303', '¯': '\u0304', '˘': '\u0306', '˙': '\u0307', '˚': '\u030A', 'ˇ': '\u030C', '˝': '\u030B' };
const ACCENT_AFTER: Record<string, string> = { '¸': '\u0327', '˛': '\u0328' };
export function fixTeX(t: string, mono = false): string {
  let s = t.replace(/([¨´`ˆ˜¯˘˙˚ˇ˝])(\p{L})/gu, (m, a: string, l: string) => (mono && a === '`' ? m : l + ACCENT_BEFORE[a]));
  s = s.replace(/(\p{L})([¸˛])/gu, (_m, l: string, a: string) => l + ACCENT_AFTER[a]);
  s = s.replace(/\u0338(\s*)([=<>∈∋≡∼≃≈⊂⊃⊆⊇∃])/g, '$1$2\u0338');
  return s.normalize('NFC');
}

type Span = Box & { font: boolean; size: number; base: number; bold: boolean; italic: boolean; fam: string; math: boolean; text: string; n: number; bad: number; pic: boolean; script: 0 | 1 | -1 };
type Acc = { spans: Span[]; ms: number; cy0: number; cy1: number; x0: number; x1: number };

/** The lines of a page. MuPDF's spans (each in one font) are joined into lines across its blocks — a block may end in
 *  the middle of a line —, raised and lowered marks (a footnote number, an exponent, a fraction's parts in a line) with
 *  the line they belong to; a line takes the size and the weight most of its characters have (a line that starts with
 *  a bold word, "Theorem 1.", is not a bold line). Spans whose characters have no Unicode meaning become pictures in
 *  the line. Lines that run up or down the page (a stamp in the margin: arXiv's, the Federal Register's) are kept apart. */
export function readPage(page: any, W: number, H: number): { lines: Line[]; vertical: Line[]; images: Fig[] } {
  const j = JSON.parse(page.toStructuredText('preserve-images,preserve-whitespace,preserve-spans').asJSON());
  const images: Fig[] = [], spans: Span[] = [], byFam = new Map<string, number>();
  for (const b of j.blocks || []) {
    if (b.type === 'image') { images.push({ x0: b.bbox.x, y0: b.bbox.y, x1: b.bbox.x + b.bbox.w, y1: b.bbox.y + b.bbox.h }); continue; }
    for (const s of b.lines || []) {
      if (!String(s.text || '').trim()) continue;
      const name = String(s.font?.name || '').replace(/#20/g, ' ').replace(/^[A-Z]{6}\+/, '');
      const text = fixTeX(String(s.text), /TT|Mono|Courier|Consol|Typewriter/i.test(name));
      const fam = name.replace(/[-,+].*$/, '').replace(/\d+$/, ''), n = text.replace(/\s/g, '').length, size = s.font?.size || 10;
      const x0 = s.bbox.x, y0 = s.bbox.y, x1 = x0 + s.bbox.w, y1 = y0 + s.bbox.h;
      spans.push({ font: PICTURE_FONT.test(name), x0, y0, x1, y1, size, base: Number.isFinite(s.y) ? s.y : y1 - 0.22 * size, bold: s.font?.weight === 'bold', italic: s.font?.style === 'italic', fam, math: MATH_FONT.test(name) || /^CMR$/i.test(fam), text, n, bad: (text.match(BAD) || []).length, pic: false, script: 0 });
      byFam.set(fam, (byFam.get(fam) || 0) + n);
    }
  }
  // the face most of the page is set in is its text whatever its name (plain LaTeX sets its text in CMR)
  const bodyFam = [...byFam].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const s of spans) { if (s.fam === bodyFam) s.math = false; s.pic = (s.bad > 0 && (s.bad >= 0.3 * s.n || s.n <= 4)) || s.font; }

  const lines: Line[] = [], vertical: Line[] = [];
  const start = (s: Span): Acc => ({ spans: [s], ms: s.size, cy0: s.y0, cy1: s.y1, x0: s.x0, x1: s.x1 });
  const grow = (a: Acc, s: Span) => {
    a.spans.push(s); a.x0 = Math.min(a.x0, s.x0); a.x1 = Math.max(a.x1, s.x1);
    if (s.size > a.ms) {
      a.ms = s.size; a.cy0 = Infinity; a.cy1 = -Infinity; // the main text: spans of at least 0.8 of the largest size
      for (const x of a.spans) if (x.size >= 0.8 * a.ms) { a.cy0 = Math.min(a.cy0, x.y0); a.cy1 = Math.max(a.cy1, x.y1); }
    } else if (s.size >= 0.8 * a.ms) { a.cy0 = Math.min(a.cy0, s.y0); a.cy1 = Math.max(a.cy1, s.y1); }
  };
  const fits = (a: Acc, s: Span) => {
    const last = a.spans[a.spans.length - 1], small = s.size < 0.8 * a.ms;
    // not back to the left (a smaller mark may stand a little before the last one: a fraction's parts), and not more than
    // 1.5 em to the right: wider gaps are a column's gutter (two-column papers leave about 18 pt — equations side by side
    // in both columns came as one run of spans), a table's next cell or an equation's number
    if (s.x0 < last.x0 - (small ? 1.5 * s.size : 0.5) || s.x0 - a.x1 > 1.5 * Math.max(s.size, a.ms)) return false;
    if (!small) { const ov = Math.min(a.cy1, s.y1) - Math.max(a.cy0, s.y0); return ov > 0.6 * Math.min(a.cy1 - a.cy0, s.y1 - s.y0); }
    // a smaller span close beside the line, at most ¾ em above or below its text: a raised / lowered mark
    return s.y0 >= a.cy0 - 0.75 * a.ms && s.y1 <= a.cy1 + 0.75 * a.ms && s.x0 - a.x1 <= 0.8 * a.ms;
  };
  const close = (a: Acc) => {
    const ss = a.spans;
    // the line's size: the largest that holds a quarter of its characters at least (its many small sub- and superscripts
    // do not make a line of maths a small line), and the baseline of the longest span of that size
    const bySize = new Map<number, number>(); for (const s of ss) bySize.set(s.size, (bySize.get(s.size) || 0) + s.n);
    const all = ss.reduce((k, s) => k + s.n, 0);
    let size = ss[0].size, most = -1; for (const [z, k] of bySize) if (k > most || (k === most && z > size)) { most = k; size = z; }
    for (const [z, k] of [...bySize].sort((p, q) => q[0] - p[0])) if (k >= 0.25 * all) { size = z; break; }
    const mains = ss.filter((s) => Math.abs(s.size - size) <= 0.5);
    let base = mains[0].base, bn = -1; for (const s of mains) if (s.n > bn) { bn = s.n; base = s.base; }
    const cy0 = Math.min(...mains.map((s) => s.y0)), cy1 = Math.max(...mains.map((s) => s.y1));
    // a raised / lowered mark: smaller, and off the baseline — by its origin, or by its box (a rise MuPDF's origin does not show)
    const mid = (cy0 + cy1) / 2;
    for (const s of ss) {
      const off = Math.abs(s.base - base) > 0.12 * size ? s.base - base : Math.abs((s.y0 + s.y1) / 2 - mid) > 0.2 * size ? (s.y0 + s.y1) / 2 - mid : 0;
      s.script = s.size <= 0.85 * size && off ? (off < 0 ? 1 : -1) : 0;
    }
    // what stands between two pictures and belongs to their formula (a bracket, a digit, a mark, a maths letter) is
    // drawn with them; and a raised / lowered mark right after a picture is its own (an exponent)
    for (let i = 1; i < ss.length - 1; i++) if (!ss[i].pic && ss[i - 1].pic && ss[i + 1].pic && (ss[i].math || ss[i].script || /^[\s\d()[\]{}=+\-−×·.,;:'′^_|/<>]{0,3}$/.test(ss[i].text))) ss[i].pic = true;
    for (let i = 1; i < ss.length; i++) if (!ss[i].pic && ss[i].script && ss[i - 1].pic && ss[i].x0 - ss[i - 1].x1 < 0.3 * size) ss[i].pic = true;
    const runs: Run[] = [];
    let prevX1 = -Infinity;
    for (const s of ss) {
      const r = runs[runs.length - 1];
      if (s.pic) {
        if (r && 'pic' in r && s.x0 - r.pic.x1 < 0.6 * size) r.pic = union(r.pic, s);
        else {
          if (r && !('pic' in r) && !/[\s([{‘“'"/]$/.test(r.t)) r.t += ' '; // a formula is a word of its own
          runs.push({ pic: box(s) });
        }
      } else {
        let t = s.text;
        if (r) {
          const gap = s.x0 - prevX1;
          if ('pic' in r) { if (!/^[\s.,;:!?)\]}’”'"%]/.test(t)) t = ' ' + t; }
          // a space where the PDF leaves a gap and gives none — but none before a raised or lowered mark
          else if (!/\s$/.test(r.t) && !/^\s/.test(t) && gap > 0.15 * s.size && !(s.script && gap < 0.35 * size)) t = ' ' + t;
        }
        const f = { sup: s.script === 1, sub: s.script === -1, b: s.bold, i: s.italic };
        if (s.script) t = t.trim();                                    // a mark keeps no space of its own inside <sup>
        if (r && !('pic' in r) && !!r.sup === f.sup && !!r.sub === f.sub && !!r.b === f.b && !!r.i === f.i) r.t += t;
        else runs.push({ t, ...(f.sup ? { sup: true } : {}), ...(f.sub ? { sub: true } : {}), ...(f.b ? { b: true } : {}), ...(f.i ? { i: true } : {}) });
      }
      prevX1 = Math.max(prevX1, s.x1);
    }
    // white space at the ends of the line and runs of it inside; a slash over a sign two spans brought together
    for (const r of runs) if (!('pic' in r)) r.t = r.t.replace(/([¨´ˆ˜¯˘˙˚ˇ˝])(\p{L})/gu, (_m, a: string, c: string) => c + ACCENT_BEFORE[a]).replace(/\s+/g, ' ').replace(/\u0338(\s*)([=<>∈∋≡∼≃≈⊂⊃⊆⊇∃])/g, '$1$2\u0338').normalize('NFC');
    const first = runs[0], last = runs[runs.length - 1];
    if (first && !('pic' in first)) first.t = first.t.replace(/^\s+/, '');
    if (last && !('pic' in last)) last.t = last.t.replace(/\s+$/, '');
    const keep = runs.filter((r) => 'pic' in r || r.t);
    // a slash drawn over a relation sign that MuPDF put at the end of the span before it (an italic "a", a superscript):
    // onto the sign (a ≠ 0, b² ≠ 0, N) ≠ ∅)
    for (let k = 0; k < keep.length - 1; k++) {
      const r = keep[k], q = keep[k + 1];
      if ('pic' in r || 'pic' in q) continue;
      const m = /\u0338(\s*)$/.exec(r.t);
      if (m && /^\s*[=<>∈∋≡∼≃≈⊂⊃⊆⊇∃]/.test(q.t)) { r.t = r.t.slice(0, m.index) + m[1]; q.t = q.t.replace(/^(\s*)([=<>∈∋≡∼≃≈⊂⊃⊆⊇∃])/, '$1$2\u0338').normalize('NFC'); }
    }
    // an accent TeX set before its letter in a run of another style (an upright dot over an italic q): onto the letter
    for (let k = 0; k < keep.length - 1; k++) {
      const r = keep[k], q = keep[k + 1];
      if ('pic' in r || 'pic' in q) continue;
      const m = /([¨´ˆ˜¯˘˙˚ˇ˝])$/.exec(r.t);
      if (m && /^\p{L}/u.test(q.t)) { r.t = r.t.slice(0, m.index); q.t = (q.t.replace(/^(\p{L})/u, (c: string) => c + ACCENT_BEFORE[m[1]])).normalize('NFC'); }
    }
    for (let k = keep.length - 1; k >= 0; k--) { const r = keep[k]; if (!('pic' in r) && !r.t) keep.splice(k, 1); }
    const text = keep.map((r) => ('pic' in r ? '\uFFFC' : r.t)).join('');
    if (!text.trim() || a.x1 < 0 || a.x0 > W || Math.max(...ss.map((s) => s.y1)) < 0 || Math.min(...ss.map((s) => s.y0)) > H) return; // nothing, or off the page
    const n = ss.reduce((k, s) => k + s.n, 0);
    const sorted = [...ss].sort((p, q) => p.x0 - q.x0), frags: Array<[number, number]> = [];
    for (const s of sorted) { const f = frags[frags.length - 1]; if (f && s.x0 - f[1] <= 1.2 * size) f[1] = Math.max(f[1], s.x1); else frags.push([s.x0, s.x1]); }
    const l: Line = {
      x0: Math.max(0, a.x0), y0: Math.max(0, Math.min(...ss.map((s) => s.y0))), x1: Math.min(W, a.x1), y1: Math.min(H, Math.max(...ss.map((s) => s.y1))),
      size, bold: ss.reduce((k, s) => k + (s.bold ? s.n : 0), 0) >= 0.85 * n, italic: ss.reduce((k, s) => k + (s.italic ? s.n : 0), 0) >= 0.85 * n,
      text, runs: keep, base, cy0, cy1, chars: n, bad: ss.reduce((k, s) => k + s.bad, 0), math: ss.reduce((k, s) => k + (s.math || s.pic ? s.n : 0), 0), frags,
    };
    const h = l.y1 - l.y0;
    (h > 2.5 * size && h > 3 * (l.x1 - l.x0) ? vertical : lines).push(l);
  };
  let a: Acc | null = null;
  for (const s of spans) {
    if (a && fits(a, s)) {
      const last = a.spans[a.spans.length - 1];
      // the same text printed again a hair to the right (bold made by printing twice): once is enough
      if (s.text.trim() === last.text.trim() && Math.abs(s.x0 - last.x0) < 0.25 * s.size && Math.abs(s.base - last.base) < 0.25 * s.size) continue;
      grow(a, s);
    } else { if (a) close(a); a = start(s); }
  }
  if (a) close(a);
  // a line that is only an accent (a dot over a letter of the line under it, set where MuPDF starts a line of its own):
  // its letter cannot be told, so it adds nothing to the text — but its ink stays in the line's box (a formula's picture)
  const accentOnly = (l: Line) => /^[¨´`ˆ˜¯˘˙˚ˇ˝\u0300-\u036F\s]+$/u.test(l.text);
  for (let i = lines.length - 1; i >= 0; i--) {
    const a2 = lines[i];
    if (!accentOnly(a2)) continue;
    const host = lines.find((l) => l !== a2 && !accentOnly(l) && a2.x0 < l.x1 && a2.x1 > l.x0 && a2.y1 >= l.y0 - 0.6 * l.size && a2.y0 <= l.y1);
    if (host) { host.y0 = Math.min(host.y0, a2.y0); host.y1 = Math.max(host.y1, a2.y1); lines.splice(i, 1); }
  }
  return { lines, vertical, images };
}

/** The straight ruled lines a page draws (table borders, rules, fraction bars), through a device of our own run over the
 *  page: thin filled rectangles (how Word and InDesign draw a table's borders), thin stroked paths, and the straight
 *  sides of other stroked paths (a cell drawn as a rectangle). Collinear pieces are joined.
 *  Over the page, not its display list: a display list hands a device "packed" paths, which MuPDF says must never be kept
 *  or dropped — and mupdf.js keeps and drops every path it gives a JavaScript device (the heap was corrupted, 21 Nov 2026). */
/** A picture the page draws (an image, or an image mask painted in a colour) — the owner's strict rule (21 Nov 2026):
 *  every picture of the PDF is kept, exactly. `vis`: the part a clip leaves visible; `plain`: drawn upright, opaque, not
 *  clipped and not inside a soft mask or a blended group; `over`: something visible is drawn over it afterwards; `x`: its
 *  image object in the PDF (for the exact bytes); `lossy`: its data is JPEG or JPEG 2000. */
export type Pic = Box & { vis: Box; seq: number; mask: boolean; plain: boolean; over: boolean; w: number; h: number; lossy: boolean; x?: { img: any; o: any } };
const xform = (ctm: number[], x: number, y: number) => [x * ctm[0] + y * ctm[2] + ctm[4], x * ctm[1] + y * ctm[3] + ctm[5]];
const unitBox = (ctm: number[]): Box => {
  const c = [xform(ctm, 0, 0), xform(ctm, 1, 0), xform(ctm, 0, 1), xform(ctm, 1, 1)];
  return { x0: Math.min(...c.map((p) => p[0])), y0: Math.min(...c.map((p) => p[1])), x1: Math.max(...c.map((p) => p[0])), y1: Math.max(...c.map((p) => p[1])) };
};
const meet = (a: Box, b: Box): Box => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });

export function readRules(m: any, page: any, doc?: any): { h: Box[]; v: Box[]; shown: number; hidden: number; pics: Pic[]; release(): void } {
  const h: Box[] = [], v: Box[] = [];
  // characters drawn, and characters set invisible (render mode 3: the OCR layer over a scanned page)
  let shown = 0, hidden = 0, seq = 0;
  // what is drawn, in order: the points where visible characters stand, the boxes of paths (for what lies over a picture)
  const pts: number[] = [], paths: Array<Box & { seq: number; stroke: boolean }> = [];
  const glyphs = (t: any, ctm?: number[], keep = false) => {
    let n = 0;
    try { t.walk({ showGlyph(_f: any, trm: number[]) { n++; if (keep && ctm && pts.length < 300000) { const [x, y] = xform(ctm, trm[4], trm[5]); pts.push(x, y, seq); } } }); } catch { n = 1; }
    return n;
  };
  // the page's image objects (also inside its forms), by the image MuPDF hands the device — the same object, so a picture
  // drawn can be traced to its bytes in the PDF
  const xo = new Map<number, { img: any; o: any }>();
  if (doc?.loadImage) {
    const seen = new Set<number>();
    const walk = (res: any, depth: number) => {
      if (!res || depth > 6) return;
      let x: any; try { x = res.get('XObject'); if (!x?.isDictionary?.()) return; } catch { return; }
      x.forEach((val: any) => {
        try {
          if (val.isIndirect()) { const k = val.asIndirect(); if (seen.has(k)) return; seen.add(k); }
          // (the reference, not the resolved dictionary: a stream's bytes are read through its object number)
          const o = val.resolve(), st = o.get('Subtype');
          if (st.isName() && st.asName() === 'Image') { const img = doc.loadImage(val); xo.set(img.pointer, { img, o: val.isIndirect() ? val : o }); }
          else if (st.isName() && st.asName() === 'Form') walk(o.get('Resources'), depth + 1);
        } catch { /* an object MuPDF cannot read: that picture is drawn from the page */ }
      });
    };
    try { walk(page.getObject().getInheritable('Resources'), 0); } catch { /* no resources */ }
  }
  const pics: Pic[] = [], clips: Array<Box | null> = [], groups: boolean[] = [];
  let maskDef = 0;
  const clipNow = () => clips.reduce<Box | null | undefined>((a, c) => (a === null || c === null ? null : a ? meet(a, c) : c), undefined);
  const pic = (image: any, ctm: number[], alpha: number, mask: boolean) => {
    if (maskDef) return;
    const b = unitBox(ctm), cl = clipNow(), vis = cl === null ? b : cl ? meet(b, cl) : b;
    if (vis.x1 - vis.x0 <= 0.1 || vis.y1 - vis.y0 <= 0.1) return;
    const clipped = cl === null || (!!cl && (vis.x0 > b.x0 + 0.5 || vis.y0 > b.y0 + 0.5 || vis.x1 < b.x1 - 0.5 || vis.y1 < b.y1 - 0.5));
    const x = mask ? undefined : xo.get(image.pointer);
    let lossy = true;
    try { const f = x?.o.get('Filter'); const names = !f || f.isNull() ? [] : f.isArray() ? Array.from({ length: f.length }, (_, i) => f.get(i).asName()) : [f.asName()]; lossy = !x || names.some((n) => n === 'DCTDecode' || n === 'JPXDecode' || n === 'DCT'); } catch { /* lossy */ }
    pics.push({ ...b, vis, seq: seq++, mask, over: false, w: image.getWidth(), h: image.getHeight(), lossy: mask ? false : lossy, x,
      plain: !mask && alpha >= 0.999 && !clipped && !groups.some(Boolean) && Math.abs(ctm[1]) < 1e-6 && Math.abs(ctm[2]) < 1e-6 && ctm[0] > 0 && ctm[3] > 0 });
  };
  const thin = (b: number[]) => {
    const w = b[2] - b[0], ht = b[3] - b[1];
    if (ht <= 2.5 && w >= 3) { h.push({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] }); return true; }
    if (w <= 2.5 && ht >= 3) { v.push({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] }); return true; }
    return false;
  };
  let budget = 100000; // straight pieces walked on a page at most (a plot of a million points has no table in it)
  const drawn = (b: number[], stroke: boolean) => { if (!maskDef && paths.length < 50000) paths.push({ x0: b[0], y0: b[1], x1: b[2], y1: b[3], seq: seq++, stroke }); };
  const dev = new m.Device({
    fillText(t: any, ctm: number[]) { shown += glyphs(t, ctm, !maskDef); seq++; }, strokeText(t: any, _s: any, ctm: number[]) { shown += glyphs(t, ctm, !maskDef); seq++; },
    clipText(t: any) { shown += glyphs(t); clips.push(null); }, clipStrokeText() { clips.push(null); }, ignoreText(t: any) { hidden += glyphs(t); },
    fillImage(image: any, ctm: number[], alpha: number) { try { pic(image, ctm, alpha, false); } catch { /* an image MuPDF cannot measure */ } },
    fillImageMask(image: any, ctm: number[]) { try { pic(image, ctm, 1, true); } catch { /* as above */ } },
    clipPath(path: any, _eo: boolean, ctm: number[]) { try { const b = path.getBounds(null, ctm); clips.push({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] }); } catch { clips.push(null); } },
    clipStrokePath(path: any, stroke: any, ctm: number[]) { try { const b = path.getBounds(stroke, ctm); clips.push({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] }); } catch { clips.push(null); } },
    clipImageMask(image: any, ctm: number[]) { try { clips.push(unitBox(ctm)); } catch { clips.push(null); } void image; },
    popClip() { clips.pop(); },
    // a soft mask: what defines it draws nothing; what it masks is clipped by it (until its popClip)
    beginMask() { maskDef++; }, endMask() { maskDef = Math.max(0, maskDef - 1); clips.push(null); },
    beginGroup(_b: any, _cs: any, _iso: boolean, _ko: boolean, blend: string, alpha: number) { groups.push(alpha < 0.999 || (!!blend && blend !== 'Normal')); },
    endGroup() { groups.pop(); },
    fillShade() { seq++; },
    fillPath(path: any, _eo: boolean, ctm: number[]) { try { const b = path.getBounds(null, ctm); drawn(b, false); thin(b); } catch { /* a path MuPDF cannot measure */ } },
    strokePath(path: any, stroke: any, ctm: number[]) {
      try {
        const sb = path.getBounds(stroke, ctm); drawn(sb, true);
        if (thin(sb) || budget <= 0) return;
        const lw = Math.max(0.3, (stroke.getLineWidth?.() || 1) * Math.hypot(ctm[0], ctm[1]));
        const xf = (x: number, y: number) => [x * ctm[0] + y * ctm[2] + ctm[4], x * ctm[1] + y * ctm[3] + ctm[5]];
        let sx = 0, sy = 0, px = 0, py = 0;
        const seg = (ax: number, ay: number, bx: number, by: number) => {
          if (--budget < 0) return;
          if (Math.abs(by - ay) <= 0.5 && Math.abs(bx - ax) >= 3) h.push({ x0: Math.min(ax, bx), y0: (ay + by) / 2 - lw / 2, x1: Math.max(ax, bx), y1: (ay + by) / 2 + lw / 2 });
          else if (Math.abs(bx - ax) <= 0.5 && Math.abs(by - ay) >= 3) v.push({ x0: (ax + bx) / 2 - lw / 2, y0: Math.min(ay, by), x1: (ax + bx) / 2 + lw / 2, y1: Math.max(ay, by) });
        };
        path.walk({
          moveTo(x: number, y: number) { [px, py] = xf(x, y); sx = px; sy = py; },
          lineTo(x: number, y: number) { const [qx, qy] = xf(x, y); seg(px, py, qx, qy); px = qx; py = qy; },
          curveTo(_a: number, _b: number, _c: number, _d: number, x: number, y: number) { [px, py] = xf(x, y); },
          closePath() { seg(px, py, sx, sy); px = sx; py = sy; },
        });
      } catch { /* as above */ }
    },
  });
  try { page.run(dev, m.Matrix.identity); } finally { try { dev.close(); } catch { /* closed */ } dev.destroy?.(); }
  // over a picture: a visible character, a path (not a frame stroked around it) or another picture drawn after it
  for (const p of pics) {
    const inner = { x0: p.vis.x0 + 1, y0: p.vis.y0 + 1, x1: p.vis.x1 - 1, y1: p.vis.y1 - 1 };
    const cuts = (b: Box) => b.x0 < inner.x1 && b.x1 > inner.x0 && b.y0 < inner.y1 && b.y1 > inner.y0;
    let over = pics.some((q) => q.seq > p.seq && cuts(q.vis)) || paths.some((q) => q.seq > p.seq && cuts(q) && !(q.stroke && q.x0 <= p.vis.x0 + 1 && q.y0 <= p.vis.y0 + 1 && q.x1 >= p.vis.x1 - 1 && q.y1 >= p.vis.y1 - 1));
    for (let i = 0; i < pts.length && !over; i += 3) if (pts[i + 2] > p.seq && pts[i] > inner.x0 && pts[i] < inner.x1 && pts[i + 1] > inner.y0 && pts[i + 1] < inner.y1) over = true;
    p.over = over;
  }
  // pieces of one rule (Word draws a row's border cell by cell) become one
  const join = (rs: Box[], dir: 'h' | 'v') => {
    const s = [...rs].sort((p, q) => (dir === 'h' ? p.y0 - q.y0 || p.x0 - q.x0 : p.x0 - q.x0 || p.y0 - q.y0)), out: Box[] = [];
    for (const r of s) {
      let at: Box | undefined;
      for (let k = out.length - 1; k >= 0 && !at; k--) {
        const q = out[k];
        if (dir === 'h' ? Math.abs((q.y0 + q.y1) / 2 - (r.y0 + r.y1) / 2) <= 1 && r.x0 <= q.x1 + 2.5 : Math.abs((q.x0 + q.x1) / 2 - (r.x0 + r.x1) / 2) <= 1 && r.y0 <= q.y1 + 2.5) at = q;
      }
      if (at) Object.assign(at, union(at, r)); else out.push({ ...r });
    }
    return out;
  };
  return { h: join(h, 'h'), v: join(v, 'v'), shown, hidden, pics, release: () => { for (const x of xo.values()) x.img.destroy?.(); } };
}

/** A picture's exact bytes: a JPEG in the PDF (grey or RGB, no Decode array, no mask) is copied byte for byte; any other
 *  image is its own pixels, losslessly as PNG (colours of another space turned to RGB, which the reader shows). Null when
 *  it cannot be done (a mask painted in a colour, an image without its object, a picture beyond the size limit). */
export function picBytes(m: any, p: Pic, maxPixels: number): { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png'; w: number; h: number } | null {
  if (!p.x || p.mask || p.w * p.h > maxPixels || p.w > 16384 || p.h > 16384) return null;
  const { img, o } = p.x;
  try {
    const none = (k: string) => { const v = o.get(k); return !v || v.isNull(); };
    if (!none('SMask') || !none('Mask') || img.getImageMask()) return null;
    const f = o.get('Filter'), names = f.isNull() ? [] : f.isArray() ? Array.from({ length: f.length }, (_, i) => f.get(i).asName()) : [f.asName()];
    const comps = img.getNumberOfComponents();
    if (names.length === 1 && (names[0] === 'DCTDecode' || names[0] === 'DCT') && (comps === 1 || comps === 3) && none('Decode')) {
      const raw = o.readRawStream(), bytes = new Uint8Array(raw.asUint8Array()); raw.destroy?.();
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, mime: 'image/jpeg', w: p.w, h: p.h };
    }
    let pix = img.toPixmap();
    const cs = pix.getColorSpace();
    if (cs && !cs.isRGB() && !cs.isGray()) { const rgb = pix.convertToColorSpace(m.ColorSpace.DeviceRGB, false); pix.destroy?.(); pix = rgb; }
    try { return { bytes: new Uint8Array(pix.asPNG()), mime: 'image/png', w: pix.getWidth(), h: pix.getHeight() }; } finally { pix.destroy?.(); }
  } catch { return null; }
}

/** Running headers / footers: lines near the top or bottom that repeat (digits ignored) on many pages, and bare page numbers. */
export function headerKeys(pages: Array<{ lines: Line[]; H: number }>) {
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

/** A line's HTML: its text escaped, raised / lowered marks as <sup> / <sub>, italic and bold (not in a heading), and its
 *  formula pictures (made before). */
function lineHtml(l: Line, marks: boolean, dehyphen = false): string {
  let out = '';
  const runs = l.runs;
  for (const [k, r] of runs.entries()) {
    if ('pic' in r) { out += r.html || ''; continue; }
    let t = r.t;
    if (dehyphen && k === runs.length - 1) t = t.replace(/[-\u00AD]$/, '');
    let s = esc(t);
    if (marks && r.i) s = `<i>${s}</i>`;
    if (marks && r.b) s = `<b>${s}</b>`;
    if (r.sup) s = `<sup>${s}</sup>`; else if (r.sub) s = `<sub>${s}</sub>`;
    out += s;
  }
  return out;
}

/** Paragraphs and headings from the lines of one part of a page, in order. A short line that ends without a full stop
 *  keeps its line break (an address, a list of names, a title block); a hyphen at a line's end joins the word. */
function toHtml(lines: Line[], body: number, pagePitch: number): string {
  const out: string[] = [];
  // line pitch (top to top) is steadier than the gaps between line boxes
  const pitch = pagePitch || body * 1.2, left = Math.min(...lines.map((l) => l.x0)), width = Math.max(...lines.map((l) => l.x1)) - left;
  let para: Array<{ l: Line; join: string; cut: boolean }> = [], kind: 'p' | 'h' = 'p', prev: Line | null = null, hsize = 0;
  const flush = () => {
    if (!para.length) return;
    const isH = kind === 'h';
    const html = para.map((x, k) => (k ? x.join : '') + lineHtml(x.l, !isH, x.cut)).join('').trim();
    if (html) out.push(isH ? `<h${hsize >= body * 1.6 ? 2 : 3}>${html}</h${hsize >= body * 1.6 ? 2 : 3}>` : `<p>${html}</p>`);
    para = [];
  };
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
    const ends = (p: Line) => /[.!?:"”)\]]$/.test(p.text);
    const newBlock = !prev || isHead !== (kind === 'h') || (isHead && Math.abs(l.size - hsize) > 0.5) || (Math.abs(l.size - prev.size) > 0.8 && ends(prev)) // caption → text (OCR layers vary the size line by line, so only after a sentence end)
      || (l.cy0 - prev.cy0 > pitch * 1.35 + 0.5 && l.y0 - prev.y1 > 0.35 * pitch)                                 // blank space (a line with a tall formula has more room above it, but no gap)
      || (!isHead && ends(prev) && (l.x0 > prev.x0 + body * 0.8 || prev.x1 < prev.x0 + width * 0.8));               // indent / short last line
    if (newBlock) { flush(); kind = isHead ? 'h' : 'p'; hsize = l.size; para = [{ l, join: '', cut: false }]; }
    else {
      const pt = prev!.text;
      let join = ' ';
      if (prev!.keep || l.keep) join = '<br/>';                                                    // contents: an entry a line
      else if (/\p{L}{2,}[-\u00AD]$/u.test(pt) && /^\p{Ll}/u.test(l.text)) { join = ''; para[para.length - 1].cut = true; } // de-hyphenate ("experi-ment")
      else if (/[-\u00AD]$/.test(pt)) join = '';                                                   // "e-reader": a one-letter prefix keeps its hyphen
      else if (!isHead && prev!.x1 < left + width * 0.7 && !/[,;]$/.test(pt)) join = '<br/>';      // a short line: its break is the author's
      para.push({ l, join, cut: false });
    }
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

/** Running text: a line of words (a column's, a paragraph's). */
const running = (l: Line) => l.frags.length === 1 && l.text.length >= 40 && (l.text.match(/\p{L}{2,}/gu) || []).length >= 5;

/** Rows of lines: the lines on one baseline. */
function rowsOf(lines: Line[]): Line[][] {
  const rows: Line[][] = [];
  for (const l of [...lines].sort((a, b) => a.base - b.base || a.x0 - b.x0)) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(r[0].base - l.base) <= 0.4 * Math.max(r[0].size, l.size)) r.push(l); else rows.push([l]);
  }
  return rows;
}
/** The cells of a row: the stretches of its lines between gaps of more than an em. */
const cellsOf = (row: Line[]) => row.reduce((k, l) => k + l.frags.length, 0);
/** A table's row: two cells or more, and short ones — lines of text columns side by side are long (40 characters and
 *  more), a table's cells are numbers, names, short phrases. */
const tableRow = (row: Line[]) => { const c = cellsOf(row); return c >= 2 && row.reduce((k, l) => k + l.text.length, 0) / c <= 30; };
/** Prose: a long line of words that fills most of its region (rules above and below an abstract make no table). */
const prose = (l: Line, w: number) => l.text.length >= 50 && l.x1 - l.x0 >= 0.7 * w && l.frags.length === 1;

/** Tables drawn with rules: a grid (rules across and down, touching), or rules across of one extent stacked with rows
 *  of cells between them (booktabs, Word's simple tables). The region holds the rules and the text inside them. */
function ruledTables(hr: Box[], vr: Box[], lines: Line[], W: number): Box[] {
  const out: Box[] = [];
  const valid = (r: Box) => {
    const ins = lines.filter((l) => centreIn(l, r, 1));
    if (ins.length < 2) return false;
    const rows = rowsOf(ins), multi = rows.filter(tableRow).length;
    return multi >= 2 && ins.filter((l) => prose(l, r.x1 - r.x0)).length <= 0.3 * ins.length;
  };
  // a ruled region grows over the table rows just above and below it (a table that goes on past its last rule — on to the
  // next page —, or whose top rule is on the page before)
  const grow = (reg: Box) => {
    const w = reg.x1 - reg.x0, body = median(lines.map((l) => l.size)) || 10;
    const near = lines.filter((l) => !centreIn(l, reg, 1) && l.x0 >= reg.x0 - 4 && l.x1 <= reg.x1 + 4);
    const rows = rowsOf(near), ok = (row: Line[]) => tableRow(row) && !row.some((l) => prose(l, w));
    let r = reg;
    for (const row of rows.filter((row) => row[0].y0 >= r.y1 - 1)) { const b = unionAll(row); if (b.y0 - r.y1 <= 2.6 * body && ok(row)) r = union(r, b); else break; }
    for (const row of rows.filter((row) => row[0].y1 <= reg.y0 + 1).reverse()) { const b = unionAll(row); if (r.y0 - b.y1 <= 2.6 * body && ok(row)) r = union(r, b); else break; }
    return r;
  };
  // grids: rules across and down that touch, at least three of one kind
  const all = [...hr.map((b) => ({ b, h: true })), ...vr.map((b) => ({ b, h: false }))], up = all.map((_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
  if (all.length <= 3000) for (let i = 0; i < all.length; i++) for (let k = i + 1; k < all.length; k++) if (all[i].h !== all[k].h && touches(all[i].b, all[k].b, 1.5)) up[find(i)] = find(k);
  const groups = new Map<number, typeof all>();
  for (let i = 0; i < all.length; i++) { const g = groups.get(find(i)) || []; g.push(all[i]); groups.set(find(i), g); }
  const used = new Set<Box>();
  for (const g of groups.values()) {
    const nh = g.filter((x) => x.h).length, nv = g.length - nh;
    if (nh < 2 || nv < 2 || (nh < 3 && nv < 3)) continue;
    const r = grow(unionAll(g.map((x) => x.b)));
    if (r.x1 - r.x0 < 40 || r.y1 - r.y0 < 16 || !valid(r)) continue;
    out.push(r); for (const x of g) used.add(x.b);
  }
  // rules across of one extent, stacked: split where prose stands between two of them
  const free = hr.filter((b) => !used.has(b) && b.x1 - b.x0 >= 50 && !out.some((t) => touches(t, b, 1)));
  const seen = new Set<Box>();
  for (const r of free) {
    if (seen.has(r)) continue;
    const same = free.filter((q) => !seen.has(q) && Math.abs(q.x0 - r.x0) <= 6 && Math.abs(q.x1 - r.x1) <= 6).sort((p, q) => p.y0 - q.y0);
    let chain: Box[] = [];
    const end = () => {
      // two rules or more; or one long rule with table rows beside it
      if (chain.length >= 2 || (chain.length === 1 && chain[0].x1 - chain[0].x0 >= 0.4 * W)) {
        const reg = unionAll(chain), ins = lines.filter((l) => centreIn(l, reg, 1));
        const t = grow(ins.length ? union(reg, unionAll(ins)) : reg);
        if (t.y1 - t.y0 >= 8 && valid(t)) { out.push(t); for (const c of chain) seen.add(c); }
      }
      chain = [];
    };
    for (const q of same) {
      if (chain.length) {
        const prev = chain[chain.length - 1], gap: Box = { x0: q.x0, y0: prev.y1, x1: q.x1, y1: q.y0 };
        if (q.y0 - prev.y1 > 0.6 * 792 || lines.some((l) => centreIn(l, gap) && prose(l, q.x1 - q.x0))) end();
      }
      chain.push(q);
    }
    end();
    seen.add(r);
  }
  // inner rules shorter than the outer ones (a rule under part of the header) are inside a table already
  return mergeBoxes(out, 1);
}

/** Tables without rules: three rows or more in a row, each of three short cells or more, whose cells line up (by their
 *  left or right edges) in at least three places. Text in columns is no table: its "cells" are long lines. */
function alignedTables(lines: Line[], W: number, body: number): Box[] {
  const rows = rowsOf(lines), out: Box[] = [];
  const tabular = (row: Line[]) => {
    const fr = row.flatMap((l) => l.frags);
    if (fr.length < 3) return false;
    const widths = fr.map((f) => f[1] - f[0]), chars = row.reduce((k, l) => k + l.text.length, 0) / fr.length;
    return median(widths) <= 0.2 * W && Math.max(...widths) <= 0.45 * W && chars <= 24;
  };
  for (let i = 0; i < rows.length;) {
    if (!tabular(rows[i])) { i++; continue; }
    let j = i + 1;
    while (j < rows.length && tabular(rows[j]) && rows[j][0].base - rows[j - 1][0].base <= 2.6 * body) j++;
    if (j - i >= 3) {
      const run = rows.slice(i, j), fr = run.map((row) => row.flatMap((l) => l.frags));
      // edges shared by most rows
      const support = (edge: 0 | 1) => {
        const xs = fr.flatMap((f, row) => f.map((c) => [c[edge], row])).sort((a, b) => a[0] - b[0]), cl: number[][][] = [];
        for (const x of xs) { const c = cl[cl.length - 1]; if (c && x[0] - c[c.length - 1][0] <= 3) c.push(x); else cl.push([x]); }
        return cl.filter((c) => new Set(c.map((x) => x[1])).size >= 0.6 * run.length).length;
      };
      if (Math.max(support(0), support(1)) >= 3) {
        let reg = unionAll(run.flat());
        // the header row just above: two cells or more
        const above = rows[i - 1];
        if (above && run[0][0].base - above[0].base <= 2.6 * body && cellsOf(above) >= 2 && !above.some((l) => prose(l, reg.x1 - reg.x0))) reg = union(reg, unionAll(above));
        out.push(reg);
      }
    }
    i = j;
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
  return { m, tc, ip, jpeg: async (img, grey, quality) => new Uint8Array(await (await encodeImg(img, 'jpeg', quality ?? 80, grey ? { color_space: 1 } : {})).arrayBuffer()) };
}

/** Pictures larger than this many pixels (or 16,384 a side) are drawn smaller: they are for an e-reader's screen. */
const MAX_PIXELS = 32e6;
const STYLE = `body { margin: 0 3%; line-height: 1.45; } p { margin: 0 0 0.6em; text-indent: 0; text-align: left; } h2, h3 { margin: 1em 0 0.4em; line-height: 1.25; }
.pgno { font-size: 0.75em; color: #666; margin: 0 0 0.8em; border-bottom: 1px solid #bbb; } .page { page-break-before: always; }
h4.part { font-size: 0.8em; color: #555; font-weight: bold; margin: 1.8em 0 0.6em; padding-top: 0.5em; border-top: 1px dashed #999; text-transform: none; }
.pgno + h4.part { margin-top: 0.4em; padding-top: 0; border-top: 0; } p.margin { font-size: 0.75em; color: #555; }
.fig { text-align: center; margin: 0.6em 0; } .fig img { max-width: 100%; height: auto; } .full img { width: 100%; }
p.eqno { text-align: right; margin: -0.2em 0 0.8em; font-size: 0.9em; } img.m { max-width: 100%; }
hr.fn { width: 30%; margin: 1.2em auto 0.6em 0; border: 0; border-top: 1px solid #888; } sup, sub { font-size: 0.7em; line-height: 0; }
`;

export async function pdfToEpub(doc: any, o: EpubOptions, onProgress?: (done: number, of: number, phase: Phase) => void, engines?: EpubEngines): Promise<{ epub: Uint8Array; report: PageReport[] }> {
  const { m, tc, ip, jpeg } = engines || await appEngines();
  const alive = () => { if (o.alive && !o.alive()) throw new Stopped(); };
  let lastYield = performance.now();
  const pause = async () => { if (performance.now() - lastYield > 30) { await tick(); lastYield = performance.now(); } alive(); };
  const n = doc.countPages(), list = (o.pages?.length ? o.pages : Array.from({ length: n }, (_, i) => i)).filter((i) => i >= 0 && i < n);
  if (!list.length) throw new Error(n ? 'None of the chosen pages is in this PDF.' : 'This PDF has no pages.');
  const lang = pdfLang(doc);
  // pass 1: text of every chosen page (needed to spot running headers) and where its images are (a logo in every footer)
  const pages: Array<{ i: number; p: any; W: number; H: number; lines: Line[]; vertical: Line[]; images: Fig[] }> = [];
  const imageKey = (b: Fig) => [b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v / 6)).join(',');
  const imageCount = new Map<string, number>();
  for (const [k, i] of list.entries()) {
    if (k % 10 === 0) onProgress?.(k, list.length, 'read');
    const p = doc.loadPage(i), [x0, y0, x1, y1] = p.getBounds(), W = x1 - x0, H = y1 - y0;
    const r = readPage(p, W, H);
    pages.push({ i, p, W, H, ...r });
    for (const key of new Set(r.images.filter((b) => b.y1 < H * 0.12 || b.y0 > H * 0.88).map(imageKey))) imageCount.set(key, (imageCount.get(key) || 0) + 1);
    await pause();
  }
  const isHeader = o.removeHeaders ? headerKeys(pages) : () => false;
  const repeatMin = Math.max(2, Math.ceil(pages.length * 0.4));
  const files: Record<string, any> = {}, report: PageReport[] = [], manifest: string[] = [], spine: string[] = [], toc: TocItem[] = [], fileOfPage = new Map<number, string>();
  let imgNo = 0;
  const addFile = (bytes: Uint8Array, mime: 'image/jpeg' | 'image/png', attrs: string) => {
    const name = `images/i${String(++imgNo).padStart(4, '0')}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    files[`OEBPS/${name}`] = [bytes, { level: 0 }]; manifest.push(`<item id="img${imgNo}" href="${name}" media-type="${mime}"/>`);
    return `<img src="${name}" ${attrs}/>`;
  };
  /** a drawing of ours (a formula, a table, a vector figure): greyscale when chosen; a picture of the PDF keeps its colours */
  const addImage = async (img: Img, attrs = 'alt=""', colour = false, quality?: number) => {
    const grey = o.grey && !colour, bytes = await jpeg(grey ? ip.grayscale(img) : img, grey, quality);
    alive();
    return addFile(bytes, 'image/jpeg', attrs);
  };
  for (const [k, pg] of pages.entries()) {
    onProgress?.(k, pages.length, 'pages');
    const headers = pg.lines.filter((l) => isHeader(l, pg.H)), lines = pg.lines.filter((l) => !isHeader(l, pg.H)), dl = pg.p.toDisplayList();
    // MuPDF draws a part of the page (in points) at `sc` pixels per point, within MAX_PIXELS
    const drawPix = (r: Fig, sc: number): any => {
      const w = Math.max(1, r.x1 - r.x0), h = Math.max(1, r.y1 - r.y0);
      sc = Math.min(sc, 16384 / w, 16384 / h, Math.sqrt(MAX_PIXELS / (w * h)));
      const x0 = Math.floor(r.x0 * sc), y0 = Math.floor(r.y0 * sc), b = [x0, y0, x0 + Math.max(1, Math.round(w * sc)), y0 + Math.max(1, Math.round(h * sc))];
      const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, b, false);
      try {
        pix.clear(255);
        const dev = new m.DrawDevice(m.Matrix.identity, pix);
        try { dl.run(dev, m.Matrix.scale(sc, sc)); dev.close(); } finally { dev.destroy?.(); }
        return pix;
      } catch (e) { pix.destroy?.(); throw e; }
    };
    const draw = (r: Fig, sc: number): Img => { const pix = drawPix(r, sc); try { return ip.expand(pix.getPixels(), pix.getWidth(), pix.getHeight(), pix.getNumberOfComponents()); } finally { pix.destroy?.(); } };
    const drawPNG = (r: Fig, sc: number): Uint8Array => { const pix = drawPix(r, sc); try { return new Uint8Array(pix.asPNG()); } finally { pix.destroy?.(); } };
    const pageNo = pg.i + 1, file = `p${String(pageNo).padStart(4, '0')}.xhtml`, page = { x0: 0, y0: 0, x1: pg.W, y1: pg.H };
    let html = '', rep: PageReport;
    const coverage = pg.images.reduce((a, b) => Math.max(a, ((b.x1 - b.x0) * (b.y1 - b.y0)) / (pg.W * pg.H)), 0);
    const vText = pg.vertical.reduce((a, l) => a + l.text.length, 0), hText = lines.reduce((a, l) => a + l.text.length, 0);
    const blank = { columns: 0, parts: 0, figures: 0, tables: 0, equations: 0 };
    // what the page draws: its ruled lines, its pictures, and how much of its text is visible
    const rl = readRules(m, pg.p, doc), pics = rl.pics.map((p) => ({ ...p, vis: meet(p.vis, page) })).filter((p) => p.vis.x1 - p.vis.x0 > 0.1 && p.vis.y1 - p.vis.y0 > 0.1);
    const meetArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    /** a region as a picture. Pictures of the PDF in it keep their colours and their own resolution (never less than the
     *  screen's), losslessly as PNG when none of them is a JPEG (the owner's strict rule, 21 Nov 2026: "preserve all original
     *  images exactly") */
    const region = async (r: Fig, sc: number, attrs: string): Promise<string> => {
      const ps = pics.filter((p) => meetArea(p.vis, r) > 0.25 * area(p.vis));
      if (!ps.length) return addImage(draw(r, sc), attrs);
      const native = Math.max(sc, ...ps.map((p) => Math.max(p.w / Math.max(0.5, p.x1 - p.x0), p.h / Math.max(0.5, p.y1 - p.y0))));
      if (ps.every((p) => !p.lossy)) { const png = drawPNG(r, native); alive(); return addFile(png, 'image/png', attrs); }
      return addImage(draw(r, native), attrs, true, 92);
    };
    /** one picture of the PDF exactly as it is (its own bytes) when nothing is drawn over it; else its region */
    const exact = async (p: Pic & { vis: Box }, r: Fig, sc: number, attrs: string, force = false): Promise<string> => {
      const b = (force || (p.plain && !p.over)) ? picBytes(m, p, MAX_PIXELS) : null;
      return b ? addFile(b.bytes, b.mime, attrs) : region(r, sc, attrs);
    };
    /** the page as a picture: the one picture that fills it exactly as it is (its own bytes), and what visible text the page
     *  has after it as text (a caption on a photo); else the page drawn */
    const wholePage = async (attrs: string, text: Line[]): Promise<string> => {
      const big = pics.filter((p) => area(p.vis) >= 0.9 * pg.W * pg.H);
      if (big.length === 1 && pics.length === 1) {
        const b = picBytes(m, big[0], MAX_PIXELS);
        if (b) return `<div class="fig full">${addFile(b.bytes, b.mime, `${attrs} style="width:100%"`)}</div>${text.length ? `\n${toHtml(text, text[0].size, 0)}` : ''}`;
      }
      return `<div class="fig full">${await region(page, o.width / pg.W, `${attrs} style="width:100%"`)}</div>`;
    };
    if (pics.length && rl.hidden > 0 && rl.hidden >= 0.8 * (rl.hidden + rl.shown)) {
      // a scanned page: its text is someone's OCR set invisible over the picture — the page stays its picture and the OCR
      // text is not used (owner, 21 Nov 2026: "maintain original images as images … Don't do OCR of any sort. If in the
      // original PDF it's an image, preserve it as an image in the new EPUB")
      html = await wholePage('alt="page"', []);
      rep = { page: pageNo, ...blank, how: 'image', note: 'scanned page — kept as its picture' };
    } else if (vText > hText) {
      // most of the text runs up or down the page (a table turned on its side): the page as a picture
      html = `<div class="fig full">${await region(page, o.width / pg.W, 'alt="page" style="width:100%"')}</div>`;
      rep = { page: pageNo, ...blank, how: 'image', note: 'text turned sideways' };
    } else if (lines.length < 2 && (coverage > 0.5 || !lines.length)) {
      // scanned page without a text layer, or an empty page: the page as a picture
      html = await wholePage('alt="page"', lines);
      rep = { page: pageNo, ...blank, how: 'image', note: lines.length ? undefined : 'no text layer' };
    } else {
      // a small drawing of the page: where the ink is
      const s2 = 1.5, small = draw(page, s2), sx = small.width / pg.W, sy = small.height / pg.H;
      /** the darkest pixel along a ruled line (a white rule draws nothing) */
      const visible = (r: Box) => {
        const y = Math.min(small.height - 1, Math.max(0, Math.round(((r.y0 + r.y1) / 2) * sy))), x = Math.min(small.width - 1, Math.max(0, Math.round(((r.x0 + r.x1) / 2) * sx)));
        let min = 255;
        for (let k2 = 0; k2 <= 16; k2++) {
          const px = r.x1 - r.x0 > r.y1 - r.y0 ? Math.min(small.width - 1, Math.max(0, Math.round((r.x0 + ((r.x1 - r.x0) * k2) / 16) * sx))) : x;
          const py = r.x1 - r.x0 > r.y1 - r.y0 ? y : Math.min(small.height - 1, Math.max(0, Math.round((r.y0 + ((r.y1 - r.y0) * k2) / 16) * sy)));
          for (let d = -1; d <= 1; d++) {
            const yy = Math.min(small.height - 1, Math.max(0, py + (r.x1 - r.x0 > r.y1 - r.y0 ? d : 0))), xx = Math.min(small.width - 1, Math.max(0, px + (r.x1 - r.x0 > r.y1 - r.y0 ? 0 : d)));
            const i = (yy * small.width + xx) * 4; min = Math.min(min, (small.data[i] + small.data[i + 1] + small.data[i + 2]) / 3);
          }
        }
        return min < 235;
      };
      // ruled lines; those of the running header / footer (across the page near its top or bottom) are decoration
      const band = (b: Box) => b.y1 < pg.H * 0.1 || b.y0 > pg.H * 0.9;
      const hr = rl.h.filter((r) => visible(r) && !(band(r) && r.x1 - r.x0 > 0.5 * pg.W)), vr = rl.v.filter(visible);
      // tables drawn with rules: their text is theirs
      // a ruled region with drawn ink inside it besides its rules and its text (curves, marks: a plot's frame) is a figure
      const drawnIn = (t: Box) => {
        const y0 = Math.max(0, Math.floor(t.y0 * sy)), y1 = Math.min(small.height, Math.ceil(t.y1 * sy)), x0 = Math.max(0, Math.floor(t.x0 * sx)), x1 = Math.min(small.width, Math.ceil(t.x1 * sx));
        const masks = [...pg.lines.filter((l) => touches(l, t)), ...hr.filter((r) => touches(r, t)), ...vr.filter((r) => touches(r, t))].map((b) => [b.x0 * sx - 1.5, b.y0 * sy - 1.5, b.x1 * sx + 1.5, b.y1 * sy + 1.5]);
        let dark = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * small.width + x) * 4;
          if (small.data[i] + small.data[i + 1] + small.data[i + 2] < 450 && !masks.some((m2) => x >= m2[0] && x <= m2[2] && y >= m2[1] && y <= m2[3])) dark++;
        }
        return dark > 0.004 * (x1 - x0) * (y1 - y0) + 12;
      };
      let tables = ruledTables(hr, vr, lines, pg.W).filter((t) => !drawnIn(t) && !pics.some(({ vis: im }) => area(im) > 0 && Math.min(im.x1, t.x1) - Math.max(im.x0, t.x0) > 0 && Math.min(im.y1, t.y1) - Math.max(im.y0, t.y0) > 0.3 * (t.y1 - t.y0)));
      const inTable = (b: Box) => tables.some((t) => centreIn(b, t, 1));
      // figures: every picture of the PDF — the owner's strict rule (21 Nov 2026: "Don't drop any images from the original
      // page at all … preserve all original images exactly"): whatever its size, also a logo repeated in the running header
      // or footer, also one that fills the page — + drawings found as ink outside the text and outside the pictures (every
      // line's ink is text — also of the running headers left out, or their ink would come back as a "figure"), minus rules
      // (a footnote's, a table's)
      const skip = [...pg.lines, ...pg.vertical, ...tables].map((l) => [l.x0 * sx - 2, l.y0 * sy - 2, (l.x1 - l.x0) * sx + 4, (l.y1 - l.y0) * sy + 4] as [number, number, number, number]);
      const ink = ip.inkRegions(small, skip, { thr: 215, dil: 7, minArea: Math.round(36 * 36 * sx * sy) }).filter((r) => r.w > 4 && r.h > 4).map((r) => ({ x0: r.x / sx, y0: r.y / sy, x1: (r.x + r.w) / sx, y1: (r.y + r.h) / sy }));
      const decoration = (f: Fig) => o.removeHeaders && band(f) && ((imageCount.get(imageKey(f)) || 0) >= repeatMin || headers.some((l) => Math.min(l.y1, f.y1) - Math.max(l.y0, f.y0) > 0));
      // a picture with running text over it (a slide's background) stands before the page's text exactly as it is, and the
      // text is read as text
      const backdrops = pics.filter((p) => area(p.vis) >= 0.3 * pg.W * pg.H && lines.some((l) => running(l) && centreIn(l, p.vis, 1)));
      const shown = pics.filter((p) => !backdrops.includes(p)).map((p) => ({ x0: p.vis.x0, y0: p.vis.y0, x1: p.vis.x1, y1: p.vis.y1 }));
      // a picture's own ink is no drawing (it would widen its figure)
      const drawings = ink.filter((f) => f.x1 - f.x0 >= 24 && f.y1 - f.y0 >= 18 && !decoration(f) && !pics.some((p) => meetArea(f, { x0: p.vis.x0 - 6, y0: p.vis.y0 - 6, x1: p.vis.x1 + 6, y1: p.vis.y1 + 6 }) >= 0.9 * area(f)));
      let figs = mergeBoxes([...shown, ...drawings].filter((f) => !inTable(f)));
      // lines inside a figure (labels in a diagram) and short lines touching it belong to the figure
      const label = (l: Line, f: Fig) => inside(l, f, 1) || (touches(l, f, 6) && l.text.length <= 40 && l.x1 - l.x0 <= 0.6 * (f.x1 - f.x0) && !/^(fig(ure)?|table|tab\.)\s*\d/i.test(l.text));
      for (let again = true; again;) {
        again = false;
        for (const f of figs) for (const l of lines) if (!inside(l, f, 0.5) && !inTable(l) && label(l, f)) { Object.assign(f, union(f, l)); again = true; }
        if (again) figs = mergeBoxes(figs);
      }
      // short lines beside a ruled region (the label of an arrow beside a diagram drawn with boxes) belong to it too
      for (const t of tables) for (const l of lines) {
        if (inTable(l) || inside(l, t, 1) || Math.min(l.y1, t.y1) - Math.max(l.y0, t.y0) <= 0) continue;
        if ((l.x0 >= t.x1 - 1 ? l.x0 - t.x1 : t.x0 - l.x1) <= 6 && l.text.length <= 40 && l.x1 - l.x0 <= 0.6 * (t.x1 - t.x0) && !/^(fig(ure)?|table|tab\.)\s*\d/i.test(l.text)) Object.assign(t, union(t, l));
      }
      const inFig = (b: Box) => figs.some((f) => inside(b, f, 1));
      // pieces drawn as pictures that draw nothing (spaces of a font without a Unicode map: Word's before an equation's
      // number) are left out
      const inkIn = (b: Box) => {
        const y0 = Math.max(0, Math.floor(b.y0 * sy)), y1 = Math.min(small.height, Math.ceil(b.y1 * sy)), x0 = Math.max(0, Math.floor(b.x0 * sx)), x1 = Math.min(small.width, Math.ceil(b.x1 * sx));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * small.width + x) * 4; if (small.data[i] + small.data[i + 1] + small.data[i + 2] < 600) return true; }
        return false;
      };
      for (const l of lines) {
        if (!l.runs.some((r) => 'pic' in r && !inkIn(r.pic))) continue;
        l.runs = l.runs.filter((r) => !('pic' in r) || inkIn(r.pic));
        const f = l.runs[0], z = l.runs[l.runs.length - 1];
        if (f && !('pic' in f)) f.t = f.t.replace(/^\s+/, '');
        if (z && !('pic' in z)) z.t = z.t.replace(/\s+$/, '');
        l.text = l.runs.map((r) => ('pic' in r ? '\uFFFC' : r.t)).join('');
        if (!l.runs.some((r) => 'pic' in r)) l.math = Math.min(l.math, l.chars - l.bad);
      }
      let rest = lines.filter((l) => !inTable(l) && !inFig(l));
      // the body text's size: the size most characters of the page have
      const bySize = new Map<number, number>(); for (const l of rest) { const k2 = Math.round(l.size * 2) / 2; bySize.set(k2, (bySize.get(k2) || 0) + l.text.length); }
      const body = [...bySize].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 10;
      // running text: a line of words (a column's, a paragraph's); maths: a line mostly in a maths font, or without text (a
      // formula)
      const mathy = (l: Line) => (l.math >= 0.5 * l.chars && l.math >= 2) || (l.runs.length > 0 && l.runs.every((r) => 'pic' in r || !/\p{L}{2}/u.test(r.t)) && l.runs.some((r) => 'pic' in r));
      // a contents page: page numbers flush right (three or more sharing their right edge) belong to the entry on their
      // row — on their own they made a narrow column, a "part" of 3, 4, 5, 7 … (test_2, 21 Nov 2026)
      {
        const num = /^\s*(?:\d{1,4}|[ivxlcdm]{1,7})\s*$/i, nums = rest.filter((l) => num.test(l.text)).sort((a2, b2) => a2.x1 - b2.x1);
        const clusters: Line[][] = [];
        for (const l of nums) { const c = clusters[clusters.length - 1]; if (c && l.x1 - c[c.length - 1].x1 <= 2.5) c.push(l); else clusters.push([l]); }
        const gone = new Set<Line>();
        for (const c of clusters) {
          if (c.length < 3) continue;
          const pairs = c.map((nl) => {
            const row = (o: Line) => Math.abs(o.base - nl.base) <= 0.4 * Math.max(o.size, nl.size);
            const t = rest.filter((o) => o !== nl && !num.test(o.text) && !gone.has(o) && o.x1 <= nl.x0 + 1 && row(o)).sort((a2, b2) => b2.x1 - a2.x1)[0];
            if (!t || mathy(t) || !/\p{L}{3}/u.test(t.text) || (t.text.length >= 50 && running(t))) return null;
            // an entry is the first thing on its row after the column of numbers to its left (or the page's edge) — in a
            // table of three columns the middle cell has another cell before it, and the row stays a table's
            const edge = Math.max(0, ...clusters.filter((c2) => c2.length >= 3 && c2[0].x1 < nl.x0).map((c2) => c2[c2.length - 1].x1));
            return rest.some((o) => o !== t && o !== nl && row(o) && o.x0 >= edge - 1 && o.x1 <= t.x0 + 1) ? null : [t, nl] as const;
          });
          if (pairs.filter(Boolean).length < Math.max(3, 0.7 * c.length)) continue;
          for (const pr of pairs) {
            if (!pr) continue;
            const [t, nl] = pr;
            t.runs = [...t.runs, { t: ' … ' }, ...nl.runs];
            t.text = `${t.text} … ${nl.text}`;
            t.x1 = nl.x1; t.y0 = Math.min(t.y0, nl.y0); t.y1 = Math.max(t.y1, nl.y1);
            t.chars += nl.chars; t.math += nl.math; t.bad += nl.bad; t.frags = [...t.frags, ...nl.frags]; t.keep = true;
            gone.add(nl);
          }
        }
        if (gone.size) rest = rest.filter((l) => !gone.has(l));
      }
      // tables without rules. A line of running text is no cell: in two columns a row of the other column's text beside a
      // formula's pieces made a "table" across the page (test_2, 21 Nov 2026), and neither is an entry of a contents page.
      // Rows that are mostly maths are a formula, and a paragraph's line inside the rows ends the table
      const aligned = alignedTables(rest.filter((l) => !running(l) && !l.keep), pg.W, body).filter((t) => {
        const ins = rest.filter((l) => centreIn(l, t, 1)), all = ins.reduce((k, l) => k + l.chars, 0);
        return !ins.some(running) && ins.reduce((k, l) => k + l.math, 0) < 0.5 * all;
      });
      (globalThis as any).__epubDebugTables?.(pageNo, tables, aligned);
      if (aligned.length) { tables = mergeBoxes([...tables, ...aligned], 1); rest = rest.filter((l) => !inTable(l)); }
      // display equations: lines mostly in a maths font or without text (a formula), with the parts stacked above and below
      // them (a fraction's numerator and denominator), and what stands inside them; the equation's number beside it
      const cand = rest.filter((l) => mathy(l) && !LABEL.test(l.text)), up = cand.map((_, i) => i);
      const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
      for (let i = 0; i < cand.length; i++) for (let k2 = i + 1; k2 < cand.length; k2++) {
        // distances in ems of the page's text (a formula's pieces are often set small: limits, exponents)
        const p = cand[i], q = cand[k2], z = Math.max(p.size, q.size, body);
        const vgap = Math.max(p.y0, q.y0) - Math.min(p.y1, q.y1), hgap = Math.max(p.x0, q.x0) - Math.min(p.x1, q.x1);
        // on one row, up to 1.5 em apart (the space after a big sum); close above / below; or stacked over each other a little
        // further apart (the top and bottom of a tall bracket whose middle is drawn as a line, the limits of a sum)
        const over = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
        // pieces of one row further apart (the room around a big sum with wide limits, a quad between two formulas) — where
        // a line of running text spans the gap: a gutter between columns is never spanned (another_one (S150), 21 Nov 2026)
        const spanned = () => { const a2 = Math.min(p.x1, q.x1), b2 = Math.max(p.x0, q.x0); return rest.some((l) => running(l) && l.x0 <= a2 + 1 && l.x1 >= b2 - 1); };
        if ((vgap < 0 && (hgap <= 1.5 * z || (hgap <= 4 * z && spanned()))) || (vgap <= 0.6 * z && hgap <= 1.0 * z) || (over >= 0.5 * Math.min(p.x1 - p.x0, q.x1 - q.x0) && vgap <= 1.5 * z)) up[find(i)] = find(k2);
      }
      const groups0 = new Map<number, Line[]>();
      for (let i = 0; i < cand.length; i++) { const g = groups0.get(find(i)) || []; g.push(cand[i]); groups0.set(find(i), g); }
      // the lines of one display (an equation over two lines, an array) are less than an em apart and overlap
      const gl = [...groups0.values()];
      for (let again = true; again;) {
        again = false;
        for (let i = 0; i < gl.length && !again; i++) for (let k2 = i + 1; k2 < gl.length; k2++) {
          const p = unionAll(gl[i]), q = unionAll(gl[k2]);
          const vgap = Math.max(p.y0, q.y0) - Math.min(p.y1, q.y1), over = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
          if (vgap <= 0.9 * body && over >= 0.3 * Math.min(p.x1 - p.x0, q.x1 - q.x0)) { gl[i] = [...gl[i], ...gl[k2]]; gl.splice(k2, 1); again = true; break; }
        }
      }
      // a line of a paragraph that happens to be mostly maths ("Here δξ₊ = … are the") stays text: a display stands apart,
      // with more room above and below it than the lines of a paragraph have
      const inPara = (g: Line[]) => {
        if (g.length !== 1 || !/\p{L}{3}/u.test(g[0].runs.map((r) => ('pic' in r ? '' : r.t)).join(' '))) return false;
        const l = g[0], col = rest.filter((o) => o !== l && !cand.includes(o) && o.x0 < l.x1 && o.x1 > l.x0);
        const above = col.filter((o) => o.y1 <= l.y0 + 1).sort((a2, b2) => b2.y1 - a2.y1)[0], below = col.filter((o) => o.y0 >= l.y1 - 1).sort((a2, b2) => a2.y0 - b2.y0)[0];
        // (in a list the next line of an item starts under the item's text, an em or two right of its number)
        return (!!above && l.y0 - above.y1 <= 0.5 * body && l.x0 >= above.x0 - 2 && l.x0 <= above.x0 + 2.5 * body) || (!!below && below.y0 - l.y1 <= 0.5 * body && below.x0 >= l.x0 - 2.5 * body && below.x0 <= l.x0 + 2);
      };
      const groups = new Map(gl.filter((g) => !inPara(g)).map((g, i) => [i, g]));
      const eqs: Array<Item & { kind: 'eq' }> = [], hrs: Array<Item & { kind: 'hr' }> = [];
      const taken = new Set<Line>();
      for (const g of groups.values()) {
        let f = unionAll(g);
        // what stands inside the formula (a word in a text font: "cos", "for") is part of it, and so are small pieces right
        // beside it — the limits under a sum, a denominator or a closing comma set in the text font
        for (let more = true; more;) {
          more = false;
          for (const l of rest) {
            if (g.includes(l) || taken.has(l) || LABEL.test(l.text) || area(l) <= 0) continue;
            const ov = Math.max(0, Math.min(l.x1, f.x1) - Math.max(l.x0, f.x0)) * Math.max(0, Math.min(l.y1, f.y1) - Math.max(l.y0, f.y0));
            const z = Math.max(l.size, g[0].size), small = l.chars <= 6 && !/\p{L}{4}/u.test(l.text);
            const below = l.y0 >= f.y1 - 1 ? l.y0 - f.y1 : f.y0 - l.y1, beside = l.x0 >= f.x1 - 1 ? l.x0 - f.x1 : f.x0 - l.x1;
            const near = small && ((below <= 0.8 * z && l.x0 < f.x1 && l.x1 > f.x0) || (beside <= 1.2 * z && Math.min(l.y1, f.y1) - Math.max(l.y0, f.y0) > 0));
            // a short line right beside the formula within its height (the parts of a fraction set in the text font,
            // "Ω_compressed" over "Ω_expanded"): a display stands alone on its rows, so what is that close is its own
            const stacked = l.text.length <= 30 && !running(l) && beside <= 1.0 * z && (l.y0 + l.y1) / 2 >= f.y0 && (l.y0 + l.y1) / 2 <= f.y1;
            // words in small type right under or over it (the limits of a sum: "j at FS crossings", "along C")
            const limits = l.size <= 0.8 * body && l.text.length <= 40 && !running(l) && below <= 0.8 * z && l.x0 < f.x1 && l.x1 > f.x0;
            if (ov >= 0.5 * area(l) || near || stacked || limits) { g.push(l); f = union(f, l); more = true; }
          }
        }
        // the picture takes in the ink that runs out of the boxes (MuPDF's box of a big Σ or a tall bracket is too short),
        // up to an em and a bit each way, never into a line that is not the formula's
        {
          const darkIn = (b: Box) => {
            const y0 = Math.max(0, Math.floor(b.y0 * sy)), y1 = Math.min(small.height, Math.ceil(b.y1 * sy)), x0 = Math.max(0, Math.floor(b.x0 * sx)), x1 = Math.min(small.width, Math.ceil(b.x1 * sx));
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * small.width + x) * 4; if (small.data[i] + small.data[i + 1] + small.data[i + 2] < 600) return true; }
            return false;
          };
          const blocked = (b: Box) => rest.some((l) => !g.includes(l) && touches(l, b, 0.5));
          const st = 1 / sy, lim = 1.2 * body;
          for (let d = 0; d < lim; d += st) { const b: Box = { x0: f.x0, y0: f.y0 - st, x1: f.x1, y1: f.y0 }; if (b.y0 < 0 || !darkIn(b) || blocked(b)) break; f = { ...f, y0: b.y0 }; }
          for (let d = 0; d < lim; d += st) { const b: Box = { x0: f.x0, y0: f.y1, x1: f.x1, y1: f.y1 + st }; if (b.y1 > pg.H || !darkIn(b) || blocked(b)) break; f = { ...f, y1: b.y1 }; }
          for (let d = 0; d < lim; d += st) { const b: Box = { x0: f.x0 - st, y0: f.y0, x1: f.x0, y1: f.y1 }; if (b.x0 < 0 || !darkIn(b) || blocked(b)) break; f = { ...f, x0: b.x0 }; }
          for (let d = 0; d < lim; d += st) { const b: Box = { x0: f.x1, y0: f.y0, x1: f.x1 + st, y1: f.y1 }; if (b.x1 > pg.W || !darkIn(b) || blocked(b)) break; f = { ...f, x1: b.x1 }; }
        }
        // its number: on the same row, to the right, alone
        // (with nothing else between them on that row: the number of an equation in the next column is not its number)
        const between = (l: Line) => rest.some((o) => o !== l && !g.includes(o) && o.x0 >= f.x1 - 1 && o.x1 <= l.x0 + 1 && Math.min(o.y1, l.y1) - Math.max(o.y0, l.y0) > -2 && Math.min(o.y1, f.y1) - Math.max(o.y0, f.y0) > 0);
        const labels = rest.filter((l) => !g.includes(l) && !taken.has(l) && LABEL.test(l.text) && l.x0 >= f.x1 - 1 && l.x0 - f.x1 < 0.6 * pg.W && (l.y0 + l.y1) / 2 >= f.y0 - 2 && (l.y0 + l.y1) / 2 <= f.y1 + 2 && !between(l));
        for (const l of g) taken.add(l);
        for (const l of labels) taken.add(l);
        // a line that only draws a rule (a footnote's separator made of glyphs) is a rule
        const inkRows = (() => {
          const y0 = Math.max(0, Math.floor(f.y0 * sy)), y1 = Math.min(small.height, Math.ceil(f.y1 * sy)), x0 = Math.max(0, Math.floor(f.x0 * sx)), x1 = Math.min(small.width, Math.ceil(f.x1 * sx));
          let rows = 0;
          for (let y = y0; y < y1; y++) { let dark = false; for (let x = x0; x < x1 && !dark; x++) { const i = (y * small.width + x) * 4; dark = small.data[i] + small.data[i + 1] + small.data[i + 2] < 600; } if (dark) rows++; }
          return rows;
        })();
        if (g.length === 1 && !labels.length && inkRows <= 3 && f.x1 - f.x0 > 30) { hrs.push({ kind: 'hr', f }); continue; }
        // a lone speck (a stroke, a dot of a font without a Unicode map, off by itself) is no equation
        if (!labels.length && f.x1 - f.x0 <= 0.6 * g[0].size && f.y1 - f.y0 <= 1.6 * g[0].size) continue;
        if (labels.length > 1) { f = union(f, unionAll(labels)); eqs.push({ kind: 'eq', f, label: '', lines: g }); }
        else eqs.push({ kind: 'eq', f, label: labels[0]?.text || '', lines: g });
      }
      rest = rest.filter((l) => !taken.has(l));
      // groups that grew into each other are one formula (else the same ink is drawn twice)
      for (let again = true; again;) {
        again = false;
        for (let i = 0; i < eqs.length && !again; i++) for (let k2 = i + 1; k2 < eqs.length; k2++) {
          const p = eqs[i].f, q = eqs[k2].f, ov = Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));
          if (ov > 0.1 * Math.min(area(p), area(q))) { eqs[i] = { kind: 'eq', f: union(p, q), label: eqs[i].label || eqs[k2].label, lines: [...eqs[i].lines, ...eqs[k2].lines] }; eqs.splice(k2, 1); again = true; break; }
        }
      }
      // a footnote's separator: a short rule at the left of the text with notes under it
      for (const r of hr) {
        if (inTable(r) || inFig(r) || eqs.some((e) => touches(e.f, r, 1)) || r.x1 - r.x0 < 30 || r.x1 - r.x0 > 0.5 * pg.W || r.y0 < pg.H * 0.4) continue;
        if (rest.some((l) => l.y0 - 2 <= r.y1 && l.y1 + 2 >= r.y0 && l.x0 <= r.x1 && l.x1 >= r.x0)) continue;   // a rule in a line: an underline
        if (hrs.some((h) => (r.y0 + r.y1) / 2 >= h.f.y0 - 1 && (r.y0 + r.y1) / 2 <= h.f.y1 + 1 && Math.min(r.x1, h.f.x1) - Math.max(r.x0, h.f.x0) > 0.5 * (r.x1 - r.x0))) continue; // drawn twice: a rule inside a line of rule glyphs (AJUR)
        if (rest.some((l) => l.y0 >= r.y1 && l.y0 - r.y1 <= 18 && Math.abs(l.x0 - r.x0) <= 12)) hrs.push({ kind: 'hr', f: r });
      }
      const items: Item[] = [
        ...rest.map((l) => ({ kind: 'line' as const, l })), ...figs.map((f) => ({ kind: 'fig' as const, f })),
        ...tables.map((f) => ({ kind: 'table' as const, f })), ...eqs, ...hrs,
      ];
      const boxOf = (it: Item) => (it.kind === 'line' ? it.l : it.f);
      // an equation, a table or a rule stands in its text column: for the reading order it is as wide as the lines just
      // above and below it (a short line beside a centred equation is no column of its own) — unless something stands
      // beside it on its own rows
      const wide = new Map<Item, Box>();
      for (const it of items) {
        if (it.kind === 'line' || it.kind === 'fig') continue;
        const f = it.f;
        if (rest.some((l) => Math.min(l.y1, f.y1) - Math.max(l.y0, f.y0) > 1 && (l.x1 <= f.x0 || l.x0 >= f.x1))) continue;
        const near = rest.filter((l) => (l.y1 <= f.y0 + 1 ? f.y0 - l.y1 : l.y0 >= f.y1 - 1 ? l.y0 - f.y1 : Infinity) <= 6 * body && l.x0 < f.x1 && l.x1 > f.x0);
        if (near.length) wide.set(it, { x0: Math.min(f.x0, ...near.map((l) => l.x0)), y0: f.y0, x1: Math.max(f.x1, ...near.map((l) => l.x1)), y1: f.y1 });
      }
      // gutters from 0.45 × the body text (the Federal Register's are 7.5 pt); a column holds three lines and is a tenth
      // of the page high (a note in the margin is none); a figure or a table beside text is a part of its own
      const heavy = items.map((it) => (it.kind === 'fig' || it.kind === 'table') && area(it.f) >= 0.015 * pg.W * pg.H);
      const r = tc.xycut(items.map((it) => { const b = wide.get(it) || boxOf(it); return [b.x0, b.y0, b.x1, b.y1]; }), Math.max(3, 0.45 * body), 2, pg.H * 0.1, heavy, 0.8 * body);
      const partOf = r.part || r.order.map(() => 0);
      (globalThis as any).__epubDebug?.(pageNo, items.map((it, i) => ({ kind: it.kind, box: boxOf(it), xy: wide.get(it), text: it.kind === 'line' ? it.l.text : it.kind === 'eq' ? it.label : '', pos: r.order.indexOf(i), part: partOf[r.order.indexOf(i)] })));
      // the page's usual line pitch (top to top, same column) decides what counts as a blank line
      const sorted = [...rest].sort((a, b) => a.x0 - b.x0 || a.cy0 - b.cy0), pagePitch = median(sorted.slice(1).map((l, i) => l.cy0 - sorted[i].cy0).filter((g, i) => g > 0 && g < 40 && Math.abs(sorted[i + 1].x0 - sorted[i].x0) < 30));
      // segments: runs of one part (the whole page when nothing stands side by side)
      const sided = partOf.some((p) => p > 0);
      const segs: Array<{ part: number; items: Item[] }> = [];
      r.order.forEach((ix, p) => { const c = sided ? partOf[p] : 0; if (!segs.length || segs[segs.length - 1].part !== c) segs.push({ part: c, items: [] }); segs[segs.length - 1].items.push(items[ix]); });
      const columns = new Set(r.col.filter((c) => c > 0)).size;
      const wOf = (its: Item[]) => { const b = its.map(boxOf); return Math.max(...b.map((x) => x.x1)) - Math.min(...b.map((x) => x.x0)); };
      const colW = Math.min(...segs.filter((sg) => sg.part > 0 || !sided).map((sg) => wOf(sg.items)).filter((w) => w > 40), pg.W);
      // figures, tables and equations are drawn so that a column is as wide as the e-reader's screen
      const scale = Math.min(o.width / colW, (3 * o.width) / pg.W);
      // (a figure wider than a column — across the page — is drawn as wide as the screen, not wider)
      const clampBox = (f: Fig) => ({ x0: Math.max(0, f.x0), y0: Math.max(0, f.y0), x1: Math.min(pg.W, f.x1), y1: Math.min(pg.H, f.y1) });
      const crop = (f: Fig, attrs: string) => { const b = clampBox(f); return region(b, Math.min(scale, o.width / Math.max(1, b.x1 - b.x0)), attrs); };
      // a formula in a line: drawn about 56 px to the em on a Paperwhite, set in the line at the text's size
      const pxEm = o.width / 22;
      const inline = async (l: Line) => {
        for (const run of l.runs) {
          if (!('pic' in run) || run.html) continue;
          const b = run.pic, z = l.size;
          const c = { x0: b.x0 - 0.6, y0: Math.min(b.y0, l.cy0) - 0.4, x1: b.x1 + 0.6, y1: Math.max(b.y1, l.cy1) + 0.4 };
          const em = (v: number) => `${(v / z).toFixed(2)}em`;
          run.html = await addImage(draw(c, pxEm / z), `class="m" alt="formula" style="height:${em(c.y1 - c.y0)};width:${em(c.x1 - c.x0)};vertical-align:-${em(Math.max(0, c.y1 - l.base))}"`);
        }
      };
      const parts: string[] = [];
      let partNo = 0;
      for (const s of segs) {
        if (sided) { partNo++; if (o.labels) parts.push(`<h4 class="part">Page ${pageNo}, part ${partNo}</h4>`); }
        const segLines = s.items.flatMap((it) => (it.kind === 'line' ? [it.l] : it.kind === 'eq' ? it.lines : []));
        const chars = segLines.reduce((a, l) => a + l.chars, 0), bad = segLines.reduce((a, l) => a + l.bad, 0);
        if (o.mode === 'columns' || (chars && bad > 0.5 * chars)) {
          // the part as one picture (chosen, or most of its text cannot be read)
          const b = s.items.map(boxOf);
          parts.push(`<div class="fig">${await crop({ x0: Math.min(...b.map((x) => x.x0)) - 2, y0: Math.min(...b.map((x) => x.y0)) - 2, x1: Math.max(...b.map((x) => x.x1)) + 2, y1: Math.max(...b.map((x) => x.y1)) + 2 }, 'alt=""')}</div>`);
          continue;
        }
        // text as text (formulas in its lines as small pictures); a figure, a table, an equation as a picture
        let run: Line[] = [];
        const emit = async () => { if (!run.length) return; for (const l of run) await inline(l); parts.push(toHtml(run, body, pagePitch)); run = []; };
        for (const it of s.items) {
          if (it.kind === 'line') { run.push(it.l); continue; }
          await emit();
          if (it.kind === 'hr') { parts.push('<hr class="fn"/>'); continue; }
          const pad = it.kind === 'fig' ? { x: 3, y: 3 } : { x: 2, y: 1.5 }, f = it.f;
          // an equation or a table is set at the size of the text around it (in em: it grows with the reader's font)
          const em = it.kind === 'fig' ? '' : ` style="width:${((f.x1 - f.x0 + 2 * pad.x) / body).toFixed(2)}em;max-width:100%;height:auto"`;
          const box = { x0: f.x0 - pad.x, y0: f.y0 - pad.y, x1: f.x1 + pad.x, y1: f.y1 + pad.y };
          let img: string;
          if (it.kind === 'fig') {
            // a figure is as wide on the screen as it is in its column; a figure that is one picture of the PDF and nothing
            // else is that picture's own bytes (the strict rule)
            const attrs = `alt="figure" style="width:${Math.min(100, ((f.x1 - f.x0) / colW) * 100).toFixed(1)}%"`;
            const ps = pics.filter((p) => meetArea(p.vis, f) > 0.5 * area(p.vis));
            const one = ps.length === 1 && Math.abs(ps[0].vis.x0 - f.x0) <= 1.5 && Math.abs(ps[0].vis.y0 - f.y0) <= 1.5 && Math.abs(ps[0].vis.x1 - f.x1) <= 1.5 && Math.abs(ps[0].vis.y1 - f.y1) <= 1.5 ? ps[0] : null;
            const b = clampBox(box), sc = Math.min(scale, o.width / Math.max(1, b.x1 - b.x0));
            img = one ? await exact(one, b, sc, attrs) : await region(b, sc, attrs);
          } else img = await crop(box, `alt="${it.kind === 'table' ? 'table' : 'equation'}"${em}`);
          parts.push(`<div class="fig${it.kind === 'table' ? ' tbl' : ''}">${img}</div>`);
          if (it.kind === 'eq' && it.label) parts.push(`<p class="eqno">${esc(it.label.trim())}</p>`);
        }
        await emit();
      }
      // a picture under the page's running text (a slide's background): first, exactly as it is
      for (const b of [...backdrops].reverse()) parts.unshift(`<div class="fig full">${await exact(b, b.vis, o.width / pg.W, 'alt="picture" style="width:100%"', true)}</div>`);
      // text in the margin that runs up or down the page (kept only when running headers are kept)
      if (!o.removeHeaders && pg.vertical.length) parts.push(...pg.vertical.map((l) => `<p class="margin">${esc(l.text)}</p>`));
      html = parts.join('\n');
      rep = { page: pageNo, columns: columns > 1 ? columns : 0, parts: sided ? partNo : 0, figures: figs.length + backdrops.length, tables: tables.length, equations: eqs.length, how: o.mode === 'columns' ? 'columns' : 'text' };
    }
    dl.destroy?.(); rl.release();
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
  files['OEBPS/style.css'] = strToU8(STYLE);
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
