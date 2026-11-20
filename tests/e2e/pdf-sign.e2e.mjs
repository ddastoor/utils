// Sign PDF (#/pdf-sign): drawn / typed / photographed signatures placed on real PDFs; position, size, date, every page;
// read back as pixels (MuPDF in Node) and as an image XObject with transparency.
import { readFileSync, writeFileSync } from 'node:fs';
import { pdfInfo, renderGrey } from '../lib/pdfcheck.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, tmp, devices }) => {
  const m = await import('mupdf');
  const sigImages = (f) => { const d = m.Document.openDocument(readFileSync(f), 'application/pdf').asPDF(), out = []; for (let k = 1; k < d.countObjects(); k++) { const o = d.newIndirect(k); if (o.isStream() && o.get('Subtype').toString() === '/Image') out.push({ smask: !o.get('SMask').isNull() }); } return out; };
  const page = await newPage({ viewport: { width: 1280, height: 1500 } }); // the whole page preview fits on screen
  await page.goto(base + '#/pdf-sign');
  // scroll so the page preview starts below the sticky tab bars; returns its box
  const stageBox = async () => { await page.evaluate(() => { const r = document.querySelector('.pdfs-canvas').getBoundingClientRect(); scrollBy(0, r.top - 400); }); return page.locator('.pdfs-canvas').boundingBox(); };
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.getByText('Page 1 of 1').waitFor();
  const save = () => download(page, () => page.getByRole('button', { name: 'Save signed PDF' }).click());
  await page.getByRole('button', { name: 'Save signed PDF' }).click();
  ok(await page.getByText('Make your signature first').count() >= 1, 'saving without a signature is refused');
  // draw a signature
  const pad = page.getByLabel('Draw your signature here'); await pad.scrollIntoViewIfNeeded();
  const b = await pad.boundingBox();
  await page.mouse.move(b.x + 30, b.y + 120); await page.mouse.down();
  for (let i = 0; i <= 30; i++) await page.mouse.move(b.x + 30 + i * 8, b.y + 120 - Math.sin(i / 3) * 50, { steps: 2 });
  await page.mouse.up();
  await page.locator('.pdfs-sig:not([hidden])').waitFor();
  ok(true, 'drawn signature appears on the page preview');
  // place it top-left by clicking the page
  const cb = await stageBox();
  await page.mouse.click(cb.x + cb.width * 0.08, cb.y + cb.height * 0.08);
  const f1 = await save(), o = await renderGrey(P('crazyones.pdf'), 0, 1), g1 = await renderGrey(f1, 0, 1);
  ok(g1.dark(0.06, 0.06, 0.38, 0.2, 200) > o.dark(0.06, 0.06, 0.38, 0.2, 200) + 0.01, 'signature drawn where the page was clicked (top left)');
  ok(Math.abs(g1.dark(0.5, 0.5, 1, 1) - o.dark(0.5, 0.5, 1, 1)) < 0.002, 'rest of the page unchanged');
  ok(sigImages(f1).some((x) => x.smask), 'signature is an image with transparency (soft mask)');
  ok(/Crazy Ones/.test((await pdfInfo(f1)).list[0].text), 'page text kept');
  // drag it to the bottom right
  const cb2 = await stageBox(), sb = await page.locator('.pdfs-sig').boundingBox();
  await page.mouse.move(sb.x + 10, sb.y + 10); await page.mouse.down(); await page.mouse.move(cb2.x + cb2.width * 0.62 + 10, cb2.y + cb2.height * 0.8 + 10, { steps: 8 }); await page.mouse.up();
  // the overlay must have followed the pointer before saving
  await page.waitForFunction(([x, y]) => { const r = document.querySelector('.pdfs-sig').getBoundingClientRect(); return Math.abs(r.left - x) < 4 && Math.abs(r.top - y) < 4; }, [cb2.x + cb2.width * 0.62, cb2.y + cb2.height * 0.8], { timeout: 10000 }).catch(() => {});
  const g2 = await renderGrey(await save(), 0, 1);
  ok(g2.dark(0.6, 0.78, 0.98, 0.95, 200) > o.dark(0.6, 0.78, 0.98, 0.95, 200) + 0.01 && g2.dark(0.06, 0.06, 0.38, 0.2, 200) < o.dark(0.06, 0.06, 0.38, 0.2, 200) + 0.003, 'dragged signature lands bottom right');
  // typed signature + date
  await page.getByRole('radio', { name: 'Type' }).click();
  await page.getByPlaceholder('Type your name').fill('A. Kumar');
  await page.getByText('Add today’s date under it').click();
  const d = new Date(), today = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  await page.waitForTimeout(400);
  const f3 = await save();
  ok((await pdfInfo(f3)).list[0].text.includes(today), `date ${today} added under the signature`);
  // photo of a signature on paper (made here: white paper, blue ink, a little grey shadow)
  const photo = Buffer.from(await page.evaluate(async () => {
    const c = new OffscreenCanvas(900, 300), g = c.getContext('2d'); g.fillStyle = '#f1efe9'; g.fillRect(0, 0, 900, 300);
    g.strokeStyle = '#1b2f8f'; g.lineWidth = 7; g.beginPath(); g.moveTo(80, 200); for (let x = 80; x < 820; x += 10) g.lineTo(x, 160 + Math.sin(x / 40) * 60); g.stroke();
    return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer())];
  }));
  await page.getByRole('radio', { name: 'Photo' }).click();
  const srcBefore = await page.locator('.pdfs-sig img').getAttribute('src');
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'sig.jpg', mimeType: 'image/jpeg', buffer: photo });
  // wait until the photo signature replaced the drawn one (paper removal runs in the imgproc worker)
  await page.waitForFunction((s) => document.querySelector('.pdfs-sig img')?.getAttribute('src') !== s, srcBefore, { timeout: 30000 });
  ok(sigImages(await save()).some((x) => x.smask), 'signature from a photo: paper removed (transparent)');
  // every page
  await page.locator('input[type=file]').first().setInputFiles(P('two-different-pages.pdf'));
  await page.getByText('Page 1 of 2').waitFor();
  await page.getByText('Put it on every page (initials)').click();
  const f5 = await save(), base5 = [await renderGrey(P('two-different-pages.pdf'), 0, 1), await renderGrey(P('two-different-pages.pdf'), 1, 1)];
  const out5 = [await renderGrey(f5, 0, 1), await renderGrey(f5, 1, 1)];
  ok(out5.every((g, i) => g.dark(0, 0, 1, 1, 200) > base5[i].dark(0, 0, 1, 1, 200) + 0.001), 'signature on both pages');
  // the signature belongs to the page it was put on: placed on page 1, saved while page 2 was shown → on page 1
  await page.getByText('Put it on every page (initials)').click();
  const cb3 = await stageBox();
  await page.mouse.click(cb3.x + cb3.width * 0.1, cb3.y + cb3.height * 0.1);
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByText('Page 2 of 2').waitFor();
  ok(await page.getByText('Your signature is on page 1 — tap this page to move it here.').count() === 1 && await page.locator('.pdfs-sig').isHidden(), 'on page 2 the tab says the signature is on page 1 (and does not show it here)');
  const f6 = await save(), out6 = [await renderGrey(f6, 0, 1), await renderGrey(f6, 1, 1)];
  ok(out6[0].dark(0.06, 0.06, 0.45, 0.3, 200) > base5[0].dark(0.06, 0.06, 0.45, 0.3, 200) + 0.01 && Math.abs(out6[1].dark(0, 0, 1, 1, 200) - base5[1].dark(0, 0, 1, 1, 200)) < 0.0005,
    'saved while page 2 was shown: the signature is on page 1, where it was put, and page 2 is untouched (it went on the page being looked at)');
  // a tap at the very bottom: the signature and its date stay on the page
  await page.evaluate(() => { const r = document.querySelector('.pdfs-canvas').getBoundingClientRect(); scrollBy(0, r.bottom - innerHeight + 60); }); // the bottom edge in view
  const cb4 = await page.locator('.pdfs-canvas').boundingBox();
  await page.mouse.click(cb4.x + cb4.width * 0.5, cb4.y + cb4.height * 0.997);
  await page.getByText('Your signature is on this page (2).').waitFor({ timeout: 5000 });
  const f7 = await save(), d7 = m.Document.openDocument(readFileSync(f7), 'application/pdf'), pg7 = d7.loadPage(1), [, , W7, H7] = pg7.getBounds();
  const imgs7 = JSON.parse(pg7.toStructuredText('preserve-images').asJSON()).blocks.filter((x) => x.type === 'image');
  ok(imgs7.length === 1 && imgs7[0].bbox.y >= 0 && imgs7[0].bbox.y + imgs7[0].bbox.h <= H7 + 0.5 && imgs7[0].bbox.x + imgs7[0].bbox.w <= W7 + 0.5,
    `a tap at the bottom edge: the signature lies wholly on page 2 (${JSON.stringify(imgs7.map((x) => x.bbox))}, page ${W7}×${H7})`);
  ok((await pdfInfo(f7)).list[1].text.includes(today), 'and its date is on the page too');
  // a typed name in a script font: nothing cut off (the font's measured bounds)
  await page.getByRole('radio', { name: 'Type' }).click();
  await page.getByPlaceholder('Type your name').fill('Jyoti Fqgyz');
  await page.waitForTimeout(600);
  const edges = await page.evaluate(async () => {
    const im = document.querySelector('.pdfs-sig img'), b = await createImageBitmap(await (await fetch(im.src)).blob());
    const c = new OffscreenCanvas(b.width, b.height), g = c.getContext('2d'); g.drawImage(b, 0, 0);
    const d = g.getImageData(0, 0, b.width, b.height).data, a = (x, y) => d[(y * b.width + x) * 4 + 3];
    let ink = 0; for (let x = 0; x < b.width; x++) ink += a(x, 0) + a(x, b.height - 1); for (let y = 0; y < b.height; y++) ink += a(0, y) + a(b.width - 1, y);
    return ink;
  });
  ok(edges === 0, 'typed signature: a clear margin on every side (no swash cut off)');
  // a photo of blank paper: said for what it is
  await page.getByRole('radio', { name: 'Photo' }).click();
  const blank = Buffer.from(await page.evaluate(async () => { const c = new OffscreenCanvas(600, 300), g = c.getContext('2d'); g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, 600, 300); return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg' })).arrayBuffer())]; }));
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'blank.jpg', mimeType: 'image/jpeg', buffer: blank });
  ok(await page.locator('.toast', { hasText: 'No ink was found in the photo' }).first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'a photo of blank paper: "No ink was found in the photo …"');
  // the drawing survives a narrower window (strokes scaled with the pad)
  await page.getByRole('radio', { name: 'Draw' }).click();
  await page.getByRole('button', { name: 'Clear' }).click();
  await pad.scrollIntoViewIfNeeded();
  const srcOld = await page.locator('.pdfs-sig img').getAttribute('src');
  const pb = await pad.boundingBox();
  await page.mouse.move(pb.x + pb.width * 0.05, pb.y + pb.height * 0.5); await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(pb.x + pb.width * (0.05 + i * 0.045), pb.y + pb.height * (i % 2 ? 0.4 : 0.6), { steps: 2 });
  await page.mouse.up();
  await page.waitForFunction((o) => { const im = document.querySelector('.pdfs-sig img'); return im.getAttribute('src') !== o && im.complete && im.naturalWidth > 0; }, srcOld, { timeout: 10000 });
  const shape = () => page.evaluate(() => { const im = document.querySelector('.pdfs-sig img'); return im.naturalWidth / im.naturalHeight; });
  const wide = await shape();
  await page.setViewportSize({ width: 640, height: 1500 });
  await page.waitForTimeout(500);
  await pad.scrollIntoViewIfNeeded();
  const pb2 = await pad.boundingBox();
  const srcWide = await page.locator('.pdfs-sig img').getAttribute('src');
  await page.mouse.click(pb2.x + pb2.width * 0.5, pb2.y + pb2.height * 0.5); // a dot inside the drawing: its bounds are the zig-zag's
  await page.waitForFunction((o) => { const im = document.querySelector('.pdfs-sig img'); return im.getAttribute('src') !== o && im.complete && im.naturalWidth > 0; }, srcWide, { timeout: 10000 });
  const narrow = await shape();
  ok(Math.abs(narrow - wide) / wide < 0.15, `after a narrower window and one more stroke the whole signature is kept (shape ${wide.toFixed(2)} → ${narrow.toFixed(2)})`);
  const real = page.errors.filter((e) => !/Make your signature first/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-sign');
  await phone.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await phone.getByText('Page 1 of 1').waitFor();
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
