// The Screenshot Annotator's geometry and hidden areas (src/lib/annotate.ts; the mosaic p_mosaic_rect in
// wasm/imgproc/imgproc.c): where a press takes a mark, how marks move and change size, crops, the step numbers, the
// guide's pages, undo / redo — and the hidden areas burnt into the pixels: inside each area nothing of the picture is
// left as it was, outside it every pixel is.
export default async (t, { load, wasm }) => {
  const A = await load('src/lib/annotate.ts');
  const { bindImgproc } = await load('src/wasm/imgproc.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  // a measuring function of our own: every character 0.55 of the size wide
  const measure = (s, px) => s.length * px * 0.55;
  const u = 2; // a picture of 2000 px on its longer side

  // ---- sizes and colours
  t.near(A.unit(1920, 1080), 1.92, 1e-9, 'unit: a thousandth of the longer side');
  t.eq(A.unit(300, 200), 1, 'unit: at least a pixel');
  t.eq(A.onColor('#ffffff'), '#111111', 'dark text on white');
  t.eq(A.onColor('#fdd835'), '#111111', 'dark text on yellow');
  t.eq(A.onColor('#e53935'), '#ffffff', 'white text on red');
  t.eq(A.onColor('#1e88e5'), '#ffffff', 'white text on blue');
  t.near(A.luminance('#fff'), 1, 1e-9, 'luminance of white');

  // ---- step numbers: their place among the picture's markers
  const st = (id, x = 0, y = 0) => ({ id, kind: 'step', x, y, color: '#e53935', size: 'm' });
  const nums = A.stepNumbers([st(7), { id: 8, kind: 'arrow', x1: 0, y1: 0, x2: 9, y2: 9, color: 'red', size: 'm' }, st(3), st(5)]);
  t.eq([nums.get(7), nums.get(3), nums.get(5), nums.has(8)], [1, 2, 3, false], 'steps numbered in their order, other marks not');
  t.eq([...A.stepNumbers([st(1), st(2)], 4).values()], [4, 5], 'numbered on from the picture before');

  // ---- arrows
  const ar = { id: 1, kind: 'arrow', x1: 100, y1: 100, x2: 500, y2: 100, color: '#e53935', size: 'm' };
  const hd = A.arrowHead(ar, u);
  t.eq([hd.tri[0], hd.tri[1]], [500, 100], 'the head’s tip is the arrow’s end');
  t.near(hd.tri[3] - 100, -(hd.tri[5] - 100), 1e-9, 'the head is symmetric');
  t.ok(hd.sx > 500 - hd.L && hd.sx < 500, 'the shaft ends inside the head');
  const short = A.arrowHead({ ...ar, x2: 110 }, u);
  t.ok(short.L <= 0.6 * 10 + 1e-9, `a short arrow has a smaller head (${short.L.toFixed(2)})`);
  t.ok(A.hits(ar, 300, 104, 2, u, measure), 'a press on the shaft takes the arrow');
  t.ok(A.hits(ar, 495, 100, 2, u, measure), 'a press on the head takes it');
  t.ok(!A.hits(ar, 300, 140, 2, u, measure), 'a press beside it does not');

  // ---- boxes, circles: the line first, the inside only at the second look
  const box = { id: 2, kind: 'rect', x: 100, y: 100, w: 400, h: 300, color: '#e53935', size: 'm' };
  t.ok(A.hits(box, 100, 250, 2, u, measure), 'a press on the left side takes the box');
  t.ok(!A.hits(box, 300, 250, 2, u, measure), '… inside it does not, at first');
  t.ok(A.hits(box, 300, 250, 2, u, measure, true), '… and does at the second look');
  const inside = { ...ar, id: 3, x1: 200, y1: 250, x2: 400, y2: 250 };
  t.eq(A.hitTest([inside, box], 300, 252, 2, u, measure)?.id, 3, 'an arrow inside a box is taken before the box (drawn later or not)');
  t.eq(A.hitTest([inside, box], 300, 330, 2, u, measure)?.id, 2, 'the box’s inside, where nothing else is');
  t.eq(A.hitTest([box, { ...box, id: 9 }], 100, 250, 2, u, measure)?.id, 9, 'the newest mark first');
  const el = { id: 4, kind: 'ellipse', x: 0, y: 0, w: 200, h: 100, color: 'red', size: 'm' };
  t.ok(A.hits(el, 200, 50, 2, u, measure) && A.hits(el, 100, 0, 2, u, measure), 'a press on the circle’s line takes it');
  t.ok(!A.hits(el, 100, 50, 2, u, measure) && A.hits(el, 100, 50, 2, u, measure, true), 'its inside at the second look');
  t.ok(A.hits(st(5, 50, 50), 50 + A.STEP.m * u, 50, 0.5, u, measure), 'a step marker by its circle');
  const tx = { id: 6, kind: 'text', x: 10, y: 10, text: 'Tap Renew\nthen Pay', label: true, color: '#e53935', size: 'm' };
  const tb = A.textBox(tx, u, measure);
  t.eq(tb.lines.length, 2, 'a text of two lines');
  t.near(tb.w, measure('Tap Renew', A.TEXT.m * u) + 2 * tb.pad, 1e-9, 'its box as wide as its longest line');
  t.ok(A.hits(tx, 12 + tb.w / 2, 12, 0, u, measure) && !A.hits(tx, 12 + tb.w + 30, 12, 0, u, measure), 'a text by its box');
  const pen = { id: 7, kind: 'pen', pts: [0, 0, 100, 0, 100, 100], color: 'red', size: 'm' };
  t.ok(A.hits(pen, 100, 50, 1, u, measure) && !A.hits(pen, 50, 50, 1, u, measure), 'a pen stroke by its path');
  const hide = { id: 8, kind: 'hide', style: 'pixelate', x: 0, y: 0, w: 100, h: 50, seed: 1, ox: 0, oy: 0 };
  t.ok(!A.hits(hide, 50, 25, 1, u, measure) && A.hits(hide, 50, 25, 1, u, measure, true), 'a hidden area by its inside, at the second look');
  t.eq(A.hitTest([hide, inside], 300, 252, 2, u, measure)?.id, 3, 'a mark over a hidden area first');

  // ---- handles, moving, sizes
  t.eq(A.handles(ar).map((x) => x.name), ['p1', 'p2'], 'an arrow’s handles are its ends');
  t.eq(A.handles(box).length, 8, 'a box has eight handles');
  t.eq(A.handleAt(box, 502, 398, 6), 'se', 'the corner nearest the press');
  t.eq(A.handleAt(tx, 10, 10, 6), null, 'a text has no handles');
  const far = A.moved(box, 5000, 0, 2000, 1000, u, measure);
  t.ok(far.x < 2000 && far.x + far.w > 2000 - 48 - 1e-9, `moved far off, a part stays on the picture (x ${far.x})`);
  t.eq(A.moved(ar, 10, 20, 2000, 1000, u, measure), { ...ar, x1: 110, y1: 120, x2: 510, y2: 120 }, 'an arrow moved by its two ends');
  t.eq(A.moved(pen, 5, 5, 2000, 1000, u, measure).pts, [5, 5, 105, 5, 105, 105], 'a stroke moved point by point');
  const flipped = A.resized(box, 'nw', 700, 600, 2000, 1000);
  t.eq([flipped.x, flipped.y, flipped.w, flipped.h], [500, 400, 200, 200], 'a corner dragged past the other one: the box turned over, its size positive');
  const tiny = A.resized(box, 'e', 101, 250, 2000, 1000, 8);
  t.eq(tiny.w, 8, 'a box stays at least its least size');
  t.eq(A.resized(ar, 'p2', 3000, -50, 2000, 1000), { ...ar, x2: 2000, y2: 0 }, 'an arrow’s end held to the picture');
  t.eq(A.normBox({ x: 10, y: 10, w: -5, h: -6 }), { x: 5, y: 4, w: 5, h: 6 }, 'a box drawn up and to the left');

  // ---- crops, strokes
  t.eq(A.cropOf({ x: -20, y: 10.4, w: 500, h: 300 }, 400, 200), { x: 0, y: 10, w: 400, h: 190 }, 'a crop held to the picture, in whole pixels');
  t.eq(A.cropOf({ x: 100, y: 100, w: 2, h: 2 }, 400, 200).w, 16, 'a crop at least 16 pixels a side');
  t.eq(A.thin([0, 0, 0.5, 0, 1, 0, 5, 0, 5.2, 0, 10, 0], 3), [0, 0, 5, 0, 10, 0], 'a stroke thinned: its ends kept, points closer than the step left out');

  // ---- hidden areas: the pixels they hide, burnt in
  t.eq(A.hidePixels({ x: 10.6, y: 3.2, w: 20, h: 9.1 }, 100, 100), { x: 10, y: 3, w: 21, h: 10 }, 'an area hides every pixel it touches');
  t.eq(A.hidePixels({ x: 90, y: -5, w: 30, h: 10 }, 100, 100), { x: 90, y: 0, w: 10, h: 5 }, 'an area held to the picture');
  const k = A.hideStrength({ w: 400, h: 40 }, 2);
  t.ok(k.block >= 20 && k.block <= 56 && k.block === 22, `a line's mosaic blocks larger than half its height (${k.block})`);
  t.eq(A.hideStrength({ w: 2000, h: 1000 }, 2).block, 56, 'a large area’s blocks at most 28 units');
  // a picture of "text": dark strokes on white, a different value in every pixel column
  const W = 240, H = 120, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, ink = ((x * 7 + y * 3) % 11 < 4) && y > 20 && y < 100;
    data[i] = ink ? 20 : 250; data[i + 1] = ink ? 30 + (x % 9) : 245; data[i + 2] = ink ? 40 : 240; data[i + 3] = 255;
  }
  const img = { data, width: W, height: H }, orig = new Uint8ClampedArray(data);
  const area = { id: 1, kind: 'hide', x: 30.5, y: 25, w: 120, h: 60, seed: 0xdeadbeef, ox: 5, oy: 3 };
  const outsideSame = (out, r) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue; const i = (y * W + x) * 4; for (let c = 0; c < 4; c++) if (out.data[i + c] !== orig[i + c]) return `${x},${y}`; } return null; };
  const R = A.hidePixels(area, W, H);
  // solid
  const solid = A.hideAll(img, [{ ...area, style: 'solid' }], ip);
  let allDark = true;
  for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) { const i = (y * W + x) * 4; if (solid.data[i] !== 17 || solid.data[i + 1] !== 17 || solid.data[i + 2] !== 17) allDark = false; }
  t.ok(allDark, 'Solid: every pixel of the area covered');
  t.eq(outsideSame(solid, R), null, 'Solid: every pixel outside it as it was');
  t.eq([...img.data].every((v, i) => v === orig[i]), true, 'the picture given is left as it was (a copy is changed)');
  // the mosaic: blocks of one colour on a grid that starts at the random place, each block's colour its mean moved by at most the noise
  const K = A.hideStrength(R, A.unit(W, H));
  const mos = A.hideAll(img, [{ ...area, style: 'pixelate' }], ip);
  t.eq(outsideSame(mos, R), null, 'Pixelate: every pixel outside the area as it was');
  const ox = area.ox % K.block, oy = area.oy % K.block;
  // the grid: a cut every block from the place chosen; a sliver at either end (under half a block) joined to its neighbour
  const cuts = (a0, a1, off) => { const c = []; for (let v = a0 - off + K.block; v < a1; v += K.block) c.push(v); if (c.length && c[0] - a0 < K.block >> 1) c.shift(); if (c.length && a1 - c[c.length - 1] < K.block >> 1) c.pop(); return [a0, ...c, a1]; };
  const xs = cuts(R.x, R.x + R.w, ox), ys = cuts(R.y, R.y + R.h, oy);
  t.ok([...xs.slice(1).map((v, i) => v - xs[i]), ...ys.slice(1).map((v, i) => v - ys[i])].every((d) => d >= K.block / 2), `Pixelate: every block at least half a block a side (${xs.length - 1} × ${ys.length - 1} blocks)`);
  let uniform = true, within = true, moved = 0, blocks = 0;
  for (let j = 0; j + 1 < ys.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
    const bx = xs[i], by = ys[j], ex = xs[i + 1], ey = ys[j + 1];
    blocks++;
    const sum = [0, 0, 0]; let n = 0;
    for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) sum[c] += orig[i + c]; n++; }
    const i0 = (by * W + bx) * 4, v = [mos.data[i0], mos.data[i0 + 1], mos.data[i0 + 2]];
    for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * W + x) * 4; if (mos.data[i] !== v[0] || mos.data[i + 1] !== v[1] || mos.data[i + 2] !== v[2]) uniform = false; }
    const d = v.map((x, c) => x - Math.round(sum[c] / n));
    if (d.some((x) => Math.abs(x) > K.noise)) within = false;
    if (d.some((x) => x !== 0)) moved++;
  }
  t.ok(uniform, `Pixelate: ${blocks} blocks, each of one colour, on the grid that starts at the place chosen`);
  t.ok(within, `Pixelate: each block's colour within ${K.noise} levels of its mean`);
  t.ok(moved >= blocks * 0.8, `Pixelate: the colours moved from their means (${moved} of ${blocks} blocks)`);
  const again = A.hideAll(img, [{ ...area, style: 'pixelate' }], ip), other = A.hideAll(img, [{ ...area, style: 'pixelate', seed: 12345 }], ip);
  t.ok(again.data.every((v, i) => v === mos.data[i]), 'Pixelate: the same area drawn again is the same mosaic (its numbers kept with it)');
  t.ok(other.data.some((v, i) => v !== mos.data[i]), 'Pixelate: another seed, another mosaic');
  // the plain mosaic for comparison: its means exact (what Depix matches against)
  const plain = ip.pixelateRect({ data: new Uint8ClampedArray(orig), width: W, height: H }, R.x, R.y, R.w, R.h, K.block);
  t.ok(plain.data.some((v, i) => v !== mos.data[i]), 'Pixelate differs from a plain mosaic on a fixed grid');
  // blur
  const bl = A.hideAll(img, [{ ...area, style: 'blur' }], ip);
  t.eq(outsideSame(bl, R), null, 'Blur: every pixel outside the area as it was');
  const varIn = (d) => { let s = 0, s2 = 0, n = 0; for (let y = R.y + 4; y < R.y + R.h - 4; y++) for (let x = R.x + 4; x < R.x + R.w - 4; x++) { const v = d[(y * W + x) * 4 + 1]; s += v; s2 += v * v; n++; } return s2 / n - (s / n) ** 2; };
  t.ok(varIn(bl.data) < varIn(orig) * 0.05, `Blur: the strokes inside are gone (variance ${varIn(orig).toFixed(0)} → ${varIn(bl.data).toFixed(1)})`);
  // several areas, in order; one off the picture does nothing
  const two = A.hideAll(img, [{ ...area, style: 'blur' }, { ...area, id: 2, style: 'solid', x: 0, y: 0, w: 10, h: 10 }, { ...area, id: 3, style: 'solid', x: 500, y: 500, w: 10, h: 10 }], ip);
  t.eq([two.data[0], two.data[(5 * W + 5) * 4]], [17, 17], 'several areas: each applied');
  t.eq(A.hideAll(img, [], ip), img, 'no hidden areas: the picture itself');

  // ---- the guide: lines, pages
  const lines = A.wrap('Open the app and tap Renew, then Pay supercalifragilisticexpialidocious', 100, 10, measure);
  t.ok(lines.every((l) => measure(l, 10) <= 100), `every line fits (${lines.join(' | ')})`);
  t.eq(lines.join(' ').replace(/\s+/g, ''), 'Open the app and tap Renew, then Pay supercalifragilisticexpialidocious'.replace(/\s+/g, ''), 'nothing of the text lost');
  t.eq(A.wrap('a\n\nb', 100, 10, measure), ['a', '', 'b'], 'lines of its own kept, an empty one too');
  t.eq(A.fitIn(1920, 1080, 515, 600), { w: 515, h: 515 * 1080 / 1920 }, 'a PC screenshot as wide as the page');
  const ph = A.fitIn(1080, 2400, 515, 600);
  t.near(ph.h, 600, 1e-9, 'a phone screenshot as tall as the room left');
  t.eq(A.fitIn(300, 200, 515, 600), { w: 225, h: 150 }, 'a small picture at most 0.75 points a pixel');
  t.eq(A.packPages([300, 300, 300, 900, 100], 700, 20), [[0, 1], [2], [3], [4]], 'steps packed onto pages in order; a tall one on a page of its own');
  t.eq(A.stepHeading(2, true), 'Step 3', 'the step’s heading');

  // ---- undo and redo
  const hs = new A.History(3);
  t.eq(hs.undo('x'), null, 'nothing to undo at first');
  hs.push('a'); hs.push('b');
  t.eq(hs.undo('c'), 'b', 'undo: the state before the last change');
  t.eq(hs.undo('b'), 'a', 'undo again');
  t.eq(hs.redo('a'), 'b', 'redo');
  t.eq(hs.redo('b'), 'c', 'redo again');
  t.eq(hs.redo('c'), null, 'nothing more to redo');
  hs.push('c'); hs.push('c');
  t.eq([hs.canUndo, hs.canRedo], [true, false], 'a change after an undo: nothing to redo; the same state twice kept once');
  const lim = new A.History(3); ['1', '2', '3', '4'].forEach((s) => lim.push(s));
  t.eq([lim.undo('5'), lim.undo('4'), lim.undo('3'), lim.undo('2')], ['4', '3', '2', null], 'at most the number of states asked for');
};
