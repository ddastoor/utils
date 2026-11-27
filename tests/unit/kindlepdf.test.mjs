// PDF for Kindle (src/lib/kindlepdf.ts; the cuts: wasm/imgproc/kindle.c) in Node on its own engines (MuPDF, textcore.wasm,
// imgproc.wasm; JPEGs by MuPDF). The owner's rules (potentials #109): technical PDFs kept exactly as typeset — nothing
// reflowed —, the margins trimmed, a page of columns cut into its columns in reading order, each column cut into pieces
// as high as the screen at the gaps between lines (never through a line, a formula or a figure), pages of the screen's
// shape with "p. 3 · 2 of 4" on each; the pieces vector (the page's own text, still searchable — each word once), scanned
// pages as greyscale pictures. Held to the ground truth of tests/fixtures/kindle/ (`node scripts/make-kindle-pdfs.mjs`:
// every line, figure, formula and table where the script put it) and to the repository's real PDFs.
import { readFileSync } from 'node:fs';

const K = (n) => readFileSync(new URL(`../fixtures/kindle/${n}`, import.meta.url));
const PDF = (n) => readFileSync(new URL(`../fixtures/pdf/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(new URL('../fixtures/kindle/index.json', import.meta.url), 'utf8'));

export default async (t, { load, wasm }) => {
  const KP = await load('/src/lib/kindlepdf.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const m = await import('mupdf');
  const tc = bindTextcore(await wasm('textcore')), ip = bindImgproc(await wasm('imgproc'));
  const jpeg = async (img, grey, q) => {
    const pix = new m.Pixmap(grey ? m.ColorSpace.DeviceGray : m.ColorSpace.DeviceRGB, [0, 0, img.width, img.height], false), d = pix.getPixels();
    for (let i = 0, j = 0; i < img.width * img.height; i++) {
      const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
      if (grey) d[j++] = (77 * r + 150 * g + 29 * b) >> 8; else { d[j++] = r; d[j++] = g; d[j++] = b; }
    }
    return pix.asJPEG(q ?? 80, false).slice();
  };
  const engines = { m, tc, ip, jpeg };
  const open = (b) => new m.PDFDocument(b);
  const base = { screen: [1264, 1680], removeHeaders: true, labels: true };
  const convert = (bytes, o = {}) => KP.pdfForKindle(open(bytes), { ...base, ...o }, undefined, engines);
  const LABEL = /^p\. \d+ · \d+ of \d+$/;
  const rejects = async (fn, re, msg) => { try { await fn(); t.ok(false, `${msg}: did not fail`); } catch (e) { t.ok(re.test(String(e?.message || e)), `${msg} (${e?.message || e})`); } };
  const linesOf = (pg) => JSON.parse(pg.toStructuredText('preserve-whitespace').asJSON()).blocks.flatMap((b) => (b.lines || []).map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), bbox: l.bbox }))).filter((l) => l.text);
  const screensText = (pdf) => { const d = open(pdf), out = []; for (let i = 0; i < d.countPages(); i++) out.push(linesOf(d.loadPage(i))); return out; };
  const count = (a) => { const c = new Map(); for (const x of a) c.set(x, (c.get(x) || 0) + 1); return c; };
  /** what the screens lose and gain against the source's lines */
  const diff = (srcBytes, r) => {
    const s = open(srcBytes), want = [];
    for (let i = 0; i < s.countPages(); i++) want.push(...linesOf(s.loadPage(i)).map((l) => l.text));
    const got = screensText(r.pdf).flat().map((l) => l.text).filter((x) => !LABEL.test(x));
    const W = count(want), G = count(got);
    return { missing: [...W].filter(([k, n]) => (G.get(k) || 0) < n).map(([k]) => k), extra: [...G].filter(([k, n]) => (W.get(k) || 0) < n).map(([k]) => k), got, want };
  };
  /** every piece drawn as the page draws that rectangle: the page at k px/pt with the piece's corner on pixel (0, 0), the
   *  screen at k / s px/pt with the piece's place there on pixel (0, 0) — the same pixels, unless something differs */
  const pixelsMatch = (srcBytes, r, k = 3) => {
    const s = open(srcBytes), o = open(r.pdf), worst = [];
    // getPixels() is a view into MuPDF's memory, which the next drawing may move: copied
    const grey = (pg, sc, x, y) => { const p = pg.toPixmap([sc, 0, 0, sc, -x * sc, -y * sc], m.ColorSpace.DeviceGray, false, true); try { return { x: p.getX(), y: p.getY(), w: p.getStride(), h: p.getHeight(), d: p.getPixels().slice() }; } finally { p.destroy?.(); } };
    for (const [si, scr] of r.layout.entries()) for (const pc of scr.pieces) {
      if (pc.picture) continue;
      const a = grey(s.loadPage(pc.page), k, pc.rect.x0, pc.rect.y0), b = grey(o.loadPage(si), k / pc.s, pc.x, pc.y);
      const w = Math.floor((pc.rect.x1 - pc.rect.x0) * k) - 2, h = Math.floor((pc.rect.y1 - pc.rect.y0) * k) - 2;
      let sum = 0, n = 0;
      for (let y = 2; y < h; y++) for (let x = 2; x < w; x++) {
        const xa = x - a.x, ya = y - a.y, xb = x - b.x, yb = y - b.y;
        if (xa < 0 || ya < 0 || xb < 0 || yb < 0 || xa >= a.w || ya >= a.h || xb >= b.w || yb >= b.h) continue;
        sum += Math.abs(a.d[ya * a.w + xa] - b.d[yb * b.w + xb]); n++;
      }
      worst.push(n ? sum / n : 0);
    }
    return Math.max(0, ...worst);
  };
  /** a line's box on a page as MuPDF reads it (the generator's own boxes estimate the width) */
  const boxOf = (bytes, page, text) => { const l = linesOf(open(bytes).loadPage(page)).find((x) => x.text === text); return l && { x0: l.bbox.x, y0: l.bbox.y, x1: l.bbox.x + l.bbox.w, y1: l.bbox.y + l.bbox.h }; };
  /** the piece (screen, piece) whose rectangle holds a box of a page */
  const holder = (r, page, b) => r.layout.flatMap((scr, si) => scr.pieces.map((pc) => ({ ...pc, si }))).filter((pc) => pc.page === page && b.x0 >= pc.rect.x0 - 0.5 && b.x1 <= pc.rect.x1 + 0.5 && b.y0 >= pc.rect.y0 - 0.5 && b.y1 <= pc.rect.y1 + 0.5);

  // ---------------------------------------------------------------- the cuts (wasm/imgproc/kindle.c)
  {
    const W = 60, H = 200, img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
    const ink = (y0, y1, x0 = 10, x1 = 50, v = 0) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; } };
    ink(10, 20); ink(30, 40); ink(60, 62); ink(100, 140); ink(150, 152, 55, 60); ink(160, 170, 10, 50, 200);
    const b = ip.blankRows(img, 0, 0, 52, H, 160, [[45, 55]]);
    const blankAt = (y) => b[y] === 1;
    t.eq(b.length, H, 'blankRows: one answer a row');
    t.ok([0, 9, 20, 29, 40, 44, 55, 59, 62, 99, 140, 199].every(blankAt) && [10, 19, 30, 39, 60, 61, 100, 139].every((y) => !blankAt(y)), 'blankRows: rows with ink are no gap, the others are');
    t.ok([45, 50, 54].every((y) => !blankAt(y)), 'blankRows: a protected interval is no gap (a line\'s letters, a figure)');
    t.ok(blankAt(150) && blankAt(151), 'blankRows: ink beside the region (beyond x1) is not seen');
    t.ok(blankAt(165), 'blankRows: grey lighter than the threshold is paper (a tint, the fringe of a letter)');
    const sub = ip.blankRows(img, 0, 30, 52, 70, 160, []);
    t.ok(sub.length === 40 && sub[0] === 0 && sub[10] === 1, 'blankRows: from y0 to y1 only, indexed from y0');
    // nextCut: a region of rows (1 = gap)
    const rows = (spec) => Uint8Array.from(spec, (c) => (c === '.' ? 1 : 0));
    //                0         1         2         3         4         5
    //                012345678901234567890123456789012345678901234567890
    const r1 = rows('##.##.##......##.##.##.##.##.##..##.##.##.##.##');
    let c = ip.nextCut(r1, 0, 40, 0.65, 4);
    t.eq(c.cut, 38, 'nextCut: past 65 % of the room no wide gap — the lowest gap within the room');
    c = ip.nextCut(r1, 0, 30, 0.2, 4);
    t.eq(c.cut, 11, 'nextCut: a wide gap (a paragraph\'s end) past the share wins over a lower line gap');
    c = ip.nextCut(r1, 0, 4, 0.65, 4);
    t.eq(c.cut, 2, 'nextCut: a short room takes the gap it holds');
    c = ip.nextCut(r1, 0, 100, 0.65, 4);
    t.eq(c.cut, r1.length, 'nextCut: the rest fits — the end of the region');
    const r2 = rows('..##########################......##....');
    c = ip.nextCut(r2, 0, 12, 0.65, 4);
    t.eq([c.cut, c.over], [-1, 31], 'nextCut: no gap within the room after the first ink — none, and where the tall piece ends');
    const r3 = rows('##############');
    c = ip.nextCut(r3, 0, 5, 0.65, 4);
    t.eq([c.cut, c.over], [-1, -1], 'nextCut: no gap at all — the piece runs to the end');
    c = ip.nextCut(r1, 6, 20, 0.65, 4);
    t.ok(c.cut > 6 && c.cut <= 26, `nextCut: from a later row (${c.cut})`);
  }

  // ---------------------------------------------------------------- redaction areas: each piece keeps exactly its characters
  {
    // three lines of 10 pt type at a pitch of 10.5 pt: their em boxes overlap by more than the gap between their ink
    const chars = [];
    for (let l = 0; l < 3; l++) for (let i = 0; i < 20; i++) { const x0 = 50 + i * 6, y0 = 100 + l * 10.5 - 1.5; chars.push({ cx: x0 + 2.5, cy: y0 + 6.25, x0, y0, x1: x0 + 5, y1: y0 + 12.5, line: l }); }
    const page = { x0: 0, y0: 0, x1: 300, y1: 400 }, piece = { x0: 48, x1: 172, y0: 109.5, y1: 120 };
    const areas = KP.redactionAreas(page, piece, chars);
    const touches = (c, q) => c.x1 > q[0] && c.x0 < q[2] && c.y1 > q[1] && c.y0 < q[3];
    const inside = chars.filter((c) => c.line === 1), outside = chars.filter((c) => c.line !== 1);
    t.ok(outside.every((c) => areas.some((q) => touches(c, q))), 'redaction: every character outside the piece is caught');
    t.ok(inside.every((c) => !areas.some((q) => touches(c, q))), 'redaction: no character of the piece is touched — though its box overlaps the lines above and below');
    t.ok(areas.length <= 6, `redaction: four rectangles and a band a line (${areas.length})`);
  }

  // ---------------------------------------------------------------- the paper (tests/fixtures/kindle/paper.pdf)
  const paper = K('paper.pdf'), truth = TRUTH['paper.pdf'];
  const r = await convert(paper);
  const heads = truth.pages.flatMap((p) => p.lines.filter((l) => l.head).map((l) => l.text));
  const d = diff(paper, r);
  t.eq(d.extra, [], 'paper: nothing on the screens that the page does not say (each word once: the text outside a piece is removed)');
  t.eq(d.missing.sort(), [...new Set(heads)].sort(), 'paper: every line on the screens exactly once, but the running heads and page numbers');
  const order = truth.pages.flatMap((p) => p.order), inOrder = d.got.filter((x) => order.includes(x));
  t.eq(inOrder, order, 'paper: the lines in reading order — the title, the abstract, the left column to its end, then the right one, page after page');
  t.eq(r.pages.map((p) => [p.how, p.columns]), [['vector', 2], ['vector', 2]], 'paper: both pages read as vector pieces, two columns each');
  const px = pixelsMatch(paper, r);
  t.ok(px < 1.5, `paper: every piece drawn exactly as the page draws it (mean difference ${px.toFixed(2)} of 255 at worst)`);
  for (const [pi, p] of truth.pages.entries()) {
    for (const f of p.figures) {
      const h = holder(r, pi, f);
      t.ok(h.length === 1, `paper p. ${pi + 1}: the figure stands whole in one piece`);
      const cap = boxOf(paper, pi, p.captions.find((c) => c.figure !== undefined)?.line);
      t.ok(cap && h.length && holder(r, pi, cap).some((x) => x.si === h[0].si && x.rect.y0 === h[0].rect.y0), `paper p. ${pi + 1}: the caption in the same piece as its figure`);
    }
    for (const fm of p.formulas) {
      const num = boxOf(paper, pi, fm.number), h = holder(r, pi, fm);
      t.ok(h.length === 1 && num && holder(r, pi, num).some((x) => x.si === h[0].si && x.rect.y0 === h[0].rect.y0), `paper p. ${pi + 1}: the formula whole — numerator, bar, denominator — with its number`);
    }
    for (const tb of p.tables) {
      const h = holder(r, pi, tb), cap = boxOf(paper, pi, p.captions.find((c) => c.table !== undefined)?.line);
      t.ok(h.length === 1 && cap && holder(r, pi, cap).some((x) => x.si === h[0].si && x.rect.y0 === h[0].rect.y0), `paper p. ${pi + 1}: the table whole with its caption above it`);
    }
    // no line of text crosses a piece's edge
    const cut = p.lines.filter((l) => !l.head && r.layout.some((scr) => scr.pieces.some((pc) => pc.page === pi && l.x1 > pc.rect.x0 && l.x0 < pc.rect.x1 && ((pc.rect.y0 > l.y0 + 0.2 * (l.y1 - l.y0) && pc.rect.y0 < l.y1 - 0.2 * (l.y1 - l.y0)) || (pc.rect.y1 > l.y0 + 0.2 * (l.y1 - l.y0) && pc.rect.y1 < l.y1 - 0.2 * (l.y1 - l.y0))))));
    t.eq(cut.map((l) => l.text), [], `paper p. ${pi + 1}: no piece ends through a line`);
  }
  const aspect = 1680 / 1264;
  t.ok(r.layout.every((s) => Math.abs(s.H / s.W - aspect) < 1e-3), 'paper: every screen has the Kindle\'s shape (1264 × 1680)');
  const outDoc = open(r.pdf);
  t.ok(Array.from({ length: outDoc.countPages() }, (_, i) => outDoc.loadPage(i).getBounds()).every(([x0, y0, x1, y1]) => Math.abs((y1 - y0) / (x1 - x0) - aspect) < 1e-3), '… and so has every page of the PDF');
  const labels = screensText(r.pdf).map((ls) => ls.map((l) => l.text).find((x) => LABEL.test(x)));
  const want = r.pages.flatMap((p) => Array.from({ length: p.screens }, (_, k) => `p. ${p.page} · ${k + 1} of ${p.screens}`));
  t.eq(labels, want, 'paper: "p. 1 · 2 of 4" at the foot of every screen');
  t.ok(r.layout.every((s) => s.pieces.every((pc) => pc.y + (pc.rect.y1 - pc.rect.y0) * pc.s <= s.H * (1 - 0.018 - 0.03) + 0.5)), 'paper: no piece runs into the label\'s strip or the margin');
  t.ok(r.layout.flatMap((s) => s.pieces).filter((pc) => !pc.picture).every((pc) => pc.s <= 1 + 1e-9), 'paper: no piece drawn larger than the page (the column fills the screen\'s width)');
  // the columns fill the screen's width: on every screen the widest piece spans it within its margins (the fixture's
  // lines are ragged: a column is as wide as its longest line)
  t.ok(r.layout.every((s) => Math.max(...s.pieces.map((pc) => (pc.rect.x1 - pc.rect.x0) * pc.s)) >= 0.88 * s.W), 'paper: on every screen the text as wide as the screen within its margins');
  // fonts shared by every piece: the PDF holds each of the page's fonts once (and Helvetica for the labels)
  const fonts = (doc) => { const seen = new Set(); for (let i = 1; i < doc.countObjects(); i++) { try { const o = doc.newIndirect(i).resolve(); if (o.isDictionary() && o.get('Type').isName() && o.get('Type').asName() === 'Font') seen.add(o.get('BaseFont').asName()); } catch { /* a free object */ } } return [...seen].sort(); };
  t.eq(fonts(outDoc).filter((x) => x !== 'Helvetica').length, fonts(open(paper)).filter((x) => x !== 'Helvetica').length, 'paper: each font once in the Kindle PDF, shared by all its pieces');
  t.ok(r.pdf.length < 6 * paper.length + 30000, `paper: the PDF stays small (${r.pdf.length} bytes from ${paper.length})`);
  // the bookmarks at the first screen of their pages
  const ol = outDoc.loadOutline() || [];
  const first = [0, r.pages[0].screens];
  t.eq(ol.map((x) => [x.title, x.page]), truth.bookmarks.map(([title, p]) => [title, first[p]]), 'paper: the PDF\'s bookmarks, each at the first screen of its page');
  // options
  const keep = await convert(paper, { removeHeaders: false });
  t.eq(diff(paper, keep).missing, [], 'paper, running heads kept: every line, the heads and page numbers too');
  const bare = await convert(paper, { labels: false });
  t.ok(!screensText(bare.pdf).flat().some((l) => LABEL.test(l.text)) && bare.screens <= r.screens, `paper without labels: no label, and the pieces get their strip (${bare.screens} screens, ${r.screens} with labels)`);
  const scribe = await convert(paper, { screen: [1860, 2480] });
  t.ok(scribe.layout.every((s) => Math.abs(s.H / s.W - 2480 / 1860) < 1e-3), 'paper on a Scribe: its screen\'s shape');
  const p2 = await convert(paper, { pages: [1] });
  t.ok(p2.pages.length === 1 && p2.pages[0].page === 2 && screensText(p2.pdf).every((ls) => ls.some((l) => /^p\. 2 · /.test(l.text))), 'only page 2: its screens, labelled p. 2');
  await rejects(() => convert(paper, { alive: () => false }), /stopped/i, 'a conversion that is no longer wanted ends with Stopped');
  await rejects(() => convert(paper, { pages: [7] }), /None of the chosen pages/, 'pages that are not in the PDF are refused');

  // ---------------------------------------------------------------- a page turned by /Rotate 90
  {
    const b = K('rotated.pdf'), rr = await convert(b), dd = diff(b, rr);
    t.eq([dd.missing, dd.extra], [[], []], 'rotated page: every line once');
    t.eq(dd.got.filter((x) => /^R1\./.test(x)), TRUTH['rotated.pdf'].pages[0].order, 'rotated page: in order');
    t.ok(screensText(rr.pdf).flat().filter((l) => /^R1\./.test(l.text)).every((l) => l.bbox.w > 3 * l.bbox.h), 'rotated page: its lines upright on the screens (as the page shows them)');
    const pr = pixelsMatch(b, rr);
    t.ok(pr < 1.5, `rotated page: pieces drawn as the page shows them (${pr.toFixed(2)})`);
  }
  // ---------------------------------------------------------------- a figure taller than a screen
  {
    const b = K('tall.pdf'), rr = await convert(b), f = TRUTH['tall.pdf'].pages[0].figures[0], h = holder(rr, 0, f);
    t.ok(h.length === 1 && h[0].s < 1, `tall figure: whole on one screen, drawn smaller (×${h.length ? h[0].s.toFixed(2) : '?'})`);
    t.eq(rr.pages[0].smaller, 1, 'tall figure: counted as drawn smaller');
    t.eq(diff(b, rr).got.filter((x) => /^T1\./.test(x)), TRUTH['tall.pdf'].pages[0].order, 'tall figure: the text before and after it in order');
  }
  // ---------------------------------------------------------------- a table turned on its side
  {
    const b = K('sideways.pdf'), rr = await convert(b), dd = diff(b, rr);
    t.ok(rr.screens === 1 && /sideways/.test(rr.pages[0].note || ''), 'sideways table: kept whole on one screen, said');
    t.eq([dd.missing.length, dd.extra.length, dd.got.length], [0, 0, TRUTH['sideways.pdf'].pages[0].cells], 'sideways table: every cell once');
  }
  // ---------------------------------------------------------------- a scanned page: pictures
  {
    const b = K('scan.pdf'), rr = await convert(b);
    t.eq([rr.pages[0].how, screensText(rr.pdf).flat().filter((l) => !LABEL.test(l.text)).length], ['picture', 0], 'scanned page: pieces as pictures (its OCR text is not used)');
    const o = open(rr.pdf), imgs = [];
    for (let i = 0; i < o.countPages(); i++) { const dev = new m.Device({ fillImage(img) { imgs.push(img.getNumberOfComponents()); } }); o.loadPage(i).toDisplayList().run(dev, m.Matrix.identity); dev.close(); }
    t.ok(imgs.length >= rr.screens && imgs.every((c) => c === 1), `scanned page: greyscale pictures (${imgs.length})`);
    const num = TRUTH['scan.pdf'].pages[0].heads.find((l) => /^\d+$/.test(l.text));
    t.ok(num && !rr.layout.some((s) => s.pieces.some((pc) => num.x0 >= pc.rect.x0 && num.x1 <= pc.rect.x1 && num.y0 >= pc.rect.y0 && num.y1 <= pc.rect.y1)), 'scanned page: the page number left out (found by the scan\'s OCR layer)');
    t.ok(rr.layout.every((s) => s.pieces.every((pc) => pc.s <= 1 + 1e-9)) && rr.pages[0].columns === 2, 'scanned page: its two columns one after the other');
  }
  // ---------------------------------------------------------------- the repository's real PDFs
  for (const [name, allowed] of [
    ['two-column-paper.pdf', /^(Journal of Synthetic Testing · Vol\. 3 · 2026|\d)$/],
    ['federal-register-3p.pdf', /^(Federal Register( \/ Vol\. 85, No\. 152 \/ Thursday, August 6, 2020 \/ Proposed Rules)?|4769[89]|47700|VerDate Sep<11>2014|16:21 Aug 05, 2020|Jkt 250001|PO 00000|Frm 0000[123]|Fmt 4702|Sfmt 4702|E:\\FR\\FM\\06AUP1\.SGM|06AUP1|jbell on DSKJLSW7X2PROD with PROPOSALS)$/],
    ['side-by-side-subfig.pdf', /^1$/],
  ]) {
    const b = PDF(name), rr = await convert(b), dd = diff(b, rr);
    t.eq(dd.extra, [], `${name}: no text twice or out of place`);
    t.eq(dd.missing.filter((x) => !allowed.test(x)), [], `${name}: every line on the screens but the running heads, page numbers and the stamp up the margin`);
    // at 3 px/pt: at 2 MuPDF snaps small glyphs drawn through a form to its sub-pixel grid otherwise (edges differ, not
    // letters); at 4 it samples photos otherwise
    const pr = pixelsMatch(b, rr, 3);
    t.ok(pr < 1.5, `${name}: pieces drawn as the page draws them (${pr.toFixed(2)})`);
  }
  {
    // the Federal Register: three columns a page, each column's pieces as wide as the screen
    const rr = await convert(PDF('federal-register-3p.pdf'));
    t.eq(rr.pages.map((p) => p.columns), [3, 3, 3], 'Federal Register: three columns on every page');
    const fill = rr.layout.slice(0, -1).map((s) => s.pieces.reduce((a, pc) => Math.max(a, pc.y + (pc.rect.y1 - pc.rect.y0) * pc.s), 0) / s.H);
    t.ok(fill.filter((x) => x < 0.6).length <= rr.pages.length * 2, `Federal Register: the screens filled (${fill.filter((x) => x < 0.6).length} of ${fill.length} less than 60 %: a page's last screen)`);
  }
  {
    // side-by-side figures: the full-width text keeps its size; the second figure keeps its caption "(b) Brown bear"
    const b = PDF('side-by-side-subfig.pdf'), rr = await convert(b);
    t.ok(rr.layout.flatMap((s) => s.pieces).every((pc) => pc.s > 0.95), 'side-by-side figures: no piece made smaller (the figures are no text columns)');
    const sp = open(b).loadPage(0), lines = linesOf(sp), bear = lines.find((l) => l.text === '(b) Brown bear');
    const bearBox = { x0: bear.bbox.x, y0: bear.bbox.y, x1: bear.bbox.x + bear.bbox.w, y1: bear.bbox.y + bear.bbox.h };
    const h = holder(rr, 0, bearBox)[0];
    t.ok(h && h.rect.y0 < bearBox.y0 - 100, '"(b) Brown bear" in the same piece as its photo above it');
  }
};
