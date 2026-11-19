// Periodic Table (#/periodic): all 118 elements in a consistent layout (no two in one cell, f-block rows), data spot
// checks (the whole table is held to the mendeleev package in tests/unit/periodic.test.mjs), search by symbol, name,
// other spellings, number and category, the legend as a filter, the marked selection, arrow keys, phone layout.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/periodic`);
  await page.locator('.el').first().waitFor();
  const els = await page.$$eval('.el', (bs) => bs.map((b) => ({ z: +b.querySelector('small').textContent, sym: b.querySelector('strong').textContent, row: +b.style.gridRow.split('/')[0], col: +b.style.gridColumn.split('/')[0], name: b.title })));
  ok(els.length === 118 && els.every((e, i) => e.z === i + 1), '118 elements, numbered 1–118 in order');
  ok(new Set(els.map((e) => e.sym)).size === 118 && new Set(els.map((e) => `${e.row},${e.col}`)).size === 118, 'unique symbols, no two elements in the same cell');
  const at = (sym) => els.find((e) => e.sym === sym);
  ok(at('H').row === 1 && at('H').col === 1 && at('He').col === 18 && at('Fe').row === 4 && at('Fe').col === 8 && at('Og').row === 7 && at('Og').col === 18, 'H, He, Fe, Og in the right cells');
  ok(els.filter((e) => e.row === 9).length === 15 && els.filter((e) => e.row === 10).length === 15 && at('Ce').row === 9 && at('Th').row === 10, 'lanthanide and actinide rows of 15');
  ok([1, 2, 3, 4, 5, 6, 7].every((r) => els.filter((e) => e.row === r).length === [2, 8, 8, 18, 18, 17, 17][r - 1]) && !els.some((e) => e.row >= 6 && e.row <= 7 && e.col === 3), 'main table rows 2, 8, 8, 18, 18, 17, 17 (group 3 of periods 6–7 left to the f-block rows La–Lu, Ac–Lr)');
  ok(at('La').row === 9 && at('La').col === 3 && at('Lu').col === 17 && at('Ac').row === 10 && at('Lr').col === 17, 'La…Lu and Ac…Lr in the f-block rows');
  const detail = async () => page.evaluate(() => { const s = [...document.querySelectorAll('.el-detail .kv > span')].map((e) => e.textContent); const o = {}; for (let i = 0; i < s.length; i += 2) o[s[i]] = s[i + 1]; o.name = document.querySelector('.el-big span')?.textContent; return o; });
  ok((await detail()).name === 'Hydrogen', 'Hydrogen shown first');
  for (const [sym, name, mass, cfg, gp] of [['C', 'Carbon', '12.011', '[He] 2s2 2p2', '14 / 2'], ['Fe', 'Iron', '55.845', '[Ar] 3d6 4s2', '8 / 4'], ['Cu', 'Copper', '63.546', '[Ar] 3d10 4s1', '11 / 4'], ['Au', 'Gold', '196.97', '[Xe] 4f14 5d10 6s1', '11 / 6'], ['U', 'Uranium', '238.03', null, null], ['Og', 'Oganesson', '[294]', null, '18 / 7']]) {
    await page.locator('.el').filter({ has: page.locator('strong', { hasText: new RegExp(`^${sym}$`) }) }).click();
    const d = await detail();
    ok(d.name === name && d['Atomic mass'] === mass && (!cfg || d['Electron configuration'] === cfg) && (!gp || d['Group / period'] === gp), `${sym}: ${name}, ${mass}${cfg ? `, ${cfg}` : ''}`);
  }
  const q = page.getByPlaceholder('Search element, symbol or number…');
  for (const [t, name] of [['Na', 'Sodium'], ['potas', 'Potassium'], ['79', 'Gold'], ['og', 'Oganesson'], ['W', 'Tungsten']]) {
    await q.fill(t); await q.dispatchEvent('input'); ok((await detail()).name === name, `search "${t}" → ${name}`);
  }
  await q.fill('ne'); await q.dispatchEvent('input');
  const lit = await page.$$eval('.el:not(.dim) strong', (s) => s.map((e) => e.textContent));
  ok(lit.includes('Ne') && lit.includes('Nd') && lit.includes('Np') && !lit.includes('Fe'), `search dims non-matches (${lit.join(' ')})`);
  ok(await page.locator('.legend .legend-item').count() === 11, 'legend lists the 11 categories');
  // ---- what was wrong: a symbol typed is that element
  for (const [t, name] of [['s', 'Sulfur'], ['b', 'Boron'], ['i', 'Iodine']]) { await q.fill(t); ok((await detail()).name === name, `search "${t}" → ${name}: the symbol, not the first name that begins with it (it showed ${{ s: 'Sodium', b: 'Beryllium', i: 'Iron' }[t]})`); }
  for (const [t, name] of [['aluminum', 'Aluminium'], ['cesium', 'Caesium'], ['sulphur', 'Sulfur'], ['wolfram', 'Tungsten']]) { await q.fill(t); ok((await detail()).name === name && await page.locator('.el:not(.dim)').count() === 1, `the other spelling "${t}" finds ${name} — nothing matched before`); }
  await q.fill('noble');
  ok((await page.$$eval('.el:not(.dim) strong', (s) => s.map((e) => e.textContent))).join(' ') === 'He Ne Ar Kr Xe Rn', 'a category can be typed: "noble" lights the six noble gases');
  await q.fill('xyz');
  ok(await page.locator('.el:not(.dim)').count() === 0 && (await page.locator('.note-warn').textContent()).trim() === 'No element matches "xyz".', 'no match is said — the table just went dim');
  await q.fill('');
  ok(await page.locator('.el.dim').count() === 0 && !(await page.locator('.note-warn').count()), 'the box emptied: all elements are back');
  // ---- the legend filters, and the two go together
  await page.locator('.legend-item', { hasText: /^halogen$/ }).click();
  ok((await page.$$eval('.el:not(.dim) strong', (s) => s.map((e) => e.textContent))).join(' ') === 'F Cl Br I At' && await page.locator('.legend-item.on').count() === 1 && await page.locator('.legend-item[aria-pressed="true"]').textContent() === 'halogen', 'a press on "halogen" in the legend shows the halogens only');
  await q.fill('b');
  ok((await page.$$eval('.el:not(.dim) strong', (s) => s.map((e) => e.textContent))).join(' ') === 'Br', 'with "b" typed as well: bromine alone');
  await q.fill(''); await page.locator('.legend-item', { hasText: /^halogen$/ }).click();
  ok(await page.locator('.el.dim').count() === 0 && await page.locator('.legend-item.on').count() === 0, 'a second press shows all again');
  // ---- the element shown is marked in the table; arrow keys walk the table
  await page.locator('.el').filter({ has: page.locator('strong', { hasText: /^Fe$/ }) }).click();
  ok(await page.locator('.el.sel strong').textContent() === 'Fe' && await page.locator('.el.sel').count() === 1 && await page.locator('.el[aria-pressed="true"]').count() === 1, 'the element shown is marked in the table (nothing told which cell the card belonged to)');
  await page.keyboard.press('ArrowRight'); const right = (await detail()).name; await page.keyboard.press('ArrowDown'); const down = (await detail()).name; await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); const left = (await detail()).name;
  ok(right === 'Cobalt' && down === 'Rhodium' && left === 'Technetium', `arrow keys move through the table: Fe → Co → Rh → Tc (${right}, ${down}, ${left})`);
  await page.locator('.el').filter({ has: page.locator('strong', { hasText: /^Ba$/ }) }).click(); await page.keyboard.press('ArrowRight');
  ok((await detail()).name === 'Hafnium', 'from barium to the right: over the gap to hafnium');
  ok(await page.locator('.el-gap').allTextContents().then((t) => t.join(' ')) === '57–71 89–103', 'the two gaps in group 3 say which elements belong there (57–71, 89–103)');
  // ---- the card explains itself
  await q.fill('pm');
  ok((await detail())['Atomic mass'] === '[145]' && /Promethium has no stable isotope: \[145\] is the mass number of its longest-lived one\./.test(await page.locator('.el-detail').locator('xpath=..').innerText()), 'a mass in brackets is explained');
  await q.fill('Rf'); ok(/\(predicted\)$/.test((await detail())['Electron configuration']), 'rutherfordium: its configuration is a prediction, and marked so (104 – 108 were not)');
  await q.fill('La'); ok((await detail()).Block === 'd' && (await detail())['Group / period'] === '3 / 6', 'lanthanum: group 3, d-block'); await q.fill('Ce'); ok((await detail()).Block === 'f' && (await detail())['Group / period'] === '— / 6', 'cerium: f-block, no group');
  await q.fill('W'); ok(/Also: Wolfram\./.test(await page.locator('.el-detail').locator('xpath=..').innerText()), 'tungsten: also Wolfram');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/periodic`); await ph.locator('.el').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.locator('.ptable-scroll').evaluate((e) => e.scrollWidth > e.clientWidth), 'phone: the table scrolls inside its box, the page does not');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.el, .legend-item')].every((e) => { const r = e.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; })), 'phone: every element and every legend entry is a 44 px touch target (the cells were 40 px, the legend was not pressable at all)');
  await ph.locator('.legend-item', { hasText: /^noble gas$/ }).tap();
  ok(await ph.locator('.el:not(.dim)').count() === 6 && !ph.errors.length, `phone: the legend filters at a tap; no page errors ${ph.errors.join(' | ')}`);
};
