// App shell robustness: search, keyboard shortcut, favourites persistence, category browsing, platform rules.
import { createServer } from 'vite';
export default async ({ base, page: newPage, ok, devices }) => {
  const vs = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { TOOLS, CATEGORIES } = await vs.ssrLoadModule('/src/registry.ts');
  await vs.close();
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(base);
  await page.waitForSelector('.tile');
  ok((await page.locator('.home-sec').count()) === CATEGORIES.length + 1, 'home shows favourites + every category');
  await page.keyboard.press('/');
  ok(await page.evaluate(() => document.activeElement?.classList.contains('search-input')), '"/" focuses search');
  await page.keyboard.type('home loan emi'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#/emi');
  ok(true, 'search + Enter opens the top match (EMI)');
  await page.keyboard.press('Control+k'); await page.keyboard.type('pasport'); // typo
  await page.keyboard.press('Enter'); await page.waitForFunction(() => location.hash === '#/passport');
  ok(true, 'typo-tolerant search');
  // favourites persist across reload
  await page.goto(base + '#/emi'); await page.locator('.head-star').click();
  await page.reload(); await page.goto(base + '#/c/fav'); await page.waitForSelector('.tile');
  ok((await page.locator('.tile').allTextContents()).some((t) => t.includes('EMI Calculator')), 'starred tool appears in Favorites after reload');
  ok((await page.locator('.tab-fav .tab-count').textContent()) === '1', 'favourites count badge');
  await page.locator('.tile .tile-star').first().click(); await page.waitForTimeout(100);
  ok((await page.locator('.tab-fav .tab-count').count()) === 0, 'unstar removes it');
  // category browsing
  for (const c of CATEGORIES.slice(0, 4)) {
    await page.goto(base + '#/c/' + c.id); await page.waitForSelector('.tile');
    ok((await page.locator('.tile').count()) === TOOLS.filter((t) => t.cat === c.id && t.platform !== 'mobile').length, `category ${c.id} lists its desktop tools`);
  }
  // platform rules: PC-only hidden on phone, mobile-only hidden on desktop
  await page.goto(base + '#/c/device'); await page.waitForSelector('.tile');
  ok(!(await page.locator('.tile', { hasText: 'Bubble Level' }).count()), 'mobile-only tool hidden on desktop');
  const phone = await newPage(devices['iPhone 13']);
  await phone.goto(base); await phone.waitForSelector('.tile');
  const phoneTitles = await phone.locator('.tile strong').allTextContents();
  const pcOnly = TOOLS.filter((t) => t.platform === 'pc').map((t) => t.title);
  ok(!phoneTitles.some((t) => pcOnly.some((p) => t.startsWith(p))), 'no PC-only tool on the phone home screen');
  ok(phoneTitles.some((t) => t.startsWith('Bubble Level')), 'mobile-only tool shown on phone');
  ok(!(await phone.locator('.tabs-cat .tab', { hasText: 'Software' }).count()), 'Software category hidden on phone (all PC only)');
  ok(!page.errors.length && !phone.errors.length, 'no console errors ' + [...page.errors, ...phone.errors].join(' | '));

  // ---------------------------------------------------------------- second pass (bug hunt, Nov 2026)
  const visibleDesktop = TOOLS.filter((t) => t.platform !== 'mobile');
  // routing: unknown ids, malformed %-sequences (used to throw "URI malformed" and leave a blank page), history
  const r = await newPage({ viewport: { width: 1366, height: 900 } });
  for (const bad of ['#/nope', '#/c/zzz', '#/%E0%A4%A', '#/%', '#/emi%']) {
    await r.goto(base + '#/gst'); await r.goto(base + bad); await r.waitForTimeout(150);
    ok(await r.title() === 'SuperTools' && (await r.locator('.home-sec').count()) > 5, `unknown or malformed route ${bad} shows the home page`);
  }
  await r.goto(base + '#/%'); await r.reload(); await r.waitForSelector('.tile');
  ok((await r.locator('.tile').count()) === visibleDesktop.length && !r.errors.length, `page loaded directly on a malformed hash still works (${r.errors.join(' | ')})`);
  await r.goto(base + '#/emi'); await r.waitForSelector('.tool-body .card'); await r.goto(base + '#/gst'); await r.waitForSelector('.tool-body .card');
  await r.goBack(); await r.waitForFunction(() => document.title.startsWith('EMI'));
  await r.goForward(); await r.waitForFunction(() => document.title.startsWith('GST'));
  ok(true, 'browser back / forward move between tabs');
  ok(await r.locator('.tabs-cat .tab.on').getAttribute('aria-selected') === 'true' && (await r.locator('.tabs-cat .tab.on').textContent()).trim() === 'Calculators'
    && (await r.locator('.tabs-tool .tab.on').textContent()).trim() === 'GST Calculator' && (await r.locator('.tabs [aria-selected=true]').count()) === 2, 'active category and tool tabs marked (aria-selected)');
  let allCats = 0;
  for (const c of CATEGORIES) {
    await r.goto(base + '#/c/' + c.id); await r.waitForTimeout(60);
    const want = visibleDesktop.filter((t) => t.cat === c.id).length;
    if ((await r.locator('.view .tile').count()) === want && (await r.locator('.tabs-tool .tab').count()) === want && await r.title() === `${c.title} · SuperTools` && (await r.locator('.tool-desc').textContent()) === `${want} tools`) allCats++;
  }
  ok(allCats === CATEGORIES.length, `every category page lists its tools, fills the tool row and sets the title (${allCats}/${CATEGORIES.length})`);
  await r.goto(base + '#/emi'); await r.waitForSelector('.tool-body .card'); await r.evaluate(() => window.scrollTo(0, 600)); await r.goto(base + '#/sip'); await r.waitForSelector('.tool-body .card');
  ok(await r.evaluate(() => window.scrollY) === 0, 'a new tab starts at the top of the page');

  // search: keyboard, no stale results
  const sb = r.getByRole('searchbox', { name: 'Search tools' });
  await sb.fill('emi'); await r.waitForSelector('.result'); await sb.press('Enter'); await r.waitForFunction(() => location.hash === '#/emi');
  await r.goto(base + '#/bmi'); await r.waitForSelector('.tool-body .card'); await r.keyboard.press('/'); await r.keyboard.press('Enter'); await r.waitForTimeout(250);
  ok(await r.evaluate(() => location.hash) === '#/bmi', 'Enter in an empty search box goes nowhere (used to reopen the previous top match)');
  await sb.fill('pdf'); await r.waitForSelector('.result');
  ok((await r.locator('.result').count()) === 12 && (await r.locator('.result[aria-selected=true]').count()) === 1 && (await r.locator('.search-results').getAttribute('role')) === 'listbox', '12 results at most, first one selected');
  await sb.press('ArrowDown'); await sb.press('ArrowDown'); await sb.press('ArrowUp'); const second = (await r.locator('.result.sel strong').textContent()).trim();
  ok(second === (await r.locator('.result strong').nth(1).textContent()).trim(), 'arrow keys move the selection');
  await sb.press('Enter'); await r.waitForFunction((t) => document.title.startsWith(t), second.replace(' ★', '')); ok(true, `Enter opens the selected result (${second})`);
  for (let i = 0; i < 20; i++) await sb.press('ArrowUp');
  await sb.fill('qqzzxxqq'); await r.waitForSelector('.result-empty'); const before = await r.evaluate(() => location.hash);
  await sb.press('ArrowDown'); await sb.press('Enter'); await r.waitForTimeout(150);
  ok((await r.locator('.result-empty').textContent()) === 'No matching tool' && await r.evaluate(() => location.hash) === before, '"No matching tool"; Enter does nothing');
  // back in the box within the 120 ms after it lost the focus: the list of the new word must stay (a timer started by
  // the blur used to hide it — a box with text and no results; this suite then timed out now and then at "qqzzxxqq")
  for (const [how, leave] of [['Enter on a result', 'enter'], ['a click elsewhere', 'blur']]) {
    await sb.fill('pdf'); await r.waitForSelector('.result');
    const seen = await r.evaluate(async (leave) => {
      const box = document.querySelector('input[type=search]'), wait = (ms) => new Promise((done) => setTimeout(done, ms));
      if (leave === 'enter') box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); else box.blur();
      await wait(30); box.focus(); box.value = 'gst'; box.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(300);
      return { hidden: document.querySelector('.search-results').hidden, results: document.querySelectorAll('.result').length };
    }, leave);
    ok(!seen.hidden && seen.results > 0, `after ${how}, a word typed straight away keeps its results on screen (${JSON.stringify(seen)})`);
    await sb.press('Escape');
  }
  await sb.fill('emi'); await r.waitForSelector('.result'); await r.evaluate(() => document.querySelector('input[type=search]').blur()); await r.waitForTimeout(250);
  ok(await r.locator('.search-results').isHidden(), 'the list still closes when the box is left');
  await sb.fill(''); await sb.press('Escape');
  await sb.fill('gst'); await r.waitForSelector('.result'); await sb.press('Escape');
  ok(await sb.inputValue() === '' && await r.locator('.search-results').isHidden() && await r.evaluate(() => document.activeElement?.tagName) !== 'INPUT', 'Escape clears and closes the search');
  await sb.fill('gst'); await r.waitForSelector('.result'); await r.locator('.result').first().click(); await r.waitForFunction(() => location.hash === '#/gst'); ok(await sb.inputValue() === '', 'clicking a result opens it and empties the box');
  await r.goto(base + '#/wordcount'); await r.locator('textarea').first().click(); await r.keyboard.type('a/b');
  ok(await r.locator('textarea').first().inputValue() === 'a/b', '"/" typed in a text box is text, not the search shortcut');
  await r.keyboard.press('Control+k'); ok(await r.evaluate(() => document.activeElement?.classList.contains('search-input')), 'Ctrl+K focuses the search even from a text box');
  await r.keyboard.press('Escape');
  // every tool is the top result for its own title
  await r.goto(base); const miss = [];
  for (const t of visibleDesktop) {
    await sb.fill(t.title); await r.waitForFunction((q) => document.querySelector('.search-input').value === q && document.querySelector('.result strong'), t.title);
    const top = (await r.locator('.result strong').first().evaluate((e) => e.firstChild.textContent)).trim();
    if (top !== t.title) miss.push(`${t.title} → ${top}`);
  }
  ok(!miss.length, `every tool is the first result for its own title (${visibleDesktop.length} tools) ${miss.slice(0, 6).join(' | ')}`);
  await sb.press('Escape');

  // favourites: order, row, garbage in storage, another browser tab, hidden tools
  const f = await newPage({ viewport: { width: 1366, height: 900 } });
  // (a change of the hash is taken up a moment later: wait for the new tab's title, or the click lands on the star of the tab before)
  for (const id of ['sip', 'qr', 'emi']) { await f.goto(base + '#/' + id); await f.waitForFunction((title) => document.title.startsWith(title), TOOLS.find((t) => t.id === id).title); await f.locator('.head-star').click(); }
  await f.goto(base + '#/c/fav'); await f.waitForSelector('.tile');
  ok((await f.locator('.view .tile strong').allTextContents()).join() === 'SIP Calculator,QR Generator,EMI Calculator' && (await f.locator('.tab-fav .tab-count').textContent()) === '3', 'favorites keep the order they were starred in');
  await f.locator('.view .tile', { hasText: 'QR Generator' }).click(); await f.waitForFunction(() => location.hash === '#/qr?from=fav');
  ok((await f.locator('.tabs-cat .tab.on').textContent()).trim().startsWith('Favorites') && (await f.locator('.tabs-tool .tab').count()) === 3, 'a tool opened from Favorites keeps the Favorites row (3 tool tabs)');
  await f.locator('.head-star').click(); await f.waitForTimeout(150);
  ok((await f.locator('.tabs-cat .tab.on').textContent()).trim() === 'Codes & Files' && (await f.locator('.tab-fav .tab-count').textContent()) === '2' && await f.locator('.head-star').getAttribute('aria-pressed') === 'false', 'unstarring the open tool moves the rows to its own category');
  const f2 = await f.context().newPage(); await f2.goto(base + '#/c/fav'); await f2.waitForSelector('.tile');
  await f.goto(base + '#/gst'); await f.locator('.head-star').click();
  await f2.waitForFunction(() => document.querySelectorAll('.view .tile').length === 3); ok((await f2.locator('.tab-fav .tab-count').textContent()) === '3', 'favorites stay in sync between two open browser tabs');
  await f2.close();
  const f3 = await f.context().newPage(); await f3.goto(base + '#/c/fav'); await f3.waitForSelector('.tile');
  await f.evaluate(() => localStorage.clear());
  ok(await f3.waitForFunction(() => !document.querySelector('.tab-fav .tab-count'), null, { timeout: 5000 }).then(() => true, () => false), 'site data cleared in another browser tab: the favorites go here too (they stayed)');
  await f3.close();
  for (const [stored, want] of [['{', 0], ['null', 0], ['"emi"', 0], ['["emi","nope",42,"json","emi",null]', 2]]) {
    await f.evaluate((v) => localStorage.setItem('supertools.favorites.v1', v), stored); await f.reload(); await f.goto(base + '#/c/fav'); await f.waitForTimeout(150);
    ok((await f.locator('.view .tile').count()) === want && (await f.locator('.tab-fav .tab-count').count()) === (want ? 1 : 0), `damaged favorites data ${stored} → ${want} favorites, no duplicates, no crash`);
  }
  ok(!f.errors.length, `favorites: no page errors ${f.errors.join(' | ')}`);
  await phone.goto(base + '#/json'); await phone.waitForSelector('.note-warn');
  ok(!(await phone.locator('.head-star').count()), 'a tool that is hidden on this device has no star (it could never appear in Favorites here)');
  const desk = await newPage({ viewport: { width: 1366, height: 900 } }); await desk.goto(base + '#/level'); await desk.waitForSelector('.note-warn');
  ok(/made for phones/.test(await desk.locator('.note-warn').textContent()) && !(await desk.locator('.head-star').count()), 'mobile-only tool opened by URL on a desktop: note, no star');

  // a tool whose code arrives after the user moved on and came back is mounted once (it used to mount twice and leak a worker)
  const w = await newPage({ viewport: { width: 1366, height: 900 } });
  await w.addInitScript(() => { const W = window.Worker; window.__w = { made: 0, killed: 0 }; window.Worker = class extends W { constructor(...a) { super(...a); window.__w.made++; } terminate() { window.__w.killed++; super.terminate(); } }; });
  await w.goto(base); await w.waitForSelector('.tile');
  await w.route(/assets\/terminal-[^/]*\.js$/, async (rt) => { await new Promise((x) => setTimeout(x, 1200)); rt.continue(); });
  await w.evaluate(() => { location.hash = '#/terminal'; }); await w.waitForTimeout(150);
  await w.evaluate(() => { location.hash = '#/json'; }); await w.waitForTimeout(150);
  await w.evaluate(() => { location.hash = '#/terminal'; }); await w.waitForSelector('.term-input, .term input, .terminal input', { timeout: 15000 }).catch(() => {}); await w.waitForTimeout(2500);
  const onTab = await w.evaluate(() => window.__w);
  await w.evaluate(() => { location.hash = '#/'; }); await w.waitForTimeout(400);
  const left = await w.evaluate(() => window.__w);
  ok(onTab.made === 1 && left.killed === 1, `slow tab → another tab → back: mounted once, its worker ended on leave (made ${onTab.made}, ended ${left.killed})`);
  // a tool whose code cannot be downloaded: message + "Try again" (reload) instead of a dead tab
  let fail = true; await w.unroute(/assets\/terminal-[^/]*\.js$/);
  await w.route(/assets\/calculators-[^/]*\.js$/, (rt) => (fail ? rt.abort() : rt.continue()));
  await w.evaluate(() => { location.hash = '#/emi'; }); await w.waitForSelector('.note-err');
  ok(/Could not load this tool/.test(await w.locator('.note-err').textContent()) && /Check your internet connection/.test(await w.locator('.note-err').textContent()), 'failed download of a tab: clear message');
  fail = false; await w.getByRole('button', { name: 'Try again' }).click(); await w.waitForSelector('.tool-body .card', { timeout: 15000 });
  ok(await w.title() === 'EMI Calculator · SuperTools', '"Try again" reloads the page and the tab opens');
  // files dropped beside a drop zone must not replace the app; a drop zone still receives them
  await w.goto(base + '#/hash'); await w.waitForSelector('.drop');
  const drop = (sel) => w.evaluate((sel) => { const dt = new DataTransfer(); dt.items.add(new File(['abc'], 'dropped.txt', { type: 'text/plain' })); const res = {}; for (const type of ['dragover', 'drop']) { const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }); document.querySelector(sel).dispatchEvent(ev); res[type] = ev.defaultPrevented; } return res; }, sel);
  const outside = await drop('.tool-head');
  ok(outside.dragover && outside.drop, 'a file dropped outside a drop zone is ignored (the browser would have left the app)');
  await drop('.drop'); await w.waitForFunction(() => /dropped\.txt|ba7816bf/.test(document.querySelector('.tool-body').textContent), null, { timeout: 10000 });
  ok(true, 'a file dropped on a drop zone is still used');
  const textDrop = await w.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'hello'); const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }); document.querySelector('.tool-head').dispatchEvent(ev); return ev.defaultPrevented; });
  ok(!textDrop, 'dragging text is left alone');
  // a cancelled file dialog must not leave its button busy for ever
  await w.goto(base + '#/terminal'); const up = w.getByRole('button', { name: 'Upload' }); await up.waitFor();
  w.once('filechooser', () => {}); await up.click(); await w.waitForFunction(() => document.querySelector('body > input[type=file]'));
  await w.evaluate(() => document.querySelector('body > input[type=file]').dispatchEvent(new Event('cancel'))); await w.waitForTimeout(150);
  ok(!(await up.isDisabled()) && !(await w.locator('body > input[type=file]').count()), 'cancelling a file dialog re-enables its button');
  // sliders are named for screen readers
  await w.goto(base + '#/shadow'); await w.waitForSelector('input[type=range]');
  const ranges = await w.locator('input[type=range]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
  ok(ranges.length >= 3 && ranges.every((n) => n.length > 1), `sliders have accessible names (${ranges.slice(0, 4).join(', ')})`);
  ok(!w.errors.filter((e) => !/Failed to fetch dynamically imported module|net::ERR_FAILED|Failed to load resource/.test(e)).length, `no unexpected page errors ${w.errors.join(' | ')}`);

  // phone shell: active tabs scrolled into view, no sideways scroll on home / category / favourites, rows swipeable
  await phone.goto(base + '#/roman'); await phone.waitForSelector('.tool-body .card');
  const inView = await phone.evaluate(() => [...document.querySelectorAll('.tabs .tab.on')].every((t) => { const b = t.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }));
  ok(inView, 'phone: the active category and tool tabs are scrolled into view');
  let noScroll = 0; const phonePages = ['', '#/c/calculators', '#/c/fav', '#/c/images', '#/emi'];
  for (const u of phonePages) { await phone.goto(base + u); await phone.waitForTimeout(200); if (await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) noScroll++; }
  ok(noScroll === phonePages.length, `phone: no horizontal scroll on home, category, favourites and tool pages (${noScroll}/${phonePages.length})`);
  ok(await phone.evaluate(() => { const b = document.querySelector('.tabs-cat'); return b.scrollWidth > b.clientWidth && getComputedStyle(b).overflowX !== 'visible'; }), 'phone: the category row can be swiped');
  await phone.goto(base); await phone.waitForTimeout(200);
  const nPhone = +/(\d+) private tools/.exec(await phone.locator('.view').textContent())?.[1];
  ok(await phone.locator('.search-input').getAttribute('placeholder') === `Search ${nPhone} tools…` && nPhone > 100 && nPhone < 170 && (await phone.locator('.search-input').getAttribute('enterkeyhint')) === 'go', `phone search box: "Search ${nPhone} tools…" — the tools a phone can open (it said "170+")`);
  // touch targets of at least 44 px in the shell (the owner's rule): the search box, the tabs of both rows, the stars
  await phone.goto(base + '#/emi'); await phone.waitForSelector('.tool-body .card');
  const hit = await phone.evaluate(() => {
    const out = {}, probe = (name, el) => { const b = el.getBoundingClientRect(), x = b.left + b.width / 2; let lo = b.top, hi = b.bottom;
      while (lo > 0 && el.contains(document.elementFromPoint(x, lo - 1))) lo--; while (hi < innerHeight && el.contains(document.elementFromPoint(x, hi))) hi++; out[name] = Math.round(hi - lo); };
    probe('search', document.querySelector('.search-input')); probe('category tab', document.querySelector('.tabs-cat .tab.on')); probe('tool tab', document.querySelector('.tabs-tool .tab.on')); probe('star', document.querySelector('.head-star'));
    return out; });
  ok(Object.values(hit).every((v) => v >= 44), `phone: the shell's touch targets are ≥ 44 px tall ${JSON.stringify(hit)} (search 40, tabs 36 / 34, star 42 before)`);
  await phone.goto(base); await phone.waitForSelector('.tile');
  const tileStar = await phone.evaluate(() => { const el = document.querySelector('.tile-star'), b = el.getBoundingClientRect(), y = b.top + b.height / 2; let lo = b.left, hi = b.right;
    while (el.contains(document.elementFromPoint(lo - 1, y))) lo--; while (el.contains(document.elementFromPoint(hi, y))) hi++; let t = b.top, bt = b.bottom; const x = b.left + b.width / 2;
    while (el.contains(document.elementFromPoint(x, t - 1))) t--; while (el.contains(document.elementFromPoint(x, bt))) bt++; return [Math.round(hi - lo), Math.round(bt - t)]; });
  ok(tileStar.every((v) => v >= 44), `phone: a card's star takes taps over 44 × 44 px (${tileStar.join(' × ')}; 32 before)`);

  // dark mode: readable text on a dark page
  const dark = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme: 'dark' });
  await dark.goto(base + '#/emi'); await dark.waitForSelector('.tool-body .card');
  const lum = (rgb) => { const [r1, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r1 + 0.7152 * g + 0.0722 * b; };
  const cols = await dark.evaluate(() => { const cs = (s) => getComputedStyle(document.querySelector(s)); return { bg: cs('body').backgroundColor, fg: cs('body').color, card: cs('.card').backgroundColor, label: cs('.field-label').color, title: cs('.tool-title').color }; });
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  ok(lum(cols.bg) < 0.05 && ratio(cols.fg, cols.bg) >= 7 && ratio(cols.title, cols.bg) >= 7 && ratio(cols.label, cols.card) >= 4.5, `dark mode: dark page, text contrast ≥ 7:1, labels ≥ 4.5:1 (${ratio(cols.fg, cols.bg).toFixed(1)}, ${ratio(cols.label, cols.card).toFixed(1)})`);
  const light = await r.evaluate(() => { const cs = (s) => getComputedStyle(document.querySelector(s)); return { bg: cs('body').backgroundColor, fg: cs('body').color }; });
  ok(lum(light.bg) > 0.8 && ratio(light.fg, light.bg) >= 7, `light mode: text contrast ${ratio(light.fg, light.bg).toFixed(1)}:1`);
  ok(!r.errors.length && !dark.errors.length && !desk.errors.length, `no page errors ${[...r.errors, ...dark.errors, ...desk.errors].join(' | ')}`);
};
