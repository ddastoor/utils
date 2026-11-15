// EXIF reader (JPEG APP1 / PNG eXIf / WebP EXIF) and lossless metadata stripping for JPEG and PNG.
export interface ExifData {
  orientation?: number; make?: string; model?: string; software?: string; dateTime?: string; dateTimeOriginal?: string;
  artist?: string; copyright?: string; lens?: string; exposure?: string; fNumber?: number; iso?: number; focalLength?: number;
  focal35?: number; flash?: string; width?: number; height?: number; gps?: { lat: number; lon: number; alt?: number; time?: string };
  raw: Record<string, string | number>;
}

const TAGS: Record<number, string> = {
  0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution', 0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime',
  0x013b: 'Artist', 0x8298: 'Copyright', 0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
  0x9201: 'ShutterSpeed', 0x9202: 'Aperture', 0x9204: 'ExposureBias', 0x9207: 'MeteringMode', 0x9209: 'Flash', 0x920a: 'FocalLength', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension',
  0xa402: 'ExposureMode', 0xa403: 'WhiteBalance', 0xa405: 'FocalLengthIn35mm', 0xa406: 'SceneCaptureType', 0xa433: 'LensMake', 0xa434: 'LensModel', 0x9010: 'OffsetTime',
};
const GPS: Record<number, string> = { 1: 'GPSLatitudeRef', 2: 'GPSLatitude', 3: 'GPSLongitudeRef', 4: 'GPSLongitude', 5: 'GPSAltitudeRef', 6: 'GPSAltitude', 7: 'GPSTimeStamp', 0x1d: 'GPSDateStamp' };

function parseTiff(b: DataView, base: number): Record<string, any> {
  const le = b.getUint16(base) === 0x4949;
  const u16 = (o: number) => b.getUint16(base + o, le), u32 = (o: number) => b.getUint32(base + o, le), s32 = (o: number) => b.getInt32(base + o, le);
  const out: Record<string, any> = {};
  const SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  const readIfd = (off: number, names: Record<number, string>, depth = 0) => {
    if (depth > 4 || off <= 0 || base + off + 2 > b.byteLength) return;
    const n = u16(off);
    for (let i = 0; i < n && i < 512; i++) {
      const e = off + 2 + i * 12; if (base + e + 12 > b.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (SIZES[type] || 1) * count;
      const vo = size > 4 ? u32(e + 8) : e + 8;
      if (base + vo + size > b.byteLength) continue;
      if (tag === 0x8769 || tag === 0x8825) { readIfd(u32(e + 8), tag === 0x8825 ? GPS : TAGS, depth + 1); continue; }
      const name = names[tag]; if (!name) continue;
      let v: any;
      if (type === 2) v = new TextDecoder().decode(new Uint8Array(b.buffer, b.byteOffset + base + vo, count)).replace(/\0+$/, '').trim();
      else if (type === 3) v = count === 1 ? u16(vo) : Array.from({ length: Math.min(count, 8) }, (_, k) => u16(vo + k * 2));
      else if (type === 4) v = u32(vo);
      else if (type === 5 || type === 10) { const r = (k: number) => (type === 5 ? u32(vo + k * 8) / (u32(vo + k * 8 + 4) || 1) : s32(vo + k * 8) / (s32(vo + k * 8 + 4) || 1)); v = count === 1 ? r(0) : Array.from({ length: Math.min(count, 8) }, (_, k) => r(k)); }
      else if (type === 1 || type === 7) v = count <= 4 ? b.getUint8(base + vo) : undefined;
      if (v !== undefined) out[name] = v;
    }
  };
  readIfd(u32(4), TAGS);
  return out;
}

function exifBlock(bytes: Uint8Array): { view: DataView; base: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let o = 2;
    while (o + 4 < bytes.length && bytes[o] === 0xff) {
      const m = bytes[o + 1], len = v.getUint16(o + 2);
      if (m === 0xe1 && String.fromCharCode(...bytes.subarray(o + 4, o + 8)) === 'Exif') return { view: v, base: o + 10 };
      if (m === 0xda) break;
      o += 2 + len;
    }
  } else if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    let o = 8;
    while (o + 8 < bytes.length) { const len = v.getUint32(o), type = String.fromCharCode(...bytes.subarray(o + 4, o + 8)); if (type === 'eXIf') return { view: v, base: o + 8 }; o += 12 + len; }
  } else if (String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    let o = 12;
    while (o + 8 < bytes.length) { const type = String.fromCharCode(...bytes.subarray(o, o + 4)), len = v.getUint32(o + 4, true); if (type === 'EXIF') { const s = o + 8; return { view: v, base: String.fromCharCode(...bytes.subarray(s, s + 4)) === 'Exif' ? s + 6 : s }; } o += 8 + len + (len & 1); }
  }
  return null;
}

export async function readExif(file: Blob): Promise<ExifData> {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 1 << 20)).arrayBuffer());
  const blk = exifBlock(bytes);
  if (!blk) return { raw: {} };
  let r: Record<string, any> = {};
  try { r = parseTiff(blk.view, blk.base); } catch { /* malformed EXIF */ }
  const dms = (a: any, ref: string) => (Array.isArray(a) ? (a[0] + a[1] / 60 + a[2] / 3600) * (/[SW]/.test(ref || '') ? -1 : 1) : undefined);
  const lat = dms(r.GPSLatitude, r.GPSLatitudeRef), lon = dms(r.GPSLongitude, r.GPSLongitudeRef);
  const flashBits = typeof r.Flash === 'number' ? (r.Flash & 1 ? 'Fired' : 'Did not fire') : undefined;
  return {
    orientation: r.Orientation, make: r.Make, model: r.Model, software: r.Software, dateTime: r.DateTime, dateTimeOriginal: r.DateTimeOriginal,
    artist: r.Artist, copyright: r.Copyright, lens: r.LensModel, iso: Array.isArray(r.ISO) ? r.ISO[0] : r.ISO, fNumber: r.FNumber, focalLength: r.FocalLength, focal35: r.FocalLengthIn35mm,
    exposure: typeof r.ExposureTime === 'number' ? (r.ExposureTime >= 1 ? `${r.ExposureTime} s` : `1/${Math.round(1 / r.ExposureTime)} s`) : undefined,
    flash: flashBits, width: r.PixelXDimension, height: r.PixelYDimension,
    gps: lat !== undefined && lon !== undefined && isFinite(lat) && isFinite(lon) && (lat || lon) ? { lat, lon, alt: r.GPSAltitude, time: r.GPSDateStamp } : undefined,
    raw: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? v.map((x: number) => +x.toFixed?.(6) || x).join(', ') : typeof v === 'number' ? +v.toFixed(6) : v])),
  };
}

/** Remove metadata without re-encoding. JPEG: drops APP1–APP15 (EXIF, XMP, IPTC…) and COM, keeps ICC (APP2) and JFIF.
 *  PNG: drops eXIf, tEXt, zTXt, iTXt, tIME. Returns null for other formats. */
export async function stripMetadata(file: Blob): Promise<Blob | null> {
  const b = new Uint8Array(await file.arrayBuffer()), v = new DataView(b.buffer);
  if (b[0] === 0xff && b[1] === 0xd8) {
    const parts: Uint8Array[] = [b.subarray(0, 2)];
    let o = 2;
    while (o + 4 <= b.length && b[o] === 0xff) {
      const m = b[o + 1];
      if (m === 0xda) { parts.push(b.subarray(o)); break; }
      const len = v.getUint16(o + 2), seg = b.subarray(o, o + 2 + len);
      const isIcc = m === 0xe2 && String.fromCharCode(...b.subarray(o + 4, o + 15)) === 'ICC_PROFILE';
      if (!((m >= 0xe1 && m <= 0xef && !isIcc) || m === 0xfe)) parts.push(seg);
      o += 2 + len;
    }
    return new Blob(parts as BlobPart[], { type: 'image/jpeg' });
  }
  if (b[0] === 0x89 && b[1] === 0x50) {
    const parts: Uint8Array[] = [b.subarray(0, 8)];
    let o = 8;
    while (o + 8 <= b.length) { const len = v.getUint32(o), type = String.fromCharCode(...b.subarray(o + 4, o + 8)); if (!['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'].includes(type)) parts.push(b.subarray(o, o + 12 + len)); o += 12 + len; }
    return new Blob(parts as BlobPart[], { type: 'image/png' });
  }
  return null;
}
