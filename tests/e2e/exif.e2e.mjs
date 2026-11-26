// EXIF / Photo Info (#/exif): ExifTool 13.42 (WebAssembly, in a worker) on real photos — a JPEG with GPS and camera
// EXIF, an iPhone HEIC with its position, a Canon photo with a preview inside, a PNG with only a date, a broken GPS
// block; "Save without metadata" (ExifTool: the picture untouched, colour profile and orientation kept), read back by
// the native exiftool where it is installed (apt install libimage-exiftool-perl).
import { fileURLToPath } from 'node:url';
import { imageInfo } from '../lib/imgcheck.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from '../lib/child.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const nativeTags = (p) => { try { return JSON.parse(execFileSync('exiftool', ['-json', '-n', '-G1', p], { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0]; } catch { return null; } };
const DONE = /This photo gives away|carries no metadata|could not be read|not a photo/;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(base + '#/'); await page.goto(base + '#/exif');
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  ok(!requests.some((u) => /zeroperl|exiftool/.test(u)), 'nothing of ExifTool is fetched before a photo is chosen');
  const pick = async (f) => {
    await page.locator('input[type=file]').setInputFiles(typeof f === 'string' ? F(f) : f);
    await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.tool-body, main, body').innerText), DONE.source, { timeout: 120000 });
    return page.locator('main, body').first().innerText();
  };
  const save = () => download(page, () => page.getByRole('button', { name: 'Save without metadata' }).click());
  const okToast = async (re) => page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);

  // JPEG with GPS + camera EXIF
  let t = await pick('coffee-gps.jpg');
  ok(requests.some((u) => /vendor\/exiftool\/zeroperl\.wasm$/.test(u)), 'ExifTool (zeroperl.wasm) is fetched from this site with the first photo');
  ok(t.includes('18.922100') && t.includes('72.834667'), 'GPS decimal coordinates shown');
  ok(t.includes('18° 55′ 19.56″ N') && t.includes('72° 50′ 4.80″ E'), 'GPS in degrees/minutes/seconds');
  ok(/SuperToolsCam/.test(t) && /Fixture One/.test(t) && /1\/250 s/.test(t) && /f\/1\.8/.test(t) && /ISO\s*200/.test(t), 'camera + exposure fields');
  ok(/2025-12-31 18:45:00/.test(t), 'date taken formatted');
  ok(/600 × 400/.test(t), 'pixel size');
  ok(/This photo gives away:[\s\S]*where it was taken[\s\S]*when it was taken[\s\S]*the camera or phone \(SuperToolsCam Fixture One\)[\s\S]*the software it went through/.test(t), 'what the photo gives away, in words');
  const osm = await page.getByRole('link', { name: /OpenStreetMap/ }).getAttribute('href');
  ok(osm.startsWith('https://www.openstreetmap.org/?mlat=18.922100&mlon=72.834667'), 'map link (opened only on click)');
  ok(/All tags \(\d+\)/.test(t), 'every tag listed by group');
  const out = await save();
  ok(await okToast(/without metadata \(picture untouched\)/), 'toast: saved without metadata, picture untouched');
  const oi = imageInfo(out), orig = readFileSync(F('coffee-gps.jpg')), clean = readFileSync(out);
  ok(/coffee-gps-clean\.jpg$/.test(out) && oi.type === 'jpeg' && !oi.exif && !oi.gps && oi.width === 600, 'clean JPEG: no EXIF/GPS, same size');
  ok(Buffer.compare(clean.subarray(clean.length - 8192), orig.subarray(orig.length - 8192)) === 0, 'picture data byte-identical (lossless)');
  ok(clean.length < orig.length, 'file got smaller');
  const n1 = nativeTags(out);
  if (n1) ok(n1['GPS:GPSLatitude'] === undefined && n1['IFD0:Make'] === undefined && n1['ICC_Profile:ProfileDescription'] === 'sRGB', 'native exiftool: no position, no camera, the sRGB profile kept');

  // a portrait photo keeps its orientation (else it would be shown on its side)
  t = await pick('coffee-orientation6.jpg');
  const o6 = await save(), n6 = nativeTags(o6);
  if (n6) ok(n6['IFD0:Orientation'] === 6, `orientation 6 (rotate 90° CW) kept after stripping (${n6['IFD0:Orientation']})`);
  else info('native exiftool not installed — orientation check skipped');

  // iPhone HEIC: the position is read (the old reader said "no metadata") and the HEIC stays a HEIC
  t = await pick('pug.heic');
  ok(/44\.850478/.test(t) && /34\.976647/.test(t), 'HEIC: the iPhone photo\'s position is shown');
  ok(/Apple iPhone 13 Pro/.test(t), 'HEIC: the phone');
  const hp = await save(), hb = readFileSync(hp);
  ok(/pug-clean\.heic$/.test(hp) && hb.toString('latin1', 4, 12).startsWith('ftyp'), `HEIC saved as HEIC (${hp.split('/').pop()})`);
  const nh = nativeTags(hp);
  if (nh) ok(nh['GPS:GPSLatitude'] === undefined && nh['IFD0:Make'] === undefined && nh['ICC_Profile:ProfileDescription'] === 'Display P3', 'native exiftool: no position or phone in the HEIC; Display P3 profile kept');

  // PNG with only a date (tIME chunk)
  t = await pick('coffee.png');
  ok(/This photo gives away:[\s\S]*when it was taken/.test(t) && !/where it was taken/.test(t), 'PNG: gives away a date (its tIME chunk), nothing else');
  const pclean = imageInfo(await save());
  ok(pclean.type === 'png' && !pclean.chunks.includes('tIME'), 'PNG strip keeps PNG, drops tIME');

  // Canon photo: camera, preview picture inside
  t = await pick('flower.jpg');
  ok(/All tags/.test(t) && /Canon PowerShot S40/.test(t), 'real camera photo: the camera and the full tag list');
  ok(/small preview picture inside the file/.test(t), 'the embedded preview is pointed out');

  // broken GPS block
  t = await pick('exif_gps.jpg');
  ok(!/Location \(GPS\)/.test(t), 'malformed GPS is not shown as a location');

  // the newest photo wins
  await page.locator('input[type=file]').setInputFiles(F('flower.jpg'));
  await page.locator('input[type=file]').setInputFiles(F('coffee-gps.jpg'));
  await page.waitForTimeout(6000);
  t = await page.locator('main, body').first().innerText();
  ok(/SuperToolsCam/.test(t) && !/Canon PowerShot/.test(t), 'two photos one after the other: the newer one is shown');

  // not a photo
  t = await pick({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('just some text, not a photo') });
  ok(/This is not a photo — ExifTool reads it as a TXT file \(text\/plain\)\./.test(t) && !/carries no metadata|null/.test(t), 'a file that is no photo: said what it is (not "no metadata")');
  t = await pick({ name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) });
  ok(/This file could not be read: The file is empty \(0 bytes\)\./.test(t), 'an empty file: said');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // leaving the tab ends the worker
  await page.goto(base + '#/');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => globalThis.__superutilsLive().workers) === 0, 'leaving the tab ends the ExifTool worker');

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/exif');
  await phone.locator('input[type=file]').setInputFiles(F('coffee-gps.jpg'));
  await phone.waitForFunction((src) => new RegExp(src).test(document.body.innerText), DONE.source, { timeout: 120000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  const b = await phone.getByRole('button', { name: 'Save without metadata' }).boundingBox();
  ok(b && b.height >= 44, `phone: the save button is a touch target (${b && Math.round(b.height)} px)`);
  ok(phone.errors.length === 0, `phone: no errors: ${phone.errors.join(' | ')}`);
};
