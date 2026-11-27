// The tabs' reading path (src/lib/readpage.ts) in Node, for the unit suites of the camera helpers (Wi-Fi QR from a router
// sticker, Visiting Card → Contact, Paper Deadlines, Bill Splitter, Camera Reader): imgproc.wasm, the Doc Scanner's page
// network (DocCornerNet LEAN on the app's ONNX Runtime Web), Tesseract with the English model the site serves — a photo read
// as the tabs read it (as scripts/measure-ocr.mjs runs it), and the QR codes on it found by zxing-cpp (the wasm the site
// serves). JPEGs decoded by MuPDF.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export async function snapReader({ load, wasm }) {
  const require = createRequire(import.meta.url);
  const mupdf = await import('mupdf');
  const { createWorker, OEM } = require('tesseract.js');
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const { readPage } = await load('/src/lib/readpage.ts');
  const { readingOf } = await load('/src/lib/ocr.ts');
  const pf = await load('/src/lib/pagefind.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const ort = await import(root + 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs');
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(root + 'node_modules/scanic-ml/dist/doccornernet_lean.ort')), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const docCorners = async (im) => { const r = ip.resizeArea(im, pf.SIZE, pf.SIZE); return pf.readOutput(await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', pf.modelInput(r.data), [1, pf.SIZE, pf.SIZE, 3]) })); };
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: root + 'node_modules/@tesseract.js-data/eng/4.0.0_best_int', gzip: true, cacheMethod: 'none' });
  const ppm = (im) => { const hd = Buffer.from(`P6\n${im.width} ${im.height}\n255\n`), b = Buffer.alloc(im.width * im.height * 3); for (let i = 0, j = 0; i < im.data.length; i += 4, j += 3) { b[j] = im.data[i]; b[j + 1] = im.data[i + 1]; b[j + 2] = im.data[i + 2]; } return Buffer.concat([hd, b]); };
  // PaddleOCR, the second reader for soft photos (src/lib/paddle.ts), on the same ONNX Runtime and the site's models
  // (node scripts/fetch-assets.mjs) — as scripts/measure-ocr.mjs --paddle runs it; textcore's XY-cut orders its lines
  const P = await load('/src/lib/paddle.ts');
  const sess = async (f) => ort.InferenceSession.create(new Uint8Array(readFileSync(root + 'public/models/paddleocr/' + f)), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const [det, rec] = [await sess('PP-OCRv6_det_small.onnx'), await sess('PP-OCRv6_rec_small.onnx')];
  const alphabet = readFileSync(root + 'public/models/paddleocr/PP-OCRv6_rec_small.onnx.character.txt', 'utf8').split('\n');
  const nets = {
    det: async (x, w, h) => (await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, h, w]) }))[det.outputNames[0]].data,
    rec: async (x, w) => { const o = (await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, 48, w]) }))[rec.outputNames[0]]; return { data: o.data, T: o.dims[1], C: o.dims[2] }; },
  };
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const tc = bindTextcore(await wasm('textcore'));
  const engines = {
    paddle: (im) => P.paddleRead(im, nets, ip, alphabet),
    xycut: (boxes, gx, gy) => tc.xycut(boxes, gx, gy).order,
    ops: { ...ip, docCorners },
    read: async (im, _lang, _progress, layout) => readingOf((await worker.recognize(ppm(im), { tessedit_pageseg_mode: { page: '3', block: '6', line: '7', word: '8' }[layout] || '6' }, { text: true, blocks: true })).data),
  };
  /** a JPEG / PNG file → RGBA */
  const decode = (path) => {
    const pm = new mupdf.Image(readFileSync(path)).toPixmap(), w = pm.getWidth(), h = pm.getHeight(), n = pm.getNumberOfComponents(), px = pm.getPixels();
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; j < data.length; i += n, j += 4) { data[j] = px[i]; data[j + 1] = px[n >= 3 ? i + 1 : i]; data[j + 2] = px[n >= 3 ? i + 2 : i]; data[j + 3] = 255; }
    return { data, width: w, height: h };
  };
  // zxing-cpp (zxing-wasm's reader: the same C++ as the full build the site serves)
  const zx = await import('zxing-wasm/reader');
  await zx.prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) }, fireImmediately: true });
  const codes = async (im) => (await zx.readBarcodes({ data: im.data, width: im.width, height: im.height, colorSpace: 'srgb' }, { formats: [], tryHarder: true, maxNumberOfSymbols: 20 })).filter((c) => c.isValid).map((c) => c.text);
  return {
    ip, decode, codes, engines,
    /** the photo read as the tabs read it (the clean-up on, set upright and level; PaddleOCR for a soft photo) */
    read: (img, o = {}) => readPage(typeof img === 'string' ? decode(img) : img, { lang: 'eng', clean: true, auto: true, ...o }, engines),
    close: () => worker.terminate(),
  };
}
