// PDF engine: MuPDF (Artifex, C → official wasm build, AGPL-3.0), lazily loaded so only PDF tools download it.
type MuPDF = typeof import('mupdf');
let mu: Promise<MuPDF> | null = null;
export const mupdf = () => (mu ||= import('mupdf'));

export const PAGE_SIZES: Record<string, [number, number] | null> = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], fit: null };
export interface ImagePage { bytes: Uint8Array; width: number; height: number; pt?: [number, number] } // JPEG/PNG bytes + pixel size (+ exact page size in points for 'fit')

/** Build a PDF with one image per page. JPEG/PNG data is embedded as-is (no re-compression). size 'fit' = page is
 *  exactly the image at `dpi`; otherwise the image is centred inside the margins (points, 72 per inch). */
export async function imagesToPdf(pages: ImagePage[], o: { size?: string; margin?: number; dpi?: number; landscapeAuto?: boolean } = {}): Promise<Uint8Array> {
  const m = await mupdf(), doc = new m.PDFDocument();
  const size = PAGE_SIZES[o.size || 'a4'], margin = o.margin ?? 0, dpi = o.dpi || 150;
  pages.forEach((p, i) => {
    const ref = doc.addImage(new m.Image(p.bytes));
    const res = doc.addObject({ XObject: { [`I${i}`]: ref } });
    let W: number, H: number, dw: number, dh: number, x: number, y: number;
    if (!size) { W = dw = p.pt ? p.pt[0] : (p.width * 72) / dpi; H = dh = p.pt ? p.pt[1] : (p.height * 72) / dpi; x = y = 0; }
    else {
      [W, H] = size;
      if (o.landscapeAuto !== false && p.width > p.height) [W, H] = [H, W];
      const s = Math.min((W - 2 * margin) / p.width, (H - 2 * margin) / p.height);
      dw = p.width * s; dh = p.height * s; x = (W - dw) / 2; y = (H - dh) / 2;
    }
    const f = (n: number) => n.toFixed(3);
    doc.insertPage(-1, doc.addPage([0, 0, W, H], 0, res, `q ${f(dw)} 0 0 ${f(dh)} ${f(x)} ${f(y)} cm /I${i} Do Q`));
  });
  return doc.saveToBuffer('compress,garbage').asUint8Array();
}

// ------------------------------------------------------------------ shared helpers for the PDF tools
type MDoc = InstanceType<MuPDF['PDFDocument']>;
type MPage = InstanceType<MuPDF['PDFPage']>;
export class PdfPasswordError extends Error { constructor(public wrong = false) { super(wrong ? 'Wrong password.' : 'This PDF is password-protected.'); } }

/** Open PDF bytes. Throws PdfPasswordError when a password is needed (or the given one is wrong). */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<MDoc> {
  const m = await mupdf();
  let d: any;
  try { d = m.Document.openDocument(bytes, 'application/pdf'); } catch (e: any) { throw new Error(`Not a readable PDF (${e?.message || e}).`); }
  const doc = d.asPDF();
  if (!doc) throw new Error('Not a PDF file.');
  if (doc.needsPassword()) {
    if (password === undefined) throw new PdfPasswordError(false);
    if (!doc.authenticatePassword(password)) throw new PdfPasswordError(true);
  }
  return doc;
}
/** Serialise. `encrypt=none` writes without encryption (only after a successful authenticatePassword). */
export const savePdf = (doc: MDoc, extra = '') => doc.saveToBuffer(['compress', 'garbage', extra].filter(Boolean).join(',')).asUint8Array().slice();

/** Visual page size (after /Rotate) and the matrix from visual coordinates (origin bottom-left, points) to user space. */
export function pageGeom(page: MPage): { W: number; H: number; rot: number; m: [number, number, number, number, number, number] } {
  const o = page.getObject();
  const box = (o.getInheritable('CropBox').isArray() ? o.getInheritable('CropBox') : o.getInheritable('MediaBox'));
  const r = [0, 1, 2, 3].map((i) => box.get(i).asNumber());
  const x0 = Math.min(r[0], r[2]), y0 = Math.min(r[1], r[3]), w = Math.abs(r[2] - r[0]), h = Math.abs(r[3] - r[1]);
  const rr = o.getInheritable('Rotate'), rot = ((((rr.isNumber() ? rr.asNumber() : 0) % 360) + 360) % 360);
  switch (rot) {
    case 90: return { W: h, H: w, rot, m: [0, 1, -1, 0, x0 + w, y0] };
    case 180: return { W: w, H: h, rot, m: [-1, 0, 0, -1, x0 + w, y0 + h] };
    case 270: return { W: h, H: w, rot, m: [0, -1, 1, 0, x0, y0 + h] };
    default: return { W: w, H: h, rot: 0, m: [1, 0, 0, 1, x0, y0] };
  }
}

// Helvetica is added with WinAnsiEncoding (Windows-1252): Latin-1 plus these characters in 0x80–0x9F
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
const winAnsi = (s: string) => Uint8Array.from(s, (c) => { const u = c.charCodeAt(0); return u < 0x80 || (u >= 0xa0 && u <= 0xff) ? u : CP1252[u] ?? 0x3f; });
export const pdfString = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[\r\n]/g, ' ')})`;
/** True when Helvetica (WinAnsi) can show every character of s. */
export const isLatin1 = (s: string) => [...s].every((c) => { const u = c.codePointAt(0)!; return (u >= 0x20 && u < 0x7f) || (u >= 0xa0 && u <= 0xff) || u in CP1252; });

/** Draw extra content on a page in its visual coordinate system. `ops` gets the visual size and returns PDF content
 *  operators; resources: Helvetica as /STF (when font) and an opacity state /STGS (when opacity < 1), images as named. */
export async function stampPage(doc: MDoc, index: number, ops: (W: number, H: number) => string, o: { font?: boolean; opacity?: number; images?: Record<string, any> } = {}) {
  const m = await mupdf();
  const page = doc.loadPage(index), obj = page.getObject(), g = pageGeom(page);
  // own Resources dictionary (copy an inherited one so other pages are not changed)
  let res = obj.get('Resources');
  if (!res.isDictionary()) {
    const inh = obj.getInheritable('Resources'), copy = doc.newDictionary();
    if (inh.isDictionary()) inh.forEach((v: any, k: any) => copy.put(k, v));
    obj.put('Resources', copy); res = obj.get('Resources');
  }
  const sub = (key: string) => { let d = res.get(key); if (!d.isDictionary()) { res.put(key, doc.newDictionary()); d = res.get(key); } return d; };
  if (o.font) sub('Font').put('STF', doc.addSimpleFont(new m.Font('Helvetica')));
  if (o.opacity !== undefined && o.opacity < 1) sub('ExtGState').put('STGS', doc.addObject({ Type: 'ExtGState', ca: o.opacity, CA: o.opacity }));
  for (const [k, v] of Object.entries(o.images || {})) sub('XObject').put(k, v);
  const f = (n: number) => +n.toFixed(4);
  const body = `q ${g.m.map(f).join(' ')} cm ${o.opacity !== undefined && o.opacity < 1 ? '/STGS gs ' : ''}${ops(g.W, g.H)} Q`;
  // the original content runs inside q … Q so its graphics state cannot leak into ours
  const before = doc.addStream(winAnsi('q\n'), {}), after = doc.addStream(winAnsi(`\nQ\n${body}\n`), {});
  const cur = obj.get('Contents'), arr = doc.newArray();
  arr.push(before);
  if (cur.isArray()) cur.forEach((v: any) => arr.push(v)); else if (!cur.isNull()) arr.push(cur);
  arr.push(after);
  obj.put('Contents', arr);
}

let helv: any = null;
/** Width of `text` in Helvetica at `size` points. */
export async function textWidth(text: string, size: number) {
  const m = await mupdf();
  helv ||= new m.Font('Helvetica');
  let w = 0; for (const ch of text) w += helv.advanceGlyph(helv.encodeCharacter(ch.codePointAt(0)!), 0);
  return w * size;
}

/** Render a page to RGB(A) pixels at `scale` (1 = 72 dpi). */
export async function renderPage(doc: MDoc, index: number, scale: number, alpha = false) {
  const m = await mupdf();
  const pix = doc.loadPage(index).toPixmap(m.Matrix.scale(scale, scale), m.ColorSpace.DeviceRGB, alpha, true);
  return pix;
}
/** Page thumbnail as a canvas (long side ≈ px). */
export async function pageThumb(doc: MDoc, index: number, px = 180): Promise<HTMLCanvasElement> {
  const g = pageGeom(doc.loadPage(index)), s = px / Math.max(g.W, g.H);
  const pix = await renderPage(doc, index, s, true);
  const w = pix.getWidth(), h = pix.getHeight(), c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pix.getPixels()), w, h), 0, 0);
  pix.destroy?.();
  return c;
}

/** "1-3, 5, 8-" → 0-based page indices (in order, duplicates kept). Throws on a bad range. */
export function parseRanges(spec: string, count: number): number[][] {
  const out: number[][] = [];
  for (const part of spec.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const mm = /^(\d+)?\s*(?:(-|–|to)\s*(\d+)?)?$/i.exec(part);
    if (!mm || (!mm[1] && !mm[3])) throw new Error(`Cannot read the range “${part}”.`);
    const a = mm[1] ? +mm[1] : 1, b = mm[2] ? (mm[3] ? +mm[3] : count) : a;
    if (a < 1 || b < 1 || a > count || b > count) throw new Error(`“${part}” is outside 1–${count}.`);
    const r: number[] = []; for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) r.push(i - 1);
    out.push(r);
  }
  if (!out.length) throw new Error('Enter page numbers, e.g. 1-3, 5, 8-');
  return out;
}
