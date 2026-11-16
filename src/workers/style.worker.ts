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
      const own: Img = m.ownStyle, content: Img = m.img;
      const out = tf.tidy(() => {
        const target = tf.tensor4d(m.vector as Float32Array, [1, 1, 1, 100]);
        const mine = predictor.predict(toInput(own)) as tf.Tensor;
        const v = tf.add(tf.mul(mine, 1 - m.strength), tf.mul(target, m.strength));
        const y = tf.squeeze(transformer.predict([toInput(content), v]) as tf.Tensor4D, [0]) as tf.Tensor3D; // [H', W', 3] in 0..1
        const rgb = tf.clipByValue(tf.round(tf.mul(y, 255)), 0, 255);
        return tf.cast(tf.concat([rgb, tf.fill([y.shape[0], y.shape[1], 1], 255)], 2), 'int32') as tf.Tensor3D; // RGBA
      });
      const [H, W] = out.shape;
      const data = new Uint8ClampedArray((await out.data()) as Int32Array); out.dispose(); // native int32 → u8 copy
      return post(m.id, { img: { data, width: W, height: H }, ms: performance.now() - t0 }, [data.buffer]);
    }
  } catch (err: any) {
    post(m.id, { error: err?.message || String(err) });
  }
};
const post = (id: number, data: any, transfer: Transferable[] = []) => (self as any).postMessage({ id, ...data }, transfer);
