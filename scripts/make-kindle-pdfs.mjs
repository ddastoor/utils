// Test fixtures for PDF for Kindle (tests/unit/kindlepdf.test.mjs, tests/e2e/kindlepdf.e2e.mjs): PDFs whose every line,
// figure, formula and table stands where this script puts it, written with MuPDF as content streams in PDF's standard
// fonts. Every line of text is unique ("L1.07 …": page, column, line), so a test can find each one on the screens and
// check the order. The ground truth goes to tests/fixtures/kindle/index.json: each PDF's lines in reading order, its
// figures, formulas, tables and captions (boxes in points, top-left origin, as MuPDF reports pages).
//   node scripts/make-kindle-pdfs.mjs
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests/fixtures/kindle');
mkdirSync(out, { recursive: true });
const m = await import('mupdf');

const WORDS = 'columns figures formulas tables screens pieces readers kindles pages lines gaps margins papers authors results methods proofs lemmas'.split(' ');
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const words = (n) => Array.from({ length: n }, () => WORDS[Math.floor(rnd() * WORDS.length)]).join(' ');
const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);
const f = (v) => +v.toFixed(2);

/** A page made of operators; `text(x, yTop, size, s, font)` places a line whose top (the font size above its baseline)
 *  is yTop from the page's top; returns its box (top-left origin). */
function pageBuilder(W, H) {
  let ops = '';
  const lines = [], used = new Set();
  const api = {
    W, H,
    text(x, top, size, s, font = 'TR', extra = {}) {
      const base = top + size * 0.8;
      ops += `BT /${font} ${size} Tf 1 0 0 1 ${f(x)} ${f(H - base)} Tm (${esc(s)}) Tj ET\n`;
      used.add(font);
      const box = { x0: x, y0: top, x1: x + s.length * size * 0.45, y1: top + size, base, size, text: s, ...extra };
      lines.push(box);
      return box;
    },
    raw(s) { ops += s + '\n'; },
    line(x0, y0, x1, y1, w = 0.6) { ops += `q ${w} w 0 G ${f(x0)} ${f(H - y0)} m ${f(x1)} ${f(H - y1)} l S Q\n`; },
    get ops() { return ops; }, lines, used,
  };
  return api;
}
const FONTS = { TR: 'Times-Roman', TB: 'Times-Bold', TI: 'Times-Italic', HV: 'Helvetica', SY: 'Symbol' };
function finish(pdf, specs, name, extra) {
  const fontObjs = {};
  for (const [k, n] of Object.entries(FONTS)) fontObjs[k] = pdf.addSimpleFont(new m.Font(n));
  for (const sp of specs) {
    const res = pdf.addObject({ Font: fontObjs, ...(sp.xobjects ? { XObject: sp.xobjects } : {}) });
    const page = pdf.addPage([0, 0, sp.W, sp.H], sp.rotate || 0, res, sp.ops);
    pdf.insertPage(-1, page);
  }
  extra?.(pdf);
  const bytes = pdf.saveToBuffer('compress').asUint8Array().slice();
  writeFileSync(join(out, name), bytes);
  return bytes.length;
}

const index = {};

// ---------------------------------------------------------------- paper.pdf: two pages of a two-column paper
{
  const pdf = new m.PDFDocument(), specs = [], truth = { pages: [] };
  for (let p = 1; p <= 2; p++) {
    const W = 595, H = 842, pg = pageBuilder(W, H), order = [], figures = [], formulas = [], tables = [], captions = [];
    // running head and page number
    pg.text(54, 28, 8, 'Journal of Kindle Tests - Volume 1 - 2026', 'TI', { head: true });
    pg.text(W / 2 - 3, H - 40, 9, String(p), 'TR', { head: true });
    let y = 60;
    if (p === 1) {
      order.push(pg.text(120, y, 17, 'Reading Papers on a Small Screen', 'TB')); y += 26;
      order.push(pg.text(210, y, 10, 'A. Author and B. Writer', 'TI')); y += 22;
      for (let k = 1; k <= 4; k++) { order.push(pg.text(84, y, 9, `A${k} abstract ${words(12)}`)); y += 11; }
      y += 14;
    }
    const top = y, colX = [54, 312], colW = 229, bottom = 780;
    for (const c of [0, 1]) {
      let yy = top, n = 0;
      const x = colX[c];
      const para = (k, pitch = 12, size = 10) => { for (let i = 0; i < k && yy + size < bottom; i++) { order.push(pg.text(x, yy, size, `L${p}.${c + 1}.${String(++n).padStart(2, '0')} ${words(5)}`)); yy += pitch; } yy += 6; };
      if (p === 1 && c === 0) {
        order.push(pg.text(x, yy, 12, '1 Introduction', 'TB')); yy += 18;
        para(9);
        // a vector figure: axes, a sine curve, tick labels (text inside the figure) and its caption under it
        const fx = x + 20, fy = yy + 4, fw = 180, fh = 110;
        pg.line(fx, fy + fh, fx + fw, fy + fh, 0.8); pg.line(fx, fy, fx, fy + fh, 0.8);
        let path = `q 1.2 w 0 G ${f(fx)} ${f(H - (fy + fh / 2))} m `;
        for (let i = 1; i <= 90; i++) path += `${f(fx + (fw * i) / 90)} ${f(H - (fy + fh / 2 - (fh / 2.4) * Math.sin((i / 90) * 4 * Math.PI)))} l `;
        pg.raw(path + 'S Q');
        const lab = [pg.text(fx - 12, fy + fh - 6, 6, '0', 'HV'), pg.text(fx + fw - 6, fy + fh + 2, 6, 'x', 'HV')];
        figures.push({ x0: fx - 12, y0: fy, x1: fx + fw, y1: fy + fh + 8, labels: lab.map((l) => l.text) });
        yy = fy + fh + 14;
        const cap = pg.text(x + 30, yy, 9, 'Figure 1: A sine wave drawn as lines.'); order.push(cap); captions.push({ figure: 0, line: cap.text });
        yy += 20;
        para(8);
      } else if (p === 1 && c === 1) {
        para(7);
        // a display formula: a fraction (numerator, bar, denominator) in Symbol with its number
        const ex = x + 60, ey = yy + 4;
        const num = pg.text(ex + 10, ey, 11, 'a + b = S', 'SY');
        pg.line(ex, ey + 15, ex + 70, ey + 15, 0.7);
        const den = pg.text(ex + 14, ey + 19, 11, 'p - q', 'SY');
        const eqn = pg.text(x + 200, ey + 9, 10, '(1)');
        formulas.push({ x0: ex, y0: ey, x1: ex + 70, y1: ey + 30, number: eqn.text });
        void num; void den;
        yy = ey + 40;
        para(6);
        // a ruled table of three rows
        const tx = x + 10, ty = yy + 4, tw = 200;
        order.push(pg.text(tx, ty - 2, 9, 'Table 1: Screen sizes.')); captions.push({ table: 0, line: 'Table 1: Screen sizes.' });
        const rows = [['Model', 'Width', 'Height'], ['Paperwhite', '1264', '1680'], ['Scribe', '1860', '2480']];
        let ry = ty + 12;
        pg.line(tx, ry - 2, tx + tw, ry - 2, 0.8);
        for (const r of rows) { r.forEach((cell, i) => pg.text(tx + 4 + i * 66, ry, 9, cell)); ry += 13; pg.line(tx, ry - 2, tx + tw, ry - 2, r === rows[0] ? 0.5 : 0.3); }
        tables.push({ x0: tx, y0: ty + 10, x1: tx + tw, y1: ry, cells: rows.flat() });
        yy = ry + 12;
        // tight leading: 10 on 10.5
        para(12, 10.5);
        para(10);
      } else if (p === 2 && c === 0) {
        order.push(pg.text(x, yy, 12, '2 Methods', 'TB')); yy += 18;
        para(20);
        para(18);
        // a footnote under a short rule
        pg.line(x, 742, x + 70, 742, 0.5);
        order.push(pg.text(x, 746, 8, `F2.1 footnote ${words(5)}`));
      } else {
        order.push(pg.text(x, yy, 12, '3 Results', 'TB')); yy += 18;
        para(24);
        para(20);
      }
    }
    specs.push({ W, H, ops: pg.ops });
    truth.pages.push({ lines: pg.lines.map(({ text, x0, y0, x1, y1, head }) => ({ text, x0, y0, x1, y1, head: !!head })), order: order.map((l) => l.text), figures, formulas, tables, captions });
  }
  const size = finish(pdf, specs, 'paper.pdf', (doc) => {
    const it = doc.outlineIterator();
    it.insert({ title: 'Introduction', uri: doc.formatLinkURI({ type: 'Fit', chapter: 0, page: 0, x: 0, y: 0, width: 0, height: 0, zoom: 0 }), open: true });
    it.insert({ title: 'Methods', uri: doc.formatLinkURI({ type: 'Fit', chapter: 0, page: 1, x: 0, y: 0, width: 0, height: 0, zoom: 0 }), open: true });
  });
  index['paper.pdf'] = { ...truth, bookmarks: [['Introduction', 0], ['Methods', 1]], bytes: size };
}

// ---------------------------------------------------------------- rotated.pdf: a page stored landscape, shown turned by /Rotate 90
{
  const pdf = new m.PDFDocument();
  // the page as stored is 842 × 595; /Rotate 90 shows it as 595 × 842 (portrait): write the text so that it reads upright
  // after the turn — in the stored page it runs up the page
  const W = 842, H = 595;
  let ops = '';
  const order = [];
  for (let i = 0; i < 30; i++) {
    const s = `R1.${String(i + 1).padStart(2, '0')} ${words(6)}`;
    // shown: x = 60, top = 60 + 14 i (portrait 595 × 842); stored: rotate the text 90° counter-clockwise
    // shown (sx, sy) with /Rotate 90 ← stored (x, y) = (sy, sx) in PDF user space (origin bottom-left)
    const sx = 60, sbase = 60 + 14 * i + 8;
    ops += `BT /TR 10 Tf 0 1 -1 0 ${f(sbase)} ${f(sx)} Tm (${esc(s)}) Tj ET\n`;
    order.push(s);
  }
  const fontObjs = { TR: pdf.addSimpleFont(new m.Font('Times-Roman')) };
  pdf.insertPage(-1, pdf.addPage([0, 0, W, H], 90, pdf.addObject({ Font: fontObjs }), ops));
  writeFileSync(join(out, 'rotated.pdf'), pdf.saveToBuffer('compress').asUint8Array().slice());
  index['rotated.pdf'] = { pages: [{ order }] };
}

// ---------------------------------------------------------------- tall.pdf: a figure taller than a screen, between paragraphs
{
  const pdf = new m.PDFDocument(), W = 612, H = 792, pg = pageBuilder(W, H), order = [];
  let y = 50;
  for (let i = 0; i < 6; i++) { order.push(pg.text(72, y, 10, `T1.${String(i + 1).padStart(2, '0')} ${words(10)}`)); y += 12; }
  // a tall drawing: a ladder of 40 rungs in a frame, 72 pt wide and 560 high — no gap a cut could use
  const fx = 260, fy = y + 10, fw = 72, fh = 560;
  pg.raw(`q 1 w 0 G ${fx} ${H - fy - fh} ${fw} ${fh} re S Q`);
  for (let r = 1; r < 40; r++) pg.line(fx, fy + (fh * r) / 40, fx + fw, fy + (fh * r) / 40, 0.8);
  pg.line(fx + fw / 2, fy, fx + fw / 2, fy + fh, 0.8);
  y = fy + fh + 14;
  for (let i = 6; i < 10; i++) { order.push(pg.text(72, y, 10, `T1.${String(i + 1).padStart(2, '0')} ${words(10)}`)); y += 12; }
  finish(pdf, [{ W, H, ops: pg.ops }], 'tall.pdf');
  index['tall.pdf'] = { pages: [{ order: order.map((l) => l.text), figures: [{ x0: fx, y0: fy, x1: fx + fw, y1: fy + fh }] }] };
}

// ---------------------------------------------------------------- sideways.pdf: a table turned on its side (text running up)
{
  const pdf = new m.PDFDocument(), W = 612, H = 792;
  let ops = '';
  for (let r = 0; r < 18; r++) for (let c = 0; c < 4; c++) ops += `BT /TR 9 Tf 0 1 -1 0 ${f(120 + r * 20)} ${f(80 + c * 150)} Tm (S${r + 1}.${c + 1} ${esc(words(2))}) Tj ET\n`;
  const fontObjs = { TR: pdf.addSimpleFont(new m.Font('Times-Roman')) };
  pdf.insertPage(-1, pdf.addPage([0, 0, W, H], 0, pdf.addObject({ Font: fontObjs }), ops));
  writeFileSync(join(out, 'sideways.pdf'), pdf.saveToBuffer('compress').asUint8Array().slice());
  index['sideways.pdf'] = { pages: [{ cells: 72 }] };
}

// ---------------------------------------------------------------- scan.pdf: a scanned page — a picture of a two-column page,
// with an invisible OCR layer, a running head and a page number
{
  const src = new m.PDFDocument(readFileSync(join(out, 'paper.pdf')));
  const pix = src.loadPage(0).toPixmap(m.Matrix.scale(200 / 72, 200 / 72), m.ColorSpace.DeviceGray, false, true);
  // a scanner's paper: a little grey, a little noise
  const px = pix.getPixels();
  let s2 = 3;
  for (let i = 0; i < px.length; i++) { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; px[i] = Math.max(0, Math.min(255, Math.round(px[i] * 0.9 + 12 + ((s2 >> 8) % 9) - 4))); }
  const jpg = pix.asJPEG(85, false);
  const pdf = new m.PDFDocument();
  const img = pdf.addImage(new m.Image(jpg));
  // the OCR layer: the text of the paper's first page, invisible (render mode 3) where it stands
  const W = 595, H = 842;
  let ops = `q ${W} 0 0 ${H} 0 0 cm /Im1 Do Q\n`;
  for (const l of index['paper.pdf'].pages[0].lines) ops += `BT 3 Tr /TR ${f(Math.max(6, l.y1 - l.y0))} Tf 1 0 0 1 ${f(l.x0)} ${f(H - (l.y0 + 0.8 * (l.y1 - l.y0)))} Tm (${esc(l.text)}) Tj ET\n`;
  const res = pdf.addObject({ Font: { TR: pdf.addSimpleFont(new m.Font('Times-Roman')) }, XObject: { Im1: img } });
  pdf.insertPage(-1, pdf.addPage([0, 0, W, H], 0, res, ops));
  writeFileSync(join(out, 'scan.pdf'), pdf.saveToBuffer('compress').asUint8Array().slice());
  index['scan.pdf'] = { pages: [{ heads: index['paper.pdf'].pages[0].lines.filter((l) => l.head) }] };
}

writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1));
console.log(`tests/fixtures/kindle: ${Object.keys(index).join(', ')}`);
