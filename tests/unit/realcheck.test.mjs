// "Is This Screenshot Real?" (src/lib/realcheck.ts): jpegcoef.wasm — libjpeg-turbo's coefficient reader — held to Pillow's
// tables and to MuPDF's decoding (the coefficients turned back into pixels are the pixels MuPDF decodes); the same coefficients
// from a baseline, a progressive and an arithmetic-coded file; the ghosts, copy-move, the embedded preview, the text checks,
// ExifTool's facts and the verdict on the test pictures of tests/fixtures/realcheck (truth.json; python3
// scripts/make-realcheck-shots.py). The rules themselves were measured on 647 generated files (docs/WASM-AUDIT.md).
import { readFileSync } from 'node:fs';
import { spawnSync } from '../lib/child.mjs';

export default async (t, { load, wasm }) => {
  const mupdf = await import('mupdf');
  const J = await load('/src/wasm/jpegcoef.ts'), { bindImgproc } = await load('/src/wasm/imgproc.ts'), rc = await load('/src/lib/realcheck.ts');
  const { readTags, readPreviews } = await load('/src/lib/exiftool.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  let jc = J.bindJpegcoef(await wasm('jpegcoef'));
  const root = new URL('../../', import.meta.url).pathname, fix = root + 'tests/fixtures/realcheck/';
  const truth = JSON.parse(readFileSync(fix + 'truth.json', 'utf8'));
  const bytes = (f) => new Uint8Array(readFileSync(fix + f));
  const decode = (b) => { const pm = new mupdf.Image(b).toPixmap(), W = pm.getWidth(), H = pm.getHeight(), n = pm.getNumberOfComponents(), px = pm.getPixels(); const data = new Uint8ClampedArray(W * H * 4); for (let i = 0, j = 0; j < data.length; i += n, j += 4) { data[j] = px[i]; data[j + 1] = px[n >= 3 ? i + 1 : i]; data[j + 2] = px[n >= 3 ? i + 2 : i]; data[j + 3] = 255; } return { data, width: W, height: H }; };
  const overlap = (a, b, pad = 8) => a[0] <= b[2] + pad && a[2] >= b[0] - pad && a[1] <= b[3] + pad && a[3] >= b[1] - pad;

  // ---------------------------------------------------------------- jpegcoef.wasm: tables, coefficients
  t.eq(jc.version(), '3.1.3', 'libjpeg-turbo 3.1.3');
  const pil = spawnSync('python3', ['-c', 'import sys, json\nfrom PIL import Image\nout = {}\nfor p in sys.argv[1:]:\n  im = Image.open(p); out[p.split("/")[-1]] = {"q": {str(k): list(v) for k, v in im.quantization.items()}, "layer": [list(x) for x in im.layer], "size": list(im.size)}\nprint(json.dumps(out))',
    ...['IMG-20261106-WA0007.jpg', 'receipt-edited.jpg', 'receipt-thumb.jpg', 'photo-cloned.jpg', 'photo-camera.jpg', 'grey.jpg', 'testorig.jpg', 'testimgari.jpg', 'coefs-prog.jpg'].map((f) => fix + f)], { encoding: 'utf8' });
  if (pil.status !== 0) t.ok(true, `Pillow's tables not compared: ${pil.stderr.slice(-200)}`);
  else for (const [f, p] of Object.entries(JSON.parse(pil.stdout))) {
    const fr = jc.open(bytes(f));
    t.eq([fr.width, fr.height], p.size, `${f}: its size`);
    t.eq(fr.components.map((c) => [c.id, c.h, c.v]), p.layer.map((l) => [l[0], l[1], l[2]]), `${f}: its components and sampling as Pillow reads them`);
    t.eq(fr.components.map((c) => c.table), p.layer.map((l) => p.q[String(l[3])]), `${f}: each component's quantization table as Pillow reads it`);
  }
  const q = (f) => { const fr = jc.open(bytes(f)); return rc.jpegFacts(fr); };
  t.eq(['IMG-20261106-WA0007.jpg', 'receipt-edited.jpg', 'receipt-thumb.jpg', 'photo-cloned.jpg', 'grey.jpg'].map((f) => [q(f).quality, q(f).standard]), [[78, true], [92, true], [90, true], [92, true], [85, true]], 'the quality each was saved at, with libjpeg\'s standard tables');
  t.eq([q('receipt-edited.jpg').sampling, q('grey.jpg').sampling, q('coefs-prog.jpg').progressive, q('testimgari.jpg').arithmetic], ['4:2:0', 'greyscale', true, true], 'sampling, progressive, arithmetic coding');
  t.eq(J.tableQuality(J.stdTable(50)), { quality: 50, off: 0 }, 'tableQuality: libjpeg\'s table at 50');
  t.eq(J.tableQuality(J.stdTable(1)).quality, 1, 'tableQuality: at 1');
  t.eq(J.stdTable(100), Array(64).fill(1), 'stdTable: all ones at 100');
  t.eq(J.stdTable(90).slice(0, 4), [3, 2, 2, 3], 'stdTable: quality 90 as libjpeg makes it (16 × 20 / 100 = 3.2 → 3)');

  // the coefficients turned back into pixels are the pixels MuPDF decodes (its own libjpeg) — the reading is right
  const idct = (() => {
    const C = Array.from({ length: 8 }, (_, u) => Array.from({ length: 8 }, (_, x) => (u ? 0.5 : Math.SQRT1_2 / 2) * Math.cos((2 * x + 1) * u * Math.PI / 16)));
    return (F) => { const out = new Float64Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += C[v][y] * C[u][x] * F[v * 8 + u]; out[y * 8 + x] = s; } return out; };
  })();
  for (const f of ['grey.jpg', 'testorig.jpg', 'photo-cloned.jpg']) {
    const b = bytes(f), fr = jc.open(b), c = fr.components[0], k = jc.coefs(0, c.bw, c.bh), img = decode(b);
    let worst = 0, n = 0, sum = 0;
    for (let by = 0; by < Math.floor(fr.height / 8); by++)
      for (let bx = 0; bx < Math.floor(fr.width / 8); bx++) {
        const F = Array.from({ length: 64 }, (_, i) => k[(by * c.bw + bx) * 64 + i] * c.table[i]), px = idct(F);
        for (let i = 0; i < 64; i++) {
          const p = (((by * 8 + (i >> 3)) * fr.width) + bx * 8 + (i & 7)) * 4, Y = fr.components.length === 1 ? img.data[p] : 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
          const d = Math.abs(Math.min(255, Math.max(0, px[i] + 128)) - Y);
          worst = Math.max(worst, d); sum += d; n++;
        }
      }
    t.ok(sum / n < (fr.components.length === 1 ? 0.6 : 1.6) && worst < (fr.components.length === 1 ? 2.5 : 20), `${f}: the coefficients decoded by hand give MuPDF's pixels (mean ${(sum / n).toFixed(2)}, worst ${worst.toFixed(1)} levels${fr.components.length > 1 ? ' — colour conversion and its rounding in between' : ''})`);
  }
  const same = (a, b) => { const x = jc.open(bytes(a)), cx = x.components.map((c) => Array.from(jc.coefs(fr2idx(x, c), c.bw, c.bh))); const y = jc.open(bytes(b)), cy = y.components.map((c) => Array.from(jc.coefs(fr2idx(y, c), c.bw, c.bh))); return JSON.stringify(cx) === JSON.stringify(cy); };
  const fr2idx = (fr, c) => fr.components.indexOf(c);
  t.ok(same('coefs-base.jpg', 'coefs-prog.jpg'), 'one set of pixels saved baseline and progressive: the same coefficients read from both');
  // an arithmetic-coded file: its coefficients turned back into pixels are Pillow's decoding of it (libjpeg-turbo, natively)
  const ari = spawnSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]); im.draft("YCbCr", im.size); y = im.getchannel(0) if im.mode == "YCbCr" else im.convert("L"); sys.stdout.buffer.write(bytes([im.width & 255, im.width >> 8, im.height & 255, im.height >> 8]) + y.tobytes())', fix + 'testimgari.jpg']);
  if (ari.status !== 0) t.ok(true, `the arithmetic-coded file not compared: ${String(ari.stderr).slice(-200)}`);
  else {
    const buf = ari.stdout, aw = buf[0] | (buf[1] << 8), Y = buf.subarray(4), fr = jc.open(bytes('testimgari.jpg')), c = fr.components[0], k = jc.coefs(0, c.bw, c.bh);
    let worst = 0;
    for (let by = 0; by < Math.floor(fr.height / 8); by++)
      for (let bx = 0; bx < Math.floor(fr.width / 8); bx++) {
        const px = idct(Array.from({ length: 64 }, (_, i) => k[(by * c.bw + bx) * 64 + i] * c.table[i]));
        for (let i = 0; i < 64; i++) worst = Math.max(worst, Math.abs(Math.min(255, Math.max(0, px[i] + 128)) - Y[(by * 8 + (i >> 3)) * aw + bx * 8 + (i & 7)]));
      }
    t.ok(worst <= 2, `testimgari.jpg (arithmetic coding): its coefficients decoded by hand give the brightness Pillow decodes, within ${worst.toFixed(2)} levels`);
  }
  // a file that is no JPEG: libjpeg's own words, and a new instance reads the next file
  let msg = '';
  try { jc.open(new TextEncoder().encode('not a picture at all')); } catch (e) { msg = e.message; }
  t.ok(/Not a JPEG file/.test(msg), `no JPEG: "${msg}"`);
  jc = J.bindJpegcoef(await wasm('jpegcoef'));
  t.eq(jc.open(bytes('grey.jpg')).width, 128, 'a new instance reads the next file');
  const cut = bytes('receipt-edited.jpg').slice(0, 30000), cf = jc.open(cut);
  t.ok(cf.read && cf.warnings > 0 && /premature end|Corrupt/i.test(cf.warning), `a file cut short is read as far as it goes, with libjpeg's warning ("${cf.warning}")`);
  const big = jc.open(bytes('receipt-thumb.jpg'), 1e6);
  t.eq([big.read, big.width, big.height], [false, 1080, 2400], 'a file above the limit: its size, its coefficients not read');

  // ---------------------------------------------------------------- the ghosts on the test pictures
  const ghostOf = async (f) => {
    const b = bytes(f), img = decode(b), clip = ip.blockClip(img);
    if (f.endsWith('.jpg')) { const fr = jc.open(b); return { g: rc.ghostOfJpeg(jc, fr, rc.jpegFacts(fr), clip), img }; }
    return { g: await rc.ghostOfPixels(ip, jc, img, clip), img };
  };
  for (const f of ['IMG-20261106-WA0007.jpg', 'receipt-thumb.jpg', 'photo-cloned.jpg', 'grey.jpg', 'receipt-genuine.png', 'receipt-photoshop.png', 'receipt-impossible.png']) {
    const { g } = await ghostOf(f);
    t.ok(!g || (!g.earlier && !g.areas.length), `${f}: saved once — no earlier save${g ? ` (the curve's deepest dip ${g.depth.toFixed(3)})` : ''}`);
  }
  {
    const { g, img } = await ghostOf('receipt-edited.jpg'), tr = truth['receipt-edited.jpg'], boxes = rc.areaBoxes(g, img.width, img.height);
    t.ok(Math.abs(g.earlier - tr.previous) <= 1, `receipt-edited.jpg: saved before at about ${g.earlier} (it was ${tr.previous}), then at 92; the dip ${g.depth.toFixed(2)}`);
    t.ok(boxes.length === 1 && overlap(boxes[0], tr.edit, 0), `receipt-edited.jpg: one area not saved like the rest, on the amount painted over (${JSON.stringify(boxes)} — the edit ${JSON.stringify(tr.edit)})`);
  }
  {
    const { g, img } = await ghostOf('receipt-sent.png'), tr = truth['receipt-sent.png'], boxes = rc.areaBoxes(g, img.width, img.height);
    t.ok(Math.abs(g.earlier - tr.previous) <= 1, `receipt-sent.png: a PNG that was a JPEG at about ${g.earlier} (it was ${tr.previous})`);
    t.ok(boxes.length >= 1 && boxes.every((b) => overlap(b, tr.edit, 0)), `receipt-sent.png: the area painted after it was a JPEG (${JSON.stringify(boxes)})`);
  }
  // keepBlocks: a clipped colour and the partial edge left out
  const keep = rc.keepBlocks(3, 2, 20, 16, new Uint8Array([0, 200, 0, 0, 0, 0]), true);
  t.eq(Array.from(keep), [1, 0, 0, 1, 1, 0], 'keepBlocks: a block with clipped colours and the partial last column left out');
  t.eq([1, 2, 3, 4, 5, 6, 7, 8].map((o) => rc.orientBox([10, 20, 30, 60], 100, 200, o)), [[10, 20, 30, 60], [70, 20, 90, 60], [70, 140, 90, 180], [10, 140, 30, 180], [20, 10, 60, 30], [140, 10, 180, 30], [140, 70, 180, 90], [20, 70, 60, 90]], 'orientBox: a box on a stored 100 × 200 picture, as each EXIF orientation shows it');
  t.eq([1, 2, 3, 4, 5, 6, 7, 8].map((o) => rc.orientBox(rc.orientBox([10, 20, 30, 60], 100, 200, o), [5, 6, 7, 8].includes(o) ? 200 : 100, [5, 6, 7, 8].includes(o) ? 100 : 200, rc.UNTURN[o])), Array(8).fill([10, 20, 30, 60]), 'orientBox: UNTURN brings each back');
  t.eq(rc.mergeBoxes([[0, 0, 10, 10], [30, 0, 40, 10], [100, 100, 110, 110]], 24), [[0, 0, 40, 10], [100, 100, 110, 110]], 'mergeBoxes: pieces near each other made one, a far one kept');

  // ---------------------------------------------------------------- copy-move (photos)
  {
    const img = decode(bytes('photo-cloned.jpg')), tr = truth['photo-cloned.jpg'].clone, cm = ip.copyMove(img, 1, 200, 4);
    const ok = cm.length === 1 && ((overlap(cm[0].a, tr.from, 0) && overlap(cm[0].b, tr.to, 0)) || (overlap(cm[0].a, tr.to, 0) && overlap(cm[0].b, tr.from, 0)));
    t.ok(ok, `photo-cloned.jpg: the patch copied over the mission patch found, both places (${JSON.stringify(cm)})`);
    for (const f of ['photo-camera.jpg', 'grey.jpg', 'testorig.jpg']) t.eq(ip.copyMove(decode(bytes(f)), 1, 200, 4).length, 0, `${f}: nothing copied`);
    const ast = decode(readFileSync(root + 'tests/fixtures/images/astronaut.png'));
    t.eq(ip.copyMove(ast, 1, 200, 4).length, 0, 'the astronaut as NASA published it: nothing copied');
  }

  // ---------------------------------------------------------------- the preview inside
  {
    const pv = await readPreviews(new Blob([bytes('receipt-thumb.jpg')]), 'receipt-thumb.jpg');
    t.eq(Object.keys(pv), ['IFD1:ThumbnailImage'], 'receipt-thumb.jpg: its EXIF thumbnail read by ExifTool');
    const th = decode(pv['IFD1:ThumbnailImage']), pic = decode(bytes('receipt-thumb.jpg')), small = ip.resize(pic, th.width, th.height), d = ip.cellDiff(th, small, 12), p = rc.previewDiff(d.cells);
    t.eq([th.width, th.height], [72, 160], 'the thumbnail is 72 × 160');
    t.ok(rc.previewDiffers(p), `receipt-thumb.jpg: the thumbnail shows the amount before it was changed (worst cell ${p.worst.toFixed(1)}, typical ${p.typical.toFixed(1)})`);
    const gen = decode(bytes('receipt-genuine.png')), same2 = ip.resize(gen, 72, 160), d2 = rc.previewDiff(ip.cellDiff(th, same2, 12).cells);
    t.ok(!rc.previewDiffers(d2), `the same thumbnail against the picture it was made of: alike (worst ${d2.worst.toFixed(1)}, typical ${d2.typical.toFixed(1)})`);
    const cam = await readPreviews(new Blob([bytes('photo-camera.jpg')]), 'photo-camera.jpg');
    if (cam['IFD1:ThumbnailImage']) {
      const th2 = decode(cam['IFD1:ThumbnailImage']), d3 = rc.previewDiff(ip.cellDiff(th2, ip.resize(decode(bytes('photo-camera.jpg')), th2.width, th2.height), 12).cells);
      t.ok(!rc.previewDiffers(d3), `photo-camera.jpg: the Canon's own thumbnail is the picture (worst ${d3.worst.toFixed(1)}, typical ${d3.typical.toFixed(1)})`);
    } else t.ok(true, 'photo-camera.jpg has no thumbnail');
    t.eq(Object.keys(await readPreviews(new Blob([bytes('IMG-20261106-WA0007.jpg')]), 'x.jpg')), [], 'a picture sent through a chat app: no preview inside');
  }

  // ---------------------------------------------------------------- the text checks (rows of words as the OCR gives them)
  const W = (text, x0, y0, x1, y1) => ({ text, conf: 95, x0, y0, x1, y1 });
  const receipt = (o = {}) => [
    W(o.clock ?? '9:02', 48, 18, 120, 52), W('5G', 890, 20, 930, 50),
    W('Payment', 300, 590, 560, 650), W('successful', 580, 590, 780, 650),
    W(o.big ?? '₹1,250', 338, 744, 742, 853),
    ...(o.date ?? 'Fri, 6 Nov 2026, 9:01 am').split(' ').map((w, i) => W(w, 48 + i * 90, 1150, 130 + i * 90, 1186)),
    W('Amount', 48, 1236, 190, 1272), W(o.row ?? '₹1,250.00', 830, 1236, 1032, 1272),
    W('UPI', 48, 1322, 110, 1358), W('Ref', 120, 1322, 180, 1358), W('No', 190, 1322, 240, 1358), W(o.ref ?? '631009412785', 790, 1322, 1032, 1358),
  ];
  const check = (o, today = '2026-11-28') => rc.textSigns(rc.rowsOf(receipt(o)), { width: 1080, height: 2400, today }).map((s) => s.id);
  t.eq(check({}), [], 'a receipt that agrees with itself: no sign');
  t.eq(check({ date: 'Sat, 6 Nov 2026, 9:01 am' }), ['weekday'], 'Saturday, 6 November 2026: that date is a Friday');
  t.eq(check({ date: 'Fri, 4 Dec 2026, 9:01 am' }), ['future'], 'a date after today');
  t.eq(check({ clock: '8:47' }), ['clock'], 'the status bar\'s clock 14 minutes before the payment');
  t.eq(check({ clock: '9:01' }), [], 'the clock at the payment\'s minute');
  t.eq(check({ clock: '4:01' }), [], 'the clock 7 hours "before" — a 12-hour phone at 4:01 pm, after: no sign');
  t.eq(check({ clock: '21:33', date: 'Fri, 6 Nov 2026, 9:31 pm' }), [], 'a 24-hour clock two minutes after');
  t.eq(check({ clock: '21:10', date: 'Fri, 6 Nov 2026, 9:31 pm' }), ['clock'], 'a 24-hour clock 21 minutes before');
  t.eq(check({ clock: '12:02', date: 'Fri, 6 Nov 2026, 11:58 pm' }), [], 'past midnight on a 12-hour phone: after, no sign');
  t.eq(check({ ref: '63100941278' }), ['ref'], 'a UPI reference of 11 digits');
  t.eq(check({ ref: '6310 0941 2785' }), [], 'a reference written in groups');
  t.eq(check({ row: '₹1,520.00' }), ['amounts'], 'two different amounts');
  t.eq([check({ big: '71,250' }), check({ big: '%1,250' }), check({ big: '1,250' })], [[], [], []], 'the rupee sign read as 7 or % or nothing: the same amount');
  t.eq(check({ clock: '8:47', date: 'Sat, 6 Nov 2026, 9:01 am', ref: '63100941278', row: '₹1,520.00' }).sort(), ['amounts', 'clock', 'ref', 'weekday'], 'receipt-impossible.png\'s four');

  // ---------------------------------------------------------------- the metadata (ExifTool) and the verdict
  const meta = async (f) => rc.metaFacts(await readTags(new Blob([bytes(f)]), f));
  const ps = await meta('receipt-photoshop.png');
  t.eq([ps.editors, ps.history.length > 0], [['Adobe Photoshop 26.1 (Windows)'], true], 'receipt-photoshop.png: Photoshop, and its history');
  t.eq(rc.metaSigns(ps).map((s) => s.id), ['software', 'history', 'modified'], 'receipt-photoshop.png: saved by an editor, a history, changed 2 h 38 min later');
  const sn = await meta('receipt-thumb.jpg');
  t.eq(rc.metaSigns(sn).map((s) => [s.id, s.strength]), [['software', 'strong'], ['modified', 'weak']], 'receipt-thumb.jpg: Snapseed, changed later');
  t.ok(sn.hasPreview, 'receipt-thumb.jpg: a preview inside');
  const wa = await meta('IMG-20261106-WA0007.jpg');
  t.eq(rc.metaSigns(wa).map((s) => s.id), ['no-meta'], 'the WhatsApp copy: no metadata');
  const camf = await meta('photo-camera.jpg');
  t.ok(camf.camera === 'Canon PowerShot S40' && !camf.editors.length, `photo-camera.jpg: "${camf.camera}", no editor`);
  t.eq(rc.metaSigns(await meta('receipt-genuine.png')).map((s) => s.id), ['no-meta'], 'the screenshot as the phone saved it: no metadata');

  t.eq(rc.verdict([]).tone, 'none', 'verdict: nothing found');
  t.eq(rc.verdict([{ id: 'twice', strength: 'weak' }]).tone, 'resaved', 'verdict: saved again');
  t.eq(rc.verdict([{ id: 'twice', strength: 'weak' }, { id: 'software', strength: 'strong' }, { id: 'ref', strength: 'strong' }]).headline, '2 signs of editing found', 'verdict: two signs');
  const eg = (await ghostOf('receipt-edited.jpg')).g;
  const sigs = rc.pictureSigns({ jpeg: q('receipt-edited.jpg'), ghost: eg, ghostBoxes: rc.areaBoxes(eg, 720, 1600), lossless: false, screenshot: true, copies: null, preview: null, name: 'receipt-edited.jpg' });
  t.eq(sigs.map((s) => s.id), ['changed', 'jpeg', 'no-copies'], 'receipt-edited.jpg\'s picture signs');
  t.eq(rc.pictureSigns({ jpeg: q('IMG-20261106-WA0007.jpg'), ghost: null, ghostBoxes: [], lossless: false, screenshot: true, copies: null, preview: null, name: 'IMG-20261106-WA0007.jpg' }).map((s) => s.id), ['jpeg', 'whatsapp', 'no-copies'], 'the WhatsApp copy\'s picture signs: facts only');
};
