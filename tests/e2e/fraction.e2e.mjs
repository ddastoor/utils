// Fraction Calculator (#/fraction): exact arithmetic with mixed numbers, decimals converted exactly, powers,
// negatives, lowest terms, ÷ 0 and overflow reported.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/fraction`);
  const ex = page.getByLabel('Expression');
  const big = (l) => page.locator('.big-result').filter({ has: page.locator('.big-label', { hasText: new RegExp(`^${l}$`) }) }).locator('.big-value').textContent();
  const warn = async () => ((await page.locator('.note-warn').count()) ? (await page.locator('.note-warn').textContent()).trim() : '');
  const put = async (s) => { await ex.fill(s); await ex.dispatchEvent('input'); };
  const run = async (s) => { await ex.fill(s); await ex.dispatchEvent('input'); return [await big('Fraction'), await big('Mixed number'), await big('Decimal')]; };
  await page.locator('.big-value').first().waitFor();
  ok((await run('3/4 + 5/6 × 2 1/2')).join(' | ') === '17/6 | 2 5/6 | 2.8333333333333', 'default 3/4 + 5/6 × 2½ = 17/6 = 2 5/6');
  for (const [e, frac, mixed] of [['1/3 + 1/6', '1/2', '1/2'], ['0.75', '3/4', '3/4'], ['0.125 + 1/8', '1/4', '1/4'], ['-7/4', '-7/4', '-1 3/4'], ['(1/2)^3', '1/8', '1/8'], ['(2/3)^-2', '9/4', '2 1/4'],
    ['1/3 ÷ 2/3', '1/2', '1/2'], ['1/2 - 1/2', '0', '0'], ['6/4', '3/2', '1 1/2'], ['1 1/2 + 2 3/4', '17/4', '4 1/4'], ['-1 1/2 × 2', '-3', '-3'], ['3', '3', '3'], ['1/7 + 1/11 + 1/13', '311/1001', '311/1001'],
    ['(1 + 1/2) × (1 - 1/3)', '1', '1'], ['2.5 / 0.5', '5', '5'], ['2/3^2', '2/9', '2/9'], ['3/4 × 2/3', '1/2', '1/2'], ['2 1/2 ÷ 1/2', '5', '5']]) {
    const [f, m] = await run(e);
    ok(f === frac && m === mixed, `${e} = ${frac} (${f}, ${m})`);
  }
  await put('1/0'); ok(/zero/i.test(await warn()), `÷ 0 reported (${await warn()})`);
  await put('99999999999/7 × 99999999999/11 × 99999999999/13'); ok(/too large|overflow/i.test(await warn()), `overflow reported (${await warn()})`);
  await put('abc'); ok(await warn() !== '', `nonsense reported (${await warn()})`);
  await put('(1/2'); ok(await warn() !== '', 'unbalanced bracket reported');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/fraction`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
