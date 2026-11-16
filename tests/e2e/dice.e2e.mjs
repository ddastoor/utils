// Dice Roller (#/dice): faces ⚀–⚅ for d6 and numbers otherwise, the right number of dice, total = sum, every value
// in 1..sides, χ² uniformity for d6 / d20 / d100 / d4 over thousands of rolls (CSPRNG in crypto.wasm), phone layout.
import { phoneLayout } from './_phone.mjs';
import { chiUniform } from './_stats.mjs';
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/dice`); await page.locator('.die').first().waitFor({ timeout: 15000 });
  const setDice = async (n) => { const r = page.locator('input[type=range]'); await r.fill(String(n)); await r.dispatchEvent('input'); };
  const sides = (n) => page.getByRole('radio', { name: `d${n}`, exact: true }).click();
  // roll `times` times inside the page (fast), return every roll's values (faces mapped back to numbers) and totals
  const rolls = (times) => page.evaluate(([times, FACES]) => {
    const btn = document.querySelector('button[aria-label="Roll"]'), out = [];
    for (let i = 0; i < times; i++) {
      btn.click();
      const vals = [...document.querySelectorAll('.die')].map((d) => (FACES.includes(d.textContent) ? FACES.indexOf(d.textContent) + 1 : +d.textContent));
      out.push({ vals, raw: [...document.querySelectorAll('.die')].map((d) => d.textContent), total: document.querySelector('.big-value').textContent });
    }
    return out;
  }, [times, FACES]);
  let first = await page.$$eval('.die', (d) => d.map((e) => e.textContent));
  ok(first.length === 2 && first.every((f) => FACES.includes(f)), `opens with 2 d6 already rolled (${first})`);
  let r = await rolls(1); ok(r[0].total === `Total ${r[0].vals[0] + r[0].vals[1]}`, `total = sum (${r[0].raw} → ${r[0].total})`);
  await setDice(10);
  r = await rolls(300);
  const all6 = r.flatMap((x) => x.vals);
  ok(r.every((x) => x.vals.length === 10 && x.raw.every((f) => FACES.includes(f))), '10 dice, d6 shown as die faces');
  ok(r.every((x) => x.total === `Total ${x.vals.reduce((a, b) => a + b, 0)}`), 'every total equals the sum of the dice');
  let c = chiUniform([1, 2, 3, 4, 5, 6].map((v) => all6.filter((x) => x === v).length)); ok(c.pass, `d6 uniform: ${c.text}`);
  const sums = r.map((x) => x.vals.reduce((a, b) => a + b, 0)), mean = sums.reduce((a, b) => a + b, 0) / sums.length;
  ok(Math.abs(mean - 35) < 4 * Math.sqrt(10 * 35 / 12 / sums.length), `sum of 10 d6 averages 35 (${mean.toFixed(2)})`);
  await sides(20); r = await rolls(200); const all20 = r.flatMap((x) => x.vals);
  ok(r.every((x) => x.raw.every((f) => /^\d+$/.test(f))) && all20.every((v) => Number.isInteger(v) && v >= 1 && v <= 20), 'd20: numbers 1–20');
  c = chiUniform(Array.from({ length: 20 }, (_, i) => all20.filter((x) => x === i + 1).length)); ok(c.pass, `d20 uniform: ${c.text}`);
  await sides(100); r = await rolls(300); const all100 = r.flatMap((x) => x.vals);
  ok(all100.every((v) => v >= 1 && v <= 100) && all100.includes(1) && all100.includes(100), 'd100: 1–100, both ends reachable');
  c = chiUniform(Array.from({ length: 10 }, (_, i) => all100.filter((x) => Math.ceil(x / 10) === i + 1).length)); ok(c.pass, `d100 deciles uniform: ${c.text}`);
  await sides(4); await setDice(1); r = await rolls(1200); const all4 = r.flatMap((x) => x.vals);
  ok(r.every((x) => x.vals.length === 1 && x.total === ''), 'one die: no total line');
  c = chiUniform([1, 2, 3, 4].map((v) => all4.filter((x) => x === v).length)); ok(c.pass, `d4 uniform: ${c.text}`);
  // consecutive rolls are independent: P(same as previous) ≈ 1/4 for d4
  const same = all4.slice(1).filter((v, i) => v === all4[i]).length / (all4.length - 1);
  ok(Math.abs(same - 0.25) < 0.06, `consecutive d4 rolls independent (repeat rate ${same.toFixed(3)})`);
  for (const s of [8, 10, 12]) { await sides(s); const v = (await rolls(200)).flatMap((x) => x.vals); ok(v.every((x) => x >= 1 && x <= s) && new Set(v).size === s, `d${s}: all ${s} values seen, none outside`); }
  await page.getByRole('button', { name: 'Roll', exact: true }).click(); ok(await page.locator('.die.rolled').count() === 1, 'the Roll button rolls (animated die)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'dice', { ready: '.die', buttons: ['Roll'], before: async (ph) => {
    const rr = ph.locator('input[type=range]'); await rr.fill('10'); await rr.dispatchEvent('input');
    await ph.getByRole('radio', { name: 'd100', exact: true }).click(); await ph.getByRole('button', { name: 'Roll', exact: true }).click();
  } });
};
