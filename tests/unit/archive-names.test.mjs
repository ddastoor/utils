// Create Zip: names inside the archive, the password rules per format, the archive's file name (src/lib/archive-names.ts).
export default async (t, { load }) => {
  const A = await load('/src/lib/archive-names.ts');
  t.eq(A.archivePaths(['a.txt', 'b.txt', 'a.txt', 'A.TXT', 'a (2).txt']), ['a.txt', 'b.txt', 'a (2).txt', 'A (3).TXT', 'a (2) (2).txt'], 'the same name again gets (2), (3) … before the extension, without regard to case (Windows and macOS would overwrite)');
  t.eq(A.archivePaths(['photos/2024/x.jpg', 'photos/2024/x.jpg']), ['photos/2024/x.jpg', 'photos/2024/x (2).jpg'], 'in a folder');
  t.eq(A.archivePaths(['/abs/x', './y', '../../z', 'a\\b\\c.txt', '', 'README']), ['abs/x', 'y', 'z', 'a/b/c.txt', 'file', 'README'], 'no leading /, ./ or .. parts; backslashes as /; an empty name');
  t.eq(A.archivePaths(['README', 'README']), ['README', 'README (2)'], 'a name without an extension');
  t.eq(A.archivePaths(['archive.tar.gz', 'archive.tar.gz']), ['archive.tar.gz', 'archive.tar (2).gz'], 'the last extension');
  t.eq(A.passwordProblem('abc', 'abc', 'zip'), 'Choose a password of at least 4 characters.', 'too short');
  t.eq(A.passwordProblem('abcd', 'abce', '7z'), 'The passwords do not match — the archive could not be opened.', 'typed differently');
  t.ok(/A zip password can hold only English letters/.test(A.passwordProblem('पासवर्ड1', 'पासवर्ड1', 'zip')), 'a Hindi zip password: refused');
  t.ok(/A zip password/.test(A.passwordProblem('café-1234', 'café-1234', 'zip')), '… also é (7-Zip refuses it for a zip: E_INVALIDARG)');
  t.eq(A.passwordProblem('पासवर्ड1', 'पासवर्ड1', '7z'), null, 'any letters for 7z');
  t.eq(A.passwordProblem('S3cret Pass! ~{}', 'S3cret Pass! ~{}', 'zip'), null, 'ASCII letters, digits, spaces and symbols for a zip');
  t.eq(['my files', 'a.zip', 'a.7z', '  ', 'x/y:z'].map((n) => A.archiveName(n, 'zip')), ['my files.zip', 'a.zip', 'a.zip', 'archive.zip', 'x-y-z.zip'], 'the archive name gets the format\'s extension (and loses characters a file name cannot hold)');
  t.eq(A.archiveName('a.zip', '7z'), 'a.7z', 'a .zip name as 7z');
  t.eq(A.safeParts('../../etc/passwd'), ['etc', 'passwd'], 'no ".." parts when saving to a folder');
  t.eq(A.safeParts('/abs//x/./y.txt'), ['abs', 'x', 'y.txt'], 'no empty or "." parts');
  t.eq(A.safeParts('a\\b:c?.txt'), ['a', 'b_c_.txt'], 'backslashes as folders; characters Windows refuses replaced');

  // ---- what 7zz prints for an archive (src/lib/sevenzip-text.ts), held to the native 7z's own listings
  const { parseList } = await load('/src/lib/sevenzip-text.ts');
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  if (spawnSync('sh', ['-c', 'command -v 7z']).status !== 0) { t.ok(true, '7z not installed — listing cases skipped'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'sz-'));
  try {
    mkdirSync(join(dir, 'src', 'docs', 'deep'), { recursive: true });
    writeFileSync(join(dir, 'src', 'readme.txt'), 'read me\n'); writeFileSync(join(dir, 'src', 'docs', 'नमस्ते.txt'), 'नमस्ते'); writeFileSync(join(dir, 'src', 'docs', 'deep', 'data.bin'), Buffer.alloc(12345, 7));
    const mk = (args) => spawnSync('7z', args, { cwd: join(dir, 'src') });
    mk(['a', '-tzip', '../a.zip', '.']); mk(['a', '-t7z', '-pS3cret', '../a.7z', '.']); mk(['a', '-ttar', '../a.tar', '.']);
    spawnSync('7z', ['a', '-tbzip2', 'a.tar.bz2', 'a.tar'], { cwd: dir });
    const list = (f, pw = '') => spawnSync('7z', ['l', '-slt', `-p${pw}`, join(dir, f)], { encoding: 'utf8' }).stdout;
    const files = (r) => r.entries.filter((e) => !e.dir).map((e) => [e.path, e.size]).sort();
    const want = [['docs/deep/data.bin', 12345], ['docs/नमस्ते.txt', 18], ['readme.txt', 8]];
    const z = parseList(list('a.zip'), 'a.zip');
    t.eq([z.type, files(z), z.entries.filter((e) => e.dir).map((e) => e.path).sort()], ['zip', want, ['docs', 'docs/deep']], 'a zip: type, files with folders and sizes, the folders');
    const s7 = parseList(list('a.7z'), 'a.7z');
    t.eq([s7.type, files(s7), s7.entries.filter((e) => !e.dir).every((e) => e.encrypted)], ['7z', want, true], 'a 7z with encrypted files: each marked');
    t.eq(files(parseList(list('a.tar'), 'a.tar')), want, 'a tar');
    const bz = parseList(list('a.tar.bz2'), 'a.tar.bz2');
    t.eq([bz.type, bz.entries.map((e) => e.path)], ['bzip2', ['a.tar']], 'a bzip2 stream names nothing: the entry is named after the archive (a.tar.bz2 → a.tar)');
    t.eq(parseList(list('a.tar.bz2'), 'x.tbz2').entries[0].path, 'x.tar', '… .tbz2 → .tar');
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
