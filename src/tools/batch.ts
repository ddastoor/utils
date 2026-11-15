// Batch Images (PC): resize + convert many images. imgproc.wasm Lanczos-3 resize, MozJPEG/libwebp/OxiPNG
// encoders, optional per-file size limit, rename pattern, one .zip download.
import { h, card, field, input, segmented, slider, stack, grid2, note, progress, button, toggle, toast, errMsg, filePicker, fmtBytes, baseName, extOf, actions, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { loadImg, encodeImg, encodeToSize, EXT, type Fmt } from '../lib/imgio';
import { resultList } from '../lib/imgtools';

type Mode = 'none' | 'long' | 'width' | 'height' | 'percent' | 'exact';
/** Target size for an image under a resize mode (never upscales unless exact). */
export function targetSize(w: number, h0: number, mode: Mode, a: number, b: number): [number, number] {
  const r = (x: number) => Math.max(1, Math.round(x));
  switch (mode) {
    case 'long': { const s = Math.min(1, a / Math.max(w, h0)); return [r(w * s), r(h0 * s)]; }
    case 'width': { const s = Math.min(1, a / w); return [r(w * s), r(h0 * s)]; }
    case 'height': { const s = Math.min(1, a / h0); return [r(w * s), r(h0 * s)]; }
    case 'percent': return [r((w * a) / 100), r((h0 * a) / 100)];
    case 'exact': return [r(a), r(b)];
    default: return [w, h0];
  }
}
/** "{name}-{n}" style rename: {name} original base name, {n} index (1-based, zero-padded to count), {w} {h}. */
export function renameWith(pattern: string, name: string, i: number, count: number, w: number, h0: number) {
  const pad = String(count).length;
  return (pattern || '{name}').replace(/\{name\}/g, name).replace(/\{n\}/g, String(i + 1).padStart(pad, '0')).replace(/\{w\}/g, String(w)).replace(/\{h\}/g, String(h0)).replace(/[\\/:*?"<>|]+/g, '_');
}

export const mount: Mount = (root, ctx) => {
  let files: File[] = [];
  let mode: Mode = 'long', fmt: Fmt | 'keep' = 'jpeg', quality = 82, limit = false;
  const a = input({ type: 'number', value: 1600, min: 1 }), b = input({ type: 'number', value: 1200, min: 1 });
  const kb = input({ type: 'number', value: 300, min: 5 });
  const pattern = input({ value: '{name}' });
  const list = h('div', { class: 'muted small' });
  const prog = progress();
  const results = resultList({ zipName: () => 'images.zip', isMobile: ctx.isMobile });
  const bField = field('Height (px)', b);
  const aField = field('Long side (px)', a);
  const relabel = () => {
    const L: Record<Mode, string> = { none: '', long: 'Long side (px)', width: 'Width (px)', height: 'Height (px)', percent: 'Scale (%)', exact: 'Width (px)' };
    aField.hidden = mode === 'none'; bField.hidden = mode !== 'exact';
    aField.querySelector('.field-label')!.textContent = L[mode];
    if (mode === 'percent' && +a.value > 400) a.value = '50';
  };
  const qSlider = slider({ label: 'Quality', min: 1, max: 100, value: quality, onInput: (v) => (quality = v) });
  const kbField = field('Maximum size per file (KB)', kb); kbField.hidden = true;
  const run = async () => {
    if (!files.length) throw new Error('Add some images first.');
    results.clear();
    const t0 = performance.now(); let inBytes = 0, outBytes = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      prog.set(i / files.length, `${i + 1}/${files.length} · ${f.name}`);
      try {
        let img: Img = await loadImg(f);
        const [W, H] = targetSize(img.width, img.height, mode, +a.value || 1, +b.value || 1);
        if (W !== img.width || H !== img.height) img = await imgproc('resize', img, W, H);
        const kind: Fmt = fmt === 'keep' ? (/png/.test(f.type) ? 'png' : /webp/.test(f.type) ? 'webp' : 'jpeg') : fmt;
        let blob: Blob, extra = '';
        if (limit && kind !== 'png') { const r = await encodeToSize(img, kind, (+kb.value || 300) * 1024); blob = r.blob; extra = ` · q${r.quality}${r.tooBig ? ' (over limit)' : ''}`; }
        else blob = await encodeImg(img, kind, quality);
        inBytes += f.size; outBytes += blob.size;
        results.add(`${renameWith(pattern.value, baseName(f.name), i, files.length, W, H)}.${EXT[kind]}`, blob, `${W}×${H}${extra}`);
      } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    prog.set(1, `Done: ${results.items.length} files, ${fmtBytes(inBytes)} → ${fmtBytes(outBytes)} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  };
  const setFiles = (fs: File[]) => { files = [...files, ...fs]; list.textContent = `${files.length} images · ${fmtBytes(files.reduce((s, f) => s + f.size, 0))}`; };
  root.append(
    card(null, stack(filePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: 'Add images', hint: 'JPG, PNG, WebP, HEIC — any number', onFiles: setFiles }), list,
      button('Clear list', () => { files = []; list.textContent = ''; results.clear(); prog.done(); }, { small: true, variant: 'ghost', icon: 'X' }))),
    card('Resize', stack(
      segmented([['none', 'Keep size'], ['long', 'Long side'], ['width', 'Width'], ['height', 'Height'], ['percent', 'Percent'], ['exact', 'Exact']], mode, (v) => { mode = v; relabel(); }),
      grid2(aField, bField),
      note('Images are never enlarged except in "Exact" mode. Lanczos-3 resampling (WebAssembly).'))),
    card('Convert', stack(
      field('Format', segmented([['jpeg', 'JPEG'], ['webp', 'WebP'], ['png', 'PNG'], ['keep', 'Same as input']], fmt, (v) => { fmt = v; })),
      qSlider,
      toggle('Limit file size', false, (v) => { limit = v; kbField.hidden = !v; qSlider.hidden = v; }), kbField,
      field('File names', pattern, '{name} = original name, {n} = number, {w}×{h} = size. Metadata (incl. GPS) is removed.'))),
    actions(button('Process images', run, { variant: 'primary', icon: 'Play' })),
    card('Results', prog, results.el),
  );
  relabel();
  void extOf;
  return () => results.clear();
};
