// EXIF / Photo Info: read camera, exposure, date and GPS; remove metadata (lossless for JPEG/PNG).
import { h, card, button, stack, note, clear, filePicker, fmtBytes, baseName, downloadBlob, shareOrDownload, toast, type Mount } from '../ui';
import { readExif, stripMetadata, type ExifData } from '../lib/exif';
import { loadImg, encodeImg } from '../lib/imgio';
import { imageInfoOf } from '../lib/imgtools';

const fmtDate = (s?: string) => (s ? s.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : undefined);
const dms = (v: number, pos: string, neg: string) => {
  const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60;
  return `${d}° ${m}′ ${s.toFixed(2)}″ ${v >= 0 ? pos : neg}`;
};

export const exif: Mount = (root, ctx) => {
  const out = h('div', { class: 'stack' });
  const show = async (file: File) => {
    clear(out);
    const [x, dims] = await Promise.all([readExif(file), imageInfoOf(file)]);
    const url = URL.createObjectURL(file);
    const kv = (rows: Array<[string, unknown]>) => {
      const r = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
      return r.length ? h('dl', { class: 'kv' }, r.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, String(v))])) : null;
    };
    const has = Object.keys(x.raw).length > 0;
    out.append(h('div', { class: 'stack' },
      card(null, h('img', { src: url, alt: file.name, class: 'exif-thumb' }), kv([['File', file.name], ['Size', fmtBytes(file.size)], ['Type', file.type || '—'], ['Pixels', dims ? `${dims.width} × ${dims.height} (${((dims.width * dims.height) / 1e6).toFixed(1)} MP)` : undefined]])),
      !has ? note('This photo has no EXIF metadata (no camera details or location).', 'ok') : null,
      x.gps ? card('Location (GPS)', note('This photo reveals where it was taken. Remove metadata before sharing it publicly.', 'warn'),
        kv([['Latitude', `${x.gps.lat.toFixed(6)} (${dms(x.gps.lat, 'N', 'S')})`], ['Longitude', `${x.gps.lon.toFixed(6)} (${dms(x.gps.lon, 'E', 'W')})`], ['Altitude', x.gps.alt !== undefined ? `${(+x.gps.alt).toFixed(1)} m` : undefined], ['GPS date', x.gps.time]]),
        h('a', { href: `https://www.openstreetmap.org/?mlat=${x.gps.lat.toFixed(6)}&mlon=${x.gps.lon.toFixed(6)}#map=16/${x.gps.lat.toFixed(6)}/${x.gps.lon.toFixed(6)}`, target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-secondary btn-sm' }, 'Open in OpenStreetMap ↗')) : null,
      has ? card('Camera', kv([['Make', x.make], ['Model', x.model], ['Lens', x.lens], ['Software', x.software], ['Artist', x.artist], ['Copyright', x.copyright]])) : null,
      has ? card('Exposure', kv([['Taken', fmtDate(x.dateTimeOriginal || x.dateTime)], ['Shutter', x.exposure], ['Aperture', x.fNumber ? `f/${+x.fNumber.toFixed(1)}` : undefined], ['ISO', x.iso], ['Focal length', x.focalLength ? `${+x.focalLength.toFixed(1)} mm${x.focal35 ? ` (${x.focal35} mm equiv.)` : ''}` : undefined], ['Flash', x.flash], ['Orientation', x.orientation]])) : null,
      has ? h('details', { class: 'card' }, h('summary', null, `All tags (${Object.keys(x.raw).length})`), kv(Object.entries(x.raw))) : null,
      card('Remove metadata', stack(
        note(file.type === 'image/jpeg' || file.type === 'image/png' ? 'Removes EXIF, GPS, XMP and comments without re-compressing the picture (colour profile kept).' : 'This format is re-saved as a high-quality JPEG without metadata.'),
        h('div', { class: 'actions' }, button('Save without metadata', async () => {
          const clean = await strip(file);
          const name = `${baseName(file.name)}-clean.${clean.type === 'image/png' ? 'png' : 'jpg'}`;
          ctx.isMobile ? await shareOrDownload(clean, name) : downloadBlob(clean, name);
          toast(`Saved ${fmtBytes(clean.size)} without metadata`, 'ok');
        }, { variant: 'primary', icon: 'ShieldCheck' })))),
    ));
  };
  root.append(card(null, filePicker({ accept: 'image/*,.heic,.heif', label: 'Choose a photo', hint: 'JPG, PNG, WebP, HEIC — nothing is uploaded', onFiles: (f) => show(f[0]).catch((e) => toast(e.message, 'err')) })), out);
};

/** Lossless strip for JPEG/PNG; re-encode anything else (HEIC, WebP…) to JPEG q92. */
export async function strip(file: File): Promise<Blob> {
  return (await stripMetadata(file)) || encodeImg(await loadImg(file), 'jpeg', 92);
}
export type { ExifData };
