// bc console in the Scientific Calculator tab (PC only): BusyBox bc from our wasm build, state kept across lines.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/calc');
  await page.waitForSelector('.bc-in', { timeout: 20000 });
  const ask = async (q) => {
    const n = await page.locator('.bc-out > div').count();
    await page.locator('.bc-in').fill(q); await page.locator('.bc-in').press('Enter');
    await page.waitForFunction((n) => document.querySelectorAll('.bc-out > div').length > n && !document.querySelector('.bc-in')?.disabled, n, { timeout: 30000 });
    const items = await page.locator('.bc-out > div').allTextContents();
    return items.slice(n + 1).join('\n');
  };
  ok((await ask('scale=30; 4*a(1)')).startsWith('3.1415926535897932384626433832'), 'pi (bc truncates the last digits at scale=30)');
  ok((await ask('2^256')) === '115792089237316195423570985008687907853269984665640564039457584007913129639936', '2^256 exact (long lines joined)');
  await ask('x = 2^100');
  ok((await ask('x + 1')) === '1267650600228229401496703205377', 'variables persist across lines');
  await ask('define sq(n) { return n*n; }');
  ok((await ask('sq(12)')) === '144', 'user-defined functions persist');
  ok(/^1\.41421356/.test(await ask('sqrt(2)')), 'sqrt with the maths library');
  ok((await ask('obase=16; 255')) === 'FF', 'obase=16');
  const before = await page.locator('.bc-err').count();
  await ask('1/0');
  ok((await page.locator('.bc-err').count()) > before, 'errors shown, session keeps working');
  ok((await ask('7*6')) === '2A', 'session continues after an error (obase still 16)');
  await page.locator('.bc-in').press('ArrowUp');
  ok((await page.locator('.bc-in').inputValue()) === '7*6', 'history with ArrowUp');
  ok((await page.locator('.calc-expr').count()) === 1, 'keypad calculator still present beside it');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/calc');
  await phone.waitForSelector('.calc-expr', { timeout: 20000 });
  ok((await phone.locator('.bc-in').count()) === 0, 'phone: keypad only, no bc console (PC only)');
};
