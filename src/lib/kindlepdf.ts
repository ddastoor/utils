// PDF for Kindle (potentials #109; owner, 21 Nov 2026: "technical and scientific PDFs kept exactly as typeset — formulas,
// figures and tables as the authors laid them out, nothing reflowed — but readable on a Kindle's 6 – 7″ screen"). Each page
// of the PDF: its running heads and page numbers left out (when chosen); its regions in reading order — a full-width title,
// each column, a figure across the page — by textcore's XY-cut (the parts of PDF → EPUB); each region cut into pieces as
// high as the screen at the gaps between lines (imgproc.wasm, wasm/imgproc/kindle.c: never through a line's letters, a
// figure, a formula, a figure and its caption); the pieces laid out on pages of the screen's shape, as wide as the page's
// columns, with "p. 3 · 2 of 4" at the foot of each.
// **The pieces stay vector:** each is the page itself, drawn as a Form XObject and clipped to the piece — its own text,
// fonts and drawings, pictures at their own resolution — with the text outside the piece removed by MuPDF's redaction, so
// that the Kindle can still look words up and search and finds every word once (a clip alone hides text, it does not take
// it away). Fonts and pictures are shared by all the pieces (one graft map). Scanned pages become pictures: greyscale, the
// paper whitened and the contrast raised for e-ink (the owner: "pictures only for scanned pages").
import { mupdf, winAnsi, pdfString, textWidth } from './pdf';
import { readPage, readRules, headerKeys, type Line } from './pdf2epub';
import { textcore } from '../wasm/textcore';
import { imgprocDirect, type Img } from '../wasm/imgproc';

/** Kindles and their screens in pixels (portrait). */
export const KINDLES = [
  { id: 'pw7', name: 'Paperwhite 7″ (2024), Colorsoft, Oasis', w: 1264, h: 1680 },
  { id: 'pw68', name: 'Paperwhite 6.8″ (2021) and Signature', w: 1236, h: 1648 },
  { id: 'kindle', name: 'Kindle 6″', w: 1072, h: 1448 },
  { id: 'scribe', name: 'Scribe 10.2″', w: 1860, h: 2480 },
] as const;

export interface KindleOptions {
  /** the screen in pixels, portrait: [width, height] */
  screen: [number, number];
  /** leave out running heads and page numbers (lines repeated at the top or the foot of the pages) */
  removeHeaders: boolean;
  /** "p. 3 · 2 of 4" at the foot of every screen */
  labels: boolean;
  /** pages to take (0-based); all when empty */
  pages?: number[];
  title?: string;
  /** asked between pages: false ends the conversion with `Stopped` */
  alive?: () => boolean;
}
export interface KindlePage {
  /** 1-based */
  page: number;
  screens: number;
  /** regions read one after another (a title, each column, a figure across the page …) */
  regions: number;
  /** regions side by side (columns) */
  columns: number;
  how: 'vector' | 'picture' | 'empty';
  /** pieces drawn smaller than the page's text: a figure, a formula, a table taller than a screen */
  smaller: number;
  note?: string;
}
export interface KindleEngines {
  m: any;
  tc: { xycut(boxes: number[][], gx?: number, gy?: number, minh?: number, heavy?: boolean[], hd?: number): { order: number[]; col: number[]; part: number[] } };
  ip: {
    expand(s: Uint8Array | Uint8ClampedArray, w: number, h: number, comps: number): Img;
    inkRegions(i: Img, skip: Array<[number, number, number, number]>, o?: { thr?: number; dil?: number; minArea?: number; max?: number }): Array<{ x: number; y: number; w: number; h: number }>;
    blankRows(img: Img, x0: number, y0: number, x1: number, y1: number, thr: number, prot: Array<[number, number]>): Uint8Array;
    nextCut(blank: Uint8Array, from: number, maxh: number, minfill: number, wide: number): { cut: number; over: number };
    docEnhance(img: Img, mode: 0 | 1 | 2): Img;
    crop(img: Img, x: number, y: number, w: number, h: number): Img;
    resize(img: Img, w: number, h: number): Img;
  };
  /** RGBA → JPEG bytes (greyscale JPEG when `grey`). */
  jpeg(img: Img, grey: boolean, quality?: number): Promise<Uint8Array>;
}
export class Stopped extends Error { constructor() { super('The conversion was stopped.'); this.name = 'Stopped'; } }

type Box = { x0: number; y0: number; x1: number; y1: number };
type Mat = [number, number, number, number, number, number];
/** a piece on a screen: rows [a, b) of a region (px of the drawing at S px/pt), at y (pt from the top of the usable
 *  area) and scale s */
type Placed = { region: Region; a: number; b: number; y: number; s: number; rule?: boolean };
/** a region of a page: its box (pt), part (0: the full-width flow), rows of the drawing where a piece may end, its
 *  protections (soft: dropped when a whole screen holds no gap), and how much text it holds (characters, or ink) */
type Region = { box: Box; part: number; rows: number; blank: Uint8Array; soft: Array<[number, number]>; hard: Array<[number, number]>; scan: boolean; weight: number };

/** px per pt of the drawing that finds the gaps (2: a line gap of 1.5 pt is 3 rows) */
const S = 2;
/** a row is blank when no pixel is darker than this: light tints and the anti-aliased fringes of letters count as paper
 *  (lines set tight — 10 on 10 pt — leave a point between them: two rows, both grey at their edges) */
const BLANK = 160;
/** what counts as drawn when looking for figures and rules (light grey lines of a plot too) */
const INK = 200;
/** the screen's margins (shares of its width and height) and the label strip (of its height) */
const MX = 0.025, MY = 0.018, LAB = 0.03;
/** a piece fills at least this share of the room before a wider gap is preferred to a lower one */
const FILL = 0.65;
const CAPTION = /^\s*(?:fig(?:ure)?\.?|table|tab\.|scheme|chart|plate|photo|algorithm|listing)\s*[\dIVXivx]/i;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const median = (a: number[]) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const mul = (a: Mat, b: Mat): Mat => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const num = (v: number) => String(+v.toFixed(4));

async function appEngines(): Promise<KindleEngines> {
  const [m, tc, ip, { encodeImg }] = await Promise.all([mupdf(), textcore(), imgprocDirect(), import('./imgio')]);
  return { m, tc, ip, jpeg: async (img, grey, quality) => new Uint8Array(await (await encodeImg(img, 'jpeg', quality ?? 80, grey ? { color_space: 1 } : {})).arrayBuffer()) };
}

/** The label at the foot of a screen: page 3, screen 2 of 4. */
export const screenLabel = (page: number, k: number, n: number) => `p. ${page} · ${k} of ${n}`;

/** The size of a screen's page in points: as wide as the page's columns (`ref`, pt) and its margins, the screen's shape. */
export function screenPage(ref: number, screen: [number, number], labels: boolean) {
  const Wp = ref / (1 - 2 * MX), Hp = (Wp * screen[1]) / screen[0];
  const mx = MX * Wp, my = MY * Hp, ls = labels ? LAB * Hp : 0;
  return { Wp, Hp, mx, my, ls, Wu: Wp - 2 * mx, Hu: Hp - 2 * my - ls };
}

/**
 * Pieces of the regions of one page laid out on screens: each region cut at its gaps (rows of `blank`) to fill the room
 * left on the screen; a region that holds no gap within a whole screen (a tall figure) is tried once more without its
 * soft protections (a table, a vector figure: its rows of text may be cut between), then drawn smaller to fit. `relax`
 * makes a region's blank rows again without the soft protections. Exported for the unit suite.
 */
export function layOut(regions: Region[], room: { Wu: number; Hu: number }, body: number, nextCut: KindleEngines['ip']['nextCut'], relax: (r: Region) => Uint8Array): { screens: Placed[][]; smaller: number } {
  // a gap of this many rows ends a paragraph (or stands round a heading, a figure): more than two lines of text leave
  // between them, less than a paragraph's spacing adds
  const wide = Math.max(3, 0.45 * body * S);
  const screens: Placed[][] = [];
  let cur: Placed[] = [], y = 0, prevPart = -1, smaller = 0;
  const flush = () => { if (cur.length) screens.push(cur); cur = []; y = 0; };
  for (const r of regions) {
    const rw = r.box.x1 - r.box.x0, s = Math.min(1, room.Wu / Math.max(1, rw));
    let from = 0, relaxed = false, first = true;
    while (from < r.rows && r.blank[from]) from++;
    while (from < r.rows) {
      if (y > 0 && first) {
        const gap = Math.max(4, 0.9 * body * s);
        if (y + gap + 2.5 * body * s >= room.Hu) flush(); else { y += gap; }
      }
      const rows = ((room.Hu - y) / s) * S;
      const rest = r.rows - from;
      const rule = first && cur.length > 0 && r.part > 0 && prevPart > 0 && r.part !== prevPart;
      if (rest <= rows) { cur.push({ region: r, a: from, b: r.rows, y, s, rule }); y += (rest / S) * s; from = r.rows; break; }
      if (y > 0 && rows < 2.5 * body * S) { flush(); first = false; continue; }
      const { cut, over } = nextCut(r.blank, from, rows, FILL, wide);
      if (cut > from && cut < r.rows) {
        cur.push({ region: r, a: from, b: cut, y, s, rule }); flush(); first = false;
        from = cut; while (from < r.rows && r.blank[from]) from++;
        continue;
      }
      if (y > 0) { flush(); first = false; continue; }
      if (!relaxed && r.soft.length) { relaxed = true; r.blank = relax(r); continue; }
      // a whole screen holds no gap: the piece runs to the next gap and is drawn smaller
      const end = over > from ? over : r.rows, h = (end - from) / S, s2 = Math.min(s, room.Hu / h);
      cur.push({ region: r, a: from, b: end, y: 0, s: s2, rule }); smaller++; flush(); first = false;
      from = end; while (from < r.rows && r.blank[from]) from++;
    }
    prevPart = r.part;
  }
  flush();
  return { screens, smaller };
}

export async function pdfForKindle(doc: any, o: KindleOptions, onProgress?: (done: number, of: number) => void, engines?: KindleEngines): Promise<{ pdf: Uint8Array; pages: KindlePage[]; screens: number }> {
  const { m, tc, ip, jpeg } = engines || await appEngines();
  const alive = () => { if (o.alive && !o.alive()) throw new Stopped(); };
  let lastYield = performance.now();
  const pause = async () => { if (performance.now() - lastYield > 30) { await tick(); lastYield = performance.now(); } alive(); };
  const n = doc.countPages(), list = (o.pages?.length ? o.pages : Array.from({ length: n }, (_, i) => i)).filter((i) => i >= 0 && i < n);
  if (!list.length) throw new Error(n ? 'None of the chosen pages is in this PDF.' : 'This PDF has no pages.');
  // comments, stamps and filled form fields are drawn into the pages, so that the pieces show them
  try { doc.bake?.(true, true); } catch { /* a PDF MuPDF cannot bake keeps its page content */ }
  // pass 1: the text of every chosen page (the running heads repeat)
  const pages: Array<{ i: number; p: any; W: number; H: number; lines: Line[]; vertical: Line[] }> = [];
  for (const [k, i] of list.entries()) {
    if (k % 10 === 0) onProgress?.(k / 4, list.length);
    const p = doc.loadPage(i), [x0, y0, x1, y1] = p.getBounds();
    const r = readPage(p, x1 - x0, y1 - y0);
    pages.push({ i, p, W: x1 - x0, H: y1 - y0, lines: r.lines, vertical: r.vertical });
    await pause();
  }
  const isHeader = o.removeHeaders ? headerKeys(pages) : () => false;
  const out = new m.PDFDocument(), map = out.newGraftMap(), helv = out.addSimpleFont(new m.Font('Helvetica'));
  const report: KindlePage[] = [], firstScreen = new Map<number, number>();
  let screensMade = 0;

  for (const [k, pg] of pages.entries()) {
    onProgress?.(list.length / 4 + (k * 3) / 4, list.length);
    const { p, W, H } = pg, pageNo = pg.i + 1;
    const lines = pg.lines.filter((l) => !isHeader(l, H)), heads = pg.lines.filter((l) => isHeader(l, H));
    const rl = readRules(m, p, doc);
    let rep: KindlePage = { page: pageNo, screens: 0, regions: 0, columns: 0, how: 'vector', smaller: 0 };
    try {
      const page: Box = { x0: 0, y0: 0, x1: W, y1: H };
      const pics = rl.pics.map((q) => ({ x0: Math.max(0, q.vis.x0), y0: Math.max(0, q.vis.y0), x1: Math.min(W, q.vis.x1), y1: Math.min(H, q.vis.y1) })).filter((b) => b.x1 - b.x0 > 0.5 && b.y1 - b.y0 > 0.5);
      const big = pics.some((b) => area(b) >= 0.5 * W * H);
      const scanned = big && (lines.length < 2 || (rl.hidden > 0 && rl.hidden >= 0.8 * (rl.hidden + rl.shown)));
      const sideways = pg.vertical.reduce((a, l) => a + l.text.length, 0) > lines.reduce((a, l) => a + l.text.length, 0);
      const img = drawPage(m, ip, p, S);
      const body = median(lines.flatMap((l) => Array(Math.max(1, Math.min(40, l.chars))).fill(l.size))) || 10;
      let regions: Region[] = [];
      if (scanned) {
        // a scanned page: its ink on the paper whitened (no text layer is used — the owner: pictures for scanned pages)
        const clean = ip.docEnhance({ ...img, data: new Uint8ClampedArray(img.data) }, 1);
        // the running heads, where the scan's OCR layer finds them (a head and its page number, at the top or the foot)
        const headBoxes = heads.map((l) => pad({ x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 }, 3, page));
        const blobs = ip.inkRegions(clean, [], { thr: 150, dil: 3, minArea: 24, max: 6000 }).map((b) => ({ x0: b.x / S, y0: b.y / S, x1: (b.x + b.w) / S, y1: (b.y + b.h) / S }))
          .filter((b) => !headBoxes.some((h) => (b.x0 + b.x1) / 2 >= h.x0 && (b.x0 + b.x1) / 2 <= h.x1 && (b.y0 + b.y1) / 2 >= h.y0 && (b.y0 + b.y1) / 2 <= h.y1));
        const bh = median(blobs.map((b) => b.y1 - b.y0)) || 10;
        regions = regionsOf(tc, blobs, blobs.map((b) => area(b) >= 0.015 * W * H), bh * 1.4, H).map((g) => {
          const box = pad(g.box, 1.5, page), hard = g.items.filter((b) => b.y1 - b.y0 > 3 * bh).map((b): [number, number] => [b.y0 * S, b.y1 * S]);
          return { box, part: g.part, rows: 0, blank: new Uint8Array(0), soft: [], hard, scan: true, weight: g.items.reduce((a, b) => a + (b.y1 - b.y0 <= 3 * bh ? area(b) : 0), 0) };
        });
        for (const r of regions) { r.blank = ip.blankRows(clean, r.box.x0 * S, r.box.y0 * S, r.box.x1 * S, r.box.y1 * S, 150, r.hard); r.rows = r.blank.length; }
        rep.how = 'picture'; rep.note = 'scanned page — its pieces are pictures';
      } else if (sideways) {
        // most of its text runs up or down the page (a table turned on its side): the page whole on one screen
        const ink = ip.inkRegions(img, [], { thr: INK, dil: 4, minArea: 16, max: 4000 });
        const box = ink.length ? ink.map((b) => ({ x0: b.x / S, y0: b.y / S, x1: (b.x + b.w) / S, y1: (b.y + b.h) / S })).reduce(union) : null;
        if (box) { const b = pad(box, 2, page); regions = [{ box: b, part: 0, rows: Math.round((b.y1 - b.y0) * S), blank: new Uint8Array(Math.round((b.y1 - b.y0) * S)), soft: [], hard: [[b.y0 * S, b.y1 * S]], scan: false, weight: 1 }]; }
        rep.note = 'its text runs sideways — kept whole on one screen: turn the Kindle to read it';
      } else {
        // what is drawn besides the text: figures, rules, formulas drawn as lines (the running heads' ink left out)
        const skip: Array<[number, number, number, number]> = [...lines, ...heads, ...pg.vertical].map((b) => [b.x0 * S - 1, b.y0 * S - 1, b.x1 * S + 1, b.y1 * S + 1]);
        const drawn = ip.inkRegions(img, skip, { thr: INK, dil: Math.max(3, Math.round(0.35 * body * S)), minArea: Math.round((0.3 * body * S) ** 2), max: 3000 })
          .map((b) => ({ x0: b.x / S, y0: b.y / S, x1: (b.x + b.w) / S, y1: (b.y + b.h) / S }))
          .filter((b) => !(o.removeHeaders && (b.y1 < 0.07 * H || b.y0 > 0.93 * H) && area(b) < 0.015 * W * H));
        // thin rules (under a heading, round a note, between columns) are drawn with whatever piece holds them, but do not
        // decide the regions: one across two columns' tops would join the columns into one region
        const backdrop = (b: Box) => area(b) >= 0.6 * W * H, thin = (b: Box) => Math.min(b.x1 - b.x0, b.y1 - b.y0) < 2.5;
        const figs = [...pics.filter((b) => !backdrop(b)), ...drawn.filter((b) => !thin(b) && !pics.some((q) => !backdrop(q) && inside(b, q)))];
        const items: Array<Box & { line?: Line; pic?: boolean }> = [...lines.map((l) => ({ x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1, line: l })), ...figs.map((b) => ({ ...b, pic: pics.includes(b) }))];
        regions = regionsOf(tc, items, items.map((b) => !b.line && area(b) >= 0.015 * W * H), body, H).map((g) => {
          const box = pad(g.box, 1.5, page), mine = g.items as typeof items;
          const hard: Array<[number, number]> = [], soft: Array<[number, number]> = [];
          for (const b of mine) {
            // a line's letters from the top of its small letters (with room for an i's dot) to its baseline: blank rows
            // inside them (an i's dot, a thin stroke at low resolution) are no gap between lines
            if (b.line) { const l = b.line, base = Number.isFinite(l.base) ? l.base : l.y1 - 0.22 * l.size; hard.push([(base - 0.6 * l.size) * S, (base - 0.03 * l.size) * S]); }
            else if (b.pic) hard.push([b.y0 * S, b.y1 * S]);
            else if (b.y1 - b.y0 >= 1.5) soft.push([b.y0 * S, b.y1 * S]);
          }
          // a display formula: its lines in a maths font with what is drawn round them (fraction bars, radicals) as one
          for (const blk of mathBlocks(mine.filter((b) => b.line).map((b) => b.line!), mine.filter((b) => !b.line), body)) soft.push([blk.y0 * S, blk.y1 * S]);
          // a figure with its caption under it — a line that says so ("Figure 3", "Table 2") or one set right under it within
          // its width ("(b) Brown bear") — and a table with its caption above it
          for (const f of mine.filter((b) => !b.line && area(b) >= (3 * body) ** 2)) {
            const below = mine.filter((b) => b.line && b.y0 >= f.y1 - 1 && b.y0 - f.y1 <= 1.2 * body && b.x1 > f.x0 && b.x0 < f.x1).sort((a, b) => a.y0 - b.y0)[0];
            const w = f.x1 - f.x0, under = below && below.y0 - f.y1 <= 0.8 * body && below.x0 >= f.x0 - 0.1 * w && below.x1 <= f.x1 + 0.1 * w;
            if (below && (CAPTION.test(below.line!.text) || under)) soft.push([f.y0 * S, below.y1 * S]);
            const above = mine.filter((b) => b.line && b.y1 <= f.y0 + 1 && f.y0 - b.y1 <= 1.2 * body && b.x1 > f.x0 && b.x0 < f.x1).sort((a, b) => b.y1 - a.y1)[0];
            if (above && /^\s*(?:table|tab\.)/i.test(above.line!.text)) soft.push([above.y0 * S, f.y1 * S]);
          }
          return { box, part: g.part, rows: 0, blank: new Uint8Array(0), soft, hard, scan: false, weight: mine.reduce((a, b) => a + (b.line ? b.line.chars : 0), 0) };
        });
        for (const r of regions) { r.blank = ip.blankRows(img, r.box.x0 * S, r.box.y0 * S, r.box.x1 * S, r.box.y1 * S, BLANK, [...r.hard, ...r.soft]); r.rows = r.blank.length; }
        if ((globalThis as any).__KDEBUG) for (const r of regions) {
          const runs: string[] = []; let a = -1;
          for (let y = 0; y <= r.rows; y++) { const b = y < r.rows && r.blank[y]; if (b && a < 0) a = y; if (!b && a >= 0) { runs.push(`${(r.box.y0 + a / S).toFixed(1)}+${((y - a) / S).toFixed(1)}`); a = -1; } }
          console.log('region', r.part, JSON.stringify(r.box), 'blank runs', runs.join(' '));
        }
      }
      if (!regions.length) { rep = { ...rep, how: 'empty', note: 'nothing on this page' }; report.push(rep); await pause(); continue; }
      // the screens' width: the page's text columns — regions side by side that hold a fifth of its text or more — else the
      // regions that hold that much, else the widest (side-by-side figures are no text columns: the text across the page
      // under them keeps its size)
      const total = regions.reduce((a, r) => a + r.weight, 0) || 1, heavyText = (r: Region) => r.weight >= 0.2 * total;
      const cols = regions.filter((r) => r.part > 0), textCols = cols.filter(heavyText), textRegs = regions.filter(heavyText);
      const ref = Math.max(...(textCols.length ? textCols : textRegs.length ? textRegs : regions).map((r) => r.box.x1 - r.box.x0));
      const sp = screenPage(ref, o.screen, o.labels);
      const relax = (r: Region) => ip.blankRows(img, r.box.x0 * S, r.box.y0 * S, r.box.x1 * S, r.box.y1 * S, BLANK, r.hard); // vector regions only (a scan has no soft protections)
      const { screens, smaller } = layOut(regions, sp, scanned ? 12 : body, ip.nextCut, relax);
      rep = { ...rep, screens: screens.length, regions: regions.length, columns: new Set(cols.map((r) => r.part)).size, smaller };
      // the pictures of a scanned page: drawn at the screen's resolution, cleaned up for e-ink
      const pxPerPt = (o.screen[0] / sp.Wp);
      let hi: Img | null = null, hiS = 0;
      if (scanned) {
        hiS = Math.min(6, Math.max(S, pxPerPt * Math.max(...screens.flat().map((q) => q.s)) * 1.05));
        hi = ip.docEnhance(drawPage(m, ip, p, hiS), 1);
      }
      firstScreen.set(pg.i, out.countPages());
      let chars: Char[] | null = null;
      for (const [si, scr] of screens.entries()) {
        const xobjects: Record<string, any> = {};
        let ops = '';
        for (const [pi, q] of scr.entries()) {
          const r = q.region, rect: Box = { x0: r.box.x0, x1: r.box.x1, y0: r.box.y0 + q.a / S, y1: r.box.y0 + q.b / S };
          if (q.a === 0) rect.y0 = r.box.y0; if (q.b >= r.rows) rect.y1 = r.box.y1;
          const w = (rect.x1 - rect.x0) * q.s, h = (rect.y1 - rect.y0) * q.s;
          const ox = sp.mx + Math.max(0, (sp.Wu - w) / 2), oy = sp.my + q.y;
          if (q.rule) ops += `q 0.62 G 0.4 w ${num(sp.mx)} ${num(sp.Hp - oy + 0.45 * body * q.s)} m ${num(sp.Wp - sp.mx)} ${num(sp.Hp - oy + 0.45 * body * q.s)} l S Q\n`;
          const name = `P${pi + 1}`;
          if (scanned && hi) {
            const crop = ip.crop(hi, rect.x0 * hiS, rect.y0 * hiS, (rect.x1 - rect.x0) * hiS, (rect.y1 - rect.y0) * hiS);
            const tw = Math.max(1, Math.min(crop.width, Math.round(w * pxPerPt))), th = Math.max(1, Math.round((crop.height * tw) / crop.width));
            const bytes = await jpeg(tw < crop.width ? ip.resize(crop, tw, th) : crop, true, 82);
            xobjects[name] = out.addImage(new m.Image(bytes));
            ops += `q ${num(w)} 0 0 ${num(h)} ${num(ox)} ${num(sp.Hp - oy - h)} cm /${name} Do Q\n`;
          } else {
            const { xo, ctm } = pieceForm(out, map, doc, pg.i, rect, chars ||= charsOf(p));
            xobjects[name] = xo;
            const F: Mat = [q.s, 0, 0, -q.s, ox - rect.x0 * q.s, sp.Hp - oy + rect.y0 * q.s];
            ops += `q ${num(ox)} ${num(sp.Hp - oy - h)} ${num(w)} ${num(h)} re W n ${mul(ctm as Mat, F).map(num).join(' ')} cm /${name} Do Q\n`;
          }
          await pause();
        }
        if (o.labels) {
          const label = screenLabel(pageNo, si + 1, screens.length), size = sp.ls * 0.55, lw = await textWidth(label, size);
          ops += `BT /KL ${num(size)} Tf 0.4 g ${num(sp.Wp - sp.mx - lw)} ${num(sp.my + sp.ls * 0.3)} Td ${pdfString(label)} Tj ET\n`;
        }
        const res = out.addObject({ XObject: xobjects, Font: { KL: helv } });
        out.insertPage(-1, out.addPage([0, 0, sp.Wp, sp.Hp], 0, res, winAnsi(ops)));
        screensMade++;
      }
    } finally { rl.release(); }
    report.push(rep);
    await pause();
  }
  if (!screensMade) throw new Error('Nothing was found to put on the screens: the chosen pages are empty.');
  // the PDF's bookmarks, each at the first screen of its page (a page left out: the next page that is in)
  bookmarks(doc, out, (i) => { for (let j = i; j < n; j++) if (firstScreen.has(j)) return firstScreen.get(j)!; return -1; });
  if (o.title) out.setMetaData('info:Title', o.title);
  out.setMetaData('info:Creator', 'SuperUtils — PDF for Kindle');
  onProgress?.(list.length, list.length);
  return { pdf: out.saveToBuffer('compress,garbage').asUint8Array().slice(), pages: report, screens: screensMade };
}

const pad = (b: Box, d: number, page: Box): Box => ({ x0: Math.max(page.x0, b.x0 - d), y0: Math.max(page.y0, b.y0 - d), x1: Math.min(page.x1, b.x1 + d), y1: Math.min(page.y1, b.y1 + d) });
const inside = (a: Box, b: Box) => a.x0 >= b.x0 - 1 && a.y0 >= b.y0 - 1 && a.x1 <= b.x1 + 1 && a.y1 <= b.y1 + 1;

/** A page drawn by MuPDF at `sc` px per pt (RGBA, white paper). */
function drawPage(m: any, ip: KindleEngines['ip'], page: any, sc: number): Img {
  const pix = page.toPixmap(m.Matrix.scale(sc, sc), m.ColorSpace.DeviceRGB, false, true);
  try { return ip.expand(pix.getPixels(), pix.getWidth(), pix.getHeight(), pix.getNumberOfComponents()); } finally { pix.destroy?.(); }
}

/**
 * The regions of a page in reading order: textcore's XY-cut on its items (lines, figures, blobs of ink); a run of items in
 * reading order with the same part — the full-width flow (0) or one side of what stands side by side — is one region.
 */
export function regionsOf<T extends Box>(tc: KindleEngines['tc'], items: T[], heavy: boolean[], body: number, H: number): Array<{ box: Box; part: number; items: T[] }> {
  if (!items.length) return [];
  const r = tc.xycut(items.map((b) => [b.x0, b.y0, b.x1, b.y1]), Math.max(3, 0.45 * body), 2, H * 0.1, heavy, 0.8 * body);
  const out: Array<{ box: Box; part: number; items: T[] }> = [];
  for (const [k, i] of r.order.entries()) {
    const part = r.part[k], b = items[i], last = out[out.length - 1];
    if (last && last.part === part) { last.box = union(last.box, b); last.items.push(b); } else out.push({ box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, part, items: [b] });
  }
  return out;
}

/** Display formulas: lines mostly in a maths font, with what is drawn next to them (fraction bars, radicals, big
 *  brackets) and with each other when they stand closer than a line, as boxes. */
export function mathBlocks(lines: Line[], drawn: Box[], body: number): Box[] {
  const blocks: Box[] = [];
  for (const l of lines) {
    if (!(l.chars > 0 && l.math >= 0.4 * l.chars)) continue;
    let b: Box = { x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 };
    for (const d of drawn) if (d.x1 > b.x0 - body && d.x0 < b.x1 + body && d.y1 > b.y0 - 0.6 * body && d.y0 < b.y1 + 0.6 * body) b = union(b, d);
    const near = blocks.findIndex((x) => x.x1 > b.x0 && x.x0 < b.x1 && b.y0 - x.y1 < 0.6 * body && x.y0 - b.y1 < 0.6 * body);
    if (near >= 0) blocks[near] = union(blocks[near], b); else blocks.push(b);
  }
  return blocks;
}

/** A character of a page: its box (MuPDF's: the advance and the font's ascent and descent) and its line. */
export type Char = { cx: number; cy: number; x0: number; y0: number; x1: number; y1: number; line: number };
/** The characters of a page, line by line. */
export function charsOf(page: any): Char[] {
  const chars: Char[] = [];
  let line = -1;
  page.toStructuredText('preserve-whitespace').walk({
    beginLine() { line++; },
    onChar(_c: string, _o: number[], _f: any, _s: number, q: number[]) {
      const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      chars.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, y0, x1, y1, line });
    },
  });
  return chars;
}
const meets = (a: Box, q: number[]) => a.x1 > q[0] && a.x0 < q[2] && a.y1 > q[1] && a.y0 < q[3];

/**
 * What MuPDF must redact so that a piece keeps exactly its own characters: MuPDF removes every character whose box (the
 * advance by the font's ascent and descent — taller than the ink, so the boxes of two lines overlap the gap between them)
 * touches a redaction area. Four big rectangles stand off the piece by the largest box of the page (no character inside
 * reaches them); the characters outside the piece nearer than that are caught by thin bands through their centres, one
 * band for each run of them along a line — a box inside the piece reaches no other line's centre.
 */
export function redactionAreas(page: Box, r: Box, chars: Char[]): number[][] {
  const M = Math.min(60, Math.max(4, ...chars.map((c) => Math.max(c.x1 - c.x0, c.y1 - c.y0))) * 1.1 + 0.5);
  const big = [[page.x0 - 1, page.y0 - 1, page.x1 + 1, r.y0 - M], [page.x0 - 1, r.y1 + M, page.x1 + 1, page.y1 + 1], [page.x0 - 1, page.y0 - 1, r.x0 - M, page.y1 + 1], [r.x1 + M, page.y0 - 1, page.x1 + 1, page.y1 + 1]]
    .filter((q) => q[2] - q[0] > 0.01 && q[3] - q[1] > 0.01);
  const bands: number[][] = [];
  let run: Char[] = [];
  const close = () => {
    if (!run.length) return;
    const h = Math.max(0.2, 0.08 * Math.min(...run.map((c) => c.y1 - c.y0))), w = Math.max(0.2, 0.08 * Math.min(...run.map((c) => c.x1 - c.x0)));
    bands.push([Math.min(...run.map((c) => c.cx)) - w, Math.min(...run.map((c) => c.cy)) - h, Math.max(...run.map((c) => c.cx)) + w, Math.max(...run.map((c) => c.cy)) + h]);
    run = [];
  };
  for (const c of chars) {
    const out = c.cx < r.x0 || c.cx > r.x1 || c.cy < r.y0 || c.cy > r.y1;
    if (!out || big.some((q) => meets(c, q)) || (run.length && run[run.length - 1].line !== c.line)) close();
    if (out && !big.some((q) => meets(c, q))) run.push(c);
  }
  close();
  return [...big, ...bands];
}

/**
 * One piece of a page as a Form XObject of the output: the page grafted in (its fonts and pictures shared through the
 * graft map), every character outside the piece removed by redaction (`redactionAreas`; drawings entirely outside the big
 * rectangles too; pictures stay — the clip hides them), its content made a form with the page's resources; the scratch
 * page deleted.
 */
function pieceForm(out: any, map: any, src: any, index: number, r: Box, chars: Char[]): { xo: any; ctm: number[] } {
  const n0 = out.countPages();
  map.graftPage(-1, src, index);
  const pg = out.loadPage(n0);
  try {
    const [x0, y0, x1, y1] = pg.getBounds();
    for (const q of redactionAreas({ x0, y0, x1, y1 }, r, chars)) pg.createAnnotation('Redact').setRect(q);
    // black boxes off, pictures kept (REDACT_IMAGE_NONE), drawings entirely covered removed, text removed
    pg.applyRedactions(false, 0, 1, 0);
    const po = pg.getObject(), cont = po.get('Contents'), parts: Uint8Array[] = [];
    if (cont.isArray()) cont.forEach((v: any) => parts.push(v.readStream().asUint8Array())); else if (cont.isStream()) parts.push(cont.readStream().asUint8Array());
    const bytes = new Uint8Array(parts.reduce((a, b) => a + b.length + 1, 0));
    let k = 0; for (const p of parts) { bytes.set(p, k); k += p.length; bytes[k++] = 10; }
    const mb = po.getInheritable('MediaBox');
    const xo = out.addStream(bytes, { Type: 'XObject', Subtype: 'Form', BBox: [0, 1, 2, 3].map((i) => mb.get(i).asNumber()), Resources: po.getInheritable('Resources') });
    return { xo, ctm: pg.getTransform() };
  } finally { out.deletePage(n0); }
}

/** The source's bookmarks in the output, each at `at(page)` (−1: left out, its children move up). */
function bookmarks(src: any, out: any, at: (page: number) => number) {
  let items: any[] | null = null;
  try { items = src.loadOutline(); } catch { return; }
  if (!items?.length) return;
  const walk = (list: any[], depth: number): any[] => list.flatMap((x) => {
    const down = depth < 8 && x.down ? walk(x.down, depth + 1) : [];
    let page = typeof x.page === 'number' ? x.page : -1;
    if (page < 0 && x.uri?.startsWith('#')) { try { page = src.resolveLinkDestination(x.uri).page; } catch { page = -1; } }
    const to = page >= 0 ? at(page) : -1, title = String(x.title || '').replace(/\s+/g, ' ').trim();
    if (to < 0 || !title) return down;
    return [{ title, uri: out.formatLinkURI({ type: 'Fit', chapter: 0, page: to, x: 0, y: 0, width: 0, height: 0, zoom: 0 }), open: x.open, down }];
  });
  const list = walk(items, 0);
  if (!list.length) return;
  const it = out.outlineIterator();
  const put = (xs: any[]) => {
    for (const x of xs) {
      it.insert({ title: x.title, uri: x.uri, open: x.open });
      if (x.down?.length) { it.prev(); if (it.down() >= 0) put(x.down); it.up(); it.next(); }
    }
  };
  put(list);
}
