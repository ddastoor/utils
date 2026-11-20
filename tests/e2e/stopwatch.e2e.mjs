// Stopwatch (#/stopwatch): exact elapsed time under a fake clock (Start/Stop/resume accumulate, hundredths floored),
// lap splits and totals (newest first), hours format, Lap before start ignored, Reset while running, phone layout.
import { phoneLayout } from './_phone.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(), T0 = new Date('2026-11-16T10:00:00Z').getTime();
  await page.clock.install({ time: T0 });
  await page.goto(`${base}#/stopwatch`);
  const disp = page.locator('.timer-display'); await disp.waitFor();
  await page.clock.pauseAt(T0 + 60000);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }), shown = () => disp.textContent();
  const laps = () => page.$$eval('.lap', (l) => l.map((e) => [...e.children].map((c) => c.textContent)));
  ok(await shown() === '00:00.00', 'starts at 00:00.00');
  await btn('Lap').click(); ok((await laps()).length === 0, 'Lap before Start records nothing');
  await btn('Start').click(); ok(await btn('Stop').count() === 1, 'Start → button becomes Stop');
  await page.clock.runFor(1234); await btn('Lap').click();
  await page.clock.runFor(2500); await btn('Lap').click();
  ok(JSON.stringify(await laps()) === JSON.stringify([['Lap 2', '00:02.50', '00:03.73'], ['Lap 1', '00:01.23', '00:01.23']]), `lap splits + totals, newest first (${JSON.stringify(await laps())})`);
  await btn('Stop').click(); ok(await shown() === '00:03.73', `stopped at 3.734 s → 00:03.73 (hundredths floored) (${await shown()})`);
  await page.clock.runFor(5000); ok(await shown() === '00:03.73', 'time does not move while stopped');
  await btn('Start').click(); await page.clock.runFor(1000); await btn('Stop').click();
  ok(await shown() === '00:04.73', `resume adds to the total (${await shown()})`);
  await btn('Lap').click(); ok((await laps())[0].join('|') === 'Lap 3|00:01.00|00:04.73', `lap while stopped: split since last lap (${(await laps())[0]})`);
  await btn('Lap').click(); ok((await laps()).length === 3, `Lap again while stopped adds no empty lap (${(await laps()).length} laps)`);
  await btn('Start').click(); await page.clock.fastForward(3600000); await page.clock.runFor(16); await btn('Stop').click();
  ok(await shown() === '1:00:04.75', `over an hour: h:mm:ss.cc (${await shown()})`);
  await btn('Start').click(); await page.clock.runFor(500); await btn('Reset').click();
  ok(await shown() === '00:00.00' && (await laps()).length === 0 && await btn('Start').count() === 1, 'Reset while running: zero, laps cleared, stopped');
  await page.clock.runFor(2000); ok(await shown() === '00:00.00', 'stays at zero after Reset');
  await btn('Start').click(); await page.clock.runFor(990); await btn('Lap').click();
  ok((await laps())[0].join('|') === 'Lap 1|00:00.99|00:00.99', 'lap numbering restarts after Reset');
  // live display while running is updated every frame
  await page.clock.runFor(1000); const live = await shown(); ok(/^00:01\.9\d$/.test(live), `display updates while running (${live})`);
  // the computer sleeps an hour while the stopwatch runs: performance.now() stands still, the wall clock does not
  await btn('Reset').click(); await btn('Start').click(); await page.clock.runFor(2000);
  await page.evaluate(() => { const p = performance.now.bind(performance); window.__lag = 3600000; performance.now = () => p() - window.__lag; });
  await page.clock.fastForward(3600000); await page.clock.runFor(16); await btn('Stop').click();
  ok(await shown() === '1:00:02.01', `an hour of sleep is counted (${await shown()}; it showed 00:02)`);
  await page.goto(`${base}#/countdown`); await page.clock.runFor(100);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'stopwatch', { ready: '.timer-display', buttons: ['Start', 'Lap', 'Reset'] });
};
