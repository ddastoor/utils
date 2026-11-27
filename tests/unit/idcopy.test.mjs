// Safe ID Copy's rules (src/lib/idcopy.ts): the digits hidden (an Aadhaar number's first 8, a VID's first 12 — the last 4
// left, as UIDAI's masked Aadhaar), numbers in Aadhaar's shape that fail their check, which QR codes give the full number
// away, the stamp's words, the pages of the PDF; and the e-letter of tests/fixtures/idcopy (scripts/make-id-photos.py)
// opened with its password on the real MuPDF and scanned by the real devcore-ids.wasm: every place of its number covered
// over exactly its first 8 digits. The whole tab — photos read by the OCR, the copy drawn — is the e2e suite's.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const F = (n) => fileURLToPath(new URL(`../fixtures/idcopy/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));

export default async (t, { load, wasm }) => {
  const L = await load('/src/lib/idcopy.ts');
  const R = await load('/src/lib/redact.ts');
  const { bindDevcore } = await load('/src/wasm/devcore.ts');
  const d = bindDevcore(await wasm('devcore-ids'));
  const scan = (text) => d.json('ids:scan', { text, kinds: ['aadhaar'], words: [] });
  const inside = (r, q) => { const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]], cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; return cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3]; };

  // ---- an OCR reading: a box per character, the first 8 digits covered, the last 4 not
  const word = (text, x0, y0 = 100, cw = 20) => ({ text, conf: 95, x0, y0, x1: x0 + cw * text.length, y1: y0 + 30 });
  const r = { words: [word('Aadhaar', 10), word('No:', 170), word('6184', 250), word('9302', 350), word('7518', 450), word('Ravi', 10, 160), word('Kumar', 100, 160)], lines: [{ w0: 0, w1: 5, para: 0, block: 0 }, { w0: 5, w1: 7, para: 1, block: 0 }] };
  const pt = L.ocrPageText(r);
  t.eq(pt.text, 'Aadhaar No: 6184 9302 7518\nRavi Kumar', 'an OCR reading as text: its lines, its words apart by a space');
  t.ok(pt.quads[pt.text.indexOf('9')][0] === 350 + 0 && Math.abs(pt.quads[pt.text.indexOf('3')][0] - 370) < 1e-9, 'each character gets its share of its word’s box');
  const hits = L.mergeHits(scan(pt.text), L.idShapes(pt.text));
  t.eq(hits.map((h) => [h.kind, h.value.replace(/\D/g, '')]), [['aadhaar', '618493027518']], 'the number found once (the scan and the shape agree)');
  const covers = L.digitCovers(pt, hits);
  t.eq(covers.length, 1, 'one cover for a number on one line');
  const c = covers[0];
  const digitsAt = [...pt.text].map((ch, i) => (/\d/.test(ch) ? i : -1)).filter((i) => i >= 0);
  t.ok(digitsAt.slice(0, 8).every((i) => inside(c.rect, pt.quads[i])) && digitsAt.slice(8).every((i) => !inside(c.rect, pt.quads[i])), 'the cover takes the first 8 digits and none of the last 4');
  t.ok(c.rect[2] < 450 && c.rect[0] < 250 && c.rect[1] < 100 && c.rect[3] > 130, `… with a margin round them, short of the 9th digit (${c.rect.map((v) => v.toFixed(1)).join(', ')})`);
  t.eq([c.kind, c.text, c.on], ['aadhaar', '7518', true], 'its kind, its last 4 digits and on');
  t.ok(L.digitCovers(pt, hits, { aadhaar: false, vid: true })[0].on === false, 'the switch “Hide Aadhaar numbers” off: the cover is there, off');
  // run together, no spaces: still 8 of 12 digits
  const pt2 = L.ocrPageText({ words: [word('UID', 10), word('618493027518', 100)], lines: [{ w0: 0, w1: 2, para: 0, block: 0 }] });
  const c2 = L.digitCovers(pt2, L.mergeHits(scan(pt2.text), L.idShapes(pt2.text)));
  t.ok(c2.length === 1 && c2[0].rect[2] < 100 + 20 * 8 + 20 * 0.2 && c2[0].rect[2] > 100 + 20 * 8 - 1, `a number written without spaces: the cover ends at its 8th digit (${c2[0]?.rect[2].toFixed(1)})`);
  // a VID: 12 of 16
  const pt3 = L.ocrPageText({ words: [word('VID', 10), word(':', 80), word('9134', 110), word('5678', 210), word('1234', 310), word('5670', 410)], lines: [{ w0: 0, w1: 6, para: 0, block: 0 }] });
  const c3 = L.digitCovers(pt3, L.mergeHits(scan(pt3.text), L.idShapes(pt3.text)));
  t.ok(c3.length === 1 && c3[0].kind === 'vid' && c3[0].text === '5670' && c3[0].rect[2] < 410 && c3[0].rect[2] > 390, `a VID: its first 12 digits (${c3.map((x) => `${x.kind} ${x.text} ${x.rect[2].toFixed(1)}`)})`);

  // ---- numbers in Aadhaar's shape that fail the check (a digit misread) are hidden too; a card number is not a VID
  t.eq(L.idShapes('No 6184 9302 7519 x').map((h) => h.kind), ['aadhaar'], 'a 4-4-4 number whose check fails: hidden all the same');
  t.eq(scan('No 6184 9302 7519 x').filter((h) => h.kind === 'aadhaar').length, 0, '… which the scan alone would have missed');
  t.eq(L.idShapes('Card 4111 1111 1111 1111').length, 0, 'four groups without “VID” before them: a card number, not hidden');
  t.eq(L.idShapes('VID: 9134 5678 1234 5671').map((h) => h.kind), ['vid'], 'four groups after “VID”: a VID, check or not');
  t.eq(L.idShapes('call +91 98765 43210, 12345 678901').length, 0, 'phone numbers and other groupings are not');
  t.eq(L.mergeHits([{ s: 3, e: 17, kind: 'aadhaar', value: '618493027518' }, { s: 30, e: 40, kind: 'pan', value: 'X' }], [{ s: 3, e: 17, kind: 'aadhaar', value: '618493027518' }, { s: 50, e: 64, kind: 'aadhaar', value: '111122223333' }]).map((h) => h.s), [3, 50], 'merged: one hit per place; other kinds left out');

  // ---- which QR codes give the number away
  t.eq(L.qrNumber(TRUTH.oldQr), TRUTH.number.replace(/\D/g, ''), 'the QR of older cards (XML, uid="…"): the full number');
  t.eq(L.qrNumber('<uid>582047163938</uid>'), '582047163938', '<uid>…</uid>: the full number');
  t.eq(L.qrNumber(' 6184 9302 7518 '), '618493027518', 'the bare number');
  t.eq(L.qrNumber(TRUTH.secureQr), null, 'a Secure QR (one long signed number — only the last 4 digits in it): kept');
  t.eq(L.qrNumber('https://example.com/?id=618493027518'), null, 'a link with a number in it: not taken for one');

  // ---- the stamp
  t.eq(L.stampText('', '2026-11-27'), 'For KYC only · 27 Nov 2026', 'no purpose typed: KYC');
  t.eq(L.stampText('  KYC with  HDFC Bank ', '2026-01-05'), 'For KYC with HDFC Bank only · 5 Jan 2026', 'the purpose as typed, spaces tidied');
  t.eq(L.stampText('for a SIM card only.', '2026-11-27'), 'For a SIM card only · 27 Nov 2026', 'its own “for” and “only” kept once');
  t.eq(L.stampText('rent agreement', ''), 'For rent agreement only', 'no date: none');
  t.eq(L.fmtDay('2026-13-01'), '2026-13-01', 'a date that is no date is shown as typed');

  // ---- the PDF's pages: a card's two sides on one A4 page, a page on its own
  const card = { w: 1000, h: 630 }, page = { w: 1654, h: 2339 };
  const two = L.packPages([card, card]);
  t.eq(two.map((p) => p.length), [2], 'two card photos: on one page');
  t.ok(two[0].every((p) => p.x >= 42 && p.x + p.w <= 595.28 - 42 + 1e-9 && p.y >= 42 && p.y + p.h <= 841.89 - 42 + 1e-9) && two[0][1].y >= two[0][0].y + two[0][0].h + 24 - 1e-9, '… inside the margins, one under the other');
  t.ok(Math.abs(two[0][0].w - (1000 * 72) / 150) < 1e-9, '… at 150 dpi (no wider than the picture’s own pixels)');
  t.eq(L.packPages([card, card, card]).map((p) => p.length), [2, 1], 'three: two on the first page, one on the next');
  const pp = L.packPages([card, page, card]);
  t.eq(pp.map((p) => p.map((x) => x.i)), [[0], [1], [2]], 'an A4 page between them: on a page of its own');
  t.ok(Math.abs(pp[1][0].h - (841.89 - 84)) < 1e-6 || pp[1][0].w <= 595.28 - 84 + 1e-9, 'the A4 page fitted into the margins');
  t.eq(L.copyName('IMG_0042.JPG'), 'IMG_0042-safe-copy', 'the file’s name');

  // ---- the e-letter, on MuPDF with its password: every place of its number covered over its first 8 digits
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(readFileSync(F('e-letter.pdf')), 'application/pdf');
  t.ok(doc.needsPassword() && doc.authenticatePassword(TRUTH.letterPassword) > 0, 'the e-letter opens with its password');
  const ppt = R.pageText(doc.loadPage(0));
  const lh = L.mergeHits(scan(ppt.text), L.idShapes(ppt.text));
  const lc = L.digitCovers(ppt, lh);
  const nAadhaar = lc.filter((x) => x.kind === 'aadhaar').length, nVid = lc.filter((x) => x.kind === 'vid').length;
  t.eq([nAadhaar, nVid], [3, 1], `the letter's number three times, its VID once (${lc.map((x) => `${x.kind} …${x.text}`).join(', ')})`);
  const want = TRUTH.letter.replace(/\D/g, '');
  let ok8 = true;
  for (const h of lh.filter((x) => x.kind === 'aadhaar')) {
    const idx = []; for (let i = h.s; i < h.e; i++) if (/\d/.test(ppt.text[i])) idx.push(i);
    const cov = lc.find((x) => x.kind === 'aadhaar' && idx.slice(0, 8).every((i) => inside(x.rect, ppt.quads[i])));
    if (!cov || idx.slice(8).some((i) => inside(cov.rect, ppt.quads[i])) || idx.map((i) => ppt.text[i]).join('') !== want) ok8 = false;
  }
  t.ok(ok8, 'each cover over exactly the first 8 digits of its place, the last 4 outside it');
};
