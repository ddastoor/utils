// EXIF / Photo Info: what ExifTool (13.42, compiled to WebAssembly on zeroperl) says about a photo, shaped for the tab —
// the summary cards, what the photo gives away, every tag by group. Pure functions on ExifTool's JSON (-G1), so the
// unit suite can hold them to the native exiftool. String glue (§3a); the reading and the stripping are ExifTool's.

/** -json: one object; -G1: "Group:Tag" keys; -a: duplicates too; -c: coordinates as signed decimals; -m: minor
 *  errors are warnings (a damaged maker note must not hide the rest). */
export const READ_ARGS = ['-json', '-G1', '-a', '-c', '%+.8f', '-m'];
/** Everything out except the colour profile; the orientation and the JFIF density put back (none of them is
 *  private; without the orientation a portrait photo would be shown on its side, without the profile its colours
 *  change). -q -q: ExifTool's warnings would otherwise count as a failure of the write. */
export const STRIP_ARGS = ['-q', '-q', '-m', '-all=', '--icc_profile:all', '-tagsfromfile', '@', '-orientation', '-jfif:all'];

export type Value = string | number | boolean | null | Value[] | { [k: string]: Value };
export type Tags = Record<string, Value>;

/** Groups that describe the file itself (format, size, colour profile, container), not the person or the camera. */
const STRUCTURE = /^(SourceFile|System|ExifTool|File|Composite|JFIF|JFXX|ICC-header|ICC_Profile|ICC-[A-Za-z]+|QuickTime|Meta|ItemList|RIFF|VP8|VP8L|VP8X|GIF|BMP|Adobe|APP14|PNG-pHYs)$/;
/** PNG's own group mixes the image's structure with text chunks (which are metadata). */
const PNG_STRUCTURE = new Set(['ImageWidth', 'ImageHeight', 'BitDepth', 'ColorType', 'Compression', 'Filter', 'Interlace', 'SRGBRendering', 'Gamma', 'WhitePointX', 'WhitePointY', 'RedX', 'RedY', 'GreenX', 'GreenY', 'BlueX', 'BlueY', 'PixelsPerUnitX', 'PixelsPerUnitY', 'PixelUnits', 'BackgroundColor', 'SignificantBits', 'Palette', 'Transparency', 'AnimationFrames', 'AnimationPlays']);

const split = (key: string): [string, string] => { const i = key.indexOf(':'); return i < 0 ? ['', key] : [key.slice(0, i), key.slice(i + 1)]; };
export const isMetadata = (key: string) => {
  const [g, t] = split(key);
  if (!g || STRUCTURE.test(g)) return false;
  if (g === 'PNG') return !PNG_STRUCTURE.has(t);
  return true;
};
const show = (v: Value): string => (Array.isArray(v) ? v.map(show).join(', ') : v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
const filled = (v: Value | undefined) => v !== undefined && v !== null && show(v).trim() !== '';

/** The first value of a tag, by name, in the order of the groups given (then in any group). */
export function pick(tags: Tags, name: string, groups: string[] = []): Value | undefined {
  for (const g of groups) if (filled(tags[`${g}:${name}`])) return tags[`${g}:${name}`];
  for (const [k, v] of Object.entries(tags)) if (split(k)[1] === name && filled(v) && isMetadata(k)) return v;
  return undefined;
}
const pickStr = (tags: Tags, name: string, groups: string[] = []) => { const v = pick(tags, name, groups); return v === undefined ? undefined : show(v).trim(); };

const num = (v: Value | undefined) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : undefined; };

export interface Gps { lat: number; lon: number; alt?: number; time?: string }
/** Where the photo was taken: ExifTool's Composite position (from the GPS IFD, or from XMP), checked to be a place on
 *  Earth — a broken GPS block can hold 4294967295. A position of exactly 0, 0 is a camera's "no fix", not a place. */
export function gpsOf(tags: Tags): Gps | undefined {
  const lat = num(tags['Composite:GPSLatitude'] ?? tags['XMP-exif:GPSLatitude']), lon = num(tags['Composite:GPSLongitude'] ?? tags['XMP-exif:GPSLongitude']);
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return undefined;
  const altText = tags['GPS:GPSAltitude'] ?? tags['Composite:GPSAltitude'] ?? tags['XMP-exif:GPSAltitude']; // GPS's own: all digits
  let alt = num(altText);
  if (alt !== undefined && /below/i.test(show(altText!) + show(tags['GPS:GPSAltitudeRef'] ?? ''))) alt = -Math.abs(alt);
  const time = pickStr(tags, 'GPSDateTime', ['Composite', 'XMP-exif']) ?? pickStr(tags, 'GPSDateStamp', ['GPS']);
  return { lat, lon, alt, time };
}

export interface PhotoInfo {
  gps?: Gps;
  camera: Array<[string, string | undefined]>;
  exposure: Array<[string, string | undefined]>;
  reveals: string[];
  groups: Array<[string, Array<[string, string]>]>;
  metadataCount: number;
  warning?: string;
}

const EXIF = ['ExifIFD', 'IFD0', 'XMP-exif', 'XMP-exifEX', 'XMP-tiff', 'XMP-xmp'];
/** 2025:12:31 18:45:00 → 2025-12-31 18:45:00 (the time zone, when there is one, stays). */
export const fmtDate = (s?: string) => (s ? s.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : undefined);

export function photoInfo(tags: Tags): PhotoInfo {
  const make = pickStr(tags, 'Make', ['IFD0', 'XMP-tiff']), model = pickStr(tags, 'Model', ['IFD0', 'XMP-tiff']);
  const lens = pickStr(tags, 'LensModel', ['ExifIFD', 'XMP-exifEX', 'XMP-aux']) ?? pickStr(tags, 'LensID', ['Composite']);
  const fnum = num(pick(tags, 'FNumber', EXIF));
  const focal = pickStr(tags, 'FocalLength', EXIF), f35 = pickStr(tags, 'FocalLengthIn35mmFormat', EXIF);
  const exp = pickStr(tags, 'ExposureTime', EXIF);
  const taken = pickStr(tags, 'DateTimeOriginal', ['ExifIFD', 'XMP-exif', 'XMP-photoshop']) ?? pickStr(tags, 'CreateDate', ['ExifIFD', 'XMP-xmp', 'QuickTime']) ?? pickStr(tags, 'DateCreated', ['XMP-photoshop', 'IPTC']) ?? pickStr(tags, 'CreationTime', ['PNG']) ?? pickStr(tags, 'ModifyDate', ['IFD0', 'XMP-xmp', 'PNG']);
  const iso = pickStr(tags, 'ISO', EXIF);
  const gps = gpsOf(tags);

  const keys = Object.keys(tags).filter((k) => isMetadata(k) && filled(tags[k]));
  const any = (re: RegExp) => keys.some((k) => re.test(split(k)[1]));
  const reveals: string[] = [];
  if (gps || any(/^(City|Country|Country-PrimaryLocationName|CountryName|State|Province-State|Sub-location|Location|LocationCreated|LocationShown|GPSLatitude|GPSPosition)$/)) reveals.push('where it was taken');
  if (taken) reveals.push('when it was taken');
  if (make || model) reveals.push(`the camera or phone (${[make, model].filter(Boolean).join(' ')})`);
  if (any(/SerialNumber$/)) reveals.push('a serial number of the camera or lens (it ties photos to one device)');
  if (any(/^(Artist|OwnerName|CameraOwnerName|Creator|By-line|Copyright|Rights|Author|XPAuthor)$/)) reveals.push('a person’s name');
  if (any(/^(PersonInImage|RegionName|RegionPersonDisplayName)$/)) reveals.push('the names of people in it');
  if (any(/^(ThumbnailImage|PreviewImage|JpgFromRaw|OtherImage|MPImage\d*)$/)) reveals.push('a small preview picture inside the file (it can show the photo as it was before cropping or editing)');
  if (any(/^(Software|CreatorTool|HistorySoftwareAgent|ProcessingSoftware)$/)) reveals.push('the software it went through');
  if (any(/^(UserComment|ImageDescription|Comment|Description|Title|Caption-Abstract|Keywords|Subject|XPComment|XPSubject|XPTitle|XPKeywords)$/)) reveals.push('a description, comments or keywords');

  const byGroup = new Map<string, Array<[string, string]>>();
  for (const [k, v] of Object.entries(tags)) {
    const [g, t] = split(k);
    if (!g || /^(SourceFile|System|ExifTool)$/.test(g) || !filled(v)) continue;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push([t, show(v)]);
  }
  return {
    gps,
    camera: [['Make', make], ['Model', model], ['Lens', lens], ['Software', pickStr(tags, 'Software', ['IFD0', 'XMP-xmp'])], ['Artist', pickStr(tags, 'Artist', ['IFD0']) ?? pickStr(tags, 'Creator', ['XMP-dc'])], ['Owner', pickStr(tags, 'OwnerName', ['ExifIFD']) ?? pickStr(tags, 'CameraOwnerName', ['ExifIFD'])], ['Serial number', pickStr(tags, 'SerialNumber', ['ExifIFD']) ?? pickStr(tags, 'BodySerialNumber', ['ExifIFD'])], ['Copyright', pickStr(tags, 'Copyright', ['IFD0']) ?? pickStr(tags, 'Rights', ['XMP-dc'])]],
    exposure: [['Taken', fmtDate(taken)], ['Shutter', exp ? `${exp} s` : undefined], ['Aperture', fnum ? `f/${+fnum.toFixed(1)}` : undefined], ['ISO', iso], ['Focal length', focal ? `${focal}${f35 ? ` (${f35} equiv.)` : ''}` : undefined], ['Flash', pickStr(tags, 'Flash', EXIF)], ['Orientation', pickStr(tags, 'Orientation', ['IFD0', 'XMP-tiff'])]],
    reveals,
    groups: [...byGroup.entries()],
    metadataCount: keys.length,
    warning: pickStr(tags, 'Warning', ['ExifTool']) ?? (filled(tags['ExifTool:Warning']) ? show(tags['ExifTool:Warning']) : undefined),
  };
}

/** Why this file is no picture ("" when it is one): ExifTool names what it is — a text file, a PDF, a video. */
export function notPicture(tags: Tags): string {
  const mime = String(tags['File:MIMEType'] ?? ''), type = String(tags['File:FileType'] ?? '');
  if (/^image\//.test(mime)) return '';
  return type ? `This is not a photo — ExifTool reads it as a ${type} file${mime ? ` (${mime})` : ''}.` : 'This file is not a photo ExifTool knows.';
}
/** A safe name for the file inside ExifTool's in-memory file system: the extension decides some formats. */
export const innerName = (name: string) => `photo.${(/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1] || 'jpg').toLowerCase()}`;
/** ExifTool's own words without its "Warning: " / "Error: " prefix and the in-memory path. */
export const exiftoolError = (e: string) => e.replace(/\s+-\s+\/photo\.[a-z0-9]+\s*$/gm, '').replace(/^(Error|Warning): /gm, '').trim();
