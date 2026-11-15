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
};
