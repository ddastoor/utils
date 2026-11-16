// Find & Replace (#/replace): plain text with special characters taken literally, case sensitivity, whole words,
// regular expressions with groups, Unicode, invalid patterns, counts.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/replace`);
  const text = page.getByLabel('Text'), find = page.getByLabel('Find'), rep = page.getByLabel('Replace with');
  const out = page.locator('.card').filter({ hasText: 'Result' }).locator('textarea'), info = page.locator('.card').filter({ hasText: 'Result' }).locator('.muted.small');
  const tog = (name) => page.locator('label.switch').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
  const run = async (t, f, r) => { await text.fill(t); await find.fill(f); await rep.fill(r); return [await out.inputValue(), (await info.textContent()).trim()]; };
  await text.waitFor();
  ok((await out.inputValue()) === 'color and flavour, color again.' && /2 replacements/.test(await info.textContent()), 'default: Colour → color (case-insensitive), 2 replacements');
  let [o, i] = await run('Price: $5.00 (approx.) + tax*', '$5.00 (approx.)', '₹420 $1');
  ok(o === 'Price: ₹420 $1 + tax*' && /1 replacement$/.test(i), `special characters taken literally, "$1" in the replacement kept as text (${o})`);
  await tog('Case sensitive');
  [o] = await run('Cat cat CAT', 'cat', 'dog'); ok(o === 'Cat dog CAT', 'case sensitive');
  await tog('Case sensitive');
  await tog('Whole words');
  [o, i] = await run('cat category concat cat.', 'cat', 'dog'); ok(o === 'dog category concat dog.' && /2 replacements/.test(i), 'whole words only');
  await tog('Whole words');
  await tog('Regular expression');
  [o] = await run('2026-11-16 and 1999-01-31', '(\\d{4})-(\\d{2})-(\\d{2})', '$3/$2/$1'); ok(o === '16/11/2026 and 31/01/1999', `regex groups: ISO → dd/mm/yyyy (${o})`);
  [o] = await run('a  b   c', '\\s+', ' '); ok(o === 'a b c', 'collapse spaces');
  [o] = await run('नमस्ते दुनिया', 'दुनिया', 'world'); ok(o === 'नमस्ते world', 'Unicode text');
  [o, i] = await run('abc', '(', 'x'); ok(o === 'abc' || o === '', 'invalid regex keeps the text');
  ok(/Invalid regular expression|Unterminated group/i.test(i) && await find.evaluate((e) => e.classList.contains('bad')), `invalid regex reported (${i})`);
  [o, i] = await run('line1\nline2', '^', '> '); ok(o === '> line1\nline2', `anchors (${JSON.stringify(o)})`);
  await find.fill(''); ok((await out.inputValue()) === 'line1\nline2' && (await info.textContent()).trim() === '', 'empty find → text unchanged');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/replace`); await ph.getByLabel('Text').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
