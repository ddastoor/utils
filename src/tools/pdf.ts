// Core PDF tabs on MuPDF (official C → wasm build): merge, split, organize, images → PDF, PDF → images, PDF → text,
// page numbers, watermark. Everything stays in the browser.
import { h, card, field, stack, note, actions, button, segmented, slider, toggle, input, select, progress, copy, toast, errMsg, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { mupdf, imagesToPdf, savePdf, stampPage, pageGeom, pageThumb, renderPage, textWidth, parseRanges, pdfString, isLatin1, mergePdfs, subsetPdf, pageScale, type ImagePage } from '../lib/pdf';
import { pdfInput, savePdfFile, stem, type LoadedPdf } from '../lib/pdfui';
import { zipFiles } from '../lib/zip';
import { imagePicker, resultList } from '../lib/imgtools';
import { loadImg, encodeImg } from '../lib/imgio';
import { readExif } from '../lib/exif';
import './pdf.css';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ------------------------------------------------------------------ Merge
export const merge: Mount = (root, ctx) => {
  const files: LoadedPdf[] = [];
  const list = h('ol', { class: 'pdf-list' });
  const info = h('div', { class: 'muted small' });
  const render = () => {
    list.replaceChildren(...files.map((f, i) => h('li', { class: 'pdf-row' },
      h('div', { class: 'pdf-row-name' }, h('strong', null, f.name), h('span', { class: 'muted small' }, ` · ${plural(f.pages, 'page')} · ${fmtBytes(f.bytes.length)}`)),
      h('div', { class: 'row' },
        button('', () => { [files[i - 1], files[i]] = [files[i], files[i - 1]]; render(); }, { icon: 'ArrowUp', small: true, variant: 'ghost', title: `Move ${f.name} up`, disabled: i === 0 }),
        button('', () => { [files[i + 1], files[i]] = [files[i], files[i + 1]]; render(); }, { icon: 'ArrowDown', small: true, variant: 'ghost', title: `Move ${f.name} down`, disabled: i === files.length - 1 }),
        button('', () => { files.splice(i, 1); render(); }, { icon: 'X', small: true, variant: 'ghost', title: `Remove ${f.name}` })))));
    const total = files.reduce((a, f) => a + f.pages, 0);
    info.textContent = files.length ? `${plural(files.length, 'file')}, ${plural(total, 'page')} in total` : '';
  };
  const inp = pdfInput({ multiple: true, label: 'Choose PDFs to merge', onLoad: (fs) => { files.push(...fs); render(); } });
  root.append(card(null, inp.el, list, info, note('Files are merged in this order. Protected PDFs are opened with their password; the result has no password.')),
    actions(button('Merge PDFs', async () => {
      if (files.length < 2) throw new Error('Choose at least two PDFs.');
      const { bytes, renamed } = await mergePdfs(files.map((f) => ({ bytes: f.bytes, password: f.password })));
      info.textContent = `Merged: ${plural(files.reduce((a, f) => a + f.pages, 0), 'page')}, ${fmtBytes(bytes.length)}`
        + (renamed.length ? ` · form fields renamed so that they stay separate: ${renamed.join(', ')}` : '');
      await savePdfFile(bytes, 'merged.pdf', ctx.isMobile);
    }, { variant: 'primary', icon: 'Merge' })));
};

// ------------------------------------------------------------------ Split
export const split: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, mode: 'ranges' | 'each' | 'chunks' = 'ranges', spec = '', n = 2;
  const info = h('div', { class: 'muted small' }), body = h('div', { class: 'stack', hidden: true });
  const rangeIn = input({ placeholder: 'e.g. 1-3, 5, 8-', onInput: (v) => (spec = v) });
  const rangeBox = field('Page ranges (each range becomes one PDF)', rangeIn, 'Use commas between ranges; “8-” means page 8 to the end.');
  // a box, not a slider of 1–50: a 300-page PDF in parts of 100 could not be asked for
  const chunkIn = input({ type: 'number', min: 1, step: 1, value: n, attrs: { 'aria-label': 'Pages per file' }, onInput: (v) => (n = Number(v)) });
  const chunkBox = field('Pages per file', chunkIn); chunkBox.hidden = true;
  const inp = pdfInput({ onLoad: ([x]) => { f = x; body.hidden = false; info.textContent = `${x.name}: ${plural(x.pages, 'page')}`; } });
  body.append(segmented([['ranges', 'Ranges'], ['each', 'Every page'], ['chunks', 'Every N pages']], mode, (v) => { mode = v; rangeBox.hidden = v !== 'ranges'; chunkBox.hidden = v !== 'chunks'; }), rangeBox, chunkBox);
  root.append(card(null, inp.el, info, body), actions(button('Split', async () => {
    if (!f) throw new Error('Choose a PDF first.');
    if (mode === 'chunks' && !(Number.isInteger(n) && n >= 1)) throw new Error('Pages per file: a whole number, 1 or more.');
    const groups = mode === 'each' ? Array.from({ length: f.pages }, (_, i) => [i])
      : mode === 'chunks' ? Array.from({ length: Math.ceil(f.pages / n) }, (_, k) => Array.from({ length: Math.min(n, f!.pages - k * n) }, (_, j) => k * n + j))
      : parseRanges(spec, f.pages);
    const s = stem(f.name), label = (g: number[]) => (g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`);
    const outs: Array<{ name: string; blob: Blob }> = [];
    for (const g of groups) outs.push({ name: `${s}-${label(g)}.pdf`, blob: new Blob([await subsetPdf(f.bytes, f.password, g) as BlobPart], { type: 'application/pdf' }) }); // one at a time: each part opens the file afresh
    info.textContent = `${plural(outs.length, 'file')} made`;
    if (outs.length === 1) return ctx.isMobile ? shareOrDownload(outs[0].blob, outs[0].name) : downloadBlob(outs[0].blob, outs[0].name);
    const zip = await zipFiles(outs);
    return ctx.isMobile ? shareOrDownload(zip, `${s}-split.zip`) : downloadBlob(zip, `${s}-split.zip`);
  }, { variant: 'primary', icon: 'Split' })));
};

// ------------------------------------------------------------------ Organize (reorder / rotate / delete)
export const organize: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null;
  type P = { src: number; rot: number; thumb: HTMLCanvasElement };
  let order: P[] = [], all: P[] = [];
  const grid = h('div', { class: 'pdf-grid' }), info = h('div', { class: 'muted small' });
  let dragFrom = -1;
  const render = () => {
    grid.replaceChildren(...order.map((p, i) => {
      p.thumb.style.transform = `rotate(${p.rot}deg)${p.rot % 180 ? ' scale(0.72)' : ''}`; // turned pages must still fit the 3:4 tile
      const tile = h('div', { class: 'pdf-tile', draggable: 'true', 'data-src': String(p.src + 1) },
        h('div', { class: 'pdf-tile-img' }, p.thumb),
        h('div', { class: 'pdf-tile-label' }, `${i + 1}`, p.src !== i ? h('span', { class: 'muted' }, ` (was ${p.src + 1})`) : null),
        h('div', { class: 'pdf-tile-tools' },
          button('', () => { order.splice(i - 1, 0, ...order.splice(i, 1)); render(); }, { icon: 'ArrowLeft', small: true, variant: 'ghost', title: `Move page ${i + 1} earlier`, disabled: i === 0 }),
          button('', () => { p.rot = (p.rot + 270) % 360; render(); }, { icon: 'RotateCcw', small: true, variant: 'ghost', title: `Rotate page ${i + 1} left` }),
          button('', () => { p.rot = (p.rot + 90) % 360; render(); }, { icon: 'RotateCw', small: true, variant: 'ghost', title: `Rotate page ${i + 1} right` }),
          button('', () => { order.splice(i, 1); render(); }, { icon: 'Trash2', small: true, variant: 'ghost', title: `Delete page ${i + 1}` }),
          button('', () => { order.splice(i + 1, 0, ...order.splice(i, 1)); render(); }, { icon: 'ArrowRight', small: true, variant: 'ghost', title: `Move page ${i + 1} later`, disabled: i === order.length - 1 })));
      tile.addEventListener('dragstart', () => (dragFrom = i));
      tile.addEventListener('dragover', (e) => e.preventDefault());
      tile.addEventListener('drop', (e) => { e.preventDefault(); if (dragFrom >= 0 && dragFrom !== i) { order.splice(i, 0, ...order.splice(dragFrom, 1)); render(); } dragFrom = -1; });
      return tile;
    }));
    info.textContent = f ? `${plural(order.length, 'page')}${f.pages - order.length ? ` (${f.pages - order.length} deleted)` : ''}` : '';
  };
  let loadSeq = 0;
  const inp = pdfInput({ onLoad: async ([x]) => {
    // every tile at once (a blank of the page's shape), the pictures drawn into them one by one — a long PDF showed
    // nothing until all were drawn; and a PDF opened meanwhile must not get the old one's pages
    const my = ++loadSeq;
    f = x;
    order = Array.from({ length: x.pages }, (_, i) => {
      const g = pageGeom(x.doc.loadPage(i)), c = document.createElement('canvas'), s = 160 / Math.max(g.W, g.H);
      c.width = Math.max(1, Math.round(g.W * s)); c.height = Math.max(1, Math.round(g.H * s));
      return { src: i, rot: 0, thumb: c };
    });
    all = order.slice(); render();
    for (const p of all) {
      if (my !== loadSeq) return;
      const t = await pageThumb(x.doc, p.src, 160);
      if (my !== loadSeq) return;
      p.thumb.width = t.width; p.thumb.height = t.height; p.thumb.getContext('2d')!.drawImage(t, 0, 0);
      if (p.src % 20 === 19 || p.src === all.length - 1) await new Promise((r) => setTimeout(r)); // let the page breathe
    }
  } });
  const turnAll = (by: number) => { if (!order.length) throw new Error('Choose a PDF first.'); for (const p of order) p.rot = (p.rot + by + 360) % 360; render(); };
  root.append(card(null, inp.el, info), card(null, grid,
    h('div', { class: 'row' }, button('Rotate all left', () => turnAll(-90), { small: true, variant: 'ghost', icon: 'RotateCcw' }), button('Rotate all right', () => turnAll(90), { small: true, variant: 'ghost', icon: 'RotateCw' })),
    note(ctx.isMobile ? 'Use the arrows to move pages.' : 'Drag pages to reorder them, or use the arrows.')),
    actions(button('Save PDF', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      if (!order.length) throw new Error('All pages were deleted.');
      await savePdfFile(await subsetPdf(f.bytes, f.password, order.map((p) => p.src), order.map((p) => p.rot)), `${stem(f.name)}-organized.pdf`, ctx.isMobile);
    }, { variant: 'primary', icon: 'Download' }), button('Reset', () => { order = all.map((p) => Object.assign(p, { rot: 0 })); render(); }, { variant: 'ghost', icon: 'Undo2' })));
};

// ------------------------------------------------------------------ Images → PDF
export const img2pdf: Mount = (root, ctx) => {
  const items: Array<{ name: string; page: ImagePage; url: string }> = [];
  let size = 'a4', margin = 10;
  const list = h('div', { class: 'pdf-grid' }), info = h('div', { class: 'muted small' }), busy = progress();
  const render = () => {
    list.replaceChildren(...items.map((it, i) => h('div', { class: 'pdf-tile' },
      h('div', { class: 'pdf-tile-img' }, h('img', { src: it.url, alt: it.name })),
      h('div', { class: 'pdf-tile-label' }, `${i + 1}. ${it.name}`),
      h('div', { class: 'pdf-tile-tools' },
        button('', () => { items.splice(i - 1, 0, ...items.splice(i, 1)); render(); }, { icon: 'ArrowLeft', small: true, variant: 'ghost', title: `Move ${it.name} earlier`, disabled: i === 0 }),
        button('', () => { URL.revokeObjectURL(it.url); items.splice(i, 1); render(); }, { icon: 'Trash2', small: true, variant: 'ghost', title: `Remove ${it.name}` }),
        button('', () => { items.splice(i + 1, 0, ...items.splice(i, 1)); render(); }, { icon: 'ArrowRight', small: true, variant: 'ghost', title: `Move ${it.name} later`, disabled: i === items.length - 1 })))));
    info.textContent = items.length ? plural(items.length, 'image') : '';
    sortBtn.hidden = items.length < 2;
  };
  // a file dialog hands files over in its own order (Windows: the last one clicked first): page-1 … page-10 in order
  const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sortBtn = button('Sort by file name', () => { items.sort((a, b) => byName.compare(a.name, b.name)); render(); }, { small: true, variant: 'ghost', icon: 'ArrowDownAZ' });
  sortBtn.hidden = true;
  const add = async (fs: File[]) => {
    let k = 0;
    for (const file of fs) {
      busy.set(k++ / fs.length, `Reading ${file.name}…`);
      try {
        const img = await loadImg(file);
        // JPEG (upright) and PNG are embedded unchanged; anything else (HEIC, WebP, rotated JPEG) becomes a JPEG
        const t = file.type || '', upright = t === 'image/jpeg' ? ((await readExif(file)).orientation || 1) === 1 : t === 'image/png';
        const bytes = upright ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(await (await encodeImg(img, 'jpeg', 90)).arrayBuffer());
        items.push({ name: file.name, page: { bytes, width: img.width, height: img.height }, url: URL.createObjectURL(new Blob([bytes as BlobPart])) });
      } catch (e) { toast(`${file.name}: ${errMsg(e)}`, 'err'); }
    }
    busy.done(); render();
  };
  const marginBox = slider({ label: 'Margin', min: 0, max: 30, value: margin, unit: ' mm', onInput: (v) => (margin = v) });
  root.append(
    card(null, h('div', { class: 'stack' }, imagePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: 'Choose images', hint: 'JPG, PNG, HEIC, WebP… (add more any time)', onFiles: add }), busy, info, sortBtn), list),
    card('Page', stack(
      segmented([['a4', 'A4'], ['letter', 'Letter'], ['fit', 'Fit to image']], size, (v) => { size = v; marginBox.hidden = v === 'fit'; }),
      marginBox, note('Each image gets its own page, turned to landscape when the image is wide. JPEG and PNG files are embedded without re-compression. "Fit to image": a scan keeps the paper size its file states (300 dpi …); other images are laid out at 150 dpi.'))),
    actions(button('Make PDF', async () => {
      if (!items.length) throw new Error('Add some images first.');
      const bytes = await imagesToPdf(items.map((i) => i.page), { size, margin: (margin * 72) / 25.4, dpi: 150, ownDpi: true });
      info.textContent = `PDF: ${plural(items.length, 'page')}, ${fmtBytes(bytes.length)}`;
      await savePdfFile(bytes, 'images.pdf', ctx.isMobile);
    }, { variant: 'primary', icon: 'FileInput' })));
  return () => { for (const it of items) URL.revokeObjectURL(it.url); }; // the previews' object URLs
};

// ------------------------------------------------------------------ PDF → images
export const pdf2img: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, dpi = 150, fmt: 'jpeg' | 'png' = 'jpeg', spec = '', seq = 0, alive = true;
  const info = h('div', { class: 'muted small' }), prog = progress();
  const results = resultList({ zipName: () => `${f ? stem(f.name) : 'pages'}-images.zip`, isMobile: ctx.isMobile });
  const inp = pdfInput({ onLoad: ([x]) => { seq++; prog.done(); f = x; results.clear(); info.textContent = `${x.name}: ${plural(x.pages, 'page')}`; } });
  root.append(card(null, inp.el, info),
    card('Options', stack(
      field('Resolution', segmented([['72', '72 dpi (screen)'], ['150', '150 dpi'], ['300', '300 dpi (print)']], String(dpi), (v) => (dpi = +v))),
      field('Format', segmented([['jpeg', 'JPG'], ['png', 'PNG']], fmt, (v) => (fmt = v))),
      field('Pages', input({ placeholder: 'All pages (or e.g. 1-3, 7)', onInput: (v) => (spec = v) })))),
    actions(button('Convert', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      results.clear();
      // the file of this run: a PDF opened meanwhile must not have its pages saved under this one's names
      const my = ++seq, doc = f.doc, count = f.pages, s = stem(f.name), d = dpi, ext = fmt === 'png' ? 'png' : 'jpg';
      const pages = spec.trim() ? parseRanges(spec, count).flat() : Array.from({ length: count }, (_, i) => i);
      const pad = String(count).length, capped: number[] = []; // p01 … p12: files sort in page order
      for (const [k, i] of pages.entries()) {
        if (my !== seq || !alive) return;
        prog.set(k / pages.length, `Page ${i + 1}…`);
        const g = pageGeom(doc.loadPage(i)), sc = pageScale(g.W, g.H, d);
        if (sc.capped) capped.push(i + 1);
        const pix = await renderPage(doc, i, sc.scale, false);
        const bytes = ext === 'png' ? pix.asPNG() : pix.asJPEG(88);
        results.add(`${s}-p${String(i + 1).padStart(pad, '0')}.${ext}`, new Blob([bytes.slice() as BlobPart], { type: ext === 'png' ? 'image/png' : 'image/jpeg' }), `${pix.getWidth()}×${pix.getHeight()}`);
        pix.destroy?.();
        await new Promise((r) => setTimeout(r));
      }
      prog.done();
      if (capped.length) info.textContent = `${plural(capped.length, 'page')} (${capped.slice(0, 8).join(', ')}${capped.length > 8 ? ' …' : ''}) too large for ${d} dpi: drawn smaller, at most 16,384 px a side and 100 megapixels.`;
    }, { variant: 'primary', icon: 'FileOutput' })),
    card(null, results.el));
  return () => { alive = false; seq++; results.clear(); }; // the pages' pictures (blob URLs) would stay in memory until the page reloads
};

// ------------------------------------------------------------------ PDF → text
export const pdf2text: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, layout = false, marks = true, seq = 0, alive = true;
  const out = h('textarea', { class: 'input textarea', rows: 16, 'aria-label': 'Extracted text', spellcheck: 'false' }) as HTMLTextAreaElement;
  const info = h('div', { class: 'muted small', 'aria-live': 'polite' }), prog = progress();
  // page by page, giving the page a breath (a long PDF froze the tab without a word); the newest PDF or option wins
  const run = async () => {
    if (!f) return;
    const my = ++seq, file = f, parts: string[] = []; let empty = 0, withFields = 0;
    out.value = ''; info.replaceChildren();
    for (let i = 0; i < file.pages; i++) {
      if (my !== seq || !alive) return;
      if (i % 10 === 0) { prog.set(i / file.pages, `Page ${i + 1} of ${file.pages}…`); await new Promise((r) => setTimeout(r)); if (my !== seq || !alive) return; }
      const page = file.doc.loadPage(i), st = page.toStructuredText(layout ? 'preserve-whitespace' : 'dehyphenate');
      let t = st.asText().replace(/\s+$/g, ''); st.destroy?.();
      // what was typed into form fields is not page text (MuPDF leaves widgets out): listed under the page
      const filled = ((page as any).getWidgets?.() || []).map((w: any) => {
        const v = String(w.getValue() ?? ''), kind = w.getFieldType();
        if (!v || v === 'Off' || kind === 'signature' || kind === 'button') return '';
        return `${w.getLabel() || w.getName()}: ${kind === 'checkbox' ? 'ticked' : v}`;
      }).filter((x: string, k: number, a: string[]) => x && a.indexOf(x) === k);
      if (filled.length) { withFields++; t += `${t ? '\n\n' : ''}Form fields:\n${filled.join('\n')}`; }
      if (!t.trim()) empty++;
      parts.push(marks ? `--- Page ${i + 1} ---\n${t}` : t);
    }
    prog.done();
    out.value = parts.join('\n\n');
    info.replaceChildren(`${plural(file.pages, 'page')} · ${out.value.length.toLocaleString()} characters${withFields ? ` · form fields listed under ${plural(withFields, 'page')}` : ''}`,
      empty === file.pages ? h('div', { class: 'note note-warn' }, 'No text layer: this looks like a scanned PDF. Use PDF → Images, then the OCR tool.') : '');
  };
  const inp = pdfInput({ onLoad: ([x]) => { f = x; run(); } });
  const text = () => { if (!out.value.trim()) throw new Error(f ? 'There is no text to copy — this PDF has no text layer.' : 'Choose a PDF first.'); return out.value; };
  root.append(card(null, inp.el),
    card('Options', stack(
      toggle('Keep the spacing and the hyphens at line ends as in the PDF', layout, (v) => { layout = v; run(); }),
      toggle('Mark page breaks', marks, (v) => { marks = v; run(); }))),
    card('Text', prog, out, info, h('div', { class: 'row' },
      button('Copy', () => copy(text()), { small: true, icon: 'Copy' }),
      button('Download .txt', () => (ctx.isMobile ? shareOrDownload : downloadBlob)(new Blob([text()], { type: 'text/plain;charset=utf-8' }), `${f ? stem(f.name) : 'text'}.txt`), { small: true, icon: 'Download' }))));
  return () => { alive = false; seq++; };
};

// ------------------------------------------------------------------ Page numbers
type Pos = 'bc' | 'br' | 'bl' | 'tc' | 'tr' | 'tl';
/** A run over the pages of one file: it keeps that file (a PDF chosen meanwhile ends it without a result — it was
 *  saved under the new file's name), reports progress every ten pages and gives the page a breath, and ends with the
 *  tab (no download after leaving). Returns false when the run was ended. */
function pageRun(prog: ReturnType<typeof progress>) {
  let seq = 0, alive = true;
  return {
    start() { const my = ++seq; return { live: () => my === seq && alive, async step(i: number, n: number) { if (i % 10 === 0) { prog.set(i / n, `Page ${i + 1} of ${n}…`); await new Promise((r) => setTimeout(r)); } return my === seq && alive; } }; },
    newFile() { seq++; prog.done(); },
    leave() { alive = false; seq++; },
  };
}

export const pagenum: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, pos: Pos = 'bc', format = 'n', start = 1, skipFirst = false, size = 11, marginMm = 10;
  const info = h('div', { class: 'muted small' }), prog = progress(), runs = pageRun(prog);
  const inp = pdfInput({ onLoad: ([x]) => { runs.newFile(); f = x; info.textContent = `${x.name}: ${plural(x.pages, 'page')}`; } });
  const FORMATS: Array<[string, string]> = [['n', '1, 2, 3'], ['page', 'Page 1'], ['pageof', 'Page 1 of 9'], ['slash', '1 / 9'], ['dash', '– 1 –']];
  const label = (n: number, total: number) => ({ n: `${n}`, page: `Page ${n}`, pageof: `Page ${n} of ${total}`, slash: `${n} / ${total}`, dash: `– ${n} –` } as Record<string, string>)[format];
  root.append(card(null, inp.el, info, prog),
    card('Options', stack(
      field('Position', select<Pos>([['bc', 'Bottom centre'], ['br', 'Bottom right'], ['bl', 'Bottom left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['tl', 'Top left']], pos, (v) => (pos = v))),
      field('Style', select(FORMATS, format, (v) => (format = v))),
      field('First number', input({ type: 'number', value: start, min: 0, onInput: (v) => (start = Math.max(0, Math.round(+v || 0))) })),
      toggle('Skip the first page (cover)', skipFirst, (v) => (skipFirst = v)),
      slider({ label: 'Text size', min: 7, max: 24, value: size, unit: ' pt', onInput: (v) => (size = v) }),
      slider({ label: 'Distance from the edge', min: 4, max: 30, value: marginMm, unit: ' mm', onInput: (v) => (marginMm = v) }))),
    actions(button('Add page numbers', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      const file = f, run = runs.start();
      const m = await mupdf(), doc = m.Document.openDocument(file.bytes, 'application/pdf').asPDF()!;
      if (file.password !== undefined) doc.authenticatePassword(file.password);
      const numbered = Array.from({ length: file.pages }, (_, i) => i).filter((i) => !(skipFirst && i === 0));
      const total = numbered.length + start - 1, mg = (marginMm * 72) / 25.4;
      for (const [k, i] of numbered.entries()) {
        if (!(await run.step(k, numbered.length))) return;
        const text = label(start + k, total), w = await textWidth(text, size);
        await stampPage(doc, i, (W, H) => {
          const x = pos[1] === 'c' ? (W - w) / 2 : pos[1] === 'r' ? W - mg - w : mg;
          const y = pos[0] === 'b' ? mg : H - mg - size * 0.75;
          return `BT /STF ${size} Tf 0 g ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(text)} Tj ET`;
        }, { font: true });
      }
      prog.done();
      if (!run.live()) return;
      await savePdfFile(savePdf(doc, file.password !== undefined ? 'encrypt=none' : ''), `${stem(file.name)}-numbered.pdf`, ctx.isMobile);
    }, { variant: 'primary', icon: 'ListOrdered' })));
  return () => runs.leave();
};

// ------------------------------------------------------------------ Watermark
export const watermark: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, text = 'CONFIDENTIAL', opacity = 25, colour = 'grey', angle = 'diag', tile = false, scale = 100;
  const info = h('div', { class: 'muted small' }), prog = progress(), runs = pageRun(prog);
  const inp = pdfInput({ onLoad: ([x]) => { runs.newFile(); f = x; info.textContent = `${x.name}: ${plural(x.pages, 'page')}`; } });
  const RGB: Record<string, [number, number, number]> = { grey: [0.45, 0.45, 0.45], red: [0.8, 0.1, 0.1], blue: [0.1, 0.25, 0.75], black: [0, 0, 0] };
  root.append(card(null, inp.el, info, prog),
    card('Watermark', stack(
      field('Text', input({ value: text, onInput: (v) => (text = v) })),
      field('Colour', segmented([['grey', 'Grey'], ['red', 'Red'], ['blue', 'Blue'], ['black', 'Black']], colour, (v) => (colour = v))),
      field('Direction', segmented([['diag', 'Diagonal'], ['flat', 'Horizontal']], angle, (v) => (angle = v))),
      slider({ label: 'Opacity', min: 5, max: 80, value: opacity, unit: ' %', onInput: (v) => (opacity = v) }),
      slider({ label: 'Size', min: 30, max: 200, value: scale, unit: ' %', onInput: (v) => (scale = v) }),
      toggle('Repeat across the page (tiled)', tile, (v) => (tile = v)))),
    actions(button('Add watermark', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      if (!text.trim()) throw new Error('Type the watermark text.');
      const file = f, run = runs.start();
      const m = await mupdf(), doc = m.Document.openDocument(file.bytes, 'application/pdf').asPDF()!;
      if (file.password !== undefined) doc.authenticatePassword(file.password);
      const [r, g, b] = RGB[colour], a = angle === 'diag' ? Math.PI / 4 : 0, c = Math.cos(a), s = Math.sin(a);
      // Latin text is drawn as real (vector) text in Helvetica; other scripts as a transparent PNG made by the browser
      const vector = isLatin1(text);
      let img: any = null, imgAspect = 1;
      if (!vector) {
        const cv = new OffscreenCanvas(10, 10), cx = cv.getContext('2d')!; const fs = 160;
        cx.font = `bold ${fs}px system-ui, sans-serif`; const tw = Math.ceil(cx.measureText(text).width) + 40;
        const big = new OffscreenCanvas(tw, Math.round(fs * 1.4)), bx = big.getContext('2d')!;
        bx.font = cx.font; bx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`; bx.textBaseline = 'middle'; bx.fillText(text, 20, big.height / 2);
        img = doc.addImage(new m.Image(new Uint8Array(await (await big.convertToBlob({ type: 'image/png' })).arrayBuffer())));
        imgAspect = big.width / big.height;
      }
      for (let i = 0; i < file.pages; i++) {
        if (!(await run.step(i, file.pages))) return;
        const geo = pageGeom(doc.loadPage(i) as any), base = Math.min(geo.W, geo.H);
        const size = (tile ? base / 18 : base / Math.max(6, text.length * 0.62)) * (scale / 100);
        const w = vector ? await textWidth(text, size) : size * 1.4 * imgAspect;
        await stampPage(doc, i, (W, H) => {
          const one = (x: number, y: number) => vector
            ? `q ${c.toFixed(4)} ${s.toFixed(4)} ${(-s).toFixed(4)} ${c.toFixed(4)} ${x.toFixed(2)} ${y.toFixed(2)} cm BT /STF ${size.toFixed(2)} Tf ${r} ${g} ${b} rg ${(-w / 2).toFixed(2)} ${(-size * 0.35).toFixed(2)} Td ${pdfString(text)} Tj ET Q`
            : `q ${c.toFixed(4)} ${s.toFixed(4)} ${(-s).toFixed(4)} ${c.toFixed(4)} ${x.toFixed(2)} ${y.toFixed(2)} cm ${w.toFixed(2)} 0 0 ${(size * 1.4).toFixed(2)} ${(-w / 2).toFixed(2)} ${(-size * 0.7).toFixed(2)} cm /STIM Do Q`;
          if (!tile) return one(W / 2, H / 2);
          const ops: string[] = [], dx = w + size * 2, dy = size * 3.5;
          for (let y = dy / 2, row = 0; y < H + dy; y += dy, row++) for (let x = (row % 2 ? dx / 2 : 0); x < W + dx; x += dx) ops.push(one(x, y));
          return ops.join('\n');
        }, { font: vector, opacity: opacity / 100, images: img ? { STIM: img } : undefined });
      }
      prog.done();
      if (!run.live()) return;
      await savePdfFile(savePdf(doc, file.password !== undefined ? 'encrypt=none' : ''), `${stem(file.name)}-watermarked.pdf`, ctx.isMobile);
    }, { variant: 'primary', icon: 'Droplet' })));
  return () => runs.leave();
};

