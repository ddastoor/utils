// PDF Compare (src/lib/pdfcompare.ts on textkit-tokens.wasm — wasm/textkit/src/tokens.rs), held to:
//   · known answers for the tokens of a page (words with apostrophes and hyphens, numbers with their commas, a word broken
//     over two lines) and for the engine (the clean-up across a "(", edits apart staying apart, an added sentence put after
//     the full stop, moves exact and with small changes);
//   · 60 stretches of real legal prose (the Federal Register's pages, a paper) with 615 random edits: the patience
//     algorithm finds 98 % and more exactly and no change that was not made (the measurement that chose it over Myers' and
//     histogram — docs/WASM-AUDIT.md);
//   · the test contract (tests/fixtures/compare, scripts/make-compare-pdfs.py): the ten edits truth.json lists and nothing
//     else — other line and page breaks, words broken with hyphens, curly against straight quotes, other running heads and
//     page numbers —; the second version turned (/Rotate 90), the first behind a password; the scanned second version read
//     by Tesseract (the OCR tab's engine);
//   · the marked PDFs: MuPDF finds each change's words under its highlight or strike-out, pypdf reads the comments, the
//     pages' text is as it was (poppler).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';

const F = (n) => fileURLToPath(new URL(`../fixtures/compare/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

export default async (t, { load, wasm, root }) => {
  const C = await load('/src/lib/pdfcompare.ts');
  const { pageText } = await load('/src/lib/redact.ts');
  const { toPage } = await load('/src/lib/searchable.ts');
  const { readingOf } = await load('/src/lib/ocr.ts');
  const { bindTexttokens } = await load('/src/wasm/texttokens.ts');
  const kit = bindTexttokens(await wasm('textkit-tokens'));
  const mupdf = await import('mupdf');
  const OPTS = { ignoreCase: false, ignorePunct: false, heads: true };

  // ---- the tokens of a page: a page text made by hand (one box a character, lines one under another)
  const fake = (lines) => {
    let text = ''; const quads = [], line = [];
    lines.forEach((l, li) => {
      if (li) { text += '\n'; quads.push(null); line.push(-1); }
      [...l].forEach((c, i) => { const x = 10 + i * 6, y = 20 + li * 14; text += c; quads.push([x, y, x + 6, y, x, y + 10, x + 6, y + 10]); line.push(li); });
    });
    return { text, quads, line: Int32Array.from(line) };
  };
  const texts = (pt) => C.tokensOf(pt, 0).map((x) => x.text);
  t.eq(texts(fake(['The Buyer’s e-mail costs Rs. 1,25,000 (net).'])), ['The', 'Buyer’s', 'e-mail', 'costs', 'Rs', '.', '1,25,000', '(', 'net', ')', '.'], 'words with their apostrophes and hyphens, numbers with their commas, every sign on its own');
  const broken = C.tokensOf(fake(['the agree-', 'ment is signed']), 0);
  t.ok(broken.map((x) => x.text).join(' ') === 'the agreement is signed' && broken[1].hyph === 5 && broken[1].quads.length === 2 && broken[1].lines[0] !== broken[1].lines[1], 'a word broken over two lines with a hyphen is one word, with a box on each line');
  t.eq(texts(fake(['Section-', 'Two follows'])), ['Section', '-', 'Two', 'follows'], 'a hyphen at a line’s end before a capital is not a broken word');
  t.eq(texts(fake(['an agree­', 'ment'])), ['an', 'agreement'], 'a soft hyphen at a line’s end: one word');
  const vocab = new Set(['well-known']), wk = C.tokensOf(fake(['a well-', 'known name']), 0)[1];
  t.ok(C.keyOf(wk, OPTS, vocab) === 'well-known' && C.keyOf(wk, OPTS, new Set()) === 'wellknown', 'a broken word keeps its hyphen where the documents write it with one');
  t.ok(C.keyOf({ text: '“Agreement”', hyph: 0 }, OPTS, vocab) === '"Agreement"' && C.keyOf({ text: 'Buyer’s' }, OPTS, vocab) === "Buyer's" && C.keyOf({ text: 'ﬁnal' }, OPTS, vocab) === 'final', 'typographic quotes, apostrophes and ligatures are compared plain');
  t.ok(C.keyOf({ text: 'Agreement' }, { ...OPTS, ignoreCase: true }, vocab) === 'agreement', 'capitals ignored when asked');

  // ---- the engine
  const tok = (s) => s.split(' ');
  const r1 = kit.tokens(tok('pay within thirty ( 30 ) days of receipt'), tok('pay within sixty ( 60 ) days of receipt'));
  t.eq(r1.changes, [[2, 3, 2, 3]], 'thirty (30 → sixty (60: one change across the "(" (the clean-up)');
  const r2 = kit.tokens(tok('pay 30 days late and 5 percent more'), tok('pay 60 days late and 7 percent more'));
  t.eq(r2.changes, [[1, 1, 1, 1], [5, 1, 5, 1]], 'two edits four words apart stay two changes');
  const r3 = kit.tokens(tok('do not conform . The Buyer'), tok('do not conform . The Supplier shall keep records . The Buyer'));
  t.eq(r3.changes, [[4, 0, 4, 6]], 'an added sentence stands after the full stop ("The Supplier shall keep records .")');
  // a paragraph moved past a longer one (the shorter of the two is what moved)
  const para = tok('Notices under this Agreement shall be in writing and sent by post or e-mail .');
  const rest = tok('Each party shall keep confidential the terms of this Agreement and all information it receives from the other , and shall disclose it only to its employees .');
  const r4 = kit.tokens([...tok('A B C .'), ...para, ...rest], [...tok('A B C .'), ...rest, ...para]);
  t.ok(r4.moves.length === 1 && r4.moves[0][2] === 1 && r4.changes.length === 2 && r4.changes[r4.moves[0][0]][1] === para.length, 'a paragraph moved: one exact move, of that paragraph');
  const para2 = para.map((w, i) => (i === 3 ? 'Contract' : w));
  const r5 = kit.tokens([...tok('A B C .'), ...para, ...rest], [...tok('A B C .'), ...rest, ...para2]);
  t.ok(r5.moves.length === 1 && r5.moves[0][2] === 0, 'a paragraph moved with a word changed in it: a move, with small changes');
  const r6 = kit.tokens([], tok('a b'));
  t.ok(r6.changes.length === 1 && r6.same === 0 && r6.added === 2, 'an empty document against two words');

  // ---- the patience algorithm on real prose with known edits (as measured to choose it)
  const base = [];
  for (const f of ['federal-register-3p.pdf', 'two-column-paper.pdf']) {
    const doc = mupdf.Document.openDocument(readFileSync(join(root, 'tests/fixtures/pdf', f)), 'application/pdf');
    for (let i = 0; i < doc.countPages(); i++) base.push(...C.tokensOf(pageText(doc.loadPage(i)), i).map((x) => x.text));
  }
  let seed = 7; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32), ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const words = base.filter((w) => /\p{L}{3,}/u.test(w));
  let exact = 0, total = 0, extra = 0;
  for (let trial = 0; trial < 60; trial++) {
    const s0 = ri(0, base.length - 1500), A = base.slice(s0, s0 + 1500), at = new Set(), n = ri(6, 14);
    while (at.size < n) { const p = ri(10, A.length - 60); if ([...at].every((q) => Math.abs(q - p) > 60)) at.add(p); }
    let B = [...A]; const edits = [];
    for (const p of [...at].sort((x, y) => y - x)) {
      const kind = ['replace', 'replace', 'delete', 'insert', 'insert', 'move'][ri(0, 5)];
      if (kind === 'replace') { const k = ri(1, 3), rep = Array.from({ length: ri(1, 3) }, () => words[ri(0, words.length - 1)] + 'x'); B.splice(p, k, ...rep); edits.push({ kind, a: [p, p + k], len: rep.length }); }
      else if (kind === 'delete') { const k = ri(1, 8); B.splice(p, k); edits.push({ kind, a: [p, p + k], len: 0 }); }
      else if (kind === 'insert') { const k = ri(2, 12), src = ri(0, words.length - 20); B.splice(p, 0, ...words.slice(src, src + k).map((w) => w + 'y')); edits.push({ kind, a: [p, p], len: k }); }
      else { const k = ri(12, 30); if (p + k + 200 >= B.length) continue; const piece = B.splice(p, k); B.splice(p + 150, 0, ...piece); edits.push({ kind, a: [p, p + k], len: k }); }
    }
    const r = kit.tokens(A, B), moved = new Set(r.moves.flatMap((m) => [m[0], m[1]])), hit = new Array(r.changes.length).fill(0);
    for (const e of edits) {
      total++;
      const cov = r.changes.map((c, k) => [c, k]).filter(([c]) => (e.a[0] === e.a[1] ? c[0] <= e.a[0] && e.a[0] <= c[0] + c[1] : c[0] < e.a[1] && e.a[0] < c[0] + c[1]));
      if (cov.length !== 1) continue;
      const [c, k] = cov[0]; hit[k]++;
      if (e.kind === 'move' ? moved.has(k) && c[1] === e.a[1] - e.a[0] : c[1] === e.a[1] - e.a[0] && c[3] === e.len) exact++;
    }
    extra += r.changes.filter((c, k) => hit[k] === 0 && !moved.has(k)).length;
  }
  t.ok(exact >= 0.98 * total && extra === 0, `random edits on real prose: ${exact} of ${total} found exactly, ${extra} changes that were not made`);

  // ---- the test contract
  const read = (name, password) => {
    const doc = mupdf.Document.openDocument(readFileSync(F(name)), 'application/pdf');
    if (password) doc.authenticatePassword(password);
    const pts = [], geo = [], bounds = [];
    for (let i = 0; i < doc.countPages(); i++) { const p = doc.loadPage(i), b = p.getBounds(); const pt = pageText(p); pts.push(pt); geo.push(C.pageLines(pt, b)); bounds.push(b); }
    const heads = C.headLines(geo);
    return { doc, bounds, toks: pts.flatMap((pt, i) => C.tokensOf(pt, i, (l) => heads[i].has(l))) };
  };
  const diff = (a, b) => kit.tokens(a, b);
  const matches = (r, edits) => {
    const used = new Set(), missing = [];
    for (const e of edits) {
      const k = r.changes.findIndex((c, i) => !used.has(i) && c.kind === e.kind && norm(c.was) === norm(e.was) && norm(c.now) === norm(e.now));
      if (k < 0) missing.push(`${e.kind} “${e.was}” → “${e.now}”`); else used.add(k);
    }
    return { missing, extra: r.changes.filter((_, i) => !used.has(i)).map((c) => `${c.kind} “${c.was}” → “${c.now}”`) };
  };
  const v1 = read('v1.pdf'), v2 = read('v2.pdf');
  t.ok(v1.toks.filter((x) => x.hyph).length === TRUTH.hyphenated.length, `the first version’s ${TRUTH.hyphenated.length} words broken over two lines read as words`);
  const heads1 = v1.toks.filter((x) => x.head).map((x) => x.text).join(' ');
  t.ok(/DRAFT/.test(heads1) && /Page 3 of 3/.test(heads1.replace(/ (\d)/g, ' $1')), 'its running heads and page numbers are found');
  const R = C.compare(v1.toks, v2.toks, OPTS, diff), m = matches(R, TRUTH.edits);
  t.ok(!m.missing.length && !m.extra.length, `the ten edits and nothing else${m.missing.length ? ` — missing: ${m.missing.join('; ')}` : ''}${m.extra.length ? ` — not made: ${m.extra.join('; ')}` : ''}`);
  t.ok(R.changes.find((c) => c.kind === 'moved')?.exact === true && R.changes.every((c) => c.marksA.length && c.marksB.length), 'the moved clause is an exact move; every change has its marks on both sides');
  const rc = C.compare(v1.toks, v2.toks, { ...OPTS, ignoreCase: true }, diff), mc = matches(rc, TRUTH.edits.filter((e) => !e.case));
  t.ok(!mc.missing.length && !mc.extra.length, 'capitals ignored: the change of “agreement” to “Agreement” is gone, the other nine stay');
  const rp = C.compare(v1.toks, v2.toks, { ...OPTS, ignorePunct: true }, diff);
  t.ok(rp.changes.length === 9 && !rp.changes.some((c) => c.now === ','), 'punctuation left out: the added comma is gone');
  const rh = C.compare(v1.toks, v2.toks, { ...OPTS, heads: false }, diff);
  t.ok(rh.changes.length > 10 && rh.changes.some((c) => /DRAFT/.test(c.was) || /FINAL/.test(c.now)), 'running heads kept: their changes show');
  // counterpart: an equal token's partner has the same key
  const vocab2 = new Set([...v1.toks, ...v2.toks].map((x) => x.text.normalize('NFKC').toLowerCase()));
  let bad = 0;
  const inChange = (i) => R.raw.some(([o0, on]) => i >= o0 && i < o0 + on);
  for (let i = 0; i < R.tokensA.length; i++) if (!inChange(i)) { const j = C.counterpart(R.raw, i, true); if (C.keyOf(R.tokensA[i], OPTS, vocab2) !== C.keyOf(R.tokensB[j], OPTS, vocab2) || C.counterpart(R.raw, j, false) !== i) bad++; }
  t.ok(bad === 0, `every unchanged word’s partner on the other side is the same word, both ways (${bad} wrong)`);
  t.ok(/^PDF Compare — v1\.pdf → v2\.pdf\r\n10 changes · /.test(C.report('v1.pdf', 'v2.pdf', R)) && C.report('v1.pdf', 'v2.pdf', R).split('\r\n').length === 14, 'the list of changes as text');

  // the second version turned: the same ten edits, its marks on the page as shown
  const v2t = read('v2-turned.pdf'), Rt = C.compare(v1.toks, v2t.toks, OPTS, diff), mt = matches(Rt, TRUTH.edits);
  t.ok(!mt.missing.length && !mt.extra.length, `every page turned (/Rotate 90): the same ten edits${mt.missing.length ? ` — missing: ${mt.missing.join('; ')}` : ''}${mt.extra.length ? ` — not made: ${mt.extra.join('; ')}` : ''}`);
  const inside = (r, b) => r[0] >= b[0] - 1 && r[1] >= b[1] - 1 && r[2] <= b[2] + 1 && r[3] <= b[3] + 1;
  t.ok(Rt.changes.every((c) => c.marksB.every((mk) => mk.rects.every((r) => inside(r, v2t.bounds[mk.page])) && (mk.caret || mk.quads.every((q) => Math.abs(q[3] - q[1]) > Math.abs(q[2] - q[0]))))), 'on the turned pages the marks run down the page (the text’s direction), inside it');
  // the first behind a password
  const v1l = read('v1-locked.pdf', 'compare1'), Rl = C.compare(v1l.toks, v2.toks, OPTS, diff);
  t.ok(Rl.changes.length === 10, 'the first version behind a password: opened with it, the same changes');

  // ---- the marked PDFs, read back
  const dir = mkdtempSync(join(tmpdir(), 'pdfcompare-'));
  for (const [name, side, res, label] of [['v2.pdf', 'b', R, 'the changed version'], ['v1.pdf', 'a', R, 'the original'], ['v2-turned.pdf', 'b', Rt, 'the turned version']]) {
    const doc = mupdf.Document.openDocument(readFileSync(F(name)), 'application/pdf').asPDF();
    const before = []; for (let i = 0; i < doc.countPages(); i++) before.push(doc.loadPage(i).toStructuredText().asText());
    const n = C.markPdf(doc, side, res.changes);
    const out = doc.saveToBuffer('compress').asUint8Array(), path = join(dir, `${side}-${name}`);
    writeFileSync(path, out);
    const back = mupdf.Document.openDocument(out, 'application/pdf').asPDF();
    let annots = 0, under = 0, words = 0;
    for (let i = 0; i < back.countPages(); i++) {
      const p = back.loadPage(i), st = p.toStructuredText('preserve-whitespace');
      for (const a of p.getAnnotations()) {
        annots++;
        if (a.getType() === 'Caret') continue;
        // the words under the mark: MuPDF's characters whose middle the mark's quads hold
        const qs = a.getQuadPoints(); let got = '';
        st.walk({ onChar: (c, _o, _f, _s, q) => { const cx = (q[0] + q[2] + q[4] + q[6]) / 4, cy = (q[1] + q[3] + q[5] + q[7]) / 4; if (qs.some((Q) => cx >= Math.min(Q[0], Q[2], Q[4], Q[6]) - 0.5 && cx <= Math.max(Q[0], Q[2], Q[4], Q[6]) + 0.5 && cy >= Math.min(Q[1], Q[3], Q[5], Q[7]) - 0.5 && cy <= Math.max(Q[1], Q[3], Q[5], Q[7]) + 0.5)) got += c; } });
        const c = res.changes.find((x) => (side === 'a' ? x.marksA : x.marksB).some((mk) => mk.page === i && !mk.caret && Math.abs(mk.quads[0][0] - qs[0][0]) < 0.6 && Math.abs(mk.quads[0][1] - qs[0][1]) < 0.6));
        const want = c ? (side === 'a' ? c.was : c.now).replace(/\s+/g, '') : '?';
        words++; if (c && want.startsWith(got.replace(/[\s\-­]/g, '').slice(0, 8)) && got.replace(/[\s\-­]/g, '').length && want.includes(got.replace(/[\s\-­]/g, '').slice(0, Math.min(6, got.length)))) under++;
      }
      t.ok(p.toStructuredText().asText() === before[i], `${label}, page ${i + 1}: its text as it was`);
    }
    t.ok(annots === n && annots >= res.changes.length, `${label}: ${annots} comments written and read back`);
    t.ok(under === words, `${label}: every highlight / strike-out lies over its change’s words (${under} of ${words})`);
    const py = spawnSync('python3', ['-c', 'import sys\nfrom pypdf import PdfReader\nfor p in PdfReader(sys.argv[1]).pages:\n  for a in p.get("/Annots") or []:\n    a = a.get_object(); print(a["/Subtype"], a.get("/Contents", ""))', path], { encoding: 'utf8' });
    if (py.status === 0) {
      const lines = py.stdout.trim().split('\n');
      t.ok(lines.length === n && lines.every((l) => /^\/(Highlight|StrikeOut|Caret) /.test(l)) && (side === 'b' ? lines.some((l) => l === '/Highlight Was: “thirty (30”') : lines.some((l) => l === '/StrikeOut Now: “sixty (60”')), `${label}: pypdf reads the comments (${side === 'b' ? '“Was: thirty (30”' : '“Now: sixty (60”'})`);
    } else t.ok(true, 'pypdf could not run — skipped');
  }
  const pt = spawnSync('pdftotext', [join(dir, 'b-v2.pdf'), '-'], { encoding: 'utf8' }), pt0 = spawnSync('pdftotext', [F('v2.pdf'), '-'], { encoding: 'utf8' });
  if (pt.status === 0) t.ok(pt.stdout === pt0.stdout, 'poppler reads the marked copy’s text exactly as the original’s'); else t.ok(true, 'pdftotext is not installed — skipped');

  // ---- the scanned second version, read by Tesseract (the OCR tab's engine), its words placed on the page
  const require = createRequire(import.meta.url);
  const { createWorker, OEM } = require('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int', import.meta.url)), gzip: true, cacheMethod: 'none' });
  const scan = mupdf.Document.openDocument(readFileSync(F('v2-scan.pdf')), 'application/pdf');
  const ppm = (pix) => { const w = pix.getWidth(), hh = pix.getHeight(), px = pix.getPixels(); return Buffer.concat([Buffer.from(`P6\n${w} ${hh}\n255\n`), Buffer.from(px)]); };
  const spts = [], sgeo = [];
  for (let i = 0; i < scan.countPages(); i++) {
    const p = scan.loadPage(i), b = p.getBounds(), H = b[3] - b[1], sc = 300 / 72;
    const pix = p.toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true);
    const r = readingOf((await worker.recognize(ppm(pix), { tessedit_pageseg_mode: '3' }, { text: true, blocks: true })).data);
    const map = (x, y) => { const [X, Y] = toPage(x, y, 0, pix.getWidth(), pix.getHeight(), sc, H); return [b[0] + X, b[1] + H - Y]; };
    const ptx = C.ocrText(r, map); spts.push(ptx); sgeo.push(C.pageLines(ptx, b));
  }
  await worker.terminate();
  const sh = C.headLines(sgeo), stoks = spts.flatMap((p, i) => C.tokensOf(p, i, (l) => sh[i].has(l), true));
  const Rs = C.compare(v1.toks, stoks, OPTS, diff), ms = matches(Rs, TRUTH.edits);
  t.ok(!ms.missing.length && ms.extra.length <= 3, `the scanned second version (OCR): the ten edits${ms.missing.length ? ` — missing: ${ms.missing.join('; ')}` : ''}, ${ms.extra.length} misread${ms.extra.length ? `: ${ms.extra.join('; ')}` : ''}`);
  const thirty = Rs.changes.find((c) => c.was === 'thirty (30');
  const v2thirty = R.changes.find((c) => c.was === 'thirty (30');
  t.ok(thirty && v2thirty && Math.abs(thirty.marksB[0].rects[0][0] - v2thirty.marksB[0].rects[0][0]) < 4 && Math.abs(thirty.marksB[0].rects[0][1] - v2thirty.marksB[0].rects[0][1]) < 4, 'a change read on the scan is marked where the text version has it (within 4 points)');
};
