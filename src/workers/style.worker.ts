// Neural style transfer worker: Magenta "arbitrary image stylization" (Ghiasi et al. 2017, Apache-2.0) on TensorFlow.js.
// Backends in order: WebGL (GPU, via OffscreenCanvas) → WebAssembly (XNNPACK, C++ → wasm, SIMD) → plain JS CPU.
// Models are converted from Magenta's legacy TF.js checkpoints by scripts/convert-magenta.mjs and served from this site.
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';

type Img = { data: Uint8ClampedArray; width: number; height: number };
let models: Promise<{ predictor: GraphModel; transformer: GraphModel; backend: string }> | null = null;

/** True when WebGL is missing or runs in software (SwiftShader, llvmpipe): WebAssembly is then ~15× faster. */
function softwareGL(): boolean {
  try {
    const c = new OffscreenCanvas(1, 1), gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
  } catch { return true; }
}

async function init(base: string, prefer?: string) {
  setWasmPaths(new URL('vendor/tfjs/', base).href);
  let backend = '';
  for (const b of prefer ? [prefer] : [...(softwareGL() ? [] : ['webgl']), 'wasm', 'cpu']) {
    try {
      if (!(await tf.setBackend(b))) continue;
      await tf.ready();
      // im2col turns the last 9×9 convolution into one texture of ~170 M values at 512 px — over every GPU's limit;
      // the direct convolution shader needs no such buffer
      if (b === 'webgl') tf.env().set('WEBGL_CONV_IM2COL', false);
      // a real op proves the backend works (a WebGL context can be created and still fail on first use)
      tf.tidy(() => tf.add(tf.ones([2, 2]), 1).dataSync());
      backend = b; break;
    } catch { /* try the next one */ }
  }
  if (!backend) throw new Error('No TensorFlow.js backend works in this browser.');
  const [predictor, transformer] = await Promise.all(['predictor', 'transformer'].map((m) => loadGraphModel(new URL(`models/magenta/${m}/model.json`, base).href)));
  return { predictor, transformer, backend };
}

/** [H, W, 3] in 0..1 → RGBA int32 */
const toRgba = (y: tf.Tensor3D) => tf.tidy(() => tf.cast(tf.concat([tf.clipByValue(tf.round(tf.mul(y, 255)), 0, 255), tf.fill([y.shape[0], y.shape[1], 1], 255)], 2), 'int32') as tf.Tensor3D);

/** The painting at the photo's size in tiles (to-do #16: fine brush strokes at sizes one pass cannot hold in memory).
 *  The transformer normalises every layer by its features' mean and variance over the whole picture (conditional
 *  instance norm): a tile normalised by its own would differ in colour and contrast from its neighbours (seams). So the
 *  whole picture is run once at `stats`' smaller size for those 26 statistics, and every tile is run with them fed to
 *  the graph in place of its own (TF.js executes from fed intermediate nodes); tiles overlap by `O` px and are blended
 *  linearly. Measured (docs/WASM-AUDIT.md, tab 115): tiles with their own statistics left visible bands; with the
 *  statistics of the whole picture at the tiles' own scale the tiles give the one-pass painting back (0.9 of 255 on a
 *  photo); at a smaller scale they are seamless and keep the style, the brush strokes as fine as the tiles' scale. */
async function tiled(transformer: GraphModel, content: Img, stats: Img, v: tf.Tensor4D, T: number, O: number, progress: (f: number) => void): Promise<tf.Tensor3D> {
  const names = Object.keys((transformer as any).executor.graph.nodes).filter((k) => /StyleNorm\/moments\/(mean|variance)$/.test(k));
  const OUT = transformer.outputs[0].name, IN = transformer.inputs.map((i) => i.name); // [image, style vector]
  const fed: Record<string, tf.Tensor> = {};
  const got = transformer.execute({ [IN[0]]: toInput(stats), [IN[1]]: v }, names) as tf.Tensor[];
  names.forEach((k, i) => (fed[k] = got[i]));
  const W = content.width, H = content.height, acc = new Float32Array(W * H * 3), wsum = new Float32Array(W * H);
  const starts = (L: number) => { const s: number[] = []; if (L <= T) return [0]; for (let p = 0; ; p += T - O) { if (p + T >= L) { s.push(L - T); break; } s.push(p); } return s; };
  const ys = starts(H), xs = starts(W), n = ys.length * xs.length;
  const x = toInput(content);
  let k = 0;
  for (const y0 of ys) for (const x0 of xs) {
    const th = Math.min(T, H), tw = Math.min(T, W);
    const y = tf.tidy(() => {
      const t = transformer.execute({ [IN[0]]: tf.slice(x, [0, y0, x0, 0], [1, th, tw, 3]), [IN[1]]: v, ...fed }, OUT) as tf.Tensor4D;
      return tf.slice(t, [0, 0, 0, 0], [1, th, tw, 3]); // the network's strides can add a few pixels
    });
    const d = (await y.data()) as Float32Array; y.dispose();
    // weights: 1 inside, falling linearly to 0 across the overlap on every side that has a neighbour
    for (let j = 0; j < th; j++) {
      const fy = (y0 > 0 ? Math.min(1, (j + 0.5) / O) : 1) * (y0 + th < H ? Math.min(1, (th - j - 0.5) / O) : 1);
      for (let i = 0; i < tw; i++) {
        const w = fy * (x0 > 0 ? Math.min(1, (i + 0.5) / O) : 1) * (x0 + tw < W ? Math.min(1, (tw - i - 0.5) / O) : 1), q = (y0 + j) * W + x0 + i, s = (j * tw + i) * 3;
        acc[q * 3] += d[s] * w; acc[q * 3 + 1] += d[s + 1] * w; acc[q * 3 + 2] += d[s + 2] * w; wsum[q] += w;
      }
    }
    progress(++k / n);
  }
  x.dispose(); for (const t of Object.values(fed)) t.dispose();
  for (let q = 0; q < W * H; q++) { const w = wsum[q] || 1; acc[q * 3] /= w; acc[q * 3 + 1] /= w; acc[q * 3 + 2] /= w; }
  return tf.tidy(() => toRgba(tf.tensor3d(acc, [H, W, 3])));
}

const toInput = (img: Img) => tf.tidy(() => tf.expandDims(tf.div(tf.cast(tf.slice(tf.tensor3d(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length), [img.height, img.width, 4], 'int32'), [0, 0, 0], [-1, -1, 3]), 'float32'), 255), 0));

self.onmessage = async (e: MessageEvent<any>) => {
  const m = e.data;
  try {
    if (m.op === 'init') {
      models ||= init(m.base, m.prefer);
      const r = await models;
      return post(m.id, { backend: r.backend });
    }
    const { predictor, transformer } = await models!;
    if (m.op === 'vector') {
      // style bottleneck: a 100-number description of the painting's style
      const v = tf.tidy(() => predictor.predict(toInput(m.img)) as tf.Tensor);
      const out = (await v.data()) as Float32Array; v.dispose();
      return post(m.id, { vector: out }, [out.buffer]);
    }
    if (m.op === 'stylize') {
      // strength = blend between the photo's own style and the chosen style (Magenta's "style interpolation")
      const t0 = performance.now();
      const own: Img = m.ownStyle, content: Img = m.img, stats: Img | undefined = m.stats;
      const v = tf.tidy(() => {
        const target = tf.tensor4d(m.vector as Float32Array, [1, 1, 1, 100]);
        const mine = predictor.predict(toInput(own)) as tf.Tensor;
        return tf.add(tf.mul(mine, 1 - m.strength), tf.mul(target, m.strength)) as tf.Tensor4D;
      });
      const out = stats ? await tiled(transformer, content, stats, v, m.tile ?? 512, m.overlap ?? 96, (f) => post(m.id, { progress: f }))
        : tf.tidy(() => toRgba(tf.squeeze(transformer.predict([toInput(content), v]) as tf.Tensor4D, [0]) as tf.Tensor3D));
      v.dispose();
      const [H, W] = out.shape;
      const data = new Uint8ClampedArray((await out.data()) as Int32Array); out.dispose(); // native int32 → u8 copy
      return post(m.id, { img: { data, width: W, height: H }, ms: performance.now() - t0 }, [data.buffer]);
    }
  } catch (err: any) {
    post(m.id, { error: err?.message || String(err) });
  }
};
const post = (id: number, data: any, transfer: Transferable[] = []) => (self as any).postMessage({ id, ...data }, transfer);
