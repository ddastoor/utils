// EXIF / Photo Info: everything a photo says about itself — camera, date, place, serial numbers, names, previews —
// read by ExifTool (13.42, WebAssembly, in a worker: src/lib/exiftool-client.ts), and the photo saved without it
// (ExifTool too: the picture's bytes untouched, the colour profile and orientation kept). Formats ExifTool cannot
// write are re-saved as a JPEG.
import { h, card, button, stack, note, clear, fmtBytes, baseName, downloadBlob, shareOrDownload, toast, errMsg, type Mount } from '../ui';
import { loadImg, encodeImg, previewOf, paint } from '../lib/imgio';
import { imageInfoOf, imagePicker } from '../lib/imgtools';
import { readPhotoTags, stripPhoto } from '../lib/exiftool-client';
import { photoInfo, gpsOf, isMetadata, notPicture } from '../lib/photoinfo';
import { toDecimal, toDMS } from '../lib/coords';

const kv = (rows: Array<[string, unknown]>) => {
  const r = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
  return r.length ? h('dl', { class: 'kv' }, r.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, String(v))])) : null;
};
const EXT_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff', gif: 'image/gif' };
const extOf = (name: string) => (/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1] || '').toLowerCase();

export const exif: Mount = (root, ctx) => {
  const out = h('div', { class: 'stack' });
  let seq = 0, loaded = false;
  const show = async (file: File, fromCamera = false) => {
    const my = ++seq;
    clear(out);
    const thumb = h('canvas', { class: 'exif-thumb', 'aria-label': file.name });
    const status = h('div', { class: 'muted small', 'aria-live': 'polite' }, `Reading the metadata…${loaded ? '' : ' (the first photo loads ExifTool, about 8 MB)'}`);
    const head = card(null, thumb, kv([['File', file.name], ['Size', fmtBytes(file.size)], ['Type', file.type || extOf(file.name).toUpperCase() || '—']]), status);
    out.append(head);
    // the picture and its size while ExifTool reads (a RAW file or a damaged one may have no picture to show)
    loadImg(file).then((img) => { if (my === seq) paint(previewOf(img, 480), thumb); }).catch(() => { thumb.hidden = true; });
    const dims = imageInfoOf(file);
    let tags;
    try { tags = await readPhotoTags(file); loaded = true; }
    catch (e) { if (my === seq) status.textContent = `This file could not be read: ${errMsg(e)}`; return; }
    if (my !== seq) return;
    const not = notPicture(tags);
    if (not) { status.textContent = not; thumb.hidden = true; return; }
    const x = photoInfo(tags), d = await dims;
    if (my !== seq) return;
    status.textContent = '';
    if (d) head.append(kv([['Pixels', `${d.width} × ${d.height} (${((d.width * d.height) / 1e6).toFixed(1)} MP)`]])!);
    const groups = x.groups.filter(([g]) => !/^(File|Composite)$/.test(g));
    out.append(h('div', { class: 'stack' },
      // a photo taken here: the browser hands the page the picture alone (owner, 21 Nov 2026: the camera here too)
      fromCamera ? note('Taken here in the browser: a browser hands a page only the picture, so this photo carries no camera details, date or location. A photo from your phone\'s own camera app does — choose one from the gallery to see what it gives away.', 'info')
      : x.metadataCount === 0 ? note('This photo carries no metadata — no camera details, date or location.', 'ok')
        : note(h('div', null, h('strong', null, 'This photo gives away:'), h('ul', null, x.reveals.length ? x.reveals.map((r) => h('li', null, r)) : [h('li', null, `${x.metadataCount} metadata tags (see All tags)`)]), 'Save it without metadata before sharing it publicly.'), 'warn'),
      x.gps ? card('Location (GPS)',
        kv([['Latitude', `${toDecimal(x.gps.lat)} (${toDMS(x.gps.lat, 'lat')})`], ['Longitude', `${toDecimal(x.gps.lon)} (${toDMS(x.gps.lon, 'lon')})`], ['Altitude', x.gps.alt !== undefined ? `${x.gps.alt.toFixed(1)} m` : undefined], ['GPS time', x.gps.time]]),
        h('a', { href: `https://www.openstreetmap.org/?mlat=${toDecimal(x.gps.lat)}&mlon=${toDecimal(x.gps.lon)}#map=16/${toDecimal(x.gps.lat)}/${toDecimal(x.gps.lon)}`, target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-secondary btn-sm' }, 'Open in OpenStreetMap ↗')) : null,
      x.camera.some(([, v]) => v) ? card('Camera', kv(x.camera)) : null,
      x.exposure.some(([, v]) => v) ? card('Exposure', kv(x.exposure)) : null,
      h('details', { class: 'card' }, h('summary', null, `All tags (${groups.reduce((n, [, r]) => n + r.length, 0)})`),
        ...groups.map(([g, rows]) => h('div', { class: 'stack' }, h('h4', null, g), kv(rows)))),
      x.warning ? note(`ExifTool: ${x.warning}`, 'warn') : null,
      card('Remove metadata', stack(
        note('Removes the camera details, date, location, names, serial numbers, previews and comments without re-compressing the picture. The colour profile and the orientation stay.'),
        h('div', { class: 'actions' }, button('Save without metadata', () => saveClean(file), { variant: 'primary', icon: 'ShieldCheck' })))),
    ));
  };
  /** ExifTool writes the file without metadata; the result is read again to make sure nothing private is left.
   *  A format ExifTool cannot write (BMP …) is re-saved as a high-quality JPEG. */
  const saveClean = async (file: File) => {
    let blob: Blob, name: string, how: string;
    const ext = extOf(file.name) || 'jpg';
    try {
      const bytes = await stripPhoto(file);
      blob = new Blob([bytes as BlobPart], { type: file.type || EXT_MIME[ext] || 'application/octet-stream' });
      name = `${baseName(file.name)}-clean.${ext}`; how = 'picture untouched';
    } catch (e) {
      blob = await encodeImg(await loadImg(file), 'jpeg', 92);
      name = `${baseName(file.name)}-clean.jpg`; how = `re-saved as JPEG — ${errMsg(e)}`;
    }
    const left = await readPhotoTags(new File([blob], name, { type: blob.type }));
    if (gpsOf(left)) throw new Error('The location could not be removed from this file — do not share it.');
    const rest = Object.keys(left).filter(isMetadata).filter((k) => !/:(Orientation|XResolution|YResolution|ResolutionUnit|YCbCrPositioning|ExifByteOrder|XMPToolkit)$/.test(k) && !/^XMP-(HDRGainMap|apdi|hdrgm)$/.test(k.split(':')[0]));
    ctx.isMobile ? await shareOrDownload(blob, name) : downloadBlob(blob, name);
    toast(`Saved ${fmtBytes(blob.size)} without metadata (${how})${rest.length ? ` — ${rest.length} technical tags stay` : ''}`, 'ok');
  };
  root.append(card(null, imagePicker({ accept: 'image/*,.heic,.heif,.dng,.tif,.tiff', label: 'Choose a photo', hint: 'JPG, PNG, WebP, HEIC, TIFF, DNG — nothing is uploaded', onFiles: (f, how) => show(f[0], how === 'camera').catch((e) => toast(errMsg(e), 'err')) })), out);
};
