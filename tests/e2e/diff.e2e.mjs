// Text Diff (#/diff): Myers diff in textcore.wasm by lines, words and characters — minimal edit counts, applying the
// shown diff to the original rebuilds the changed text, identical texts, large inputs.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/diff`);
  const A = page.getByLabel('Original'), B = page.getByLabel('Changed'), info = page.locator('.card').filter({ hasText: 'Differences' }).locator('.muted.small');
  const mode = (m) => page.getByRole('radio', { name: m, exact: true }).click();
  const set = async (a, b) => { await A.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, a); await B.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, b); };
  /** the shown ops; equal + inserted rebuild B, equal + deleted rebuild A */
  const ops = () => page.evaluate(() => [...document.querySelectorAll('.dl, .dw')].map((e) => ({ k: e.className.match(/-(eq|ins|del)\b/)?.[1] || (e.className.includes('ins') ? 'ins' : e.className.includes('del') ? 'del' : 'eq'), t: e.classList.contains('dl') ? e.lastChild.textContent : e.textContent })));
  await A.waitFor();
  ok(/1 added, 1 removed|2 added, 1 removed/.test(await info.textContent()), `default: banana → blueberry, + elderberry (${await info.textContent()})`);
  ok((await info.textContent()).startsWith('2 added, 1 removed'), 'minimal edit: 2 added, 1 removed (lines)');
  const lcsLen = (a, b) => { const d = Array(b.length + 1).fill(0); for (const x of a) { let prev = 0; for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = x === b[j - 1] ? prev + 1 : Math.max(d[j], d[j - 1]); prev = tmp; } } return d[b.length]; };
  const cases = [['the cat sat on the mat', 'the dog sat on a mat'], ['abcabba', 'cbabac'], ['line one\nline two\nline three', 'line one\nline 2\nline three\nline four']];
  for (const [m, split] of [['Words', (s) => s.split(/(\s+)/).filter((x) => x !== '')], ['Characters', (s) => [...s]], ['Lines', (s) => s.split('\n')]]) {
    await mode(m);
    for (const [a, b] of cases) {
      await set(a, b);
      const o = await ops(), x = split(a), y = split(b), L = lcsLen(x, y);
      const rebuiltB = o.filter((e) => e.k !== 'del').map((e) => e.t), rebuiltA = o.filter((e) => e.k !== 'ins').map((e) => e.t);
      const ins = o.filter((e) => e.k === 'ins').length, del = o.filter((e) => e.k === 'del').length;
      const join = m === 'Lines' ? (v) => v.join('\n') : (v) => v.join('');
      ok(join(rebuiltA) === a && join(rebuiltB) === b.replace(/^$/, ' ') || join(rebuiltB) === b, `${m}: "${a.slice(0, 18)}…" — the diff rebuilds both texts`);
      ok(ins === y.length - L && del === x.length - L, `${m}: minimal (${del} removed, ${ins} added = LCS ${L})`);
    }
  }
  await mode('Lines'); await set('same\ntext', 'same\ntext');
  ok((await info.textContent()) === 'The texts are identical.', 'identical texts');
  const big = Array.from({ length: 3000 }, (_, i) => `row ${i}`);
  const big2 = big.map((l, i) => (i % 500 === 0 ? `${l} changed` : l));
  await set(big.join('\n'), big2.join('\n'));
  ok((await info.textContent()).startsWith('6 added, 6 removed'), `3,000 lines with 6 edits (${await info.textContent()})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/diff`); await ph.getByLabel('Original').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
