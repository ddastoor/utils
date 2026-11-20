// Passphrase Generator (#/passphrase): words from the EFF large list only (read back word by word — four words have a
// hyphen of their own), word count, separators, capitals, the extra digit, entropy = words × log2(7776) (+ log2(10 ×
// words) for the digit), spread over the list, libsodium.js as the engine, a word list that does not arrive whole.
import { readFileSync } from 'node:fs';
const LIST = new Set(readFileSync(new URL('../../public/data/eff_large_wordlist.txt', import.meta.url), 'utf8').split(/\s+/).filter((w) => /^[a-z-]+$/.test(w)));
const words = (p, sep) => { const go = (i) => { if (i === p.length) return []; for (let j = p.length; j > i; j--) { const w = p.slice(i, j); if (LIST.has(w.replace(/\d$/, '').toLowerCase()) && (j === p.length || p.startsWith(sep, j))) { const rest = go(j === p.length ? j : j + sep.length); if (rest) return [w, ...rest]; } } return null; }; return sep ? go(0) : null; };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(`${base}#/passphrase`);
  const ps = () => page.$$eval('code.pw', (c) => c.map((e) => e.textContent));
  const slider = page.locator('input[type=range]'), setN = async (n) => { await slider.fill(String(n)); await slider.dispatchEvent('input'); };
  const sep = (n) => page.getByRole('radio', { name: n, exact: true }).click();
  const tog = (l) => page.locator('label.switch').filter({ hasText: l }).click();
  await page.locator('code.pw').first().waitFor();
  ok(LIST.size === 7776, 'EFF list has 7,776 words');
  let p = await ps();
  ok(p.length === 5 && p.every((x) => words(x, '-')?.length === 6), 'default: 6 EFF words joined by - (read word by word: "t-shirt" is one word — the suite failed now and then on it)');
  ok(asked.some((u) => /libsodium/.test(u)) && !asked.some((u) => /crypto-[\w-]+\.wasm/.test(u)), 'the random numbers come from libsodium.js (crypto.wasm is not fetched)');
  ok((await page.locator('.pill').textContent()).includes(`~${Math.round(6 * Math.log2(7776))} bits`), '6 × log2(7776) ≈ 78 bits');
  await setN(3); await sep('space'); p = await ps(); ok(p.every((x) => words(x, ' ')?.length === 3), '3 words, space separator');
  await setN(12); await sep('underscore _'); p = await ps(); ok(p.every((x) => words(x, '_')?.length === 12), '12 words, underscore');
  await sep('dot .'); await tog('Capitalise words'); p = await ps();
  ok(p.every((x) => words(x, '.')?.every((w) => /^[A-Z]/.test(w))), 'capitalised, dot separator');
  await tog('Capitalise words'); await sep('hyphen -'); await setN(6); await tog('Add a digit'); p = await ps();
  ok(p.every((x) => { const ws = words(x, '-'); return ws?.length === 6 && ws.filter((w) => /\d$/.test(w)).length === 1; }), 'exactly one word gets a digit');
  ok((await page.locator('.pill').textContent()).includes(`~${Math.round(6 * Math.log2(7776) + Math.log2(60))} bits`), `the digit adds log2(10 × 6) bits — which digit and after which word (it added log2(10)): ${await page.locator('.pill').textContent()}`);
  await tog('Add a digit'); await sep('none'); p = await ps(); ok(p.every((x) => /^[a-z-]+$/.test(x) && !x.includes(' ')), 'no separator');
  await sep('hyphen -'); await setN(12); const seen = new Set();
  for (let i = 0; i < 40; i++) { await page.getByRole('button', { name: 'Generate again' }).click(); (await ps()).forEach((x) => words(x, '-').forEach((w) => seen.add(w))); }
  ok(seen.size > 1900, `2,400 draws reach ${seen.size} different words (expected ≈ 2,050 for a uniform pick from 7,776)`);
  const firstP = (await ps())[0]; await page.getByRole('button', { name: 'Copy passphrase 1' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === firstP, 'Copy passphrase 1 (the five buttons were all "Copy")');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  for (const [label, route] of [['a missing word list (404)', (r) => r.fulfill({ status: 404, body: 'Not found' })], ['an error page served instead of it', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>\n<body>\nOops\n</body>\n</html>' })]]) {
    const q = await newPage(); await q.route(/eff_large_wordlist\.txt/, route); await q.goto(`${base}#/passphrase`);
    const said = await q.locator('.tool-error, .note-err, .toast').first().textContent({ timeout: 15000 }).catch(() => '');
    ok(/word list/i.test(said) && !(await q.locator('code.pw').count()), `${label}: said, and no passphrase is made from it (${said.trim().slice(0, 90)})`);
    await q.close();
  }
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/passphrase`); await ph.locator('code.pw').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
