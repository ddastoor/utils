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
};
