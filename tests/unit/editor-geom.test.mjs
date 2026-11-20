// Image Editor geometry (src/lib/editor-geom.ts): the crop after straightening is held to geometry itself — every
// corner of the kept rectangle, turned back by the angle about the centre, lies inside the picture; a rectangle
// two pixels larger does not — and the size boxes refuse what cannot be made.
export default async (t, { load }) => {
  const G = await load('/src/lib/editor-geom.ts');
  const inside = (w, h, deg, r, grow = 0) => {
    const a = (-deg * Math.PI) / 180, cx = w / 2, cy = h / 2, rw = r.w + grow, rh = r.h + grow;
    return [[-rw / 2, -rh / 2], [rw / 2, -rh / 2], [rw / 2, rh / 2], [-rw / 2, rh / 2]].every(([x, y]) => {
      const X = cx + x * Math.cos(a) - y * Math.sin(a), Y = cy + x * Math.sin(a) + y * Math.cos(a);
      return X >= -1e-6 && X <= w + 1e-6 && Y >= -1e-6 && Y <= h + 1e-6;
    });
  };
  let fit = 0, max = 0, shape = 0, n = 0;
  for (const [w, h] of [[600, 400], [400, 600], [1000, 1000], [4032, 3024], [100, 2000], [37, 13]]) for (const deg of [-45, -30, -10, -2.5, -0.5, 0.5, 1, 5, 12.5, 33, 45]) {
    n++; const r = G.straightenCrop(w, h, deg);
    if (inside(w, h, deg, r)) fit++;
    if (!inside(w, h, deg, r, 2)) max++; // whole pixels: the exact rectangle is rounded down by less than one
    if (Math.abs(r.w / r.h - w / h) <= (w / h) * (1 / r.w + 1 / r.h) + 1e-9) shape++;
  }
  t.eq([fit, max, shape], [n, n, n], `${n} sizes × angles: the kept rectangle lies inside the turned picture (no empty corner), is the largest such, keeps the shape`);
  t.eq(G.straightenCrop(600, 400, 0), { x: 0, y: 0, w: 600, h: 400 }, 'no angle: the whole picture');
  t.eq(G.straightenCrop(600, 400, 10), G.straightenCrop(600, 400, -10), 'the same for both directions');
  const r = G.straightenCrop(600, 400, 10); t.eq([r.x, r.y], [Math.floor((600 - r.w) / 2), Math.floor((400 - r.h) / 2)], 'centred');
  t.eq(['300', ' 64 ', '1', '16384'].map((v) => G.readSide(v, 'width')), [300, 64, 1, 16384], 'sizes as typed');
  t.eq(['', '0', '-5', '12.5', 'abc', '16385'].map((v) => G.readSide(v, 'width')), ['Type the width.', 'The width must be at least 1 pixel.', 'The width must be at least 1 pixel.', 'The width is a whole number of pixels.', 'The width is a whole number of pixels.', 'The width can be at most 16,384 pixels (browsers cannot hold larger pictures).'], 'what cannot be made is said (−5 gave a 1-pixel picture, 0 the original size)');
};
