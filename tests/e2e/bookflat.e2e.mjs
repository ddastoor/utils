// Book Page Flattener (#/bookflat): photos of an open book (tests/fixtures/books/, made by scripts/make-book-photos.py with
// their ground truth) → the pages found and flattened in the browser (imgproc.wasm's p_book_fit / p_book_render) →
// the saved pages measured in Node: lines straight across the page (each text line's height in eight strips across it,
// a straight line through them taken off — what is left is its bend, in line spacings), a page's shape, the PDF read back
// by MuPDF. Also: two photos in order and moved, one page / two pages, a photo held sideways, a photo without print,
// the engine fetched only with the first photo, leaving the tab, the phone.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { imageInfo } from '../lib/imgcheck.mjs';
import { phoneLayout } from './_phone.mjs';
const BK = (n) => fileURLToPath(new URL(`../fixtures/books/${n}`, import.meta.url));
const IMG = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));

/** How straight a page's lines are: the text block cut into 3 bands and 8 strips; in each band each strip's row profile of
 *  ink matched to its neighbour's (the shift that lines them up), chained across; after the straight line through them is
 *  taken off, the largest spread — in line spacings (0: straight). And the slope of the lines (degrees). */
function straightness({ data, width: W, height: H }) {
  const ink = new Uint8Array(W * H); let sum = 0;
  for (let i = 0; i < W * H; i++) { const l = 0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2]; sum += l; }
  const mean = sum / (W * H);
  for (let i = 0; i < W * H; i++) { const l = 0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2]; ink[i] = l < mean - 60 ? 1 : 0; }
  const rows = new Float64Array(H), cols = new Float64Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) { rows[y]++; cols[x]++; }
  const span = (p, q = 0.02) => { const tot = p.reduce((a, b) => a + b, 0); let c = 0, a = 0, b = p.length - 1; for (let i = 0; i < p.length; i++) { c += p[i]; if (c >= q * tot) { a = i; break; } } c = 0; for (let i = p.length - 1; i >= 0; i--) { c += p[i]; if (c >= q * tot) { b = i; break; } } return [a, b]; };
  const [x0, x1] = span(cols), [y0, y1] = span(rows), S = 8, Bn = 3;
  const prof = (ya, yb, xa, xb) => { const p = new Float64Array(yb - ya); for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) p[y - ya] += ink[y * W + x]; const m = p.reduce((a, b) => a + b, 0) / p.length; return p.map((v) => v - m); };
  // the line spacing: the first peak of the middle strips' autocorrelation
  const mid = prof(y0, y1, x0 + Math.floor((x1 - x0) * 3 / 8), x0 + Math.floor((x1 - x0) * 5 / 8));
  let pitch = 0, bestAc = -Infinity;
  for (let d = 8; d < Math.min(200, mid.length / 3); d++) { let s = 0; for (let i = 0; i + d < mid.length; i++) s += mid[i] * mid[i + d]; if (s > bestAc) { bestAc = s; pitch = d; } }
  let bend = 0; const slopes = [];
  for (let b = 0; b < Bn; b++) {
    const ya = Math.max(0, Math.round(y0 + (y1 - y0) * b / Bn) - pitch), yb = Math.min(H, Math.round(y0 + (y1 - y0) * (b + 1) / Bn) + pitch);
    const ps = []; for (let i = 0; i < S; i++) ps.push(prof(ya, yb, Math.round(x0 + (x1 - x0) * i / S), Math.round(x0 + (x1 - x0) * (i + 1) / S)));
    const off = [0];
    for (let i = 1; i < S; i++) {
      const p = ps[i - 1], q = ps[i], r = Math.round(pitch * 0.45); let best = -Infinity, bd = 0;
      for (let d = -r; d <= r; d++) { let v = 0; for (let k = Math.max(0, -d); k < p.length && k + d < q.length; k++) if (k + d >= 0) v += p[k + d] * q[k]; if (v > best) { best = v; bd = d; } }
      off.push(off[i - 1] - bd);
    }
    const cx = off.map((_, i) => x0 + (x1 - x0) * (i + 0.5) / S), n = S, mxx = cx.reduce((a, b) => a + b) / n, my = off.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (cx[i] - mxx) * (off[i] - my); sxx += (cx[i] - mxx) ** 2; }
    const k = sxy / sxx, res = off.map((v, i) => v - (my + k * (cx[i] - mxx)));
    bend = Math.max(bend, (Math.max(...res) - Math.min(...res)) / pitch); slopes.push((Math.atan(k) * 180) / Math.PI);
  }
  return { bend, slope: slopes.reduce((a, b) => a + b) / slopes.length, pitch };
}

/** How the text block's margins lean (degrees; 0: upright): in six bands down the page, where the rows of ink start (their
 *  10th percentile — an indent or a short line does not move it) and end (the 90th); a straight line through each. A page
 *  flattened with the wrong lens keeps a keystone: its outer margin leans. */
function margins({ data, width: W, height: H }) {
  const lum = (i) => 0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2];
  let sum = 0; for (let i = 0; i < W * H; i++) sum += lum(i); const mean = sum / (W * H);
  const first = new Float64Array(H).fill(NaN), last = new Float64Array(H).fill(NaN);
  for (let y = 0; y < H; y++) { let n = 0, a = -1, b = -1; for (let x = 0; x < W; x++) if (lum(y * W + x) < mean - 60) { n++; if (a < 0) a = x; b = x; } if (n >= 3) { first[y] = a; last[y] = b; } }
  const rows = [...first.keys()].filter((y) => !isNaN(first[y]));
  const y0 = rows[Math.floor(rows.length * 0.05)], y1 = rows[Math.floor(rows.length * 0.95)], L = [], R = [];
  for (let b = 0; b < 6; b++) {
    const ya = y0 + ((y1 - y0) * b) / 6, yb = y0 + ((y1 - y0) * (b + 1)) / 6, f = [], l = [];
    for (const y of rows) if (y >= ya && y < yb) { f.push(first[y]); l.push(last[y]); }
    f.sort((p, q) => p - q); l.sort((p, q) => p - q);
    if (f.length > 5) { L.push([(ya + yb) / 2, f[Math.floor(f.length * 0.1)]]); R.push([(ya + yb) / 2, l[Math.floor(l.length * 0.9)]]); }
  }
  const lean = (P) => { const n = P.length, my = P.reduce((a, p) => a + p[0], 0) / n, mx = P.reduce((a, p) => a + p[1], 0) / n; let sxy = 0, syy = 0; for (const [y, x] of P) { sxy += (y - my) * (x - mx); syy += (y - my) ** 2; } return (Math.atan(sxy / syy) * 180) / Math.PI; };
  return { left: lean(L), right: lean(R) };
}

export default async ({ base, page: newPage, ok, info, download, devices, released }) => {
  const mupdf = await import('mupdf');
  const jpeg = await import(pathToFileURL(root + 'node_modules/@jsquash/jpeg/decode.js').href);
  await jpeg.init(await WebAssembly.compile(readFileSync(root + 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')));
  const decode = async (path) => { const d = await jpeg.default(readFileSync(path)); return { data: d.data, width: d.width, height: d.height }; };
  const page = await newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(base + '#/bookflat');
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  ok(!requests.some((u) => /imgproc[^/]*\.wasm|imgproc\.worker/.test(u)), 'nothing of the engine (imgproc.wasm, its worker) is fetched before a photo is chosen');
  const body = () => page.locator('.tool-body').innerText();
  const thumbs = (n) => page.waitForFunction((k) => document.querySelectorAll('.scan-thumb').length === k && [...document.querySelectorAll('.scan-thumb')].every((b) => b.querySelector('img')), n, { timeout: 90000 });

  // ---- a spread: two pages, left then right; the line says so; the photo shows what was found
  await page.locator('input[type=file]').setInputFiles(BK('spread.jpg'));
  await thumbs(2);
  ok(requests.some((u) => /imgproc[^/]*\.wasm/.test(u)) && requests.every((u) => u.startsWith(base) || /^(data|blob):/.test(u)), 'the engine is fetched from this site with the first photo, nothing from elsewhere');
  let t = await body();
  ok(/Photo 1 of 1 · spread\.jpg · two pages · \d+ lines/.test(t), `the line names the photo and what was found: "${t.match(/Photo 1 of 1[^\n]*/)?.[0]}"`);
  ok(await page.getByRole('radio', { name: 'Left page' }).count() === 1 && await page.getByRole('radio', { name: 'Right page' }).count() === 1, 'a spread: the left and the right page to look at');
  ok(await page.getByRole('button', { name: /^Page 1: left page of spread\.jpg$/ }).count() === 1 && await page.getByRole('button', { name: /^Page 2: right page of spread\.jpg$/ }).count() === 1, 'the pages in order, each named');
  const overlay = await page.locator('canvas[aria-label^="The photo"]').evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let orange = 0, green = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i] > 170 && d[i + 1] > 40 && d[i + 1] < 100 && d[i + 2] < 40) orange++; if (d[i] < 40 && d[i + 1] > 110 && d[i + 2] > 60 && d[i + 2] < 120) green++; }
    return { orange, green };
  });
  ok(overlay.orange > 200 && overlay.green > 200, `the photo shows the lines found on each page (left ${overlay.orange}, right ${overlay.green} pixels of their dots)`);

  // ---- saved as JPEGs: two pages, each a page's shape, the lines straight
  await page.getByRole('radio', { name: 'Original' }).click();
  await page.getByRole('button', { name: 'Save JPGs' }).click();
  await page.waitForFunction(() => /2 JPEGs ready below/.test(document.querySelector('.tool-body').innerText), null, { timeout: 120000 });
  const files = [];
  for (const name of ['book-page-01.jpg', 'book-page-02.jpg']) files.push(await download(page, () => page.getByRole('button', { name: `Save ${name}` }).click()));
  for (const [i, f] of files.entries()) {
    const im = imageInfo(f), px = await decode(f), s = straightness(px);
    // at the photo's own resolution: a page of this spread takes about 560 – 780 of the photo's 1,600 pixels across
    ok(im.type === 'jpeg' && im.height > 1.25 * im.width && im.width >= 450 && im.width <= 900, `page ${i + 1}: a JPEG of a page's shape, at the photo's resolution (${im.width}×${im.height})`);
    ok(s.bend < 0.2 && Math.abs(s.slope) < 0.6, `page ${i + 1}: its lines run straight across (bent by ${s.bend.toFixed(2)} of a line spacing, sloping ${s.slope.toFixed(2)}°; line spacing ${s.pitch} px)`);
    const m = margins(px);
    ok(Math.abs(m.left) < 0.8 && Math.abs(m.right) < 0.8, `page ${i + 1}: its margins stand upright (leaning ${m.left.toFixed(2)}° / ${m.right.toFixed(2)}°)`);
  }

  // ---- a second photo: one page; three pages in order; the photos moved
  await page.locator('input[type=file]').setInputFiles(BK('page.jpg'));
  await thumbs(3);
  t = await body();
  ok(/Photo 2 of 2 · page\.jpg · one page · \d+ lines/.test(t) && await page.getByRole('radio', { name: 'Left page' }).isHidden(), 'one page: said, and no left / right to choose');
  await page.getByRole('button', { name: 'Move this photo earlier' }).click();
  ok(await page.getByRole('button', { name: /^Page 1: page of page\.jpg$/ }).count() === 1 && await page.getByRole('button', { name: /^Page 3: right page of spread\.jpg$/ }).count() === 1, 'the photo moved earlier: its page comes first');

  // ---- the PDF: three pages, each the shape of its page ("Fit to page"), read back by MuPDF
  const pdfPath = await download(page, () => page.getByRole('button', { name: 'Save PDF' }).click());
  const doc = mupdf.Document.openDocument(readFileSync(pdfPath), 'application/pdf');
  ok(doc.countPages() === 3, `the PDF has the three pages (${doc.countPages()})`);
  const shapes = [0, 1, 2].map((i) => { const [, , w, h] = doc.loadPage(i).getBounds(); return [w, h]; });
  ok(shapes.every(([w, h]) => Math.abs(Math.max(w, h) - 841.89) < 1 && h > 1.25 * w), `"Fit to page": each PDF page the shape of its book page, A4's length (${shapes.map(([w, h]) => `${w.toFixed(0)}×${h.toFixed(0)}`).join(', ')} pt)`);
  ok(/PDF: 3 pages, [\d.,]+ (KB|MB)/.test(await body()), 'the PDF\'s pages and size are said');

  // ---- the number of pages in a photo, by hand
  await page.getByRole('button', { name: /^Page 2: left page of spread\.jpg$/ }).click();
  await page.getByRole('radio', { name: 'One page' }).click();
  await page.waitForFunction(() => /spread\.jpg · one page/.test(document.querySelector('.tool-body').innerText), null, { timeout: 60000 });
  await thumbs(2);
  ok(true, '"One page" on the spread: the spread as one page (two pages in all)');
  await page.getByRole('radio', { name: 'Find out' }).click();
  await page.waitForFunction(() => /spread\.jpg · two pages/.test(document.querySelector('.tool-body').innerText), null, { timeout: 60000 });
  await thumbs(3);
  ok(true, '"Find out": two pages again');

  // ---- turned by hand a quarter and back: the same two pages
  await page.getByRole('button', { name: 'Turn the photo a quarter to the right' }).click();
  await page.waitForFunction(() => /spread\.jpg · [^\n]*turned a quarter to the right/.test(document.querySelector('.tool-body').innerText), null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Turn the photo a quarter to the left' }).click();
  await page.waitForFunction(() => { const s = document.querySelector('.tool-body').innerText; return /spread\.jpg · two pages · \d+ lines\n/.test(s + '\n') && !/spread\.jpg[^\n]*turned/.test(s); }, null, { timeout: 60000 });
  ok(true, 'turned a quarter by hand and back: two pages, upright');

  // ---- a photo taken sideways (the thick book's spread turned a quarter): found the right way up
  const sideways = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(bmp.height, bmp.width), g = c.getContext('2d');
    g.translate(0, bmp.width); g.rotate(-Math.PI / 2); g.drawImage(bmp, 0, 0); // a quarter to the left
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  }, readFileSync(BK('thick.jpg')).toString('base64'));
  await page.locator('input[type=file]').setInputFiles({ name: 'sideways.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(sideways, 'base64') });
  await thumbs(5);
  t = await body();
  ok(/Photo 3 of 3 · sideways\.jpg · two pages · \d+ lines · turned a quarter to the right/.test(t), `held sideways: turned a quarter, two pages ("${t.match(/Photo 3 of 3[^\n]*/)?.[0]}")`);

  // ---- a photo without print: said, no page, and the others are saved as before
  await page.locator('input[type=file]').setInputFiles(IMG('coffee.jpg'));
  await page.waitForFunction(() => /Photo 4 of 4 · coffee\.jpg · no lines of text found/.test(document.querySelector('.tool-body').innerText), null, { timeout: 90000 });
  ok(await page.locator('.toast', { hasText: 'No lines of print were found in this photo' }).count() >= 1 && await page.locator('.err-text', { hasText: 'No lines of print were found' }).isVisible(), 'a photo without print: said, under the photo too');
  ok(await page.locator('.scan-thumb').count() === 5, 'it adds no page');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // ---- the lens: a photo taken with a phone's 2× camera says so (52 mm) and is flattened with it; the same photo without
  // its EXIF (sent through a chat app) is taken as the main camera's — its pages come out skewed —, until the zoom is chosen
  const flatCanvas = page.locator('canvas[aria-label="The page flattened"]');
  const shown = (v) => page.waitForSelector(`canvas[aria-label="The page flattened"][data-shown="${v}"]`, { timeout: 90000 });
  const grab = async () => { const u = await flatCanvas.evaluate((c) => c.toDataURL('image/jpeg', 0.95)); const d = await jpeg.default(Buffer.from(u.split(',')[1], 'base64')); return { data: d.data, width: d.width, height: d.height }; };
  const keep = (k) => flatCanvas.evaluate((c, k) => { window[k] = c.getContext('2d').getImageData(0, 0, c.width, c.height); }, k);
  const apart = (k) => flatCanvas.evaluate((c, k) => { const a = window[k], b = c.getContext('2d').getImageData(0, 0, c.width, c.height); if (a.width !== b.width || a.height !== b.height) return 255; let s = 0; for (let i = 0; i < a.data.length; i += 4) s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); return s / (3 * a.width * a.height); }, k);
  const lensBox = page.getByLabel('Camera lens');
  await page.locator('input[type=file]').setInputFiles(BK('tele.jpg'));
  await thumbs(7); await shown('tele.jpg|left|exif');
  ok(await lensBox.inputValue() === 'exif' && /As the photo says \(52 mm\)/.test(await lensBox.locator('option:checked').innerText()), 'a zoomed photo: the lens it says (52 mm) is taken');
  const own = await grab(), sOwn = straightness(own), mOwn = margins(own); await keep('__own');
  const raw = readFileSync(BK('tele.jpg'));
  const noExif = (b) => { // the JPEG without its EXIF block (APP1 "Exif")
    const out = [b.subarray(0, 2)]; let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff && b[i + 1] !== 0xda) { const n = b.readUInt16BE(i + 2); if (!(b[i + 1] === 0xe1 && b.toString('latin1', i + 4, i + 8) === 'Exif')) out.push(b.subarray(i, i + 2 + n)); i += 2 + n; }
    out.push(b.subarray(i)); return Buffer.concat(out);
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'tele-noexif.jpg', mimeType: 'image/jpeg', buffer: noExif(raw) });
  await thumbs(9); await shown('tele-noexif.jpg|left|26');
  ok(await lensBox.inputValue() === '26' && await lensBox.locator('option[value=exif]').count() === 0, 'the same photo without its EXIF: the main camera is taken, and "as the photo says" is not offered');
  const mMain = margins(await grab());
  ok(await apart('__own') > 3, `flattened as the main camera's, the page comes out otherwise (${(await apart('__own')).toFixed(1)} of 255 apart on average)`);
  await lensBox.selectOption('52');
  await shown('tele-noexif.jpg|left|52');
  const d52 = await apart('__own');
  ok(d52 < 0.5, `"Zoom 2× (about 52 mm)" chosen: the page the photo's own lens gave (${d52.toFixed(2)} of 255 apart)`);
  const worst = (m) => Math.max(Math.abs(m.left), Math.abs(m.right));
  ok(sOwn.bend < 0.2 && Math.abs(sOwn.slope) < 0.6 && worst(mOwn) < 0.6, `with its lens: the lines straight (bent ${sOwn.bend.toFixed(2)} of a line spacing) and the margins upright (leaning ${mOwn.left.toFixed(2)}° / ${mOwn.right.toFixed(2)}°)`);
  ok(worst(mMain) > 2, `as the main camera's: the page keeps a keystone — its margins lean ${mMain.left.toFixed(2)}° / ${mMain.right.toFixed(2)}°`);

  // ---- leaving the tab lets go of what it made (the results' blob URLs)
  { const kept = await released(page, 'bookflat');
    ok(kept.length === 0, `leaving the tab: the blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }

  // ---- the phone: the back camera in the page, photos already taken, no sideways scroll, a page found
  const phone = await phoneLayout({ base, page: newPage, devices, ok }, 'bookflat', { buttons: ['Use camera'] });
  ok(await phone.locator('input[type=file][capture]').count() === 0 && await phone.locator('input[type=file][multiple]').count() === 1, 'phone: "Choose photos" picks photos already taken (no camera forced)');
  await phone.locator('input[type=file]').setInputFiles(BK('page.jpg'));
  await phone.waitForSelector('.scan-thumb img', { timeout: 90000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: a page found, no horizontal scroll');
  ok(phone.errors.length === 0, `phone: no errors: ${phone.errors.join(' | ')}`);
};
