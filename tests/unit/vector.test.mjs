// The engines of Image to SVG and Clipart Maker (potentials #1, #117), each held to an independent reference:
// - vtracer.wasm (our build of VTracer 0.6.5) against visioncortex's own command-line VTracer 0.6.5 built natively with the same
//   visioncortex and **musl's maths library** — the one WebAssembly's wasi-libc carries (`rustup target add x86_64-unknown-linux-musl;
//   cargo install vtracer --version 0.6.5 --target x86_64-unknown-linux-musl`; found by $VTRACER or on the PATH, else skipped with a
//   note): the SVG text byte for byte, in colour (stacked and cut out), black and white, splines, polygons and pixels, on a logo, pixel
//   art and photos. A build on glibc differs on photos: its trigonometry differs from musl's in the last digit now and then, and a
//   corner of a path with it;
// - Potrace 1.16 (esm-potrace-wasm) against the native potrace 1.16 (`apt install potrace`; $POTRACE or the PATH): the same paths;
// - the cut-out: imgproc.wasm's U²-Net input and output with ONNX Runtime Web against rembg's own steps in Python on ONNX Runtime
//   (tests/fixtures/vector/u2net-*.png, scripts/make-u2net-reference.py);
// - the pictures traced (rendered by librsvg, `rsvg-convert`) against what they were drawn from (tests/fixtures/vector, made by
//   scripts/make-vector-fixtures.py): the logo's five colours, the signature's ink, the pixel art's every pixel;
// - imgproc.wasm's flat colours, masks, black and white and ink lines on pictures with known answers;
// - src/lib/clipart.ts: every style's SVG.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from '../lib/child.mjs';
import { readPng, writePng } from '../lib/png.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const FX = root + 'tests/fixtures/vector/';
/** a program from $NAME or the PATH, or null */
const tool = (env, name) => {
  if (process.env[env] && existsSync(process.env[env])) return process.env[env];
  for (const d of (process.env.PATH || '').split(delimiter)) { const p = join(d, name); if (d && existsSync(p)) return p; }
  return null;
};

export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const { bindVtracer } = await load('/src/wasm/vtracer.ts');
  const { clipSvg, pathsOf, darker, STYLES } = await load('/src/lib/clipart.ts');
  const V = await load('/src/lib/vectorize.ts');
  const p = bindImgproc(await wasm('imgproc')), v = bindVtracer(await wasm('vtracer'));
  // the package's Emscripten glue takes Node for Node and asks for CommonJS's require (in the browser it never does)
  globalThis.require ??= createRequire(import.meta.url);
  globalThis.__dirname ??= root + 'node_modules/esm-potrace-wasm/dist';
  const potraceMod = await import(root + 'node_modules/esm-potrace-wasm/dist/index.js');
  await potraceMod.init();
  const potrace = (img, o) => potraceMod.potrace({ data: img.data, width: img.width, height: img.height }, o);
  const jpeg = await import(root + 'node_modules/@jsquash/jpeg/decode.js');
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const png = (f) => readPng(readFileSync(f));
  const truth = JSON.parse(readFileSync(FX + 'truth.json', 'utf8'));
  const logo = png(FX + 'logo.png'), pixel = png(FX + 'pixel.png');
  const sigJ = await jpeg.default(readFileSync(FX + 'signature.jpg')), sig = { data: sigJ.data, width: sigJ.width, height: sigJ.height };
  const sigMask = png(FX + 'signature-mask.png');
  const photos = Object.fromEntries(['chelsea', 'astronaut', 'coffee'].map((n) => [n, png(root + `tests/fixtures/images/${n}.png`)]));
  const tmp = mkdtempSync(join(tmpdir(), 'vector-'));
  const rsvg = tool('RSVG_CONVERT', 'rsvg-convert');
  /** an SVG drawn by librsvg at w × h on `bg` (or see-through) */
  const render = (svg, w, h, bg) => {
    const f = join(tmp, 'r.svg'), o = join(tmp, 'r.png');
    writeFileSync(f, svg);
    execFileSync(rsvg, ['-w', String(w), '-h', String(h), ...(bg ? ['-b', bg] : []), '-o', o, f]);
    return readPng(readFileSync(o));
  };

  try {
    // ---------------------------------------------------------------- VTracer: our build against the native tool
    const vtr = tool('VTRACER', 'vtracer');
    const CASES = [
      ['logo, colour, splines (the Logo kind)', logo, { colorPrecision: 6, layerDifference: 16, filterSpeckle: 4, mode: 'spline', cornerThreshold: 60 }],
      ['logo, colour, polygons, cut out', logo, { colorPrecision: 5, layerDifference: 24, filterSpeckle: 8, mode: 'polygon', cutout: true }],
      ['logo, black and white', logo, { color: false, filterSpeckle: 4, mode: 'spline' }],
      ['pixel art as pixels', pixel, { colorPrecision: 8, layerDifference: 1, filterSpeckle: 0, mode: 'pixel' }],
      ['a photo as a poster', photos.chelsea, { colorPrecision: 8, layerDifference: 6, filterSpeckle: 10, mode: 'spline', cornerThreshold: 75 }],
      ['a photo, the Drawing kind, precision 3', photos.coffee, { colorPrecision: 7, layerDifference: 10, filterSpeckle: 6, mode: 'spline', precision: 3 }],
      ['a signature photo, black and white', sig, { color: false, filterSpeckle: 2, mode: 'spline', cornerThreshold: 30, spliceThreshold: 60, lengthThreshold: 6 }],
      ['a photo, eight decimals', photos.astronaut, { colorPrecision: 6, layerDifference: 16, filterSpeckle: 4, mode: 'spline', precision: 8 }],
    ];
    if (!vtr) t.ok(true, 'NOTE: the native vtracer was not found (cargo install vtracer --version 0.6.5, or $VTRACER) — our build not compared with it');
    else for (const [what, img, o] of CASES) {
      const ours = v.trace(img, o);
      const f = join(tmp, 'in.png'), out = join(tmp, 'out.svg');
      writeFileSync(f, writePngRGBA(img));
      const args = ['--input', f, '--output', out, '--colormode', o.color === false ? 'bw' : 'color', '--hierarchical', o.cutout ? 'cutout' : 'stacked',
        '--mode', o.mode ?? 'spline', '--filter_speckle', String(o.filterSpeckle ?? 4), '--color_precision', String(o.colorPrecision ?? 6),
        '--gradient_step', String(o.layerDifference ?? 16), '--corner_threshold', String(o.cornerThreshold ?? 60), '--segment_length', String(o.lengthThreshold ?? 4),
        '--splice_threshold', String(o.spliceThreshold ?? 45), '--path_precision', String(o.precision ?? 2)];
      execFileSync(vtr, args);
      const theirs = readFileSync(out, 'utf8');
      t.eq(ours === theirs ? 'identical' : `differs (ours ${ours.length}, native ${theirs.length} characters)`, 'identical', `VTracer: ${what} — our vtracer.wasm writes the SVG the native VTracer 0.6.5 writes, byte for byte (${(ours.match(/<path/g) || []).length} paths)`);
    }

    // ---------------------------------------------------------------- Potrace: the package against the native tool
    const ptr = tool('POTRACE', 'potrace');
    const bitmaps = [
      ['the signature photo through the paper clean-up', p.bw(p.docEnhance(sig, 2), 128, false).img],
      ['the logo at Otsu’s threshold', p.bw(logo, -1, false).img],
      ['the pixel art at 128', p.bw(pixel, 128, false).img],
    ];
    const POPTS = [
      { turdsize: 2, turnpolicy: 4, alphamax: 1, opticurve: 1, opttolerance: 0.2, pathonly: false, extractcolors: false },
      { turdsize: 10, turnpolicy: 4, alphamax: 0, opticurve: 0, opttolerance: 0.2, pathonly: false, extractcolors: false },
      { turdsize: 0, turnpolicy: 4, alphamax: 1.334, opticurve: 1, opttolerance: 1, pathonly: false, extractcolors: false },
    ];
    if (!ptr) t.ok(true, 'NOTE: the native potrace was not found (apt install potrace, or $POTRACE) — Potrace not compared with it');
    else for (const [what, bm] of bitmaps) for (const o of POPTS) {
      const ours = await potrace(bm, o);
      const f = join(tmp, 'in.pbm'), out = join(tmp, 'out.svg');
      writeFileSync(f, pbm(bm));
      execFileSync(ptr, ['-s', '-o', out, '-t', String(o.turdsize), '-a', String(o.alphamax), '-O', String(o.opttolerance), '-z', 'minority', ...(o.opticurve ? [] : ['-n']), f]);
      const theirs = readFileSync(out, 'utf8');
      const pa = pathData(ours), pb = pathData(theirs);
      t.eq(pa === pb ? 'the same paths' : `${pa.length} against ${pb.length} characters`, 'the same paths', `Potrace: ${what}, turdsize ${o.turdsize}, alphamax ${o.alphamax}, opticurve ${o.opticurve} — esm-potrace-wasm draws the paths of the native potrace 1.16 (${(pa.match(/M/g) || []).length} paths)`);
    }

    // ---------------------------------------------------------------- the pictures traced, against what they were drawn from
    if (!rsvg) t.ok(true, 'NOTE: rsvg-convert was not found (apt install librsvg2-bin) — the traced pictures were not drawn');
    else {
      // the logo: every pixel's nearest of the five colours, as drawn and as traced
      {
        const [W, H] = truth.logo.size, cols = truth.logo.colours;
        const near = (d, i) => { let b = 0, bd = 1e9; for (let k = 0; k < cols.length; k++) { const e = (d[i] - cols[k][0]) ** 2 + (d[i + 1] - cols[k][1]) ** 2 + (d[i + 2] - cols[k][2]) ** 2; if (e < bd) { bd = e; b = k; } } return b; };
        for (const [kind, o] of [['Logo', { colorPrecision: 6, layerDifference: 16, filterSpeckle: 4, mode: 'spline', cornerThreshold: 60 }], ['Drawing', { colorPrecision: 7, layerDifference: 10, filterSpeckle: 6, mode: 'spline', cornerThreshold: 60 }]]) {
          const svg = v.trace(logo, o), r = render(svg, W, H, 'white');
          // inside a colour (no other colour within 1 px of the drawing) and along the edges
          const lab = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) lab[i] = near(logo.data, i * 4);
          let same = 0, inner = 0, innerSame = 0;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, ok = lab[i] === near(r.data, i * 4);
            let edge = false; for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W && lab[yy * W + xx] !== lab[i]) { edge = true; break; } }
            same += ok; if (!edge) { inner++; innerSame += ok; }
          }
          t.ok(innerSame / inner >= 0.999 && same / (W * H) >= 0.99, `the logo traced as a ${kind}: ${(100 * innerSame / inner).toFixed(3)} % of the pixels inside its shapes and ${(100 * same / (W * H)).toFixed(2)} % of all in the colour drawn (the rest on its edges, a pixel either way)`);
        }
      }
      // the signature: the ink the tab finds in black and white, against the stroke as it was drawn
      {
        const [W, H] = truth.signature.size;
        const iou = (svg) => {
          const r = render(svg, W, H, 'white'); let both = 0, any = 0;
          for (let i = 0; i < W * H; i++) { const a = sigMask.data[i * 4] >= 128, b = r.data[i * 4] < 128; both += a && b; any += a || b; }
          return both / any;
        };
        const opts = { threshold: -1, invert: false, paper: true, turdsize: 2, alphamax: 1, opticurve: true, opttolerance: 0.2 };
        const paper = await V.bwSvg(sig, opts, p, potrace), otsu = await V.bwSvg(sig, { ...opts, paper: false }, p, potrace);
        const a = iou(paper.svg), b = iou(otsu.svg);
        t.ok(a >= 0.85, `the signature photographed on paper lit unevenly, traced with “a photo of paper”: the ink drawn and the ink traced overlap by ${(a * 100).toFixed(1)} % (IoU)`);
        t.ok(a > b, `… better than by Otsu’s one threshold for the whole photo (${(b * 100).toFixed(1)} %: the shadow at the corner turns to ink)`);
        t.eq(paper.threshold, 128, 'a photo of paper is cleaned up first, then cut at 128');
      }
      // pixel art: every pixel back, exactly
      {
        const svg = v.trace(pixel, { colorPrecision: 8, layerDifference: 1, filterSpeckle: 0, mode: 'pixel' });
        const r = render(svg, 240, 240, 'white');
        let ok = 0;
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
          const i = (y * 24 + x) * 4, j = ((y * 10 + 5) * 240 + x * 10 + 5) * 4;
          ok += pixel.data[i] === r.data[j] && pixel.data[i + 1] === r.data[j + 1] && pixel.data[i + 2] === r.data[j + 2];
        }
        t.eq(ok, 576, 'pixel art traced as pixels and drawn ten times as large: all 576 pixels in their own colour');
      }
    }

    // ---------------------------------------------------------------- the cut-out against rembg
    {
      const ort = await import(root + 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs');
      ort.env.wasm.numThreads = 1;
      const sess = await ort.InferenceSession.create(new Uint8Array(readFileSync(root + 'public/models/u2netp/u2netp.onnx')), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      const runNet = async (x) => { const o = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, 320, 320]) }); return o[sess.outputNames[0]].data; };
      for (const name of ['chelsea', 'astronaut', 'coffee']) {
        const img = photos[name], ref = png(FX + `u2net-${name}.png`);
        const m = p.u2Mask((await runNet(p.u2Planes(img, 320))).subarray(0, 320 * 320));
        let both = 0, any = 0, diff = 0;
        for (let i = 0; i < 320 * 320; i++) { const a = m[i] >= 128, b = ref.data[i * 4] >= 128; both += a && b; any += a || b; diff += Math.abs(m[i] - ref.data[i * 4]); }
        t.ok(both / any >= 0.98 && diff / (320 * 320) < 4, `the cut-out of ${name}: imgproc's input and output with ONNX Runtime Web against rembg's steps on ONNX Runtime — the subject overlaps by ${(100 * both / any).toFixed(2)} %, the mask differs by ${(diff / (320 * 320)).toFixed(2)} of 255 on average (PIL's Lanczos and ours differ a little)`);
        const full = await V.cutMask(img, p, runNet);
        t.eq([full.length, full.some((x) => x > 0 && x < 255)], [img.width * img.height, true], `… refined to the photo's own size by the guided filter (soft edges: fur, hair)`);
      }
      // the whole clip art, cut out
      const cut = (work) => V.cutMask(work, p, runNet);
      for (const name of ['chelsea', 'astronaut']) {
        const r = await V.clipParts(photos[name], { cut: true, colors: 12, detail: 0.0012, size: 800 }, { p, v, cut });
        t.ok(r.found && r.share > 0.3 && r.palette.length <= 12 && Math.max(r.width, r.height) === 800, `a clip art of ${name}: the subject found (${(100 * r.share).toFixed(0)} % of the photo), ${r.palette.length} colours, ${r.width} × ${r.height}, ${(r.shapes.match(/<path/g) || []).length} shapes, ${(r.lines.match(/<path/g) || []).length} ink lines, in ${(r.ms / 1000).toFixed(1)} s`);
        if (rsvg) {
          // the clip art's shape is the subject's
          const sil = render(r.silhouette, r.width, r.height, 'white'), fl = render(r.shapes, r.width, r.height);
          let both = 0, any = 0;
          for (let i = 0; i < r.width * r.height; i++) { const a = sil.data[i * 4] < 128, b = fl.data[i * 4 + 3] >= 128; both += a && b; any += a || b; }
          t.ok(both / any >= 0.97, `… its outline traced round its colours: they overlap by ${(100 * both / any).toFixed(1)} %`);
        }
      }
      const astro = await V.clipParts(photos.astronaut, { cut: true, colors: 12, detail: 0.0012, size: 800 }, { p, v, cut });
      // the face of the astronaut (the region of her eyes and mouth, 30 – 45 % across, 12 – 30 % down the clip art): lines there
      {
        const lines = rsvg ? render(astro.lines, astro.width, astro.height, 'white') : null;
        if (lines) {
          let ink = 0, n = 0;
          for (let y = Math.round(astro.height * 0.12); y < astro.height * 0.3; y++) for (let x = Math.round(astro.width * 0.3); x < astro.width * 0.45; x++) { n++; ink += lines.data[(y * astro.width + x) * 4] < 128; }
          t.ok(ink / n > 0.01, `the ink lines keep the astronaut's face — eyes, nose and mouth are ink (${(100 * ink / n).toFixed(1)} % of her face; the flat colours alone smooth them away)`);
        }
      }
      const off = await V.clipParts(photos.coffee, { cut: false, colors: 8, detail: 0.003, size: 640 }, { p, v });
      t.eq([off.found, off.share, off.crop, Math.max(off.width, off.height)], [false, 1, [0, 0, 600, 400], 640], 'without the cut: the whole photo, its long side at the clip art’s size');
      t.ok(off.palette.length <= 8, `… in at most the colours asked for (${off.palette.length})`);
    }

    // ---------------------------------------------------------------- imgproc: flat colours, masks, black and white, lines
    {
      // three blocks of colour with noise, a 4 × 4 speck of a fourth colour inside one, a see-through stripe
      const W = 90, H = 60, d = new Uint8ClampedArray(W * H * 4);
      let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 6;
      const cols = [[200, 40, 40], [40, 160, 60], [40, 60, 200]];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, c = cols[Math.floor(x / 30)];
        for (let k = 0; k < 3; k++) d[i + k] = c[k] + rnd();
        d[i + 3] = y >= 55 ? 0 : 255;
        if (x >= 10 && x < 16 && y >= 20 && y < 26) { d[i] = 250; d[i + 1] = 250; d[i + 2] = 40; }
      }
      const img = { data: d, width: W, height: H };
      const a = p.clipFlat(img, 4, 64, 1), b = p.clipFlat(img, 4, 64, 1), keep = p.clipFlat(img, 4, 16, 0);
      const at = (im, x, y) => Array.from(im.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4));
      t.eq(Buffer.compare(Buffer.from(a.img.data), Buffer.from(b.img.data)), 0, 'flat colours: the same picture gives the same result (k-means++ from a fixed seed)');
      t.eq(at(a.img, 12, 22).slice(0, 3).map((c, k) => Math.abs(c - at(a.img, 25, 10)[k]) < 3), [true, true, true], 'a 6 × 6 speck smaller than the least area (64 px) takes the colour round it');
      t.ok(Math.abs(at(keep.img, 12, 22)[2] - 40) < 20 && at(keep.img, 12, 22)[0] > 200, 'with a least area of 16 px it stays yellow');
      t.eq(at(a.img, 40, 57), [0, 0, 0, 0], 'see-through pixels stay see-through (0, 0, 0, 0)');
      const mean = (x0, x1) => { const s = [0, 0, 0]; let n = 0; for (let y = 5; y < 50; y++) for (let x = x0; x < x1; x++) { const q = at(a.img, x, y); for (let k = 0; k < 3; k++) s[k] += q[k]; n++; } return s.map((v2) => v2 / n); };
      t.ok(cols.every((c, j) => mean(j * 30 + 3, j * 30 + 27).every((m, k) => Math.abs(m - c[k]) < 6)), 'each block is one flat colour, its noise gone, at the block’s own colour (± 6)');
      t.eq([a.palette.length, keep.palette.length], [3, 4], 'the palette: the colours kept — three once the speck is taken in, four with it');
      // a mask: an island and a hole smaller than the least area, and a larger hole
      const M = new Uint8Array(100 * 100);
      for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) M[y * 100 + x] = x >= 20 && x < 80 && y >= 20 && y < 80 ? 255 : 0;
      for (let y = 40; y < 43; y++) for (let x = 40; x < 43; x++) M[y * 100 + x] = 0;      // a 3 × 3 hole
      for (let y = 55; y < 70; y++) for (let x = 55; x < 70; x++) M[y * 100 + x] = 0;      // a 15 × 15 hole
      for (let y = 5; y < 8; y++) for (let x = 5; x < 8; x++) M[y * 100 + x] = 255;        // a 3 × 3 island
      const cm = p.clipMask(M, 100, 100, 50, 0);
      t.eq([cm.mask[41 * 100 + 41], cm.mask[6 * 100 + 6], cm.mask[60 * 100 + 60], cm.on], [255, 0, 0, 3600 - 225], 'a mask: the small hole filled, the small island gone, the large hole kept; the pixels on counted');
      // black and white
      const g = { data: new Uint8ClampedArray(64 * 64 * 4), width: 64, height: 64 };
      for (let i = 0; i < 64 * 64; i++) { const v2 = (i % 64) < 32 ? 60 : 200; g.data[i * 4] = g.data[i * 4 + 1] = g.data[i * 4 + 2] = v2 + (i % 7) - 3; g.data[i * 4 + 3] = 255; }
      const bwA = p.bw(g, -1, false), bwI = p.bw(g, -1, true);
      t.ok(bwA.threshold > 63 && bwA.threshold <= 197, `Otsu's threshold falls between the two greys (${bwA.threshold})`);
      t.eq([bwA.img.data[0], bwA.img.data[63 * 4], bwI.img.data[0]], [0, 255, 255], 'dark is ink (black), light is paper (white); invert swaps them');
      const seeThrough = p.bw({ data: new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]), width: 2, height: 1 }, 128, false);
      t.eq([seeThrough.img.data[0], seeThrough.img.data[4]], [255, 0], 'a see-through pixel is on white (paper), an opaque black one ink');
      // ink lines: a dark dot (an eye) inside a light disc, a flat area, the disc's edge
      const L = { data: new Uint8ClampedArray(200 * 200 * 4), width: 200, height: 200 };
      for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
        const i = (y * 200 + x) * 4, inside = (x - 100) ** 2 + (y - 100) ** 2 < 80 ** 2, eye = (x - 80) ** 2 + (y - 90) ** 2 < 6 ** 2;
        L.data[i] = L.data[i + 1] = L.data[i + 2] = eye ? 30 : inside ? 220 : 90; L.data[i + 3] = inside ? 255 : 0;
      }
      const li = p.clipLines(L, 1.5, 0.5, 4);
      const inkAt = (x, y) => li.img.data[(y * 200 + x) * 4] === 0;
      let eyeInk = 0; for (let y = 80; y < 100; y++) for (let x = 70; x < 90; x++) eyeInk += inkAt(x, y);
      let flatInk = 0; for (let y = 120; y < 160; y++) for (let x = 90; x < 130; x++) flatInk += inkAt(x, y);
      let edgeInk = 0; for (let a2 = 0; a2 < 360; a2 += 3) { const r = 79; edgeInk += inkAt(Math.round(100 + r * Math.cos(a2 * Math.PI / 180)), Math.round(100 + r * Math.sin(a2 * Math.PI / 180))); }
      t.ok(eyeInk > 20 && flatInk === 0 && edgeInk === 0, `ink lines: the eye drawn (${eyeInk} px), nothing on a flat area, nothing at the subject's edge (its outline is drawn there)`);
      const speck = p.clipLines(L, 1.5, 0.5, 1000);
      t.eq(speck.on, 0, 'a line smaller than the least area is left out');
      const al = p.clipAlpha({ data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]), width: 2, height: 1 }, { data: new Uint8ClampedArray([0, 0, 0, 10, 0, 0, 0, 200]), width: 2, height: 1 });
      t.eq(Array.from(al.data), [1, 2, 3, 10, 4, 5, 6, 200], 'clipAlpha: the colours kept, the alpha taken from the other picture');
      const pl = p.u2Planes({ data: new Uint8ClampedArray([100, 150, 200, 255]), width: 1, height: 1 }, 2);
      const exp = [100, 150, 200].map((c, k) => (c / 200 - [0.485, 0.456, 0.406][k]) / [0.229, 0.224, 0.225][k]);
      t.ok([0, 4, 8].every((o, k) => Math.abs(pl[o] - exp[k]) < 1e-5), "U²-Net's input planes: each channel over the picture's largest value, less ImageNet's mean, over its deviation (rembg's)");
      t.eq(Array.from(p.u2Mask(new Float32Array([0.2, 0.6, 1.0]))), [0, 128, 255], "U²-Net's output stretched between its least and greatest value");
    }

    // ---------------------------------------------------------------- the clip art's SVG
    {
      const vt = '<svg><path d="M0 0 L10 0 L10 10 Z " fill="#C83C28" transform="translate(5,6)"/><path d="M1 1 L2 2 Z" fill="#102030" transform="translate(0,0)"/></svg>';
      t.eq(pathsOf(vt), [{ d: 'M0 0 L10 0 L10 10 Z', fill: '#c83c28', tx: 5, ty: 6 }, { d: 'M1 1 L2 2 Z', fill: '#102030', tx: 0, ty: 0 }], "pathsOf reads VTracer's paths with their colours and translations");
      t.eq([darker('#c83c28'), darker('#ffffff', 0.5)], ['#6e2116', '#808080'], 'darker: a colour a share of the way to black');
      const parts = { shapes: vt, silhouette: '<svg><path d="M0 0 L20 0 L20 20 Z" fill="#000000" transform="translate(0,0)"/></svg>', lines: '<svg><path d="M3 3 L4 4 Z" fill="#000000" transform="translate(1,1)"/></svg>', width: 100, height: 80 };
      const style = (name, extra = {}) => clipSvg(parts, { style: name, ...STYLES[name], ink: '#123456', ...extra });
      const flat = style('flat'), cartoon = style('cartoon'), sticker = style('sticker'), line = style('lineart'), sil = style('silhouette');
      t.ok(!/stroke=/.test(flat) && !/M3 3/.test(flat), 'flat: colours only — no line, no ink lines');
      t.ok(/M3 3/.test(cartoon) && /fill="#1b1b1b" stroke="#1b1b1b"/.test(cartoon) && !/<path d="M0 0 L10 0 L10 10 Z" transform="translate\(5,6\)" fill="#c83c28" stroke/.test(cartoon), 'cartoon: a black outline round the subject and the ink lines, no line round each colour');
      t.ok(/feDropShadow/.test(sticker) && /fill="#ffffff" stroke="#ffffff"/.test(sticker) && /M3 3/.test(sticker), 'sticker: a white border, a soft shadow and the ink lines');
      t.ok(/fill="#ffffff" stroke="#123456"/.test(line) && !/fill="#c83c28"/.test(line), 'line art: every colour a white shape with an ink line round it — a colouring page');
      t.ok(/fill="#123456"/.test(sil) && !/#c83c28/.test(sil) && !/M3 3/.test(sil), 'silhouette: the shape in the ink colour, nothing else');
      t.ok(/stroke="#6e2116"/.test(style('cartoon', { edges: true, outline: 'shade' })), 'a line round every colour in its darker shade');
      const m = /viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(sticker);
      t.ok(m && +m[1] < 0 && +m[3] > 100 && +m[4] > 80, 'room round the clip art for the border and the shadow (the view box grows)');
      if (rsvg) for (const [name, svg] of [['flat', flat], ['cartoon', cartoon], ['sticker', sticker], ['line art', line], ['silhouette', sil]]) {
        const r = render(svg, 200, 160);
        t.eq([r.width, r.height], [200, 160], `the ${name} SVG is drawn by librsvg`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

/** an RGBA picture as a PNG with its alpha (the CLI reads PNG; ours gets the same pixels) */
function writePngRGBA({ width, height, data }) {
  const { deflateSync, crc32 } = require_zlib();
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1); }
  const chunk = (kind, body) => { const b = Buffer.alloc(12 + body.length); b.writeUInt32BE(body.length, 0); b.write(kind, 4, 'latin1'); body.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length); return b; };
  const head = Buffer.alloc(13); head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
import * as zlib from 'node:zlib';
function require_zlib() { return zlib; }
/** a black-and-white RGBA picture (black = ink) as a binary PBM (P4) */
function pbm({ width, height, data }) {
  const row = Math.ceil(width / 8), body = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4] < 128) body[y * row + (x >> 3)] |= 0x80 >> (x & 7);
  return Buffer.concat([Buffer.from(`P4\n${width} ${height}\n`, 'latin1'), body]);
}
/** the path data of a Potrace SVG, white space made single */
function pathData(svg) {
  return [...svg.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1].replace(/\s+/g, ' ').trim()).join('|');
}
void spawnSync;
