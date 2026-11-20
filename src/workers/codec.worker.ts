// Image codecs off the main thread: MozJPEG, libwebp, OxiPNG and Squoosh's resize (jSquash builds of the C/Rust
// sources) + libheif.
import encodeJpeg from '@jsquash/jpeg/encode';
import decodeJpeg from '@jsquash/jpeg/decode';
import encodeWebp from '@jsquash/webp/encode';
import decodeWebp from '@jsquash/webp/decode';
import optimisePng from '@jsquash/oxipng/optimise';
import resizeImage from '@jsquash/resize';
import lcmsWasmUrl from 'lcms-wasm/dist/lcms.wasm?url';
import { heicProfile, toSrgb } from '../lib/heic-color';

type Img = { data: Uint8ClampedArray; width: number; height: number };
const asImageData = (i: Img) => (typeof ImageData !== 'undefined' ? new ImageData(new Uint8ClampedArray(i.data), i.width, i.height) : (i as unknown as ImageData));

let heif: any = null;
async function decodeHeic(buf: ArrayBuffer): Promise<Img> {
  heif ||= (await import('libheif-js/libheif-wasm/libheif-bundle.mjs' as any)).default;
  const lib = typeof heif === 'function' ? await heif() : heif;
  const dec = new lib.HeifDecoder();
  const images = dec.decode(new Uint8Array(buf));
  if (!images?.length) throw new Error('Not a readable HEIC/HEIF image.');
  // the primary image (a file may hold several: bursts, depth maps, thumbnails)
  const im = images.find((i: any) => i.is_primary?.()) ?? images[0], width = im.get_width(), height = im.get_height();
  const data = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((res, rej) => im.display({ data, width, height }, (d: any) => (d ? res() : rej(new Error('HEIC decode failed')))));
  // an iPhone photo is in Display P3: to sRGB with its profile (the browser does the same for JPEG / PNG)
  const icc = heicProfile(lib, im.handle);
  if (icc) {
    const L = await lcmsLib();
    const r = toSrgb(L.lcms, L.C, data, icc);
    if (r) return { data: r.data, width, height };
  }
  return { data, width, height };
}

let lcmsP: Promise<{ lcms: any; C: any }> | null = null;
const lcmsLib = () => (lcmsP ||= (async () => {
  const m: any = await import('lcms-wasm');
  const lcms = await m.instantiate({ locateFile: () => lcmsWasmUrl });
  return { lcms, C: m };
})());

/** The image on a solid background (JPEG has no transparency: MozJPEG keeps the colour under a transparent pixel, which
 *  the browser stores as black). The browser's own compositing (canvas), so a picture without alpha is unchanged. */
async function flatten(img: Img, bg = '#ffffff'): Promise<Img> {
  const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = bg; g.fillRect(0, 0, img.width, img.height);
  const bmp = await createImageBitmap(asImageData(img), { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' } as ImageBitmapOptions);
  g.drawImage(bmp, 0, 0); bmp.close();
  const d = g.getImageData(0, 0, img.width, img.height);
  return { data: d.data, width: img.width, height: img.height };
}
const hasAlpha = (img: Img) => { const d = img.data; for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return true; return false; };

/** Encode to a format; `pngFromRgba` builds a PNG via OffscreenCanvas then optimises it with OxiPNG. */
async function encode(img: Img, fmt: 'jpeg' | 'webp' | 'png', quality: number, opts: any = {}): Promise<ArrayBuffer> {
  if (fmt === 'jpeg') { const { background, ...o } = opts; if (hasAlpha(img)) img = await flatten(img, background ?? '#ffffff'); return encodeJpeg(asImageData(img), { quality, progressive: true, optimize_coding: true, ...o }); }
  if (fmt === 'webp') return encodeWebp(asImageData(img), { quality, method: 4, ...opts });
  // OxiPNG effort scales with size so a 12 MP photo doesn't take half a minute: level 2 ≤ 2 MP, 1 ≤ 6 MP, else 0.
  const px = img.width * img.height;
  return optimisePng(asImageData(img), { level: opts.level ?? (px <= 2e6 ? 2 : px <= 6e6 ? 1 : 0), interlace: false });
}

self.onmessage = async (ev: MessageEvent<any>) => {
  const { id, op } = ev.data;
  try {
    let result: any;
    if (op === 'encode') result = await encode(ev.data.img, ev.data.fmt, ev.data.quality, ev.data.opts);
    else if (op === 'resize') {
      // Squoosh's resize (jSquash; Rust → WebAssembly): Lanczos-3 in linear light, alpha premultiplied
      const { img, width, height } = ev.data;
      const r = await resizeImage(asImageData(img), { width, height, method: 'lanczos3', premultiply: true, linearRGB: true });
      result = { data: r.data, width: r.width, height: r.height };
    }
    else if (op === 'decode') {
      const { buf, kind } = ev.data;
      result = kind === 'heic' ? await decodeHeic(buf) : kind === 'webp' ? await decodeWebp(buf) : await decodeJpeg(buf);
      result = { data: result.data, width: result.width, height: result.height };
    } else if (op === 'target') {
      // binary search quality so the encoded size is <= maxBytes (largest quality that fits)
      const { img, fmt, maxBytes, minQ = 5, maxQ = 95, opts } = ev.data;
      let lo = minQ, hi = maxQ, best: ArrayBuffer | null = null, bestQ = 0;
      while (lo <= hi) {
        const q = Math.round((lo + hi) / 2), out = await encode(img, fmt, q, opts);
        if (out.byteLength <= maxBytes) { best = out; bestQ = q; lo = q + 1; } else hi = q - 1;
      }
      result = best ? { buf: best, quality: bestQ } : { buf: await encode(img, fmt, minQ, opts), quality: minQ, tooBig: true };
    }
    const tr: Transferable[] = [];
    if (result instanceof ArrayBuffer) tr.push(result); else if (result?.buf instanceof ArrayBuffer) tr.push(result.buf); else if (result?.data?.buffer) tr.push(result.data.buffer);
    (self as any).postMessage({ id, result }, tr);
  } catch (e: any) { (self as any).postMessage({ id, error: e?.message || String(e) }); }
};
