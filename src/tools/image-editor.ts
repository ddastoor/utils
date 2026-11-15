// Image Editor: crop, rotate/flip/straighten, resize, adjustments (imgproc.wasm), export with MozJPEG/WebP/OxiPNG,
// quality or target-size, metadata stripped. Live preview runs on a downscaled copy; export re-applies to full size.
import { h, card, field, input, button, segmented, toggle, slider, clear, stack, note, actions, fmtBytes, baseName, downloadBlob, shareOrDownload, type Mount } from '../ui';
import { imgprocDirect, imgproc, type Img, type Adjust } from '../wasm/imgproc';
import { encodeImg, encodeToSize, previewOf, paint, EXT, type Fmt } from '../lib/imgio';
import { imageInput, cropBox } from '../lib/imgtools';

const ADJ: Array<[keyof Adjust | 'sharpen', string, number, number, number]> = [
  ['exposure', 'Exposure', -2, 2, 0.05], ['bright', 'Brightness', -1, 1, 0.01], ['contrast', 'Contrast', -1, 1, 0.01], ['highlights', 'Highlights', -1, 1, 0.01], ['shadows', 'Shadows', -1, 1, 0.01],
  ['sat', 'Saturation', -1, 1, 0.01], ['vib', 'Vibrance', -1, 1, 0.01], ['hue', 'Hue', -180, 180, 1], ['temp', 'Temperature', -1, 1, 0.01], ['tint', 'Tint', -1, 1, 0.01], ['sharpen', 'Sharpen', 0, 3, 0.05],
];

export const mount: Mount = async (root, ctx) => {
  const ip = await imgprocDirect();
  let orig: Img | null = null, name = 'image';
  let turns = 0, fh = false, fv = false, straighten = 0;
  const adj: Record<string, number> = {};
  let fmt: Fmt = 'jpeg', quality = 82, mode: 'quality' | 'size' = 'quality', targetKB = 200;
  let lockRatio = true;
  const canvas = h('canvas', { class: 'ed-canvas' });
  const crop$ = cropBox(canvas);
  const sizeInfo = h('div', { class: 'muted small' });
  const editor = h('div', { class: 'stack', hidden: true });
  const wI = input({ type: 'number', min: 1 }), hI = input({ type: 'number', min: 1 });

  /** quarter turns + flips as EXIF-style orientation codes, applied losslessly in imgproc.wasm */
  const ROT = [1, 6, 3, 8];
  const geoOps = () => [ROT[turns], fh ? 2 : 1, fv ? 4 : 1].filter((o) => o !== 1);
  const geo = (img: Img) => geoOps().reduce((r, o) => ip.orient(r, o), img);
  let base: Img | null = null; // preview-size image after geometry
  const rebuildBase = () => { if (!orig) return; base = geo(previewOf(orig, ctx.isMobile ? 1200 : 1600)); render(); };
  let raf = 0;
  const render = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!base) return;
      let img = base;
      if (straighten) img = ip.rotate(img, straighten, img.width, img.height, 0);
      img = ip.adjust(img, adj as Adjust);
      if (adj.sharpen) img = ip.sharpen(img, adj.sharpen, 1.0);
      paint(img, canvas);
    });
  };
  const fullDims = () => { if (!orig) return [0, 0]; const t = turns % 2; const W = t ? orig.height : orig.width, H = t ? orig.width : orig.height; const c = crop$.active ? crop$.rect(W, H) : { w: W, h: H }; return [Math.round(c.w), Math.round(c.h)]; };
  const syncDims = () => { const [W, H] = fullDims(); wI.value = String(W); hI.value = String(H); };

  const exportImg = async (): Promise<Img> => {
    if (!orig) throw new Error('Open a photo first.');
    let img = orig;
    for (const o of geoOps()) img = await imgproc('orient', img, o);
    if (crop$.active) { const c = crop$.rect(img.width, img.height); img = await imgproc('crop', img, c.x, c.y, c.w, c.h); }
    if (straighten) img = await imgproc('rotate', img, straighten, img.width, img.height, 0);
    const W = +wI.value || img.width, H = +hI.value || img.height;
    if (W !== img.width || H !== img.height) img = await imgproc('resize', img, W, H);
    if (Object.entries(adj).some(([k, v]) => k !== 'sharpen' && v)) img = await imgproc('adjust', img, adj as Adjust);
    if (adj.sharpen) img = await imgproc('sharpen', img, adj.sharpen, Math.max(0.8, img.width / 2000));
    return img;
  };
  const encode = async () => {
    const img = await exportImg();
    if (mode === 'size' && fmt !== 'png') {
      const r = await encodeToSize(img, fmt, targetKB * 1024);
      sizeInfo.textContent = `${fmtBytes(r.blob.size)} at quality ${r.quality}${r.tooBig ? ' — could not reach the target; reduce dimensions' : ''} · ${img.width}×${img.height}`;
      return r.blob;
    }
    const b = await encodeImg(img, fmt, quality);
    sizeInfo.textContent = `${fmtBytes(b.size)} · ${img.width}×${img.height} · ${fmt.toUpperCase()}`;
    return b;
  };
  const outName = () => `${name}-edited.${EXT[fmt]}`;

  const input$ = imageInput((img, file) => {
    orig = img; name = baseName(file.name); turns = 0; fh = fv = false; straighten = 0;
    for (const k of Object.keys(adj)) delete adj[k];
    sliders.forEach((s) => s.reset()); straightenSlider.value = 0;
    crop$.reset(); cropSeg.value = 'off';
    editor.hidden = false; rebuildBase(); syncDims();
    sizeInfo.textContent = `${img.width}×${img.height} · original ${fmtBytes(file.size)}`;
  });

  const sliders = ADJ.map(([k, label, min, max, step]) => slider({ label, min, max, step, value: 0, fmt: (v) => (k === 'hue' ? `${v}°` : k === 'exposure' ? `${v > 0 ? '+' : ''}${v.toFixed(2)} EV` : v.toFixed(2)), onInput: (v) => { adj[k] = v; render(); } }));
  const straightenSlider = slider({ label: 'Straighten', min: -45, max: 45, step: 0.5, value: 0, unit: '°', onInput: (v) => { straighten = v; render(); } });
  const cropSeg = segmented([['off', 'No crop'], ['0', 'Free'], ['1', '1:1'], ['1.3333', '4:3'], ['1.5', '3:2'], ['1.7778', '16:9'], ['0.5625', '9:16'], ['0.8', '4:5']], 'off', (v) => {
    if (v === 'off') crop$.reset(); else { crop$.setEnabled(true); crop$.setAspect(+v); }
    syncDims();
  });
  canvas.addEventListener('pointerup', syncDims);
  crop$.el.addEventListener('pointerup', syncDims);
  wI.addEventListener('input', () => { const [W, H] = fullDims(); if (lockRatio && +wI.value) hI.value = String(Math.max(1, Math.round((+wI.value * H) / W))); });
  hI.addEventListener('input', () => { const [W, H] = fullDims(); if (lockRatio && +hI.value) wI.value = String(Math.max(1, Math.round((+hI.value * W) / H))); });

  const qualitySlider = slider({ label: 'Quality', min: 1, max: 100, value: quality, onInput: (v) => (quality = v) });
  const targetIn = input({ type: 'number', value: targetKB, min: 5, onInput: (v) => (targetKB = +v || 200) });
  const qArea = h('div');
  const renderQ = () => clear(qArea).append(fmt === 'png' ? note('PNG is lossless — OxiPNG optimises it without changing pixels.') : mode === 'quality' ? qualitySlider : field('Maximum file size (KB)', targetIn));

  editor.append(
    card(null, h('div', { class: 'ed-stage' }, crop$.el), sizeInfo),
    card('Crop & rotate', stack(cropSeg,
      h('div', { class: 'row' },
        button('', () => { turns = (turns + 3) % 4; crop$.reset(); cropSeg.value = 'off'; rebuildBase(); syncDims(); }, { icon: 'RotateCcw', title: 'Rotate left' }),
        button('', () => { turns = (turns + 1) % 4; crop$.reset(); cropSeg.value = 'off'; rebuildBase(); syncDims(); }, { icon: 'RotateCw', title: 'Rotate right' }),
        button('', () => { fh = !fh; rebuildBase(); }, { icon: 'FlipHorizontal2', title: 'Flip horizontal' }),
        button('', () => { fv = !fv; rebuildBase(); }, { icon: 'FlipVertical2', title: 'Flip vertical' })),
      straightenSlider)),
    card('Resize', h('div', { class: 'grid2' }, field('Width (px)', wI), field('Height (px)', hI)), toggle('Keep aspect ratio', true, (v) => (lockRatio = v))),
    card('Adjust', h('div', { class: 'adj-grid' }, sliders), button('Reset adjustments', () => { for (const k of Object.keys(adj)) delete adj[k]; sliders.forEach((s) => s.reset()); render(); }, { small: true, icon: 'RotateCcw', variant: 'ghost' })),
    card('Save', stack(
      field('Format', segmented([['jpeg', 'JPEG'], ['webp', 'WebP'], ['png', 'PNG']], fmt, (v) => { fmt = v; renderQ(); })),
      field('Compression', segmented([['quality', 'By quality'], ['size', 'By file size']], mode, (v) => { mode = v; renderQ(); })),
      qArea,
      note('Saved images contain no EXIF/GPS metadata.'))),
    actions(
      button('Save', async () => downloadBlob(await encode(), outName()), { variant: 'primary', icon: 'Download' }),
      ctx.isMobile ? button('Share', async () => shareOrDownload(await encode(), outName()), { icon: 'Share2' }) : null,
      button(ctx.isMobile ? 'Size' : 'Check size', async () => { await encode(); }, { icon: 'Scale', title: 'Check output size' })),
  );
  renderQ();
  root.append(card(null, input$.el), editor);
  return () => { input$.dispose(); cancelAnimationFrame(raf); };
};
