// MediaPipe Tasks (Google's official C++ → wasm build, Apache-2.0), served from this site: runtime in
// public/vendor/mediapipe (scripts/vendor.mjs), models in public/models/mediapipe (scripts/fetch-assets.mjs).
import type { FaceDetector, FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import type { Img } from '../wasm/imgproc';
import { onLeave } from '../lifecycle';

const at = (p: string) => new URL(p, document.baseURI).href;
let fileset: Promise<any> | null = null;
async function vision() {
  const mp = await import('@mediapipe/tasks-vision');
  fileset ||= mp.FilesetResolver.forVisionTasks(at('vendor/mediapipe'));
  return { mp, fs: await fileset };
}
/** GPU where it works (faster), CPU otherwise — some phones/headless browsers lack WebGL2 for MediaPipe. */
async function create<T>(make: (delegate: 'GPU' | 'CPU') => Promise<T>, prefer: 'GPU' | 'CPU' = 'GPU'): Promise<T> {
  try { return await make(prefer); } catch { return make(prefer === 'GPU' ? 'CPU' : 'GPU'); }
}
/** Registers a release for a task: closing frees the graph and its buffers in the MediaPipe wasm heap. */
function closeOnLeave<T extends { close(): void }>(key: string, get: () => Promise<T> | null, reset: () => void, p: Promise<T>): Promise<T> {
  onLeave(key, () => { const cur = get(); reset(); cur?.then((t) => t.close()).catch(() => {}); });
  return p.catch((e) => { reset(); throw e; });
}
let fd: Promise<FaceDetector> | null = null;
// BlazeFace is tiny: XNNPACK on the CPU is as fast as WebGL and avoids GPU context/ReadPixels stalls.
export const faceDetector = () => (fd ||= closeOnLeave('mp-face-detector', () => fd, () => (fd = null), vision().then(({ mp, fs }) => create((delegate) => mp.FaceDetector.createFromOptions(fs, {
  baseOptions: { modelAssetPath: at('models/mediapipe/blaze_face_short_range.tflite'), delegate }, runningMode: 'IMAGE', minDetectionConfidence: 0.5, minSuppressionThreshold: 0.3,
}), 'CPU'))));
let fl: Promise<FaceLandmarker> | null = null;
export const faceLandmarker = () => (fl ||= closeOnLeave('mp-face-landmarker', () => fl, () => (fl = null), vision().then(({ mp, fs }) => create((delegate) => mp.FaceLandmarker.createFromOptions(fs, {
  baseOptions: { modelAssetPath: at('models/mediapipe/face_landmarker.task'), delegate }, runningMode: 'IMAGE', numFaces: 4,
})))));
let seg: Promise<ImageSegmenter> | null = null;
export const selfieSegmenter = () => (seg ||= closeOnLeave('mp-selfie-segmenter', () => seg, () => (seg = null), vision().then(({ mp, fs }) => create((delegate) => mp.ImageSegmenter.createFromOptions(fs, {
  baseOptions: { modelAssetPath: at('models/mediapipe/selfie_multiclass_256x256.tflite'), delegate }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
})))));

export const toImageData = (img: Img) => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
