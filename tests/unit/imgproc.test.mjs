// imgproc.wasm on synthetic images with known answers.
export default async (t, { load, wasm }) => {
  const { bindImgproc, homography } = await load('/src/wasm/imgproc.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const img = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, a = 255] = f(x, y); d.set([r, g, b, a], (y * w + x) * 4); } return { data: d, width: w, height: h }; };
  const px = (im, x, y) => Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));
  const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.data.length; i++) m = Math.max(m, Math.abs(a.data[i] - b.data[i])); return m; };
  const mean = (im, c = 0) => { let s = 0; for (let i = c; i < im.data.length; i += 4) s += im.data[i]; return s / (im.data.length / 4); };
  const grad = img(64, 48, (x, y) => [x * 4, y * 5, 128]);

  t.ok(maxDiff(ip.adjust(grad, {}), grad) <= 1, 'adjust with no changes is identity');
  t.ok(mean(ip.adjust(grad, { bright: 0.3 })) > mean(grad) + 20, 'brightness raises mean');
  t.ok(mean(ip.adjust(grad, { exposure: -1 })) < mean(grad), 'negative exposure darkens');
  const sat0 = ip.adjust(img(4, 4, () => [200, 50, 50]), { sat: -1 }); t.ok(Math.abs(px(sat0, 0, 0)[0] - px(sat0, 0, 0)[1]) <= 1, 'saturation −1 → grey');
  const hue = ip.adjust(img(2, 2, () => [255, 0, 0]), { hue: 120 }); t.ok(px(hue, 0, 0)[1] > px(hue, 0, 0)[0], 'hue +120° turns red towards green');
  const warm = ip.adjust(img(2, 2, () => [128, 128, 128]), { temp: 0.5 }); t.ok(px(warm, 0, 0)[0] > px(warm, 0, 0)[2], 'warm temperature: red > blue');

  const solid = img(50, 30, () => [10, 200, 90]);
  const r1 = ip.resize(solid, 17, 11); t.eq([r1.width, r1.height], [17, 11], 'resize dims'); t.ok(px(r1, 8, 5).slice(0, 3).every((v, i) => Math.abs(v - [10, 200, 90][i]) <= 1), 'resize keeps solid colour');
  const checker = img(64, 64, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
  const half = ip.resize(checker, 16, 16); t.ok(Math.abs(px(half, 8, 8)[0] - 128) < 12, 'downscaled checkerboard ≈ mid-grey (antialiased)');
  const transparent = ip.resize(img(10, 10, (x) => (x < 5 ? [255, 0, 0, 255] : [0, 255, 0, 0])), 5, 5); t.ok(px(transparent, 2, 2)[1] < 40, 'premultiplied: transparent green does not bleed');
  t.ok(Math.abs(mean(ip.blur(grad, 3)) - mean(grad)) < 1.5, 'blur preserves mean');
  const sharp = ip.sharpen(img(20, 1, (x) => (x < 10 ? [100, 100, 100] : [150, 150, 150])), 1.5, 1); t.ok(px(sharp, 9, 0)[0] < 100 && px(sharp, 10, 0)[0] > 150, 'sharpen adds overshoot at an edge');

  const tall = img(30, 20, (x, y) => [x * 8, y * 12, 0]);
  const rot = ip.rotate(tall, 90, 20, 30);
  t.ok(px(rot, 0, 0)[1] > 200 && px(rot, 0, 0)[0] < 15, 'rotate 90° clockwise: bottom-left moves to top-left');

  const pix = ip.pixelateRect(grad, 0, 0, 8, 8, 8); t.eq(px(pix, 0, 0), px(pix, 7, 7), 'pixelate block uniform');
  t.ok(maxDiff(ip.blurRect(grad, 40, 40, 10, 5, 4), grad) > 0, 'blur rect changes region');

  // matting: full mask → opaque, empty → transparent
  t.ok(ip.guidedAlpha(grad, new Uint8Array(16).fill(255), 4, 4).every((a) => a > 245), 'guided alpha: foreground');
  t.ok(ip.guidedAlpha(grad, new Uint8Array(16).fill(0), 4, 4).every((a) => a < 10), 'guided alpha: background');
  const comp = ip.composite(solid, new Uint8Array(50 * 30).fill(0), 0xffffff); t.eq(px(comp, 3, 3), [255, 255, 255, 255], 'composite onto white');

  // document: bright page on dark table → corners found
  const page = img(400, 300, (x, y) => { const inside = (x > 60 && x < 340 && y > 40 && y < 260); return inside ? [235, 235, 230] : [40, 45, 50]; });
  const q = ip.detectQuad(page);
  t.ok(q.confidence > 30, `page detected (confidence ${q.confidence})`);
  const want = [60, 40, 340, 40, 340, 260, 60, 260];
  t.ok(q.corners.every((v, i) => Math.abs(v - want[i]) < 6), `corners near truth ${q.corners.map((v) => v.toFixed(0))}`);
  const flat = ip.warp(page, want, 280, 220); t.ok(mean(flat) > 220, 'warp extracts the page');
  const H = homography([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [2, 0], [2, 2], [0, 2]]); t.ok(Math.abs(H[0] - 2) < 1e-9 && Math.abs(H[4] - 2) < 1e-9, 'homography scale');
  const lit = img(200, 150, (x) => [120 + x / 2, 120 + x / 2, 120 + x / 2]);
  const clean = ip.docEnhance(lit, 0); t.ok(Math.abs(px(clean, 5, 75)[0] - px(clean, 195, 75)[0]) < 25, 'doc enhance flattens uneven lighting');
  const bw = ip.docEnhance(img(100, 100, (x, y) => ((x > 40 && x < 60 && y > 40 && y < 60) ? [30, 30, 30] : [220, 220, 220])), 2);
  t.ok(px(bw, 50, 50)[0] === 0 && px(bw, 5, 5)[0] === 255, 'B/W mode: text black, paper white');

  // artistic filters run and change the image
  const photo = img(96, 72, (x, y) => [128 + 100 * Math.sin(x / 9), 128 + 100 * Math.cos(y / 7), (x * y) % 256]);
  for (const [name, f] of [['cartoon', () => ip.cartoon(photo)], ['kuwahara', () => ip.kuwahara(photo, 4)], ['sketch', () => ip.sketch(photo)], ['watercolor', () => ip.watercolor(photo)], ['halftone', () => ip.halftone(photo)], ['bilateral', () => ip.bilateral(photo)]]) {
    const out = f(); t.ok(out.width === 96 && maxDiff(out, photo) > 10, `${name} transforms the image`);
  }
  const h = ip.histogram(solid); t.eq([h[10], h[256 + 200], h[512 + 90]], [1500, 1500, 1500], 'histogram counts');
};
