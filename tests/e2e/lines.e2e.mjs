// Line Tools (#/lines) in the browser: the options with known answers, lists as the GNU tools treat them
// (tests/fixtures/lines/reference.json — python3 scripts/make-lines-reference.py), sort by number and by length,
// a shuffle that is fair, keeps every line and stays put while other options change, engines fetched only when
// their option is chosen, a long list, phone layout.
import { readFileSync } from 'node:fs';
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';

const REF = JSON.parse(readFileSync(new URL('../fixtures/lines/reference.json', import.meta.url), 'utf8'));

export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = []; page.on('request', (r) => fetched.push(r.url().split('/').pop()));
  await page.goto(`${base}#/lines`);
  const inp = page.getByLabel('Input'), out = page.locator('.card').filter({ hasText: 'Output' }).locator('textarea');
  const tog = (name) => page.locator('label.switch').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
  const sort = (name) => page.getByRole('radio', { name, exact: true }).click();
  const res = async () => { const v = await out.inputValue(); return v === '' ? [] : v.split('\n'); };
  const info = () => page.locator('.muted.small').filter({ hasText: 'in →' }).textContent();
  const type = async (text) => { await setValue(inp, text); await page.waitForTimeout(30); };
  await inp.waitFor();

  // ---- the sample and every option
  ok((await res()).join('|') === '9|10|apple|banana|Banana|cherry', `default: trimmed, empties and duplicates removed, natural A→Z (${(await res()).join('|')})`);
  ok(await info() === '8 lines in → 6 lines out · 1 empty line and 1 duplicate removed', `the line under the result says what was removed (${await info()})`);
  ok(!fetched.some((f) => /\.wasm/.test(f)), `no engine is fetched for this (${fetched.filter((f) => /\.wasm/.test(f)).join(', ')}) — the tab fetched crypto.wasm at open`);
  await tog('…ignoring case');
  ok((await res()).join('|') === '9|10|apple|banana|cherry', 'duplicates ignoring case');
  await sort('Z → A'); ok((await res()).join('|') === 'cherry|banana|apple|10|9', 'Z → A (natural numbers)');
  await sort('Keep order'); ok((await res()).join('|') === 'banana|apple|cherry|10|9', 'keep order (first occurrence kept)');
  await tog('Reverse order'); ok((await res()).join('|') === '9|10|cherry|apple|banana', 'reverse');
  await tog('Number lines'); ok((await res())[0] === '1. 9' && (await res())[4] === '5. banana', 'numbering');
  await page.getByLabel('Add prefix').fill('- [ ] '); await page.getByLabel('Add suffix').fill(';');
  ok((await res())[0] === '1. - [ ] 9;', `prefix and suffix (${(await res())[0]})`);
  await tog('Number lines'); await tog('Reverse order'); await page.getByLabel('Add prefix').fill(''); await page.getByLabel('Add suffix').fill('');
  await tog('Trim spaces'); await tog('Remove empty lines'); await tog('Remove duplicates'); await tog('…ignoring case');
  ok((await res()).length === 8 && (await res())[2] === '  cherry  ' && (await res())[4] === '' && await info() === '8 lines in → 8 lines out', 'all options off: input unchanged');

  // ---- what was wrong
  await type('b\na\n'); await sort('A → Z');
  ok((await res()).join('|') === 'a|b' && await info() === '2 lines in → 2 lines out', `a list that ends with a line break: no blank line on top, 2 lines (the tab made 3 and put an empty one first) — ${JSON.stringify(await res())}`);
  await type(''); ok((await res()).length === 0 && await info() === '0 lines in → 0 lines out', `an empty box is 0 lines (the tab said "1 lines in") — ${await info()}`);
  await type('one'); ok(await info() === '1 line in → 1 line out', '"1 line", not "1 lines"');
  await tog('Remove duplicates');
  await type('café\ncafe\u0301\ncafe'); ok((await res()).join('|') === 'cafe|café', `é typed as one character or as e + accent is one line: two lines are left of three (${(await res()).join('|')})`);
  await tog('…ignoring case'); await type('Straße\nSTRASSE\nstrasse'); ok((await res()).join('|') === 'Straße', `ignoring case, STRASSE is Straße (${(await res()).join('|')})`);
  await tog('…ignoring case'); await tog('Remove duplicates');

  // ---- by number
  await type('10\n9\n-3\n2.5\n-20\n1.10\n1.5\n1.25'); await sort('A → Z'); const dict = (await res()).join('|');
  await sort('0 → 9');
  ok((await res()).join('|') === '-20|-3|1.10|1.25|1.5|2.5|9|10', `0 → 9 sorts negatives and decimals by value (A → Z gave ${dict}) — ${(await res()).join('|')}`);
  await type('₹1,20,000\n₹ 500\nfree\n₹99.50\n−40\n1e3');
  ok((await res()).join('|') === '−40|₹99.50|₹ 500|1e3|₹1,20,000|free' && /1 line without a number at the end/.test(await info()), `amounts with ₹ and Indian grouping, a real minus sign, 1e3; a line without a number last (${(await res()).join('|')}; ${await info()})`);
  await tog('Reverse order'); ok((await res())[0] === 'free' && (await res())[1] === '₹1,20,000', '9 → 0 with "Reverse order"'); await tog('Reverse order');

  // ---- the GNU tools' answers through the page: a sample of each kind
  const HOW = { az: 'A → Z', natural: 'A → Z', num: '0 → 9' }, bad = [];
  for (const kind of ['az', 'natural', 'num']) {
    await sort(HOW[kind]);
    for (const c of REF.filter((x) => x.what === kind).slice(0, 12)) { await type(c.text); const got = await res(); if (got.join('\n') !== c.lines.join('\n')) bad.push(`${kind}: ${JSON.stringify(got.slice(0, 5))}, the tool ${JSON.stringify(c.lines.slice(0, 5))}`); }
  }
  ok(!bad.length, `36 lists sorted as GNU sort, sort -V and sort -g sort them ${bad.slice(0, 3).join(' | ')}`);

  // ---- by length: characters, with textkit.wasm fetched now
  const before = fetched.filter((f) => /\.wasm/.test(f)).length;
  await type('👍🏽👍🏽\nabcd\nनमस्ते\nab'); await sort('By length');
  ok(await until(page, () => document.querySelectorAll('textarea')[1].value === '👍🏽👍🏽\nab\nनमस्ते\nabcd'), `by length counts characters: two emoji with skin tone = 2, नमस्ते = 3 (${JSON.stringify(await res())})`);
  ok(before === 0 && fetched.filter((f) => /\.wasm/.test(f)).join() .startsWith('textkit-'), `textkit.wasm is fetched when "By length" is chosen, not before (${fetched.filter((f) => /\.wasm/.test(f)).join(', ')})`);

  // ---- shuffle
  const items = Array.from({ length: 30 }, (_, i) => `item ${i + 1}`);
  await sort('Keep order'); await type(items.join('\n'));
  const noCrypto = !fetched.some((f) => /^crypto-.*\.wasm/.test(f));
  await sort('Shuffle');
  ok(await until(page, (plain) => document.querySelectorAll('textarea')[1].value !== plain, items.join('\n')) && noCrypto && fetched.some((f) => /^crypto-.*\.wasm/.test(f)), 'shuffle fetches crypto.wasm when it is chosen, not before');
  const first = (await res()).join('|');
  ok([...(await res())].sort().join() === [...items].sort().join() && first !== items.join('|'), 'shuffle keeps every line and changes the order');
  await page.getByLabel('Add prefix').fill('- '); await page.getByLabel('Add suffix').fill('!'); await tog('Number lines');
  const decorated = (await res()).map((l) => l.replace(/^\d+\. - /, '').replace(/!$/, '')).join('|');
  ok(decorated === first, 'the shuffled order stays while a prefix is typed and numbering is switched on (every key used to shuffle anew)');
  await tog('Number lines'); await page.getByLabel('Add prefix').fill(''); await page.getByLabel('Add suffix').fill('');
  const seen = new Set([first]); let same = true;
  for (let i = 0; i < 6; i++) { await page.getByRole('button', { name: 'Shuffle again' }).click(); await page.waitForTimeout(40); const r = await res(); seen.add(r.join('|')); if ([...r].sort().join() !== [...items].sort().join()) same = false; }
  ok(same && seen.size >= 6, `"Shuffle again" gives a new order each time, always with every line (${seen.size} orders in 7)`);
  // fairness: where does "item 1" land in 300 shuffles of five lines? (χ², 4 degrees of freedom, p = 0.001 at 18.47)
  await type('item 1\nb\nc\nd\ne'); const at = [0, 0, 0, 0, 0];
  for (let i = 0; i < 300; i++) { await page.getByRole('button', { name: 'Shuffle again' }).evaluate((b) => b.click()); at[(await res()).indexOf('item 1')]++; }
  const chi = at.reduce((a, n) => a + (n - 60) ** 2 / 60, 0);
  ok(chi < 18.47 && at.every((n) => n > 0), `300 shuffles of five lines put a line in each place about equally often (${at.join(', ')}; χ² ${chi.toFixed(1)})`);
  await sort('A → Z'); ok(await page.getByRole('button', { name: 'Shuffle again' }).isHidden(), '"Shuffle again" is shown only with Shuffle');

  // ---- Windows line ends, copy, a long list
  await type('b\r\na\r\nc'); ok((await res()).join('|') === 'a|b|c', 'Windows line endings handled');
  await hookClipboard(page); await page.locator('.card').filter({ hasText: 'Output' }).getByRole('button', { name: 'Copy' }).click();
  ok((await copied(page))[0] === 'a\nb\nc', 'Copy gives the result');
  let seed = 3; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const big = Array.from({ length: 120000 }, () => `row ${Math.floor(rnd() * 40000)}`).join('\n');
  await tog('Remove duplicates');
  const took = await inp.evaluate((e, v) => { e.value = v; const t0 = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t0; }, big);
  const uniq = new Set(big.split('\n')).size;
  ok(took < 50 && await until(page, (n) => document.querySelectorAll('textarea')[1].value.split('\n').length === n, uniq, 20000), `120,000 lines: the keystroke returns in ${took.toFixed(1)} ms and the ${uniq.toLocaleString('en-IN')} different lines follow, sorted`);
  ok(new RegExp(`^1,20,000 lines in → ${uniq.toLocaleString('en-IN')} lines out · ${(120000 - uniq).toLocaleString('en-IN')} duplicates removed$`).test(await info()), `… with the count (${await info()})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__supertoolsLive().resources.length === 0), 'both engines are released when the tab is left');

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/lines`); await ph.getByLabel('Input').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  const seg = await ph.getByRole('radio', { name: '0 → 9', exact: true }).boundingBox(), sw = await ph.locator('label.switch').first().boundingBox();
  ok(seg.height >= 44 && sw.height >= 44, `phone: the sort choices and the switches are at least 44 px tall (${Math.round(seg.height)}, ${Math.round(sw.height)})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
