// QR codes and barcodes on a picture, found by zxing-cpp (zxing-wasm — the file the QR tabs load: fetched once a visit,
// with the first picture searched). Shared by PDF Redact and Safe ID Copy: a code's box in the picture's pixels.
import type { Rect } from './redact';

export interface Code { text: string; format: string; box: Rect }
let ready: Promise<any> | null = null;
const zx = () => (ready ||= Promise.all([import('zxing-wasm/full'), import('zxing-wasm/full/zxing_full.wasm?url')]).then(async ([z, u]) => {
  await z.prepareZXingModule({ overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? u.default : prefix + p) }, fireImmediately: true });
  return z;
}).catch((e) => { ready = null; throw e; }));

/** Every code zxing-cpp reads on the picture (RGBA), with the box round its corners. */
export async function findCodes(img: { data: Uint8ClampedArray; width: number; height: number }, max = 20): Promise<Code[]> {
  const z = await zx();
  const r = await z.readBarcodes(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), { formats: [], tryHarder: true, maxNumberOfSymbols: max });
  return r.filter((c: any) => c.isValid).map((c: any) => {
    const p = c.position, xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x], ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
    return { text: c.text, format: c.format, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as Rect };
  });
}
