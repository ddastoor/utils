// Create Zip (#/zip): files (text, Unicode name, 300 KB random) zipped and checked with Python's zipfile (names,
// bytes, CRC, deflate vs store), AES-256 checked with pyzipper (right and wrong password), file removal, name, checks.
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
const py = (code, ...args) => spawnSync('python3', ['-c', code, ...args], { encoding: 'utf8' });
export default async ({ base, page: newPage, ok, info, download, tmp, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/zip`);
  const a = join(tmp, 'notes.txt'), b = join(tmp, 'नमस्ते.txt'), c = join(tmp, 'data.bin'), d = join(tmp, 'extra.txt');
  writeFileSync(a, 'hello zip\n'.repeat(1000)); writeFileSync(b, 'नमस्ते दुनिया'); writeFileSync(c, randomBytes(300 * 1024)); writeFileSync(d, 'remove me');
  // Playwright drops files whose *path* is not ASCII, so pass them as buffers (names kept)
  await page.locator('.drop input[type=file]').setInputFiles([a, b, c, d].map((f) => ({ name: f.split('/').pop(), mimeType: 'application/octet-stream', buffer: readFileSync(f) })));
  await page.waitForFunction(() => /4 files/.test(document.querySelector('.file-list')?.textContent || ''));
  ok(true, 'four files listed');
  await page.locator('.file-row').filter({ hasText: 'extra.txt' }).getByRole('button', { name: 'Remove' }).click();
  ok(/3 files/.test(await page.locator('.file-list').textContent()), 'remove a file');
  await page.getByLabel('Zip file name').fill('my files');
  const z = await download(page, () => page.getByRole('button', { name: 'Create zip' }).click());
  ok(/my files\.zip$/.test(z), '.zip added to the name');
  const CHECK = `import zipfile,sys,hashlib,json
z=zipfile.ZipFile(sys.argv[1]);t=z.testzip()
print(json.dumps({'bad':t,'files':{i.filename:[i.file_size,i.compress_type,hashlib.sha256(z.read(i)).hexdigest()] for i in z.infolist()}}))`;
  const r = py(CHECK, z);
  if (r.status !== 0) { ok(false, `python zipfile: ${r.stderr}`); return; }
  const j = JSON.parse(r.stdout), sha = (f) => spawnSync('sha256sum', [f], { encoding: 'utf8' }).stdout.split(' ')[0];
  ok(j.bad === null && Object.keys(j.files).sort().join() === ['data.bin', 'notes.txt', 'नमस्ते.txt'].sort().join(), 'Python zipfile: CRC OK, names incl. Unicode');
  ok(j.files['notes.txt'][2] === sha(a) && j.files['data.bin'][2] === sha(c) && j.files['नमस्ते.txt'][2] === sha(b), 'every file byte-identical');
  ok(j.files['notes.txt'][1] === 8, 'deflate used at level 6');
  await page.locator('input[type=range]').fill('0'); await page.locator('input[type=range]').dispatchEvent('input');
  const z0 = await download(page, () => page.getByRole('button', { name: 'Create zip' }).click());
  const j0 = JSON.parse(py(CHECK, z0).stdout);
  ok(Object.values(j0.files).every((f) => f[1] === 0), 'level 0 = stored (no compression)');
  await page.locator('input[type=range]').fill('9'); await page.locator('input[type=range]').dispatchEvent('input');
  await page.locator('label.switch').filter({ hasText: 'Password-protect' }).click();
  await page.getByLabel('Password (AES-256)').fill('abc'); await page.getByRole('button', { name: 'Create zip' }).click();
  ok(/longer password/.test(await page.locator('.toast').last().textContent()), 'too-short password refused');
  await page.getByLabel('Password (AES-256)').fill('s3cret-पासवर्ड');
  const ze = await download(page, () => page.getByRole('button', { name: 'Create zip' }).click());
  const AES = `import pyzipper,sys,hashlib,json
z=pyzipper.AESZipFile(sys.argv[1]);z.setpassword(sys.argv[2].encode())
print(json.dumps({i.filename:[i.flag_bits&1, hashlib.sha256(z.read(i)).hexdigest()] for i in z.infolist()}))`;
  const e = py(AES, ze, 's3cret-पासवर्ड');
  if (/No module named 'pyzipper'/.test(e.stderr)) info('pyzipper not installed — AES check skipped');
  else {
    const je = JSON.parse(e.stdout);
    ok(Object.values(je).every((f) => f[0] === 1) && je['data.bin'][1] === sha(c) && je['notes.txt'][1] === sha(a), 'AES-256 zip opens with pyzipper and the right password; entries marked encrypted');
    ok(py(AES, ze, 'wrong').status !== 0, 'wrong password rejected by pyzipper');
    ok(py('import zipfile,sys;zipfile.ZipFile(sys.argv[1]).read("notes.txt")', ze).status !== 0, 'plain zipfile cannot read it without the password');
  }
  await page.goto(`${base}#/`); await page.goto(`${base}#/zip`); await page.getByRole('button', { name: 'Create zip' }).click();
  ok(/Add some files first/.test(await page.locator('.toast').last().textContent()), 'no files refused');
  const unexpected = page.errors.filter((x) => !/Add some files|longer password/.test(x));
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/zip`); await ph.getByRole('button', { name: 'Create zip' }).waitFor();
  ok(!(await ph.getByRole('button', { name: 'Add a folder' }).count()) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no folder button, no horizontal scroll');
};
