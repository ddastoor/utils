// PDF Redact's library (src/lib/redact.ts) on the real MuPDF: the test PDFs of tests/fixtures/redact (scripts/make-redact-pdfs.py;
// truth.json says what is in them) — every number found, redacted, and gone from the saved file as three readers read it:
// MuPDF (the tab's own check), poppler's pdftotext and pypdf (skipped with a note where missing); the lines set solid
// around the numbers keep their words; black boxes where the numbers stood; the hidden places (comments, form fields, the
// document's title and subject, bookmarks) emptied.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || String(r.error || '') }; };
const which = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).status === 0;
const F = (n) => fileURLToPath(new URL(`../fixtures/redact/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const KINDS = ['aadhaar', 'pan', 'gstin', 'card', 'phone', 'email', 'upi', 'ifsc', 'account', 'dob'];

export default async (t, { load, wasm }) => {
  const mupdf = await import('mupdf');
  const R = await load('/src/lib/redact.ts');
  const { bindDevcore } = await load('/src/wasm/devcore.ts');
  const d = bindDevcore(await wasm('devcore-ids'));
  const scanWith = (words = []) => (text) => d.json('ids:scan', { text, kinds: KINDS, words });
  const scan = scanWith(['Ravi Kumar']);
  const open = (n) => mupdf.Document.openDocument(readFileSync(F(n)), 'application/pdf').asPDF();
  const digits = (s) => s.replace(/\D/g, '');

  // ---- finding
  const doc = open('statement.pdf');
  const baked = R.bakeAll(doc);
  t.eq([baked.annots, baked.widgets], [1, 1], 'the comment and the form field are baked into the page');
  const hits = [];
  for (let i = 0; i < doc.countPages(); i++) hits.push(...R.findOnPage(doc.loadPage(i), i, scan));
  const want = [];
  for (const [p, kinds] of Object.entries(TRUTH['statement.pdf'])) if (/^\d+$/.test(p)) for (const [k, vs] of Object.entries(kinds)) for (const v of vs) want.push([+p - 1, k, v]);
  const missing = want.filter(([p, k, v]) => !hits.some((h) => h.page === p && h.kind === k && R.norm(h.value) === R.norm(v)));
  t.ok(!missing.length, `every number of the statement found on its page (${want.length}; missing: ${missing.map((x) => x.join(' ')).join(', ')})`);
  t.ok(hits.some((h) => h.kind === 'phone' && h.page === 0 && h.text.includes('98765')) && hits.filter((h) => R.norm(h.value) === R.norm(TRUTH['statement.pdf'].field)).length >= 2, 'the comment’s phone number and the form field’s PAN found in the baked page');
  t.ok(hits.every((h) => h.rects.length >= 1), 'every hit has a box');

  // ---- redacting
  const done = await R.redact(doc, hits, { scrub: true });
  t.eq([done.pages, done.bookmarks], [3, 1], 'three pages redacted; the bookmark that names the Aadhaar number renamed');
  t.ok(done.scrubbed.some((s) => /information/.test(s)), `hidden places removed: ${done.scrubbed.join('; ')}`);
  const out = R.saveRedacted(doc);
  const left = await R.check(out, hits, scan);
  t.ok(!left.length, `the tab’s check: no redacted value left anywhere (${left.map((x) => `${x.value} in ${x.where}`).join(', ')})`);

  // ---- read by others
  const dir = mkdtempSync(join(tmpdir(), 'redact-')), path = join(dir, 'out.pdf');
  writeFileSync(path, out);
  const values = want.map((w) => w[2]);
  const gone = (text, who) => {
    const flat = text.replace(/\s+/g, ' '), dflat = digits(text);
    const still = values.filter((v) => (digits(v).length >= 8 ? dflat.includes(digits(v)) : flat.toLowerCase().includes(v.toLowerCase())));
    t.ok(!still.length, `${who}: none of the ${values.length} redacted values in the text (${still.join(', ')})`);
    const keep = TRUTH['statement.pdf'].keep.filter((k) => !flat.includes(k));
    t.ok(!keep.length, `${who}: the words around them kept, also on the lines set solid (${keep.join(' | ')})`);
  };
  { const x = mupdf.Document.openDocument(out, 'application/pdf'); let s = ''; for (let i = 0; i < x.countPages(); i++) s += x.loadPage(i).toStructuredText().asText() + '\n'; gone(s, 'MuPDF'); }
  if (which('pdftotext')) gone(run('pdftotext', ['-layout', path, '-']).stdout, 'poppler (pdftotext)'); else t.ok(true, 'pdftotext is not installed — skipped');
  const py = run('python3', ['-c', 'import sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\nprint("\\n".join(p.extract_text() for p in r.pages))\nprint(r.metadata)\nprint(r.outline)', path]);
  if (py.status === 0) gone(py.stdout, 'pypdf (text, metadata and bookmarks)'); else t.ok(true, `pypdf could not run — skipped (${py.stderr.slice(0, 80)})`);
  // the raw file: no value as plain bytes in any object (strings, metadata)
  const raw = new TextDecoder('latin1').decode(mupdf.Document.openDocument(out, 'application/pdf').asPDF().saveToBuffer('decompress').asUint8Array());
  const inRaw = values.filter((v) => raw.includes(v) || raw.includes(v.replace(/ /g, '')));
  t.ok(!inRaw.length, `the file with every stream decompressed holds none of them as text (${inRaw.join(', ')})`);

  // ---- black boxes where they stood
  const outDoc = mupdf.Document.openDocument(out, 'application/pdf');
  const pix = outDoc.loadPage(0).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true);
  const px = pix.getPixels(), w = pix.getWidth();
  const dark = (r) => { let n = 0, all = 0; for (let y = Math.round(r[1] * 2) + 2; y < Math.round(r[3] * 2) - 2; y++) for (let x = Math.round(r[0] * 2) + 2; x < Math.round(r[2] * 2) - 2; x++) { all++; const k = (y * w + x) * 3; if (px[k] + px[k + 1] + px[k + 2] < 60) n++; } return all ? n / all : 0; };
  const p0 = hits.filter((h) => h.page === 0 && h.source === 'text');
  const black = p0.filter((h) => h.rects.every((r) => dark(r) > 0.9)).length;
  t.ok(black === p0.length, `page 1: a black box over each of its ${p0.length} hits (${black})`);
  for (const pi of [1, 2]) {
    const pg = outDoc.loadPage(pi), pm = pg.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true), pp = pm.getPixels(), pw = pm.getWidth();
    const dk = (r) => { let n = 0, all = 0; for (let y = Math.round(r[1] * 2) + 2; y < Math.round(r[3] * 2) - 2; y++) for (let x = Math.round(r[0] * 2) + 2; x < Math.round(r[2] * 2) - 2; x++) { all++; const k = (y * pw + x) * 3; if (pp[k] + pp[k + 1] + pp[k + 2] < 60) n++; } return all ? n / all : 0; };
    const ph = hits.filter((h) => h.page === pi);
    t.ok(ph.length && ph.every((h) => h.rects.every((r) => dk(r) > 0.9)), `page ${pi + 1}${pi === 1 ? ' (turned 90°)' : ' (an embedded font)'}: black boxes over its ${ph.length} hits`);
  }

  // ---- pictures: a scanned page read by OCR, an OCR'd scan with its invisible text, a QR code
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { createWorker, OEM } = require('tesseract.js');
  const { readingOf } = await load('/src/lib/ocr.ts');
  const P = await load('/src/lib/redact-pictures.ts');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int', import.meta.url)), gzip: true, cacheMethod: 'none' });
  const { readBarcodes, prepareZXingModule } = await import('zxing-wasm/reader');
  await prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) }, fireImmediately: true });
  const ppm = (im) => { const h = Buffer.from(`P6\n${im.width} ${im.height}\n255\n`), b = Buffer.alloc(im.width * im.height * 3); for (let i = 0, j = 0; i < im.data.length; i += 4, j += 3) { b[j] = im.data[i]; b[j + 1] = im.data[i + 1]; b[j + 2] = im.data[i + 2]; } return Buffer.concat([h, b]); };
  const enginesFor = (dc) => ({
    render: (p, scale) => { const px = dc.loadPage(p).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, true, true); return { data: new Uint8ClampedArray(px.getPixels()), width: px.getWidth(), height: px.getHeight() }; },
    ocr: async (img) => readingOf((await worker.recognize(ppm(img), { tessedit_pageseg_mode: '3' }, { text: true, blocks: true })).data),
    codes: async (img) => (await readBarcodes({ data: img.data, width: img.width, height: img.height, colorSpace: 'srgb' }, { formats: [], tryHarder: true, maxNumberOfSymbols: 20 }))
      .map((c) => { const xs = [c.position.topLeft.x, c.position.topRight.x, c.position.bottomLeft.x, c.position.bottomRight.x], ys = [c.position.topLeft.y, c.position.topRight.y, c.position.bottomLeft.y, c.position.bottomRight.y]; return { text: c.text, format: c.format, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; }),
  });
  const sdoc = open('scan.pdf');
  const kinds = [0, 1].map((i) => R.pageKind(sdoc.loadPage(i)));
  t.eq(kinds.map((k) => k.scanned), [true, false], `scan.pdf: page 1 a picture without text (read by OCR), page 2 has its invisible text layer (${kinds.map((k) => `${k.chars} characters, ${Math.round(100 * k.picture)} % picture`).join('; ')})`);
  const shits = [...R.findOnPage(sdoc.loadPage(1), 1, scan), ...await P.findInPictures({ ocrPages: [0], codePages: [0, 1] }, scan, enginesFor(sdoc))];
  const st = TRUTH['scan.pdf'];
  for (const p of ['1', '2']) {
    const miss = Object.entries(st[p]).flatMap(([k, vs]) => vs.map((v) => [k, v])).filter(([k, v]) => !shits.some((h) => h.page === +p - 1 && (k === 'qr' ? h.kind === 'qr' && h.value.includes(v) : h.kind === k && R.norm(h.value) === R.norm(v))));
    t.ok(!miss.length, `scan.pdf page ${p}: ${p === '1' ? 'the numbers read in the picture' : 'the numbers of its text layer'} and the QR code found (missing: ${miss.map((x) => x.join(' ')).join(', ')})`);
  }
  await R.redact(sdoc, shits, { scrub: true });
  const sout = R.saveRedacted(sdoc), sd = mupdf.Document.openDocument(sout, 'application/pdf');
  const e2 = enginesFor(sd);
  for (const p of [0, 1]) {
    const read = (await e2.ocr(await e2.render(p, P.OCR_SCALE))).text, codes = await e2.codes(await e2.render(p, P.CODE_SCALE));
    const still = Object.entries(st[String(p + 1)]).filter(([k]) => k !== 'qr').flatMap(([, vs]) => vs).filter((v) => R.norm(read).includes(R.norm(v)));
    const keep = st.keep.filter((k) => !read.includes(k));
    t.ok(!still.length && !codes.length && !keep.length, `scan.pdf page ${p + 1} redacted: OCR reads none of its numbers (${still.join(', ')}), no QR code is left (${codes.length}), the rest of the letter still reads (${keep.join(', ')})`);
  }
  const ltext = mupdf.Document.openDocument(sout, 'application/pdf').loadPage(1).toStructuredText().asText();
  t.ok(!/\d{4} \d{4} \d{4}|BNZPM|99887/.test(ltext) && /Scanned letter/.test(ltext), 'scan.pdf page 2: its invisible text layer has lost the numbers, kept the rest');
  await worker.terminate();
  void d;
};
