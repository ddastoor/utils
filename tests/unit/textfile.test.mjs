// src/lib/textfile.ts — a text file as people have them: UTF-8 (with or without its mark), UTF-16 by its mark,
// Windows-1252 (what Notepad and Excel on Windows save), and binary files refused. Known answers from the encodings'
// own tables (the bytes written out by hand, and Python's codecs for the long check).
export default async (t, { load }) => {
  const { textOf, readTextFile, crlfText } = await load('/src/lib/textfile.ts');
  const B = (...x) => new Uint8Array(x.flat());
  const enc = (s) => [...new TextEncoder().encode(s)];
  t.eq(textOf(B(enc('café ₹'))), { text: 'café ₹', how: '' }, 'UTF-8');
  t.eq(textOf(B([0xef, 0xbb, 0xbf], enc('abc'))), { text: 'abc', how: '' }, 'UTF-8 with its mark: the mark dropped');
  t.eq(textOf(B([0x63, 0x61, 0x66, 0xe9, 0x20, 0x80, 0x20, 0x93, 0x71, 0x94])), { text: 'café € “q”', how: 'Windows-1252' }, 'Windows-1252: é, the euro sign and curly quotes (File.text() gave "caf�")');
  t.eq(textOf(B([0xff, 0xfe, 0x63, 0, 0x61, 0, 0x66, 0, 0xe9, 0])), { text: 'café', how: 'UTF-16' }, 'UTF-16 LE by its mark (its NUL bytes are text)');
  t.eq(textOf(B([0xfe, 0xff, 0, 0x63, 0, 0x61, 0, 0x66, 0, 0xe9])), { text: 'café', how: 'UTF-16' }, 'UTF-16 BE by its mark');
  t.eq(textOf(B([])), { text: '', how: '' }, 'an empty file is (empty) text');
  t.eq(textOf(B([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])), null, 'a PNG is not text (NUL bytes)');
  t.eq(textOf(B(enc('a'.repeat(9000)), [0])), { text: 'a'.repeat(9000) + '\0', how: '' }, 'a NUL beyond the first 8 KB does not make a long text binary (only the head is looked at)');
  // every byte 0x80 – 0xff that Windows-1252 maps, against its table (the five unused bytes map to C1 controls in the WHATWG decoder)
  const cp1252 = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ';
  const hi = textOf(B(Array.from({ length: 32 }, (_, i) => 0x80 + i)));
  t.ok(hi && hi.how === 'Windows-1252' && hi.text === cp1252, `0x80 – 0x9f read as Windows-1252's table (${hi && [...hi.text].slice(0, 6).join('')}…)`);
  let msg = ''; try { await readTextFile(Object.assign(new Blob([B([0, 1, 2])]), { name: 'photo.jpg' }), 'a log file is plain text'); } catch (e) { msg = e.message; }
  t.eq(msg, 'photo.jpg is not a text file — a log file is plain text.', 'a binary file is refused in words');
  t.eq(await readTextFile(Object.assign(new Blob([B([0x63, 0x61, 0x66, 0xe9])]), { name: 'a.sql' })), 'café', 'readTextFile gives the decoded text');
  // line ends as Windows programs write them (to-do #13: the Patch tab saves its result with the original's)
  t.eq(['a\r\nb\r\n', 'a\r\nb', 'a\r\nb\nc\r\n', 'a\nb\n', 'a\nb\nc\r\n', 'one line', ''].map(crlfText), [true, true, true, false, false, false, false], 'CR LF when most line breaks are; LF, a single line and nothing are not');
};
