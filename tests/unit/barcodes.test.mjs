// Barcode Generator (src/lib/barcodes.ts): GS1 check digits against python-stdnum (tests/fixtures/barcode/reference.json,
// scripts/make-barcode-reference.py), and what each format makes of a value — check digits added or checked, zeros zint
// would add without a word, small letters in Code 39, Codabar's start and stop, scripts Code 128 cannot hold — and
// zint's error texts without their numbers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (t, { load, root }) => {
  const B = await load('/src/lib/barcodes.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/barcode/reference.json'), 'utf8'));
  t.eq(ref.cases.filter(([d, c]) => B.gs1Check(d) !== c).length, 0, `${ref.cases.length} GS1 check digits (EAN-8, UPC-A, EAN-13, GTIN-14) = python-stdnum's`);
  t.eq(['400638133393', '978030640615', '03600029145', '9638507'].map(B.gs1Check), ['1', '7', '2', '4'], 'the textbook examples (4006381333931, ISBN 978-0-306-40615-7, UPC 036000291452, EAN-8 96385074)');
  const c = (f, v) => B.checkBarcode(f, v);
  t.eq(c('EAN13', '890123456789'), { value: '890123456789', notes: [], full: '8901234567890' }, 'EAN-13 of 12 digits: the check digit is added and shown');
  t.eq(c('EAN13', '8901234567890'), { value: '8901234567890', notes: [], full: '8901234567890' }, '… of 13 with the right one');
  t.eq(c('EAN13', '8901234567891').error, 'The last digit should be the check digit 0, not 1 — or leave it out and it is added.', '… with a wrong one: said in words (zint said "Error 275: Invalid check digit \'1\', expecting \'0\' (retval: 7)")');
  t.eq(c('EAN13', '978-0-306-40615-7').full, '9780306406157', 'hyphens and spaces of an ISBN are left out');
  t.eq(c('EAN13', '12345'), { value: '12345', notes: ['EAN-13 has 12 digits before the check digit; 7 zeros were added in front: 000000012345.'], full: '0000000123457' }, 'a short number: zint pads it with zeros — now said (it drew another number without a word)');
  t.eq(c('EAN13', '89012ABC').error, 'EAN-13 holds digits only.', 'letters');
  t.eq(c('EAN13', '12345678901234').error, 'EAN-13 has 12 digits and a check digit (13 in all); this has 14.', 'too many digits');
  t.eq(c('EAN8', '9031101').full, '90311017', 'EAN-8');
  t.eq(c('UPCA', '03600029145').full, '036000291452', 'UPC-A');
  t.eq(c('UPCE', '0425261').error, undefined, 'UPC-E of 7 digits');
  t.eq(c('UPCE', '9425261').error, 'A UPC-E number with 7 or 8 digits begins with its number system, 0 or 1.', 'UPC-E with number system 9');
  t.eq(c('UPCE', '12345').error, 'UPC-E has 6 digits (7 with the number system 0 or 1 in front, 8 with the check digit).', 'UPC-E too short');
  t.eq(c('ITF', '123').notes, ['ITF holds digits in pairs: a zero was added in front (0123).', 'Many scanners do not read ITF codes of fewer than 6 digits.'], 'ITF with an odd count: the zero zint adds is said');
  t.eq(c('ITF', '12345678').notes, [], 'ITF of 8 digits');
  t.eq(c('ITF', '12AB').error, 'ITF (Interleaved 2 of 5) holds digits only.', 'ITF letters');
  t.eq(c('Code39', 'abc-123'), { value: 'ABC-123', notes: ['Code 39 has no small letters: it holds ABC-123.'] }, 'Code 39 in small letters: said (zint upper-cased it without a word)');
  t.eq(c('Code39', 'A#B').error, 'Code 39 has only A – Z, 0 – 9, space and - . $ / + % — not #. Code 128 takes any Latin text.', 'Code 39: a character it does not have');
  t.eq(c('Codabar', '12345').error, 'Codabar begins and ends with A, B, C or D, with digits and - $ : / . + between them — e.g. A12345B.', 'Codabar without start and stop (zint: "Error 358: Does not begin with …")');
  t.eq(c('Codabar', 'a12345b').value, 'A12345B', 'Codabar in small letters');
  t.ok(/Code 128 holds Latin letters only/.test(c('Code128', 'Item #42 / नमस्ते').error), 'Code 128 with Hindi: said, with the formats that take it');
  t.eq(c('Code128', 'Café #42').error, undefined, 'Code 128 with Latin-1 letters');
  t.eq(c('Code93', 'hello world').error, undefined, 'Code 93 full ASCII');
  t.eq(c('DataMatrix', 'नमस्ते 🙏').error, undefined, '2-D codes take any text');
  t.eq(B.zintError("Error 204: Invalid character in input (ISO/IEC 8859-1 only) (retval: 6)"), 'Invalid character in input (ISO/IEC 8859-1 only)', 'zint\'s number and return value left out');
};
