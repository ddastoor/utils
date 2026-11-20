// Password Generator (#/password): length (slider and box, 4 – 128), character sets, at least one of each chosen set,
// the symbols box, look-alikes excluded, entropy = log2 of the passwords the settings allow (counted here by
// inclusion–exclusion), uniform character use (chi-square), copy, the engine (libsodium.js) and the phone layout.
const count = (sizes, len) => { let n = 0n; const k = sizes.length; for (let m = 0; m < 1 << k; m++) { let size = sizes.reduce((a, b) => a + b, 0), bits = 0; sizes.forEach((x, i) => { if (m & (1 << i)) { size -= x; bits++; } }); n += (bits % 2 ? -1n : 1n) * BigInt(size) ** BigInt(len); } return n; };
const log2 = (x) => { const b = x.toString(2).length; return b <= 53 ? Math.log2(Number(x)) : b - 53 + Math.log2(Number(x >> BigInt(b - 53))); };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(`${base}#/password`);
  const pws = () => page.$$eval('code.pw', (c) => c.map((e) => e.textContent));
  const slider = page.locator('input[type=range]'), setLen = async (n) => { await slider.fill(String(n)); await slider.dispatchEvent('input'); };
  const tog = (l) => page.locator('label.switch').filter({ hasText: l }).click();
  const pill = () => page.locator('.pill').textContent();
  await page.locator('code.pw').first().waitFor();
  const SYM = '!@#$%^&*()-_=+[]{};:,.<>/?~';
  let p = await pws();
  ok(p.length === 5 && p.every((x) => x.length === 20) && new Set(p).size === 5, 'default: 5 different passwords of 20');
  ok(p.every((x) => /[A-Z]/.test(x) && /[a-z]/.test(x) && /\d/.test(x) && [...x].some((c) => SYM.includes(c))), 'each has upper, lower, digit and symbol');
  ok(await pill() === `Very strong · ~${Math.round(log2(count([26, 26, 10, SYM.length], 20)))} bits of entropy` && Math.round(log2(count([26, 26, 10, SYM.length], 20))) === 129, `entropy = log2 of the passwords with one of each set: 129 bits (it said 20 × log2(89) = 130, counting passwords it never makes): ${await pill()}`);
  ok(/89 characters to choose from, at least one of each of the 4 sets\./.test(await page.locator('.pill + .muted').textContent()), 'the alphabet and the rule are said under the label');
  ok(asked.some((u) => /libsodium/.test(u)) && !asked.some((u) => /crypto-[\w-]+\.wasm/.test(u)), 'the random numbers come from libsodium.js (crypto.wasm is not fetched)');
  ok(/libsodium/.test(await page.locator('.note').last().textContent()), 'the note says where the randomness comes from');
  await page.locator('input[aria-label="Length (characters)"]').fill('32'); p = await pws();
  ok(p.every((x) => x.length === 32) && await slider.inputValue() === '32', 'the length typed into the box (the slider follows)');
  await page.locator('input[aria-label="Length (characters)"]').fill('300'); await page.locator('input[aria-label="Length (characters)"]').blur(); p = await pws();
  ok(await page.locator('input[aria-label="Length (characters)"]').inputValue() === '128' && p.every((x) => x.length === 128), 'a length above 128 is brought to 128 when the box is left');
  await page.locator('input[aria-label="Length (characters)"]').fill('2'); await page.locator('input[aria-label="Length (characters)"]').blur(); p = await pws();
  ok(await page.locator('input[aria-label="Length (characters)"]').inputValue() === '4' && p.every((x) => x.length === 4), '… one below 4 to 4');
  ok(/Weak · ~\d+ bits/.test(await pill()) && (await pill()).includes(`~${Math.round(log2(count([26, 26, 10, SYM.length], 4)))} bits`), `four characters, four sets: ${await pill()}`);
  await page.locator('input[aria-label="Length (characters)"]').fill('20'); await page.locator('input[aria-label="Length (characters)"]').blur();
  await setLen(6); p = await pws(); ok(p.every((x) => x.length === 6) && /Fair|Weak/.test(await pill()), 'length 6, weaker label');
  await setLen(128); p = await pws(); ok(p.every((x) => x.length === 128), 'length 128');
  await tog('Symbols'); await tog('Uppercase'); await setLen(16); p = await pws();
  ok(p.every((x) => /^[a-z0-9]{16}$/.test(x) && /\d/.test(x) && /[a-z]/.test(x)) && (await pill()).includes(`${Math.round(log2(count([26, 10], 16)))} bits`), 'lower + digits only, both present, log2(36^16 − 26^16 − 10^16) bits');
  await tog('Lowercase'); p = await pws(); ok(p.every((x) => /^\d{16}$/.test(x)), 'digits only (PIN-like)');
  await page.locator('input[aria-label="Length (characters)"]').fill('4'); p = await pws();
  ok(p.every((x) => /^\d{4}$/.test(x)) && (await pill()).includes(`~${Math.round(4 * Math.log2(10))} bits`), 'a four-digit PIN (the length went down to 6 only)');
  await page.locator('input[aria-label="Length (characters)"]').fill('16');
  await tog('Digits'); ok(/Pick at least one character set/.test(await page.locator('.note-warn').textContent()), 'no set → message');
  // the symbols box
  await tog('Symbols'); const symBox = page.locator('input[aria-label="Symbols to use"]');
  await symBox.fill('#!# a1'); p = await pws();
  ok(p.every((x) => /^[#!]{16}$/.test(x)) && /Left out \(not a symbol\): space a 1/.test(await page.locator('.muted.small', { hasText: 'Left out' }).textContent()), 'only the symbols typed into the box are used; what is not a symbol is named');
  await symBox.fill('abc'); ok(/The symbols box holds no symbol/.test(await page.locator('.note-warn').textContent()), 'a box without symbols, no other set: said (it would have looped for ever)');
  await page.getByRole('button', { name: 'Reset' }).click(); ok(await symBox.inputValue() === SYM, 'Reset brings the usual symbols back');
  await tog('Symbols'); ok(await symBox.isHidden(), 'the symbols box only with Symbols on');
  await tog('Uppercase'); await tog('Lowercase'); await tog('Digits'); await tog('Symbols'); await tog('Avoid look-alikes');
  await page.locator('input[aria-label="Length (characters)"]').fill('64');
  const chars = [];
  for (let i = 0; i < 64; i++) { await page.getByRole('button', { name: 'Generate again' }).click(); (await pws()).forEach((x) => chars.push(...x)); }
  ok(!chars.some((c) => 'Il1O0o|`\'"'.includes(c)), 'look-alikes never used');
  const alpha = [...new Set(('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' + SYM).replace(/[Il1O0o|`'"]/g, ''))], counts = Object.fromEntries(alpha.map((c) => [c, 0]));
  chars.forEach((c) => counts[c]++);
  const E = chars.length / alpha.length, chi = Object.values(counts).reduce((s, o) => s + (o - E) ** 2 / E, 0);
  ok(Object.keys(counts).length === alpha.length && chi < alpha.length + 4 * Math.sqrt(2 * alpha.length), `uniform over the ${alpha.length}-character alphabet: χ² = ${chi.toFixed(1)} for ${chars.length} characters`);
  const first = (await pws())[0]; await page.getByRole('button', { name: 'Copy password 1' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === first, 'copy');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/password`); await ph.locator('code.pw').first().waitFor();
  await ph.locator('input[type=range]').fill('128'); await ph.locator('input[type=range]').dispatchEvent('input');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: 128-character passwords wrap, no horizontal scroll');
};
