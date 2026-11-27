// PDF Compare (potentials #15): two versions of a contract or an agreement, their differences found word by word (MuPDF's
// text, the OCR's on scanned pages; textkit-tokens.wasm compares) and shown on their pages side by side — removed and
// changed words struck in red on the original, added and changed words green on the new version, moved passages blue —
// with the list of changes to go through (Previous / Next), the two versions scrolled together, and both PDFs to download
// with the changes as comments. PC + phones (one version at a time on a phone).
import { h, card, field, stack, note, actions, button, toggle, segmented, progress, clear, toast, errMsg, downloadBlob, shareOrDownload, copy, type Mount } from '../ui';
import { pdfInput, stem, type LoadedPdf } from '../lib/pdfui';
import { mupdf, pageGeom, signatureCount } from '../lib/pdf';
import { pageText, pageKind, type PageText } from '../lib/redact';
import { tokensOf, ocrText, pageLines, headLines, compare, describe, report, markPdf, counterpart, KIND_WORD, type Tok, type Result, type Change } from '../lib/pdfcompare';
import { texttokens } from '../wasm/texttokens';
import { toPage } from '../lib/searchable';
import type { OcrLang } from '../lib/ocr';
import type { Img } from '../wasm/imgproc';
import { plural } from '../lib/dates';
import './pdfcompare.css';

// the choices, kept while the page is open
let ignoreCase = false, ignorePunct = false, heads = true, ocrOn = true, lang: OcrLang = 'eng', together = true;
const STOP = new Error('stopped');
const rgba = (pix: any): Img => {
  const rgb = pix.getPixels(), w = pix.getWidth(), hh = pix.getHeight(), n = pix.getNumberOfComponents(), out = new Uint8ClampedArray(w * hh * 4);
  for (let a = 0, b = 0; b < out.length; a += n, b += 4) { out[b] = rgb[a]; out[b + 1] = rgb[a + 1]; out[b + 2] = rgb[a + 2]; out[b + 3] = 255; }
  return { data: out, width: w, height: hh };
};
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const pagesList = (ps: number[]) => ps.map((p) => p + 1).join(', ');
interface Read { doc: any; toks: Tok[]; ocr: number[]; skipped: number[]; bounds: number[][] }

export const mount: Mount = (root, ctx) => {
  let fa: LoadedPdf | null = null, fb: LoadedPdf | null = null, seq = 0, gone = false;
  let res: Result | null = null, cur = -1, A: Read | null = null, B: Read | null = null, view: 'a' | 'b' = 'b';
  const infoA = h('div', { class: 'muted small pc-info', 'aria-live': 'polite' }, 'No PDF chosen.');
  const infoB = h('div', { class: 'muted small pc-info', 'aria-live': 'polite' }, 'No PDF chosen.');
  const prog = progress();
  const summary = h('div', { class: 'pc-summary', 'aria-live': 'polite' });
  const notes = h('div', { class: 'stack' });
  const list = h('div', { class: 'pc-list', role: 'list', 'aria-label': 'The changes' });
  const counter = h('span', { class: 'small pc-count', 'aria-live': 'polite' });
  const colA = h('div', { class: 'pc-col', tabindex: '0', role: 'region', 'aria-label': 'The original’s pages' });
  const colB = h('div', { class: 'pc-col', tabindex: '0', role: 'region', 'aria-label': 'The changed version’s pages' });
  const headA = h('div', { class: 'pc-colname' }), headB = h('div', { class: 'pc-colname' });
  const downloads = h('div', { class: 'row' });
  const inA = pdfInput({ label: 'Choose the original (older) PDF', onLoad: ([x]) => { fa = x; loaded(); } });
  const inB = pdfInput({ label: 'Choose the changed (newer) PDF', onLoad: ([x]) => { fb = x; loaded(); } });
  const goBtn = button('Compare', () => run(), { variant: 'primary', icon: 'GitCompare', disabled: true });
  const swapBtn = button('Swap', () => { [fa, fb] = [fb, fa]; loaded(); }, { variant: 'ghost', icon: 'ArrowUpDown', small: true, disabled: true });
  const prevBtn = button('Previous change', () => go(-1), { small: true, icon: 'ChevronUp', title: 'Previous change — Alt+↑, or P in the list or the pages' });
  const nextBtn = button('Next change', () => go(1), { small: true, icon: 'ChevronDown', title: 'Next change — Alt+↓, or N in the list or the pages' });
  const sideSwitch = segmented<'a' | 'b'>([['a', 'Original'], ['b', 'Changed']], view, (v) => { view = v; showSide(); });
  const togetherToggle = toggle('Scroll the two together', together, (v) => { together = v; });
  const resultCard = card('Changes', summary, notes, h('div', { class: 'row pc-nav' }, prevBtn, nextBtn, counter), list, downloads);
  const pagesCard = card('The pages', ctx.isMobile ? field('Show', sideSwitch) : null, ctx.isMobile ? null : togetherToggle,
    h('div', { class: 'pc-cols' }, h('div', { class: 'pc-side', 'data-side': 'a' }, headA, colA), h('div', { class: 'pc-side', 'data-side': 'b' }, headB, colB)));
  resultCard.hidden = true; pagesCard.hidden = true;

  async function describeFile(x: LoadedPdf | null, el: HTMLElement) {
    if (!x) { el.textContent = 'No PDF chosen.'; return; }
    const m: any = await mupdf();
    const doc = m.Document.openDocument(x.bytes, 'application/pdf');
    if (x.password !== undefined) doc.authenticatePassword(x.password);
    let scanned = 0;
    for (let i = 0; i < doc.countPages(); i++) if (pageKind(doc.loadPage(i)).scanned) scanned++;
    el.textContent = `${x.name}: ${plural(doc.countPages(), 'page')}${scanned ? ` · ${plural(scanned, 'page')} ${scanned === 1 ? 'is a picture' : 'are pictures'} without text (scanned): read by the OCR` : ''}`;
  }
  function loaded() {
    seq++; res = null; resultCard.hidden = true; pagesCard.hidden = true; prog.done();
    void describeFile(fa, infoA); void describeFile(fb, infoB);
    goBtn.disabled = !(fa && fb); swapBtn.disabled = !(fa || fb);
  }

  // ---- reading a document: each page's characters with their boxes (MuPDF), a scanned page read by the OCR
  async function ocrPage(page: any, b: number[], label: string, my: number): Promise<PageText> {
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
    if (!reading) return { text: '', quads: [], line: new Int32Array() };
    // the words' boxes are on the picture read (the page drawn and turned t quarter turns; smaller only past 3,000 px)
    const k = (t % 2 ? R.height : R.width) / reading.img.width;
    const words = k === 1 ? reading.r.words : reading.r.words.map((w) => ({ ...w, x0: w.x0 * k, y0: w.y0 * k, x1: w.x1 * k, y1: w.y1 * k }));
    const map = (x: number, y: number): [number, number] => { const [X, Y] = toPage(x, y, t, R.width, R.height, sc, g.H); return [b[0] + X, b[1] + g.H - Y]; };
    return ocrText({ words, lines: reading.r.lines }, map);
  }
  async function readDoc(f: LoadedPdf, label: string, my: number): Promise<Read> {
    const m: any = await mupdf();
    const doc = m.Document.openDocument(f.bytes, 'application/pdf');
    if (f.password !== undefined) doc.authenticatePassword(f.password);
    const n = doc.countPages(), pts: PageText[] = [], geo: ReturnType<typeof pageLines>[] = [], ocr: number[] = [], skipped: number[] = [], bounds: number[][] = [];
    for (let i = 0; i < n; i++) {
      if (gone || my !== seq) throw STOP;
      const page = doc.loadPage(i), b = page.getBounds();
      bounds.push(b);
      prog.set(null, `${label}: page ${i + 1} of ${n}…`);
      let pt: PageText;
      if (pageKind(page).scanned) {
        if (ocrOn) { pt = await ocrPage(page, b, `${label}: page ${i + 1} of ${n}`, my); ocr.push(i); }
        else { pt = { text: '', quads: [], line: new Int32Array() }; skipped.push(i); }
      } else pt = pageText(page);
      pts.push(pt); geo.push(pageLines(pt, b));
      if (i % 4 === 3) await tick();
    }
    const hl = headLines(geo);
    return { doc, toks: pts.flatMap((pt, i) => tokensOf(pt, i, (l) => hl[i].has(l), ocr.includes(i))), ocr, skipped, bounds };
  }

  async function run() {
    if (!fa || !fb) { toast('Choose both PDFs first.', 'info'); return; }
    const a = fa, b = fb, my = ++seq;
    goBtn.disabled = true; resultCard.hidden = true; pagesCard.hidden = true;
    try {
      A = await readDoc(a, 'Reading the original', my);
      B = await readDoc(b, 'Reading the changed version', my);
      prog.set(null, 'Comparing…'); await tick();
      const eng = await texttokens();
      if (gone || my !== seq) return;
      res = compare(A.toks, B.toks, { ignoreCase, ignorePunct, heads }, (x, y) => eng.tokens(x, y));
      prog.done();
      show(a, b);
    } catch (e) {
      prog.done();
      if (e !== STOP) toast(errMsg(e), 'err');
    } finally { if (my === seq) goBtn.disabled = !(fa && fb); }
  }

  // ---- the result: the summary, the list of changes, the downloads, the pages
  function show(a: LoadedPdf, b: LoadedPdf) {
    const r = res!, ch = r.changes;
    const by = (k: string) => ch.filter((c) => c.kind === k).length;
    const parts = [['changed', 'changed'], ['added', 'added'], ['removed', 'removed'], ['moved', 'moved']].map(([k, w]) => (by(k) ? `${by(k)} ${w}` : '')).filter(Boolean);
    summary.textContent = ch.length ? `${plural(ch.length, 'change')}${parts.length > 1 ? `: ${parts.join(', ')}` : ''} · ${plural(r.words.added, 'word')} added, ${r.words.removed} removed` : 'The two PDFs have the same words.';
    clear(notes);
    const how = [ignoreCase && 'capitals and small letters are taken as the same', ignorePunct && 'punctuation is left out', heads && 'running heads and page numbers are left out'].filter(Boolean);
    notes.append(h('p', { class: 'muted small' }, `Only the words are compared — not fonts, colours, pictures or the layout${how.length ? `; ${how.join(', ')}` : ''}.`));
    for (const [d, name] of [[A!, 'original'], [B!, 'changed version']] as Array<[Read, string]>) {
      if (d.ocr.length) notes.append(note(`The ${name}’s page${d.ocr.length === 1 ? '' : 's'} ${pagesList(d.ocr)} ${d.ocr.length === 1 ? 'is a scan and was' : 'are scans and were'} read by the OCR: a word it misreads shows as a change.`, 'info'));
      if (d.skipped.length) notes.append(note(`The ${name}’s page${d.skipped.length === 1 ? '' : 's'} ${pagesList(d.skipped)} ${d.skipped.length === 1 ? 'is a scan' : 'are scans'} without text and ${d.skipped.length === 1 ? 'was' : 'were'} not read (reading scanned pages is off).`, 'warn'));
    }
    if (r.approx) notes.append(note('The documents differ a great deal: the comparison stopped looking for the shortest answer after 5 seconds. The changes shown are right, but some may be longer than they need to be.', 'warn'));
    clear(list);
    ch.slice(0, 3000).forEach((c, i) => {
      const where = c.kind === 'moved' ? `p. ${c.pageA} → p. ${c.pageB}` : c.kind === 'removed' ? `p. ${c.pageA}` : `p. ${c.pageB}`;
      const body = c.kind === 'changed' ? [h('del', null, c.was), ' → ', h('ins', null, c.now)]
        : c.kind === 'added' ? [h('ins', null, c.now)] : c.kind === 'removed' ? [h('del', null, c.was)] : [h('span', { class: 'pc-moved' }, c.now), c.exact ? '' : ' (with small changes)'];
      const item = h('button', { type: 'button', class: 'pc-item', role: 'listitem', 'data-i': String(i), onclick: () => select(i, true) },
        h('span', { class: 'pc-no' }, String(i + 1)), h('span', { class: `pc-kind pc-k-${c.kind}` }, KIND_WORD[c.kind]), h('span', { class: 'pc-where' }, where),
        h('span', { class: 'pc-text' }, c.before ? h('span', { class: 'pc-ctx' }, `…${c.before} `) : null, ...body, c.after ? h('span', { class: 'pc-ctx' }, ` ${c.after}…`) : null));
      list.append(item);
    });
    if (ch.length > 3000) list.append(h('p', { class: 'muted small' }, `The first 3,000 changes are listed — the pages show them all.`));
    prevBtn.disabled = nextBtn.disabled = !ch.length;
    counter.textContent = ch.length ? `${plural(ch.length, 'change')} — Next goes to the first.` : 'No changes to go through.';
    cur = -1;
    clear(downloads);
    if (ch.length) downloads.append(
      button('Changed PDF, marked', () => saveMarked(b, 'b'), { variant: 'ghost', icon: 'Download' }),
      button('Original PDF, marked', () => saveMarked(a, 'a'), { variant: 'ghost', icon: 'Download' }),
      button('Copy the list', () => copy(report(a.name, b.name, r)), { variant: 'ghost', icon: 'Copy' }),
      button('Save the list (.txt)', () => downloadBlob(new Blob([report(a.name, b.name, r)], { type: 'text/plain;charset=utf-8' }), `${stem(b.name)}-changes.txt`), { variant: 'ghost', icon: 'FileText' }));
    resultCard.hidden = false;
    headA.textContent = `Original — ${a.name}`; headB.textContent = `Changed — ${b.name}`;
    drawPages();
    pagesCard.hidden = false;
    showSide();
  }

  async function saveMarked(f: LoadedPdf, side: 'a' | 'b') {
    try {
      const m: any = await mupdf();
      const doc = m.Document.openDocument(f.bytes, 'application/pdf').asPDF();
      if (f.password !== undefined) doc.authenticatePassword(f.password);
      const sig = signatureCount(doc);
      markPdf(doc, side, res!.changes);
      let bytes: Uint8Array;
      try { bytes = doc.saveToBuffer(`compress${f.password !== undefined ? ',encrypt=keep' : ''}`).asUint8Array().slice(); }
      catch { bytes = doc.saveToBuffer('compress,encrypt=none').asUint8Array().slice(); }
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' }), name = `${stem(f.name)}-compared.pdf`;
      if (sig) toast('The PDF was digitally signed: the marked copy no longer proves the signature.', 'info', 5000);
      if (ctx.isMobile) await shareOrDownload(blob, name); else downloadBlob(blob, name);
    } catch (e) { toast(errMsg(e), 'err'); }
  }

  // ---- the pages: drawn as they come into view, the changes marked on them
  const views: Record<'a' | 'b', HTMLElement[]> = { a: [], b: [] };
  let ios: IntersectionObserver[] = [];
  function drawPages() {
    for (const io of ios) io.disconnect();
    ios = [];
    for (const side of ['a', 'b'] as const) {
      const d = side === 'a' ? A! : B!, col = side === 'a' ? colA : colB;
      clear(col); views[side] = [];
      const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); void paint(side, e.target as HTMLElement); } }, { root: ctx.isMobile ? null : col, rootMargin: '600px' });
      ios.push(io);
      d.bounds.forEach((b, i) => {
        const el = h('div', { class: 'pc-page', 'data-page': String(i), style: `aspect-ratio: ${b[2] - b[0]} / ${b[3] - b[1]}` });
        views[side].push(el);
        col.append(h('div', { class: 'pc-page-no' }, `Page ${i + 1}`), el);
        io.observe(el);
      });
      res!.changes.forEach((c, ci) => {
        for (const mk of side === 'a' ? c.marksA : c.marksB) {
          const el = views[side][mk.page], b = d.bounds[mk.page];
          if (!el) continue;
          const W = b[2] - b[0], H = b[3] - b[1];
          for (const r of mk.rects) {
            // a pointer's shortcut to the list's item of the same change (the list is the control for the keyboard and
            // screen readers: these marks are as small as the words — WCAG 2.5.8's "equivalent" exception)
            el.append(h('div', { class: ['pc-mark', `pc-k-${c.kind}`, `pc-side-${side}`, mk.caret && 'pc-caret'], 'aria-hidden': 'true', 'data-c': String(ci), title: `${ci + 1}. ${describe(c)}`,
              style: `left:${((r[0] - b[0]) / W) * 100}%;top:${((r[1] - b[1]) / H) * 100}%;width:${((r[2] - r[0]) / W) * 100}%;height:${((r[3] - r[1]) / H) * 100}%`,
              onclick: () => select(ci, false) }));
          }
        }
      });
    }
  }
  async function paint(side: 'a' | 'b', el: HTMLElement) {
    const d = side === 'a' ? A : B; if (!d) return;
    const m: any = await mupdf();
    const i = +el.dataset.page!, b = d.bounds[i];
    const width = Math.min(1600, Math.max(320, el.clientWidth * (window.devicePixelRatio || 1)));
    const s = width / (b[2] - b[0]);
    const pix = d.doc.loadPage(i).toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceRGB, false, true);
    const c = h('canvas', { width: pix.getWidth(), height: pix.getHeight(), 'aria-hidden': 'true' }) as HTMLCanvasElement;
    const px = pix.getPixels(), out = new Uint8ClampedArray(pix.getWidth() * pix.getHeight() * 4);
    for (let a = 0, k = 0; k < out.length; a += 3, k += 4) { out[k] = px[a]; out[k + 1] = px[a + 1]; out[k + 2] = px[a + 2]; out[k + 3] = 255; }
    c.getContext('2d')!.putImageData(new ImageData(out, pix.getWidth(), pix.getHeight()), 0, 0);
    pix.destroy?.();
    el.prepend(c);
  }
  function showSide() {
    if (!ctx.isMobile) return;
    for (const s of pagesCard.querySelectorAll<HTMLElement>('.pc-side')) s.hidden = s.dataset.side !== view;
  }

  // ---- going through the changes
  /** where a mark stands in its column (px from the column's top) */
  const yOf = (side: 'a' | 'b', page: number, y: number) => {
    const el = views[side][page], d = side === 'a' ? A! : B!, b = d.bounds[page];
    return el.offsetTop + ((y - b[1]) / (b[3] - b[1])) * el.clientHeight;
  };
  function scrollTo(side: 'a' | 'b', y: number) {
    const col = side === 'a' ? colA : colB;
    if (ctx.isMobile) { window.scrollTo({ top: col.getBoundingClientRect().top + window.scrollY + y - window.innerHeight / 3 }); return; }
    const to = Math.max(0, Math.min(col.scrollHeight - col.clientHeight, Math.round(y - col.clientHeight / 3)));
    given[side] = to; col.scrollTop = to;
  }
  function select(i: number, scroll: boolean) {
    if (!res) return;
    const c = res.changes[i];
    list.querySelector('[aria-current]')?.removeAttribute('aria-current');
    pagesCard.querySelectorAll('.pc-mark.cur').forEach((x) => x.classList.remove('cur'));
    cur = i;
    list.querySelector(`[data-i="${i}"]`)?.setAttribute('aria-current', 'true');
    pagesCard.querySelectorAll(`.pc-mark[data-c="${i}"]`).forEach((x) => x.classList.add('cur'));
    counter.textContent = `Change ${i + 1} of ${res.changes.length} — ${c.kind === 'removed' ? `original page ${c.pageA}` : c.kind === 'added' ? `changed page ${c.pageB}` : `original page ${c.pageA}, changed page ${c.pageB}`}`;
    if (!scroll) return;
    (list.querySelector(`[data-i="${i}"]`) as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
    if (!ctx.isMobile) pagesCard.scrollIntoView({ block: 'nearest' });
    for (const side of ['a', 'b'] as const) {
      const mk = (side === 'a' ? c.marksA : c.marksB)[0];
      if (mk && (!ctx.isMobile || side === view)) scrollTo(side, yOf(side, mk.page, mk.rects[0][1]));
    }
  }
  const go = (step: 1 | -1) => {
    const n = res?.changes.length ?? 0;
    if (!n) return;
    select(cur < 0 ? (step > 0 ? 0 : n - 1) : (cur + step + n) % n, true);
  };
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('textarea, input, select, [contenteditable="true"]')) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); go(e.key === 'ArrowDown' ? 1 : -1); return; }
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing || !t.closest('.pc-list, .pc-col')) return;
    const k = e.key.toLowerCase();
    if (k === 'n' || k === 'p') { e.preventDefault(); go(k === 'n' ? 1 : -1); }
  });

  // ---- the two columns scrolled together: the word at the top of one, its partner at the same height in the other
  const topToken = (side: 'a' | 'b', col: HTMLElement): [number, number] | null => {
    const toks = side === 'a' ? res!.tokensA : res!.tokensB, top = col.scrollTop;
    const page = views[side].findIndex((el) => el.offsetTop + el.clientHeight > top);
    if (page < 0) return null;
    let best = -1, by = Infinity;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].page !== page) continue;
      const y = yOf(side, page, Math.min(toks[i].quads[0][1], toks[i].quads[0][3]));
      if (y >= top && y < by) { by = y; best = i; }
    }
    return best < 0 ? null : [best, by - top];
  };
  // the scroll a column was given (its own scroll event is no reason to move the other back)
  const given: Record<'a' | 'b', number | null> = { a: null, b: null };
  for (const [side, col, other] of [['a', colA, colB], ['b', colB, colA]] as Array<['a' | 'b', HTMLElement, HTMLElement]>) {
    let raf = 0;
    col.addEventListener('scroll', () => {
      if (given[side] !== null && Math.abs(col.scrollTop - given[side]!) < 2) { given[side] = null; return; }
      given[side] = null;
      if (!together || !res || ctx.isMobile || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const at = topToken(side, col); if (!at) return;
        const os: 'a' | 'b' = side === 'a' ? 'b' : 'a', j = counterpart(res!.raw, at[0], side === 'a'), toks = os === 'a' ? res!.tokensA : res!.tokensB;
        const t = toks[Math.min(j, toks.length - 1)]; if (!t) return;
        const to = Math.max(0, Math.min(other.scrollHeight - other.clientHeight, Math.round(yOf(os, t.page, Math.min(t.quads[0][1], t.quads[0][3])) - at[1])));
        if (Math.abs(other.scrollTop - to) < 2) return;
        given[os] = to; other.scrollTop = to;
      });
    });
  }

  root.append(stack(
    card('The two versions',
      h('div', { class: 'grid2' },
        field('Original (older)', h('div', { class: 'stack' }, inA.el, infoA)),
        field('Changed (newer)', h('div', { class: 'stack' }, inB.el, infoB))),
      h('div', { class: 'row' }, swapBtn),
      h('div', { class: 'pc-opts' },
        toggle('Capitals and small letters are the same', ignoreCase, (v) => { ignoreCase = v; }),
        toggle('Leave out punctuation', ignorePunct, (v) => { ignorePunct = v; }),
        toggle('Leave out running heads and page numbers', heads, (v) => { heads = v; }),
        toggle('Read scanned pages (OCR — slower)', ocrOn, (v) => { ocrOn = v; })),
      field('Language of scanned pages', segmented<OcrLang>([['eng', 'English'], ['fra', 'Français'], ['spa', 'Español'], ['deu', 'Deutsch'], ['eng+fra+spa+deu', 'Mixed / not sure']], lang, (v) => { lang = v; })),
      prog),
    resultCard, pagesCard,
    note('Everything happens on this device: neither PDF leaves it.', 'info'),
    actions(goBtn)));
  return () => { gone = true; seq++; for (const io of ios) io.disconnect(); A = B = null; };
};
