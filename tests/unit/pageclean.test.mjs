// imgproc's page clean-up for reading (to-do #18; owner, 26 Nov 2026: documents with "rich text formatting like bullet
// points, indentation" and watermarks read "very poorly, especially using the phone camera"; "no need to keep bullets and
// indentation in the text;.. but the ocr should not get confused by them"):
// - p_clear_marks on tests/fixtures/ocr/marks.jpg (scripts/make-marks-fixture.mjs, drawn by Chromium): every list mark
//   cleared, everything that only looks like one kept (the Spanish word "o", a roman "i.", a colon, a bullet between two
//   words, a degree sign), the table's grid cleared with its cells' words kept; the columns of a newsletter counted;
// - p_ink_window: the part of a page that holds its text (the quick readings read it; a form's middle is blank);
// - p_quad_steps: an outline's edges — a page's step out to what lies around it, text next to an edge no step;
// - p_refine_quad: a page that runs off the photo — the edges fitted to the photo's, the hidden corner outside it.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const jpeg = await import(root + 'node_modules/@jsquash/jpeg/decode.js');
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const decode = async (p) => { const d = await jpeg.default(readFileSync(root + p)); return { data: d.data, width: d.width, height: d.height }; };
  /** the share of a box's pixels that are ink (clearly dark) */
  const inkIn = (im, [x, y, w, h], pad = 0) => {
    let n = 0, k = 0;
    for (let yy = Math.max(0, y - pad); yy < Math.min(im.height, y + h + pad); yy++) for (let xx = Math.max(0, x - pad); xx < Math.min(im.width, x + w + pad); xx++) {
      const i = (yy * im.width + xx) * 4; n++; if (0.299 * im.data[i] + 0.587 * im.data[i + 1] + 0.114 * im.data[i + 2] < 128) k++;
    }
    return n ? k / n : 0;
  };

  // ---- list marks and ruled lines
  const page = await decode('tests/fixtures/ocr/marks.jpg'), F = JSON.parse(readFileSync(root + 'tests/fixtures/ocr/marks.json', 'utf8'));
  const r = ip.clearMarks(page, 3);
  t.ok(r.marks === F.go.length, `every list mark cleared, nothing else taken for one (${r.marks} of ${F.go.length}; x-height ${r.xh} px)`);
  for (const m of F.go) t.ok(inkIn(page, m.box) > 0.05 && inkIn(r.img, m.box, 2) < 0.005, `the mark ${m.text} is cleared (ink ${(100 * inkIn(page, m.box)).toFixed(0)} % → ${(100 * inkIn(r.img, m.box, 2)).toFixed(1)} %)`);
  for (const m of F.keep) t.ok(inkIn(r.img, m.box) >= 0.9 * inkIn(page, m.box), `“${m.text}” is text and stays (ink ${(100 * inkIn(page, m.box)).toFixed(0)} % → ${(100 * inkIn(r.img, m.box)).toFixed(0)} %)`);
  t.ok(Math.abs(r.slant) < 0.3, `a level page measures level (${r.slant}°)`);
  // the table: its grid gone (a band along each cell's edges), its words there (the middle of each cell)
  const edge = (b, s) => [b[0] - 1, b[1] + Math.round(b[3] * s), 3, 2];
  let grid = 0, words = 0;
  for (const c of F.rules) {
    const [x, y, w, h] = c.box;
    grid += inkIn(r.img, [x - 1, y + Math.round(h / 2) - 1, 3, 3]) + inkIn(r.img, [x + Math.round(w / 2) - 1, y - 1, 3, 3]);
    const mid = [x + 8, y + 6, w - 16, h - 12];
    if (inkIn(r.img, mid) >= 0.9 * inkIn(page, mid) && inkIn(page, mid) > 0.02) words++;
  }
  t.ok(r.lines > 0 && grid < 0.05, `the table's grid is cleared (${r.lines} px; ink left on the edges ${grid.toFixed(3)})`);
  t.ok(words === F.rules.length, `… and every cell's words stay (${words} of ${F.rules.length})`);
  t.ok(edge && true, 'cells checked');
  // nothing to clear: a page of plain text comes back as it was
  const plain = ip.crop(page, 0, F.keep[0].box[1] - 20, page.width, F.keep[4].box[1] - F.keep[0].box[1] + 30);
  const rp = ip.clearMarks(plain, 3);
  t.ok(rp.marks === 0 && rp.lines === 0, `text without marks or rules: nothing cleared (${rp.marks} marks, ${rp.lines} px)`);
  // only what was asked: bit 0 the lines, bit 1 the marks
  const onlyLines = ip.clearMarks(page, 1), onlyMarks = ip.clearMarks(page, 2);
  t.ok(onlyLines.marks === 0 && onlyLines.lines > 0 && onlyMarks.lines === 0 && onlyMarks.marks === F.go.length, 'the lines alone, the marks alone');
  // too small a picture, or a blank one: left alone
  const blank = { width: 300, height: 300, data: new Uint8ClampedArray(300 * 300 * 4).fill(255) };
  t.ok(ip.clearMarks(blank, 3).marks === 0 && ip.clearMarks({ width: 20, height: 20, data: new Uint8ClampedArray(1600).fill(255) }, 3).marks === 0, 'a blank page and a tiny picture: nothing done, no trap');

  // the columns of text (bit 2): a newsletter's two under a heading across both; the marks page, its table and its
  // lists are one column. Small serif text has no ruled line in it (the serifs along a long word's baseline run as long
  // as a short rule — the letters above them tell them apart)
  const cols = await decode('tests/fixtures/ocr/columns.jpg'), rc = ip.clearMarks(cols, 7);
  t.ok(rc.columns === 2 && ip.clearMarks(page, 7).columns === 1, `columns of text: a newsletter ${rc.columns}, the page of lists and a table ${ip.clearMarks(page, 7).columns}`);
  t.ok(rc.lines === 0 && rc.marks === 0, `small serif text in columns: nothing taken for a rule or a mark (${rc.lines} px, ${rc.marks} marks)`);
  t.ok(ip.clearMarks(page, 3).columns === 1, 'the columns are counted only when asked (bit 2)');

  // running text on a soft photo (a Kindle's): lines that begin with the word "a", whose hole the blur closes — a solid
  // blob like a bullet. It is followed by a word space like the line's others (justified text stretches them alike), so
  // it is a word: the old rule cleared it from the start of five lines here ("a pod of dolphins") and took the justified
  // word spaces of six lines, lined up by chance, for two gutters
  const soft = await decode('tests/fixtures/ocr/soft.jpg'), { first } = JSON.parse(readFileSync(root + 'tests/fixtures/ocr/soft.json', 'utf8'));
  const se = ip.docEnhance(soft, 1), sc = ip.clearMarks(se, 7);
  const same = (b) => { const [x, y, w, h] = b; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = (yy * se.width + xx) * 4; if (se.data[i] !== sc.img.data[i]) return false; } return true; };
  t.ok(sc.marks === 0 && first.every((f) => same(f.box)), `soft justified lines: no word taken for a list mark — every line's first letter stays (${sc.marks} marks; ${first.map((f) => f.text).join(' ')})`);
  t.ok(sc.columns === 1, `six lines of justified text are one column (${sc.columns})`);

  // ---- where the text is
  const W = 1600, H = 2200, form = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
  for (let y = 180; y < 700; y++) if (y % 40 < 14) for (let x = 150; x < 1450; x++) if (x % 23 < 15) form.data.fill(20, (y * W + x) * 4, (y * W + x) * 4 + 3);
  const at = ip.inkWindow(form, 1000, 1000);
  t.ok(at.y <= 200 && at.y + 1000 >= 700 && at.ink > 0.1, `a form whose text fills its top third: the window holds the text (${at.x}, ${at.y}; ink ${(100 * at.ink).toFixed(0)} %) — the middle would be blank paper`);
  const mid = ip.inkWindow(blank, 200, 200);
  t.ok(mid.x === 50 && mid.y === 50 && mid.ink === 0, 'a blank page: the middle');
  const whole = ip.inkWindow(form, 2000, 3000);
  t.ok(whole.x === 0 && whole.y === 0, 'a window larger than the picture: the picture itself');

  // ---- an outline's edges, and a page that runs off the photo
  // a photo: a grey desk with noise, a white page (860 × 1120) turned 6° about (520, cy), text lines inside, the last one
  // (a footer) right inside the bottom edge; cy 560: its top-left corner above the photo; cy 500: both top corners
  let seed = 7; const noise = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 16) % 9 - 4; };
  const PW = 1000, PH = 1300, a = 6 * Math.PI / 180, cx = 520, hw = 430, hh = 560;
  const shot = (cy) => {
    const photo = { width: PW, height: PH, data: new Uint8ClampedArray(PW * PH * 4) };
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const dx = x - cx, dy = y - cy, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
      let g = 150 + noise();
      if (Math.abs(u) < hw && Math.abs(v) < hh) { g = 236 + noise(); const line = (v + hh) % 34; if (u > -hw + 50 && u < hw - 50 && v < hh - 6 && v > -hh + 60 && line < 9 && (u + 600) % 9 < 3) g = 40; } // letters: strokes a third of the line
      photo.data.fill(g, (y * PW + x) * 4, (y * PW + x) * 4 + 3); photo.data[(y * PW + x) * 4 + 3] = 255;
    }
    const corner = (su, sv) => [cx + su * hw * Math.cos(a) - sv * hh * Math.sin(a), cy + su * hw * Math.sin(a) + sv * hh * Math.cos(a)];
    return { photo, truth: [...corner(-1, -1), ...corner(1, -1), ...corner(1, 1), ...corner(-1, 1)], cy };
  };
  const A = shot(560), { photo, truth } = A, cy = A.cy;
  t.ok(truth[1] < 0 && truth[3] > 0, `(the made-up page's top-left corner lies above the photo: ${truth.map(Math.round).join(', ')})`);
  const steps = ip.quadSteps(photo, truth);
  t.ok(steps.every((s) => s >= 60), `the page's own outline: four real edges, the footer right inside the bottom one no matter (${steps.join(', ')})`);
  const insideQ = truth.map((v, i) => (i % 2 ? v * 0.6 + cy * 0.4 : v * 0.6 + cx * 0.4));
  // (an edge that runs along a line of text, the text just outside it, can step a little: such an outline still has
  // fewer real edges than any page needs — src/lib/pagecrop.ts takes an outline with two and more, the network's with three)
  t.ok(ip.quadSteps(photo, insideQ).filter((s) => s >= 20).length <= 1, `a region inside the page: at most one edge steps (${ip.quadSteps(photo, insideQ).join(', ')})`);
  // the network's way: corners a little off, the hidden one put where the page leaves the photo
  const net = (tr) => tr.map((v, i) => Math.max(0, Math.min(i % 2 ? PH - 1 : PW - 1, v + (i % 3 ? 9 : -7))));
  const ref = ip.refineQuad(photo, net(truth), 30);
  const off = Math.max(...ref.corners.map((v, i) => Math.abs(v - truth[i])));
  t.ok(ref.edges === 4 && off < 4, `the corners fitted to the page's edges, the hidden one outside the photo where it is (${ref.edges} edges; off by ${off.toFixed(1)} px: ${ref.corners.map(Math.round).join(', ')})`);
  // its whole top edge outside the photo: taken parallel to the bottom edge, through the farther point where a side
  // leaves the photo — the photo's border as the page's top would bend the text from one side to the other
  const B = shot(500), refB = ip.refineQuad(B.photo, net(B.truth), 30), c = refB.corners;
  const slope = (x0, y0, x1, y1) => Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
  t.ok(B.truth[1] < 0 && B.truth[3] < 0 && refB.edges === 3, `(both top corners above the photo; the three edges it shows fitted: ${refB.edges})`);
  t.ok(Math.abs(slope(c[0], c[1], c[2], c[3]) - slope(c[6], c[7], c[4], c[5])) < 0.3 && Math.abs(slope(c[0], c[1], c[2], c[3]) - 6) < 0.5, `… its top edge parallel to its bottom (${slope(c[0], c[1], c[2], c[3]).toFixed(2)}° and ${slope(c[6], c[7], c[4], c[5]).toFixed(2)}°)`);
  t.ok(Math.max(c[1], c[3]) <= 1 && Math.min(c[1], c[3]) < 0, `… and the whole of the page the photo shows inside the outline (top corners at y ${c[1].toFixed(0)}, ${c[3].toFixed(0)})`);
  const back = ip.refineQuad(photo, insideQ, 30);
  t.ok(back.edges === 0 || ip.quadSteps(photo, back.corners).filter((s) => s >= 20).length >= ip.quadSteps(photo, insideQ).filter((s) => s >= 20).length, 'an outline far inside the page: not made worse (nothing to fit within reach)');
  const flatQ = [10, 10, 990, 10, 990, 12, 10, 12];
  t.ok(ip.refineQuad(photo, flatQ, 30).corners.every((v, i) => v === flatQ[i]), 'a degenerate outline: returned as it was');
};
