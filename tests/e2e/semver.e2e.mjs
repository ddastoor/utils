// Semver Checker (#/semver, PC only): range matching compared with the npm `semver` package itself (run here in Node,
// independent of our Rust port of it) for many ranges × versions with and without pre-releases, "Means", lowest possible, strict validity, sorting, max/min match, bumps, pre-release
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
  // ---- bug hunt, Nov 2026: the engine is now a port of npm's own range logic (it used to be a look-alike crate that
  // answered differently in many cases). Everything on the page is compared with the npm package again, more widely.
  const rowsKV = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  const V2 = ['0.0.0', '0.0.1', '0.1.0', '0.2.5', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.2.3-alpha.3', '1.2.3-beta.1', '1.2.3', '1.2.4', '1.3.0-beta.1', '1.9.9', '2.0.0-0', '2.0.0-rc.1', '2.0.0', '2.9.9', '3.0.0', '10.0.0'];
  const R2 = ['>1.2.3 <1.2.3', '1.2.3 1.2.4', '>=1.2.3 <=1.2.3-beta', '1 ||', '|| 1', '1.2.3 - 2', '1 - 2', '>1.x', '<2.x', '^1.x', '~1.x', '^1.2.3-beta.1', '>=1.0.0-0', '<1', '^0.0', 'x', '1.2.3 - 2.3', '>=1 <2 || 3', '=1.2.3', 'v1.2.3', '^0', '~0', '1.2 - 2.3.4', '<=1.2.x', '>= 1.2.3 < 2',
    '>=1.2.3 , <2', '1.2.3 - ', '^01.2.3', '>01.02.03', 'x.2.3', '1.x.3', 'banana', '1.2.3.4', '^', '>'];
  await page.locator('label.switch', { hasText: 'Include pre-releases' }).click(); // (off again)
  for (const incl of [false, true]) {
    if (incl) await page.locator('label.switch', { hasText: 'Include pre-releases' }).click();
    await vers.fill(V2.join('\n')); bad = [];
    for (const rg of R2) {
      await range.fill(rg); await page.waitForTimeout(170);
      const want = npm.validRange(rg, { includePrerelease: incl }), refusedNow = await page.locator('.tool-body .card .note-warn, .tool-body > div > .note-warn').count() > 0 || /not a valid range/.test(await page.locator('.tool-body').innerText());
      if (want === null) { if (!refusedNow) bad.push(`${rg}: npm refuses it, the tab does not`); continue; }
      if (refusedNow) { bad.push(`${rg}: refused, npm accepts it`); continue; }
      (await tbl()).forEach(([v, , m]) => { const w = npm.satisfies(v, rg, { includePrerelease: incl }); if ((m === '✓ yes') !== w) bad.push(`${v} in ${rg}: ${m} vs npm ${w}`); });
      const kv = await rowsKV(), mv = npm.minVersion(rg, { includePrerelease: incl });
      if (kv.Means !== want || kv['Lowest possible'] !== (mv ? mv.version : '—') || kv['Highest listed match'] !== (npm.maxSatisfying(V2, rg, { includePrerelease: incl }) || 'none') || kv['Lowest listed match'] !== (npm.minSatisfying(V2, rg, { includePrerelease: incl }) || 'none')) bad.push(`${rg}: Means "${kv.Means}" (npm "${want}"), lowest possible ${kv['Lowest possible']}, max ${kv['Highest listed match']}, min ${kv['Lowest listed match']}`);
    }
    ok(!bad.length, `${R2.length} more ranges × ${V2.length} versions, include pre-releases ${incl ? 'on' : 'off'}: matches, "Means", lowest possible, highest / lowest listed match and refused ranges = npm semver ${bad.slice(0, 4).join(' | ')} ${bad.length > 4 ? `(+${bad.length - 4})` : ''}`);
  }
  await page.locator('label.switch', { hasText: 'Include pre-releases' }).click();
  await range.fill('>1.2.3 <1.2.3'); await page.waitForTimeout(200); ok((await tbl()).every((r) => r[2] === '✗ no') && (await rowsKV())['Highest listed match'] === 'none', 'a range that nothing can satisfy matches nothing (it used to match every version)');
  await range.fill(''); await page.waitForTimeout(200); ok((await tbl()).every((r) => r.length === 2) && !('Means' in await rowsKV()), 'empty range: validity only, no match column');
  // bumps: several starting versions and pre-release ids
  bad = [];
  for (const [v, preid] of [['1.2.3', 'beta'], ['1.2.3', ''], ['1.2.3-beta.1', 'beta'], ['1.2.3-beta.1', 'rc'], ['1.2.3-beta', 'beta'], ['1.2.3-0', ''], ['2.0.0-rc.1', 'rc'], ['1.2.3+build.7', 'beta'], ['0.0.0', 'alpha'], ['1.0.0-x.7.z.92', 'x'], ['1.2.3-beta.1', 'beta.1']]) {
    await vers.fill(v); await page.locator('input[aria-label="Pre-release id"]').fill(preid); await page.waitForTimeout(200); const b2 = await rowsKV();
    for (const k of ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease']) { const w = npm.inc(v, k, {}, preid || undefined); if (b2[k] !== (w ?? '—')) bad.push(`${v} ${k} (${preid}): ${b2[k]} vs npm ${w}`); }
  }
  ok(!bad.length, `next versions for 11 starting versions / pre-release ids = npm semver.inc (build metadata dropped, as npm does) ${bad.slice(0, 4).join(' | ')}`);
  await page.locator('input[aria-label="Pre-release id"]').fill('beta');
  // versions: more odd strings, sort with build metadata, numbers at the limit
  const odd2 = ['1.2.3', ' 1.2.4 ', '=1.2.3', 'V1.2.3', '1.02.3', '1.2.3-0123', '1.2.3-0123a', '1.2.3--', '9007199254740991.0.0', '9007199254740992.0.0', '1.2.3-é', '1.2.3+a_b', '1.0.0+0.build.1-rc.10000aaa-kk-0.1', '1.2.3----RC-SNAPSHOT.12.9.1--.12+788'];
  await vers.fill(odd2.join('\n')); await page.waitForTimeout(200); const v3 = (await tbl()).map((r) => r[1].startsWith('yes'));
  ok(JSON.stringify(v3) === JSON.stringify(odd2.map((v) => npm.valid(v.trim()) !== null)), `14 more odd version strings: valid / not valid = npm (${v3.map((x) => (x ? 'y' : 'n')).join('')}; 9007199254740991.0.0 is valid, …992 is not)`);
  const srt = ['1.0.0-rc.1', '1.0.0', '1.0.0+b', '1.0.0+a', '1.0.0-rc.1+z', '1.0.0-alpha.10', '1.0.0-alpha.9', '1.0.0-alpha.beta', '1.0.0-alpha', '1.0.0-1', '1.0.0-A', '1.0.0-a', '10.0.0', '9.0.0'];
  await vers.fill(srt.join('\n')); await page.waitForTimeout(200);
  ok(JSON.stringify((await page.locator('.semver-sorted').textContent()).split('\n')) === JSON.stringify(npm.sort([...srt])), `sorted list incl. build metadata = npm semver.sort (${(await page.locator('.semver-sorted').textContent()).split('\n').slice(0, 5).join(' < ')} …)`);
  await vers.fill(''); await page.waitForTimeout(200); ok((await page.locator('.semver-sorted').textContent()) === '—' && !page.errors.length, 'no versions: empty lists, no error');
  for (const c of await page.locator('.chip-btn').allTextContents()) { await page.locator('.chip-btn', { hasText: c }).first().click(); await page.waitForTimeout(100); if (/not a valid range/.test(await page.locator('.tool-body').innerText())) ok(false, `chip ${c} is not a valid range`); }
  ok(true, 'every example chip is a valid range');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'semver');
};
