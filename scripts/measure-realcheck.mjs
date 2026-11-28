// measure-realcheck.mjs DIR [--only TEXT] — how well "Is This Screenshot Real?" finds an earlier JPEG save and the parts edited
// after it, on the set of scripts/make-realcheck-eval.py DIR (DIR/truth.json). The code is the tab's own, as its worker runs it
// (src/workers/realcheck.worker.ts): the picture decoded (MuPDF, as the unit suite decodes it), its clipped blocks (imgproc's
// blockClip), a JPEG's ghosts on its stored coefficients (jpegcoef.wasm: ghostOfJpeg) or a PNG's in its pixels (ghostOfPixels),
// the areas (areaBoxes) — through Vite's loader, in Node.
// Prints, for the JPEGs and for the PNGs: the earlier save found (on the files saved before at a lower quality — and wrongly, on
// the others), its quality told exactly and within 2, the edited part found (an area overlapping the edit, on the files edited
// after a save at a lower quality), and areas on files nobody edited. --list prints each file's reading.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), dir = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const only = opt('--only', ''), list = args.includes('--list');
if (!dir) { console.error('usage: node scripts/measure-realcheck.mjs DIR [--only TEXT] [--list]'); process.exit(2); }

const compiled = new Map();
async function wasi(name) {
  if (!compiled.has(name)) compiled.set(name, WebAssembly.compile(readFileSync(join(root, 'src/wasm/bin', name + '.wasm'))));
  const mod = await compiled.get(name);
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

const { createServer } = await import('vite');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const J = await vite.ssrLoadModule('/src/wasm/jpegcoef.ts'), { bindImgproc } = await vite.ssrLoadModule('/src/wasm/imgproc.ts');
const rc = await vite.ssrLoadModule('/src/lib/realcheck.ts');
const mupdf = await import('mupdf');
const ip = bindImgproc(await wasi('imgproc'));
const decode = (b) => {
  const pm = new mupdf.Image(b).toPixmap(), W = pm.getWidth(), H = pm.getHeight(), n = pm.getNumberOfComponents(), px = pm.getPixels();
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0, j = 0; j < data.length; i += n, j += 4) {
    data[j] = px[i]; data[j + 1] = px[i + (n >= 3 ? 1 : 0)]; data[j + 2] = px[i + (n >= 3 ? 2 : 0)]; data[j + 3] = 255;
  }
  return { data, width: W, height: H };
};
const overlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

const truth = JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8'));
const tot = { jpeg: zero(), png: zero() };
function zero() { return { saved: 0, found: 0, exact: 0, near: 0, single: 0, wrong: 0, edited: 0, hit: 0, plain: 0, falseArea: 0, ms: 0, files: 0 }; }
for (const [name, tr] of Object.entries(truth)) {
  if (only && !name.includes(only)) continue;
  const t0 = performance.now(), bytes = new Uint8Array(readFileSync(join(dir, name))), img = decode(bytes), clip = ip.blockClip(img);
  const jc = J.bindJpegcoef(await wasi('jpegcoef'));
  let g = null;
  if (tr.part === 'jpeg') { const fr = jc.open(bytes); g = rc.ghostOfJpeg(jc, fr, rc.jpegFacts(fr), clip); }
  else g = await rc.ghostOfPixels(ip, jc, img, clip);
  const boxes = g ? rc.areaBoxes(g, img.width, img.height) : [], s = tot[tr.part];
  s.ms += performance.now() - t0; s.files++;
  // an earlier save that can be found: one at a lower quality than the last (a PNG's: any)
  const before = tr.q0 != null && (tr.part === 'png' || tr.q0 < tr.q1);
  const earlier = g?.earlier || 0;
  if (before) { s.saved++; if (earlier) { s.found++; if (earlier === tr.q0) s.exact++; if (Math.abs(earlier - tr.q0) <= 2) s.near++; } }
  else { s.single++; if (earlier) s.wrong++; }
  if (tr.edit && before) { s.edited++; if (boxes.some((b) => overlap(b, tr.edit))) s.hit++; }
  if (!tr.edit) { s.plain++; if (boxes.length) s.falseArea++; }
  if (list) console.log(name, before ? `q0 ${tr.q0}` : '', `found ${earlier || '—'}`, tr.edit ? `edit [${tr.edit}]` : '', boxes.length ? `areas ${JSON.stringify(boxes)}` : '');
}
for (const [part, s] of Object.entries(tot)) {
  if (!s.files) continue;
  console.log(`${part.toUpperCase()} (${s.files} files, ${(s.ms / s.files).toFixed(0)} ms a file):`);
  console.log(`  an earlier save found on ${s.found} of ${s.saved} files saved before (its quality exact ${s.exact}, within 2: ${s.near}); on ${s.wrong} of ${s.single} saved once`);
  console.log(`  the edited part found on ${s.hit} of ${s.edited} files edited after a save; areas on ${s.falseArea} of ${s.plain} files nobody edited`);
}
await vite.close();
