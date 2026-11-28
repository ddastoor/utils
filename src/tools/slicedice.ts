// SliceDiceGrapher (potentials #75 — owner, 21 Nov 2026: "copy a set of rows and columns, basically a sheet from Excel or LibreOffice or any
// such open source spreadsheet software out there, both on Linux and Windows, and paste it in the app, or upload an Excel file itself with
// data. Then the app should be able to create different pivots and create different graphs based on standard presets … Once you create all
// the graphs and pivots, images and diagrams, have a download button to be able to save it as an image"). Chart Maker (potentials #25) is
// part of it.
// The data: a range pasted (the clipboard's HTML from Excel, LibreOffice Calc or Google Sheets, with the values behind the text; or its plain
// text), a spreadsheet file, or the sample → typed columns (src/lib/slicedice.ts). The pivots: Perspective (src/lib/pivotengine.ts, its
// engine in a worker); the box plot's quartiles: mathcore; the graphs: ECharts (src/lib/charts.ts); files in and CSV / Excel out: sheet.wasm.
// Nothing is fetched before the first data, nothing leaves the device; the data and the board last while the page is open.
import './slicedice.css';
import { h, card, stack, button, select, field, toggle, segmented, input, note, actions, filePicker, toast, downloadBlob, shareOrDownload, clear, errMsg, baseName, reveal, copy, type Mount } from '../ui';
import * as L from '../lib/slicedice';
import { pivotEngine, type PivotClient } from '../lib/pivotengine';
import { sheetEngine, type Sheet } from '../wasm/sheet';
import { mathcore } from '../wasm/mathcore';
import { readSpreadsheet } from '../lib/sheetdata';
import type * as Charts from '../lib/charts';

const MAX_SHOWN = 500;                   // rows of a table drawn on the screen (the files have them all)
const DELIMS: Record<string, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };
type Table = L.EngineTable & { update(data: unknown): Promise<void>; delete(): Promise<void> };
interface Source { grid: L.Raw[][]; exact: Array<Array<number | null>> | null; base: string; how: string; sheets?: Sheet[]; sheet?: number }
interface Card {
  id: number; title: string; titleSet: boolean; spec: L.PivotSpec; graph: L.GraphKind; preset?: string; x?: string; y?: string;
  // worked out
  v: number; out?: L.TOut; pivot?: L.Pivot | null; extra?: L.ChartExtra; err?: string;
  // drawn
  el?: HTMLElement; box?: HTMLElement; msg?: HTMLElement; tbl?: HTMLElement; pv?: HTMLDetailsElement; drawn?: Charts.Drawn | null; seen?: boolean;
}

// kept while the page is open (nothing is stored): the data, the board, the pictures' size and background
let src: Source | null = null, header: boolean | null = null, keepTotal = false;
const kindOver = new Map<string, L.Kind>();
type Snap = Pick<Card, 'title' | 'titleSet' | 'spec' | 'graph' | 'preset' | 'x' | 'y'>;
let board: Snap[] | null = null, removedPresets = new Set<string>();   // the board as it was when the tab was left
const pic = { scale: 2, bg: 'white' as 'white' | 'transparent' };

const isDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'graph';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const where = () => (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : /Mac/.test(navigator.platform) ? 'mac' : 'pc');
const pasteKey = () => (where() === 'mac' ? '⌘V' : 'Ctrl+V');
/** the browser's DOM as the plain tree src/lib/slicedice.ts reads */
const treeOf = (el: Element): L.HNode => ({
  tag: el.tagName.toLowerCase(),
  attrs: Object.fromEntries(el.getAttributeNames().map((n) => [n.toLowerCase(), el.getAttribute(n) ?? ''])),
  kids: [...el.childNodes].flatMap((k): Array<L.HNode | string> => (k.nodeType === 3 ? [k.nodeValue ?? ''] : k.nodeType === 1 ? [treeOf(k as Element)] : [])),
});
/** a filter the engine can use: a list with a value in it, a word, a number */
const complete = (f: L.Filter) => (f.op === 'in' || f.op === 'not in' ? Array.isArray(f.value) && f.value.length > 0 : f.op === 'contains' ? typeof f.value === 'string' && f.value.trim() !== '' : typeof f.value === 'number' && Number.isFinite(f.value));

export const mount: Mount = (root, ctx) => {
  const phone = ctx.isMobile;
  let live = true, seq = 0, nextId = 1, boardReady = false;
  let d: L.Data | null = null, table: Table | null = null, charts: typeof Charts | null = null;
  let cards: Card[] = [];
  const kindOf = (name: string) => d?.cols.find((c) => c.name === name)?.kind;

  // ---------------------------------------------------------------- engines (with the first data)
  const engines = async (): Promise<PivotClient> => {
    const [client, ch] = await Promise.all([pivotEngine(), charts ?? import('../lib/charts')]);
    charts = ch;
    return client;
  };

  // ---------------------------------------------------------------- the data card
  const status = h('div', { class: 'sd-status muted small', role: 'status', 'aria-live': 'polite' });
  const setStatus = (text: string, retry = false) => {
    status.replaceChildren(text, retry ? button('Try again', () => build(), { small: true, icon: 'RotateCcw' }) : '');
    status.hidden = !text;
  };
  const pasteArea = h('textarea', { class: 'input textarea sd-paste', rows: 3, spellcheck: 'false', 'aria-label': 'Paste a range here', placeholder: `Paste here (${pasteKey()}) — a range copied in Excel, LibreOffice Calc or Google Sheets, with its row of column names. Or type CSV and press “Read this text”.` });
  const readTyped = button('Read this text', () => fromClipboard(null, pasteArea.value, 'typed').catch((e) => { toast(errMsg(e), 'err'); setStatus(errMsg(e)); }), { small: true, icon: 'FileText' });
  readTyped.hidden = true;
  pasteArea.addEventListener('input', () => { readTyped.hidden = !/\n/.test(pasteArea.value.trim()); });
  pasteArea.addEventListener('paste', (e) => { e.preventDefault(); e.stopPropagation(); void onPasteEvent(e); });
  const picker = filePicker({ accept: '.xlsx,.xlsm,.xlsb,.xls,.ods,.csv,.tsv,.tab,.txt,.json,.htm,.html,.xml,text/csv', label: 'Open a spreadsheet', hint: 'Excel (.xlsx .xlsm .xlsb .xls), LibreOffice (.ods), CSV or TSV — or drop it here', compact: true, onFiles: ([f]) => openFile(f) });
  // what the clipboard holds that is no range, and what the browser refuses, is said (a toast and the line under the cards) — no error thrown
  const said = (e: unknown) => { if (!live) return; toast(errMsg(e), 'err'); setStatus(errMsg(e)); };
  const pasteBtn = button('Paste', () => pasteButton().catch(said), { variant: 'primary', icon: 'ClipboardPaste', title: 'Read the range on the clipboard' });
  const sampleBtn = button('Try the sample', () => { setSource({ grid: L.sampleGrid(), exact: null, base: 'sample', how: 'The sample (sales of a tea and spice trader)' }); }, { icon: 'Sparkles' });
  const dataBox = h('div', { class: 'stack sd-data', hidden: true });
  const inCard = card('Your data',
    h('p', { class: 'muted' }, 'Copy a range in Excel, LibreOffice Calc or Google Sheets — with its row of column names — and paste it here, or open a spreadsheet. The data stays on this device.'),
    h('div', { class: 'row sd-in' }, pasteBtn, sampleBtn),
    pasteArea, readTyped, picker, dataBox);

  const onPasteEvent = async (e: ClipboardEvent) => {
    const html = e.clipboardData?.getData('text/html') || null, text = e.clipboardData?.getData('text/plain') || null;
    try { await fromClipboard(html, text, 'pasted'); } catch (err) { said(err); }
  };
  // Ctrl+V anywhere in the tab but a text box
  const onDocPaste = (e: ClipboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (!root.isConnected || (t && (t.closest('input, textarea, select, [contenteditable]') || !root.contains(t) && t !== document.body))) return;
    e.preventDefault(); void onPasteEvent(e);
  };
  document.addEventListener('paste', onDocPaste);

  async function pasteButton() {
    const clip = navigator.clipboard as (Clipboard & { read?: (o?: unknown) => Promise<ClipboardItems> }) | undefined;
    if (!clip || (!clip.read && !clip.readText)) throw new Error(`This browser does not let a page read the clipboard from a button: press ${pasteKey()} here instead.`);
    let html: string | null = null, text: string | null = null;
    try {
      if (clip.read) {
        const items = await clip.read({ unsanitized: ['text/html'] });   // the spreadsheet's own HTML (its values behind the text), where the browser allows it
        for (const it of items) {
          if (!html && it.types.includes('text/html')) html = await (await it.getType('text/html')).text();
          if (!text && it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
        }
      } else text = await clip.readText();
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new Error(where() === 'ios' ? 'Safari did not paste: tap “Paste” when Safari offers it beside the button (it asks each time).'
          : `The browser did not let the page read the clipboard. To allow it: the icon at the left of the address bar → Site settings → Clipboard → Allow; or press ${pasteKey()} here, which needs no leave.`);
      }
      if (name === 'NotFoundError' || name === 'DataError') throw new Error('The clipboard is empty. Copy a range of cells first (with its row of column names).');
      throw e;
    }
    await fromClipboard(html, text, 'pasted');
  }

  async function fromClipboard(html: string | null, text: string | null, how: 'pasted' | 'typed') {
    setStatus('Reading the range…');
    if (html && /<table[\s>]/i.test(html)) {
      const p = L.pasteTables(treeOf(new DOMParser().parseFromString(html, 'text/html').documentElement));
      if (p && p.grid.length >= 2) { pasteArea.value = ''; readTyped.hidden = true; return setSource({ grid: p.grid, exact: p.exact, base: 'pasted', how: `Pasted from ${p.from}` }); }
    }
    if (text && text.trim()) {
      const sh = await sheetEngine();
      if (!live) return;
      const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0];
      const book = sh.csv(new TextEncoder().encode(text.replace(/^﻿/, '')), first.includes('\t') ? '\t' : '');
      const rows = book.sheets[0]?.rows ?? [];
      if (rows.filter((r) => r.some((c) => c !== null && c !== '')).length < 2) { setStatus(''); throw new Error('That is a single row or cell. Copy the whole range — its row of column names and the rows under it.'); }
      pasteArea.value = ''; readTyped.hidden = true;
      return setSource({ grid: rows, exact: null, base: how === 'typed' ? 'typed' : 'pasted', how: `${how === 'typed' ? 'Typed text' : 'Pasted text'} (${DELIMS[first.includes('\t') ? '\t' : book.delimiter ?? ','] ?? 'comma'}-separated)` });
    }
    setStatus('');
    throw new Error('The clipboard holds no table. Copy a range of cells in Excel, LibreOffice Calc or Google Sheets (with its row of column names), then paste.');
  }

  async function openFile(f: File) {
    const my = ++seq;
    setStatus(`Reading ${f.name}…`);
    try {
      const sh = await sheetEngine(), bytes = new Uint8Array(await f.arrayBuffer());
      if (my !== seq || !live) return;
      const r = readSpreadsheet(bytes, f.name, sh);
      const sheets = r.book.sheets.filter((s) => s.rows.some((row) => row.some((c) => c !== null && c !== '')));
      if (!sheets.length) throw new Error(`${f.name} holds no data.`);
      const i = Math.max(0, sheets.findIndex((s) => !s.hidden));
      setSource({ grid: sheets[i].rows, exact: null, base: baseName(f.name), how: sheets.length > 1 ? `${f.name} · sheet “${sheets[i].name}”` : f.name, sheets, sheet: i });
    } catch (e) { if (my === seq && live) { setStatus(errMsg(e)); toast(errMsg(e), 'err'); } }
  }

  let toBoard = false;   // new data from a paste, a file or the sample: the board is brought into view once drawn
  function setSource(s: Source) {
    toBoard = true;
    src = s; header = null; keepTotal = false; kindOver.clear(); board = null; removedPresets = new Set();
    for (const c of cards) disposeCard(c);
    cards = [];
    void build();
  }

  // ---------------------------------------------------------------- reading the columns, the engine's table, the board
  async function build() {
    const my = ++seq;
    if (!src) return;
    const hd = header ?? L.looksLikeHeader(src.grid);
    let dd = L.readGrid(src.grid, hd, keepTotal, src.exact);
    if (kindOver.size) {
      const cells = L.cellsOf(src.grid, dd, src.exact);
      dd = { ...dd, cols: dd.cols.map((c, i) => { const k = kindOver.get(c.name); return k && k !== c.kind ? L.retype(c, cells[i].raw, k, cells[i].exact) : c; }) };
    }
    d = dd;
    drawData();
    if (!dd.rows || !dd.cols.length) { setStatus(dd.rows ? 'No columns.' : 'No rows of data under the row of column names.'); drawBoard(); return; }
    setStatus('Getting the pivot engine and the graphs ready (about 4 MB, once a visit)…');
    let client: PivotClient;
    try { client = await engines(); } catch (e) { if (my === seq && live) setStatus(`${errMsg(e)} — the pivot engine could not be fetched.`, true); return; }
    if (my !== seq || !live) return;
    setStatus(`Reading ${dd.rows.toLocaleString('en-IN')} rows into the pivot engine…`);
    try {
      const old = table; table = null;
      if (old) void old.delete().catch(() => {});
      const { schema, columns } = L.tableOf(dd);
      const t = (await client.table(schema as never)) as unknown as Table;
      await t.update(columns);
      if (my !== seq || !live) { void t.delete().catch(() => {}); return; }
      table = t;
    } catch (e) { if (my === seq && live) setStatus(`The pivot engine could not take the data: ${errMsg(e)}`, true); return; }
    setStatus('');
    // the board: the presets the columns suggest, the graphs of one's own that still fit; or the board as it was (back in the tab)
    const fits = (c: Pick<Card, 'spec' | 'x' | 'y'>) => [...c.spec.rows.map((f) => f.name), ...(c.spec.cols ? [c.spec.cols.name] : []), ...c.spec.values.map((v) => v.field), ...c.spec.filters.map((f) => f.field), c.x, c.y]
      .every((n) => !n || n === L.ROWS || dd.cols.some((x) => x.name === n));
    const own = (board ?? cards.map(snap)).filter((c) => !c.preset && fits(c));
    for (const c of cards) disposeCard(c);
    const presets = L.presetsFor(dd);
    cards = board
      ? board.filter(fits).map((s) => newCard(clone(s)))
      : [...presets.filter((p) => !removedPresets.has(p.id)).map(fromPreset), ...own.map((s) => newCard(clone(s)))];
    board = null; boardReady = true;
    drawBoard();
    resetDraft();
    if (toBoard) { toBoard = false; reveal(boardCard); }
  }
  const snap = (c: Card): Snap => ({ title: c.title, titleSet: c.titleSet, spec: c.spec, graph: c.graph, preset: c.preset, x: c.x, y: c.y });
  const newCard = (s: Snap): Card => ({ id: nextId++, v: 0, ...s });
  const fromPreset = (p: L.Preset): Card => newCard({ title: p.title, titleSet: false, spec: clone(p.spec), graph: p.graph, preset: p.id, x: p.x, y: p.y });

  function drawData() {
    clear(dataBox);
    if (!src || !d) { dataBox.hidden = true; return; }
    dataBox.hidden = false;
    const dd = d, s = src;
    const line = h('p', { class: 'sd-line' }, h('strong', null, s.how), `: ${dd.rows.toLocaleString('en-IN')} rows × ${dd.cols.length} columns`);
    const sheetSel = s.sheets && s.sheets.length > 1
      ? field('Sheet', select(s.sheets.map((x, i) => [String(i), `${x.name}${x.hidden ? ' (hidden)' : ''}`] as [string, string]), String(s.sheet ?? 0), (v) => {
        const i = +v; setSource({ ...s, grid: s.sheets![i].rows, sheet: i, how: `${s.how.split(' · ')[0]} · sheet “${s.sheets![i].name}”` });
      })) : null;
    const opts = h('div', { class: 'row sd-opts' },
      toggle('The first row holds the column names', dd.header, (v) => { header = v; kindOver.clear(); void build(); }),
      toggle('Keep a last row named “Total”', keepTotal, (v) => { keepTotal = v; void build(); }));
    // the columns: what each was read as (a choice), and what is in it
    const about = (c: L.Col) => {
      const odd = c.odd ? ` · ${c.odd.toLocaleString('en-IN')} cell${c.odd > 1 ? 's' : ''} that ${c.odd > 1 ? 'are' : 'is'} not ${c.kind === 'number' ? 'a number' : 'a date'}, left out` : '';
      if (c.kind === 'number') {
        const vs = c.values.filter((v): v is number => typeof v === 'number');
        const lo = vs.length ? Math.min(...vs) : null, hi = vs.length ? Math.max(...vs) : null;
        const how = c.fmt.percent ? 'percentages' : c.fmt.currency ? `amounts in ${c.fmt.currency}` : 'numbers';
        return `${how}${lo !== null ? `, ${L.fmtNumber(lo, c.fmt)} to ${L.fmtNumber(hi, c.fmt)}` : ''}${odd}`;
      }
      if (c.kind === 'date') {
        const ts = c.values.filter((v): v is number => typeof v === 'number');
        return `dates${ts.length ? `, ${L.labelOf(Math.min(...ts), { name: c.name }, dd)} to ${L.labelOf(Math.max(...ts), { name: c.name }, dd)}` : ''}${c.mdy ? ' (read month first)' : ''}${odd}`;
      }
      const vals = [...new Set(c.values.filter((v): v is string => typeof v === 'string'))];
      return `text, ${c.distinct.toLocaleString('en-IN')} different value${c.distinct === 1 ? '' : 's'}${vals.length ? `: ${vals.slice(0, 3).join(', ')}${vals.length > 3 ? ' …' : ''}` : ''}`;
    };
    const colsTable = h('table', { class: 'sd-table sd-cols' },
      h('caption', { class: 'sr-only' }, 'The columns and what each was read as'),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Column'), h('th', { scope: 'col' }, 'Read as'), h('th', { scope: 'col' }, 'In it'))),
      h('tbody', null, dd.cols.map((c) => h('tr', null, h('th', { scope: 'row' }, c.name),
        h('td', null, select([['number', 'Numbers'], ['date', 'Dates'], ['text', 'Text']] as Array<[L.Kind, string]>, c.kind, (k) => { kindOver.set(c.name, k); void build(); }, `Read “${c.name}” as`)),
        h('td', { class: 'sd-about' }, about(c))))));
    // the first rows as read
    const n = Math.min(8, dd.rows);
    const cellText = (c: L.Col, i: number) => { const v = c.values[i]; return v === null ? '' : c.kind === 'number' ? L.fmtNumber(v as number, c.fmt) : c.kind === 'date' ? L.labelOf(v as number, { name: c.name }, dd) : String(v); };
    const preview = h('details', { class: 'sd-preview' }, h('summary', null, `The first ${n} rows as read`),
      h('div', { class: 'sd-tablewrap' }, h('table', { class: 'sd-table' }, h('caption', { class: 'sr-only' }, `The first ${n} rows`),
        h('thead', null, h('tr', null, dd.cols.map((c) => h('th', { scope: 'col', class: c.kind === 'number' ? 'num' : null }, c.name)))),
        h('tbody', null, Array.from({ length: n }, (_, i) => h('tr', null, dd.cols.map((c) => h('td', { class: c.kind === 'number' ? 'num' : null }, cellText(c, i)))))))));
    dataBox.append(line, ...dd.notes.map((t) => note(t, 'info')), sheetSel ?? '', opts,
      h('details', { class: 'sd-colsbox' }, h('summary', null, `Columns (${dd.cols.length}) — what each was read as, to change`), h('div', { class: 'sd-tablewrap' }, colsTable)), preview);
    pasteArea.rows = 2;
  }

  // ---------------------------------------------------------------- working out a card
  async function compute(c: Card): Promise<void> {
    if (!table || !d) return;
    const my = ++c.v, dd = d, t = table;
    const spec: L.PivotSpec = { ...c.spec, filters: c.spec.filters.filter(complete) };
    try {
      if (c.graph === 'histogram' || c.graph === 'box' || c.graph === 'scatter') {
        const x = c.x ?? spec.values[0]?.field;
        if (!x || x === L.ROWS || kindOf(x) !== 'number') throw new Error(`A ${c.graph === 'box' ? 'box plot' : c.graph === 'scatter' ? 'scatter' : 'histogram'} needs a number column as its first value.`);
        if (c.graph === 'histogram') {
          const bins = await L.histogramOf(t, x, spec, dd);
          if (my !== c.v) return;
          if (!bins.counts.length) throw new Error(`No numbers in ${x}${spec.filters.length ? ' with these filters' : ''}.`);
          c.extra = { bins }; c.pivot = null; c.out = L.tableOfBins(bins);
        } else if (c.graph === 'box') {
          const mc = await mathcore();
          const boxes = await L.boxesOf(t, x, spec, dd, (xs) => mc.stats(xs));
          if (my !== c.v) return;
          if (!boxes.cats.length) throw new Error(`No numbers in ${x}${spec.filters.length ? ' with these filters' : ''}.`);
          c.extra = { boxes }; c.pivot = null; c.out = L.tableOfBoxes(boxes, spec.rows[0] ? L.fieldLabel(spec.rows[0]) : 'All rows');
        } else {
          const y = c.y ?? spec.values[1]?.field;
          if (!y || y === L.ROWS || kindOf(y) !== 'number') throw new Error('A scatter needs two number columns: the first two values.');
          const points = await L.pointsOf(t, x, y, spec, dd);
          if (my !== c.v) return;
          c.extra = { points }; c.pivot = null; c.out = L.tableOfPoints(points);
          if (points.x.length >= 5000) c.out.note.push('The first 5,000 rows are drawn.');
        }
      } else {
        if (!spec.values.length) throw new Error('Choose a value to show.');
        for (const v of spec.values) if (v.field !== L.ROWS && v.agg !== 'count' && v.agg !== 'distinct' && kindOf(v.field) !== 'number') throw new Error(`${L.valueLabel(v)}: ${v.field} holds no numbers — count it, or count its different values.`);
        const p = await L.runPivot(t, spec, dd);
        if (my !== c.v) return;
        c.pivot = p; c.extra = undefined; c.out = L.tableOfPivot(p);
      }
      c.err = undefined;
    } catch (e) { if (my === c.v) { c.err = errMsg(e); c.out = undefined; c.pivot = null; c.extra = undefined; } }
  }
  const optionOf = (c: Card, dark: boolean, animation = true, bare = false) => L.chartOption(c.graph, c.pivot ?? null, { title: c.title, dark, extra: c.extra, animation, bare });
  const catsOf = (c: Card) => (c.pivot ? L.seriesOf(c.pivot).cats.length : c.extra?.boxes?.cats.length ?? c.extra?.bins?.counts.length ?? 0);
  const heightFor = (c: Card) => {
    const n = catsOf(c);
    if (c.graph === 'bar' || c.graph === 'bar-stacked') return Math.min(900, Math.max(phone ? 300 : 340, 26 * n + 110));
    if (c.graph === 'heatmap') return Math.min(900, Math.max(phone ? 300 : 340, 24 * (c.pivot?.rows.filter((r) => r.kind !== 'total').length ?? n) + 150));
    return phone ? 300 : 360;
  };
  const exportSize = (c: Card): [number, number] => {
    const n = catsOf(c);
    if (c.graph === 'bar' || c.graph === 'bar-stacked') return [1200, Math.min(2400, Math.max(600, 30 * n + 160))];
    if (c.graph === 'heatmap') return [1200, Math.min(2400, Math.max(600, 28 * (c.pivot?.rows.length ?? n) + 180))];
    if (c.graph === 'pie' || c.graph === 'donut' || c.graph === 'funnel' || c.graph === 'sunburst' || c.graph === 'treemap') return [1000, 760];
    return [1200, 700];
  };

  function draw(c: Card) {
    if (!c.box) return;
    c.box.style.height = `${heightFor(c)}px`;
    if (c.err) {
      c.drawn?.dispose(); c.drawn = null;
      c.box.replaceChildren(h('p', { class: 'sd-err' }, c.err));
      c.box.setAttribute('aria-label', `${c.title}: ${c.err}`);
    } else if (charts && (c.pivot || c.extra)) {
      const opt = optionOf(c, isDark(), !calm(), true);   // on the screen the card's heading is the title
      if (c.drawn) c.drawn.set(opt);
      else { c.box.replaceChildren(); c.drawn = charts.drawChart(c.box, opt); }
    }
    if (c.msg) c.msg.textContent = c.err ? '' : (c.out?.note ?? []).join(' ');
    if (c.pv?.open) drawTable(c);
  }
  function drawTable(c: Card) {
    if (!c.tbl) return;
    clear(c.tbl);
    if (c.out) c.tbl.append(tableEl(c.out, c.title));
  }
  async function showCard(c: Card) {
    if (!c.out && !c.err) { if (c.box) c.box.setAttribute('aria-busy', 'true'); await compute(c); if (c.box) c.box.removeAttribute('aria-busy'); }
    if (live) draw(c);
  }
  /** the card worked out (Download all reaches cards never scrolled to) */
  async function ready(c: Card) {
    if (!c.out && !c.err) await compute(c);
    if (c.err) throw new Error(`${c.title}: ${c.err}`);
    if (!c.out) throw new Error(`${c.title}: not worked out yet.`);
  }
  function refresh(c: Card) {
    c.v++; c.out = undefined; c.pivot = null; c.extra = undefined; c.err = undefined;
    const sum = c.pv?.querySelector('summary'); if (sum) sum.textContent = `The ${tableWord(c).toLowerCase()}`;
    if (c.seen || c === draft) void showCard(c);
  }

  // a table on the screen
  function tableEl(t: L.TOut, caption: string): HTMLElement {
    const labels = L.shownLabels(t), max = Math.min(t.rows.length, MAX_SHOWN);
    const thead = h('thead', null, t.heads.map((hr) => { let col = 0; return h('tr', null, hr.map((cell) => { const val = col >= t.lead; col += cell.span; return h('th', { scope: cell.span > 1 ? 'colgroup' : 'col', colspan: cell.span > 1 ? String(cell.span) : null, class: val ? 'num' : null }, cell.text); })); }));
    const tb = h('tbody');
    for (let i = 0; i < max; i++) {
      const r = t.rows[i];
      tb.append(h('tr', { class: r.kind === 'sub' ? 'sub' : r.kind === 'total' ? 'tot' : null },
        ...labels[i].map((x) => (x ? h('th', { scope: 'row' }, x) : h('td', null, ''))),
        ...r.values.map((v, k) => h('td', { class: 'num' }, L.fmtNumber(v, r.fmts[k])))));
    }
    return h('div', { class: 'stack' },
      h('div', { class: 'sd-tablewrap' }, h('table', { class: 'sd-table' }, h('caption', { class: 'sr-only' }, caption), thead, tb)),
      max < t.rows.length ? h('p', { class: 'muted small' }, `The first ${max.toLocaleString('en-IN')} of ${t.rows.length.toLocaleString('en-IN')} rows — the CSV and Excel files have them all.`) : '');
  }

  // ---------------------------------------------------------------- pictures and files
  const effScale = (w: number, hgt: number) => { let s = pic.scale; while (s > 1 && w * hgt * s * s > 16e6) s--; return s; };
  async function graphPng(c: Card): Promise<Blob> {
    await ready(c);
    if (!charts) charts = await import('../lib/charts');
    const [w, hgt] = exportSize(c), s = effScale(w, hgt);
    if (s < pic.scale) toast(`“${c.title}” was made at ${s}× — a ${pic.scale}× picture of it is larger than a browser can draw.`, 'info', 4000);
    return charts.chartPng(optionOf(c, false, false), w, hgt, s, pic.bg);
  }
  async function graphSvg(c: Card): Promise<string> {
    await ready(c);
    if (!charts) charts = await import('../lib/charts');
    const [w, hgt] = exportSize(c);
    return charts.chartSvg(optionOf(c, false, false), w, hgt, pic.bg);
  }
  /** a table as a picture: the table's own layout (a group's label once, subtotals and the total in bold), on white or see-through */
  async function tablePng(t: L.TOut, title: string): Promise<Blob> {
    const FONT = '13px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif', BOLD = `600 ${FONT}`, TFONT = `650 15px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
    const PAD = 10, RH = 26, TOP = 40, MAXW = 320;
    const labels = L.shownLabels(t);
    let scale = pic.scale;
    const body = t.rows.map((r, i) => [...labels[i], ...r.values.map((v, k) => L.fmtNumber(v, r.fmts[k]))]);
    const ncol = Math.max(t.heads.length ? t.heads[t.heads.length - 1].reduce((a, c) => a + c.span, 0) : 0, body[0]?.length ?? 0, 1);
    const cv = document.createElement('canvas'), g = cv.getContext('2d')!;
    const measure = (s: string, font: string) => { g.font = font; return g.measureText(s).width; };
    const widths = Array(ncol).fill(48);
    for (const hr of t.heads) { let col = 0; for (const cell of hr) { if (cell.span === 1) widths[col] = Math.max(widths[col], measure(cell.text, BOLD) + 2 * PAD); col += cell.span; } }
    const sample = body.slice(0, 2000);
    sample.forEach((row, i) => row.forEach((x, k) => { widths[k] = Math.max(widths[k], measure(x, t.rows[i].kind === 'leaf' ? FONT : BOLD) + 2 * PAD); }));
    for (let k = 0; k < ncol; k++) widths[k] = Math.min(MAXW, Math.ceil(widths[k]));
    for (const hr of t.heads) { let col = 0; for (const cell of hr) { if (cell.span > 1) { const have = widths.slice(col, col + cell.span).reduce((a, b) => a + b, 0), want = Math.min(MAXW * 2, measure(cell.text, BOLD) + 2 * PAD); if (want > have) widths[col + cell.span - 1] += Math.ceil(want - have); } col += cell.span; } }
    const W = Math.max(widths.reduce((a, b) => a + b, 0), Math.min(900, measure(title, TFONT) + 2 * PAD));
    while (scale > 1 && W * scale > 16000) scale--;
    const room = Math.floor((16000 / scale - TOP - t.heads.length * RH - 40) / RH);
    const shown = body.slice(0, Math.max(1, room)), cut = shown.length < body.length;
    const H = TOP + t.heads.length * RH + shown.length * RH + (cut ? 30 : 10);
    cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
    g.scale(scale, scale);
    if (pic.bg === 'white') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); }
    const text = (s: string, x: number, y: number, w: number, right: boolean, font: string, color = '#1f2937') => {
      g.font = font; g.fillStyle = color; g.textBaseline = 'middle';
      let v = s;
      if (g.measureText(v).width > w - 2 * PAD) { while (v.length > 1 && g.measureText(`${v}…`).width > w - 2 * PAD) v = v.slice(0, -1); v = `${v}…`; }
      g.textAlign = right ? 'right' : 'left';
      g.fillText(v, right ? x + w - PAD : x + PAD, y);
    };
    text(title, 0, 20, W, false, TFONT);
    let y = TOP;
    for (const hr of t.heads) {
      g.fillStyle = 'rgba(17, 24, 39, 0.06)'; g.fillRect(0, y, W, RH);
      let x = 0, col = 0;
      for (const cell of hr) { const w = widths.slice(col, col + cell.span).reduce((a, b) => a + b, 0); text(cell.text, x, y + RH / 2, w, col >= t.lead && cell.span === 1, BOLD); x += w; col += cell.span; }
      y += RH;
    }
    g.fillStyle = '#9ca3af'; g.fillRect(0, y - 1, W, 1);
    shown.forEach((row, i) => {
      const kind = t.rows[i].kind;
      if (kind === 'sub') { g.fillStyle = 'rgba(17, 24, 39, 0.035)'; g.fillRect(0, y, W, RH); }
      if (kind === 'total') { g.fillStyle = '#6b7280'; g.fillRect(0, y, W, 1.5); }
      let x = 0;
      row.forEach((cellText, k) => { text(cellText, x, y + RH / 2, widths[k], k >= t.lead, kind === 'leaf' ? FONT : BOLD); x += widths[k]; });
      y += RH;
      g.fillStyle = '#e5e7eb'; g.fillRect(0, y - 1, W, 1);
    });
    if (cut) text(`The first ${shown.length.toLocaleString('en-IN')} of ${body.length.toLocaleString('en-IN')} rows — the CSV and Excel files have them all.`, 0, y + 16, W, false, FONT, '#6b7280');
    return new Promise<Blob>((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('The browser could not make the picture.'))), 'image/png'));
  }
  const base = () => src?.base ?? 'data';
  const save = (blob: Blob, name: string, image = false) => (phone && image ? shareOrDownload(blob, name) : downloadBlob(blob, name));
  const actionsOf = (c: Card, tbl: () => L.TOut | undefined, label: string) => [
    button('PNG', async () => save(await graphPng(c), `${base()}-${safe(c.title)}.png`, true), { icon: 'Image', small: true, title: `The graph as a PNG picture (${pic.scale}×, ${pic.bg === 'white' ? 'white' : 'see-through'})` }),
    button('SVG', async () => save(new Blob([await graphSvg(c)], { type: 'image/svg+xml' }), `${base()}-${safe(c.title)}.svg`), { icon: 'PenTool', small: true, title: 'The graph as an SVG drawing — sharp at any size' }),
    button(`${label} PNG`, async () => { await ready(c); save(await tablePng(tbl()!, c.title), `${base()}-${safe(c.title)} (${label.toLowerCase()}).png`, true); }, { icon: 'Table', small: true, title: `The ${label.toLowerCase()} as a PNG picture` }),
    button('CSV', async () => { await ready(c); const sh = await sheetEngine(); save(new Blob(['﻿' + sh.csvWrite(L.csvRows(tbl()!), ',')], { type: 'text/csv;charset=utf-8' }), `${base()}-${safe(c.title)}.csv`); }, { icon: 'FileText', small: true, title: `The ${label.toLowerCase()} as CSV (opens in Excel with ₹ and accents)` }),
    button('Excel', async () => { await ready(c); const sh = await sheetEngine(); save(new Blob([sh.xlsx({ sheets: [{ name: c.title.slice(0, 31), rows: L.xlsxRows(tbl()!) }] }) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base()}-${safe(c.title)}.xlsx`); }, { icon: 'Sheet', small: true, title: `The ${label.toLowerCase()} as an Excel workbook (formats and totals kept)` }),
    button('Copy', async () => { await ready(c); const sh = await sheetEngine(); await copy(sh.csvWrite(L.csvRows(tbl()!), '\t')); toast(`Copied — paste it into a spreadsheet`, 'ok'); }, { icon: 'Copy', small: true, title: `Copy the ${label.toLowerCase()}, to paste into a spreadsheet` }),
  ];
  const tableWord = (c: Card) => (c.graph === 'histogram' ? 'Bins' : c.graph === 'box' ? 'Numbers' : c.graph === 'scatter' ? 'Points' : 'Pivot');

  // ---------------------------------------------------------------- the board
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { const c = cards.find((k) => k.box === e.target); if (c && !c.seen) { c.seen = true; io.unobserve(e.target); void showCard(c); } }
  }, { rootMargin: '400px 0px' });
  const boardGrid = h('div', { class: 'sd-board' });
  const boardInfo = h('p', { class: 'muted small' });
  const restore = button('Bring back the presets', () => {
    if (!d) return;
    removedPresets.clear();
    const have = new Set(cards.map((c) => c.preset));
    const missing = L.presetsFor(d).filter((p) => !have.has(p.id)).map(fromPreset);
    for (const c of cards) { disposeCard(c); c.seen = false; }
    cards = [...missing, ...cards];
    drawBoard();
  }, { small: true, icon: 'RotateCcw' });
  const scaleSeg = segmented([['2', '2×'], ['4', '4×']], String(pic.scale), (v) => { pic.scale = +v; });
  const bgSeg = segmented([['white', 'White'], ['transparent', 'See-through']], pic.bg, (v) => { pic.bg = v; });
  const zipBtn = button('Download all (.zip)', () => downloadAll(), { variant: 'primary', icon: 'Download', title: 'Every graph (PNG and SVG) and every table (PNG, CSV), and an Excel workbook of the tables' });
  const zipProgress = h('span', { class: 'muted small', 'aria-live': 'polite' });
  const bar = actions(zipBtn);
  const boardCard = card('Graphs from your data',
    h('p', { class: 'muted' }, 'Ready-made from your columns. Change the kind of graph on any of them, open one in the editor below, or remove it.'),
    h('div', { class: 'row sd-picopts' }, field('Pictures', scaleSeg), field('Background', bgSeg)),
    boardInfo, boardGrid, h('div', { class: 'row' }, restore, zipProgress), bar);
  boardCard.hidden = true;

  function cardEl(c: Card): HTMLElement {
    const title = h('h4', { class: 'sd-title' }, c.title);
    const kindSel = select(L.GRAPHS, c.graph, (v) => { c.graph = v; if (!c.titleSet && c.preset === undefined) c.title = autoTitle(c); title.textContent = c.title; refresh(c); }, `Kind of graph for “${c.title}”`);
    const box = h('div', { class: 'sd-chart', role: 'img', 'aria-label': `${c.title} (being drawn)` });
    const msg = h('p', { class: 'sd-msg muted small' });
    const tbl = h('div');
    const pv = h('details', { class: 'sd-pv' }, h('summary', null, `The ${tableWord(c).toLowerCase()}`), tbl) as HTMLDetailsElement;
    pv.addEventListener('toggle', () => { if (pv.open) void (async () => { await showCard(c); drawTable(c); })(); });
    const tools = h('div', { class: 'sd-tools' }, kindSel,
      button('', () => edit(c), { icon: 'Pencil', small: true, title: `Change “${c.title}” in the editor` }),
      button('', () => removeCard(c), { icon: 'X', small: true, title: `Remove “${c.title}”` }));
    const el = h('article', { class: 'sd-card', 'aria-label': c.title }, h('div', { class: 'sd-head' }, title, tools), box, msg, pv,
      h('div', { class: 'sd-dl' }, actionsOf(c, () => c.out, tableWord(c))));
    Object.assign(c, { el, box, msg, tbl, pv });
    io.observe(box);
    return el;
  }
  function disposeCard(c: Card) { if (c.box) io.unobserve(c.box); c.drawn?.dispose(); c.drawn = null; c.el?.remove(); }
  function removeCard(c: Card) {
    disposeCard(c);
    cards = cards.filter((k) => k !== c);
    if (c.preset) removedPresets.add(c.preset);
    if (editingId === c.id) { editingId = null; drawEditor(); }
    boardMeta();
  }
  function boardMeta() {
    boardCard.hidden = !d || !table;
    boardInfo.textContent = cards.length ? `${cards.length} graph${cards.length === 1 ? '' : 's'}.` : 'No graphs on the board: make one in the editor below.';
    restore.hidden = !d || L.presetsFor(d).every((p) => cards.some((c) => c.preset === p.id));
    zipBtn.disabled = !cards.length;
  }
  function drawBoard() {
    clear(boardGrid);
    for (const c of cards) boardGrid.append(cardEl(c));
    boardMeta();
    editorCard.hidden = !d || !table;
    bar.hidden = !cards.length;
  }

  async function downloadAll() {
    if (!cards.length) return;
    const { zipSync, strToU8 } = await import('fflate');
    const sh = await sheetEngine();
    const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
    const sheets: Array<{ name: string; rows: L.XCell[][] }> = [];
    const skipped: string[] = [];
    let i = 0;
    for (const c of [...cards]) {
      i++;
      zipProgress.textContent = `Making the pictures: ${i} of ${cards.length}…`;
      try { await ready(c); } catch { skipped.push(c.title); continue; }
      const n = `${String(i).padStart(2, '0')} ${safe(c.title)}`;
      files[`${n}.png`] = [new Uint8Array(await (await graphPng(c)).arrayBuffer()), { level: 0 }];
      files[`${n}.svg`] = [strToU8(await graphSvg(c)), { level: 6 }];
      files[`${n} (${tableWord(c).toLowerCase()}).png`] = [new Uint8Array(await (await tablePng(c.out!, c.title)).arrayBuffer()), { level: 0 }];
      files[`${n} (${tableWord(c).toLowerCase()}).csv`] = [strToU8('﻿' + sh.csvWrite(L.csvRows(c.out!), ',')), { level: 6 }];
      sheets.push({ name: `${i} ${c.title}`.slice(0, 31), rows: L.xlsxRows(c.out!) });
      await new Promise((r) => setTimeout(r, 0));
      if (!live) return;
    }
    if (sheets.length) files['tables.xlsx'] = [sh.xlsx({ sheets }), { level: 0 }];
    downloadBlob(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), `${base()}-graphs.zip`);
    zipProgress.textContent = `${sheets.length} graph${sheets.length === 1 ? '' : 's'} and their tables saved${skipped.length ? `; left out (they could not be worked out): ${skipped.join(', ')}` : ''}.`;
  }

  // ---------------------------------------------------------------- the editor: a pivot and a graph of one's own
  let draft: Card = newCard({ title: '', titleSet: false, spec: { rows: [], cols: null, values: [], filters: [], order: 'label', top: 0, subtotals: true, totals: true }, graph: 'column' });
  let editingId: number | null = null;
  const edBox = h('div', { class: 'sd-chart', role: 'img', 'aria-label': 'Your graph (being drawn)' });
  const edMsg = h('p', { class: 'sd-msg muted small', 'aria-live': 'polite' });
  const edTable = h('div');
  const edControls = h('div', { class: 'stack sd-edctl' });
  const edButtons = h('div', { class: 'row' });
  const edPreview = h('div', { class: 'stack sd-edprev' }, edBox, edMsg, h('details', { class: 'sd-pv', open: true }, h('summary', null, 'The table'), edTable), h('div', { class: 'sd-dl' }, actionsOf(draftProxy(), () => draft.out, 'Table')));
  const editorCard = card('Make your own pivot and graph', h('p', { class: 'muted' }, 'Start from a preset or from scratch; every change is drawn at once.'), h('div', { class: 'sd-ed' }, edControls, edPreview), edButtons);
  editorCard.hidden = true;
  function draftProxy(): Card { return new Proxy({} as Card, { get: (_, k) => (draft as unknown as Record<string | symbol, unknown>)[k], set: (_, k, v) => { (draft as unknown as Record<string | symbol, unknown>)[k] = v; return true; } }); }
  Object.assign(draft, { box: edBox, msg: edMsg, tbl: edTable });

  function autoTitle(c: Pick<Card, 'spec' | 'graph' | 'x' | 'y'>): string {
    const s = c.spec, v0 = s.values[0];
    if (c.graph === 'histogram') return `How ${c.x ?? v0?.field ?? '…'} is spread`;
    if (c.graph === 'scatter') return `${c.y ?? s.values[1]?.field ?? '…'} against ${c.x ?? v0?.field ?? '…'}`;
    if (c.graph === 'box') return `${c.x ?? v0?.field ?? '…'}${s.rows[0] ? ` by ${L.fieldLabel(s.rows[0])}` : ''}: the spread`;
    const what = v0 ? (v0.field === L.ROWS ? 'Number of rows' : L.valueLabel(v0)) : 'Nothing yet';
    return `${what}${s.values.length > 1 ? ` and ${s.values.length - 1} more` : ''}${s.rows.length ? ` by ${s.rows.map(L.fieldLabel).join(' and ')}` : ''}${s.cols ? `, split by ${L.fieldLabel(s.cols)}` : ''}`;
  }
  function resetDraft(from?: L.Preset | null) {
    if (!d) return;
    const p = from === undefined ? L.presetsFor(d)[0] : from;
    const r = L.roles(d);
    const spec: L.PivotSpec = p ? clone(p.spec) : { rows: r.cats[0] ? [{ name: r.cats[0].name }] : [], cols: null, values: [r.nums[0] ? { field: r.nums[0].name, agg: 'sum', show: 'value' } : { field: L.ROWS, agg: 'sum', show: 'value' }], filters: [], order: 'label', top: 0, subtotals: true, totals: true };
    draft.drawn?.dispose();
    draft = Object.assign(newCard({ title: p?.title ?? '', titleSet: false, spec, graph: p?.graph ?? 'column', x: p?.x, y: p?.y }), { box: edBox, msg: edMsg, tbl: edTable });
    if (!p) draft.title = autoTitle(draft);
    editingId = null;
    drawEditor(); changed(true, true);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  function changed(now = false, keepTitle = false) {
    if (!draft.titleSet && !keepTitle) { draft.title = autoTitle(draft); if (titleIn && document.activeElement !== titleIn) titleIn.value = draft.title; }
    clearTimeout(timer);
    const go = () => { draft.v++; draft.out = undefined; draft.pivot = null; draft.extra = undefined; draft.err = undefined; void showCard(draft).then(() => { if (live) drawTable(draft); }); };
    if (now) go(); else timer = setTimeout(go, 120);
  }
  let titleIn: HTMLInputElement | null = null;
  function drawEditor() {
    clear(edControls); clear(edButtons);
    if (!d) return;
    const dd = d, s = draft.spec;
    const colOpts = dd.cols.map((c) => [c.name, c.name] as [string, string]);
    const numCols = dd.cols.filter((c) => c.kind === 'number');
    const grainSel = (f: L.Field) => (kindOf(f.name) === 'date' ? select(L.GRAINS, f.grain ?? 'month', (g) => { f.grain = g; changed(); }, `${f.name} by`) : null);
    const remove = (title: string, fn: () => void) => button('', () => { fn(); drawEditor(); changed(); }, { icon: 'X', small: true, title });
    // start from
    const presets = L.presetsFor(dd);
    const startSel = select([['', 'Start from…'], ['blank', 'Nothing (a blank pivot)'], ...presets.map((p) => [p.id, p.title] as [string, string])], '', (v) => { if (v === 'blank') resetDraft(null); else { const p = presets.find((x) => x.id === v); if (p) resetDraft(p); } }, 'Start from a preset');
    titleIn = input({ value: draft.title, onInput: (v) => { draft.title = v; draft.titleSet = v.trim() !== ''; if (!draft.titleSet) draft.title = autoTitle(draft); changed(); }, attrs: { 'aria-label': 'Title of the graph', maxlength: 120 } });
    // rows
    const rowsBox = h('div', { class: 'stack sd-list' }, s.rows.map((f, i) => h('div', { class: 'sd-frow' },
      select(colOpts, f.name, (v) => { s.rows[i] = { name: v, ...(kindOf(v) === 'date' ? { grain: 'month' as L.Grain } : {}) }; drawEditor(); changed(); }, `Row level ${i + 1}`),
      grainSel(f), remove(`Take “${L.fieldLabel(f)}” out of the rows`, () => s.rows.splice(i, 1)))));
    const addRow = s.rows.length < 3 ? button('Add a row level', () => { const used = new Set(s.rows.map((f) => f.name)); const c = L.roles(dd).cats.find((x) => !used.has(x.name)) ?? dd.cols.find((x) => !used.has(x.name)); if (c) s.rows.push({ name: c.name, ...(c.kind === 'date' ? { grain: 'month' as L.Grain } : {}) }); drawEditor(); changed(); }, { small: true, icon: 'Plus' }) : null;
    // the split
    const colSel = select([['', 'None'], ...colOpts], s.cols?.name ?? '', (v) => { s.cols = v ? { name: v, ...(kindOf(v) === 'date' ? { grain: 'year' as L.Grain } : {}) } : null; drawEditor(); changed(); }, 'Columns (split by)');
    // values
    const valOpts: Array<[string, string]> = [[L.ROWS, 'Number of rows'], ...numCols.map((c) => [c.name, c.name] as [string, string]), ...dd.cols.filter((c) => c.kind !== 'number').map((c) => [c.name, `${c.name} (counted)`] as [string, string])];
    const valsBox = h('div', { class: 'stack sd-list' }, s.values.map((v, i) => {
      const num = v.field !== L.ROWS && kindOf(v.field) === 'number';
      const aggs = v.field === L.ROWS ? [] : num ? L.AGGS : L.AGGS.filter(([a]) => a === 'count' || a === 'distinct');
      return h('div', { class: 'sd-frow' },
        select(valOpts, v.field, (f) => { const n2 = f !== L.ROWS && kindOf(f) === 'number'; s.values[i] = { field: f, agg: f === L.ROWS ? 'sum' : n2 ? (v.agg === 'count' || v.agg === 'distinct' ? 'sum' : v.agg) : v.agg === 'distinct' ? 'distinct' : 'count', show: v.show }; drawEditor(); changed(); }, `Value ${i + 1}`),
        aggs.length ? select(aggs, v.agg, (a) => { v.agg = a; changed(); }, `How value ${i + 1} is worked out`) : null,
        select(L.SHOWS, v.show, (w) => { v.show = w; changed(); }, `What value ${i + 1} shows`),
        s.values.length > 1 ? remove(`Take value ${i + 1} out`, () => s.values.splice(i, 1)) : null);
    }));
    const addVal = s.values.length < 4 ? button('Add a value', () => { const m = numCols.find((c) => !s.values.some((v) => v.field === c.name)); s.values.push(m ? { field: m.name, agg: 'sum', show: 'value' } : { field: L.ROWS, agg: 'sum', show: 'value' }); drawEditor(); changed(); }, { small: true, icon: 'Plus' }) : null;
    // filters
    const filtersBox = h('div', { class: 'stack sd-list' }, s.filters.map((f, i) => filterRow(f, i)));
    const addFilter = button('Add a filter', () => { const c = L.roles(dd).cats[0] ?? dd.cols[0]; s.filters.push(defaultFilter(c.name)); drawEditor(); }, { small: true, icon: 'Filter' });
    // the order, the top, totals
    const orderSel = select([['label', 'By the rows’ labels, A → Z'], ['label-desc', 'By the labels, Z → A'], ['value-desc', 'Largest value first'], ['value-asc', 'Smallest value first']] as Array<[L.Order, string]>, s.order, (o) => { s.order = o; changed(); }, 'Order of the rows');
    const topIn = input({ type: 'number', value: s.top || '', min: 0, max: 1000, placeholder: 'All', onInput: (v) => { const n = Math.floor(+v); s.top = Number.isFinite(n) && n > 0 ? Math.min(1000, n) : 0; changed(); }, attrs: { 'aria-label': 'Show only the first … groups (empty: all)' } });
    const graphSel = select(L.GRAPHS, draft.graph, (g) => { draft.graph = g; drawEditor(); changed(); }, 'Kind of graph');
    const hint = draft.graph === 'histogram' ? 'A histogram counts the rows by the first value’s numbers (its sum is not used).' : draft.graph === 'box' ? 'A box plot shows the first value’s numbers by the first row level: smallest, quartiles, median, largest.' : draft.graph === 'scatter' ? 'A scatter draws the first two values’ numbers against each other, a dot a row.' : draft.graph === 'pie' || draft.graph === 'donut' || draft.graph === 'funnel' || draft.graph === 'pareto' || draft.graph === 'waterfall' ? 'Drawn from the first value, by the first row level.' : draft.graph === 'combo' ? 'The first value as columns, the second as a line on its own axis.' : draft.graph === 'heatmap' ? 'Rows down, the split across: choose “Columns (split by)”.' : '';
    edControls.append(
      field('Start from', startSel), field('Title', titleIn),
      h('fieldset', { class: 'sd-fs' }, h('legend', null, 'Rows'), rowsBox, addRow),
      h('div', { class: 'sd-frow' }, field('Columns (split by)', colSel), s.cols && kindOf(s.cols.name) === 'date' ? select(L.GRAINS, s.cols.grain ?? 'year', (g) => { s.cols!.grain = g; changed(); }, `${s.cols.name} by`) : null),
      h('fieldset', { class: 'sd-fs' }, h('legend', null, 'Values'), valsBox, addVal),
      h('fieldset', { class: 'sd-fs' }, h('legend', null, 'Filters'), filtersBox, addFilter),
      h('div', { class: 'sd-two' }, field('Order', orderSel), field('Show only the first', topIn, 'groups (empty: all)')),
      h('div', { class: 'row' }, s.rows.length > 1 ? toggle('Subtotals', s.subtotals, (v) => { s.subtotals = v; changed(); }) : null, toggle('Total row', s.totals, (v) => { s.totals = v; changed(); })),
      field('Graph', graphSel, hint || undefined));
    const editing = cards.find((c) => c.id === editingId);
    if (editing) {
      edButtons.append(
        button('Save to the board', () => {
          Object.assign(editing, clone(snap(draft)));
          const old = editing.el;
          if (editing.box) io.unobserve(editing.box);
          editing.drawn?.dispose(); editing.drawn = null; editing.seen = false;
          editing.v++; editing.out = undefined; editing.pivot = null; editing.extra = undefined; editing.err = undefined;
          old?.replaceWith(cardEl(editing));
          editingId = null; drawEditor();
          if (editing.el) reveal(editing.el);
          toast('Saved on the board', 'ok');
        }, { variant: 'primary', icon: 'Check' }),
        button('Add as a new graph', () => addToBoard(), { icon: 'Plus' }),
        button('Stop changing it', () => { editingId = null; drawEditor(); }, { icon: 'X' }),
        h('span', { class: 'muted small' }, `Changing “${editing.title}”.`));
    } else edButtons.append(button('Add to the board', () => addToBoard(), { variant: 'primary', icon: 'Plus' }));
  }
  function defaultFilter(name: string): L.Filter {
    const k = kindOf(name);
    if (k === 'text') return { field: name, op: 'in', value: [] };
    const c = d!.cols.find((x) => x.name === name)!;
    const vs = c.values.filter((v): v is number => typeof v === 'number');
    return { field: name, op: '>=', value: vs.length ? Math.min(...vs) : 0 };
  }
  function filterRow(f: L.Filter, i: number): HTMLElement {
    const dd = d!, s = draft.spec, col = dd.cols.find((c) => c.name === f.field)!;
    const fieldSel = select(dd.cols.map((c) => [c.name, c.name] as [string, string]), f.field, (v) => { s.filters[i] = defaultFilter(v); drawEditor(); changed(); }, `Filter ${i + 1} on`);
    const ops: Array<[L.Filter['op'], string]> = col.kind === 'text' ? [['in', 'is one of'], ['not in', 'is not one of'], ['contains', 'contains']] : [['>=', 'is at least'], ['<=', 'is at most']];
    const opSel = select(ops, f.op, (o) => { f.op = o; if (o === 'contains') f.value = ''; else if ((o === 'in' || o === 'not in') && !Array.isArray(f.value)) f.value = []; drawEditor(); changed(); }, `Filter ${i + 1}: how`);
    let valueEl: HTMLElement;
    if (f.op === 'in' || f.op === 'not in') {
      const vals = [...new Set(col.values.filter((v): v is string => typeof v === 'string'))].sort(new Intl.Collator('en', { numeric: true }).compare);
      const chosen = new Set(Array.isArray(f.value) ? f.value : []);
      const shown = vals.slice(0, 300);
      const list = h('div', { class: 'sd-checks', role: 'group', 'aria-label': `Filter ${i + 1}: the values` }, shown.map((v) => {
        const cb = h('input', { type: 'checkbox', checked: chosen.has(v) }) as HTMLInputElement;
        cb.addEventListener('change', () => { if (cb.checked) chosen.add(v); else chosen.delete(v); f.value = [...chosen]; changed(); });
        return h('label', { class: 'sd-check' }, cb, h('span', null, v));
      }));
      valueEl = h('div', { class: 'stack' }, list, vals.length > 300 ? h('p', { class: 'muted small' }, `The first 300 of ${vals.length.toLocaleString('en-IN')} values — “contains” finds the rest.`) : '',
        chosen.size ? '' : h('p', { class: 'muted small' }, 'Tick the values to keep (or leave out); nothing ticked, no filter.'));
    } else if (f.op === 'contains') {
      valueEl = input({ value: typeof f.value === 'string' ? f.value : '', placeholder: 'a word or part of one', onInput: (v) => { f.value = v; changed(); }, attrs: { 'aria-label': `Filter ${i + 1}: contains` } });
    } else if (col.kind === 'date') {
      valueEl = input({ type: 'date', value: typeof f.value === 'number' ? new Date(f.value).toISOString().slice(0, 10) : '', onInput: (v) => { const t = Date.parse(`${v}T00:00:00Z`); f.value = Number.isFinite(t) ? t : NaN; changed(); }, attrs: { 'aria-label': `Filter ${i + 1}: the date` } });
    } else {
      valueEl = input({ type: 'number', value: typeof f.value === 'number' ? f.value : '', step: 'any', onInput: (v) => { f.value = v.trim() === '' ? NaN : +v; changed(); }, attrs: { 'aria-label': `Filter ${i + 1}: the number` } });
    }
    return h('div', { class: 'sd-filter' }, h('div', { class: 'sd-frow' }, fieldSel, opSel, button('', () => { s.filters.splice(i, 1); drawEditor(); changed(); }, { icon: 'X', small: true, title: `Remove filter ${i + 1}` })), valueEl);
  }
  function addToBoard() {
    const c = newCard(clone(snap(draft)));
    c.preset = undefined;
    cards.push(c);
    boardGrid.append(cardEl(c));
    editingId = null; drawEditor(); boardMeta(); bar.hidden = false;
    reveal(c.el!);
    toast('Added to the board', 'ok');
  }
  function edit(c: Card) {
    draft.drawn?.dispose();
    draft = Object.assign(newCard(clone(snap(c))), { box: edBox, msg: edMsg, tbl: edTable });
    editingId = c.id;
    drawEditor(); changed(true, true);
    reveal(editorCard);
  }

  // ---------------------------------------------------------------- the page
  bar.hidden = true;
  root.append(inCard, status, boardCard, editorCard,
    note('Pivots by Perspective (its C++ engine in WebAssembly), graphs by Apache ECharts, Excel and CSV files by our sheet.wasm — all on this device. Your data and the graphs stay while the page is open; nothing is stored.'));
  status.hidden = true;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const redrawAll = () => { for (const c of [...cards, draft]) if (c.drawn) draw(c); };
  mq.addEventListener('change', redrawAll);
  if (src) void build();   // back in the tab: the data and the board as they were

  return () => {
    live = false; seq++;
    if (boardReady) board = cards.map(snap);
    clearTimeout(timer);
    document.removeEventListener('paste', onDocPaste);
    mq.removeEventListener('change', redrawAll);
    io.disconnect();
    for (const c of [...cards, draft]) c.drawn?.dispose();
    if (table) void table.delete().catch(() => {});
  };
};
