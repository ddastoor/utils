// Countdown (#/countdown): h:mm:ss display (whole seconds, rounded up), presets fill the fields, pause/resume under a
// fake clock, alarm (4 beeps + vibration + "done" state + tab title), restart, zero / negative input, phone layout.
import { phoneLayout } from './_phone.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(), T0 = new Date('2026-11-16T10:00:00Z').getTime();
  await page.addInitScript(() => {
    window.__beeps = []; window.__vib = 0;
    const s = OscillatorNode.prototype.start; OscillatorNode.prototype.start = function (...a) { window.__beeps.push(this.frequency.value); return s.apply(this, a); };
    navigator.vibrate = () => { window.__vib++; return true; };
  });
  await page.clock.install({ time: T0 });
  await page.goto(`${base}#/countdown`);
  const disp = page.locator('.timer-display'); await disp.waitFor();
  await page.clock.pauseAt(T0 + 60000);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }), shown = () => disp.textContent();
  const f = (l) => page.locator('label.field', { hasText: l }).locator('input');
  const set = async (hh, mm, ss) => { await f('Hours').fill(String(hh)); await f('Minutes').fill(String(mm)); await f('Seconds').fill(String(ss)); };
  const beeps = () => page.evaluate(() => window.__beeps.length), isDone = () => disp.evaluate((e) => e.classList.contains('done'));
  const base0 = await page.title();
  ok(await shown() === '05:00' && base0 === 'Countdown Timer · SuperTools', 'default 5 minutes');
  await set(1, 30, 45); ok(await shown() === '1:30:45', `1 h 30 min 45 s → 1:30:45 (${await shown()})`);
  await set(0, 0, 90); ok(await shown() === '01:30', '90 seconds → 01:30');
  await page.locator('.chip-btn', { hasText: '3 min' }).click(); ok(await shown() === '03:00' && await f('Minutes').inputValue() === '3', '"3 min" preset');
  await page.locator('.chip-btn', { hasText: '1 hour' }).click(); ok(await shown() === '1:00:00' && await f('Hours').inputValue() === '1' && await f('Minutes').inputValue() === '0', '"1 hour" preset sets 1 h 0 min');
  await set(0, 0, 3); await btn('Start').click();
  ok(await btn('Pause').count() === 1, 'Start → Pause');
  await page.clock.runFor(1100); ok(await shown() === '00:02', `after 1.1 s: 00:02 (${await shown()})`);
  ok(/^00:0[23] · Countdown$/.test(await page.title()), `tab title shows the time left (${await page.title()})`);
  await page.clock.runFor(400); ok(await shown() === '00:02', 'after 1.5 s still 00:02 (rounded up)');
  await btn('Pause').click(); await page.clock.runFor(5000);
  ok(await shown() === '00:02' && await btn('Start').count() === 1 && !await isDone(), 'paused: time frozen');
  ok(await page.title() === base0, `paused: normal tab title (${await page.title()})`);
  await btn('Start').click(); await page.clock.runFor(1400); // 0.1 s left
  ok(await shown() === '00:01' && !await isDone() && await beeps() === 0, 'resumed: 0.1 s left shows 00:01, no alarm yet');
  await page.clock.runFor(200);
  ok(await shown() === '00:00' && await isDone() && await btn('Start').count() === 1, 'reaches 00:00 and stops');
  ok(await beeps() === 4 && await page.evaluate(() => window.__vib) === 1 && await page.evaluate(() => window.__beeps.every((x) => x === 880)), `alarm: 4 beeps at 880 Hz + vibration (${await beeps()})`);
  ok(await page.title() === 'Time’s up · Countdown', `tab title says time is up (${await page.title()})`);
  await page.clock.runFor(3000); ok(await beeps() === 4, 'alarm does not repeat');
  await btn('Start').click(); ok(!await isDone(), 'Start after the alarm restarts');
  await page.clock.runFor(1100); ok(await shown() === '00:02', `restarted from the full 3 s (${await shown()})`);
  await f('Seconds').fill('10'); ok(await shown() === '00:10' && await btn('Start').count() === 1, 'editing a field while running resets and stops');
  await btn('Reset').click(); ok(await shown() === '00:10', 'Reset keeps the set time');
  await page.evaluate(() => (window.__beeps = []));
  await set(0, 0, 0); await btn('Start').click(); await page.clock.runFor(1000);
  ok(await beeps() === 0 && !await isDone() && await btn('Start').count() === 1, 'zero time: Start does nothing (no instant alarm)');
  await set(0, -5, 10); ok(await shown() === '00:10', `negative minutes count as 0 (${await shown()})`);
  await set(0, 0, 1.5); ok(await shown() === '00:02', 'fractional seconds round up on the display');
  await set(0, 0, 5); await btn('Start').click(); await page.clock.runFor(1000);
  await page.goto(`${base}#/stopwatch`); await page.locator('.timer-display').waitFor();
  ok(!/Countdown/.test(await page.title()), `leaving the tab restores the title (${await page.title()})`);
  await page.clock.runFor(6000); ok(await page.evaluate(() => window.__beeps.length) === 0, 'leaving the tab stops the timer (no alarm later)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'countdown', { ready: '.timer-display', buttons: ['Start', 'Reset'] });
};
