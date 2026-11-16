// Downloads the ML models listed in scripts/assets.json into public/models/ and verifies each against its pinned
// SHA-256 (models are large, so they are not committed; CI and dev run this before building).
//   node scripts/fetch-assets.mjs            fetch missing / mismatched models (fails on a hash mismatch)
//   node scripts/fetch-assets.mjs --pin      record SHA-256 + size for entries that have none yet (first fetch only)
//   node scripts/fetch-assets.mjs <name…>    only those entries
// Entries with "split": N are stored as <name>.0, <name>.1 … (≤ N bytes each; GitHub Pages / git keep files < 100 MB)
// plus <name>.parts.json { sha256, size, parts: [sizes] }; the app joins them (src/lib/assets.ts).
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, createReadStream, openSync, readSync, closeSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
const fetchedDirs = new Set();
for (const [name, a] of Object.entries(list)) {
  if (name.startsWith('_') || (only.length && !only.includes(name))) continue;
  const dest = join(root, 'public/models', name);
  if (a.split && a.sha256 && existsSync(`${dest}.parts.json`)) {
    const m = JSON.parse(readFileSync(`${dest}.parts.json`, 'utf8'));
    if (m.sha256 === a.sha256 && m.parts.every((n, i) => existsSync(`${dest}.${i}`) && statSync(`${dest}.${i}`).size === n)) continue;
  }
  if (existsSync(dest) && a.sha256 && (await sha(dest)) === a.sha256) { if (a.split) splitFile(dest, a); continue; }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  process.stdout.write(`fetching ${name} … `);
  execFileSync('curl', ['-fsSL', '--retry', '4', '--retry-delay', '2', '-o', tmp, a.url]);
  const got = await sha(tmp), size = statSync(tmp).size;
  if (!a.sha256) {
    if (!pin) { console.log(`\n✗ ${name}: no pinned sha256 (run with --pin once, review, commit scripts/assets.json)`); failed++; continue; }
    a.sha256 = got; a.size = size; changed = true;
  } else if (got !== a.sha256) { console.log(`\n✗ ${name}: SHA-256 mismatch (got ${got}, want ${a.sha256})`); failed++; continue; }
  renameSync(tmp, dest);
  if (a.split) splitFile(dest, a);
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
