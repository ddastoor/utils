// Number Base Converter (#/base): every field updates from any other, arbitrary precision (2^128), prefixes and
// separators, custom base, invalid digits flagged without changing the others.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/base`);
  const f = (l) => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${l.replace(/[()]/g, '\\$&')}$`) }) }).locator('input');
  const B = { 2: 'Binary (base 2)', 8: 'Octal (base 8)', 10: 'Decimal (base 10)', 16: 'Hexadecimal (base 16)', 36: 'Base 36 (base 36)' };
  const set = async (l, v) => { await f(l).fill(v); await f(l).dispatchEvent('input'); };
  const all = async () => Object.fromEntries(await Promise.all(Object.entries(B).map(async ([b, l]) => [b, (await f(l).inputValue()).toLowerCase()])));
  await page.waitForFunction(() => document.querySelectorAll('input').length > 5 && [...document.querySelectorAll('input')].some((i) => i.value === '11111111'));
  let v = await all();
  ok(v[2] === '11111111' && v[8] === '377' && v[16] === 'ff' && v[36] === '73', `255 → 11111111 / 377 / ff / 73 (${JSON.stringify(v)})`);
  await set(B[16], 'DEADBEEF'); v = await all();
  ok(v[10] === '3735928559' && v[2] === (0xdeadbeef).toString(2) && v[8] === (0xdeadbeef).toString(8), 'hex DEADBEEF → 3735928559');
  const big = (2n ** 128n).toString();
  await set(B[10], big); v = await all();
  ok(v[16] === '1' + '0'.repeat(32) && v[2] === '1' + '0'.repeat(128) && v[36] === (2n ** 128n).toString(36), '2^128 exactly (beyond 64-bit)');
  await set(B[2], '0b1010_1010'); v = await all();
  ok(v[10] === '170', `0b prefix and _ separators (${v[10]})`);
  await set(B[16], '0x7f'); v = await all();
  ok(v[10] === '127', '0x prefix');
  await set(B[36], 'zz'); v = await all();
  ok(v[10] === '1295', 'base 36 zz = 1295');
  await set(B[2], '1021');
  ok(await f(B[2]).evaluate((e) => e.classList.contains('bad')) && (await all())[10] === '1295', 'digit 2 in binary flagged, other fields unchanged');
  await set(B[10], '255');
  const cust = page.locator('.field').filter({ hasText: 'Custom base' }).first().locator('input'), out = page.locator('.field').filter({ hasText: 'Value in custom base' }).locator('input');
  await cust.fill('3'); await cust.dispatchEvent('input');
  ok(await out.inputValue() === (255).toString(3), `custom base 3: 255 = ${(255).toString(3)}`);
  await cust.fill('7'); await cust.dispatchEvent('input');
  ok(await out.inputValue() === (255).toString(7), 'custom base 7');
  await out.fill('1000'); await out.dispatchEvent('input');
  ok((await all())[10] === '343', 'typing in the custom base updates the others (7³ = 343)');
  await set(B[10], '0'); v = await all();
  ok(v[2] === '0' && v[16] === '0', 'zero');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/base`); await ph.locator('input').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
