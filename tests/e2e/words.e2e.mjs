// Number to Words (#/words): Indian (lakh/crore) and international systems, rupees/paise, dollars/cents, plain
// numbers with decimals, the largest supported values, invalid input.
import { calc } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/words`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const say = async (n) => { await c.set('Amount', n); return c.big('In words'); };
  ok(await say('1234567.50') === 'Rupees Twelve Lakh Thirty-Four Thousand Five Hundred and Sixty-Seven and Fifty Paise Only', 'cheque style with paise');
  ok(await c.row('Digits') === '12,34,567.50', 'Indian digit grouping');
  ok(await say('1') === 'Rupees One Only', 'one rupee');
  ok(await say('100000') === 'Rupees One Lakh Only', 'one lakh');
  ok(await say('10000000') === 'Rupees One Crore Only', 'one crore');
  ok(await say('250000000') === 'Rupees Twenty-Five Crore Only', '25 crore');
  ok(await say('0.05') === 'Rupees Zero and Five Paise Only', 'paise only');
  ok(await say('₹ 1,00,001') === 'Rupees One Lakh One Only', 'symbols and commas accepted');
  await c.seg('System', 'International (million)');
  ok(await say('1234567') === 'Rupees One Million Two Hundred and Thirty-Four Thousand Five Hundred and Sixty-Seven Only', 'international: million');
  ok(await c.row('Digits') === '1,234,567', 'international grouping');
  await c.seg('Currency', 'Dollars');
  ok(await say('19.99') === 'Nineteen Dollars and Ninety-Nine Cents Only', 'dollars and cents');
  await c.seg('Currency', 'Plain number');
  ok(await say('3.05') === 'Three point zero five', 'plain number with decimals');
  ok(await say('1000000000') === 'One Billion', 'one billion');
  await c.set('Amount', '12.345');
  ok(/up to 2 decimals/.test(await c.warn()), 'three decimals refused');
  await c.set('Amount', 'abc');
  ok(/positive number/.test(await c.warn()), 'text refused');
  await c.set('Amount', '12345678901234567890');
  ok(/too large/i.test(await c.warn()), '20 digits refused');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/words`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll (long words wrap)');
};
