// Blur & Redact (#/redact): MediaPipe face detection on a real portrait (NASA astronaut photo) and on a generated
// "group photo" of six small faces; pixelate / blur / black bar; manual boxes; toggling a face off; every face at once
// or only the faces chosen, all / none and Undo (to-do #15) — the saved file's pixels at each face.
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageInfo, regionMeans, lum } from '../lib/imgcheck.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const STATUS = '[aria-live="polite"].muted';

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
  await page.waitForFunction(() => document.querySelectorAll('.redact-box.ghost').length === 0, null, { timeout: 30000 });
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

  // ---- to-do #15 (owner, 26 Nov 2026): "a toggle to find all faces and redact, or … selectively choose only that face
  // he wants to redact … choose any number of faces manually to redact and undo them, or select all the faces in one shot"
  const groupFile = join(mkdtempSync(join(tmpdir(), 'redact-')), 'group.png');
  writeFileSync(groupFile, Buffer.from(groupBuf, 'base64'));
  const say = () => page.locator(STATUS).first().textContent();
  // the picture is redrawn after each change (asynchronously) and Save writes its own line there: wait for the count
  const sayIs = (want) => page.waitForFunction((w) => document.querySelector('[aria-live="polite"].muted')?.textContent === w, want, { timeout: 10000 }).then(() => true, () => false);
  const faceRects = async () => (await page.locator('.redact-box.face').evaluateAll((els) => els.map((e) => [parseFloat(e.style.left), parseFloat(e.style.top), parseFloat(e.style.width), parseFloat(e.style.height)].map((v) => v / 100))))
    .map(([x, y, w, h]) => [x + w * 0.3, y + h * 0.3, x + w * 0.7, y + h * 0.7]);
  await page.getByRole('radio', { name: 'Black bar' }).click();
  const rects = await faceRects(), origFaces = (await regionMeans(page, groupFile, rects)).map(lum);
  /** which faces the saved file hides: black where hidden, the photo's own where not */
  const savedHides = async () => { const m = (await regionMeans(page, await save(), rects)).map(lum); return m.map((v, i) => (v < 8 ? 'hidden' : Math.abs(v - origFaces[i]) < 4 ? 'shown' : `? ${v.toFixed(0)}`)); };
  const pressed = () => page.locator('.redact-box.face').evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed') === 'true'));
  ok(await sayIs('6 faces found · 6 hidden') && (await savedHides()).every((x) => x === 'hidden'), `the switch on (as before): every face hidden at once, in the saved file too (${await say()})`);
  const sw = page.locator('label.switch', { hasText: 'Redact every face found' });
  await sw.click();
  ok(await sayIs('6 faces found · 0 hidden') && await page.locator('.redact-box.face.off').count() === 6, `switched off: the faces are outlined, none hidden (${await say()})`);
  ok((await savedHides()).every((x) => x === 'shown'), 'switched off: the saved file shows every face');
  const tap = (i) => page.locator('.redact-box.face').nth(i).click();
  await tap(0); await tap(3);
  ok(await sayIs('6 faces found · 2 hidden'), `two faces chosen by tap (${await say()})`);
  await tap(0);
  ok(await sayIs('6 faces found · 1 hidden'), `one taken back by a second tap (${await say()})`);
  const one = await savedHides();
  ok(one.join() === 'shown,shown,shown,hidden,shown,shown', `the saved file hides exactly the face left chosen (${one.join(', ')})`);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  ok(await sayIs('6 faces found · 2 hidden') && (await pressed()).join() === 'true,false,false,true,false,false', `Undo: the tap taken back (${await say()})`);
  await page.keyboard.press('Control+z');
  ok(await sayIs('6 faces found · 1 hidden') && (await pressed()).join() === 'true,false,false,false,false,false', `Ctrl+Z: one step further back (${await say()})`);
  await page.getByRole('button', { name: 'Redact all faces' }).click();
  ok(await sayIs('6 faces found · 6 hidden') && (await savedHides()).every((x) => x === 'hidden'), '“Redact all faces”: every face in one go, saved so');
  await page.getByRole('button', { name: 'Show all faces' }).click();
  ok(await sayIs('6 faces found · 0 hidden') && (await savedHides()).every((x) => x === 'shown'), '“Show all faces”: none, saved so');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  ok(await sayIs('6 faces found · 6 hidden'), `Undo after “Show all faces”: all hidden again (${await say()})`);
  for (let i = 0; i < 10; i++) { if (await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled()) break; await page.getByRole('button', { name: 'Undo', exact: true }).click(); }
  ok(await sayIs('6 faces found · 6 hidden') && await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled(), `Undo goes back to where the photo began and stops there: every face hidden, as the switch was then (${await say()})`);
  // the switch keeps its setting for the next photo (off here: the portrait's face is only outlined), and turning it on
  // hides the faces of the photo shown — undoable like any change
  ok(!(await sw.locator('input').isChecked()), 'the switch itself is not part of the photo\'s history: it stays off');
  await open(F('astronaut.png'));
  ok(await sayIs('1 face found · 0 hidden') && !(await sw.locator('input').isChecked()), `another photo: the switch stays off and its face is only outlined (${await say()})`);
  await sw.click();
  ok(await sayIs('1 face found · 1 hidden'), `switched on: the face of the photo shown is hidden (${await say()})`);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  ok(await sayIs('1 face found · 0 hidden') && await sw.locator('input').isChecked(), 'Undo takes back what the switch did to this photo; the switch stays as set for the photos to come');
  ok(await sw.locator('input').isChecked(), 'the switch on for the rest of the suite');

  // no faces
  const n0 = await open(F('page.png'));
  ok(n0 === 0, `scanned page: no faces (got ${n0})`);
  ok(/^0 faces found · 0 hidden$/.test(await page.locator(STATUS).first().textContent()), 'status: 0 faces found · 0 hidden');

  // a big group photo (the search takes a while): Save waits for it, a box drawn meanwhile is kept, and the newest
  // photo wins
  const bigGroup = Buffer.from(await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(3600, 1800), g = c.getContext('2d');
    g.fillStyle = '#8a8f99'; g.fillRect(0, 0, 3600, 1800);
    for (let i = 0; i < 6; i++) g.drawImage(bmp, 90 + (i % 3) * 1170, 75 + Math.floor(i / 3) * 870, 780, 780);
    return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer())];
  }, (await import('node:fs')).readFileSync(F('astronaut.png')).toString('base64')));
  // the face model arrives 4 s late, so the search surely runs while Save is pressed and the box is drawn
  const slow = async (r) => { await new Promise((f) => setTimeout(f, 4000)); await r.continue(); };
  await page.route('**/blaze_face_short_range.tflite', slow);
  await page.goto(base + '#/'); await page.goto(base + '#/redact');
  await page.locator('input[type=file]').setInputFiles({ name: 'big-group.jpg', mimeType: 'image/jpeg', buffer: bigGroup });
  await page.waitForFunction(() => /Looking for faces/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 30000 });
  let got = null; page.once('download', (dl) => { got = dl; });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  ok(await page.locator('.toast', { hasText: 'Still looking for faces' }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'Save during the search: "Still looking for faces" (a photo with every face visible is not saved)');
  // draw a box while the search runs
  await page.getByRole('button', { name: 'Draw a box' }).click();
  await page.evaluate(() => document.querySelector('.redact-wrap').scrollIntoView({ block: 'center' }));
  const rb = await page.locator('.redact-wrap canvas').boundingBox();
  await page.mouse.move(rb.x + rb.width * 0.4, rb.y + rb.height * 0.45); await page.mouse.down();
  await page.mouse.move(rb.x + rb.width * 0.6, rb.y + rb.height * 0.55, { steps: 4 }); await page.mouse.up();
  const stillSearching = /Looking for faces/.test(await page.locator(STATUS).first().textContent());
  await page.getByRole('button', { name: 'Done drawing' }).click();
  await page.waitForFunction(() => /faces? found/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 120000 });
  ok(got === null, '… and nothing was downloaded');
  // the picture is redrawn with the new box (the half-drawn ghost stays until then)
  await page.waitForFunction(() => /1 box of your own/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const nFaces = await page.locator('.redact-box.face').count(), nMine = await page.locator('.redact-box:not(.face):not(.ghost)').count();
  await page.unroute('**/blaze_face_short_range.tflite', slow);
  ok(stillSearching, 'the box was drawn while the search was still running');
  ok(nFaces === 6 && nMine === 1, `the box drawn during the search is kept beside the 6 faces (${nFaces} + ${nMine})`);
  ok(/^6 faces found · 6 hidden · 1 box of your own$/.test(await page.locator(STATUS).first().textContent()), `status counts both (${await page.locator(STATUS).first().textContent()})`);
  // a cancelled pointer leaves no half-drawn box
  await page.getByRole('button', { name: 'Draw a box' }).click();
  await page.evaluate(() => {
    const l = document.querySelector('.redact-layer'), r = l.getBoundingClientRect();
    const ev = (t, x, y) => l.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, clientX: r.left + r.width * x, clientY: r.top + r.height * y }));
    ev('pointerdown', 0.1, 0.1); ev('pointermove', 0.3, 0.3); ev('pointercancel', 0.3, 0.3); ev('pointermove', 0.5, 0.5); ev('pointerup', 0.5, 0.5);
  });
  ok(await page.locator('.redact-box.ghost').count() === 0 && await page.locator('.redact-box:not(.face):not(.ghost)').count() === 1, 'a cancelled gesture leaves no ghost and adds no box');
  await page.getByRole('button', { name: 'Done drawing' }).click();
  // newest photo wins: the group, then at once the scanned page
  await page.locator('input[type=file]').setInputFiles({ name: 'big-group.jpg', mimeType: 'image/jpeg', buffer: bigGroup });
  await page.waitForTimeout(300);
  await page.locator('input[type=file]').setInputFiles(F('page.png'));
  await page.waitForTimeout(15000);
  ok(await page.locator('.redact-box').count() === 0 && /^0 faces found/.test(await page.locator(STATUS).first().textContent()), `newest photo wins: the page's 0 faces, not the group's boxes (${await page.locator('.redact-box').count()} boxes)`);
  // leaving the tab during a search: nothing is said on the next page, no errors
  await page.locator('input[type=file]').setInputFiles({ name: 'big-group.jpg', mimeType: 'image/jpeg', buffer: bigGroup });
  await page.waitForTimeout(400);
  await page.goto(base + '#/');
  await page.waitForTimeout(6000);
  ok(await page.locator('.toast.err, .toast-err').count() === 0, 'leaving during the search: no error on the next page');
  const errs = page.errors.filter((e) => !/^Error: Still looking for faces/.test(e)); // the refusal above, logged by the button
  const csp = errs.filter((e) => /Content Security Policy|CSP/i.test(e));
  ok(csp.length === 0 && errs.length === 0, `no page errors / CSP violations: ${errs.join(' | ')}`);

  // the face model cannot be fetched: said in the status line, boxes can still be drawn
  const nm = await newPage();
  await nm.route('**/blaze_face_short_range.tflite', (r) => r.abort());
  await nm.goto(base + '#/redact');
  await nm.locator('input[type=file]').setInputFiles(F('astronaut.png'));
  await nm.waitForFunction(() => /could not be looked for|faces? found/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  ok(/^Faces could not be looked for \(.+\) — draw boxes by hand over what to hide\.$/.test(await nm.locator(STATUS).first().textContent()), `no face model: said in the status line (${await nm.locator(STATUS).first().textContent()})`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/redact');
  await phone.locator('input[type=file]').setInputFiles(F('astronaut.png'));
  await phone.waitForSelector('.redact-box', { timeout: 60000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  for (const n of ['Save', 'Share', 'Draw a box', 'Redact all faces', 'Show all faces', 'Undo']) {
    const b = await phone.getByRole('button', { name: n, exact: true }).boundingBox();
    ok(b && b.height >= 44, `phone: ${n} is a touch target (${b && Math.round(b.height)} px)`);
  }
};
