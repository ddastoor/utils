// Sleep Cycle (#/sleep): 90-minute cycles back from a wake-up time or forward from bedtime, falling-asleep time,
// across midnight.
import { calc } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ locale: 'en-US' }); await page.goto(`${base}#/sleep`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const rows = async () => Object.values(await c.rows()).map((s) => s.replace(/\s/g, ' '));
  ok((await rows()).join(' | ') === '9:15 PM | 10:45 PM | 12:15 AM | 1:45 AM', `wake 6:30, 15 min to fall asleep → 9:15 PM, 10:45 PM, 12:15 AM, 1:45 AM (${(await rows()).join(' | ')})`);
  ok(/9:15 PM\s+or\s+10:45 PM/.test(await c.big('Go to bed at')), 'best two bedtimes highlighted');
  await c.set('Time to fall asleep', 0);
  ok((await rows())[0] === '9:30 PM', '0 min to fall asleep → 9:30 PM for 6 cycles');
  await c.seg('I want to', 'Go to bed at…'); await c.set('Time', '23:00'); await c.set('Time to fall asleep', 15);
  ok((await rows()).join(' | ') === '8:15 AM | 6:45 AM | 5:15 AM | 3:45 AM', `bed 11 PM → alarms 8:15, 6:45, 5:15, 3:45 AM (${(await rows()).join(' | ')})`);
  ok(Object.keys(await c.rows())[0] === '6 cycles (9 h sleep)', 'cycle labels');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/sleep`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
