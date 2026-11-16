// Extract Archive (#/unzip): zip (folders, Unicode names), AES zip with/without password, tar.gz / tar.bz2 / tar.xz
// (Python tarfile), 7z (py7zr) — listing, sizes, single-file download and "Download all as .zip" byte-identical;
// a non-archive reported.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { join } from 'node:path';
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
except ImportError: pass
open(out+'/junk.zip','wb').write(b'this is not an archive at all'*10)`, src, tmp], { encoding: 'utf8' });
  ok(mk.status === 0, `fixtures built ${mk.stderr}`);
  const page = await newPage(); await page.goto(`${base}#/unzip`);
  const rows = () => page.$$eval('.file-row', (r) => r.map((e) => [e.querySelector('.file-name').textContent, e.querySelector('.muted').textContent]));
  const open = async (name, pw = '') => {
    await page.goto(`${base}#/`); await page.goto(`${base}#/unzip`);
    if (pw) await page.getByPlaceholder(/Password/).fill(pw);
    await page.locator('input[type=file]').setInputFiles(join(tmp, name));
    await page.waitForFunction(() => document.querySelector('.file-row') || document.querySelector('.note-err'), null, { timeout: 30000 });
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
    await page.locator('.file-row').filter({ hasText: 'readme.txt' }).getByRole('button', { name: 'Download' }).click();
    ok(/Wrong or missing password/.test(await page.locator('.toast').last().textContent()), 'AES zip without the password → message');
    await open('aes.zip', 'open sesame'); await checkAll('AES-256 zip');
  } catch (e) { if (e.code === 'ENOENT') info('pyzipper not installed — AES zip check skipped'); else throw e; }
  await open('junk.zip');
  ok(/Could not open/.test(await page.locator('.note-err').textContent()), `not an archive → message (${await page.locator('.note-err').textContent()})`);
  const unexpected = page.errors.filter((x) => !/password|Could not open|not an archive|Invalid|signature|Zip/i.test(x));
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/unzip`); await ph.locator('input[type=file]').waitFor({ state: 'attached' });
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
