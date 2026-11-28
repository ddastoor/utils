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
  // the data APIs of the Photo Dictionary, the Text Diff and World Radio (CLAUDE.md §3a)
  const RADIO = ['https://all.api.radio-browser.info', 'https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info'];
  const WALL = ['https://en.wikipedia.org', 'https://commons.wikimedia.org', 'https://upload.wikimedia.org', 'https://collectionapi.metmuseum.org', 'https://images.metmuseum.org', 'https://api.artic.edu', 'https://www.artic.edu'];
  const APPROVED = ['https://en.wiktionary.org', 'https://api.dictionaryapi.dev', 'https://en.wikipedia.org', 'https://raw.githubusercontent.com', 'https://api.github.com', ...RADIO, ...WALL.slice(1)];
  // tabs whose first view needs their data API (the harness answers from recorded fixtures): World Radio lists India's most listened
  // stations, Wallpapers today's picks and a topic's pictures as they open — requests to their own services, nothing else, on their route
  const AT_OPEN = { worldradio: RADIO, wallpapers: WALL };
  const pol = await (async () => { const p = await newPage(); await p.goto(base); const c = await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'); await p.close(); return Object.fromEntries(c.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v])); })();
  const hosts = (pol['connect-src'] || []).filter((v) => /^https?:/.test(v));
  ok(hosts.length === APPROVED.length && hosts.every((h) => APPROVED.includes(h)), `CSP connect-src allows only the approved data APIs (${hosts.join(' ')})`);
  for (const d of ['script-src', 'style-src', 'font-src', 'worker-src', 'default-src', 'img-src']) ok((pol[d] || []).every((v) => !/^https?:/.test(v)), `CSP ${d} allows no other host (${(pol[d] || []).join(' ')})`);
  // sound and video from any secure server (World Radio's stations' own streams: data, not code); nothing over plain HTTP
  ok((pol['media-src'] || []).filter((v) => /^https?:/.test(v)).join(' ') === 'https:', `CSP media-src allows https: streams and nothing else of other hosts (${(pol['media-src'] || []).join(' ')})`);
  // no analytics/telemetry endpoint survives in the built code (MediaPipe's usage logger is removed in vite.config.ts)
  const TELEMETRY = /odml\.pa\.googleapis\.com|google-analytics\.com|googletagmanager\.com|play\.googleapis\.com\/log/;
  const leaks = readdirSync('dist/assets').filter((f) => /\.(m?js)$/.test(f) && TELEMETRY.test(readFileSync(`dist/assets/${f}`, 'utf8')));
  ok(!leaks.length, `no telemetry endpoint in the built code (${leaks.join(' ')})`);
  await Promise.all([['desktop', { viewport: { width: 1366, height: 900 } }], ['mobile', devices['iPhone 13']]].flatMap(([name, profile]) =>
    Array.from({ length: SHARDS }, async (_, k) => {
      const page = await newPage(profile);
      const external = new Set(), csp = [];
      let at = '';
      page.context().on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !/^(data|blob|about):/.test(u) && !(AT_OPEN[at] || []).some((h) => u.startsWith(`${h}/`))) external.add(u); });
      page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
      for (const r of routes.filter((_, i) => i % SHARDS === k)) { at = r; await page.goto(`${base}#/${r}`); await page.waitForTimeout(r.startsWith('c/') || !r ? 30 : AT_OPEN[r] ? 600 : 150); }
      ok(!external.size, `${name}#${k}: zero requests to other hosts ${[...external].slice(0, 5).join(' ')}`);
      ok(!csp.length, `${name}#${k}: zero CSP violations ${csp.slice(0, 3).join(' | ')}`);
      ok(!page.errors.length, `${name}#${k}: zero page errors ${page.errors.slice(0, 5).join(' | ')}`);
    })));
};
