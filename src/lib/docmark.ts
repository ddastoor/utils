// The Watermark tab's mark on every page of a document (to-do #17 — owner, 26 Nov 2026: "I should be able to upload a PDF
// or a Word document, and the style of the watermark chosen should be applied to every page of this PDF or Word
// document"). This file: the fonts a document gets for the tab's choice, the text's measured box, the PDF writer, and the
// picture of a page the tab previews. The places come from src/lib/wmlayout.ts (each page by its own shape); the Word
// writer is src/lib/docxmark.ts.
//
// PDF (MuPDF, as the PDF Watermark tab): the mark is drawn into each page's own content (stampPage), under an ExtGState
// for the opacity; the pages' own text stays text. Text in Sans, Serif or Mono is vector text in one of PDF's standard
// fonts (Helvetica, Times-Roman, Courier — sharp at any zoom, a few hundred bytes); Meme (Anton) and Script, and text
// in another script, are a picture made by the browser in the chosen font (PDF's standard fonts have neither). The
// shadow is the photo's (black at 55 %, blurred by 0.06 em, 0.04 em down and right): under vector text, the same glyphs
// drawn by MuPDF and blurred by imgproc.wasm, laid under the text as a picture; in a picture of the text, drawn by the
// browser with it. A logo is the picture as it was chosen, with its transparency.
import { mupdf, stampPage, pageGeom, pdfString, isLatin1, textWidth, savePdf, winAnsi, signatureCount } from './pdf';
import { placeMarks, type Place, type Unit, type MarkOpts } from './wmlayout';
import { imgproc, type Img } from '../wasm/imgproc';

/** `cover`: false leaves a document's first page (its cover) without the mark (to-do #34); left out, every page gets it */
export interface DocMark extends MarkOpts { kind: 'text' | 'logo'; text: string; font: string; color: string; opacity: number; shadow: boolean; logo: Img | null; cover?: boolean }
/** The tab's fonts (by their labels) in documents: PDF's standard font (none: a picture of the text), Word's font, and
 *  the browser's font for pictures and the preview of a Word page (Word's first, then the tab's own). */
export const DOC_FONTS: Record<string, { pdf: string | null; word: string; css: string }> = {
  Meme: { pdf: null, word: 'Impact', css: 'Anton, Impact, sans-serif' },
  Sans: { pdf: 'Helvetica', word: 'Arial', css: 'Arial, Helvetica, "Liberation Sans", Arimo, sans-serif' },
  Serif: { pdf: 'Times-Roman', word: 'Georgia', css: 'Georgia, "Times New Roman", serif' },
  Mono: { pdf: 'Courier', word: 'Courier New', css: '"Courier New", Courier, "Liberation Mono", Cousine, monospace' },
  Script: { pdf: null, word: 'Segoe Script', css: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive' },
};
export const docFont = (label: string) => DOC_FONTS[label] ?? DOC_FONTS.Sans;

/** The photo's shadow, in ems of the text: black at 55 %, a blur of σ = 0.06 em (canvas: shadowBlur 0.12 em), 0.04 em
 *  down and to the right. */
export const SHADOW = { alpha: 0.55, sigma: 0.06, off: 0.04 };
const f = (n: number) => +n.toFixed(3);
const rgbOf = (hex: string) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +(v / 255).toFixed(4)); };
/** Glyph metrics per point of type: left of the origin, right of it, above the baseline, below it. */
export interface Metrics { l: number; r: number; a: number; d: number }
export const unitOf = (g: Metrics): Unit => ({ w: g.l + g.r, h: g.a + g.d, row: 1, logo: false });
export const logoUnit = (img: { width: number; height: number }): Unit => ({ w: 1, h: img.height / img.width, row: img.height / img.width, logo: true });

/** The glyphs' tight box measured by the browser (Word's text watermark is fitted to it; the preview of a Word page). */
export function measureText(text: string, css: string): Metrics {
  const g = new OffscreenCanvas(8, 8).getContext('2d')!;
  g.font = `100px ${css}`;
  const t = g.measureText(text);
  const m = { l: t.actualBoundingBoxLeft / 100, r: t.actualBoundingBoxRight / 100, a: t.actualBoundingBoxAscent / 100, d: t.actualBoundingBoxDescent / 100 };
  if (!(m.l + m.r > 0 && m.a + m.d > 0)) throw new Error('The text has nothing to draw: type some letters.');
  return m;
}

const toPng = async (c: OffscreenCanvas) => new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
export async function pngOf(img: Img) {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return toPng(c);
}

/** Vector text: its glyph box, drawn by MuPDF in the standard font at 100 pt (exact — the same glyphs the page gets),
 *  and the shadow made from that drawing. The picture of the shadow: (x, y) its bottom left from the text's origin,
 *  w × h its size, all in ems (y up). */
async function vectorRun(text: string, font: string, shadow: boolean) {
  const m = await mupdf(), REF = 100, SC = 2, PAD = 0.5 * REF, BASE = PAD + 0.45 * REF;
  const Wp = Math.ceil((await textWidth(text, REF, font)) + 2 * PAD), Hp = Math.ceil(BASE + 1.25 * REF + PAD);
  const scratch = new m.PDFDocument();
  const res = scratch.addObject({ Font: { F: scratch.addSimpleFont(new m.Font(font)) } });
  scratch.insertPage(-1, scratch.addPage([0, 0, Wp, Hp], 0, res, winAnsi(`BT /F ${REF} Tf 0 g ${PAD} ${BASE} Td ${pdfString(text)} Tj ET`)));
  const pix = scratch.loadPage(0).toPixmap(m.Matrix.scale(SC, SC), m.ColorSpace.DeviceRGB, true, true);
  const w = pix.getWidth(), h = pix.getHeight(), n = pix.getNumberOfComponents(); // colour and alpha (4)
  const img = await imgproc('expand', pix.getPixels(), w, h, n);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (img.data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('The text has nothing to draw: type some letters.');
  const top = Hp - BASE; // the baseline from the top of the page, in points
  const g: Metrics = { l: (PAD - x0 / SC) / REF, r: ((x1 + 1) / SC - PAD) / REF, a: (top - y0 / SC) / REF, d: ((y1 + 1) / SC - top) / REF };
  let pic: { png: Uint8Array; x: number; y: number; w: number; h: number } | null = null;
  if (shadow) { // black, the coverage blurred, at 55 %
    for (let i = 0; i < w * h; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 0; }
    const b = await imgproc('blur', img, SHADOW.sigma * REF * SC);
    for (let i = 0; i < w * h; i++) b.data[i * 4 + 3] = Math.round(b.data[i * 4 + 3] * SHADOW.alpha);
    pic = { png: await pngOf(b), x: -PAD / REF, y: -BASE / REF, w: Wp / REF, h: Hp / REF };
  }
  return { g, pic };
}

/** A picture of the text, drawn by the browser in the chosen font and colour (and with the shadow when it is on), at
 *  `fs` pixels per em. Its metrics and where the picture lies from the text's origin, in ems (y up). */
export async function textPicture(text: string, css: string, color: string, shadow: boolean, fs: number) {
  const probe = new OffscreenCanvas(8, 8).getContext('2d')!;
  probe.font = `${fs}px ${css}`;
  const t = probe.measureText(text), L = t.actualBoundingBoxLeft, R = t.actualBoundingBoxRight, A = t.actualBoundingBoxAscent, D = t.actualBoundingBoxDescent;
  if (!(L + R > 0 && A + D > 0)) throw new Error('The text has nothing to draw: type some letters.');
  const P = Math.ceil(0.35 * fs), cw = Math.ceil(L + R + 2 * P), ch = Math.ceil(A + D + 2 * P);
  const c = new OffscreenCanvas(cw, ch), g = c.getContext('2d')!;
  g.font = probe.font; g.fillStyle = color; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  if (shadow) { g.shadowColor = `rgba(0,0,0,${SHADOW.alpha})`; g.shadowBlur = 2 * SHADOW.sigma * fs; g.shadowOffsetX = g.shadowOffsetY = SHADOW.off * fs; }
  g.fillText(text, P + L, P + A);
  return { png: await toPng(c), g: { l: L / fs, r: R / fs, a: A / fs, d: D / fs } as Metrics, x: -(P + L) / fs, y: -(ch - P - A) / fs, w: cw / fs, h: ch / fs };
}

/** The frame of a mark on a page H points tall: its middle (page space, PDF's y up), turned as it is shown. */
const frame = (p: Place, H: number, dx = 0, dy = 0) => {
  const a = (-p.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return `1 0 0 1 ${f(p.cx + dx)} ${f(H - p.cy + dy)} cm ${f(c)} ${f(s)} ${f(-s)} ${f(c)} 0 0 cm`;
};

export interface PdfResult { bytes: Uint8Array; pages: number; marked: number; signed: number; vector: boolean }
/** The PDF `bytes` (opened with `password` if it has one) with the mark on every page — but the first when `o.cover` is
 *  false; `label` is the tab's font label. `step(i, n)` is told of each page and may stop the run (false → null). */
export async function markPdf(bytes: Uint8Array, password: string | undefined, o: DocMark, label: string, step?: (i: number, n: number) => Promise<boolean> | boolean): Promise<PdfResult | null> {
  const m = await mupdf(), doc = m.Document.openDocument(bytes, 'application/pdf').asPDF();
  if (!doc) throw new Error('This is not a PDF.');
  if (doc.needsPassword() && !doc.authenticatePassword(password ?? '')) throw new Error('Wrong password.');
  const n = doc.countPages(), font = docFont(label), geos = Array.from({ length: n }, (_, i) => pageGeom(doc.loadPage(i) as any));
  const skip = o.cover === false ? 1 : 0; // the cover left as it is (to-do #34)
  if (skip && n < 2) throw new Error('This PDF has one page: with the first page (the cover) left without the watermark, no page would get it.');
  const vector = o.kind === 'text' && !!font.pdf && isLatin1(o.text);
  const images: Record<string, any> = {};
  let unit: Unit, mark: (p: Place) => string, under: ((p: Place) => string) | null = null, shadowAt = 0;
  if (o.kind === 'logo') {
    if (!o.logo) throw new Error('Choose a logo image.');
    unit = logoUnit(o.logo);
    images.STIM = doc.addImage(new m.Image(await pngOf(o.logo)));
    mark = (p) => `${f(p.w)} 0 0 ${f(p.h)} ${f(-p.w / 2)} ${f(-p.h / 2)} cm /STIM Do`;
  } else if (vector) {
    const { g, pic } = await vectorRun(o.text, font.pdf!, o.shadow);
    const [r, gg, b] = rgbOf(o.color);
    unit = unitOf(g);
    const origin = (p: Place) => [-p.w / 2 + g.l * p.k, p.h / 2 - g.a * p.k];
    mark = (p) => { const [x, y] = origin(p); return `BT /STF ${f(p.k)} Tf ${r} ${gg} ${b} rg ${f(x)} ${f(y)} Td ${pdfString(o.text)} Tj ET`; };
    if (pic) {
      images.STSH = doc.addImage(new m.Image(pic.png)); shadowAt = SHADOW.off;
      under = (p) => { const [x, y] = origin(p); return `${f(pic.w * p.k)} 0 0 ${f(pic.h * p.k)} ${f(x + pic.x * p.k)} ${f(y + pic.y * p.k)} cm /STSH Do`; };
    }
  } else { // a picture of the text: sharp enough for print at the largest size any page needs (about 300 dpi)
    const u0 = unitOf(measureText(o.text, o.font));
    const kmax = Math.max(...geos.map((g) => Math.max(0, ...placeMarks(g.W, g.H, o, u0).map((p) => p.k))), 1);
    const fs = Math.max(64, Math.min((kmax * 300) / 72, 16000 / (u0.w + 0.8), Math.sqrt(40e6 / ((u0.w + 0.8) * (u0.h + 0.8))), 1200));
    const t = await textPicture(o.text, o.font, o.color, o.shadow, fs);
    images.STTX = doc.addImage(new m.Image(t.png));
    unit = unitOf(t.g);
    mark = (p) => { const x = -p.w / 2 + t.g.l * p.k, y = p.h / 2 - t.g.a * p.k; return `${f(t.w * p.k)} 0 0 ${f(t.h * p.k)} ${f(x + t.x * p.k)} ${f(y + t.y * p.k)} cm /STTX Do`; };
  }
  for (let i = 0; i < n; i++) {
    if (step && !(await step(i, n))) return null;
    if (i < skip) continue;
    const places = placeMarks(geos[i].W, geos[i].H, o, unit);
    await stampPage(doc, i, (W, H) => {
      const ops: string[] = [];
      // the shadows first (each 0.04 em down and right on the page, as on a photo), then the marks over them
      if (under) for (const p of places) ops.push(`q ${frame(p, H, shadowAt * p.k, -shadowAt * p.k)} ${under(p)} Q`);
      for (const p of places) ops.push(`q ${frame(p, H)} ${mark(p)} Q`);
      return ops.join('\n');
    }, { font: vector ? font.pdf! : false, opacity: o.opacity, images });
  }
  const signed = signatureCount(doc);
  return { bytes: savePdf(doc, password !== undefined ? 'encrypt=none' : ''), pages: n, marked: n - skip, signed, vector };
}

/** A page of a PDF with the mark (`o`; null: without it — the cover the tab leaves alone), drawn `px` pixels on its
 *  longer side (the tab's preview: exactly what the file gets). `first` = a PDF of that page alone. */
export async function previewPdf(first: Uint8Array, o: DocMark | null, label: string, px: number): Promise<Img> {
  const m = await mupdf(), bytes = o ? (await markPdf(first, undefined, { ...o, cover: true }, label))!.bytes : first;
  const doc = m.Document.openDocument(bytes, 'application/pdf'), page = doc.loadPage(0), b = page.getBounds();
  const s = px / Math.max(b[2] - b[0], b[3] - b[1]);
  const pix = page.toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceRGB, false, true);
  return imgproc('expand', pix.getPixels(), pix.getWidth(), pix.getHeight(), pix.getNumberOfComponents());
}

/** A white page of W × H points with the marks drawn as Word will draw them (Word's font as the browser has it), `px`
 *  pixels on its longer side: the tab's preview of a Word document's first page. */
export async function previewWordPage(W: number, H: number, o: DocMark, label: string, px: number): Promise<Img> {
  const s = px / Math.max(W, H), c = new OffscreenCanvas(Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s))), g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.scale(s, s);
  const css = o.kind === 'text' ? `"${docFont(label).word}", ${o.font}` : '';
  const met = o.kind === 'text' ? measureText(o.text, css) : null;
  const unit = o.logo && o.kind === 'logo' ? logoUnit(o.logo) : met ? unitOf(met) : null;
  if (unit) {
    const logo = o.kind === 'logo' && o.logo ? (() => { const lc = new OffscreenCanvas(o.logo.width, o.logo.height); lc.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(o.logo.data), o.logo.width, o.logo.height), 0, 0); return lc; })() : null;
    g.globalAlpha = o.opacity;
    for (const p of placeMarks(W, H, o, unit)) {
      g.save(); g.translate(p.cx, p.cy); g.rotate((p.rot * Math.PI) / 180);
      if (logo) g.drawImage(logo, -p.w / 2, -p.h / 2, p.w, p.h);
      else if (met) {
        g.font = `${p.k}px ${css}`; g.fillStyle = o.color; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
        if (o.shadow) { g.shadowColor = `rgba(0,0,0,${SHADOW.alpha})`; g.shadowOffsetX = g.shadowOffsetY = SHADOW.off * p.k * s; } // Word's shadow: not blurred
        g.fillText(o.text, -p.w / 2 + met.l * p.k, -p.h / 2 + met.a * p.k);
      }
      g.restore();
    }
  }
  const d = g.getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height };
}
