// Safe ID Copy (potentials #93; owner, 21 Nov 2026): before an Aadhaar, PAN, passport or driving-licence copy is sent for KYC —
// the first 8 digits of an Aadhaar number hidden (the last 4 shown, as UIDAI's own masked Aadhaar shows them), a VID's first
// 12, a QR code that holds the full number covered, "For <purpose> only · <date>" stamped across it, and the result flattened
// into pictures — a PDF of pictures or one picture — so the stamp cannot be lifted off. A photo (the card found and
// straightened by the OCR tab's reading path) or a PDF (an e-Aadhaar: its password asked for). PC + phones.
import { h, card, field, stack, note, actions, button, toggle, input, segmented, slider, progress, clear, toast, errMsg, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { imagePicker } from '../lib/imgtools';
import { pdfInput, type LoadedPdf } from '../lib/pdfui';
import { loadImg, encodeImg, previewOf } from '../lib/imgio';
import { imgproc, imgprocDirect } from '../wasm/imgproc';
import { SIZE, startQuad, type Found } from '../lib/pagefind';
import { findPage } from '../lib/pagefind-client';
import { mupdf, signatureCount } from '../lib/pdf';
import { devcore } from '../wasm/devcore';
import { pageText, type PageText } from '../lib/redact';
import { findCodes } from '../lib/codesread';
import { ocrPageText, idShapes, mergeHits, digitCovers, qrNumber, stampText, packPages, copyName, expandQuad, quadSize, type Cover, type Hit, type Rect } from '../lib/idcopy';
import { today } from '../lib/form';
import { placeMarks } from '../lib/wmlayout';
import { plural } from '../lib/dates';
import type { Img } from '../wasm/imgproc';
import './idcopy.css';

// the choices, kept while the page is open (another tab and back)
let purpose = '', day = '', colour: 'red' | 'blue' | 'black' = 'red', strength = 30, hideAadhaar = true, hideVid = true, allQr = false;
const COLOURS = { red: '#c62828', blue: '#1d4ed8', black: '#111827' } as const;
/** the longest side a picture keeps in the copy: an ID card's details stay sharp, the PDF stays small */
const MAX_SIDE = 2400;

interface Item { name: string; pic: Img; base: HTMLCanvasElement; covers: Cover[]; how: string; view?: HTMLCanvasElement }
let nid = 0;

/** The page's text from MuPDF with its boxes in the drawing's pixels (the page drawn at `s` px a point from its bounds). */
function scaled(pt: PageText, s: number, b: number[]): PageText {
  return { ...pt, quads: pt.quads.map((q) => (q ? q.map((v, i) => (v - (i % 2 ? b[1] : b[0])) * s) : null)) };
}

/** a box over the digits: white, with "XXXX XXXX" as UIDAI's masked Aadhaar prints it; a QR code: white, framed, said;
 *  a box drawn by hand: black */
function drawCover(g: CanvasRenderingContext2D, c: Cover, k: number) {
  const [x0, y0, x1, y1] = c.rect.map((v) => v * k), w = x1 - x0, hh = y1 - y0;
  if (c.kind === 'box') { g.fillStyle = '#000'; g.fillRect(x0, y0, w, hh); return; }
  g.fillStyle = '#fff'; g.fillRect(x0, y0, w, hh);
  const t = c.kind === 'qr' ? 'QR code hidden' : c.kind === 'vid' ? 'XXXX XXXX XXXX' : 'XXXX XXXX';
  if (c.kind === 'qr') { g.strokeStyle = '#9ca3af'; g.lineWidth = Math.max(1, w * 0.012); g.strokeRect(x0 + g.lineWidth, y0 + g.lineWidth, w - 2 * g.lineWidth, hh - 2 * g.lineWidth); }
  let px = c.kind === 'qr' ? hh * 0.12 : hh * 0.66;
  g.font = `700 ${px}px system-ui, sans-serif`;
  const tw = g.measureText(t).width;
  if (tw > w * 0.94) { px *= (w * 0.94) / tw; g.font = `700 ${px}px system-ui, sans-serif`; }
  g.fillStyle = c.kind === 'qr' ? '#6b7280' : '#1f2937'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(t, x0 + w / 2, y0 + hh / 2);
}

/** "For … only · date" in rows across the whole picture, turned 30°: no part of the copy can be cut off without it */
function drawStamp(g: CanvasRenderingContext2D, W: number, H: number, text: string, color: string, alpha: number) {
  const S = Math.min(W, H), px = Math.max(9, S * 0.05);
  g.save(); g.font = `700 ${px}px system-ui, sans-serif`;
  const tw = g.measureText(text).width;
  const places = placeMarks(W, H, { pos: 'tile', size: 5, margin: 0, angle: -30, fill: 1 }, { w: tw / px, h: 1, row: 1.3, logo: false });
  g.globalAlpha = alpha; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of places) { g.save(); g.translate(p.cx, p.cy); g.rotate((p.rot * Math.PI) / 180); g.fillText(text, 0, 0); g.restore(); }
  g.restore();
}

/** The copy of one picture at `k` × its size: the picture, its covers, the stamp. */
function compose(it: Item, k: number): HTMLCanvasElement {
  const W = Math.max(1, Math.round(it.pic.width * k)), H = Math.max(1, Math.round(it.pic.height * k));
  const c = h('canvas', { width: W, height: H }) as HTMLCanvasElement, g = c.getContext('2d')!;
  g.drawImage(it.base, 0, 0, W, H);
  for (const cv of it.covers) if (cv.on) drawCover(g, cv, k);
  drawStamp(g, W, H, stampText(purpose, day), COLOURS[colour], strength / 100);
  return c;
}

/** The PDF: A4 pages of the pictures as JPEGs, placed as `packPages` says — nothing on a page but pictures. */
async function picturesPdf(jpegs: Uint8Array[], pages: ReturnType<typeof packPages>): Promise<Uint8Array> {
  const m: any = await mupdf(), doc = new m.PDFDocument(), PH = 841.89, f = (n: number) => n.toFixed(3);
  for (const pl of pages) {
    const xo: Record<string, any> = {}; let ops = '';
    pl.forEach((p, k) => { xo[`I${k}`] = doc.addImage(new m.Image(jpegs[p.i])); ops += `q ${f(p.w)} 0 0 ${f(p.h)} ${f(p.x)} ${f(PH - p.y - p.h)} cm /I${k} Do Q\n`; });
    doc.insertPage(-1, doc.addPage([0, 0, 595.28, PH], 0, doc.addObject({ XObject: xo }), ops));
  }
  return doc.saveToBuffer('compress,garbage').asUint8Array();
}

export const mount: Mount = (root, ctx) => {
  let alive = true, queue: Promise<void> = Promise.resolve(), drawing = false, signed = false, pdfs = 0, finderTried = false, finderErr = '';
  if (!day) day = today();
  const items: Item[] = [];
  const prog = progress();
  const list = h('div', { class: 'stack idc-items' });
  const result = h('div', { class: 'stack' });
  const stampLine = h('div', { class: 'idc-stamp-line', 'aria-live': 'polite' });
  const notes = h('div', { class: 'stack' });

  // ---------------------------------------------------------------- what is hidden on a picture
  async function coversOf(pt: PageText, pic: Img): Promise<Cover[]> {
    const ids = await devcore('ids');
    const scan = ids.json<Hit[]>('ids:scan', { text: pt.text, kinds: ['aadhaar'], words: [] });
    const covers = digitCovers(pt, mergeHits(scan, idShapes(pt.text)), { aadhaar: hideAadhaar, vid: hideVid });
    for (const c of await findCodes(pic)) {
      const num = qrNumber(c.text), [x0, y0, x1, y1] = c.box, pad = Math.max(4, (x1 - x0) * 0.06);
      covers.push({
        id: `q${++nid}`, kind: 'qr', rect: [x0 - pad, y0 - pad, x1 + pad, y1 + pad] as Rect, on: !!num || allQr, text: num ? 'full' : '',
        label: num ? `QR code that holds the full number (ending ${num.slice(-4)})` : 'QR code — no full Aadhaar number in it',
      });
    }
    return covers;
  }
  const baseOf = (pic: Img) => { const c = h('canvas', { width: pic.width, height: pic.height }) as HTMLCanvasElement; c.getContext('2d')!.putImageData(new ImageData(pic.data as Uint8ClampedArray<ArrayBuffer>, pic.width, pic.height), 0, 0); return c; };
  const capped = (pic: Img): Img => {
    const k = Math.min(1, MAX_SIDE / Math.max(pic.width, pic.height));
    if (k >= 1) return pic;
    const c = baseOf(pic), W = Math.round(pic.width * k), H = Math.round(pic.height * k), d = h('canvas', { width: W, height: H }) as HTMLCanvasElement, g = d.getContext('2d')!;
    g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, W, H);
    const id = g.getImageData(0, 0, W, H); return { data: id.data, width: W, height: H };
  };

  // ---------------------------------------------------------------- photos in: the card found and straightened, read
  const addPhotos = (files: File[]) => (queue = queue.then(async () => {
    for (const [n, f] of files.entries()) {
      if (!alive) return;
      const of = files.length > 1 ? `Photo ${n + 1} of ${files.length}: ` : '';
      try {
        prog.set(null, `${of}finding the card or page${finderTried ? '' : ' (the finder is fetched once, about 5 MB)'}…`);
        const photo = await loadImg(f);
        // the card found by the Doc Scanner's finder (its network, else the outline of the card), straightened with a
        // margin round it: the copy shows the whole card (the OCR's own page finder keeps the light part of a page — a
        // card's dark band along its top was left out)
        const ip = await imgprocDirect(), small = previewOf(photo, 1100);
        let found: Found | null = null;
        finderTried = true;
        try { found = await findPage(ip.resizeArea(small, SIZE, SIZE).data); finderErr = ''; } catch (e) { if (!alive) return; finderErr = errMsg(e); }
        const at = startQuad(found, ip.detectQuad(small), small.width, small.height);
        let card = photo;
        if (at.from !== 'whole') {
          const q = expandQuad(at.quad), [w, hh] = quadSize(q, photo.width, photo.height);
          card = await imgproc('warp', photo, q.map((v, i) => v * (i % 2 ? photo.height : photo.width)), w, hh);
        }
        const { readPage } = await import('../lib/readpage');
        if (!alive) return;
        // read as it is (the card is straight already), set upright and level
        const reading = await readPage(card, {
          lang: 'eng', clean: false, auto: true, stale: () => !alive,
          onProgress: (p, st) => { if (/recogn/i.test(st)) prog.set(p, `${of}reading it… ${Math.round(p * 100)} %`); else prog.set(null, `${of}loading the text engine…`); },
        });
        if (!reading || !alive) return;
        const scale = Math.min(1, MAX_SIDE / Math.max(reading.pre.width, reading.pre.height));
        const pic = capped(reading.pre), r = reading.r;
        const pt = ocrPageText(scale < 1 ? { ...r, words: r.words.map((w) => ({ ...w, x0: w.x0 * scale, y0: w.y0 * scale, x1: w.x1 * scale, y1: w.y1 * scale })) } : r);
        const covers = await coversOf(pt, pic);
        if (!alive) return;
        items.push({ name: f.name, pic, base: baseOf(pic), covers, how: at.from !== 'whole' ? 'the card or page was found and straightened' : `no edge of a card or page was found — the photo as it is${finderErr ? ` (the finder could not be fetched: ${finderErr})` : ''}` });
        show();
      } catch (e) { if (alive) toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    prog.done();
  }));

  // ---------------------------------------------------------------- a PDF in (an e-Aadhaar): each page drawn, its numbers found
  const addPdf = (x: LoadedPdf) => (queue = queue.then(async () => {
    try {
      const m: any = await mupdf(), doc: any = x.doc, n = doc.countPages();
      pdfs++; if (signatureCount(doc)) signed = true;
      for (let i = 0; i < n; i++) {
        if (!alive) return;
        prog.set(i / n, `${x.name}: page ${i + 1} of ${n}…`);
        const page = doc.loadPage(i), b = page.getBounds(), W = b[2] - b[0], H = b[3] - b[1];
        const s = Math.min(200 / 72, MAX_SIDE / Math.max(W, H));
        const pix = page.toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceRGB, false, true);
        const rgb = pix.getPixels(), pw = pix.getWidth(), ph = pix.getHeight(), data = new Uint8ClampedArray(pw * ph * 4);
        for (let a = 0, c = 0; a < rgb.length; a += 3, c += 4) { data[c] = rgb[a]; data[c + 1] = rgb[a + 1]; data[c + 2] = rgb[a + 2]; data[c + 3] = 255; }
        pix.destroy?.();
        const pic: Img = { data, width: pw, height: ph };
        let pt = scaled(pageText(page), s, b);
        // a page that is a picture (a scan, a photo saved as PDF): its text read by the OCR
        if (pt.text.replace(/\s/g, '').length < 20) {
          prog.set(null, `${x.name}: reading page ${i + 1} (a picture)…`);
          const { recognize } = await import('../lib/ocr');
          if (!alive) return;
          pt = ocrPageText(await recognize(new ImageData(data, pw, ph), 'eng', undefined, 'page'));
        }
        const covers = await coversOf(pt, pic);
        if (!alive) return;
        items.push({ name: n > 1 ? `${x.name} · page ${i + 1}` : x.name, pic, base: baseOf(pic), covers, how: x.password !== undefined ? 'a page of the PDF (its password was asked for; the copy has none)' : 'a page of the PDF' });
        show();
      }
    } catch (e) { if (alive) toast(`${x.name}: ${errMsg(e)}`, 'err'); }
    prog.done();
  }));

  // ---------------------------------------------------------------- the pictures, with what is hidden
  function said(it: Item): string {
    const on = it.covers.filter((c) => c.on), digits = on.filter((c) => c.kind === 'aadhaar' || c.kind === 'vid');
    const ends = [...new Set(digits.map((c) => `${c.kind === 'vid' ? 'VID' : 'Aadhaar number'} ending ${c.text}`))];
    const qr = on.filter((c) => c.kind === 'qr').length, boxes = on.filter((c) => c.kind === 'box').length;
    const parts = [ends.length ? `${ends.join(', ')} — ${plural(digits.length, 'place')} hidden` : '', qr ? `${plural(qr, 'QR code')} covered` : '', boxes ? `${boxes} box${boxes === 1 ? '' : 'es'} of your own` : ''].filter(Boolean);
    const none = !it.covers.some((c) => c.kind === 'aadhaar' || c.kind === 'vid');
    return parts.join(' · ') + (none ? `${parts.length ? ' · ' : ''}No Aadhaar number or VID was read here — if the picture has one, draw a box over its first 8 digits.` : '');
  }
  function show() {
    clear(list);
    items.forEach((it, idx) => {
      const k = Math.min(1, 900 / it.pic.width);
      const view = compose(it, k); view.setAttribute('aria-hidden', 'true'); it.view = view;
      const wrap = h('div', { class: ['idc-view', drawing && 'idc-drawing'], style: `aspect-ratio: ${it.pic.width} / ${it.pic.height}` }, view);
      for (const c of it.covers) {
        const [x0, y0, x1, y1] = c.rect;
        // a pointer's shortcut to the tick in the list below (the list is the control for the keyboard and screen readers)
        wrap.append(h('div', {
          class: ['idc-cover', c.on ? 'on' : 'off'], 'aria-hidden': 'true', title: `${c.label}: ${c.on ? 'hidden — click to show it' : 'shown — click to hide it'}`,
          style: `left:${(x0 / it.pic.width) * 100}%;top:${(y0 / it.pic.height) * 100}%;width:${((x1 - x0) / it.pic.width) * 100}%;height:${((y1 - y0) / it.pic.height) * 100}%`,
          onclick: (e: Event) => { e.stopPropagation(); if (!drawing) { c.on = !c.on; show(); } },
        }));
      }
      wireDrawing(wrap, it);
      const rows = it.covers.map((c) => {
        const cb = h('input', { type: 'checkbox', checked: c.on, onchange: () => { c.on = cb.checked; show(); } }) as HTMLInputElement;
        return h('label', { class: 'idc-row' }, cb, h('span', null, c.kind === 'box' ? 'A box you drew' : c.label),
          c.kind === 'box' ? button('Remove', () => { it.covers = it.covers.filter((y) => y !== c); show(); }, { small: true, variant: 'ghost', icon: 'X' }) : null);
      });
      list.append(card(it.name,
        h('div', { class: 'muted small' }, it.how),
        h('div', { class: 'idc-said' }, said(it)),
        wrap,
        rows.length ? h('div', { class: 'idc-rows', role: 'group', 'aria-label': `What is hidden on ${it.name}` }, ...rows) : null,
        h('div', { class: 'row' },
          button('Move up', () => { items.splice(idx - 1, 0, ...items.splice(idx, 1)); show(); }, { small: true, variant: 'ghost', icon: 'ArrowUp', disabled: idx === 0 }),
          button('Remove', () => { items.splice(idx, 1); show(); }, { small: true, variant: 'ghost', icon: 'Trash2' }))));
    });
    saveBtn.disabled = picBtn.disabled = !items.length;
    drawBtn.hidden = !items.length;
    clear(notes);
    if (pdfs) notes.append(note(`The copy is made of pictures of the pages: it no longer carries ${signed ? 'the PDF’s digital signature (an e-Aadhaar’s proves it came from UIDAI)' : 'any digital signature the PDF had'} — whoever must check that needs the original file.`, 'info'));
    clear(result);
  }
  function wireDrawing(el: HTMLElement, it: Item) {
    let start: [number, number] | null = null, temp: HTMLElement | null = null;
    const at = (e: PointerEvent): [number, number] => { const r = el.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    el.addEventListener('pointerdown', (e) => {
      if (!drawing) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); start = at(e);
      temp = h('div', { class: 'idc-cover drawing' }); el.append(temp);
    });
    el.addEventListener('pointermove', (e) => {
      if (!start || !temp) return; const p = at(e);
      Object.assign(temp.style, { left: `${Math.min(start[0], p[0]) * 100}%`, top: `${Math.min(start[1], p[1]) * 100}%`, width: `${Math.abs(p[0] - start[0]) * 100}%`, height: `${Math.abs(p[1] - start[1]) * 100}%` });
    });
    el.addEventListener('pointerup', (e) => {
      if (!start) return; const p = at(e), s0 = start; start = null; temp?.remove(); temp = null;
      const r: Rect = [Math.min(s0[0], p[0]) * it.pic.width, Math.min(s0[1], p[1]) * it.pic.height, Math.max(s0[0], p[0]) * it.pic.width, Math.max(s0[1], p[1]) * it.pic.height];
      if (r[2] - r[0] < 4 || r[3] - r[1] < 4) return;
      it.covers.push({ id: `b${++nid}`, kind: 'box', rect: r, label: 'A box you drew', on: true });
      show();
    });
    el.addEventListener('pointercancel', () => { start = null; temp?.remove(); temp = null; });
  }

  // ---------------------------------------------------------------- the copy saved
  async function save(kind: 'pdf' | 'jpg') {
    if (!items.length) { toast('Add a photo or a PDF first.', 'info'); return; }
    prog.set(null, 'Making the copy…'); clear(result);
    try {
      const name = copyName(items[0].name.replace(/ · page \d+$/, ''));
      const full = items.map((it) => compose(it, 1));
      let blob: Blob, file: string, what: string;
      if (kind === 'pdf') {
        const jpegs: Uint8Array[] = [];
        for (const c of full) { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height); jpegs.push(new Uint8Array(await (await encodeImg({ data: d.data, width: d.width, height: d.height }, 'jpeg', 86)).arrayBuffer())); }
        const pages = packPages(full.map((c) => ({ w: c.width, h: c.height })));
        const bytes = await picturesPdf(jpegs, pages);
        blob = new Blob([bytes as BlobPart], { type: 'application/pdf' }); file = `${name}.pdf`;
        what = `${plural(items.length, 'picture')} on ${plural(pages.length, 'A4 page')}`;
      } else {
        // one picture: the copies one under another on white, as wide as the widest
        const gap = 40, W = Math.max(...full.map((c) => c.width)), H = full.reduce((a, c) => a + c.height, 0) + gap * (full.length - 1);
        const k = Math.min(1, 16000 / H, Math.sqrt(100e6 / (W * H)));
        const out = h('canvas', { width: Math.round(W * k), height: Math.round(H * k) }) as HTMLCanvasElement, g = out.getContext('2d')!;
        g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
        let y = 0; for (const c of full) { g.drawImage(c, ((W - c.width) / 2) * k, y * k, c.width * k, c.height * k); y += c.height + gap; }
        const d = g.getImageData(0, 0, out.width, out.height);
        blob = await encodeImg({ data: d.data, width: d.width, height: d.height }, 'jpeg', 88); file = `${name}.jpg`;
        what = `one picture of ${out.width} × ${out.height} px`;
      }
      prog.done();
      if (!alive) return;
      const hidden = items.reduce((a, it) => a + it.covers.filter((c) => c.on).length, 0);
      // a PC saves at once; a phone shares from a tap of its own (sharing needs a fresh tap, and the copy took a moment)
      if (!ctx.isMobile) downloadBlob(blob, file);
      clear(result).append(card('Your safe copy',
        note(`${file}: ${what}, ${fmtBytes(blob.size)} · ${plural(hidden, 'place')} hidden · stamped “${stampText(purpose, day)}”. It is pictures only: the stamp and the boxes cannot be lifted off.`, 'ok'),
        h('div', { class: 'row' },
          button(ctx.isMobile ? 'Share or save' : 'Download again', () => (ctx.isMobile ? shareOrDownload(blob, file) : downloadBlob(blob, file)), { variant: ctx.isMobile ? 'primary' : 'ghost', icon: 'Download' }))));
      if (ctx.isMobile) result.querySelector('button')?.focus();
    } catch (e) { prog.done(); toast(`Could not make the copy: ${errMsg(e)}`, 'err'); }
  }

  // ---------------------------------------------------------------- the page
  const redraw = () => { stampLine.textContent = `Stamp: ${stampText(purpose, day)}`; for (const it of items) if (it.view) { const c = compose(it, it.view.width / it.pic.width); it.view.getContext('2d')!.drawImage(c, 0, 0); } };
  const purposeBox = input({ placeholder: 'KYC with HDFC Bank', value: purpose, onInput: (v) => { purpose = v; redraw(); }, attrs: { maxlength: 60, 'aria-label': 'What the copy is for' } });
  const dateBox = input({ type: 'date', value: day, onInput: (v) => { day = v; redraw(); }, attrs: { 'aria-label': 'The date on the stamp' } });
  const colourSeg = segmented<'red' | 'blue' | 'black'>([['red', 'Red'], ['blue', 'Blue'], ['black', 'Black']], colour, (v) => { colour = v; redraw(); });
  const strengthS = slider({ label: 'Stamp strength', min: 15, max: 60, value: strength, unit: ' %', onInput: (v) => { strength = v; redraw(); } });
  const tAadhaar = toggle('Hide the first 8 digits of Aadhaar numbers', hideAadhaar, (v) => { hideAadhaar = v; for (const it of items) for (const c of it.covers) if (c.kind === 'aadhaar') c.on = v; show(); });
  const tVid = toggle('Hide the first 12 digits of VIDs', hideVid, (v) => { hideVid = v; for (const it of items) for (const c of it.covers) if (c.kind === 'vid') c.on = v; show(); });
  const tQr = toggle('Cover every QR code (one that holds the full number is always covered)', allQr, (v) => { allQr = v; for (const it of items) for (const c of it.covers) if (c.kind === 'qr' && !c.text) c.on = v; show(); });
  const drawBtn = button('Draw a box', () => { drawing = !drawing; drawBtn.setAttribute('aria-pressed', String(drawing)); list.querySelectorAll('.idc-view').forEach((v) => v.classList.toggle('idc-drawing', drawing)); }, { icon: 'SquareDashed' });
  drawBtn.setAttribute('aria-pressed', 'false'); drawBtn.hidden = true;
  const saveBtn = button(ctx.isMobile ? 'PDF' : 'Save PDF', () => save('pdf'), { variant: 'primary', icon: 'FileDown', disabled: true });
  const picBtn = button(ctx.isMobile ? 'Picture' : 'Save picture', () => save('jpg'), { icon: 'Image', disabled: true });
  const photos = imagePicker({
    accept: 'image/*,.heic,.heif', multiple: true,
    label: ctx.isMobile ? 'Choose photos of the card' : 'Add photos of the ID',
    hint: ctx.isMobile ? 'its front and back — or use the camera, the whole card in the picture' : 'the front and the back: the card is found, straightened and read',
    onFiles: (f) => addPhotos(f),
  });
  const pdfIn = pdfInput({ label: 'Add a PDF (an e-Aadhaar)', onLoad: (xs) => { for (const x of xs) addPdf(x); } });
  stampLine.textContent = `Stamp: ${stampText(purpose, day)}`;
  root.append(stack(
    card(null, photos, pdfIn.el, prog),
    card('The stamp', field('For … only', purposeBox), field('Date', dateBox), field('Colour', colourSeg), strengthS, stampLine),
    card('What is hidden', tAadhaar, tVid, tQr,
      h('p', { class: 'muted small' }, 'UIDAI’s own masked Aadhaar hides the same first 8 digits. A service that needs the full number will ask for it.')),
    h('div', { class: 'row' }, drawBtn, h('span', { class: 'muted small' }, 'Tap a box on a picture to show or hide what is under it; draw boxes over anything else — a photo, an address, a signature.')),
    list, notes, result,
    note('Everything happens on this device: the pictures, the numbers read and the copy never leave it.', 'info'),
    actions(saveBtn, picBtn)));
  return () => { alive = false; items.length = 0; };
};
