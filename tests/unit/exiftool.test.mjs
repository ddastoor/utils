// EXIF / Photo Info engine: ExifTool 13.42 on zeroperl (WebAssembly), held to the native exiftool (Ubuntu's 12.76:
// `apt install libimage-exiftool-perl`) on every photo of tests/fixtures/images, and the shaping of src/lib/photoinfo.ts.
// Stripping: the native exiftool reads the result (nothing private left, colour profile and orientation kept) and the
// picture's bytes are compared — JPEG scan data, PNG image data, HEIC decoded by Pillow (pillow-heif).
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const native = (p, args) => { try { return JSON.parse(execFileSync('exiftool', [...args, p], { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0]; } catch { return null; } };
// tags only ExifTool 13.42 decodes (or decodes otherwise) than Ubuntu's 12.76 — Apple's newer maker notes and XMP
const NEWER = /^(Apple:|XMP-apdi:|XMP-HDRGainMap:|QuickTime:Rotation$)/;

export default async (t, { load, root }) => {
  const { readTags, stripFile } = await load('/src/lib/exiftool.ts');
  const P = await load('/src/lib/photoinfo.ts');
  const dir = `${root}/tests/fixtures/images`;
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|heic|webp|tiff?)$/i.test(f)).sort();
  const haveNative = native(`${dir}/coffee.png`, ['-json']) !== null;
  const tagsOf = {};
  for (const f of files) {
    const p = `${dir}/${f}`;
    const ours = await readTags(new Blob([readFileSync(p)]), f);
    tagsOf[f] = ours;
    if (!haveNative) continue;
    const nat = native(p, P.READ_ARGS);
    const skip = /^(SourceFile|System:|ExifTool:)/;
    const keys = Object.keys(nat).filter((k) => !skip.test(k) && !NEWER.test(k));
    const differ = keys.filter((k) => JSON.stringify(ours[k]) !== JSON.stringify(nat[k]));
    t.eq(differ, [], `${f}: ${keys.length} tags, each as the native exiftool reads it`);
  }
  if (!haveNative) t.ok(true, 'native exiftool not installed — the comparison with it was skipped (apt install libimage-exiftool-perl)');

  // ---- shaping
  const I = (f) => P.photoInfo(tagsOf[f]);
  const g = I('coffee-gps.jpg');
  t.ok(g.gps && Math.abs(g.gps.lat - 18.9221) < 1e-7 && Math.abs(g.gps.lon - 72.83466667) < 1e-7, 'coffee-gps.jpg: the position (18.9221, 72.83466667)');
  t.eq(Object.fromEntries(g.camera.filter(([, v]) => v)), { Make: 'SuperToolsCam', Model: 'Fixture One', Software: 'make-fixtures' }, 'coffee-gps.jpg: camera rows');
  t.eq(Object.fromEntries(g.exposure.filter(([, v]) => v)), { Taken: '2025-12-31 18:45:00', Shutter: '1/250 s', Aperture: 'f/1.8', ISO: '200', 'Focal length': '2.6 mm' }, 'coffee-gps.jpg: exposure rows');
  t.eq(g.reveals.map((r) => r.split(' (')[0]), ['where it was taken', 'when it was taken', 'the camera or phone', 'the software it went through'], 'coffee-gps.jpg: what it gives away');
  const pug = I('pug.heic');
  t.ok(pug.gps && Math.abs(pug.gps.lat - 44.85047778) < 1e-6 && Math.abs(pug.gps.lon - 34.97664722) < 1e-6, `pug.heic (iPhone 13 Pro): the position is read from a HEIC (${pug.gps && [pug.gps.lat, pug.gps.lon]})`);
  t.ok(pug.reveals[0] === 'where it was taken' && pug.reveals.some((r) => /Apple iPhone 13 Pro/.test(r)), 'pug.heic: gives away the place and the phone');
  t.ok(Math.abs(pug.gps.alt - 29.1355) < 0.001, `pug.heic: altitude ${pug.gps.alt} m above sea level`);
  const xi = I('xiaomi.heic');
  t.ok(xi.gps && Math.abs(xi.gps.lat - 47.2272889) < 1e-6, 'xiaomi.heic: the position');
  t.eq(I('exif_gps.jpg').gps, undefined, 'exif_gps.jpg: a broken GPS block (latitude 4294967295) is no position');
  t.eq(I('coffee.png').metadataCount, 1, 'coffee.png: one metadata tag — the PNG tIME chunk (its structure does not count)');
  t.eq(I('coffee.png').reveals, ['when it was taken'], 'coffee.png: gives away a date (tIME 2013-08-05)');
  const fl = I('flower.jpg');
  t.ok(fl.reveals.some((r) => /preview picture/.test(r)) && fl.reveals.some((r) => /Canon/.test(r)), 'flower.jpg (Canon PowerShot): the camera and the preview picture inside the file');
  t.eq(I('coffee-orientation6.jpg').exposure.find(([k]) => k === 'Orientation')[1], 'Rotate 90 CW', 'orientation in words');
  // gpsOf on made-up tags
  t.eq(P.gpsOf({ 'Composite:GPSLatitude': '+0.00000000', 'Composite:GPSLongitude': '+0.00000000' }), undefined, '0, 0 is a camera without a fix, not a place');
  t.eq(P.gpsOf({ 'Composite:GPSLatitude': '+91.0', 'Composite:GPSLongitude': '+10' }), undefined, 'latitude 91 is no place');
  t.eq(P.gpsOf({ 'Composite:GPSLatitude': '-33.8688', 'Composite:GPSLongitude': '+151.2093', 'Composite:GPSAltitude': '12.5 m Below Sea Level' }), { lat: -33.8688, lon: 151.2093, alt: -12.5, time: undefined }, 'south and east; below sea level is negative');
  t.eq(P.gpsOf({ 'XMP-exif:GPSLatitude': '+28.6139', 'XMP-exif:GPSLongitude': '+77.209' }), { lat: 28.6139, lon: 77.209, alt: undefined, time: undefined }, 'a position only in XMP');
  t.eq(P.photoInfo({ 'XMP-iptcExt:PersonInImage': 'Asha', 'IPTC:City': 'Pune', 'IFD0:Artist': 'R. K.', 'ExifIFD:BodySerialNumber': '123' }).reveals.map((r) => r.split(' (')[0]), ['where it was taken', 'a serial number of the camera or lens', 'a person’s name', 'the names of people in it'], 'IPTC city, names, serial numbers');
  t.ok(P.isMetadata('IFD0:Make') && P.isMetadata('PNG:ModifyDate') && !P.isMetadata('PNG:ImageWidth') && !P.isMetadata('ICC_Profile:ProfileDescription') && !P.isMetadata('File:FileType') && !P.isMetadata('QuickTime:MajorBrand'), 'metadata vs the file\'s structure');
  t.eq([P.innerName('IMG_0001.HEIC'), P.innerName('photo'), P.innerName('a b/c.Jpeg')], ['photo.heic', 'photo.jpg', 'photo.jpeg'], 'the name inside ExifTool\'s file system');
  t.eq(P.exiftoolError('Error: File format error - /photo.jpg'), 'File format error', 'ExifTool\'s message without its prefix and path');

  // ---- stripping
  const tmp = mkdtempSync(join(tmpdir(), 'strip-'));
  const jpegScan = (b) => { for (let i = 2; i + 4 < b.length;) { if (b[i] !== 0xff) return null; if (b[i + 1] === 0xda) return b.subarray(i); i += 2 + b.readUInt16BE(i + 2); } return null; };
  const pngIdat = (b) => { const parts = []; for (let o = 8; o + 8 <= b.length;) { const n = b.readUInt32BE(o), ty = b.toString('latin1', o + 4, o + 8); if (ty === 'IDAT') parts.push(b.subarray(o + 8, o + 8 + n)); o += 12 + n; } return Buffer.concat(parts); };
  for (const f of ['coffee-gps.jpg', 'coffee-orientation6.jpg', 'flower.jpg', 'exif_gps.jpg', 'astronaut.png', 'chelsea.png', 'pug.heic', 'xiaomi.heic']) {
    const src = readFileSync(`${dir}/${f}`);
    const out = Buffer.from(await stripFile(new Blob([src]), f));
    const p = join(tmp, f); writeFileSync(p, out);
    const after = await readTags(new Blob([out]), f), info = P.photoInfo(after), before = P.photoInfo(tagsOf[f]);
    t.eq(info.gps, undefined, `${f}: no position after stripping`);
    const left = info.reveals.filter((r) => !/^the camera or phone/.test(r) || /HEIC/.test(r));
    t.eq(left, [], `${f}: nothing private left (${info.reveals.join('; ') || 'nothing'})`);
    const orient = (x) => x.exposure.find(([k]) => k === 'Orientation')[1];
    t.eq(orient(info) ?? 'Horizontal (normal)', orient(before) ?? 'Horizontal (normal)', `${f}: the orientation stays (${orient(before) ?? 'none'})`);
    const icc = (x) => x['ICC_Profile:ProfileDescription'];
    if (icc(tagsOf[f])) t.eq(icc(after), icc(tagsOf[f]), `${f}: the colour profile stays (${icc(tagsOf[f])})`);
    if (/\.jpe?g$/.test(f)) t.ok(jpegScan(out)?.equals(jpegScan(src)), `${f}: the picture's bytes (scan data) are untouched`);
    if (/\.png$/.test(f)) t.ok(pngIdat(out).equals(pngIdat(src)), `${f}: the picture's bytes (IDAT) are untouched`);
    if (/\.heic$/.test(f)) {
      let same = 'skipped';
      try { same = execFileSync('python3', ['-I', '-c', 'import sys,pillow_heif;from PIL import Image;pillow_heif.register_heif_opener();a=Image.open(sys.argv[1]);b=Image.open(sys.argv[2]);print(a.size==b.size and a.tobytes()==b.tobytes())', `${dir}/${f}`, p]).toString().trim(); } catch { /* pillow-heif missing */ }
      t.ok(same === 'True' || same === 'skipped', `${f}: decoded by Pillow, the same pixels (${same})`);
    }
    if (haveNative) { const n = native(p, ['-json', '-n', '-GPSLatitude', '-Make', '-Model', '-SerialNumber']); t.ok(n && n.GPSLatitude === undefined && n.SerialNumber === undefined, `${f}: the native exiftool finds no position or serial number in the result`); }
    if (f === 'coffee-gps.jpg') { t.eq(info.metadataCount, 0, 'coffee-gps.jpg stripped: no metadata at all'); t.eq(info.reveals, [], '… gives nothing away'); }
  }
  // a PNG with only a date: stripped, no metadata at all
  const cp = Buffer.from(await stripFile(new Blob([readFileSync(`${dir}/coffee.png`)]), 'coffee.png'));
  t.eq(P.photoInfo(await readTags(new Blob([cp]), 'coffee.png')).metadataCount, 0, 'coffee.png stripped: the tIME chunk is gone');
  // a file that is no picture
  let msg = '';
  const txt = await readTags(new Blob([new TextEncoder().encode('hello, not a photo')]), 'x.jpg');
  t.eq(P.notPicture(txt), 'This is not a photo — ExifTool reads it as a TXT file (text/plain).', 'text with a .jpg name: said what it is');
  t.eq(files.map((f) => P.notPicture(tagsOf[f])).filter(Boolean), [], 'every fixture photo is a picture');
  t.eq(P.notPicture({}), 'This file is not a photo ExifTool knows.', 'nothing recognised');
  msg = '';
  try { await readTags(new Blob([]), 'empty.png'); } catch (e) { msg = e.message; }
  t.eq(msg, 'The file is empty (0 bytes).', 'an empty file: refused before ExifTool');
};
