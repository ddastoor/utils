// Make PDF Searchable (#/pdf-ocr, PC + phones; potentials #3) end to end on tests/fixtures/searchable (scripts/make-searchable-
// pdfs.py): five pages — scans upright, lying a quarter to the left, upside down and one shown through /Rotate 90, and a page of
// real text. The tab finds which way up each scan stands, turns the two that lie wrong upright, reads them with the OCR's
// reading path and writes their words as invisible text; the file it saves is read back in Node — MuPDF and poppler find the
// words, a search finds a word over its place in the scan (on the page as it is shown now), the pages draw as they did, the
// page of real text is left alone. Then: turning switched off (the words written along the sideways lines), a protected PDF
// (its password kept), Stop, leaving mid-reading, WCAG 2.2 A / AA with the result in both themes, the phone.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/searchable/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);
const W = 595.28, H = 841.89;

export default async ({ base, page: newPage, ok, tmp, devices, info }) => {
  const mupdf = await import('mupdf');
  /** the saved file: waits for the job (several pages read) */
  const saved = async (page, click) => { const d = page.waitForEvent('download', { timeout: 400000 }); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return p; };
  /** a box (points, top left, on the page as the scan was shown) on the page as it is shown after a turn of `rot` degrees */
  const turnBox = (b, rot) => { const [l, t, r, bo] = b; if (rot === 90) return [H - bo, l, H - t, r]; if (rot === 180) return [W - r, H - bo, W - l, H - t]; return b; };
  const check = (path, label, turned) => {
    const d = mupdf.Document.openDocument(readFileSync(path), 'application/pdf'), src = mupdf.Document.openDocument(readFileSync(F('scan.pdf')), 'application/pdf');
    for (const [i, pg] of TRUTH.pages.entries()) {
      const p = d.loadPage(i), text = p.toStructuredText().asText();
      if (pg.kind === 'text') { ok(/real text in it already/.test(text) && text === src.loadPage(i).toStructuredText().asText(), `${label}: the page of real text left as it was`); continue; }
      const want = words(pg.words.map((w) => w.text).join(' ')), got = new Set(words(text)), share = want.filter((w) => got.has(w)).length / want.length;
      ok(share >= 0.95, `${label}, page ${i + 1} (${pg.kind}): ${Math.round(100 * share)} % of its words in its text`);
      const rot = turned ? ({ sideways: 90, 'upside down': 180 })[pg.kind] ?? 0 : 0;
      const rotOf = (x) => { const r = x.asPDF().loadPage(i).getObject().getInheritable('Rotate'); return r.isNumber() ? r.asNumber() : 0; }, r0 = rotOf(d) - rotOf(src);
      ok(((r0 % 360) + 360) % 360 === rot, `${label}, page ${i + 1}: ${rot ? `turned upright (/Rotate +${rot})` : 'its /Rotate as it was'}`);
      let placed = 0, tried = 0;
      for (const w of pg.words.filter((x) => /^[a-z]{6,}$/i.test(x.text)).slice(0, 10)) {
        tried++; const [l, t, r, b] = turnBox(w.box, rot), pad = Math.max(r - l, b - t) * 0.3;
        if (p.search(w.text).some((qs) => qs.some((q) => { const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]], cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; return cx > l - pad && cx < r + pad && cy > t - pad && cy < b + pad; }))) placed++;
      }
      ok(placed >= tried - 1 && tried >= 8, `${label}, page ${i + 1}: a search finds ${placed} of ${tried} words over their place in the scan`);
      if (!rot) {
        const a = p.toPixmap(mupdf.Matrix.scale(0.5, 0.5), mupdf.ColorSpace.DeviceRGB, false, true).getPixels(), bpx = src.loadPage(i).toPixmap(mupdf.Matrix.scale(0.5, 0.5), mupdf.ColorSpace.DeviceRGB, false, true).getPixels();
        let diff = 0; for (let k = 0; k < a.length; k++) if (a[k] !== bpx[k]) diff++;
        ok(diff === 0, `${label}, page ${i + 1}: drawn exactly as before (${diff} values differ)`);
      }
    }
    return d;
  };

  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/pdf-ocr');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  ok(!asked.some((u) => /tesseract|mupdf|paddle|imgproc/.test(u)), 'nothing of the OCR or MuPDF fetched as the tab opens');
  await page.locator('input[type=file]').setInputFiles(F('scan.pdf'));
  await page.waitForFunction(() => /pages? to read/.test(document.querySelector('.pocr-info')?.textContent || ''), null, { timeout: 60000 });
  ok(/5 pages — 4 pages to read, 1 with text already/.test(await page.locator('.pocr-info').innerText()), `the line above says what will be read (${await page.locator('.pocr-info').innerText()})`);
  const t0 = Date.now();
  const out = await saved(page, () => page.getByRole('button', { name: 'Make searchable', exact: true }).click());
  info(`four scanned pages read in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  ok(/scan-searchable\.pdf$/.test(out), 'saved as scan-searchable.pdf');
  const res = await page.locator('.card', { hasText: 'Searchable' }).last().innerText();
  ok(/4 pages read/.test(res) && /1 page had text already/.test(res) && /turned upright: page 2 \(a quarter turn to the right\), 4 \(turned over\)/.test(res.replace(/\s+/g, ' ')), `the result says what was done (${res.replace(/\s+/g, ' ').slice(0, 260)})`);
  ok(/Read again: every word written is in the new file’s text/.test(res), 'the tab read its file again: every word written is there');
  check(out, 'turned upright', true);
  const pt = spawnSync('pdftotext', ['-layout', out, '-'], { encoding: 'utf8' });
  if (pt.status === 0) { const all = words(TRUTH.pages.flatMap((p) => p.words.map((w) => w.text)).join(' ')), g = new Set(words(pt.stdout)), sh = all.filter((w) => g.has(w)).length / all.length; ok(sh >= 0.95, `poppler (pdftotext) reads ${Math.round(100 * sh)} % of the scanned words`); }
  ok((await page.locator('details', { hasText: 'The text read' }).locator('pre').textContent()).includes('harbour master'), 'the text read is shown under the result (folded)');

  // ---- turning off: the words written along the lines of the pages that lie wrong
  await page.getByText('Turn pages that lie sideways or upside down upright').click();
  const out2 = await saved(page, () => page.getByRole('button', { name: 'Make searchable', exact: true }).click());
  check(out2, 'not turned', false);

  // ---- a protected PDF: its password asked for, and kept
  const enc = join(tmp, 'locked-scan.pdf');
  { const x = mupdf.Document.openDocument(readFileSync(F('scan.pdf')), 'application/pdf').asPDF(); writeFileSync(enc, x.saveToBuffer('encrypt=aes-256,user-password=open1234,owner-password=own56789').asUint8Array()); }
  await page.getByText('Turn pages that lie sideways or upside down upright').click();
  await page.locator('input[type=file]').setInputFiles(enc);
  await page.getByPlaceholder('Password').fill('open1234');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => /locked-scan/.test(document.querySelector('.pocr-info')?.textContent || ''), null, { timeout: 60000 });
  const out3 = await saved(page, () => page.getByRole('button', { name: 'Make searchable', exact: true }).click());
  const d3 = mupdf.Document.openDocument(readFileSync(out3), 'application/pdf');
  ok(d3.needsPassword() && d3.authenticatePassword('open1234') > 0 && words(d3.loadPage(0).toStructuredText().asText()).includes('harbour'), 'a protected PDF: the searchable copy keeps its password and has the words');
  ok(/keeps its password/.test(await page.locator('.card', { hasText: 'Searchable' }).last().innerText()), '… and the result says so');

  // ---- Stop: the pages read so far are kept
  await page.locator('input[type=file]').setInputFiles(F('scan.pdf'));
  await page.waitForFunction(() => /scan\.pdf: 5 pages/.test(document.querySelector('.pocr-info')?.textContent || ''), null, { timeout: 60000 });
  const dl4 = page.waitForEvent('download', { timeout: 400000 });
  await page.getByRole('button', { name: 'Make searchable', exact: true }).click();
  await page.waitForFunction(() => /Page 2 of 5/.test(document.body.innerText), null, { timeout: 200000 });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await dl4;
  const res4 = await page.locator('.card', { hasText: 'Searchable' }).last().innerText();
  ok(/stopped: the pages after were not read/.test(res4) && /1 page read/.test(res4), `Stop: the file is saved with the pages read so far (${res4.replace(/\s+/g, ' ').slice(0, 160)})`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- leaving mid-reading
  const lv = await newPage();
  await lv.goto(base + '#/pdf-ocr'); await lv.locator('input[type=file]').waitFor({ state: 'attached' });
  await lv.locator('input[type=file]').setInputFiles(F('scan.pdf'));
  await lv.waitForFunction(() => /to read/.test(document.querySelector('.pocr-info')?.textContent || ''), null, { timeout: 60000 });
  await lv.getByRole('button', { name: 'Make searchable', exact: true }).click();
  await lv.waitForTimeout(2500);
  await lv.goto(base + '#/qr'); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while it reads: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with the result, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/pdf-ocr');
    await ax.locator('input[type=file]').waitFor({ state: 'attached' });
    await ax.locator('input[type=file]').setInputFiles(F('scan.pdf'));
    await ax.waitForFunction(() => /to read/.test(document.querySelector('.pocr-info')?.textContent || ''), null, { timeout: 60000 });
    const d = ax.waitForEvent('download', { timeout: 400000 });
    await ax.getByRole('button', { name: 'Make searchable', exact: true }).click(); await d;
    await ax.waitForFunction(() => !document.getAnimations().length);
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, with the result: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'pdf-ocr', { ready: '.card', buttons: ['Make searchable'], before: async (p) => { await p.locator('input[type=file]').setInputFiles(F('scan.pdf')); await p.waitForFunction(() => /to read/.test(document.querySelector('.pocr-info')?.textContent || ''), null, { timeout: 60000 }); } });
  ok(await ph.evaluate(() => getComputedStyle(document.querySelector('.actions')).position === 'fixed'), 'phone: Make searchable in the bar at the bottom');
};
