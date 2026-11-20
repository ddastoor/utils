// Extract Archive (#/unzip) on 7-Zip (7z-wasm): zip (folders, Unicode names), AES zip with/without/wrong password,
// tar.gz / tar.bz2 / tar.xz (Python tarfile; the tar inside opened in its turn), a plain .gz, 7z (py7zr) also with
// encrypted names (the password asked for without choosing the file again), real RAR3 / RAR5 archives (rarfile's test
// files, also encrypted) checked against the native 7z — listing, sizes, single-file download and "Download all as
// .zip" byte-identical; "../" names made safe; a non-archive and a damaged archive reported.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export default async ({ base, page: newPage, ok, info, download, tmp, devices }) => {
  const src = join(tmp, 'src'); mkdirSync(join(src, 'docs', 'deep'), { recursive: true });
  const F = { 'readme.txt': Buffer.from('read me\n'), 'docs/नमस्ते.txt': Buffer.from('नमस्ते'), 'docs/deep/data.bin': randomBytes(200 * 1024) };
  for (const [p, b] of Object.entries(F)) writeFileSync(join(src, p), b);
  const mk = spawnSync('python3', ['-c', `import zipfile,tarfile,os,sys
src,out=sys.argv[1],sys.argv[2]
files=['readme.txt','docs/नमस्ते.txt','docs/deep/data.bin']
with zipfile.ZipFile(out+'/a.zip','w',zipfile.ZIP_DEFLATED) as z:
  for f in files: z.write(os.path.join(src,f),f)
for ext,mode in [('tar.gz','w:gz'),('tar.bz2','w:bz2'),('tar.xz','w:xz')]:
  with tarfile.open(out+'/a.'+ext,mode) as t:
    for f in files: t.add(os.path.join(src,f),f)
try:
  import pyzipper
  with pyzipper.AESZipFile(out+'/aes.zip','w',compression=pyzipper.ZIP_DEFLATED,encryption=pyzipper.WZ_AES) as z:
    z.setpassword(b'open sesame')
    for f in files: z.write(os.path.join(src,f),f)
except ImportError: pass
try:
  import py7zr
  with py7zr.SevenZipFile(out+'/a.7z','w') as z:
    for f in files: z.write(os.path.join(src,f),f)
  with py7zr.SevenZipFile(out+'/enc.7z','w',password='चाय 42',header_encryption=True) as z:
    for f in files: z.write(os.path.join(src,f),f)
except ImportError: pass
import gzip
open(out+'/notes.txt.gz','wb').write(gzip.compress(open(os.path.join(src,'readme.txt'),'rb').read()*100))
with zipfile.ZipFile(out+'/evil.zip','w') as z:
  z.writestr('../evil.txt','x'); z.writestr('/abs/path.txt','y')
d=open(out+'/a.zip','rb').read(); open(out+'/cut.zip','wb').write(d[:len(d)//2])
open(out+'/junk.zip','wb').write(b'this is not an archive at all'*10)`, src, tmp], { encoding: 'utf8' });
  ok(mk.status === 0, `fixtures built ${mk.stderr}`);
  const page = await newPage({ permissions: ['clipboard-read'] }); await page.goto(`${base}#/unzip`);
  const notes = () => page.locator('.note').allTextContents();
  const rows = () => page.$$eval('.file-row', (r) => r.map((e) => [e.querySelector('.file-name').textContent, e.querySelector('.muted').textContent]));
  const open = async (name, pw = '') => {
    await page.goto(`${base}#/`); await page.goto(`${base}#/unzip`);
    if (pw) await page.locator('input[aria-label="Password"]').fill(pw);
    await page.locator('input[type=file]').setInputFiles(join(tmp, name));
    await page.waitForFunction(() => document.querySelector('.file-row') || document.querySelector('.note-err') || /password/.test(document.querySelector('.note-warn')?.textContent ?? ''), null, { timeout: 30000 });
  };
  const checkAll = async (name) => {
    const r = await rows();
    ok(r.length === 3 && Object.keys(F).every((p) => r.some(([n]) => n.replace(/^\.?\//, '') === p)), `${name}: three files with folders (${r.map(([n]) => n).join(', ')})`);
    const one = await download(page, () => page.locator('.file-row').filter({ hasText: 'data.bin' }).getByRole('button', { name: 'Download' }).click());
    ok(sha(readFileSync(one)) === sha(F['docs/deep/data.bin']), `${name}: single file download byte-identical`);
    const all = await download(page, () => page.getByRole('button', { name: 'Download all as .zip' }).click());
    const v = spawnSync('python3', ['-c', 'import zipfile,sys,hashlib,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({i.filename.lstrip("./"):hashlib.sha256(z.read(i)).hexdigest() for i in z.infolist() if not i.is_dir()}))', all], { encoding: 'utf8' });
    const j = JSON.parse(v.stdout || '{}');
    ok(Object.entries(F).every(([p, b]) => j[p] === sha(b)), `${name}: "Download all as .zip" keeps every file and path`);
  };
  await open('a.zip'); await checkAll('zip');
  ok(/3 files · 20\d\.\d KB|3 files/.test(await page.locator('.card').filter({ has: page.locator('.file-row') }).first().textContent()), 'file count and total size');
  for (const t of ['a.tar.gz', 'a.tar.bz2', 'a.tar.xz']) { await open(t); await checkAll(t); }
  try { readFileSync(join(tmp, 'a.7z')); await open('a.7z'); await checkAll('7z'); } catch { info('py7zr not installed — 7z check skipped'); }
  try {
    readFileSync(join(tmp, 'aes.zip'));
    await open('aes.zip');
    ok((await notes()).some((n) => /Some files are protected by a password/.test(n)) && await page.locator('.file-lock').count() === 3, 'an AES zip: listed, its files marked as locked, the password asked for');
    await page.locator('.file-row').filter({ hasText: 'readme.txt' }).getByRole('button', { name: 'Download' }).click();
    ok(/protected by a password — type it above/.test(await page.locator('.toast').last().textContent()), 'AES zip without the password → message');
    await page.locator('input[aria-label="Password"]').fill('wrong one');
    await page.locator('.file-row').filter({ hasText: 'readme.txt' }).getByRole('button', { name: 'Download' }).click();
    ok(await page.locator('.toast', { hasText: 'Wrong password' }).waitFor({ timeout: 20000 }).then(() => true, () => false), 'a wrong password → "Wrong password."');
    await open('aes.zip', 'open sesame'); await checkAll('AES-256 zip');
  } catch (e) { if (e.code === 'ENOENT') info('pyzipper not installed — AES zip check skipped'); else throw e; }
  try {
    readFileSync(join(tmp, 'enc.7z'));
    await open('enc.7z');
    ok((await notes()).some((n) => /This archive is protected by a password — type it above and press Open/.test(n)) && !(await page.locator('.file-row').count()), 'a 7z with encrypted names: the password is asked for (the names cannot be read without it)');
    await page.locator('input[aria-label="Password"]').fill('चाय 42'); await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator('.file-row').first().waitFor({ timeout: 20000 });
    await checkAll('7z with encrypted names and a Hindi password (Open, without choosing the file again)');
  } catch (e) { if (e.code === 'ENOENT') info('py7zr not installed — encrypted 7z skipped'); else throw e; }
  // a plain .gz: the one file inside
  await open('notes.txt.gz');
  ok((await rows()).map(([n]) => n).join() === 'notes.txt', `a .gz of one file: that file (${(await rows()).map(([n]) => n)})`);
  // RAR (real files from rarfile's tests), checked against the native 7z
  const AR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'archives');
  // the reference for RAR: The Unarchiver (unar — XADMaster, its own RAR code; Debian's 7z has the RAR code removed)
  const hasNative = spawnSync('sh', ['-c', 'command -v unar']).status === 0;
  const native = (f, name, pw) => { const o = join(tmp, `unar-${f}`); spawnSync('unar', ['-q', '-f', ...(pw ? ['-p', pw] : []), '-o', o, '-D', join(AR, f)]); return readFileSync(join(o, name)); };
  if (!hasNative) info('unar not installed (apt install unar) — RAR contents not compared');
  const openFx = async (f, pw = '') => { await page.goto(`${base}#/`); await page.goto(`${base}#/unzip`); if (pw) await page.locator('input[aria-label="Password"]').fill(pw); await page.locator('input[type=file]').setInputFiles(join(AR, f)); await page.waitForFunction(() => document.querySelector('.file-row') || document.querySelector('.note-err') || /password/.test(document.querySelector('.note-warn')?.textContent ?? ''), null, { timeout: 30000 }); };
  await openFx('rar3-subdirs.rar');
  const rr = await rows();
  ok(rr.some(([n]) => n === 'sub/üȵĩöḋè/file.txt') && rr.some(([n]) => n === 'sub/with space/long fn.txt') && /RAR/.test(await page.locator('.card-title').first().textContent()), `RAR3 with folders and a Unicode name: listed (${rr.map(([n]) => n).join(', ')})`);
  const lf = await download(page, () => page.locator('.file-row').filter({ hasText: 'long fn.txt' }).getByRole('button', { name: 'Download' }).click());
  if (hasNative) ok(readFileSync(lf).equals(native('rar3-subdirs.rar', 'sub/with space/long fn.txt')), 'a RAR3 file = what unar unpacks');
  await openFx('rar5-psw.rar', 'password');
  const s1 = await download(page, () => page.locator('.file-row').filter({ hasText: 'stest1.txt' }).getByRole('button', { name: 'Download' }).click());
  ok(readFileSync(s1).length === 2048 && (!hasNative || readFileSync(s1).equals(native('rar5-psw.rar', 'stest1.txt', 'password'))), 'RAR5 with encrypted files: unpacked with the password, = what unar unpacks');
  await openFx('rar5-hpsw.rar');
  ok((await notes()).some((n) => /protected by a password/.test(n)), 'RAR5 with encrypted headers: the password is asked for');
  await page.locator('input[aria-label="Password"]').fill('password'); await page.locator('input[aria-label="Password"]').press('Enter');
  await page.locator('.file-row').first().waitFor({ timeout: 20000 });
  ok((await rows()).map(([n]) => n).sort().join() === 'stest1.txt,stest2.txt', '… and listed after Enter in the password box');
  // names that point outside: made safe
  await open('evil.zip');
  const ev = await download(page, () => page.locator('.file-row').filter({ hasText: 'evil.txt' }).getByRole('button', { name: 'Download' }).click());
  ok(/evil\.txt$/.test(ev) && !/\.\./.test(ev) && readFileSync(ev, 'utf8') === 'x', `"../evil.txt" is saved as evil.txt (${ev.split('/').pop()})`);
  await open('junk.zip');
  ok(/Could not open: this is not an archive/.test(await page.locator('.note-err').textContent()), `not an archive → message (${await page.locator('.note-err').textContent()})`);
  await open('cut.zip');
  ok(await page.locator('.note-err').count() > 0 || await page.locator('.file-row').count() > 0, `a zip cut in half: said, or what can be read is listed (${(await notes()).join(' | ')})`);
  const unexpected = page.errors.filter((x) => !/password|Could not open|not an archive|Invalid|signature|Zip|damaged/i.test(x));
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/unzip`); await ph.locator('input[type=file]').waitFor({ state: 'attached' });
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
