// Sleep Cycle (#/sleep): whole 90-minute cycles back from a wake-up time or forward from a bedtime (or from now),
// plus the time it takes to fall asleep — against Python's datetime (tests/fixtures/body/reference.json); the day a
// time falls on; what is refused; "now" follows the clock; phone layout.
import { readFileSync } from 'node:fs';
import { calc } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/body/reference.json', import.meta.url), 'utf8'));
const clean = (s) => s.replace(/\s/g, ' ');
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ locale: 'en-US' }); await page.goto(`${base}#/sleep`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const rows = async (p = c) => Object.values(await p.rows()).map(clean);
  ok((await rows()).join(' | ') === '9:15 PM (the day before) | 10:45 PM (the day before) | 12:15 AM | 1:45 AM', `up at 6:30 with 15 minutes to fall asleep: to bed at 9:15 PM or 10:45 PM the day before, 12:15 AM or 1:45 AM (${(await rows()).join(' | ')})`);
  ok(/^9:15 PM\s+or\s+10:45 PM$/.test(await c.big('Go to bed at')) && Object.keys(await c.rows()).join(' | ') === '6 cycles (9 h sleep) | 5 cycles (7.5 h sleep) | 4 cycles (6 h sleep) | 3 cycles (4.5 h sleep)', 'the two longest nights on top; a row for 6, 5, 4 and 3 cycles');
  await hookClipboard(page); await page.locator('.big-result').first().click();
  ok(clean((await copied(page))[0] || '') === '9:15 PM  or  10:45 PM', 'a click copies the times');
  await c.set('Time to fall asleep', 0);
  ok((await rows())[0] === '9:30 PM (the day before)', 'falling asleep at once: 9:30 PM for 6 cycles');
  await c.set('Time to fall asleep', '');
  ok((await rows())[0] === '9:30 PM (the day before)' && !(await c.warn()), 'an empty box counts as 0 minutes');
  await c.seg('I want to', 'Go to bed at…'); await c.set('Time', '23:00'); await c.set('Time to fall asleep', 15);
  ok((await rows()).join(' | ') === '8:15 AM (the next day) | 6:45 AM (the next day) | 5:15 AM (the next day) | 3:45 AM (the next day)' && /^8:15 AM\s+or\s+6:45 AM$/.test(await c.big('Set alarm for')), `to bed at 11 PM: the alarm at 8:15 or 6:45 AM, the next day (${(await rows()).join(' | ')})`);

  // ---- nights of the reference, on a 24-hour clock
  const gb = await newPage({ locale: 'en-GB' }); await gb.goto(`${base}#/sleep`); const g = calc(gb); await gb.locator('.big-value').first().waitFor();
  let bad = [];
  for (const [mode, time, fall, want] of ref.sleep.filter((_, i) => i % 9 === 0)) {
    await g.seg('I want to', mode === 'wake' ? 'Wake up at…' : 'Go to bed at…'); await g.set('Time', time); await g.set('Time to fall asleep', fall);
    const exp = want.map(([, hhmm, day]) => `${hhmm.replace(/^0/, '')}${day < 0 ? ' (the day before)' : day > 0 ? ' (the next day)' : ''}`).join(' | '), got = (await rows(g)).join(' | ');
    if (got !== exp || !new RegExp(`^${exp.split(' | ')[0].replace(/ \(.*/, '')}\\s+or\\s+`).test(await g.big(mode === 'wake' ? 'Go to bed at' : 'Set alarm for'))) bad.push(`${mode} ${time} +${fall}: ${got} ≠ ${exp}`);
  }
  ok(!bad.length, `45 nights of the reference: every time and the day it falls on ${bad.slice(0, 2).join(' | ')}`);

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  const FALL = 'Time to fall asleep: a whole number of minutes from 0 to 180.';
  await c.set('Time to fall asleep', -30); await refused('−30 minutes to fall asleep (it moved the bedtime the other way)', FALL);
  await c.set('Time to fall asleep', 15.5); await refused('15.5 minutes (it showed 9:14 for 9:14½)', FALL);
  await c.set('Time to fall asleep', 100000); await refused('1,00,000 minutes (the times went round the clock 69 times)', FALL);
  await c.set('Time to fall asleep', 181); await refused('181 minutes', FALL);
  await c.set('Time to fall asleep', 15); await page.locator('.tool-body input[type=time]').fill('');
  await refused('no time (it worked with the time at which the tab was opened)', 'Choose a time.');
  await c.set('Time', '06:30'); await c.seg('I want to', 'Wake up at…');
  ok((await rows())[0] === '9:15 PM (the day before)', 'after the refusals the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- going to bed now: the clock on the wall, and it moves on
  const now = await newPage({ locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  await now.clock.install({ time: new Date('2026-11-19T22:10:20+05:30') });
  await now.goto(`${base}#/sleep`); const n = calc(now); await now.locator('.big-value').first().waitFor();
  await n.seg('I want to', 'Go to bed now');
  ok(/^7:25 AM\s+or\s+5:55 AM$/.test(await n.big('Going to bed now (10:10 PM), set the alarm for')) && !(await now.locator('.tool-body input[type=time]').isVisible()), `going to bed now, at 10:10 PM: the alarm at 7:25 or 5:55 AM; the time box is put away (${await now.locator('.big-result').innerText()})`);
  await now.clock.runFor(60000);
  ok(/^7:26 AM\s+or\s+5:56 AM$/.test(await n.big('Going to bed now (10:11 PM), set the alarm for').catch(() => '')), `a minute later the times have moved on (${clean(await now.locator('.big-result').innerText())})`);
  await n.set('Time to fall asleep', 0);
  ok(/^7:11 AM\s+or\s+5:41 AM$/.test(await n.big('Going to bed now (10:11 PM), set the alarm for')), 'falling asleep at once, from now');
  await n.seg('I want to', 'Wake up at…');
  ok(await now.locator('.tool-body input[type=time]').isVisible() && /^9:30 PM\s+or\s+11:00 PM$/.test(await n.big('Go to bed at')), 'back to a wake-up time: the box and its time are there again');
  await now.goto(`${base}#/`); await now.clock.runFor(120000);
  ok(!now.errors.length, `leaving the tab stops its clock: no page errors ${now.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/sleep`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll (three choices in the first row)');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .seg-btn, .tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: boxes and choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
