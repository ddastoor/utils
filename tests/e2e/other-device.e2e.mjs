// The start page tells of the apps the other kind of device has (to-do #36; owner, 27 Nov 2026: "When the app opens in the
// mobile on the landing page indicate to the user that there are additional PC-only apps and when the app opens in the PC,
// notify to the user that there are additional mobile-only apps"). A PC hides the mobile-only apps and names them; a phone
// (an iPhone, an Android phone) hides the PC-only ones, counts them by category and names every one under "Show the n apps"
// — held to the registry and to the counts docs/TOOLS.md states; the hero's count and the note's add up to every tab; on the
// start page only; the fold-out takes a finger (44 px), the phone does not scroll sideways with it open; WCAG 2.2 A / AA
// (axe-core) on the PC in both themes and on a phone in the dark theme with the list open.
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const and = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export default async ({ base, page: newPage, ok, devices }) => {
  const vs = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { TOOLS, CATEGORIES } = await vs.ssrLoadModule('/src/registry.ts');
  await vs.close();
  const pcOnly = TOOLS.filter((t) => t.platform === 'pc'), mobOnly = TOOLS.filter((t) => t.platform === 'mobile');
  const m = /(\d+) PC only, (\d+) mobile only/.exec(readFileSync(new URL('../../docs/TOOLS.md', import.meta.url), 'utf8'));
  ok(!!m && +m[1] === pcOnly.length && +m[2] === mobOnly.length && pcOnly.length > 6 && mobOnly.length,
    `the registry and docs/TOOLS.md agree: ${pcOnly.length} PC only, ${mobOnly.length} mobile only (TOOLS.md: ${m?.[0]})`);
  const axe = async (p, what) => {
    if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
    const v = await p.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations
      .map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${what}: no WCAG 2.2 A / AA violation on the start page ${v.join(' | ')}`);
  };
  const heroCount = async (p) => +(/^(\d+) private tools/.exec(norm(await p.locator('.home-hero p.muted').textContent())) ?? [0, NaN])[1];

  // ---------------------------------------------------------------- a PC: the mobile-only apps, by name
  const pc = await newPage({ viewport: { width: 1280, height: 800 }, bypassCSP: true }); // the CSP forbids the injected checker
  await pc.goto(base); await pc.waitForSelector('.tile');
  const site = await pc.evaluate(() => location.host + location.pathname.replace(/\/(index\.html)?$/, ''));
  const note = pc.locator('.home-hero .other-apps');
  const said = norm(await note.locator('p').textContent());
  const names = and(mobOnly.map((t) => t.title).sort((a, b) => a.localeCompare(b, 'en')));
  ok(await note.isVisible() && said === `${mobOnly.length} more apps on a phone: ${names} — they need a phone’s sensors or touchscreen and are hidden on computers. Open ${site} on your phone to use them.`,
    `PC: the start page names the ${mobOnly.length} apps of a phone — "${said}"`);
  ok(!(await note.locator('details').count()), 'PC: a few apps are named in the sentence, with no list to open');
  ok(await heroCount(pc) + mobOnly.length === TOOLS.length, `PC: the start page's ${await heroCount(pc)} tools and the ${mobOnly.length} of the note are all ${TOOLS.length} tabs`);
  for (const t of mobOnly) ok(!(await pc.locator('a.tile', { hasText: t.title }).count()), `PC: ${t.title} is a phone's app — no card of it on the start page`);
  for (const r of ['#/c/device', '#/c/fav', '#/stopwatch', `#/${mobOnly[0].id}`]) {
    await pc.goto(`${base}${r}`); await pc.waitForSelector('.tool-title');
    ok(!(await pc.locator('.other-apps').count()), `PC: the note is on the start page only — not on ${r}`);
  }
  await pc.goto(base); await pc.waitForSelector('.other-apps');
  ok(true, 'PC: back on the start page, the note is there again');
  await axe(pc, 'PC, light theme');
  await pc.emulateMedia({ colorScheme: 'dark' }); await pc.goto(base); await pc.waitForSelector('.other-apps');
  await axe(pc, 'PC, dark theme');

  // ---------------------------------------------------------------- phones: the PC-only apps, by category, every name
  const groups = CATEGORIES.map((c) => ({ c, list: pcOnly.filter((t) => t.cat === c.id) })).filter((g) => g.list.length);
  const byCount = [...groups].sort((a, b) => b.list.length - a.list.length || CATEGORIES.indexOf(a.c) - CATEGORIES.indexOf(b.c));
  const head = `${pcOnly.length} more apps on a computer: ${and(byCount.map((g) => `${g.c.title} (${g.list.length})`))} — made for a PC, they are hidden on phones. Open ${site} on a computer to use them.`;
  const items = groups.map((g) => `${g.c.title} (${g.list.length}): ${g.list.map((t) => t.title).join(' · ')}`);
  const phones = [];
  for (const dev of ['iPhone 13', 'Pixel 7']) {
    const ph = await newPage({ ...devices[dev], bypassCSP: true }); phones.push(ph);
    await ph.goto(base); await ph.waitForSelector('.tile');
    const n = ph.locator('.home-hero .other-apps');
    const line = norm(await n.locator('p').textContent());
    ok(line === head, `${dev}: the start page counts the ${pcOnly.length} apps of a PC by category, the largest first — "${line}"`);
    const list = n.locator('details.other-list');
    ok(await list.count() === 1 && !(await list.evaluate((d) => d.open)) && !(await n.locator('ul').isVisible())
      && norm(await list.locator('summary').textContent()) === `Show the ${pcOnly.length} apps`, `${dev}: their names are folded under "Show the ${pcOnly.length} apps"`);
    const s = await list.locator('summary').boundingBox();
    ok(s && s.height >= 44, `${dev}: "Show the ${pcOnly.length} apps" takes a finger (${s && Math.round(s.height)} px tall)`);
    await list.locator('summary').tap();
    ok(await list.evaluate((d) => d.open) && await n.locator('ul').isVisible(), `${dev}: a tap opens the list`);
    const got = (await n.locator('li').allTextContents()).map(norm);
    ok(JSON.stringify(got) === JSON.stringify(items), `${dev}: the list names every PC-only app once, by category in the order of the tab row ${got.length === items.length ? '' : `(${got.length} rows, ${items.length} expected)`} ${got.filter((x, i) => x !== items[i]).slice(0, 2).join(' | ')}`);
    const shown = got.flatMap((r) => r.replace(/^[^:]+: /, '').split(' · '));
    ok(shown.length === pcOnly.length && pcOnly.every((t) => shown.includes(t.title)), `${dev}: ${shown.length} names — each of the ${pcOnly.length} PC-only apps`);
    ok(await heroCount(ph) + pcOnly.length === TOOLS.length, `${dev}: the start page's ${await heroCount(ph)} tools and the ${pcOnly.length} of the note are all ${TOOLS.length} tabs`);
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${dev}: the start page does not scroll sideways with the list open`);
    await list.locator('summary').tap();
    ok(!(await list.evaluate((d) => d.open)), `${dev}: a second tap folds it again`);
    await ph.goto(`${base}#/c/text`); await ph.waitForSelector('.tile');
    ok(!(await ph.locator('.other-apps').count()), `${dev}: the note is on the start page only — not on a category`);
  }
  const ph = phones[0];
  await ph.emulateMedia({ colorScheme: 'dark' }); await ph.goto(base); await ph.waitForSelector('.other-apps');
  await ph.locator('.other-list summary').tap();
  await axe(ph, 'iPhone 13, dark theme, the list open');
  ok(![pc, ...phones].some((p) => p.errors.length), `no page errors ${[pc, ...phones].flatMap((p) => p.errors).slice(0, 3).join(' | ')}`);
};
