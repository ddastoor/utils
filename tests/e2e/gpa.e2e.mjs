// GPA / CGPA (#/gpa): credit-weighted average, CBSE/AICTE percentage (× 9.5), adding/removing subjects, 4-point scale,
// blank rows ignored, nothing entered.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/gpa`);
  await page.locator('.big-value').first().waitFor();
  const big = (l) => page.locator('.big-result').filter({ hasText: l }).locator('.big-value').textContent();
  const rowsIn = () => page.locator('.gpa-row');
  const setRow = async (i, g, cr) => { const r = rowsIn().nth(i); for (const [k, v] of [[0, g], [1, cr]]) { const inp = r.locator('input').nth(k); await inp.fill(String(v)); await inp.dispatchEvent('input'); } };
  ok(await big('GPA / CGPA') === '8.89' && await big('Percentage') === '84.44%', 'default 9×4, 8×3, 10×2 → 80/9 = 8.89, 84.44 %');
  await page.getByRole('button', { name: 'Add subject' }).click();
  await setRow(3, 6, 1);
  ok(await big('GPA / CGPA') === '8.6', `adding 6 × 1 credit → 86/10 = 8.6 (${await big('GPA / CGPA')})`);
  await rowsIn().nth(0).getByRole('button', { name: 'Remove' }).click();
  ok(await rowsIn().count() === 3 && await big('GPA / CGPA') === '8.33', `removing 9 × 4 → 50/6 = 8.33 (${await big('GPA / CGPA')})`);
  await setRow(2, '', 4);
  ok(await big('GPA / CGPA') === '8.8', `a row without a grade is ignored: 44/5 = 8.8 (${await big('GPA / CGPA')})`);
  await page.getByRole('radio', { name: '4-point', exact: true }).click();
  for (let i = 0; i < 3; i++) await setRow(i, [4, 3.7, 3.3][i], [3, 4, 3][i]);
  ok(await big('GPA / CGPA') === '3.67' && await big('Total credits') === '10', `4-point: (12 + 14.8 + 9.9)/10 = 3.67, 10 credits (${await big('GPA / CGPA')})`);
  for (let i = 0; i < 3; i++) await setRow(i, '', '');
  ok(await big('GPA / CGPA') === '—', 'nothing entered → —');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/gpa`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
