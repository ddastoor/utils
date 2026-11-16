// Morse Code (#/morse): text → Morse and back (letters, digits, punctuation, word separators, dot/dash look-alikes),
// auto-detect, and playback timing measured from the scheduled tone (dot 1 unit, dash 3, gaps 1 / 3 / 7, unit = 1.2/wpm s).
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage();
  await page.addInitScript(() => { const o = AudioParam.prototype.setValueAtTime; window.__ev = []; AudioParam.prototype.setValueAtTime = function (v, t) { if (v === 0 || v === 0.4) window.__ev.push([v, t]); return o.call(this, v, t); }; });
  await page.goto(`${base}#/morse`);
  const inp = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1);
  const conv = async (s) => { await inp.fill(s); await inp.dispatchEvent('input'); return out.inputValue(); };
  await inp.waitFor();
  ok(await out.inputValue() === '... --- ... / .... . .-.. .--.', 'default "SOS Help"');
  ok(await conv('Hello, World 2026!') === '.... . .-.. .-.. --- --..-- / .-- --- .-. .-.. -.. / ..--- ----- ..--- -.... -.-.--', 'letters, comma, digits, exclamation');
  ok(await conv('.... . .-.. .-.. --- / .-- --- .-. .-.. -..') === 'HELLO WORLD', 'Morse → text');
  ok(await conv('··· −−− ···') === 'SOS', 'dot/dash look-alikes (· −) accepted');
  ok(await conv('.-   -...') === 'A B', 'three spaces also separate words');
  ok(await conv('@ = +') === '.--.-. / -...- / .-.-.', 'symbols @ = +');
  const A2Z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  ok(await conv(await conv(A2Z)) === A2Z, 'round trip A–Z 0–9');
  ok(await conv('héllo') === '.... .-.. .-.. ---', 'characters without Morse are skipped (é)');
  // timing at 20 wpm: unit 60 ms
  const slider = page.locator('input[type=range]'); await slider.fill('20'); await slider.dispatchEvent('input');
  await conv('A E T');
  await page.evaluate(() => (window.__ev = []));
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForFunction(() => window.__ev.length >= 8);
  const ev = await page.evaluate(() => window.__ev), u = 1.2 / 20;
  const ons = [], offs = []; for (const [v, t] of ev) (v ? ons : offs).push(t);
  const len = ons.map((t, i) => (offs[i + 1] ?? offs[i]) - t);
  const on = ev.filter(([v]) => v).map(([, t]) => t), off = ev.filter(([v], i) => !v && i > 0).map(([, t]) => t);
  const tone = on.map((t, i) => (off[i] - t) / u), gaps = on.slice(1).map((t, i) => (t - off[i]) / u);
  ok(tone.length === 4 && [1, 3, 1, 3].every((x, i) => Math.abs(tone[i] - x) < 0.01), `tones: dot 1, dash 3 units (${tone.map((x) => x.toFixed(2))})`);
  ok([1, 7, 7].every((x, i) => Math.abs(gaps[i] - x) < 0.01), `gaps: inside a letter 1, between words 7 units (${gaps.map((x) => x.toFixed(2))}) — was 9`);
  await conv('EE'); await page.evaluate(() => (window.__ev = [])); await page.getByRole('button', { name: 'Play' }).click(); await page.waitForFunction(() => window.__ev.length >= 4);
  const ev2 = await page.evaluate(() => window.__ev), on2 = ev2.filter(([v]) => v).map(([, t]) => t), off2 = ev2.filter(([v], i) => !v && i > 0).map(([, t]) => t);
  ok(Math.abs((on2[1] - off2[0]) / u - 3) < 0.01, `gap between letters 3 units (${((on2[1] - off2[0]) / u).toFixed(2)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  void len;
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/morse`); await ph.locator('textarea').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
