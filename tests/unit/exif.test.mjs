// EXIF reader + lossless metadata stripping on REAL files.
import { readFileSync } from 'node:fs';
export default async (t, { load, root }) => {
  const { readExif, stripMetadata } = await load('/src/lib/exif.ts');
  const fx = (p) => new Blob([readFileSync(`${root}/tests/fixtures/${p}`)]);
  const gps = await readExif(fx('images/coffee-gps.jpg'));
  t.near(gps.gps?.lat ?? 0, 18 + 55 / 60 + 19.56 / 3600, 1e-6, 'GPS latitude (Gateway of India)');
  t.near(gps.gps?.lon ?? 0, 72 + 50 / 60 + 4.8 / 3600, 1e-6, 'GPS longitude');
  t.eq([gps.make, gps.model, gps.exposure, gps.fNumber, gps.iso, gps.dateTimeOriginal], ['SuperToolsCam', 'Fixture One', '1/250 s', 1.8, 200, '2025:12:31 18:45:00'], 'camera fields');
  const bad = await readExif(fx('images/exif_gps.jpg')); // Pillow's deliberately malformed GPS edge case
  t.eq(bad.gps, undefined, 'malformed GPS is rejected, not misreported');
  const o6 = await readExif(fx('images/coffee-orientation6.jpg'));
  t.eq(o6.orientation, 6, 'orientation tag 6');
  const fl = await readExif(fx('images/flower.jpg'));
  t.ok(Object.keys(fl.raw).length >= 0, 'flower parses without throwing');
  const stripped = await stripMetadata(fx('images/coffee-gps.jpg'));
  t.ok(stripped && stripped.size < fx('images/coffee-gps.jpg').size, 'strip removes bytes');
  t.eq((await readExif(stripped)).gps, undefined, 'no GPS after strip');
  const so6 = await stripMetadata(fx('images/coffee-orientation6.jpg'));
  t.eq((await readExif(so6)).orientation, undefined, 'orientation removed after strip');
  const bytes = new Uint8Array(await so6.arrayBuffer());
  t.ok(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9, 'stripped JPEG is still a valid JPEG (SOI..EOI)');
  const png = await stripMetadata(fx('images/coffee.png'));
  t.ok(png && png.size <= 466706, 'PNG strip works');
  t.eq(await stripMetadata(new Blob([new Uint8Array([1, 2, 3])])), null, 'unknown format → null');
};
