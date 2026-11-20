// Create Zip (#/zip) on 7-Zip (7z-wasm): files (text, Unicode name, 300 KB random, two files of one name) zipped and
// checked with Python's zipfile (names, bytes, CRC, deflate vs store, dates), AES-256 checked with pyzipper (right and
// wrong password), 7z checked with py7zr — an implementation of its own — (bytes, AES with a Hindi password, encrypted
// names) and the native 7z; the password typed twice; non-ASCII zip passwords refused with the reason; Stop; zip.js for
// what does not fit in memory (on a phone, 256 MB); file removal, name, checks.
import { writeFileSync, readFileSync, utimesSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
const py = (code, ...args) => spawnSync('python3', ['-c', code, ...args], { encoding: 'utf8' });
const has = (c) => spawnSync('sh', ['-c', `command -v ${c}`]).status === 0;
const hasMod = (m) => py(`import ${m}`).status === 0;
export default async ({ base, page: newPage, ok, info, download, tmp, devices }) => {
  const page = await newPage();
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(`${base}#/zip`);
  const a = join(tmp, 'notes.txt'), b = join(tmp, 'नमस्ते.txt'), c = join(tmp, 'data.bin'), d = join(tmp, 'extra.txt');
  writeFileSync(a, 'hello zip\n'.repeat(1000)); writeFileSync(b, 'नमस्ते दुनिया'); writeFileSync(c, randomBytes(300 * 1024)); writeFileSync(d, 'remove me');
  const when = new Date(Date.UTC(2024, 2, 15, 12, 0, 0)); utimesSync(a, when, when);
  // Playwright drops files whose *path* is not ASCII, so the Hindi one goes as a buffer (name kept)
  // (paths and buffers cannot be mixed in one call: the Hindi name goes in a second one; the dated file by its path)
  await page.locator('.drop input[type=file]').setInputFiles([a, c, d]);
  await page.waitForFunction(() => /3 files/.test(document.querySelector('.file-list')?.textContent || ''));
  await page.locator('.drop input[type=file]').setInputFiles([{ name: 'नमस्ते.txt', mimeType: 'text/plain', buffer: readFileSync(b) }]);
  await page.waitForFunction(() => /4 files/.test(document.querySelector('.file-list')?.textContent || ''));
  ok(!asked.some((u) => /7zz|sevenzip/.test(u)), 'four files listed; 7-Zip is not fetched yet');
  await page.getByRole('button', { name: 'Remove extra.txt' }).click();
  ok(/3 files/.test(await page.locator('.file-list').textContent()), 'remove a file');
  await page.locator('.drop input[type=file]').setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('the other notes') }]);
  await page.waitForFunction(() => /4 files/.test(document.querySelector('.file-list')?.textContent || ''));
  ok((await page.locator('.file-name').allTextContents()).includes('notes (2).txt'), 'a second file of the same name becomes "notes (2).txt" (two entries of one name were written)');
  await page.getByLabel('Archive name').fill('my files');
  const z = await download(page, () => page.getByRole('button', { name: 'Create archive' }).click());
  ok(/my files\.zip$/.test(z) && asked.some((u) => /7zz-[\w-]+\.wasm/.test(u)), '.zip added to the name; made by 7-Zip (7zz.wasm fetched with the first archive)');
  const CHECK = `import zipfile,sys,hashlib,json
z=zipfile.ZipFile(sys.argv[1]);t=z.testzip()
print(json.dumps({'bad':t,'files':{i.filename:[i.file_size,i.compress_type,hashlib.sha256(z.read(i)).hexdigest(),list(i.date_time[:3]),i.flag_bits] for i in z.infolist()}}))`;
  const r = py(CHECK, z);
  if (r.status !== 0) { ok(false, `python zipfile: ${r.stderr}`); return; }
  const j = JSON.parse(r.stdout), sha = (f) => spawnSync('sha256sum', [f], { encoding: 'utf8' }).stdout.split(' ')[0];
  ok(j.bad === null && Object.keys(j.files).sort().join() === ['data.bin', 'notes.txt', 'notes (2).txt', 'नमस्ते.txt'].sort().join(), `Python zipfile: CRC OK, names incl. Unicode (${Object.keys(j.files)})`);
  ok(j.files['notes.txt'][2] === sha(a) && j.files['data.bin'][2] === sha(c) && j.files['नमस्ते.txt'][2] === sha(b), 'every file byte-identical');
  ok(j.files['notes.txt'][1] === 8 && (j.files['नमस्ते.txt'][4] & 0x800), 'deflate at level 6; the Unicode name flagged as UTF-8 (bit 11)');
  ok(JSON.stringify(j.files['notes.txt'][3]) === '[2024,3,15]', `the file's own date is kept (${j.files['notes.txt'][3]})`);
  if (has('7z')) ok(spawnSync('7z', ['t', z]).status === 0, 'the native 7z tests the zip: Everything is Ok');
  await page.locator('input[type=range]').fill('0'); await page.locator('input[type=range]').dispatchEvent('input');
  const z0 = await download(page, () => page.getByRole('button', { name: 'Create archive' }).click());
  const j0 = JSON.parse(py(CHECK, z0).stdout);
  ok(Object.values(j0.files).every((f) => f[1] === 0), 'level 0 = stored (no compression)');
  await page.locator('input[type=range]').fill('9'); await page.locator('input[type=range]').dispatchEvent('input');
  // passwords
  await page.locator('label.switch').filter({ hasText: 'Password-protect' }).click();
  const pw = page.locator('input[aria-label="Password"]'), pw2 = page.locator('input[aria-label="Repeat password"]');
  const toast = async () => (await page.locator('.toast').last().textContent()).trim();
  await pw.fill('abc'); await pw2.fill('abc'); await page.getByRole('button', { name: 'Create archive' }).click();
  ok(/at least 4 characters/.test(await toast()), 'too-short password refused');
  await pw.fill('s3cret-pass'); await pw2.fill('s3cret-pas'); await page.getByRole('button', { name: 'Create archive' }).click();
  ok(/The passwords do not match/.test(await toast()), 'the password is typed twice; a slip is caught (an archive nobody could open)');
  await pw.fill('s3cret-पासवर्ड'); await pw2.fill('s3cret-पासवर्ड'); await page.getByRole('button', { name: 'Create archive' }).click();
  ok(/A zip password can hold only English letters.*choose the 7z format/.test(await toast()), 'a Hindi zip password: refused with the reason (7-Zip, WinRAR cannot type it for a zip — such zips could not be opened there)');
  await pw.fill('s3cret Pass!'); await pw2.fill('s3cret Pass!');
  const ze = await download(page, () => page.getByRole('button', { name: 'Create archive' }).click());
  const AES = `import pyzipper,sys,hashlib,json
z=pyzipper.AESZipFile(sys.argv[1]);z.setpassword(sys.argv[2].encode())
print(json.dumps({i.filename:[i.flag_bits&1, hashlib.sha256(z.read(i)).hexdigest()] for i in z.infolist()}))`;
  if (!hasMod('pyzipper')) info('pyzipper not installed — AES check skipped');
  else {
    const je = JSON.parse(py(AES, ze, 's3cret Pass!').stdout);
    ok(Object.values(je).every((f) => f[0] === 1) && je['data.bin'][1] === sha(c) && je['notes.txt'][1] === sha(a), 'AES-256 zip opens with pyzipper and the right password; entries marked encrypted');
    ok(py(AES, ze, 'wrong').status !== 0, 'wrong password rejected by pyzipper');
    ok(py('import zipfile,sys;zipfile.ZipFile(sys.argv[1]).read("notes.txt")', ze).status !== 0, 'plain zipfile cannot read it without the password');
  }
  if (has('7z')) ok(spawnSync('7z', ['t', '-ps3cret Pass!', ze]).status === 0 && spawnSync('7z', ['t', '-pwrong', ze]).status !== 0, 'the native 7z opens it with the password, not without');
  // 7z
  await page.getByRole('radio', { name: /^7z/ }).click();
  await pw.fill('चाय-पासवर्ड 42'); await pw2.fill('चाय-पासवर्ड 42');
  const s7 = await download(page, () => page.getByRole('button', { name: 'Create archive' }).click());
  ok(/my files\.7z$/.test(s7) && readFileSync(s7).subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])), 'a 7z archive: named .7z, the 7z signature');
  const P7 = `import py7zr,sys,hashlib,json,tempfile,os
d=tempfile.mkdtemp()
with py7zr.SevenZipFile(sys.argv[1], password=sys.argv[2] or None) as z: z.extractall(path=d)
print(json.dumps({os.path.relpath(os.path.join(r,f),d):hashlib.sha256(open(os.path.join(r,f),'rb').read()).hexdigest() for r,_,fs in os.walk(d) for f in fs}))`;
  if (!hasMod('py7zr')) info('py7zr not installed — 7z checks skipped');
  else {
    const r7 = py(P7, s7, 'चाय-पासवर्ड 42');
    const j7 = r7.status === 0 ? JSON.parse(r7.stdout) : {};
    ok(j7['notes.txt'] === sha(a) && j7['data.bin'] === sha(c) && j7['नमस्ते.txt'] === sha(b), `py7zr (its own 7z reader) opens it with the Hindi password; every file byte-identical ${r7.stderr.slice(-200)}`);
    ok(py(P7, s7, 'wrong').status !== 0 && py(`import py7zr,sys\nwith py7zr.SevenZipFile(sys.argv[1]) as z: print(z.getnames())`, s7).status !== 0, 'wrong password refused; without a password not even the names can be read (encrypted names)');
  }
  // Stop, then again
  await page.getByRole('radio', { name: /^Zip/ }).click(); await page.locator('label.switch').filter({ hasText: 'Password-protect' }).click();
  const big = join(tmp, 'big.bin'); writeFileSync(big, randomBytes(96 << 20));
  await page.locator('.drop input[type=file]').setInputFiles([big]);
  await page.getByRole('button', { name: 'Create archive' }).click();
  await page.waitForFunction(() => /7-Zip: \d+ %/.test(document.querySelector('.progress-label')?.textContent ?? ''), null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  ok(/Stopped/.test(await toast()), 'Stop ends 7-Zip at once');
  await page.getByRole('button', { name: 'Remove big.bin' }).click();
  const again = await download(page, () => page.getByRole('button', { name: 'Create archive' }).click());
  ok(JSON.parse(py(CHECK, again).stdout).bad === null, '… and the next archive is made');
  await page.goto(`${base}#/`); await page.goto(`${base}#/zip`); await page.getByRole('button', { name: 'Create archive' }).click();
  ok(/Add some files first/.test(await toast()), 'no files refused');
  const unexpected = page.errors.filter((x) => !/Add some files|at least 4|do not match|zip password|Stopped/.test(x));
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  // a phone: more than 256 MB is zipped by zip.js, piece by piece
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/zip`); await ph.getByRole('button', { name: 'Create archive' }).waitFor();
  ok(!(await ph.getByRole('button', { name: 'Add a folder' }).count()) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no folder button, no horizontal scroll');
  const zeros = join(tmp, 'zeros.bin'); writeFileSync(zeros, Buffer.alloc(260 << 20));
  await ph.locator('.drop input[type=file]').setInputFiles([zeros, a]); await ph.waitForTimeout(200);
  ok(/written piece by piece \(zip\.js\)/.test(await ph.locator('.note').allTextContents().then((t) => t.join(' '))), 'phone, 260 MB: the tab says zip.js writes this one');
  const zz = await download(ph, () => ph.getByRole('button', { name: 'Create archive' }).click());
  const jz = JSON.parse(py(CHECK, zz).stdout);
  ok(jz.bad === null && jz.files['zeros.bin'][0] === 260 << 20 && jz.files['notes.txt'][2] === sha(a), 'the zip.js zip: CRC OK, both files whole');
  await ph.getByRole('radio', { name: /^7z/ }).click();
  ok(/more than a 7z archive can be made of in this browser/.test(await ph.locator('.note-err').textContent()), '… and 7z is refused for it, with the reason');
};
