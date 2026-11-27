// The camera in every tab that takes a picture — owner, 20 Nov 2026: "in all apps that offer to upload an image, also add
// the option of taking a photo if it's a phone app, and take the photo with a webcam if it's a PC app".
// 1. Coverage: every picture picker a tab shows as it opens, on a PC and on a phone, has "Use webcam" / "Use camera" in
//    its card (EXEMPT names the tabs without one, and why). A new tab with a picture picker and no camera fails here.
// 2. Every camera hands its photo to its tab: the stand-in camera (_camera.mjs — a page with a sentence) is opened in
//    each place a picture can be chosen (pickers that a mode shows too), Snap is pressed — twice where a tab takes
//    several, then Done — and what the tab shows afterwards is checked; the camera is closed after, when its box is
//    hidden by another mode, when another camera of the tab opens, and when the tab is left.
// 3. Phones: the back camera; a résumé photo with the front one, mirrored; pages one after another in the Doc Scanner
//    with its fixed bar out of the way.
import { fileURLToPath } from 'node:url';
import { fakeTextCamera, live, stopped, camButton, openCamera, snap } from './_camera.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const P = (n) => fileURLToPath(new URL(`../fixtures/pdf/${n}`, import.meta.url));
const M = (n) => fileURLToPath(new URL(`../fixtures/media/${n}`, import.meta.url));

/** pickers of pictures without a camera beside them, and why */
const EXEMPT = {
  svgo: 'SVG Optimizer takes SVG drawings, which no camera makes',
  scan: 'the QR & Barcode Scanner has its own camera above its image picker',
};

export default async ({ base, page: newPage, ok, info, devices }) => {
  // ------------------------------------------------------------------ 1. coverage, PC and phone
  for (const [kind, opts, least] of [['PC', { viewport: { width: 1280, height: 900 } }, 22], ['phone', { ...devices['iPhone 13'] }, 20]]) {
    const page = await newPage(opts);
    await page.goto(base); await page.waitForSelector('.tile');
    const ids = [...new Set(await page.evaluate(() => [...document.querySelectorAll('a.tile')].map((a) => a.getAttribute('href').replace(/^#\//, '')).filter((x) => x && !x.startsWith('c/'))))];
    const missing = [], seen = [];
    for (const id of ids) {
      await page.goto(`${base}#/${id}`); await page.waitForSelector('.tool-body', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(250);
      const pickers = await page.evaluate(() => [...document.querySelectorAll('.tool-body .drop')]
        .filter((d) => d.getClientRects().length && /image\/|\.heic|\.png|\.jpe?g/i.test(d.querySelector('input[type=file]')?.accept || ''))
        .map((d) => {
          const home = d.closest('.card') || document.querySelector('.tool-body');
          return { label: d.querySelector('strong')?.textContent?.trim(), cam: [...home.querySelectorAll('button')].some((b) => b.getClientRects().length && /^Use (webcam|camera)$/.test((b.getAttribute('aria-label') || b.textContent).trim())) };
        }));
      for (const p of pickers) { if (p.cam) seen.push(`${id}: ${p.label}`); else if (!EXEMPT[id]) missing.push(`${id}: “${p.label}”`); }
    }
    info(`${kind}: ${seen.length} pickers with a camera — ${seen.join(' · ')}`);
    ok(!missing.length && seen.length >= least, `${kind}: every picture picker a tab shows has the camera beside it (${seen.length} in ${ids.length} tabs; without, for a reason: ${Object.keys(EXEMPT).join(', ')}) ${missing.join(' | ')}`);
    ok(!page.errors.length, `${kind}: no page errors ${page.errors.slice(0, 3).join(' | ')}`);
  }

  // ------------------------------------------------------------------ 2. every camera hands its photo over (PC)
  const pg = await newPage({ viewport: { width: 1280, height: 900 } });
  await pg.addInitScript(fakeTextCamera);
  const go = async (id) => { await pg.goto(`${base}#/${id}`); await pg.waitForSelector('.tool-body', { timeout: 20000 }); await pg.waitForTimeout(200); };
  const body = () => pg.locator('.tool-body').innerText();
  /** the picker whose drop zone says `label`, with its own camera */
  const pickerOf = (label) => pg.locator('.stack', { has: pg.locator('.drop', { hasText: label }) }).filter({ has: pg.locator('.live-cam-wrap') }).last();
  const newest = () => pg.waitForFunction(() => [...document.querySelectorAll('.drop strong')].some((s) => s.textContent === 'Choose another photo'), null, { timeout: 60000 });
  const closed = async () => await stopped(pg) && (await pg.locator('.live-cam:not([hidden])').count()) === 0;
  const step = async (name, fn) => { try { const r = await fn(); ok(r === true, `${name}${typeof r === 'string' ? ` — ${r}` : ''}`); } catch (e) { ok(false, `${name}: ${e.message.split('\n')[0]}`); } };

  // tabs that take one photo through the shared picker: Snap gives the tab its picture ("Choose another photo")
  for (const id of ['image', 'formphoto', 'bgremove', 'cartoon', 'redact', 'caption', 'ocr', 'photodict']) {
    await step(`${id}: "Use webcam" → Snap → the photo is the tab's picture, the camera closed`, async () => {
      await go(id); await openCamera(pg); await snap(pg); await newest();
      return closed();
    });
  }
  // signature photos (a mode shows the picker)
  await step('signature: "From photo" → the webcam → Snap → the photo is read for ink', async () => {
    await go('signature'); await pg.getByRole('radio', { name: 'From photo' }).click();
    await openCamera(pg); await snap(pg); await newest();
    return closed();
  });
  await step('pdf-sign: a PDF, "Photo" → the webcam → Snap → the photo is read for ink', async () => {
    await go('pdf-sign'); await pg.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
    await pg.getByRole('radio', { name: 'Photo' }).click();
    await openCamera(pg, pickerOf('Photo of your signature')); await snap(pg); await newest();
    return closed();
  });

  // tabs that take several: the camera stays open, every Snap adds one, Done closes it
  const several = [
    ['batch', () => /2 images ·/.test(document.querySelector('.tool-body').innerText)],
    ['heic', () => (document.querySelector('.tool-body').innerText.match(/camera-\d{8}-\d{6}(-\d+)?\.jpg/g) || []).length >= 2],
    ['watermark', () => /2 photos: camera-\d{8}-\d{6}(-\d+)?\.jpg, camera-/.test(document.querySelector('.tool-body').innerText)],
    ['collage', () => document.querySelectorAll('.collage-item').length === 2],
    ['scanner', () => document.querySelectorAll('.scan-thumb').length === 2],
    ['bookflat', () => /Photo 2 of 2 · camera-\d{8}-\d{6}(-\d+)?\.jpg/.test(document.querySelector('.tool-body').innerText)],
    ['clipper', () => /Photo 2 of 2 · camera-\d{8}-\d{6}(-\d+)?\.jpg/.test(document.querySelector('.tool-body').innerText)],
    ['img2pdf', () => [...document.querySelectorAll('.pdf-tile-label')].filter((l) => /camera-\d{8}/.test(l.textContent)).length === 2],
    ['slideshow', () => /^2 photos/.test(document.querySelector('.tool-body').innerText.split('\n').find((l) => /photos? ·/.test(l)) || '')],
  ];
  for (const [id, done] of several) {
    await step(`${id}: the webcam stays open — two Snaps add two photos, Done closes it`, async () => {
      await go(id); await openCamera(pg);
      await snap(pg); await pg.locator('.live-cam-wrap', { hasText: '1 photo taken' }).waitFor({ timeout: 60000 });
      await snap(pg); await pg.locator('.live-cam-wrap', { hasText: '2 photos taken' }).waitFor({ timeout: 60000 });
      const open = await pg.locator('.live-cam:not([hidden])').count() === 1 && !await stopped(pg);
      await pg.locator('.live-cam-ctl').getByRole('button', { name: 'Done' }).click({ timeout: 60000 });
      await pg.waitForFunction(done, null, { timeout: 90000 });
      return open && await closed() ? true : `open after two Snaps: ${open}`;
    });
  }

  // pickers that a mode shows, and their tab's own way of using the picture
  await step('cartoon: "Use your own painting as the style" from the webcam → a new style tile', async () => {
    await go('cartoon'); await pg.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
    await pg.getByRole('radio', { name: 'AI art styles' }).click();
    await openCamera(pg, pickerOf('Use your own painting as the style')); await snap(pg);
    await pg.locator('[data-style^="own"]').waitFor({ timeout: 20000 });
    return closed();
  });
  await step('bgremove: the background photo from the webcam; one camera at a time; another mode closes it', async () => {
    await go('bgremove'); await pg.locator('input[type=file]').first().setInputFiles(F('astronaut.png'));
    await pg.waitForFunction(() => /fills|No person/.test(document.querySelector('.tool-body').innerText), null, { timeout: 90000 });
    await pg.getByRole('radio', { name: 'Photo' }).click();
    await pg.waitForFunction(() => /Choose a background photo\./.test(document.querySelector('.tool-body').innerText), null, { timeout: 10000 });
    const n0 = await pg.evaluate(() => window.__tracks.length);
    await openCamera(pg); // the main photo's camera …
    await openCamera(pg, pickerOf('Choose a background photo')); // … then the background's: the first one closes
    const one = await pg.evaluate((n) => window.__tracks[n].readyState === 'ended' && window.__tracks[n + 1].readyState === 'live', n0);
    await snap(pg);
    await pg.waitForFunction(() => !/Choose a background photo\./.test(document.querySelector('.tool-body').innerText), null, { timeout: 30000 });
    // a mode that hides the picker closes its camera
    await openCamera(pg, pickerOf('Choose a background photo'));
    await pg.getByRole('radio', { name: 'Colour' }).click();
    await pg.waitForTimeout(400);
    return one && await closed() ? true : `one camera at a time: ${one}`;
  });
  await step('watermark: the logo from the webcam → the photos are watermarked with it', async () => {
    await go('watermark'); await pg.locator('input[type=file]').first().setInputFiles(F('coffee.jpg'));
    await pg.getByRole('radio', { name: 'Logo' }).click();
    await openCamera(pg, pickerOf('Choose a logo')); await snap(pg); await pg.waitForTimeout(500);
    await pg.getByRole('button', { name: 'Watermark all' }).click();
    await pg.waitForFunction(() => /coffee-watermarked\./.test(document.querySelector('.tool-body').innerText), null, { timeout: 30000 });
    return closed();
  });
  for (const [id, label] of [['invoice', 'Logo (optional)'], ['invoice', 'Signature image (optional)'], ['rent', 'Signature image'], ['resume', 'Photo (optional)']]) {
    await step(`${id}: "${label}" from the webcam → the picture is in the document`, async () => {
      await go(id);
      const scope = pickerOf(label);
      await camButton(scope).click(); await live(pg);
      const mirrored = await pg.locator('.live-cam:not([hidden]) video').evaluate((v) => v.classList.contains('mirror'));
      await snap(pg);
      const field = pg.locator('.stack', { has: pg.locator('.drop', { hasText: label }) }).filter({ has: pg.getByRole('button', { name: 'Remove' }) }).last();
      await field.locator('span', { hasText: /camera-\d{8}-\d{6}/ }).waitFor({ timeout: 20000 });
      // a résumé photo is a selfie: its live view is mirrored, as a mirror (the photo is not); a logo's or a signature's is not
      return mirrored === (label === 'Photo (optional)') && await closed() ? true : `mirrored: ${mirrored}`;
    });
  }
  await step('ffmpeg: a picture the task asks for ("Logo on the video") from the webcam; a task without one hides and closes it', async () => {
    await go('ffmpeg'); await pg.locator('input[type=file]').first().setInputFiles(M('clip.mp4'));
    await pg.getByRole('combobox', { name: /^Task/ }).waitFor({ timeout: 120000 }); // FFmpeg (31 MB) reads the file first
    await pg.getByRole('combobox', { name: /^Task/ }).selectOption({ label: 'Logo on the video' });
    await openCamera(pg, pickerOf('Choose the logo picture')); await snap(pg);
    await pg.waitForFunction(() => /camera-\d{8}-\d{6}(-\d+)?\.jpg · /.test(document.querySelector('.tool-body').innerText), null, { timeout: 20000 });
    const shot = await closed();
    await openCamera(pg, pickerOf('Choose the logo picture'));
    await pg.getByRole('combobox', { name: /^Task/ }).selectOption({ label: 'Resize' });
    await pg.waitForTimeout(400);
    const hiddenCam = await camButton(pickerOf('Choose the logo picture')).count() === 0; // the picture box's own (the main picker keeps its webcam)
    return shot && await closed() && hiddenCam ? true : `after Snap closed: ${shot}, the box's camera hidden: ${hiddenCam}`;
  });
  // EXIF / Photo Info (owner, 21 Nov 2026: "also add it for exif too"): a photo taken here says what it carries
  await step('exif: the webcam → Snap → the photo is read, and the tab says a photo taken in the browser carries no metadata', async () => {
    await go('exif'); await openCamera(pg); await snap(pg);
    await pg.locator('.note', { hasText: 'Taken here in the browser' }).waitFor({ timeout: 90000 }); // ExifTool (8 MB) reads it first
    return await closed() && /camera-\d{8}-\d{6}(-\d+)?\.jpg/.test(await body());
  });
  // FFmpeg: a picture from the webcam as the file to work on (the main picker takes pictures too)
  await step('ffmpeg: "Use webcam" beside the main picker → Snap → the photo is the file to work on', async () => {
    await go('ffmpeg'); await openCamera(pg); await snap(pg);
    await pg.waitForFunction(() => /camera-\d{8}-\d{6}(-\d+)?\.jpg/.test(document.querySelector('.ff-info')?.textContent || ''), null, { timeout: 30000 });
    return closed();
  });
  // leaving the tab with the camera open closes it, and the tab keeps nothing of it
  await step('leaving a tab with its camera open: the camera is closed, nothing of it is kept', async () => {
    await go('collage'); await openCamera(pg);
    await pg.evaluate(() => { location.hash = '#/'; }); await pg.locator('.tile').first().waitFor();
    const live = await pg.evaluate(() => globalThis.__superutilsLive());
    return await stopped(pg) && !live.resources.some((k) => k.startsWith('livecam')) ? true : JSON.stringify(live);
  });
  ok(!pg.errors.length, `the webcam in every tab: no page errors ${pg.errors.slice(0, 5).join(' | ')}`);

  // ------------------------------------------------------------------ 3. phones
  const ph = await newPage({ ...devices['iPhone 13'] });
  await ph.addInitScript(fakeTextCamera);
  const calls = () => ph.evaluate(() => window.__gumCalls);
  await ph.goto(`${base}#/image`); await ph.waitForSelector('.tool-body');
  await openCamera(ph);
  ok((await calls()).at(-1).video.facingMode?.ideal === 'environment' && await ph.locator('.live-cam:not([hidden]) video.mirror').count() === 0, 'phone: "Use camera" opens the back camera, not mirrored');
  await snap(ph);
  await ph.waitForFunction(() => [...document.querySelectorAll('.drop strong')].some((s) => s.textContent === 'Choose another photo'), null, { timeout: 30000 });
  ok(await stopped(ph), 'phone: Snap gives the Image Editor its photo and closes the camera');
  // Doc Scanner: page after page, the fixed PDF bar out of the way meanwhile
  await ph.goto(`${base}#/scanner`); await ph.waitForSelector('.tool-body');
  await openCamera(ph);
  const bar = () => ph.evaluate(() => getComputedStyle(document.querySelector('.actions')).display);
  const during = await bar();
  await snap(ph); await ph.locator('.live-cam-wrap', { hasText: '1 photo taken' }).waitFor({ timeout: 60000 });
  await snap(ph); await ph.locator('.live-cam-wrap', { hasText: '2 photos taken' }).waitFor({ timeout: 60000 });
  await ph.locator('.live-cam-ctl').getByRole('button', { name: 'Done' }).click({ timeout: 60000 });
  await ph.waitForFunction(() => document.querySelectorAll('.scan-thumb').length === 2, null, { timeout: 60000 });
  ok(during === 'none' && await bar() !== 'none' && await stopped(ph), `phone, Doc Scanner: two pages from the camera in one go; its fixed PDF bar stepped aside meanwhile (${during}) and is back`);
  // Resume: a selfie — the front camera, mirrored
  await ph.goto(`${base}#/resume`); await ph.waitForSelector('.tool-body');
  const rs = ph.locator('.stack', { has: ph.locator('.drop', { hasText: 'Photo (optional)' }) }).filter({ has: ph.locator('.live-cam-wrap') }).last();
  await camButton(rs).click(); await live(ph);
  ok((await calls()).at(-1).video.facingMode?.ideal === 'user' && await ph.locator('.live-cam:not([hidden]) video.mirror').count() === 1, 'phone, Resume photo: the front camera, its view mirrored');
  await ph.locator('.live-cam-ctl').getByRole('button', { name: 'Cancel' }).click();
  ok(await stopped(ph) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: closed by Cancel; no sideways scroll');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.slice(0, 5).join(' | ')}`);
};
