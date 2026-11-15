// Math & Science tools via the real UI.
export default async ({ base, page: newPage, ok }) => {
  const page = await newPage();
  await page.goto(base + '#/graph'); await page.waitForSelector('canvas.graph-canvas');
  const drawn = await page.evaluate(() => { const c = document.querySelector('canvas.graph-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let colored = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 150 && d[i] < 120) colored++; return colored; });
  ok(drawn > 200, `graph: curves drawn (${drawn} accent pixels)`);
  await page.goto(base + '#/equation'); await page.getByRole('button', { name: 'Solve' }).click();
  ok((await page.locator('.big-value').count()) === 3, 'equation: x³−2x=1 → 3 roots');
  await page.getByRole('radio', { name: 'Quadratic' }).click(); await page.getByRole('button', { name: 'Solve' }).click();
  ok((await page.locator('.big-value').allTextContents()).join(',') === '2,1', 'quadratic 1,−3,2 → 2,1');
  await page.getByRole('radio', { name: 'Simultaneous (linear)' }).click(); await page.getByRole('button', { name: 'Solve' }).click();
  ok((await page.locator('.big-value').allTextContents()).join(',') === '1,2', 'linear system → x=1,y=2');
  await page.goto(base + '#/stats'); await page.waitForSelector('.big-value');
  ok((await page.locator('.big-value').allTextContents()).slice(0, 3).join('|') === '20.3333333333|21|24', 'stats: mean, median, mode');
  await page.goto(base + '#/matrix'); await page.getByRole('button', { name: 'det(A)' }).click();
  ok((await page.locator('.mat-out').textContent()) === '18', 'matrix det');
  await page.goto(base + '#/fraction'); await page.waitForSelector('.big-value');
  ok((await page.locator('.big-value').first().textContent()) === '17/6', 'fraction 3/4 + 5/6×2½ = 17/6');
  await page.goto(base + '#/primes'); await page.waitForSelector('.big-value');
  ok((await page.locator('.big-value').allTextContents()).join(',') === '1,360360', 'gcd/lcm of 360,84,1001');
  ok(/2\^3 × 3\^2 × 5/.test(await page.locator('.kv').innerText()), 'factorisation of 360');
  await page.goto(base + '#/periodic'); await page.locator('.el', { hasText: 'Fe' }).first().click();
  ok(/Iron/.test(await page.locator('.el-detail').innerText()), 'periodic: Fe → Iron');
  ok((await page.locator('.ptable .el').count()) === 118, 'periodic: 118 elements');
  ok(!page.errors.length, 'no console errors ' + page.errors.join(' | '));
};
