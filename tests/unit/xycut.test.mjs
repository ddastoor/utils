// textcore t_xycut (reading order + columns) and imgproc p_ink_regions (figure finding) — known answers.
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
  t.eq(tc.xycut(single), { order: [0, 1, 2, 3], col: [0, 0, 0, 0] }, 'single column stays in order');
  // a table row inside the left column keeps column 1
  const tbl = [[50, 50, 120, 60], [140, 50, 280, 60], [50, 64, 280, 74], ...lines(320, 550, 50, 2)];
  t.eq(tc.xycut(tbl).col.slice(0, 3), [1, 1, 1], 'cells side by side inside a column keep its number');
  t.eq(tc.xycut([]), { order: [], col: [] }, 'no boxes');
  t.eq(tc.xycut([[0, 0, 10, 10]]), { order: [0], col: [0] }, 'one box');
  const many = Array.from({ length: 4000 }, (_, i) => [i % 2 ? 320 : 50, Math.floor(i / 2) * 12, i % 2 ? 550 : 280, Math.floor(i / 2) * 12 + 10]);
  const rm = tc.xycut(many);
  t.ok(rm.order.length === 4000 && rm.col[0] === 1 && rm.col[3999] === 2 && rm.order[1999] === 3998, '4000 lines in two columns');
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
