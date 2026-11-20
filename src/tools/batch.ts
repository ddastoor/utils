// Batch Images (PC): resize + convert many images. Squoosh's Lanczos-3 resize in linear light (jSquash), MozJPEG /
// libwebp / OxiPNG encoders, optional per-file size limit, rename pattern, one .zip download.
import { h, card, field, input, segmented, slider, stack, grid2, note, progress, button, toggle, clear, errMsg, filePicker, fmtBytes, baseName, extOf, actions, type Mount } from '../ui';
import { type Img } from '../wasm/imgproc';
import { loadImg, encodeImg, encodeToSize, resizeImg, EXT, type Fmt } from '../lib/imgio';
import { readSide } from '../lib/editor-geom';
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
  let stopped = false;
  const failed = h('div');
  /** The numbers of the form, or the reason one cannot be used. */
  const settings = () => {
    if (mode === 'percent') { const p = Number(a.value); if (!Number.isFinite(p) || p <= 0 || p > 400) throw new Error('The scale is a percentage above 0 and at most 400.'); return [p, 0] as const; }
    if (mode === 'none') return [0, 0] as const;
    const A = readSide(a.value, mode === 'height' ? 'height' : mode === 'long' ? 'long side' : 'width');
    if (typeof A === 'string') throw new Error(A);
    if (mode !== 'exact') return [A, 0] as const;
    const B = readSide(b.value, 'height');
    if (typeof B === 'string') throw new Error(B);
    return [A, B] as const;
  };
  const run = async () => {
    if (!files.length) throw new Error('Add some images first.');
    const [A, B] = settings();
    const maxKB = Number(kb.value);
    if (limit && !(maxKB >= 5)) throw new Error('The size limit is at least 5 KB.');
    results.clear(); clear(failed); stopped = false; stopBtn.hidden = false;
    const t0 = performance.now(); let inBytes = 0, outBytes = 0;
    const bad: string[] = [];
    for (let i = 0; i < files.length && !stopped; i++) {
      const f = files[i];
      prog.set(i / files.length, `${i + 1}/${files.length} · ${f.name}`);
      try {
        let img: Img = await loadImg(f);
        const [W, H] = targetSize(img.width, img.height, mode, A, B);
        if (W !== img.width || H !== img.height) img = await resizeImg(img, W, H);
        const kind: Fmt = fmt === 'keep' ? (/png/.test(f.type) ? 'png' : /webp/.test(f.type) ? 'webp' : 'jpeg') : fmt;
        let blob: Blob, extra = '';
        if (limit && kind !== 'png') { const r = await encodeToSize(img, kind, maxKB * 1024); blob = r.blob; extra = ` · q${r.quality}${r.tooBig ? ' (over the limit — make it smaller)' : ''}`; }
        else blob = await encodeImg(img, kind, quality);
        inBytes += f.size; outBytes += blob.size;
        results.add(`${renameWith(pattern.value, baseName(f.name), i, files.length, W, H)}.${EXT[kind]}`, blob, `${W}×${H}${extra}`);
      } catch (e) { bad.push(`${f.name}: ${errMsg(e)}`); }
    }
    stopBtn.hidden = true;
    if (bad.length) failed.append(note(h('div', null, `${bad.length} image${bad.length === 1 ? '' : 's'} could not be processed:`, h('ul', null, bad.slice(0, 50).map((x) => h('li', null, x)))), 'err'));
    prog.set(1, `${stopped ? 'Stopped' : 'Done'}: ${results.items.length} file${results.items.length === 1 ? '' : 's'}, ${fmtBytes(inBytes)} → ${fmtBytes(outBytes)} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  };
  const stopBtn = button('Stop', () => { stopped = true; }, { icon: 'Square' });
  stopBtn.hidden = true;
  const setFiles = (fs: File[]) => { files = [...files, ...fs]; list.textContent = `${files.length} images · ${fmtBytes(files.reduce((s, f) => s + f.size, 0))}`; };
  root.append(
    card(null, stack(filePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: 'Add images', hint: 'JPG, PNG, WebP, HEIC — any number', onFiles: setFiles }), list,
      button('Clear list', () => { files = []; list.textContent = ''; results.clear(); prog.done(); }, { small: true, variant: 'ghost', icon: 'X' }))),
    card('Resize', stack(
      segmented([['none', 'Keep size'], ['long', 'Long side'], ['width', 'Width'], ['height', 'Height'], ['percent', 'Percent'], ['exact', 'Exact']], mode, (v) => { mode = v; relabel(); }),
      grid2(aField, bField),
      note('Images are never enlarged except in "Exact" mode and Percent above 100. Lanczos-3 resampling in linear light (WebAssembly).'))),
    card('Convert', stack(
      field('Format', segmented([['jpeg', 'JPEG'], ['webp', 'WebP'], ['png', 'PNG'], ['keep', 'Same as input']], fmt, (v) => { fmt = v; }), '"Same as input" keeps PNG and WebP; HEIC, GIF and others become JPEG.'),
      qSlider,
      toggle('Limit file size', false, (v) => { limit = v; kbField.hidden = !v; qSlider.hidden = v; }), kbField,
      field('File names', pattern, '{name} = original name, {n} = number, {w}×{h} = size. Metadata (incl. GPS) is removed.'))),
    actions(button('Process images', run, { variant: 'primary', icon: 'Play' }), stopBtn),
    card('Results', prog, failed, results.el),
  );
  relabel();
  void extOf;
  return () => results.clear();
};
