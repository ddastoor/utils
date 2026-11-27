// PDF Redact (potentials #61): Aadhaar numbers, PANs, phone and account numbers, addresses and any words taken out of a PDF
// for good — the text removed from the page, pictures' pixels blacked out, a black box where they stood — not a box drawn
// over them. Found by the Number Detective's engine in the page text, by the OCR tab's Tesseract in scanned pages and by
// zxing-cpp in QR codes; boxes drawn by hand on the pages. The redacted file is read again before it is offered. PC + phones.
import { h, card, field, stack, note, actions, button, toggle, textarea, progress, clear, toast, errMsg, type Mount } from '../ui';
import { pdfInput, savePdfFile, stem, type LoadedPdf } from '../lib/pdfui';
import { mupdf, signatureCount, pageGeom } from '../lib/pdf';
import { devcore } from '../wasm/devcore';
import { KINDS, KIND_NAME, bakeAll, findOnPage, pageKind, redact, saveRedacted, check, type Hit, type Rect } from '../lib/redact';
import { findInPictures, type Img } from '../lib/redact-pictures';
import { findCodes, type Code } from '../lib/codesread';
import { plural } from '../lib/dates';
import './pdfredact.css';

/** the order of the list's groups: as the chips stand, then the reader's words, codes and boxes */
const ORDER = ['aadhaar', 'vid', 'aadhaar_masked', 'pan', 'phone', 'email', 'account', 'card', 'upi', 'ifsc', 'gstin', 'dob', 'words', 'qr', 'box'];
// what to look for, kept while the page is open (another tab and back)
let chosen = new Set(['aadhaar', 'pan', 'phone', 'email', 'account', 'card', 'upi', 'dob']);
let words = '', pictures = true, scrub = true;

export const mount: Mount = (root, ctx) => {
  let file: LoadedPdf | null = null, doc: any = null, hits: Hit[] = [], seq = 0, gone = false, drawing = false, scanned: number[] = [];
  const info = h('div', { class: 'muted small rd-info', 'aria-live': 'polite' });
  const prog = progress();
  const summary = h('div', { class: 'rd-summary', 'aria-live': 'polite' });
  const list = h('div', { class: 'rd-list' });
  const pagesEl = h('div', { class: 'rd-pages' });
  const result = h('div', { class: 'stack' });
  const inp = pdfInput({ onLoad: ([x]) => load(x) });

  const kindChips = h('div', { class: 'rd-kinds', role: 'group', 'aria-label': 'What to find' },
    ...KINDS.map(([k, name]) => {
      const b = h('button', { type: 'button', class: 'chip chip-btn', 'aria-pressed': String(chosen.has(k)), onclick: () => { chosen.has(k) ? chosen.delete(k) : chosen.add(k); b.setAttribute('aria-pressed', String(chosen.has(k))); } }, name);
      return b;
    }));
  const wordsBox = textarea({ rows: 3, placeholder: 'A name, an address line, a customer ID … — one a line', onInput: (v) => (words = v) });
  wordsBox.value = words;
  const picToggle = toggle('Read scanned pages and QR codes too (OCR — slower)', pictures, (v) => (pictures = v));
  const scrubToggle = toggle('Also remove hidden information: the document’s title, author and other details, attachments, scripts, thumbnails', scrub, (v) => (scrub = v));
  const findBtn = button('Find', () => find(), { variant: 'primary', icon: 'Search' });
  const drawBtn = button('Draw a box', () => setDrawing(!drawing), { icon: 'SquareDashed' });
  const redactBtn = button('Redact and save', () => apply(), { variant: 'primary', icon: 'EyeOff', disabled: true });

  function setDrawing(v: boolean) {
    drawing = v; drawBtn.setAttribute('aria-pressed', String(v)); pagesEl.classList.toggle('rd-drawing', v);
  }
  drawBtn.setAttribute('aria-pressed', 'false');

  async function load(x: LoadedPdf) {
    const my = ++seq;
    file = x; hits = []; clear(list); clear(pagesEl); clear(result); clear(summary); redactBtn.disabled = true;
    const m: any = await mupdf();
    doc = m.Document.openDocument(x.bytes, 'application/pdf').asPDF();
    if (x.password !== undefined) doc.authenticatePassword(x.password);
    const baked = bakeAll(doc);
    scanned = [];
    for (let i = 0; i < doc.countPages(); i++) if (pageKind(doc.loadPage(i)).scanned) scanned.push(i);
    if (my !== seq) return;
    const sig = signatureCount(doc);
    info.replaceChildren(`${x.name}: ${plural(x.pages, 'page')}`,
      baked.annots || baked.widgets ? ` · ${[baked.annots && plural(baked.annots, 'comment'), baked.widgets && plural(baked.widgets, 'form field')].filter(Boolean).join(' and ')} made part of the pages, so their text is found too` : '',
      scanned.length ? ` · ${plural(scanned.length, 'page')} ${scanned.length === 1 ? 'is a picture' : 'are pictures'} without text (scanned)` : '',
      sig ? ` · digitally signed: the redacted copy no longer carries the signature` : '',
      x.password !== undefined ? ' · the redacted copy has no password' : '');
    await find();
  }

  async function find() {
    if (!doc || !file) { toast('Choose a PDF first.', 'info'); return; }
    const my = ++seq;
    const ids = await devcore('ids');
    const kinds = [...chosen], wl = words.split(/\r?\n/).map((w) => w.trim()).filter((w) => w.length >= 2);
    const scan = (text: string) => ids.json<Array<{ s: number; e: number; kind: string; value: string }>>('ids:scan', { text, kinds, words: wl });
    const drawn = hits.filter((x) => x.source === 'box');
    const found: Hit[] = [];
    const n = doc.countPages();
    for (let i = 0; i < n; i++) {
      if (i % 5 === 0) { prog.set(i / n, `Looking in page ${i + 1} of ${n}…`); await new Promise((r) => setTimeout(r)); if (my !== seq || gone) return; }
      if (!scanned.includes(i)) found.push(...findOnPage(doc.loadPage(i), i, scan));
    }
    if (pictures) {
      try {
        const m: any = await mupdf();
        const engines = {
          render: (p: number, scale: number): Img => {
            if (gone || my !== seq) throw new Error('stopped');
            const pix = doc.loadPage(p).toPixmap(m.Matrix.scale(scale, scale), m.ColorSpace.DeviceRGB, false, true);
            const rgb = pix.getPixels(), w = pix.getWidth(), hh = pix.getHeight(), out = new Uint8ClampedArray(w * hh * 4);
            for (let a = 0, b = 0; a < rgb.length; a += 3, b += 4) { out[b] = rgb[a]; out[b + 1] = rgb[a + 1]; out[b + 2] = rgb[a + 2]; out[b + 3] = 255; }
            pix.destroy?.();
            return { data: out, width: w, height: hh };
          },
          ocr: async (img: Img) => { const { recognize } = await import('../lib/ocr'); if (gone || my !== seq) throw new Error('stopped'); return recognize(new ImageData(img.data, img.width, img.height), 'eng', undefined, 'page'); },
          codes: async (img: Img): Promise<Code[]> => { const r = await findCodes(img); if (gone || my !== seq) throw new Error('stopped'); return r; },
        };
        const all = Array.from({ length: n }, (_, i) => i);
        found.push(...await findInPictures({ ocrPages: scanned, codePages: all }, scan, engines, (d, a, what) => { if (my === seq) prog.set(d / Math.max(1, a), what ? `${what}…` : ''); }));
      } catch (e) { if (my === seq) toast(`Pictures could not be read: ${errMsg(e)}`, 'err'); }
    }
    prog.done();
    if (my !== seq || gone) return;
    hits = [...found, ...drawn];
    show();
  }

  function show() {
    const on = hits.filter((x) => x.on);
    redactBtn.disabled = !on.length;
    const byKind = new Map<string, Hit[]>();
    for (const x of hits) { const k = x.source === 'box' ? 'box' : x.kind; (byKind.get(k) || byKind.set(k, []).get(k)!).push(x); }
    summary.replaceChildren(hits.length ? `${plural(hits.length, 'place')} to redact${hits.length !== on.length ? ` (${on.length} chosen)` : ''} on ${plural(new Set(hits.map((x) => x.page)).size, 'page')}` : 'Nothing of the kinds chosen was found. Add words, or draw boxes on the pages.');
    // the list, by kind: a tick each, its page and what it says
    const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i; };
    clear(list).append(...[...byKind].sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, xs]) => h('div', { class: 'rd-group' },
      h('div', { class: 'rd-group-head' }, h('strong', null, `${KIND_NAME[k] || k} · ${xs.length}`),
        button(xs.every((x) => x.on) ? 'Keep all' : 'Redact all', () => { const v = !xs.every((x) => x.on); xs.forEach((x) => (x.on = v)); show(); }, { small: true, variant: 'ghost' })),
      ...xs.map((x) => {
        const cb = h('input', { type: 'checkbox', checked: x.on, onchange: () => { x.on = cb.checked; show(); } }) as HTMLInputElement;
        return h('label', { class: 'rd-item' }, cb, h('span', { class: 'rd-page' }, `p. ${x.page + 1}`), h('span', { class: 'rd-text mono' }, x.source === 'box' ? 'a box you drew' : x.text),
          x.source === 'box' ? button('Remove', () => { hits = hits.filter((y) => y !== x); show(); }, { small: true, variant: 'ghost', icon: 'X' }) : null);
      }))));
    drawPages();
  }

  // ---- the pages, with the places marked: drawn when they come into view
  let io: IntersectionObserver | null = null;
  function drawPages() {
    io?.disconnect();
    const keep = new Map([...pagesEl.querySelectorAll<HTMLElement>('.rd-page-view')].map((el) => [+el.dataset.page!, el]));
    clear(pagesEl);
    io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io!.unobserve(e.target); paint(e.target as HTMLElement); } }, { rootMargin: '400px' });
    for (let i = 0; i < doc.countPages(); i++) {
      const g = pageGeom(doc.loadPage(i)), b = doc.loadPage(i).getBounds();
      const el = keep.get(i) || h('div', { class: 'rd-page-view', 'data-page': String(i), style: `aspect-ratio: ${g.W} / ${g.H}` });
      el.querySelectorAll('.rd-box').forEach((x) => x.remove());
      const W = b[2] - b[0], H = b[3] - b[1];
      for (const x of hits.filter((y) => y.page === i)) for (const r of x.rects) {
        // a pointer's shortcut to the list's check box of the same place (the list is the control for the keyboard and
        // screen readers: these boxes are as small as the text they cover — WCAG 2.5.8's "equivalent" exception)
        const box = h('div', { class: ['rd-box', x.on ? 'on' : 'off'], 'aria-hidden': 'true', 'data-id': x.id, title: `${KIND_NAME[x.source === 'box' ? 'box' : x.kind] || x.kind}${x.source === 'box' ? '' : ` ${x.text}`}, page ${i + 1}: ${x.on ? 'redacted — click to keep it' : 'kept — click to redact it'}`,
          style: `left:${((r[0] - b[0]) / W) * 100}%;top:${((r[1] - b[1]) / H) * 100}%;width:${((r[2] - r[0]) / W) * 100}%;height:${((r[3] - r[1]) / H) * 100}%`,
          onclick: (e: Event) => { e.stopPropagation(); x.on = !x.on; show(); } });
        el.append(box);
      }
      pagesEl.append(h('div', { class: 'rd-page-wrap' }, h('div', { class: 'rd-page-no' }, `Page ${i + 1}`), el));
      if (!el.querySelector('canvas')) io.observe(el);
      wireDrawing(el, i, b);
    }
  }
  async function paint(el: HTMLElement) {
    const i = +el.dataset.page!, m: any = await mupdf();
    if (!doc) return;
    const width = Math.min(1400, Math.max(320, el.clientWidth * (window.devicePixelRatio || 1)));
    const b = doc.loadPage(i).getBounds(), s = width / (b[2] - b[0]);
    const pix = doc.loadPage(i).toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceRGB, true, true);
    const c = h('canvas', { width: pix.getWidth(), height: pix.getHeight(), 'aria-hidden': 'true' }) as HTMLCanvasElement;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pix.getPixels()), pix.getWidth(), pix.getHeight()), 0, 0);
    pix.destroy?.();
    el.prepend(c);
  }
  function wireDrawing(el: HTMLElement, page: number, b: number[]) {
    if (el.dataset.wired) return; el.dataset.wired = '1';
    let start: [number, number] | null = null, temp: HTMLElement | null = null;
    const at = (e: PointerEvent): [number, number] => { const r = el.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    el.addEventListener('pointerdown', (e) => {
      if (!drawing || (e.target as HTMLElement).classList.contains('rd-box')) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); start = at(e);
      temp = h('div', { class: 'rd-box drawing' }); el.append(temp);
    });
    el.addEventListener('pointermove', (e) => {
      if (!start || !temp) return; const p = at(e);
      Object.assign(temp.style, { left: `${Math.min(start[0], p[0]) * 100}%`, top: `${Math.min(start[1], p[1]) * 100}%`, width: `${Math.abs(p[0] - start[0]) * 100}%`, height: `${Math.abs(p[1] - start[1]) * 100}%` });
    });
    const end = (e: PointerEvent) => {
      if (!start) return; const p = at(e), s0 = start; start = null; temp?.remove(); temp = null;
      const W = b[2] - b[0], H = b[3] - b[1];
      const r: Rect = [b[0] + Math.min(s0[0], p[0]) * W, b[1] + Math.min(s0[1], p[1]) * H, b[0] + Math.max(s0[0], p[0]) * W, b[1] + Math.max(s0[1], p[1]) * H];
      if (r[2] - r[0] < 3 || r[3] - r[1] < 3) return;
      hits.push({ id: `b${Date.now()}${Math.random()}`, page, kind: 'box', value: '', text: '', rects: [r], source: 'box', on: true });
      show();
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { start = null; temp?.remove(); temp = null; });
  }

  async function apply() {
    if (!file) return;
    const f = file, my = ++seq, on = hits.filter((x) => x.on);
    if (!on.length) { toast('Nothing is chosen to redact.', 'info'); return; }
    clear(result); prog.set(0, 'Redacting…'); await new Promise((r) => setTimeout(r, 30));
    try {
      // a fresh copy of the file each time: what was chosen can still change, and run again
      const m: any = await mupdf();
      const work = m.Document.openDocument(f.bytes, 'application/pdf').asPDF();
      if (f.password !== undefined) work.authenticatePassword(f.password);
      bakeAll(work);
      const done = await redact(work, hits, { scrub });
      const bytes = saveRedacted(work);
      prog.set(0.8, 'Reading the redacted file again…');
      const ids = await devcore('ids');
      const kinds = [...chosen], wl = words.split(/\r?\n/).map((w) => w.trim()).filter((w) => w.length >= 2);
      const left = await check(bytes, hits, (text) => ids.json('ids:scan', { text, kinds, words: wl }));
      prog.done();
      if (my !== seq || gone) return;
      const name = `${stem(f.name)}-redacted.pdf`;
      const counts = new Map<string, number>(); for (const x of on) { const k = KIND_NAME[x.source === 'box' ? 'box' : x.kind] || x.kind; counts.set(k, (counts.get(k) || 0) + 1); }
      clear(result).append(card('Redacted',
        h('p', null, `${[...counts].map(([k, n]) => `${n} × ${k}`).join(', ')} removed on ${plural(done.pages, 'page')}.`),
        left.length ? note(h('span', null, 'Still found in the redacted file: ', left.map((x) => `${x.value} (${x.where})`).join('; '), '. Choose those places too, or draw a box over them, and redact again.'), 'warn')
          : note('Read again: none of the redacted text is anywhere in the new file — not in the pages’ text, the document’s details, bookmarks or comments.', 'ok'),
        done.scrubbed.length ? h('p', { class: 'muted small' }, `Also removed: ${done.scrubbed.join('; ')}.`) : null,
        done.bookmarks ? h('p', { class: 'muted small' }, `${plural(done.bookmarks, 'bookmark')} that named a redacted value renamed “(redacted)”.`) : null,
        h('div', { class: 'row' }, button(ctx.isMobile ? 'Share or save' : 'Download', () => savePdfFile(bytes, name, ctx.isMobile), { variant: 'primary', icon: 'Download' })),
        h('p', { class: 'muted small' }, `${name} · ${(bytes.length / 1024).toFixed(0)} KB`)));
      result.querySelector('button')?.focus();
    } catch (e) { prog.done(); if (my === seq) toast(`Could not redact: ${errMsg(e)}`, 'err'); }
  }

  root.append(stack(
    card(null, inp.el, info, prog),
    card('What to find', kindChips, field('Words to find too (names, an address …)', wordsBox), picToggle, scrubToggle, h('div', { class: 'row' }, findBtn)),
    card('Places found', summary, list, h('div', { class: 'row' }, drawBtn, h('span', { class: 'muted small' }, 'Tap a box on a page to keep or redact it; draw boxes over anything else — a photo, a signature, an address.')), pagesEl),
    result,
    note('Redaction here removes the text itself, blacks out the pictures’ pixels and draws a black box where it stood — the redacted file is read again before you get it. Nothing leaves this device.', 'info'),
    actions(redactBtn)));
  return () => { gone = true; seq++; io?.disconnect(); doc = null; };
};
