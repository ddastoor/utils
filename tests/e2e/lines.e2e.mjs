// Line Tools (#/lines): trim, empty lines, duplicates (case-sensitive or not), natural sort A→Z / Z→A / by length,
// CSPRNG shuffle (same multiset, many orders), reverse, numbering, prefix/suffix, counts.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/lines`);
  const inp = page.getByLabel('Input'), out = page.locator('.card').filter({ hasText: 'Output' }).locator('textarea');
  const tog = (name) => page.locator('label.switch').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
  const sort = (name) => page.getByRole('radio', { name, exact: true }).click();
  const res = async () => (await out.inputValue()).split('\n');
  await inp.waitFor();
  ok((await res()).join('|') === '9|10|apple|banana|Banana|cherry', `default: trimmed, empties and duplicates removed, natural A→Z (${(await res()).join('|')})`);
  ok(/8 lines in → 6 lines out/.test(await page.locator('.muted.small').filter({ hasText: 'lines in' }).textContent()), 'line counts');
  await tog('…ignoring case');
  ok((await res()).join('|') === '9|10|apple|banana|cherry', 'duplicates ignoring case');
  await sort('Z → A'); ok((await res()).join('|') === 'cherry|banana|apple|10|9', 'Z → A (natural numbers)');
  await sort('By length'); ok((await res()).join('|') === '9|10|apple|banana|cherry', 'by length, ties alphabetically');
  await sort('Keep order'); ok((await res()).join('|') === 'banana|apple|cherry|10|9', 'keep order (first occurrence kept)');
  await tog('Reverse order'); ok((await res()).join('|') === '9|10|cherry|apple|banana', 'reverse');
  await tog('Number lines'); ok((await res())[0] === '1. 9' && (await res())[4] === '5. banana', 'numbering');
  await page.getByLabel('Add prefix').fill('- [ ] '); await page.getByLabel('Add suffix').fill(';');
  ok((await res())[0] === '1. - [ ] 9;', `prefix and suffix (${(await res())[0]})`);
  await tog('Number lines'); await tog('Reverse order'); await page.getByLabel('Add prefix').fill(''); await page.getByLabel('Add suffix').fill('');
  await tog('Trim spaces'); await tog('Remove empty lines'); await tog('Remove duplicates');
  ok((await res()).length === 8 && (await res())[2] === '  cherry  ' && (await res())[4] === '', 'all options off: input unchanged');
  await tog('Remove duplicates'); await tog('Remove empty lines'); await tog('Trim spaces');
  await inp.fill(Array.from({ length: 30 }, (_, i) => `item ${i + 1}`).join('\n'));
  await sort('Shuffle');
  const seen = new Set(); let same = true;
  for (let i = 0; i < 6; i++) { await sort('Keep order'); await sort('Shuffle'); const r = await res(); seen.add(r.join('|')); if ([...r].sort().join() !== Array.from({ length: 30 }, (_, i) => `item ${i + 1}`).sort().join()) same = false; }
  ok(same && seen.size >= 5, `shuffle keeps every line and gives different orders (${seen.size}/6 distinct)`);
  await inp.fill('b\r\na\r\nc'); await sort('A → Z');
  ok((await res()).join('|') === 'a|b|c', 'Windows line endings handled');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/lines`); await ph.getByLabel('Input').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
