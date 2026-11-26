// The category's list of apps folds away (to-do #27; owner, 26 Nov 2026: "make the list of apps in this category in a
// collapsible pane … By default, keep the app pane expanded … collapse the list of all apps in that category so that the
// real estate for the currently selected app increases"; "remembered between visits like Favorites"). The button at the
// end of the category row: open by default; folded, the tool row is gone and the app starts higher (Software's rows on a
// PC, one row on a phone); it stays folded through other apps and categories, after a reload (localStorage beside
// Favorites) and in a second tab; it opens again; the keyboard and screen readers (aria-expanded); private mode.
const KEY = 'superutils.applist.v1';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ viewport: { width: 1280, height: 900 } });
  const state = (p) => p.evaluate((key) => {
    const b = document.querySelector('.tab-fold'), bar = document.querySelector('.tabs-tool'), nav = document.querySelector('.navwrap');
    return { btn: b && !b.hidden ? b.textContent.trim() : null, expanded: b?.getAttribute('aria-expanded'), toolRow: !!bar && !bar.hidden && bar.getBoundingClientRect().height > 0,
      tools: bar ? bar.querySelectorAll('.tab').length : 0, nav: Math.round(nav.getBoundingClientRect().height), viewTop: Math.round(document.querySelector('.view').getBoundingClientRect().top + scrollY),
      stored: localStorage.getItem(key) };
  }, KEY);
  await page.goto(`${base}#/`); await page.locator('.tile').first().waitFor();
  let s = await state(page);
  ok(s.btn === null && !s.toolRow, 'the start page has no tool row and no fold button');
  await page.goto(`${base}#/json`); await page.locator('.tool-title').waitFor();
  const open = await state(page);
  const nSoftware = open.tools;
  ok(open.btn === 'Hide apps' && open.expanded === 'true' && open.toolRow && nSoftware > 40 && open.stored === null, `open by default: the ${nSoftware} apps of Software listed, "Hide apps" (aria-expanded true), nothing stored`);
  await page.locator('.tab-fold').click();
  const folded = await state(page);
  ok(folded.btn === `All ${nSoftware} apps` && folded.expanded === 'false' && !folded.toolRow && folded.stored === 'folded', `folded: the tool row is gone, the button says "${folded.btn}" (aria-expanded false), stored`);
  ok(open.nav - folded.nav >= 200 && open.viewTop - folded.viewTop >= 200, `the app gains the room: the sticky rows ${open.nav} → ${folded.nav} px, the app starts ${open.viewTop - folded.viewTop} px higher`);
  const head = [await page.locator('.tool-title').textContent(), await page.locator('.tabs-cat .tab.on').textContent()];
  ok(/^JSON Formatter/.test(head[0]) && head[1].trim() === 'Software', `the category row and the open app's title stay (${head.join(' · ')})`);
  await page.goto(`${base}#/regex`); await page.locator('.tool-title', { hasText: 'Regex Tester' }).waitFor();
  s = await state(page);
  ok(s.btn === `All ${nSoftware} apps` && !s.toolRow, 'another app of the category: still folded');
  await page.locator('.tabs-cat .tab', { hasText: 'Text' }).click(); await page.locator('.tool-title', { hasText: 'Text' }).waitFor();
  s = await state(page);
  const nText = await page.locator('.view .tile').count();
  ok(s.btn === `All ${nText} apps` && !s.toolRow, `another category: still folded ("${s.btn}")`);
  await page.reload(); await page.locator('.tool-title').waitFor();
  s = await state(page);
  ok(s.btn === `All ${nText} apps` && !s.toolRow, 'remembered after a reload (between visits, like Favorites)');
  // a second tab of the site follows
  const other = await page.context().newPage(); await other.goto(`${base}#/wordcount`); await other.locator('.tool-title').waitFor();
  ok((await state(other)).btn === `All ${nText} apps`, 'a second tab opens folded too');
  await other.locator('.tab-fold').click();
  await page.waitForFunction(() => !document.querySelector('.tabs-tool').hidden, null, { timeout: 5000 }).catch(() => {});
  s = await state(page);
  ok(s.btn === 'Hide apps' && s.toolRow && s.stored === null, 'opened in the second tab: the first follows, and nothing is stored (open is the default)');
  await other.close();
  // the keyboard: the button is reached with Tab and works with Enter and Space
  await page.goto(`${base}#/case`); await page.locator('.tool-title').waitFor();
  await page.locator('.tab-fold').focus(); await page.keyboard.press('Enter');
  s = await state(page);
  ok(s.expanded === 'false' && !s.toolRow, 'Enter on the focused button folds the list');
  await page.keyboard.press('Space');
  s = await state(page);
  ok(s.expanded === 'true' && s.toolRow && await page.locator('.tabs-tool .tab.on').isVisible(), 'Space opens it again, the open app\'s tab in view');
  let reached = false;
  await page.locator('.search-input').focus();
  for (let i = 0; i < 30 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.classList.contains('tab-fold')); }
  ok(reached, 'Tab reaches the button from the search box');
  // every category: the button counts its apps
  const cats = await page.locator('.tabs-cat .tab').evaluateAll((as) => as.map((a) => a.getAttribute('href')).filter((h) => /^#\/c\/(?!fav)/.test(h)));
  let right = 0;
  await page.locator('.tab-fold').click(); // folded
  for (const href of cats) {
    await page.goto(`${base}${href}`); await page.locator('.view .tile').first().waitFor();
    const n = await page.locator('.view .tile').count(), st = await state(page);
    if (st.btn === `All ${n} apps` && !st.toolRow) right++;
  }
  ok(right === cats.length && cats.length >= 10, `every category (${cats.length}): folded, the button counts its apps`);
  // Favorites: its row folds too
  await page.goto(`${base}#/qr`); await page.locator('.head-star').click();
  await page.goto(`${base}#/c/fav`); await page.locator('.view .tile').first().waitFor();
  ok((await state(page)).btn === 'All 1 app', `Favorites: one app, said so ("${(await state(page)).btn}")`);
  await page.locator('.tab-fold').click();
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // a phone: one row of apps less on the screen
  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/qr`); await ph.locator('.tool-title').waitFor();
  const po = await state(ph);
  await ph.locator('.tab-fold').tap();
  const pf = await state(ph);
  ok(po.toolRow && !pf.toolRow && po.nav - pf.nav >= 40, `phone: folded, the sticky rows ${po.nav} → ${pf.nav} px`);
  const hit = await ph.evaluate(() => { const b = document.querySelector('.tab-fold').getBoundingClientRect(); return { w: b.width, h: b.height, x: b.right <= innerWidth, page: document.documentElement.scrollWidth <= innerWidth }; });
  ok(hit.x && hit.page && hit.w >= 44, `phone: the button stays on the screen beside the category row, no sideways scroll (${Math.round(hit.w)} × ${Math.round(hit.h)} px)`);
  await ph.reload(); await ph.locator('.tool-title').waitFor();
  ok(!(await state(ph)).toolRow, 'phone: remembered after a reload');
  // private mode (the browser refuses to store): it folds for the visit, without an error
  const pr = await newPage({ viewport: { width: 1280, height: 900 } });
  await pr.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await pr.goto(`${base}#/json`); await pr.locator('.tool-title').waitFor();
  await pr.locator('.tab-fold').click();
  ok(!(await state(pr)).toolRow && !pr.errors.length, `private mode: folded for the visit, no error ${pr.errors.join(' | ')}`);
};
