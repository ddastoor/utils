// Password Generator (#/password): length, character sets, at least one of each chosen set, look-alikes excluded,
// entropy label = length × log2(alphabet), uniform character use (chi-square over 20,000 characters), copy.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/password`);
  const pws = () => page.$$eval('code.pw', (c) => c.map((e) => e.textContent));
  const slider = page.locator('input[type=range]'), setLen = async (n) => { await slider.fill(String(n)); await slider.dispatchEvent('input'); };
  const tog = (l) => page.locator('label.switch').filter({ hasText: l }).click();
  const pill = () => page.locator('.pill').textContent();
  await page.locator('code.pw').first().waitFor();
  const SYM = '!@#$%^&*()-_=+[]{};:,.<>/?~';
  let p = await pws();
  ok(p.length === 5 && p.every((x) => x.length === 20) && new Set(p).size === 5, 'default: 5 different passwords of 20');
  ok(p.every((x) => /[A-Z]/.test(x) && /[a-z]/.test(x) && /\d/.test(x) && [...x].some((c) => SYM.includes(c))), 'each has upper, lower, digit and symbol');
  ok(await pill() === `Very strong · ~${Math.round(20 * Math.log2(26 + 26 + 10 + SYM.length))} bits of entropy`, `entropy 20 × log2(${26 + 26 + 10 + SYM.length}) (${await pill()})`);
  await setLen(6); p = await pws(); ok(p.every((x) => x.length === 6) && /Fair|Weak/.test(await pill()), 'length 6, weaker label');
  await setLen(128); p = await pws(); ok(p.every((x) => x.length === 128), 'length 128');
  await tog('Symbols'); await tog('Uppercase'); await setLen(16); p = await pws();
  ok(p.every((x) => /^[a-z0-9]{16}$/.test(x) && /\d/.test(x) && /[a-z]/.test(x)) && (await pill()).includes(`${Math.round(16 * Math.log2(36))} bits`), 'lower + digits only, both present, 16 × log2(36) bits');
  await tog('Lowercase'); p = await pws(); ok(p.every((x) => /^\d{16}$/.test(x)), 'digits only (PIN-like)');
  await tog('Digits'); ok(/Pick at least one character set/.test(await page.locator('.note-warn').textContent()), 'no set → message');
  await tog('Uppercase'); await tog('Lowercase'); await tog('Digits'); await tog('Symbols'); await tog('Avoid look-alikes');
  await setLen(64); const chars = [];
  for (let i = 0; i < 64; i++) { await page.getByRole('button', { name: 'Generate again' }).click(); (await pws()).forEach((x) => chars.push(...x)); }
  ok(!chars.some((c) => 'Il1O0o|`\'"'.includes(c)), 'look-alikes never used');
  const alpha = [...new Set(('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' + SYM).replace(/[Il1O0o|`'"]/g, ''))], counts = Object.fromEntries(alpha.map((c) => [c, 0]));
  chars.forEach((c) => counts[c]++);
  const E = chars.length / alpha.length, chi = Object.values(counts).reduce((s, o) => s + (o - E) ** 2 / E, 0);
  ok(Object.keys(counts).length === alpha.length && chi < alpha.length + 4 * Math.sqrt(2 * alpha.length), `uniform over the ${alpha.length}-character alphabet: χ² = ${chi.toFixed(1)} for ${chars.length} characters`);
  const first = (await pws())[0]; await page.locator('.pwrow').first().getByRole('button', { name: 'Copy' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === first, 'copy');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/password`); await ph.locator('code.pw').first().waitFor();
  await ph.locator('input[type=range]').fill('128'); await ph.locator('input[type=range]').dispatchEvent('input');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: 128-character passwords wrap, no horizontal scroll');
};
