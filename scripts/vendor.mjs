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
  // OCR languages (owner: English, French, Spanish, German — Tesseract 4 "best_int" LSTM models)
  ...['eng', 'fra', 'spa', 'deu'].map((l) => [['@tesseract.js-data', l, '4.0.0_best_int', `${l}.traineddata.gz`], ['tesseract', 'lang', `${l}.traineddata.gz`]]),
  // Noto Sans (OFL; Latin, Greek, Cyrillic, Devanagari, ₹) TTFs for documents made by MuPDF (invoice, rent receipt,
  // resume): MuPDF's FreeType reads TTF, not WOFF
  ...[['400Regular', 'NotoSans_400Regular'], ['700Bold', 'NotoSans_700Bold'], ['400Regular_Italic', 'NotoSans_400Regular_Italic']]
    .map(([dir, f]) => [['@expo-google-fonts', 'noto-sans', dir, `${f}.ttf`], ['fonts', `${f}.ttf`]]),
  // Literata (OFL) TTFs: the EPUB Reader's text font, laid out by MuPDF in its worker (MuPDF's FreeType reads no WOFF, so the
  // WOFF files of @fontsource/literata the Photo Dictionary uses cannot serve)
  ...['400Regular', '400Regular_Italic', '700Bold', '700Bold_Italic'].map((s) => [['@expo-google-fonts', 'literata', s, `Literata_${s}.ttf`], ['fonts', `Literata_${s}.ttf`]]),
  // TF.js WebAssembly backend (XNNPACK, C++ → wasm): the CPU path for the Cartoonizer's style transfer when WebGL is missing
  ...['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm'].map((f) => [['@tensorflow', 'tfjs-backend-wasm', 'dist', f], ['tfjs', f]]),
  // the Spell Checker's dictionaries: SCOWL's Hunspell dictionaries 2020.12.07 (en_US; en_GB-ise — also for Indian English), as
  // wooorm's dictionary-en / dictionary-en-gb package them; read by our Hunspell 1.7.6 (wasm/hunspell)
  ...[['dictionary-en', 'en-US'], ['dictionary-en-gb', 'en-GB']].flatMap(([pkg, l]) => ['aff', 'dic'].map((x) => [[pkg, `index.${x}`], ['spell', `${l}.${x}`]])),
  // ExifTool 13.42 on zeroperl (Perl 5 compiled to WebAssembly, ExifTool's library inside): the EXIF / Photo Info tab
  [['@6over3', 'zeroperl-ts', 'dist', 'esm', 'zeroperl.wasm'], ['exiftool', 'zeroperl.wasm']],
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
