// "Is This Screenshot Real?" — the picture's checks off the page's main thread (potentials #82): a JPEG's own facts and its
// ghosts on the stored coefficients (jpegcoef.wasm — libjpeg-turbo's reader; a new instance for every file, so that one libjpeg
// could not read leaves nothing behind), a lossless picture's ghosts in its pixels, the clipped colours, the screenshot told
// from a photo, copied areas in a photo, the error levels as a picture (imgproc.wasm) — and the file's preview against the
// picture. src/lib/realcheck.ts holds the rules.
import { instantiateWasi, compileWasi, instantiateWasiModule } from '../wasm/wasi';
import { bindImgproc, type Img, type Imgproc } from '../wasm/imgproc';
import { bindJpegcoef } from '../wasm/jpegcoef';
import ipUrl from '../wasm/bin/imgproc.wasm?url';
import jcUrl from '../wasm/bin/jpegcoef.wasm?url';
import { jpegFacts, ghostOfJpeg, ghostOfPixels, previewDiff, previewDiffers, mergeBoxes, type JpegFacts, type CopyArea, type Box } from '../lib/realcheck';
import type { GhostReading } from '../wasm/jpegcoef';

let ip: Promise<Imgproc> | null = null, jcMod: Promise<WebAssembly.Module> | null = null;
const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);
const newJc = async () => bindJpegcoef((await instantiateWasiModule(await (jcMod ??= compileWasi(jcUrl).catch((e) => { jcMod = null; throw e; })))).exports);

/** the picture made at most `side` long (imgproc's resize), and the factor */
function shrink(p: Imgproc, img: Img, side: number): { img: Img; k: number } {
  const k = Math.min(1, side / Math.max(img.width, img.height));
  return k >= 1 ? { img, k: 1 } : { img: p.resize(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k))), k };
}

/** dark bars round a preview (a camera's 4 : 3 thumbnail of a 16 : 9 photo): rows and columns at its edges, all near-black */
function trimBars(img: Img): [number, number, number, number] {
  const { data, width: w, height: h } = img;
  const dark = (x0: number, y0: number, x1: number, y1: number) => {
    let s = 0, s2 = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4, v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; s += v; s2 += v * v; n++; }
    const m = s / n; return m < 20 && s2 / n - m * m < 40;
  };
  let t = 0, b = h, l = 0, r = w;
  while (t < h / 3 && dark(0, t, w, t + 1)) t++;
  while (b > h - h / 3 && dark(0, b - 1, w, b)) b--;
  while (l < w / 3 && dark(l, t, l + 1, b)) l++;
  while (r > w - w / 3 && dark(r - 1, t, r, b)) r--;
  return [l, t, r, b];
}

self.onmessage = async (ev: MessageEvent<any>) => {
  const { id, op } = ev.data;
  try {
    ip ||= instantiateWasi(ipUrl).then((x) => bindImgproc(x.exports)).catch((e) => { ip = null; throw e; });
    const p = await ip;
    if (op === 'picture') {
      // img: the picture as shown (upright); raw: as stored (a JPEG's blocks), when the two differ; bytes: a JPEG's file
      const img: Img = ev.data.img, raw: Img = ev.data.raw ?? img, bytes: ArrayBuffer | null = ev.data.bytes;
      const clip = p.blockClip(raw), screenshot = p.flatShare(img) >= 0.2;
      let facts: JpegFacts | null = null, ghost: GhostReading | null = null, jpegError = '';
      const jc = await newJc();
      if (bytes) {
        try {
          const fr = jc.open(new Uint8Array(bytes), ev.data.maxPx);
          facts = jpegFacts(fr);
          if (!fr.read) jpegError = `The picture is too large to check here (${fr.width} × ${fr.height}).`;
          else ghost = ghostOfJpeg(jc, fr, facts, clip);
        } catch (e: any) { jpegError = e?.message || String(e); }
      } else ghost = await ghostOfPixels(p, jc, raw, clip);
      post({ id, op: 'progress', step: 'ghosts' });
      // copied areas: photos only (a screenshot's letters and icons repeat by nature), on a copy at most 1,024 px long
      let copies: CopyArea[] | null = null;
      if (!screenshot) {
        const s = shrink(p, img, 1024), stride = s.img.width * s.img.height > 800_000 ? 2 : 1;
        copies = p.copyMove(s.img, stride, stride === 1 ? 200 : 50, 4).map((c) => ({ ...c, a: c.a.map((v) => Math.round(v / s.k)), b: c.b.map((v) => Math.round(v / s.k)) }));
      }
      // the error levels, as a picture the page shows (at most 1,600 px long)
      const e = shrink(p, img, 1600), ela = p.ela(e.img, 90, 12);
      const out = { facts, ghost: ghost ? { ...ghost, map: undefined } : null, jpegError, screenshot, copies, ela: ela.img, elaMean: ela.mean, rawW: raw.width, rawH: raw.height };
      post({ id, result: out }, [ela.img.data.buffer]);
    } else if (op === 'preview') {
      // the file's preview against the picture as stored, made as small; the cells that differ, in the stored picture's pixels
      const thumb: Img = ev.data.thumb, raw: Img = ev.data.raw;
      const [l, t, r, b] = trimBars(thumb), tw = r - l, th = b - t;
      if (tw < 16 || th < 16) { post({ id, result: null }); return; }
      const shapeOff = Math.abs(Math.log((tw / th) / (raw.width / raw.height)));
      let cut = thumb;
      if (tw !== thumb.width || th !== thumb.height) {
        const d = new Uint8ClampedArray(tw * th * 4);
        for (let y = 0; y < th; y++) d.set(thumb.data.subarray(((t + y) * thumb.width + l) * 4, ((t + y) * thumb.width + l + tw) * 4), y * tw * 4);
        cut = { data: d, width: tw, height: th };
      }
      if (shapeOff > 0.03) { post({ id, result: { worst: 0, typical: 0, shapeOff, boxes: [], size: [thumb.width, thumb.height] } }); return; }
      const small = p.resize(raw, tw, th), CELLS = 12, cd = p.cellDiff(cut, small, CELLS), d = previewDiff(cd.cells);
      const boxes: Box[] = [];
      if (previewDiffers(d)) {
        const cut2 = Math.max(8, 6 * d.typical + 4);
        cd.cells.forEach((v, i) => {
          if (v < cut2) return;
          const cx = i % CELLS, cy = Math.floor(i / CELLS);
          boxes.push([Math.floor(cx * raw.width / CELLS), Math.floor(cy * raw.height / CELLS), Math.ceil((cx + 1) * raw.width / CELLS), Math.ceil((cy + 1) * raw.height / CELLS)]);
        });
      }
      post({ id, result: { ...d, shapeOff, boxes: mergeBoxes(boxes, 1), size: [thumb.width, thumb.height] } });
    }
  } catch (e: any) {
    post({ id, error: e?.message || String(e) });
  }
};
