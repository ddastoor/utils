// EXIF summary + lossless metadata stripping. Parsing and stripping run in metacore.wasm (own C); this file only
// shapes the parsed tags for display. `mc` may be passed explicitly (Node unit tests).
import { metacore, type Metacore } from '../wasm/metacore';

export interface ExifData {
  orientation?: number; make?: string; model?: string; software?: string; dateTime?: string; dateTimeOriginal?: string;
  artist?: string; copyright?: string; lens?: string; exposure?: string; fNumber?: number; iso?: number; focalLength?: number;
  focal35?: number; flash?: string; width?: number; height?: number; gps?: { lat: number; lon: number; alt?: number; time?: string };
  raw: Record<string, string | number>;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Array.isArray(v) && typeof v[0] === 'number' ? v[0] : undefined);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export async function readExif(file: Blob, mc?: Metacore): Promise<ExifData> {
  const m = mc || (await metacore());
  const r: Record<string, any> = m.exif(new Uint8Array(await file.slice(0, Math.min(file.size, 1 << 20)).arrayBuffer()));
  const dms = (a: any, ref: string) => (Array.isArray(a) && a.length >= 3 ? (a[0] + a[1] / 60 + a[2] / 3600) * (/[SW]/.test(ref || '') ? -1 : 1) : undefined);
  const lat = dms(r.GPSLatitude, r.GPSLatitudeRef), lon = dms(r.GPSLongitude, r.GPSLongitudeRef);
  const et = num(r.ExposureTime), flash = num(r.Flash);
  return {
    orientation: num(r.Orientation), make: str(r.Make), model: str(r.Model), software: str(r.Software), dateTime: str(r.DateTime), dateTimeOriginal: str(r.DateTimeOriginal),
    artist: str(r.Artist), copyright: str(r.Copyright), lens: str(r.LensModel), iso: num(r.ISO), fNumber: num(r.FNumber), focalLength: num(r.FocalLength), focal35: num(r.FocalLengthIn35mm),
    exposure: et ? (et >= 1 ? `${et} s` : `1/${Math.round(1 / et)} s`) : undefined,
    flash: flash === undefined ? undefined : flash & 1 ? 'Fired' : 'Did not fire', width: num(r.PixelXDimension), height: num(r.PixelYDimension),
    gps: lat !== undefined && lon !== undefined && isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon) ? { lat, lon, alt: num(r.GPSAltitude), time: str(r.GPSDateStamp) } : undefined,
    raw: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])),
  };
}

/** Remove metadata without re-encoding: JPEG (APP1–APP15 except ICC, COM), PNG (eXIf/tEXt/zTXt/iTXt/tIME),
 *  WebP (EXIF/XMP chunks). Returns null for other formats. */
export async function stripMetadata(file: Blob, mc?: Metacore): Promise<Blob | null> {
  const m = mc || (await metacore());
  const b = new Uint8Array(await file.arrayBuffer());
  const out = m.strip(b);
  if (!out) return null;
  const t = m.sniff(out).type;
  return new Blob([out as BlobPart], { type: t === 'png' ? 'image/png' : t === 'webp' ? 'image/webp' : 'image/jpeg' });
}
