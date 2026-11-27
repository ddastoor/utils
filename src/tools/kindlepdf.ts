// PDF for Kindle (potentials #109; owner, 21 Nov 2026): technical and scientific PDFs kept exactly as typeset, cut for a
// Kindle's screen (src/lib/kindlepdf.ts) — the margins trimmed, columns one after another, each cut between lines into
// screen-high pieces on pages of the screen's shape, the text still text. PC and phones (Send to Kindle from either).
// A conversion keeps the PDF it started with; a PDF chosen meanwhile ends it, and so does leaving the tab.
import { h, card, field, stack, note, actions, button, toggle, input, select, progress, clear, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { parseRanges, openPdf, pageThumb } from '../lib/pdf';
import { pdfInput, stem, type LoadedPdf } from '../lib/pdfui';
import { plural } from '../lib/dates';
import { pdfForKindle, KINDLES, Stopped, type KindlePage } from '../lib/kindlepdf';
import './kindlepdf.css';

// kept while the page is open (through other tabs): the Kindle and the switches
let device: string = KINDLES[0].id, custom: [string, string] = ['1264', '1680'], heads = true, labels = true;
const SIZE = /^\d{3,4}$/;

export const mount: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, spec = '', seq = 0, live = true, view = 0, outDoc: any = null, total = 0;
  const info = h('div', { class: 'muted small kpdf-info' }), prog = progress(), result = h('div', { class: 'stack' });
  const forget = () => { outDoc = null; total = 0; clear(result); };
  const inp = pdfInput({ onLoad: ([x]) => {
    seq++; prog.done(); forget();                     // a conversion of the previous PDF ends here
    f = x;
    info.textContent = x.pages ? `${x.name}: ${plural(x.pages, 'page')}` : `${x.name} has no pages.`;
  } });

  // the Kindle: a model, or another size in pixels
  const sizeNote = h('div', { class: 'muted small', role: 'status' });
  const wIn = input({ type: 'number', value: custom[0], min: 300, max: 4000, step: 1, onInput: (v) => { custom[0] = v.trim(); checkSize(); }, attrs: { 'aria-label': 'Screen width in pixels', inputmode: 'numeric' } }) as HTMLInputElement;
  const hIn = input({ type: 'number', value: custom[1], min: 300, max: 4000, step: 1, onInput: (v) => { custom[1] = v.trim(); checkSize(); }, attrs: { 'aria-label': 'Screen height in pixels', inputmode: 'numeric' } }) as HTMLInputElement;
  const customRow = h('div', { class: 'stack' }, h('div', { class: 'grid2' }, field('Width (px)', wIn), field('Height (px)', hIn)), sizeNote);
  /** the screen chosen, or the reason it cannot be used */
  const screenOf = (): [number, number] | string => {
    if (device !== 'custom') { const k = KINDLES.find((x) => x.id === device) || KINDLES[0]; return [k.w, k.h]; }
    const [w, hh] = custom;
    if (!SIZE.test(w) || !SIZE.test(hh) || +w < 300 || +hh < 300 || +w > 4000 || +hh > 4000) return 'The width and the height are whole numbers of pixels, from 300 to 4,000.';
    if (+hh / +w > 3 || +w / +hh > 3) return 'A screen is at most three times as long as it is wide.';
    return [+w, +hh];
  };
  const checkSize = () => { const s = screenOf(); sizeNote.textContent = typeof s === 'string' ? s : ''; sizeNote.classList.toggle('err-text', typeof s === 'string'); };
  const showCustom = () => { customRow.hidden = device !== 'custom'; checkSize(); };
  const deviceSel = select<string>([...KINDLES.map((k): [string, string] => [k.id, `${k.name} — ${k.w} × ${k.h}`]), ['custom', 'Another size']], device, (v) => { device = v; showCustom(); }, 'Kindle');
  showCustom();

  /** the screens' preview: one at a time, as the Kindle shows it */
  const shown = h('div', { class: 'kpdf-screen' }), where = h('div', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const prevB = button('', () => go(view - 1), { icon: 'ChevronLeft', title: 'Previous screen' }), nextB = button('', () => go(view + 1), { icon: 'ChevronRight', title: 'Next screen' });
  const go = async (i: number) => {
    if (!outDoc || !total) return;
    view = Math.max(0, Math.min(total - 1, i));
    prevB.disabled = view === 0; nextB.disabled = view === total - 1;
    const doc = outDoc, at = view, c = await pageThumb(doc, at, 900);
    if (doc !== outDoc || at !== view) return;   // a newer screen or conversion meanwhile
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Screen ${at + 1} of ${total}`);
    clear(shown).append(c);
    where.textContent = `Screen ${at + 1} of ${total}`;
  };

  root.append(
    card(null, note('Technical and scientific PDFs exactly as typeset — formulas, figures and tables as their authors laid them out, nothing reflowed — cut for a Kindle’s screen: the white margins trimmed, the columns of a page one after another, each cut between two lines into pieces as high as the screen. The text stays text, so the Kindle can still look words up and search.'), inp.el, info),
    card('Options', stack(
      field('Kindle', deviceSel, 'The PDF’s pages get the shape of its screen; a scanned page is drawn at its resolution.'), customRow,
      toggle('Leave out running heads and page numbers', heads, (v) => (heads = v)),
      toggle('Number the screens (“p. 3 · 2 of 4”: page 3 of the PDF, its second screen of four)', labels, (v) => (labels = v)),
      field('Pages', input({ placeholder: 'All pages (or e.g. 1-12)', onInput: (v) => (spec = v), attrs: { 'aria-label': 'Pages' } })))),
    actions(button('Make PDF for Kindle', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      const screen = screenOf();
      if (typeof screen === 'string') throw new Error(screen);
      const file = f, run = ++seq;
      forget();
      const pages = spec.trim() ? [...new Set(parseRanges(spec, file.pages).flat())] : undefined;
      const t0 = performance.now();
      let made;
      try {
        made = await pdfForKindle(file.doc, { screen, removeHeaders: heads, labels, pages, title: `${(file.doc.getMetaData('info:Title') || '').trim() || stem(file.name)} (for Kindle)`, alive: () => live && run === seq },
          (d, n, phase) => prog.set(phase === 'read' ? (0.1 * d) / n : 0.1 + (0.9 * d) / n, phase === 'read' ? `Reading the text: page ${Math.min(d + 1, n)} of ${n}…` : `Page ${Math.min(d + 1, n)} of ${n}…`));
      } catch (e) {
        if (e instanceof Stopped) return;              // a newer PDF, or the tab was left: nothing to show
        prog.done(); throw e;
      }
      prog.done();
      const { pdf, pages: rep, screens } = made;
      const name = `${stem(file.name)}-kindle.pdf`, blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
      const cols = rep.filter((p) => p.columns > 1).length, pics = rep.filter((p) => p.how === 'picture').length, smaller = rep.reduce((a, p) => a + p.smaller, 0), empty = rep.filter((p) => p.how === 'empty').length;
      outDoc = await openPdf(pdf); total = outDoc.countPages(); view = 0;
      const why = (p: KindlePage) => (p.how === 'picture' ? 'pictures (scanned)' : p.how === 'empty' ? 'nothing on it' : p.columns > 1 ? `${p.columns} columns` : 'one column');
      result.append(
        note(`${name}: ${fmtBytes(pdf.length)} · ${plural(screens, 'screen')} from ${plural(rep.length, 'page')}${cols ? ` · ${cols} in columns` : ''}${pics ? ` · ${pics} scanned, as pictures` : ''}${smaller ? ` · ${plural(smaller, 'piece')} taller than a screen drawn smaller` : ''}${empty ? ` · ${plural(empty, 'empty page')} left out` : ''} · ${((performance.now() - t0) / 1000).toFixed(1)} s`, 'ok'),
        h('div', { class: 'row' },
          button('Download PDF', () => downloadBlob(blob, name), { icon: 'Download', variant: 'primary' }),
          ctx.isMobile ? button('Share', () => shareOrDownload(blob, name), { icon: 'Share2' }) : null),
        note('Send it with Amazon’s Send to Kindle as a PDF — not converted: in the app or on the website leave “Convert” off; by e-mail, do not write “convert” in the subject. Converting would reflow it and lose the layout.'),
        card('Preview', stack(shown, h('div', { class: 'row kpdf-nav' }, prevB, where, nextB))),
        h('details', null, h('summary', null, 'Page report'), h('table', { class: 'epub-report' },
          h('tr', null, ...['Page', 'Screens', 'Layout', 'Note'].map((x) => h('th', null, x))),
          ...rep.map((p) => h('tr', null, h('td', null, String(p.page)), h('td', null, String(p.screens)), h('td', null, why(p)), h('td', null, [p.note, p.smaller ? `${plural(p.smaller, 'piece')} drawn smaller` : ''].filter(Boolean).join(' · ') || '—'))))));
      await go(0);
    }, { variant: 'primary', icon: 'Tablet' })),
    card(null, prog, result));
  return () => { live = false; seq++; forget(); };
};
