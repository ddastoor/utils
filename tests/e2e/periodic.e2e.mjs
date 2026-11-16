// Periodic Table (#/periodic): all 118 elements in a consistent layout (no two in one cell, f-block rows), IUPAC data
// spot checks, search by name/symbol/number, the detail card, phone layout.
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
  ok(await page.locator('.legend span').count() === 11, 'legend lists the 11 categories');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/periodic`); await ph.locator('.el').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.locator('.ptable-scroll').evaluate((e) => e.scrollWidth > e.clientWidth), 'phone: the table scrolls inside its box, the page does not');
};
