// Sign PDF (draw / type / photo of a signature → placed on the page as a transparent image, optional date) and
// Fill PDF Form (AcroForm fields: text, check boxes, radio buttons, lists; or type anywhere on a page). MuPDF wasm.
import { h, card, field, stack, note, actions, button, segmented, slider, toggle, input, select, clear, errMsg, toast, type Mount } from '../ui';
import { mupdf, savePdf, stampPage, pageGeom, renderPage, pdfString, isLatin1, openPdf, textRuns, TICKS } from '../lib/pdf';
import { pdfInput, savePdfFile, stem, type LoadedPdf } from '../lib/pdfui';
import { imgproc, type Img } from '../wasm/imgproc';
import { encodeImg } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { HAND_FONTS, renderStrokes, trim, typedSignature } from './signature';

type Doc = LoadedPdf['doc'];
const fresh = async (f: LoadedPdf): Promise<Doc> => openPdf(f.bytes, f.password); // a new copy to write into
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

/** Page preview with navigation; items are positioned in page fractions (x, y from the top-left, w of the width). */
function pageStage(onTap?: (fx: number, fy: number, page: number) => void) {
  let f: LoadedPdf | null = null, page = 0, tok = 0;
  const canvas = h('canvas', { class: 'pdfs-canvas', 'aria-label': 'Page preview' });
  const layer = h('div', { class: 'pdfs-layer' });
  const wrap = h('div', { class: 'pdfs-wrap' }, canvas, layer);
  const label = h('span', { class: 'muted small' });
  const prev = button('', () => go(page - 1), { icon: 'ChevronLeft', small: true, variant: 'ghost', title: 'Previous page' });
  const next = button('', () => go(page + 1), { icon: 'ChevronRight', small: true, variant: 'ghost', title: 'Next page' });
  const listeners: Array<() => void> = [];
  const draw = async () => {
    if (!f) return;
    const my = ++tok, g = pageGeom(f.doc.loadPage(page) as any), target = Math.min(900, Math.max(320, wrap.parentElement?.clientWidth || 600)) * Math.min(2, devicePixelRatio || 1);
    const pix = await renderPage(f.doc, page, target / g.W, false);
    if (my !== tok) return;
    const w = pix.getWidth(), hh = pix.getHeight(), rgba = await imgproc('expand', pix.getPixels(), w, hh, pix.getNumberOfComponents());
    canvas.width = w; canvas.height = hh;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), w, hh), 0, 0);
    label.textContent = `Page ${page + 1} of ${f.pages}`;
    prev.disabled = page === 0; next.disabled = page >= f.pages - 1;
    listeners.forEach((l) => l());
  };
  const go = (p: number) => { if (!f) return; page = Math.max(0, Math.min(f.pages - 1, p)); draw(); };
  if (onTap) wrap.addEventListener('click', (e) => { if (e.target !== canvas && e.target !== layer) return; const r = canvas.getBoundingClientRect(); onTap((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, page); });
  return {
    el: h('div', { class: 'stack' }, h('div', { class: 'row pdfs-nav' }, prev, label, next), wrap),
    layer, wrap,
    load(x: LoadedPdf) { f = x; page = 0; draw(); },
    get page() { return page; },
    /** Height ÷ width of the page shown. */
    get aspect() { return canvas.width ? canvas.height / canvas.width : Math.SQRT2; },
    go,
    onDraw(fn: () => void) { listeners.push(fn); },
  };
}

/** Make an element draggable inside its positioned parent; reports position as fractions. */
function draggable(el: HTMLElement, onMove: (fx: number, fy: number) => void) {
  let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
  el.addEventListener('pointerdown', (e) => { on = true; el.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; e.preventDefault(); });
  el.addEventListener('pointermove', (e) => {
    if (!on) return;
    const P = el.parentElement!, x = Math.max(0, Math.min(P.clientWidth - el.offsetWidth, ox + e.clientX - sx)), y = Math.max(0, Math.min(P.clientHeight - el.offsetHeight, oy + e.clientY - sy));
    el.style.left = `${(x / P.clientWidth) * 100}%`; el.style.top = `${(y / P.clientHeight) * 100}%`;
    onMove(x / P.clientWidth, y / P.clientHeight);
  });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, () => (on = false));
}

// ------------------------------------------------------------------ Sign PDF
export const sign: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, sig: Img | null = null, sigUrl = '';
  let mode: 'draw' | 'type' | 'photo' = 'draw', ink = '#0b2a8a', typed = '', font = HAND_FONTS[0][0];
  // the signature belongs to the page it was put on (saving put it on whatever page was being looked at)
  const pos = { fx: 0.6, fy: 0.78, fw: 0.28, page: -1 }; let allPages = false, withDate = false, photoSeq = 0, sigSeq = 0;
  // signature sources
  const pad = h('canvas', { class: 'sig-pad pdfs-pad', 'aria-label': 'Draw your signature here' });
  const strokes: Array<{ pts: Array<{ x: number; y: number; p: number }>; color: string; width: number }> = [];
  let drawing = false;
  const redrawPad = () => {
    const r = pad.getBoundingClientRect(), s = devicePixelRatio || 1;
    if (!r.width || !r.height) return; // hidden (another mode is shown)
    pad.width = Math.round(r.width * s); pad.height = Math.round(r.height * s);
    if (!strokes.length) { pad.getContext('2d')!.clearRect(0, 0, pad.width, pad.height); return; }
    const img = renderStrokes(strokes as any, r.width, r.height, s);
    pad.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  };
  const pt = (e: PointerEvent) => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; };
  // strokes are in the pad's CSS pixels: a narrower pad (a smaller window, a phone turned) would cut the signature
  let padW = 0, padH = 0;
  new ResizeObserver(() => {
    const r = pad.getBoundingClientRect(); if (!r.width || !r.height) return;
    const k = padW ? Math.min(r.width / padW, r.height / padH) : 1;
    if (k < 1) for (const st of strokes) { st.width *= k; for (const q of st.pts) { q.x *= k; q.y = r.height / 2 + (q.y - padH / 2) * k; } } // kept in the middle of the pad's height
    padW = r.width; padH = r.height; redrawPad();
  }).observe(pad);
  pad.addEventListener('pointerdown', (e) => { drawing = true; pad.setPointerCapture(e.pointerId); strokes.push({ pts: [pt(e)], color: ink, width: 2.6 }); redrawPad(); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (!drawing) return; strokes[strokes.length - 1].pts.push(pt(e)); redrawPad(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) pad.addEventListener(ev, () => { if (drawing) { drawing = false; makeSig(); } });
  const typeIn = input({ placeholder: 'Type your name', onInput: (v) => { typed = v; makeSig(); } });
  const photo = imageInput(async (img) => {
    const my = ++photoSeq;
    try {
      const s = await imgproc('resize', img, Math.min(img.width, 1600), Math.round(img.height * Math.min(1, 1600 / img.width)));
      const ink2 = await imgproc('inkToAlpha', s, parseInt(ink.slice(1), 16), false, 1);
      const t = await trim(ink2).catch(() => { throw new Error('No ink was found in the photo — sign on plain white paper with a dark pen, and photograph it in even light.'); });
      if (my !== photoSeq) return; // a newer photo
      sigSeq++; sig = t; show();
    } catch (e) { if (my === photoSeq) toast(errMsg(e), 'err'); }
  }, { label: 'Photo of your signature on white paper', capture: ctx.isMobile ? 'environment' : undefined, cameraLabel: 'Photograph your signature' });
  // a signature made in the background must not come back after "Clear" or after newer strokes / text / mode
  const makeSig = async () => {
    const my = ++sigSeq;
    try {
      let made: Img | null = null;
      if (mode === 'draw') { const r = pad.getBoundingClientRect(); if (!strokes.length || !r.width) return; made = await trim(renderStrokes(strokes as any, r.width, r.height, 3)); }
      else if (mode === 'type') { if (!typed.trim()) return; made = await trim(await typedSignature(typed, font, ink, 120)); }
      if (!made || my !== sigSeq) return;
      sig = made; show();
    } catch { /* nothing drawn yet */ }
  };
  const overlay = h('div', { class: 'pdfs-item pdfs-sig', hidden: true, title: 'Drag to move' }, h('img', { alt: 'Your signature' }), h('div', { class: 'pdfs-date', hidden: true }));
  draggable(overlay, (x, y) => { pos.fx = x; pos.fy = y; pos.page = stage.page; place(); });
  const where = h('p', { class: 'muted small', 'aria-live': 'polite' });
  /** Keep the signature (and the date under it) on the page — a tap near the bottom put part of it below the page. */
  const place = () => {
    const ar = stage.aspect, aspect = sig ? sig.height / sig.width : 0.35;
    const sigH = (pos.fw * aspect) / ar, dateH = withDate ? (pos.fw * 0.13) / ar : 0;
    pos.fx = Math.max(0, Math.min(pos.fx, 1 - pos.fw)); pos.fy = Math.max(0, Math.min(pos.fy, 1 - sigH - dateH));
    overlay.style.left = `${pos.fx * 100}%`; overlay.style.top = `${pos.fy * 100}%`; overlay.style.width = `${pos.fw * 100}%`;
    (overlay.lastChild as HTMLElement).hidden = !withDate; (overlay.lastChild as HTMLElement).textContent = today();
    overlay.hidden = !sig || (!allPages && pos.page !== stage.page);
    where.textContent = !sig ? '' : allPages ? 'Your signature goes on every page.' : pos.page === stage.page ? `Your signature is on this page (${pos.page + 1}).` : `Your signature is on page ${pos.page + 1} — tap this page to move it here.`;
  };
  const show = async () => {
    if (!sig) return;
    const my = sigSeq, url = URL.createObjectURL(await encodeImg(sig, 'png'));
    if (my !== sigSeq || !sig) { URL.revokeObjectURL(url); return; } // cleared or replaced meanwhile
    if (sigUrl) URL.revokeObjectURL(sigUrl);
    sigUrl = url;
    (overlay.firstChild as HTMLImageElement).src = sigUrl;
    if (pos.page < 0) pos.page = stage.page; // a first signature lands on the page being looked at
    place();
  };
  const stage = pageStage((fx, fy, page) => { pos.fx = fx; pos.fy = fy; pos.page = page; place(); });
  stage.layer.append(overlay);
  stage.onDraw(place);
  const drawBox = stack(pad, h('div', { class: 'row' }, button('Clear', () => { sigSeq++; strokes.length = 0; redrawPad(); sig = null; place(); }, { small: true, variant: 'ghost', icon: 'Eraser' })));
  const typeBox = stack(typeIn, field('Style', select(HAND_FONTS.map(([fam, label]) => [fam, label] as [string, string]), font, (v) => { font = v; makeSig(); }))); typeBox.hidden = true;
  const photoBox = photo.el; photoBox.hidden = true;
  const inp = pdfInput({ onLoad: ([x]) => { f = x; pos.page = sig ? 0 : -1; stage.load(x); editor.hidden = false; requestAnimationFrame(redrawPad); } });
  const editor = h('div', { class: 'stack', hidden: true },
    card('1. Your signature', stack(
      segmented([['draw', 'Draw'], ['type', 'Type'], ['photo', 'Photo']], mode, (v) => { mode = v; drawBox.hidden = v !== 'draw'; typeBox.hidden = v !== 'type'; photoBox.hidden = v !== 'photo'; if (v === 'draw') requestAnimationFrame(redrawPad); makeSig(); }),
      drawBox, typeBox, photoBox,
      field('Ink', segmented([['#0b2a8a', 'Blue'], ['#111111', 'Black']], ink, (v) => { ink = v; strokes.forEach((s) => (s.color = v)); redrawPad(); makeSig(); })))),
    card('2. Place it', stack(stage.el, where,
      note(ctx.isMobile ? 'Tap the page to place the signature, then drag it.' : 'Click the page to place the signature, or drag it.'),
      slider({ label: 'Size', min: 8, max: 60, value: pos.fw * 100, unit: ' %', onInput: (v) => { pos.fw = v / 100; place(); } }),
      toggle('Add today’s date under it', withDate, (v) => { withDate = v; place(); }),
      toggle('Put it on every page (initials)', allPages, (v) => { allPages = v; place(); }))),
    note('This places an image of your signature (an “e-signature” as accepted by many forms); it is not a cryptographic digital signature.'));
  root.append(card(null, inp.el), editor,
    actions(button('Save signed PDF', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      if (!sig) throw new Error('Make your signature first (draw, type or photo).');
      const m = await mupdf(), doc = await fresh(f);
      const png = new Uint8Array(await (await encodeImg(sig, 'png')).arrayBuffer());
      const ref = doc.addImage(new m.Image(png)), aspect = sig.height / sig.width;
      const pages = allPages ? Array.from({ length: f.pages }, (_, i) => i) : [Math.max(0, Math.min(f.pages - 1, pos.page))];
      for (const i of pages) {
        await stampPage(doc, i, (W, H) => {
          // on the page whatever its shape (every page: pages may differ): the date's line above the bottom edge
          const w = pos.fw * W, hh = w * aspect, x = Math.max(0, Math.min(pos.fx * W, W - w)), y = Math.min(H - hh, Math.max(withDate ? w * 0.13 : 0, H - pos.fy * H - hh));
          const date = withDate ? ` BT /STF ${(w * 0.09).toFixed(2)} Tf 0 g ${x.toFixed(2)} ${(y - w * 0.11).toFixed(2)} Td ${pdfString(today())} Tj ET` : '';
          return `q ${w.toFixed(2)} 0 0 ${hh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /SIG Do Q${date}`;
        }, { font: withDate, images: { SIG: ref } });
      }
      await savePdfFile(savePdf(doc, f.password !== undefined ? 'encrypt=none' : ''), `${stem(f.name)}-signed.pdf`, ctx.isMobile);
    }, { variant: 'primary', icon: 'Signature' })));
  return () => { photo.dispose(); if (sigUrl) URL.revokeObjectURL(sigUrl); };
};

// ------------------------------------------------------------------ Fill PDF Form
type FieldUI = { name: string; kind: string; get: () => string | boolean; el: HTMLElement };
const onState = (w: any): string => { let s = 'Yes'; try { w.getObject().get('AP').get('N').forEach((_: any, k: any) => { if (k !== 'Off') s = String(k); }); } catch { /* default */ } return s; };

export const fill: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, flatten = false, size = 11;
  let fields: FieldUI[] = [];
  const boxes: Array<{ page: number; fx: number; fy: number; el: HTMLInputElement }> = [];
  const formBox = h('div', { class: 'stack' }), info = h('div', { class: 'muted small' });
  const stage = pageStage((fx, fy, page) => addBox(page, fx, fy));
  const addBox = (page: number, fx: number, fy: number) => {
    const el = input({ placeholder: 'Type here' }) as HTMLInputElement;
    el.classList.add('pdfs-textbox');
    const b = { page, fx, fy, el };
    const holder = h('div', { class: 'pdfs-item' }, el, button('', () => { holder.remove(); boxes.splice(boxes.indexOf(b), 1); }, { icon: 'X', small: true, variant: 'ghost', title: 'Remove this text' }));
    holder.style.left = `${fx * 100}%`; holder.style.top = `${fy * 100}%`; holder.dataset.page = String(page);
    stage.layer.append(holder); boxes.push(b); el.focus();
  };
  stage.onDraw(() => stage.layer.querySelectorAll<HTMLElement>('.pdfs-item').forEach((it) => (it.hidden = it.dataset.page !== String(stage.page))));
  const build = (x: LoadedPdf) => {
    fields = []; clear(formBox);
    const seen = new Map<string, any[]>();
    for (let p = 0; p < x.pages; p++) for (const w of (x.doc.loadPage(p) as any).getWidgets()) { const n = w.getName(); (seen.get(n) || seen.set(n, []).get(n))!.push(w); }
    for (const [name, ws] of seen) {
      const w = ws[0], kind = w.getFieldType(), label = w.getLabel() || name, ro = w.isReadOnly();
      let el: HTMLElement, get: () => string | boolean;
      if (kind === 'text') {
        const t = (w.isMultiline() ? h('textarea', { class: 'input textarea', rows: 3 }) : h('input', { class: 'input' })) as HTMLInputElement;
        t.value = w.getValue(); t.disabled = ro; if (w.getMaxLen() > 0) t.maxLength = w.getMaxLen(); get = () => t.value; el = field(label, t);
      } else if (kind === 'checkbox') {
        let v = w.getValue() !== 'Off' && w.getValue() !== ''; el = toggle(label, v, (x) => (v = x)); get = () => v;
      } else if (kind === 'radiobutton') {
        // nothing chosen in the PDF: nothing shown as chosen (the first option looked chosen but none was saved)
        const opts = ws.map(onState); let v = ws.find((r) => r.getValue() !== 'Off') ? w.getValue() : '';
        el = field(label, segmented(opts.map((o) => [o, o] as [string, string]), v, (x) => (v = x))); get = () => v || '';
      } else if (kind === 'combobox' || kind === 'listbox') {
        const opts = w.getOptions(); let v = w.getValue() || '';
        el = field(label, select([['', '—'], ...opts.map((o: string) => [o, o] as [string, string])], v, (x) => (v = x))); get = () => v;
      } else continue; // signature / push buttons: use Sign PDF
      if (ro) el.classList.add('muted');
      fields.push({ name, kind, get, el }); formBox.append(el);
    }
    info.textContent = fields.length ? `${fields.length} form field${fields.length > 1 ? 's' : ''} found.` : 'No form fields in this PDF — click on the page to type anywhere.';
  };
  const inp = pdfInput({ onLoad: ([x]) => { f = x; boxes.length = 0; stage.layer.replaceChildren(); stage.load(x); build(x); editor.hidden = false; } });
  const editor = h('div', { class: 'stack', hidden: true },
    card('Form fields', info, formBox),
    card('Type anywhere', stack(stage.el, note(ctx.isMobile ? 'Tap the page to add text there (names, dates, ticks ✓ ✗ …).' : 'Click the page to add text there (names, dates, ticks ✓ ✗ …).'),
      slider({ label: 'Text size', min: 7, max: 24, value: size, unit: ' pt', onInput: (v) => (size = v) }))),
    card(null, toggle('Flatten (the result can no longer be edited)', flatten, (v) => (flatten = v))));
  root.append(card(null, inp.el), editor,
    actions(button('Save filled PDF', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      const doc = await fresh(f), byName = new Map(fields.map((x) => [x.name, x]));
      for (let p = 0; p < f.pages; p++) {
        const page = doc.loadPage(p) as any;
        for (const w of page.getWidgets()) {
          const ui = byName.get(w.getName()); if (!ui || w.isReadOnly()) continue;
          const v = ui.get();
          if (ui.kind === 'text') { if (w.getValue() !== v) w.setTextValue(String(v)); }
          else if (ui.kind === 'checkbox') { if ((w.getValue() !== 'Off' && w.getValue() !== '') !== v) w.toggle(); }
          else if (ui.kind === 'radiobutton') { if (v && onState(w) === v && w.getValue() !== v) w.toggle(); }
          else if (v !== w.getValue()) w.setChoiceValue(String(v));
          w.update();
        }
        page.update();
      }
      for (const b of boxes) {
        const text = b.el.value.trim(); if (!text) continue;
        const plain = [...text].filter((c) => !(c in TICKS)).join('');
        if (!isLatin1(plain)) throw new Error(`“${text}”: typed text supports Latin letters and the ticks ✓ ✔ ✗ ✘ only${/₹/.test(plain) ? ' — write “Rs.” for ₹' : ''} — use a form field or Sign PDF → Type for other scripts.`);
        await stampPage(doc, b.page, (W, H) => `BT 0 g ${(b.fx * W + 2).toFixed(2)} ${(H - b.fy * H - size * 0.95).toFixed(2)} Td ${textRuns(text, size)}ET`, { font: true, ticks: plain.length !== text.length });
      }
      if (flatten) doc.bake(true, true);
      await savePdfFile(savePdf(doc, f.password !== undefined ? 'encrypt=none' : ''), `${stem(f.name)}-filled.pdf`, ctx.isMobile);
      // MuPDF draws fields with a built-in font of Latin, Greek and Cyrillic letters: a ₹ is saved in the value but
      // drawn as a gap (other viewers may draw it) — said rather than left to be found on paper
      if (fields.some((x) => x.kind === 'text' && /₹/.test(String(x.get())))) toast('Saved. The ₹ sign is in the field, but this form’s font has no ₹ — it shows as a gap in some PDF viewers (and when flattened). “Rs.” shows everywhere.', 'info', 9000);
    }, { variant: 'primary', icon: 'Download' })));
};
