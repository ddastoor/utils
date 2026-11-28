// World Clock (#/worldclock, PC + phones; potentials #73) end to end, the page's clock fixed by Playwright (28 Nov 2026, 10:00 UTC)
// and its zone India's: the owner's seven cities by default — each card's time, ticking second by second (the digits and the dial's
// hands), date and day against yours, how far from your time, the zone line, sunrise and sunset (NOAA's, as astral gives them:
// tests/unit/worldclock.test.mjs holds the engine to astral and to zoneinfo), day or night, the next clock change; 24 hours; looking
// 3 and 12 hours ahead; the search (a city, other names, zones by abbreviation, UTC), Undo, moving and removing, a set, the list in
// the address and kept through another tab; a clock change days away, the polar night and the midnight sun, the date line; leaving
// the tab; WCAG 2.2 A / AA in both themes; the phone.
import { readFileSync } from 'node:fs';
import { phoneLayout } from './_phone.mjs';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const T0 = Date.parse('2026-11-28T10:00:00Z');

export default async (ctx) => {
  const { base, page: newPage, ok, devices } = ctx;
  const open = async (hash, at = T0, opts = {}) => {
    const p = await newPage({ viewport: { width: 1366, height: 900 }, timezoneId: 'Asia/Kolkata', ...opts });
    await p.clock.install({ time: at });
    await p.goto(`${base}#/${hash}`);
    await p.locator('.wc-card').first().waitFor({ timeout: 20000 });
    await p.clock.pauseAt(at + 10_000);
    await p.clock.runFor(1100); // one tick: every clock shows at + 11 s
    return p;
  };
  const page = await open('worldclock');
  const C = (id) => page.locator(`.wc-card[data-id="${id}"]`);
  const txt = (id, cls) => C(id).locator(cls).textContent();
  const ids = () => page.$$eval('.wc-card', (cs) => cs.map((c) => c.dataset.id));
  const status = () => page.locator('.wc-status').textContent();

  // ---------------------------------------------------------------- the owner's seven
  const SEVEN = ['new-york-us', 'san-francisco-us', 'london-gb', 'mumbai-in', 'sydney-au', 'hong-kong-hk', 'singapore-sg'];
  ok(JSON.stringify(await ids()) === JSON.stringify(['you', ...SEVEN]), `the owner's seven after your own clock (${(await ids()).join(' ')})`);
  ok(page.url().endsWith(`#/worldclock?c=${SEVEN.join(',')}`), `the list is in the address (${page.url().split('#')[1]})`);
  const want = { you: '3:30:11 pm', 'new-york-us': '5:00:11 am', 'san-francisco-us': '2:00:11 am', 'london-gb': '10:00:11 am', 'mumbai-in': '3:30:11 pm', 'sydney-au': '9:00:11 pm', 'hong-kong-hk': '6:00:11 pm', 'singapore-sg': '6:00:11 pm' };
  const times = async () => Object.fromEntries(await Promise.all(Object.keys(want).map(async (id) => [id, await txt(id, '.wc-time')])));
  ok(JSON.stringify(await times()) === JSON.stringify(want), `every clock at 10:00:11 UTC: ${JSON.stringify(await times())}`);
  await page.clock.runFor(1000);
  ok((await txt('new-york-us', '.wc-time')) === '5:00:12 am' && (await txt('sydney-au', '.wc-time')) === '9:00:12 pm', 'a second later every clock has ticked');
  const hands = await C('london-gb').locator('.wc-h, .wc-m, .wc-s').evaluateAll((ls) => ls.map((l) => l.getAttribute('transform')));
  ok(JSON.stringify(hands) === JSON.stringify(['rotate(300.1 50 50)', 'rotate(1.2000000000000002 50 50)', 'rotate(72 50 50)'].map((x, i) => (i === 1 ? hands[1] : x))) && /^rotate\(1\.2/.test(hands[1]), `London's dial at 10:00:12: hour hand at 300.1°, minute at 1.2°, second at 72° (${hands.join(' | ')})`);
  ok((await txt('new-york-us', '.wc-date')) === 'Sat, 28 Nov 2026 · Today' && (await txt('sydney-au', '.wc-date')) === 'Sat, 28 Nov 2026 · Today', 'the date there and its day against yours');
  const gaps = await Promise.all(SEVEN.map((id) => txt(id, '.wc-gap')));
  ok(gaps.join(' | ') === '−10 h 30 min from you | −13 h 30 min from you | −5 h 30 min from you | Same time as you | +5 h 30 min from you | +2 h 30 min from you | +2 h 30 min from you', `how far from your time: ${gaps.join(' | ')}`);
  ok((await C('new-york-us').locator('.wc-gap').getAttribute('aria-label')) === '10 hours 30 minutes behind you', 'and in words for a screen reader');
  ok((await txt('new-york-us', '.wc-zone')) === 'UTC−05:00 · EST · Eastern Standard Time' && (await txt('sydney-au', '.wc-zone')) === 'UTC+11:00 · AEDT · Australian Eastern Daylight Time' && (await txt('london-gb', '.wc-zone')) === 'UTC+00:00 · GMT · Greenwich Mean Time' && (await txt('you', '.wc-zone')) === 'UTC+05:30 · IST · India Standard Time',
    `the zone lines (${await txt('sydney-au', '.wc-zone')})`);
  ok((await txt('new-york-us', '.wc-sun')) === 'Sunrise 6:58 am · Sunset 4:30 pm · 9 h 32 min of daylight' && (await txt('mumbai-in', '.wc-sun')) === 'Sunrise 6:54 am · Sunset 5:59 pm · 11 h 5 min of daylight',
    `sunrise and sunset to the nearest minute, as astral has them (New York 06:57:52 – 16:29:56, Mumbai 06:53:36 – 17:58:58): ${await txt('new-york-us', '.wc-sun')}`);
  ok((await C('you').locator('.wc-sun').count()) === 0, 'your own clock has no place on the globe, so no sunrise');
  const night = await Promise.all(SEVEN.map((id) => C(id).evaluate((c) => c.classList.contains('wc-night'))));
  ok(night.join() === 'true,true,false,false,true,true,false', `day or night there: night in New York (5 am), San Francisco, Sydney (9 pm) and Hong Kong (6 pm, after its sunset at 5:38); day in London, Mumbai and Singapore (6 pm, before 6:53) — ${night.join()}`);
  ok((await C('hong-kong-hk').locator('.wc-dayic').getAttribute('aria-label')) === 'Night there now' && (await C('london-gb').locator('.wc-dayic').getAttribute('aria-label')) === 'Day there now', 'the sun or moon beside the name is named');
  const changes = await Promise.all(['new-york-us', 'london-gb', 'sydney-au', 'mumbai-in'].map((id) => txt(id, '.wc-change')));
  ok(changes.join(' | ') === 'Clocks go forward 1 hour on Sun, 14 Mar 2027 at 2:00 am (to 3:00 am) | Clocks go forward 1 hour on Sun, 28 Mar 2027 at 1:00 am (to 2:00 am) | Clocks go back 1 hour on Sun, 4 Apr 2027 at 3:00 am (to 2:00 am) | No clock changes in the coming year', `the next clock change: ${changes.join(' | ')}`);

  // ---------------------------------------------------------------- 24 hours
  await page.getByRole('radio', { name: '24 h' }).click();
  ok((await txt('new-york-us', '.wc-time')) === '05:00:12' && (await txt('new-york-us', '.wc-sun')).startsWith('Sunrise 06:58 · Sunset 16:30') && (await txt('new-york-us', '.wc-change')).endsWith('at 02:00 (to 03:00)') && /[?&]h=24/.test(page.url()),
    `24 hours: the times, sunrise and the clock change (${await txt('new-york-us', '.wc-time')}; ${page.url().split('?')[1]})`);
  await page.getByRole('radio', { name: '12 h' }).click();
  ok((await txt('new-york-us', '.wc-time')) === '5:00:12 am' && !/h=/.test(page.url()), '12 hours again (this browser\'s own way, so not in the address)');

  // ---------------------------------------------------------------- looking ahead
  const ahead = async (k) => { await page.locator('.wc-ahead .range').evaluate((r, v) => { r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }, k); };
  await ahead(12);
  ok((await txt('new-york-us', '.wc-time')) === '8:00:12 am' && (await page.locator('.wc-ahead-val').textContent()) === 'In 3 h' && !(await C('new-york-us').evaluate((c) => c.classList.contains('wc-night'))) && (await page.locator('.wc-list').evaluate((l) => l.classList.contains('wc-shifted'))),
    `3 hours ahead: 8 am in New York, daylight there (${await txt('new-york-us', '.wc-time')}, ${await page.locator('.wc-ahead-val').textContent()})`);
  await ahead(48);
  ok((await txt('you', '.wc-time')) === '3:30:12 am' && (await txt('new-york-us', '.wc-date')) === 'Sat, 28 Nov 2026 · Yesterday' && (await txt('sydney-au', '.wc-date')) === 'Sun, 29 Nov 2026 · Today' && (await txt('you', '.wc-gap')) === 'Your time then',
    `12 hours ahead: 3:30 am on the 29th for you, New York still on the 28th (yesterday), Sydney on the 29th (${await txt('new-york-us', '.wc-date')})`);
  await ahead(-4);
  ok((await page.locator('.wc-ahead-val').textContent()) === '1 h ago' && (await txt('london-gb', '.wc-time')) === '9:00:12 am', 'an hour back');
  await page.getByRole('button', { name: 'Back to now' }).click();
  ok((await txt('london-gb', '.wc-time')) === '10:00:12 am' && (await page.locator('.wc-ahead-val').textContent()) === 'Now' && !(await page.getByRole('button', { name: 'Back to now' }).isVisible()), 'Back to now');

  // ---------------------------------------------------------------- the search
  const q = page.getByRole('combobox', { name: 'Add a city or time zone' });
  const opts = () => page.locator('.wc-opt').evaluateAll((os) => os.map((o) => `${o.querySelector('.wc-opt-name').textContent} (${o.querySelector('.wc-opt-where').textContent}) ${o.querySelector('.wc-opt-time').textContent}`));
  await q.fill('pune');
  await page.locator('.wc-opt').first().waitFor({ timeout: 20000 });
  ok((await opts())[0] === 'Pune (India) 3:30 pm' && (await q.getAttribute('aria-expanded')) === 'true' && (await q.getAttribute('aria-activedescendant')) === 'wc-opt-0', `"pune": Pune, India, with its time now (${(await opts()).slice(0, 2).join(' / ')})`);
  await q.press('Enter');
  ok((await ids()).at(-1) === 'pune-in' && (await status()).startsWith('Pune added.') && page.url().includes('pune-in') && (await q.inputValue()) === '', `Enter adds it at the end, said, in the address (${await status()})`);
  await page.getByRole('button', { name: 'Undo' }).click();
  ok(!(await ids()).includes('pune-in') && !page.url().includes('pune-in'), 'Undo takes it out again');
  for (const [text, id, label] of [['bombay', 'mumbai-in', 'Mumbai'], ['saigon', 'ho-chi-minh-city-vn', 'Ho Chi Minh City'], ['tromso', 'tromso-no', 'Tromsø']]) {
    await q.fill(text); await page.locator('.wc-opt').first().waitFor();
    ok((await opts())[0].startsWith(label), `"${text}" → ${label} (${(await opts())[0]})`);
    if (id === 'mumbai-in') { ok((await opts())[0].endsWith('added'), 'a city in the list already says so'); await q.press('Enter'); ok((await status()) === 'Mumbai is in the list already.', 'and Enter says so'); }
  }
  await q.fill('IST'); await page.locator('.wc-opt').first().waitFor();
  const ist = (await opts()).slice(0, 3).map((o) => o.split(' (')[1].split(')')[0]).sort();
  ok(JSON.stringify(ist) === JSON.stringify(['Time zone Asia/Jerusalem', 'Time zone Asia/Kolkata', 'Time zone Europe/Dublin']), `"IST": the three zones that write it (${ist.join(', ')})`);
  await q.fill('utc'); await page.locator('.wc-opt').first().waitFor();
  await q.press('Enter');
  ok((await ids()).at(-1) === 'utc' && (await txt('utc', '.wc-zone')) === 'UTC+00:00 · UTC · Coordinated Universal Time' && (await txt('utc', '.wc-time')) === '10:00:12 am' && (await C('utc').locator('.wc-sun').count()) === 0, 'UTC added: a zone of its own, no sun');
  await q.fill('tokyo'); await page.locator('.wc-opt').first().waitFor();
  await q.press('ArrowDown'); await q.press('ArrowUp');
  ok((await q.getAttribute('aria-activedescendant')) === 'wc-opt-0', 'the arrows move through the suggestions and round');
  await q.press('Enter');
  ok((await ids()).at(-1) === 'tokyo-jp' && (await txt('tokyo-jp', '.wc-time')) === '7:00:12 pm', 'Tokyo added');
  await q.fill('xqzvw'); await page.waitForFunction(() => /Nothing found/.test(document.querySelector('.wc-search-note')?.textContent || ''));
  ok((await page.locator('.wc-sugg').isHidden()), 'nonsense: nothing offered, and said');
  await q.press('Escape'); ok((await q.inputValue()) === '', 'Escape empties the box');

  // ---------------------------------------------------------------- moving and removing
  await page.getByRole('button', { name: 'Move London earlier' }).click();
  ok(JSON.stringify((await ids()).slice(1, 4)) === '["new-york-us","london-gb","san-francisco-us"]' && (await status()) === 'London moved earlier: 2 of 9.' && page.url().includes('new-york-us,london-gb,san-francisco-us'), `London one earlier (${await status()})`);
  ok(await page.getByRole('button', { name: 'Move New York earlier' }).isDisabled() && await page.getByRole('button', { name: 'Move Tokyo later' }).isDisabled(), 'the first cannot go earlier, the last not later');
  await page.getByRole('button', { name: 'Remove Tokyo' }).click();
  ok(!(await ids()).includes('tokyo-jp') && (await status()).startsWith('Tokyo removed.'), 'Remove');
  await page.getByRole('button', { name: 'Undo' }).click();
  ok((await ids()).at(-1) === 'tokyo-jp', 'Undo puts it back where it was');

  // ---------------------------------------------------------------- a set
  const before = await ids();
  await page.getByRole('button', { name: 'Stock markets' }).click();
  ok((await ids()).length === 12 && (await ids())[5] === 'frankfurt-am-main-de' && (await page.getByRole('button', { name: 'Stock markets' }).getAttribute('aria-pressed')) === 'true' && (await status()).startsWith('The set “Stock markets”: 11 cities.'), `the set "Stock markets" (${(await ids()).slice(1).join(' ')})`);
  await page.getByRole('button', { name: 'Undo' }).click();
  ok(JSON.stringify(await ids()) === JSON.stringify(before), 'Undo brings the list before it back');

  // ---------------------------------------------------------------- kept through another tab
  await page.goto(`${base}#/stopwatch`); await page.locator('.tool-body button').first().waitFor();
  await page.goto(`${base}#/worldclock`); await page.locator('.wc-card').nth(3).waitFor();
  ok(JSON.stringify(await ids()) === JSON.stringify(before) && page.url().includes(`c=${before.slice(1).map(encodeURIComponent).join(',')}`), 'the list is kept while the page is open (through another tab) and written in the address again');
  {
    const live = await page.evaluate(() => globalThis.__superutilsLive());
    await page.goto(`${base}#/`); await page.waitForTimeout(100);
    const after = await page.evaluate(() => globalThis.__superutilsLive());
    ok(after.workers === 0 && after.resources.length === 0, `leaving the tab lets the search go (${JSON.stringify(live)} → ${JSON.stringify(after)})`);
  }
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---------------------------------------------------------------- a list from the address
  {
    const p = await open('worldclock?c=london-gb,tz%3AAmerica%2FDenver,utc,atlantis-xx&h=24');
    const got = await p.$$eval('.wc-card', (cs) => cs.map((c) => `${c.querySelector('.wc-name').textContent}|${c.querySelector('.wc-where').textContent}|${c.querySelector('.wc-time').textContent}`));
    ok(JSON.stringify(got) === JSON.stringify(['You|Your time zone: Asia/Kolkata|15:30:11', 'London|England, United Kingdom|10:00:11', 'Denver|Time zone America/Denver|03:00:11', 'UTC|Coordinated Universal Time|10:00:11']), `a list from a link, in 24 hours; an unknown id left out (${got.join(' ; ')})`);
    await p.close();
  }
  // ---------------------------------------------------------------- a clock change days away; the far north; the date line
  {
    const p = await open('worldclock?c=new-york-us,longyearbyen-sj,tz%3APacific%2FKiritimati,pago-pago-as', Date.parse('2027-03-10T12:00:00Z'));
    const ch = await p.locator('.wc-card[data-id="new-york-us"] .wc-change');
    ok((await ch.textContent()) === 'Clocks go forward 1 hour on Sun, 14 Mar 2027 at 2:00 am (to 3:00 am) — in 4 days' && (await ch.evaluate((e) => e.classList.contains('soon'))), `a change days away is marked (${await ch.textContent()})`);
    await p.close();
    const q2 = await open('worldclock?c=longyearbyen-sj,tz%3APacific%2FKiritimati,pago-pago-as');
    const lyb = q2.locator('.wc-card[data-id="longyearbyen-sj"]');
    ok((await lyb.locator('.wc-sun').textContent()) === 'The sun does not rise today (polar night)' && (await lyb.evaluate((c) => c.classList.contains('wc-night'))), 'Longyearbyen in late November: the polar night');
    ok((await q2.locator('.wc-card[data-id="tz:Pacific/Kiritimati"] .wc-date').textContent()) === 'Sun, 29 Nov 2026 · Tomorrow' && (await q2.locator('.wc-card[data-id="pago-pago-as"] .wc-date').textContent()) === 'Fri, 27 Nov 2026 · Yesterday',
      'across the date line: Kiritimati is on tomorrow, Pago Pago on yesterday');
    await q2.close();
    const r = await open('worldclock?c=longyearbyen-sj', Date.parse('2027-06-21T12:00:00Z'));
    ok((await r.locator('.wc-card[data-id="longyearbyen-sj"] .wc-sun').textContent()) === 'The sun does not set today (midnight sun)', 'and at midsummer the midnight sun');
    await r.close();
  }

  // ---------------------------------------------------------------- WCAG 2.2 A / AA, both themes
  for (const scheme of ['light', 'dark']) {
    const ax = await open('worldclock', T0, { colorScheme: scheme, bypassCSP: true });
    await ax.getByRole('combobox').fill('par'); await ax.locator('.wc-opt').first().waitFor({ timeout: 20000 });
    await ax.clock.resume(); // axe waits on timers
    await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations with the suggestions open ${vv.join(' | ')}`);
    await ax.close();
  }

  // ---------------------------------------------------------------- the phone
  const ph = await phoneLayout(ctx, 'worldclock', { ready: '.wc-card' });
  const small = await ph.$$eval('.wc-set, .wc-tools .btn, .wc-hours .seg-btn', (bs) => bs.filter((b) => b.getBoundingClientRect().width).map((b) => { const r = b.getBoundingClientRect(); return [b.textContent || b.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, hh]) => w < 44 || hh < 44));
  ok(!small.length, `phone: sets, 12 / 24 h and each card's buttons are 44 px and more (${JSON.stringify(small)})`);
  const first = await ph.locator('.wc-card[data-id="new-york-us"]').boundingBox();
  ok(first && first.y < 844 * 1.6, `phone: the first city's clock is near the top (${first && Math.round(first.y)} px)`);
  ok(await ph.locator('.wc-sets').evaluate((s) => s.scrollWidth > s.clientWidth && getComputedStyle(s).overflowX === 'auto'), 'phone: the sets scroll sideways in one row');
};
