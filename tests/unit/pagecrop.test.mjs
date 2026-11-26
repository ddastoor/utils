// src/lib/pagecrop.ts — the page of a photo found and straightened before it is read (the Photo Dictionary; owner,
// 21 Nov 2026: a phone's photo of a Kindle page "extremely well"): synthetic photos with known corners, on imgproc.wasm.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const pc = await load('/src/lib/pagecrop.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  // a photo: a dark table (or a Kindle's black body) with a light quadrilateral on it, text-like stripes inside
  const photo = (W, H, quad, { light = 228, dark = 40, stripes = true, textTo = Infinity } = {}) => {
    const d = new Uint8ClampedArray(W * H * 4);
    const inside = (x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const [x1, y1] = quad[i], [x2, y2] = quad[(i + 1) % 4]; if ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) < 0) s++; } return s === 0 || s === 4; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = dark + ((x * 7 + y * 13) % 9);
      if (inside(x + 0.5, y + 0.5)) v = stripes && y < textTo && y % 24 < 6 && x % 40 < 30 ? 50 : light;
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
  // no page is shaped like a line of text (to-do #13: on Windows the outline of a screenshot's line was straightened as a
  // page and its descenders cut off); a long receipt is
  t.ok(!pc.usable([20, 20, 880, 26, 880, 52, 20, 46], 900, 72), `an outline 33 times as long as it is high is no page (at most ${pc.MAX_ASPECT} : 1)`);
  t.ok(pc.usable([100, 50, 300, 52, 298, 850, 98, 848], 400, 900), 'a long receipt (4 : 1) is a page');
  {
    // a light strip round a line on a dark screen, slightly tilted: the outline finder finds it; it is not taken for a page
    const strip = photo(900, 150, [[20, 50], [880, 62], [880, 92], [20, 80]], { stripes: false });
    const o = await ip.pageQuad(strip), ss = await pc.straighten(strip, ip);
    t.ok(o.confidence > 0 && !ss.found, `a strip round a line of text: outlined (${o.confidence > 0}), and left as it is (${!ss.found})`);
  }

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
  // to-do #18 — paper (owner, 26 Nov 2026: documents photographed with a phone read "very poorly"). Every outline is
  // checked across its edges: a page is lighter than what lies around it.
  const steps = ip.quadSteps(img, quad.flat());
  t.ok(steps.every((v) => v > 100) && pc.realEdges(steps) === 4, `the page's own outline: four real edges (${steps.join(', ')})`);
  const inner = [420, 400, 900, 430, 880, 1000, 400, 960]; // a region inside the page (a column, the space under a table)
  const si = ip.quadSteps(img, inner);
  t.ok(pc.realEdges(si) === 0, `a region inside the page: no real edge (${si.join(', ')})`);
  const off = [0, 0, 700, 0, 700, 800, 0, 800], so = ip.quadSteps(photo(1400, 1600, [[-50, -50], [700, -50], [700, 800], [-50, 800]]), off);
  t.ok(so[0] === 9999 && so[3] === 9999 && pc.realEdges(so) === 4, `a page running off the photo: its edges along the border count (${so.join(', ')})`);
  // the Doc Scanner's network is asked only where the outline is not a page's on all four edges
  let asked = 0;
  const net = (corners, score = 0.99) => async () => { asked++; return { corners, score }; };
  const frac = (q) => q.map((v, i) => v / (i % 2 ? 1600 : 1400));
  const a1 = await pc.straighten(img, { ...ip, docCorners: net(frac(inner)) });
  t.ok(a1.found && a1.by === 'outline' && asked === 0, 'an outline with four real edges: taken, the network never asked');
  // (an outline is given on the copy the finders look at, ≤ 1200 px: scaled from the photo's pixels)
  const outlineAt = (q) => (im) => ({ corners: q.map((v, i) => v * (i % 2 ? im.height / 1600 : im.width / 1400)), confidence: 1 });
  const wrongOutline = { ...ip, pageQuad: outlineAt(inner) };
  const a2 = await pc.straighten(img, { ...wrongOutline, docCorners: net(frac(quad.flat())) });
  t.ok(a2.found && a2.by === 'network' && asked === 1 && near(a2.corners, quad.flat(), 10), `a wrong outline (inside the page): the network is asked and its page taken, its edges fitted to the photo's (the made-up page's text runs to its edge) (${a2.found} ${a2.by} ${a2.corners?.map(Math.round).join(', ')})`);
  // the strip along the edges is painted on a page the network found (its corners can lie a little outside the page),
  // not on the Kindle finder's (its outline is the page's own edge)
  let painted = 0;
  const counting = { clearBorder: (im, f) => { painted++; return ip.clearBorder(im, f); } };
  await pc.straighten(img, { ...ip, ...counting });
  const byNet = await pc.straighten(img, { ...wrongOutline, ...counting, docCorners: net(frac(quad.flat())) });
  t.ok(painted === 1 && byNet.by === 'network', `the desk's strips are looked for on the network's page only (${painted} of 2)`);
  const a3 = await pc.straighten(img, wrongOutline);
  t.ok(!a3.found && a3.img === img, 'a wrong outline and no network: the photo is read as it is (not a part of the page)');
  const a4 = await pc.straighten(img, { ...wrongOutline, docCorners: async () => { throw new Error('offline'); } });
  t.ok(!a4.found && a4.img === img, 'the network cannot be fetched: the same, no error');
  const a5 = await pc.straighten(img, { ...wrongOutline, docCorners: net(frac(quad.flat()), 0.2) });
  t.ok(!a5.found, 'the network not sure there is a document (P < 0.5): its corners are not used');
  const threeReal = [260, 140, 1180, 210, 1150, 830, 230, 760]; // the upper part of the page: its bottom edge inside it
  // … on a page whose text ends above that edge (the rest of the page blank): the outline holds the text — taken
  const upper = photo(1400, 1600, quad, { textTo: 700 });
  let before = asked;
  const a6 = await pc.straighten(upper, { ...ip, pageQuad: outlineAt(threeReal), docCorners: net(frac(inner)) });
  t.ok(a6.found && a6.by === 'outline' && asked === before + 1, 'an outline with three real edges that holds the text: the network is asked, its worse corners are not taken');
  // … on a page with text below that edge: a region inside the page (to-do #18: a big watermark's letters fence in such
  // regions) — its letters are counted inside and outside, and an outline that leaves a fifth outside is no page
  const tIn = ip.quadText(img, quad.flat()), tUp = ip.quadText(img, threeReal), tInner = ip.quadText(img, inner), tUpper = ip.quadText(upper, threeReal);
  t.ok(tIn.inside > 500 && tIn.outside === 0 && pc.holdsText(tIn), `the page's own outline holds every letter (${tIn.inside} inside, ${tIn.outside} outside)`);
  t.ok(tUp.outside >= 0.3 * (tUp.inside + tUp.outside) && !pc.holdsText(tUp), `the page's upper part leaves its lower text outside: no page (${tUp.inside} inside, ${tUp.outside} outside)`);
  t.ok(!pc.holdsText(tInner) && pc.holdsText(tUpper), `a region in the middle: no page (${tInner.inside} / ${tInner.outside}); the upper part of a page whose text ends there: the page (${tUpper.inside} / ${tUpper.outside})`);
  t.ok(pc.holdsText({ inside: 1000, outside: 24 }) && pc.holdsText({ inside: 30, outside: 24 }) && !pc.holdsText({ inside: 100, outside: 25 }) && pc.holdsText({ inside: 1000, outside: 200 }), 'holdsText: a few letters outside (a bezel\'s logo) or less than a fifth are allowed');
  before = asked;
  const a7 = await pc.straighten(img, { ...ip, pageQuad: outlineAt(threeReal), docCorners: net(frac(inner)) });
  t.ok(!a7.found && a7.img === img && asked === before + 1, 'an outline with three real edges that leaves text outside: not taken, the network asked (no page either), the photo read as it is');
  t.ok((await pc.straighten(img, { ...ip, quadText: undefined, pageQuad: outlineAt(threeReal) })).found, '… without the count of letters it would have been taken');
  // a tilted page on a smooth desk that JPEG made exactly flat (measured 0.22 – 0.34 flat): a camera's photo all the same
  const smooth = (() => { const W = 1200, H = 1400, d = new Uint8ClampedArray(W * H * 4), q = [[230, 150], [1000, 210], [950, 1250], [180, 1190]];
    const inq = (x, y) => { let c = 0; for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; if ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) < 0) c++; } return c === 0 || c === 4; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 190 + ((x >> 4) + (y >> 4)) % 2; if (inq(x + 0.5, y + 0.5)) v = y % 26 < 7 && x % 41 < 30 ? 60 + noise() : 243 + noise(); d.set([v, v, v, 255], (y * W + x) * 4); }
    return { img: { data: d, width: W, height: H }, q }; })();
  t.ok(ip.flatShare(smooth.img) > 0.2, `the smooth desk: as flat as a screenshot by the old rule (${ip.flatShare(smooth.img).toFixed(2)})`);
  const sm = await pc.straighten(smooth.img, ip);
  t.ok(sm.found && near(sm.corners, smooth.q.flat(), 16), `… its tilted page is found and straightened all the same (${sm.corners?.map(Math.round).join(', ')})`);
  t.ok(pc.squareOn([200, 150, 1000, 151, 1001, 750, 199, 749]) && !pc.squareOn(smooth.q.flat()), 'square on: a screenshot\'s panel is, a photographed page is not');
  // what lay round the page, left along its edges once straightened (the network's corners a little outside the page, a
  // screen's bezel): painted the paper's colour — with a dark strip down its side Tesseract read a form without its title
  const strip = (() => { const W = 700, H = 900, d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 236 + noise();                                                          // the paper
      if (y > 60 && y < 800 && y % 24 < 6 && x > 30 && x < 640 && x % 40 < 30) v = 45;  // text, from 30 px in
      if (x < 9 - (y > 450 ? 3 : 0) || y < 5) v = 70 + noise();                        // a strip of the desk on the left and the top
      if (y > 300 && y < 340 && x > 660 && x < 690) v = 30;                            // a black mark near the right edge (not a strip)
      d.set([v, v, v, 255], (y * W + x) * 4);
    }
    return { data: d, width: W, height: H }; })();
  const cb = ip.clearBorder(strip, pc.BORDER);
  t.ok(cb.painted > 0 && at(cb.img, 3, 100) > 220 && at(cb.img, 7, 200) > 220 && at(cb.img, 200, 2) > 220, `the desk's strips along the left and the top: painted the paper's colour (${cb.painted} px)`);
  t.ok(at(cb.img, 45, 72) < 80 && at(cb.img, 675, 320) < 80 && at(cb.img, 300, 400) === at(strip, 300, 400), 'the text from 30 px in and a black mark near the right edge stay; the rest is untouched');
  const again = ip.clearBorder(cb.img, pc.BORDER);
  t.ok(again.painted === 0, `a page whose strips are painted: nothing more to paint (${again.painted})`);
  const darkPage = { width: 400, height: 500, data: new Uint8ClampedArray(400 * 500 * 4).map((_, i) => (i % 4 === 3 ? 255 : 25)) };
  t.ok(ip.clearBorder(darkPage, pc.BORDER).painted === 0, 'a dark page (light text on dark): left alone');
  // the operations may answer with promises (the worker's) as well as at once (the module's)
  const asyncOps = { resize: async (...a) => ip.resize(...a), pageQuad: async (i) => ip.pageQuad(i), warp: async (...a) => ip.warp(...a), flatShare: async (i) => ip.flatShare(i), quadSteps: async (...a) => ip.quadSteps(...a) };
  const sa = await pc.straighten(img, asyncOps);
  t.ok(sa.found && sa.img.width === s.img.width && sa.img.height === s.img.height, 'the same with operations that answer with promises (the worker)');

  // a real scan with a big watermark (to-do #18; tests/fixtures/images/doc-memo-watermark-scan.jpg): the white area that
  // the letters of CONFIDENTIAL fence in passed for the page — with the Doc Scanner's network, as the tabs run it — and
  // the page was read from half way down; the letters outside it say it is no page
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const ort = await import(root + 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs');
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(root + 'node_modules/scanic-ml/dist/doccornernet_lean.ort')), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const pf = await load('/src/lib/pagefind.ts');
  const docCorners = async (im) => { const r = ip.resizeArea(im, pf.SIZE, pf.SIZE); return pf.readOutput(await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', pf.modelInput(r.data), [1, pf.SIZE, pf.SIZE, 3]) })); };
  const jpeg = await import(root + 'node_modules/@jsquash/jpeg/decode.js');
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const dj = await jpeg.default(readFileSync(root + 'tests/fixtures/images/doc-memo-watermark-scan.jpg')), scan = { data: dj.data, width: dj.width, height: dj.height };
  const wrong = await pc.straighten(scan, { ...ip, quadText: undefined, docCorners });
  t.ok(wrong.found && wrong.img.height < scan.height / 3, `the watermark scan without the count of letters: a region of ${wrong.img?.width} × ${wrong.img?.height} taken for the page (of ${scan.width} × ${scan.height})`);
  const right = await pc.straighten(scan, { ...ip, docCorners });
  t.ok(!right.found && right.img === scan, '… with it: no page, the scan read whole');
};
