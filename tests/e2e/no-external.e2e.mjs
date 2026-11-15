// Proves the site makes no requests to any other host (all pages, desktop + phone) and has no CSP violations.
import { createServer } from 'vite';
export default async ({ base, page: newPage, ok, devices }) => {
  const vs = await createServer({ server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { TOOLS, CATEGORIES } = await vs.ssrLoadModule('/src/registry.ts');
  await vs.close();
  const origin = new URL(base).origin;
  const routes = ['', ...['all', 'fav', ...CATEGORIES.map((c) => c.id)].map((c) => `c/${c}`), ...TOOLS.map((t) => t.id)];
  const SHARDS = 6;
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
