// Visual + console check. Usage:
//   node tests/shoot.mjs <outDir> <route1,route2,...> [desktop|mobile|both] [file-to-upload] [full]
// With a file, it is put into the page's first file input and the shot is taken after 3 s; "full" = full-page shot.
// Serves dist/ with `vite preview`, opens each #/route, screenshots, and reports console errors
// (including Content-Security-Policy violations).
import { preview } from 'vite';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright'); // pre-installed globally
import { mkdirSync } from 'node:fs';

const [outDir = 'shots', routesArg = '', which = 'both', upload = '', full = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = await preview({ preview: { port: 4317, strictPort: false }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const profiles = { desktop: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 }, mobile: { ...devices['iPhone 13'], deviceScaleFactor: 1 } };
let errors = 0;
for (const name of which === 'both' ? ['desktop', 'mobile'] : [which]) {
  const ctx = await browser.newContext(profiles[name]);
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) log.push(m.text()); });
  page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
  for (const r of routesArg.split(',').filter(Boolean)) {
    log.length = 0;
    await page.goto(`${base}#/${r}`);
    await page.waitForTimeout(r.includes('!') ? 0 : 900);
    if (upload) { await page.locator('input[type=file]').first().setInputFiles(upload.split('+')); await page.waitForTimeout(3000); }
    await page.screenshot({ path: `${outDir}/${name}-${r.replace(/[^a-z0-9-]/gi, '_')}.png`, fullPage: full === 'full' });
    if (log.length) { errors += log.length; console.log(`[${name}] #/${r}:\n  ` + log.join('\n  ')); }
  }
  await ctx.close();
}
await browser.close();
server.httpServer.close();
console.log(errors ? `${errors} console errors` : 'no console errors');
