// PDF engine: MuPDF (Artifex, C → official wasm build, AGPL-3.0), lazily loaded so only PDF tools download it.
type MuPDF = typeof import('mupdf');
let mu: Promise<MuPDF> | null = null;
export const mupdf = () => (mu ||= import('mupdf'));

export const PAGE_SIZES: Record<string, [number, number] | null> = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], fit: null };
export interface ImagePage { bytes: Uint8Array; width: number; height: number } // JPEG/PNG bytes + pixel size

/** Build a PDF with one image per page. JPEG/PNG data is embedded as-is (no re-compression). size 'fit' = page is
 *  exactly the image at `dpi`; otherwise the image is centred inside the margins (points, 72 per inch). */
export async function imagesToPdf(pages: ImagePage[], o: { size?: string; margin?: number; dpi?: number; landscapeAuto?: boolean } = {}): Promise<Uint8Array> {
  const m = await mupdf(), doc = new m.PDFDocument();
  const size = PAGE_SIZES[o.size || 'a4'], margin = o.margin ?? 0, dpi = o.dpi || 150;
  pages.forEach((p, i) => {
    const ref = doc.addImage(new m.Image(p.bytes));
    const res = doc.addObject({ XObject: { [`I${i}`]: ref } });
    let W: number, H: number, dw: number, dh: number, x: number, y: number;
    if (!size) { W = dw = (p.width * 72) / dpi; H = dh = (p.height * 72) / dpi; x = y = 0; }
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
