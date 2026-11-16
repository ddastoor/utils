// Webcam Test (#/webcam): stream starts, the info table matches the real track (resolution = video size, camera count
// = enumerateDevices), requested resolution is passed on, snapshot JPEG = video size and mirrored like the preview
// (fake camera: red left / blue right), mirror off, permission denied / no camera messages, snapshot before start,
// tracks released when the tab is left, Chromium's own fake device, phone layout.
import { phoneLayout } from './_phone.mjs';
import { fakeMedia, allStopped } from './_media.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok, download } = ctx;
  const page = await newPage({ permissions: ['camera'] }); await page.addInitScript(fakeMedia);
  await page.goto(`${base}#/webcam`);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }); await btn('Start camera').waitFor();
  const rows = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv > span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  ok(await page.evaluate(() => window.__gumCalls.length) === 0 && await page.locator('.kv').count() === 0, 'nothing requested before "Start camera"');
  await btn('Start camera').click();
  await page.waitForFunction(() => document.querySelector('video').videoWidth > 0, null, { timeout: 10000 });
  let r = await rows(), vw = await page.evaluate(() => [document.querySelector('video').videoWidth, document.querySelector('video').videoHeight]);
  const nCams = await page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length);
  ok(r.Resolution === `${vw[0]} × ${vw[1]}` && r.Resolution === '640 × 480', `resolution row = the video's size (${r.Resolution})`);
  ok(r['Cameras found'] === String(nCams) && /^\d+ fps$/.test(r['Frame rate']), `cameras found = enumerateDevices (${r['Cameras found']}), frame rate (${r['Frame rate']})`);
  let gum = await page.evaluate(() => window.__gumCalls.at(-1));
  ok(gum.video.width.ideal === 1920 && gum.video.height.ideal === 1080 && gum.audio === false, 'asks for 1080p by default, no microphone');
  ok(await page.locator('video').evaluate((v) => getComputedStyle(v).transform) === 'matrix(-1, 0, 0, 1, 0, 0)', 'preview mirrored by default');
  // snapshot: decode the JPEG in the page and read the left and right halves
  const px = async (path) => page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const at = (x) => [...g.getImageData(x, bmp.height / 2, 1, 1).data.slice(0, 3)];
    return { w: bmp.width, h: bmp.height, left: at(40), right: at(bmp.width - 40) };
  }, (await import('node:fs')).readFileSync(path).toString('base64'));
  const red = (p) => p[0] > 200 && p[1] < 60 && p[2] < 60, blue = (p) => p[2] > 200 && p[0] < 60 && p[1] < 60;
  let f = await download(page, () => btn('Snapshot').click()); let s = await px(f);
  ok(/^webcam-\d+\.jpg$/.test(f.split('-').slice(-2).join('-')) && s.w === 640 && s.h === 480, `snapshot JPEG at the video size (${s.w}×${s.h})`);
  ok(blue(s.left) && red(s.right), `mirrored snapshot = what the preview shows (left ${s.left}, right ${s.right})`);
  await page.locator('label.switch').filter({ hasText: 'Mirror preview' }).click();
  ok(await page.locator('video').evaluate((v) => getComputedStyle(v).transform) === 'none', 'mirror off: preview not flipped');
  f = await download(page, () => btn('Snapshot').click()); s = await px(f);
  ok(red(s.left) && blue(s.right), `unmirrored snapshot = the camera image (left ${s.left}, right ${s.right})`);
  const before = await page.evaluate(() => window.__tracks.length);
  await page.getByRole('radio', { name: '720p', exact: true }).click(); await page.waitForFunction((n) => window.__tracks.length > n, before);
  gum = await page.evaluate(() => window.__gumCalls.at(-1));
  ok(gum.video.width.ideal === 1280 && gum.video.height.ideal === 720, 'choosing 720p asks for 1280 × 720');
  ok(await page.evaluate((n) => window.__tracks.slice(0, n).every((t) => t.readyState === 'ended'), before), 'the previous stream is stopped on restart');
  await page.getByRole('radio', { name: '4K', exact: true }).click(); await page.waitForTimeout(200);
  gum = await page.evaluate(() => window.__gumCalls.at(-1)); ok(gum.video.width.ideal === 3840 && gum.video.height.ideal === 2160, '4K asks for 3840 × 2160');
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor();
  ok(await allStopped(page), 'leaving the tab stops the camera');
  // errors
  await page.goto(`${base}#/webcam`); await btn('Start camera').waitFor();
  await page.evaluate(() => (window.__gumError = 'NotAllowedError')); await btn('Start camera').click();
  ok(/Permission was denied/.test(await page.locator('.note-err').textContent()), 'permission denied → how to allow it');
  await page.evaluate(() => (window.__gumError = 'NotFoundError')); await btn('Start camera').click();
  ok(await page.locator('.note-err').count() === 1 && /No such device/.test(await page.locator('.note-err').textContent()), 'no camera → "No such device" (one message, not stacked)');
  await page.evaluate(() => (window.__gumError = null));
  const errs0 = page.errors.length;
  await btn('Snapshot').click(); await page.waitForTimeout(300);
  ok(/Start the camera first/.test(await page.locator('.toast').last().textContent().catch(() => '')), 'Snapshot before the camera runs → "Start the camera first"');
  page.errors.splice(errs0).forEach((e) => { if (!/Start the camera first/.test(e)) page.errors.push(e); });
  // Chromium's own fake capture device (real getUserMedia path)
  await page.evaluate(() => (window.__realGum = true)); await btn('Start camera').click();
  await page.waitForFunction(() => document.querySelector('video').videoWidth > 0, null, { timeout: 10000 });
  r = await rows(); ok(/fake/i.test(r.Camera) && r.Resolution === await page.evaluate(() => `${document.querySelector('video').videoWidth} × ${document.querySelector('video').videoHeight}`), `real capture device: label "${r.Camera}", ${r.Resolution}`);
  ok(await page.locator('select').evaluate((s) => s.options.length) === nCams && await page.locator('select').inputValue() !== '', 'camera list filled and the active camera selected');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'webcam', { ready: 'video', buttons: ['Start camera', 'Snapshot'] });
};
