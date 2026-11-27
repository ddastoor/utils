// PDF Tables → Excel (potentials #16): the tables of a PDF — a bank statement, a bill, a price list — found on its pages and saved
// as Excel or CSV: ruled grids, and columns that line up (textcore.wasm's table.c on MuPDF's words and ruled lines); a table that
// runs on over pages joined, its repeated header left out; amounts and dates made numbers and dates; a scanned page read by the
// OCR; a table it misses drawn on the page by hand. PC + phones.
import { h, card, field, stack, note, actions, button, toggle, segmented, progress, clear, toast, errMsg, downloadBlob, shareOrDownload, copy, type Mount } from '../ui';
import { pdfInput, stem, type LoadedPdf } from '../lib/pdfui';
import { mupdf, pageGeom } from '../lib/pdf';
import { pageKind } from '../lib/redact';
import { readRules } from '../lib/pdf2epub';
import { pageWords, ocrWords, rulesOf, pageTables, joinPages, typed, excelCell, type Word, type Table } from '../lib/pdftables';
import { textcore } from '../wasm/textcore';
import { sheetEngine } from '../wasm/sheet';
import type { OcrLang } from '../lib/ocr';
import type { Img } from '../wasm/imgproc';
import { plural } from '../lib/dates';
import './pdftables.css';

// the choices, kept while the page is open
let joinOn = true, typedOn = true, ocrOn = true, lang: OcrLang = 'eng';
const SHOWN = 30;
const STOP = new Error('stopped');
const rgba = (pix: any): Img => {
  const rgb = pix.getPixels(), w = pix.getWidth(), hh = pix.getHeight(), n = pix.getNumberOfComponents(), out = new Uint8ClampedArray(w * hh * 4);
  for (let a = 0, b = 0; b < out.length; a += n, b += 4) { out[b] = rgb[a]; out[b + 1] = rgb[a + 1]; out[b + 2] = rgb[a + 2]; out[b + 3] = 255; }
  return { data: out, width: w, height: hh };
};
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const pagesOf = (t: Table) => (t.pages.length > 1 ? `pages ${t.pages[0] + 1}–${t.pages[t.pages.length - 1] + 1}` : `page ${t.pages[0] + 1}`);
interface Page { words: Word[]; rules: number[][]; bounds: number[]; ocr: boolean; turned: boolean }

export const mount: Mount = (root, ctx) => {
  let file: LoadedPdf | null = null, doc: any = null, pages: Page[] = [], found: Table[] = [], drawn: Table[] = [], seq = 0, gone = false, drawing = false;
  const info = h('div', { class: 'muted small pt-info', 'aria-live': 'polite' });
  const prog = progress();
  const summary = h('div', { class: 'pt-summary', 'aria-live': 'polite' });
  const list = h('div', { class: 'stack' });
  const pagesEl = h('div', { class: 'pt-pages' });
  const inp = pdfInput({ onLoad: ([x]) => load(x) });
  const saveAll = button('Save as Excel', () => saveXlsx(all(), `${stem(file!.name)}-tables.xlsx`), { variant: 'primary', icon: 'Sheet', disabled: true });
  const drawBtn = button('Draw a table', () => setDrawing(!drawing), { icon: 'SquareDashed' });
  drawBtn.setAttribute('aria-pressed', 'false');
  const resultCard = card('Tables', summary, list);
  const pagesCard = card('The pages', h('p', { class: 'muted small' }, 'Each table found is outlined, its columns dashed. If one is missing, press “Draw a table” and drag a box round it on its page.'), h('div', { class: 'row' }, drawBtn), pagesEl);
  resultCard.hidden = true; pagesCard.hidden = true;
  function setDrawing(v: boolean) { drawing = v; drawBtn.setAttribute('aria-pressed', String(v)); pagesEl.classList.toggle('pt-drawing', v); }
  const all = () => [...found, ...drawn];

  // ---- reading: each page's words and ruled lines; a scanned page read by the OCR
  async function readScanned(page: any, my: number, label: string): Promise<{ words: Word[]; turned: boolean }> {
    const m: any = await mupdf();
    const [{ readPage, secondWords }, { uprightByReading }, { recognize }] = await Promise.all([import('../lib/readpage'), import('../lib/upright'), import('../lib/ocr')]);
    const live = () => !gone && my === seq;
    const glance = (im: Img) => recognize(new ImageData(im.data as Uint8ClampedArray<ArrayBuffer>, im.width, im.height), lang, undefined, 'block');
    const g = pageGeom(page), k0 = 1000 / Math.max(g.W, g.H);
    prog.set(null, `${label}: which way up…`);
    const up = await uprightByReading(rgba(page.toPixmap(m.Matrix.scale(k0, k0), m.ColorSpace.DeviceRGB, false, true)), glance).catch(() => ({ turns: 0 }));
    if (!live()) throw STOP;
    const t = up.turns, sc = Math.min(300 / 72, 3000 / Math.max(g.W, g.H));
    const R = rgba(page.toPixmap(m.Matrix.scale(sc, sc), m.ColorSpace.DeviceRGB, false, true));
    const reading = await readPage(R, {
      lang, clean: true, straighten: false, auto: false, turns: t, stale: () => !live(),
      onProgress: (p, st) => { if (live()) prog.set(null, `${label}: ${/recogn/i.test(st) ? `reading… ${Math.round(p * 100)} %` : 'loading the text engine…'}`); },
      onSecond: (q) => { if (live()) prog.set(null, `${label}: ${secondWords(q).text}`); },
    });
    if (!live()) throw STOP;
    if (!reading) return { words: [], turned: !!t };
    // boxes in points on the picture read (the page turned upright): the tables are found there
    return { words: ocrWords(reading.r, (t % 2 ? R.height : R.width) / reading.img.width / sc), turned: !!t };
  }
  async function load(x: LoadedPdf) {
    const my = ++seq;
    file = x; found = []; drawn = []; pages = []; clear(list); clear(pagesEl); summary.textContent = ''; resultCard.hidden = true; pagesCard.hidden = true; saveAll.disabled = true;
    try {
      const m: any = await mupdf();
      doc = m.Document.openDocument(x.bytes, 'application/pdf');
      if (x.password !== undefined) doc.authenticatePassword(x.password);
      const n = doc.countPages();
      info.textContent = `${x.name}: ${plural(n, 'page')}`;
      const tc = await textcore();
      const pdf = doc.asPDF?.() ?? doc;
      let scanned = 0, unread = 0;
      for (let i = 0; i < n; i++) {
        if (gone || my !== seq) return;
        const page = doc.loadPage(i), b = page.getBounds(), label = `Page ${i + 1} of ${n}`;
        prog.set(i / n, `${label}…`);
        let pg: Page;
        if (pageKind(page).scanned) {
          scanned++;
          if (ocrOn) { const r = await readScanned(page, my, label); pg = { words: r.words, rules: [], bounds: b, ocr: true, turned: r.turned }; }
          else { unread++; pg = { words: [], rules: [], bounds: b, ocr: false, turned: false }; }
        } else {
          const rl = readRules(m, page, pdf);
          pg = { words: pageWords(page), rules: rulesOf(rl), bounds: b, ocr: false, turned: false };
          rl.release();
        }
        pages.push(pg);
        if (i % 3 === 2) await tick();
      }
      const each = pages.flatMap((p, i) => pageTables(p.words, p.rules, i, (w, nm, r) => tc.tables(w, nm, r)));
      found = joinOn ? joinPages(each) : each;
      prog.done();
      info.textContent = `${x.name}: ${plural(n, 'page')}${scanned ? ` · ${plural(scanned, 'page')} scanned${ocrOn ? ': read by the OCR — check its numbers' : ' and not read (reading scanned pages is off)'}` : ''}`;
      void unread;
      show();
    } catch (e) {
      prog.done();
      if (e !== STOP) toast(errMsg(e), 'err');
    }
  }

  // ---- the tables: a preview of each, and its downloads
  const cellsOf = (t: Table) => [t.head.length ? t.head : null, ...t.rows.map((r) => (typedOn ? r.map(typed) : r))].filter(Boolean) as Array<Array<string | number>>;
  // the Excel file: dates as real dates in the form they were printed in
  const xlsxCells = (t: Table) => [t.head.length ? t.head : null, ...t.rows.map((r) => (typedOn ? r.map(excelCell) : r))].filter(Boolean) as Array<Array<string | number | { date: string; format: string; shown: string }>>;
  const nameOf = (t: Table, i: number) => `Table ${i + 1}${t === drawn.find((d) => d === t) ? ' (drawn)' : ''}`;
  async function saveXlsx(ts: Table[], name: string) {
    if (!ts.length) return;
    try {
      const s = await sheetEngine();
      const bytes = s.xlsx({ sheets: ts.map((t, i) => ({ name: `${nameOf(t, all().indexOf(t)).replace(' (drawn)', ' drawn')} (${pagesOf(t)})`.slice(0, 31), rows: xlsxCells(t) })) }, { dates: typedOn, header: ts.every((t) => t.head.length) });
      const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (ctx.isMobile) await shareOrDownload(blob, name); else downloadBlob(blob, name);
    } catch (e) { toast(errMsg(e), 'err'); }
  }
  async function csvOf(t: Table) { const s = await sheetEngine(); return s.csvWrite(cellsOf(t).map((r) => r.map((c) => (typeof c === 'number' ? c : String(c))))); }
  function show() {
    const ts = all();
    clear(list);
    summary.textContent = ts.length ? `${plural(ts.length, 'table')} found${ts.some((t) => t.pages.length > 1) ? ' (a table that runs on over pages is one)' : ''}` : 'No table was found.';
    if (!ts.length) list.append(note('A table needs columns that line up over three rows or more, or ruled lines round its cells. If the PDF is a scan, reading scanned pages must be on. You can also draw a table on its page (below).', 'warn'));
    ts.forEach((t, i) => {
      // the preview shows the cells as printed; an amount the files hold as a number stands to the right
      const cols = Math.max(t.head.length, ...t.rows.map((r) => r.length), 0);
      const grid = h('table', { class: 'pt-grid' },
        t.head.length ? h('thead', null, h('tr', null, ...t.head.map((c) => h('th', { scope: 'col' }, c)))) : null,
        h('tbody', null, ...t.rows.slice(0, SHOWN).map((r) => h('tr', null, ...Array.from({ length: cols }, (_, k) => { const c = r[k] ?? ''; return h('td', { class: typedOn && typeof typed(c) === 'number' ? 'num' : '' }, c); })))));
      const tsv = () => cellsOf(t).map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n');
      list.append(card(`${nameOf(t, i)} — ${pagesOf(t)}`,
        h('p', { class: 'muted small' }, `${plural(t.rows.length, 'row')} · ${plural(cols, 'column')} · ${t.kind === 'ruled' ? 'ruled' : 'columns that line up'}${t.head.length ? ' · a header row' : ''}${t.pages.length > 1 ? ` · joined over ${t.pages.length} pages, the header they repeat left out` : ''}`),
        h('div', { class: 'pt-scroll', tabindex: '0', role: 'region', 'aria-label': `${nameOf(t, i)}, the first rows` }, grid),
        t.rows.length > SHOWN ? h('p', { class: 'muted small' }, `The first ${SHOWN} rows shown — the files hold all ${t.rows.length}.`) : null,
        h('div', { class: 'row' },
          button('Excel', () => saveXlsx([t], `${stem(file!.name)}-table-${i + 1}.xlsx`), { variant: 'ghost', icon: 'Sheet', small: true }),
          button('CSV', async () => { const blob = new Blob(['﻿' + (await csvOf(t))], { type: 'text/csv;charset=utf-8' }), name = `${stem(file!.name)}-table-${i + 1}.csv`; if (ctx.isMobile) await shareOrDownload(blob, name); else downloadBlob(blob, name); }, { variant: 'ghost', icon: 'FileText', small: true }),
          button('Copy', () => copy(tsv()), { variant: 'ghost', icon: 'Copy', small: true, title: 'Copy the table (paste it into Excel or Google Sheets)' }),
          drawn.includes(t) ? button('Remove', () => { drawn = drawn.filter((d) => d !== t); show(); }, { variant: 'ghost', icon: 'X', small: true }) : null)));
    });
    list.append(h('p', { class: 'muted small' }, typedOn ? 'Amounts are numbers in the Excel file (1,25,000.00 is 125000; (1,234.00) and 1,234.00 Dr are minus, Cr is plus) and dates are dates (day first: 07/11/2026 is 7 November 2026); long reference and account numbers stay text.' : 'Every cell is text, as printed.'));
    resultCard.hidden = false;
    saveAll.disabled = !ts.length;
    drawPages();
  }

  // ---- the pages, the tables outlined
  let io: IntersectionObserver | null = null;
  function drawPages() {
    io?.disconnect(); clear(pagesEl);
    io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io!.unobserve(e.target); void paint(e.target as HTMLElement); } }, { rootMargin: '400px' });
    pages.forEach((p, i) => {
      const b = p.bounds, W = b[2] - b[0], H = b[3] - b[1];
      const el = h('div', { class: 'pt-page', 'data-page': String(i), style: `aspect-ratio: ${W} / ${H}` });
      const pct = (x: number, y: number) => [((x - b[0]) / W) * 100, ((y - b[1]) / H) * 100];
      if (!p.turned) all().forEach((t, ti) => t.boxes.filter((x) => x.page === i).forEach((x) => {
        // the outline a few points outside the words, so that it does not cut their first and last letters
        const bx = [x.box[0] - 3, x.box[1] - 2, x.box[2] + 3, x.box[3] + 2];
        const [l, tp] = pct(bx[0], bx[1]), [r, bt] = pct(bx[2], bx[3]);
        el.append(h('div', { class: ['pt-box', drawn.includes(t) && 'pt-mine'], 'aria-hidden': 'true', title: `${nameOf(t, ti)}`, style: `left:${l}%;top:${tp}%;width:${r - l}%;height:${bt - tp}%` },
          ...x.cols.slice(1, -1).map((cx) => h('div', { class: 'pt-col', style: `left:${((cx - bx[0]) / (bx[2] - bx[0])) * 100}%` })),
          h('span', { class: 'pt-tag' }, String(ti + 1))));
      }));
      pagesEl.append(h('div', null, h('div', { class: 'pt-page-no' }, `Page ${i + 1}${p.ocr ? ' (scanned, read by the OCR)' : ''}`), el));
      io!.observe(el);
      wire(el, i);
    });
    pagesCard.hidden = false;
  }
  async function paint(el: HTMLElement) {
    if (!doc) return;
    const m: any = await mupdf(), i = +el.dataset.page!, b = pages[i].bounds;
    const s = Math.min(1600, Math.max(320, el.clientWidth * (window.devicePixelRatio || 1))) / (b[2] - b[0]);
    const pix = doc.loadPage(i).toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceRGB, false, true);
    const c = h('canvas', { width: pix.getWidth(), height: pix.getHeight(), 'aria-hidden': 'true' }) as HTMLCanvasElement;
    c.getContext('2d')!.putImageData(new ImageData(rgba(pix).data as Uint8ClampedArray<ArrayBuffer>, pix.getWidth(), pix.getHeight()), 0, 0);
    pix.destroy?.();
    el.prepend(c);
  }
  /** drawing a table's box on a page: its words are one table */
  function wire(el: HTMLElement, page: number) {
    let start: [number, number] | null = null, temp: HTMLElement | null = null;
    const at = (e: PointerEvent): [number, number] => { const r = el.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    el.addEventListener('pointerdown', (e) => { if (!drawing) return; e.preventDefault(); el.setPointerCapture(e.pointerId); start = at(e); temp = h('div', { class: 'pt-box pt-mine' }); el.append(temp); });
    el.addEventListener('pointermove', (e) => {
      if (!start || !temp) return; const p = at(e);
      Object.assign(temp.style, { left: `${Math.min(start[0], p[0]) * 100}%`, top: `${Math.min(start[1], p[1]) * 100}%`, width: `${Math.abs(p[0] - start[0]) * 100}%`, height: `${Math.abs(p[1] - start[1]) * 100}%` });
    });
    el.addEventListener('pointerup', async (e) => {
      if (!start) return; const p = at(e), s0 = start; start = null; temp?.remove(); temp = null;
      const pg = pages[page], b = pg.bounds, W = b[2] - b[0], H = b[3] - b[1];
      const box = [b[0] + Math.min(s0[0], p[0]) * W, b[1] + Math.min(s0[1], p[1]) * H, b[0] + Math.max(s0[0], p[0]) * W, b[1] + Math.max(s0[1], p[1]) * H];
      if (box[2] - box[0] < 20 || box[3] - box[1] < 10) return;
      const inside = (x0: number, y0: number, x1: number, y1: number) => (x0 + x1) / 2 >= box[0] && (x0 + x1) / 2 <= box[2] && (y0 + y1) / 2 >= box[1] && (y0 + y1) / 2 <= box[3];
      const words = pg.words.filter((w) => inside(...w.box)), rules = pg.rules.filter((r) => inside(r[0], r[1], r[2], r[3]));
      if (!words.length) { toast('No text inside that box.', 'info'); return; }
      const tc = await textcore();
      const t = pageTables(words, rules, page, (w, nm, r) => tc.tables(w, nm, r, true))[0];
      if (!t) { toast('No table could be read inside that box.', 'info'); return; }
      drawn.push(t); setDrawing(false); show();
      toast(`Table ${all().length} added: ${plural(t.rows.length, 'row')}, ${plural(t.boxes[0].cols.length - 1, 'column')}.`, 'ok');
    });
    el.addEventListener('pointercancel', () => { start = null; temp?.remove(); temp = null; });
  }

  root.append(stack(
    card(null, inp.el, info, prog),
    card('Reading the tables',
      h('div', { class: 'pt-opts' },
        toggle('Join a table that runs on over pages (its repeated header left out)', joinOn, (v) => { joinOn = v; if (file) void load(file); }),
        toggle('Amounts and dates as numbers and dates', typedOn, (v) => { typedOn = v; if (found.length || drawn.length) show(); }),
        toggle('Read scanned pages (OCR — slower)', ocrOn, (v) => { ocrOn = v; if (file) void load(file); })),
      field('Language of scanned pages', segmented<OcrLang>([['eng', 'English'], ['fra', 'Français'], ['spa', 'Español'], ['deu', 'Deutsch'], ['eng+fra+spa+deu', 'Mixed / not sure']], lang, (v) => { lang = v; }))),
    resultCard, pagesCard,
    note('Everything happens on this device: the PDF never leaves it.', 'info'),
    actions(saveAll)));
  return () => { gone = true; seq++; io?.disconnect(); doc = null; };
};
