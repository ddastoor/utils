// Hash / Checksum (#/hash): all 23 algorithms against the independent reference (tests/fixtures/hash/reference.json) for
// text and a 3 MiB file; text hashed as it is typed; hex / HEX / Base64; the expected checksum in the forms people
// paste, with the algorithm worked out when it is missing; checksum lists (chosen with the files, or pasted), the list
// the tab writes checked by sha256sum -c; comparing files (a crafted CRC-32 collision is not "identical"); Stop.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ref = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hash/reference.json'), 'utf8'));
const gen = (n, seed) => { const out = Buffer.alloc(n); let x = seed; for (let i = 0; i < n; i++) { x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff; out[i] = (x >>> 16) & 0xff; } return out; };
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return ((~c) >>> 0).toString(16).padStart(8, '0'); };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const ALL = Object.keys(ref.cases[0].digests);

export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(`${base}#/hash`);
  const results = () => page.$$eval('.card', (cs) => cs.filter((c) => c.querySelector('.hashval')).map((c) => ({
    title: c.querySelector('h2, .card-title')?.textContent || '',
    rows: Object.fromEntries([...c.querySelectorAll('tr')].map((tr) => [tr.querySelector('th').textContent, tr.querySelector('.hashval').textContent])),
    match: c.querySelector('tr.match th')?.textContent ?? null,
    note: c.querySelector('.note')?.textContent || '' })));
  const notes = () => page.$$eval('.note', (ns) => ns.map((n) => n.textContent.trim()));
  const busy = () => page.waitForFunction(() => !document.querySelector('.btn.busy') && document.querySelector('.progress')?.hidden !== false, null, { timeout: 120000 });
  const compute = async () => { await page.getByRole('button', { name: 'Compute' }).click(); await busy(); await page.waitForTimeout(50); return results(); };
  const sw = (a) => page.locator('label.switch').filter({ hasText: new RegExp(`^${a.replace(/[()+]/g, '\\$&')}$`) });
  const setAlgs = async (want) => { await page.locator('details.more-algs').evaluate((d) => { d.open = true; }); for (const a of ALL) { const on = await sw(a).locator('input').isChecked(); if (on !== want.includes(a)) await sw(a).click(); } };
  const expected = page.locator('textarea[aria-label="Expected checksum"]');
  const T = page.locator('textarea[aria-label="Text to hash"]');
  await page.getByRole('button', { name: 'Compute' }).waitFor();
  ok(!asked.some((u) => /hash\.worker|\.wasm/.test(u)), 'nothing of the engine is fetched as the tab opens');

  // ---- text, live
  await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await T.fill('abc');
  await page.waitForFunction(() => document.querySelectorAll('.hashval').length === 4, null, { timeout: 30000 });
  let [r] = await results();
  ok(r.rows['SHA-256'] === sha('abc') && Object.keys(r.rows).join() === 'MD5,SHA-1,SHA-256,SHA-512', `text is hashed as it is typed, without Compute (the four chosen at first): ${Object.keys(r.rows)}`);
  ok(asked.some((u) => /hash\.worker/.test(u)), '… the engine came with the first text');
  await setAlgs(ALL);
  for (const c of ref.cases.filter((x) => ['', 'abc', 'नमस्ते 👋\n', 'The quick brown fox jumps over the lazy dog'].includes(x.text))) {
    await T.fill(c.text); [r] = await compute();
    const bad = ALL.filter((a) => r.rows[a] !== c.digests[a]);
    ok(!bad.length && Object.keys(r.rows).length === 23, `text ${JSON.stringify(c.text)}: 23 algorithms = the independent implementations (${bad.join(', ') || 'all equal'})`);
  }
  await setAlgs(['SHA-256', 'MD5']);
  await T.fill('abc'); await busy(); await page.waitForTimeout(400);
  await page.getByRole('radio', { name: 'HEX', exact: true }).click(); [r] = await results();
  ok(r.rows['SHA-256'] === sha('abc').toUpperCase(), 'Show as HEX');
  await page.getByRole('radio', { name: 'Base64', exact: true }).click(); [r] = await results();
  ok(r.rows['SHA-256'] === 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=', `Show as Base64 (as sha256sum --base64 writes it): ${r.rows['SHA-256']}`);
  await page.locator('tr', { hasText: 'SHA-256' }).getByRole('button', { name: 'Copy SHA-256' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=', 'Copy gives the value as shown');
  await page.getByRole('radio', { name: 'hex', exact: true }).click();

  // ---- the expected checksum
  await expected.fill('  BA7816BF 8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD ');
  await page.waitForTimeout(100); [r] = await results();
  ok(/✓ Matches the expected SHA-256 checksum/.test(r.note) && r.match === 'SHA-256', `an expected checksum in capitals with spaces: checked at once, the row marked (${r.note})`);
  await expected.fill('SHA-256: ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ae'); await page.waitForTimeout(100); [r] = await results();
  ok(/✗ Does not match: the expected checksum is not this text's SHA-256\./.test(r.note) && !/can also be/.test(r.note), `a wrong one, named SHA-256: ✗, nothing else to try (${r.note})`);
  const s3 = createHash('sha3-256').update('abc').digest('hex');
  await expected.fill(s3); await page.waitForTimeout(100); [r] = await results();
  ok(/✗ Does not match: the expected checksum is not this text's SHA-256\. A checksum of 64 hex digits can also be SHA3-256, BLAKE2b-256, Keccak-256, BLAKE2s-256 or BLAKE3\./.test(r.note), `a 64-digit checksum that is not SHA-256: the others of that length are named (it said only "No algorithm matches"): ${r.note}`);
  await page.getByRole('button', { name: 'Try those too' }).click(); await busy(); await page.waitForTimeout(100); [r] = await results();
  ok(/✓ Matches the expected SHA3-256 checksum/.test(r.note) && 'BLAKE3' in r.rows, `"Try those too" works them out and finds SHA3-256 (${r.note})`);
  await setAlgs(['MD5']); await expected.fill('');
  await T.fill('abc'); await busy(); await page.waitForTimeout(400);
  await expected.fill(sha('abc')); await page.waitForTimeout(100); [r] = await results();
  ok(/The expected checksum is a SHA-256 checksum — press Compute to work it out/.test(r.note), `a checksum pasted after the result, of a length nothing worked out has: the tab says what to press (${r.note})`);
  await page.getByRole('button', { name: 'Compute' }).click(); await busy(); [r] = await results();
  ok(/✓ Matches the expected SHA-256/.test(r.note) && (await notes()).some((n) => /SHA-256 was worked out as well, for the expected checksum/.test(n)), `… and Compute works SHA-256 out (it said "No algorithm matches the expected checksum ✗"): ${r.note}`);
  await expected.fill(`BLAKE3 checksum: ${ref.cases.find((c) => c.text === 'abc').digests.BLAKE3}`);
  await T.fill('abc'); await busy(); await page.waitForTimeout(400); [r] = await results();
  ok(/✓ Matches the expected BLAKE3 checksum/.test(r.note) && (await notes()).some((n) => /BLAKE3 was worked out as well, for the expected checksum/.test(n)), `a named algorithm that was not chosen is worked out and said (it said "No algorithm matches"): ${r.note}`);
  await expected.fill(sha('abc')); await page.waitForTimeout(100); [r] = await results();
  ok(/✗ Does not match: the expected checksum is not this text's BLAKE3\. A checksum of 64 hex digits can also be SHA-256, SHA3-256/.test(r.note), `the BLAKE3 of the last run is tried, and SHA-256 offered (${r.note})`);
  await page.getByRole('button', { name: 'Try those too' }).click(); await busy(); [r] = await results();
  ok(/✓ Matches the expected SHA-256/.test(r.note), '… and found');
  await expected.fill('the checksum is on the website'); await page.waitForTimeout(100);
  ok((await notes()).some((n) => /No checksum found in what was pasted/.test(n)), 'words without a checksum: said under the box');
  await expected.fill(`${sha('abc')}\n12345678abcdefxyz 77\n`); await page.waitForTimeout(100);
  ok((await notes()).some((n) => /Line 2 could not be read as a checksum and is left aside/.test(n)), 'a line that cannot be read is named');
  await expected.fill('');

  // ---- files
  await page.getByRole('radio', { name: 'Files', exact: true }).click();
  await setAlgs(ALL);
  const big = ref.cases.find((c) => c.gen?.[0] === 3 * 1048576 + 7), data = gen(...big.gen);
  const f1 = join(tmp, 'a.bin'), f2 = join(tmp, 'b.bin'), f3 = join(tmp, 'c.bin');
  writeFileSync(f1, data); writeFileSync(f2, data); const d3 = Buffer.from(data); d3[d3.length - 1] ^= 1; writeFileSync(f3, d3);
  await page.locator('input[type=file]').setInputFiles([f1]);
  [r] = await compute();
  const badF = ALL.filter((a) => r.rows[a] !== big.digests[a]);
  ok(!badF.length && /a\.bin · 3/.test(r.title), `3 MiB + 7 bytes: 23 algorithms = the reference (${badF.join(', ') || 'all equal'})`);
  await setAlgs(['SHA-256', 'CRC-32']);
  await page.locator('input[type=file]').setInputFiles([f1, f2]); await compute();
  ok((await notes()).includes('The two files are identical (compared by size and SHA-256).'), 'two identical files: identical, and by what');
  await page.locator('input[type=file]').setInputFiles([f1, f3]); await compute();
  ok((await notes()).includes('The two files differ (compared by size and SHA-256).'), 'the last byte changed: they differ');
  await page.locator('input[type=file]').setInputFiles([f1, f3, f2]); await compute();
  ok((await notes()).includes('Identical (compared by size and SHA-256): a.bin = b.bin. The others differ.'), 'three files: the identical pair named');
  { // a CRC-32 collision: the generator polynomial XORed into a copy keeps the CRC (crc32 is linear)
    const G = 0x104c11db7n, bits = [...Array(33)].map((_, k) => Number((G >> BigInt(32 - k)) & 1n)).concat(Array(7).fill(0));
    const D = Buffer.from([...Array(5)].map((_, j) => bits.slice(8 * j, 8 * j + 8).reduce((s, b, k) => s | (b << k), 0)));
    const x = Buffer.from('The quarterly report, final version — please read before Monday.'), y = Buffer.from(x);
    for (let k = 0; k < 5; k++) y[20 + k] ^= D[k];
    const fx = join(tmp, 'report.txt'), fy = join(tmp, 'report-2.txt'); writeFileSync(fx, x); writeFileSync(fy, y);
    ok(crc32(x) === crc32(y) && !x.equals(y), `the test's two files: different, same CRC-32 (${crc32(x)})`);
    await setAlgs(['CRC-32']);
    await page.locator('input[type=file]').setInputFiles([fx, fy]); const rs = await compute();
    ok(rs[0].rows['CRC-32'] === rs[1].rows['CRC-32'] && (await notes()).includes('The two files differ (compared by size and BLAKE3).') && !('BLAKE3' in rs[0].rows),
      `only CRC-32 chosen: the files are still told apart — by BLAKE3, worked out on the side and not shown (they were called "identical")`);
  }

  // ---- checksum lists
  const dir = tmp, sums = spawnSync('sha256sum', ['a.bin', 'c.bin'], { cwd: dir, encoding: 'utf8' }).stdout;
  writeFileSync(join(dir, 'SHA256SUMS'), sums.replace(/^\S+(\s+c\.bin)$/m, `${sha('not c')}$1`) + `${sha('x')}  missing.iso\n`);
  await setAlgs(['MD5']);
  await page.locator('input[type=file]').setInputFiles([f1, f3, join(dir, 'SHA256SUMS')]);
  ok(/SHA256SUMS — read as the checksum list \(3 checksums\), not hashed/.test(await page.locator('.drop + div, .muted.small').allTextContents().then((t) => t.join(' '))), 'a checksum list chosen with the files is read, not hashed');
  const rl = await compute();
  ok((await notes()).some((n) => n === 'Checksum list: 1 of 2 files match; 1 does not (c.bin); 1 listed file was not chosen (missing.iso).'), `a summary of the list: ${(await notes()).find((n) => /Checksum list/.test(n))}`);
  ok(/✓ Matches the expected SHA-256 checksum \(line 1 of the list, "a\.bin"\)/.test(rl[0].note) && /✗ Does not match/.test(rl[1].note), `each file against its own line (SHA-256 worked out though only MD5 was chosen): ${rl[0].note} | ${rl[1].note}`);
  await page.locator('input[type=file]').setInputFiles([join(dir, 'SHA256SUMS')]);
  await page.getByRole('button', { name: 'Compute' }).click();
  ok(/Choose the files to check as well/.test(await page.locator('.toast').last().textContent({ timeout: 10000 })), 'a list alone: asked for the files');
  // pasted output of md5sum for two files, one chosen
  await page.locator('input[type=file]').setInputFiles([f1]);
  await expected.fill(spawnSync('md5sum', ['b.bin', 'a.bin'], { cwd: dir, encoding: 'utf8' }).stdout);
  [r] = await compute();
  ok(/✓ Matches the expected MD5 checksum \(line 2 of the list, "a\.bin"\)/.test(r.note), `pasted md5sum output: the chosen file found by its name (${r.note})`);
  await expected.fill('');

  // ---- the list the tab writes
  await setAlgs(['SHA-256', 'BLAKE2b-512']);
  await page.locator('input[type=file]').setInputFiles([f1, f3]); await compute();
  const listCard = page.locator('.card').filter({ has: page.locator('.card-title', { hasText: /^Checksum list$/ }) });
  const listBox = listCard.locator('textarea');
  ok(await listBox.inputValue() === spawnSync('sha256sum', ['a.bin', 'c.bin'], { cwd: dir, encoding: 'utf8' }).stdout, 'the checksum list = what sha256sum prints for the same files');
  const [dl] = await Promise.all([page.waitForEvent('download'), listCard.getByRole('button', { name: 'Download' }).click()]);
  const saved = join(dir, 'saved-SHA256SUMS'); await dl.saveAs(saved);
  ok(dl.suggestedFilename() === 'SHA256SUMS' && spawnSync('sha256sum', ['-c', 'saved-SHA256SUMS'], { cwd: dir }).status === 0, `downloaded as ${dl.suggestedFilename()}; sha256sum -c accepts it`);
  await listCard.locator('select').selectOption('BLAKE2b-512');
  ok(await listBox.inputValue() === spawnSync('b2sum', ['a.bin', 'c.bin'], { cwd: dir, encoding: 'utf8' }).stdout, '… BLAKE2b-512: what b2sum prints');

  // ---- Stop
  const huge = join(dir, 'zeros.bin'); writeFileSync(huge, Buffer.alloc(256 << 20));
  await setAlgs(ALL);
  await page.locator('input[type=file]').setInputFiles([huge]);
  await page.getByRole('button', { name: 'Compute' }).click();
  await page.waitForFunction(() => / of 256 MB/.test(document.querySelector('.progress-label')?.textContent ?? ''), null, { timeout: 30000 });
  const label = await page.locator('.progress-label').textContent();
  await page.getByRole('button', { name: 'Stop' }).click();
  ok(/Stopped/.test(await page.locator('.toast').last().textContent({ timeout: 10000 })) && !(await page.locator('.hashval').count()), `Stop ends the run, no result (progress said "${label}")`);
  await setAlgs(['SHA-256']); await page.locator('input[type=file]').setInputFiles([f1]); [r] = await compute();
  ok(r.rows['SHA-256'] === big.digests['SHA-256'], 'after Stop the next run works');

  await setAlgs([]); await page.getByRole('button', { name: 'Compute' }).click();
  ok(/Pick at least one algorithm/.test(await page.locator('.toast').last().textContent()), 'no algorithm → message');
  const unexpected = page.errors.filter((e) => !/Pick at least one algorithm|Choose the files|Stopped/i.test(e));
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);

  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/hash`);
  await ph.getByRole('radio', { name: 'Text', exact: true }).click(); await ph.locator('textarea[aria-label="Text to hash"]').fill('abc');
  await ph.waitForFunction(() => document.querySelectorAll('.hashval').length === 4, null, { timeout: 30000 });
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll, with a SHA-512 result on screen');
};
