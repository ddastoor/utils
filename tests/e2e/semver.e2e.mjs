// Semver Checker (#/semver, PC only): range matching compared with the npm `semver` package itself (run here in Node,
// independent of our Rust build) for many ranges × versions, strict validity, sorting, max/min match, bumps, pre-release
// option, bad range message, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { createRequire } from 'node:module';
const npm = createRequire(import.meta.url)('../../node_modules/semver');
const VERS = ['0.0.3', '0.2.3', '0.2.9', '0.3.0', '1.0.0', '1.2.2', '1.2.3', '1.2.4-beta.1', '1.2.9', '1.3.0', '1.9.9', '1.10.0', '2.0.0-rc.1', '2.0.0', '2.4.0', '2.5.0', '3.4.5-alpha.9', '5.0.0', '7.2.3', '7.2.4', '10.0.0'];
const RANGES = ['^1.2.3', '~1.2.3', '^0.2.3', '^0.0.3', '1.x', '>=1.2.3 <2.0.0', '1.x || >=2.5.0 || 5.0.0 - 7.2.3', '*', '>1.2.3-alpha.3', '<=1.2.3', '2', '~0.2', '>=2.0.0-rc.0', '1.2.x || 10.x', '!=1.0.0'];
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/semver`);
  const range = page.locator('input[aria-label=Range]'), vers = page.locator('textarea'); await range.waitFor();
  const tbl = () => page.$$eval('.card', (cs) => [...cs.find((c) => c.querySelector('.card-title')?.textContent === 'Versions').querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent)));
  await vers.fill(VERS.join('\n'));
  let bad = [];
  for (const rg of RANGES) {
    await range.fill(rg); await page.waitForTimeout(200);
    if (await page.locator('.note-warn').count()) { if (npm.validRange(rg) !== null) bad.push(`${rg}: refused`); continue; }
    const rows = await tbl();
    rows.forEach(([v, , m]) => { const want = npm.satisfies(v, rg); if ((m === '✓ yes') !== want) bad.push(`${v} ${rg}: ${m} vs npm ${want}`); });
    const mx = await page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); return s[s.indexOf('Highest listed match') + 1]; });
    const want = npm.maxSatisfying(VERS, rg) || 'none'; if (mx !== want) bad.push(`max ${rg}: ${mx} vs ${want}`);
  }
  ok(!bad.length, `${RANGES.length} ranges × ${VERS.length} versions match npm semver (satisfies + maxSatisfying) ${bad.slice(0, 5).join('; ')}`);
  await range.fill('>=1.2.0'); await page.locator('label.switch', { hasText: 'Include pre-releases' }).click(); await page.waitForTimeout(200);
  bad = []; (await tbl()).forEach(([v, , m]) => { if ((m === '✓ yes') !== npm.satisfies(v, '>=1.2.0', { includePrerelease: true })) bad.push(v); });
  ok(!bad.length, `include pre-releases = npm includePrerelease (${bad})`);
  const sorted = (await page.locator('.semver-sorted').textContent()).split('\n');
  ok(JSON.stringify(sorted) === JSON.stringify([...VERS].sort(npm.compare)), 'sorted list = npm semver.sort');
  const odd = ['1.2', 'a.b.c', '1.2.3.4', '01.2.3', '1.2.3-', '1.2.3abc', 'v1.2.3', '1.2.3-rc.1+build.5', '1.2.3-01'];
  await vers.fill(odd.join('\n')); await page.waitForTimeout(200);
  const valid = (await tbl()).map((r) => r[1].startsWith('yes'));
  ok(JSON.stringify(valid) === JSON.stringify(odd.map((v) => npm.valid(v) !== null)), `strict validity = npm semver.valid (${valid})`);
  await vers.fill('1.2.3'); await page.waitForTimeout(200);
  const bumps = await page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  const want = Object.fromEntries(['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease'].map((k) => [k, npm.inc('1.2.3', k, 'beta')]));
  ok(Object.keys(want).every((k) => bumps[k] === want[k]), `bumps with pre-release id "beta" = npm semver.inc (${Object.keys(want).map((k) => bumps[k]).join(', ')})`);
  await range.fill('>>1.0'); await page.waitForTimeout(200); ok(/not a valid range/.test(await page.locator('.note-warn').textContent()), 'invalid range → message');
  await page.locator('.chip-btn', { hasText: '~1.2.0' }).click(); ok(await range.inputValue() === '~1.2.0', 'example chip');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'semver');
};
