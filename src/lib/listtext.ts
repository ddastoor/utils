// The OCR tab's text with the page's lists as they stand on it (to-do #31; owner, 26 Nov 2026: "In the OCR app, the rich
// formatting should be preserved, the bullet points, etc. In the photo dictionary app, it need not be, only because the
// actual OCR rendition is needed for me to further select a phrase that I could then look up in Wikipedia"; the owner's
// choices: plain text with the marks at the line starts and nested items indented — in the text box, Copy and the .txt —,
// lists only: bullets, check boxes, numbered and lettered items, indentation). The reading is not changed — its words,
// their order and its lines stay as the reader (Tesseract, PaddleOCR) gave them:
// - the list marks the clean-up cleared before the page was read (imgproc p_clear_marks lists where each stood and what
//   it was) are put back before the word that followed them: • ◦ ▪ ◆ ► ☐ ☑ ☒ ◉;
// - a line that begins with a list's label as text — a number or a letter with its full stop or bracket (1. 2) a. (b)
//   iv.), or a mark the reader read as a character (– - * •) — is an item too;
// - an item is indented by its level, four spaces a level: the levels are the places the items' marks (or labels) stand
//   at, left to right, counted afresh for each list — a list ends at a line that starts left of its items' text, at the
//   top of a new column, or well below its last line;
// - a line an item runs on to (it starts under the item's text) is set under that text;
// - the blank lines the reader put between the items of one list (Tesseract's paragraphs) are left out where the items
//   stand as close as lines.
// A page without a list keeps the reading's text exactly. No DOM: the unit suite runs it.
import type { OcrResult, OcrWord } from './ocr';
import type { ListMark } from '../wasm/imgproc';

/** How each kind of mark is written (imgproc's MARK: a dot, a ring, a square, a diamond, a triangle, an empty box, a box
 *  with a tick, a box with a cross, a ring round a dot). */
export const GLYPH: Record<number, string> = { 1: '•', 2: '◦', 3: '▪', 4: '◆', 5: '►', 6: '☐', 7: '☑', 8: '☒', 9: '◉' };
/** Spaces a level of a list (the owner's choice: nested items indented). */
export const INDENT = 4;

/** Roman numerals of a list: i … xxxix (and in capitals). */
const ROMAN = /^(?=[ivx])x{0,3}(?:ix|iv|v?i{0,3})$|^(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})$/;
/** A list's label as the reader read it: a mark it read as a character, or a number, letter or roman numeral with its
 *  full stop or bracket — 1. 12) (3) a. B) (c) iv. (XI). Not "1.2" (numbered headings) nor a number alone. */
export function isLabel(t: string): boolean {
  if (/^[•·∙◦○●▪■□☐☑☒✓✔✗✘➢➤►▸»\-–—*+]$/u.test(t)) return true;
  const m = /^(\()?([0-9]{1,3}|[A-Za-z]|[ivxIVX]{2,6})([.)])$/.exec(t);
  if (!m || (m[1] && m[3] !== ')')) return false;
  return /^[0-9A-Za-z]{1,3}$/.test(m[2]) && (/^[0-9]+$/.test(m[2]) || m[2].length === 1 || ROMAN.test(m[2]));
}

interface Row { words: OcrWord[]; para: number; block: number }
interface Item { markX: number; textX: number; lead: number }

export function listText(r: Pick<OcrResult, 'text' | 'words' | 'lines'>, marks: ListMark[] = [], xh = 0): string {
  const rows: Row[] = (r.lines || []).map((l) => ({ words: r.words.slice(l.w0, l.w1), para: l.para, block: l.block })).filter((l) => l.words.length);
  if (!rows.length) return r.text;
  // the x-height: imgproc's on the page read, else from the words' heights (a word's box reaches from its ascenders to its
  // descenders)
  const hs = r.words.map((w) => w.y1 - w.y0).filter((v) => v > 0).sort((a, b) => a - b);
  const X = xh > 0 ? xh : hs.length ? 0.6 * hs[hs.length >> 1] : 10, tol = Math.max(4, 1.5 * X);
  const hOf = (w: OcrWord) => Math.max(1, w.y1 - w.y0 + 1), midY = (w: { y0: number; y1: number }) => (w.y0 + w.y1) / 2;

  // 1. each mark to the word it stood before: the first word that starts right of the mark's middle, on the line whose
  // word there stands at the mark's height (the lines of a page that is not quite level drift; their first words do not)
  const at = rows.map(() => new Map<number, { glyph: string; gap: number; x0: number }>());
  const skip = rows.map(() => new Set<number>());
  for (const m of marks) {
    const glyph = GLYPH[m.kind];
    if (!glyph) continue;
    const my = midY(m), mx = (m.x0 + m.x1) / 2;
    let best: { ri: number; k: number; dy: number; gap: number } | null = null;
    rows.forEach((row, ri) => {
      const k = row.words.findIndex((w) => w.x0 > mx);
      if (k < 0) return;
      const w = row.words[k], gap = w.x0 - m.x1, dy = Math.abs(midY(w) - my);
      if (gap > 12 * X || dy > 0.6 * hOf(w)) return;
      if (!best || dy < best.dy) best = { ri, k, dy, gap };
    });
    if (!best) continue;
    const { ri, k, gap } = best as { ri: number; k: number; gap: number };
    const had = at[ri].get(k);
    if (!had || gap < had.gap) at[ri].set(k, { glyph, gap, x0: m.x0 });
    // a reader that saw the mark (PaddleOCR reads the page as it stands) read it as a character: that word goes
    rows[ri].words.forEach((w, j) => {
      if (j >= k) return;
      const ov = Math.min(w.x1, m.x1) - Math.max(w.x0, m.x0);
      if (ov >= 0.5 * (w.x1 - w.x0) && Math.min(w.y1, m.y1) > Math.max(w.y0, m.y0)) skip[ri].add(j);
    });
  }

  // 2. the lines in their order: items, the lines they run on to, the rest
  const out: string[] = [];
  let stack: Item[] = [], prev: OcrWord | null = null, prevRow: Row | null = null, prevIn = false, changed = false;
  rows.forEach((row, ri) => {
    const kept = row.words.map((w, j) => j).filter((j) => !skip[ri].has(j));
    if (!kept.length) return;
    const first = row.words[kept[0]], mark = at[ri].get(kept[0]);
    // a list ends at the top of a new column (the line starts above the one before) and well below its last line
    if (prev && (first.y0 < prev.y0 - 0.5 * hOf(prev) || first.y0 - prev.y1 > 3 * hOf(prev))) stack = [];
    let item: { markX: number; textX: number; label: string } | null = null;
    if (mark) item = { markX: mark.x0, textX: first.x0, label: mark.glyph };
    else if (kept.length >= 2 && isLabel(first.text)) item = { markX: first.x0, textX: row.words[kept[1]].x0, label: first.text };
    let indent = 0, inList = false;
    if (item) {
      while (stack.length && item.markX < stack[stack.length - 1].markX - tol) stack.pop();
      const top = stack[stack.length - 1];
      if (!top || item.markX > top.markX + tol) stack.push({ markX: item.markX, textX: item.textX, lead: 0 });
      else stack[stack.length - 1] = { markX: top.markX, textX: item.textX, lead: 0 };
      indent = INDENT * (stack.length - 1);
      stack[stack.length - 1].lead = indent + [...item.label].length + 1;
      inList = true;
    } else if (stack.length) {
      // a line an item runs on to: it starts under the text of an open item (the deepest one it stands under)
      let k = stack.length - 1;
      while (k >= 0 && first.x0 < stack[k].textX - tol) k--;
      if (k >= 0) { stack.length = k + 1; indent = stack[k].lead; inList = true; } else stack = [];
    }
    // the paragraph break before it, left out between the lines of one list that stand as close as lines
    if (prevRow && (row.para !== prevRow.para || row.block !== prevRow.block)) {
      if (inList && prevIn && prev && first.y0 - prev.y1 <= hOf(prev)) changed = true;
      else out.push('');
    }
    const parts: string[] = [];
    for (const j of kept) { const mk = at[ri].get(j); if (mk) parts.push(mk.glyph); parts.push(row.words[j].text); }
    if (indent || at[ri].size || skip[ri].size) changed = true;
    out.push(' '.repeat(indent) + parts.join(' '));
    prev = first; prevRow = row; prevIn = inList;
  });
  if (!changed) return r.text;
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');
}
