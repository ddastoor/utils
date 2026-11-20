// Cartoonizer ("Prisma-like"). Two engines:
//  • Filters — our own C in imgproc.wasm: cartoon (bilateral + k-means + XDoG ink), oil paint (Kuwahara), watercolour,
//    pencil sketch (B/W and colour), comic halftone. Instant; the save is computed again at full size with the same look.
//  • AI art styles — Magenta arbitrary style transfer on TensorFlow.js (WebGL → WebAssembly → CPU), with built-in
//    procedurally drawn "paintings" or any painting the user uploads; Strength blends from the photo's own style.
import { h, card, stack, note, actions, button, segmented, slider, field, filePicker, downloadBlob, shareOrDownload, fmtBytes, baseName, toast, errMsg, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { encodeImg, loadImg, previewOf, paint, onWhite } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { ART_STYLES, artImage } from '../lib/style-art';
import { styleEngine, styleVector, stylize, disposeStyleEngine } from '../lib/style-transfer';

type Fx = 'cartoon' | 'oil' | 'watercolor' | 'sketch' | 'colorsketch' | 'comic';
export const FILTERS: Array<[Fx, string]> = [['cartoon', 'Cartoon'], ['oil', 'Oil paint'], ['watercolor', 'Watercolour'], ['sketch', 'Pencil sketch'], ['colorsketch', 'Colour pencil'], ['comic', 'Comic']];
interface FxOpts { colors: number; lines: number; smooth: number; brush: number; soft: number; dots: number }
const DEFAULTS: FxOpts = { colors: 10, lines: 0.9, smooth: 2, brush: 5, soft: 8, dots: 6 };

/** Apply a filter. Sizes are tuned for images up to 1000 px and grow with larger ones, so preview and full-size save match. */
export async function applyFilter(img: Img, fx: Fx, o: FxOpts): Promise<Img> {
  const s = Math.max(1, Math.max(img.width, img.height) / 1000);
  switch (fx) {
    case 'cartoon': return imgproc('cartoon', img, o.colors, o.lines, o.smooth, s);
    case 'oil': return imgproc('kuwahara', img, Math.max(1, Math.round(o.brush * s)));
    case 'watercolor': return imgproc('watercolor', img, s);
    case 'sketch': return imgproc('sketch', img, Math.max(1, o.soft * s), false);
    case 'colorsketch': return imgproc('sketch', img, Math.max(1, o.soft * s), true);
    case 'comic': return imgproc('halftone', img, Math.max(3, Math.round(o.dots * s)), s);
  }
}

const thumbOf = (img: Img, side: number) => { const c = document.createElement('canvas'); paint(previewOf(img, side), c); return c; };

export const mount: Mount = (root, ctx) => {
  const PREVIEW = ctx.isMobile ? 900 : 1200, SAVE_MAX = ctx.isMobile ? 2400 : 4000;
  let orig: Img | null = null, small: Img | null = null, thumb: Img | null = null, result: Img | null = null, name = 'photo';
  let engine: 'filters' | 'ai' = 'filters', fx: Fx = 'cartoon', styleId = ART_STYLES[0].id, strength = 0.7;
  let aiSide = 512, sideChosen = false;
  const o: FxOpts = { ...DEFAULTS };
  // diagnostic: #/cartoon?backend=wasm (or webgl / cpu) forces a TF.js backend instead of the automatic choice
  const prefer = (new URLSearchParams(location.hash.split('?')[1] || '').get('backend') || undefined) as 'webgl' | 'wasm' | 'cpu' | undefined;
  const vectors = new Map<string, Float32Array>(), styleImgs = new Map<string, Img>();
  const canvas = h('canvas', { class: 'ed-canvas', 'aria-label': 'Result' });
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const editor = h('div', { class: 'stack', hidden: true });
  let tok = 0, renders = 0; // renders: count of finished results (canvas data-n), lets tests wait for a fresh one
  // what the shown result was made from — Save gives the AI result only when it matches the current settings
  let photoN = 0, resultKey = '', aiError = '', aiRunning = false, aiAgain = false, modelReady = false;
  const aiKey = () => `ai|${photoN}|${styleId}|${strength}|${aiSide}`;

  // ---------------------------------------------------------------- rendering
  const render = async () => {
    if (!small) return;
    const my = ++tok;
    try {
      if (engine === 'filters') {
        status.textContent = 'Painting…';
        const t0 = performance.now(), out = await applyFilter(small, fx, o);
        if (my !== tok) return;
        result = out; resultKey = `fx|${photoN}`; paint(out, canvas); canvas.dataset.n = String(++renders);
        status.textContent = `${FILTERS.find((f) => f[0] === fx)![1]} · ${Math.round(performance.now() - t0)} ms`;
      } else {
        // one painting at a time: a change while one is being painted waits for it, and only the newest settings follow
        // (each run takes seconds on WebAssembly; queuing every step of a slider made the last one minutes late)
        if (aiRunning) { aiAgain = true; status.textContent = 'Painting… (your new choice follows)'; return; }
        aiRunning = true; aiError = '';
        try {
          if (!modelReady) status.textContent = 'Loading the style model (≈ 17 MB the first time)…';
          const backend = await styleEngine(prefer);
          modelReady = true;
          if (my !== tok) return;
          // on a real GPU 1024 px takes about a second; on the CPU paths start small (the user can still pick larger)
          if (!sideChosen && backend === 'webgl' && !ctx.isMobile) { aiSide = 1024; sizeSeg.value = '1024'; }
          const key = aiKey();
          status.textContent = 'Reading the painting’s style…';
          const vec = await vectorFor(styleId);
          if (my !== tok) return;
          status.textContent = `Painting your photo… (${backendLabel(backend)})`;
          const r = await stylize(orig!, vec, strength, aiSide);
          if (my !== tok) return;
          result = r.img; resultKey = key; paint(r.img, canvas); canvas.dataset.n = String(++renders);
          status.textContent = `${styleName(styleId)} · ${r.img.width}×${r.img.height} · ${(r.ms / 1000).toFixed(1)} s on ${backendLabel(backend)}`;
        } finally {
          aiRunning = false;
          if (aiAgain) { aiAgain = false; if (engine === 'ai') render(); }
        }
      }
    } catch (e) {
      if (my === tok) { status.textContent = `Could not apply the style: ${errMsg(e)}`; if (engine === 'ai') aiError = errMsg(e); }
    }
  };
  const backendLabel = (b: string) => (b === 'webgl' ? 'the GPU (WebGL)' : b === 'wasm' ? 'WebAssembly' : 'the CPU');
  const styleName = (id: string) => ART_STYLES.find((s) => s.id === id)?.name || 'Your painting';
  const vectorFor = async (id: string) => {
    let v = vectors.get(id);
    if (!v) { v = await styleVector(styleImgs.get(id) || artImage(id)); vectors.set(id, v); }
    return v;
  };

  // ---------------------------------------------------------------- filter tiles (live thumbnails of the user's photo)
  const fxGrid = h('div', { class: 'fx-grid', role: 'radiogroup', 'aria-label': 'Filter' });
  const drawFxTiles = async () => {
    if (!thumb) return;
    fxGrid.replaceChildren(...FILTERS.map(([id, label]) => {
      const c = document.createElement('canvas'); c.width = thumb!.width; c.height = thumb!.height;
      applyFilter(thumb!, id, o).then((t) => paint(t, c)).catch(() => {});
      return h('button', { type: 'button', role: 'radio', 'aria-checked': String(id === fx), class: ['fx-tile', id === fx && 'on'], 'data-fx': id, onclick: () => { fx = id; markOn(fxGrid, id); showParams(); render(); } }, c, h('span', null, label));
    }));
  };
  const markOn = (grid: HTMLElement, id: string) => grid.querySelectorAll<HTMLElement>('.fx-tile').forEach((b) => { const on = (b.dataset.fx || b.dataset.style) === id; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });

  // ---------------------------------------------------------------- filter settings (only the ones the chosen filter uses)
  const sl = (label: string, k: keyof FxOpts, min: number, max: number, step = 1) =>
    slider({ label, min, max, step, value: o[k], onChange: (v) => { o[k] = v; render(); drawFxTiles(); } });
  const params: Record<Fx, HTMLElement[]> = {
    cartoon: [sl('Colours', 'colors', 4, 24), sl('Ink lines', 'lines', 0, 2, 0.1), sl('Smoothing', 'smooth', 1, 5)],
    oil: [sl('Brush size', 'brush', 2, 12)], watercolor: [], sketch: [sl('Stroke softness', 'soft', 2, 20)],
    colorsketch: [sl('Stroke softness', 'soft', 2, 20)], comic: [sl('Dot size', 'dots', 3, 14)],
  };
  const paramBox = h('div', { class: 'stack' });
  const showParams = () => paramBox.replaceChildren(...(params[fx].length ? params[fx] : [note('Watercolour has no settings: it softens, simplifies the colours and adds paper grain.')]));
  const filtersBox = stack(fxGrid, paramBox);

  // ---------------------------------------------------------------- AI styles
  const styleGrid = h('div', { class: 'fx-grid', role: 'radiogroup', 'aria-label': 'Art style' });
  const sizeSeg = segmented<string>((ctx.isMobile ? [['512', '512 px'], ['768', '768 px']] : [['512', '512 px'], ['1024', '1024 px'], ['1600', '1600 px']]) as Array<[string, string]>, String(aiSide), (v) => { aiSide = +v; sideChosen = true; render(); });
  const styleTile = (id: string, label: string, img: Img) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(id === styleId), class: ['fx-tile', id === styleId && 'on'], 'data-style': id, onclick: () => { styleId = id; markOn(styleGrid, id); render(); } }, thumbOf(img, 160), h('span', null, label));
  const own = filePicker({ accept: 'image/*,.heic,.heif', compact: true, label: 'Use your own painting as the style', onFiles: async (f) => {
    try {
      const img = onWhite(previewOf(await loadImg(f[0]), 512)), id = `own${styleImgs.size + 1}`; // a see-through painting on white
      styleImgs.set(id, img); styleId = id;
      styleGrid.append(styleTile(id, 'Your painting', img)); markOn(styleGrid, id); render();
    } catch (e) { toast(`${f[0].name}: ${errMsg(e)}`, 'err'); }
  } });
  styleGrid.append(...ART_STYLES.map((s) => styleTile(s.id, s.name, artImage(s.id))));
  const aiBox = stack(styleGrid, own,
    slider({ label: 'Strength', min: 0, max: 100, step: 5, value: 70, unit: '%', onChange: (v) => { strength = v / 100; render(); } }),
    field('Size', sizeSeg),
    note('Larger sizes give finer brush strokes but take longer. The built-in styles are drawn by this page, not copied from real paintings.'));
  aiBox.hidden = true;

  // ---------------------------------------------------------------- compare + save
  let comparing = false;
  const compare = button('Hold to compare', () => {}, { icon: 'Eye', small: true, variant: 'ghost', title: 'Show the original while pressed' });
  const showOrig = (on: boolean) => { if (!small || comparing === on) return; comparing = on; on ? paint(engine === 'ai' && result ? previewOf(orig!, Math.max(result.width, result.height)) : small, canvas) : result && paint(result, canvas); };
  compare.addEventListener('pointerdown', () => showOrig(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) compare.addEventListener(ev, () => showOrig(false));
  // keyboard: hold Space or Enter on the focused button
  compare.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showOrig(true); } });
  compare.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showOrig(false); } });

  const save = async (share: boolean) => {
    if (!orig) throw new Error('Choose a photo first.');
    if (engine === 'ai' && resultKey !== aiKey())
      throw new Error(aiRunning || !aiError ? 'The painting is still being made — Save again when it is shown.' : `There is no painting to save: ${aiError}`);
    if (!result) throw new Error('The picture is still being made — a moment.');
    let out = result;
    if (engine === 'filters') {
      status.textContent = 'Making the full-size picture…';
      out = await applyFilter(previewOf(orig, SAVE_MAX), fx, o);
    }
    const blob = await encodeImg(out, 'jpeg', 90), fname = `${name}-${engine === 'ai' ? styleName(styleId).toLowerCase().replace(/\W+/g, '-') : fx}.jpg`;
    status.textContent = `Saved ${fmtBytes(blob.size)} · ${out.width}×${out.height}`;
    share ? await shareOrDownload(blob, fname) : downloadBlob(blob, fname);
  };

  const input$ = imageInput((img, f) => {
    img = onWhite(img); // a see-through photo (a cut-out) on white: the filters and the network ignore transparency
    orig = img; name = baseName(f.name); small = previewOf(img, PREVIEW); thumb = previewOf(img, 150); result = null; photoN++; resultKey = '';
    editor.hidden = false; paint(small, canvas); drawFxTiles(); render();
  });
  showParams();
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, canvas), h('div', { class: 'row' }, compare, status)),
    card('Style', stack(
      segmented([['filters', 'Filters'], ['ai', 'AI art styles']], engine, (v) => { engine = v; filtersBox.hidden = v !== 'filters'; aiBox.hidden = v !== 'ai'; render(); }),
      filtersBox, aiBox)),
    actions(button('Save', () => save(false), { variant: 'primary', icon: 'Download' }), ctx.isMobile ? button('Share', () => save(true), { icon: 'Share2' }) : null),
  );
  root.append(card(null, input$.el), editor);
  return () => { input$.dispose(); disposeStyleEngine(); };
};
