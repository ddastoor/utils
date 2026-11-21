// textcore t_xycut (reading order, columns and parts) and imgproc p_ink_regions (figure finding) — known answers.
export default async (t, { load, wasm }) => {
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const tc = bindTextcore(await wasm('textcore')), ip = bindImgproc(await wasm('imgproc'));
  const lines = (x0, x1, y, n, step = 14) => Array.from({ length: n }, (_, i) => [x0, y + i * step, x1, y + i * step + 10]);
  // title full width, then two columns of 5 lines, then a full-width footnote
  const boxes = [...lines(320, 550, 100, 5), [50, 40, 550, 60], ...lines(50, 280, 100, 5), [50, 400, 550, 410]];
  const r = tc.xycut(boxes);
  t.eq(r.order, [5, 6, 7, 8, 9, 10, 0, 1, 2, 3, 4, 11], 'title, left column top to bottom, right column, footnote');
  t.eq(r.col, [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 0], 'columns numbered; full-width parts are column 0');
  // three columns
  const three = [...lines(400, 550, 50, 3), ...lines(50, 180, 50, 3), ...lines(225, 355, 50, 3)];
  t.eq(tc.xycut(three).col, [1, 1, 1, 2, 2, 2, 3, 3, 3], 'three columns');
  t.eq(tc.xycut(three).order, [3, 4, 5, 6, 7, 8, 0, 1, 2], 'three columns in order');
  // single column, paragraphs separated by blank space; a short last line does not create a column
  const single = [[50, 50, 550, 60], [50, 64, 300, 74], [50, 90, 550, 100], [50, 104, 550, 114]];
  t.eq(tc.xycut(single), { order: [0, 1, 2, 3], col: [0, 0, 0, 0], part: [0, 0, 0, 0] }, 'single column stays in order (and has no parts)');
  // a table row inside the left column keeps column 1
  const tbl = [[50, 50, 120, 60], [140, 50, 280, 60], [50, 64, 280, 74], ...lines(320, 550, 50, 2)];
  t.eq(tc.xycut(tbl).col.slice(0, 3), [1, 1, 1], 'cells side by side inside a column keep its number');
  t.eq(tc.xycut([]), { order: [], col: [], part: [] }, 'no boxes');
  t.eq(tc.xycut([[0, 0, 10, 10]]), { order: [0], col: [0], part: [0] }, 'one box');
  const many = Array.from({ length: 4000 }, (_, i) => [i % 2 ? 320 : 50, Math.floor(i / 2) * 12, i % 2 ? 550 : 280, Math.floor(i / 2) * 12 + 10]);
  const rm = tc.xycut(many);
  t.ok(rm.order.length === 4000 && rm.col[0] === 1 && rm.col[3999] === 2 && rm.order[1999] === 3998, '4000 lines in two columns');
  // minh: a part counts as a column only with three boxes and that height (the EPUB tab passes a quarter of the page)
  const stamp = [[18, 600, 23, 760]];                                       // a vertical stamp in the left margin
  const cols3 = [...lines(45, 214, 60, 20, 12), ...lines(222, 396, 60, 20, 12), ...lines(404, 575, 60, 20, 12)];
  const rs = tc.xycut([...stamp, ...cols3], 4, 2, 150);
  t.eq(rs.col[0], 0, 'a margin stamp is no column');
  t.eq([...new Set(rs.col.slice(1))], [1, 2, 3], `the three columns beside it are columns 1, 2, 3 (${[...new Set(rs.col)]})`);
  t.eq(rs.order, [0, ...Array.from({ length: 60 }, (_, i) => i + 1)], 'the stamp, then each column top to bottom');
  t.eq(tc.xycut([...stamp, ...cols3], 4, 2).col.slice(0, 2), [1, 2], 'without minh every part of the first split is a column (the old numbering)');
  // the Federal Register's gutters are about 7.5 pt: missed with gx 8 (rows across the columns), found with gx 4
  const fr = [...lines(45, 214.5, 60, 20, 12), ...lines(222, 396.5, 60, 20, 12), ...lines(404, 575, 60, 20, 12)];
  const narrow = tc.xycut(fr, 8, 2, 150);
  t.ok(new Set(narrow.col).size === 1 && narrow.order[1] === 20, `gutters of 7.5 pt are missed with gx 8: rows across the columns (${narrow.order.slice(0, 4)})`);
  const found = tc.xycut(fr, 4, 2, 150);
  t.ok([...new Set(found.col)].join() === '1,2,3' && found.order.every((v, i) => v === i), 'and found with gx 4 (the tab takes the gutter from the body text: 0.45 × its size)');
  const short = [...lines(50, 280, 100, 2), ...lines(320, 550, 100, 2)];
  t.eq(tc.xycut(short, 8, 2, 150), { order: [0, 1, 2, 3], col: [0, 0, 0, 0], part: [0, 0, 0, 0] }, 'two short parts are read left then right but are not labelled columns (nor parts)');
  const table = [[50, 40, 550, 50], [50, 60, 200, 70], [300, 60, 550, 70], [50, 74, 200, 84], [300, 74, 550, 84], [50, 100, 550, 110]];
  t.eq(tc.xycut(table, 8, 2, 150).col, [0, 0, 0, 0, 0, 0], 'the cells of a table in a single-column page are not columns');
  // parts (owner, 21 Nov 2026: what stands side by side is read one after another, "Page N, part K")
  t.eq(r.part, [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 0], 'title and footnote outside the parts; the two columns are parts 1 and 2');
  t.eq(tc.xycut(three).part, [1, 1, 1, 2, 2, 2, 3, 3, 3], 'three columns: three parts');
  t.eq(tc.xycut(tbl).part.slice(0, 3), [1, 1, 1], 'a split inside a part makes no new part');
  t.eq(rs.part, [1, ...Array(20).fill(1), ...Array(20).fill(2), ...Array(20).fill(3)], 'a margin stamp joins the part after it');
  const tail = tc.xycut([...lines(50, 280, 100, 5), ...lines(320, 550, 100, 5), [560, 100, 600, 110]], 8, 2, 50);
  t.eq(tail.part.at(-1), 2, 'a note at the right end joins the part before it');
  // a figure beside text: the figure is heavy, so both sides are parts — not with two short lines beside it, unless heavy
  const fig = [[50, 100, 260, 300], ...lines(300, 550, 100, 12)];
  t.eq(tc.xycut(fig, 8, 2, 150, [true, ...Array(12).fill(false)]).part, [1, ...Array(12).fill(2)], 'a figure beside a column of text: parts 1 and 2');
  t.eq(tc.xycut(fig, 8, 2, 150).part, Array(13).fill(0), 'the same boxes without the figure marked heavy: one side counts, no parts');
  const panels = [[50, 100, 280, 250], [320, 100, 550, 250]];
  t.eq(tc.xycut(panels, 8, 2, 150, [true, true]).part, [1, 2], 'two figures side by side: two parts');
  // a head over the columns: an epigraph at the top of the right-hand column, above where the left-hand one begins
  // (test_2, 21 Nov 2026) is read before the columns with hd, inside the right-hand column without it
  const epi = [[400, 82, 573, 90], [500, 100, 573, 107], ...lines(42, 298, 126, 8), ...lines(317, 573, 127, 8)];
  const re = tc.xycut(epi, 4, 2, 80, undefined, 8);
  t.eq(re.order.slice(0, 3), [0, 1, 2], 'epigraph first, then the left-hand column');
  t.eq(re.order.slice(10), [10, 11, 12, 13, 14, 15, 16, 17], 'then the right-hand column, without the epigraph');
  t.eq([re.part[0], re.part[1], re.part[2], re.part[10]], [0, 0, 1, 2], 'the epigraph is outside the parts; the columns are parts 1 and 2');
  t.eq(tc.xycut(epi, 4, 2, 80).order.slice(0, 2), [2, 3], 'without hd the left-hand column comes first (the epigraph inside the right-hand one)');
  const near = [[317, 120, 573, 125], ...lines(42, 298, 126, 8), ...lines(317, 573, 131, 8)];
  t.eq(tc.xycut(near, 4, 2, 80, undefined, 8).order.slice(0, 2), [1, 2], 'columns that start less than hd apart: no head');
  const note = [[20, 60, 30, 70], ...lines(42, 298, 126, 8)];
  t.eq(tc.xycut(note, 4, 2, 80, undefined, 8).order.length, 9, 'a margin note beside one column is no head');
  // ink regions: a drawn box and a "text" area that is skipped
  const W = 200, H = 200, data = new Uint8ClampedArray(W * H * 4).fill(255);
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; } };
  fill(20, 20, 90, 70); fill(30, 75, 80, 77);   // a figure with a thin line just below it (merged by dilation)
  fill(120, 120, 190, 190);                     // dark area covered by a text box → ignored
  fill(150, 20, 152, 22);                       // a speck → too small
  const regs = ip.inkRegions({ data, width: W, height: H }, [[118, 118, 74, 74]], { dil: 4, minArea: 400 });
  t.eq(regs, [{ x: 20, y: 20, w: 70, h: 57 }], 'one figure (box + line below), text area and specks ignored');
  t.eq(ip.inkRegions({ data: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H }, []), [], 'blank page: no regions');
};
