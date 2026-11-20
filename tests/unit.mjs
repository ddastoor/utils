// Fast, truly parallel unit tests: suites are spread over worker threads (one per CPU core); each worker owns one
// Vite SSR loader and runs its share of suites. Usage: node tests/unit.mjs [filter …] (several = any of them)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { setFlagsFromString } from 'node:v8';

// Node 22 bug: its WASI functions are V8 "fast API calls"; uvwasi allocations inside one can start a garbage
// collection, and V8 then crashes walking the stack (SIGSEGV in InnerPointerToCodeCache, seen in busybox.test under
// heap pressure). Plain API calls are GC-safe; the flag is process-wide, so it covers every worker.
if (isMainThread) setFlagsFromString('--no-turbo-fast-api-calls');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

if (isMainThread) {
  const filters = process.argv.slice(2).flatMap((a) => a.split(',')).filter((a) => a && !a.startsWith('--'));
  const t0 = performance.now();
  const files = readdirSync(join(here, 'unit')).filter((f) => f.endsWith('.test.mjs') && (!filters.length || filters.some((x) => f.includes(x)))).sort();
  // heaviest suites first, round-robin over workers
  const weight = (f) => readFileSync(join(here, 'unit', f)).length;
  const sorted = [...files].sort((a, b) => weight(b) - weight(a));
  const n = Math.max(1, Math.min(cpus().length, files.length));
  const buckets = Array.from({ length: n }, () => []);
  sorted.forEach((f, i) => buckets[i % n].push(f));
  const results = (await Promise.all(buckets.map((b) => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { files: b } });
    w.once('message', res); w.once('error', rej);
  })))).flat();
  let failed = 0, total = 0;
  for (const r of results.sort((a, b) => a.f.localeCompare(b.f))) {
    total += r.passed + r.fails.length; failed += r.fails.length;
    console.log(`${r.fails.length ? '✗' : '✓'} ${r.f.padEnd(28)} ${String(r.passed).padStart(5)} passed  ${r.ms.toFixed(0).padStart(5)} ms`);
    for (const m of r.fails.slice(0, 15)) console.log(`    ✗ ${m}`);
  }
  console.log(`\n${total - failed}/${total} assertions passed in ${files.length} suites on ${n} threads, ${(performance.now() - t0).toFixed(0)} ms`);
  process.exit(failed ? 1 : 0);
} else {
  const { createServer } = await import('vite');
  // no file watcher: tests only import modules; a watcher holds hundreds of fds (public/data/dict) for nothing
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const compiled = new Map();   // a suite that wants a fresh instance per case (graphviz) compiles the module once
  async function wasm(name, extra = {}) {
    if (!compiled.has(name)) compiled.set(name, WebAssembly.compile(readFileSync(join(root, 'src/wasm/bin', `${name}.wasm`))));
    const mod = await compiled.get(name);
    let memory;
    const w = {};
    for (const i of WebAssembly.Module.imports(mod)) if (i.module === 'wasi_snapshot_preview1') w[i.name] = () => 52;
    w.random_get = (p, n) => { crypto.getRandomValues(new Uint8Array(memory.buffer, p, n)); return 0; };
    w.fd_prestat_get = () => 8; // EBADF: no pre-opened directories (as in src/wasm/wasi.ts)
    w.proc_exit = (c) => { throw new Error('exit ' + c); };
    // same as the browser shim (src/wasm/wasi.ts): a real clock and an empty environment
    w.clock_time_get = (_id, _prec, out) => { new DataView(memory.buffer).setBigUint64(out, BigInt(Date.now()) * 1000000n, true); return 0; };
    w.environ_sizes_get = (a, b) => { const dv = new DataView(memory.buffer); dv.setUint32(a, 0, true); dv.setUint32(b, 0, true); return 0; };
    w.environ_get = () => 0;
    const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: w, ...extra });
    memory = inst.exports.memory;
    inst.exports._initialize?.();
    return inst.exports;
  }
  // Vite's module runner gives every module fetch 60 s; on a busy machine (a browser run beside the unit run, a build)
  // a fetch waits longer and the whole suite crashed with "transport invoke timed out". The runner (made by the first
  // ssrLoadModule) reads its transport's `timeout` at every fetch: 0 = no limit. (Vite internals: without them, as before.)
  const load = (p) => {
    const r = vite.ssrLoadModule(p), t = vite._ssrCompatModuleRunner?.options?.transport;
    if (t && t.timeout === undefined) t.timeout = 0;
    return r;
  };
  const ctx = { load, wasm, root };
  const out = await Promise.all(workerData.files.map(async (f) => {
    const fails = [], passes = { n: 0 }, s0 = performance.now();
    const j = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x));
    const t = {
      ok(cond, msg) { if (cond) passes.n++; else fails.push(msg); },
      eq(got, want, msg) { if (Object.is(got, want) || j(got) === j(want)) passes.n++; else fails.push(`${msg}: got ${j(got)}, want ${j(want)}`); },
      near(got, want, tol, msg) { if (Math.abs(got - want) <= tol) passes.n++; else fails.push(`${msg}: got ${got}, want ${want} ±${tol}`); },
      throws(fn, msg) { try { fn(); fails.push(`${msg}: did not throw`); } catch { passes.n++; } },
    };
    try { await (await import(pathToFileURL(join(here, 'unit', f)).href)).default(t, ctx); }
    catch (e) { fails.push(`crashed: ${e.stack || e}`); }
    return { f, fails, passed: passes.n, ms: performance.now() - s0 };
  }));
  await vite.close();
  parentPort.postMessage(out);
}
