// Parallel end-to-end tests in real Chromium against the production build (dist/).
//   npm run build && node tests/e2e.mjs [filter …]   (several filters = any of them; a filter ending in '.' matches the whole name: `chmod.`)
// One preview server + one browser; each suite gets its own isolated context; suites run concurrently.
import { preview } from 'vite';
import { createRequire } from 'node:module';
import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir, cpus } from 'node:os';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const filters = process.argv.slice(2).flatMap((a) => a.split(',')).filter(Boolean);
const CONCURRENCY = Number(process.env.E2E_CONCURRENCY || Math.min(10, Math.max(4, cpus().length * 2)));
const t0 = performance.now();
// E2E_DIST=<folder>: serve another build (e.g. `npx vite build --outDir <folder>`) while a long run uses dist/
const server = await preview({ root: join(here, '..'), preview: { port: 0 }, logLevel: 'error', ...(process.env.E2E_DIST ? { build: { outDir: process.env.E2E_DIST } } : {}) });
const base = server.resolvedUrls.local[0];
// E2E_CHANNEL=chromium runs the full Chromium build (new headless mode, closer to Chrome) instead of the headless shell;
// E2E_CHROME_ARGS adds browser flags (e.g. "--enable-logging=stderr --v=0", read with DEBUG=pw:browser to see why a page crashed)
const browser = await chromium.launch({ ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-accept-this-tab-capture', ...(process.env.E2E_CHROME_ARGS || '').split(' ').filter(Boolean)] });
const tmp = mkdtempSync(join(tmpdir(), 'supertools-e2e-'));

const files = readdirSync(join(here, 'e2e')).filter((f) => f.endsWith('.e2e.mjs') && (!filters.length || filters.some((x) => f.includes(x)))).sort();
const queue = [...files], results = [];
/** Every page: the blob URLs it makes and lets go, with the tab each was made on (`released()` reads them). */
const BLOBS = () => {
  window.__blobs = new Map(); const mk = URL.createObjectURL, rv = URL.revokeObjectURL, click = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = function (b) {
    const u = mk.call(URL, b), stack = new Error().stack || '';
    if (!/eval at evaluate|__playwright/.test(stack)) window.__blobs.set(u, { at: location.hash, size: b?.size ?? 0, type: b?.type || '', from: stack.split('\n')[2]?.trim().replace(/\(.*\/assets\//, '(').slice(0, 60) }); // a suite's own page.evaluate code is not the app's
    return u;
  };
  URL.revokeObjectURL = function (u) { window.__blobs.delete(u); return rv.call(URL, u); };
  HTMLAnchorElement.prototype.click = function () { const b = window.__blobs.get(this.href); if (b && this.download) b.download = true; return click.call(this); };
};
async function runOne(f) {
  const fails = [], infos = [], s0 = performance.now(); let passed = 0;
  const contexts = [];
  const ctx = {
    base, tmp, devices,
    async page(opts = {}) {
      // E2E_TZ=Asia/Kolkata runs the pages in another time zone (the suites are written in UTC; the owner lives in IST)
      const c = await browser.newContext({ acceptDownloads: true, ...(process.env.E2E_TZ ? { timezoneId: process.env.E2E_TZ } : {}), ...opts });
      contexts.push(c);
      const p = await c.newPage();
      await p.addInitScript(BLOBS);
      p.errors = [];
      p.on('pageerror', (e) => p.errors.push(e.message));
      // MediaPipe's wasm prints glog/TFLite info lines ("INFO: …", "I1116 …", "W1116 …") to stderr → console.error; not errors
      p.on('console', (m) => { if (m.type() === 'error' && !/Wrong password|Could not decrypt|expected-error/.test(m.text()) && !/^(INFO: |[IW]\d{4} )/.test(m.text())) p.errors.push(m.text()); });
      return p;
    },
    /** Leave the tab for the start page: the blob URLs the tab made and still holds (results kept in memory until the page
     *  reloads). Downloads' own URLs (let go 30 s after the click) and library code (zip.js's worker) are not counted. */
    async released(p, id) {
      await p.evaluate(() => { location.hash = '#/'; }); await p.locator('.tile').first().waitFor(); await p.waitForTimeout(300);
      return p.evaluate((id) => [...window.__blobs.values()].filter((b) => (b.at === `#/${id}` || b.at.startsWith(`#/${id}?`)) && !b.download && !/javascript/.test(b.type)), id);
    },
    ok(cond, msg) { if (cond) passed++; else fails.push(msg); },
    info(msg) { infos.push(msg); },
    async download(page, click) { const d = page.waitForEvent('download', { timeout: Number(process.env.E2E_DL_TIMEOUT || 90000) }); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return p; },
  };
  try { await (await import(pathToFileURL(join(here, 'e2e', f)).href)).default(ctx); }
  catch (e) { fails.push(`crashed: ${e.message.split('\n')[0]}${process.env.E2E_STACK ? `\n${(e.stack || '').split('\n').filter((l) => l.includes('.e2e.mjs')).join('\n')}` : ''}`); }
  for (const c of contexts) await c.close().catch(() => {});
  results.push({ f, fails, infos, passed, ms: performance.now() - s0 });
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
// A suite that failed while the others were running is run once more on its own: recorders, timers and media encoders
// are timing-sensitive, and this machine runs more browsers than it has cores. A real bug fails both times; a suite that
// passes alone is reported as passed, with a note of what it failed under load (E2E_NO_RETRY=1 switches this off).
if (files.length > 1 && !process.env.E2E_NO_RETRY) {
  for (const first of results.filter((r) => r.fails.length)) {
    results.splice(results.indexOf(first), 1);
    await runOne(first.f);
    const again = results[results.length - 1];
    if (!again.fails.length) again.infos.push(`passed when re-run alone; under load it had failed: ${first.fails.slice(0, 3).join(' | ').slice(0, 300)}`);
    else again.infos.push('failed twice (in the parallel run and alone)');
  }
}
await browser.close(); server.httpServer.close();
if (!process.env.E2E_KEEP) rmSync(tmp, { recursive: true, force: true }); // downloads; E2E_KEEP=1 keeps them
let failed = 0, total = 0;
for (const r of results.sort((a, b) => a.f.localeCompare(b.f))) {
  total += r.passed + r.fails.length; failed += r.fails.length;
  console.log(`${r.fails.length ? '✗' : '✓'} ${r.f.padEnd(30)} ${String(r.passed).padStart(4)} passed  ${(r.ms / 1000).toFixed(1).padStart(5)} s`);
  for (const m of r.fails.slice(0, 15)) console.log(`    ✗ ${m}`);
  for (const m of r.infos) console.log(`    ℹ ${m}`);
}
console.log(`\n${total - failed}/${total} checks passed in ${files.length} suites, ${((performance.now() - t0) / 1000).toFixed(1)} s (concurrency ${CONCURRENCY})`);
process.exit(failed ? 1 : 0);
