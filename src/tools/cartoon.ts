// Cartoonizer ("Prisma-like"). Two engines:
//  • Filters — our own C in imgproc.wasm: cartoon (bilateral + k-means + XDoG ink), oil paint (Kuwahara), watercolour,
//    pencil sketch (B/W and colour), comic halftone. Instant; the save is computed again at full size with the same look.
//  • AI art styles — Magenta arbitrary style transfer on TensorFlow.js (WebGL → WebAssembly → CPU), with built-in
//    procedurally drawn "paintings" or any painting the user uploads; Strength blends from the photo's own style.
//  • Anime looks (28 Nov 2026) — AnimeGAN v2's Hayao, Shinkai and Paprika and the face portrait v2, ONNX graphs on ONNX
//    Runtime Web in a worker (src/lib/anime.ts, src/workers/anime.worker.ts); Strength mixes the drawing with the photo (imgproc).
import { h, card, stack, note, actions, button, segmented, slider, field, downloadBlob, shareOrDownload, fmtBytes, baseName, toast, errMsg, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { encodeImg, loadImg, previewOf, paint, onWhite } from '../lib/imgio';
import { imageInput, imagePicker } from '../lib/imgtools';
import { ART_STYLES, artImage } from '../lib/style-art';
import { styleEngine, styleVector, stylize, disposeStyleEngine } from '../lib/style-transfer';
import { ANIME_STYLES, animeStyle, animeSide } from '../lib/anime';
import { animeDraw } from '../lib/anime-client';
import './cartoon.css';

type Fx = 'cartoon' | 'oil' | 'watercolor' | 'sketch' | 'colorsketch' | 'comic';
export const FILTERS: Array<[Fx, string]> = [['cartoon', 'Cartoon'], ['oil', 'Oil paint'], ['watercolor', 'Watercolour'], ['sketch', 'Pencil sketch'], ['colorsketch', 'Colour pencil'], ['comic', 'Comic']];
/** `detail`: the size (px) a filter's lines, brushes and smoothing are drawn for — finer details at larger values (to-do
 *  #16: "too coarse-grained … more fine-grained with more detail"); the preview and the full-size save scale alike. */
interface FxOpts { colors: number; lines: number; smooth: number; brush: number; soft: number; dots: number; detail: number }
const DEFAULTS: FxOpts = { colors: 14, lines: 0.9, smooth: 2, brush: 5, soft: 8, dots: 6, detail: 2000 };
export const DETAILS: Array<[string, string]> = [['2000', 'Fine'], ['1000', 'Medium'], ['600', 'Bold']];
/** "How cartoony", in grades (to-do #33 — owner, 27 Nov 2026: "In the Cartoonizer app, in the cartoon filter, have some
 *  kind of gradation selection as to less cartoony or more cartoony."): each grade sets the Cartoon filter's colours, ink
 *  lines and smoothing and the Detail together — fewer colours, darker and thicker lines, more smoothing from Subtle to
 *  Extreme. Measured on two photos (the e2e suite holds it): the difference from the photo and the share of flat areas grow
 *  and the photo's edges kept fall from each grade to the next. Medium is the filter's defaults (the look it always had). */
export const GRADES: Array<{ id: string; label: string; colors: number; lines: number; smooth: number; detail: number }> = [
  { id: 'subtle', label: 'Subtle', colors: 32, lines: 0.4, smooth: 1, detail: 2000 },
  { id: 'light', label: 'Light', colors: 20, lines: 0.7, smooth: 2, detail: 2000 },
  { id: 'medium', label: 'Medium', colors: 14, lines: 0.9, smooth: 2, detail: 2000 },
  { id: 'strong', label: 'Strong', colors: 8, lines: 1.3, smooth: 3, detail: 1000 },
  { id: 'extreme', label: 'Extreme', colors: 5, lines: 1.8, smooth: 5, detail: 600 },
];
/** the grade the settings make, or 'custom' (the sliders moved) */
export const gradeOf = (o: { colors: number; lines: number; smooth: number; detail: number }) =>
  GRADES.find((g) => g.colors === o.colors && Math.abs(g.lines - o.lines) < 1e-6 && g.smooth === o.smooth && g.detail === o.detail)?.id ?? 'custom';

/** Apply a filter. Sizes are tuned for pictures of `o.detail` px and grow with larger ones, so preview and full-size save
 *  match (s is at least 0.25: imgproc's smallest scale). */
export async function applyFilter(img: Img, fx: Fx, o: FxOpts): Promise<Img> {
  const s = Math.max(0.25, Math.max(img.width, img.height) / (o.detail || 1000));
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
  let engine: 'filters' | 'ai' | 'anime' = 'filters', fx: Fx = 'cartoon', styleId = ART_STYLES[0].id, strength = 0.7;
  // the painting's size: the network paints strokes of a fixed size in pixels, so a larger painting has finer strokes
  // (to-do #16). Above WHOLE px it is painted in tiles (src/workers/style.worker.ts); never larger than the photo.
  const SIDES: Array<[string, string]> = ctx.isMobile ? [['1536', 'Fine'], ['1024', 'Medium'], ['512', 'Bold']] : [['4096', 'Finest'], ['2048', 'Fine'], ['1024', 'Medium'], ['512', 'Bold']];
  const WHOLE = ctx.isMobile ? 768 : 1024;
  let aiSide = 1024, sideChosen = false;
  const o: FxOpts = { ...DEFAULTS };
  // diagnostic: #/cartoon?backend=wasm (or webgl / cpu) forces a TF.js backend instead of the automatic choice
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const prefer = (query.get('backend') || undefined) as 'webgl' | 'wasm' | 'cpu' | undefined;
  // diagnostic: #/cartoon?tiles=same paints in tiles at every size, with the statistics of the whole picture at the
  // painting's own size — the tiles must then give the one-pass painting back (the e2e suite compares them)
  const sameTiles = query.get('tiles') === 'same';
  const vectors = new Map<string, Float32Array>(), styleImgs = new Map<string, Img>();
  const canvas = h('canvas', { class: 'ed-canvas', 'aria-label': 'Result' });
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const editor = h('div', { class: 'stack', hidden: true });
  let tok = 0, renders = 0; // renders: count of finished results (canvas data-n), lets tests wait for a fresh one
  // what the shown result was made from — Save gives the AI result only when it matches the current settings
  let photoN = 0, resultKey = '', aiError = '', aiRunning = false, aiAgain = false, modelReady = false;
  const aiKey = () => `ai|${photoN}|${styleId}|${strength}|${aiSide}`;
  const sideFor = (img: Img) => Math.min(aiSide, Math.max(img.width, img.height));
  // the anime looks: the size the photo is drawn at (larger: finer lines, longer), the look, how much of it over the photo
  const ANIME_SIDES: Array<[string, string]> = ctx.isMobile ? [['1024', '1024 px'], ['768', '768 px'], ['512', '512 px']] : [['1536', '1536 px'], ['1024', '1024 px'], ['512', '512 px']];
  let animeId = ANIME_STYLES[0].id, animeSize = ctx.isMobile ? 768 : 1024, animeStrength = 1;
  let animeRunning = false, animeAgain = false, animeError = '';
  /** the last drawing, kept so that Strength mixes it again without drawing anew */
  let drawn: { key: string; img: Img; inp: Img; ms: number } | null = null;
  const animeKey = () => `anime|${photoN}|${animeId}|${animeSize}|${animeStrength}`;

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
      } else if (engine === 'anime') {
        // one drawing at a time, as the AI styles: a change meanwhile waits, and only the newest settings follow
        if (animeRunning) { animeAgain = true; status.textContent = 'Drawing… (your new choice follows)'; return; }
        animeRunning = true; animeError = '';
        try {
          const st = animeStyle(animeId), side = animeSide(st, orig!.width, orig!.height, animeSize), dkey = `${photoN}|${st.id}|${side}`, key = animeKey();
          if (!drawn || drawn.key !== dkey) {
            const inp = previewOf(orig!, side), at = Math.max(inp.width, inp.height);
            status.textContent = `Drawing your photo in the ${st.name} look at ${at} px…`;
            const r = await animeDraw(inp, st.id, (p) => {
              if (my !== tok) return;
              status.textContent = p.phase === 'fetch' ? `Fetching the ${st.name} look (${mb(p.done ?? 0)} of ${mb(p.total ?? st.bytes)} MB, once a visit)…` : `Drawing your photo in the ${st.name} look at ${at} px…`;
            });
            drawn = { key: dkey, img: { data: r.data, width: r.width, height: r.height }, inp, ms: r.ms }; // kept even when a newer choice came
          }
          if (my !== tok) return;
          const d = drawn;
          const out = animeStrength >= 1 ? d.img : await imgproc('compositeImg', d.img, new Uint8Array(d.img.width * d.img.height).fill(Math.round(animeStrength * 255)), d.inp);
          if (my !== tok) return;
          result = out; resultKey = key; paint(out, canvas); canvas.dataset.n = String(++renders);
          status.textContent = `${st.name} · ${out.width}×${out.height} · ${(d.ms / 1000).toFixed(1)} s${animeStrength < 1 ? ` · ${Math.round(animeStrength * 100)} %` : ''}`;
        } finally {
          animeRunning = false;
          if (animeAgain) { animeAgain = false; if (engine === 'anime') render(); }
        }
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
          // on a real graphics card Fine (2048 px) takes seconds; on the processor start at Medium (the user can still pick finer)
          if (!sideChosen && backend === 'webgl' && !ctx.isMobile) { aiSide = 2048; sizeSeg.value = '2048'; }
          const key = aiKey();
          status.textContent = 'Reading the painting’s style…';
          const vec = await vectorFor(styleId);
          if (my !== tok) return;
          const side = sideFor(orig!);
          status.textContent = `Painting your photo at ${side} px… (${backendLabel(backend)})`;
          const r = await stylize(orig!, vec, strength, side, sameTiles ? 0 : WHOLE, (f) => { if (my === tok) status.textContent = `Painting your photo at ${side} px… ${Math.round(f * 100)} % (${backendLabel(backend)})`; }, sameTiles ? side : WHOLE);
          if (my !== tok) return;
          result = r.img; resultKey = key; paint(r.img, canvas); canvas.dataset.n = String(++renders);
          status.textContent = `${styleName(styleId)} · ${r.img.width}×${r.img.height} · ${(r.ms / 1000).toFixed(1)} s on ${backendLabel(backend)}`;
        } finally {
          aiRunning = false;
          if (aiAgain) { aiAgain = false; if (engine === 'ai') render(); }
        }
      }
    } catch (e) {
      if (my === tok) { status.textContent = `Could not apply the style: ${errMsg(e)}`; if (engine === 'ai') aiError = errMsg(e); if (engine === 'anime') animeError = errMsg(e); }
    }
  };
  const mb = (n: number) => (n / 1e6).toFixed(1);
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
    slider({ label, min, max, step, value: o[k], onChange: (v) => { o[k] = v; syncGrade(); render(); drawFxTiles(); } });
  const colorsS = sl('Colours', 'colors', 4, 32), linesS = sl('Ink lines', 'lines', 0, 2, 0.1), smoothS = sl('Smoothing', 'smooth', 1, 5);
  const params: Record<Fx, HTMLElement[]> = {
    cartoon: [colorsS, linesS, smoothS],
    oil: [sl('Brush size', 'brush', 2, 12)], watercolor: [], sketch: [sl('Stroke softness', 'soft', 2, 20)],
    colorsketch: [sl('Stroke softness', 'soft', 2, 20)], comic: [sl('Dot size', 'dots', 3, 14)],
  };
  const paramBox = h('div', { class: 'stack' });
  const showParams = () => { gradeBox.hidden = fx !== 'cartoon'; paramBox.replaceChildren(...(params[fx].length ? params[fx] : [note('Watercolour has no settings: it softens, simplifies the colours and adds paper grain.')])); };
  const detailSeg = segmented<string>(DETAILS, String(o.detail), (v) => { o.detail = +v; syncGrade(); render(); drawFxTiles(); });
  // the Cartoon filter's grades (to-do #33): one choice from a little cartoony to very; the sliders and Detail follow it,
  // and moving one of them afterwards makes it a mix of your own
  const gradeSeg = segmented<string>(GRADES.map((g) => [g.id, g.label] as [string, string]), gradeOf(o), (v) => {
    const g = GRADES.find((x) => x.id === v)!;
    o.colors = g.colors; o.lines = g.lines; o.smooth = g.smooth; o.detail = g.detail;
    colorsS.value = g.colors; linesS.value = g.lines; smoothS.value = g.smooth; detailSeg.value = String(g.detail);
    syncGrade(); render(); drawFxTiles();
  });
  const gradeNote = h('div', { class: 'muted small', id: 'cartoon-grade' });
  const syncGrade = () => {
    const id = gradeOf(o), g = GRADES.find((x) => x.id === id);
    gradeSeg.value = id;
    gradeNote.textContent = g ? `${g.colors} colours · ink lines ${g.lines} · smoothing ${g.smooth} · ${DETAILS.find(([v]) => +v === g.detail)![1]} detail`
      : 'Your own mix, from the settings below — pick a grade to start from it again.';
  };
  const gradeBox = stack(field('How cartoony', gradeSeg), gradeNote);
  syncGrade();
  const filtersBox = stack(fxGrid, gradeBox, field('Detail', detailSeg), paramBox);

  // ---------------------------------------------------------------- AI styles
  const styleGrid = h('div', { class: 'fx-grid', role: 'radiogroup', 'aria-label': 'Art style' });
  const sizeSeg = segmented<string>(SIDES, String(aiSide), (v) => { aiSide = +v; sideChosen = true; render(); });
  const styleTile = (id: string, label: string, img: Img) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(id === styleId), class: ['fx-tile', id === styleId && 'on'], 'data-style': id, onclick: () => { styleId = id; markOn(styleGrid, id); render(); } }, thumbOf(img, 160), h('span', null, label));
  const own = imagePicker({ accept: 'image/*,.heic,.heif', compact: true, label: 'Use your own painting as the style', onFiles: async (f) => {
    try {
      const img = onWhite(previewOf(await loadImg(f[0]), 512)), id = `own${styleImgs.size + 1}`; // a see-through painting on white
      styleImgs.set(id, img); styleId = id;
      styleGrid.append(styleTile(id, 'Your painting', img)); markOn(styleGrid, id); render();
    } catch (e) { toast(`${f[0].name}: ${errMsg(e)}`, 'err'); }
  } });
  styleGrid.append(...ART_STYLES.map((s) => styleTile(s.id, s.name, artImage(s.id))));
  const aiBox = stack(styleGrid, own,
    slider({ label: 'Strength', min: 0, max: 100, step: 5, value: 70, unit: '%', onChange: (v) => { strength = v / 100; render(); } }),
    field('Brush strokes', sizeSeg),
    note(`Finer strokes paint the photo larger — ${SIDES.map(([v, l]) => `${l} ${v} px`).join(', ')} (never above the photo's own size) — and take longer, minutes for Finest without a graphics card. The built-in styles are drawn by this page, not copied from real paintings.`));
  aiBox.hidden = true;

  // ---------------------------------------------------------------- anime looks (their tiles: what each look makes of the coffee photo
  // and the astronaut's face — public/data/anime, made by scripts/make-anime-reference.py; fetched when the mode is first opened)
  const animeGrid = h('div', { class: 'fx-grid', role: 'radiogroup', 'aria-label': 'Anime look' });
  const animeTiles = () => {
    if (animeGrid.childElementCount) return;
    animeGrid.append(...ANIME_STYLES.map((s) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(s.id === animeId), class: ['fx-tile', s.id === animeId && 'on'], 'data-style': s.id, title: s.about,
      onclick: () => { animeId = s.id; markOn(animeGrid, s.id); render(); } },
      h('img', { src: new URL(`data/anime/${s.id}.jpg`, document.baseURI).href, alt: '', width: 160, height: s.layout === 'nchw512' ? 160 : 107 }), h('span', null, s.name))));
  };
  const animeSeg = segmented<string>(ANIME_SIDES, String(animeSize), (v) => { animeSize = +v; render(); });
  const animeBox = stack(animeGrid,
    slider({ label: 'Strength', min: 0, max: 100, step: 5, value: 100, unit: '%', onChange: (v) => { animeStrength = v / 100; render(); } }),
    field('Size', animeSeg),
    note(`Hayao, Shinkai and Paprika are AnimeGAN v2’s looks (Tachibana Yoshino — free for non-commercial use); the face portrait is bryandlee’s (MIT), made for a face and drawn at 512 px. Each look is fetched from this site the first time it is chosen (8.6 MB, once a visit). A larger size gives finer lines and takes longer — on a processor tens of seconds at 1024 px; Strength mixes the drawing with your photo.`));
  animeBox.hidden = true;

  // ---------------------------------------------------------------- compare + save
  let comparing = false;
  const compare = button('Hold to compare', () => {}, { icon: 'Eye', small: true, variant: 'ghost', title: 'Show the original while pressed' });
  const showOrig = (on: boolean) => { if (!small || comparing === on) return; comparing = on; on ? paint(engine !== 'filters' && result ? previewOf(orig!, Math.max(result.width, result.height)) : small, canvas) : result && paint(result, canvas); };
  compare.addEventListener('pointerdown', () => showOrig(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) compare.addEventListener(ev, () => showOrig(false));
  // keyboard: hold Space or Enter on the focused button
  compare.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showOrig(true); } });
  compare.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showOrig(false); } });

  const save = async (share: boolean) => {
    if (!orig) throw new Error('Choose a photo first.');
    if (engine === 'ai' && resultKey !== aiKey())
      throw new Error(aiRunning || !aiError ? 'The painting is still being made — Save again when it is shown.' : `There is no painting to save: ${aiError}`);
    if (engine === 'anime' && resultKey !== animeKey())
      throw new Error(animeRunning || !animeError ? 'The drawing is still being made — Save again when it is shown.' : `There is no drawing to save: ${animeError}`);
    if (!result) throw new Error('The picture is still being made — a moment.');
    let out = result;
    if (engine === 'filters') {
      status.textContent = 'Making the full-size picture…';
      out = await applyFilter(previewOf(orig, SAVE_MAX), fx, o);
    }
    const look = engine === 'ai' ? styleName(styleId).toLowerCase().replace(/\W+/g, '-') : engine === 'anime' ? `anime-${animeId}` : fx;
    const blob = await encodeImg(out, 'jpeg', 90), fname = `${name}-${look}.jpg`;
    status.textContent = `Saved ${fmtBytes(blob.size)} · ${out.width}×${out.height}`;
    share ? await shareOrDownload(blob, fname) : downloadBlob(blob, fname);
  };

  const input$ = imageInput((img, f) => {
    img = onWhite(img); // a see-through photo (a cut-out) on white: the filters and the network ignore transparency
    orig = img; name = baseName(f.name); small = previewOf(img, PREVIEW); thumb = previewOf(img, 150); result = null; photoN++; resultKey = ''; drawn = null;
    editor.hidden = false; paint(small, canvas); drawFxTiles(); render();
  });
  showParams();
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, canvas), h('div', { class: 'row' }, compare, status)),
    card('Style', stack(
      segmented([['filters', 'Filters'], ['ai', 'AI art styles'], ['anime', 'Anime looks']], engine, (v) => {
        engine = v; filtersBox.hidden = v !== 'filters'; aiBox.hidden = v !== 'ai'; animeBox.hidden = v !== 'anime';
        if (v === 'anime') animeTiles();
        render();
      }),
      filtersBox, aiBox, animeBox)),
    actions(button('Save', () => save(false), { variant: 'primary', icon: 'Download' }), ctx.isMobile ? button('Share', () => save(true), { icon: 'Share2' }) : null),
  );
  root.append(card(null, input$.el), editor);
  return () => { input$.dispose(); disposeStyleEngine(); };
};
