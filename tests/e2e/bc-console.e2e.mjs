// bc console in the Scientific Calculator tab (PC only): BusyBox bc from our wasm build, state kept across lines; every
// number printed gets a name (A … Z, AA …, at the end of its row), used later as $A — to-do #10.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/calc');
  await page.waitForSelector('.bc-in', { timeout: 20000 });
  // the rows a line adds: [value, name] — the value as shown, the name at the row's end (null where there is none)
  const rows = async (q) => {
    const n = await page.locator('.bc-out > div').count();
    await page.locator('.bc-in').fill(q); await page.locator('.bc-in').press('Enter');
    await page.waitForFunction((n) => document.querySelectorAll('.bc-out > div').length > n && !document.querySelector('.bc-in')?.disabled, n, { timeout: 30000 });
    return page.$$eval('.bc-out > div', (ds, n) => ds.slice(n + 1).map((d) => [d.querySelector('.bc-v')?.textContent ?? d.textContent, d.querySelector('.bc-var')?.textContent ?? null]), n);
  };
  const ask = async (q) => (await rows(q)).map(([v]) => v).join('\n');
  const lastErr = () => page.locator('.bc-err').last().textContent();

  // ---- bc as before
  ok((await ask('scale=30; 4*a(1)')).startsWith('3.1415926535897932384626433832'), 'pi (bc truncates the last digits at scale=30)');
  ok((await ask('2^256')) === '115792089237316195423570985008687907853269984665640564039457584007913129639936', '2^256 exact (long lines joined)');
  await ask('x = 2^100');
  ok((await ask('x + 1')) === '1267650600228229401496703205377', 'variables persist across lines');
  await ask('define sq(n) { return n*n; }');
  ok((await ask('sq(12)')) === '144', 'user-defined functions persist');
  ok(/^1\.41421356/.test(await ask('sqrt(2)')), 'sqrt with the maths library');

  // ---- the names (to-do #10)
  const names = await page.$$eval('.bc-out .bc-a', (ds) => ds.map((d) => d.querySelector('.bc-var')?.textContent ?? null));
  ok(JSON.stringify(names) === JSON.stringify(['$A', '$B', '$C', '$D', '$E']), `every result has a name, A, B, C … in turn; an assignment prints nothing and takes none (${names.join(' ')})`);
  ok(await page.$eval('.bc-out .bc-a', (d) => d.lastElementChild?.classList.contains('bc-var') && d.lastElementChild.getBoundingClientRect().right > d.querySelector('.bc-v').getBoundingClientRect().right), 'the name stands at the right end of its row');
  ok((await ask('$b / 2^255')) === '2.000000000000000000000000000000', '$b is B (any case): 2^256 / 2^255, at scale=30');
  ok((await ask('$C - x')) === '1', '$C is the value bc printed: x + 1 − x (a difference keeps the scale of its numbers)');
  let r = await rows('$total = 7 * 6');
  ok(JSON.stringify(r) === JSON.stringify([['42', '$total']]), `$total = 7 * 6: the row is named by the user (${JSON.stringify(r)})`);
  ok((await ask('$TOTAL + 1')) === '43', '$TOTAL is $total');
  await rows('$Total = 1'); ok(/^\$total is set already \(42\)/.test(await lastErr()), 'a $ name keeps its value: setting it again is refused, with what it holds');
  await rows('$A++'); ok(/^\$A cannot be changed: it holds 3\.14159/.test(await lastErr()), '$A++ refused: a $ name cannot be changed');
  await rows('$b += 1'); ok(/^\$B cannot be changed/.test(await lastErr()), '$b += 1 refused');
  await rows('$nope * 2'); ok(/^\$nope is not set/.test(await lastErr()), 'a name that is not set is said');
  r = await rows('for (i = 1; i <= 3; i++) i * 10');
  ok(JSON.stringify(r) === JSON.stringify([['10', '$I'], ['20', '$J'], ['30', '$K']]), `a loop prints three rows: three names (F, G, H went to the rows above, the user's “total” took none of the letters) (${JSON.stringify(r)})`);
  r = await rows('print "cost $A\\n"');
  ok(JSON.stringify(r) === JSON.stringify([['cost $A', null]]), `text is not a number: no name, and $A inside a string stays as typed (${JSON.stringify(r)})`);
  await rows('$d = 1'); ok(/^\$D is set already/.test(await lastErr()), '$d = 1 when D holds a result: refused');
  r = await rows('$m = 2'); const after = await rows('5');
  ok(JSON.stringify(r) === JSON.stringify([['2', '$m']]) && JSON.stringify(after) === JSON.stringify([['5', '$L']]), 'the user takes m; the next automatic name is L');
  const skip = await rows('6'); const skip2 = await rows('7');
  ok(JSON.stringify([skip[0][1], skip2[0][1]]) === JSON.stringify(['$N', '$O']), `… and M is skipped: it is the user's (${skip[0][1]}, ${skip2[0][1]})`);
  await page.locator('.bc-in').fill('2 * ');
  await page.locator('.bc-out .bc-var', { hasText: '$total' }).click();
  ok((await page.locator('.bc-in').inputValue()) === '2 * $total', 'a click on a name puts it into the input, where the cursor is');
  await page.locator('.bc-in').press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.bc-out .bc-v')].pop()?.textContent === '84', null, { timeout: 30000 });
  ok(true, '2 * $total = 84');

  // ---- bc as before (obase, errors, history) — after the names, which do not disturb it
  ok((await ask('obase=16; 255')) === 'FF', 'obase=16');
  const before = await page.locator('.bc-err').count();
  await ask('1/0');
  ok((await page.locator('.bc-err').count()) > before, 'errors shown, session keeps working');
  ok((await ask('7*6')) === '2A', 'session continues after an error (obase still 16)');
  await page.locator('.bc-in').press('ArrowUp');
  ok((await page.locator('.bc-in').inputValue()) === '7*6', 'history with ArrowUp');
  await page.getByRole('button', { name: 'Clear session' }).click();
  r = await rows('1 + 1');
  ok(JSON.stringify(r) === JSON.stringify([['2', '$A']]), `Clear session starts the names again at A (${JSON.stringify(r)})`);
  ok((await page.locator('.calc-expr').count()) === 1, 'keypad calculator still present beside it');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/calc');
  await phone.waitForSelector('.calc-expr', { timeout: 20000 });
  ok((await phone.locator('.bc-in').count()) === 0, 'phone: keypad only, no bc console (PC only)');
};
