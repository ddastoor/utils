// The Cartoonizer's anime looks: src/lib/anime.ts (the size a photo is drawn at, the network's input and output) held to known
// answers, and each look's graph run by ONNX Runtime Web in Node through it on a 100 × 66 crop of the coffee photo (no multiple of
// 8: the padding is tested) — the pixels as native ONNX Runtime makes them with AnimeGAN's and bryandlee's own steps
// (tests/fixtures/anime/<look>.png, python3 scripts/make-anime-reference.py), within a step of rounding.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPng } from '../lib/png.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const FX = (n) => readPng(readFileSync(new URL(`../fixtures/anime/${n}`, import.meta.url)));

export default async (t, { load, wasm }) => {
  const A = await load('/src/lib/anime.ts');
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const ip = bindImgproc(await wasm('imgproc')); // the conversions are its C (p_anime_in, p_anime_out)
  const f32in = (v) => Math.fround(Math.fround(v / 127.5) - 1); // single precision, as numpy's float32 arithmetic

  // ---------------------------------------------------------------- the looks and their sizes
  t.eq(A.ANIME_STYLES.map((s) => s.id), ['hayao', 'shinkai', 'paprika', 'face'], 'four looks: three for scenes, one for a face');
  const hayao = A.animeStyle('hayao'), face = A.animeStyle('face');
  t.eq([A.animeSide(hayao, 4000, 3000, 1024), A.animeSide(hayao, 800, 600, 1024), A.animeSide(face, 4000, 3000, 1536), A.animeSide(face, 300, 200, 1536)], [1024, 800, 512, 300],
    'a scene look is drawn at the size chosen, never above the photo’s own; the face portrait at 512 at most');
  t.eq(A.animeStyle('nonsense').id, 'hayao', 'an unknown look is the first one');

  // ---------------------------------------------------------------- the input: x / 127.5 − 1, the edges repeated to the size the graph wants
  {
    const w = 3, h = 2, px = new Uint8ClampedArray([0, 127, 255, 255, 10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255, 130, 140, 150, 255]);
    const a = A.animeInput(ip, { data: px, width: w, height: h }, 'nhwc');
    t.eq(a.dims, [1, 8, 8, 3], 'NHWC, padded to a multiple of 8 each way');
    const at = (x, y, c) => a.data[(y * 8 + x) * 3 + c];
    t.near(at(0, 0, 0), -1, 1e-7, 'black → −1'); t.near(at(0, 0, 2), 1, 1e-7, 'white → 1'); t.near(at(0, 0, 1), 127 / 127.5 - 1, 1e-7, '127 → 127 / 127.5 − 1');
    t.ok(at(7, 0, 0) === at(2, 0, 0) && at(0, 7, 0) === at(0, 1, 0) && at(7, 7, 2) === at(2, 1, 2), 'the last column and row repeated to the edge');
    const b = A.animeInput(ip, { data: px, width: w, height: h }, 'nchw512');
    t.eq(b.dims, [1, 3, 512, 512], 'the face portrait: NCHW, 512 × 512');
    const P = 512 * 512;
    t.ok(b.data[0] === -1 && b.data[P + 0] === f32in(127) && b.data[2 * P + 0] === 1 && b.data[2 * P + 511 * 512 + 511] === f32in(150), 'its planes R, G, B; the last pixel repeated to the corner');
    t.throws(() => A.animeInput(ip, { data: new Uint8ClampedArray(600 * 4), width: 600, height: 1 }, 'nchw512'), 'a picture larger than 512 is refused for the face portrait (the tab makes it 512 first)');
  }
  // ---------------------------------------------------------------- the output: (y + 1) × 127.5, held to 0 … 255 and truncated, the padding cut off
  {
    const out = new Float32Array(8 * 8 * 3).fill(0.5);
    out[0] = -1.2; out[1] = 1.3; out[2] = 0.999;
    const px = A.animeOutput(ip, out, [1, 8, 8, 3], 3, 2, 'nhwc').data;
    t.eq(px.length, 3 * 2 * 4, 'the picture’s own size, the padding cut off');
    t.eq([...px.slice(0, 8)], [0, 255, 254, 255, 191, 191, 191, 255], 'held to 0 … 255, truncated (254.87 → 254, 191.25 → 191), opaque');
    const planes = new Float32Array(3 * 512 * 512); planes[0] = 0; planes[512 * 512] = -1; planes[2 * 512 * 512] = 1;
    t.eq([...A.animeOutput(ip, planes, [1, 3, 512, 512], 2, 1, 'nchw512').data.slice(0, 4)], [127, 0, 255, 255], 'the face portrait’s planes back to RGBA');
  }

  // ---------------------------------------------------------------- the C conversions, every value of a random picture against single precision in JS
  {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    const w = 13, h = 7, px = Uint8ClampedArray.from({ length: w * h * 4 }, () => Math.floor(rnd() * 256));
    let bad = 0;
    for (const layout of ['nhwc', 'nchw512']) {
      const x = A.animeInput(ip, { data: px, width: w, height: h }, layout), [W, H] = layout === 'nhwc' ? [x.dims[2], x.dims[1]] : [x.dims[3], x.dims[2]];
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) for (let c = 0; c < 3; c++) {
        const want = f32in(px[(Math.min(y, h - 1) * w + Math.min(xx, w - 1)) * 4 + c]);
        const got = layout === 'nhwc' ? x.data[(y * W + xx) * 3 + c] : x.data[c * W * H + y * W + xx];
        if (got !== want) bad++;
      }
      const out = Float32Array.from({ length: W * H * 3 }, () => rnd() * 2.4 - 1.2), back = A.animeOutput(ip, out, x.dims, w, h, layout).data;
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) for (let c = 0; c < 4; c++) {
        const v = c === 3 ? 255 : Math.fround(Math.fround((layout === 'nhwc' ? out[(y * W + xx) * 3 + c] : out[c * W * H + y * W + xx]) + 1) * 127.5);
        if (back[(y * w + xx) * 4 + c] !== (c === 3 ? 255 : v <= 0 ? 0 : v >= 255 ? 255 : Math.trunc(v))) bad++;
      }
    }
    t.eq(bad, 0, 'imgproc’s conversions (p_anime_in, p_anime_out) give every value of a random 13 × 7 picture as single precision does, both layouts');
  }

  // ---------------------------------------------------------------- each look on ONNX Runtime Web, against native ONNX Runtime
  const ort = await import(pathToFileURL(root + 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs').href);
  ort.env.wasm.numThreads = 1;
  const input = FX('input.png');
  t.eq([input.width, input.height], [100, 66], 'the reference picture: 100 × 66 (no multiple of 8)');
  for (const style of A.ANIME_STYLES) {
    const file = root + A.ANIME_DIR.replace(/^models/, 'public/models') + style.file;
    if (!existsSync(file)) { t.ok(false, `${file} is missing — run node scripts/fetch-assets.mjs`); continue; }
    const bytes = readFileSync(file);
    t.eq(bytes.length, style.bytes, `${style.name}: the graph’s size is the one the tab counts its download by`);
    const sess = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const x = A.animeInput(ip, input, style.layout);
    const o = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', x.data, x.dims) });
    const y = o[sess.outputNames[0]];
    const px = A.animeOutput(ip, y.data, y.dims, 100, 66, style.layout).data, ref = FX(`${style.id}.png`);
    let max = 0, sum = 0, off = 0, moved = 0;
    for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) {
      const d = Math.abs(px[i + c] - ref.data[i + c]); max = Math.max(max, d); sum += d; off += d > 1;
      moved += Math.abs(px[i + c] - input.data[i + c]);
    }
    const n = 100 * 66 * 3;
    // the face portrait's export normalises each layer over all its values at once (a group of 8.4 million in a 512 × 512 picture),
    // and ONNX Runtime Web's InstanceNormalization adds them up less exactly than native ONNX Runtime: its first one is 0.4 % off
    // (its input agrees to 1.7e-5), a picture a few steps of 255 off at most — native ONNX Runtime agrees with itself to 1 (all
    // optimisations on or off, its input moved by 1e-5); the scene looks' layers are smaller here and agree to a step of rounding
    const [maxOk, meanOk, offOk] = style.layout === 'nchw512' ? [8, 1.0, 0.15] : [2, 0.25, 0.01];
    t.ok(max <= maxOk && sum / n < meanOk && off / n < offOk, `${style.name}: ONNX Runtime Web gives native ONNX Runtime’s pixels (largest difference ${max}, mean ${(sum / n).toFixed(3)}, ${(100 * off / n).toFixed(1)} % of the values off by more than 1)`);
    t.ok(moved / n > 6, `${style.name}: the look changes the picture (mean difference from the photo ${(moved / n).toFixed(1)} of 255)`);
    await sess.release();
  }
};
