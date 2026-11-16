// Doc Scanner (#/scanner): a generated "phone photo" of a page (the scikit-image text scan on white paper, rotated,
// on a dark wooden table from the coffee photo) → automatic corners → straightened, cleaned page → PDF (MuPDF) / JPEG.
import { imageInfo, decodeInPage } from '../lib/imgcheck.mjs';
import { readFileSync } from 'node:fs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/scanner');
  // build the test photo in the browser: 1200×900 table, paper 520×680 rotated 9°, text pasted onto the paper
  const photo = await page.evaluate(async ([table, text]) => {
    const bmp = async (b64) => createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const [tb, tx] = [await bmp(table), await bmp(text)];
    const c = new OffscreenCanvas(1200, 900), g = c.getContext('2d');
    g.drawImage(tb, 0, 0, 1200, 900); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 1200, 900);
    g.translate(600, 450); g.rotate((9 * Math.PI) / 180);
    g.fillStyle = '#f4f1ea'; g.fillRect(-260, -340, 520, 680);
    g.drawImage(tx, -230, -300, 460, 176); g.drawImage(tx, -230, -60, 460, 176);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  }, [readFileSync(F('coffee.jpg')).toString('base64'), readFileSync(F('text.png')).toString('base64')]);
  await page.locator('input[type=file]').setInputFiles({ name: 'page-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo, 'base64') });
  await page.waitForSelector('.scan-thumb img', { timeout: 30000 });

  // detected corners: the true paper corners (rotated 9° about the centre) in normalised coordinates
  const rot = (x, y) => { const a = (9 * Math.PI) / 180; return [(600 + x * Math.cos(a) - y * Math.sin(a)) / 1200, (450 + x * Math.sin(a) + y * Math.cos(a)) / 900]; };
  const truth = [rot(-260, -340), rot(260, -340), rot(260, 340), rot(-260, 340)];
  const got = await page.locator('.quad-h').evaluateAll((els) => els.map((e) => [parseFloat(e.style.left) / 100, parseFloat(e.style.top) / 100]));
  const err = Math.max(...got.map((p, i) => Math.hypot(p[0] - truth[i][0], (p[1] - truth[i][1]) * 0.75)));
  info(`corner error ${(err * 100).toFixed(1)} % of width`);
  ok(err < 0.04, `page corners detected within 4 % (max error ${(err * 100).toFixed(1)} %)`);

  // PDF (A4) — open it with MuPDF in Node and check pages and the embedded scan
  const pdfPath = await download(page, () => page.getByRole('button', { name: 'Save PDF' }).click());
  const pdf = readFileSync(pdfPath);
  ok(pdf.subarray(0, 5).toString() === '%PDF-', 'PDF written');
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
  ok(doc.countPages() === 1, 'one page');
  const [, , pw, ph] = doc.loadPage(0).getBounds();
  ok(Math.abs(pw - 595.28) < 1 && Math.abs(ph - 841.89) < 1, `A4 portrait page (${pw.toFixed(0)}×${ph.toFixed(0)} pt)`);
  const pix = doc.loadPage(0).toPixmap([0.5, 0, 0, 0.5, 0, 0], mupdf.ColorSpace.DeviceRGB, false);
  const px = pix.getPixels(); let white = 0; for (let i = 0; i < px.length; i += 3) if (px[i] > 230 && px[i + 1] > 230 && px[i + 2] > 230) white++;
  ok(white / (px.length / 3) > 0.6, `rendered page is mostly clean white paper (${((100 * white) / (px.length / 3)).toFixed(0)} %)`);

  // JPEG of the straightened page: portrait, aspect ≈ 520:680
  await page.getByRole('button', { name: 'Save JPGs' }).click();
  await page.waitForSelector('.result-row', { timeout: 30000 });
  const jp = await download(page, () => page.getByRole('button', { name: 'Save scan-01.jpg' }).click());
  const ji = imageInfo(jp);
  ok(Math.abs(ji.width / ji.height - 520 / 680) < 0.05, `straightened page aspect ${(ji.width / ji.height).toFixed(3)} ≈ 0.765`);
  const d = await decodeInPage(page, jp, [[0.03, 0.03], [0.97, 0.97]]);
  ok(d.px.every((p) => p[0] > 200), 'no table left in the corners (cropped to the paper)');

  // B&W mode, second page (whole photo), rotate, multi-page PDF
  await page.getByRole('radio', { name: 'B & W' }).click();
  await page.locator('input[type=file]').setInputFiles(F('page.png'));
  await page.waitForFunction(() => document.querySelectorAll('.scan-thumb').length === 2, null, { timeout: 30000 });
  await page.getByRole('button', { name: 'Rotate page right' }).click();
  await page.getByRole('radio', { name: 'Fit to scan' }).click();
  const pdf2 = mupdf.Document.openDocument(readFileSync(await download(page, () => page.getByRole('button', { name: 'Save PDF' }).click())), 'application/pdf');
  ok(pdf2.countPages() === 2, 'two-page PDF');
  const b2 = pdf2.loadPage(1).getBounds();
  ok(b2[3] > b2[2], `page 2 rotated to portrait (${b2[2].toFixed(0)}×${b2[3].toFixed(0)})`);
  // delete a page
  await page.getByRole('button', { name: 'Delete page' }).click();
  ok((await page.locator('.scan-thumb').count()) === 1, 'page deleted');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/scanner');
  ok(await phone.locator('input[type=file][capture=environment]').count() === 1, 'phone: opens the back camera');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
