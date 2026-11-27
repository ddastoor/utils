// PDF Tables → Excel (potentials #16): the tables of a PDF — bank statements, bills — as rows for Excel or CSV. MuPDF gives each
// page's words with their boxes and its ruled lines (PDF → EPUB's `readRules`); textcore.wasm finds the tables (table.c: ruled
// grids, and columns where no word stands); this file makes their cells' text, joins a table that runs on over pages (the same
// columns; its header repeated on each page left out), and reads amounts and dates as numbers and dates. No DOM: the unit suite
// runs it in Node.
import type { TableFound } from '../wasm/textcore';

export interface Word { text: string; box: [number, number, number, number]; line: number }
export interface Table {
  /** pages it stands on (0-based), the first first */
  pages: number[];
  kind: 'stream' | 'ruled';
  /** the header row (empty when it has none) and the rows, cells as printed */
  head: string[]; rows: string[][];
  /** where it stands on each page: its box, column and row edges (points) */
  boxes: Array<{ page: number; box: [number, number, number, number]; cols: number[]; rows: number[] }>;
}

/** A page's words (runs of characters between spaces) with their boxes, and the MuPDF line each stands on. Characters that run
 *  up or down the page (a stamp in the margin) are left out. */
export function pageWords(page: any): Word[] {
  const out: Word[] = [];
  let line = -1, cur: { t: string; b: number[] } | null = null;
  const flush = () => { if (cur && cur.t.trim()) out.push({ text: cur.t, box: cur.b as [number, number, number, number], line }); cur = null; };
  page.toStructuredText('preserve-whitespace').walk({
    beginLine: () => { flush(); line++; },
    endLine: flush,
    onChar: (c: string, _o: any, _f: any, _s: number, q: number[]) => {
      if (/\s/.test(c)) { flush(); return; }
      if (Math.abs(q[3] - q[1]) > Math.abs(q[2] - q[0]) + 0.5) { flush(); return; }   // upright text only
      const b = [Math.min(q[0], q[4]), Math.min(q[1], q[3]), Math.max(q[2], q[6]), Math.max(q[5], q[7])];
      if (!cur) cur = { t: c, b };
      else { cur.t += c; cur.b = [Math.min(cur.b[0], b[0]), Math.min(cur.b[1], b[1]), Math.max(cur.b[2], b[2]), Math.max(cur.b[3], b[3])]; }
    },
  });
  flush();
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AMOUNT = /^(?:[-+]?\(?)?(?:₹|Rs\.?|INR|\$|€|£)?\s?-?\d{1,3}(?:,\d{2,3})*(?:\.\d+)?\)?(?:\s?(?:Cr|Dr|CR|DR|cr|dr)\.?)?-?$|^[-+]?\d+(?:\.\d+)?%?$/;
const DATE = /^(\d{1,2})[/.-](\d{1,2}|[A-Za-z]{3,9})[/.-](\d{2}|\d{4})$/;
/** The OCR's words as table words: boxes in points (`k`: points a pixel of the picture read), each as tall as its line — the
 *  OCR's boxes hold only the ink (a word of small letters is half as tall as one with capitals), MuPDF's the font's height,
 *  and the table finder measures its gaps in word heights. */
export function ocrWords(r: { words: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>; lines?: Array<{ w0: number; w1: number }> }, k: number): Word[] {
  const out: Word[] = [];
  (r.lines?.length ? r.lines : [{ w0: 0, w1: r.words.length }]).forEach((l, li) => {
    const ws = r.words.slice(l.w0, l.w1).filter((w) => w?.text.trim());
    if (!ws.length) return;
    const top = Math.min(...ws.map((w) => w.y0)), bot = Math.max(...ws.map((w) => w.y1));
    for (const w of ws) out.push({ text: w.text.trim(), box: [w.x0 * k, top * k, w.x1 * k, bot * k], line: li });
  });
  return out;
}

/** A word that is a number, an amount or a date (what tells a table's rows from its header and its wrapped lines). */
export const isNum = (t: string) => AMOUNT.test(t.trim()) || DATE.test(t.trim()) || /^\d[\d,./:-]*\d$/.test(t.trim());

/** The page's ruled lines as segments (PDF → EPUB's reader: thin filled bars and stroked straight lines). */
export function rulesOf(rl: { h: Array<{ x0: number; y0: number; x1: number; y1: number }>; v: Array<{ x0: number; y0: number; x1: number; y1: number }> }): number[][] {
  return [...rl.h.map((b) => [b.x0, (b.y0 + b.y1) / 2, b.x1, (b.y0 + b.y1) / 2]), ...rl.v.map((b) => [(b.x0 + b.x1) / 2, b.y0, (b.x0 + b.x1) / 2, b.y1])];
}

/** A cell's text: its words line by line (a space between words of a line); lines joined by a space, or by nothing after a
 *  line that ends with "/" or "-" (a narration wrapped at a slash: "…/CHEQUE 004521/" and "NARMADA PACKAGING LLP"). */
export function cellText(ws: Word[]): string {
  const lines: Word[][] = [];
  const sorted = [...ws].sort((a, b) => (a.box[1] + a.box[3]) - (b.box[1] + b.box[3]));
  for (const w of sorted) {
    const l = lines.find((x) => { const y0 = Math.max(x[0].box[1], w.box[1]), y1 = Math.min(x[0].box[3], w.box[3]); return y1 - y0 >= 0.5 * Math.min(x[0].box[3] - x[0].box[1], w.box[3] - w.box[1]); });
    if (l) l.push(w); else lines.push([w]);
  }
  let out = '';
  for (const l of lines) {
    const t = l.sort((a, b) => a.box[0] - b.box[0]).map((w) => w.text).join(' ');
    out = out ? (/[/-]$/.test(out) || /^\//.test(t) ? out + t : `${out} ${t}`) : t;
  }
  return out;
}

/** The tables of one page: textcore's finding made into cells. */
export function pageTables(words: Word[], rules: number[][], page: number, find: (w: number[][], num: boolean[], r: number[][]) => { tables: TableFound[]; word: Int32Array }): Table[] {
  const r = find(words.map((w) => w.box), words.map((w) => isNum(w.text)), rules);
  return r.tables.map((t, ti) => {
    const nc = t.cols.length - 1, nr = t.rows.length - 1;
    const cells: Word[][][] = Array.from({ length: nr }, () => Array.from({ length: nc }, () => []));
    words.forEach((w, i) => { if (r.word[3 * i] === ti) cells[r.word[3 * i + 1]]?.[r.word[3 * i + 2]]?.push(w); });
    const text = cells.map((row) => row.map(cellText));
    // rows left empty (a ruled grid's spare row) are dropped
    const rows = text.filter((row, k) => k >= t.head && row.some((c) => c));
    const head = t.head ? text.slice(0, t.head).reduce((acc, row) => acc.map((c, k) => [c, row[k]].filter(Boolean).join(' ')), Array.from({ length: nc }, () => '')) : [];
    return { pages: [page], kind: t.kind, head, rows, boxes: [{ page, box: t.box, cols: t.cols, rows: t.rows }] };
  });
}

const sameCols = (a: Table, b: Table) => {
  const ca = a.boxes[a.boxes.length - 1].cols, cb = b.boxes[0].cols;
  if (ca.length !== cb.length) return false;
  // the inner edges within 2 % of the table's width of each other
  const w = Math.max(ca[ca.length - 1] - ca[0], 1);
  return ca.every((x, i) => i === 0 || i === ca.length - 1 || Math.abs(x - cb[i]) <= 0.02 * w + 6);
};
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Tables that run on over pages joined: a table that starts a page continues the last table of the page before when its
 *  columns are the same (or its header is) — the header it repeats is left out. */
export function joinPages(tables: Table[]): Table[] {
  const out: Table[] = [];
  for (const t of tables) {
    const prev = out[out.length - 1];
    const firstOnPage = !out.some((x) => x !== prev && x.pages.includes(t.pages[0])) && !(prev && prev.pages.includes(t.pages[0]));
    const headSame = prev && t.head.length && prev.head.length && norm(t.head.join('|')) === norm(prev.head.join('|'));
    if (prev && firstOnPage && t.pages[0] === prev.pages[prev.pages.length - 1] + 1 && (headSame || (sameCols(prev, t) && (!t.head.length || !prev.head.length || headSame)))) {
      prev.rows.push(...t.rows);
      prev.pages.push(t.pages[0]);
      prev.boxes.push(...t.boxes);
      if (!prev.head.length && t.head.length) prev.head = t.head;
      continue;
    }
    out.push({ ...t, pages: [...t.pages], rows: [...t.rows], boxes: [...t.boxes] });
  }
  return out;
}

/** A printed date's form as Excel's number format, so that the Excel file shows the date as the PDF printed it (a real date
 *  all the same — it sorts and counts): 07/11/2026 → dd\/mm\/yyyy, 7-Nov-26 → d\-mmm\-yy, 7 November 2026 → d mmmm yyyy. The
 *  separators are escaped: Excel reads a bare / in a date format as the computer's own date separator (01-11-2026 on many
 *  Indian Windows set-ups). */
export function dateFormat(cell: string): string | null {
  const s = cell.trim();
  const d = s.match(/^(\d{1,2})([/.-])(\d{1,2}|[A-Za-z]{3,9})([/.-])(\d{2}|\d{4})$/) || s.match(/^(\d{1,2})(\s)([A-Za-z]{3,9})(\s)(\d{4})$/);
  if (!d || typeof typed(s) !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(typed(s) as string)) return null;
  const sep = (c: string) => (/\s/.test(c) ? ' ' : `\\${c}`);
  const mon = /^\d+$/.test(d[3]) ? (d[3].length === 2 ? 'mm' : 'm') : d[3].length === 3 ? 'mmm' : 'mmmm';
  return `${d[1].length === 2 ? 'dd' : 'd'}${sep(d[2])}${mon}${sep(d[4])}${d[5].length === 4 ? 'yyyy' : 'yy'}`;
}
/** A cell for the Excel file: `typed`, and a date as { date, format, shown } — sheet.wasm writes it as a real date in the form
 *  it was printed in. */
export function excelCell(cell: string): string | number | { date: string; format: string; shown: string } {
  const v = typed(cell), f = typeof v === 'string' ? dateFormat(cell) : null;
  return f ? { date: v as string, format: f, shown: cell.trim() } : v;
}

/** A cell as Excel takes it: an amount as a number (1,25,000.00 → 125000; (1,234.00) and 1,234.00 Dr → −1234; ₹, Rs. and Cr
 *  dropped), a date as an ISO date (day first: 07/11/2026, 07-11-26, 7 Nov 2026 → 2026-11-07), anything else as it is. */
export function typed(cell: string): string | number {
  const s = cell.trim();
  if (!s) return '';
  const d = s.match(DATE) || s.match(/^(\d{1,2})\s([A-Za-z]{3,9})\s(\d{4})$/);
  if (d) {
    const day = +d[1], mon = /^\d+$/.test(d[2]) ? +d[2] : MONTHS.indexOf(d[2].slice(0, 3).toLowerCase()) + 1;
    let year = +d[3]; if (d[3].length === 2) year += year < 70 ? 2000 : 1900;
    const dt = new Date(Date.UTC(year, mon - 1, day));
    if (mon >= 1 && mon <= 12 && dt.getUTCDate() === day && dt.getUTCMonth() === mon - 1) return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return s;
  }
  const a = s.match(/^([-+]?)\(?\s*(?:₹|Rs\.?|INR|\$|€|£)?\s?(-?)(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*\)?\s*(Cr|Dr|CR|DR|cr|dr)?\.?(-?)$/);
  if (a && /\d/.test(a[3]) && !/^0\d/.test(a[3].replace(/,/g, ''))) {
    // a number that is an identifier (a long reference, an account number) stays text: more than 15 digits, or no grouping
    // and more than 9 digits
    const digits = a[3].replace(/[,.]/g, '');
    if (digits.length > 15 || (!a[3].includes(',') && !a[3].includes('.') && digits.length > 9)) return s;
    const v = +a[3].replace(/,/g, '');
    const neg = a[1] === '-' || a[2] === '-' || a[5] === '-' || /^\(.*\)$/.test(s) || /^dr$/i.test(a[4] || '');
    return neg ? -v : v;
  }
  return s;
}
