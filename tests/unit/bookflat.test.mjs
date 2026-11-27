// The Book Page Flattener's engine (wasm/imgproc/flatten.c: p_book_fit, p_book_render, p_book_locate) and its steps
// (src/lib/bookflat.ts), held to ground truth: photos of an open book made by scripts/make-book-photos.py — printed pages
// bent near the spine and photographed by a camera held over them — whose truth.json says, for points of each printed
// page, where the camera saw them (the paper's own curve; nothing fitted). A flat page is right when the points the
// photo shows land where they were printed: a similarity (scale, a turn, a shift) is all that may separate the two.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default async (t, { load, wasm }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const B = await load('/src/lib/bookflat.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const { readExif } = await load('/src/lib/exif.ts');
  const { bindMetacore } = await load('/src/wasm/metacore.ts');
  const mc = bindMetacore(await wasm('metacore'));
  const jpeg = await import(root + 'node_modules/@jsquash/jpeg/decode.js');
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const read = async (f) => { const d = await jpeg.default(readFileSync(root + 'tests/fixtures/books/' + f)); return { data: d.data, width: d.width, height: d.height }; };
  const truth = JSON.parse(readFileSync(root + 'tests/fixtures/books/truth.json', 'utf8'));
  const PW = 1500; // the printed page's width in its own pixels (make-book-photos.py)
  /** least squares: to ≈ [a −b; b a]·from + t → the residual (rms, max) and the turn */
  const sim = (from, to) => {
    const n = from.length; let sx = 0, sy = 0, tx = 0, ty = 0;
    for (let i = 0; i < n; i++) { sx += from[i][0]; sy += from[i][1]; tx += to[i][0]; ty += to[i][1]; }
    sx /= n; sy /= n; tx /= n; ty /= n; let na = 0, nb = 0, den = 0;
    for (let i = 0; i < n; i++) { const X = from[i][0] - sx, Y = from[i][1] - sy, U = to[i][0] - tx, V = to[i][1] - ty; na += X * U + Y * V; nb += X * V - Y * U; den += X * X + Y * Y; }
    const a = na / den, b = nb / den; let ss = 0, mx = 0;
    for (let i = 0; i < n; i++) { const X = from[i][0] - sx, Y = from[i][1] - sy, d = Math.hypot(a * X - b * Y + tx - to[i][0], b * X + a * Y + ty - to[i][1]); ss += d * d; mx = Math.max(mx, d); }
    const map = ([x, y]) => [a * (x - sx) - b * (y - sy) + tx, b * (x - sx) + a * (y - sy) + ty];
    return { rms: Math.sqrt(ss / n), max: mx, turn: (Math.atan2(b, a) * 180) / Math.PI, map };
  };
  /** the distance of a point from the line through two others */
  const offLine = ([x, y], [x0, y0, x1, y1]) => Math.abs((x1 - x0) * (y0 - y) - (x0 - x) * (y1 - y0)) / Math.hypot(x1 - x0, y1 - y0);

  /** where the printed points land on a flat page (in the page's own units: across along the paper, down), against where
   *  they were printed: the residual of the best similarity, and the page's shape — its width for its height, against the
   *  printed page's (0: the same shape) */
  const accuracy = (page, pts, photo) => {
    const where = ip.bookLocate(page, photo.width, photo.height, pts.map((q) => [q[2], q[3]]));
    const ours = where.map(([u, v]) => [u * (page.rect[2] - page.rect[0]), v * (page.rect[3] - page.rect[1])]), printed = pts.map((q) => [q[0], q[1]]);
    const sd = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
    const aspect = (sd(ours.map((q) => q[0])) / sd(printed.map((q) => q[0]))) / (sd(ours.map((q) => q[1])) / sd(printed.map((q) => q[1]))) - 1;
    return { where, flat: sim(ours, printed), raw: sim(pts.map((q) => [q[2], q[3]]), printed), aspect };
  };

  // ---- the lens: the photo says it (FocalLengthIn35mmFilm), the fit takes it as half-widths of the photo's longer side
  t.near(B.focalFrom35(26, 4032, 3024), 1.502, 0.001, "26 mm (a phone's main camera) on a 4 : 3 photo: 1.50 half-widths of the longer side");
  t.near(B.focalFrom35(26, 1920, 1080), 1.379, 0.001, 'on a 16 : 9 picture: 1.38 (the 35 mm frame\'s diagonal against a wider shape)');
  t.near(B.focalFrom35(26, 3024, 4032), B.focalFrom35(26, 4032, 3024), 1e-12, 'the same held upright');
  t.ok(B.focalFrom35(undefined, 4032, 3024) === 0 && B.focalFrom35(0, 4032, 3024) === 0 && B.focalFrom35(26, 0, 0) === 0, 'no focal length: 0 (the engine takes its own, 1.45)');
  const teleExif = await readExif(new Blob([readFileSync(root + 'tests/fixtures/books/tele.jpg')]), mc);
  t.eq(teleExif.focal35, 52, 'the zoomed photo says its lens: 52 mm (a phone\'s 2× camera)');

  // ---- the four photos: pages found, the gutter where the spine is, each page where it was printed
  const LIMIT = { 'spread.jpg': [0.4, 1.0], 'thick.jpg': [0.7, 1.5], 'page.jpg': [0.8, 2.0], 'tele.jpg': [0.4, 0.8] }; // rms, max — % of the page's width
  for (const name of ['spread.jpg', 'thick.jpg', 'page.jpg', 'tele.jpg']) {
    const tr = truth[name], photo = await read(name);
    const focal = name === 'tele.jpg' ? B.focalFrom35(teleExif.focal35, photo.width, photo.height) : 0;
    const fit = ip.bookFit(photo, 0, focal);
    t.eq(fit.pages.length, tr.two ? 2 : 1, `${name}: ${tr.two ? 'two pages' : 'one page'} found (${fit.spans} lines, ${fit.blobs} word blobs, working scale ${fit.work.toFixed(2)})`);
    if (tr.two) {
      t.eq(fit.pages.map((p) => p.side), ['left', 'right'], `${name}: the left page first, then the right one`);
      const d = Math.max(offLine(tr.spine[0], fit.gutter), offLine(tr.spine[1], fit.gutter));
      t.ok(d < 0.03 * photo.width, `${name}: the gutter found runs along the spine (the spine's ends ${d.toFixed(1)} px from it, under 3 % of the photo's width)`);
    } else t.eq(fit.gutter, null, `${name}: no gutter`);
    t.ok(fit.points.length > 100 && fit.points.every((p) => p.length === 4), `${name}: the samples fitted to are given (${fit.points.length})`);
    for (const page of fit.pages) {
      const pts = tr.truth[tr.two ? (page.side === 'left' ? 0 : 1) : 0];
      const { where, flat, raw, aspect } = accuracy(page, pts, photo);
      t.ok(where.every(([u, v]) => u > 0 && u < 1 && v > 0 && v < 1), `${name}, ${page.side}: every point of the printed text lies on the flat page`);
      t.ok(Math.abs(aspect) < 0.02, `${name}, ${page.side}: the flat page has the printed page's shape — measured along the paper (${(100 * aspect).toFixed(2)} % too ${aspect < 0 ? 'narrow' : 'wide'} for its height)`);
      const [rmsMax, maxMax] = LIMIT[name];
      t.ok(100 * flat.rms / PW < rmsMax && 100 * flat.max / PW < maxMax,
        `${name}, ${page.side}: the flat page is the printed page up to scale and shift — ${(100 * flat.rms / PW).toFixed(2)} % of its width off (max ${(100 * flat.max / PW).toFixed(2)} %; the photo itself ${(100 * raw.rms / PW).toFixed(2)} %)`);
      t.ok(raw.rms > 1.8 * flat.rms, `${name}, ${page.side}: the photo itself is no flat page (${(100 * raw.rms / PW).toFixed(2)} % against ${(100 * flat.rms / PW).toFixed(2)} %)`);
      t.ok(Math.abs(flat.turn) < 1, `${name}, ${page.side}: the lines run straight across the flat page (turned ${flat.turn.toFixed(2)}°)`);
      t.ok(page.rms < 1.5 && page.rms < page.rms0, `${name}, ${page.side}: the model fits its samples (${page.rms0.toFixed(2)} → ${page.rms.toFixed(2)} px)`);
      // the flat page's extent, where it lies on the printed page (its own pixels, 1500 × 2250; the running head printed at
      // about y 95, the page number down to about 2140, the text 125 px from the outer edge): the paper, nothing of the table
      // — and the running head and the page number on it
      { const W = page.rect[2] - page.rect[0], H = page.rect[3] - page.rect[1], c = [[0, 0], [W, 0], [W, H], [0, H]].map(flat.map);
        // (one page alone is a right-hand page: its outer side on the right)
        const right = page.side !== 'left', top = Math.min(c[0][1], c[1][1]), bot = Math.max(c[2][1], c[3][1]), outer = right ? Math.max(c[1][0], c[2][0]) : Math.min(c[0][0], c[3][0]);
        const PH = 2250, slack = 0.02 * PH, outOk = right ? outer > PW - 125 + 15 && outer < PW + slack : outer < 125 - 15 && outer > -slack;
        t.ok(top > -slack && top < 85 && bot > 2140 && bot < PH + slack && outOk,
          `${name}, ${page.side}: the page drawn ends at the paper — top ${top.toFixed(0)}, bottom ${bot.toFixed(0)}, outer side ${outer.toFixed(0)} on the printed page (its edges 0 – ${PH}, 0 – ${PW}; the table's strip ${(slack).toFixed(0)} px at most), the running head and the page number on it`);
        // the inner side (the spine's; the text stops 170 px from it): a page of a spread reaches the gutter — every word
        // nearest the spine on it, the spine's shadow too —, not past the other page's text
        if (tr.two) { const inner = right ? Math.min(c[0][0], c[3][0]) : Math.max(c[1][0], c[2][0]);
          t.ok(right ? inner < 170 - 40 && inner > -170 : inner > PW - 170 + 40 && inner < PW + 170,
            `${name}, ${page.side}: the page reaches the gutter on its inner side (${inner.toFixed(0)} on the printed page; the text ends ${right ? 170 : PW - 170}, the spine ${right ? 0 : PW})`); } }
      t.near(page.rec[12], focal || 1.45, 1e-6, `${name}, ${page.side}: the page's record keeps the focal length it was fitted with (${page.rec[12].toFixed(3)})`);
    }
  }

  // ---- the zoomed photo fitted as if the main camera had taken it: skewed — the lens matters
  {
    const photo = await read('tele.jpg'), tr = truth['tele.jpg'];
    const right = ip.bookFit(photo, 0, B.focalFrom35(52, photo.width, photo.height)), wrong = ip.bookFit(photo, 0);
    const err = (fit) => Math.max(...fit.pages.map((p) => accuracy(p, tr.truth[p.side === 'left' ? 0 : 1], photo).flat.rms));
    t.ok(wrong.pages.length === 2 && err(wrong) > 4 * err(right), `tele.jpg with the main camera's lens: ${(100 * err(wrong) / PW).toFixed(2)} % of the page's width off, with its own (52 mm) ${(100 * err(right) / PW).toFixed(2)} %`);
  }

  // ---- the fit works the same on any size of the photo (the model is in units of the photo's half-width)
  {
    const photo = await read('spread.jpg'), half = ip.resize(photo, photo.width / 2, photo.height / 2);
    const a = ip.bookFit(photo, 0), b = ip.bookFit(half, 0);
    t.eq(b.pages.length, 2, 'half the size: still two pages');
    const pts = truth['spread.jpg'].truth[1].map((q) => [q[2], q[3]]);
    const pa = ip.bookLocate(a.pages[1], photo.width, photo.height, pts), pb = ip.bookLocate(b.pages[1], photo.width, photo.height, pts);
    const wa = a.pages[1].rect[2] - a.pages[1].rect[0], wb = b.pages[1].rect[2] - b.pages[1].rect[0];
    const s = sim(pb.map(([u, v]) => [u * wb, v * (b.pages[1].rect[3] - b.pages[1].rect[1])]), pa.map(([u, v]) => [u * wa, v * (a.pages[1].rect[3] - a.pages[1].rect[1])]));
    t.ok(s.rms / wa < 0.006, `the model of a photo half the size puts the right page's text where the full photo's does (${(100 * s.rms / wa).toFixed(2)} % of the page apart)`);
  }

  // ---- p_book_render, p_book_project and p_book_locate agree: a photo whose pixels say where they are, drawn flat — each
  // pixel drawn comes from where the model puts it (within the colour code's 8-bit steps), and locate undoes project
  {
    const photo = await read('spread.jpg'), page = ip.bookFit(photo, 0).pages[0];
    const W = photo.width, H = photo.height, code = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; code[i] = (x * 255) / (W - 1); code[i + 1] = (y * 255) / (H - 1); code[i + 2] = 0; code[i + 3] = 255; }
    const [w, h] = B.pageSize(page, W, H, 900);
    const out = ip.bookRender({ data: code, width: W, height: H }, page, w, h, 0xff0000ff);
    const stepX = (W - 1) / 255, stepY = (H - 1) / 255;
    let worst = 0, n = 0;
    const where = [], at = [];
    for (let k = 0; k < 40; k++) {
      const x = Math.round(((k % 8) + 0.5) * w / 8), y = Math.round((Math.floor(k / 8) + 0.5) * h / 5), i = (y * w + x) * 4;
      if (out.data[i + 2]) continue; // outside the photo
      where.push([(x + 0.5) / w, (y + 0.5) / h]); at.push([(out.data[i] / 255) * (W - 1), (out.data[i + 1] / 255) * (H - 1)]);
    }
    const model = ip.bookProject(page, W, H, where);
    for (let k = 0; k < where.length; k++) { worst = Math.max(worst, Math.max(Math.abs(model[k][0] - at[k][0]) / stepX, Math.abs(model[k][1] - at[k][1]) / stepY)); n++; }
    t.ok(n >= 30 && worst <= 0.6, `the drawn page takes each pixel from where the model puts it (${n} pixels, at most ${worst.toFixed(2)} of the code's 8-bit step off — half a step is its rounding)`);
    t.ok(out.width === w && out.height === h, `drawn at the size asked: ${w}×${h}`);
    const back = ip.bookLocate(page, W, H, model);
    const err = Math.max(...back.map(([u, v], k) => Math.max(Math.abs(u - where[k][0]) * w, Math.abs(v - where[k][1]) * h)));
    t.ok(err < 0.05, `locate undoes project (${err.toFixed(4)} px of the drawn page at most)`);
  }

  // ---- the page drawn: paper white at the corners, the text dark in the middle
  {
    const photo = await read('page.jpg'), page = ip.bookFit(photo, 0).pages[0];
    const out = await B.renderPage(photo, page, 1200, ip);
    const lum = (x, y) => { const i = (y * out.width + x) * 4; return 0.299 * out.data[i] + 0.587 * out.data[i + 1] + 0.114 * out.data[i + 2]; };
    let dark = 0; for (let y = Math.round(out.height * 0.3); y < out.height * 0.7; y += 2) for (let x = Math.round(out.width * 0.3); x < out.width * 0.7; x += 2) if (lum(x, y) < 100) dark++;
    t.ok(Math.max(out.width, out.height) === 1200 || Math.max(out.width, out.height) < 1200, `the page's longer side at most the cap (${out.width}×${out.height})`);
    t.ok(out.height > 1.3 * out.width, `a page of a book is taller than wide (${out.width}×${out.height})`);
    t.ok(dark > 500, `the text is there in the middle of the page (${dark} dark samples)`);
  }

  // ---- the number of pages as asked, and photos the flattener cannot use
  {
    const page = await read('page.jpg'), spread = await read('spread.jpg');
    t.eq(ip.bookFit(page, 2).pages.length, 1, '"two pages" on a photo of one page: no gutter to split at — one page');
    const one = ip.bookFit(spread, 1);
    t.ok(one.pages.length === 1 && one.pages[0].side === 'whole' && one.gutter === null, '"one page" on a spread: the spread as one page');
    const W = 800, H = 600, smooth = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { const v = 90 + ((i % W) * 120) / W; smooth.set([v, v * 0.9, v * 0.8, 255], i * 4); }
    const none = ip.bookFit({ data: smooth, width: W, height: H }, 0);
    t.ok(none.pages.length === 0 && none.points.length === 0, 'a picture without print: no page (and no error)');
    t.eq(B.summary(none), 'no lines of text found', 'said in words');
    t.eq(ip.bookFit({ data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 }, 0).pages.length, 0, 'a tiny picture: no page');
    const dc = await jpeg.default(readFileSync(root + 'tests/fixtures/images/coffee.jpg')), cup = { data: dc.data, width: dc.width, height: dc.height };
    const raw = ip.bookFit(cup, 0), a = await B.analyse(cup, 'auto', ip, 0);
    t.ok(a.fit.pages.length === 0 && a.fit.gutter === null, `a photo of a cup of coffee: no page — the engine's ${raw.spans} pieces (fitted to ${raw.pages.map((p) => p.rms.toFixed(1)).join(' / ') || '—'} px) are no lines of print`);
  }

  // ---- a phone held sideways: the photo turned a quarter, the lines then run up and down it
  {
    const spread = await read('spread.jpg'), side = ip.orient(spread, 8); // turned a quarter to the left
    const asIs = ip.bookFit(side, 0);
    t.eq(B.found(asIs), 0, `sideways as it is: no lines of print (${asIs.spans} pieces of ${(asIs.points.length / Math.max(1, asIs.spans)).toFixed(1)} samples, fitted to ${asIs.pages.map((p) => p.rms.toFixed(1)).join(' / ')} px)`);
    const a = await B.analyse(side, 'auto', ip, 0);
    t.ok(a.turns % 2 === 1 && a.fit.pages.length === 2, `turned a quarter: found the other way round (${a.turns} quarter turns), two pages`);
    const b = await B.analyse(side, 'auto', ip, 1, true);
    t.ok(b.turns === 1 && b.fit.pages.length === 2 && b.fit.pages[0].side === 'left', 'turned back the right way (the letters\' guess, or by hand): the left page first');
    const c = await B.analyse(spread, 'auto', ip, 0);
    t.ok(c.turns === 0 && c.fit.pages.length === 2, 'upright: looked at once, as it is');
  }

  // ---- the small steps
  {
    const p = { rect: [0, 0, 1, 1.5], scale: 0.8 };
    t.eq(B.pageSize(p, 2000, 1500, 5000), [800, 1200], 'pageSize: as many pixels as the photo gives the text (0.8 × 1000 a unit)');
    t.eq(B.pageSize(p, 2000, 1500, 600), [400, 600], 'pageSize: the longer side held to the cap');
    t.eq(B.fitPage(1000, 1500), [561.26, 841.89], 'fitPage: the page\'s shape, A4\'s long side');
    t.eq(B.summary({ pages: [{ spans: 30 }, { spans: 31 }] }), 'two pages · 61 lines', 'summary of a spread');
    t.eq(B.sideName({ side: 'right' }), 'right page', 'sideName');
  }
};
