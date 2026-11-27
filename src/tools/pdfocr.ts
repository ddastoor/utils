// Make PDF Searchable (potentials #3): a scanned PDF's pages read by the OCR tab's reading path (Tesseract, the clean-up,
// PaddleOCR for soft pages) and their words written on them as invisible text — the page looks as it did, and its words can
// be searched, selected and copied (OCRmyPDF's idea). Pages that have text already are left as they are; a page lying
// sideways or upside down is turned upright (or its words written along its lines). PC + phones.
import { h, card, field, stack, note, actions, button, toggle, segmented, progress, clear, toast, errMsg, downloadBlob, shareOrDownload, fmtBytes, copy, type Mount } from '../ui';
import { pdfInput, stem, type LoadedPdf } from '../lib/pdfui';
import { mupdf, pageGeom, stampPage, signatureCount } from '../lib/pdf';
import { pageKind } from '../lib/redact';
import { textLayer, hasText } from '../lib/searchable';
import type { OcrLang, OcrResult } from '../lib/ocr';
import type { Img } from '../wasm/imgproc';
import { plural } from '../lib/dates';
import './pdfocr.css';

// the choices, kept while the page is open
let lang: OcrLang = 'eng', turnUp = true;

interface Row { page: number; what: 'read' | 'text' | 'stopped'; words: number; conf: number; turned: number; poor: boolean; engine?: string }
const rgba = (pix: any): Img => {
  const rgb = pix.getPixels(), w = pix.getWidth(), hh = pix.getHeight(), n = pix.getNumberOfComponents(), out = new Uint8ClampedArray(w * hh * 4);
  for (let a = 0, b = 0; b < out.length; a += n, b += 4) { out[b] = rgb[a]; out[b + 1] = rgb[a + 1]; out[b + 2] = rgb[a + 2]; out[b + 3] = 255; }
  return { data: out, width: w, height: hh };
};
/** the turn that set a page upright (quarter turns clockwise) */
const turnName = (t: number) => (t === 2 ? 'turned over' : t === 1 ? 'a quarter turn to the right' : 'a quarter turn to the left');

export const mount: Mount = (root, ctx) => {
  let file: LoadedPdf | null = null, alive = true, run = 0;
  const info = h('div', { class: 'muted small pocr-info', 'aria-live': 'polite' });
  const prog = progress();
  const result = h('div', { class: 'stack' });
  const inp = pdfInput({ onLoad: ([x]) => load(x) });

  async function load(x: LoadedPdf) {
    file = x; run++; clear(result); prog.done();
    const m: any = await mupdf();
    const doc = m.Document.openDocument(x.bytes, 'application/pdf');
    if (x.password !== undefined) doc.authenticatePassword(x.password);
    let withText = 0;
    for (let i = 0; i < doc.countPages(); i++) if (hasText(pageKind(doc.loadPage(i)))) withText++;
    const n = doc.countPages();
    info.replaceChildren(`${x.name}: ${plural(n, 'page')}`, withText === n ? ' — every page has text already: there is nothing to read' : withText ? ` — ${plural(n - withText, 'page')} to read, ${withText} with text already (left as ${withText === 1 ? 'it is' : 'they are'})` : ' — none has text: every page will be read');
    goBtn.disabled = withText === n;
  }

  async function make() {
    if (!file) { toast('Choose a PDF first.', 'info'); return; }
    const f = file, my = ++run, live = () => alive && my === run;
    clear(result); goBtn.hidden = true; stopBtn.hidden = false;
    const t0 = performance.now();
    try {
      const m: any = await mupdf();
      const doc = m.Document.openDocument(f.bytes, 'application/pdf').asPDF();
      if (f.password !== undefined) doc.authenticatePassword(f.password);
      const helv = new m.Font('Helvetica');
      const width = (x: string) => { let w = 0; for (const ch of x) w += helv.advanceGlyph(helv.encodeCharacter(ch.codePointAt(0)!), 0); return w; };
      prog.set(null, 'Loading the text engine…');
      const [{ readPage, readsPoorly, secondWords }, { uprightByReading }, { recognize }] = await Promise.all([import('../lib/readpage'), import('../lib/upright'), import('../lib/ocr')]);
      const glance = (im: Img) => recognize(new ImageData(im.data as Uint8ClampedArray<ArrayBuffer>, im.width, im.height), lang, undefined, 'block');
      const rows: Row[] = [], texts: string[] = [];
      const n = doc.countPages();
      for (let i = 0; i < n; i++) {
        if (!live()) { if (alive) rows.push({ page: i, what: 'stopped', words: 0, conf: 0, turned: 0, poor: false }); break; }
        const of = `Page ${i + 1} of ${n}`;
        let page = doc.loadPage(i);
        if (hasText(pageKind(page))) { rows.push({ page: i, what: 'text', words: 0, conf: 0, turned: 0, poor: false }); continue; }
        // which way up: a small drawing of the page glanced at (nothing read when the letters say upright)
        prog.set(i / n, `${of}: which way up…`);
        const g0 = pageGeom(page), k0 = 1000 / Math.max(g0.W, g0.H);
        const small = rgba(page.toPixmap(m.Matrix.scale(k0, k0), m.ColorSpace.DeviceRGB, false, true));
        const up = await uprightByReading(small, glance).catch(() => ({ turns: 0 }));
        if (!live()) continue;
        let t = up.turns, turned = 0;
        if (t && turnUp) { page.getObject().put('Rotate', (g0.rot + 90 * t) % 360); turned = t; t = 0; page = doc.loadPage(i); }
        // the page drawn at up to 300 dpi (at most 3,000 px: the reading path's size) and read — cleaned up, never straightened
        const g = pageGeom(page), sc = Math.min(300 / 72, 3000 / Math.max(g.W, g.H));
        const R = rgba(page.toPixmap(m.Matrix.scale(sc, sc), m.ColorSpace.DeviceRGB, false, true));
        const reading = await readPage(R, {
          lang, clean: true, straighten: false, auto: false, turns: t, stale: () => !live(),
          onProgress: (p, st) => { if (live()) prog.set((i + (/recogn/i.test(st) ? p : 0)) / n, `${of}: ${/recogn/i.test(st) ? `reading… ${Math.round(p * 100)} %` : 'loading the text engine…'}`); },
          onSecond: (q) => { if (live()) { const w = secondWords(q); prog.set(i / n, `${of}: ${w.text}`); } },
        });
        if (!reading || !live()) continue;
        // the words' boxes are on the picture read: the page drawn and turned t quarter turns (made smaller only past 3,000 px)
        const k = (t % 2 ? R.height : R.width) / reading.img.width;
        const r: OcrResult = k === 1 ? reading.r : { ...reading.r, words: reading.r.words.map((w) => ({ ...w, x0: w.x0 * k, y0: w.y0 * k, x1: w.x1 * k, y1: w.y1 * k })) };
        const lay = textLayer(r, { t, Wr: R.width, Hr: R.height, s: sc, H: g.H, width });
        if (lay.words) await stampPage(doc, i, () => lay.ops, { font: true });
        rows.push({ page: i, what: 'read', words: lay.words, conf: Math.round(r.confidence), turned, poor: readsPoorly(reading), engine: reading.engine });
        texts.push(`— Page ${i + 1} —\n${r.text}`);
      }
      if (!alive) return;
      prog.set(1, 'Saving…');
      const sig = signatureCount(doc);
      let kept = f.password !== undefined, bytes: Uint8Array;
      try { bytes = doc.saveToBuffer(`compress,garbage${kept ? ',encrypt=keep' : ''}`).asUint8Array().slice(); }
      catch { kept = false; bytes = doc.saveToBuffer('compress,garbage,encrypt=none').asUint8Array().slice(); }
      // read again: the words written are words of the new file's text
      const back = m.Document.openDocument(bytes, 'application/pdf');
      if (back.needsPassword() && f.password !== undefined) back.authenticatePassword(f.password);
      let found = 0, written = 0;
      for (const row of rows.filter((x) => x.what === 'read')) { written += row.words; found += back.loadPage(row.page).toStructuredText().asText().split(/\s+/).filter(Boolean).length; }
      prog.done();
      if (!live() && !rows.some((x) => x.what === 'stopped')) return;
      const name = `${stem(f.name)}-searchable.pdf`, blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const read = rows.filter((x) => x.what === 'read'), had = rows.filter((x) => x.what === 'text'), poor = read.filter((x) => x.poor), turnedRows = read.filter((x) => x.turned), stopped = rows.some((x) => x.what === 'stopped');
      const words = read.reduce((a, x) => a + x.words, 0);
      if (!ctx.isMobile) downloadBlob(blob, name);
      const all = texts.join('\n\n');
      clear(result).append(card('Searchable',
        note(`${name}: ${plural(read.length, 'page')} read, ${plural(words, 'word')} added${had.length ? ` · ${plural(had.length, 'page')} had text already (left as ${had.length === 1 ? 'it was' : 'they were'})` : ''}${turnedRows.length ? ` · turned upright: page ${turnedRows.map((x) => `${x.page + 1} (${turnName(x.turned)})`).join(', ')}` : ''}${stopped ? ' · stopped: the pages after were not read' : ''} · ${fmtBytes(bytes.length)} · ${((performance.now() - t0) / 1000).toFixed(0)} s`, stopped ? 'warn' : 'ok'),
        written ? note(`Read again: ${found >= written * 0.98 ? 'every word written is in the new file’s text' : `${found} of ${written} words found in the new file’s text`}.`, found >= written * 0.98 ? 'ok' : 'warn') : null,
        poor.length ? note(`Page ${poor.map((x) => x.page + 1).join(', ')} read poorly — a soft or small scan: searching ${poor.length === 1 ? 'it' : 'them'} may miss words. A scan at 300 dpi reads best.`, 'warn') : null,
        f.password !== undefined ? h('p', { class: 'muted small' }, kept ? 'The PDF keeps its password.' : 'The PDF’s password could not be kept: the searchable copy has none.') : null,
        sig ? note('The PDF was digitally signed: the searchable copy no longer proves the signature (its pages changed).', 'warn') : null,
        h('div', { class: 'row' },
          button(ctx.isMobile ? 'Share or save' : 'Download again', () => (ctx.isMobile ? shareOrDownload(blob, name) : downloadBlob(blob, name)), { variant: ctx.isMobile ? 'primary' : 'ghost', icon: 'Download' }),
          all ? button('Copy the text read', () => copy(all), { variant: 'ghost', icon: 'Copy' }) : null),
        h('details', null, h('summary', null, 'Pages'), h('table', { class: 'pocr-table' },
          h('thead', null, h('tr', null, h('th', null, 'Page'), h('th', null, 'Done'))),
          h('tbody', null, ...rows.map((x) => h('tr', null, h('td', null, String(x.page + 1)),
            h('td', null, x.what === 'text' ? 'had text already' : x.what === 'stopped' ? 'stopped before it' : `${plural(x.words, 'word')} · confidence ${x.conf}${x.engine === 'paddle' ? ' · soft: PaddleOCR read it' : ''}${x.turned ? ` · turned upright` : ''}${x.poor ? ' · reads poorly' : ''}`)))))),
        all ? h('details', null, h('summary', null, 'The text read'), h('pre', { class: 'pocr-text' }, all.length > 200000 ? `${all.slice(0, 200000)}\n…` : all)) : null));
    } catch (e) { prog.done(); if (alive) toast(`Could not make it searchable: ${errMsg(e)}`, 'err'); }
    finally { goBtn.hidden = false; stopBtn.hidden = true; }
  }

  const goBtn = button('Make searchable', () => make(), { variant: 'primary', icon: 'ScanSearch', disabled: true });
  const stopBtn = button('Stop', () => { run++; }, { icon: 'Square' }); stopBtn.hidden = true;
  root.append(stack(
    card(null, inp.el, info, prog),
    card('Reading',
      field('Language', segmented<OcrLang>([['eng', 'English'], ['fra', 'Français'], ['spa', 'Español'], ['deu', 'Deutsch'], ['eng+fra+spa+deu', 'Mixed / not sure']], lang, (v) => { lang = v; })),
      toggle('Turn pages that lie sideways or upside down upright', turnUp, (v) => { turnUp = v; }),
      h('p', { class: 'muted small' }, 'Each scanned page is read by the OCR and its words written on it as invisible text, where the scan shows them: the PDF looks as it did, and you can search it, select and copy its words. Pages that have text already are left as they are.')),
    result,
    note('Everything happens on this device: the PDF never leaves it.', 'info'),
    actions(goBtn, stopBtn)));
  return () => { alive = false; run++; };
};
