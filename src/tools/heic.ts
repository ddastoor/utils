// HEIC → JPG/PNG/WebP: libheif (C++ → wasm) decodes the primary image, Little CMS (lcms-wasm) turns its colours into
// sRGB with the photo's ICC profile, MozJPEG/libwebp/OxiPNG encode — all in a worker.
import { h, card, field, segmented, slider, stack, note, progress, clear, errMsg, baseName, type Mount } from '../ui';
import { loadImg, encodeImg, EXT, type Fmt } from '../lib/imgio';
import { imagePicker, resultList } from '../lib/imgtools';

export const mount: Mount = (root, ctx) => {
  let fmt: Fmt = 'jpeg', quality = 90;
  const prog = progress();
  const results = resultList({ zipName: () => 'converted-photos.zip', isMobile: ctx.isMobile });
  const qSlider = slider({ label: 'Quality', min: 40, max: 100, value: quality, onInput: (v) => (quality = v) });
  const failed = h('div');
  const convert = async (files: File[]) => {
    let i = 0;
    const bad: string[] = [];
    clear(failed);
    for (const f of files) {
      prog.set(i / files.length, `Converting ${f.name} (${i + 1}/${files.length})…`);
      try {
        const img = await loadImg(f);
        const blob = await encodeImg(img, fmt, quality);
        results.add(`${baseName(f.name)}.${EXT[fmt]}`, blob, `${img.width}×${img.height}`);
      } catch (e) { bad.push(`${f.name}: ${/not supported|decode|Not a readable/i.test(errMsg(e)) ? 'not a photo this tool can read' : errMsg(e)}`); }
      i++;
    }
    if (bad.length) failed.append(note(h('div', null, `${bad.length} file${bad.length === 1 ? '' : 's'} could not be converted:`, h('ul', null, bad.slice(0, 50).map((x) => h('li', null, x)))), 'err'));
    prog.done();
  };
  root.append(
    card(null, stack(
      imagePicker({ accept: '.heic,.heif,.avif,image/heic,image/heif,image/*', multiple: true, label: 'Choose HEIC photos', hint: 'iPhone photos (.heic / .heif) — several at once is fine', onFiles: convert }),
      prog)),
    card('Output', stack(
      field('Format', segmented([['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']], fmt, (v) => { fmt = v; qSlider.hidden = v === 'png'; })),
      qSlider,
      note('Photos are converted on this device. iPhone colours (Display P3) are turned into sRGB with the photo\'s own colour profile, so they look the same everywhere. Location and camera details are not copied into the new file.'))),
    card('Converted', failed, results.el),
  );
  return () => results.clear();
};
