// measure-ocr.mjs DIR [--prep a,b,…] [--psm N] [--only TEXT] — how many of a photo's words the OCR reads right, for
// every photo of DIR (made by scripts/make-kindle-photos.py: <name>.jpg + <name>.txt). The engine is the app's own:
// tesseract.js with the English model the site serves (4.0.0_best_int), in Node; the clean-up steps are imgproc.wasm's,
// as the tab runs them (src/wasm/imgproc.ts through Vite's loader). Prints one line per photo and the means: the words
// read right (the longest common subsequence of the two word lists, over the words of the page), the uncommon words
// found (those a reader looks up) and how clean the reading is (the words read that are right).
// Needs python3 with Pillow (to decode the JPEGs).
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createWorker, OEM } = require('tesseract.js');

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const preps = opt('--prep', 'app').split(',');
const psm = opt('--psm', '3');
const only = opt('--only', '');
let found = 0; // photos whose page was found (page / pagescreen)

/** Words as a reader counts them: letters, digits and the apostrophe; case and punctuation ignored. */
export const wordsOf = (s) => (s.normalize('NFC').replace(/[’‘]/g, "'").toLowerCase().match(/[a-z0-9']+/g) || []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);

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
  const { straighten } = await vite.ssrLoadModule('/src/lib/pagecrop.ts');
  const mod = await WebAssembly.compile(readFileSync(join(root, 'src/wasm/bin/imgproc.wasm')));
  let memory; const w = {};
  for (const i of WebAssembly.Module.imports(mod)) if (i.module === 'wasi_snapshot_preview1') w[i.name] = () => 52;
  w.fd_prestat_get = () => 8; w.proc_exit = (c) => { throw new Error('exit ' + c); };
  w.random_get = (p, n) => { crypto.getRandomValues(new Uint8Array(memory.buffer, p, n)); return 0; };
  w.clock_time_get = (_i, _p, out) => { new DataView(memory.buffer).setBigUint64(out, BigInt(Date.now()) * 1000000n, true); return 0; };
  w.environ_sizes_get = (a, b) => { const dv = new DataView(memory.buffer); dv.setUint32(a, 0, true); dv.setUint32(b, 0, true); return 0; };
  w.environ_get = () => 0;
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: w });
  memory = inst.exports.memory; inst.exports._initialize?.();
  return { ip: bindImgproc(inst.exports), straighten, close: () => vite.close() };
}

/** The clean-up variants. app = what the Photo Dictionary did until 21 Nov 2026 (≤ 3000 px, the document clean-up, grey);
 *  page = the page found and straightened first by src/lib/pagecrop.ts (what the tab does now). */
async function prepare(ip, straighten, img, p) {
  const cap = (im, L = 3000) => { const s = Math.max(im.width, im.height); return s > L ? ip.resize(im, (im.width * L) / s, (im.height * L) / s) : im; };
  const copy = (im) => ({ width: im.width, height: im.height, data: new Uint8ClampedArray(im.data) });
  if (p === 'raw') return cap(img);
  if (p === 'app') return ip.docEnhance(copy(cap(img)), 1);
  if (p === 'screen') return ip.docEnhance(ip.blur(copy(cap(img)), 1.1), 1);
  if (p === 'page' || p === 'pagescreen') {
    const s = await straighten(cap(img), ip);
    found += s.found ? 1 : 0;
    const out = ip.docEnhance(p === 'pagescreen' ? ip.blur(copy(s.img), 1.1) : copy(s.img), 1);
    // as the tab does: a page found that gives fewer than 25 words → the whole photo is read too, the better kept
    if (s.found) out.whole = () => ip.docEnhance(p === 'pagescreen' ? ip.blur(copy(cap(img)), 1.1) : copy(cap(img)), 1);
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
  const { ip, straighten, close } = await imgprocNode();
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cacheMethod: 'none' });
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const names = readdirSync(dir).filter((f) => f.endsWith('.jpg') && f !== 'sheet.jpg' && !f.startsWith('crop') && (!only || f.includes(only))).map((f) => f.slice(0, -4)).sort();
  const totals = {};
  for (const name of names) {
    const truth = wordsOf(readFileSync(join(dir, name + '.txt'), 'utf8'));
    const rare = new Set(truth.filter((x) => RARE.has(x)));
    const img = decodeJpeg(join(dir, name + '.jpg'));
    const row = [name.padEnd(14)];
    for (const p of preps) {
      const t0 = performance.now();
      const work = await prepare(ip, straighten, img, p);
      let { data } = await worker.recognize(ppm(work), {}, { text: true, blocks: true });
      const nWords = (d) => (d.blocks || []).reduce((n, b) => n + b.paragraphs.reduce((m, pa) => m + pa.lines.reduce((k, l) => k + l.words.length, 0), 0), 0);
      if (work.whole && nWords(data) < 25) { const d2 = (await worker.recognize(ppm(work.whole()), {}, { text: true, blocks: true })).data; if (nWords(d2) > nWords(data)) data = d2; }
      const got = wordsOf(data.text);
      const right = lcs(truth, got), found = [...rare].filter((x) => got.includes(x)).length;
      const acc = right / truth.length, clean = got.length ? right / got.length : 0;
      (totals[p] ||= []).push([acc, rare.size ? found / rare.size : 1, clean]);
      row.push(`${p}: ${(100 * acc).toFixed(1)}% ${found}/${rare.size} rare ${(100 * clean).toFixed(0)}% clean ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    }
    console.log(row.join(' | '));
  }
  for (const [p, t] of Object.entries(totals)) {
    const m = (k) => (100 * t.reduce((s, x) => s + x[k], 0) / t.length).toFixed(1);
    console.log(`MEAN ${p.padEnd(8)} words ${m(0)}%  rare ${m(1)}%  clean ${m(2)}%  (${t.length} photos, psm ${psm})`);
  }
  if (found) console.log(`page found in ${found} of the runs that looked for it`);
  await worker.terminate(); await close();
}
main().catch((e) => { console.error(e); process.exit(1); });
