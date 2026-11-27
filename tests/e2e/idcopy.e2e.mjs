// Safe ID Copy (#/idcopy, PC + phones; potentials #93) end to end on tests/fixtures/idcopy (scripts/make-id-photos.py): two
// photos of a specimen card (its front with the number and an older QR that holds it; its back with the number, a VID and
// a "secure" QR that does not) found, straightened and read by the OCR; the copy saved as a PDF and as one picture and read
// back in Node — Tesseract finds the last 4 digits and "XXXX" but never the first 8, zbar finds the secure QR and not the
// one with the number, the stamp is on it, the PDF holds pictures only; a cover switched off, a box drawn; the e-letter PDF
// behind its password and a scanned PDF (its page a picture: read by the OCR); leaving mid-reading; WCAG 2.2 A / AA with
// pictures in both themes; the phone. The rules themselves: tests/unit/idcopy.test.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/idcopy/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const require = createRequire(import.meta.url);
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return { ok: r.status === 0, out: r.stdout || '' }; };
const digits = (s) => s.replace(/\D/g, '');

export default async ({ base, page: newPage, ok, download, tmp, devices, info }) => {
  const mupdf = await import('mupdf');
  const { createWorker, OEM } = require('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int', import.meta.url)), gzip: true, cacheMethod: 'none' });
  const zbar = run('sh', ['-c', 'command -v zbarimg']).ok;
  /** a page or picture file read back: OCR text, the codes zbar finds, the share of stamp-red pixels */
  const readBack = async (png) => {
    const text = (await worker.recognize(png)).data.text;
    const codes = zbar ? run('zbarimg', ['-q', '--raw', png]).out.trim() : null;
    return { text, codes };
  };
  const pagesOf = (pdf) => { const x = mupdf.Document.openDocument(readFileSync(pdf), 'application/pdf'); return Array.from({ length: x.countPages() }, (_, i) => { const pg = x.loadPage(i); const png = join(tmp, `idc-${Date.now()}-${i}.png`); writeFileSync(png, pg.toPixmap(mupdf.Matrix.scale(3, 3), mupdf.ColorSpace.DeviceRGB, false, true).asPNG()); return { png, text: pg.toStructuredText().asText().trim() }; }); };
  // the stamp's red at 30 % over light paper: pink — light, its red well above green and blue, green and blue alike (the
  // brown desk is dark, the card's red line and blue band are saturated)
  const redShare = (png) => { const pix = new mupdf.Image(readFileSync(png)).toPixmap(); const p = pix.getPixels(), n = pix.getNumberOfComponents(); let red = 0, all = 0; for (let i = 0; i + 2 < p.length; i += n) { all++; const r = p[i], g = p[i + 1], b = p[i + 2]; if (r > 200 && r - g > 22 && r - g < 100 && Math.abs(g - b) < 25) red++; } return red / all; };
  const num = digits(TRUTH.number), first8 = num.slice(0, 8), last4 = num.slice(8);

  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/idcopy');
  await page.getByRole('heading', { name: 'The stamp' }).waitFor();
  await page.waitForTimeout(300);
  ok(!asked.some((u) => /tesseract|mupdf|devcore-ids|zxing|paddle/.test(u)), 'nothing of the OCR, MuPDF, the scan or zxing fetched as the tab opens');
  ok((await page.locator('.idc-stamp-line').innerText()).startsWith('Stamp: For KYC only · '), 'the stamp line says what will be stamped (KYC and today, until something is typed)');
  await page.getByLabel('What the copy is for').fill('KYC with Test Bank');
  await page.getByLabel('The date on the stamp').fill('2026-11-27');
  ok((await page.locator('.idc-stamp-line').innerText()) === 'Stamp: For KYC with Test Bank only · 27 Nov 2026', 'the stamp follows what is typed');

  // ---- the two photos: the card found, straightened and read
  await page.locator('input[type=file][accept*="image"]').setInputFiles([F('card-front.jpg'), F('card-back.jpg')]);
  await page.waitForFunction(() => document.querySelectorAll('.idc-items > .card').length === 2, null, { timeout: 240000 });
  const said = await page.locator('.idc-said').allInnerTexts();
  info(`said: ${said.join(' | ')}`);
  ok(said[0].includes(`Aadhaar number ending ${last4}`) && /1 QR code covered/.test(said[0]), `front: the number found and its QR code (it holds the number) covered (${said[0]})`);
  ok(said[1].includes(`Aadhaar number ending ${last4}`) && said[1].includes(`VID ending ${digits(TRUTH.vid).slice(12)}`) && !/QR code covered/.test(said[1]), `back: the number and the VID; its secure QR kept (${said[1]})`);
  ok(/straightened/.test(await page.locator('.idc-items > .card').first().innerText()), 'the card was found and straightened');
  const qrRow = page.locator('.idc-items > .card').nth(1).locator('.idc-row', { hasText: 'no full Aadhaar number' });
  ok((await qrRow.count()) === 1 && !(await qrRow.locator('input').isChecked()), 'the secure QR is listed, not covered');

  // ---- the PDF: the two sides on one A4 page, pictures only
  const pdf = await download(page, () => page.getByRole('button', { name: 'Save PDF', exact: true }).click());
  ok(/card-front-safe-copy\.pdf$/.test(pdf), `saved as card-front-safe-copy.pdf (${pdf})`);
  const pages = pagesOf(pdf);
  ok(pages.length === 1 && !pages[0].text, `one A4 page, no text in it — pictures only (${pages.length} pages, text “${pages[0].text.slice(0, 40)}”)`);
  const rb = await readBack(pages[0].png);
  const d1 = digits(rb.text);
  ok(!d1.includes(first8) && !d1.includes(first8.slice(0, 4) + first8.slice(4)) && !rb.text.includes(first8.slice(0, 4) + ' ' + first8.slice(4)), `OCR of the copy: never the first 8 digits (${rb.text.replace(/\s+/g, ' ').slice(0, 200)})`);
  ok(d1.includes(last4) && /XXXX/.test(rb.text), 'OCR of the copy: the last 4 digits and “XXXX” where the rest was');
  if (zbar) ok(rb.codes.includes(TRUTH.secureQr.slice(0, 40)) && !rb.codes.includes('PrintLetterBarcodeData'), `zbar: the secure QR still reads, the QR with the number is gone (${rb.codes.slice(0, 60)})`);
  const orig = join(tmp, 'idc-front.png'); writeFileSync(orig, new mupdf.Image(readFileSync(F('card-front.jpg'))).toPixmap().asPNG());
  const rs = redShare(pages[0].png), r0 = redShare(orig);
  ok(rs > 0.01 && rs > 5 * r0, `the stamp is on it (${(100 * rs).toFixed(1)} % of the page stamp-red; the photo ${(100 * r0).toFixed(1)} %)`);

  // ---- a cover switched off shows the number; a box drawn hides the name
  const front = page.locator('.idc-items > .card').first();
  await front.locator('.idc-row', { hasText: `Aadhaar number ending ${last4}` }).locator('input').uncheck();
  ok(!(await front.locator('.idc-said').innerText()).includes('Aadhaar number ending'), 'a cover switched off in the list: the line no longer says it is hidden');
  await page.getByRole('button', { name: 'Draw a box', exact: true }).click();
  const view = front.locator('.idc-view');
  await view.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const bb = await view.boundingBox();
  // the name, the date of birth and "Male" stand in the card's upper middle (the QR code to their right, the number below)
  await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.12); await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * 0.45, bb.y + bb.height * 0.3, { steps: 4 }); await page.mouse.move(bb.x + bb.width * 0.66, bb.y + bb.height * 0.52, { steps: 4 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Draw a box', exact: true }).click();
  ok((await front.locator('.idc-row', { hasText: 'A box you drew' }).count()) === 1, 'a box drawn by hand is listed');
  const jpg = await download(page, () => page.getByRole('button', { name: 'Save picture', exact: true }).click());
  ok(/card-front-safe-copy\.jpg$/.test(jpg), 'one picture saved as card-front-safe-copy.jpg');
  const rj = await readBack(jpg);
  ok(digits(rj.text).includes(num), `the picture: the front's number reads whole now its cover is off (${rj.text.replace(/\s+/g, ' ').slice(0, 160)})`);
  const frontText = rj.text.split(/Address/)[0] || '';
  ok(!/Ravi\s*Kumar|DOB|12\/08/i.test(frontText), `the front: the name and date of birth under the box drawn no longer read (${frontText.replace(/\s+/g, ' ').slice(0, 120)})`);
  await front.locator('.idc-row', { hasText: `Aadhaar number ending ${last4}` }).locator('input').check();

  // ---- the e-letter behind its password
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles(F('e-letter.pdf'));
  await page.getByPlaceholder('Password').fill(TRUTH.letterPassword);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.idc-items > .card').length === 3, null, { timeout: 120000 });
  const ls = await page.locator('.idc-said').nth(2).innerText();
  const l4 = digits(TRUTH.letter).slice(8);
  ok(ls.includes(`Aadhaar number ending ${l4}`) && /3 places? hidden|4 places hidden/.test(ls) && /1 QR code covered/.test(ls), `the e-letter: its number in three places and its VID hidden, its QR (it holds the number) covered (${ls})`);
  ok(/digital signature/.test(await page.locator('.idc-items ~ div').first().innerText().catch(() => '')) || (await page.getByText(/no longer carries/).count()) > 0, 'the copy is said to carry no digital signature');
  // only the letter: the two cards removed
  for (let i = 0; i < 2; i++) await page.locator('.idc-items > .card').first().getByRole('button', { name: 'Remove', exact: true }).last().click();
  ok((await page.locator('.idc-items > .card').count()) === 1, 'pictures removed one by one');
  const lpdf = await download(page, () => page.getByRole('button', { name: 'Save PDF', exact: true }).click());
  ok(/e-letter-safe-copy\.pdf$/.test(lpdf), 'the letter’s copy named after it');
  const lp = pagesOf(lpdf), lr = await readBack(lp[0].png), lf8 = digits(TRUTH.letter).slice(0, 8);
  ok(lp.length === 1 && !lp[0].text && !digits(lr.text).includes(lf8) && digits(lr.text).includes(l4), `the letter's copy: no text layer, never the first 8 digits, the last 4 read (${lr.text.replace(/\s+/g, ' ').slice(0, 160)})`);
  const lopen = mupdf.Document.openDocument(readFileSync(lpdf), 'application/pdf');
  ok(!lopen.needsPassword(), 'the copy opens without the password');
  if (zbar) ok(!lr.codes, `zbar finds no QR code on the letter's copy (${(lr.codes || '').slice(0, 40)})`);

  // ---- a scanned PDF: its first page is a picture — read by the OCR
  await page.locator('.idc-items > .card').first().getByRole('button', { name: 'Remove', exact: true }).last().click();
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles(fileURLToPath(new URL('../fixtures/redact/scan.pdf', import.meta.url)));
  await page.waitForFunction(() => document.querySelectorAll('.idc-items > .card').length === 2, null, { timeout: 240000 });
  const ss = await page.locator('.idc-said').allInnerTexts();
  ok(ss.every((x) => /Aadhaar number ending 0565/.test(x) && /QR code covered/.test(x)), `the scan's two pages: the number read (the picture by the OCR, the other by its text layer) and the QR with it covered (${ss.join(' | ')})`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- leaving while a photo is read
  const lv = await newPage();
  await lv.goto(base + '#/idcopy'); await lv.getByRole('heading', { name: 'The stamp' }).waitFor();
  await lv.locator('input[type=file][accept*="image"]').setInputFiles(F('card-front.jpg'));
  await lv.waitForTimeout(600);
  await lv.goto(base + '#/qr'); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while a photo is read: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with a picture, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/idcopy');
    await ax.getByRole('heading', { name: 'The stamp' }).waitFor();
    await ax.locator('input[type=file][accept*="image"]').setInputFiles(F('card-back.jpg'));
    await ax.waitForFunction(() => document.querySelectorAll('.idc-items > .card').length === 1, null, { timeout: 240000 });
    await ax.waitForFunction(() => !document.getAnimations().length);
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, a picture shown: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'idcopy', {
    ready: '.idc-stamp-line', buttons: [],
    before: async (p) => { await p.locator('input[type=file][accept*="image"]').setInputFiles(F('card-front.jpg')); await p.waitForFunction(() => document.querySelectorAll('.idc-items > .card').length === 1, null, { timeout: 240000 }); },
  });
  const small = await ph.locator('.idc-row, .idc-items .btn, .seg button').evaluateAll((els) => els.filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim().slice(0, 20)));
  ok(!small.length, `phone: rows and buttons at least 44 px tall (${small.join(', ')})`);
  ok(await ph.evaluate(() => getComputedStyle(document.querySelector('.actions')).position === 'fixed'), 'phone: PDF and Picture in the bar at the bottom');
  await worker.terminate();
};
