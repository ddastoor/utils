// Watermark (#/watermark), to-do #17: the diagonal — measured on photos of three shapes, a text and a logo; PDFs — every
// page of a PDF of mixed sizes and rotations (/Rotate) watermarked, read back by MuPDF (the mark drawn where it belongs,
// the pages' own text still text), a password-protected PDF, the shadow; Word documents — a .docx of four sections and
// three page shapes (tests/fixtures/docs/sections.docx, scripts/make-docx-fixture.py: own, linked, first-page and even-page
// headers), read back by python-docx (the watermark in every header a page shows, the headers' and the body's text as
// they were) and drawn by LibreOffice (the mark on every page, turned by that page's own diagonal); the old .doc refused.
// LibreOffice and python-docx are skipped with a note where they are not installed (`apt install libreoffice-writer`,
// `pip install python-docx`).
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from '../lib/child.mjs';

const DOCX = fileURLToPath(new URL('../fixtures/docs/sections.docx', import.meta.url));
const PDFS = (n) => fileURLToPath(new URL(`../fixtures/pdf/${n}`, import.meta.url));
const deg = (r) => (r * 180) / Math.PI;

/** The red marks of a picture (RGBA): how many, their middle, the direction they run (degrees, rising to the right is
 *  positive) and their box. */
export function redCloud(d, W, H, isRed = (r, g, b) => r > 170 && g < 90 && b < 90) {
  let n = 0, sx = 0, sy = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (isRed(d[i], d[i + 1], d[i + 2])) { n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (!n) return { n: 0 };
  const cx = sx / n, cy = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * W + x) * 4; if (isRed(d[i], d[i + 1], d[i + 2])) { const u = x - cx, v = -(y - cy); sxx += u * u; syy += v * v; sxy += u * v; } }
  const angle = deg(0.5 * Math.atan2(2 * sxy, sxx - syy));
  return { n, cx, cy, angle, x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
/** How the mark fits the page: the ink's extent along the direction θ (radians, rising to the right) and across it — the
 *  glyphs' own tight box —, and how far that box, turned by θ, reaches across and down: the share of the room inside the
 *  margin m on the side that limits it, and whether it stays inside (2 px of anti-aliasing allowed). */
function fitOf(d, W, H, th, m, isRed = (r, g, b) => r > 170 && g < 90 && b < 90) {
  const c = Math.cos(th), s = Math.sin(th);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (!isRed(d[i], d[i + 1], d[i + 2])) continue;
    const X = x + 0.5, Y = y + 0.5, u = X * c - Y * s, v = X * s + Y * c; // along the diagonal (up and right) and across it
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  const L = u1 - u0 + 1, h = v1 - v0 + 1, across = L * c + h * s, down = L * s + h * c;
  return { L, h, reach: Math.max(across / (W - 2 * m), down / (H - 2 * m)), inside: across <= W - 2 * m + 3 && down <= H - 2 * m + 3, across, down };
}
/** The pixels of a picture file, decoded by the browser */
async function pixels(page, path) {
  const b64 = readFileSync(path).toString('base64');
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    return { W: bmp.width, H: bmp.height, d: [...g.getImageData(0, 0, bmp.width, bmp.height).data] };
  }, b64);
}
/** A PDF's pages drawn by MuPDF (RGBA), with each page's size as shown (after /Rotate) and its text */
export async function pdfPages(path, scale = 1, password) {
  const m = await import('mupdf');
  const doc = m.Document.openDocument(readFileSync(path), 'application/pdf');
  if (password !== undefined) doc.authenticatePassword(password);
  const out = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const p = doc.loadPage(i), [bx0, by0, bx1, by1] = p.getBounds();
    const pix = p.toPixmap(m.Matrix.scale(scale, scale), m.ColorSpace.DeviceRGB, false, true);
    const w = pix.getWidth(), h = pix.getHeight(), st = pix.getStride(), s = pix.getPixels().slice(), d = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { for (let c = 0; c < 3; c++) d[(y * w + x) * 4 + c] = s[y * st + x * 3 + c]; d[(y * w + x) * 4 + 3] = 255; }
    out.push({ W: bx1 - bx0, H: by1 - by0, w, h, d, text: p.toStructuredText('').asText(), images: [...p.getObject().get('Resources').get('XObject').isDictionary() ? (() => { const a = []; p.getObject().get('Resources').get('XObject').forEach((v, k) => a.push(k)); return a; })() : []] });
  }
  return out;
}
/** A PDF of five pages of four shapes, two of them turned by /Rotate, one with its box away from 0, 0 — each with a line
 *  of its own text */
export async function mixedPdf(path) {
  const m = await import('mupdf'), doc = new m.PDFDocument();
  const font = doc.addSimpleFont(new m.Font('Helvetica'));
  const page = (box, rot, text) => {
    const res = doc.addObject({ Font: { F: font } });
    const obj = doc.addPage(box, rot, res, `BT /F 14 Tf ${box[0] + 40} ${box[1] + 60} Td (${text}) Tj ET`);
    doc.insertPage(-1, obj);
  };
  page([0, 0, 595, 842], 0, 'Alpha page one');        // A4 portrait
  page([0, 0, 595, 842], 90, 'Bravo page two');       // shown landscape, 842 x 595
  page([0, 0, 792, 612], 0, 'Charlie page three');    // Letter landscape
  page([0, 0, 400, 400], 270, 'Delta page four');     // a square, turned
  page([100, 50, 712, 842], 0, 'Echo page five');     // its box away from the origin: 612 x 792
  writeFileSync(path, doc.saveToBuffer('compress').asUint8Array());
}
const runChild = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });
const has = (cmd, args) => { try { runChild(cmd, args, { timeout: 60000 }); return true; } catch { return false; } };

export default async ({ base, page: newPage, ok, download, tmp, info }) => {
  const page = await newPage();
  await page.goto(base + '#/watermark');
  const docInput = page.locator('.card', { hasText: 'Add PDFs or Word documents' }).first().locator('input[type=file]').last();
  const photoInput = page.locator('input[type=file]').first();
  const setRange = (label, v) => page.locator('.slider', { hasText: label }).locator('input').fill(String(v));
  const results = () => page.locator('.result-row').count();
  const runAll = async (n) => {
    await page.getByRole('button', { name: 'Watermark all' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.result-row').length === n || /could not be watermarked/.test(document.body.innerText), n, { timeout: 120000 });
  };
  const save = (name) => download(page, () => page.getByRole('button', { name: `Save ${name}` }).click());
  const shadow = async (on) => { const sw = page.locator('label.switch', { hasText: 'Shadow' }); if ((await sw.locator('input').isChecked()) !== on) await sw.click(); };
  // the mark in pure red, fully opaque, no shadow, filling the diagonal, 3 % margin
  await page.getByLabel('Text', { exact: true }).fill('CONFIDENTIAL');
  await page.locator('input[type=color]').first().fill('#ff0000');
  await shadow(false);
  await setRange('Opacity', 100);
  await page.getByRole('radio', { name: 'Diagonal' }).click();
  await setRange('Length along the diagonal', 100);
  ok(await page.locator('.slider', { hasText: 'Size' }).isHidden() && await page.locator('.slider', { hasText: 'Length along the diagonal' }).isVisible(), 'Diagonal: the size slider gives way to "Length along the diagonal"');
  await page.getByRole('radio', { name: 'PNG' }).click();

  // ---- photos of three shapes: the mark runs along each photo's own diagonal, centred, its ink inside the margin and
  // reaching it on the side that limits it
  const grey = async (w, h) => Buffer.from(await page.evaluate(([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h); return c.toDataURL('image/png').split(',')[1]; }, [w, h]), 'base64');
  const shapes = [[900, 500, 'wide'], [500, 900, 'tall'], [640, 640, 'square']];
  await photoInput.setInputFiles(await Promise.all(shapes.map(async ([w, h, n]) => ({ name: `${n}.png`, mimeType: 'image/png', buffer: await grey(w, h) }))));
  await page.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  await runAll(3);
  for (const [W, H, n] of shapes) {
    const px = await pixels(page, await save(`${n}-watermarked.png`)), c = redCloud(px.d, px.W, px.H), m = 0.03 * Math.min(W, H);
    const want = deg(Math.atan2(H, W));
    ok(px.W === W && px.H === H && c.n > 500 && Math.abs(c.angle - want) < 1.5, `photo ${W} × ${H}: the mark runs along its diagonal (${c.angle?.toFixed(2)}° — the diagonal ${want.toFixed(2)}°)`);
    ok(Math.abs((c.x0 + c.x1) / 2 - W / 2) < 0.02 * W && Math.abs((c.y0 + c.y1) / 2 - H / 2) < 0.02 * H, `… centred (the ink's box around ${((c.x0 + c.x1) / 2).toFixed(0)}, ${((c.y0 + c.y1) / 2).toFixed(0)} — the middle ${W / 2}, ${H / 2})`);
    const fit = fitOf(px.d, W, H, Math.atan2(H, W), m);
    ok(fit.inside && fit.reach > 0.97 && c.x0 >= m - 2 && c.y0 >= m - 2 && c.x1 <= W - m + 2 && c.y1 <= H - m + 2, `… the glyphs' box, turned, inside the 3 % margin and reaching it (${(fit.reach * 100).toFixed(1)} % of the room on the side that limits it)`);
  }
  // half the length along the diagonal: half the reach
  await setRange('Length along the diagonal', 50);
  await runAll(3);
  { const px = await pixels(page, await save('wide-watermarked.png')), c = redCloud(px.d, px.W, px.H), m = 0.03 * 500;
    const reach = fitOf(px.d, 900, 500, Math.atan2(500, 900), m).reach;
    ok(reach > 0.46 && reach < 0.54 && Math.abs(c.angle - deg(Math.atan2(500, 900))) < 1.5, `"Length along the diagonal" 50 %: half the reach (${(reach * 100).toFixed(1)} %), the same angle`); }
  await setRange('Length along the diagonal', 100);
  // a logo along the diagonal: a red bar 5 : 1
  await page.getByRole('radio', { name: 'Logo' }).click();
  const bar = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 500; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 500, 100); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  await page.locator('.card', { hasText: 'Choose a logo' }).locator('input[type=file]').setInputFiles({ name: 'bar.png', mimeType: 'image/png', buffer: bar });
  await page.waitForTimeout(500);
  await runAll(3);
  { const px = await pixels(page, await save('tall-watermarked.png')), c = redCloud(px.d, px.W, px.H);
    // a filled 5 : 1 bar turned by θ: its four corners, worked out here from the photo's shape and the margin
    const W = 500, H = 900, m = 0.03 * 500, th = Math.atan2(H, W), C = Math.cos(th), S = Math.sin(th), k = Math.min((W - 2 * m) / (5 * C + S), (H - 2 * m) / (5 * S + C));
    const area = 5 * k * k; // the bar's area in pixels
    ok(Math.abs(c.angle - deg(th)) < 1 && Math.abs(c.n - area) / area < 0.03, `a logo along a tall photo's diagonal: ${c.angle.toFixed(2)}° (${deg(th).toFixed(2)}°), ${c.n} red pixels where the bar fitted to the margin has ${area.toFixed(0)}`); }
  await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Clear photos' }).click();
  await page.getByRole('button', { name: 'Clear documents' }).isHidden();

  // ---- PDF: five pages of four shapes, two turned by /Rotate
  mkdirSync(tmp, { recursive: true });
  const mixed = join(tmp, 'mixed.pdf');
  await mixedPdf(mixed);
  await docInput.setInputFiles(mixed);
  await page.waitForFunction(() => /1 document: mixed\.pdf \(5 pages\)/.test(document.body.innerText), null, { timeout: 30000 });
  await page.waitForFunction(() => /Page 1 of mixed\.pdf/.test(document.getElementById('wm-shown')?.textContent ?? ''), null, { timeout: 30000 });
  { const prev = await page.evaluate(() => { const c = document.querySelector('.ed-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) n++; return { w: c.width, h: c.height, n }; });
    ok(prev.n > 1000 && Math.abs(prev.w / prev.h - 595 / 842) < 0.01, `the preview: page 1 of the PDF with the mark (${prev.w} × ${prev.h}, ${prev.n} red pixels)`); }
  await runAll(1);
  const outPdf = await save('mixed-watermarked.pdf');
  const pages = await pdfPages(outPdf, 1);
  const want = [['Alpha page one', 595, 842], ['Bravo page two', 842, 595], ['Charlie page three', 792, 612], ['Delta page four', 400, 400], ['Echo page five', 612, 792]];
  ok(pages.length === 5, `the PDF keeps its 5 pages (${pages.length})`);
  for (const [i, [t, W, H]] of want.entries()) {
    const p = pages[i], c = redCloud(p.d, p.w, p.h), m = 0.03 * Math.min(W, H), a = deg(Math.atan2(H, W));
    ok(Math.round(p.W) === W && Math.round(p.H) === H, `page ${i + 1}: shown ${W} × ${H} (${Math.round(p.W)} × ${Math.round(p.H)})`);
    const mx = (c.x0 + c.x1) / 2, my = (c.y0 + c.y1) / 2;
    ok(c.n > 300 && Math.abs(c.angle - a) < 1.5 && Math.abs(mx - W / 2) < 0.02 * W && Math.abs(my - H / 2) < 0.02 * H, `page ${i + 1}: the mark along its own diagonal (${c.angle?.toFixed(2)}° — ${a.toFixed(2)}°), centred (${mx.toFixed(0)}, ${my.toFixed(0)} — ${W / 2}, ${H / 2})`);
    const fit = fitOf(p.d, p.w, p.h, Math.atan2(H, W), m);
    ok(fit.inside && fit.reach > 0.96 && c.x0 >= m - 2 && c.y0 >= m - 2 && c.x1 <= W - m + 2 && c.y1 <= H - m + 2, `page ${i + 1}: the glyphs' box inside the margin, reaching it (${(fit.reach * 100).toFixed(1)} %)`);
    ok(p.text.includes(t) && p.text.includes('CONFIDENTIAL'), `page ${i + 1}: its own text is still text ("${t}"), and so is the mark`);
  }
  // tiled and in a corner, every page by its own shape
  await page.getByRole('radio', { name: 'Tiled' }).click();
  await setRange('Size', 6);
  await runAll(1);
  { const ps = await pdfPages(await save('mixed-watermarked.pdf'));
    const quads = ps.map((p) => [[0, 0], [1, 0], [0, 1], [1, 1]].map(([qx, qy]) => { let n = 0; for (let y = qy * (p.h >> 1); y < (qy + 1) * (p.h >> 1); y++) for (let x = qx * (p.w >> 1); x < (qx + 1) * (p.w >> 1); x++) { const i = (y * p.w + x) * 4; if (p.d[i] > 170 && p.d[i + 1] < 90 && p.d[i + 2] < 90) n++; } return n; }));
    ok(quads.every((q) => q.every((n) => n > 50)), `tiled: red in every quarter of every page (${quads.map((q) => q.join('/')).join(', ')})`); }
  await page.getByRole('radio', { name: '↘' }).click();
  await runAll(1);
  { const ps = await pdfPages(await save('mixed-watermarked.pdf'));
    const where = ps.map((p) => redCloud(p.d, p.w, p.h));
    ok(where.every((c, i) => { const [, W, H] = want[i], m = 0.03 * Math.min(W, H); return c.n > 50 && c.x1 <= W - m + 2 && c.x1 >= W - m - 4 && c.y1 <= H - m + 2 && c.y1 >= H - m - 4 && c.x0 > W / 2 && c.y0 > H / 2; }), `bottom right: on every page the mark's ink ends at the margin from the right and the bottom (${where.map((c) => `${c.x1},${c.y1}`).join(' ')})`); }
  // the shadow: white text with its shadow shows on the white page; Meme is a picture of the text (Anton), along the diagonal
  await page.getByRole('radio', { name: 'Diagonal' }).click();
  await page.locator('input[type=color]').first().fill('#ffffff');
  await shadow(true);
  ok(/shows only by its shadow/.test(await page.locator('#wm-paper').innerText()), 'white text on documents: "shows only by its shadow"');
  await runAll(1);
  { const p = (await pdfPages(await save('mixed-watermarked.pdf')))[0];
    let n = 0; for (let i = 0; i < p.d.length; i += 4) if (p.d[i] < 200 && Math.abs(p.d[i] - p.d[i + 2]) < 8 && p.d[i] > 60) n++;
    ok(n > 2000 && p.images.includes('STSH'), `the shadow: a grey shadow under white text (${n} grey pixels; the shadow is a picture laid under the vector text: ${p.images.join(', ')})`);
    ok(p.text.includes('CONFIDENTIAL'), '… the text itself still text'); }
  await shadow(false);
  await page.locator('input[type=color]').first().fill('#ff0000');
  await page.getByRole('radio', { name: 'Meme' }).click();
  await runAll(1);
  { const p = (await pdfPages(await save('mixed-watermarked.pdf')))[1], c = redCloud(p.d, p.w, p.h);
    ok(p.images.includes('STTX') && !p.text.includes('CONFIDENTIAL') && Math.abs(c.angle - deg(Math.atan2(595, 842))) < 1.5, `Meme (Anton): a picture of the text, along the turned page's diagonal (${c.angle?.toFixed(2)}°)`); }
  await page.getByRole('radio', { name: 'Sans' }).click();
  // a password-protected PDF: asked for, opened, the copy without it
  await page.getByRole('button', { name: 'Clear documents' }).click();
  await docInput.setInputFiles(PDFS('aes256-asdfzxcv.pdf'));
  await page.locator('.pdf-pw input').fill('asdfzxcv');
  await page.locator('.pdf-pw').getByRole('button', { name: 'Open' }).click();
  await page.waitForFunction(() => /aes256-asdfzxcv\.pdf \(\d+ pages?\)/.test(document.body.innerText), null, { timeout: 30000 });
  await runAll(1);
  ok(/the copy has none/.test(await page.locator('.result-row').first().innerText()), 'a PDF with a password: the result says the copy has none');
  { const ps = await pdfPages(await save('aes256-asdfzxcv-watermarked.pdf'));
    ok(ps.length > 0 && ps.every((p) => redCloud(p.d, p.w, p.h).n > 300), `… it opens without one, the mark on its ${ps.length} page(s)`); }
  await page.getByRole('button', { name: 'Clear documents' }).click();

  // ---- Word: four sections, three page shapes, own / linked / first-page / even-page headers
  await docInput.setInputFiles(DOCX);
  await page.waitForFunction(() => /1 document: sections\.docx/.test(document.body.innerText) && /sections\.docx: the first page/.test(document.getElementById('wm-shown')?.textContent ?? ''), null, { timeout: 60000 });
  await runAll(1);
  const rowText = await page.locator('.result-row').first().innerText();
  ok(/4 sections, 10 headers/.test(rowText), `the result: ${rowText.replace(/\s+/g, ' ')}`);
  const outDocx = await save('sections-watermarked.docx');
  const zipList = runChild('python3', ['-c', 'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); print("\\n".join(i.filename for i in z.infolist()))', outDocx]).trim().split('\n');
  ok(zipList[0] === '[Content_Types].xml' && !zipList.some((n) => n.endsWith('/')), `the .docx: [Content_Types].xml first, no folder entries (${zipList.length} parts)`);
  if (has('python3', ['-c', 'import docx'])) {
    const py = `
import sys, json, docx
d = docx.Document(sys.argv[1]); o = docx.Document(sys.argv[2])
out = {'body': [p.text for p in d.paragraphs] == [p.text for p in o.paragraphs], 'sections': []}
for s in d.sections:
    e = {}
    for kind, hd in (('default', s.header), ('first', s.first_page_header), ('even', s.even_page_header)):
        x = hd._element.xml if hd._element is not None else ''
        e[kind] = {'own': not hd.is_linked_to_previous, 'marks': x.count('PowerPlusWaterMarkObject'), 'text': ' '.join(p.text for p in hd.paragraphs).strip(), 'table': len(hd.tables)}
    e['titlePg'] = s.different_first_page_header_footer
    out['sections'].append(e)
print(json.dumps(out))`;
    const r = JSON.parse(runChild('python3', ['-c', py, outDocx, DOCX]));
    ok(r.body, 'python-docx: the body\'s text is as it was');
    const need = r.sections.map((s) => ['default', ...(s.titlePg ? ['first'] : []), 'even']);
    ok(r.sections.every((s, i) => need[i].every((k) => s[k].own && s[k].marks === 1)), `python-docx: every section has its own default and even header${''} (and first-page header where it has a different first page), each with one watermark: ${r.sections.map((s, i) => need[i].map((k) => `${k}:${s[k].own ? 'own' : 'linked'}/${s[k].marks}`).join(' ')).join(' | ')}`);
    const texts = r.sections.map((s) => s.default.text);
    ok(texts[0] === 'Header of section 1' && texts[1] === 'Header of section 1' && texts[2] === 'Header of section 1' && texts[3] === 'Under the table of section 4' && r.sections[3].default.table === 1, `… the headers say what they said (section 2 and 3 got copies of section 1's: ${texts.join(' / ')}); the table of section 4's header is there`);
    ok(r.sections[2].first.text === 'First-page header of section 3' && r.sections[3].first.text === 'First-page header of section 3' && r.sections[1].even.text === 'Even header of section 1', '… the first-page and even-page headers too (section 4\'s first page shows a copy of section 3\'s)');
  } else info('python-docx is not installed (pip install python-docx): the .docx is not read back by it');
  const soffice = ['soffice', 'libreoffice'].find((c) => has(c, ['--version']));
  if (soffice) {
    const lo = async (docx, tag) => {
      const dir = join(tmp, `lo-${tag}`); mkdirSync(dir, { recursive: true });
      runChild(soffice, [`-env:UserInstallation=file://${join(tmp, 'lo-profile')}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, docx], { timeout: 180000 });
      const pdf = join(dir, docx.split(/[\\/]/).pop().replace(/\.docx$/, '.pdf'));
      return existsSync(pdf) ? pdfPages(pdf, 1) : [];
    };
    const ps = await lo(outDocx, 'diag');
    const shapesOf = [[595, 842], [595, 842], [842, 595], [612, 792], [612, 792], [595, 842]];
    ok(ps.length === 6, `LibreOffice: 6 pages, as before (${ps.length})`);
    const got = ps.map((p) => redCloud(p.d, p.w, p.h));
    ok(got.every((c, i) => { const [W, H] = shapesOf[i]; return c.n > 300 && Math.abs(c.angle - deg(Math.atan2(H, W))) < 2 && Math.abs(c.cx - W / 2) < 0.05 * W && Math.abs(c.cy - H / 2) < 0.05 * H; }),
      `LibreOffice: the mark on every page — default, even and first-page headers, own and inherited — along each page's own diagonal: ${got.map((c, i) => `p${i + 1} ${c.angle?.toFixed(1)}° (${deg(Math.atan2(shapesOf[i][1], shapesOf[i][0])).toFixed(1)}°) at ${c.cx?.toFixed(0)},${c.cy?.toFixed(0)} n=${c.n}`).join(', ')}`);
    // tiled: many shapes in a header (LibreOffice keeps one shape of a w:pict: each is a run of its own)
    await page.getByRole('radio', { name: 'Tiled' }).click();
    await runAll(1);
    const tiled = await lo(await save('sections-watermarked.docx'), 'tile');
    const quads = tiled.map((p) => [[0, 0], [1, 0], [0, 1], [1, 1]].map(([qx, qy]) => { let n = 0; for (let y = qy * (p.h >> 1); y < (qy + 1) * (p.h >> 1); y++) for (let x = qx * (p.w >> 1); x < (qx + 1) * (p.w >> 1); x++) { const i = (y * p.w + x) * 4; if (p.d[i] > 170 && p.d[i + 1] < 90 && p.d[i + 2] < 90) n++; } return n; }));
    ok(tiled.length === 6 && quads.every((q) => q.every((n) => n > 30)), `LibreOffice, tiled: red in every quarter of every page (${quads.map((q) => q.join('/')).join(', ')})`);
    // a logo: Word's picture watermark on every page
    await page.getByRole('radio', { name: 'Diagonal' }).click();
    await page.getByRole('radio', { name: 'Logo' }).click();
    await runAll(1);
    const logo = await lo(await save('sections-watermarked.docx'), 'logo');
    const lg = logo.map((p) => redCloud(p.d, p.w, p.h));
    ok(logo.length === 6 && lg.every((c, i) => { const [W, H] = shapesOf[i]; return c.n > 1000 && Math.abs(c.angle - deg(Math.atan2(H, W))) < 2; }), `LibreOffice: the logo (Word's picture watermark) on every page, along its diagonal: ${lg.map((c) => c.angle?.toFixed(1)).join(', ')}`);
    await page.getByRole('radio', { name: 'Text', exact: true }).click();
  } else info('LibreOffice is not installed: the .docx is not drawn (apt install libreoffice-writer)');
  // watermarking the result again replaces the mark (Word's own way)
  await page.getByRole('button', { name: 'Clear documents' }).click();
  copyFileSync(outDocx, join(tmp, 'again.docx'));
  await docInput.setInputFiles(join(tmp, 'again.docx'));
  await page.waitForFunction(() => /1 document: again\.docx/.test(document.body.innerText), null, { timeout: 30000 });
  await runAll(1);
  ok(/the earlier watermark was replaced/.test(await page.locator('.result-row').first().innerText()), 'a watermarked document watermarked again: "the earlier watermark was replaced"');
  { const again = await save('again-watermarked.docx');
    const n = runChild('python3', ['-c', 'import sys, zipfile, re; z = zipfile.ZipFile(sys.argv[1]); print(sum(len(re.findall("PowerPlusWaterMarkObject", z.read(n).decode())) for n in z.namelist() if re.match(r"word/header\\d+\\.xml$", n)))', again]).trim();
    ok(n === '10', `… one mark a header, as before (${n})`); }
  // the old .doc, and a file that only says it is a .docx
  await page.getByRole('button', { name: 'Clear documents' }).click();
  await docInput.setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('not really') });
  ok(await page.locator('.toast', { hasText: "save it as a Word Document (.docx) first" }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'the old .doc: "save it as a Word Document (.docx) first"');
  await docInput.setInputFiles({ name: 'fake.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('random bytes, no zip') });
  await page.waitForFunction(() => /fake\.docx/.test(document.body.innerText), null, { timeout: 30000 });
  await page.getByRole('button', { name: 'Watermark all' }).click();
  await page.waitForFunction(() => /could not be watermarked/.test(document.body.innerText), null, { timeout: 60000 });
  ok(/1 document could not be watermarked:[\s\S]*fake\.docx: This is not a Word document/.test(await page.locator(".note-err").last().innerText()), `a file that is no Word document: said (${(await page.locator('.note-err').last().innerText()).replace(/\s+/g, ' ')})`);
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
};
