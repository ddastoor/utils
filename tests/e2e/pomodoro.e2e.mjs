// Pomodoro (#/pomodoro): the classic 25/5 ×4 with a 15-minute long break = 8 steps / 130 minutes, walked phase by
// phase under a fake clock (labels, lengths, step counter, beeps at 660 Hz after focus and 990 Hz after a break, final
// 4-beep alarm then back to step 1), pause, skip (running and paused), settings sliders, phone layout.
import { phoneLayout } from './_phone.mjs';
import { phaseUI, beepInit } from './_phases.mjs';
const mmss = (min) => `${String(min).padStart(2, '0')}:00`;
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(), T0 = Date.UTC(2026, 10, 16, 10);
  await page.addInitScript(beepInit);
  await page.clock.install({ time: T0 }); await page.goto(`${base}#/pomodoro`);
  const u = phaseUI(page); await u.disp.waitFor(); await page.clock.pauseAt(T0 + 60000);
  const beeps = () => page.evaluate(() => window.__beeps.splice(0));
  ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Focus', time: '25:00', step: 'Step 1 of 8' }), `default: Focus 25:00, step 1 of 8 (${JSON.stringify(await u.state())})`);
  ok(await u.sliderText('Focus') === '25 min' && await u.sliderText('Short break') === '5 min' && await u.sliderText('Long break') === '15 min' && await u.sliderText('Focus sessions') === '4', 'default settings 25 / 5 / 15 min × 4');
  await u.btn('Start').click(); await page.clock.runFor(60100);
  ok((await u.state()).time === '24:00', `after 1 min: 24:00 (${(await u.state()).time})`);
  await u.btn('Pause').click(); await page.clock.runFor(120000);
  ok((await u.state()).time === '24:00' && await u.btn('Start').count() === 1, 'paused: frozen at 24:00');
  await u.btn('Start').click();
  // expected schedule: F S F S F S F L
  const plan = [['Focus', 25], ['Short break', 5], ['Focus', 25], ['Short break', 5], ['Focus', 25], ['Short break', 5], ['Focus', 25], ['Long break', 15]];
  let total = 1, good = true, beepOk = true; const seen = [];
  for (let i = 0; i < plan.length; i++) {
    const st = await u.state(); seen.push(`${st.label} ${st.time} ${st.step}`);
    const want = plan[i]; const len = i === 0 ? 24 : want[1];
    if (st.label !== want[0] || st.step !== `Step ${i + 1} of 8` || (i > 0 && st.time !== mmss(want[1]))) good = false;
    await u.finishPhase(len * 60000); total += len;
    const b = await beeps();
    const expect = i === plan.length - 1 ? [990, 990, 880, 880, 880, 880] : want[0] === 'Focus' ? [660, 660] : [990, 990];
    if (JSON.stringify(b) !== JSON.stringify(expect)) { beepOk = false; seen.push(`beeps ${b}`); }
  }
  ok(good, `8 phases F/S/F/S/F/S/F/Long with the right lengths: ${seen.join(' · ')}`);
  ok(total === 130, 'whole cycle = 4 × 25 + 3 × 5 + 15 = 130 min');
  ok(beepOk, 'beeps: 2 × 660 Hz after focus, 2 × 990 Hz after a break, then the 4-beep alarm at the end');
  ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Focus', time: '25:00', step: 'Step 1 of 8' }) && await u.btn('Start').count() === 1, 'after the long break: stopped, back to Focus step 1');
  await page.clock.runFor(60000); ok((await u.state()).time === '25:00', 'stays stopped');
  // skip while paused moves to the next phase without a beep
  await u.btn('Skip').click(); ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Short break', time: '05:00', step: 'Step 2 of 8' }) && !(await beeps()).length, 'Skip while stopped → Short break 05:00, silent');
  await u.btn('Start').click(); await page.clock.runFor(1000); await u.btn('Skip').click(); await page.clock.runFor(100);
  const sk = await u.state(); ok(sk.label === 'Focus' && sk.step === 'Step 3 of 8' && sk.time === '25:00' && JSON.stringify(await beeps()) === '[990,990]', `Skip while running ends the break (beeps) → Focus step 3 (${JSON.stringify(sk)})`);
  await u.btn('Reset').click(); ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Focus', time: '25:00', step: 'Step 1 of 8' }) && await u.btn('Start').count() === 1, 'Reset → step 1, stopped');
  await u.setSlider('Focus', 50); ok((await u.state()).time === '50:00' && await u.sliderText('Focus') === '50 min', 'Focus 50 min');
  await u.setSlider('Focus sessions', 1); ok((await u.state()).step === 'Step 1 of 2', 'one session → 2 steps (focus + long break)');
  await u.btn('Skip').click(); ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Long break', time: '15:00', step: 'Step 2 of 2' }), 'single session ends with the long break');
  await u.setSlider('Long break', 30); ok((await u.state()).time === '50:00', 'changing a setting resets to step 1');
  await u.btn('Skip').click(); ok((await u.state()).time === '30:00', 'long break 30 min');
  await u.setSlider('Focus sessions', 3); await u.setSlider('Short break', 10); await u.btn('Skip').click();
  ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Short break', time: '10:00', step: 'Step 2 of 6' }), 'short break 10 min, 3 sessions = 6 steps');
  // Reset → Start before the next animation frame used to leave two frame loops running (the old one never stopped)
  await u.setSlider('Focus', 90); ok((await u.state()).time === '1:30:00', 'focus 90 min shows 1:30:00');
  await u.btn('Start').click(); await page.clock.runFor(1000);
  await page.goto(`${base}#/stopwatch`); await page.locator('.timer-display').waitFor(); await beeps();
  await page.clock.fastForward(91 * 60000); await page.clock.runFor(100);
  { const lb = await beeps(); ok(!lb.length, `leaving the tab stops the timer (${lb})`); }
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'pomodoro', { ready: '.timer-display', buttons: ['Start', 'Skip', 'Reset'] });
};
