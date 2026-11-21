// Doc Scanner (#/scanner): the page is found by the page finder (DocCornerNet LEAN on ONNX Runtime Web, fetched with
// the first page); a generated "phone photo" (the scikit-image text scan on paper, rotated, on a dark table) and the
// photos of scripts/make-scan-photos.py, whose corners are known exactly → straightened, cleaned page → PDF (MuPDF,
// read back in Node) / JPEG. Also: thumbnails for every page, moving pages, corners that cross, the finder failing to
// load, "Fit to scan", black and white without JPEG smudges, "Start over", the phone's two pickers.
import { fileURLToPath } from 'node:url';
import { imageInfo, decodeInPage } from '../lib/imgcheck.mjs';
import { readFileSync } from 'node:fs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const S = (n) => fileURLToPath(new URL(`../fixtures/scanner/${n}`, import.meta.url));
const PHOTOS = Object.fromEntries(JSON.parse(readFileSync(S('photos.json'), 'utf8')).photos.map((p) => [p.name, p]));

export default async ({ base, page: newPage, ok, info, download, devices, released }) => {
  const mupdf = await import('mupdf');
  const page = await newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(base + '#/scanner');
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  ok(!requests.some((u) => /doccornernet|ort-wasm|pagefind/.test(u)), 'nothing of the page finder is fetched before a photo is chosen');
  const handles = () => page.locator('.quad-h').evaluateAll((els) => els.map((e) => [parseFloat(e.style.left) / 100, parseFloat(e.style.top) / 100]));
  const cornerErr = (got, truth, aspect) => Math.max(...got.map((p, i) => Math.hypot(p[0] - truth[i * 2], (p[1] - truth[i * 2 + 1]) * aspect)));
  const thumbs = (n) => page.waitForFunction((k) => document.querySelectorAll('.scan-thumb').length === k && [...document.querySelectorAll('.scan-thumb')].every((b) => b.querySelector('img')), n, { timeout: 60000 });

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
  await thumbs(1);
  ok(requests.some((u) => /assets\/doccornernet_lean-[\w-]+\.ort$/.test(u)) && requests.some((u) => /assets\/ort-wasm-simd-threaded-[\w-]+\.wasm$/.test(u)), 'the page finder (model + ONNX Runtime) is fetched from this site with the first photo');
  ok(requests.every((u) => u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')), 'nothing is fetched from another site');

  // detected corners: the true paper corners (rotated 9° about the centre) in normalised coordinates
  const rot = (x, y) => { const a = (9 * Math.PI) / 180; return [(600 + x * Math.cos(a) - y * Math.sin(a)) / 1200, (450 + x * Math.sin(a) + y * Math.cos(a)) / 900]; };
  const truth = [rot(-260, -340), rot(260, -340), rot(260, 340), rot(-260, 340)].flat();
  let err = cornerErr(await handles(), truth, 0.75);
  info(`corner error ${(err * 100).toFixed(1)} % of width`);
  ok(err < 0.02, `page corners found within 2 % (max error ${(err * 100).toFixed(1)} %)`);
  ok(/Page 1 of 1 · page-photo\.jpg · page found — check the corners/.test(await page.locator('.tool-body, main').first().innerText()), 'the line says the page was found');

  // PDF (A4) — open it with MuPDF in Node and check pages and the embedded scan
  const pdfPath = await download(page, () => page.getByRole('button', { name: 'Save PDF' }).click());
  const pdf = readFileSync(pdfPath);
  ok(pdf.subarray(0, 5).toString() === '%PDF-', 'PDF written');
  const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
  ok(doc.countPages() === 1, 'one page');
  const [, , pw, ph] = doc.loadPage(0).getBounds();
  ok(Math.abs(pw - 595.28) < 1 && Math.abs(ph - 841.89) < 1, `A4 portrait page (${pw.toFixed(0)}×${ph.toFixed(0)} pt)`);
  const pix = doc.loadPage(0).toPixmap([0.5, 0, 0, 0.5, 0, 0], mupdf.ColorSpace.DeviceRGB, false);
  const px = pix.getPixels(); let white = 0; for (let i = 0; i < px.length; i += 3) if (px[i] > 230 && px[i + 1] > 230 && px[i + 2] > 230) white++;
  ok(white / (px.length / 3) > 0.6, `rendered page is mostly clean white paper (${((100 * white) / (px.length / 3)).toFixed(0)} %)`);

  // JPEG of the straightened page: portrait, aspect ≈ 520:680, made from the photo itself (not the preview)
  await page.getByRole('button', { name: 'Save JPGs' }).click();
  await page.waitForSelector('.result-row', { timeout: 30000 });
  const jp = await download(page, () => page.getByRole('button', { name: 'Save scan-01.jpg' }).click());
  const ji = imageInfo(jp);
  ok(Math.abs(ji.width / ji.height - 520 / 680) < 0.03, `straightened page aspect ${(ji.width / ji.height).toFixed(3)} ≈ 0.765`);
  ok(ji.height >= 660, `the JPEG is made from the photo at full size (${ji.width}×${ji.height}; the preview would give less)`);
  const d = await decodeInPage(page, jp, [[0.03, 0.03], [0.97, 0.97]]);
  ok(d.px.every((p) => p[0] > 200), 'no table left in the corners (cropped to the paper)');

  // a white page on a light desk: the outline of the paper is lost in the desk, the page finder finds it
  await page.locator('input[type=file]').setInputFiles(S('white-page-light-desk.jpg'));
  await thumbs(2);
  const wp = PHOTOS['white-page-light-desk.jpg'], wt = wp.corners.map((v, i) => v / (i % 2 ? wp.height : wp.width));
  err = cornerErr(await handles(), wt, wp.height / wp.width);
  ok(err < 0.02, `white page on a light desk: corners within 2 % (max error ${(err * 100).toFixed(1)} %)`);

  // two photos at once: both get a thumbnail; moving pages
  await page.locator('input[type=file]').setInputFiles([S('receipt-dark-wood.jpg'), S('magazine-brick.jpg')]);
  await thumbs(4);
  ok(true, 'two photos added at once: every page has its thumbnail');
  const earlier = page.getByRole('button', { name: 'Move page earlier' }), later = page.getByRole('button', { name: 'Move page later' });
  ok(await later.isDisabled() && !(await earlier.isDisabled()), 'on the last page "Move page later" is off');
  await earlier.click();
  ok(/Page 3 of 4 · magazine-brick\.jpg/.test(await page.locator('.tool-body, main').first().innerText()), 'moving the page earlier makes it page 3');
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  ok(await earlier.isDisabled() && !(await later.isDisabled()), 'on the first page "Move page earlier" is off');
  await later.click();
  ok(/Page 2 of 4 · page-photo\.jpg/.test(await page.locator('.tool-body, main').first().innerText()), 'moving the first page later makes it page 2');

  // corners that cross: said under the editor, and the save is refused with the page's number
  await page.getByRole('button', { name: 'Page 4', exact: true }).click();
  const tl = page.getByRole('slider', { name: 'Top-left corner' });
  await tl.focus();
  for (let i = 0; i < 45; i++) await page.keyboard.press('Shift+ArrowRight');
  ok(/across/.test(await tl.getAttribute('aria-valuetext')), 'a corner handle says where it is (for screen readers)');
  await page.locator('.err-text', { hasText: 'The corners cross' }).waitFor({ timeout: 5000 });
  ok(true, 'corners dragged across each other: "The corners cross or fold back" under the editor');
  await page.getByRole('button', { name: 'Save PDF' }).click();
  ok(await page.locator('.toast', { hasText: /^Page 4: The corners cross/ }).first().waitFor({ timeout: 10000 }).then(() => true, () => false), 'Save PDF is refused: "Page 4: The corners cross …"');
  await page.getByRole('button', { name: 'Delete page' }).click();
  await thumbs(3);

  // black and white, "Fit to scan": the B&W page is stored without JPEG smudges, the page has the scan's shape
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await page.getByRole('radio', { name: 'B & W' }).click();
  await page.getByRole('radio', { name: 'Fit to scan' }).click();
  const pdf2 = mupdf.Document.openDocument(readFileSync(await download(page, () => page.getByRole('button', { name: 'Save PDF' }).click())), 'application/pdf');
  ok(pdf2.countPages() === 3, 'three-page PDF');
  const b1 = pdf2.loadPage(0).getBounds();
  ok(Math.abs(Math.max(b1[2], b1[3]) - 841.89) < 1 && b1[3] > b1[2], `"Fit to scan": the scan's shape, long side 297 mm (${b1[2].toFixed(0)}×${b1[3].toFixed(0)} pt)`);
  let im0 = null; pdf2.loadPage(0).getObject().get('Resources').get('XObject').forEach((v) => { im0 = v; });
  let im1 = null; pdf2.loadPage(1).getObject().get('Resources').get('XObject').forEach((v) => { im1 = v; });
  ok(im0.get('Filter').toString() === '/FlateDecode' && im1.get('Filter').toString() === '/DCTDecode', `the black-and-white page is stored without loss (${im0.get('Filter')}, ${im0.get('BitsPerComponent')} bit), the colour one as JPEG (${im1.get('Filter')})`);
  const k = im0.get('Width').asNumber() / b1[2]; // render at the image's own size: one pixel of the scan, one pixel out
  const bw = pdf2.loadPage(0).toPixmap([k, 0, 0, k, 0, 0], mupdf.ColorSpace.DeviceGray, false).getPixels();
  let pure = 0; for (const v of bw) if (v < 8 || v > 247) pure++;
  ok(pure / bw.length > 0.99, `the black-and-white page is black and white (${((100 * pure) / bw.length).toFixed(2)} % of pixels pure — no JPEG smudges)`);

  // rotate a page
  await page.getByRole('button', { name: 'Page 3', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate page right' }).click();
  const pdf3 = mupdf.Document.openDocument(readFileSync(await download(page, () => page.getByRole('button', { name: 'Save PDF' }).click())), 'application/pdf');
  const b3 = pdf3.loadPage(2).getBounds();
  ok(b3[3] < b3[2], `page 3 (a receipt) turned on its side (${b3[2].toFixed(0)}×${b3[3].toFixed(0)} pt)`);

  // start over
  await page.getByRole('button', { name: 'Start over' }).click();
  ok((await page.locator('.scan-thumb').count()) === 0 && await page.locator('.quad-wrap').isHidden(), '"Start over" removes every page');
  ok(page.errors.filter((e) => !/corners cross/.test(e)).length === 0, `no page errors: ${page.errors.join(' | ')}`);
  await page.goto(base + '#/');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => globalThis.__superutilsLive().workers) === 0, 'leaving the tab ends the page finder and the image workers');

  // the page finder cannot be fetched: the outline of the paper is used, and the tab says so
  const p2 = await newPage();
  await p2.route(/doccornernet_lean/, (r) => r.abort());
  await p2.goto(base + '#/scanner');
  await p2.locator('input[type=file]').setInputFiles(S('receipt-dark-wood.jpg'));
  await p2.waitForSelector('.scan-thumb img', { timeout: 60000 });
  ok(await p2.locator('.toast', { hasText: 'The page finder could not be loaded' }).count() === 1, 'the finder could not be fetched: said once');
  const t2 = await p2.locator('.tool-body, main').first().innerText();
  ok(/Page 1 of 1 · receipt-dark-wood\.jpg · (outline of the paper found|no page found)[^\n]*\(the page finder could not be loaded\)/.test(t2), 'the page is still added — with the outline or the whole photo, and why');
  ok(p2.errors.length === 0, `no page errors: ${p2.errors.join(' | ')}`);

  // phone: a camera button and a picker for photos already taken; corner handles are touch targets
  // leaving the tab lets go of what it made: its results' blob URLs (they kept the files in memory until the page reloaded)
  { const had = await page.evaluate((id) => [...window.__blobs.values()].filter((b) => b.at.startsWith(`#/${id}`) && !b.download && !/javascript/.test(b.type)).length, 'scanner');
    const kept = await released(page, 'scanner');
    ok(kept.length === 0, `leaving the tab: ${had} blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/scanner');
  await phone.waitForSelector('input[type=file]', { state: 'attached', timeout: 20000 });
  ok(await phone.getByRole('button', { name: 'Use camera' }).count() === 1 && await phone.locator('input[type=file][capture]').count() === 0, 'phone: "Use camera" opens the back camera in the page (page after page; owner, 20 Nov 2026)');
  ok(await phone.locator('input[type=file]').count() === 1 && await phone.locator('input[type=file][multiple]').count() === 1, 'phone: "Choose photos" picks photos already taken (no camera forced)');
  await phone.locator('input[type=file]').setInputFiles(S('shadow-grey-desk.jpg'));
  await phone.waitForSelector('.scan-thumb img', { timeout: 60000 });
  await phone.locator('.quad-h').first().scrollIntoViewIfNeeded();
  const hb = await phone.locator('.quad-h').first().boundingBox();
  const hit = await phone.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('quad-h'), [hb.x + hb.width / 2 + 21, hb.y + hb.height / 2]);
  ok(hit, 'phone: a corner handle takes a touch 21 px from its centre (a 44 px target)');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  ok(phone.errors.length === 0, `phone: no errors: ${phone.errors.join(' | ')}`);
};
