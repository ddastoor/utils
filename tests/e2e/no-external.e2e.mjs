// Proves the site makes no requests to any other host (all pages, desktop + phone) and has no CSP violations.
import { createServer } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
export default async ({ base, page: newPage, ok, devices }) => {
  const vs = await createServer({ server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { TOOLS, CATEGORIES } = await vs.ssrLoadModule('/src/registry.ts');
  await vs.close();
  const origin = new URL(base).origin;
  const routes = ['', ...['all', 'fav', ...CATEGORIES.map((c) => c.id)].map((c) => `c/${c}`), ...TOOLS.map((t) => t.id)];
  const SHARDS = 6;
  // approved data APIs (CLAUDE.md §3a) are the only other hosts the CSP lets scripts contact; code stays 'self'
  const APPROVED = ['https://en.wiktionary.org', 'https://api.dictionaryapi.dev', 'https://en.wikipedia.org', 'https://raw.githubusercontent.com', 'https://api.github.com']; // the data APIs of the Photo Dictionary and the Text Diff (CLAUDE.md §3a)
  const pol = await (async () => { const p = await newPage(); await p.goto(base); const c = await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'); await p.close(); return Object.fromEntries(c.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v])); })();
  const hosts = (pol['connect-src'] || []).filter((v) => /^https?:/.test(v));
  ok(hosts.length === APPROVED.length && hosts.every((h) => APPROVED.includes(h)), `CSP connect-src allows only the approved data APIs (${hosts.join(' ')})`);
  for (const d of ['script-src', 'style-src', 'font-src', 'worker-src', 'default-src']) ok((pol[d] || []).every((v) => !/^https?:/.test(v)), `CSP ${d} allows no other host (${(pol[d] || []).join(' ')})`);
  // no analytics/telemetry endpoint survives in the built code (MediaPipe's usage logger is removed in vite.config.ts)
  const TELEMETRY = /odml\.pa\.googleapis\.com|google-analytics\.com|googletagmanager\.com|play\.googleapis\.com\/log/;
  const leaks = readdirSync('dist/assets').filter((f) => /\.(m?js)$/.test(f) && TELEMETRY.test(readFileSync(`dist/assets/${f}`, 'utf8')));
  ok(!leaks.length, `no telemetry endpoint in the built code (${leaks.join(' ')})`);
  await Promise.all([['desktop', { viewport: { width: 1366, height: 900 } }], ['mobile', devices['iPhone 13']]].flatMap(([name, profile]) =>
    Array.from({ length: SHARDS }, async (_, k) => {
      const page = await newPage(profile);
      const external = new Set(), csp = [];
      page.context().on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !/^(data|blob|about):/.test(u)) external.add(u); });
      page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
      for (const r of routes.filter((_, i) => i % SHARDS === k)) { await page.goto(`${base}#/${r}`); await page.waitForTimeout(r.startsWith('c/') || !r ? 30 : 150); }
      ok(!external.size, `${name}#${k}: zero requests to other hosts ${[...external].slice(0, 5).join(' ')}`);
      ok(!csp.length, `${name}#${k}: zero CSP violations ${csp.slice(0, 3).join(' | ')}`);
      ok(!page.errors.length, `${name}#${k}: zero page errors ${page.errors.slice(0, 5).join(' | ')}`);
    })));
};
