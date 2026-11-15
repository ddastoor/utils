// Image input/output: decode any photo (incl. HEIC, EXIF orientation, very large images), encode with
// MozJPEG / WebP / OxiPNG in a worker, target-size search, JPEG DPI metadata.
import { imgproc, type Img } from '../wasm/imgproc';
import { isIOS } from '../platform';
import { readExif } from './exif';

let worker: Worker | null = null, seq = 0;
const pend = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
function call<T>(msg: any, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('../workers/codec.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.result); };
    worker.onerror = (e) => { for (const p of pend.values()) p.rej(new Error(e.message || 'Codec worker failed')); pend.clear(); worker = null; };
  }
  const id = ++seq;
  return new Promise<T>((res, rej) => { pend.set(id, { res, rej }); worker!.postMessage({ ...msg, id }, transfer); });
}

export type Fmt = 'jpeg' | 'webp' | 'png';
export const MIME: Record<Fmt, string> = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
export const EXT: Record<Fmt, string> = { jpeg: 'jpg', webp: 'webp', png: 'png' };
const plain = (i: Img): Img => ({ data: i.data, width: i.width, height: i.height });

export async function encodeImg(img: Img, fmt: Fmt, quality = 82, opts: any = {}): Promise<Blob> {
  const buf = await call<ArrayBuffer>({ op: 'encode', img: plain(img), fmt, quality, opts });
  return new Blob([buf], { type: MIME[fmt] });
}
/** Largest quality whose output fits in maxBytes. */
export async function encodeToSize(img: Img, fmt: 'jpeg' | 'webp', maxBytes: number, opts: any = {}): Promise<{ blob: Blob; quality: number; tooBig?: boolean }> {
  const r = await call<{ buf: ArrayBuffer; quality: number; tooBig?: boolean }>({ op: 'target', img: plain(img), fmt, maxBytes, opts });
  return { blob: new Blob([r.buf], { type: MIME[fmt] }), quality: r.quality, tooBig: r.tooBig };
}

const sniff = (b: Uint8Array) => {
  const s = new TextDecoder().decode(b.subarray(4, 12));
  if (/ftyp(heic|heix|hevc|hevx|mif1|msf1|heim|heis|avif)/.test(s)) return /avif/.test(s) ? 'avif' : 'heic';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'png';
  if (new TextDecoder().decode(b.subarray(8, 12)) === 'WEBP') return 'webp';
  return 'other';
};

/** Decode an image file to RGBA, honouring EXIF orientation. */
export async function loadImg(file: Blob): Promise<Img> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const kind = sniff(head);
  if (kind === 'heic') {
    const buf = await file.arrayBuffer();
    return call<Img>({ op: 'decode', buf, kind: 'heic' }, [buf]); // libheif applies the irot/imir transforms
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
    const big = bmp.width * bmp.height > 16_700_000;
    if (!(big && isIOS)) {
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height);
      bmp.close();
      return { data: d.data, width: d.width, height: d.height };
    }
    bmp.close();
  } catch { /* fall through to wasm decoders */ }
  if (kind === 'jpeg' || kind === 'webp') {
    // very large images on iOS (canvas limit) or formats the browser can't open: decode in wasm, then orient
    const buf = await file.arrayBuffer();
    const orientation = kind === 'jpeg' ? (await readExif(file)).orientation || 1 : 1;
    const img = await call<Img>({ op: 'decode', buf, kind }, [buf]);
    return orientation === 1 ? img : imgproc('orient', img, orientation); // lossless transform in imgproc.wasm
  }
  throw new Error('This image format is not supported by your browser.');
}

/** Set JFIF pixel density (DPI) in a JPEG — print shops and forms read it. Inserts a JFIF APP0 if missing. */
export async function setJpegDpi(blob: Blob, dpi: number): Promise<Blob> {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[0] !== 0xff || b[1] !== 0xd8) return blob;
  if (b[2] === 0xff && b[3] === 0xe0 && String.fromCharCode(...b.subarray(6, 10)) === 'JFIF') {
    const o = b.slice(); o[13] = 1; o[14] = dpi >> 8; o[15] = dpi & 255; o[16] = dpi >> 8; o[17] = dpi & 255;
    return new Blob([o], { type: 'image/jpeg' });
  }
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0]);
  const o = new Uint8Array(b.length + app0.length); o.set(b.subarray(0, 2)); o.set(app0, 2); o.set(b.subarray(2), 2 + app0.length);
  return new Blob([o], { type: 'image/jpeg' });
}

/** Draw an Img into a canvas element (for previews). */
export function paint(img: Img, canvas: HTMLCanvasElement) {
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas;
}
/** Downscale so the long side ≤ maxSide (for fast previews), using the GPU path. */
export function previewOf(img: Img, maxSide: number): Img {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (s === 1) return img;
  const src = new OffscreenCanvas(img.width, img.height); src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  return { data: d.data, width: w, height: h };
}
