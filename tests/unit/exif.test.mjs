// metacore.wasm (own C): EXIF reader, lossless metadata stripping, JPEG DPI, sniffing — on REAL files + fuzzing.
import { readFileSync } from 'node:fs';
export default async (t, { load, wasm, root }) => {
  const { bindMetacore } = await load('/src/wasm/metacore.ts');
  const { readExif, stripMetadata } = await load('/src/lib/exif.ts');
  const mc = bindMetacore(await wasm('metacore'));
  const raw = (p) => new Uint8Array(readFileSync(`${root}/tests/fixtures/${p}`));
  const fx = (p) => new Blob([raw(p)]);

  // EXIF on real files
  const gps = await readExif(fx('images/coffee-gps.jpg'), mc);
  t.near(gps.gps?.lat ?? 0, 18 + 55 / 60 + 19.56 / 3600, 1e-6, 'GPS latitude (Gateway of India)');
  t.near(gps.gps?.lon ?? 0, 72 + 50 / 60 + 4.8 / 3600, 1e-6, 'GPS longitude');
  t.eq([gps.make, gps.model, gps.exposure, gps.fNumber, gps.iso, gps.dateTimeOriginal], ['SuperToolsCam', 'Fixture One', '1/250 s', 1.8, 200, '2025:12:31 18:45:00'], 'camera fields');
  const bad = await readExif(fx('images/exif_gps.jpg'), mc); // Pillow's deliberately malformed GPS edge case
  t.eq(bad.gps, undefined, 'malformed GPS is rejected, not misreported');
  t.eq((await readExif(fx('images/coffee-orientation6.jpg'), mc)).orientation, 6, 'orientation tag 6');
  const fl = await readExif(fx('images/flower.jpg'), mc);
  t.ok(typeof fl.raw === 'object', 'flower.jpg (real camera EXIF) parses');
  t.eq(Object.keys((await readExif(fx('images/coffee.png'), mc)).raw).length, 0, 'PNG without eXIf → no tags');

  // strip
  const stripped = await stripMetadata(fx('images/coffee-gps.jpg'), mc);
  t.ok(stripped && stripped.size < fx('images/coffee-gps.jpg').size && stripped.type === 'image/jpeg', 'strip removes bytes, stays JPEG');
  t.eq((await readExif(stripped, mc)).gps, undefined, 'no GPS after strip');
  const so6 = await stripMetadata(fx('images/coffee-orientation6.jpg'), mc);
  t.eq((await readExif(so6, mc)).orientation, undefined, 'orientation removed after strip');
  const sb = new Uint8Array(await so6.arrayBuffer()), ob = raw('images/coffee-orientation6.jpg');
  t.ok(sb[0] === 0xff && sb[1] === 0xd8 && sb[sb.length - 2] === 0xff && sb[sb.length - 1] === 0xd9, 'stripped JPEG is SOI..EOI');
  t.eq(Array.from(sb.subarray(sb.length - 4096)), Array.from(ob.subarray(ob.length - 4096)), 'entropy-coded data untouched (lossless)');
  const png = await stripMetadata(fx('images/astronaut.png'), mc);
  const pngText = new TextDecoder('latin1').decode(new Uint8Array(await png.arrayBuffer()));
  t.ok(png.type === 'image/png' && !pngText.includes('tEXt') && !pngText.includes('tIME') && pngText.includes('iCCP') && pngText.includes('IEND'), 'PNG: tEXt/tIME dropped, iCCP kept');
  t.eq(await stripMetadata(new Blob([new Uint8Array([1, 2, 3])]), mc), null, 'unknown format → null');
  t.eq(mc.strip(raw('images/coffee.jpg').subarray(0, 300)), null, 'truncated JPEG header → refused');

  // WebP with EXIF + XMP chunks (built around the real EXIF block of coffee-gps.jpg)
  const j = raw('images/coffee-gps.jpg'); let o = 2; while (!(j[o + 1] === 0xe1)) o += 2 + ((j[o + 2] << 8) | j[o + 3]);
  const exifPayload = j.subarray(o + 4, o + 2 + ((j[o + 2] << 8) | j[o + 3]));
  const chunk = (id, data) => { const pad = data.length & 1; const c = new Uint8Array(8 + data.length + pad); c.set(new TextEncoder().encode(id)); new DataView(c.buffer).setUint32(4, data.length, true); c.set(data, 8); return c; };
  const vp8x = new Uint8Array(10); vp8x[0] = 0x0c; vp8x.set([0x57, 0x02, 0], 4); vp8x.set([0x8f, 0x01, 0], 7); // flags EXIF|XMP, 600×400
  const parts = [chunk('VP8X', vp8x), chunk('VP8L', new Uint8Array([0x2f, 1, 2, 3, 4])), chunk('EXIF', exifPayload), chunk('XMP ', new TextEncoder().encode('<x:xmpmeta/>'))];
  const body = parts.reduce((n, p) => n + p.length, 4);
  const webp = new Uint8Array(8 + body); webp.set(new TextEncoder().encode('RIFF')); new DataView(webp.buffer).setUint32(4, body, true); webp.set(new TextEncoder().encode('WEBP'), 8);
  let w = 12; for (const p of parts) { webp.set(p, w); w += p.length; }
  t.eq(mc.sniff(webp), { type: 'webp', width: 600, height: 400 }, 'WebP VP8X sniff');
  t.near((await readExif(new Blob([webp]), mc)).gps?.lat ?? 0, 18.9221, 1e-4, 'WebP EXIF chunk read');
  const ws = mc.strip(webp), wsText = new TextDecoder('latin1').decode(ws);
  t.ok(!wsText.includes('EXIF') && !wsText.includes('XMP ') && wsText.includes('VP8L'), 'WebP: EXIF and XMP chunks removed');
  t.eq([new DataView(ws.buffer).getUint32(4, true), ws[20] & 0x0c], [ws.length - 8, 0], 'WebP: RIFF size and VP8X flags fixed');

  // sniff + DPI
  t.eq(mc.sniff(raw('images/coffee.jpg')), { type: 'jpeg', width: 600, height: 400 }, 'JPEG sniff');
  t.eq(mc.sniff(raw('images/chelsea.png')), { type: 'png', width: 451, height: 300 }, 'PNG sniff');
  t.eq(mc.sniff(raw('images/pug.heic')).type, 'heic', 'HEIC sniff');
  const dpiJ = mc.jpegDpi(raw('images/coffee.jpg'), 300);
  t.eq([dpiJ[13], (dpiJ[14] << 8) | dpiJ[15], (dpiJ[16] << 8) | dpiJ[17]], [1, 300, 300], 'JFIF density 300 dpi');
  const noJfif = mc.strip(raw('images/coffee-gps.jpg')); // still JFIF? build one without APP0
  const bare = new Uint8Array(noJfif.length - 18); bare.set(noJfif.subarray(0, 2)); bare.set(noJfif.subarray(20), 2);
  const ins = noJfif[2] === 0xff && noJfif[3] === 0xe0 ? mc.jpegDpi(bare, 600) : mc.jpegDpi(noJfif, 600);
  t.ok(ins[2] === 0xff && ins[3] === 0xe0 && ((ins[14] << 8) | ins[15]) === 600, 'JFIF APP0 inserted/updated with 600 dpi');

  // fuzz: truncations and random corruption of real files must never trap or hang
  let rnd = 12345; const rand = () => ((rnd = (rnd * 1103515245 + 12345) >>> 0) / 2 ** 32);
  let crashes = 0;
  for (const f of ['images/coffee-gps.jpg', 'images/flower.jpg', 'images/exif_gps.jpg', 'images/astronaut.png', 'images/pug.heic']) {
    const src = raw(f).subarray(0, 70000);
    for (let i = 0; i < 60; i++) {
      const b = src.slice(0, 20 + Math.floor(rand() * src.length));
      for (let k = 0; k < 1 + i % 12; k++) b[Math.floor(rand() * Math.min(b.length, 2000))] = Math.floor(rand() * 256);
      try { mc.exif(b); mc.strip(b); mc.sniff(b); mc.jpegDpi(b, 72); } catch { crashes++; }
    }
  }
  try { mc.exif(webp.slice(0, 40)); mc.strip(webp.slice(0, 33)); } catch { crashes++; }
  t.eq(crashes, 0, 'fuzzed/truncated inputs: no traps');
};
