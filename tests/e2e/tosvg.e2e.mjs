// Image to SVG (#/tosvg, PC + phones; potentials #1) end to end, on the pictures of scripts/make-vector-fixtures.py
// (tests/fixtures/vector: what each was drawn from is known): nothing of the engines fetched before a picture; a logo traced in
// colour — the SVG downloaded, drawn by librsvg (rsvg-convert, `apt install librsvg2-bin`) and every pixel inside its shapes in
// the colour it was drawn in; "Copy SVG code" gives the same text; "Save PNG" at twice the size; pixel art traced as pixels gives
// every pixel back; a signature photographed on paper lit unevenly, in black and white with "a photo of paper", overlaps the
// stroke as it was drawn; the ink colour; a picture chosen in one kind traced at the other kind's size when the kind changes;
// a file that is no picture; leaving the tab lets the SVGs go; WCAG 2.2 A / AA in both themes; the phone.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from '../lib/child.mjs';
import { readPng, writePng } from '../lib/png.mjs';
import { phoneLayout } from './_phone.mjs';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const FX = (n) => fileURLToPath(new URL(`../fixtures/vector/${n}`, import.meta.url));
const rsvg = (() => { for (const d of (process.env.PATH || '').split(delimiter)) { const p = join(d, 'rsvg-convert'); if (d && existsSync(p)) return p; } return null; })();

export default async (ctx) => {
  const { base, page: newPage, ok, download, tmp, released } = ctx;
  const truth = JSON.parse(readFileSync(FX('truth.json'), 'utf8'));
  /** an SVG file drawn by librsvg at w × h on white */
  const render = (file, w, h) => { const o = join(tmp, `tosvg-${Date.now()}-${Math.random().toString(36).slice(2)}.png`); execFileSync(rsvg, ['-w', String(w), '-h', String(h), '-b', 'white', '-o', o, file]); return readPng(readFileSync(o)); };
  const page = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = [];
  page.on('request', (r) => { const u = r.url(); if (/vtracer|vector\.worker|potrace|imgproc[^/]*\.wasm/.test(u)) asked.push(u.replace(/^.*\//, '')); });
  await page.goto(`${base}#/tosvg`);
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  await page.waitForTimeout(500);
  ok(!asked.length, `nothing of the engines (VTracer, Potrace, imgproc, the worker) is fetched before a picture is chosen (${asked.join(', ')})`);
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const radio = (name) => page.getByRole('radio', { name, exact: true });
  const stats = () => page.locator('.ts-stats').textContent();
  /** wait until a new tracing has been shown (its status line says how long it took) */
  const traced = async (prev = '') => {
    await page.waitForFunction((p) => { const s = document.querySelector('.ts-status')?.textContent || ''; return /^Traced in/.test(s) && document.querySelector('.ts-svg') && s + document.querySelector('.ts-svg').src !== p; }, prev, { timeout: 60000 });
    return page.evaluate(() => document.querySelector('.ts-status').textContent + document.querySelector('.ts-svg').src);
  };

  // ---------------------------------------------------------------- a logo in colour
  await page.locator('input[type=file]').first().setInputFiles(FX('logo.png'));
  let mark = await traced();
  ok(/vtracer/.test(asked.join(' ')) && !/potrace/i.test(asked.join(' ')), `the first picture fetches the colour tracer (VTracer) and not Potrace (${asked.join(', ')})`);
  ok(/^\d+ shapes · .* · 640 × 400$/.test(await stats()), `the line under the SVG: its shapes, its size and the picture's (${await stats()})`);
  const svgPath = await download(page, () => btn('Download SVG').click());
  ok(/logo\.svg$/.test(svgPath), `the SVG is named after the picture (${svgPath.replace(/^.*\//, '').replace(/^\d+-/, '')})`);
  const svgText = readFileSync(svgPath, 'utf8');
  ok(/^<\?xml|^<svg/.test(svgText) && /width="640"/.test(svgText) && /height="400"/.test(svgText), 'an SVG document of the picture\'s size');
  await btn('Copy SVG code').click();
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'); // (Windows: \r\n on the clipboard)
  ok(copied === svgText, `"Copy SVG code" puts the same SVG on the clipboard (${copied.length} characters)`);
  if (!rsvg) ok(true, 'NOTE: rsvg-convert was not found (apt install librsvg2-bin) — the SVGs were not drawn here');
  else {
    const [W, H] = truth.logo.size, cols = truth.logo.colours, logo = readPng(readFileSync(FX('logo.png'))), r = render(svgPath, W, H);
    const near = (d, i) => { let b = 0, bd = 1e9; for (let k = 0; k < cols.length; k++) { const e = (d[i] - cols[k][0]) ** 2 + (d[i + 1] - cols[k][1]) ** 2 + (d[i + 2] - cols[k][2]) ** 2; if (e < bd) { bd = e; b = k; } } return b; };
    const lab = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) lab[i] = near(logo.data, i * 4);
    let inner = 0, same = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (lab[(y + dy) * W + x + dx] !== lab[i]) { edge = true; break; }
      if (!edge) { inner++; same += lab[i] === near(r.data, i * 4); }
    }
    ok(same / inner >= 0.999, `the downloaded SVG, drawn by librsvg: ${(100 * same / inner).toFixed(3)} % of the pixels inside the logo's shapes in the colour they were drawn in`);
  }
  const pngPath = await download(page, () => btn('Save PNG').click());
  const png = readPng(readFileSync(pngPath));
  ok(png.width === 1280 && png.height === 800 && /logo\.png$/.test(pngPath), `"Save PNG" at twice the size by default: ${png.width} × ${png.height}, logo.png`);
  {
    const at = (x, y) => Array.from(png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3));
    ok(JSON.stringify(at(300, 400)) === JSON.stringify(truth.logo.colours[1]) && JSON.stringify(at(770, 300)) === JSON.stringify(truth.logo.colours[2]),
      `… the red disc and the blue square in their colours in the PNG (${at(300, 400)}, ${at(770, 300)})`);
  }

  // ---------------------------------------------------------------- pixel art, as pixels
  await page.locator('input[type=file]').first().setInputFiles(FX('pixel.png'));
  mark = await traced(mark);
  await radio('Pixel art').click();
  mark = await traced(mark);
  ok(await radio('Pixels').getAttribute('aria-checked') === 'true', 'the Pixel art kind traces the pixels\' own edges');
  if (rsvg) {
    const p = await download(page, () => btn('Download SVG').click()), pix = readPng(readFileSync(FX('pixel.png'))), r = render(p, 240, 240);
    let good = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const i = (y * 24 + x) * 4, j = ((y * 10 + 5) * 240 + x * 10 + 5) * 4;
      good += pix.data[i] === r.data[j] && pix.data[i + 1] === r.data[j + 1] && pix.data[i + 2] === r.data[j + 2];
    }
    ok(good === 576, `pixel art drawn ten times as large: ${good} of the 576 pixels in their own colour`);
  }
  await radio('Logo').click();
  mark = await traced(mark);

  // ---------------------------------------------------------------- a signature, black and white
  await radio('Black and white').click();
  await page.locator('input[type=file]').first().setInputFiles(FX('signature.jpg'));
  mark = await traced(mark);
  ok(/threshold \d+ \(found by Otsu’s method\)/.test(await stats()), `Otsu's threshold is said (${await stats()})`);
  const otsuPath = await download(page, () => btn('Download SVG').click());
  ok(/scale\(0\.100000,-0\.100000\)/.test(readFileSync(otsuPath, 'utf8')), 'black and white is traced by Potrace (its SVG, in tenths of a pixel)');
  await page.locator('label.switch', { hasText: 'A photo of paper' }).click();
  mark = await traced(mark);
  ok(!/threshold/.test(await stats()), 'with "a photo of paper" no threshold is said (the ink is found however the light falls)');
  const sigPath = await download(page, () => btn('Download SVG').click());
  if (rsvg) {
    const [W, H] = truth.signature.size, mask = readPng(readFileSync(FX('signature-mask.png')));
    const iou = (f) => { const r = render(f, W, H); let both = 0, any = 0; for (let i = 0; i < W * H; i++) { const a = mask.data[i * 4] >= 128, b = r.data[i * 4] < 128; both += a && b; any += a || b; } return both / any; };
    const a = iou(sigPath), b = iou(otsuPath);
    ok(a >= 0.85 && a > b, `the signature photographed on paper lit unevenly: the traced ink overlaps the stroke as drawn by ${(100 * a).toFixed(1)} % (Otsu's one threshold: ${(100 * b).toFixed(1)} % — the shadow turns to ink)`);
  }
  await page.locator('.ts-ink').evaluate((el) => { el.value = '#1d4ed8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  mark = await traced(mark);
  const blue = readFileSync(await download(page, () => btn('Download SVG').click()), 'utf8');
  ok(/fill="#1d4ed8"/.test(blue) && !/fill="#000000"/.test(blue), 'the ink colour chosen is the SVG\'s fill');

  // ---------------------------------------------------------------- each kind at its own size
  {
    const W = 3200, H = 2000, d = new Uint8ClampedArray(W * H * 4).fill(255);
    for (let y = 600; y < 1400; y++) for (let x = 900; x < 2300; x++) { const i = (y * W + x) * 4; d[i] = 20; d[i + 1] = 30; d[i + 2] = 200; }
    const f = join(tmp, 'big-poster.png'); writeFileSync(f, writePng({ width: W, height: H, data: d }));
    await page.locator('input[type=file]').first().setInputFiles(f);
    mark = await traced(mark);
    const bwSize = await stats();
    await radio('Colour').click();
    mark = await traced(mark);
    const colSize = await stats();
    ok(/3000 × 1875$/.test(bwSize) && /1600 × 1000$/.test(colSize), `a 3,200 × 2,000 picture chosen in black and white is traced at 3,000 px, and at 1,600 px once the kind is colour (${bwSize.replace(/^.* · /, '')}, ${colSize.replace(/^.* · /, '')})`);
  }

  // ---------------------------------------------------------------- a file that is no picture
  {
    const f = join(tmp, 'notes.png'); writeFileSync(f, 'these are not pixels');
    await page.locator('input[type=file]').first().setInputFiles(f);
    await page.waitForTimeout(1500);
    ok(!page.errors.length, `a file that is no picture breaks nothing (${page.errors.join(' | ')})`);
  }
  // ---------------------------------------------------------------- leaving lets the SVGs go
  const kept = await released(page, 'tosvg');
  ok(!kept.length, `leaving the tab lets its SVGs go (${kept.length} kept)`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.close();

  // ---------------------------------------------------------------- WCAG 2.2 A / AA, both themes
  for (const scheme of ['light', 'dark']) {
    const ax = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await ax.goto(`${base}#/tosvg`);
    await ax.waitForSelector('input[type=file]', { state: 'attached' });
    await ax.locator('input[type=file]').first().setInputFiles(FX('logo.png'));
    await ax.waitForSelector('.ts-svg', { timeout: 60000 });
    await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations with a picture traced ${vv.join(' | ')}`);
    await ax.close();
  }

  // ---------------------------------------------------------------- the phone
  const ph = await phoneLayout(ctx, 'tosvg', { ready: '.drop', before: async (p) => {
    await p.locator('input[type=file]').first().setInputFiles(FX('logo.png'));
    await p.waitForSelector('.ts-svg', { timeout: 60000 });
  } });
  const bar = await ph.locator('.actions').getByRole('button', { name: 'Download SVG' }).boundingBox();
  ok(bar && bar.height >= 44, `phone: "Download SVG" in the fixed bar, ${bar && Math.round(bar.height)} px tall`);
  await ph.close();
};
