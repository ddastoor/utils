// Watermark (#/watermark), to-do #34 — a document's first page, its cover, with or without the mark (owner, 27 Nov 2026:
// "in the Watermark app for uploaded documents only, have an option to include (or not) the watermark on the first page
// or cover page.."). The switch is there only with documents, on by default; PDFs — five pages of four shapes: page 1
// drawn exactly as the original's, pages 2 – 5 marked along their own diagonals, the preview shows page 2; on again,
// every page; a PDF of one page refused with the reason. Word — tests/fixtures/docs/sections.docx and cover.docx (a
// footer with a page number, a first-page header and footer stored but not in use, a later section that takes them;
// scripts/make-docx-fixture.py), read back by python-docx (Different first page on in section 1, the cover's header a
// copy of the header page 1 showed, without the mark, the footer too; the later section's first page marked and its
// footer as it was) and drawn by LibreOffice (page 1 without the mark and with its header and footer, every other page
// marked); a document marked whole and then with the cover left out: the cover's earlier mark taken out; and back.
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from '../lib/child.mjs';
import { redCloud, pdfPages, mixedPdf } from './watermark-docs.e2e.mjs';

const SECTIONS = fileURLToPath(new URL('../fixtures/docs/sections.docx', import.meta.url));
const COVER = fileURLToPath(new URL('../fixtures/docs/cover.docx', import.meta.url));
const runChild = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });
const has = (cmd, args) => { try { runChild(cmd, args, { timeout: 60000 }); return true; } catch { return false; } };
const flat = (s) => s.replace(/\s+/g, ' ').trim();

export default async ({ base, page: newPage, ok, download, tmp, info }) => {
  mkdirSync(tmp, { recursive: true });
  const page = await newPage();
  await page.goto(base + '#/watermark');
  const docInput = page.locator('.card', { hasText: 'Add PDFs or Word documents' }).first().locator('input[type=file]').last();
  const photoInput = page.locator('input[type=file]').first();
  const cover = page.locator('label.switch', { hasText: 'Watermark the first page (the cover) too' });
  const coverOn = () => cover.locator('input').isChecked();
  const setCover = async (v) => { if ((await coverOn()) !== v) await cover.click(); };
  const shown = () => page.locator('#wm-shown').innerText();
  const setRange = (label, v) => page.locator('.slider', { hasText: label }).locator('input').fill(String(v));
  const runAll = async () => {
    await page.getByRole('button', { name: 'Watermark all' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.result-row').length === 1 || /could not be watermarked/.test(document.body.innerText), null, { timeout: 120000 });
  };
  const save = (name) => download(page, () => page.getByRole('button', { name: `Save ${name}` }).click());
  const row = async () => flat(await page.locator('.result-row').first().innerText());
  // the mark in pure red, fully opaque, no shadow, along the diagonal
  await page.getByLabel('Text', { exact: true }).fill('CONFIDENTIAL');
  await page.locator('input[type=color]').first().fill('#ff0000');
  const sw = page.locator('label.switch', { hasText: 'Shadow' }); if (await sw.locator('input').isChecked()) await sw.click();
  await setRange('Opacity', 100);
  await page.getByRole('radio', { name: 'Diagonal' }).click();

  // ---- the switch is for documents only
  ok(await cover.isHidden(), 'no document: the cover switch is not there');
  const grey = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 400, 300); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  await photoInput.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: grey });
  await page.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  ok(await cover.isHidden(), 'photos only: still not there (photos are not concerned)');
  await page.getByRole('button', { name: 'Clear photos' }).click();

  // ---- PDF: five pages of four shapes, two turned by /Rotate
  const mixed = join(tmp, 'mixed.pdf');
  await mixedPdf(mixed);
  const orig = await pdfPages(mixed, 1);
  await docInput.setInputFiles(mixed);
  await page.waitForFunction(() => /1 document: mixed\.pdf \(5 pages\)/.test(document.body.innerText), null, { timeout: 30000 });
  ok(await cover.isVisible() && await coverOn(), 'with a document: the switch is there, on — every page, as before');
  await page.waitForFunction(() => /Page 1 of mixed\.pdf, as the file gets it\./.test(document.getElementById('wm-shown')?.textContent ?? ''), null, { timeout: 30000 });
  await setCover(false);
  await page.waitForFunction(() => /Page 2 of mixed\.pdf, as the file gets it — page 1, the cover, is left without the mark\./.test(document.getElementById('wm-shown')?.textContent ?? ''), null, { timeout: 30000 });
  { const prev = await page.evaluate(() => { const c = document.querySelector('.ed-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) n++; return { n, w: c.width, h: c.height }; });
    ok(prev.n > 1000 && Math.abs(prev.w / prev.h - 842 / 595) < 0.01, `cover off: the preview shows page 2 with the mark — the page shown landscape (${prev.w} × ${prev.h}, ${prev.n} red pixels): "${await shown()}"`); }
  await runAll();
  ok(/5 pages, the mark on 4 — not on page 1, the cover/.test(await row()), `the result says so: "${await row()}"`);
  const out = await pdfPages(await save('mixed-watermarked.pdf'), 1);
  { const p = out[0], o0 = orig[0];
    let diff = 0; for (let i = 0; i < p.d.length; i++) if (p.d[i] !== o0.d[i]) diff++;
    ok(out.length === 5 && redCloud(p.d, p.w, p.h).n === 0 && p.w === o0.w && p.h === o0.h && diff === 0, `page 1, the cover: no mark — drawn exactly as the original's page 1 (${diff} values differ)`);
    ok(p.text.includes('Alpha page one') && !p.text.includes('CONFIDENTIAL'), '… its text as it was, and no mark in it'); }
  const want = [[842, 595], [792, 612], [400, 400], [612, 792]];
  for (const [k, [W, H]] of want.entries()) {
    const p = out[k + 1], c = redCloud(p.d, p.w, p.h), a = (Math.atan2(H, W) * 180) / Math.PI;
    ok(c.n > 300 && Math.abs(c.angle - a) < 1.5 && p.text.includes('CONFIDENTIAL'), `page ${k + 2}: marked along its own diagonal (${c.angle?.toFixed(2)}° — ${a.toFixed(2)}°)`);
  }
  // on again: every page
  await setCover(true);
  await page.waitForFunction(() => /Page 1 of mixed\.pdf, as the file gets it\./.test(document.getElementById('wm-shown')?.textContent ?? ''), null, { timeout: 30000 });
  await runAll();
  { const ps = await pdfPages(await save('mixed-watermarked.pdf'), 1);
    ok(/5 pages/.test(await row()) && !/the mark on/.test(await row()) && ps.every((p) => redCloud(p.d, p.w, p.h).n > 300), `switched on again: the mark on all ${ps.length} pages ("${await row()}")`); }
  // a PDF of one page: with the cover left out, nothing would get the mark — refused
  await page.getByRole('button', { name: 'Clear documents' }).click();
  { const m = await import('mupdf'), d = new m.PDFDocument(), f = d.addSimpleFont(new m.Font('Helvetica'));
    d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, d.addObject({ Font: { F: f } }), 'BT /F 14 Tf 40 60 Td (Only page) Tj ET'));
    writeFileSync(join(tmp, 'one.pdf'), d.saveToBuffer('compress').asUint8Array()); }
  await docInput.setInputFiles(join(tmp, 'one.pdf'));
  await page.waitForFunction(() => /one\.pdf \(1 page\)/.test(document.body.innerText), null, { timeout: 30000 });
  await setCover(false);
  await page.waitForFunction(() => /one\.pdf has one page: with the cover left without the mark, no page gets it\./.test(document.getElementById('wm-shown')?.textContent ?? ''), null, { timeout: 30000 });
  await runAll();
  ok(/1 document could not be watermarked:[\s\S]*one\.pdf: This PDF has one page: with the first page \(the cover\) left without the watermark, no page would get it\./.test(await page.locator('.note-err').last().innerText()),
    `a PDF of one page, the cover left out: refused with the reason (${flat(await page.locator('.note-err').last().innerText())})`);
  await page.getByRole('button', { name: 'Clear documents' }).click();

  // ---- Word
  const docx = has('python3', ['-c', 'import docx']);
  const soffice = ['soffice', 'libreoffice'].find((c) => has(c, ['--version']));
  if (!docx) info('python-docx is not installed (pip install python-docx): the .docx files are not read back by it');
  if (!soffice) info('LibreOffice is not installed: the .docx files are not drawn (apt install libreoffice-writer)');
  const read = (file) => JSON.parse(runChild('python3', ['-c', `
import sys, json, docx
d = docx.Document(sys.argv[1])
def hf(x):
    xml = x._element.xml if x._element is not None else ''
    return {'own': not x.is_linked_to_previous, 'marks': xml.count('PowerPlusWaterMarkObject'), 'text': ' '.join(p.text for p in x.paragraphs).strip(), 'xml': xml}
print(json.dumps({'body': [p.text for p in d.paragraphs], 'sections': [{'titlePg': s.different_first_page_header_footer, 'default': hf(s.header), 'first': hf(s.first_page_header), 'even': hf(s.even_page_header), 'footer': hf(s.footer), 'firstFooter': hf(s.first_page_footer)} for s in d.sections]}))`, file]));
  const lo = async (file, tag) => {
    const dir = join(tmp, `lo-${tag}`); mkdirSync(dir, { recursive: true });
    runChild(soffice, [`-env:UserInstallation=file://${join(tmp, 'lo-profile')}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, file], { timeout: 180000 });
    const pdf = join(dir, file.split(/[\\/]/).pop().replace(/\.docx$/, '.pdf'));
    return existsSync(pdf) ? pdfPages(pdf, 1) : [];
  };
  const loCheck = async (file, tag, what, coverText) => {
    if (!soffice) return;
    const ps = await lo(file, tag), red = ps.map((p) => redCloud(p.d, p.w, p.h).n);
    ok(ps.length > 2 && red[0] === 0 && red.slice(1).every((n) => n > 300), `LibreOffice, ${what}: page 1 without the mark, the ${ps.length - 1} pages after it with it (red pixels ${red.join(' / ')})`);
    ok(coverText.every((t) => flat(ps[0]?.text ?? '').includes(t)), `LibreOffice, ${what}: the cover keeps its header and footer (${coverText.map((t) => `"${t}"`).join(', ')})`);
    return ps;
  };

  // sections.docx: four sections; section 1 has no different first page
  await docInput.setInputFiles(SECTIONS);
  await page.waitForFunction(() => /1 document: sections\.docx/.test(document.body.innerText), null, { timeout: 60000 });
  ok(!(await coverOn()), 'Word: the switch keeps its setting (off, from the PDF before) for the next document');
  await setCover(false);
  await page.waitForFunction(() => /sections\.docx: the first page's size, the mark as Word draws it \(the page's own text is not shown\)\. The first page, the cover, is left without it\./.test(document.getElementById('wm-shown')?.textContent ?? ''), null, { timeout: 60000 });
  ok(true, `the preview of a Word document says the cover is left out: "${await shown()}"`);
  await runAll();
  ok(/4 sections, 10 headers · the first page, the cover, without the mark/.test(await row()), `the result: "${await row()}"`);
  const sec = await save('sections-watermarked.docx');
  if (docx) {
    const r = read(sec), was = read(SECTIONS);
    const [s1, ...rest] = r.sections;
    ok(JSON.stringify(r.body) === JSON.stringify(was.body), 'python-docx: the body\'s text is as it was');
    ok(s1.titlePg && !was.sections[0].titlePg, 'python-docx: section 1 has "Different first page" now (it had not)');
    ok(s1.first.own && s1.first.marks === 0 && s1.first.text === 'Header of section 1', `python-docx: the cover's header is section 1's own header as page 1 showed it ("${s1.first.text}"), without the mark`);
    ok(s1.default.marks === 1 && s1.even.marks === 1, 'python-docx: section 1\'s other pages — default and even headers — have the mark');
    const need = rest.map((s) => ['default', ...(s.titlePg ? ['first'] : []), 'even']);
    ok(rest.every((s, i) => need[i].every((k) => s[k].own && s[k].marks === 1)), `python-docx: sections 2 – 4 as before, every header they show marked (${rest.map((s, i) => need[i].map((k) => `${k} ${s[k].marks}`).join(', ')).join(' | ')})`);
    ok(rest[1].first.text === 'First-page header of section 3' && rest[2].first.text === 'First-page header of section 3', '… section 3\'s first-page header and the copy section 4 shows, as they were');
  }
  const secPages = await loCheck(sec, 'sections', 'sections.docx', ['Header of section 1']);
  if (secPages) ok(secPages.length === 6, `LibreOffice: 6 pages, as before (${secPages.length})`);

  // cover.docx: a footer with a page number; a first-page header and footer stored but not in use; section 2 takes them
  await page.getByRole('button', { name: 'Clear documents' }).click();
  await docInput.setInputFiles(COVER);
  await page.waitForFunction(() => /1 document: cover\.docx/.test(document.body.innerText), null, { timeout: 60000 });
  await runAll();
  const cov = await save('cover-watermarked.docx');
  if (docx) {
    const r = read(cov), was = read(COVER), [s1, s2] = r.sections, [w1, w2] = was.sections;
    ok(!w1.titlePg && w1.first.text === 'Stale first-page header' && w2.titlePg && !w2.first.own, 'the fixture: section 1 without a different first page but with a first-page header and footer stored; section 2 with one, taking section 1\'s');
    ok(s1.titlePg && s1.first.text === 'Report header' && s1.first.marks === 0 && s1.default.marks === 1, `python-docx: the cover's header is the one page 1 showed — "${s1.first.text}", not the stored "Stale first-page header" — without the mark; the other pages' marked`);
    ok(s1.firstFooter.own && s1.firstFooter.xml === s1.footer.xml && s1.footer.xml === w1.footer.xml && /PAGE/.test(s1.firstFooter.xml), 'python-docx: the cover\'s footer is a copy of the footer page 1 showed, its page number field too');
    ok(s2.first.own && s2.first.text === 'Stale first-page header' && s2.first.marks === 1, `python-docx: section 2's first page keeps the header it took from section 1 ("${s2.first.text}"), now its own, with the mark`);
    ok(s2.firstFooter.own && s2.firstFooter.text === 'Stale first-page footer', `python-docx: … and the footer it took from section 1 ("${s2.firstFooter.text}"), pinned to it`);
    ok(s2.default.own && s2.default.marks === 1 && s2.default.text === 'Report header', 'python-docx: section 2\'s other pages: the header they showed, with the mark');
  }
  await loCheck(cov, 'cover', 'cover.docx', ['Report header', 'Report footer · page 1']);

  // a document marked whole, then with the cover left out: the cover's earlier mark taken out — and switched on again
  await page.getByRole('button', { name: 'Clear documents' }).click();
  await docInput.setInputFiles(SECTIONS);
  await page.waitForFunction(() => /1 document: sections\.docx/.test(document.body.innerText), null, { timeout: 60000 });
  await setCover(true); // (the switch is there only with a document)
  await runAll();
  const whole = join(tmp, 'whole.docx'); copyFileSync(await save('sections-watermarked.docx'), whole);
  await page.getByRole('button', { name: 'Clear documents' }).click();
  await docInput.setInputFiles(whole);
  await page.waitForFunction(() => /1 document: whole\.docx/.test(document.body.innerText), null, { timeout: 60000 });
  await setCover(false);
  await runAll();
  ok(/the first page, the cover, without the mark/.test(await row()) && /the earlier watermark was replaced/.test(await row()), `a document marked whole, the cover left out now: "${await row()}"`);
  const bare = join(tmp, 'bare.docx'); copyFileSync(await save('whole-watermarked.docx'), bare);
  if (docx) { const s1 = read(bare).sections[0]; ok(s1.first.marks === 0 && s1.default.marks === 1 && s1.first.text === 'Header of section 1', 'python-docx: its cover\'s header without the earlier mark, the other headers with one mark each'); }
  await loCheck(bare, 'bare', 'the whole-marked document with the cover left out', ['Header of section 1']);
  await page.getByRole('button', { name: 'Clear documents' }).click();
  await docInput.setInputFiles(bare);
  await page.waitForFunction(() => /1 document: bare\.docx/.test(document.body.innerText), null, { timeout: 60000 });
  await setCover(true);
  await runAll();
  const again = await save('bare-watermarked.docx');
  if (docx) { const s1 = read(again).sections[0]; ok(s1.titlePg && s1.first.marks === 1 && s1.default.marks === 1, 'switched on again: the cover\'s header (now a first-page header of its own) gets the mark too'); }
  if (soffice) { const ps = await lo(again, 'again'), red = ps.map((p) => redCloud(p.d, p.w, p.h).n); ok(ps.length === 6 && red.every((n) => n > 300), `LibreOffice: every page marked again (${red.join(' / ')})`); }
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
};
