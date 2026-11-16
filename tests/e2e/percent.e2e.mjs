// Percentage (#/percent): all six question types with known answers, negative change, decimals, division by zero.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/percent`);
  await page.locator('.pct-out').first().waitFor();
  const card = (title) => page.locator('.card').filter({ has: page.getByText(title, { exact: true }) });
  const ask = async (title, a, b) => { const k = card(title); await k.getByLabel('A').fill(String(a)); await k.getByLabel('B').fill(String(b)); return (await k.locator('.pct-out').textContent()).trim(); };
  const cases = [
    ['What is A% of B?', 15, 2400, '360'], ['What is A% of B?', 12.5, 80, '10'], ['What is A% of B?', 150, 40, '60'],
    ['A is what % of B?', 45, 60, '75%'], ['A is what % of B?', 1, 3, '33.333333%'],
    ['% change from A to B', 80, 100, '+25%'], ['% change from A to B', 100, 80, '-20%'], ['% change from A to B', 50, 50, '+0%'],
    ['A increased by B%', 500, 18, '590'], ['A decreased by B% (discount)', 1999, 30, '1,399.3'], ['A is B% of what?', 30, 20, '150'],
  ];
  for (const [t, a, b, want] of cases) { const got = await ask(t, a, b); ok(got === want, `${t} A=${a} B=${b} → ${want} (${got})`); }
  ok(await ask('A is what % of B?', 5, 0) === '—', 'divide by zero shows — (not —%)');
  ok(await ask('% change from A to B', 0, 10) === '—', 'change from 0 shows —');
  ok(await ask('What is A% of B?', '', 10) === '—', 'empty input shows —');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/percent`); await ph.locator('.pct-out').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
