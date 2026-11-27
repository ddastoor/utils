// PDF Redact (#/pdf-redact, PC + phones; potentials #61): the tab end to end on tests/fixtures/redact (scripts/make-redact-pdfs.py):
// nothing fetched at open; a statement's numbers found by kind (with the comment and form field baked into the page), the
// reader's words, one place kept by unticking it, a box drawn by hand; the saved file read back by poppler's pdftotext,
// pypdf and MuPDF — every redacted value gone, the kept one and the words around them still there, black where the box was
// drawn; a scanned PDF's numbers read by OCR and its QR code found, then gone; a password-protected PDF; leaving mid-search;
// WCAG 2.2 A / AA with results in both themes; the phone. The library itself: tests/unit/redact.test.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/redact/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || String(r.error || '') }; };
const digits = (s) => s.replace(/\D/g, '');

export default async ({ base, page: newPage, ok, download, tmp, devices, info }) => {
  const mupdf = await import('mupdf');
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/pdf-redact');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  ok(!asked.some((u) => /mupdf|devcore-ids|tesseract|zxing/.test(u)), 'nothing of MuPDF, the scan or the OCR fetched as the tab opens');
  const summary = () => page.locator('.rd-summary').innerText();
  const waitFound = () => page.waitForFunction(() => /place|Nothing of the kinds/.test(document.querySelector('.rd-summary')?.textContent || ''), null, { timeout: 180000 });

  // ---- a statement: found by kind, with the comment and the form field
  await page.locator('input[type=file]').setInputFiles(F('statement.pdf'));
  await waitFound();
  const head = await page.locator('.rd-info').innerText();
  ok(/1 comment and 1 form field made part of the pages/.test(head), `the comment and the form field are made part of the pages (${head})`);
  const groups = await page.locator('.rd-group-head strong').allInnerTexts();
  for (const k of ['Aadhaar number', 'PAN', 'Phone number', 'E-mail address', 'Account number', 'Card number', 'UPI ID', 'Date of birth']) ok(groups.some((g) => g.startsWith(k)), `found: ${k} (${groups.join(', ')})`);
  ok(!groups.some((g) => /GSTIN|IFSC/.test(g)), 'GSTIN and IFSC not looked for until chosen');
  // choose GSTIN and IFSC, add the name, find again
  await page.getByRole('button', { name: 'GSTIN', exact: true }).click();
  await page.getByRole('button', { name: 'IFSC codes', exact: true }).click();
  await page.getByPlaceholder(/A name, an address line/).fill('Ravi Kumar');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.rd-group-head strong')].some((e) => /^Your words/.test(e.textContent)), null, { timeout: 60000 });
  const g2 = await page.locator('.rd-group-head strong').allInnerTexts();
  ok(['GSTIN', 'IFSC', 'Your words'].every((k) => g2.some((g) => g.startsWith(k))), `GSTIN, IFSC and the name found when asked for (${g2.join(', ')})`);
  // keep the GSTIN: untick it — its box on the page turns to "kept"
  const gst = page.locator('.rd-item', { hasText: '27AAPFU0939F1ZV' });
  await gst.locator('input[type=checkbox]').uncheck();
  await page.waitForFunction(() => [...document.querySelectorAll('.rd-box')].some((b) => /27AAPFU0939F1ZV/.test(b.title) && b.classList.contains('off')));
  ok(true, 'a place unticked in the list is shown as kept on the page');
  // … and a click on a box on the page does the same: the PAN's box turned off and on again, its check box following
  const panBox = page.locator('.rd-box[title^="PAN AAAPL1234C, page 1"]').first();
  await panBox.click();
  ok(!(await page.locator('.rd-item', { hasText: 'AAAPL1234C' }).first().locator('input').isChecked()), 'a click on a place on the page keeps it (its check box in the list is cleared)');
  await page.locator('.rd-box[title^="PAN AAAPL1234C, page 1"]').first().click();
  ok(await page.locator('.rd-item', { hasText: 'AAAPL1234C' }).first().locator('input').isChecked(), '… and a second click redacts it again');
  // draw a box over the page's last line, set solid under the line above (its baseline 152 pt from the top)
  const view = page.locator('.rd-page-view').first();
  await page.getByRole('button', { name: 'Draw a box', exact: true }).click();
  await view.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await view.locator('canvas').waitFor({ timeout: 30000 });
  const bb = await view.boundingBox();
  const pt = (x, y) => [bb.x + (x / 595.28) * bb.width, bb.y + (y / 841.89) * bb.height];
  const [dx0, dy0] = pt(50, 152 - 8.5), [dx1, dy1] = pt(560, 152 + 2.5);
  await page.mouse.move(dx0, dy0); await page.mouse.down(); await page.mouse.move((dx0 + dx1) / 2, (dy0 + dy1) / 2, { steps: 5 }); await page.mouse.move(dx1, dy1, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Draw a box', exact: true }).click();
  ok((await page.locator('.rd-group-head strong', { hasText: 'Box you drew' }).count()) === 1, 'a box drawn by hand is listed');
  // redact and save
  await page.getByRole('button', { name: 'Redact and save', exact: true }).click();
  await page.getByText(/^Read again: none of the redacted text/).waitFor({ timeout: 120000 });
  ok(true, 'the tab read the redacted file again: none of the redacted text is anywhere in it');
  const file = await download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click());
  ok(/statement-redacted\.pdf$/.test(file), `saved as statement-redacted.pdf (${file})`);
  const t1 = TRUTH['statement.pdf'], values = Object.entries(t1).filter(([k]) => /^\d$/.test(k)).flatMap(([, v]) => Object.values(v).flat()).filter((v) => v !== '27AAPFU0939F1ZV');
  const readers = [];
  { const x = mupdf.Document.openDocument(readFileSync(file), 'application/pdf'); let s = ''; for (let i = 0; i < x.countPages(); i++) s += x.loadPage(i).toStructuredText().asText() + '\n'; readers.push(['MuPDF', s]); }
  const pt2 = run('pdftotext', ['-layout', file, '-']); if (pt2.ok) readers.push(['poppler', pt2.out]);
  const py = run('python3', ['-c', 'import sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\nprint("\\n".join(p.extract_text() for p in r.pages))\nprint(r.metadata)\nprint(r.outline)', file]); if (py.ok) readers.push(['pypdf', py.out]);
  for (const [who, text] of readers) {
    const flat = text.replace(/\s+/g, ' '), d = digits(text);
    const still = values.filter((v) => (digits(v).length >= 8 ? d.includes(digits(v)) : flat.toLowerCase().includes(v.toLowerCase())));
    ok(!still.length, `${who}: none of the redacted values (${still.join(', ')})`);
    ok(flat.includes('27AAPFU0939F1ZV'), `${who}: the GSTIN that was kept is still there`);
    const keep = t1.keep.filter((k) => k !== 'Closing balance carried forward' && !flat.includes(k));
    ok(!keep.length, `${who}: the words around them kept (${keep.join(' | ')})`);
    ok(!flat.includes('Closing balance carried forward'), `${who}: the line under the drawn box is gone`);
  }
  info(`read back by ${readers.map((r) => r[0]).join(', ')}`);
  // black where the box was drawn
  { const x = mupdf.Document.openDocument(readFileSync(file), 'application/pdf'), pix = x.loadPage(0).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true), px = pix.getPixels(), w = pix.getWidth();
    let n = 0, all = 0;
    for (let y = 146 * 2; y < 151 * 2; y++) for (let xx = 60 * 2; xx < 550 * 2; xx++) { all++; const k = (y * w + xx) * 3; if (px[k] + px[k + 1] + px[k + 2] < 60) n++; }
    ok(n / all > 0.9, `the drawn box is black on the page (${Math.round((100 * n) / all)} % dark)`); }

  // ---- a scanned PDF: numbers read in the picture, a QR code
  await page.locator('input[type=file]').setInputFiles(F('scan.pdf'));
  await page.waitForFunction(() => [...document.querySelectorAll('.rd-group-head strong')].some((e) => /^QR code/.test(e.textContent)), null, { timeout: 240000 });
  const items = await page.locator('.rd-item').allInnerTexts();
  const p1 = items.filter((x) => /^p\. 1/.test(x.trim())).join(' ');
  const s1 = TRUTH['scan.pdf']['1'];
  ok(digits(p1).includes(digits(s1.aadhaar[0])) && p1.includes(s1.pan[0]) && digits(p1).includes(digits(s1.phone[0])), `page 1 (a picture): its Aadhaar number, PAN and phone number read by OCR (${p1.replace(/\s+/g, ' ').slice(0, 200)})`);
  ok(items.some((x) => /p\. 1[\s\S]*QRCode/.test(x)) && items.some((x) => /p\. 2[\s\S]*QRCode/.test(x)), 'the QR code found on both pages');
  ok(/scanned/.test(await page.locator('.rd-info').innerText()), 'the line above says a page is a scan');
  await page.getByRole('button', { name: 'Redact and save', exact: true }).click();
  await page.getByText(/^Read again: none of the redacted text/).waitFor({ timeout: 120000 });
  const sfile = await download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click());
  // the QR code is gone: zbar finds no code on the pages drawn from the saved file
  if (run('sh', ['-c', 'command -v zbarimg']).ok) {
    const x = mupdf.Document.openDocument(readFileSync(sfile), 'application/pdf'); let found = 0;
    for (let i = 0; i < x.countPages(); i++) { const png = join(tmp, `redact-${i}.png`); writeFileSync(png, x.loadPage(i).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true).asPNG()); const z = run('zbarimg', ['-q', png]); if (z.out.trim()) found++; }
    ok(!found, `zbar finds no QR code on the redacted pages (${found})`);
  } else ok(true, 'zbarimg is not installed — the QR check is skipped');

  // ---- a password-protected PDF: asked for, and the copy has none
  const enc = join(tmp, 'locked.pdf');
  { const x = mupdf.Document.openDocument(readFileSync(F('statement.pdf')), 'application/pdf').asPDF(); writeFileSync(enc, x.saveToBuffer('encrypt=aes-256,user-password=open1234,owner-password=own56789').asUint8Array()); }
  await page.locator('input[type=file]').setInputFiles(enc);
  await page.getByPlaceholder('Password').fill('open1234');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => /no password/.test(document.querySelector('.rd-info')?.textContent || ''), null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Redact and save', exact: true }).click();
  await page.getByText(/^Read again: none of the redacted text/).waitFor({ timeout: 120000 });
  const efile = await download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click());
  const opened = mupdf.Document.openDocument(readFileSync(efile), 'application/pdf');
  ok(!opened.needsPassword() && !digits(opened.loadPage(0).toStructuredText().asText()).includes('234123412346'), 'a protected PDF: its password asked for; the redacted copy opens without one and is redacted');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- leaving mid-search
  const lv = await newPage();
  await lv.goto(base + '#/pdf-redact'); await lv.locator('input[type=file]').waitFor({ state: 'attached' });
  await lv.locator('input[type=file]').setInputFiles(F('scan.pdf'));
  await lv.waitForTimeout(400);
  await lv.goto(base + '#/qr'); await lv.waitForTimeout(800);
  ok(!lv.errors.length, `leaving the tab while it reads a scan: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with results, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/pdf-redact');
    await ax.locator('input[type=file]').waitFor({ state: 'attached' });
    await ax.locator('input[type=file]').setInputFiles(F('statement.pdf'));
    await ax.waitForFunction(() => document.querySelectorAll('.rd-box').length > 4, null, { timeout: 120000 });
    await ax.waitForFunction(() => !document.getAnimations().length);
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, places found: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'pdf-redact', {
    ready: '.rd-kinds', buttons: ['Find'],
    before: async (p) => { await p.locator('input[type=file]').setInputFiles(F('statement.pdf')); await p.waitForFunction(() => document.querySelectorAll('.rd-box').length > 4, null, { timeout: 120000 }); },
  });
  const small = await ph.locator('.rd-item, .rd-kinds button, .rd-group-head button').evaluateAll((els) => els.filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 44).length);
  ok(!small, `phone: the list's rows and buttons at least 44 px tall (${small} smaller)`);
  const fixed = await ph.evaluate(() => getComputedStyle(document.querySelector('.actions')).position);
  ok(fixed === 'fixed', `phone: Redact and save in the bar at the bottom (${fixed})`);
};
