// Downloads the ML models listed in scripts/assets.json into public/models/ and verifies each against its pinned
// SHA-256 (models are large, so they are not committed; CI and dev run this before building).
//   node scripts/fetch-assets.mjs            fetch missing / mismatched models (fails on a hash mismatch)
//   node scripts/fetch-assets.mjs --pin      record SHA-256 + size for entries that have none yet (first fetch only)
//   node scripts/fetch-assets.mjs <name…>    only those entries
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, createReadStream } from 'node:fs';
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
const fetchedDirs = new Set();
for (const [name, a] of Object.entries(list)) {
  if (name.startsWith('_') || (only.length && !only.includes(name))) continue;
  const dest = join(root, 'public/models', name);
  if (existsSync(dest) && a.sha256 && (await sha(dest)) === a.sha256) continue;
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
