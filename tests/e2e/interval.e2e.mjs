// Interval Timer (#/interval): Get ready 10 s → work / rest rounds (no rest after the last round); Tabata 20/10 ×8 walked
// phase by phase under a fake clock = 16 steps / 240 s; presets also move the sliders; Rest 0 s drops the rest phases;
// 60/30 ×6; rounds 1; pause; phone layout.
import { phoneLayout } from './_phone.mjs';
import { phaseUI, beepInit } from './_phases.mjs';
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const plan = (work, rest, rounds) => [['Get ready', 10], ...Array.from({ length: rounds }, (_, k) => [[`Work · round ${k + 1}`, work], ...(k < rounds - 1 && rest > 0 ? [['Rest', rest]] : [])]).flat()];
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(), T0 = Date.UTC(2026, 10, 16, 10);
  await page.addInitScript(beepInit);
  await page.clock.install({ time: T0 }); await page.goto(`${base}#/interval`);
  const u = phaseUI(page); await u.disp.waitFor(); await page.clock.pauseAt(T0 + 60000);
  const beeps = () => page.evaluate(() => window.__beeps.splice(0));
  ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Get ready', time: '00:10', step: 'Step 1 of 16' }), `default HIIT 40/20 ×8: get ready 10 s, 1 + 8 + 7 = 16 steps (${JSON.stringify(await u.state())})`);
  const walk = async (p) => {
    let good = true, secs = 0; const log = [];
    await u.btn('Start').click();
    for (let i = 0; i < p.length; i++) {
      const st = await u.state(); log.push(`${st.label} ${st.time}`);
      if (st.label !== p[i][0] || st.time !== fmt(p[i][1]) || st.step !== `Step ${i + 1} of ${p.length}`) good = false;
      await u.finishPhase(p[i][1] * 1000); secs += p[i][1];
      const b = await beeps(), last = i === p.length - 1;
      if (b.length !== (last ? 6 : 2)) { good = false; log.push(`beeps ${b}`); }
    }
    const end = await u.state();
    return { good: good && end.label === 'Get ready' && end.step === `Step 1 of ${p.length}` && await u.btn('Start').count() === 1, secs, log: log.join(' · ') };
  };
  await page.locator('.chip-btn', { hasText: 'Tabata' }).click();
  ok(await u.sliderText('Work') === '20 s' && await u.sliderText('Rest') === '10 s' && await u.sliderText('Rounds') === '8', `Tabata preset moves the sliders (${await u.sliderText('Work')}, ${await u.sliderText('Rest')}, ${await u.sliderText('Rounds')})`);
  let r = await walk(plan(20, 10, 8));
  ok(r.good, `Tabata: every phase label, length and step right, beeps between phases, alarm at the end — ${r.log}`);
  ok(r.secs === 240, `Tabata total 10 + 8 × 20 + 7 × 10 = 240 s (${r.secs})`);
  await page.locator('.chip-btn', { hasText: '60/30' }).click();
  ok((await u.state()).step === 'Step 1 of 12' && await u.sliderText('Work') === '60 s', '60/30 ×6 → 1 + 6 + 5 = 12 steps');
  await u.btn('Skip').click(); ok((await u.state()).time === '01:00' && (await u.state()).label === 'Work · round 1', 'work 60 s shows 01:00');
  await u.btn('Skip').click(); ok((await u.state()).time === '00:30' && (await u.state()).label === 'Rest', 'rest 30 s');
  await u.btn('Reset').click();
  await u.setSlider('Rest', 0); await u.setSlider('Rounds', 3); await u.setSlider('Work', 15);
  ok((await u.state()).step === 'Step 1 of 4', `rest 0 s: no rest phases (1 + 3 = 4 steps) (${(await u.state()).step})`);
  r = await walk(plan(15, 0, 3)); ok(r.good && r.secs === 55 && !/Rest/.test(r.log), `rest 0 s run: 10 + 3 × 15 = 55 s, no Rest phase — ${r.log}`);
  await u.setSlider('Rounds', 1); await u.setSlider('Rest', 45);
  ok((await u.state()).step === 'Step 1 of 2', 'one round: get ready + work (no rest after the last round)');
  await u.setSlider('Work', 300); await u.btn('Skip').click(); ok((await u.state()).time === '05:00', 'work 300 s = 05:00');
  await u.btn('Start').click(); await page.clock.runFor(10100); await u.btn('Pause').click(); await page.clock.runFor(30000);
  ok((await u.state()).time === '04:50', `pause freezes the time (${(await u.state()).time})`);
  // the "Get ready" step: 0 s leaves it out, otherwise its length
  await u.btn('Reset').click(); await page.locator('.chip-btn', { hasText: 'HIIT' }).click();
  await u.setSlider('Get ready', 0);
  ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Work · round 1', time: '00:40', step: 'Step 1 of 15' }), `Get ready 0 s: the workout starts with round 1, 8 + 7 = 15 steps (${JSON.stringify(await u.state())})`);
  await u.setSlider('Get ready', 30); ok(JSON.stringify(await u.state()) === JSON.stringify({ label: 'Get ready', time: '00:30', step: 'Step 1 of 16' }), 'Get ready 30 s');
  await u.setSlider('Get ready', 10);
  // a setting changed during the workout: it goes on (it used to stop and start over)
  await u.btn('Start').click(); await page.clock.runFor(10000 + 15000); await beeps(); // 15 s into round 1
  await u.setSlider('Rest', 30); let st = await u.state();
  ok(st.label === 'Work · round 1' && st.time === '00:25' && await u.btn('Pause').count() === 1, `rest changed during round 1: still running, 00:25 left (${JSON.stringify(st)})`);
  await u.setSlider('Work', 15); await page.clock.runFor(50); st = await u.state();
  ok(st.label === 'Rest' && st.time === '00:30' && st.step === 'Step 3 of 16' && (await beeps()).length === 2, `work made 15 s after 15 s of it: round 1 is over now (beeps), the whole 30-s rest begins (${JSON.stringify(st)})`);
  await u.btn('Reset').click(); await beeps();
  // a tab in the background: the beeps come on time without frames or our interval
  await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.__si = window.setInterval; window.requestAnimationFrame = () => 0; window.setInterval = () => 0; });
  await u.btn('Start').click(); await page.clock.runFor(10050);
  ok((await beeps()).length === 2 && (await u.state()).label === 'Work · round 1', 'background tab: "Get ready" ends on time with its beeps');
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf; window.setInterval = window.__si; });
  await u.btn('Reset').click();
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'interval', { ready: '.timer-display', buttons: ['Start', 'Skip', 'Reset'] });
};
