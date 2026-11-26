// Slideshow Maker geometry (src/lib/slideshow-geom.ts, to-do #19): "Whole pictures" never cuts a photo — at every
// moment of its time on screen (q = 0 … 1, every frame of a 10 s photo at 30 fps), for photos of every shape (a 4 : 1
// panorama, a 1 : 3 strip, a square, a phone photo either way, a photo of the frame's own shape) in every video shape,
// with the gentle zoom and without, the photo's rectangle lies inside the frame, keeps its shape and is centred
// vertically; the zoom really moves it (92 % → 100 % of the fitted size) and the pan stays within the room beside it.
// The two looks that existed ("Fill", "Fit") are held to the formula they always had: they are not changed.
export default async (t, { load }) => {
  const G = await load('/src/lib/slideshow-geom.ts');
  const FRAMES = [[1920, 1080], [1080, 1920], [1080, 1080], [1080, 1350], [1280, 720], [720, 1280], [720, 720], [720, 900]];
  const PHOTOS = [[4000, 1000], [600, 1800], [1000, 1000], [4032, 3024], [3024, 4032], [1920, 1080], [37, 1300], [5000, 11]];
  const QS = Array.from({ length: 301 }, (_, i) => i / 300); // 10 s at 30 fps
  const EPS = 1e-6;
  let n = 0, inside = 0, shape = 0, fitted = 0, centred = 0;
  for (const [W, H] of FRAMES) for (const [pw, ph] of PHOTOS) for (const zoom of [true, false]) for (const k of [0, 1, 2]) for (const q of QS) {
    n++;
    const r = G.placement('whole', zoom, q, k, W, H, pw, ph);
    if (r.x >= -EPS && r.y >= -EPS && r.x + r.w <= W + EPS && r.y + r.h <= H + EPS && G.cutShare(r, W, H) < 1e-9) inside++;
    if (Math.abs(r.w / r.h - pw / ph) <= 1e-9 * (pw / ph)) shape++;
    const contain = Math.min(W / pw, H / ph), s = r.w / pw;
    if (s <= contain * (1 + 1e-12) && s >= contain * (zoom ? 1 - G.ZOOM : 1) * (1 - 1e-12)) fitted++;
    if (Math.abs(r.y + r.h / 2 - H / 2) < 1e-6) centred++;
  }
  t.eq([inside, shape, fitted, centred], [n, n, n, n], `${n} placements (8 video shapes × 8 photo shapes × zoom on / off × 3 photos × 301 moments): every photo entirely inside the frame, its shape kept, at 92 – 100 % of the fitted size, centred`);

  // the zoom moves the picture: from 92 % at the start to the full fitted size at the end; the pan alternates and stays
  // within the room beside the photo (a photo filling the frame's width does not move sideways at its full size)
  const a = G.placement('whole', true, 0, 0, 1920, 1080, 1000, 1000), b = G.placement('whole', true, 1, 0, 1920, 1080, 1000, 1000);
  t.near(a.h / 1080, 0.92, 1e-12, 'a square in 16:9 starts at 92 % of the frame\'s height');
  t.near(b.h / 1080, 1, 1e-12, '… and ends at the full height');
  t.ok(G.placement('whole', true, 0, 0, 1920, 1080, 1000, 1000).x > G.placement('whole', true, 0, 1, 1920, 1080, 1000, 1000).x, 'every other photo pans the other way');
  const pano = [0, 0.25, 0.5, 0.75, 1].map((q) => G.placement('whole', true, q, 1, 1080, 1920, 4000, 1000));
  t.ok(pano.every((r) => r.x >= -EPS && r.x + r.w <= 1080 + EPS), `a 4 : 1 panorama in 9:16 stays inside while it zooms and pans (left edges ${pano.map((r) => r.x.toFixed(2)).join(', ')})`);
  t.near(pano[4].w, 1080, 1e-9, '… and fills the width exactly at the end');
  t.near(pano[4].x, 0, 1e-9, '… with no room left to pan');
  const still = G.placement('whole', false, 0.3, 0, 1920, 1080, 600, 1800);
  t.eq([still.w, still.h, still.x, still.y], [360, 1080, 780, 0], 'zoom off: the fitted size, centred, at every moment');

  // the existing looks are what they always were: Fill covers the frame and grows to 108 %; Fit is contained and grows too
  const old = (fit, zoom, q, k, W, H, pw, ph) => { // the formula the tab drew with before to-do #19
    const cover = Math.max(W / pw, H / ph), contain = Math.min(W / pw, H / ph);
    const z = zoom ? 1 + 0.08 * q : 1, s = (fit === 'fill' ? cover : contain) * z, pan = zoom ? (k % 2 ? 1 : -1) * 0.025 * W * (q - 0.5) : 0;
    return { x: (W - pw * s) / 2 + pan, y: (H - ph * s) / 2, w: pw * s, h: ph * s };
  };
  let same = 0, m = 0;
  for (const fit of ['fill', 'fit']) for (const [W, H] of FRAMES) for (const [pw, ph] of PHOTOS) for (const zoom of [true, false]) for (const k of [0, 1]) for (const q of [0, 0.1, 0.5, 0.99]) {
    m++; const r = G.placement(fit, zoom, q, k, W, H, pw, ph), o = old(fit, zoom, q, k, W, H, pw, ph);
    if (['x', 'y', 'w', 'h'].every((key) => Math.abs(r[key] - o[key]) <= 1e-9 * Math.max(1, Math.abs(o[key])))) same++;
  }
  t.eq(same, m, `${m} placements of Fill and Fit equal the formula they always had`);
  // and they do cut — which is why Whole pictures exists
  t.ok(G.cutShare(G.placement('fill', false, 0.5, 0, 1920, 1080, 600, 1800), 1920, 1080) > 0.8, 'Fill cuts most of a 1 : 3 strip in 16:9');
  t.ok(G.cutShare(G.placement('fit', true, 0.9, 0, 1080, 1920, 4000, 1000), 1080, 1920) > 0.05, 'Fit with the gentle zoom cuts the edges of a panorama in 9:16');
  t.eq(G.cutShare(G.placement('fit', false, 0.9, 0, 1080, 1920, 4000, 1000), 1080, 1920), 0, 'Fit without the zoom cuts nothing');
};
