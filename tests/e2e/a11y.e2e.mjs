// Accessibility of every tab as it opens: axe-core 4 (Deque's checker, a test-only devDependency; MPL-2.0) with the
// WCAG 2.0 / 2.1 / 2.2 A and AA rules — names of controls (also "label in name" for voice control), contrast of text in
// both colour themes, valid ARIA, keyboard access to scrolling regions, target size (24 px). Three passes: desktop light
// and dark (the tabs a PC offers) and phone dark (the tabs a phone offers). Found when it was written: field hints at
// 3.1 : 1, nameless selects, `<pre lang="js">` (a screen reader switched its voice to "js"), Passport's colour chips white
// in the dark theme, periodic-table names without the visible text, a meter without a value, a 22 px toggle.
import { readFileSync } from 'node:fs';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export default async (ctx) => {
  const { base, page: newPage, ok, devices } = ctx;
  const pass = async (name, opts) => {
    const list = await newPage({ ...opts, bypassCSP: true }); // the app's CSP forbids the injected checker
    await list.goto(base); await list.waitForSelector('.tile');
    const ids = ['', ...new Set(await list.evaluate(() => [...document.querySelectorAll('a.tile')].map((a) => a.getAttribute('href').replace(/^#\//, '')).filter((x) => x && !x.startsWith('c/'))))];
    const found = [];
    const run = async (page, part) => {
      for (const id of part) {
        await page.goto(`${base}${id ? `#/${id}` : ''}`); await page.waitForSelector(id ? '.tool-body' : '.tile', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(500);
        if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
        const v = await page.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations
          .map((x) => `${x.id} (${x.impact}): ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}${x.nodes.length > 2 ? ` +${x.nodes.length - 2}` : ''}`), TAGS);
        if (v.length) found.push(`${id || 'home'} — ${v.join('; ')}`);
      }
    };
    const pages = [list, await newPage({ ...opts, bypassCSP: true })];
    await Promise.all(pages.map((p, k) => run(p, ids.filter((_, i) => i % pages.length === k))));
    ok(!found.length, `${name}: no WCAG 2.2 A / AA violation on ${ids.length} pages ${found.join(' | ')}`);
    ok(!pages.some((p) => p.errors.length), `${name}: no page errors ${pages.flatMap((p) => p.errors).slice(0, 3).join(' | ')}`);
  };
  await pass('desktop, light', { viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
  await pass('desktop, dark', { viewport: { width: 1366, height: 900 }, colorScheme: 'dark' });
  await pass('phone, dark', { ...devices['iPhone 13'], colorScheme: 'dark' });
};
