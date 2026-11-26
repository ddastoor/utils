// measure-ocr.mjs DIR [--prep a,b,…] [--psm N] [--only TEXT] [--param name=value,…] [--tilt DEG] [--without op,…] — how many of a photo's words the OCR reads right, for
// every photo of DIR (made by scripts/make-kindle-photos.py: <name>.jpg + <name>.txt). The engine is the app's own:
// tesseract.js with the English model the site serves (4.0.0_best_int), in Node; the clean-up steps are imgproc.wasm's,
// as the tab runs them (src/wasm/imgproc.ts through Vite's loader). Prints one line per photo and the means: the words
// read right (the longest common subsequence of the two word lists, over the words of the page), the uncommon words
// found (those a reader looks up) and how clean the reading is (the words read that are right).
// --tilt DEG: every photo turned by DEG degrees first (to the right; negative: to the left) on a desk-coloured canvas that
// holds every corner, with a camera's noise — a phone held at an angle (owner, 21 Nov 2026: "when I click it at different
// angles"); 90, 180, 270: turned a quarter, a half, three quarters (the phone held sideways).
// Needs python3 with Pillow (to decode the JPEGs).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writePng } from '../tests/lib/png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createWorker, OEM } = require('tesseract.js');

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const preps = opt('--prep', 'app').split(',');
const psm = opt('--psm', '3');
const only = opt('--only', '');
const tilt = parseFloat(opt('--tilt', '0')) || 0;
let readSmall; // a quick reading of a picture (the tabs' "glance"), set in main(): uprightByReading's reader
let found = 0; // photos whose page was found (the page… variants)
let byNet = 0; // … by the Doc Scanner's network (the net… variants)
let other = 0; // read again laid out the other way, and that reading kept (read…)
let secondTried = 0, secondKept = 0; // soft photos read by PaddleOCR too, and its reading kept (read… with --paddle)

/** Words as a reader counts them: letters, digits and the apostrophe; case and punctuation ignored. */
export const wordsOf = (s) => (s.normalize('NFC').replace(/[’‘]/g, "'").toLowerCase().match(/[a-z0-9']+/g) || []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);

/** The character error rate: the edit distance between the page's words and the words read (each list joined by single
 *  spaces), over the page's characters. */
export function cer(truth, got) {
  const a = truth.join(' '), b = got.join(' ');
  if (!a.length) return b.length ? 1 : 0;
  let prev = new Uint32Array(b.length + 1), cur = new Uint32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[b.length] / a.length;
}
/** Lines that begin with a lone mark where a bullet stood (to-do #18: "a bullet read as 'e', '©', '«', '*' or 'o'"):
 *  the first token of a line one character of what bullets are read as, or two dashes. */
export const BULLETLIKE = /^(?:[eoOcC©®«»*•◦▪●○■□☐☑✓✔vV>¢°·~=+\-–—]|[-–—]{2}|\(?[eo©]\)?|[eo][.,])$/;
export const strays = (text) => text.split('\n').filter((l) => { const t = l.trim().split(/\s+/); return t.length > 1 && BULLETLIKE.test(t[0]); }).length;

/** The longest common subsequence of two word lists: the words read right, in order. */
export function lcs(a, b) {
  const m = b.length; let prev = new Uint16Array(m + 1), cur = new Uint16Array(m + 1);
  for (let i = 1; i <= a.length; i++) { cur[0] = 0; for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); [prev, cur] = [cur, prev]; }
  return prev[m];
}

const RARE = new Set(['escarpment', 'cartographer', 'taciturn', 'encyclopaedic', 'vellum', 'garrulous', 'lugubrious', 'whittling', 'heron', 'meandering', 'egregiously', 'sheaf',
  'formidable', 'imperious', 'parsimonious', 'ledger', 'crenellated', 'topiary', 'silted', 'exasperation', 'vicar', 'ingenuous', 'seminary', 'fete', 'glacial', 'unpardonable', 'solecism',
  'solder', 'oscilloscope', 'tremulous', 'sardonic', 'recalcitrant', 'intermittent', 'obsequious', 'punctuality',
  'archipelago', 'pewter', 'phlegmatic', 'reefs', 'raucous', 'insatiable', 'emboldened', 'hibernation', 'cavort', 'curmudgeonly']);

/** A JPEG as RGBA pixels (Pillow). */
function decodeJpeg(file) {
  const r = spawnSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGBA"); sys.stdout.buffer.write(im.size[0].to_bytes(4, "little") + im.size[1].to_bytes(4, "little") + im.tobytes())', file], { maxBuffer: 1 << 30 });
  if (r.status) throw new Error(String(r.stderr));
  const b = r.stdout, width = b.readUInt32LE(0), height = b.readUInt32LE(4);
  return { width, height, data: new Uint8ClampedArray(b.buffer, b.byteOffset + 8, width * height * 4) };
}
/** RGBA → a binary PPM (Leptonica, inside the engine, reads it as it is; lossless like the PNG of the browser). */
function ppm(img) {
  const n = img.width * img.height, out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { out[i * 3] = img.data[i * 4]; out[i * 3 + 1] = img.data[i * 4 + 1]; out[i * 3 + 2] = img.data[i * 4 + 2]; }
  return Buffer.concat([Buffer.from(`P6\n${img.width} ${img.height}\n255\n`), out]);
}

async function imgprocNode() {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { bindImgproc } = await vite.ssrLoadModule('/src/wasm/imgproc.ts');
  const { straighten, pageSize } = await vite.ssrLoadModule('/src/lib/pagecrop.ts');
  const pf = await vite.ssrLoadModule('/src/lib/pagefind.ts');
  const { uprightByReading } = await vite.ssrLoadModule('/src/lib/upright.ts');
  const { readPage } = await vite.ssrLoadModule('/src/lib/readpage.ts');
  const { readingOf } = await vite.ssrLoadModule('/src/lib/ocr.ts');
  const { listText } = await vite.ssrLoadModule('/src/lib/listtext.ts');
  // OCR_IMGPROC=FILE: another build of imgproc.wasm (to measure a change of it against the one before)
  const mod = await WebAssembly.compile(readFileSync(process.env.OCR_IMGPROC || join(root, 'src/wasm/bin/imgproc.wasm')));
  let memory; const w = {};
  for (const i of WebAssembly.Module.imports(mod)) if (i.module === 'wasi_snapshot_preview1') w[i.name] = () => 52;
  w.fd_prestat_get = () => 8; w.proc_exit = (c) => { throw new Error('exit ' + c); };
  w.random_get = (p, n) => { crypto.getRandomValues(new Uint8Array(memory.buffer, p, n)); return 0; };
  w.clock_time_get = (_i, _p, out) => { new DataView(memory.buffer).setBigUint64(out, BigInt(Date.now()) * 1000000n, true); return 0; };
  w.environ_sizes_get = (a, b) => { const dv = new DataView(memory.buffer); dv.setUint32(a, 0, true); dv.setUint32(b, 0, true); return 0; };
  w.environ_get = () => 0;
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: w });
  memory = inst.exports.memory; inst.exports._initialize?.();
  // the Doc Scanner's page finder: DocCornerNet LEAN on the app's ONNX Runtime Web (as tests/unit/pagefind.test.mjs runs it)
  const ort = await import(join(root, 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs'));
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(join(root, 'node_modules/scanic-ml/dist/doccornernet_lean.ort'))), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const ip = bindImgproc(inst.exports);
  // PaddleOCR (src/lib/paddle.ts, the second reader for soft photos) on the same ONNX Runtime and the site's models — only
  // with --paddle (the models: node scripts/fetch-assets.mjs)
  let paddleRead = null;
  if (args.includes('--paddle')) {
    const P = await vite.ssrLoadModule('/src/lib/paddle.ts');
    const sess = async (f) => ort.InferenceSession.create(new Uint8Array(readFileSync(join(root, 'public/models/paddleocr', f))), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const [det, rec] = [await sess('PP-OCRv6_det_small.onnx'), await sess('PP-OCRv6_rec_small.onnx')];
    const alphabet = readFileSync(join(root, 'public/models/paddleocr/PP-OCRv6_rec_small.onnx.character.txt'), 'utf8').split('\n');
    const nets = {
      det: async (x, w, h) => (await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, h, w]) }))[det.outputNames[0]].data,
      rec: async (x, w) => { const o = (await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, 48, w]) }))[rec.outputNames[0]]; return { data: o.data, T: o.dims[1], C: o.dims[2] }; },
    };
    paddleRead = (im) => P.paddleRead(im, nets, ip, alphabet);
  }
  // textcore's XY-cut (the reading order of PaddleOCR's lines on a page of columns)
  const { bindTextcore } = await vite.ssrLoadModule('/src/wasm/textcore.ts');
  const tmod = await WebAssembly.compile(readFileSync(join(root, 'src/wasm/bin/textcore.wasm')));
  let tmem; const tw = { ...w };
  tw.random_get = (p, n) => { crypto.getRandomValues(new Uint8Array(tmem.buffer, p, n)); return 0; };
  tw.clock_time_get = (_i, _p, out) => { new DataView(tmem.buffer).setBigUint64(out, BigInt(Date.now()) * 1000000n, true); return 0; };
  tw.environ_sizes_get = (a, b) => { const dv = new DataView(tmem.buffer); dv.setUint32(a, 0, true); dv.setUint32(b, 0, true); return 0; };
  const tinst = await WebAssembly.instantiate(tmod, { wasi_snapshot_preview1: tw });
  tmem = tinst.exports.memory; tinst.exports._initialize?.();
  const tc = bindTextcore(tinst.exports);
  const xycut = (boxes, gx, gy) => tc.xycut(boxes, gx, gy).order;
  const docCorners = async (im) => {
    const s = ip.resizeArea(im, pf.SIZE, pf.SIZE);
    return pf.readOutput(await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', pf.modelInput(s.data), [1, pf.SIZE, pf.SIZE, 3]) }));
  };
  return { ip, straighten, uprightByReading, pageSize, pf, docCorners, readPage, readingOf, listText, paddleRead, xycut, close: () => vite.close() };
}

/** The clean-up variants. app = what the Photo Dictionary did until 21 Nov 2026 (≤ 3000 px, the document clean-up, grey);
 *  page = the page found and straightened first by src/lib/pagecrop.ts (what the tab does now). */
async function prepare({ ip, straighten, uprightByReading, pageSize, pf, docCorners }, img, p) {
  const cap = (im, L = 3000) => { const s = Math.max(im.width, im.height); return s > L ? ip.resize(im, (im.width * L) / s, (im.height * L) / s) : im; };
  const copy = (im) => ({ width: im.width, height: im.height, data: new Uint8ClampedArray(im.data) });
  if (p === 'raw') return cap(img);
  if (p === 'app') return ip.docEnhance(copy(cap(img)), 1);
  if (p === 'screen') return ip.docEnhance(ip.blur(copy(cap(img)), 1.1), 1);
  if (p.startsWith('doc')) {
    // doc[+step…]: the page found by the Doc Scanner's network (DocCornerNet) when it is sure, else as page… does; then the
    // same steps (level …)
    const steps = p.split('+').slice(1), im = cap(img);
    const m = await docCorners(im);
    let pg, ok = false;
    if (m && m.score >= pf.MIN_SCORE && pf.isPageQuad(pf.clampQuad(m.corners), im.width, im.height)) {
      const c = pf.clampQuad(m.corners).map((v, k) => v * (k % 2 ? im.height : im.width)), [w, h] = pageSize(c);
      pg = ip.warp(im, c, w, h); ok = true;
    } else { const s2 = await straighten(im, ip); pg = s2.img; ok = s2.found; }
    found += ok ? 1 : 0;
    pg = copy(pg);
    for (const st of steps) {
      if (st === 'level') pg = (await uprightByReading(pg, readSmall, ip)).img;
      else if (st === 'blur') pg = ip.blur(pg, 1.1);
      else throw new Error('unknown step ' + st);
    }
    const out = ip.docEnhance(pg, 1);
    if (ok) out.whole = async () => { let w = copy(cap(img)); if (steps.includes('level')) w = (await uprightByReading(w, readSmall, ip)).img; return ip.docEnhance(w, 1); };
    return out;
  }
  if (p.startsWith('page') || p.startsWith('net')) {
    // net[+step…]: as page, with the Doc Scanner's network asked where the outline is not a page's on all four edges (as the
    // tabs do since to-do #18; page… leaves the network out).
    // page[+step…]: the page found and straightened, then the steps in order — blur (a screen's moiré), up<f> (larger by
    // f, default 2, while the longer side is under 2000 px — the engine reads x-heights of 20 – 30 px best), sharp<a>
    // (unsharp mask, amount a, default 1, σ 1.2; sharp1.5s2 = amount 1.5, σ 2), bw (black and white instead of grey). Old names: pagescreen = page+blur, pageup = page+up, pagesharp = page+sharp. level: the text levelled and set upright (src/lib/upright.ts, as both tabs do now).
    const steps = { pagescreen: ['blur'], pageup: ['up'], pagesharp: ['sharp'] }[p] || p.split('+').slice(1);
    const s = await straighten(cap(img), p.startsWith('net') ? { ...ip, docCorners: async (sm) => docCorners(sm) } : ip);
    found += s.found ? 1 : 0;
    if (s.by === 'network') byNet++;
    let pg = copy(s.img);
    for (const st of steps) {
      if (st === 'blur') pg = ip.blur(pg, 1.1);
      else if (st.startsWith('sharp')) { const [a, sg] = st.slice(5).split('s'); pg = ip.sharpen(pg, parseFloat(a) || 1, parseFloat(sg) || 1.2); }
      else if (st.startsWith('up')) { const f = parseFloat(st.slice(2)) || 2; if (Math.max(pg.width, pg.height) < 2000) pg = ip.resize(pg, pg.width * f, pg.height * f); }
      else if (st === 'level') pg = (await uprightByReading(pg, readSmall, ip)).img;
      else if (st !== 'bw' && st !== 'marks') throw new Error('unknown step ' + st);
    }
    // marks: ruled lines and list marks cleared after the clean-up (imgproc p_clear_marks; to-do #18)
    const tidy = (im) => (steps.includes('marks') ? ip.clearMarks(im, 3).img : im);
    const out = tidy(ip.docEnhance(pg, steps.includes('bw') ? 2 : 1));
    // as the tab does: a page found that gives fewer than 25 words → the whole photo is read too, the better kept
    if (s.found) out.whole = async () => {
      let w = steps.includes('blur') ? ip.blur(copy(cap(img)), 1.1) : copy(cap(img));
      if (steps.includes('level')) w = (await uprightByReading(w, readSmall, ip)).img;
      return tidy(ip.docEnhance(w, 1));
    };
    return out;
  }
  if (p.startsWith('crop')) {
    // the page (a Kindle's screen, a sheet of paper) found and straightened before the clean-up
    let im = cap(img);
    const q = ip.detectQuad(im);
    if (q.confidence > 0) {
      const c = q.corners, d = (a, b) => Math.hypot(c[2 * a] - c[2 * b], c[2 * a + 1] - c[2 * b + 1]);
      const w = Math.round(Math.max(d(0, 1), d(3, 2))), h = Math.round(Math.max(d(0, 3), d(1, 2)));
      im = ip.warp(im, c, w, h);
    }
    if (p === 'crop2x' && Math.max(im.width, im.height) < 2400) im = ip.resize(im, im.width * 2, im.height * 2);
    return ip.docEnhance(copy(im), 1);
  }
  throw new Error('unknown clean-up ' + p);
}

async function main() {
  const eng = await imgprocNode(), { ip, close } = eng;
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cacheMethod: 'none' });
  // --param name=value,…: Tesseract parameters for the run (e.g. thresholding_method=2, Sauvola instead of Otsu)
  const params = Object.fromEntries(opt('--param', '').split(',').filter(Boolean).map((kv) => kv.split('=')));
  await worker.setParameters({ tessedit_pageseg_mode: psm, ...params });
  readSmall = async (im) => {
    const d = (await worker.recognize(ppm(ip.docEnhance({ width: im.width, height: im.height, data: new Uint8ClampedArray(im.data) }, 1)), {}, { text: true, blocks: true })).data;
    const words = []; for (const b of d.blocks || []) for (const pa of b.paragraphs) for (const l of pa.lines) for (const wd of l.words) words.push({ text: wd.text, conf: wd.confidence });
    return { confidence: d.confidence, words };
  };
  // the engines of the tabs' reading path in Node (src/lib/readpage.ts ReadEngines): imgproc.wasm with the Doc Scanner's
  // network, and this Tesseract (the text as recognize() of src/lib/ocr.ts gives it)
  // --without op,…: steps of imgproc taken out of the reading path (e.g. clearBorder, quadText), to measure what each does
  const without = opt('--without', '').split(',').filter(Boolean);
  const readEngines = {
    ops: Object.fromEntries(Object.entries({ ...ip, docCorners: (sm) => eng.docCorners(sm) }).filter(([k]) => !without.includes(k))),
    // the second reader (with --paddle): PaddleOCR for soft photos, as the tabs run it (src/lib/readpage.ts)
    ...(eng.paddleRead ? { paddle: (im) => eng.paddleRead(im), xycut: eng.xycut } : {}),
    read: async (im, _lang, _progress, layout) => {
      // the layout the reading path asks for (src/lib/ocr.ts PSM: 'page' 3, 'block' 6); --psm N overrides it for all
      // (the reading as src/lib/ocr.ts makes it: the text, the words and the lines)
      return eng.readingOf((await worker.recognize(ppm(im), { tessedit_pageseg_mode: args.includes('--psm') ? psm : { page: '3', block: '6' }[layout] }, { text: true, blocks: true })).data);
    },
  };
  // OCR_SHARD=k/n: every n-th photo from the k-th (several processes on one set); OCR_JSON_SKIP=1: photos already dumped
  // to OCR_JSON are left out (a run carried on)
  const [shard, shards] = (process.env.OCR_SHARD || '0/1').split('/').map(Number);
  const names = readdirSync(dir).filter((f) => f.endsWith('.jpg') && existsSync(join(dir, f.slice(0, -4) + '.txt')) && (!only || f.includes(only))).map((f) => f.slice(0, -4)).sort() // a photo without its words is no test photo
    .filter((n, i) => i % shards === shard && !(process.env.OCR_JSON_SKIP && preps.every((p) => existsSync(join(process.env.OCR_JSON, `${n}.${p}.json`)))));
  const totals = {};
  for (const name of names) {
    const truth = wordsOf(readFileSync(join(dir, name + '.txt'), 'utf8'));
    const rare = new Set(truth.filter((x) => RARE.has(x)));
    let img = decodeJpeg(join(dir, name + '.jpg'));
    if (tilt % 90 === 0 && tilt) img = ip.orient(img, [1, 6, 3, 8][((tilt / 90) % 4 + 4) % 4]); // a quarter turn: no corners
    else if (tilt) {
      // the photo's own ground around it (the median colour of its outermost 12 px — another colour would outline the old
      // frame, which the page finder takes for a page), with a camera's noise (a flat colour would make it a screenshot
      // to the page finder: src/lib/pagecrop.ts DIGITAL). Fill colour: a value no camera pixel has exactly (alpha 254).
      const med = [0, 1, 2].map((ch) => { const v = []; for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (x < 12 || y < 12 || x >= img.width - 12 || y >= img.height - 12) v.push(img.data[(y * img.width + x) * 4 + ch]); v.sort((p, q) => p - q); return v[v.length >> 1]; });
      const a = (Math.abs(tilt) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      img = ip.rotate(img, tilt, Math.round(img.width * c + img.height * sn), Math.round(img.width * sn + img.height * c), (0xfe << 24 | med[2] << 16 | med[1] << 8 | med[0]) >>> 0);
      const d = img.data; let seed = 12345;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0xfe) { seed = (seed * 1103515245 + 12345) >>> 0; const n = ((seed >>> 16) % 25) - 12; d[i] += n; d[i + 1] += n; d[i + 2] += n; d[i + 3] = 255; }
    }
    const row = [name.padEnd(14)];
    for (const p of preps) {
      const t0 = performance.now();
      let data;
      if (p === 'paddle') {
        // paddle: PaddleOCR alone on the photo as it is (as RapidOCR read it for docs/WASM-AUDIT.md, tab 122) — needs --paddle
        const lines = await eng.paddleRead(img);
        data = { text: lines.map((l) => l.text).join('\n'), confidence: 100 * (lines.reduce((a, l) => a + l.score, 0) / Math.max(1, lines.length)) };
      } else if (p.startsWith('read')) {
        // read[+screen][+retry][+dark][+once]: the tabs' own reading path (src/lib/readpage.ts) on imgproc.wasm, the Doc
        // Scanner's network and this Tesseract — read = the Photo Dictionary's options, +retry +dark = the OCR tab's (a poor
        // reading tried the other ways round; light text on a dark ground turned over), +screen = "Photo of a screen",
        // +once = an unsure reading not read again the other way
        // +first: the first reader only (Tesseract; the JSON dumps of OCR_JSON are made so, for working a rule out)
        const res = await eng.readPage(img, { lang: 'eng', clean: true, auto: true, screen: p.includes('screen'), retryTurns: p.includes('retry'), invertDark: p.includes('dark'), again: !p.includes('once'), second: !p.includes('first') && !process.env.OCR_JSON }, readEngines);
        if (res.engine === 'paddle') secondKept++;
        if (res.second) secondTried++;
        if (res.page) found++;
        if (res.by === 'network') byNet++;
        if (res.layout !== (res.columns >= 2 ? 'page' : 'block')) other++;
        if (process.env.OCR_SAVE) {
          writeFileSync(join(process.env.OCR_SAVE, `${name}.${p}.ppm`), ppm(res.img));
          writeFileSync(join(process.env.OCR_SAVE, `${name}.${p}.pre.ppm`), ppm(res.pre));
        }
        // the picture imgproc's p_clear_marks gets (readPage's clean-up up to it), lossless — OCR_SAVE with the rest, or
        // OCR_MARKS=DIR alone: the unit fixtures of tests/unit/pageclean.test.mjs (soft-memo.png …), and a change to
        // p_clear_marks checked on every photo at once (the photos whose cleared picture changes are the ones to read again)
        const marksDir = process.env.OCR_MARKS || process.env.OCR_SAVE;
        if (marksDir) {
          let x = { width: res.pre.width, height: res.pre.height, data: new Uint8ClampedArray(res.pre.data) };
          if (res.inverted) x = ip.invert(x);
          if (p.includes('screen')) x = ip.blur(x, 1.1);
          x = ip.clearWash(ip.docEnhance(x, 1)).img;
          writeFileSync(join(marksDir, `${name}.${p}.marks.png`), writePng(x));
        }
        data = res.r;
        // OCR_LIST=DIR: the OCR tab's text, the page's lists set out (src/lib/listtext.ts — to-do #31), and the marks
        if (process.env.OCR_LIST) writeFileSync(join(process.env.OCR_LIST, `${name}.${p}.json`), JSON.stringify({ text: eng.listText(res.r, res.listMarks, res.xh), plain: res.r.text, marks: res.listMarks, xh: res.xh, engine: res.engine, layout: res.layout, r: res.r }));
        if (process.env.OCR_JSON) {
          // everything a rule needs to be worked out afterwards: Tesseract's reading with its words, how the page was
          // prepared, and (with --paddle) PaddleOCR's lines on the page before and after the clean-up
          // OCR_JSON_MAXCONF: PaddleOCR only for readings less sure than this (no rule reads a sure one again)
          const want = eng.paddleRead && !(res.r.confidence >= +(process.env.OCR_JSON_MAXCONF || Infinity));
          const t1 = performance.now(), pre = want ? await eng.paddleRead(res.pre) : null, t2 = performance.now(), clean = want ? await eng.paddleRead(res.img) : null, t3 = performance.now();
          writeFileSync(join(process.env.OCR_JSON, `${name}.${p}.json`), JSON.stringify({ name, set: dir, r: res.r, page: res.page, by: res.by, columns: res.columns, layout: res.layout, cleared: res.cleared, up: res.up, size: [res.img.width, res.img.height], tessSeconds: (t1 - t0) / 1000, paddle: { pre, clean, preSeconds: (t2 - t1) / 1000, cleanSeconds: (t3 - t2) / 1000 } }));
        }
      } else {
      const work = await prepare(eng, img, p);
      if (process.env.OCR_SAVE) writeFileSync(join(process.env.OCR_SAVE, `${name}.${p}.ppm`), ppm(work)); // the picture the engine reads
      ({ data } = await worker.recognize(ppm(work), {}, { text: true, blocks: true }));
      const nWords = (d) => (d.blocks || []).reduce((n, b) => n + b.paragraphs.reduce((m, pa) => m + pa.lines.reduce((k, l) => k + l.words.length, 0), 0), 0);
      if (work.whole && nWords(data) < 25) { const d2 = (await worker.recognize(ppm(await work.whole()), {}, { text: true, blocks: true })).data; if (nWords(d2) > nWords(data)) data = d2; }
      }
      const got = wordsOf(data.text);
      const right = lcs(truth, got), rareFound = [...rare].filter((x) => got.includes(x)).length;
      const acc = right / truth.length, clean = got.length ? right / got.length : 0, ce = cer(truth, got), st = strays(data.text);
      (totals[p] ||= []).push([acc, rare.size ? rareFound / rare.size : 1, clean, ce, st]);
      if (process.env.OCR_DUMP) writeFileSync(join(process.env.OCR_DUMP, `${name}.${p}.txt`), data.text);
      row.push(`${p}: ${(100 * acc).toFixed(1)}% ${rareFound}/${rare.size} rare ${(100 * clean).toFixed(0)}% clean cer ${(100 * ce).toFixed(1)}% stray ${st} conf ${Math.round(data.confidence)} n ${got.length} ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    }
    console.log(row.join(' | '));
  }
  for (const [p, t] of Object.entries(totals)) {
    const m = (k) => (100 * t.reduce((s, x) => s + x[k], 0) / t.length).toFixed(1);
    console.log(`MEAN ${p.padEnd(8)} words ${m(0)}%  rare ${m(1)}%  clean ${m(2)}%  cer ${m(3)}%  stray lines ${t.reduce((s, x) => s + x[4], 0)}  (${t.length} photos, psm ${psm})`);
  }
  if (found) console.log(`page found in ${found} of the runs that looked for it${byNet ? ` (${byNet} by the Doc Scanner's network)` : ''}`);
  if (other) console.log(`${other} readings kept from the other layout (an unsure reading read again)`);
  if (secondTried) console.log(`${secondTried} soft photos read by PaddleOCR too, its reading kept for ${secondKept}`);
  await worker.terminate(); await close();
}
main().catch((e) => { console.error(e); process.exit(1); });
