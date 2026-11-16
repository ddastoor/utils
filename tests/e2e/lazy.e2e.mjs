// Lazy loading per tab (owner rule, CLAUDE.md §4 "Lazy dependencies"): the app shell loads no engine, model, data
// file or font; opening a tab downloads only that tab's code (no wasm/model/vendor file unless the tab's first view
// needs it, listed below with the reason); the search engine loads when the search box is used; workers and
// engines are released when the tab is left (src/lifecycle.ts).
import { createServer } from 'vite';

// Our three small engines (own C, ≤ 115 KB each) may load when a tab that uses them opens: calculators, random
// pickers and text tools show live results from the first keystroke.
const SMALL_ENGINE = /assets\/(mathcore|crypto|textcore)-[\w-]+\.wasm$/;
// Tabs whose first view needs a bigger file at open, with the reason. Every other engine, model, data file and
// font loads on first use (a file chosen, a button pressed).
const AT_OPEN = {
  invoice: [/mupdf|NotoSans/, 'live PDF preview is the main view (MuPDF + Noto Sans)'],
  rent: [/mupdf|NotoSans/, 'live PDF preview is the main view (MuPDF + Noto Sans)'],
  resume: [/mupdf|NotoSans/, 'live PDF preview is the main view (MuPDF + Noto Sans)'],
  markdown: [/markdown-[\w-]+\.wasm/, 'live preview of the sample text (cmark-gfm, 0.27 MB)'],
  terminal: [/busybox-[\w-]+\.wasm/, 'the shell is ready at once (BusyBox, 0.5 MB)'],
  qr: [/zxing_full/, 'the QR code is drawn as you type (zxing-cpp, 1.5 MB)'],
  barcode: [/zxing_full/, 'the barcode is drawn as you type (zxing-cpp, 1.5 MB)'],
  caption: [/anton/, 'the meme font is used by the first preview (Anton, 18 KB)'],
  watermark: [/anton/, 'the watermark font is used by the first preview (Anton, 18 KB)'],
  signature: [/great-vibes|dancing-script|caveat/, 'typed-signature styles are previewed at once (3 fonts, 113 KB)'],
  cidr: [/devcore-cidr/, 'the sample block is calculated as you type (devcore-cidr, 0.14 MB)'],
  cron: [/devcore-cron/, 'the sample schedule is explained and its next runs listed (devcore-cron, 0.17 MB)'],
  semver: [/devcore-semver/, 'the sample range is checked as you type (devcore-semver, 0.16 MB)'],
  glob: [/devcore-glob/, 'the sample patterns are matched as you type (devcore-glob, 0.65 MB)'],
  patch: [/devcore-patch/, 'the patch is applied as you type (devcore-patch, 0.11 MB)'],
  mermaid: [/mermaid|cytoscape|katex|dagre|elk/i, 'the sample diagram is the main view (Mermaid, loaded as JS chunks)'],
};
const HEAVY = /\.wasm$|\/vendor\/|\/models\/|\/data\/|\.(ttf|otf|woff2?)$/;
const BUDGET = 400 * 1024; // decoded bytes a tab may download at open (its own JS + CSS), apart from AT_OPEN tabs
const SHELL_BUDGET = 180 * 1024; // index.html + entry JS + CSS + icons

export default async ({ base, page: newPage, ok, info, devices }) => {
  const vs = await createServer({ server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { TOOLS } = await vs.ssrLoadModule('/src/registry.ts');
  await vs.close();
  const origin = new URL(base).origin;
  const rel = (u) => u.slice(origin.length).replace(/^\/+/, '');

  /** Opens `hash` on a fresh load with the HTTP cache off; returns every same-origin response with its size. */
  const load = async (p, hash, wait = 600) => {
    const got = [];
    const on = async (r) => { if (!r.url().startsWith(origin)) return; let n = 0; try { n = (await r.body()).length; } catch {} got.push({ url: rel(r.url()), n }); };
    p.on('response', on);
    await p.goto('about:blank');
    await p.goto(`${base}#/${hash}`);
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(wait);
    p.off('response', on);
    return got;
  };
  const sum = (l) => l.reduce((a, r) => a + r.n, 0);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  const fresh = async (profile) => { const p = await newPage(profile); const cdp = await p.context().newCDPSession(p); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); return p; };

  // 1. the shell (home + a category page) loads no engine, model, data or font
  {
    const p = await fresh({ viewport: { width: 1366, height: 900 } });
    const home = await load(p, '');
    ok(!home.some((r) => HEAVY.test(r.url)), `home loads no wasm/vendor/model/data/font (${home.filter((r) => HEAVY.test(r.url)).map((r) => r.url).join(' ')})`);
    ok(sum(home) < SHELL_BUDGET, `home downloads ${kb(sum(home))} (< ${kb(SHELL_BUDGET)})`);
    info(`home: ${home.length} files, ${kb(sum(home))}`);
    const cat = await load(p, 'c/images');
    ok(!cat.some((r) => HEAVY.test(r.url)), 'a category page loads no engine either');
    // 2. search: its engine (textcore.wasm) loads when the box is first used, not before
    const before = [];
    p.on('request', (r) => before.push(rel(r.url())));
    ok(!before.some((u) => /textcore.*\.wasm/.test(u)), 'search engine not loaded before the search box is used');
    await p.locator('.search-input').first().fill('merge pdf');
    await p.waitForTimeout(500);
    ok(before.some((u) => /textcore.*\.wasm/.test(u)), 'search engine loads on first use of the search box');
    ok(await p.locator('.search-results').first().isVisible(), 'search results are shown');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(400);
    ok(p.url().endsWith('#/pdf-merge'), `Enter on the search box opens the top match after lazy loading (${p.url().split('#')[1]})`);
    await p.close();
  }

  // 3. every tab, desktop + phone: what opening it downloads
  const SHARDS = 3; // 6 pages at once: enough parallelism without starving the other suites
  const rows = [];
  await Promise.all([['desktop', { viewport: { width: 1366, height: 900 } }, 'mobile'], ['phone', devices['iPhone 13'], 'pc']].flatMap(([name, profile, hidden]) =>
    Array.from({ length: SHARDS }, async (_, k) => {
      const p = await fresh(profile);
      const shell = new Set((await load(p, '', 200)).map((r) => r.url));
      for (const t of TOOLS.filter((t, i) => i % SHARDS === k && t.platform !== hidden)) {
        const got = (await load(p, t.id)).filter((r) => !shell.has(r.url));
        const heavy = got.filter((r) => HEAVY.test(r.url) && r.n > 0), bytes = sum(got); // n = 0: cancelled request of the previous page
        rows.push({ name, id: t.id, bytes, heavy: heavy.map((r) => `${r.url.split('/').pop()} ${kb(r.n)}`) });
        const [allow] = AT_OPEN[t.id] || [];
        const extra = heavy.filter((r) => !SMALL_ENGINE.test(r.url) && !(allow && allow.test(r.url)));
        ok(!extra.length, `${name} ${t.id}: opening the tab loads no other engine/model/data/font (${extra.map((r) => r.url).join(' ')})`);
        if (allow) continue;
        ok(bytes < BUDGET, `${name} ${t.id}: opening the tab downloads ${kb(bytes)} (< ${kb(BUDGET)})`);
      }
      ok(!p.errors.length, `${name}#${k}: no page errors ${p.errors.slice(0, 3).join(' | ')}`);
      await p.close();
    })));
  const big = rows.filter((r) => r.name === 'desktop').sort((a, b) => b.bytes - a.bytes).slice(0, 6);
  info(`largest tabs at open (desktop): ${big.map((r) => `${r.id} ${kb(r.bytes)}`).join(', ')}`);
  const atOpen = rows.filter((r) => r.heavy.length && r.name === "desktop" && !r.heavy.every((x) => /^(mathcore|crypto|textcore)-/.test(x))).map((r) => `${r.id} [${r.heavy.join(", ")}]`);
  info(`heavy files at open (allowed): ${atOpen.join('; ')}`);

  // 4. engines load on first use and are released when the tab is left
  {
    const p = await newPage({ viewport: { width: 1366, height: 900 } });
    const live = () => p.evaluate(() => globalThis.__supertoolsLive());
    const wasm = [];
    p.on('request', (r) => { if (r.url().endsWith('.wasm')) wasm.push(rel(r.url())); });
    await p.goto(`${base}#/calc`);
    await p.waitForTimeout(500);
    ok(!wasm.some((u) => /busybox/.test(u)), 'Scientific Calculator opens without loading BusyBox (bc console starts on first use)');
    const bc = p.getByLabel('bc input');
    await bc.fill('scale=20; 4*a(1)'); await bc.press('Enter');
    await p.locator('.bc-a').first().waitFor({ timeout: 30000 });
    ok((await p.locator('.bc-a').first().textContent()).startsWith('3.14159265358979323'), 'bc console answers after loading on first use');
    ok((await live()).workers === 1, 'bc worker is running');
    await p.goto(`${base}#/`); await p.waitForTimeout(200);
    const l = await live();
    ok(l.workers === 0 && l.resources.length === 0, `leaving the tab ends its worker (${JSON.stringify(l)})`);
    await p.goto(`${base}#/calc`); await p.waitForTimeout(300);
    await bc.fill('2^100'); await bc.press('Enter');
    await p.locator('.bc-a').first().waitFor({ timeout: 30000 });
    ok((await p.locator('.bc-a').first().textContent()).trim() === '1267650600228229401496703205376', 'bc works again after coming back');

    // a wasm engine instance (imgproc) is created with the first photo and dropped on leaving
    await p.goto(`${base}#/image`); await p.waitForTimeout(300);
    ok(!(await live()).resources.includes('imgproc-direct'), 'Image Editor opens without instantiating imgproc');
    await p.locator('input[type=file]').first().setInputFiles('tests/fixtures/images/coffee.jpg');
    await p.locator('.ed-canvas').waitFor({ timeout: 20000 });
    await p.waitForTimeout(500);
    ok((await live()).resources.includes('imgproc-direct'), 'imgproc is instantiated with the first photo');
    await p.goto(`${base}#/c/images`); await p.waitForTimeout(200);
    ok((await live()).resources.length === 0, 'leaving the Image Editor releases imgproc');

    // a shared worker engine (crypto) is ended on leaving and restarted on return
    await p.goto(`${base}#/hash`); await p.waitForTimeout(300);
    ok(!p.errors.length, `no page errors ${p.errors.slice(0, 3).join(' | ')}`);
    await p.close();
  }
};
