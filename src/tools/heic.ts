// HEIC → JPG/PNG/WebP: libheif (C++ → wasm) decodes, MozJPEG/libwebp/OxiPNG encode — all in a worker.
import { h, card, field, segmented, slider, stack, note, progress, toast, errMsg, filePicker, baseName, type Mount } from '../ui';
import { loadImg, encodeImg, EXT, type Fmt } from '../lib/imgio';
import { resultList } from '../lib/imgtools';

export const mount: Mount = (root, ctx) => {
  let fmt: Fmt = 'jpeg', quality = 90;
  const prog = progress();
  const results = resultList({ zipName: () => 'converted-photos.zip', isMobile: ctx.isMobile });
  const qSlider = slider({ label: 'Quality', min: 40, max: 100, value: quality, onInput: (v) => (quality = v) });
  const convert = async (files: File[]) => {
    let i = 0;
    for (const f of files) {
      prog.set(i / files.length, `Converting ${f.name} (${i + 1}/${files.length})…`);
      try {
        const img = await loadImg(f);
        const blob = await encodeImg(img, fmt, quality);
        results.add(`${baseName(f.name)}.${EXT[fmt]}`, blob, `${img.width}×${img.height}`);
      } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
      i++;
    }
    prog.done();
  };
  root.append(
    card(null, stack(
      filePicker({ accept: '.heic,.heif,.avif,image/heic,image/heif,image/*', multiple: true, label: 'Choose HEIC photos', hint: 'iPhone photos (.heic / .heif) — several at once is fine', onFiles: convert }),
      prog)),
    card('Output', stack(
      field('Format', segmented([['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']], fmt, (v) => { fmt = v; qSlider.hidden = v === 'png'; })),
      qSlider,
      note('Photos are converted on this device. Location and camera details are not copied into the new file.'))),
    card('Converted', results.el),
  );
  return () => results.clear();
};
