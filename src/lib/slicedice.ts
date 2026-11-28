// SliceDiceGrapher (potentials #75; owner, 21 Nov 2026: "copy a set of rows and columns, basically a sheet from Excel or LibreOffice … and
// paste it in the app, or upload an Excel file itself with data. Then the app should be able to create different pivots and create different
// graphs based on standard presets … have a download button to be able to save it as an image"). No DOM here: the cells read into typed
// columns, the presets the columns suggest, a pivot turned into Perspective views (the engine: src/lib/pivotengine.ts) and their answer into
// a table, the graphs' ECharts options. The tab: src/tools/slicedice.ts.

// ------------------------------------------------------------------ cells and values
/** a cell as read: the text a sheet shows, or a real value (a file's number, a clipboard's value) */
export type Raw = string | number | boolean | null;
export interface Num { v: number; currency: string; percent: boolean; decimals: number; indian: boolean }

const CUR: Array<[RegExp, string]> = [[/^(₹|rs\.?|inr|rupees?)$/i, '₹'], [/^(us\$|\$|usd)$/i, '$'], [/^(€|eur)$/i, '€'], [/^(£|gbp)$/i, '£'], [/^(¥|jpy|cny|rmb)$/i, '¥'], [/^aed$/i, 'AED'], [/^sgd$/i, 'S$']];
const CUR_RE = '₹|rs\\.?|inr|us\\$|\\$|usd|€|eur|£|gbp|¥|jpy|aed|sgd';
const curOf = (s: string) => CUR.find(([re]) => re.test(s.trim()))?.[1] ?? '';

/** A number as a sheet shows it: 1,23,456.00 · 123,456.78 · ₹ 1,500/- · (1,234) · 1,234 Dr · −5 · 12.5 % · 1.2E+05 — or null. A number that is
 *  an identifier (a phone number, an account, a code with a leading zero) is no number. */
export function readNumber(text: string): Num | null {
  let s = text.replace(/[    ]/g, ' ').trim();
  if (!s || s.length > 40 || !/\d/.test(s)) return null;
  let neg = false, percent = false, currency = '';
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  const dc = s.match(/\s*\b(dr|cr)\.?$/i);
  if (dc) { if (/^dr$/i.test(dc[1])) neg = !neg; s = s.slice(0, dc.index).trim(); }
  if (/^[-−–]/.test(s)) { neg = !neg; s = s.replace(/^[-−–]\s*/, ''); } else if (s.startsWith('+')) s = s.slice(1).trim();
  if (/[-−]$/.test(s) && !s.endsWith('/-')) { neg = !neg; s = s.slice(0, -1).trim(); }
  if (s.endsWith('%')) { percent = true; s = s.slice(0, -1).trim(); }
  const pre = s.match(new RegExp(`^(${CUR_RE})\\s*`, 'i'));
  if (pre) { currency = curOf(pre[1]); s = s.slice(pre[0].length); }
  else { const post = s.match(new RegExp(`\\s*(${CUR_RE})$`, 'i')); if (post) { currency = curOf(post[1]); s = s.slice(0, post.index).trim(); } }
  if (/^[-−]/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
  if (s.endsWith('/-')) s = s.slice(0, -2).trim();
  let indian = false;
  if (/^\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d+)?$/.test(s)) indian = true;
  else if (!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s) && !/^\d+(?:\.\d+)?$/.test(s) && !/^\d*\.\d+$/.test(s) && !/^\d+(?:\.\d+)?[eE][-+]?\d+$/.test(s)) return null;
  const plain = s.replace(/,/g, ''), digits = plain.replace(/\D/g, '');
  if (/^0\d/.test(plain)) return null;                                          // 007, 0471: a code
  if (digits.length > 15 || (!s.includes(',') && !s.includes('.') && !/e/i.test(s) && digits.length > 9 && !currency)) return null;
  const dot = plain.match(/\.(\d+)$/), decimals = /e/i.test(plain) ? 0 : dot ? dot[1].length : 0;
  let v = Number(plain);
  if (!Number.isFinite(v)) return null;
  if (neg) v = -v;
  if (percent) v /= 100;
  return { v, currency, percent, decimals, indian };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (s: string) => { const i = MONTHS.indexOf(s.slice(0, 3).toLowerCase()); return i < 0 || (s.length > 3 && !/^(january|february|march|april|may|june|july|august|september|sept|october|november|december)$/i.test(s) && s.length !== 3 && !/^sept$/i.test(s)) ? 0 : i + 1; };
const ymd = (y: number, m: number, d: number): number | null => {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
  const t = Date.UTC(y, m - 1, d), dt = new Date(t);
  return dt.getUTCDate() === d && dt.getUTCMonth() === m - 1 ? t : null;
};
/** the two numbers of a date written with numbers only, and its year — for telling day first from month first by a column's dates */
export function dateParts(text: string): [number, number] | null {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  return m ? [+m[1], +m[2]] : null;
}
/** A date as a sheet shows it → its UTC midnight (ms), or null: 2026-11-28 (a time after it left out) · 28/11/2026, 28-11-26, 28.11.2026
 *  (day first, or month first when `order` says so) · 28 Nov 2026, 28-Nov-26, 28th November 2026 · Nov 28, 2026 · Nov 2026, Nov-26 (the
 *  month's first day). */
export function readDate(text: string, order: 'dmy' | 'mdy' = 'dmy'): number | null {
  const s = text.replace(/[ ]/g, ' ').trim();
  if (!s || s.length > 40) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)?$/i);
  if (m) return order === 'mdy' ? ymd(+m[3], +m[1], +m[2]) : ymd(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{2}|\d{4})$/i);
  if (m && monthOf(m[2])) return ymd(+m[3], monthOf(m[2]), +m[1]);
  m = s.match(/^([a-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (m && monthOf(m[1])) return ymd(+m[3], monthOf(m[1]), +m[2]);
  m = s.match(/^([a-z]{3,9})\.?[\s-]+(\d{2}|\d{4})$/i);
  if (m && monthOf(m[1])) return ymd(+m[2], monthOf(m[1]), 1);
  return null;
}

// ------------------------------------------------------------------ columns
export type Kind = 'number' | 'date' | 'text';
export interface Fmt { currency: string; percent: boolean; decimals: number; indian: boolean }
export interface Col {
  /** its name as shown (the header, or "Column C") */ name: string;
  kind: Kind;
  fmt: Fmt;
  /** numbers; dates as UTC midnights (ms); texts; null for an empty cell or one that is not of the column's kind */
  values: Array<number | string | null>;
  /** different values among them */ distinct: number;
  /** cells that are not of the column's kind, left out of its sums (shown as they were) */ odd: number;
  /** dates read month first (US) */ mdy?: boolean;
}
export interface Data { cols: Col[]; rows: number; header: boolean; notes: string[] }

export const colLetter = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const textOf = (c: Raw): string => (c === null || c === undefined ? '' : typeof c === 'boolean' ? (c ? 'TRUE' : 'FALSE') : String(c)).replace(/[\s ]+/g, ' ').trim();
const isValue = (c: Raw) => typeof c === 'number' || (typeof c === 'string' && (readNumber(c) !== null || readDate(c) !== null));

/** Should the first row be the columns' names? It should when none of its cells is a number or a date, and a row under it has one. */
export function looksLikeHeader(grid: Raw[][]): boolean {
  const first = grid.find((r) => r.some((c) => textOf(c)));
  if (!first) return false;
  if (first.some((c) => isValue(c))) return false;
  return grid.slice(grid.indexOf(first) + 1).some((r) => r.some((c) => isValue(c))) || grid.length > 1;
}

/** A grid of cells → typed columns. The first row is the header when `header` (default: `looksLikeHeader`); empty rows are left out, and a
 *  last row headed "Total" or "Grand total" (a pasted range often ends with one) is left out and said. A column is a number column when
 *  four in five of its filled cells are numbers, a date column when four in five are dates (day first unless a date says it is month
 *  first: 13/25 cannot be), else text. `exact` (a pasted range's, row for row with `grid`): the value behind a number the sheet shows
 *  rounded — the column's format still comes from the text shown. */
export function readGrid(grid: Raw[][], header = looksLikeHeader(grid), keepTotal = false, exact?: Array<Array<number | null>> | null): Data {
  const notes: string[] = [];
  let rows = grid.map((r, i) => ({ r, x: exact?.[i] ?? null })).filter(({ r }) => r.some((c) => textOf(c)));
  const width = Math.max(0, ...rows.map(({ r }) => r.length));
  let names: string[] = [];
  if (header && rows.length) { names = Array.from({ length: width }, (_, i) => textOf(rows[0].r[i] ?? null)); rows = rows.slice(1); }
  if (!keepTotal && rows.length > 2) {
    const last = rows[rows.length - 1].r, head = textOf(last.find((c) => textOf(c)) ?? null);
    if (/^(grand\s+)?totals?\b:?/i.test(head) || /^sum\b/i.test(head)) { rows = rows.slice(0, -1); notes.push(`The last row (“${head}”) looks like a total of the rows above: left out, so it is not counted twice.`); }
  }
  const seen = new Map<string, number>();
  const cols: Col[] = [];
  for (let i = 0; i < width; i++) {
    let name = (names[i] || '').replace(/"/g, '”').slice(0, 80) || `Column ${colLetter(i)}`;
    const k = name.toLowerCase(), n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) name = `${name} (${n})`;
    cols.push(typeColumn(name, rows.map(({ r }) => r[i] ?? null), rows.map(({ x }) => x?.[i] ?? null)));
  }
  if (!rows.length) notes.push('No rows of data under the header.');
  return { cols, rows: rows.length, header, notes };
}
/** the cells of each column as `readGrid` took them (after the header and a total row), for `retype` */
export function cellsOf(grid: Raw[][], d: Data, exact?: Array<Array<number | null>> | null): Array<{ raw: Raw[]; exact: Array<number | null> }> {
  let rows = grid.map((r, i) => ({ r, x: exact?.[i] ?? null })).filter(({ r }) => r.some((c) => textOf(c)));
  if (d.header) rows = rows.slice(1);
  rows = rows.slice(0, d.rows);
  return d.cols.map((_, i) => ({ raw: rows.map(({ r }) => r[i] ?? null), exact: rows.map(({ x }) => x?.[i] ?? null) }));
}

function typeColumn(name: string, cells: Raw[], exact?: Array<number | null>): Col {
  const filled = cells.filter((c) => textOf(c) !== '');
  let nums = 0, dates = 0, dmy = 0, mdy = 0;
  const fmt: Fmt = { currency: '', percent: false, decimals: 0, indian: false };
  const nf = new Map<string, number>();
  for (const c of filled) {
    if (typeof c === 'number') { nums++; continue; }
    const t = textOf(c);
    const p = dateParts(t);
    if (p) { if (p[0] > 12 && p[1] <= 12) dmy++; if (p[1] > 12 && p[0] <= 12) mdy++; }
    if (readDate(t) !== null || readDate(t, 'mdy') !== null) { dates++; continue; }
    const n = readNumber(t);
    if (n) { nums++; const key = `${n.currency}|${n.percent}`; nf.set(key, (nf.get(key) ?? 0) + 1); fmt.decimals = Math.max(fmt.decimals, n.decimals); if (n.indian) fmt.indian = true; }
  }
  const order: 'dmy' | 'mdy' = mdy > dmy ? 'mdy' : 'dmy';
  const kind: Kind = filled.length && dates >= 0.8 * filled.length ? 'date' : filled.length && nums >= 0.8 * filled.length ? 'number' : 'text';
  if (kind === 'number') {
    const top = [...nf.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) { const [cur, pct] = top[0].split('|'); fmt.currency = cur; fmt.percent = pct === 'true'; }
    if (fmt.currency === '₹') fmt.indian = true;
    for (const c of filled) if (typeof c === 'number') { const d = String(c).match(/\.(\d+)$/); if (d) fmt.decimals = Math.max(fmt.decimals, Math.min(6, d[1].length)); }
    fmt.decimals = Math.min(fmt.decimals, fmt.percent ? 4 : 6);
  }
  let odd = 0;
  const values = cells.map((c, i): number | string | null => {
    const t = textOf(c);
    if (!t) return null;
    if (kind === 'number') { if (typeof c === 'number') return c; const n = readNumber(t); if (n) return exact?.[i] ?? n.v; odd++; return null; }
    if (kind === 'date') { const d = readDate(t, order); if (d !== null) return d; odd++; return null; }
    return t;
  });
  const distinct = new Set(values.filter((v) => v !== null)).size;
  return { name, kind, fmt, values, distinct, odd, ...(kind === 'date' && order === 'mdy' ? { mdy: true } : {}) };
}

/** A column read again as another kind (the column list's choice) */
export function retype(col: Col, raw: Raw[], kind: Kind, exact?: Array<number | null>): Col {
  const c = typeColumn(col.name, raw, exact);
  if (kind === c.kind) return c;
  if (kind === 'text') return { ...c, kind, values: raw.map((x) => textOf(x) || null), fmt: { currency: '', percent: false, decimals: 0, indian: false }, odd: 0, distinct: new Set(raw.map(textOf).filter(Boolean)).size };
  // forced to numbers or dates: what cannot be read is left out
  let odd = 0;
  const values = raw.map((x, i): number | null => {
    const t = textOf(x);
    if (!t) return null;
    const v = kind === 'number' ? (typeof x === 'number' ? x : readNumber(t) ? exact?.[i] ?? readNumber(t)!.v : null) : readDate(t, c.mdy ? 'mdy' : 'dmy');
    if (v === null || v === undefined) odd++;
    return v ?? null;
  });
  return { ...c, kind, values, odd, distinct: new Set(values.filter((v) => v !== null)).size };
}

/** Perspective's schema and rows for the columns */
export function tableOf(d: Data): { schema: Record<string, 'float' | 'date' | 'string'>; columns: Record<string, Array<number | string | null>> } {
  const schema: Record<string, 'float' | 'date' | 'string'> = {}, columns: Record<string, Array<number | string | null>> = {};
  for (const c of d.cols) {
    schema[c.name] = c.kind === 'number' ? 'float' : c.kind === 'date' ? 'date' : 'string';
    columns[c.name] = c.kind === 'date' ? c.values.map((v) => (v === null ? null : new Date(v as number).toISOString().slice(0, 10))) : c.values;
  }
  return { schema, columns };
}

// ------------------------------------------------------------------ a pasted range
/** an element of the clipboard's HTML as a plain tree — the tab makes it from the browser's DOMParser, the tests from parse5 */
export interface HNode { tag: string; attrs: Record<string, string>; kids: Array<HNode | string> }
export type PasteFrom = 'Excel' | 'LibreOffice Calc' | 'Google Sheets' | 'a web page';
export interface Pasted { grid: Raw[][]; exact: Array<Array<number | null>>; from: PasteFrom; cells: number }

/** day 0 of the dates of Excel (its 1900 system, from 1 March 1900 on), LibreOffice and Google Sheets */
const DAY0 = Date.UTC(1899, 11, 30);
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
function nodeText(n: HNode | string): string {
  if (typeof n === 'string') return n;
  if (n.tag === 'br') return '\n';
  if (n.tag === 'style' || n.tag === 'script' || n.tag === 'template') return '';
  return n.kids.map(nodeText).join('');
}
function* elements(n: HNode): Generator<HNode> { yield n; for (const k of n.kids) if (typeof k !== 'string') yield* elements(k); }
/** the rows of a table (its own: through thead, tbody and tfoot, never a table inside it) */
function rowsOf(t: HNode): HNode[] {
  const out: HNode[] = [];
  for (const k of t.kids) {
    if (typeof k === 'string') continue;
    if (k.tag === 'tr') out.push(k);
    else if (k.tag === 'thead' || k.tag === 'tbody' || k.tag === 'tfoot') for (const r of k.kids) if (typeof r !== 'string' && r.tag === 'tr') out.push(r);
  }
  return out;
}
/** the value a spreadsheet put behind a cell's text: Excel's x:num, LibreOffice's sdval, Google Sheets' data-sheets-value */
function valueBehind(a: Record<string, string>): number | null {
  let v: number | null = null;
  if (a['x:num'] !== undefined && a['x:num'] !== '') v = Number(a['x:num']);
  else if (a.sdval !== undefined && a.sdval !== '') v = Number(a.sdval);
  else if (a['data-sheets-value']) { try { const j = JSON.parse(a['data-sheets-value']); if (j && j['1'] === 3 && typeof j['3'] === 'number') v = j['3']; } catch { /* not Google's */ } }
  return v !== null && Number.isFinite(v) ? v : null;
}
/**
 * A range copied in Excel, LibreOffice Calc or Google Sheets (or a table of a web page) — the clipboard's HTML as a tree → the grid as the
 * sheet shows it and, where the sheet gives it, the value behind each number. The largest table is taken; colspan and rowspan fill the grid.
 * **A date** whose text and value agree (the value is a day number: 46119 is 7 April 2026; its year and month are those of the text read day
 * first or month first) becomes its ISO date — so 4/7/2026 from an American Excel is 7 April, not 4 July. **A number** keeps its text (its
 * currency, its decimals) and its exact value (a sheet shows 12 % for 0.12345). Excel's accounting zero ("₹ -") is 0.
 */
export function pasteTables(root: HNode): Pasted | null {
  const all = [...elements(root)];
  const from: PasteFrom = all.some((e) => e.tag === 'google-sheets-html-origin' || 'data-sheets-value' in e.attrs || 'data-sheets-root' in e.attrs) ? 'Google Sheets'
    : all.some((e) => 'x:num' in e.attrs || 'x:str' in e.attrs || (e.tag === 'meta' && /excel/i.test(e.attrs.content ?? '')) || /office:excel/.test(e.attrs['xmlns:x'] ?? '')) ? 'Excel'
    : all.some((e) => 'sdval' in e.attrs || 'sdnum' in e.attrs || (e.tag === 'meta' && /libreoffice|openoffice/i.test(e.attrs.content ?? ''))) ? 'LibreOffice Calc'
    : 'a web page';
  let best: { grid: Raw[][]; exact: Array<Array<number | null>>; cells: number } | null = null;
  for (const t of all) {
    if (t.tag !== 'table' || [...elements(t)].some((e) => e !== t && e.tag === 'table')) continue;
    const trs = rowsOf(t);
    const grid: Raw[][] = [], exact: Array<Array<number | null>> = [];
    let cells = 0;
    trs.forEach((tr, r) => {
      grid[r] ||= []; exact[r] ||= [];
      let c = 0;
      for (const td of tr.kids) {
        if (typeof td === 'string' || (td.tag !== 'td' && td.tag !== 'th')) continue;
        while (grid[r][c] !== undefined) c++;
        const cs = Math.min(1000, Math.max(1, parseInt(td.attrs.colspan ?? '1', 10) || 1)), rs = Math.min(10000, Math.max(1, parseInt(td.attrs.rowspan ?? '1', 10) || 1));
        const text = nodeText(td).replace(/[\s ]+/g, ' ').trim();
        let cell: Raw = text || null, x: number | null = null;
        const v = valueBehind(td.attrs);
        if (v !== null && text) {
          const dd = readDate(text, 'dmy'), dm = readDate(text, 'mdy');
          if (dd !== null || dm !== null) {
            if (v >= 61 && v < 2958466) {
              const t2 = DAY0 + Math.floor(v + 1e-9) * 864e5, sd = new Date(t2);
              if ([dd, dm].some((x2) => x2 !== null && new Date(x2).getUTCFullYear() === sd.getUTCFullYear() && new Date(x2).getUTCMonth() === sd.getUTCMonth())) cell = isoDay(t2);
            }
          } else if (readNumber(text)) x = v;
          else { const z = text.match(/^(₹|rs\.?|\$|€|£|¥)?\s*[-–—]\s*(₹|\$|€|£|¥)?$/i); if (z && v === 0) { cell = `${z[1] ?? z[2] ?? ''}0`; x = 0; } }
        }
        for (let dr = 0; dr < rs && r + dr < trs.length; dr++) {
          grid[r + dr] ||= []; exact[r + dr] ||= [];
          for (let dc = 0; dc < cs; dc++) { grid[r + dr][c + dc] = dr || dc ? null : cell; exact[r + dr][c + dc] = dr || dc ? null : x; }
        }
        if (text) cells++;
        c += cs;
      }
    });
    const width = Math.max(0, ...grid.map((r) => r.length));
    const g2 = grid.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null)), x2 = exact.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null));
    if (cells && (!best || cells > best.cells)) best = { grid: g2, exact: x2, cells };
  }
  return best ? { ...best, from } : null;
}

/** The sample: 360 sales of a tea and spice trader across India over two years — dates, regions, cities, products, units, prices in rupees,
 *  sales and discounts, written as a sheet shows them. Made from a fixed seed: the same every time. */
export function sampleGrid(): Raw[][] {
  let seed = 75;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const REG: Record<string, string[]> = { North: ['Delhi', 'Jaipur', 'Lucknow', 'Chandigarh'], South: ['Bengaluru', 'Chennai', 'Hyderabad', 'Kochi'], East: ['Kolkata', 'Bhubaneswar', 'Patna', 'Guwahati'], West: ['Mumbai', 'Pune', 'Ahmedabad', 'Surat'] };
  const PROD: Array<[string, number]> = [['Tea', 240], ['Coffee', 420], ['Honey', 610], ['Spices', 180], ['Rice', 95], ['Ghee', 720]];
  const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const t0 = Date.UTC(2025, 0, 1), days = 696;           // 1 January 2025 – 27 November 2026
  const rows: Array<{ t: number; r: Raw[] }> = [];
  for (let i = 0; i < 360; i++) {
    const t = t0 + Math.floor(rnd() * days) * 864e5, dt = new Date(t), m = dt.getUTCMonth();
    const region = pick(Object.keys(REG)), city = pick(REG[region]);
    const [product, price] = pick(PROD);
    const season = product === 'Tea' || product === 'Coffee' ? 1 + 0.35 * Math.cos(((m + 0.5) / 12) * 2 * Math.PI) : 1;
    const growth = 1 + (0.3 * (t - t0)) / (days * 864e5);
    const units = Math.max(1, Math.round((5 + rnd() * 55) * season * growth));
    const disc = pick([0, 0, 0, 0.05, 0.1, 0.125, 0.15, 0.2]);
    const sales = Math.round(units * price * (1 - disc) * 100) / 100;
    const p2 = (n: number) => String(n).padStart(2, '0');
    rows.push({ t, r: [`${p2(dt.getUTCDate())}/${p2(m + 1)}/${dt.getUTCFullYear()}`, region, city, product, units, `₹${inr.format(price)}`, `₹${inr.format(sales)}`, `${+(disc * 100).toFixed(1)}%`] });
  }
  rows.sort((a, b) => a.t - b.t);
  return [['Date', 'Region', 'City', 'Product', 'Units', 'Price', 'Sales', 'Discount'], ...rows.map((x) => x.r)];
}

// ------------------------------------------------------------------ the pivot
export type Agg = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinct';
export type Show = 'value' | 'pct_total' | 'pct_parent' | 'pct_row' | 'pct_col' | 'running';
export type Grain = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'month_of_year' | 'day_of_week';
export interface Field { name: string; grain?: Grain }
export interface Value { field: string; agg: Agg; show: Show }
export interface Filter { field: string; op: 'in' | 'not in' | '>=' | '<=' | 'contains'; value: string | number | string[] }
export type Order = 'label' | 'label-desc' | 'value-desc' | 'value-asc';
export interface PivotSpec { rows: Field[]; cols: Field | null; values: Value[]; filters: Filter[]; order: Order; top: number; subtotals: boolean; totals: boolean }

// no median: Perspective 5.10's median is not the middle value of a larger group (27.5 for 28.5 — docs/WASM-AUDIT.md); the box plot's medians are
// mathcore's (boxesOf)
export const AGGS: Array<[Agg, string]> = [['sum', 'Sum'], ['count', 'Count'], ['avg', 'Average'], ['min', 'Minimum'], ['max', 'Maximum'], ['distinct', 'Distinct count']];
export const SHOWS: Array<[Show, string]> = [['value', 'The value'], ['pct_total', '% of the grand total'], ['pct_parent', '% of the group above'], ['pct_row', '% of the row'], ['pct_col', '% of the column'], ['running', 'Running total (down the rows)']];
export const GRAINS: Array<[Grain, string]> = [['year', 'Year'], ['quarter', 'Quarter'], ['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['month_of_year', 'Month of the year'], ['day_of_week', 'Day of the week']];
const AGG_ENGINE: Record<Agg, string> = { sum: 'sum', count: 'count', avg: 'avg', min: 'min', max: 'max', distinct: 'distinct count' };
const aggWord = (a: Agg) => AGGS.find((x) => x[0] === a)![1];
export const ROWS = '·Rows';   // the count of rows, as a value: an expression of 1s summed (· keeps it apart from a column a sheet calls Rows)

/** the name of a field as the pivot shows it: "Date (month)" */
export const fieldLabel = (f: Field) => (f.grain ? `${f.name} (${GRAINS.find((g) => g[0] === f.grain)![1].toLowerCase()})` : f.name);
/** the name of a value: "Sum of Sales", "Rows", "Sales — % of the grand total" */
export function valueLabel(v: Value): string {
  const base = v.field === ROWS ? 'Rows' : v.agg === 'count' ? `Count of ${v.field}` : `${aggWord(v.agg)} of ${v.field}`;
  return v.show === 'value' ? base : `${base} (${SHOWS.find((s) => s[0] === v.show)![1].replace(/ \(down the rows\)/, '')})`;
}

const q = (name: string) => `"${name.replace(/"/g, '\\"')}"`;
function grainExpr(f: Field, forSplit: boolean): string {
  const c = q(f.name);
  switch (f.grain) {
    case 'year': return forSplit ? `string(bucket(${c}, 'Y'))` : `bucket(${c}, 'Y')`;
    case 'quarter': return forSplit ? `string(bucket(${c}, '3M'))` : `bucket(${c}, '3M')`;
    case 'month': return forSplit ? `string(bucket(${c}, 'M'))` : `bucket(${c}, 'M')`;
    case 'week': return forSplit ? `string(bucket(${c}, 'W'))` : `bucket(${c}, 'W')`;
    case 'month_of_year': return `month_of_year(${c})`;
    case 'day_of_week': return `day_of_week(${c})`;
    default: return forSplit ? `string(${c})` : c;
  }
}
export interface ViewPlan {
  config: { group_by: string[]; split_by: string[]; columns: string[]; aggregates: Record<string, string>; expressions: Record<string, string>; filter: Array<[string, string, unknown]>; group_rollup_mode: 'rollup' };
  /** the engine's column for each value, in order */ valueCols: string[];
  /** a second view without the split, for the rows' totals (null without a split) */ totals: ViewPlan['config'] | null;
}
/** The pivot as Perspective views: group_by (date fields by their grain), split_by, a column a value (a value of a field used twice is an
 *  expression copying it), the aggregates, the filters. Always with subtotals: the table hides them when asked. */
export function viewPlan(spec: PivotSpec, d: Data): ViewPlan {
  const kinds = new Map(d.cols.map((c) => [c.name, c.kind]));
  const expressions: Record<string, string> = {};
  // a date field by its grain is an expression (a day's date as rows is the column itself); a split's dates are text (ISO), so that the
  // split's column names say the date the same way on every computer
  const key = (f: Field, split: boolean): string => {
    if (kinds.get(f.name) !== 'date') return f.name;
    const grain = f.grain ?? 'day';
    if (!split && grain === 'day') return f.name;
    const name = `·${fieldLabel({ name: f.name, grain })}${split ? ' ·s' : ''}`;
    expressions[name] = grainExpr({ name: f.name, grain }, split);
    return name;
  };
  const group_by = spec.rows.map((f) => key(f, false));
  const split_by = spec.cols ? [key(spec.cols, true)] : [];
  const aggregates: Record<string, string> = {}, valueCols: string[] = [], used = new Set<string>();
  for (const v of spec.values) {
    let col: string;
    if (v.field === ROWS) { col = ROWS; expressions[ROWS] = '1'; aggregates[col] = 'sum'; }
    else {
      col = used.has(v.field) ? `${v.field} ·${v.agg}·${valueCols.length}` : v.field;   // a field used twice: a copy of it as an expression
      if (col !== v.field) expressions[col] = q(v.field);
      aggregates[col] = AGG_ENGINE[v.agg];
    }
    used.add(v.field); valueCols.push(col);
  }
  const filter: Array<[string, string, unknown]> = spec.filters.map((f) => {
    const k = kinds.get(f.field);
    if (k === 'date' && typeof f.value === 'number') return [f.field, f.op, new Date(f.value).toISOString().slice(0, 10)];
    return [f.field, f.op, f.value];
  });
  const config = { group_by, split_by, columns: [...new Set(valueCols)], aggregates, expressions, filter, group_rollup_mode: 'rollup' as const };
  return { config, valueCols, totals: split_by.length ? { ...config, split_by: [] } : null };
}

// ------------------------------------------------------------------ the answer as a table
export interface PRow { path: Array<string | number | null>; labels: string[]; depth: number; kind: 'leaf' | 'sub' | 'total'; cells: Array<number | null>; total: Array<number | null> }
export interface PCol { split: string | null; splitLabel: string; value: number }
export interface Pivot { spec: PivotSpec; rows: PRow[]; cols: PCol[]; splits: Array<string | null>; values: Value[]; fmts: Fmt[]; note: string[] }

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** a group's label: a date bucket in words, a number formatted, an empty value "(blank)" */
export function labelOf(v: string | number | null | undefined, f: Field | null, d: Data): string {
  if (v === null || v === undefined || v === '') return '(blank)';
  const kind = f ? d.cols.find((c) => c.name === f.name)?.kind : undefined;
  if (kind === 'date') {
    if (f?.grain === 'month_of_year' || f?.grain === 'day_of_week') return String(v).replace(/^\d+\s+/, '');
    const t = typeof v === 'number' ? v : Date.parse(String(v).length === 10 ? `${v}T00:00:00Z` : String(v));
    if (!Number.isFinite(t)) return String(v);
    const dt = new Date(t), y = dt.getUTCFullYear(), m = dt.getUTCMonth();
    switch (f?.grain) {
      case 'year': return String(y);
      case 'quarter': return `Q${Math.floor(m / 3) + 1} ${y}`;
      case 'month': return `${MONTH_NAMES[m]} ${y}`;
      case 'week': return `Week of ${dt.getUTCDate()} ${MONTH_NAMES[m]} ${y}`;
      default: return `${dt.getUTCDate()} ${MONTH_NAMES[m]} ${y}`;
    }
  }
  if (typeof v === 'number') { const c = f ? d.cols.find((x) => x.name === f.name) : undefined; return c ? fmtNumber(v, c.fmt) : String(v); }
  return String(v);
}
/** the order of a group's labels: by the value under the label (dates by time, month names by month) */
const sortKey = (v: string | number | null): string | number => (v === null ? '￿' : typeof v === 'number' ? v : /^\d+ /.test(v) ? +v.split(' ')[0] : v.toLowerCase());

/**
 * The engine's answer (`to_columns()` of the view — and of the totals' view with a split) → the pivot: a row a group (its labels, its
 * depth), the subtotals and the grand total marked, a cell a split and value; then the rows ordered (by label or by the first value,
 * within each group), the top N groups kept, the subtotals and the total hidden when asked, and the values shown as asked (% of the total,
 * of the group above, of the row, of the column, a running total).
 */
export function pivotOf(spec: PivotSpec, d: Data, plan: ViewPlan, main: Record<string, unknown[]>, totals: Record<string, unknown[]> | null): Pivot {
  const paths = (main.__ROW_PATH__ as Array<Array<string | number | null>>) ?? [[]];
  const n = paths.length;
  // the split columns: "split|col" names, in the engine's order
  const splits: Array<string | null> = [];
  const colIndex: Array<{ split: string | null; value: number; key: string }> = [];
  if (spec.cols) {
    const seen = new Set<string>();
    for (const k of Object.keys(main)) {
      if (k === '__ROW_PATH__') continue;
      const vi = plan.valueCols.findIndex((c) => k.endsWith(`|${c}`));
      if (vi < 0) continue;
      const split = k.slice(0, k.length - plan.valueCols[vi].length - 1);
      if (!seen.has(split)) { seen.add(split); splits.push(split); }
    }
    splits.sort((a, b) => { const x = sortKey(a), y = sortKey(b); return x < y ? -1 : x > y ? 1 : 0; });
    for (const s of splits) plan.valueCols.forEach((c, vi) => colIndex.push({ split: s, value: vi, key: `${s}|${c}` }));
  } else plan.valueCols.forEach((c, vi) => colIndex.push({ split: null, value: vi, key: c }));
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  type Node = { row: PRow; kids: Node[]; parent: Node | null };
  const nodes: Node[] = [];
  const root: Node[] = [];
  const stack: Node[] = [];
  for (let i = 0; i < n; i++) {
    const path = paths[i];
    const cells = colIndex.map((c) => num((main[c.key] as unknown[] | undefined)?.[i]));
    const total = spec.cols && totals ? plan.valueCols.map((c) => num((totals[c] as unknown[] | undefined)?.[i])) : plan.valueCols.map((_, vi) => cells[vi] ?? null);
    const depth = path.length;
    const labels = path.map((v, k) => labelOf(v, spec.rows[k] ?? null, d));
    const row: PRow = { path, labels, depth, kind: depth === 0 ? 'total' : depth === spec.rows.length ? 'leaf' : 'sub', cells, total };
    const node: Node = { row, kids: [], parent: null };
    nodes.push(node);
    while (stack.length && stack[stack.length - 1].row.depth >= depth) stack.pop();
    node.parent = stack[stack.length - 1] ?? null;
    if (node.parent) node.parent.kids.push(node); else root.push(node);
    stack.push(node);
  }
  // the totals' view has the same rows in the same order (the same group_by); a missing one leaves the cell's own value
  const note: string[] = [];
  const firstVal = (r: PRow) => r.total[0] ?? -Infinity;
  const order = (list: Node[], depth: number) => {
    list.sort((a, b) => {
      if (spec.order === 'value-desc' || spec.order === 'value-asc') { const x = firstVal(a.row), y = firstVal(b.row); if (x !== y) return spec.order === 'value-desc' ? y - x : x - y; }
      const x = sortKey(a.row.path[depth - 1] ?? null), y = sortKey(b.row.path[depth - 1] ?? null);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return spec.order === 'label-desc' ? -c : c;
    });
    for (const k of list) order(k.kids, depth + 1);
  };
  const top = root[0]?.row.kind === 'total' ? root[0] : null;
  const groups = top ? top.kids : root;
  order(groups, 1);
  let kept = groups;
  if (spec.top > 0 && groups.length > spec.top) { note.push(`The top ${spec.top} of ${groups.length} ${spec.rows[0] ? fieldLabel(spec.rows[0]) : 'groups'}${spec.order === 'value-asc' ? ' (the smallest)' : ''}; the total is of all of them.`); kept = groups.slice(0, spec.top); }
  const out: PRow[] = [];
  const walk = (list: Node[]) => { for (const k of list) { if (k.row.kind !== 'sub' || spec.subtotals) out.push(k.row); walk(k.kids); } };
  walk(kept);
  if (top && spec.totals) out.push(top.row);
  // what the values show
  const vals = spec.values;
  const grand = top?.row;
  const parentOf = new Map<PRow, PRow | null>();
  for (const nd of nodes) parentOf.set(nd.row, nd.parent?.row ?? null);
  // the cells as the engine gave them (a parent or the total is shown before or after its children: it is changed in place)
  const orig = new Map<PRow, Array<number | null>>(nodes.map((nd) => [nd.row, nd.row.cells.slice()]));
  const cellOf = (r: PRow | null | undefined, ci: number) => (r ? orig.get(r)?.[ci] ?? null : null);
  const shown = (r: PRow, ci: number): number | null => {
    const c = colIndex[ci], v = cellOf(r, ci), how = vals[c.value].show;
    if (v === null) return null;
    if (how === 'pct_total') { const g = grand ? grand.total[c.value] : null; return g ? v / g : null; }
    if (how === 'pct_parent') { const g = cellOf(parentOf.get(r) ?? r, ci); return g ? v / g : null; }
    if (how === 'pct_row') { const g = r.total[c.value]; return g ? v / g : null; }
    if (how === 'pct_col') { const g = cellOf(grand, ci); return g ? v / g : null; }
    return v;
  };
  for (const r of out) r.cells = r.cells.map((_, ci) => shown(r, ci));
  // running totals: down the leaves (or the rows of the deepest level shown), in the order shown, each split on its own
  vals.forEach((v, vi) => {
    if (v.show !== 'running') return;
    colIndex.forEach((c, ci) => {
      if (c.value !== vi) return;
      let acc = 0;
      for (const r of out) { if (r.kind === 'leaf' || (r.kind === 'sub' && !out.some((x) => x.kind === 'leaf'))) { acc += r.cells[ci] ?? 0; r.cells[ci] = acc; } }
    });
  });
  const fmts = vals.map((v) => valueFmt(v, d));
  return { spec, rows: out, cols: colIndex.map((c) => ({ split: c.split, splitLabel: c.split === null ? '' : labelOf(c.split, spec.cols, d), value: c.value })), splits, values: vals, fmts, note };
}

/** how a value is written: a sum of rupees in rupees, a count in whole numbers, a percentage as one */
export function valueFmt(v: Value, d: Data): Fmt {
  const c = d.cols.find((x) => x.name === v.field);
  if (v.show.startsWith('pct')) return { currency: '', percent: true, decimals: 1, indian: false };
  if (v.agg === 'count' || v.agg === 'distinct' || v.field === ROWS) return { currency: '', percent: false, decimals: 0, indian: !!c?.fmt.indian };
  if (!c || c.kind !== 'number') return { currency: '', percent: false, decimals: 0, indian: false };
  return { ...c.fmt, decimals: v.agg === 'avg' ? Math.max(c.fmt.decimals, c.fmt.percent ? 1 : 2) : c.fmt.decimals };
}

const nfCache = new Map<string, Intl.NumberFormat>();
/** a number written as the column writes it: ₹1,23,456.00 (Indian grouping for rupees and where the sheet used it), 12.5 %, 1,234.5 */
export function fmtNumber(v: number | null, f: Fmt): string {
  if (v === null || !Number.isFinite(v)) return '';
  const x = f.percent ? v * 100 : v;
  const dec = f.percent ? Math.min(2, Math.max(f.decimals, 0)) : f.decimals;
  const key = `${f.indian}|${dec}`;
  let nf = nfCache.get(key);
  if (!nf) { nf = new Intl.NumberFormat(f.indian ? 'en-IN' : 'en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); nfCache.set(key, nf); }
  const s = nf.format(Math.abs(x) < 0.5 * 10 ** -dec ? 0 : x).replace(/^-/, '−');
  return `${f.currency && !f.percent ? (s.startsWith('−') ? `−${f.currency}${s.slice(1)}` : `${f.currency}${s}`) : s}${f.percent ? ' %' : ''}`;
}

/** The pivot as a grid of text (Copy, CSV, the picture) or of values (Excel): a header row (with the split's values above when there is a
 *  split), then a row a group, its labels in a column each */
export function pivotGrid(p: Pivot, d: Data, raw = false): Array<Array<string | number | null>> {
  const heads = p.spec.rows.map(fieldLabel);
  const lead = Math.max(1, heads.length);
  const out: Array<Array<string | number | null>> = [];
  if (p.spec.cols) out.push([...Array(lead).fill(''), ...p.cols.map((c) => c.splitLabel)]);
  out.push([...(heads.length ? heads : ['']), ...p.cols.map((c) => valueLabel(p.values[c.value]))]);
  for (const r of p.rows) {
    const labels = r.kind === 'total' ? ['Total', ...Array(lead - 1).fill('')] : Array.from({ length: lead }, (_, k) => (k < r.labels.length ? (k === r.labels.length - 1 || raw ? r.labels[k] : r.labels[k]) : r.kind === 'sub' && k === r.labels.length ? 'Subtotal' : ''));
    out.push([...labels, ...r.cells.map((v, ci) => (raw ? v : fmtNumber(v, p.fmts[p.cols[ci].value])))]);
  }
  void d;
  return out;
}

// ------------------------------------------------------------------ the tables a card shows and saves
export interface THead { text: string; span: number }
export interface TRow { kind: 'leaf' | 'sub' | 'total'; depth: number; labels: string[]; values: Array<number | null>; fmts: Fmt[] }
/** A table as a card shows it (on the screen, as a picture) and saves it (CSV, Excel): header rows of cells that may span columns, `lead`
 *  label columns, then a value a column. */
export interface TOut { heads: THead[][]; lead: number; rows: TRow[]; note: string[] }
const NOFMT: Fmt = { currency: '', percent: false, decimals: 0, indian: false };
/** a pivot's table: one header row, or two with a split (Excel's layout: with one value its name in the corner over the row fields and the
 *  split's name over the split's values; with several, the split's values over the values' names) */
export function tableOfPivot(p: Pivot): TOut {
  const lead = Math.max(1, p.spec.rows.length), rowHeads = p.spec.rows.length ? p.spec.rows.map(fieldLabel) : [''];
  const heads: THead[][] = [];
  if (p.spec.cols) {
    const groups: THead[] = [];
    for (const c of p.cols) { const g = groups[groups.length - 1]; if (g && (g as THead & { key?: string | null }).key === c.split) g.span++; else groups.push(Object.assign({ text: c.splitLabel, span: 1 }, { key: c.split })); }
    groups.forEach((g) => delete (g as THead & { key?: string | null }).key);
    if (p.values.length === 1) heads.push([{ text: valueLabel(p.values[0]), span: lead }, { text: fieldLabel(p.spec.cols), span: p.cols.length }], [...rowHeads.map((t) => ({ text: t, span: 1 })), ...groups]);
    else heads.push([{ text: fieldLabel(p.spec.cols), span: lead }, ...groups], [...rowHeads.map((t) => ({ text: t, span: 1 })), ...p.cols.map((c) => ({ text: valueLabel(p.values[c.value]), span: 1 }))]);
  } else heads.push([...rowHeads.map((t) => ({ text: t, span: 1 })), ...p.cols.map((c) => ({ text: valueLabel(p.values[c.value]), span: 1 }))]);
  const fmts = p.cols.map((c) => p.fmts[c.value]);
  return { heads, lead, rows: p.rows.map((r) => ({ kind: r.kind, depth: r.depth, labels: r.kind === 'total' ? ['Total'] : r.labels, values: r.cells, fmts })), note: p.note };
}
/** a histogram's bins: from, to, the rows in each */
export function tableOfBins(b: NonNullable<ChartExtra['bins']>): TOut {
  return { heads: [[{ text: `${b.field}: from`, span: 1 }, { text: 'to (not included)', span: 1 }, { text: 'Rows', span: 1 }]], lead: 2,
    rows: b.from.map((x, i) => ({ kind: 'leaf' as const, depth: 1, labels: [fmtNumber(x, b.fmt), fmtNumber(x + b.step, b.fmt)], values: [b.counts[i]], fmts: [NOFMT] })),
    note: [`${b.counts.reduce((a, x) => a + x, 0).toLocaleString('en-IN')} rows in ${b.counts.length} bins of ${fmtNumber(b.step, { ...b.fmt, decimals: Math.max(b.fmt.decimals, b.step < 1 ? Math.ceil(-Math.log10(b.step)) : 0) })}; the last bin holds its upper end.`] };
}
/** a box plot's five numbers by group */
export function tableOfBoxes(bx: NonNullable<ChartExtra['boxes']>, group: string): TOut {
  const f = { ...bx.fmt, decimals: Math.max(bx.fmt.decimals, 2) };
  return { heads: [[{ text: group, span: 1 }, ...['Smallest', 'First quartile', 'Median', 'Third quartile', 'Largest'].map((t) => ({ text: `${t} ${bx.field}`, span: 1 }))]], lead: 1,
    rows: bx.cats.map((c, i) => ({ kind: 'leaf' as const, depth: 1, labels: [c], values: [...bx.stats[i]], fmts: Array(5).fill(f) })), note: ['Quartiles by linear interpolation between the sorted values (Excel’s QUARTILE.INC, NumPy’s default).'] };
}
/** a scatter's points */
export function tableOfPoints(pt: NonNullable<ChartExtra['points']>): TOut {
  return { heads: [[{ text: pt.xName, span: 1 }, { text: pt.yName, span: 1 }]], lead: 0, rows: pt.x.map((x, i) => ({ kind: 'leaf' as const, depth: 1, labels: [], values: [x, pt.y[i]], fmts: [pt.xFmt, pt.yFmt] })), note: [] };
}
/** the labels a table shows (outline form: a group's label once, on its first row; the total row "Total") */
export function shownLabels(t: TOut): string[][] {
  let prev: string[] = [];
  return t.rows.map((r) => {
    const out = Array.from({ length: t.lead }, (_, k) => {
      if (r.kind === 'total') return k === 0 ? 'Total' : '';
      if (k >= r.labels.length) return '';
      return k < r.labels.length - 1 && prev.length > k && prev.slice(0, k + 1).join('\u0000') === r.labels.slice(0, k + 1).join('\u0000') ? '' : r.labels[k];
    });
    prev = r.kind === 'total' ? [] : r.labels;
    return out;
  });
}
const plainNum = (v: number | null, f: Fmt) => (v === null || !Number.isFinite(v) ? '' : f.percent ? `${+(v * 100).toPrecision(12)}%` : `${+v.toPrecision(15)}`);
/** a table as CSV rows: the header rows (a spanning cell's text in its first column), then every row with its labels in full (a subtotal's
 *  next label "Subtotal"), numbers plain and percentages with % (Excel, LibreOffice and Google Sheets read them as numbers) */
export function csvRows(t: TOut): string[][] {
  const heads = t.heads.map((hr) => hr.flatMap((c) => [c.text, ...Array(Math.max(0, c.span - 1)).fill('')]));
  return [...heads, ...t.rows.map((r) => [...Array.from({ length: t.lead }, (_, k) => (r.kind === 'total' ? (k ? '' : 'Total') : k < r.labels.length ? r.labels[k] : r.kind === 'sub' && k === r.labels.length ? 'Subtotal' : '')), ...r.values.map((v, i) => plainNum(v, r.fmts[i]))])];
}
/** Excel's number format of a column's format: [$₹-4009]#,##,##0.00 (rupees in lakhs), [$$-409]#,##0.00, 0.0% */
export function excelFormat(f: Fmt): string {
  const dec = f.percent ? Math.min(2, Math.max(0, f.decimals)) : Math.max(0, f.decimals), frac = dec > 0 ? `.${'0'.repeat(dec)}` : '';
  if (f.percent) return `0${frac}%`;
  const body = `${f.indian ? '#,##,##0' : '#,##0'}${frac}`;
  if (f.currency === '₹') return `[$₹-4009]${body}`;
  if (f.currency === '$') return `[$$-409]${body}`;
  return f.currency ? `"${f.currency.replace(/"/g, '')}"${body}` : body;
}
export type XCell = string | null | { text: string; bold: boolean } | { num: number; format: string; bold: boolean; shown: string };
/** a table as Excel cells (sheet.wasm's writer): the header rows in bold, labels as text (bold on subtotal and total rows), numbers with their
 *  format — a sum of rupees in rupees, a share as a percentage */
export function xlsxRows(t: TOut): XCell[][] {
  const heads = t.heads.map((hr) => hr.flatMap((c): XCell[] => [{ text: c.text, bold: true }, ...Array(Math.max(0, c.span - 1)).fill(null)]));
  return [...heads, ...t.rows.map((r) => {
    const bold = r.kind !== 'leaf';
    const labels = csvRows({ ...t, heads: [], rows: [r] })[0].slice(0, t.lead).map((x): XCell => (x ? (bold ? { text: x, bold } : x) : null));
    return [...labels, ...r.values.map((v, i): XCell => (v === null || !Number.isFinite(v) ? null : { num: v, format: excelFormat(r.fmts[i]), bold, shown: fmtNumber(v, r.fmts[i]) }))];
  })];
}

// ------------------------------------------------------------------ presets
export type GraphKind = 'column' | 'column-stacked' | 'column-100' | 'bar' | 'bar-stacked' | 'line' | 'area' | 'area-stacked' | 'pie' | 'donut' | 'scatter' | 'heatmap' | 'treemap' | 'sunburst' | 'waterfall' | 'funnel' | 'pareto' | 'histogram' | 'box' | 'combo';
export const GRAPHS: Array<[GraphKind, string]> = [
  ['column', 'Columns'], ['column-stacked', 'Columns, stacked'], ['column-100', 'Columns, 100 %'], ['bar', 'Bars'], ['bar-stacked', 'Bars, stacked'],
  ['line', 'Line'], ['area', 'Area'], ['area-stacked', 'Area, stacked'], ['pie', 'Pie'], ['donut', 'Donut'], ['scatter', 'Scatter (two numbers)'],
  ['heatmap', 'Heatmap'], ['treemap', 'Treemap'], ['sunburst', 'Sunburst'], ['waterfall', 'Waterfall'], ['funnel', 'Funnel'], ['pareto', 'Pareto'],
  ['histogram', 'Histogram (one number)'], ['box', 'Box plot'], ['combo', 'Columns + line'],
];
export interface Preset { id: string; title: string; spec: PivotSpec; graph: GraphKind; x?: string; y?: string }

const base = (): PivotSpec => ({ rows: [], cols: null, values: [], filters: [], order: 'label', top: 0, subtotals: true, totals: true });
const AMOUNT = /(sales|revenue|amount|amt|total|value|turnover|income|expense|expenditure|spend|spent|cost|profit|loss|balance|paid|payment|debit|credit|withdrawal|deposit|salary|price paid|gmv|bill)/i;
const RATE = /(price|rate|mrp|unit cost|per unit|avg|average|percent|ratio|margin)/i;
const QTY = /(units|qty|quantity|count|pieces|pcs|items|orders|visits|clicks|hours|days|kg|litres|liters)/i;
const ID_LIKE = /(^|[\s_.-])(id|no|nos|num|number|code|pin|pincode|zip|phone|mobile|tel|sr|s\.?no|serial|roll|invoice|bill|order|ref|account|a\/c)([\s_.-]|$)/i;
/** the columns' roles: categories (a few different texts), measures (numbers that are amounts, not identifiers), dates */
export function roles(d: Data) {
  const cats = d.cols.filter((c) => c.kind === 'text' && c.distinct >= 2 && c.distinct <= Math.max(2, Math.min(60, d.rows * 0.9)));
  const nums = d.cols.filter((c) => c.kind === 'number' && !(ID_LIKE.test(c.name) && !c.fmt.currency && !c.fmt.percent) && !(c.distinct === d.rows && d.rows > 5 && c.values.every((v, i) => v === null || v === (c.values[0] as number) + i)));
  const years = d.cols.filter((c) => c.kind === 'number' && /^(year|yr|fy)/i.test(c.name) && c.values.every((v) => v === null || (Number.isInteger(v) && (v as number) > 1900 && (v as number) < 2200)));
  const dates = d.cols.filter((c) => c.kind === 'date' && c.distinct >= 2);
  // the measure a question is first asked of: an amount by its name, then money, then counts (units, quantities), a price or a rate
  // (better averaged than added) and percentages last
  const rank = (c: Col) => (AMOUNT.test(c.name) ? 0 : c.fmt.currency && !RATE.test(c.name) ? 1 : c.fmt.percent ? 5 : RATE.test(c.name) ? 4 : QTY.test(c.name) ? 2 : 3);
  const measures = nums.filter((n) => !years.includes(n)).map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
  return { cats: [...cats, ...years.filter((y) => !cats.includes(y))], nums: measures, dates };
}
/** the span of a date column, to choose its grain */
function grainFor(c: Col): Grain {
  const ts = c.values.filter((v): v is number => typeof v === 'number');
  if (!ts.length) return 'month';
  const span = (Math.max(...ts) - Math.min(...ts)) / 864e5;
  return span <= 62 ? 'day' : span <= 2.2 * 365 ? 'month' : span <= 6 * 365 ? 'quarter' : 'year';
}
/** The presets the columns suggest — the usual questions of a sheet: a total by category, a trend by month, a category by month, the share
 *  of each, the top ten, a count, an average, a breakdown in two levels, year against year, the spread of a number, two numbers against each
 *  other, the Pareto of a category. */
export function presetsFor(d: Data): Preset[] {
  const { cats, nums, dates } = roles(d);
  const out: Preset[] = [];
  const m = nums[0], c = cats[0], c2 = cats[1], dt = dates[0];
  const sum = (f: Col): Value => ({ field: f.name, agg: 'sum', show: 'value' });
  const add = (p: Preset) => { if (!out.some((x) => x.id === p.id)) out.push(p); };
  if (m && c) add({ id: 'total-by', title: `Total ${m.name} by ${c.name}`, spec: { ...base(), rows: [{ name: c.name }], values: [sum(m)], order: 'value-desc' }, graph: c.distinct > 12 ? 'bar' : 'column' });
  if (m && dt) { const g = grainFor(dt); add({ id: 'trend', title: `${m.name} by ${GRAINS.find((x) => x[0] === g)![1].toLowerCase()}`, spec: { ...base(), rows: [{ name: dt.name, grain: g }], values: [sum(m)] }, graph: 'line' }); }
  if (m && c && dt) { const g = grainFor(dt); add({ id: 'cat-time', title: `${c.name} × ${GRAINS.find((x) => x[0] === g)![1].toLowerCase()}`, spec: { ...base(), rows: [{ name: dt.name, grain: g }], cols: { name: c.name }, values: [sum(m)] }, graph: 'column-stacked' }); }
  if (m && c) add({ id: 'share', title: `Share of ${m.name} by ${c.name}`, spec: { ...base(), rows: [{ name: c.name }], values: [{ field: m.name, agg: 'sum', show: 'pct_total' }], order: 'value-desc', totals: true }, graph: 'donut' });
  const many = cats.find((x) => x.distinct > 10) ?? c2 ?? c;
  if (m && many) add({ id: 'top10', title: `Top 10 ${many.name} by ${m.name}`, spec: { ...base(), rows: [{ name: many.name }], values: [sum(m)], order: 'value-desc', top: 10 }, graph: 'bar' });
  if (c) add({ id: 'count', title: `Number of rows by ${c.name}`, spec: { ...base(), rows: [{ name: c.name }], values: [{ field: ROWS, agg: 'sum', show: 'value' }], order: 'value-desc' }, graph: 'column' });
  if (m && c) add({ id: 'avg', title: `Average ${m.name} by ${c.name}`, spec: { ...base(), rows: [{ name: c.name }], values: [{ field: m.name, agg: 'avg', show: 'value' }], order: 'value-desc' }, graph: 'bar' });
  if (m && c && c2) add({ id: 'two-level', title: `${m.name}: ${c.name} → ${c2.name}`, spec: { ...base(), rows: [{ name: c.name }, { name: c2.name }], values: [sum(m)], order: 'value-desc' }, graph: 'treemap' });
  if (m && dt) {
    const ts = dt.values.filter((v): v is number => typeof v === 'number');
    const years = new Set(ts.map((t) => new Date(t).getUTCFullYear()));
    if (years.size >= 2) add({ id: 'yoy', title: `${m.name}, year against year`, spec: { ...base(), rows: [{ name: dt.name, grain: 'month_of_year' }], cols: { name: dt.name, grain: 'year' }, values: [sum(m)], subtotals: false }, graph: 'line' });
  }
  if (m) add({ id: 'histogram', title: `How ${m.name} is spread`, spec: { ...base(), values: [sum(m)] }, graph: 'histogram', x: m.name });
  if (nums[1]) add({ id: 'scatter', title: `${nums[1].name} against ${m.name}`, spec: { ...base(), values: [sum(m), sum(nums[1])] }, graph: 'scatter', x: m.name, y: nums[1].name });
  if (m && c) add({ id: 'pareto', title: `Pareto of ${m.name} by ${c.name}`, spec: { ...base(), rows: [{ name: c.name }], values: [sum(m)], order: 'value-desc' }, graph: 'pareto' });
  if (m && c && d.rows >= 8) add({ id: 'box', title: `${m.name} by ${c.name}: the spread`, spec: { ...base(), rows: [{ name: c.name }], values: [sum(m)] }, graph: 'box', x: m.name });
  if (!m && c) add({ id: 'count-only', title: `Number of rows by ${c.name}`, spec: { ...base(), rows: [{ name: c.name }], values: [{ field: ROWS, agg: 'sum', show: 'value' }], order: 'value-desc' }, graph: 'column' });
  return out;
}

// ------------------------------------------------------------------ graphs
/** a nice step for an axis or a histogram's bins: 1, 2, 2.5 or 5 × a power of ten, about (max − min) / n */
export function niceStep(span: number, n = 20): number {
  if (!(span > 0)) return 1;
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
/** a category axis's labels and the series of a pivot: the groups of the first level (or the leaves, their labels joined, for a deeper
 *  pivot without a split), a series a split (or the second level's groups), or a value */
export function seriesOf(p: Pivot): { cats: string[]; series: Array<{ name: string; data: Array<number | null>; value: number }> } {
  const leaves = p.rows.filter((r) => r.kind !== 'total' && r.depth === p.spec.rows.length);
  const tops = p.rows.filter((r) => r.kind !== 'total' && r.depth === 1);
  if (p.spec.cols || p.spec.rows.length <= 1) {
    const rows = p.spec.rows.length <= 1 ? leaves : tops.length ? tops : leaves;
    const cats = rows.map((r) => r.labels.join(' · ') || 'Total');
    const series = p.cols.map((c, ci) => ({ name: p.spec.cols ? (p.values.length > 1 ? `${c.splitLabel} — ${valueLabel(p.values[c.value])}` : c.splitLabel) : valueLabel(p.values[c.value]), data: rows.map((r) => r.cells[ci]), value: c.value }));
    if (!p.spec.rows.length) return { cats: ['Total'], series: p.cols.map((c, ci) => ({ name: valueLabel(p.values[c.value]), data: [p.rows.find((r) => r.kind === 'total')?.cells[ci] ?? null], value: c.value })) };
    return { cats, series };
  }
  // two levels without a split: the first level along the axis, a series a group of the second
  const cats = [...new Set(leaves.map((r) => r.labels[0]))];
  const seconds = [...new Set(leaves.map((r) => r.labels[1]))];
  const series = seconds.map((s) => ({ name: s, data: cats.map((cat) => leaves.find((r) => r.labels[0] === cat && r.labels[1] === s)?.cells[0] ?? null), value: 0 }));
  return { cats, series };
}

export interface ChartExtra {
  /** histogram: the bins' lower edges, the step and the counts */ bins?: { from: number[]; step: number; counts: number[]; field: string; fmt: Fmt };
  /** box plot: per group min, q1, median, q3, max */ boxes?: { cats: string[]; stats: Array<[number, number, number, number, number]>; field: string; fmt: Fmt };
  /** scatter: the points */ points?: { x: number[]; y: number[]; xName: string; yName: string; xFmt: Fmt; yFmt: Fmt; group?: string[] };
}
const PALETTE = ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#ca8a04', '#db2777', '#4b5563', '#65a30d', '#7c3aed', '#0d9488'];
/**
 * The ECharts option of a graph. `dark` colours the text for a dark page (the picture saved is drawn for its background). Every graph has
 * its title, a legend where there is more than one series, a tooltip, values in the pivot's own format, and ECharts' aria description
 * (a screen reader hears the series and their values).
 */
export function chartOption(kind: GraphKind, p: Pivot | null, o: { title: string; dark: boolean; extra?: ChartExtra; animation?: boolean; bare?: boolean }): Record<string, unknown> {
  const opt = optionOf(kind, p, o);
  return o.bare ? withoutTitle(opt) : opt;
}
/** a graph's option without its title (on the screen the card's heading names it; a picture saved keeps it), everything moved up */
export function withoutTitle(o: Record<string, any>): Record<string, any> {
  const up = (x: unknown) => (typeof x === 'number' ? Math.max(10, x - 32) : x);
  const out: Record<string, any> = { ...o, title: { ...(o.title ?? {}), show: false } };
  if (out.grid) out.grid = { ...out.grid, top: up(out.grid.top) };
  if (out.legend && typeof out.legend.top === 'number') out.legend = { ...out.legend, top: Math.max(4, out.legend.top - 26) };
  if (Array.isArray(out.series)) out.series = out.series.map((x: Record<string, any>) => ({ ...x, ...(typeof x.top === 'number' ? { top: up(x.top) } : {}), ...(Array.isArray(x.center) ? { center: [x.center[0], '50%'] } : {}) }));
  return out;
}
function optionOf(kind: GraphKind, p: Pivot | null, o: { title: string; dark: boolean; extra?: ChartExtra; animation?: boolean }): Record<string, unknown> {
  const fg = o.dark ? '#e5e7eb' : '#1f2937', sub = o.dark ? '#9ca3af' : '#6b7280', grid = o.dark ? '#374151' : '#e5e7eb';
  const common = {
    color: PALETTE, animation: o.animation ?? true, aria: { enabled: true, decal: { show: false } },
    title: { text: o.title, left: 'center', top: 6, textStyle: { color: fg, fontSize: 15, fontWeight: 600 } },
    tooltip: { trigger: 'item' },
    textStyle: { color: fg, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif' },
  };
  const fmt0 = p?.fmts[0] ?? { currency: '', percent: false, decimals: 0, indian: false };
  const valFmt = (f: Fmt) => (v: number) => fmtNumber(v, f);
  const axisVal = (f: Fmt) => ({ type: 'value', axisLabel: { color: sub, formatter: (v: number) => fmtNumber(v, { ...f, decimals: Math.abs(v) < 10 && !Number.isInteger(v) ? Math.max(1, f.decimals) : 0 }) }, splitLine: { lineStyle: { color: grid } } });
  // every label while they are few; past 12 ECharts leaves out those that would overlap
  const axisCat = (cats: string[], rotate = cats.length > 8) => ({ type: 'category', data: cats, axisLabel: { color: sub, interval: cats.length > 12 ? 'auto' : 0, hideOverlap: cats.length > 12, rotate: rotate ? 35 : 0, width: rotate ? 140 : 110, overflow: 'truncate' }, axisLine: { lineStyle: { color: grid } } });
  const legend = (n: number) => (n > 1 ? { legend: { top: 30, type: 'scroll', textStyle: { color: fg } } } : {});
  const top = (n: number) => (n > 1 ? 66 : 44);
  if (kind === 'histogram') {
    const b = o.extra?.bins;
    if (!b) return { ...common };
    const cats = b.from.map((x) => `${fmtNumber(x, b.fmt)} – ${fmtNumber(x + b.step, b.fmt)}`);
    const ax = axisCat(cats, cats.length > 8);
    // the axis names each bin by where it starts; the tooltip gives the range
    const xAxis = { ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: string) => v.split(' – ')[0] }, name: b.field, nameLocation: 'middle', nameGap: cats.length > 8 ? 56 : 32, nameTextStyle: { color: sub } };
    return { ...common, tooltip: { trigger: 'axis' }, grid: { left: 64, right: 24, top: 44, bottom: 72, containLabel: true }, xAxis, yAxis: { ...axisVal({ currency: '', percent: false, decimals: 0, indian: false }), name: 'Rows', nameTextStyle: { color: sub } }, series: [{ type: 'bar', name: 'Rows', data: b.counts, barCategoryGap: '2%' }] };
  }
  if (kind === 'box') {
    const bx = o.extra?.boxes;
    if (!bx) return { ...common };
    return { ...common, tooltip: { trigger: 'item' }, grid: { left: 64, right: 24, top: 44, bottom: 70, containLabel: true }, xAxis: axisCat(bx.cats), yAxis: { ...axisVal(bx.fmt), name: bx.field, nameTextStyle: { color: sub } }, series: [{ type: 'boxplot', name: bx.field, data: bx.stats }] };
  }
  if (kind === 'scatter') {
    const pt = o.extra?.points;
    if (!pt) return { ...common };
    return { ...common, grid: { left: 64, right: 32, top: 44, bottom: 56, containLabel: true }, xAxis: { ...axisVal(pt.xFmt), name: pt.xName, nameLocation: 'middle', nameGap: 32, nameTextStyle: { color: sub }, scale: true }, yAxis: { ...axisVal(pt.yFmt), name: pt.yName, nameTextStyle: { color: sub }, scale: true }, series: [{ type: 'scatter', name: `${pt.yName} against ${pt.xName}`, symbolSize: pt.x.length > 2000 ? 4 : 8, data: pt.x.map((x, i) => [x, pt.y[i]]) }] };
  }
  if (!p) return { ...common };
  const { cats, series } = seriesOf(p);
  const fmtOf = (vi: number) => p.fmts[vi] ?? fmt0;
  if (kind === 'pie' || kind === 'donut' || kind === 'funnel') {
    const s = series[0];
    const data = cats.map((c, i) => ({ name: c, value: s?.data[i] ?? 0 })).filter((x) => x.value !== null && (x.value as number) > 0);
    if (kind === 'funnel') data.sort((a, b) => (b.value as number) - (a.value as number));
    return {
      ...common, legend: { type: 'scroll', bottom: 4, textStyle: { color: fg } },
      tooltip: { trigger: 'item', valueFormatter: valFmt(fmtOf(s?.value ?? 0)) },
      series: [kind === 'funnel'
        ? { type: 'funnel', name: s?.name, left: '12%', right: '12%', top: 50, bottom: 40, sort: 'descending', label: { color: fg, formatter: (x: { name: string; value: number }) => `${x.name}: ${fmtNumber(x.value, fmtOf(s?.value ?? 0))}` }, data }
        : { type: 'pie', name: s?.name, radius: kind === 'donut' ? ['42%', '70%'] : '68%', center: ['50%', '54%'], avoidLabelOverlap: true, label: { color: fg, formatter: (x: { name: string; percent: number }) => `${x.name}\n${x.percent.toFixed(1)} %` }, data }],
    };
  }
  if (kind === 'treemap' || kind === 'sunburst') {
    // the levels of the rows as a tree, the first value's size
    type T = { name: string; value: number; children?: T[] };
    const rootKids: T[] = [];
    const leaves = p.rows.filter((r) => r.kind === 'leaf');
    for (const r of leaves) {
      let level = rootKids;
      r.labels.forEach((l, k) => {
        let t = level.find((x) => x.name === l);
        if (!t) { t = { name: l, value: 0 }; level.push(t); }
        if (k === r.labels.length - 1) t.value = Math.max(0, r.cells[0] ?? 0); else { t.children ||= []; level = t.children; }
      });
    }
    const sumUp = (t: T): number => (t.children ? (t.value = t.children.reduce((a, c) => a + sumUp(c), 0)) : t.value);
    rootKids.forEach(sumUp);
    return kind === 'treemap'
      ? { ...common, tooltip: { valueFormatter: valFmt(fmtOf(0)) }, series: [{ type: 'treemap', name: series[0]?.name ?? '', top: 44, bottom: 8, left: 8, right: 8, roam: false, nodeClick: false, breadcrumb: { show: false }, label: { show: true, formatter: '{b}' }, upperLabel: { show: p.spec.rows.length > 1, height: 22, color: fg }, levels: [{ itemStyle: { borderColor: o.dark ? '#111827' : '#fff', borderWidth: 2, gapWidth: 2 } }, { itemStyle: { borderColor: o.dark ? '#1f2937' : '#f3f4f6', borderWidth: 1, gapWidth: 1 }, colorSaturation: [0.35, 0.6] }], data: rootKids }] }
      : { ...common, tooltip: { valueFormatter: valFmt(fmtOf(0)) }, series: [{ type: 'sunburst', name: series[0]?.name ?? '', center: ['50%', '55%'], radius: [0, '78%'], label: { rotate: 'radial', color: fg, minAngle: 8 }, itemStyle: { borderColor: o.dark ? '#111827' : '#fff', borderWidth: 1 }, data: rootKids }] };
  }
  if (kind === 'heatmap') {
    const rows = p.rows.filter((r) => r.kind !== 'total' && r.depth === Math.max(1, p.spec.rows.length));
    const xs = p.spec.cols ? p.cols.filter((c) => c.value === 0).map((c) => c.splitLabel) : [valueLabel(p.values[0])];
    const ys = rows.map((r) => r.labels.join(' · '));
    const data: Array<[number, number, number | null]> = [];
    let lo = Infinity, hi = -Infinity;
    const cis = p.cols.map((c, i) => (c.value === 0 ? i : -1)).filter((i) => i >= 0);
    rows.forEach((r, yi) => xs.forEach((_, xi) => { const v = r.cells[cis[xi]] ?? null; if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } data.push([xi, yi, v]); }));
    return { ...common, tooltip: { trigger: 'item', formatter: (x: { value: [number, number, number | null] }) => `${ys[x.value[1]]} · ${xs[x.value[0]]}: ${fmtNumber(x.value[2], fmtOf(0))}` }, grid: { left: 24, right: 24, top: 44, bottom: 86, containLabel: true }, xAxis: { ...axisCat(xs), splitArea: { show: true } }, yAxis: { type: 'category', data: ys, axisLabel: { color: sub, width: 150, overflow: 'truncate' }, splitArea: { show: true } }, visualMap: { min: Number.isFinite(lo) ? lo : 0, max: Number.isFinite(hi) ? hi : 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 4, textStyle: { color: fg }, inRange: { color: o.dark ? ['#1e3a8a', '#60a5fa', '#fde68a'] : ['#eff6ff', '#60a5fa', '#1e3a8a'] }, formatter: (v: number) => fmtNumber(v, fmtOf(0)) }, series: [{ type: 'heatmap', name: valueLabel(p.values[0]), data, label: { show: xs.length * ys.length <= 120, color: fg, formatter: (x: { value: [number, number, number | null] }) => fmtNumber(x.value[2], fmtOf(0)) } }] };
  }
  if (kind === 'waterfall') {
    const s = series[0], vals = s?.data.map((v) => v ?? 0) ?? [];
    const baseS: number[] = [], up: Array<number | string> = [], down: Array<number | string> = [];
    let acc = 0;
    for (const v of vals) { const next = acc + v; baseS.push(Math.min(acc, next)); up.push(v >= 0 ? v : '-'); down.push(v < 0 ? -v : '-'); acc = next; }
    return { ...common, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: valFmt(fmtOf(0)) }, legend: { top: 30, data: ['Up', 'Down'], textStyle: { color: fg } }, grid: { left: 64, right: 24, top: 66, bottom: 64, containLabel: true }, xAxis: axisCat([...cats, 'Total']), yAxis: axisVal(fmtOf(0)), series: [
      { type: 'bar', stack: 'w', name: 'base', itemStyle: { borderColor: 'transparent', color: 'transparent' }, emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } }, tooltip: { show: false }, data: [...baseS, 0] },
      { type: 'bar', stack: 'w', name: 'Up', itemStyle: { color: '#16a34a' }, data: [...up, '-'] },
      { type: 'bar', stack: 'w', name: 'Down', itemStyle: { color: '#dc2626' }, data: [...down, '-'] },
      { type: 'bar', stack: 'w', name: 'Total', itemStyle: { color: '#2563eb' }, data: [...vals.map(() => '-'), acc] },
    ] };
  }
  if (kind === 'pareto') {
    const s = series[0];
    const pairs = cats.map((c, i) => ({ c, v: s?.data[i] ?? 0 })).filter((x) => (x.v ?? 0) > 0).sort((a, b) => (b.v as number) - (a.v as number));
    const total = pairs.reduce((a, x) => a + (x.v as number), 0) || 1;
    let acc = 0;
    const cum = pairs.map((x) => { acc += x.v as number; return +(acc / total * 100).toFixed(2); });
    return { ...common, tooltip: { trigger: 'axis' }, legend: { top: 30, textStyle: { color: fg } }, grid: { left: 64, right: 64, top: 66, bottom: 64, containLabel: true }, xAxis: axisCat(pairs.map((x) => x.c)), yAxis: [axisVal(fmtOf(0)), { type: 'value', min: 0, max: 100, axisLabel: { color: sub, formatter: '{value} %' }, splitLine: { show: false } }], series: [
      { type: 'bar', name: s?.name ?? '', data: pairs.map((x) => x.v), tooltip: { valueFormatter: valFmt(fmtOf(0)) } },
      { type: 'line', name: 'Cumulative %', yAxisIndex: 1, data: cum, symbolSize: 6, tooltip: { valueFormatter: (v: number) => `${v.toFixed(1)} %` }, markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: sub }, data: [{ yAxis: 80 }], label: { formatter: '80 %', color: sub, position: 'insideStartTop' } } },
    ] };
  }
  const horizontal = kind === 'bar' || kind === 'bar-stacked';
  const stacked = kind === 'column-stacked' || kind === 'bar-stacked' || kind === 'area-stacked' || kind === 'column-100';
  let data = series;
  if (kind === 'column-100') {
    const totals = cats.map((_, i) => series.reduce((a, s) => a + Math.abs(s.data[i] ?? 0), 0));
    data = series.map((s) => ({ ...s, data: s.data.map((v, i) => (v === null || !totals[i] ? null : (Math.abs(v) / totals[i]) * 100)) }));
  }
  const valueAxis = kind === 'column-100' ? { type: 'value', max: 100, axisLabel: { color: sub, formatter: '{value} %' }, splitLine: { lineStyle: { color: grid } } } : axisVal(fmtOf(series[0]?.value ?? 0));
  const isLine = kind === 'line' || kind === 'area' || kind === 'area-stacked';
  const comboSecond = kind === 'combo' && data.length > 1;
  const out: Record<string, unknown> = {
    ...common, ...legend(data.length),
    tooltip: { trigger: 'axis', axisPointer: { type: isLine ? 'line' : 'shadow' }, valueFormatter: kind === 'column-100' ? (v: number) => `${(+v).toFixed(1)} %` : valFmt(fmtOf(series[0]?.value ?? 0)) },
    grid: { left: 64, right: comboSecond ? 64 : 24, top: top(data.length), bottom: horizontal ? 32 : 64, containLabel: true },
    xAxis: horizontal ? valueAxis : axisCat(cats),
    yAxis: horizontal ? { ...axisCat([...cats].reverse(), false), axisLabel: { color: sub, width: 160, overflow: 'truncate' } } : comboSecond ? [valueAxis, axisVal(fmtOf(series[1].value))] : valueAxis,
    series: data.map((s, i) => {
      const d2 = horizontal ? [...s.data].reverse() : s.data;
      const type = isLine || (kind === 'combo' && i > 0) ? 'line' : 'bar';
      return { type, name: s.name, data: d2, ...(stacked ? { stack: 'all' } : {}), ...(kind === 'area' || kind === 'area-stacked' ? { areaStyle: { opacity: 0.25 } } : {}), ...(comboSecond && i > 0 ? { yAxisIndex: 1 } : {}), ...(type === 'line' ? { symbolSize: 6, smooth: false, connectNulls: true } : { barMaxWidth: 56 }), emphasis: { focus: 'series' } };
    }),
  };
  return out;
}

// ------------------------------------------------------------------ running it on the engine
/** what the tab and the tests give: a Perspective table (the browser's worker, or Node's engine) */
export interface EngineView { to_columns(o?: { start_row?: number; end_row?: number }): Promise<Record<string, unknown[]>>; delete(): Promise<void> }
export interface EngineTable { view(config: Record<string, unknown>): Promise<EngineView> }
async function once(t: EngineTable, config: Record<string, unknown>, o?: { end_row?: number }) {
  const v = await t.view(config);
  try { return await v.to_columns(o); } finally { await v.delete(); }
}
/** the pivot of a spec, by the engine */
export async function runPivot(t: EngineTable, spec: PivotSpec, d: Data): Promise<Pivot> {
  const plan = viewPlan(spec, d);
  const main = await once(t, plan.config);
  const totals = plan.totals ? await once(t, plan.totals) : null;
  return pivotOf(spec, d, plan, main, totals);
}
const filterOf = (spec: PivotSpec, d: Data) => viewPlan({ ...spec, rows: [], cols: null, values: [] }, d).config.filter;
/** a histogram of a number field (with the pivot's filters): its smallest and largest value, a nice step for about 20 bins, the rows in each
 *  — counted by the engine */
export async function histogramOf(t: EngineTable, field: string, spec: PivotSpec, d: Data): Promise<NonNullable<ChartExtra['bins']>> {
  const c = d.cols.find((x) => x.name === field)!;
  const F = q(field), filter = filterOf(spec, d);
  // a view without group_by gives the rows themselves: a group of everything (a constant) gives the aggregate in its total row
  const mm = await once(t, { group_by: ['·all'], columns: ['·lo', '·hi'], expressions: { '·all': '1', '·lo': F, '·hi': F }, aggregates: { '·lo': 'min', '·hi': 'max' }, filter });
  const lo = Number(mm['·lo']?.[0]), hi = Number(mm['·hi']?.[0]);
  const fmt = { ...c.fmt, decimals: 0 };
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { from: [], step: 1, counts: [], field, fmt };
  const step = hi > lo ? niceStep(hi - lo, 20) : 1, start = Math.floor(lo / step) * step;
  const r = await once(t, { group_by: ['·bin'], columns: [ROWS], expressions: { '·bin': `floor((${F} - ${start}) / ${step})`, [ROWS]: '1' }, aggregates: { [ROWS]: 'sum' }, filter: [...filter, [field, 'is not null', null]] });
  const paths = (r.__ROW_PATH__ as unknown[][]).slice(1), counts = (r[ROWS] as number[]).slice(1);
  const n = Math.floor((hi - start) / step + 1e-9) + 1;   // the bins from the one holding the smallest to the one holding the largest
  const out = Array(n).fill(0);
  paths.forEach((p, i) => { const k = Math.min(n - 1, Math.max(0, Number(p[0]))); out[k] += counts[i]; });
  const dec = step < 1 ? Math.min(6, Math.ceil(-Math.log10(step))) : 0;
  return { from: out.map((_, k) => +(start + k * step).toFixed(dec + 2)), step, counts: out, field, fmt: { ...c.fmt, decimals: dec } };
}
/** a box plot's five numbers by group (the pivot's first row field): each group's values from the engine, their smallest, first quartile,
 *  median, third quartile and largest from `stats` (mathcore's: exact, NumPy's default method — the engine's own median and quartiles are
 *  not exact on larger groups) */
export async function boxesOf(t: EngineTable, field: string, spec: PivotSpec, d: Data, stats: (xs: number[]) => { min: number; q1: number; median: number; q3: number; max: number }): Promise<NonNullable<ChartExtra['boxes']>> {
  const c = d.cols.find((x) => x.name === field)!;
  const plan = viewPlan({ ...spec, cols: null, values: [] }, d);
  const key = plan.config.group_by[0];
  const V = '·v';
  const r = await once(t, { columns: key ? [key, V] : [V], expressions: { ...plan.config.expressions, [V]: q(field) }, filter: [...plan.config.filter, [field, 'is not null', null]] });
  const groups = new Map<string | number | null, number[]>();
  const ks = key ? (r[key] as Array<string | number | null>) : null, vs = r[V] as number[];
  vs.forEach((v, i) => { const k = ks ? ks[i] ?? null : null; let a = groups.get(k); if (!a) groups.set(k, (a = [])); a.push(v); });
  const keys = [...groups.keys()].sort((a, b) => { const x = sortKey(a), y = sortKey(b); return x < y ? -1 : x > y ? 1 : 0; });
  const cats: string[] = [], out: Array<[number, number, number, number, number]> = [];
  for (const k of keys) { const s = stats(groups.get(k)!); cats.push(key ? labelOf(k, spec.rows[0] ?? null, d) : field); out.push([s.min, s.q1, s.median, s.q3, s.max]); }
  return { cats, stats: out, field, fmt: c.fmt };
}
/** a scatter's points: two number fields of the rows (with the pivot's filters), at most `limit` of them */
export async function pointsOf(t: EngineTable, x: string, y: string, spec: PivotSpec, d: Data, limit = 5000): Promise<NonNullable<ChartExtra['points']>> {
  const cx = d.cols.find((c) => c.name === x)!, cy = d.cols.find((c) => c.name === y)!;
  const filter = [...filterOf(spec, d), [x, 'is not null', null], [y, 'is not null', null]];
  const xs = 'x·', ys = 'y·';
  const r = await once(t, { columns: [xs, ys], expressions: { [xs]: q(x), [ys]: q(y) }, filter }, { end_row: limit });
  return { x: (r[xs] as number[]) ?? [], y: (r[ys] as number[]) ?? [], xName: x, yName: y, xFmt: cx.fmt, yFmt: cy.fmt };
}
