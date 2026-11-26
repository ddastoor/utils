// Downloads the ML models listed in scripts/assets.json into public/models/ and verifies each against its pinned
// SHA-256 (models are large, so they are not committed; CI and dev run this before building).
//   node scripts/fetch-assets.mjs            fetch missing / mismatched models (fails on a hash mismatch)
//   node scripts/fetch-assets.mjs --pin      record SHA-256 + size for entries that have none yet (first fetch only)
//   node scripts/fetch-assets.mjs <name…>    only those entries
// Entries with "split": N are stored as <name>.0, <name>.1 … (≤ N bytes each; GitHub Pages / git keep files < 100 MB)
// plus <name>.parts.json { sha256, size, parts: [sizes] }; the app joins them (src/lib/assets.ts).
// Entries with "member": a file inside the archive at "url" (a zip — a Python wheel), the archive checked against
// "archiveSha256" first (kept in node_modules/.cache/superutils-assets, never deployed), the file against "sha256".
// Entries with "metadata": a key of the ONNX model's metadata written beside it as <name>.<key>.txt (PaddleOCR's
// recogniser carries its alphabet so; ONNX Runtime Web cannot read a model's metadata).
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, createReadStream, openSync, readSync, closeSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert } from './convert-magenta.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listPath = join(root, 'scripts/assets.json');
const list = JSON.parse(readFileSync(listPath, 'utf8'));
const args = process.argv.slice(2), pin = args.includes('--pin'), only = args.filter((a) => !a.startsWith('--'));
const sha = (f) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(f).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
let changed = false, failed = 0;
/** Verified file → parts of at most a.split bytes + manifest; the whole file is removed (it would be deployed). */
function splitFile(dest, a) {
  const size = statSync(dest).size, fd = openSync(dest, 'r'), parts = [];
  for (let off = 0, i = 0; off < size; off += a.split, i++) {
    const n = Math.min(a.split, size - off), buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, off); writeFileSync(`${dest}.${i}`, buf); parts.push(n);
  }
  closeSync(fd); unlinkSync(dest);
  writeFileSync(`${dest}.parts.json`, JSON.stringify({ sha256: a.sha256, size, parts }) + '\n');
}
/** One file of a zip archive (its central directory read; stored or deflated). */
function zipMember(zip, member) {
  let e = zip.length - 22;
  while (e >= 0 && zip.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip archive');
  let p = zip.readUInt32LE(e + 16);
  for (let i = 0, n = zip.readUInt16LE(e + 10); i < n; i++) {
    const method = zip.readUInt16LE(p + 10), csize = zip.readUInt32LE(p + 20), nl = zip.readUInt16LE(p + 28), xl = zip.readUInt16LE(p + 30), cl = zip.readUInt16LE(p + 32), off = zip.readUInt32LE(p + 42);
    if (zip.toString('utf8', p + 46, p + 46 + nl) === member) {
      const start = off + 30 + zip.readUInt16LE(off + 26) + zip.readUInt16LE(off + 28), data = zip.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`${member}: compression method ${method}`);
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error(`${member} is not in the archive`);
}
/** A text entry of an ONNX model's metadata (ModelProto field 14: StringStringEntryProto key 1, value 2). */
function onnxMetadata(buf, want) {
  let p = 0;
  const varint = () => { let x = 0, m = 1, c; do { c = buf[p++]; x += (c & 0x7f) * m; m *= 128; } while (c & 0x80); return x; };
  while (p < buf.length) {
    const k = varint(), f = Math.floor(k / 8), w = k & 7;
    if (w === 0) { varint(); continue; }
    if (w === 1) { p += 8; continue; }
    if (w === 5) { p += 4; continue; }
    if (w !== 2) throw new Error('not an ONNX model');
    const n = varint(), end = p + n;
    if (f === 14) {
      let key = null, val = null;
      while (p < end) { const k2 = varint(), n2 = varint(), s = buf.toString('utf8', p, p + n2); p += n2; if (k2 >> 3 === 1) key = s; else if (k2 >> 3 === 2) val = s; }
      if (key === want) return val;
    }
    p = end;
  }
  return null;
}
const archives = new Map();
async function archive(a) {
  if (archives.has(a.url)) return archives.get(a.url);
  const dir = join(root, 'node_modules/.cache/superutils-assets'), f = join(dir, `${a.archiveSha256}.zip`);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(f) || (await sha(f)) !== a.archiveSha256) {
    execFileSync('curl', ['-fsSL', '--retry', '4', '--retry-delay', '2', '-o', f + '.part', a.url]);
    const got = await sha(f + '.part');
    if (got !== a.archiveSha256) { unlinkSync(f + '.part'); throw new Error(`archive SHA-256 mismatch (got ${got}, want ${a.archiveSha256})`); }
    renameSync(f + '.part', f);
  }
  const zip = readFileSync(f);
  archives.set(a.url, zip);
  return zip;
}
/** The metadata key written beside the model (again when the model was fetched anew). */
function writeMetadata(dest, a, fresh) {
  if (!a.metadata) return;
  const out = `${dest}.${a.metadata}.txt`;
  if (!fresh && existsSync(out)) return;
  const v = onnxMetadata(readFileSync(dest), a.metadata);
  if (v === null) throw new Error(`${dest}: no "${a.metadata}" in the model's metadata`);
  writeFileSync(out, v);
}
const fetchedDirs = new Set();
for (const [name, a] of Object.entries(list)) {
  if (name.startsWith('_') || (only.length && !only.includes(name))) continue;
  const dest = join(root, 'public/models', name);
  if (a.split && a.sha256 && existsSync(`${dest}.parts.json`)) {
    const m = JSON.parse(readFileSync(`${dest}.parts.json`, 'utf8'));
    if (m.sha256 === a.sha256 && m.parts.every((n, i) => existsSync(`${dest}.${i}`) && statSync(`${dest}.${i}`).size === n)) continue;
  }
  if (existsSync(dest) && a.sha256 && (await sha(dest)) === a.sha256) { if (a.split) splitFile(dest, a); writeMetadata(dest, a, false); continue; }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  process.stdout.write(`fetching ${name} … `);
  if (a.member) {
    try { writeFileSync(tmp, zipMember(await archive(a), a.member)); } catch (e) { console.log(`\n✗ ${name}: ${e.message}`); failed++; continue; }
  } else execFileSync('curl', ['-fsSL', '--retry', '4', '--retry-delay', '2', '-o', tmp, a.url]);
  const got = await sha(tmp), size = statSync(tmp).size;
  if (!a.sha256) {
    if (!pin) { console.log(`\n✗ ${name}: no pinned sha256 (run with --pin once, review, commit scripts/assets.json)`); failed++; continue; }
    a.sha256 = got; a.size = size; changed = true;
  } else if (got !== a.sha256) { console.log(`\n✗ ${name}: SHA-256 mismatch (got ${got}, want ${a.sha256})`); failed++; continue; }
  renameSync(tmp, dest);
  if (a.split) splitFile(dest, a);
  writeMetadata(dest, a, true);
  fetchedDirs.add(dirname(dest));
  console.log(`ok (${(size / 1e6).toFixed(1)} MB)`);
}
// legacy TF.js graphs (Magenta style transfer) → current graph-model model.json, rebuilt when its files changed
for (const [name, a] of Object.entries(list)) {
  if (a.convert !== 'magenta' || (only.length && !only.includes(name))) continue;
  const dir = dirname(join(root, 'public/models', name));
  if (!existsSync(join(dir, 'tensorflowjs_model.pb'))) continue;
  if (fetchedDirs.has(dir) || !existsSync(join(dir, 'model.json'))) { const r = convert(dir); console.log(`converted ${name} → model.json (${r.nodes} nodes)`); }
}
if (changed) writeFileSync(listPath, JSON.stringify(list, null, 2) + '\n');
process.exit(failed ? 1 : 0);
