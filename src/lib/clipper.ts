// The Newspaper Clipper's steps around its engines (src/tools/clipper.ts; potentials #110): a photographed newspaper page
// is straightened by the OCR tab's page finder (src/lib/pagecrop.ts) and read by Tesseract with its own page layout
// (PSM 3), whose blocks — a headline, a column of a story, a caption — are what the reader taps. Here, without the DOM:
// the blocks of a reading, which of them are headlines, a story's blocks found from its headline, the chosen blocks in
// reading order (textcore's XY-cut), their text, and where each goes in the clipping (one tall picture).
import type { OcrResult, OcrWord, OcrLang, Layout } from './ocr';
import type { Img } from '../wasm/imgproc';
import { straighten, type PageOps } from './pagecrop';
import { uprightByReading, score, type TurnOps } from './upright';

export interface Block {
  /** its place in the page's list */
  id: number;
  /** on the page picture that was read: x0, y0, x1, y1 */
  box: [number, number, number, number];
  words: OcrWord[];
  /** its words line by line (a wide headline is set again line by line in the clipping; a page is cut between lines) */
  rows: OcrWord[][];
  /** its text as a reader reads it: its lines joined, a word broken at a line end joined, a paragraph a line */
  text: string;
  /** its words' median height (px): a headline's are large */
  size: number;
  headline: boolean;
  /** a picture of the page (no words: a photo, a drawing, a chart — the ink left over where nothing was read) */
  picture?: boolean;
}

/** A word broken at a line end: a hyphen (or a soft hyphen, ‐, ¬) after two letters and more, and the next line goes on in
 *  lower case ("experi-" "ment"); "e-" (a one-letter prefix) and a hyphen before a capital keep it — as PDF → EPUB joins. */
const BROKEN = /\p{L}{2,}[-­‐¬]$/u;
/** The text of a run of lines (each a list of words): joined with spaces, a broken word put together. */
export function joinLines(lines: string[][]): string {
  let out = '';
  for (const ln of lines) {
    const t = ln.join(' ').trim(); if (!t) continue;
    if (!out) { out = t; continue; }
    if (BROKEN.test(out) && /^\p{Ll}/u.test(t)) out = out.slice(0, -1) + t;
    else out += ' ' + t;
  }
  return out;
}

const overlap = (a: number[], b: number[]) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };

/** A headline's words are at least this many times as tall as the page's text (a one-column story's headline is set
 *  little larger than the text: 1.4 times in the measuring photos). */
export const HEADLINE = 1.3;

/**
 * The blocks of a reading laid out as a page (Tesseract's PSM 3: each line carries its block): a box, the words, the text
 * (paragraphs on lines of their own, a word broken at a line end joined), the words' height; blocks without a letter or
 * digit left out (the speckle of a picture). Headlines: lines whose words are HEADLINE × the page's text and more. What
 * Tesseract's layout gets wrong for a story is put right (measured on the photos of make-newspaper-photos.py):
 *  - a headline glued to the top of a column, or inside a block that runs across two stories: the block's runs of
 *    headline lines are headlines of their own (a headline's letters are wide — Tesseract's boxes of a whole line of
 *    justified text were sometimes twice as tall as its letters: they are no headline);
 *  - a block over two columns and more (its lines run across the gutter): cut at the gutters no word crosses;
 *  - each line of a two-line headline a block of its own: lines one under the other, of one size, are one headline;
 *  - a line run across the columns just under a wide headline (one block for the first line of three columns): its words
 *    go to the columns under it, each to the one it stands over.
 */
export function blocksOf(r: Pick<OcrResult, 'words' | 'lines'>): Block[] {
  type Ln = { para: number; words: OcrWord[]; size: number; low: number; cw: number };
  const hOf = (w: OcrWord) => w.y1 - w.y0;
  // the width of a letter: a word's width over its letters (words of three letters and more). A headline's letters are
  // wider; unlike a word's height it is not changed when Tesseract's box of a word reaches into the next line (it did,
  // on whole lines of justified text: words twice as tall as their letters)
  const letters = (w: OcrWord) => w.text.replace(/[^\p{L}\p{N}]/gu, '').length;
  const cwOf = (ws: OcrWord[]) => median(ws.filter((w) => letters(w) >= 3).map((w) => (w.x1 - w.x0) / w.text.trim().length));
  const byBlock = new Map<number, Ln[]>();
  for (const ln of r.lines ?? []) {
    const ws = r.words.slice(ln.w0, ln.w1).filter((w) => w.text.trim() && w.x1 > w.x0 && w.y1 > w.y0);
    if (!ws.length) continue;
    // (the lower quarter of the words of three letters and more: "a", "in" have no ascender — half a word's height)
    const hs = ws.map(hOf).sort((a, b) => a - b), hl = ws.filter((w) => letters(w) >= 3).map(hOf).sort((a, b) => a - b), q = hl.length ? hl : hs;
    const b = byBlock.get(ln.block) ?? [];
    b.push({ para: ln.para, words: ws, size: median(hs), low: q[Math.floor((q.length - 1) / 4)], cw: cwOf(ws) }); byBlock.set(ln.block, b);
  }
  // the page's text: the median height and letter width of all words (the body text is most of a newspaper page)
  const allWords = [...byBlock.values()].flatMap((ls) => ls.flatMap((l) => l.words));
  const body = median(allWords.map(hOf)), bodyCw = cwOf(allWords);
  // a headline's line: its letters HEADLINE × as wide as the text's and more, its words taller (1.15 × the text's: a
  // one-column story's headline of capitals and lower case without descenders is not much taller than a line of text with
  // them — the letters' width tells it apart; a line of capitals at the text's size is wider but shorter)
  const big = (l: Ln) => body > 0 && bodyCw > 0 && l.cw >= HEADLINE * bodyCw && l.size >= 1.15 * body;
  const make = (lines: Ln[], headline: boolean): Block => {
    const words = lines.flatMap((l) => l.words);
    const paras: string[][][] = []; let cur = NaN;
    for (const l of lines) { if (l.para !== cur || !paras.length) { paras.push([]); cur = l.para; } paras[paras.length - 1].push(l.words.map((w) => w.text)); }
    return {
      id: 0, box: [Math.min(...words.map((w) => w.x0)), Math.min(...words.map((w) => w.y0)), Math.max(...words.map((w) => w.x1)), Math.max(...words.map((w) => w.y1))],
      words, rows: lines.map((l) => l.words), text: headline ? lines.map((l) => l.words.map((w) => w.text).join(' ')).join(' ') : paras.map(joinLines).join('\n'),
      size: median(words.map(hOf)), headline,
    };
  };
  const nWords = (ls: Ln[]) => ls.reduce((n, x) => n + x.words.length, 0);
  let out: Block[] = [];
  const lineSets = new Map<Block, Ln[]>();
  const textBlock = (lines: Ln[]) => { const b = make(lines, false); lineSets.set(b, lines); out.push(b); };
  for (const lines of byBlock.values()) {
    if (!lines.some((l) => l.words.some((w) => /[\p{L}\p{N}]/u.test(w.text)))) continue;
    // its runs of headline lines and of text lines, in order (a headline Tesseract put at the top of its column, or into
    // the middle of a block that runs across two stories)
    // a run inside the block must stand apart from the lines round it, as a headline does (half a line's height and more
    // above and below): a line of text whose words came out blurred and wide is no headline
    const top = (l: Ln) => median(l.words.map((w) => w.y0)), bot = (l: Ln) => median(l.words.map((w) => w.y1));
    const apart = (i: number, j: number) => (i === 0 || top(lines[i]) - bot(lines[i - 1]) >= 0.5 * body) && (j === lines.length || top(lines[j]) - bot(lines[j - 1]) >= 0.5 * body);
    const runs: Array<{ lines: Ln[]; head: boolean }> = [];
    for (let k = 0; k < lines.length;) {
      let j = k; const isBig = big(lines[k]);
      while (j < lines.length && big(lines[j]) === isBig) j++;
      const run = lines.slice(k, j), head = isBig && nWords(run) <= 30 && (k === 0 || apart(k, j)), prev = runs[runs.length - 1];
      if (!head && prev && !prev.head) prev.lines.push(...run); else runs.push({ lines: run, head });
      k = j;
    }
    // a run of text with a wide gap inside (a line and a half and more: Tesseract joined the page's price line to a column
    // far under it): one block on either side
    for (const r of runs) {
      if (r.head) { out.push(make(r.lines, true)); continue; }
      let from = 0;
      for (let i = 1; i <= r.lines.length; i++) if (i === r.lines.length || top(r.lines[i]) - bot(r.lines[i - 1]) > 1.5 * body) { textBlock(r.lines.slice(from, i)); from = i; }
    }
  }
  // a block of text over two columns and more (Tesseract's layout joined them; each of its lines then runs across the
  // gutter): cut at the gutters no word crosses, each line's words to the column they stand in
  const colW0 = median(out.filter((b) => !b.headline).map((b) => b.box[2] - b.box[0]));
  const splitCols = (lines: Ln[]): Ln[][] => {
    const ws = lines.flatMap((l) => l.words); if (!ws.length) return [lines];
    const x0 = Math.min(...ws.map((w) => w.x0)), x1 = Math.max(...ws.map((w) => w.x1)), W = Math.round(x1 - x0) + 1;
    if (W < 1.6 * colW0 || lines.length < 3) return [lines];
    const cover = new Int32Array(W);
    for (const l of lines) {
      const seen = new Uint8Array(W);
      for (const w of l.words) seen.fill(1, Math.max(0, Math.round(w.x0 - x0)), Math.min(W, Math.round(w.x1 - x0) + 1));
      for (let x = 0; x < W; x++) cover[x] += seen[x];
    }
    // the widest stretch crossed by a tenth of the lines at most, at least 0.4 of a line's height wide, a column away from
    // either edge
    let best = -1, bestW = 0;
    for (let x = 0; x < W;) {
      if (cover[x] > 0.1 * lines.length) { x++; continue; }
      let e = x; while (e < W && cover[e] <= 0.1 * lines.length) e++;
      if (e - x >= 0.4 * body && x >= 0.6 * colW0 && W - e >= 0.6 * colW0 && e - x > bestW) { bestW = e - x; best = (x + e) / 2; }
      x = e;
    }
    if (best < 0) return [lines];
    const cut = x0 + best, side = (left: boolean) => lines.map((l) => ({ ...l, words: l.words.filter((w) => ((w.x0 + w.x1) / 2 < cut) === left) })).filter((l) => l.words.length);
    return [...splitCols(side(true)), ...splitCols(side(false))];
  };
  for (const b of [...out]) {
    const ls = lineSets.get(b); if (!ls || b.headline) continue;
    const cols = splitCols(ls); if (cols.length < 2) continue;
    out = out.filter((x) => x !== b); lineSets.delete(b);
    for (const c of cols) textBlock(c.map((l) => ({ ...l, size: median(l.words.map(hOf)), cw: cwOf(l.words) })));
  }
  // a headline's lines that came as blocks of their own: one under the other (the gap at most one line of it), their left
  // edges or their middles together, the same size within a half
  out.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  for (let merged = true; merged;) {
    merged = false;
    for (const a of out) {
      if (!a.headline) continue;
      const b = out.find((x) => x !== a && x.headline && x.box[1] >= a.box[1] && x.box[1] - a.box[3] <= 0.9 * Math.max(a.size, x.size) && x.box[1] - a.box[3] >= -0.5 * Math.min(a.size, x.size)
        && Math.max(a.size, x.size) <= 1.5 * Math.min(a.size, x.size)
        && (Math.abs(x.box[0] - a.box[0]) <= 1.5 * a.size || Math.abs((x.box[0] + x.box[2]) / 2 - (a.box[0] + a.box[2]) / 2) <= 1.5 * a.size));
      if (!b) continue;
      const words = [...a.words, ...b.words];
      Object.assign(a, { words, rows: [...a.rows, ...b.rows], box: [Math.min(a.box[0], b.box[0]), a.box[1], Math.max(a.box[2], b.box[2]), Math.max(a.box[3], b.box[3])], text: `${a.text} ${b.text}`, size: median(words.map(hOf)) });
      out = out.filter((x) => x !== b); merged = true; break;
    }
  }
  // a line run across the columns: a block of text of one or two lines, 1.8 times as wide as a column and more, over two
  // blocks of text or more that start right under it, each lying under it for half its width and more — each of its
  // words goes to the column it stands over, as that column's first line
  const text = out.filter((b) => !b.headline), colW = median(text.map((b) => b.box[2] - b.box[0]));
  for (const a of [...text]) {
    const ls = lineSets.get(a); if (!ls || ls.length > 2 || a.box[2] - a.box[0] < 1.8 * colW) continue;
    const L = 1.6 * body;
    const under = text.filter((b) => b !== a && b.box[1] >= a.box[3] - 0.5 * L && b.box[1] - a.box[3] <= 2 * L && overlap(a.box, b.box) >= 0.5 * (b.box[2] - b.box[0]));
    if (under.length < 2) continue;
    const to = (w: OcrWord) => under.find((b) => (w.x0 + w.x1) / 2 >= b.box[0] - 0.5 * L && (w.x0 + w.x1) / 2 <= b.box[2] + 0.5 * L);
    if (!a.words.every((w) => to(w))) continue;
    for (const b of under) {
      const mine = a.words.filter((w) => to(w) === b); if (!mine.length) continue;
      const lines2: Ln[] = [{ para: -1, words: mine, size: median(mine.map(hOf)), low: 0, cw: cwOf(mine) }, ...(lineSets.get(b) ?? [])];
      const nb = make(lines2, false); Object.assign(b, { words: nb.words, rows: nb.rows, box: nb.box, text: nb.text, size: nb.size }); lineSets.set(b, lines2);
    }
    out = out.filter((x) => x !== a);
  }
  out.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  out.forEach((b, i) => { b.id = i; });
  return out;
}

/** the page's line height: the body text's words' height × 1.6 */
const lineHeight = (blocks: Block[]) => 1.6 * (median(blocks.filter((b) => !b.headline && !b.picture).map((b) => b.size)) || 12);

/**
 * A story's blocks, from its headline (index into `blocks`): the headline, the first row of blocks under it (the columns of
 * its text, a picture's caption), the columns beside them that start with them (a short headline over two columns) unless
 * a headline of their own stands nearer above them or they go on from another story's block (columns under that story's
 * picture: followed up block by block, one of their row reaches that story's headline), and each column on down until
 * another headline or a wide gap. In the blocks' order.
 */
/** A block's box for laying out the page: from the top of its first line's typical word to the bottom of its last line's
 *  (the middle ones) — one word's box can reach into the block above or below on a soft photo (a headline's descender
 *  touching the picture or the column under it, 25 – 65 px on the measuring photos). The clipping's pieces keep the whole
 *  box. */
export function coreBox(b: Block): [number, number, number, number] {
  const first = b.rows?.[0], last = b.rows?.[b.rows.length - 1];
  if (!first?.length || !last?.length) return b.box;
  // a word's box taller than its block's words by a quarter is cut to that height from its other end (a headline's last
  // line of one word, "Monday", whose descender ran into the picture under it: 114 px where its words are 67)
  const hs = b.rows.flat().map((w) => w.y1 - w.y0).sort((u, v) => u - v), cap = 1.25 * hs[hs.length >> 1];
  const tops = first.map((w) => Math.max(w.y0, w.y1 - cap)).sort((u, v) => u - v), bots = last.map((w) => Math.min(w.y1, w.y0 + cap)).sort((u, v) => u - v);
  const top = Math.max(b.box[1], tops[tops.length >> 1]), bot = Math.min(b.box[3], bots[(bots.length - 1) >> 1]);
  return bot > top ? [b.box[0], top, b.box[2], bot] : b.box;
}

export function storyOf(all: Block[], head: number): number[] {
  // the blocks with their core boxes (coreBox): one word's box reaching into the block under it decides nothing
  const blocks = all.map((b) => ({ ...b, box: coreBox(b) }));
  const h = blocks[head]; if (!h) return [];
  const h0 = h;
  const L = lineHeight(blocks), heads = blocks.filter((b) => b.headline && b !== h0);
  /** a headline between a and b (b below a) that overlaps b: b belongs to another story */
  const cutBetween = (top: number, b: Block) => heads.some((x) => x.box[1] >= top - 0.25 * L && x.box[3] <= b.box[1] + 0.5 * L && overlap(x.box, b.box) > 0);
  /** the nearest headline above a block that overlaps it, and how far above */
  const ownHead = (b: Block) => {
    let best: Block | null = null, d = Infinity;
    for (const x of blocks) if (x.headline && x.box[3] <= b.box[1] + 0.5 * L && overlap(x.box, b.box) > 0 && b.box[1] - x.box[3] < d) { d = b.box[1] - x.box[3]; best = x; }
    return { head: best, d };
  };
  /** the block a block hangs from: the nearest one right above it (at most two lines up) lying over half its width */
  const above = (b: Block) => {
    let best: Block | null = null, d = Infinity;
    for (const x of blocks) {
      if (x === b || x.box[3] > b.box[1] + 0.5 * L || b.box[1] - x.box[3] > 2 * L) continue;
      if (overlap(x.box, b.box) < 0.5 * Math.min(x.box[2] - x.box[0], b.box[2] - b.box[0])) continue;
      if (b.box[1] - x.box[3] < d) { d = b.box[1] - x.box[3]; best = x; }
    }
    return best;
  };
  /** the headline a block's column goes up to, block by block (a column under a picture: the picture's story's) */
  const chainHead = (b: Block) => { let x: Block | null = b; for (let n = 0; n < 60 && x; n++) { x = above(x); if (x?.headline) return x; } return null; };
  /** the columns that start at a block's height side by side with it (gutters of up to 2.5 lines): one row of a story */
  const text = blocks.filter((x) => !x.headline && !x.picture);
  const rowOf = (b: Block) => {
    const out = new Set([b]);
    for (let grew = true; grew;) {
      grew = false;
      for (const x of text) if (!out.has(x) && [...out].some((y) => Math.abs(x.box[1] - y.box[1]) <= 0.5 * L && (Math.abs(x.box[0] - y.box[2]) <= 2.5 * L || Math.abs(y.box[0] - x.box[2]) <= 2.5 * L))) { out.add(x); grew = true; }
    }
    return out;
  };
  const body = blocks.filter((b) => !b.headline && b.box[1] >= h.box[3] - 0.5 * L);
  // the first row under the headline
  const under = body.filter((b) => overlap(b.box, h.box) > 0 && !cutBetween(h.box[3], b));
  if (!under.length) return [head];
  const d0 = Math.min(...under.map((b) => b.box[1] - h.box[3]));
  const row = new Set(under.filter((b) => b.box[1] - h.box[3] <= d0 + 1.5 * L));
  // the columns beside them that start with them (gutters of up to 2.5 lines), not under a nearer headline of their own
  for (let grew = true; grew;) {
    grew = false;
    for (const b of body) {
      if (row.has(b)) continue;
      const near = [...row].some((r) => Math.abs(b.box[1] - r.box[1]) <= 1.5 * L && (Math.abs(b.box[0] - r.box[2]) <= 2.5 * L || Math.abs(r.box[0] - b.box[2]) <= 2.5 * L));
      if (!near) continue;
      const own = ownHead(b);
      if (own.head && own.head !== h0 && own.d <= b.box[1] - h.box[3] + 2 * L) continue;
      // it, or a column of its row, goes on from another story's block (the columns under that story's picture and caption)
      if ([...rowOf(b)].some((x) => { const c = chainHead(x); return c && c !== h0; })) continue;
      row.add(b); grew = true;
    }
  }
  // each column on down: the next block below it in the same column, no headline between, no wider gap than 3 lines
  const story = new Set(row);
  for (let grew = true; grew;) {
    grew = false;
    for (const b of body) {
      if (story.has(b)) continue;
      const above = [...story].find((s) => b.box[1] >= s.box[3] - 0.5 * L && b.box[1] - s.box[3] <= 3 * L && overlap(s.box, b.box) >= 0.5 * Math.min(s.box[2] - s.box[0], b.box[2] - b.box[0]));
      if (!above || cutBetween(above.box[3], b)) continue;
      story.add(b); grew = true;
    }
  }
  return [head, ...[...story].map((b) => b.id)].sort((a, b) => a - b);
}

/** The chosen blocks in reading order: textcore's XY-cut over their boxes (a headline across the columns first, then the
 *  columns left to right). `xycut` gives the order of the boxes. The gaps it cuts at are a block's, not a line's: a
 *  headline may stand a few pixels over its columns (10 px on a page whose lines are 50 apart — a quarter of a line was
 *  too much: the headline and its columns were one cut, read in the order they came). */
export function readingOrder(blocks: Block[], chosen: number[], xycut: (boxes: number[][], gx: number, gy: number) => number[]): number[] {
  const list = chosen.filter((i) => blocks[i]);
  if (list.length < 2) return list;
  const L = lineHeight(blocks);
  return xycut(list.map((i) => coreBox(blocks[i])), Math.max(3, 0.5 * L), 2).map((k) => list[k]);
}

/** The clipping's text: the blocks in order, a word broken at the end of one column and going on in the next joined, a
 *  blank line between blocks. */
export function clipText(parts: Block[]): string {
  const out: string[] = [];
  for (const b of parts) {
    const t = b.text.trim(); if (!t) continue;
    const prev = out[out.length - 1];
    if (prev && BROKEN.test(prev) && /^\p{Ll}/u.test(t) && !b.headline) out[out.length - 1] = prev.slice(0, -1) + t;
    else out.push(t);
  }
  return out.join('\n\n');
}

/** A part of the clipping: a block of one of the photos and the scale its page is drawn at (pixels of the clipping a
 *  pixel of the page: the photos' text drawn the same size — `textScale`). */
export interface Part { shot: number; block: Block; k: number; page: { width: number; height: number } }
/** A piece of the clipping: a rectangle of a photo's page (`crop`, px of the page) drawn at x, y, w × h. */
export interface Piece { shot: number; crop: [number, number, number, number]; x: number; y: number; w: number; h: number }
export interface Plan {
  width: number; height: number; pieces: Piece[];
  /** the label of each part ("Part 2") and its strip */
  labels: Array<{ text: string; y: number; h: number }>;
  /** where a page of the PDF may end: between two parts, and between two lines of a part */
  cuts: number[];
}

/** The scale of each photo's page in the clipping: its text drawn as large as the first photo's (`body`: the median
 *  height of a photo's words of text, px of its page). */
export function textScale(bodies: number[]): number[] {
  const ref = bodies.find((b) => b > 0) || 1;
  return bodies.map((b) => (b > 0 ? Math.min(4, Math.max(0.25, ref / b)) : 1));
}

/** The words of a reading that make the text of a page (not of a headline) — their median height is the page's text size. */
export const bodySize = (blocks: Block[]) => median(blocks.filter((b) => !b.headline).flatMap((b) => b.words.map((w) => w.y1 - w.y0)));

/**
 * Where everything goes in the clipping — the parts one under another in their order, each under its label (`label` px;
 * 0: no labels) and `gap` apart, each cut from its page with a margin of `pad` (px of the page). The clipping is as wide as
 * the widest part that is no headline or picture (a column of the story: its text drawn at the photo's own resolution); a part wider
 * than that is made smaller to fit — except a headline across several columns, whose lines are set again word by word to
 * the clipping's width, so that it keeps its size (made a third as large it would read like the text).
 */
export function clipPlan(parts: Part[], o: { pad: number; gap: number; label: number; labels?: string[] }): Plan {
  const crop = (p: Part, box: number[], pad: number): [number, number, number, number] => [
    Math.max(0, Math.floor(box[0] - pad)), Math.max(0, Math.floor(box[1] - pad)), Math.min(p.page.width, Math.ceil(box[2] + pad)), Math.min(p.page.height, Math.ceil(box[3] + pad))];
  const wide = (p: Part) => { const c = crop(p, p.block.box, o.pad); return (c[2] - c[0]) * p.k; };
  const text = parts.filter((p) => !p.block.headline && !p.block.picture);
  const width = Math.max(1, Math.round(Math.max(...(text.length ? text : parts).map(wide), 1)));
  const pieces: Piece[] = [], labels: Plan['labels'] = [], cuts: number[] = [];
  let y = 0;
  parts.forEach((p, i) => {
    if (i) cuts.push(y - o.gap / 2);
    if (o.label > 0) { labels.push({ text: o.labels?.[i] ?? `Part ${i + 1}`, y, h: o.label }); y += o.label; }
    const c = crop(p, p.block.box, o.pad), cw = (c[2] - c[0]) * p.k;
    if (p.block.headline && cw > width * 1.02 && p.block.rows.length) {
      // the headline's words set again line by line: each word with its line's top and bottom (the letters stand on one
      // baseline), a space as wide as the headline's own between them
      let x = 0, lineTop = y, lineH = 0;
      for (const row of p.block.rows) {
        const top = Math.min(...row.map((w) => w.y0)), bot = Math.max(...row.map((w) => w.y1)), pad = Math.round(0.12 * (bot - top));
        const gaps = row.slice(1).map((w, j) => w.x0 - row[j].x1).filter((g) => g > 0);
        const space = (gaps.length ? median(gaps) : 0.3 * (bot - top)) * p.k;
        for (const w of row) {
          const cr = crop(p, [w.x0, top, w.x1, bot], pad), ww = (cr[2] - cr[0]) * p.k, hh = (cr[3] - cr[1]) * p.k;
          const s = ww > width ? width / ww : 1;
          if (x > 0 && x + ww * s > width) { cuts.push(lineTop + lineH); lineTop += lineH; x = 0; lineH = 0; }
          pieces.push({ shot: p.shot, crop: cr, x: Math.round(x), y: Math.round(lineTop), w: Math.max(1, Math.round(ww * s)), h: Math.max(1, Math.round(hh * s)) });
          x += ww * s + space; lineH = Math.max(lineH, hh * s);
        }
        cuts.push(lineTop + lineH); lineTop += lineH; x = 0; lineH = 0; // each of its lines starts a line
      }
      cuts.pop();
      y = Math.round(lineTop) + o.gap;
      return;
    }
    const s = cw > width ? width / (c[2] - c[0]) : p.k, w = Math.max(1, Math.round((c[2] - c[0]) * s)), h = Math.max(1, Math.round((c[3] - c[1]) * s));
    pieces.push({ shot: p.shot, crop: c, x: 0, y, w, h });
    // between two of its lines: halfway between one line's bottom and the next one's top
    const rows = p.block.rows.map((r) => [Math.min(...r.map((w) => w.y0)), Math.max(...r.map((w) => w.y1))]).sort((u, v) => u[0] - v[0]);
    for (let j = 1; j < rows.length; j++) { const at = (rows[j - 1][1] + rows[j][0]) / 2; if (at > c[1] && at < c[3]) cuts.push(y + (at - c[1]) * s); }
    y += h + o.gap;
  });
  return { width, height: Math.max(1, Math.round(y - (parts.length ? o.gap : 0))), pieces, labels, cuts: cuts.filter((c) => c > 0).sort((u, v) => u - v) };
}

/** The clipping cut into pages of `pageH` px: each page ends at the last place it may be cut (between parts or lines) in
 *  its second half, else at its full height (a line taller than half a page is cut through). [top, bottom) each. */
export function pageCuts(height: number, cuts: number[], pageH: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let top = 0;
  while (top < height - 0.5) {
    if (top + pageH >= height) { out.push([top, height]); break; }
    const ok = cuts.filter((c) => c > top + pageH / 2 && c <= top + pageH);
    const end = ok.length ? Math.round(ok[ok.length - 1]) : Math.round(top + pageH);
    out.push([top, end]); top = end;
  }
  return out;
}

/** A file name from the clipping's headline: its first words, lower case, hyphens between ("rain-delays-final-day"). */
export function clipName(headline: string): string {
  const w = headline.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return w.slice(0, 6).join('-').slice(0, 60) || 'clipping';
}

/** A block's name for a screen reader and the button's title: what kind it is and its first words. */
export function blockLabel(b: Block): string {
  if (b.picture) return 'Picture';
  const first = b.text.split(/\s+/).slice(0, 8).join(' ');
  return `${b.headline ? 'Headline' : 'Text'}: ${first}${b.text.split(/\s+/).length > 8 ? '…' : ''}`;
}

/** The pictures of a page: the ink left over once the text read is taken away (the words' boxes and a margin), where it
 *  makes an area at least three lines of the text high and wide — a photo, a drawing, a chart. Thin ink (a rule between
 *  stories) and specks are no picture. `regions`: imgproc's ink regions (p_ink_regions) of the page with the words left
 *  out. */
export function picturesOf(regions: Array<{ x: number; y: number; w: number; h: number }>, body: number): Array<[number, number, number, number]> {
  const L = 1.6 * (body || 20), out: Array<[number, number, number, number]> = [];
  for (const g of regions) if (g.w >= 3 * L && g.h >= 3 * L) out.push([g.x, g.y, g.x + g.w, g.y + g.h]);
  // regions inside one another or overlapping: one picture
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) for (let j = i + 1; j < out.length && !merged; j++) {
      const a = out[i], b = out[j];
      if (Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1])) {
        out[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; out.splice(j, 1); merged = true;
      }
    }
  }
  return out;
}

/** The blocks of a page with its pictures among them (in the blocks' order: top to bottom, left to right). */
export function withPictures(blocks: Block[], pictures: Array<[number, number, number, number]>): Block[] {
  const out = [...blocks, ...pictures.map((box): Block => ({ id: 0, box, words: [], rows: [], text: '', size: 0, headline: false, picture: true }))];
  out.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  out.forEach((b, i) => { b.id = i; });
  return out;
}

/** What the clipper needs of imgproc (the worker's operations in the tab, the module's in Node). */
export interface ClipOps extends PageOps, TurnOps {
  docEnhance(img: Img, mode: 0 | 1 | 2): Img | Promise<Img>;
  /** imgproc's unsharp mask (p_sharpen) */
  sharpen(img: Img, amount: number, sigma: number): Img | Promise<Img>;
  inkRegions(img: Img, skip: Array<[number, number, number, number]>, o: { thr?: number; dil?: number; minArea?: number; max?: number }): Array<{ x: number; y: number; w: number; h: number }> | Promise<Array<{ x: number; y: number; w: number; h: number }>>;
}
export interface ClipEngines {
  ops: ClipOps;
  /** Tesseract: the picture read, laid out as a page (its blocks) or as one block (src/lib/ocr.ts). */
  read(img: Img, lang: OcrLang, onProgress: ((p: number, status: string) => void) | undefined, layout: Layout): Promise<OcrResult>;
}
export interface ClipPage {
  /** the page as it was read: found and straightened, set upright and level — the blocks' boxes are on it */
  img: Img;
  blocks: Block[];
  r: OcrResult;
  /** the page was found and straightened (and how) */
  found: boolean;
  by?: 'outline' | 'network';
  /** what was done to set the text upright */
  up: { turns: number; slant: number };
}
/** A photo is made at most this large (px a side) before the page is looked for (a phone's 12 – 50 megapixels). */
export const MAX_PHOTO = 4000;
/**
 * The page is read sharpened (imgproc's unsharp mask) — and again sharper when the reading shows that Tesseract's page
 * layout went wrong. Measured on photos of make-newspaper-photos.py (Tesseract 5's layout analysis, PSM 3):
 *  - round a picture whole stretches of the text went missing — the picture's grey, binarized, looks like a halftone, and
 *    Tesseract's picture finder grows from it into the columns beside it when their letters touch (a soft photo): 536 and
 *    597 words of a page instead of 673 and 675;
 *  - on a soft photo the letters of neighbouring lines run together, and Tesseract took whole columns for vertical text
 *    (its PT_VERTICAL_TEXT; nothing switches that off) and read them turned: 136 words of 690;
 *  - and either came and went with a change of the photo's size by under 1 %.
 * The light mask (SHARPEN) read the two pages with a picture whole and changed nothing on sharp pages (671 → 671, 663 →
 * 670 words); the strong one (SHARPER) read the soft page (136 → 626 words, no vertical text) but a sharp page a little
 * worse (571 → 564 words read surely) — so it is used only when the light one's reading shows a sign of trouble: words in
 * vertical text (VERTICAL_WORDS and more) or lines of the page no word covers (UNREAD_LINES and more; a good reading leaves
 * 0 – 1), and the reading that scores better kept.
 */
export const SHARPEN = { amount: 1, sigma: 1.2 }, SHARPER = { amount: 2, sigma: 1.5 };
export const VERTICAL_WORDS = 10, UNREAD_LINES = 5;
/** How many lines of text no word read covers: imgproc's ink regions with the words' boxes (and a margin) left out,
 *  joined little (a line of words stays a line), that have a line's height and four words' width. */
export async function unreadLines(page: Img, r: Pick<OcrResult, 'words'>, ops: Pick<ClipOps, 'inkRegions'>): Promise<number> {
  const body = median(r.words.filter((w) => w.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 3).map((w) => w.y1 - w.y0)) || 30, pad = 0.3 * body;
  const skip = r.words.map((w): [number, number, number, number] => [w.x0 - pad, w.y0 - pad, w.x1 - w.x0 + 2 * pad, w.y1 - w.y0 + 2 * pad]);
  const regions = await ops.inkRegions(page, skip, { thr: 160, dil: Math.max(2, Math.round(0.15 * body)), minArea: Math.round(2 * body * body), max: 1000 });
  return regions.filter((g) => g.h >= 0.5 * body && g.h <= 1.6 * body && g.w >= 4 * body).length;
}

/**
 * A photographed newspaper page read for the clipper: made at most MAX_PHOTO px → the page found and straightened (the
 * OCR tab's page finder, src/lib/pagecrop.ts) → the text set upright and level (src/lib/upright.ts) → the document
 * clean-up, sharpened → read by Tesseract laid out as a page (its blocks: a headline, a column of a story, a caption) —
 * again sharper when its layout went wrong (SHARPEN) → the blocks (blocksOf) and the pictures among them (picturesOf).
 * null: ended because `stale()` said so.
 */
export async function readClip(photo: Img, eng: ClipEngines, o: { onProgress?: (p: number, status: string) => void; onAgain?: () => void; stale?: () => boolean } = {}): Promise<ClipPage | null> {
  const { ops } = eng, live = () => !o.stale?.();
  let img = photo;
  const L = Math.max(img.width, img.height);
  if (L > MAX_PHOTO) img = await ops.resize(img, Math.round((img.width * MAX_PHOTO) / L), Math.round((img.height * MAX_PHOTO) / L));
  let found = false, by: ClipPage['by'];
  const s = await straighten(img, ops).catch(() => null); // no page: the photo as it is
  if (s?.found) { img = s.img; found = true; by = s.by; }
  if (!live()) return null;
  const glance = async (im: Img) => eng.read(await ops.docEnhance(im, 1), 'eng', undefined, 'block');
  const u = await uprightByReading(img, glance, ops).catch(() => null);
  let up = { turns: 0, slant: 0 };
  if (u && (u.turns || u.slant)) { img = u.img; up = { turns: u.turns, slant: u.slant }; }
  if (!live()) return null;
  let clean = await ops.docEnhance(await ops.sharpen(img, SHARPEN.amount, SHARPEN.sigma), 1);
  let r = await eng.read(clean, 'eng', o.onProgress, 'page');
  if (!live()) return null;
  // Tesseract's layout went wrong (text taken for vertical, lines left unread): read again sharper, the better kept
  if ((r.vertical ?? 0) >= VERTICAL_WORDS || (await unreadLines(clean, r, ops)) >= UNREAD_LINES) {
    o.onAgain?.();
    const sh = await ops.docEnhance(await ops.sharpen(img, SHARPER.amount, SHARPER.sigma), 1), r2 = await eng.read(sh, 'eng', o.onProgress, 'page');
    if (!live()) return null;
    if (score(r2) > score(r) * 1.05) { r = r2; clean = sh; }
  }
  const blocks = blocksOf(r);
  // the pictures: the ink left once the words read are taken away
  const body = bodySize(blocks) || median(r.words.map((w) => w.y1 - w.y0)) || 20, pad = 0.35 * body;
  const skip = r.words.map((w): [number, number, number, number] => [w.x0 - pad, w.y0 - pad, w.x1 - w.x0 + 2 * pad, w.y1 - w.y0 + 2 * pad]);
  const regions = await ops.inkRegions(clean, skip, { thr: 200, dil: Math.max(2, Math.round(0.5 * body)), minArea: Math.round(9 * body * body), max: 200 });
  return { img, blocks: withPictures(blocks, picturesOf(regions, body)), r, found, by, up };
}
