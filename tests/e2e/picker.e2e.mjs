// List Picker (#/picker): lines or commas, blanks and spaces ignored, k distinct picks numbered 1..k, k capped at the
// list size, empty list message, χ² fairness over 1,500 picks, phone layout.
import { phoneLayout } from './_phone.mjs';
import { chiUniform } from './_stats.mjs';
const DEF = ['Pizza', 'Biryani', 'Dosa', 'Paneer tikka', 'Pasta'];
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/picker`);
  const ta = page.locator('textarea'), n = page.locator('label.field', { hasText: 'How many' }).locator('input');
  await ta.waitFor({ timeout: 15000 });
  const pick = async () => { await page.getByRole('button', { name: 'Pick', exact: true }).click(); return page.$$eval('.pick-item', (p) => p.map((e) => [e.querySelector('.muted')?.textContent || '', e.lastChild.textContent.trim()])); };
  ok(await ta.inputValue() === DEF.join('\n') && await page.locator('.pick-item').count() === 0, 'default list of 5 foods, nothing picked yet');
  let p = await pick(); ok(p.length === 1 && DEF.includes(p[0][1]) && p[0][0] === '', `one winner from the list, no number (${p[0][1]})`);
  await n.fill('3'); p = await pick();
  ok(p.length === 3 && new Set(p.map((x) => x[1])).size === 3 && p.every((x) => DEF.includes(x[1])) && p.map((x) => x[0]).join() === '1.,2.,3.', `3 different items numbered 1–3 (${p.map((x) => x[1])})`);
  await n.fill('99'); p = await pick(); ok(p.length === 5 && [...p.map((x) => x[1])].sort().join() === [...DEF].sort().join(), 'asking for more than the list → every item once (a shuffle)');
  await n.fill('0'); p = await pick(); ok(p.length === 1, 'count 0 → one item');
  await n.fill('2.7'); p = await pick(); ok(p.length === 2 && p.map((x) => x[0]).join() === '1.,2.', `count 2.7 → two items, numbered (${p.length})`);
  await n.fill('1.5'); p = await pick(); ok(p.length === 1 && p[0][0] === '', 'count 1.5 → one item, without a number (it was numbered "1.")');
  await ta.fill('  Red , Green,,\n\n Blue  \n,Yellow'); await n.fill('10'); p = await pick();
  ok([...p.map((x) => x[1])].sort().join() === 'Blue,Green,Red,Yellow', `commas + new lines, spaces and blanks ignored (${p.map((x) => x[1])})`);
  await ta.fill('Chai, Kaapi, Lassi, Nimbu pani, Jaljeera'); await n.fill('1');
  const counts = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Pick"]'), o = {}; for (let i = 0; i < 1500; i++) { b.click(); const t = document.querySelector('.pick-item').textContent.trim(); o[t] = (o[t] || 0) + 1; } return o; });
  const c = chiUniform(['Chai', 'Kaapi', 'Lassi', 'Nimbu pani', 'Jaljeera'].map((k) => counts[k] || 0));
  ok(Object.keys(counts).length === 5 && c.pass, `each item equally likely: ${c.text}`);
  await n.fill('2'); const pairs = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Pick"]'), o = []; for (let i = 0; i < 600; i++) { b.click(); o.push([...document.querySelectorAll('.pick-item')].map((e) => e.lastChild.textContent.trim())); } return o; });
  ok(pairs.every((x) => x.length === 2 && x[0] !== x[1]), 'pairs never repeat an item');
  const second = chiUniform(['Chai', 'Kaapi', 'Lassi', 'Nimbu pani', 'Jaljeera'].map((k) => pairs.filter((x) => x[1] === k).length)); ok(second.pass, `second pick also uniform: ${second.text}`);
  await ta.fill('Same\nSame\nOther'); await n.fill('3'); p = await pick(); ok(p.map((x) => x[1]).sort().join() === 'Other,Same,Same', 'duplicate lines are separate entries');
  await ta.fill('   \n , \n'); await page.getByRole('button', { name: 'Pick', exact: true }).click();
  ok(await page.locator('.pick-out').textContent() === 'Add some items first', 'empty list → message');
  await ta.fill('मसाला डोसा\n😀 Smile\nरसगुल्ला'); await n.fill('3'); p = await pick(); ok(p.map((x) => x[1]).sort().join() === ['मसाला डोसा', '😀 Smile', 'रसगुल्ला'].sort().join(), 'Hindi and emoji items kept intact');
  ok(await page.locator('.pick-out').getAttribute('aria-live') === 'polite', 'the result is announced to a screen reader (aria-live; nothing was said after the button)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'picker', { ready: 'textarea', buttons: ['Pick'] });
};
