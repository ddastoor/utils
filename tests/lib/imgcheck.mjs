// Helpers for e2e suites: inspect image files written by the app (no external libraries).
import { readFileSync } from 'node:fs';

export function imageInfo(pathOrBuf) {
  const b = typeof pathOrBuf === 'string' ? readFileSync(pathOrBuf) : Buffer.from(pathOrBuf);
  if (b[0] === 0xff && b[1] === 0xd8) {
    const out = { type: 'jpeg', size: b.length, exif: false, gps: false, dpi: null, width: 0, height: 0, progressive: false };
    let o = 2;
    while (o + 4 < b.length && b[o] === 0xff) {
      const m = b[o + 1], len = b.readUInt16BE(o + 2);
      if (m === 0xe0 && b.toString('latin1', o + 4, o + 8) === 'JFIF' && b[o + 11] === 1) out.dpi = b.readUInt16BE(o + 12);
      if (m === 0xe1 && b.toString('latin1', o + 4, o + 8) === 'Exif') { out.exif = true; if (b.subarray(o, o + len).includes(Buffer.from([0x88, 0x25])) || b.subarray(o, o + len).includes(Buffer.from([0x25, 0x88]))) out.gps = true; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { out.height = b.readUInt16BE(o + 5); out.width = b.readUInt16BE(o + 7); out.progressive = m === 0xc2; }
      if (m === 0xda) break;
      o += 2 + len;
    }
    return out;
  }
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') {
    const out = { type: 'png', size: b.length, width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25], exif: false, dpi: null, chunks: [] };
    let o = 8;
    while (o + 8 <= b.length) { const len = b.readUInt32BE(o), t = b.toString('latin1', o + 4, o + 8); out.chunks.push(t); if (t === 'eXIf') out.exif = true; if (t === 'pHYs' && b[o + 16] === 1) out.dpi = Math.round(b.readUInt32BE(o + 8) * 0.0254); o += 12 + len; }
    return out;
  }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const out = { type: 'webp', size: b.length, width: 0, height: 0, exif: false };
    const c = b.toString('latin1', 12, 16);
    if (c === 'VP8X') { out.width = 1 + b.readUIntLE(24, 3); out.height = 1 + b.readUIntLE(27, 3); }
    else if (c === 'VP8 ') { out.width = b.readUInt16LE(26) & 0x3fff; out.height = b.readUInt16LE(28) & 0x3fff; }
    else if (c === 'VP8L') { const v = b.readUInt32LE(21); out.width = (v & 0x3fff) + 1; out.height = ((v >> 14) & 0x3fff) + 1; }
    out.exif = b.includes(Buffer.from('EXIF'));
    return out;
  }
  return { type: 'unknown', size: b.length };
}

/** Decode a file in the page and sample pixels: returns { width, height, at(x,y) => [r,g,b,a], mean } */
export async function decodeInPage(page, path, points = []) {
  const b64 = readFileSync(path).toString('base64');
  return page.evaluate(async ({ b64, points }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    let s = [0, 0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 4; k++) s[k] += d[i + k];
    const n = d.length / 4;
    const px = points.map(([x, y]) => { const X = Math.round(x * (bmp.width - 1)), Y = Math.round(y * (bmp.height - 1)), i = (Y * bmp.width + X) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; });
    return { width: bmp.width, height: bmp.height, mean: s.map((v) => v / n), px };
  }, { b64, points });
}

/** Names of the entries in a .zip (central directory). */
export function zipEntries(path) {
  const b = readFileSync(path);
  let e = b.length - 22; while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) return null;
  const n = b.readUInt16LE(e + 10); let o = b.readUInt32LE(e + 16); const names = [];
  for (let i = 0; i < n; i++) { const nl = b.readUInt16LE(o + 28), xl = b.readUInt16LE(o + 30), cl = b.readUInt16LE(o + 32); names.push(b.toString('utf8', o + 46, o + 46 + nl)); o += 46 + nl + xl + cl; }
  return names;
}
