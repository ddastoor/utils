// Proves the site makes no requests to any other host: opens home, every category and every tool
// (desktop and phone profiles) and fails on any request that does not go to the site itself.
import { preview } from 'vite';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const server = await preview({ preview: { port: 4323 }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
const { createServer } = await import('vite');
const vs = await createServer({ server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const { TOOLS, CATEGORIES } = await vs.ssrLoadModule('/src/registry.ts');
await vs.close();
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const external = new Set(); const csp = []; const errors = [];
let pages = 0;
for (const [name, profile] of [['desktop', { viewport: { width: 1366, height: 900 } }], ['mobile', devices['iPhone 13']]]) {
  const ctx = await browser.newContext(profile);
  ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !/^(data|blob|about|chrome-extension):/.test(u)) external.add(`${name}: ${u}`); });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`${name} ${page.url()}: ${e.message}`));
  const routes = ['', ...['all', 'fav', ...CATEGORIES.map((c) => c.id)].map((c) => `c/${c}`), ...TOOLS.map((t) => t.id)];
  for (const r of routes) { await page.goto(`${base}#/${r}`); await page.waitForTimeout(r.startsWith('c/') || !r ? 150 : 600); pages++; }
  await ctx.close();
}
await browser.close(); server.httpServer.close();
console.log(`visited ${pages} pages`);
console.log(external.size ? `✗ EXTERNAL REQUESTS:\n  ${[...external].join('\n  ')}` : '✓ zero requests to any other host');
console.log(csp.length ? `✗ CSP violations:\n  ${csp.slice(0, 10).join('\n  ')}` : '✓ zero Content-Security-Policy violations');
console.log(errors.length ? `✗ page errors:\n  ${errors.slice(0, 10).join('\n  ')}` : '✓ zero page errors');
process.exit(external.size || csp.length || errors.length ? 1 : 0);
