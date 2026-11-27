// Make PDF Searchable's text layer (src/lib/searchable.ts) on tests/fixtures/searchable (scripts/make-searchable-pdfs.py):
// the place of a point read on a page turned 0 – 3 quarter turns, back on the page as shown; then the real thing in Node —
// each scanned page drawn by MuPDF, turned upright as the fixture says, read by Tesseract (the OCR tab's engine), its words
// written as invisible text by `textLayer` + `stampPage`, the file saved and opened again: MuPDF, poppler's pdftotext and
// pypdf read the words; MuPDF's search finds a word where the scan shows it (its box on the page as shown, from the
// generator), on the upright, the sideways, the upside-down page and the page shown through /Rotate 90; the pages draw
// exactly as before (the text is invisible); the page of real text is left as it was. The tab — the turns found by the
// reading path, PaddleOCR for soft pages — is the e2e suite's.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/searchable/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

export default async (t, { load }) => {
  const S = await load('/src/lib/searchable.ts');
  const P = await load('/src/lib/pdf.ts');
  const { readingOf } = await load('/src/lib/ocr.ts');
  const mupdf = await import('mupdf');

  // ---- the maths: a point of the turned picture back on the page; the text's direction the derivative of that
  const Wr = 600, Hr = 800, s = 2, H = 400;
  for (let tt = 0; tt < 4; tt++) {
    const p = (x, y) => S.toPage(x, y, tt, Wr, Hr, s, H), [x0, y0] = [37, 91], a = p(x0, y0), bx = p(x0 + 10, y0), by = p(x0, y0 - 10);
    const dir = [(bx[0] - a[0]) / 5, (bx[1] - a[1]) / 5], up = [(by[0] - a[0]) / 5, (by[1] - a[1]) / 5], D = S.DIRS[tt];
    t.ok(Math.abs(dir[0] - D[0]) < 1e-9 && Math.abs(dir[1] - D[1]) < 1e-9 && Math.abs(up[0] - D[2]) < 1e-9 && Math.abs(up[1] - D[3]) < 1e-9, `turn ${tt}: the text's direction and its up are where the picture's x and −y go on the page`);
    const corners = [p(0, 0), p(tt % 2 ? Hr : Wr, tt % 2 ? Wr : Hr)].flat();
    t.ok(corners.every((v) => v >= -1e-9) && Math.max(corners[0], corners[2]) <= Wr / s + 1e-9 && Math.max(corners[1], corners[3]) <= H + 1e-9, `turn ${tt}: the turned picture's corners land on the page's`);
  }
  t.eq(S.latin('ﬁnal café ₹100 “ok”'), 'final café ?100 “ok”', 'WinAnsi: ligatures written out, ₹ a question mark, curly quotes kept');
  const lay = S.textLayer({ words: [{ text: 'Hello', conf: 90, x0: 100, y0: 50, x1: 300, y1: 90 }, { text: '(x)', conf: 90, x0: 320, y0: 50, x1: 380, y1: 95 }], lines: [{ w0: 0, w1: 2, para: 0, block: 0 }] }, { t: 0, Wr, Hr, s, H, width: (x) => x.length * 0.5 });
  t.ok(lay.words === 2 && /^BT 3 Tr \/STF 1 Tf /.test(lay.ops) && / Tm \(Hello \) Tj /.test(lay.ops) && /\(\\\(x\\\) \) Tj/.test(lay.ops) && lay.ops.endsWith('ET'), 'the layer: invisible text (3 Tr), each word with its own matrix, brackets escaped');
  const size = (45 / s) / S.EM_LINE;
  t.ok(lay.ops.includes(`${+(100 * (200 / s) / (2.5 * size)).toFixed(3)} Tz`), 'each word stretched to its box (Tz)');
  t.ok(S.hasText({ chars: 20 }) && !S.hasText({ chars: 19 }), 'a page with 20 characters and more has text already');

  // ---- the real thing: Tesseract in Node, MuPDF, three readers
  const require = createRequire(import.meta.url);
  const { createWorker, OEM } = require('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int', import.meta.url)), gzip: true, cacheMethod: 'none' });
  const turn = (img, tt) => { // the picture turned tt quarter turns clockwise
    let { data, width: w, height: h } = img;
    for (let k = 0; k < tt; k++) {
      const out = new Uint8ClampedArray(data.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sI = (y * w + x) * 4, dx = h - 1 - y, dy = x, dI = (dy * h + dx) * 4; out[dI] = data[sI]; out[dI + 1] = data[sI + 1]; out[dI + 2] = data[sI + 2]; out[dI + 3] = 255; }
      data = out; [w, h] = [h, w];
    }
    return { data, width: w, height: h };
  };
  const ppm = (im) => { const hd = Buffer.from(`P6\n${im.width} ${im.height}\n255\n`), b = Buffer.alloc(im.width * im.height * 3); for (let i = 0, j = 0; i < im.data.length; i += 4, j += 3) { b[j] = im.data[i]; b[j + 1] = im.data[i + 1]; b[j + 2] = im.data[i + 2]; } return Buffer.concat([hd, b]); };
  const helv = new mupdf.Font('Helvetica'), width = (x) => { let w = 0; for (const ch of x) w += helv.advanceGlyph(helv.encodeCharacter(ch.codePointAt(0)), 0); return w; };
  const src = readFileSync(F('scan.pdf'));
  const doc = mupdf.Document.openDocument(src, 'application/pdf').asPDF();
  const before = [], contents3 = doc.loadPage(2).getObject().get('Contents').toString();
  let added = 0;
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i), sc = 200 / 72, g = P.pageGeom(page);
    before.push(page.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false, true).getPixels().slice());
    const chars = page.toStructuredText().asText().replace(/\s/g, '').length;
    if (S.hasText({ chars })) continue;
    const pix = page.toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, true, true);
    const R = { data: new Uint8ClampedArray(pix.getPixels()), width: pix.getWidth(), height: pix.getHeight() };
    const tt = TRUTH.pages[i].turn, T = turn(R, tt);
    const r = readingOf((await worker.recognize(ppm(T), { tessedit_pageseg_mode: '3' }, { text: true, blocks: true })).data);
    const lay2 = S.textLayer(r, { t: tt, Wr: R.width, Hr: R.height, s: sc, H: g.H, width });
    await P.stampPage(doc, i, () => lay2.ops, { font: true });
    added += lay2.words;
  }
  t.ok(added > 150, `words written on the four scanned pages (${added})`);
  const out = doc.saveToBuffer('compress,garbage').asUint8Array();
  const dir = mkdtempSync(join(tmpdir(), 'searchable-')), path = join(dir, 'out.pdf'); writeFileSync(path, out);
  const back = mupdf.Document.openDocument(out, 'application/pdf');

  // every scanned page: its words read back, and found where the scan shows them
  for (const [i, pg] of TRUTH.pages.entries()) {
    const p = back.loadPage(i), text = p.toStructuredText().asText();
    if (pg.kind === 'text') { t.ok(/real text in it already/.test(text) && back.asPDF().loadPage(i).getObject().get('Contents').toString() === contents3, 'the page of real text: left exactly as it was'); continue; }
    const want = words(pg.words.map((w) => w.text).join(' ')), got = new Set(words(text));
    const share = want.filter((w) => got.has(w)).length / want.length;
    t.ok(share >= 0.95, `page ${i + 1} (${pg.kind}): ${Math.round(100 * share)} % of its words in its text layer`);
    let placed = 0, tried = 0;
    for (const w of pg.words.filter((x) => /^[a-z]{6,}$/i.test(x.text)).slice(0, 12)) {
      const hits = p.search(w.text); tried++;
      const [l, top, r2, b] = w.box, pad = (b - top) * 0.6;
      if (hits.some((qs) => qs.some((q) => { const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]], cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; return cx > l - pad && cx < r2 + pad && cy > top - pad && cy < b + pad; }))) placed++;
    }
    t.ok(placed >= tried - 1 && tried >= 8, `page ${i + 1} (${pg.kind}): a search finds ${placed} of ${tried} words over their place in the scan`);
    const after = p.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false, true).getPixels();
    let diff = 0; for (let k = 0; k < after.length; k++) if (after[k] !== before[i][k]) diff++;
    t.ok(diff === 0, `page ${i + 1}: drawn exactly as before — the text is invisible (${diff} values differ)`);
  }
  // other readers
  const all = words(TRUTH.pages.flatMap((p) => p.words.map((w) => w.text)).join(' '));
  const pt = spawnSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
  if (pt.status === 0) { const g = new Set(words(pt.stdout)); const sh = all.filter((w) => g.has(w)).length / all.length; t.ok(sh >= 0.95, `poppler (pdftotext) reads ${Math.round(100 * sh)} % of the scanned words`); } else t.ok(true, 'pdftotext is not installed — skipped');
  const py = spawnSync('python3', ['-c', 'import sys\nfrom pypdf import PdfReader\nprint("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', path], { encoding: 'utf8' });
  if (py.status === 0) { const g = new Set(words(py.stdout)); const sh = all.filter((w) => g.has(w)).length / all.length; t.ok(sh >= 0.95, `pypdf reads ${Math.round(100 * sh)} % of the scanned words`); } else t.ok(true, 'pypdf could not run — skipped');
  await worker.terminate();
};
