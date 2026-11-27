// Chrome's own "Webpage, Single File" (.mhtml) of the test pages of Articles → Kindle: the pages of
// scripts/make-article-pages.py served to Chromium at their addresses (nothing leaves the machine — every request is
// answered here or refused), scrolled to the end (pictures that load lazily), and saved by Chromium's MHTML writer
// (CDP Page.captureSnapshot — the same code as Ctrl+S → "Webpage, Single File"). Then the reference of every part
// (Python's email package and plistlib).
//   node scripts/make-article-mhtml.mjs
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, '..', 'tests', 'fixtures', 'articles'), SITE = join(OUT, 'site');
execFileSync('python3', [join(HERE, 'make-article-pages.py')], { stdio: 'inherit' });
const index = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));
const TYPES = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
const BASES = { news: 'https://coastal-gazette.example/media/', blog: 'https://cdn.ferris-notes.example/img/', fr: 'https://journal-littoral.example/images/', home: 'https://coastal-gazette.example/media/' };

const browser = await chromium.launch();
for (const name of ['news', 'blog', 'fr', 'home']) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u === index[name].url) return route.fulfill({ status: 200, contentType: 'text/html', body: readFileSync(join(SITE, name, 'index.html')) });
    // the embedded video's page (a stand-in: Chromium saves the frame as a part with its address)
    if (u.startsWith('https://www.youtube-nocookie.com/embed/')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><title>Video</title><p>A video player</p>' });
    if (u.startsWith(BASES[name])) {
      const file = join(SITE, name, u.slice(BASES[name].length));
      if (existsSync(file)) return route.fulfill({ status: 200, contentType: TYPES[file.split('.').pop()], body: readFileSync(file) });
    }
    return route.abort();
  });
  await page.goto(index[name].url, { waitUntil: 'load' });
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } scrollTo(0, 0); });
  await page.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(page);
  const { data } = await cdp.send('Page.captureSnapshot', { format: 'mhtml' });
  writeFileSync(join(OUT, `${name}.mhtml`), data, 'latin1');
  console.log(`${name}.mhtml: ${(data.length / 1024).toFixed(0)} KB`);
  await ctx.close();
}
await browser.close();
rmSync(SITE, { recursive: true, force: true });
execFileSync('python3', [join(HERE, 'make-article-pages.py'), '--reference'], { stdio: 'inherit' });
