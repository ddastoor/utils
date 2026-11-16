// imgproc.wasm on synthetic images with known answers.
export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
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
  // warp of an axis-aligned quad = exact crop + scale (homography solved in C)
  const ramp = img(40, 40, (x, y) => [x * 6, y * 6, 0, 255]);
  const sub = ip.warp(ramp, [10, 10, 30, 10, 30, 30, 10, 30], 20, 20);
  t.ok(Math.abs(px(sub, 0, 0)[0] - 63) <= 4 && Math.abs(px(sub, 19, 19)[1] - 177) <= 4, `warp quad → exact sub-image (${px(sub, 0, 0)}, ${px(sub, 19, 19)})`);
  t.throws(() => ip.warp(ramp, [5, 5, 5, 5, 5, 5, 5, 5], 10, 10), 'degenerate quad rejected');
  // lossless orientation transforms (EXIF 1–8) and crop
  const o = img(3, 2, (x, y) => [x * 100, y * 100, 7, 255]); // pixel (x,y) encodes its own coordinates
  const at = (im, x, y) => { const p = px(im, x, y); return [p[0] / 100, p[1] / 100]; };
  const o6 = ip.orient(o, 6); t.eq([o6.width, o6.height], [2, 3], 'orient 6 swaps dims'); t.eq(at(o6, 1, 0), [0, 0], 'orient 6 (90° CW): top-left → top-right'); t.eq(at(o6, 0, 2), [2, 1], 'orient 6: bottom-right → bottom-left');
  const o8 = ip.orient(o, 8); t.eq(at(o8, 0, 2), [0, 0], 'orient 8 (90° CCW): top-left → bottom-left');
  const o3 = ip.orient(o, 3); t.eq(at(o3, 0, 0), [2, 1], 'orient 3 (180°)');
  t.eq(at(ip.orient(o, 2), 0, 0), [2, 0], 'orient 2 flips horizontally'); t.eq(at(ip.orient(o, 4), 0, 0), [0, 1], 'orient 4 flips vertically');
  t.eq(at(ip.orient(o, 5), 1, 2), [2, 1], 'orient 5 transposes'); t.eq(at(ip.orient(o, 7), 0, 0), [2, 1], 'orient 7 transverse');
  const four = [6, 6, 6, 6].reduce((im, k) => ip.orient(im, k), o); t.eq(Array.from(four.data), Array.from(o.data), 'four quarter turns = identity');
  t.ok(ip.orient(o, 1) === o, 'orient 1 is a no-op');
  const c = ip.crop(o, 1, 1, 5, 5); t.eq([c.width, c.height], [2, 1], 'crop clamps to image'); t.eq(at(c, 0, 0), [1, 1], 'crop origin');
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
  // alpha bounding box + ink extraction (signature tool)
  const sig = img(50, 30, (x, y) => (x >= 10 && x < 20 && y >= 5 && y < 12 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
  t.eq(ip.alphaBBox(sig), { x: 10, y: 5, w: 10, h: 7 }, 'alpha bounding box');
  t.eq(ip.alphaBBox(img(5, 5, () => [0, 0, 0, 0])).w, 0, 'empty → w = 0');
  // paper with a light→dark lighting gradient and dark ink strokes: only the ink becomes opaque
  const paper = img(120, 80, (x, y) => { const base = 235 - x * 0.6; const ink = (y > 35 && y < 42 && x > 20 && x < 100) || (x > 55 && x < 60 && y > 10 && y < 70); return ink ? [30, 30, 60, 255] : [base, base, base - 5, 255]; });
  const ink = ip.inkToAlpha(paper, 0x0b2a8a);
  t.ok(px(ink, 40, 38)[3] > 230 && px(ink, 57, 20)[3] > 230, 'ink strokes opaque');
  t.ok(px(ink, 5, 5)[3] < 10 && px(ink, 115, 75)[3] < 10, 'paper transparent at both ends of the lighting gradient');
  t.eq(px(ink, 40, 38).slice(0, 3), [0x0b, 0x2a, 0x8a], 'ink recoloured');
  t.eq(ip.inkToAlpha(paper, 0, true).data[(38 * 120 + 40) * 4], 30, 'keep original ink colour');
  // fill + NMS (Blur & Redact)
  const fr = ip.fillRect(img(10, 10, () => [200, 200, 200, 255]), 2, 3, 4, 2, [1, 2, 3, 255]);
  t.eq([px(fr, 2, 3), px(fr, 5, 4), px(fr, 6, 3)[0], px(fr, 2, 5)[0]], [[1, 2, 3, 255], [1, 2, 3, 255], 200, 200], 'fillRect fills exactly the rectangle');
  t.eq(ip.fillRect(img(4, 4, () => [9, 9, 9, 255]), -5, -5, 100, 100).data[0], 0, 'fillRect clamps to the image');
  const keep = ip.nms([[0, 0, 10, 10, 0.9], [1, 1, 10, 10, 0.8], [50, 50, 10, 10, 0.7], [2, 2, 4, 4, 0.95], [100, 0, 5, 5, 0.1]], 0.3, 0.6);
  t.eq(keep, [3, 2, 4], 'NMS: highest first; overlapping and contained boxes dropped; distant ones kept');
  t.eq(ip.nms([]), [], 'NMS of nothing');
  // page detection falls back to the whole image when the outline is degenerate (text scan without paper edges)
  const scanLike = img(200, 120, (x, y) => ((y % 12 < 3 && x > 20 && x < 180 && y > 10) || (x < 40 && y > 100) ? [20, 20, 20, 255] : [235, 235, 235, 255]));
  const dq = ip.detectQuad(scanLike);
  t.ok(dq.confidence === 0 || Math.abs(dq.corners[4] - dq.corners[0]) > 100, `degenerate page outline rejected (conf ${dq.confidence})`);
};
