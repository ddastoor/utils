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
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'sig.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.waitForTimeout(800);
  ok(sigImages(await save()).some((x) => x.smask), 'signature from a photo: paper removed (transparent)');
  // every page
  await page.locator('input[type=file]').first().setInputFiles(P('two-different-pages.pdf'));
  await page.getByText('Page 1 of 2').waitFor();
  await page.getByText('Put it on every page (initials)').click();
  const f5 = await save(), base5 = [await renderGrey(P('two-different-pages.pdf'), 0, 1), await renderGrey(P('two-different-pages.pdf'), 1, 1)];
  const out5 = [await renderGrey(f5, 0, 1), await renderGrey(f5, 1, 1)];
  ok(out5.every((g, i) => g.dark(0, 0, 1, 1, 200) > base5[i].dark(0, 0, 1, 1, 200) + 0.001), 'signature on both pages');
  const real = page.errors.filter((e) => !/Make your signature first/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-sign');
  await phone.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await phone.getByText('Page 1 of 1').waitFor();
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
