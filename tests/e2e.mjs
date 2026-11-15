// Parallel end-to-end tests in real Chromium against the production build (dist/).
//   npm run build && node tests/e2e.mjs [filter]
// One preview server + one browser; each suite gets its own isolated context; suites run concurrently.
import { preview } from 'vite';
import { createRequire } from 'node:module';
import { readdirSync, mkdtempSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir, cpus } from 'node:os';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const CONCURRENCY = Number(process.env.E2E_CONCURRENCY || Math.min(10, Math.max(4, cpus().length * 2)));
const t0 = performance.now();
const server = await preview({ root: join(here, '..'), preview: { port: 0 }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const tmp = mkdtempSync(join(tmpdir(), 'supertools-e2e-'));

const files = readdirSync(join(here, 'e2e')).filter((f) => f.endsWith('.e2e.mjs') && f.includes(filter)).sort();
const queue = [...files], results = [];
async function runOne(f) {
  const fails = [], infos = [], s0 = performance.now(); let passed = 0;
  const contexts = [];
  const ctx = {
    base, tmp, devices,
    async page(opts = {}) {
      const c = await browser.newContext({ acceptDownloads: true, ...opts });
      contexts.push(c);
      const p = await c.newPage();
      p.errors = [];
      p.on('pageerror', (e) => p.errors.push(e.message));
      p.on('console', (m) => { if (m.type() === 'error' && !/Wrong password|Could not decrypt|expected-error/.test(m.text())) p.errors.push(m.text()); });
      return p;
    },
    ok(cond, msg) { if (cond) passed++; else fails.push(msg); },
    info(msg) { infos.push(msg); },
    async download(page, click) { const d = page.waitForEvent('download'); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return p; },
  };
  try { await (await import(pathToFileURL(join(here, 'e2e', f)).href)).default(ctx); }
  catch (e) { fails.push(`crashed: ${e.message.split('\n')[0]}`); }
  for (const c of contexts) await c.close().catch(() => {});
  results.push({ f, fails, infos, passed, ms: performance.now() - s0 });
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
await browser.close(); server.httpServer.close();
let failed = 0, total = 0;
for (const r of results.sort((a, b) => a.f.localeCompare(b.f))) {
  total += r.passed + r.fails.length; failed += r.fails.length;
  console.log(`${r.fails.length ? '✗' : '✓'} ${r.f.padEnd(30)} ${String(r.passed).padStart(4)} passed  ${(r.ms / 1000).toFixed(1).padStart(5)} s`);
  for (const m of r.fails.slice(0, 15)) console.log(`    ✗ ${m}`);
  for (const m of r.infos) console.log(`    ℹ ${m}`);
}
console.log(`\n${total - failed}/${total} checks passed in ${files.length} suites, ${((performance.now() - t0) / 1000).toFixed(1)} s (concurrency ${CONCURRENCY})`);
process.exit(failed ? 1 : 0);
