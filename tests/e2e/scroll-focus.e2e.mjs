// What the browser scrolls into view lands in the room left by the sticky tab rows and, on phones, the tab's fixed action bar
// (WCAG 2.2, 2.4.11 Focus Not Obscured) — found 27 Nov 2026 when a test's scrollIntoView left a box under the tab rows, where
// the mouse could not reach it: a control reached with Shift+Tab from below, or with Tab from above, and anything
// scrollIntoView() brings in, lands where it can be seen (styles.css: `scroll-padding-top` from the rows' height, kept as
// --navh by src/main.ts; `scroll-padding-bottom` for the bar). PC with the long Software tool row open and folded; a phone
// with its action bar. A build without the padding fails five of the ten checks.
export default async ({ base, page: newPage, ok, devices }) => {
  /** the first focusable controls of the page's tool, in Tab order, with where they are */
  const controls = (p) => p.evaluate(() => [...document.querySelectorAll('.view :is(a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"]))')].filter((e) => !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map((e, i) => { e.dataset.sfk = String(i); const r = e.getBoundingClientRect(); return { k: i, top: r.top + scrollY, h: r.height, seg: /^(date|time|datetime-local|month|week)$/.test(e.type) }; }));
  const room = (p) => p.evaluate(() => { const nav = document.querySelector('.navwrap').getBoundingClientRect(), bar = [...document.querySelectorAll('.actions')].find((a) => getComputedStyle(a).position === 'fixed' && a.getClientRects().length); return { top: nav.bottom, bottom: bar ? bar.getBoundingClientRect().top : innerHeight }; });
  const where = (p, k) => p.evaluate((k) => { const r = document.querySelector(`[data-sfk="${k}"]`).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }, k);
  /** Shift+Tab from control b to control a (above, scrolled out of view): where a lands */
  const back = async (p, a, b) => {
    await p.evaluate(([a, b]) => { const el = document.querySelector(`[data-sfk="${b}"]`); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'end' }); scrollBy(0, 0); const ea = document.querySelector(`[data-sfk="${a}"]`); scrollBy(0, ea.getBoundingClientRect().bottom + 4); }, [a, b]);
    await p.keyboard.press('Shift+Tab');
    return p.evaluate(() => document.activeElement?.dataset.sfk);
  };
  /** a control brought into view by scrollIntoView() (what scripts do — the browser aligns it to the top edge; Chromium
   *  centres a control reached with the keyboard, Firefox and Safari align it to the edge): where it lands */
  const intoView = async (p, k) => { await p.evaluate((k) => { scrollTo(0, document.documentElement.scrollHeight); document.querySelector(`[data-sfk="${k}"]`).scrollIntoView(); }, k); return where(p, k); };
  /** Tab from control a to control b (below, out of view) */
  const fwd = async (p, a, b) => {
    await p.evaluate(([a, b]) => { const el = document.querySelector(`[data-sfk="${a}"]`); el.focus({ preventScroll: true }); const eb = document.querySelector(`[data-sfk="${b}"]`); scrollBy(0, eb.getBoundingClientRect().top - innerHeight - 4); }, [a, b]);
    await p.keyboard.press('Tab');
    return p.evaluate(() => document.activeElement?.dataset.sfk);
  };
  /** the tab's code has arrived and built its view (the title shows first, over a "Loading…" — with many suites on the
   *  machine the form came later than the controls were counted) */
  const mounted = (p) => p.locator('.tool-body > .loading').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  // ---------------------------------------------------------------- a PC: the GST invoice (a long form), tool row open, then folded
  const pc = await newPage({ viewport: { width: 1280, height: 800 } });
  for (const [route, fold] of [['#/sqlfmt', false], ['#/sqlfmt', true], ['#/invoice', false]]) {
    await pc.goto(`${base}${route}`); await pc.locator('.tool-title').waitFor(); await mounted(pc);
    if (fold && (await pc.locator('.tab-fold').getAttribute('aria-expanded')) === 'true') await pc.locator('.tab-fold').click();
    if (!fold && (await pc.locator('.tab-fold').getAttribute('aria-expanded')) === 'false') await pc.locator('.tab-fold').click();
    await pc.waitForTimeout(200);
    const cs = await controls(pc), r0 = await room(pc);
    // two neighbours in Tab order, the second at least a screen further down the page than the first
    const pair = cs.map((c, i) => [c, cs[i + 1]]).find(([a, b]) => b && b.top - a.top > 40 && a.k + 1 === b.k && !a.seg && !b.seg); // (Tab steps through a date box's day, month and year first)
    if (!pair) { ok(false, `${route}: no two neighbouring controls found`); continue; }
    const got = await back(pc, pair[0].k, pair[1].k), at = await where(pc, pair[0].k), r = await room(pc);
    ok(got === String(pair[0].k) && at.top >= r.top - 0.5, `${route} (tool row ${fold ? 'folded' : 'open'}, the rows ${Math.round(r0.top)} px): Shift+Tab to a control above the screen — it lands at ${Math.round(at.top)} px, below the tab rows (${Math.round(r.top)} px)`);
    const iv = await intoView(pc, pair[0].k), ri = await room(pc);
    ok(iv.top >= ri.top - 0.5, `${route} (tool row ${fold ? 'folded' : 'open'}): scrollIntoView() puts a control at ${Math.round(iv.top)} px, below the tab rows (${Math.round(ri.top)} px)`);
  }
  // ---------------------------------------------------------------- a phone: the invoice's fixed "Download PDF" bar
  const ph = await newPage({ ...devices['iPhone 13'] });
  await ph.goto(`${base}#/invoice`); await ph.locator('.tool-title').waitFor(); await mounted(ph);
  await ph.locator('.actions').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => {});
  const cs = await controls(ph), pair = cs.map((c, i) => [c, cs[i + 1]]).find(([a, b]) => b && a.k + 1 === b.k && b.top - a.top > 30 && a.top > 600 && !a.seg && !b.seg);
  if (!pair) ok(false, 'phone: no two neighbouring controls found');
  else {
    const got = await fwd(ph, pair[0].k, pair[1].k), at = await where(ph, pair[1].k), r = await room(ph);
    ok(got === String(pair[1].k) && at.bottom <= r.bottom + 0.5 && at.top >= r.top - 0.5, `phone: Tab to a control below the screen — it lands at ${Math.round(at.top)} – ${Math.round(at.bottom)} px, above the action bar (${Math.round(r.bottom)} px) and below the tab rows (${Math.round(r.top)} px)`);
    const got2 = await back(ph, pair[0].k, pair[1].k), at2 = await where(ph, pair[0].k), r2 = await room(ph);
    ok(got2 === String(pair[0].k) && at2.top >= r2.top - 0.5, `phone: Shift+Tab to a control above the screen — it lands at ${Math.round(at2.top)} px, below the tab rows (${Math.round(r2.top)} px)`);
    const iv = await intoView(ph, pair[0].k), ri = await room(ph);
    ok(iv.top >= ri.top - 0.5, `phone: scrollIntoView() puts a control at ${Math.round(iv.top)} px, below the tab rows (${Math.round(ri.top)} px)`);
  }
  ok(!pc.errors.length && !ph.errors.length, `no page errors ${[...pc.errors, ...ph.errors].slice(0, 2).join(' | ')}`);
};
