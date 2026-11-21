// src/lib/pagecrop.ts — the page of a photo found and straightened before it is read (the Photo Dictionary; owner,
// 21 Nov 2026: a phone's photo of a Kindle page "extremely well"): synthetic photos with known corners, on imgproc.wasm.
export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const pc = await load('/src/lib/pagecrop.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  // a photo: a dark table (or a Kindle's black body) with a light quadrilateral on it, text-like stripes inside
  const photo = (W, H, quad, { light = 228, dark = 40, stripes = true } = {}) => {
    const d = new Uint8ClampedArray(W * H * 4);
    const inside = (x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const [x1, y1] = quad[i], [x2, y2] = quad[(i + 1) % 4]; if ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) < 0) s++; } return s === 0 || s === 4; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = dark + ((x * 7 + y * 13) % 9);
      if (inside(x + 0.5, y + 0.5)) v = stripes && y % 24 < 6 && x % 40 < 30 ? 50 : light;
      v += noise();
      d.set([v, v, v, 255], (y * W + x) * 4);
    }
    return { data: d, width: W, height: H };
  };
  const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  let seed = 1; const noise = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 16) % 7 - 3; }; // a camera's sensor noise

  // pageSize: the longer opposite sides
  t.eq(pc.pageSize([0, 0, 300, 0, 300, 200, 0, 200]), [300, 200], 'pageSize of an upright rectangle');
  t.eq(pc.pageSize([10, 0, 310, 20, 300, 420, 0, 400]), [Math.round(Math.hypot(300, 20)), Math.round(Math.hypot(10, 400))], 'pageSize: the longer of the opposite sides');
  t.eq(pc.pageSize([0, 0, 300, 0, 280, 400, 20, 410]), [300, Math.round(Math.hypot(20, 410))], 'pageSize: a narrower bottom, a longer left side');
  // usable: convex, inside, a page's share of the photo
  t.ok(pc.usable([100, 100, 900, 120, 880, 700, 90, 690], 1000, 800), 'a large convex page is usable');
  t.ok(!pc.usable([400, 300, 480, 300, 480, 360, 400, 360], 1000, 800), 'a small bright patch (a lamp, a mug) is not the page');
  t.ok(!pc.usable([2, 2, 998, 2, 998, 798, 2, 798], 1000, 800), 'an outline that is the whole photo is left alone (a scan, a screenshot)');
  t.ok(!pc.usable([100, 100, 880, 700, 900, 120, 90, 690], 1000, 800), 'corners that cross are no page');
  t.ok(!pc.usable([100, 100, 900, 120, NaN, 700, 90, 690], 1000, 800), 'NaN corners are no page');

  // a tilted page on a dark table: found, its corners where they are, straightened to an upright page
  const quad = [[260, 140], [1180, 210], [1120, 1460], [200, 1380]];
  const img = photo(1400, 1600, quad);
  const s = await pc.straighten(img, ip);
  t.ok(s.found, 'a tilted page on a dark table is found');
  t.ok(s.corners && near(s.corners, quad.flat(), 14), `… at its corners (${s.corners?.map(Math.round).join(', ')})`);
  t.ok(Math.abs(s.img.width - 922) < 30 && Math.abs(s.img.height - 1251) < 30, `… straightened to the page's size (${s.img.width} × ${s.img.height})`);
  const at = (im, x, y) => im.data[(y * im.width + x) * 4];
  t.ok(at(s.img, Math.round(s.img.width / 2), Math.round(s.img.height / 2) | 0) > 0 && at(s.img, 5, 5) > 150 && at(s.img, s.img.width - 6, s.img.height - 6) > 150, 'the straightened picture is the page: light at its corners (no table left)');
  // found on the small copy, warped at full size: a 3000 px photo keeps its pixels
  const big = photo(2400, 3000, quad.map(([x, y]) => [x * 1.7, y * 1.8]));
  const sb = await pc.straighten(big, ip);
  t.ok(sb.found && sb.img.width > 1500 && sb.img.height > 2100, `a large photo: the page straightened at full size (${sb.img.width} × ${sb.img.height})`);
  // nothing found → the photo as it was
  const flat = photo(800, 600, [[0, 0], [800, 0], [800, 600], [0, 600]]);
  const sf = await pc.straighten(flat, ip);
  t.ok(!sf.found && sf.img === flat, 'a photo that is all page (a scan): returned as it is');
  const lamp = photo(1000, 800, [[450, 350], [520, 350], [520, 410], [450, 410]], { stripes: false });
  const sl = await pc.straighten(lamp, ip);
  t.ok(!sl.found && sl.img === lamp, 'a small bright patch on a dark photo: returned as it is');
  // a Kindle on a light desk (the desk brighter than the screen, all round the black body): the screen is the page,
  // not the desk (the largest bright region, which p_detect_quad took); also with a lamp's glare lighting the body
  const kindle = (glare) => {
    const W = 1600, H = 1200, d = new Uint8ClampedArray(W * H * 4);
    const scr = [[560, 180], [1060, 210], [1040, 1010], [540, 980]], body = [[500, 110], [1130, 150], [1105, 1110], [470, 1070]];
    const inq = (q, x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; if ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) < 0) s++; } return s === 0 || s === 4; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 236 + ((x * 3 + y * 5) % 7);                                                 // a light desk
      if (inq(body, x, y)) v = 26;                                                         // the black body
      if (inq(scr, x, y)) v = y % 30 < 7 && x % 37 < 28 ? 45 : 205;                       // the screen and its text
      if (glare) { const r = Math.hypot(x - 1090, y - 620); if (r < 160) v = Math.min(255, v + (255 - v) * 0.8 * (1 - r / 160)); }
      v += noise();
      d.set([v, v, v, 255], (y * W + x) * 4);
    }
    return { img: { data: d, width: W, height: H }, scr };
  };
  for (const glare of [false, true]) {
    const k = kindle(glare), r = await pc.straighten(k.img, ip);
    t.ok(r.found && r.corners && near(r.corners, k.scr.flat(), 16), `a Kindle on a light desk${glare ? ', a lamp lighting its body' : ''}: the screen is the page (${r.corners?.map(Math.round).join(', ')})`);
    const old = ip.detectQuad(k.img);
    if (!glare) t.ok(!near(old.corners, k.scr.flat(), 16), 'the Doc Scanner\'s outline (the largest bright region) takes the desk here — why the reading tabs have their own');
  }
  // a screenshot (a white panel in a dark app, no noise): no camera's photo — left as it is (a white panel is no page)
  const shot = (() => { const W = 1200, H = 900, d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const panel = x > 200 && x < 1000 && y > 150 && y < 750; const v = panel ? (y % 30 < 8 && x % 50 < 40 && y > 200 ? 30 : 250) : 32; d.set([v, v, v, 255], (y * W + x) * 4); }
    return { data: d, width: W, height: H }; })();
  t.ok(ip.flatShare(shot) > 0.5 && ip.flatShare(img) < 0.05, `flat share: a screenshot ${ip.flatShare(shot).toFixed(2)}, a camera's photo ${ip.flatShare(img).toFixed(3)}`);
  const ss = await pc.straighten(shot, ip);
  t.ok(!ss.found && ss.img === shot, 'a screenshot is left as it is (its white panel would have been taken for the page)');
  t.ok(ip.pageQuad(shot).confidence > 0, '… the page finder alone would have found the panel');
  // the operations may answer with promises (the worker's) as well as at once (the module's)
  const asyncOps = { resize: async (...a) => ip.resize(...a), pageQuad: async (i) => ip.pageQuad(i), warp: async (...a) => ip.warp(...a), flatShare: async (i) => ip.flatShare(i) };
  const sa = await pc.straighten(img, asyncOps);
  t.ok(sa.found && sa.img.width === s.img.width && sa.img.height === s.img.height, 'the same with operations that answer with promises (the worker)');
};
