// Copies runtime files of vendored packages from node_modules into public/vendor/ (gitignored),
// so they are served from this site. Runs before `dev` and `build`.
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const out = (...p) => join(root, 'public', 'vendor', ...p);

const copies = [
  // [from (node_modules-relative), to (public/vendor-relative)]
  [['@ffmpeg', 'core', 'dist', 'esm', 'ffmpeg-core.js'], ['ffmpeg', 'ffmpeg-core.js']],
  [['@ffmpeg', 'core', 'dist', 'esm', 'ffmpeg-core.wasm'], ['ffmpeg', 'ffmpeg-core.wasm']],
  [['@mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_internal.js'], ['mediapipe', 'vision_wasm_internal.js']],
  [['@mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_internal.wasm'], ['mediapipe', 'vision_wasm_internal.wasm']],
  [['tesseract.js', 'dist', 'worker.min.js'], ['tesseract', 'worker.min.js']],
  ...['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm'].flatMap((n) => [
    [['tesseract.js-core', `${n}.wasm.js`], ['tesseract', 'core', `${n}.wasm.js`]],
    [['tesseract.js-core', `${n}.wasm`], ['tesseract', 'core', `${n}.wasm`]],
    [['tesseract.js-core', `${n}.js`], ['tesseract', 'core', `${n}.js`]],
  ]),
  [['@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'], ['tesseract', 'lang', 'eng.traineddata.gz']],
  [['@tesseract.js-data', 'hin', '4.0.0_best_int', 'hin.traineddata.gz'], ['tesseract', 'lang', 'hin.traineddata.gz']],
  [['libarchive.js', 'dist', 'worker-bundle.js'], ['libarchive', 'worker-bundle.js']],
  [['libarchive.js', 'dist', 'libarchive.wasm'], ['libarchive', 'libarchive.wasm']],
  [['zxing-wasm', 'dist', 'full', 'zxing_full.wasm'], ['zxing', 'zxing_full.wasm']],
];

rmSync(out(), { recursive: true, force: true });
let n = 0;
for (const [from, to] of copies) {
  const src = nm(...from);
  if (!existsSync(src)) { console.error('vendor: missing', src); process.exitCode = 1; continue; }
  mkdirSync(dirname(out(...to)), { recursive: true });
  cpSync(src, out(...to));
  n++;
}
console.log(`vendor: copied ${n} files to public/vendor/`);
