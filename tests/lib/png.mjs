// PNG for the unit suites and the measuring scripts (no DOM there): the fixtures that must stay lossless are saved as
// PNG (a JPEG's blocks change the shape of a blurred letter: pageclean's soft frames). readPng takes 8-bit grey, grey +
// alpha, RGB or RGBA (16 bits too) and palettes (1 – 8 bits: OxiPNG writes them), not interlaced, and returns
// { width, height, data } with data as RGBA, like ImageData; writePng
// writes such a picture — grey when every pixel is (its alpha left out: opaque pictures only).
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

export function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('not a PNG file');
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at), kind = buf.toString('latin1', at + 4, at + 8), body = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'PLTE') plte = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  // grey, grey + alpha, RGB, RGBA (8 or 16 bits: the high byte kept) and a palette (1, 2, 4 or 8 bits — OxiPNG makes those)
  const channels = { 0: 1, 4: 2, 2: 3, 6: 4, 3: 1 }[type];
  const okDepth = type === 3 ? [1, 2, 4, 8].includes(depth) : type === 0 ? [1, 2, 4, 8, 16].includes(depth) : [8, 16].includes(depth);
  if (!channels || !okDepth || interlace || (type === 3 && !plte)) throw new Error(`PNG not read here: depth ${depth}, colour type ${type}, interlace ${interlace}`);
  const bits = channels * depth, bpp = Math.max(1, bits >> 3), stride = Math.ceil((width * bits) / 8);
  const raw = inflateSync(Buffer.concat(idat)), px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error(`PNG row ${y}: filter ${f}`);
      px[row + x] = v & 255;
    }
  }
  /** sample k of row y: the value of a channel (0 – 255 for 8 and 16 bits; the raw value below 8 bits) */
  const sample = (y, k) => {
    if (depth === 8) return px[y * stride + k];
    if (depth === 16) return px[y * stride + 2 * k];
    const bit = k * depth, byte = px[y * stride + (bit >> 3)];
    return (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (type === 3) {
      const n = sample(y, x);
      data[i] = plte[n * 3]; data[i + 1] = plte[n * 3 + 1]; data[i + 2] = plte[n * 3 + 2]; data[i + 3] = trns && n < trns.length ? trns[n] : 255;
    } else if (channels <= 2) {
      const g = depth < 8 ? Math.round((sample(y, x * channels) * 255) / ((1 << depth) - 1)) : sample(y, x * channels);
      data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = channels === 2 ? sample(y, x * 2 + 1) : 255;
    } else {
      data[i] = sample(y, x * channels); data[i + 1] = sample(y, x * channels + 1); data[i + 2] = sample(y, x * channels + 2); data[i + 3] = channels === 4 ? sample(y, x * 4 + 3) : 255;
    }
  }
  return { width, height, data };
}

export function writePng({ width, height, data }) {
  let grey = true;
  for (let i = 0; i < width * height && grey; i++) grey = data[i * 4] === data[i * 4 + 1] && data[i * 4 + 1] === data[i * 4 + 2];
  const ch = grey ? 1 : 3, raw = Buffer.alloc(height * (width * ch + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, o = y * (width * ch + 1) + 1 + x * ch;
    raw[o] = data[i]; if (!grey) { raw[o + 1] = data[i + 1]; raw[o + 2] = data[i + 2]; }
  }
  const chunk = (kind, body) => {
    const b = Buffer.alloc(12 + body.length);
    b.writeUInt32BE(body.length, 0); b.write(kind, 4, 'latin1'); body.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
    return b;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = grey ? 0 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
