// Screenshot Annotator & How-To Guide (potentials #113): a test picture of known pixels (made here: white, a black bar, a
// checkerboard standing for a password) is marked with the mouse — an arrow, a box, a circle, two step markers, a text
// label, the highlighter, a hidden area — and every saved PNG is read back here (tests/lib/png.mjs, not the page's
// decoder): the marks where they were drawn, the hidden area burnt into the pixels (pixelated: no square of the
// checkerboard left; Solid; blurred), nothing else changed. Then: choosing, moving and deleting a mark; the keyboard;
// colour and size; undo and redo; a crop; JPEG; Copy; a second picture pasted; captions and the title → the guide as a
// PDF (read back by MuPDF) and as one tall picture; step markers numbered on from picture to picture; the strip (move,
// remove, undo); the pictures kept through another tab; the phone (taps); WCAG 2.2 in both themes; nothing fetched
// before a picture and no blob URL kept after the tab.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from '../lib/png.mjs';
import { pdfInfo, renderGrey } from '../lib/pdfcheck.mjs';
import { phoneLayout } from './_phone.mjs';

const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const W = 800, H = 500;
/** the test picture: white; a black bar at y 446 – 453 (x 90 – 309); a checkerboard of 4-pixel squares at x 500 – 699, y 380 – 439 */
function picture() {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (y >= 446 && y < 454 && x >= 90 && x < 310) data[i] = data[i + 1] = data[i + 2] = 0;
    if (x >= 500 && x < 700 && y >= 380 && y < 440 && ((x >> 2) + (y >> 2)) % 2) data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return { width: W, height: H, data };
}
/** the second picture: a phone's shape, light grey with a dark panel */
function picture2() {
  const w = 600, hh = 900, data = new Uint8ClampedArray(w * hh * 4).fill(232);
  for (let y = 300; y < 600; y++) for (let x = 100; x < 500; x++) { const i = (y * w + x) * 4; data[i] = 40; data[i + 1] = 60; data[i + 2] = 90; }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width: w, height: hh, data };
}
function jpegSize(b) {
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

export default async (ctx) => {
  const { base, page: newPage, ok, download, released, tmp } = ctx;
  const pic1 = join(tmp, 'form.png'), pic2 = join(tmp, 'phone.png');
  writeFileSync(pic1, writePng(picture())); writeFileSync(pic2, writePng(picture2()));
  const orig = picture();
  const page = await newPage({ viewport: { width: 1366, height: 1400 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = [];
  page.on('request', (r) => { const u = r.url(); if (/NotoSans|imgproc[^/]*\.wasm|codec\.worker|mupdf/.test(u)) asked.push(u.replace(/^.*\//, '')); });
  await page.goto(`${base}#/annotate`);
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  await page.waitForTimeout(400);
  ok(!asked.length, `nothing but the tab is fetched before a picture is chosen (${asked.join(', ')})`);

  const btn = (name, p = page) => p.getByRole('button', { name, exact: true });
  const status = (p = page) => p.locator('.an-status').textContent();
  const said = async (re, p = page) => { await p.waitForFunction((s) => new RegExp(s).test(document.querySelector('.an-status')?.textContent || ''), re.source, { timeout: 30000 }).catch(() => {}); return status(p); };
  const canvas = page.locator('.an-canvas');
  /** client coordinates of a picture pixel; `view` = the part of the picture the canvas shows */
  let view = { x: 0, y: 0, w: W, h: H };
  const at = async (x, y) => {
    await canvas.evaluate((c) => c.scrollIntoView({ block: 'center' }));
    const b = await canvas.boundingBox(), k = b.width / view.w;
    return { x: b.x + (x - view.x + 0.5) * k, y: b.y + (y - view.y + 0.5) * k };
  };
  const drag = async ([x0, y0], [x1, y1]) => {
    const a = await at(x0, y0), z = await at(x1, y1);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + ((z.x - a.x) * i) / 10, a.y + ((z.y - a.y) * i) / 10);
    await page.mouse.up(); await page.waitForTimeout(60);
  };
  const click = async (x, y) => { const a = await at(x, y); await page.mouse.click(a.x, a.y); await page.waitForTimeout(60); };
  const tool = async (name) => { await btn(name).click(); await page.waitForTimeout(40); };
  /** the picture saved as PNG, read back */
  const savePng = async () => {
    await page.waitForFunction(() => !document.querySelector('.an-main .busy'), null, { timeout: 60000 });
    const f = await download(page, () => btn('Save picture').click());
    return readPng(readFileSync(f));
  };
  const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
  const red = ([r, g, b]) => r > 170 && g < 110 && b < 110;
  const white = ([r, g, b]) => r > 235 && g > 235 && b > 235;
  const share = (img, x0, y0, x1, y1, f) => { let n = 0, k = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (f(px(img, x, y))) k++; } return k / n; };

  await page.locator('input[type=file]').first().setInputFiles(pic1);
  await page.waitForSelector('.an-canvas', { state: 'visible' });
  await said(/form\.png added/);
  await page.waitForTimeout(300);
  ok(asked.some((u) => /NotoSans_700Bold/.test(u)), `with the first picture, its font (Noto Sans Bold) is fetched (${asked.join(', ')})`);
  ok(!asked.some((u) => /imgproc/.test(u)), 'imgproc.wasm not yet: nothing is hidden');
  ok((await page.locator('.an-item').count()) === 1 && /Step 1/.test(await page.locator('.an-item').first().textContent()), 'the picture is step 1 of the guide');

  // ---------------------------------------------------------------- every mark, drawn with the mouse
  await tool('Arrow'); await drag([100, 100], [300, 200]);
  ok(/Arrow added\. 1 mark on this picture/.test(await status()), `an arrow (${await status()})`);
  await tool('Box'); await drag([400, 80], [600, 200]);
  await tool('Circle'); await drag([620, 60], [780, 180]);
  await tool('Step number'); await click(150, 300);
  ok(/Step marker 1 added/.test(await status()), `step marker 1 (${await status()})`);
  await click(220, 300);
  ok(/Step marker 2 added\. 5 marks/.test(await status()), `step marker 2 (${await status()})`);
  await tool('Text');
  await click(300, 380);
  ok(/Type the text first/.test(await status()), 'the text tool without text asks for it');
  await page.getByLabel('Text to place').fill('Tap Renew');
  await click(300, 380);
  ok(/Text added/.test(await status()), `a text label (${await status()})`);
  await tool('Highlighter'); await drag([100, 450], [300, 450]);
  await tool('Hide'); await drag([500, 380], [700, 440]);
  ok(/Hidden area added\. 8 marks on this picture\. It is burnt into the picture/.test(await said(/Hidden area added/)), `a hidden area (${await status()})`);
  await page.waitForTimeout(400);
  ok(asked.some((u) => /imgproc/.test(u)), 'imgproc.wasm fetched for the hidden area');

  let png = await savePng();
  ok(png.width === W && png.height === H, `saved PNG: the picture's own size (${png.width} × ${png.height})`);
  ok(red(px(png, 200, 150)) && red(px(png, 290, 195)) && white(px(png, 200, 190)), `the arrow from (100, 100) to (300, 200): ${px(png, 200, 150)} on it, ${px(png, 200, 190)} beside it`);
  ok(red(px(png, 500, 80)) && red(px(png, 400, 140)) && red(px(png, 600, 140)) && white(px(png, 500, 140)), `the box: its sides red, its inside as it was (${px(png, 500, 140)})`);
  ok(red(px(png, 620, 120)) && red(px(png, 700, 60)) && white(px(png, 700, 120)), `the circle: its line red, its middle as it was`);
  const disk = (cx, cy) => share(png, cx - 12, cy - 12, cx + 12, cy + 12, red);
  ok(disk(150, 300) > 0.45 && disk(220, 300) > 0.45, `two step markers, red discs (${disk(150, 300).toFixed(2)}, ${disk(220, 300).toFixed(2)})`);
  const digits = (cx, cy) => share(png, cx - 8, cy - 9, cx + 8, cy + 9, white);
  ok(digits(150, 300) > 0.05 && digits(220, 300) > 0.05, 'each with its number in white');
  ok(share(png, 260, 368, 340, 392, red) > 0.4 && share(png, 260, 368, 340, 392, white) > 0.05, 'the text: white letters on a red label');
  const hl = px(png, 200, 442), dark = px(png, 200, 450);
  ok(hl[0] > 235 && hl[1] > 200 && hl[1] < 245 && hl[2] > 100 && hl[2] < 165 && dark.every((v) => v < 60), `the highlighter: yellow over white (${hl}), black text stays black under it (${dark})`);
  // the hidden area: nothing of the checkerboard left
  let bw = 0, grey = 0, n = 0;
  for (let y = 381; y < 439; y++) for (let x = 501; x < 699; x++) { const [r, g, b] = px(png, x, y); n++; if (r < 30 || r > 225) bw++; if (Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1 && r > 85 && r < 170) grey++; }
  ok(bw === 0 && grey === n, `pixelated: no black or white square left in the area (${bw}), every pixel a block's grey (${grey} of ${n})`);
  ok(px(png, 497, 410).join() === [orig.data[(410 * W + 497) * 4], orig.data[(410 * W + 497) * 4 + 1], orig.data[(410 * W + 497) * 4 + 2]].join() && white(px(png, 705, 410)), 'outside the area, the picture as it was');
  // the marks (with their shadows) lie inside these boxes: the arrow, the steps, the label and the highlighter; the box
  // and the circle; the hidden area
  let same = 0, tot = 0; const off = [];
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    if ((x > 80 && x < 372 && y > 80 && y < 470) || (x > 380 && x < 800 && y > 40 && y < 210) || (x > 480 && x < 720 && y > 360 && y < 460)) continue;
    tot++; const i = (y * W + x) * 4; if (png.data[i] === orig.data[i] && png.data[i + 1] === orig.data[i + 1] && png.data[i + 2] === orig.data[i + 2]) same++; else if (off.length < 6) off.push(`${x},${y}`);
  }
  ok(same === tot, `everywhere else, every pixel as it was (${same} of ${tot}; off at ${off.join(' ')})`);

  // the hidden area's other styles (it is the mark chosen), and undo / redo through them
  await page.getByRole('radio', { name: 'Solid', exact: true }).click(); await page.waitForTimeout(300);
  png = await savePng();
  ok(share(png, 500, 380, 700, 440, ([r, g, b]) => r === 17 && g === 17 && b === 17) === 1, 'Solid: every pixel of the area covered (17, 17, 17)');
  await page.getByRole('radio', { name: 'Blur', exact: true }).click(); await page.waitForTimeout(300);
  png = await savePng();
  let step = 0, ext = 0;
  for (let y = 385; y < 436; y++) for (let x = 505; x < 691; x++) { const a = px(png, x, y)[0], b = px(png, x + 4, y)[0]; step = Math.max(step, Math.abs(a - b)); if (a < 60 || a > 200) ext++; }
  ok(step <= 15 && ext === 0, `Blur: the squares gone — side by side they differ by ${step} levels at most (black and white before), every pixel a mid grey`);
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  ok(/Undone/.test(await status()), 'Ctrl+Z: undone');
  png = await savePng();
  ok(share(png, 501, 381, 699, 439, ([r, g]) => r > 85 && r < 170 && Math.abs(r - g) <= 1) === 1 && share(png, 501, 381, 699, 439, ([r]) => r === 17) < 0.5, 'two undos: pixelated again');
  await page.keyboard.press('Control+Shift+z');
  png = await savePng();
  ok(share(png, 500, 380, 700, 440, ([r]) => r === 17) === 1, 'Ctrl+Shift+Z: Solid again');
  await page.keyboard.press('Control+z');

  // ---------------------------------------------------------------- choosing, moving, deleting
  await tool('Select');
  await click(400, 140);
  ok(/Box chosen/.test(await status()) && await btn('Delete').isVisible(), `a press on the box's side chooses it (${await status()})`);
  await drag([450, 80], [450, 180]); // by its top side, away from its handles
  png = await savePng();
  ok(red(px(png, 500, 180)) && white(px(png, 500, 80)), 'dragged 100 pixels down: its top side at y 180');
  await canvas.press('Delete');
  ok(/Box deleted\. 7 marks/.test(await status()), `the Delete key deletes it (${await status()})`);
  png = await savePng();
  ok(white(px(png, 500, 180)) && white(px(png, 400, 240)), 'the box is gone from the picture');
  await click(700, 120); // inside the circle: no line there — the circle's inside
  ok(/Circle chosen/.test(await status()), `a press inside the circle chooses it (${await status()})`);
  await click(50, 480);
  ok(!(await btn('Delete').isVisible()), 'a press where no mark is: nothing chosen');

  // ---------------------------------------------------------------- the keyboard
  await tool('Box');
  await canvas.focus(); await page.keyboard.press('Enter');
  ok(/Box added in the middle/.test(await status()), `Enter adds a box in the middle (${await status()})`);
  await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Delete');
  ok(/Box deleted\. 7 marks/.test(await status()), 'Delete removes it');
  await page.keyboard.press('n');
  ok(/chosen \(1 of 7\)/.test(await status()), `N chooses the first mark (${await status()})`);
  await page.keyboard.press('p');
  ok(/chosen \(7 of 7\)/.test(await status()), `P the one before it — round to the last (${await status()})`);
  await page.keyboard.press('Escape');
  ok(/Nothing chosen/.test(await status()), 'Escape lets it go');

  // ---------------------------------------------------------------- colour and size
  await tool('Arrow');
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  await page.getByRole('radio', { name: 'Thick', exact: true }).click();
  await drag([60, 250], [60, 420]);
  png = await savePng();
  const blue = px(png, 60, 330), edge = px(png, 62, 330);
  ok(blue[2] > 170 && blue[0] < 90 && edge[2] > 170, `a thick blue arrow (${blue}, 2 px off its middle ${edge})`);
  ok((await page.getByRole('button', { name: 'Blue', exact: true }).getAttribute('aria-pressed')) === 'true', 'the swatch chosen is shown pressed');

  // ---------------------------------------------------------------- the text chosen and changed
  await tool('Select'); await click(300, 380);
  ok(/Text chosen/.test(await status()) && (await page.getByLabel('Text to place').inputValue()) === 'Tap Renew', 'the text chosen: its words in the box');
  await page.getByLabel('Text to place').fill('Tap Pay');
  png = await savePng();
  const wTxt = (img) => { let x1 = 0; for (let x = 240; x < 380; x++) if (red(px(img, x, 380))) x1 = x; return x1; };
  ok(wTxt(png) > 300 && wTxt(png) < 345, `changed to "Tap Pay": the label shorter (it ends at x ${wTxt(png)})`);
  await canvas.focus(); await page.keyboard.press('Control+z');

  // ---------------------------------------------------------------- crop
  await tool('Crop');
  await drag([50, 50], [450, 350]);
  await btn('Done').click();
  ok(/Cropped to 400 × 300 pixels/.test(await status()), `cropped (${await status()})`);
  view = { x: 50, y: 50, w: 400, h: 300 };
  png = await savePng();
  ok(png.width === 400 && png.height === 300 && red(px(png, 150, 100)), `saved: 400 × 300, the arrow's middle at (150, 100) (${px(png, 150, 100)})`);
  await tool('Crop'); view = { x: 0, y: 0, w: W, h: H };
  await btn('Whole picture').click(); await btn('Done').click();
  ok(/whole picture is kept/.test(await status()), 'Whole picture: the crop undone');
  png = await savePng();
  ok(png.width === W && png.height === H, 'saved again at its whole size');

  // ---------------------------------------------------------------- JPEG, Copy
  await page.getByRole('radio', { name: 'JPEG', exact: true }).click();
  const jp = readFileSync(await download(page, () => btn('Save picture').click()));
  const js = jpegSize(jp);
  ok(jp[0] === 0xff && jp[1] === 0xd8 && js?.width === W && js?.height === H, `JPEG: ${js && `${js.width} × ${js.height}`}`);
  await page.getByRole('radio', { name: 'PNG', exact: true }).click();
  let clip = null;
  for (let i = 0; i < 4; i++) { // the clipboard is the browser's, shared by the suites beside this one: read again when another wrote in between
    await btn('Copy').click();
    await said(/Copied|refused/);
    clip = await page.evaluate(async () => { try { const it = (await navigator.clipboard.read())[0]; const bm = await createImageBitmap(await it.getType('image/png')); return [bm.width, bm.height]; } catch (e) { return String(e); } });
    if (Array.isArray(clip) && clip[0] === W && clip[1] === H) break;
  }
  ok(Array.isArray(clip) && clip[0] === W && clip[1] === H, `Copy: the picture on the clipboard (${clip})`);

  // ---------------------------------------------------------------- a second picture pasted; the guide
  const b64 = readFileSync(pic2).toString('base64');
  await page.evaluate((b) => { const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'phone.png', { type: 'image/png' })); dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }, b64);
  await said(/phone\.png added — step 2/);
  ok((await page.locator('.an-item').count()) === 2, `pasted: a second picture, step 2 (${await status()})`);
  await page.getByLabel('Caption for step 2').fill('Tap Pay at the bottom');
  await page.locator('.an-pick').first().click();
  await page.getByLabel('Caption for step 1').fill('Open the app and choose the bill');
  await page.getByLabel('Title of the guide').fill('How to pay the bill');
  ok(/Open the app/.test(await page.locator('.an-item').first().textContent()), 'the caption shown in the strip');
  const pdfPath = await download(page, () => btn('Save the guide as PDF (2 steps)').click());
  const info = await pdfInfo(pdfPath);
  const all = info.list.map((x) => x.text).join('\n');
  ok(info.pages === 2 && /How to pay the bill/.test(info.list[0].text) && /Step 1/.test(info.list[0].text) && /Open the app and choose the bill/.test(info.list[0].text), `the PDF: page 1 has the title, step 1 and its caption (${info.pages} pages)`);
  ok(/Step 2/.test(info.list[1]?.text || '') && /Tap Pay at the bottom/.test(info.list[1]?.text || ''), 'page 2: step 2 and its caption — a step never split from its picture');
  ok(info.list.every((p) => p.w === 595 && p.h === 842), 'A4 pages');
  const g1 = await renderGrey(pdfPath, 0, 1), g2 = await renderGrey(pdfPath, 1, 1);
  ok(g1.dark(0.1, 0.12, 0.9, 0.6) > 0.005 && g2.dark(0.15, 0.1, 0.85, 0.9) > 0.05, `each page shows its picture (dark ${g1.dark(0.1, 0.12, 0.9, 0.6).toFixed(3)}, ${g2.dark(0.15, 0.1, 0.85, 0.9).toFixed(3)})`);
  ok(!/Tap Renew/.test(all), 'the marks are in the pictures, not in the text layer');
  const tallPath = await download(page, () => btn('Save as one tall picture').click());
  const tall = readPng(readFileSync(tallPath));
  ok(tall.width === 1080 && tall.height > 1500 && tall.height < 3000, `the tall picture: 1080 px wide, ${tall.height} tall`);
  ok(share(tall, 40, 40, 700, 100, ([r]) => r < 100) > 0.02 && white(px(tall, 5, 5)), 'its title at the top, on white');

  // ---------------------------------------------------------------- step markers numbered on from picture to picture
  await page.locator('.an-pick').nth(1).click();
  view = { x: 0, y: 0, w: 600, h: 900 };
  await tool('Step number'); await click(300, 200);
  ok(/Step marker 1 added/.test(await status()), `on picture 2, its own first marker (${await status()})`);
  await page.getByText('Number the step markers on from picture to picture').click();
  await canvas.focus(); await page.keyboard.press('Enter');
  ok(/Step marker 4 added in the middle/.test(await status()), `numbered on: picture 1 has 2, so picture 2's second is 4 (${await status()})`);
  await page.getByText('Number the step markers on from picture to picture').click();

  // ---------------------------------------------------------------- the strip: move, remove, undo
  await btn('Move step 2 up').click();
  ok(/Tap Pay at the bottom/.test(await page.locator('.an-item').first().textContent()), 'moved up: the phone picture is step 1, its caption with it');
  await btn('Move step 1 down').click();
  await page.getByRole('button', { name: /^Remove step 1/ }).click();
  ok((await page.locator('.an-item').count()) === 1 && /removed — Undo brings it back/.test(await status()), 'removed');
  await page.keyboard.press('Control+z');
  ok((await page.locator('.an-item').count()) === 2 && /Open the app/.test(await page.locator('.an-item').first().textContent()), 'Ctrl+Z: it is back, in its place, with its caption');

  // ---------------------------------------------------------------- zoom
  const w0 = (await canvas.boundingBox()).width;
  await page.getByRole('button', { name: 'Zoom in' }).click(); await page.waitForTimeout(150);
  const w1 = (await canvas.boundingBox()).width;
  await btn('Fit').click(); await page.waitForTimeout(150);
  const w2 = (await canvas.boundingBox()).width;
  ok(w1 > w0 * 1.4 && Math.abs(w2 - w0) < 2, `zoom in and back to fit (${Math.round(w0)} → ${Math.round(w1)} → ${Math.round(w2)} px)`);

  // ---------------------------------------------------------------- another tab and back; nothing kept
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const held = await released(page, 'annotate');
  ok(!held.length, `after the tab, no blob URL is kept (${held.length})`);
  await page.evaluate(() => { location.hash = '#/annotate'; });
  await page.waitForSelector('.an-item');
  ok((await page.locator('.an-item').count()) === 2, 'back in the tab: the guide\'s two pictures are still there (kept while the page is open)');
  await page.close();

  // ---------------------------------------------------------------- WCAG 2.2 A / AA, both themes, with marks drawn
  for (const scheme of ['light', 'dark']) {
    const ax = await newPage({ viewport: { width: 1366, height: 1000 }, colorScheme: scheme, bypassCSP: true });
    await ax.goto(`${base}#/annotate`);
    await ax.waitForSelector('input[type=file]', { state: 'attached' });
    await ax.locator('input[type=file]').first().setInputFiles(pic1);
    await ax.waitForSelector('.an-canvas', { state: 'visible' });
    await ax.getByRole('button', { name: 'Text', exact: true }).click();
    await ax.waitForTimeout(300);
    await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations with a picture open ${vv.join(' | ')}`);
    await ax.close();
  }

  // ---------------------------------------------------------------- the phone: taps
  const ph = await phoneLayout(ctx, 'annotate', { ready: '.drop', before: async (p) => {
    await p.locator('input[type=file]').first().setInputFiles(pic2);
    await p.waitForSelector('.an-canvas', { state: 'visible' });
  } });
  const pc = ph.locator('.an-canvas');
  const tapAt = async (fx, fy) => { await pc.evaluate((c) => c.scrollIntoView({ block: 'center' })); const b = await pc.boundingBox(); await ph.touchscreen.tap(b.x + b.width * fx, b.y + b.height * fy); await ph.waitForTimeout(80); };
  await ph.getByRole('button', { name: 'Arrow', exact: true }).click();
  await tapAt(0.5, 0.4);
  ok(/Arrow added/.test(await status(ph)), `phone: a tap puts an arrow there (${await status(ph)})`);
  await ph.getByRole('button', { name: 'Step number', exact: true }).click();
  await tapAt(0.3, 0.6);
  ok(/Step marker 1 added/.test(await status(ph)), 'phone: a tap puts a step marker');
  for (const name of ['Undo', 'Redo', 'Save']) {
    const b = await ph.locator('.actions').getByRole('button', { name, exact: true }).boundingBox();
    ok(b && b.height >= 44 && b.width >= 44, `phone: "${name}" in the fixed bar, ${b && `${Math.round(b.width)} × ${Math.round(b.height)}`}`);
  }
  const small = await ph.$$eval('.an-tools .btn, .an-swatch, .an-custom, .seg-btn, .an-item .btn, .an-pick', (bs) => bs.filter((b) => b.getBoundingClientRect().width).map((b) => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, hh]) => hh < 44 || w < 44));
  ok(!small.length, `phone: tools, colours, choices and the strip's buttons are 44 px and more (${JSON.stringify(small)})`);
  let dl = 0; ph.on('download', () => dl++);
  await ph.locator('.actions').getByRole('button', { name: 'Save', exact: true }).click();
  await ph.waitForSelector('.result-row', { timeout: 30000 });
  await ph.waitForTimeout(300);
  ok(dl === 0 && /ready — tap its Share button/.test(await status(ph)) && await ph.locator('.result-row button[title^="Save phone-annotated"]').isVisible(), `phone: Save makes the picture and offers Share (a tap of its own) — nothing downloaded by itself (${await status(ph)})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
  await ph.close();
};
