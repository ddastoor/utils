// Clipart Maker (potentials #117; owner, 26 Nov 2026: "a new clipart maker app. User should be able to upload a picture and you should
// convert the picture into a clip art as best you can."). A photo → the subject cut out (U²-Net small on ONNX Runtime), its texture
// smoothed away, its shapes in a few flat colours (k-means in CIE Lab, specks taken in, edges evened out — imgproc.wasm), traced into
// smooth shapes (VTracer, vtracer.wasm) — all in src/workers/vector.worker.ts — and put together in a style here (src/lib/clipart.ts):
// flat, cartoon, sticker, line art or silhouette. SVG (any size) and PNG at a size.
import { h, card, button, toggle, segmented, slider, note, downloadBlob, toast, errMsg, actions, field, select, progress, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import { paint } from '../lib/imgio';
import { clipParts, type ClipResult } from '../lib/vector-client';
import { clipSvg, STYLES, type ClipStyle, type ClipStyleName } from '../lib/clipart';
import type { Img } from '../wasm/imgproc';
import './clipart.css';

type Detail = 'fine' | 'medium' | 'bold';
const DETAIL: Record<Detail, { label: string; area: number; size: number }> = {
  fine: { label: 'Fine', area: 0.0005, size: 1024 },
  medium: { label: 'Medium', area: 0.0012, size: 800 },
  bold: { label: 'Bold', area: 0.003, size: 640 },
};
const STYLE_LABEL: Array<[ClipStyleName, string]> = [['cartoon', 'Cartoon'], ['flat', 'Flat'], ['sticker', 'Sticker'], ['lineart', 'Line art'], ['silhouette', 'Silhouette']];
const STYLE_SAYS: Record<ClipStyleName, string> = {
  cartoon: 'Flat colours, a black outline and ink lines for the details.',
  flat: 'Flat colours only — for icons and slides.',
  sticker: 'Flat colours and ink lines, an outline in a darker shade, a white border and a soft shadow.',
  lineart: 'Only the lines, on white — a colouring page.',
  silhouette: 'The shape of the subject in one colour.',
};
/** kept while the page is open (nothing is stored) */
const kept = { style: 'cartoon' as ClipStyleName, cut: true, colors: 12, detail: 'medium' as Detail, look: { ...STYLES.cartoon, ink: '#1b1b1b' } };

export const mount: Mount = (root, ctx) => {
  let src: Img | null = null, name = 'clipart', photo = '', parts: ClipResult | null = null, svg = '', seq = 0, timer = 0, gone = false, comparing = false;
  const status = h('div', { class: 'muted small ca-status', 'aria-live': 'polite' });
  const prog = progress();
  const view = h('div', { class: 'ca-view', role: 'img', 'aria-label': 'The clip art' });
  const origCanvas = h('canvas', { class: 'ca-orig', hidden: true, 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const info = h('div', { class: 'muted small' });

  const input = imageInput(async (img, file) => {
    name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}-clipart`; photo = file.name;
    src = img; parts = null;
    result.hidden = false;
    void make();
  }, { paste: true });

  // ---------------------------------------------------------------- making it (the worker); the newest settings win
  const make = async () => {
    if (!src) return;
    const my = ++seq;
    status.textContent = 'Making the clip art…'; prog.set(null, '');
    try {
      const r = await clipParts(src, { cut: kept.cut, colors: kept.colors, detail: DETAIL[kept.detail].area, size: DETAIL[kept.detail].size }, (p) => {
        if (my !== seq || gone) return;
        if (p.phase === 'fetch') prog.set((p.done ?? 0) / (p.total ?? 1), `Fetching the cut-out model (${mb(p.done ?? 0)} of ${mb(p.total ?? 0)} MB, once a visit)…`);
        else if (p.phase === 'cut') { prog.set(null, ''); status.textContent = 'Cutting the subject out…'; }
        else { prog.set(null, ''); status.textContent = 'Flat colours and shapes…'; }
      });
      if (my !== seq || gone) return;
      prog.hidden = true;
      parts = r;
      const [cx, cy, cw, ch] = r.crop;
      paintOrig(Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch));
      status.textContent = kept.cut && !r.found ? 'No subject stood out from its background: the whole photo was used.' : kept.cut ? `The subject was cut out (${Math.round(r.share * 100)} % of the photo).` : 'The whole photo, background and all.';
      compose();
    } catch (e) {
      if (my === seq && !gone) { prog.hidden = true; status.textContent = `The clip art could not be made — ${errMsg(e)}`; }
    }
  };
  const mb = (n: number) => (n / 1e6).toFixed(1);
  const paintOrig = (x: number, y: number, w: number, hh: number) => {
    if (!src) return;
    const full = paint(src, h('canvas') as HTMLCanvasElement);
    origCanvas.width = w; origCanvas.height = hh;
    origCanvas.getContext('2d')!.drawImage(full, x, y, w, hh, 0, 0, w, hh);
  };
  /** the clip art put together in the style chosen (instant: nothing is traced again) */
  const compose = () => {
    if (!parts) return;
    svg = clipSvg(parts, { style: kept.style, ...kept.look } as ClipStyle);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const im = h('img', { src: url, alt: `The clip art of ${photo}`, class: 'ca-svg' }) as HTMLImageElement;
    im.onload = () => URL.revokeObjectURL(url);
    view.replaceChildren(im, origCanvas);
    const shapes = (parts.shapes.match(/<path\b/g) || []).length;
    info.textContent = `${parts.palette.length} colours · ${shapes.toLocaleString('en-IN')} shapes · ${parts.width} × ${parts.height} · SVG ${(new Blob([svg]).size / 1024).toFixed(0)} KB · made in ${(parts.ms / 1000).toFixed(1)} s`;
    swatches.replaceChildren(...parts.palette.map(([r, g, b]) => h('span', { class: 'ca-sw', style: `background: rgb(${r}, ${g}, ${b})`, title: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}` })));
  };
  const remake = (ms = 300) => { clearTimeout(timer); timer = window.setTimeout(() => void make(), ms); };

  // ---------------------------------------------------------------- the style
  const styleSays = h('p', { class: 'muted small' }, STYLE_SAYS[kept.style]);
  const styleSeg = segmented<ClipStyleName>(STYLE_LABEL, kept.style, (v) => {
    kept.style = v; kept.look = { ...STYLES[v], ink: kept.look.ink };
    styleSays.textContent = STYLE_SAYS[v];
    outlineSeg.value = kept.look.outline; weightSeg.value = String(kept.look.weight) as '1' | '2' | '3';
    borderT.checked = kept.look.border; shadowT.checked = kept.look.shadow; linesT.checked = kept.look.lines; edgesT.checked = kept.look.edges;
    syncLook();
    compose(); // at once: the same tracing in another style
  });
  const outlineSeg = segmented<'none' | 'black' | 'shade'>([['none', 'None'], ['black', 'Black'], ['shade', 'Darker shade']], kept.look.outline, (v) => { kept.look.outline = v; compose(); });
  const weightSeg = segmented<'1' | '2' | '3'>([['1', 'Thin'], ['2', 'Medium'], ['3', 'Thick']], String(kept.look.weight) as '1' | '2' | '3', (v) => { kept.look.weight = +v as 1 | 2 | 3; compose(); });
  const borderT = toggle('A white border round it (a sticker)', kept.look.border, (v) => { kept.look.border = v; compose(); });
  const shadowT = toggle('A soft shadow', kept.look.shadow, (v) => { kept.look.shadow = v; compose(); });
  const linesT = toggle('Ink lines for the details (eyes, a mouth, folds)', kept.look.lines, (v) => { kept.look.lines = v; compose(); });
  const edgesT = toggle('A line round every colour', kept.look.edges, (v) => { kept.look.edges = v; compose(); });
  const inkIn = h('input', { type: 'color', value: kept.look.ink, class: 'ca-ink', 'aria-label': 'Ink colour' }) as HTMLInputElement;
  inkIn.addEventListener('input', () => { kept.look.ink = inkIn.value; compose(); });
  const inkRow = h('label', { class: 'ca-inkrow' }, h('span', null, 'Colour of the lines or the silhouette'), inkIn);
  const outlineField = field('Outline', outlineSeg), weightField = field('Thickness of the lines', weightSeg);
  const syncLook = () => {
    outlineField.hidden = kept.style === 'silhouette' || kept.style === 'lineart';
    weightField.hidden = linesT.hidden = edgesT.hidden = kept.style === 'silhouette';
    inkRow.hidden = !(kept.style === 'silhouette' || kept.style === 'lineart');
  };
  syncLook();
  const colors = slider({ label: 'Colours', min: 3, max: 24, step: 1, value: kept.colors, onChange: (v) => { kept.colors = v; remake(); } });
  const detailSeg = segmented<Detail>((Object.keys(DETAIL) as Detail[]).map((k) => [k, DETAIL[k].label]), kept.detail, (v) => { kept.detail = v; remake(0); });
  const cutT = toggle('Cut the subject out of its background', kept.cut, (v) => { kept.cut = v; remake(0); });

  // ---------------------------------------------------------------- compare, save
  const compare = button('Hold to compare', () => {}, { icon: 'Eye', small: true, variant: 'ghost', title: 'Show the photo while pressed' });
  const showOrig = (on: boolean) => { if (comparing === on || !parts) return; comparing = on; origCanvas.hidden = !on; view.querySelector('.ca-svg')?.toggleAttribute('hidden', on); };
  compare.addEventListener('pointerdown', () => showOrig(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) compare.addEventListener(ev, () => showOrig(false));
  compare.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showOrig(true); } });
  compare.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showOrig(false); } });

  const need = () => { if (!svg) throw new Error(src ? 'The clip art is still being made — a moment.' : 'Choose a photo first.'); };
  const saveSvg = () => { need(); downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`); };
  const pngSize = select<'512' | '1024' | '2048' | '4096'>([['512', '512 px'], ['1024', '1,024 px'], ['2048', '2,048 px'], ['4096', '4,096 px']], '1024', undefined, 'PNG size (the long side)');
  const savePng = async () => {
    need();
    const im = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      im.src = url; await im.decode();
      const w0 = im.naturalWidth, h0 = im.naturalHeight, s = +pngSize.value / Math.max(w0, h0);
      const c = h('canvas', { width: Math.round(w0 * s), height: Math.round(h0 * s) }) as HTMLCanvasElement;
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The PNG could not be made.'))), 'image/png'));
      downloadBlob(blob, `${name}.png`);
    } finally { URL.revokeObjectURL(url); }
  };
  const run2 = (f: () => unknown) => async () => { try { await f(); } catch (e) { toast(errMsg(e), 'err'); } };
  const swatches = h('div', { class: 'ca-swatches', 'aria-hidden': 'true' });
  const result = card('The clip art', view, swatches, info, status, prog,
    h('div', { class: 'row ca-acts' },
      button('Download SVG', run2(saveSvg), { variant: 'primary', icon: 'Download' }),
      h('span', { class: 'ca-png' }, pngSize, button('Save PNG', run2(savePng), { icon: 'Image' })),
      compare));
  result.hidden = true;

  root.append(
    card(null, input.el),
    card('Style', h('div', { class: 'stack' }, h('div', null, field('Style', styleSeg), styleSays), outlineField, weightField,
      h('div', { class: 'stack ca-toggles' }, linesT, edgesT, borderT, shadowT), inkRow)),
    card('Picture', h('div', { class: 'stack' }, cutT, colors, field('Detail', detailSeg))),
    result,
    note('Everything happens on this device: the photo never leaves it. The cut-out model (4.6 MB) is fetched from this site with the first photo.', 'info'),
    ...(ctx.isMobile ? [actions(button('Download SVG', run2(saveSvg), { variant: 'primary', icon: 'Download' }), button('Save PNG', run2(savePng), { icon: 'Image' }))] : []),
  );
  return () => { gone = true; clearTimeout(timer); input.dispose(); };
};
