// Merge / Split / Organize PDF (src/lib/pdf.ts mergePdfs, subsetPdf): pages keep their annotations (comments,
// highlights), web links, links between pages (renumbered), the outline and filled-in form fields — MuPDF's graftPage
// dropped them all. Read back twice: by MuPDF and by pypdf (tests/lib/pdfpages_check.py, an independent reader).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const F = (n) => readFileSync(root + 'tests/fixtures/pdf/' + n);
const dir = mkdtempSync(join(tmpdir(), 'pdfpages-'));
let pypdf = true;
try { execFileSync('python3', ['-c', 'import pypdf']); } catch { pypdf = false; }
let k = 0;
// a comment's pop-up note is an annotation of its own (MuPDF's getAnnotations leaves it out): not counted here
const read = (bytes) => { const p = join(dir, `t${k++}.pdf`); writeFileSync(p, bytes); const r = JSON.parse(execFileSync('python3', [root + 'tests/lib/pdfpages_check.py', p]).toString()); for (const pg of r.pages) pg.annots = pg.annots.filter((x) => x.subtype !== '/Popup'); return r; };

export default async (t, { load }) => {
  const pdf = await load('/src/lib/pdf.ts');
  const m = await pdf.mupdf();
  const open = (b) => m.Document.openDocument(b, 'application/pdf').asPDF();
  const save = (d) => d.saveToBuffer('compress').asUint8Array().slice();
  const uri = (d, page) => d.formatLinkURI({ type: 'Fit', page });

  // A: six pages with a comment (p1), a highlight and a web link (p2), a link p3 → p5, an outline with a sub-item
  const a = open(F('vicksburg-ocr.pdf'));
  { const c = a.loadPage(0).createAnnotation('Text'); c.setContents('note A'); c.setRect([50, 700, 70, 720]); c.update(); }
  { const p = a.loadPage(1), hl = p.createAnnotation('Highlight'); hl.setQuadPoints([[72, 700, 200, 700, 72, 690, 200, 690]]); hl.update(); p.createLink([72, 600, 300, 620], 'https://example.org/a'); }
  a.loadPage(2).createLink([72, 500, 300, 520], uri(a, 4));
  { const it = a.outlineIterator(); it.insert({ title: 'Start', uri: uri(a, 0), open: true }); it.insert({ title: 'Chapter', uri: uri(a, 4), open: true }); it.prev(); it.down(); it.insert({ title: 'Section', uri: uri(a, 5), open: true }); }
  const A = save(a);
  // B, D: the one-field form filled in (Alice / Bob); C: one page with a web link and an outline item
  const filled = (v) => { const d = open(F('form.pdf')), w = d.loadPage(0).getWidgets()[0]; w.setTextValue(v); w.update(); return save(d); };
  const B = filled('Alice'), D = filled('Bob');
  const c = open(F('crazyones.pdf'));
  c.loadPage(0).createLink([72, 400, 300, 420], 'https://example.org/c');
  c.outlineIterator().insert({ title: 'Crazy', uri: uri(c, 0), open: true });
  const C = save(c);
  { const s = open(A); t.eq([s.countPages(), s.loadPage(0).getAnnotations().length, s.loadPage(2).getLinks().map((l) => s.resolveLink(l)), (s.loadOutline() || []).map((o) => o.title)], [6, 1, [4], ['Start', 'Chapter']], 'the source A as built'); }

  // ---- merge
  const M = await pdf.mergePdfs([{ bytes: A }, { bytes: B }, { bytes: C }, { bytes: D }]);
  const md = open(M.bytes);
  t.eq(md.countPages(), 9, 'merged: 6 + 1 + 1 + 1 pages');
  t.eq(md.loadPage(0).getAnnotations().map((x) => x.getContents()), ['note A'], 'merged: the comment on page 1 (first file) is there');
  t.eq(md.loadPage(7).getLinks().map((l) => l.getURI()), ['https://example.org/c'], 'merged: the web link of the third file is on its page');
  t.eq(md.loadPage(6).getWidgets().map((w) => [w.getName(), w.getValue()]), [['foo', 'Alice']], 'merged: the second file\'s field, as filled in');
  t.eq(md.loadPage(8).getWidgets().map((w) => [w.getName(), w.getValue()]), [['foo (2)', 'Bob']], 'merged: the fourth file\'s field of the same name, renamed "foo (2)", its own value');
  t.eq(M.renamed, ['foo → foo (2)'], 'merged: the renaming is reported');
  t.eq((md.loadOutline() || []).map((o) => [o.title, o.page, (o.down || []).map((x) => [x.title, x.page])]), [['Start', 0, []], ['Chapter', 4, [['Section', 5]]], ['Crazy', 7, []]], 'merged: the outlines of the files, one after the other, pages renumbered');
  if (pypdf) {
    const r = read(M.bytes);
    t.eq(r.pages.length, 9, 'pypdf: 9 pages');
    t.eq(r.pages[0].annots.map((x) => [x.subtype, x.contents]), [['/Text', 'note A']], 'pypdf: the comment on page 1');
    t.eq(r.pages[1].annots.map((x) => x.subtype).sort(), ['/Highlight', '/Link'], 'pypdf: the highlight and the link on page 2');
    t.eq(r.pages[2].annots.map((x) => x.page), [4], 'pypdf: the link on page 3 goes to page 5');
    t.eq(r.pages[7].annots.map((x) => x.uri), ['https://example.org/c'], 'pypdf: the third file\'s web link');
    t.eq([r.fields, r.listed], [{ foo: 'Alice', 'foo (2)': 'Bob' }, 2], 'pypdf: the form has both fields with their values');
    t.eq(r.outline, [['Start', 0], ['Chapter', 4], [['Section', 5]], ['Crazy', 7]], 'pypdf: the outline');
  }
  // another order: the links and the outline of A follow its pages
  const M2 = await pdf.mergePdfs([{ bytes: C }, { bytes: A }]);
  const m2 = open(M2.bytes);
  t.eq([m2.countPages(), m2.loadPage(3).getLinks().map((l) => m2.resolveLink(l)), (m2.loadOutline() || []).map((o) => [o.title, o.page])], [7, [5], [['Crazy', 0], ['Start', 1], ['Chapter', 5]]], 'A after C: its link p3 → p5 is now p4 → p6, its outline follows');
  t.eq(m2.loadPage(1).getAnnotations().map((x) => x.getContents()), ['note A'], 'A after C: its comment is on its first page');
  if (pypdf) t.eq(read(M2.bytes).pages[3].annots.map((x) => x.page), [5], 'pypdf: the link goes to page 6');
  // size: fonts and images shared between pages are copied once
  const big = [F('vicksburg-ocr.pdf'), F('two-column-paper.pdf')];
  const M3 = await pdf.mergePdfs(big.map((bytes) => ({ bytes })));
  t.ok(M3.bytes.length <= (big[0].length + big[1].length) * 1.01, `merged size ${M3.bytes.length} ≤ the files together (${big[0].length + big[1].length}; a graft per page made it 779,645)`);
  // a protected file first: the result has no password
  const M4 = await pdf.mergePdfs([{ bytes: F('aes256-asdfzxcv.pdf'), password: 'asdfzxcv' }, { bytes: C }]);
  const m4 = m.Document.openDocument(M4.bytes, 'application/pdf');
  t.ok(!m4.needsPassword() && m4.countPages() === 2, 'a protected file first: the merged PDF has no password');

  // ---- page lists as people type them (Split, PDF → Images)
  const R = (spec, n) => { try { return pdf.parseRanges(spec, n); } catch (e) { return e.message; } };
  t.eq(R('1-3, 5, 8-', 10), [[0, 1, 2], [4], [7, 8, 9]], 'ranges: 1-3, 5, 8-');
  t.eq(R('1 3 5', 5), [[0], [2], [4]], 'ranges: numbers apart by spaces only');
  t.eq(R('1 - 3; 5', 5), [[0, 1, 2], [4]], 'ranges: spaces around a dash, a semicolon');
  t.eq([R('2—4', 5), R('2−4', 5), R('2–4', 5), R('1..3', 5), R('1 to 3', 5)], [[[1, 2, 3]], [[1, 2, 3]], [[1, 2, 3]], [[0, 1, 2]], [[0, 1, 2]]], 'ranges: em dash, minus sign, en dash, two dots, "to"');
  t.eq([R('-2', 5), R('4-2', 5), R('3,3', 5)], [[[0, 1]], [[3, 2, 1]], [[2], [2]]], 'ranges: from the start, backwards, a page twice');
  t.eq([R('0', 5), R('6', 5), R('2-9', 5)], ['“0” is outside 1–5.', '“6” is outside 1–5.', '“2-9” is outside 1–5.'], 'ranges: outside the document, said');
  t.eq([R('', 5), R(' , ', 5), R('a', 5), R('1-3-5', 5)], ['Enter page numbers, e.g. 1-3, 5, 8-', 'Enter page numbers, e.g. 1-3, 5, 8-', 'Cannot read the range “a”.', 'Cannot read the range “1-3-5”.'], 'ranges: nothing, or what cannot be read, said');

  // ---- split / organize (one document)
  const S = await pdf.subsetPdf(A, undefined, [4, 2, 0]);
  const sd = open(S);
  t.eq([sd.countPages(), sd.loadPage(1).getLinks().map((l) => sd.resolveLink(l)), sd.loadPage(2).getAnnotations().map((x) => x.getContents())], [3, [0], ['note A']], 'pages 5, 3, 1: the link of page 3 goes to page 5, now page 1; the comment stays on page 1, now page 3');
  t.eq((sd.loadOutline() || []).map((o) => [o.title, o.page]), [['Start', 2], ['Chapter', 0]], 'pages 5, 3, 1: the outline follows (the section of page 6 is gone with its page)');
  const S2 = await pdf.subsetPdf(A, undefined, [1]);
  t.eq(open(S2).loadPage(0).getLinks().map((l) => l.getURI()), ['https://example.org/a'], 'page 2 alone: its web link');
  const S3 = await pdf.subsetPdf(A, undefined, [0, 1], [90, -90]);
  const s3 = open(S3);
  t.eq([s3.findPage(0).get('Rotate').asNumber(), s3.findPage(1).get('Rotate').asNumber()], [90, 270], 'turned pages: 90 and −90 → 270');
  const S4 = await pdf.subsetPdf(B, undefined, [0]);
  const s4 = open(S4);
  t.ok(s4.getTrailer().get('Root').get('AcroForm').get('Fields').length === 1 && s4.loadPage(0).getWidgets()[0].getValue() === 'Alice', 'a form kept whole: still a form (rearrangePages had dropped its field list), the value kept');
  const S5 = await pdf.subsetPdf(B, undefined, [0, 0]);
  const s5 = open(S5);
  t.ok(s5.countPages() === 2 && s5.loadPage(1).getWidgets().length === 1 && s5.loadPage(1).getWidgets()[0].getValue() === 'Alice' && s5.getTrailer().get('Root').get('AcroForm').get('Fields').length >= 1, 'a form page twice: both pages show the field');
  const S6 = await pdf.subsetPdf(F('aes256-asdfzxcv.pdf'), 'asdfzxcv', [0]);
  t.ok(!m.Document.openDocument(S6, 'application/pdf').needsPassword(), 'a protected file split: no password on the part');
  if (pypdf) {
    t.eq(read(S).pages.map((p) => p.annots.map((x) => x.subtype + (x.page !== undefined ? `→${x.page}` : ''))), [[], ['/Link→0'], ['/Text']], 'pypdf: pages 5, 3, 1 with their annotations');
    t.eq([read(S4).fields, read(S4).listed], [{ foo: 'Alice' }, 1], 'pypdf: the kept form lists its field with the value');
    t.eq(read(S3).pages.map((p) => p.rotate), [90, 270], 'pypdf: the turns');
  } else t.ok(true, 'pypdf not installed (pip install pypdf) — the independent reading was skipped');
};
