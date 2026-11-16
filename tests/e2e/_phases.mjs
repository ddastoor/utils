// Helpers for the phase timers (Pomodoro, Interval) under Playwright's fake clock.
export function phaseUI(page) {
  const disp = page.locator('.timer-display'), label = page.locator('.phase-label'), step = page.locator('.card .muted.center').first();
  const sliderOf = (l) => page.locator('.slider').filter({ has: page.locator('.slider-head span', { hasText: new RegExp(`^${l}$`) }) });
  return {
    disp, label,
    btn: (n) => page.getByRole('button', { name: n, exact: true }),
    async state() { return { label: (await label.textContent()).trim(), time: await disp.textContent(), step: (await step.textContent()).trim() }; },
    async setSlider(l, v) { const r = sliderOf(l).locator('input'); await r.fill(String(v)); await r.dispatchEvent('change'); },
    sliderText: (l) => sliderOf(l).locator('output').textContent(),
    /** jump to just past the end of the current phase and let one more frame run */
    async finishPhase(ms) { await page.clock.fastForward(ms); await page.clock.runFor(32); },
  };
}
export const beepInit = () => {
  window.__beeps = [];
  const s = OscillatorNode.prototype.start; OscillatorNode.prototype.start = function (...a) { window.__beeps.push(this.frequency.value); return s.apply(this, a); };
};
