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
    // the audio of the alarm: when it is opened, and that it is closed when the tab is left
    const AC = window.AudioContext; window.__ac = { made: 0, closed: 0 };
    window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ac.made++; } close() { window.__ac.closed++; return super.close(); } };
    // the screen wake lock, as the browser gives it: a sentinel that the browser lets go when the tab is hidden
    window.__wl = { req: 0, active: 0, list: [] }; window.__wlDelay = 0;
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => new Promise((res) => { window.__wl.req++; setTimeout(() => {
      const s = new EventTarget(); s.released = false; s.release = async () => { if (!s.released) { s.released = true; window.__wl.active--; s.dispatchEvent(new Event('release')); } };
      window.__wl.active++; window.__wl.list.push(s); res(s); }, window.__wlDelay); }) } });
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
  ok(await page.evaluate(() => window.__ac.made >= 1 && window.__ac.closed === window.__ac.made), `leaving the tab closes the alarm's audio (${JSON.stringify(await page.evaluate(() => window.__ac))})`);

  // --- what the tab does when nobody looks at it
  await page.goto(`${base}#/countdown`); await disp.waitFor(); await page.evaluate(() => { window.__beeps = []; window.__ac.made = 0; });
  await set(0, 0, 10); await btn('Start').click();
  ok(await page.evaluate(() => window.__ac.made) === 1, 'the alarm\'s audio is opened by the Start click (Safari plays sound only after a tap; the alarm itself comes from a timer)');
  await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; }); // a tab in the background draws no frames
  await page.clock.runFor(3000);
  ok(await page.title() === '00:07 · Countdown', `background tab: the tab's title keeps counting (${await page.title()}; it stood still without frames)`);
  await page.clock.runFor(7200); ok(await isDone(), 'background tab: time is up at the end');
  // the alarm comes from the timeout set at Start alone: no frames, no interval
  await page.evaluate(() => { window.__si = window.setInterval; window.setInterval = () => 0; window.__beeps = []; });
  await set(0, 0, 3); await btn('Start').click(); await page.clock.runFor(3200);
  ok(await beeps() === 4 && await isDone() && await shown() === '00:00', `background tab: the alarm sounds at the end without a single frame (it waited until the tab was looked at) — ${await beeps()} beeps`);
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf; window.setInterval = window.__si; });
  // the wake lock: asked for at Start, asked for again when the tab is shown (the browser lets it go when the tab is hidden),
  // let go at Pause — also when it arrives after the Pause
  const vis = (v) => page.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); if (v === 'hidden') for (const s of window.__wl.list) s.release(); document.dispatchEvent(new Event('visibilitychange')); }, v);
  const wl = () => page.evaluate(() => ({ ...window.__wl, list: undefined }));
  await page.evaluate(() => { window.__wl.req = 0; });
  await set(0, 1, 0); await btn('Start').click(); await page.clock.runFor(10);
  ok((await wl()).active === 1, 'running: the screen is kept on');
  await vis('hidden'); await page.clock.runFor(1000); await vis('visible'); await page.clock.runFor(10);
  let w = await wl(); ok(w.active === 1 && w.req === 2, `the tab shown again: the screen is kept on again (${JSON.stringify(w)}; it stayed off for the rest of the run)`);
  ok(/^00:5[89] · Countdown$/.test(await page.title()), `… and the time is right (${await page.title()})`);
  await btn('Pause').click(); ok((await wl()).active === 0, 'paused: the screen may sleep');
  await page.evaluate(() => { window.__wlDelay = 50; }); await btn('Start').click(); await btn('Pause').click(); await page.clock.runFor(100);
  w = await wl(); ok(w.active === 0, `Start and at once Pause: the lock that arrives afterwards is let go (${JSON.stringify(w)})`);
  await page.evaluate(() => { window.__wlDelay = 0; });
  // the longest countdown
  await set(150, 0, 0); ok(/at most 99 hours, 59 minutes and 59 seconds/.test(await page.locator('.card', { hasText: 'Set time' }).textContent()), '150 hours: said that 99:59:59 is the most');
  await btn('Start').click(); ok(await btn('Start').count() === 1 && await shown() === '150:00:00', '… and Start does not start it');
  await set(99, 59, 59); ok(await shown() === '99:59:59' && !/at most/.test(await page.locator('.card', { hasText: 'Set time' }).textContent()), '99:59:59 is allowed');
  // the computer sleeps for two minutes: performance.now() (and the browser's timeouts) stand still, the wall clock goes on
  await page.evaluate(() => { const p = performance.now.bind(performance); window.__lag = 0; performance.now = () => p() - window.__lag; window.__beeps = []; });
  await set(0, 1, 0); await btn('Start').click(); await page.clock.runFor(1000);
  await page.evaluate(() => { window.__lag += 120000; }); await page.clock.fastForward(120000); await page.clock.runFor(100);
  ok(await isDone() && await beeps() === 4, 'a 1-minute countdown through 2 minutes of sleep: time is up on waking (the sleep was left out)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'countdown', { ready: '.timer-display', buttons: ['Start', 'Reset'] });
};
