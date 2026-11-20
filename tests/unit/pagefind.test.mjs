// Doc Scanner page finder (docs/WASM-AUDIT.md 121): imgproc.wasm's area resize against OpenCV's INTER_AREA
// (scripts/make-scanner-reference.py), the glue of src/lib/pagefind.ts, and the model itself — DocCornerNet LEAN on the
// app's ONNX Runtime Web — on photos whose corners are known exactly (scripts/make-scan-photos.py) and photos with no
// document in them.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const F = (p) => root + 'tests/fixtures/' + p;

/** The pictures of scripts/make-scanner-reference.py (`picture` there), opaque RGBA. */
function picture(kind, w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let v;
      if (kind === 'noise') v = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(c + 1, 83492791)) >>> 8) & 255;
      else if (kind === 'ramp') v = (Math.floor((x * 255) / Math.max(1, w - 1)) + c * 40 + y * 3) % 256;
      else { v = (Math.floor(x / 7) + Math.floor(y / 7)) % 2 === 0 ? 230 : 25; if (Math.abs(x - y) < 2) v = 128 + c * 20; }
      d[(y * w + x) * 4 + c] = v;
    }
    d[(y * w + x) * 4 + 3] = 255;
  }
  return { data: d, width: w, height: h };
}

export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const ip = bindImgproc(await wasm('imgproc'));

  // 1. the area resize = OpenCV's (the model was trained on cv2.resize(…, INTER_AREA))
  const ref = JSON.parse(readFileSync(F('scanner/resize-area.json'), 'utf8'));
  for (const c of ref.cases) {
    const out = ip.resizeArea(picture(c.kind, c.w, c.h), c.dw, c.dh), want = Buffer.from(c.out, 'base64');
    let max = 0, off = 0;
    for (let i = 0; i < want.length; i++) { const d = Math.abs(out.data[i] - want[i]); if (d > max) max = d; if (d) off++; }
    const grows = c.dw > c.w || c.dh > c.h; // OpenCV rounds the rows of a growing axis in two ways (vector code, scalar tail)
    t.ok(out.width === c.dw && out.height === c.dh && (grows ? max <= 1 && off <= want.length * 0.02 : max === 0),
      `resizeArea ${c.kind} ${c.w}×${c.h} → ${c.dw}×${c.dh} equals OpenCV ${ref.opencv} INTER_AREA (largest difference ${max}${off ? `, ${off} of ${want.length} values one off` : ''})`);
  }

  // 2. the glue
  const pf = await load('/src/lib/pagefind.ts');
  const white = new Uint8ClampedArray(pf.SIZE * pf.SIZE * 4).fill(255), x = pf.modelInput(white);
  t.ok(x.length === pf.SIZE * pf.SIZE * 3 && Math.abs(x[0] - (1 - 0.485) / 0.229) < 1e-6 && Math.abs(x[2] - (1 - 0.406) / 0.225) < 1e-6, 'model input: RGB, x/255, ImageNet mean and deviation, alpha dropped');
  t.throws(() => pf.modelInput(new Uint8ClampedArray(100)), 'model input of the wrong size refused');
  const out = (c, l) => ({ score_logit: { data: Float32Array.of(l) }, coords: { data: Float32Array.from(c) } });
  const r = pf.readOutput(out([0.1, 0.2, 0.9, 0.2, 0.9, 0.8, 0.1, 0.8], 0));
  t.ok(r && r.score === 0.5 && r.corners[4] === Float32Array.of(0.9)[0], 'outputs read by their length, not their names or order; P = sigmoid(logit)');
  t.eq(pf.readOutput({ coords: { data: Float32Array.from([0, 0, 1, 0, 1, 1, 0, NaN]) }, s: { data: Float32Array.of(3) } }), null, 'a coordinate that is not a number: no answer');
  t.eq(pf.readOutput({ coords: { data: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]) } }), null, 'no score: no answer');
  const sq = [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9];
  t.ok(pf.isPageQuad(sq), 'a square is a page');
  t.ok(!pf.isPageQuad([0.9, 0.1, 0.1, 0.1, 0.9, 0.9, 0.1, 0.9]), 'corners that cross (a bow tie) are no page');
  t.ok(!pf.isPageQuad([0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9, 0.1]), 'corners going round the other way are no page');
  t.ok(!pf.isPageQuad([0.1, 0.1, 0.2, 0.1, 0.2, 0.15, 0.1, 0.15]), 'a quad of 0.5 % of the photo is no page');
  t.ok(!pf.isPageQuad([0.1, 0.1, 0.5, 0.5, 0.9, 0.9, 0.1, 0.9]), 'three corners on one line are no page');
  t.ok(!pf.isPageQuad([0.2, 0.1, 0.9, 0.1, 0.3, 0.3, 0.1, 0.9]), 'a dent (not convex) is no page');
  t.ok(pf.isPageQuad([0.2, 0.05, 0.8, 0.05, 0.8, 0.95, 0.2, 0.95], 1100, 825), 'a page in a landscape photo');
  t.eq(pf.startQuad({ corners: sq, score: 0.9 }, null, 800, 600), { quad: sq, from: 'model' }, 'a sure model: its corners');
  t.eq(pf.startQuad({ corners: [-0.02, 0.1, 1.03, 0.1, 0.9, 0.9, 0.1, 0.9], score: 0.9 }, null, 800, 600).quad, [0, 0.1, 1, 0.1, 0.9, 0.9, 0.1, 0.9], 'corners just outside the photo are brought to its edge');
  const outline = { corners: [80, 60, 720, 60, 720, 540, 80, 540], confidence: 40 };
  t.eq(pf.startQuad({ corners: sq, score: 0.3 }, outline, 800, 600), { quad: sq, from: 'outline' }, 'an unsure model: the outline imgproc found');
  t.eq(pf.startQuad({ corners: [0.9, 0.1, 0.1, 0.1, 0.9, 0.9, 0.1, 0.9], score: 0.99 }, outline, 800, 600).from, 'outline', 'a sure model with crossing corners: the outline');
  t.eq(pf.startQuad(null, outline, 800, 600).from, 'outline', 'no model (it could not be fetched): the outline');
  t.eq(pf.startQuad(null, { corners: outline.corners, confidence: 0 }, 800, 600), { quad: pf.WHOLE, from: 'whole' }, 'nothing found: the whole photo, a little in from the edges');

  // 3. the model on photos with known corners, and photos without a document
  const ort = await import(root + 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs');
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(root + 'node_modules/scanic-ml/dist/doccornernet_lean.ort')), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const jpeg = await import(root + 'node_modules/@jsquash/jpeg/decode.js');
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const decode = async (p) => { const d = await jpeg.default(readFileSync(p)); return { data: d.data, width: d.width, height: d.height }; };
  const find = async (img) => {
    const s = ip.resizeArea(img, pf.SIZE, pf.SIZE);
    return pf.readOutput(await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', pf.modelInput(s.data), [1, pf.SIZE, pf.SIZE, 3]) }));
  };
  const err = (q, truth, w, h) => Math.max(...[0, 1, 2, 3].map((i) => Math.hypot((q[i * 2] - truth[i * 2]) * w, (q[i * 2 + 1] - truth[i * 2 + 1]) * h))) / Math.hypot(w, h) * 100;
  const { photos } = JSON.parse(readFileSync(F('scanner/photos.json'), 'utf8'));
  let outlineMissed = 0;
  for (const p of photos) {
    const img = await decode(F('scanner/' + p.name)), truth = p.corners.map((v, i) => v / (i % 2 ? img.height : img.width));
    const m = await find(img), start = pf.startQuad(m, ip.detectQuad(img), img.width, img.height);
    const e = err(start.quad, truth, img.width, img.height);
    t.ok(m && m.score >= pf.MIN_SCORE && start.from === 'model' && e <= 2, `${p.name} (${p.note}): the model finds the page — corners within ${e.toFixed(2)} % of the diagonal (P = ${m?.score.toFixed(3)})`);
    const o = ip.detectQuad(img);
    if (o.confidence <= 0 || err(o.corners.map((v, k) => v / (k % 2 ? img.height : img.width)), truth, img.width, img.height) > 5) outlineMissed++;
  }
  t.ok(outlineMissed >= 2, `the outline finder alone misses the page in ${outlineMissed} of ${photos.length} photos (why the model leads)`);
  for (const n of ['coffee.jpg', 'flower.jpg']) {
    const m = await find(await decode(F('images/' + n)));
    t.ok(m && m.score < pf.MIN_SCORE, `${n} (no document in it): the model is not sure there is one (P = ${m?.score.toFixed(3)}), so the outline or the whole photo is used`);
  }
};
