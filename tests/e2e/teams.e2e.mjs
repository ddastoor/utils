// Team Splitter (#/teams): by number of teams or people per team, sizes differ by at most one, every name exactly once,
// headings "Team k (size)", more teams than names, empty list message, assignment random (χ² over 400 splits),
// phone layout.
import { phoneLayout } from './_phone.mjs';
import { chiUniform } from './_stats.mjs';
const DEF = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Ishaan', 'Meera', 'Kabir', 'Sara'];
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/teams`); await page.locator('.teams .card').first().waitFor({ timeout: 15000 });
  const ta = page.locator('textarea'), val = page.locator('label.field', { hasText: 'Value' }).locator('input');
  const read = () => page.$$eval('.teams .card', (cs) => cs.map((c) => ({ title: c.querySelector('h2, h3, .card-title')?.textContent.trim(), names: [...c.querySelectorAll('.stack > div')].map((d) => d.textContent) })));
  const make = async () => { await page.getByRole('button', { name: 'Make teams', exact: true }).click(); return read(); };
  const check = (t, names, k) => {
    const all = t.flatMap((x) => x.names), sizes = t.map((x) => x.names.length);
    return t.length === k && all.length === names.length && [...all].sort().join() === [...names].sort().join() && Math.max(...sizes) - Math.min(...sizes) <= 1
      && t.every((x, i) => x.title === `Team ${i + 1} (${x.names.length})`);
  };
  let t = await read(); ok(check(t, DEF, 2) && t.every((x) => x.names.length === 4), `opens with 8 names in 2 teams of 4 (${t.map((x) => x.title)})`);
  await val.fill('3'); t = await make(); ok(check(t, DEF, 3) && t.map((x) => x.names.length).join() === '3,3,2', `3 teams → sizes 3, 3, 2 (${t.map((x) => x.title)})`);
  await page.getByRole('radio', { name: 'People per team', exact: true }).click();
  await val.fill('3'); t = await make(); ok(check(t, DEF, 3), '3 per team, 8 people → 3 teams (3, 3, 2)');
  await val.fill('2'); t = await make(); ok(check(t, DEF, 4) && t.every((x) => x.names.length === 2), '2 per team → 4 pairs');
  await val.fill('5'); t = await make(); ok(check(t, DEF, 2) && t.map((x) => x.names.length).join() === '4,4', '5 per team with 8 people → 2 teams of 4 (balanced, not 5 + 3)');
  await val.fill('20'); t = await make(); ok(check(t, DEF, 1), 'team larger than the list → one team');
  await page.getByRole('radio', { name: 'Number of teams', exact: true }).click();
  await val.fill('20'); t = await make(); ok(check(t, DEF, 8) && t.every((x) => x.names.length === 1), 'more teams than people → one person per team');
  const names23 = Array.from({ length: 23 }, (_, i) => `Player ${i + 1}`);
  await ta.fill(names23.join(', ')); await val.fill('4'); t = await make(); ok(check(t, names23, 4) && t.map((x) => x.names.length).join() === '6,6,6,5', '23 comma-separated names in 4 teams → 6, 6, 6, 5');
  await ta.fill(DEF.join('\n')); await val.fill('2');
  const inFirst = await page.evaluate((DEF) => { const b = document.querySelector('button[aria-label="Make teams"]'), cnt = Object.fromEntries(DEF.map((d) => [d, 0])); const pairs = { together: 0 };
    for (let i = 0; i < 400; i++) { b.click(); const cs = document.querySelectorAll('.teams .card'); const first = [...cs[0].querySelectorAll('.stack > div')].map((d) => d.textContent); first.forEach((n) => cnt[n]++); if (first.includes('Aarav') === first.includes('Diya')) pairs.together++; }
    return { cnt, together: pairs.together }; }, DEF);
  const c = chiUniform(DEF.map((d) => inFirst.cnt[d]));
  ok(c.pass && DEF.every((d) => inFirst.cnt[d] > 120 && inFirst.cnt[d] < 280), `each person lands in Team 1 about half the time: ${c.text}`);
  // P(Aarav and Diya on the same team) = 3/7 for 8 people in two teams of 4
  ok(Math.abs(inFirst.together / 400 - 3 / 7) < 0.1, `two given people share a team 3/7 of the time (${(inFirst.together / 400).toFixed(3)})`);
  // one name a line: a comma inside a name ("Sharma, Rahul") stays (it made two people of one)
  const sur = ['Sharma, Rahul', 'Iyer, Meera', 'Khan, Kabir', 'Das, Sara'];
  await ta.fill(sur.join('\n')); await val.fill('2'); t = await make(); ok(check(t, sur, 2), `"Last, First" names, one a line: four people (${t.flatMap((x) => x.names).join(' | ')})`);
  await val.fill('0'); t = await make(); ok(t.length === 0 && /Enter how many teams to make/.test(await page.locator('.teams').textContent()), 'number of teams 0 → asked for (it made 2 teams)');
  await val.fill(''); t = await make(); ok(t.length === 0 && /Enter how many teams/.test(await page.locator('.teams').textContent()), 'number of teams empty → asked for');
  await ta.fill(' \n,\n '); await val.fill('2'); await page.getByRole('button', { name: 'Make teams', exact: true }).click();
  ok(await page.locator('.teams .card').count() === 0 && /Add some names first/.test(await page.locator('.teams').textContent()), 'empty list → message, old teams cleared');
  ok(await page.locator('.teams').getAttribute('aria-live') === 'polite', 'the result is announced to a screen reader (aria-live; nothing was said after the button)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'teams', { ready: '.teams .card', buttons: ['Make teams'] });
};
