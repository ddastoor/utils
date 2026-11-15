// Fast, parallel unit tests: one Vite module loader shared by all suites; every suite runs concurrently.
//   node tests/unit.mjs [filter]
import { createServer } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const filter = process.argv[2] || '';
const t0 = performance.now();
const vite = await createServer({ root, server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });

/** Instantiate one of our own WASI reactor modules in Node (same shim semantics as src/wasm/wasi.ts). */
async function wasm(name) {
  const mod = await WebAssembly.compile(readFileSync(join(root, 'src/wasm/bin', `${name}.wasm`)));
  let memory;
  const w = {};
  for (const i of WebAssembly.Module.imports(mod)) if (i.module === 'wasi_snapshot_preview1') w[i.name] = () => 52;
  w.random_get = (p, n) => { crypto.getRandomValues(new Uint8Array(memory.buffer, p, n)); return 0; };
  w.proc_exit = (c) => { throw new Error('exit ' + c); };
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: w });
  memory = inst.exports.memory;
  inst.exports._initialize?.();
  return inst.exports;
}
const ctx = { load: (p) => vite.ssrLoadModule(p), wasm, root };

const files = readdirSync(join(here, 'unit')).filter((f) => f.endsWith('.test.mjs') && f.includes(filter)).sort();
const results = await Promise.all(files.map(async (f) => {
  const fails = [], passes = { n: 0 }, s0 = performance.now();
  const t = {
    ok(cond, msg) { if (cond) passes.n++; else fails.push(msg); },
    eq(got, want, msg) { const j = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x)); if (Object.is(got, want) || j(got) === j(want)) passes.n++; else fails.push(`${msg}: got ${j(got)}, want ${j(want)}`); },
    near(got, want, tol, msg) { if (Math.abs(got - want) <= tol) passes.n++; else fails.push(`${msg}: got ${got}, want ${want} ±${tol}`); },
    throws(fn, msg) { try { fn(); fails.push(`${msg}: did not throw`); } catch { passes.n++; } },
  };
  try { await (await import(pathToFileURL(join(here, 'unit', f)).href)).default(t, ctx); }
  catch (e) { fails.push(`crashed: ${e.stack || e}`); }
  return { f, fails, passed: passes.n, ms: performance.now() - s0 };
}));
await vite.close();
let failed = 0, total = 0;
for (const r of results) {
  total += r.passed + r.fails.length; failed += r.fails.length;
  console.log(`${r.fails.length ? '✗' : '✓'} ${r.f.padEnd(28)} ${String(r.passed).padStart(4)} passed  ${r.ms.toFixed(0).padStart(5)} ms`);
  for (const m of r.fails.slice(0, 15)) console.log(`    ✗ ${m}`);
}
console.log(`\n${total - failed}/${total} assertions passed in ${files.length} suites, ${(performance.now() - t0).toFixed(0)} ms`);
process.exit(failed ? 1 : 0);
