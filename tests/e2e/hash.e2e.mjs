// Hash / Checksum (#/hash): all nine algorithms against Node's crypto / published test vectors for text and a 3 MB
// file, the empty input, verifying an expected checksum, comparing two files.
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const crc32 = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ((~c) >>> 0).toString(16).padStart(8, '0'); };
const node = { MD5: 'md5', 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-512': 'sha512', 'SHA3-256': 'sha3-256', 'SHA3-512': 'sha3-512', 'BLAKE2b-512': 'blake2b512' };
const ref = (b) => ({ ...Object.fromEntries(Object.entries(node).map(([k, a]) => [k, createHash(a).update(b).digest('hex')])), 'CRC-32': crc32(b) });
export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/hash`);
  const results = () => page.$$eval('.card', (cs) => cs.filter((c) => c.querySelector('.hashval')).map((c) => ({ title: c.querySelector('h2, .card-title')?.textContent || '', rows: Object.fromEntries([...c.querySelectorAll('tr')].map((tr) => [tr.querySelector('th').textContent, tr.querySelector('.hashval').textContent])), note: c.querySelector('.note')?.textContent || '' })));
  const compute = async () => { await page.getByRole('button', { name: 'Compute' }).click(); await page.waitForFunction(() => document.querySelectorAll('.hashval').length > 0 && !document.querySelector('.btn.busy'), null, { timeout: 60000 }); return results(); };
  await page.getByRole('button', { name: 'Compute' }).waitFor();
  for (const a of ['SHA3-256', 'SHA3-512', 'BLAKE2b-256', 'BLAKE2b-512', 'CRC-32']) await page.locator('label.switch').filter({ hasText: new RegExp(`^${a}$`) }).click();
  await page.getByRole('radio', { name: 'Text', exact: true }).click();
  const T = page.getByPlaceholder(/Text to hash/);
  for (const s of ['abc', '', 'नमस्ते 👋\n']) {
    await T.fill(s); const [r] = await compute(), e = ref(Buffer.from(s));
    const bad = Object.entries(e).filter(([k, v]) => r.rows[k] !== v).map(([k]) => k);
    ok(!bad.length && Object.keys(r.rows).length === 9, `text ${JSON.stringify(s)}: 9 algorithms match Node / reference (${bad.join(', ') || 'all'})`);
  }
  await T.fill('abc'); const [abc] = await compute();
  ok(abc.rows['BLAKE2b-256'] === 'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319', 'BLAKE2b-256("abc") test vector');
  await page.getByPlaceholder(/expected checksum/).fill('  BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD ');
  let [v] = await compute(); ok(/matches ✓/.test(v.note), 'expected checksum (upper case, spaces) verified ✓');
  await page.getByPlaceholder(/expected checksum/).fill('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ae');
  [v] = await compute(); ok(/No algorithm matches/.test(v.note), 'wrong checksum → ✗');
  await page.getByPlaceholder(/expected checksum/).fill('');
  await page.getByRole('radio', { name: 'Files', exact: true }).click();
  const data = randomBytes(3 * 1024 * 1024 + 7), f1 = join(tmp, 'a.bin'), f2 = join(tmp, 'b.bin'), f3 = join(tmp, 'c.bin');
  writeFileSync(f1, data); writeFileSync(f2, data); const d3 = Buffer.from(data); d3[d3.length - 1] ^= 1; writeFileSync(f3, d3);
  await page.locator('input[type=file]').setInputFiles([f1]);
  const [fr] = await compute(), fe = ref(data);
  ok(Object.entries(fe).every(([k, x]) => fr.rows[k] === x), '3 MB file: every algorithm matches Node');
  await page.locator('input[type=file]').setInputFiles([f1, f2]); await compute();
  ok(/identical/.test(await page.locator('.note').first().textContent()), 'two identical files → identical');
  await page.locator('input[type=file]').setInputFiles([f1, f3]); await compute();
  ok(/differ/.test(await page.locator('.note').first().textContent()), 'last byte changed → the two files differ');
  for (const a of ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'SHA3-256', 'SHA3-512', 'BLAKE2b-256', 'BLAKE2b-512', 'CRC-32']) await page.locator('label.switch').filter({ hasText: new RegExp(`^${a}$`) }).click();
  await page.getByRole('button', { name: 'Compute' }).click();
  ok(/Pick at least one algorithm/.test(await page.locator('.toast').last().textContent()), 'no algorithm → message');
  const unexpected = page.errors.filter((e) => !/Pick at least one algorithm/i.test(e)); // the button helper also logs the expected messages
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/hash`); await ph.getByRole('button', { name: 'Compute' }).waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
