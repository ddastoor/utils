// Blur & Redact (#/redact): MediaPipe face detection on a real portrait (NASA astronaut photo) and on a generated
// "group photo" of six small faces; pixelate / blur / black bar; manual boxes; toggling a face off.
import { imageInfo, regionMeans, lum } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  const open = async (files) => {
    await page.goto(base + '#/'); await page.goto(base + '#/redact');
    await page.locator('input[type=file]').setInputFiles(files);
    await page.waitForFunction(() => /faces? found/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
    return page.locator('.redact-box').count();
  };
  const save = () => download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());

  // single portrait
  const n1 = await open(F('astronaut.png'));
  ok(n1 === 1, `astronaut portrait: 1 face (got ${n1})`);
  const fb = await page.locator('.redact-box.face').first().evaluate((e) => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: parseFloat(e.style.height) }));
  ok(fb.x > 25 && fb.x < 55 && fb.y > 5 && fb.y < 35 && fb.w > 12 && fb.w < 40, `face box where the face is: ${JSON.stringify(fb)}`);
  const face = [(fb.x + fb.w * 0.3) / 100, (fb.y + fb.h * 0.3) / 100, (fb.x + fb.w * 0.7) / 100, (fb.y + fb.h * 0.7) / 100];
  const away = [0.0, 0.75, 0.2, 0.98];
  const p1 = await save(), i1 = imageInfo(p1);
  ok(i1.type === 'jpeg' && i1.width === 512 && !i1.exif, 'saved full-size JPEG without metadata');
  // pixelation flattens detail: compare local variance proxy via 4 sub-means
  const sub = (r) => [[r[0], r[1], (r[0] + r[2]) / 2, (r[1] + r[3]) / 2], [(r[0] + r[2]) / 2, r[1], r[2], (r[1] + r[3]) / 2], [r[0], (r[1] + r[3]) / 2, (r[0] + r[2]) / 2, r[3]], [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2, r[2], r[3]]];
  const [awayOrig] = await regionMeans(page, F('astronaut.png'), [away]), [awayOut] = await regionMeans(page, p1, [away]);
  ok(Math.abs(lum(awayOrig) - lum(awayOut)) < 3, 'areas away from the face untouched');
  // black bar
  await page.getByRole('radio', { name: 'Black bar' }).click();
  const [bar] = await regionMeans(page, await save(), [face]);
  ok(lum(bar) < 8, `black bar over the face (lum ${lum(bar).toFixed(1)})`);
  // blur differs from both
  await page.getByRole('radio', { name: 'Blur' }).click();
  const blurred = await regionMeans(page, await save(), sub(face)), orig = await regionMeans(page, F('astronaut.png'), sub(face));
  const spread = (a) => Math.max(...a.map(lum)) - Math.min(...a.map(lum));
  ok(spread(blurred) < spread(orig) * 0.85, `blur reduces detail over the face (${spread(orig).toFixed(1)} → ${spread(blurred).toFixed(1)})`);
  // toggle the face off → face untouched
  await page.locator('.redact-box.face').first().click();
  ok(await page.locator('.redact-box.off').count() === 1, 'tapping the box keeps that face visible');
  const [kept] = await regionMeans(page, await save(), [face]), [faceOrig] = await regionMeans(page, F('astronaut.png'), [face]);
  ok(Math.abs(lum(kept) - lum(faceOrig)) < 3, 'face left visible when its box is off');

  // manual box (draw) → black bar there
  await page.getByRole('radio', { name: 'Black bar' }).click();
  await page.getByRole('button', { name: 'Draw a box' }).click();
  await page.evaluate(() => document.querySelector('.redact-wrap').scrollIntoView({ block: 'center' }));
  const r = await page.locator('.redact-wrap canvas').boundingBox();
  await page.mouse.move(r.x + r.width * 0.05, r.y + r.height * 0.8); await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.25, r.y + r.height * 0.95, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Done drawing' }).click();
  ok(await page.locator('.redact-box:not(.face)').count() === 1, 'manual box added');
  const [mb] = await regionMeans(page, await save(), [[0.08, 0.83, 0.22, 0.92]]);
  ok(lum(mb) < 8, 'manual box blacked out');

  // generated group photo: 6 small faces on a 3×2 grid
  const groupBuf = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(1200, 600), g = c.getContext('2d');
    g.fillStyle = '#8a8f99'; g.fillRect(0, 0, 1200, 600);
    for (let i = 0; i < 6; i++) g.drawImage(bmp, 30 + (i % 3) * 390, 25 + Math.floor(i / 3) * 290, 260, 260);
    const blob = await c.convertToBlob({ type: 'image/png' });
    const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s);
  }, (await import('node:fs')).readFileSync(F('astronaut.png')).toString('base64'));
  const n6 = await open({ name: 'group.png', mimeType: 'image/png', buffer: Buffer.from(groupBuf, 'base64') });
  info(`group photo: ${n6} faces`);
  ok(n6 === 6, `group photo: all 6 small faces found (got ${n6})`);

  // no faces
  const n0 = await open(F('page.png'));
  ok(n0 === 0, `scanned page: no faces (got ${n0})`);
  const csp = page.errors.filter((e) => /Content Security Policy|CSP/i.test(e));
  ok(csp.length === 0 && page.errors.length === 0, `no page errors / CSP violations: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/redact');
  await phone.locator('input[type=file]').setInputFiles(F('astronaut.png'));
  await phone.waitForSelector('.redact-box', { timeout: 60000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
