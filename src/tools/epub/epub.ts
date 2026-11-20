// PDF → EPUB (PC): Kindle-friendly EPUB 3 from PDFs, page by page, column by column (src/lib/pdf2epub.ts).
// A conversion keeps the PDF it started with; a PDF chosen meanwhile ends it, and so does leaving the tab.
import { h, card, field, stack, note, actions, button, segmented, toggle, input, progress, clear, downloadBlob, fmtBytes, type Mount } from '../../ui';
import { parseRanges } from '../../lib/pdf';
import { pdfInput, stem, type LoadedPdf } from '../../lib/pdfui';
import { plural } from '../../lib/dates';
import { pdfToEpub, DEVICES, Stopped, type EpubOptions } from '../../lib/pdf2epub';
import { unzipSync, strFromU8 } from 'fflate';

export const mount: Mount = (root) => {
  let f: LoadedPdf | null = null, spec = '', seq = 0, live = true, urls: string[] = [];
  const o: EpubOptions = { mode: 'reflow', width: DEVICES.paperwhite, grey: true, removeHeaders: true, labels: true };
  const titleIn = input({ placeholder: 'Title (from the PDF if empty)' }) as HTMLInputElement;
  const authorIn = input({ placeholder: 'Author (optional)' }) as HTMLInputElement;
  const info = h('div', { class: 'muted small' }), prog = progress(), result = h('div', { class: 'stack' });
  const forget = () => { for (const u of urls) URL.revokeObjectURL(u); urls = []; clear(result); };
  const inp = pdfInput({ onLoad: ([x]) => {
    seq++; prog.done(); forget();                     // a conversion of the previous PDF ends here
    f = x;
    const t = x.doc.getMetaData('info:Title') || '', a = x.doc.getMetaData('info:Author') || '';
    titleIn.value = t.trim() || stem(x.name); authorIn.value = a.trim();
    info.textContent = x.pages ? `${x.name}: ${plural(x.pages, 'page')}` : `${x.name} has no pages.`;
  } });
  root.append(card(null, inp.el, info),
    card('Options', stack(
      field('Layout', segmented([['reflow', 'Reflow text (recommended)'], ['columns', 'Columns as pictures']], o.mode, (v) => (o.mode = v)), 'Reflow gives real text that you can resize; pictures keep maths and tables exactly as printed.'),
      field('Kindle', segmented([[String(DEVICES.paperwhite), 'Paperwhite (1236 px)'], [String(DEVICES.scribe), 'Scribe (1860 px)']], String(o.width), (v) => (o.width = +v))),
      toggle('Greyscale pictures (smaller, look the same on e-ink)', o.grey, (v) => (o.grey = v)),
      toggle('Remove running headers, footers and page numbers', o.removeHeaders, (v) => (o.removeHeaders = v)),
      toggle('Label columns (“Page N · Column K”)', o.labels, (v) => (o.labels = v)),
      h('div', { class: 'grid2' }, field('Title', titleIn), field('Author', authorIn)),
      field('Pages', input({ placeholder: 'All pages (or e.g. 1-20)', onInput: (v) => (spec = v) })))),
    actions(button('Make EPUB', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      const file = f, run = ++seq;
      forget();
      const pages = spec.trim() ? [...new Set(parseRanges(spec, file.pages).flat())] : undefined;
      const t0 = performance.now();
      let made;
      try {
        made = await pdfToEpub(file.doc, { ...o, pages, title: titleIn.value.trim() || stem(file.name), author: authorIn.value.trim(), alive: () => live && run === seq },
          (d, n, phase) => prog.set(phase === 'read' ? (0.1 * d) / n : 0.1 + (0.9 * d) / n, phase === 'read' ? `Reading the text: page ${Math.min(d + 1, n)} of ${n}…` : `Page ${Math.min(d + 1, n)} of ${n}…`));
      } catch (e) {
        if (e instanceof Stopped) return;              // a newer PDF, or the tab was left: nothing to show
        prog.done(); throw e;
      }
      prog.done();
      const { epub, report } = made;
      const name = `${stem(file.name)}.epub`, cols = report.filter((r) => r.columns > 1).length, figs = report.reduce((a, r) => a + r.figures, 0), pics = report.filter((r) => r.how === 'image').length;
      // a readable preview of the first pages in reading order (our own generated, escaped XHTML; images as blob URLs)
      const z = unzipSync(epub);
      const pv = h('div', { class: 'epub-preview' });
      for (const r of report.slice(0, 3)) {
        const x = z[`OEBPS/p${String(r.page).padStart(4, '0')}.xhtml`]; if (!x) continue;
        const doc = new DOMParser().parseFromString(strFromU8(x), 'application/xhtml+xml'), sec = doc.querySelector('section');
        if (!sec) continue;
        for (const img of sec.querySelectorAll('img')) { const u = URL.createObjectURL(new Blob([z[`OEBPS/${img.getAttribute('src')}`] as BlobPart], { type: 'image/jpeg' })); urls.push(u); img.setAttribute('src', u); }
        pv.append(document.importNode(sec, true));
      }
      result.append(
        note(`${name}: ${fmtBytes(epub.length)} · ${plural(report.length, 'page')} · ${cols} with columns · ${plural(figs, 'figure')}${pics ? ` · ${pics} as pictures` : ''} · ${((performance.now() - t0) / 1000).toFixed(1)} s`, 'ok'),
        h('div', { class: 'row' }, button('Download .epub', () => downloadBlob(new Blob([epub as BlobPart], { type: 'application/epub+zip' }), name), { icon: 'Download', variant: 'primary' })),
        note('Send it to your Kindle with Amazon’s “Send to Kindle” (app, website or e-mail); EPUB is converted for the Kindle automatically.'),
        card('Preview (first pages)', pv),
        h('details', null, h('summary', null, 'Page report'), h('table', { class: 'epub-report' }, h('tr', null, ...['Page', 'Layout', 'Columns', 'Figures'].map((x) => h('th', null, x))),
          ...report.map((r) => h('tr', null, h('td', null, String(r.page)), h('td', null, r.how + (r.note ? ` (${r.note})` : '')), h('td', null, String(r.columns || 1)), h('td', null, String(r.figures)))))));
    }, { variant: 'primary', icon: 'BookOpen' })),
    card(null, prog, result));
  return () => { live = false; seq++; forget(); };
};
