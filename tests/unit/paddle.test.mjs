// PaddleOCR, the second reader for soft photos (owner, 26 Nov 2026: "Ok use PaddleOCR fallback for soft photos"):
// src/lib/paddle.ts and imgproc's p_resize_linear, p_net_planes, p_db_boxes, p_crop_quad, p_ctc held to what they port —
// RapidOCR 3.10.0 and OpenCV (tests/fixtures/paddle/reference.json from scripts/make-paddle-reference.py):
//   - each step on inputs both sides make exactly: INTER_LINEAR resizing, get_rotate_crop_image, DBPostProcess,
//     CTCLabelDecode, and RapidOCR's size rules (Python's round half to even);
//   - the whole reading of three fixture photos on the site's models (public/models/paddleocr, fetched by the build):
//     the same lines and boxes as RapidOCR (without its direction classifier, as the app reads), the same text;
//   - paddleResult: reading order, lines side by side, list marks, words and their boxes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default async (t, { load, wasm }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const ref = JSON.parse(readFileSync(root + 'tests/fixtures/paddle/reference.json', 'utf8'));
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const P = await load('/src/lib/paddle.ts');
  const b64 = (s) => Buffer.from(s, 'base64');
  /** the RGB pattern both sides make: (x·37 + y·11 + c·91 + (x·y) mod 17) mod 256 */
  const pattern = (w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) d[(y * w + x) * 4 + c] = c === 3 ? 255 : (x * 37 + y * 11 + c * 91 + ((x * y) % 17)) % 256;
    return { data: d, width: w, height: h };
  };
  /** RGBA against OpenCV's RGB bytes: the largest difference and the share of values that differ */
  const diff = (im, rgb) => { let max = 0, off = 0; for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) for (let c = 0; c < 3; c++) { const d = Math.abs(im.data[i + c] - rgb[j + c]); if (d > max) max = d; if (d) off++; } return { max, share: off / rgb.length }; };

  // ---- RapidOCR's size rules
  t.eq([P.roundEven(62.5), P.roundEven(63.5), P.roundEven(46.875), P.roundEven(-0.5) + 0, P.roundEven(2.5000001)], [62, 64, 47, 0, 3], "round half to even, as Python's round()");
  t.eq(P.boundSize(3024, 4032), { w: 1504, h: 1984 }, 'a phone still made at most 2000 px a side, rounded to 32 half to even (reduce_max_side: 1500 → 1504, 2000 → 62.5 × 32 → 1984)');
  t.eq(P.boundSize(1080, 1920), { w: 1080, h: 1920 }, 'a photo that fits is read as it is (no rounding)');
  t.eq(P.boundSize(400, 20), { w: 608, h: 32 }, 'a strip under 30 px high made 30 high, both sides rounded to 32 (increase_min_side)');
  t.eq(P.detSize(1080, 1920), { w: 1088, h: 1920 }, "the detector's input: the short side at least 736, both sides multiples of 32");
  t.eq(P.detSize(500, 300), { w: 1216, h: 736 }, 'a small picture brought up to 736 on its short side');
  t.eq([P.verticalPadding(1000, 800), P.verticalPadding(1000, 100), P.verticalPadding(300, 25)], [0, 75, 24], 'black rows above and below a very wide or very low picture only (apply_vertical_padding)');
  const sb = P.sortedBoxes([{ box: [50, 12, 0, 0, 0, 0, 0, 0] }, { box: [10, 18, 0, 0, 0, 0, 0, 0] }, { box: [5, 40, 0, 0, 0, 0, 0, 0] }, { box: [90, 49, 0, 0, 0, 0, 0, 0] }, { box: [70, 58, 0, 0, 0, 0, 0, 0] }]);
  t.eq(sb.map((b) => b.box[0]), [10, 50, 5, 70, 90], 'sorted_boxes: a new line where the top moves 10 px or more from the box before (chained), then left to right within a line');

  // ---- cv2.resize INTER_LINEAR (down, up, the same size, one axis each way)
  for (const r of ref.resize) {
    const got = ip.resizeLinear(pattern(r.w, r.h), r.dw, r.dh), d = diff(got, b64(r.rgb));
    t.ok(got.width === r.dw && got.height === r.dh && d.max <= 1 && d.share < 0.02, `INTER_LINEAR ${r.w}×${r.h} → ${r.dw}×${r.dh} as cv2.resize (at most 1 apart, ${(100 * d.share).toFixed(2)} % of the values: OpenCV's 11-bit weights)`);
  }
  // the networks' input: the same pixels, as planes B, G, R of v / 127.5 − 1, padded with 0
  {
    const r = ref.resize[0], rgb = b64(r.rgb), pl = ip.netPlanes(pattern(r.w, r.h), r.dw, r.dh, r.dw + 7), n = r.dh * (r.dw + 7);
    let max = 0, pad = 0;
    for (let y = 0; y < r.dh; y++) for (let x = 0; x < r.dw + 7; x++) for (let c = 0; c < 3; c++) {
      const v = pl[(2 - c) * n + y * (r.dw + 7) + x];
      if (x >= r.dw) pad = Math.max(pad, Math.abs(v)); else max = Math.max(max, Math.abs(v - (rgb[(y * r.dw + x) * 3 + c] / 127.5 - 1)));
    }
    t.ok(pl.length === 3 * n && max <= 1 / 127.5 + 1e-6 && pad === 0, `netPlanes: planes B, G, R of the resized pixels / 127.5 − 1 (within one step: ${max.toFixed(4)}), the padding 0`);
  }

  // ---- get_rotate_crop_image: a turned quad, a tall one (a quarter turn), one partly outside the picture
  for (const c of ref.crop) {
    const got = ip.cropQuad(pattern(c.w, c.h), c.quad), d = got ? diff(got, b64(c.rgb)) : { max: 999, share: 1 };
    t.ok(got && got.width === c.cw && got.height === c.ch && d.max <= 3 && d.share < 0.15, `crop of [${c.quad.join(', ')}]: ${c.cw}×${c.ch} as get_rotate_crop_image (at most ${d.max} apart, ${(100 * d.share).toFixed(1)} % of the values: OpenCV's warp works in 1/32 px and 15-bit weights)`);
  }
  t.eq(ip.cropQuad(pattern(20, 20), [5, 5, 5, 5, 5, 5, 5, 5]), null, 'a quad of no size gives no crop');

  // ---- DBPostProcess on a probability map: soft-edged boxes, one turned, two touching (one region), a speck
  {
    const d = ref.db, u8 = b64(d.u8), prob = Float32Array.from(u8, (v) => v / 255);
    const got = ip.dbBoxes(prob, d.w, d.h, d.dw, d.dh);
    const key = (b) => `${Math.round(b[0] / 4)},${Math.round(b[1] / 4)}`;
    const want = new Map(d.boxes.map((b, i) => [key(b), { b, s: d.scores[i] }]));
    let close = 0, worst = 0, sdiff = 0;
    for (const g of got) {
      // the same box: corners within 2 px (pyclipper's round offset is cut to whole pixels, the rectangle here exact)
      const m = d.boxes.map((b, i) => ({ i, e: Math.max(...b.map((v, k) => Math.abs(v - g.box[k]))) })).sort((a, b) => a.e - b.e)[0];
      if (m && m.e <= 2) { close++; worst = Math.max(worst, m.e); sdiff = Math.max(sdiff, Math.abs(g.score - d.scores[m.i])); }
    }
    t.ok(got.length === d.boxes.length && close === got.length && sdiff < 0.01, `DBPostProcess: the ${d.boxes.length} boxes RapidOCR finds (corners within ${worst} px, scores within ${sdiff.toFixed(4)}; ${got.length} found)`);
    t.ok(want.size === d.boxes.length, 'the reference boxes are apart');
  }

  // ---- CTCLabelDecode (repeats folded, blanks dropped, the mean probability)
  {
    const c = ref.ctc, probs = new Float32Array(b64(c.probs).buffer.slice(b64(c.probs).byteOffset, b64(c.probs).byteOffset + c.T * c.C * 4));
    const r = ip.ctc(probs, c.T, c.C), chars = ['', ...c.chars, ' '];
    const text = Array.from(r.cls, (k) => chars[k]).join(''), score = r.prob.reduce((s, p) => s + Math.round(p * 1e5) / 1e5, 0) / r.prob.length;
    t.eq(text, c.text, `CTC: the text CTCLabelDecode reads (${JSON.stringify(c.text)})`);
    t.near(score, c.score, 1e-4, 'CTC: its mean probability');
    t.ok(r.step.every((s, i) => i === 0 || s > r.step[i - 1]), 'CTC: the steps of the characters kept, in order');
  }

  // ---- the whole reading of three photos, on the site's models, held to RapidOCR
  const ort = await import(root + 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs');
  ort.env.wasm.numThreads = 1;
  const sess = (f) => ort.InferenceSession.create(new Uint8Array(readFileSync(root + 'public/models/paddleocr/' + f)), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const [det, rec] = [await sess('PP-OCRv6_det_small.onnx'), await sess('PP-OCRv6_rec_small.onnx')];
  const alphabet = readFileSync(root + 'public/models/paddleocr/PP-OCRv6_rec_small.onnx.character.txt', 'utf8').split('\n');
  t.eq(alphabet.length, 18708, "the recogniser's alphabet out of its metadata: 18,708 characters (and the blank and the space: its 18,710 classes)");
  const nets = {
    det: async (x, w, h) => (await det.run({ x: new ort.Tensor('float32', x, [1, 3, h, w]) }))[det.outputNames[0]].data,
    rec: async (x, w) => { const o = (await rec.run({ x: new ort.Tensor('float32', x, [1, 3, 48, w]) }))[rec.outputNames[0]]; return { data: o.data, T: o.dims[1], C: o.dims[2] }; },
  };
  const jpeg = await import(root + 'node_modules/@jsquash/jpeg/decode.js');
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const lev = (a, b) => { let prev = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[b.length]; };
  for (const ph of ref.photos) {
    const d = await jpeg.default(readFileSync(root + 'tests/fixtures/images/' + ph.file)), img = { data: d.data, width: d.width, height: d.height };
    const lines = await P.paddleRead(img, nets, ip, alphabet);
    // each line matched to RapidOCR's by its box: within 2 px on the picture the detector saw (a photo made smaller
    // first: that many px larger)
    const tol = 2 * Math.max(1, img.width / P.boundSize(img.width, img.height).w) + 1;
    const used = new Set(), match = lines.map((l) => {
      const m = ph.boxes.map((r, i) => ({ i, e: Math.max(...r.map((v, k) => Math.abs(v - l.box[k]))) })).filter((x) => !used.has(x.i)).sort((a, z) => a.e - z.e)[0];
      if (m && m.e <= tol) { used.add(m.i); return m; }
      return null;
    });
    const far = Math.max(0, ...match.filter(Boolean).map((m) => m.e));
    t.ok(lines.length === ph.txts.length && match.every(Boolean), `${ph.file}: the ${ph.txts.length} lines RapidOCR reads, each box within ${far.toFixed(1)} px of its own (at most ${tol.toFixed(1)}; ${lines.length} read, ${match.filter(Boolean).length} matched)`);
    let same = 0, chars = 0, edits = 0;
    match.forEach((m, k) => { if (!m) return; const a = lines[k].text, b = ph.txts[m.i]; if (a === b) same++; edits += lev(a, b); chars += b.length; });
    t.ok(same >= 0.9 * ph.txts.length && edits / chars < 0.01, `${ph.file}: ${same} of ${ph.txts.length} lines read exactly as RapidOCR reads them, ${(100 * edits / Math.max(1, chars)).toFixed(2)} % of the characters apart (the line's own width here, RapidOCR's widest of six there)`);
    // the order: RapidOCR's sorting given RapidOCR's own boxes gives RapidOCR's order exactly (on the picture the
    // detector saw: the boxes made smaller again by the photo's scale) …
    const sc = img.width / P.boundSize(img.width, img.height).w;
    const own = P.sortedBoxes(ph.boxes.map((b, i) => ({ i, box: b.map((v) => v / sc) }))).map((x) => x.i);
    t.eq(own, ph.boxes.map((_, i) => i), `${ph.file}: sorted_boxes on RapidOCR's own boxes gives its order`);
    // … and on ours, which lie up to 2 px from them, nearly: its rows are chains of boxes whose tops lie within 10 px of
    // the one before, and on the tilted table of the checklist photo a box 2 px higher or lower moves to the next row
    const idx = match.filter(Boolean).map((m) => m.i);
    let inv = 0; for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) if (idx[a] > idx[b]) inv++;
    const pairs = (idx.length * (idx.length - 1)) / 2;
    t.ok(inv <= 0.06 * pairs, `${ph.file}: read in nearly RapidOCR's order (${inv} of ${pairs} pairs the other way round; at most 6 %)`);
    t.ok(lines.every((l) => l.score >= 0.5 && l.text.trim() && l.chars.every((c) => c.x0 >= 0 && c.x1 <= 1 && c.x0 <= c.x1)), `${ph.file}: every line sure enough (≥ 0.5), not empty, its characters along it`);
  }
  // a reading the page no longer wants ends (null), and nothing is read for an empty picture
  t.eq(await P.paddleRead({ data: new Uint8ClampedArray(400 * 300 * 4).fill(255), width: 400, height: 300 }, nets, ip, alphabet), [], 'a blank page: no lines');
  let calls = 0;
  const nl = await jpeg.default(readFileSync(root + 'tests/fixtures/images/doc-newsletter-frame.jpg'));
  t.eq(await P.paddleRead({ data: nl.data, width: nl.width, height: nl.height }, nets, ip, alphabet, { stale: () => ++calls > 2 }), null, 'a reading made stale ends at its next check (null)');

  // ---- paddleResult: the text as the tabs show it
  const L = (text, box, o = {}) => ({ text, score: 0.95, box, tall: false, chars: [...text].map((c, i, a) => ({ c, p: c === 'x' ? 0.4 : 0.98, x0: i / a.length, x1: (i + 1) / a.length })), ...o });
  const two = [L('Left one', [10, 10, 200, 10, 200, 30, 10, 30]), L('Right one', [300, 12, 500, 12, 500, 32, 300, 32]), L('Left two', [10, 40, 200, 40, 200, 60, 10, 60]), L('Right two', [300, 42, 500, 42, 500, 62, 300, 62])];
  t.eq(P.paddleResult(two).text, 'Left one Right one\nLeft two Right two', "one column: RapidOCR's order — a row's boxes side by side joined into one line");
  t.eq(P.paddleResult(two, { order: [0, 2, 1, 3] }).text, 'Left one\nLeft two\nRight one\nRight two', 'columns: the order given (the XY-cut), column by column');
  const cut = P.cutInput(two);
  t.ok(cut.boxes[0].join() === '18,18,192,22' && Math.abs(cut.gx - 3.2) < 1e-9 && cut.gy === 2, `what the XY-cut is given: the middle fifth of each box (20 px high → 18 … 22), as much off its ends; the gaps from that middle — 0.8 and half of it (${cut.boxes[0]}; ${cut.gx}, ${cut.gy})`);
  t.eq(P.cutInput([L('a', [100, 10, 104, 10, 104, 30, 100, 30])]).boxes[0], [102, 18, 102, 22], 'a box narrower than its height: cut to its middle, never turned inside out');
  // a newsletter's video frame as PaddleOCR boxed it (tests/fixtures/images/doc-newsletter-soft-frame.jpg): a title 11 px
  // above two columns whose lines interleave and whose boxes, wider than the text, touch — with the whole boxes the
  // XY-cut finds neither the gap under the title nor the gutter and reads across the columns; with their middles it
  // reads the title, the left column, then the right one
  const { bindTextcore } = await load('/src/wasm/textcore.ts'), tc = bindTextcore(await wasm('textcore'));
  const news = [L('Why you need Kubernetes and what it can do', [110, 104, 817, 104, 817, 145, 110, 145])];
  for (let k = 0; k < 8; k++) news.push(L(`Left line ${k}`, [110, 156 + 20.5 * k, 470, 156 + 20.5 * k, 470, 181 + 20.5 * k, 110, 181 + 20.5 * k]));
  for (let k = 0; k < 8; k++) news.push(L(`Right line ${k}`, [505, 170 + 20.5 * k, 860, 170 + 20.5 * k, 860, 193 + 20.5 * k, 505, 193 + 20.5 * k]));
  const cols = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].join();
  const whole = tc.xycut(P.lineBoxes(news), 0.8 * 25, 0.5 * 25).order, mid = P.cutInput(news), got = tc.xycut(mid.boxes, mid.gx, mid.gy).order;
  t.ok(whole.join() !== cols && got.join() === cols, `a title close above two columns of touching boxes: the whole boxes give no way in (${whole.slice(0, 6).join(' ')} …), their middles give the title, the left column, the right one (${got.join(' ')})`);
  const marks = P.paddleResult([L('● First point', [10, 10, 300, 10, 300, 30, 10, 30]), L('☐ Second point', [10, 40, 300, 40, 300, 60, 10, 60]), L('o Spanish o stays', [10, 70, 300, 70, 300, 90, 10, 90]), L('- a dash stays', [10, 100, 300, 100, 300, 120, 10, 120])]);
  t.eq(marks.text, 'First point\nSecond point\no Spanish o stays\n- a dash stays', 'a list mark read as a character at a line\'s start left out (●, ☐); letters and dashes kept');
  t.ok(marks.words.length === 12 && marks.words[0].text === 'First', `the words of the lines without the marks (${marks.words.map((w) => w.text).join(' ')})`);
  const one = P.paddleResult([L('ab xxx cd', [100, 50, 190, 50, 190, 70, 100, 70])]);
  t.eq(one.words.map((w) => [w.text, Math.round(w.conf), w.x0, w.x1]), [['ab', 98, 100, 120], ['xxx', 40, 130, 160], ['cd', 98, 170, 190]], "each word: its characters' mean probability × 100, its box where its characters stand along the line");
  t.near(one.confidence, (98 + 40 + 98) / 3, 1e-9, "the reading's confidence: the mean of its words'");
  const tall = P.paddleResult([L('ab cd', [100, 50, 120, 50, 120, 150, 100, 150], { tall: true })]);
  t.ok(tall.words.every((w) => w.x0 === 100 && w.y0 === 50 && w.x1 === 120 && w.y1 === 150), 'a line that stood up and down: its words take the line\'s box');
  t.eq(P.paddleResult([]).text, '', 'no lines, no text');
};
