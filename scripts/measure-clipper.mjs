// measure-clipper.mjs DIR [--only TEXT] [--record OUT] — how well the Newspaper Clipper clips each story of every photo of
// DIR (made by scripts/make-newspaper-photos.py: <name>.jpg + index.json with every story's headline and text). The code
// is the tab's own (src/lib/clipper.ts readClip, storyOf, readingOrder, clipText through Vite's loader) on imgproc.wasm,
// textcore.wasm, the Doc Scanner's network on ONNX Runtime Web and tesseract.js with the site's English model, in Node.
// For each story the reader's tap on its headline is played (the headline block that matches the story's headline best);
// the clipping's words are held to the story's (its headline, its picture's caption, its text): read right (the longest
// common subsequence) and taken in from other stories. A story is clipped whole when 95 % of its words are read right and at most 3 % of the clipping's words are not
// its own. Prints one line per photo and the totals.
// --record OUT: each photo's reading (the page's size, Tesseract's words and lines) as OUT/<name>.reading.json — the unit
// suite's fixtures (tests/fixtures/news/).
// Needs python3 with Pillow (to decode the JPEGs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createWorker, OEM } = require('tesseract.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dir = args[0], only = opt('--only', ''), record = opt('--record', ''), draw = opt('--draw', '');

export const wordsOf = (s) => (s.normalize('NFC').replace(/[’‘]/g, "'").toLowerCase().match(/[a-z0-9']+/g) || []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
export function lcs(a, b) {
  const m = b.length; let prev = new Uint16Array(m + 1), cur = new Uint16Array(m + 1);
  for (let i = 1; i <= a.length; i++) { cur[0] = 0; for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); [prev, cur] = [cur, prev]; }
  return prev[m];
}
/** A story's words as the clipping holds them: its headline, the caption under its picture (where it has one), its text. */
export const storyWords = (s) => wordsOf([s.headline, ...s.blocks.filter((b) => b.kind === 'caption').map((b) => b.words.join(' ')), s.text].join(' '));
/** The story a reader wants when tapping a headline: the headline block that matches its headline best (-1: none). */
export function headlineFor(blocks, headline) {
  const hw = wordsOf(headline); let hb = -1, best = 0;
  for (const b of blocks) if (b.headline) { const k = lcs(hw, wordsOf(b.text)); if (k > best) { best = k; hb = b.id; } }
  return best >= 0.5 * hw.length ? hb : -1;
}

function decodeJpeg(file) {
  const r = spawnSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGBA"); sys.stdout.buffer.write(im.size[0].to_bytes(4, "little") + im.size[1].to_bytes(4, "little") + im.tobytes())', file], { maxBuffer: 1 << 30 });
  if (r.status) throw new Error(String(r.stderr));
  const b = r.stdout, width = b.readUInt32LE(0), height = b.readUInt32LE(4);
  return { width, height, data: new Uint8ClampedArray(b.buffer, b.byteOffset + 8, width * height * 4) };
}
function ppm(img) {
  const n = img.width * img.height, out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { out[i * 3] = img.data[i * 4]; out[i * 3 + 1] = img.data[i * 4 + 1]; out[i * 3 + 2] = img.data[i * 4 + 2]; }
  return Buffer.concat([Buffer.from(`P6\n${img.width} ${img.height}\n255\n`), out]);
}
async function wasi(file) {
  const mod = await WebAssembly.compile(readFileSync(join(root, file)));
  let memory; const w = {};
  for (const i of WebAssembly.Module.imports(mod)) if (i.module === 'wasi_snapshot_preview1') w[i.name] = () => 52;
  w.fd_prestat_get = () => 8; w.proc_exit = (c) => { throw new Error('exit ' + c); };
  w.random_get = (p, n) => { crypto.getRandomValues(new Uint8Array(memory.buffer, p, n)); return 0; };
  w.clock_time_get = (_i, _p, out) => { new DataView(memory.buffer).setBigUint64(out, BigInt(Date.now()) * 1000000n, true); return 0; };
  w.environ_sizes_get = (a, b) => { const dv = new DataView(memory.buffer); dv.setUint32(a, 0, true); dv.setUint32(b, 0, true); return 0; };
  w.environ_get = () => 0;
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: w });
  memory = inst.exports.memory; inst.exports._initialize?.();
  return inst.exports;
}

async function main() {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { bindImgproc } = await vite.ssrLoadModule('/src/wasm/imgproc.ts');
  const { bindTextcore } = await vite.ssrLoadModule('/src/wasm/textcore.ts');
  const pf = await vite.ssrLoadModule('/src/lib/pagefind.ts');
  const { readingOf } = await vite.ssrLoadModule('/src/lib/ocr.ts');
  const C = await vite.ssrLoadModule('/src/lib/clipper.ts');
  const ip = bindImgproc(await wasi('src/wasm/bin/imgproc.wasm')), tc = bindTextcore(await wasi('src/wasm/bin/textcore.wasm'));
  const ort = await import(join(root, 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs'));
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(join(root, 'node_modules/scanic-ml/dist/doccornernet_lean.ort'))), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const docCorners = async (im) => { const s = ip.resizeArea(im, pf.SIZE, pf.SIZE); return pf.readOutput(await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', pf.modelInput(s.data), [1, pf.SIZE, pf.SIZE, 3]) })); };
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cacheMethod: 'none' });
  await worker.setParameters({ debug_file: '/dev/null' });
  const PSM = { page: '3', block: '6' };
  const engines = { ops: { ...ip, docCorners }, read: async (img, _lang, _p, layout) => readingOf((await worker.recognize(ppm(img), { tessedit_pageseg_mode: PSM[layout] }, { text: true, blocks: true })).data) };
  const xycut = (b, gx, gy) => tc.xycut(b, gx, gy).order;
  if (record) mkdirSync(record, { recursive: true });
  if (draw) mkdirSync(draw, { recursive: true });
  const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).filter((e) => !only || e.name.includes(only));
  const tot = { stories: 0, whole: 0, right: 0, words: 0, extra: 0, got: 0, nohead: 0, pr: 0, pw: 0, again: 0 };
  for (const ent of idx) {
    let again = false;
    const t0 = Date.now(), c = await C.readClip(decodeJpeg(join(dir, ent.name + '.jpg')), engines, { onAgain: () => { again = true; } });
    if (again) tot.again++;
    if (record) writeFileSync(join(record, ent.name + '.reading.json'), JSON.stringify({ width: c.img.width, height: c.img.height, confidence: c.r.confidence, words: c.r.words, lines: c.r.lines, pictures: c.blocks.filter((b) => b.picture).map((b) => b.box) }));
    // the page's words read at all (against every story's words)
    const want = new Map(); for (const s of ent.stories) for (const x of wordsOf(s.headline + ' ' + s.text)) want.set(x, (want.get(x) || 0) + 1);
    const have = new Map(); for (const x of wordsOf(c.r.text || c.r.words.map((w) => w.text).join(' '))) have.set(x, (have.get(x) || 0) + 1);
    let tw = 0, hit = 0; for (const [k, v] of want) { tw += v; hit += Math.min(v, have.get(k) || 0); }
    tot.pr += hit; tot.pw += tw;
    const out = [];
    for (const [si, s] of ent.stories.entries()) {
      tot.stories++;
      const hb = headlineFor(c.blocks, s.headline);
      if (hb < 0) { tot.nohead++; out.push(`${si}:no headline`); continue; }
      const chosen = C.storyOf(c.blocks, hb), order = C.readingOrder(c.blocks, chosen, xycut);
      const text = C.clipText(order.map((i) => c.blocks[i]));
      const truth = storyWords(s), got = wordsOf(text), k = lcs(truth, got);
      const mine = new Set(truth), extra = got.filter((x) => !mine.has(x)).length;
      tot.right += k; tot.words += truth.length; tot.extra += extra; tot.got += got.length;
      const whole = k >= 0.95 * truth.length && extra <= 0.03 * got.length;
      if (whole) tot.whole++;
      out.push(`${si}:${(100 * k / truth.length).toFixed(0)}%${extra > 0.03 * got.length ? `+${extra}` : ''}${draw ? `[${chosen.join(',')}]` : ''}`);
    }
    // --draw OUT: the page as read (PPM) and its blocks with the stories chosen (JSON) — to look at with any viewer
    if (draw) {
      writeFileSync(join(draw, ent.name + '.page.ppm'), ppm(c.img));
      writeFileSync(join(draw, ent.name + '.blocks.json'), JSON.stringify({ blocks: c.blocks.map((b) => ({ id: b.id, box: b.box, headline: b.headline, picture: !!b.picture, text: b.text.slice(0, 60) })), stories: out }));
    }
    const heads = c.blocks.filter((b) => b.headline).length, pics = c.blocks.filter((b) => b.picture).length;
    console.log(`${ent.name}: ${c.found ? 'page' : 'NO PAGE'}${again ? ', read again in B&W' : ''}, ${(100 * hit / tw).toFixed(0)} % of the words read, confidence ${c.r.confidence.toFixed(0)}, ${c.blocks.length} blocks (${heads} headlines, ${pics} pictures), ${((Date.now() - t0) / 1000).toFixed(0)} s | ${out.join(' ')}`);
  }
  console.log(`ALL ${idx.length} photos, ${tot.stories} stories: clipped whole ${tot.whole} (${(100 * tot.whole / tot.stories).toFixed(0)} %), story words read right ${(100 * tot.right / tot.words).toFixed(1)} %, words of other stories ${(100 * tot.extra / Math.max(1, tot.got)).toFixed(1)} %, headline not found ${tot.nohead}, page words read ${(100 * tot.pr / tot.pw).toFixed(1)} %, read again in B&W ${tot.again}`);
  await worker.terminate(); await vite.close();
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
