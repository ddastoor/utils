// Node-side PDF checks for e2e suites (MuPDF from node_modules): pages, sizes, rotation, text, rendered pixels.
import { readFileSync } from 'node:fs';
let mu = null;
const M = async () => (mu ||= await import('mupdf'));

/** { pages, encrypted, list: [{ w, h, rot, text }] } — w/h are the visual size in points (after /Rotate). */
export async function pdfInfo(path, password) {
  const m = await M();
  const doc = m.Document.openDocument(readFileSync(path), 'application/pdf');
  const encrypted = doc.needsPassword();
  if (encrypted && password !== undefined && !doc.authenticatePassword(password)) throw new Error('wrong password');
  if (encrypted && password === undefined) return { pages: doc.countPages?.() ?? -1, encrypted, list: [] };
  const list = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const p = doc.loadPage(i), [x0, y0, x1, y1] = p.getBounds(), obj = p.getObject?.(), r = obj?.getInheritable('Rotate');
    list.push({ w: Math.round(x1 - x0), h: Math.round(y1 - y0), rot: r && r.isNumber() ? r.asNumber() : 0, text: p.toStructuredText('').asText() });
  }
  return { pages: list.length, encrypted, list };
}
/** Grey pixels of a page at `scale` (1 = 72 dpi): { w, h, at(x, y) 0..255, dark(x0, y0, x1, y1) = share of dark pixels in a box (0..1 coords) } */
export async function renderGrey(path, page = 0, scale = 1, password) {
  const m = await M();
  const doc = m.Document.openDocument(readFileSync(path), 'application/pdf');
  if (password !== undefined) doc.authenticatePassword(password);
  const pix = doc.loadPage(page).toPixmap(m.Matrix.scale(scale, scale), m.ColorSpace.DeviceGray, false, true);
  const w = pix.getWidth(), h = pix.getHeight(), d = pix.getPixels(), st = pix.getStride();
  const at = (x, y) => d[y * st + x];
  const dark = (x0, y0, x1, y1, thr = 160) => { let n = 0, k = 0; for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y++) for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x++) { n++; if (at(x, y) < thr) k++; } return n ? k / n : 0; };
  const mean = (x0, y0, x1, y1) => { let n = 0, s = 0; for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y++) for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x++) { n++; s += at(x, y); } return n ? s / n : 0; };
  return { w, h, at, dark, mean };
}
