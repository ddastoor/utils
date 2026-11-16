// Test fixture for the Photo Dictionary: tests/fixtures/images/book-page.jpg — an original paragraph (CC0, written for
// this project) set in Literata (OFL) like a printed page, then "photographed": slight tilt and keystone, uneven light,
// a shadow, lens softness, sensor noise and JPEG compression. Deterministic (fixed noise seed).
//   node scripts/make-page-photo.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const font = readFileSync(join(root, 'node_modules/@fontsource/literata/files/literata-latin-400-normal.woff2')).toString('base64');
export const PAGE_LINES = [
  'In the crepuscular light of the old library, the perspicacious',
  'archivist, ever punctilious about every detail, catalogued the lugu-',
  'brious letters of an obsequious courtier. His sesquipedalian prose',
  'was full of pusillanimous excuses and recalcitrant grievances, yet',
  'one ebullient note, written by Thaddeus at midnight, described the',
  'geese that had wandered, quite magnanimously, into the scriptorium.',
  'The archivist found the whole collection quixotic; she laughed at',
  "the courtier's inveterate sycophancy and called him a snollygoster,",
  'a mumpsimus and, worst of all, a quidnunc. Then she closed the box',
  'and went home through the quiet streets of the town.',
];
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Lit; src: url(data:font/woff2;base64,${font}) format('woff2'); }
html, body { margin: 0; background: #f3eee2; }
.page { width: 1600px; height: 1100px; box-sizing: border-box; padding: 110px 120px; font: 31px/1.62 Lit, serif; color: #1d1b18; }
.folio { margin-top: 40px; text-align: center; font-size: 22px; color: #555; }
</style><div class="page">${PAGE_LINES.map((l) => `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('')}<div class="folio">— 42 —</div></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const shot = (await page.screenshot({ type: 'png' })).toString('base64');
const jpeg = await page.evaluate(async (b64) => {
  const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
  const W = 1800, H = 1300, c = new OffscreenCanvas(W, H), g = c.getContext('2d');
  // table under the page
  g.fillStyle = '#6b5a48'; g.fillRect(0, 0, W, H);
  // keystone (top edge narrower) by drawing the page row by row, then a small rotation
  const tmp = new OffscreenCanvas(W, H), t = tmp.getContext('2d');
  for (let y = 0; y < bmp.height; y++) {
    const k = 0.955 + 0.045 * (y / bmp.height), w = bmp.width * k;
    t.drawImage(bmp, 0, y, bmp.width, 1, (W - w) / 2, 90 + y, w, 1);
  }
  g.translate(W / 2, H / 2); g.rotate((1.4 * Math.PI) / 180); g.translate(-W / 2, -H / 2);
  g.filter = 'blur(0.8px)'; g.drawImage(tmp, 0, 0); g.filter = 'none';
  g.setTransform(1, 0, 0, 1, 0, 0);
  // uneven light: brighter centre, darker corners, a soft shadow from the left (the phone / a hand)
  const r = g.createRadialGradient(W * 0.55, H * 0.45, 100, W * 0.5, H * 0.5, W * 0.75);
  r.addColorStop(0, 'rgba(255,250,235,0.10)'); r.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = r; g.fillRect(0, 0, W, H);
  const sh = g.createLinearGradient(0, 0, W * 0.35, 0); sh.addColorStop(0, 'rgba(0,0,0,0.30)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  // sensor noise (fixed seed)
  const d = g.getImageData(0, 0, W, H), p = d.data; let s = 12345;
  for (let i = 0; i < p.length; i += 4) { s = (s * 1103515245 + 12345) >>> 0; const n = ((s >>> 16) % 25) - 12; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
  g.putImageData(d, 0, 0);
  const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
  return [...new Uint8Array(await b.arrayBuffer())];
}, shot);
await browser.close();
writeFileSync(join(root, 'tests/fixtures/images/book-page.jpg'), Buffer.from(jpeg));
console.log(`book-page.jpg: ${jpeg.length} bytes`);
