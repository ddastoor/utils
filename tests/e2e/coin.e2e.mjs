// Coin Flip (#/coin): "?" before the first flip, Heads/Tails with the matching style, running counts that match what
// was shown, χ² fairness over 4,000 flips, no long-run bias in runs, Reset, phone layout.
import { phoneLayout } from './_phone.mjs';
import { chiUniform } from './_stats.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/coin`); await page.locator('.coin').waitFor({ timeout: 15000 });
  ok(await page.locator('.coin').textContent() === '?' && await page.locator('.center.muted').textContent() === '', 'starts with "?" and no counts');
  await page.getByRole('button', { name: 'Flip', exact: true }).click();
  const f1 = await page.locator('.coin').textContent(), cls = await page.locator('.coin').getAttribute('class');
  ok(/^(Heads|Tails)$/.test(f1) && cls.includes(f1.toLowerCase()), `flip shows Heads or Tails with its style (${f1}, ${cls})`);
  ok(await page.locator('.center.muted').textContent() === (f1 === 'Heads' ? 'Heads 1 · Tails 0' : 'Heads 0 · Tails 1'), 'count after one flip');
  const seq = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Flip"]'), c = document.querySelector('.coin'), o = []; for (let i = 0; i < 4000; i++) { b.click(); o.push(c.textContent); } return o; });
  const H = seq.filter((x) => x === 'Heads').length + (f1 === 'Heads' ? 1 : 0), T = 4001 - H;
  ok(seq.every((x) => x === 'Heads' || x === 'Tails'), 'only Heads or Tails');
  ok(await page.locator('.center.muted').textContent() === `Heads ${H} · Tails ${T}`, `running counts match the flips shown (Heads ${H} · Tails ${T})`);
  const c = chiUniform([H, T]); ok(c.pass, `fair coin: ${c.text}`);
  let runs = 1; for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) runs++;
  const n = seq.length, eRuns = 1 + (n - 1) / 2, sd = Math.sqrt((n - 1) / 4);
  ok(Math.abs(runs - eRuns) < 4 * sd, `flips independent: ${runs} runs (expected ${eRuns.toFixed(0)} ± ${(4 * sd).toFixed(0)})`);
  let longest = 1, cur = 1; for (let i = 1; i < seq.length; i++) { cur = seq[i] === seq[i - 1] ? cur + 1 : 1; longest = Math.max(longest, cur); }
  ok(longest >= 6 && longest <= 25, `longest streak plausible for 4,000 flips (${longest}; ~12 expected)`);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  ok(await page.locator('.coin').textContent() === '?' && await page.locator('.coin').getAttribute('class') === 'coin' && await page.locator('.center.muted').textContent() === '', 'Reset: "?" with the plain coin style, counts cleared');
  await page.getByRole('button', { name: 'Flip', exact: true }).click();
  ok(/^Heads [01] · Tails [01]$/.test(await page.locator('.center.muted').textContent()), 'counting restarts from zero');
  // the coin spins on every flip — also when the side comes up again (the class stayed the same and nothing moved)
  const spins = await page.evaluate(async () => { const b = document.querySelector('button[aria-label="Flip"]'), c = document.querySelector('.coin'), o = []; for (let i = 0; i < 6; i++) { b.click(); o.push(c.getAnimations().filter((a) => a.playState === 'running').length); } return o; });
  ok(spins.every((n) => n === 1), `every flip spins the coin once (${spins})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'coin', { ready: '.coin', buttons: ['Flip', 'Reset'] });
};
