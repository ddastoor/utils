// PNG for the unit suites and the measuring scripts (no DOM there): the fixtures that must stay lossless are saved as
// PNG (a JPEG's blocks change the shape of a blurred letter: pageclean's soft frames). readPng takes 8-bit grey, grey +
// alpha, RGB or RGBA, not interlaced, and returns { width, height, data } with data as RGBA, like ImageData; writePng
// writes such a picture — grey when every pixel is (its alpha left out: opaque pictures only).
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

export function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('not a PNG file');
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at), kind = buf.toString('latin1', at + 4, at + 8), body = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  const channels = { 0: 1, 4: 2, 2: 3, 6: 4 }[type];
  if (depth !== 8 || !channels || interlace) throw new Error(`PNG not read here: depth ${depth}, colour type ${type}, interlace ${interlace}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[row + x - channels] : 0, b = y ? px[row - stride + x] : 0, c = x >= channels && y ? px[row - stride + x - channels] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error(`PNG row ${y}: filter ${f}`);
      px[row + x] = v & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = px.subarray(i * channels, (i + 1) * channels);
    if (channels <= 2) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = s[0]; data[i * 4 + 3] = channels === 2 ? s[1] : 255; }
    else { data[i * 4] = s[0]; data[i * 4 + 1] = s[1]; data[i * 4 + 2] = s[2]; data[i * 4 + 3] = channels === 4 ? s[3] : 255; }
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
