// Watermark, Text on Image and Collage Maker. Pixel work (crop/resize of photos and logos) runs in imgproc.wasm;
// text shaping/rasterising and compositing use the browser's native canvas (compiled C++); encoding uses
// MozJPEG / libwebp / OxiPNG (wasm). Fonts: system fonts + Anton (OFL-1.1) served from this site.
import antonUrl from '@fontsource/anton/files/anton-latin-400-normal.woff2?url';
import { h, card, field, input, textarea, button, segmented, slider, toggle, stack, grid2, note, clear, actions, filePicker, toast, errMsg, baseName, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { loadImg, encodeImg, previewOf, EXT, type Fmt } from '../lib/imgio';
import { imageInput, resultList } from '../lib/imgtools';
import { isIOS } from '../platform';

// ------------------------------------------------------------------ shared
let fontsReady: Promise<void> | null = null;
export const loadFonts = () => (fontsReady ||= (async () => {
  try { const f = new FontFace('Anton', `url(${antonUrl})`); await f.load(); document.fonts.add(f); } catch { /* falls back to system fonts */ }
})());
export const FONTS: Array<[string, string]> = [['Anton, Impact, sans-serif', 'Meme'], ['system-ui, sans-serif', 'Sans'], ['Georgia, "Times New Roman", serif', 'Serif'], ['ui-monospace, Menlo, Consolas, monospace', 'Mono'], ['"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive', 'Script']];
const IOS_MAX = 16_700_000; // iOS Safari canvas pixel limit
/** iOS cannot draw canvases above ~16.7 MP: scale those down (in wasm) before compositing. */
async function fitForCanvas(img: Img): Promise<{ img: Img; scaled: boolean }> {
  const px = img.width * img.height;
  if (!isIOS || px <= IOS_MAX) return { img, scaled: false };
  const s = Math.sqrt(IOS_MAX / px) * 0.98;
  return { img: await imgproc('resize', img, Math.floor(img.width * s), Math.floor(img.height * s)), scaled: true };
}
function canvasOf(img: Img) {
  const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d', { willReadFrequently: true })!;
  g.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return { c, g };
}
const imgOf = (c: OffscreenCanvas, g: OffscreenCanvasRenderingContext2D): Img => { const d = g.getImageData(0, 0, c.width, c.height); return { data: d.data, width: d.width, height: d.height }; };
function toBitmapSource(img: Img) { const { c } = canvasOf(img); return c; }
/** Greedy word wrap using the canvas' own text metrics (handles any script the browser can shape). */
export function wrapLines(g: { measureText(s: string): { width: number } }, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const w of words) {
      const t = line + w;
      if (line && g.measureText(t.trimEnd()).width > maxW && /\S/.test(w)) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = t;
    }
    out.push(line.trimEnd());
  }
  return out;
}
const fmtSeg = (cur: Fmt, on: (v: Fmt) => void) => field('Format', segmented([['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WebP']], cur, on));

// ================================================================== Watermark
type Pos = 'tl' | 'tc' | 'tr' | 'ml' | 'c' | 'mr' | 'bl' | 'bc' | 'br' | 'tile';
export interface WmOpts { kind: 'text' | 'logo'; text: string; font: string; color: string; opacity: number; size: number; pos: Pos; margin: number; angle: number; shadow: boolean; logo: Img | null }
/** Draw the watermark onto a copy of img. Sizes are % of the image's shorter side, so previews match exports. */
export async function applyWatermark(img: Img, o: WmOpts): Promise<Img> {
  const { c, g } = canvasOf(img), W = img.width, H = img.height, S = Math.min(W, H);
  const m = (o.margin / 100) * S;
  let ow = 0, oh = 0, logoSrc: OffscreenCanvas | null = null;
  if (o.kind === 'logo') {
    if (!o.logo) return img;
    ow = Math.max(1, Math.round((o.size * 4 / 100) * S)); oh = Math.max(1, Math.round((ow * o.logo.height) / o.logo.width));
    logoSrc = toBitmapSource(await imgproc('resize', o.logo, ow, oh)); // Lanczos in wasm
  } else {
    await loadFonts();
    g.font = `${Math.max(6, (o.size / 100) * S)}px ${o.font}`;
    ow = g.measureText(o.text).width; oh = (o.size / 100) * S;
  }
  g.globalAlpha = o.opacity;
  const drawAt = (x: number, y: number) => {
    if (logoSrc) g.drawImage(logoSrc, x, y);
    else {
      if (o.shadow) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = oh * 0.12; g.shadowOffsetX = g.shadowOffsetY = oh * 0.04; }
      g.fillStyle = o.color; g.textBaseline = 'top'; g.fillText(o.text, x, y);
      g.shadowColor = 'transparent';
    }
  };
  if (o.pos === 'tile') {
    g.save(); g.translate(W / 2, H / 2); g.rotate((o.angle * Math.PI) / 180);
    const stepX = ow + Math.max(ow * 0.6, S * 0.08), stepY = oh * 3.2, R = Math.hypot(W, H) / 2 + Math.max(ow, oh);
    for (let y = -R, row = 0; y < R; y += stepY, row++) for (let x = -R + (row % 2 ? stepX / 2 : 0); x < R; x += stepX) drawAt(x, y);
    g.restore();
  } else {
    const col = o.pos.length === 1 ? 'c' : o.pos[1], rowc = o.pos[0];
    const x = col === 'l' ? m : col === 'r' ? W - m - ow : (W - ow) / 2;
    const y = rowc === 't' ? m : rowc === 'b' ? H - m - oh : (H - oh) / 2;
    drawAt(o.pos === 'c' ? (W - ow) / 2 : x, o.pos === 'c' ? (H - oh) / 2 : y);
  }
  g.globalAlpha = 1;
  return imgOf(c, g);
}

export const watermark: Mount = (root, ctx) => {
  const files: File[] = [];
  let preview: Img | null = null, fmt: Fmt = 'jpeg';
  const o: WmOpts = { kind: 'text', text: '© My Name', font: FONTS[1][0], color: '#ffffff', opacity: 0.6, size: 5, pos: 'br', margin: 3, angle: -30, shadow: true, logo: null };
  const canvas = h('canvas', { class: 'ed-canvas' });
  const list = h('div', { class: 'muted small' });
  const results = resultList({ zipName: () => 'watermarked.zip', isMobile: ctx.isMobile });
  let tok = 0;
  const redraw = async () => {
    if (!preview) return;
    const my = ++tok, out = await applyWatermark(preview, o);
    if (my !== tok) return;
    canvas.width = out.width; canvas.height = out.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
  };
  const addFiles = async (fs: File[]) => {
    files.push(...fs);
    list.textContent = `${files.length} photo${files.length > 1 ? 's' : ''}: ${files.map((f) => f.name).join(', ')}`;
    if (!preview && files[0]) { preview = previewOf(await loadImg(files[0]), ctx.isMobile ? 900 : 1400); stage.hidden = false; redraw(); }
  };
  const textBox = stack(field('Text', input({ value: o.text, onInput: (v) => { o.text = v; redraw(); } })),
    field('Font', segmented(FONTS.map(([f, l]) => [f, l]) as Array<[string, string]>, o.font, (v) => { o.font = v; redraw(); })),
    field('Colour', input({ type: 'color', value: o.color, onInput: (v) => { o.color = v; redraw(); } })),
    toggle('Shadow (readable on any background)', true, (v) => { o.shadow = v; redraw(); }));
  const logoBox = stack(filePicker({ accept: 'image/*', label: 'Choose a logo', hint: 'PNG with transparency works best', compact: true, onFiles: async (f) => { o.logo = await loadImg(f[0]); redraw(); } }));
  logoBox.hidden = true;
  const angle = slider({ label: 'Tile angle', min: -90, max: 90, value: o.angle, unit: '°', onInput: (v) => { o.angle = v; redraw(); } });
  angle.hidden = true;
  const stage = card(null, h('div', { class: 'ed-stage' }, canvas));
  stage.hidden = true;
  const run = async () => {
    if (!files.length) throw new Error('Add photos first.');
    if (o.kind === 'logo' && !o.logo) throw new Error('Choose a logo image.');
    results.clear();
    for (const f of files) {
      try {
        const { img, scaled } = await fitForCanvas(await loadImg(f));
        const out = await applyWatermark(img, o);
        results.add(`${baseName(f.name)}-watermarked.${EXT[fmt]}`, await encodeImg(out, fmt, 88), `${out.width}×${out.height}${scaled ? ' (reduced for iPhone)' : ''}`);
      } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
  };
  root.append(
    card(null, stack(filePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: 'Add photos', hint: 'one or many — the same watermark goes on all', onFiles: (f) => addFiles(f).catch((e) => toast(errMsg(e), 'err')) }), list)),
    stage,
    card('Watermark', stack(
      segmented([['text', 'Text'], ['logo', 'Logo']], o.kind, (v) => { o.kind = v; textBox.hidden = v !== 'text'; logoBox.hidden = v !== 'logo'; redraw(); }),
      textBox, logoBox,
      field('Position', segmented([['tl', '↖'], ['tc', '↑'], ['tr', '↗'], ['ml', '←'], ['c', '•'], ['mr', '→'], ['bl', '↙'], ['bc', '↓'], ['br', '↘'], ['tile', 'Tiled']], o.pos, (v) => { o.pos = v; angle.hidden = v !== 'tile'; redraw(); })),
      angle,
      slider({ label: 'Size', min: 1, max: 25, step: 0.5, value: o.size, unit: '%', onInput: (v) => { o.size = v; redraw(); } }),
      slider({ label: 'Opacity', min: 5, max: 100, value: o.opacity * 100, unit: '%', onInput: (v) => { o.opacity = v / 100; redraw(); } }),
      slider({ label: 'Margin', min: 0, max: 15, step: 0.5, value: o.margin, unit: '%', onInput: (v) => { o.margin = v; redraw(); } }),
      fmtSeg(fmt, (v) => (fmt = v)))),
    actions(button('Watermark all', run, { variant: 'primary', icon: 'Stamp' })),
    card('Results', results.el),
  );
  loadFonts().then(redraw);
  return () => results.clear();
};

// ================================================================== Text on Image (captions / memes)
export interface CapOpts { top: string; bottom: string; style: 'meme' | 'caption'; font: string; color: string; size: number; stroke: number; band: boolean; align: CanvasTextAlign; upper: boolean }
export async function applyCaption(img: Img, o: CapOpts): Promise<Img> {
  await loadFonts();
  const { c, g } = canvasOf(img), W = img.width, H = img.height;
  const meme = o.style === 'meme';
  const px = Math.max(8, (o.size / 100) * Math.min(W, H) * (meme ? 1.25 : 1));
  g.font = `${px}px ${meme ? FONTS[0][0] : o.font}`;
  g.textAlign = o.align; g.textBaseline = 'top'; g.lineJoin = 'round';
  const maxW = W * 0.92, lineH = px * 1.12, pad = px * 0.35;
  const x = o.align === 'left' ? W * 0.04 : o.align === 'right' ? W * 0.96 : W / 2;
  const block = (text: string, at: 'top' | 'bottom') => {
    if (!text.trim()) return;
    const t = meme || o.upper ? text.toLocaleUpperCase() : text;
    const lines = wrapLines(g, t, maxW), bh = lines.length * lineH;
    const y0 = at === 'top' ? H * 0.03 + (o.band ? pad : 0) : H - H * 0.03 - bh - (o.band ? pad : 0);
    if (o.band && !meme) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, y0 - pad, W, bh + pad * 2); }
    lines.forEach((ln, i) => {
      const y = y0 + i * lineH;
      const sw = meme ? px * 0.14 : (o.stroke / 100) * px;
      if (sw > 0) { g.strokeStyle = '#000'; g.lineWidth = sw; g.strokeText(ln, x, y); }
      g.fillStyle = meme ? '#fff' : o.color; g.fillText(ln, x, y);
    });
  };
  block(o.top, 'top'); block(o.bottom, 'bottom');
  return imgOf(c, g);
}

export const caption: Mount = (root, ctx) => {
  let orig: Img | null = null, preview: Img | null = null, name = 'image', fmt: Fmt = 'jpeg';
  const o: CapOpts = { top: 'When the code works', bottom: 'on the first try', style: 'meme', font: FONTS[1][0], color: '#ffffff', size: 9, stroke: 8, band: false, align: 'center', upper: false };
  const canvas = h('canvas', { class: 'ed-canvas' });
  const editor = h('div', { class: 'stack', hidden: true });
  const info = h('div', { class: 'muted small' });
  let tok = 0;
  const redraw = async () => {
    if (!preview) return;
    const my = ++tok, out = await applyCaption(preview, o);
    if (my !== tok) return;
    canvas.width = out.width; canvas.height = out.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
  };
  const capBox = stack(
    field('Font', segmented(FONTS.slice(1).map(([f, l]) => [f, l]) as Array<[string, string]>, o.font, (v) => { o.font = v; redraw(); })),
    grid2(field('Text colour', input({ type: 'color', value: o.color, onInput: (v) => { o.color = v; redraw(); } })),
      field('Align', segmented([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], 'center', (v) => { o.align = v; redraw(); }))),
    slider({ label: 'Outline', min: 0, max: 25, value: o.stroke, unit: '%', onInput: (v) => { o.stroke = v; redraw(); } }),
    h('div', { class: 'row' }, toggle('Dark band behind text', false, (v) => { o.band = v; redraw(); }), toggle('UPPERCASE', false, (v) => { o.upper = v; redraw(); })));
  capBox.hidden = true;
  const save = async (share: boolean) => {
    if (!orig) throw new Error('Choose a photo first.');
    const { img, scaled } = await fitForCanvas(orig);
    const blob = await encodeImg(await applyCaption(img, o), fmt, 90);
    info.textContent = `${fmtBytes(blob.size)} · ${img.width}×${img.height}${scaled ? ' (reduced for iPhone)' : ''}`;
    const fname = `${name}-caption.${EXT[fmt]}`;
    share ? await shareOrDownload(blob, fname) : downloadBlob(blob, fname);
  };
  const input$ = imageInput((img, f) => { orig = img; name = baseName(f.name); preview = previewOf(img, ctx.isMobile ? 900 : 1400); editor.hidden = false; info.textContent = `${img.width}×${img.height}`; redraw(); });
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, canvas), info),
    card('Text', stack(
      field('Top text', textarea({ rows: 2, value: o.top, onInput: (v: string) => { o.top = v; redraw(); } } as any)),
      field('Bottom text', textarea({ rows: 2, value: o.bottom, onInput: (v: string) => { o.bottom = v; redraw(); } } as any)),
      segmented([['meme', 'Meme style'], ['caption', 'Caption']], o.style, (v) => { o.style = v; capBox.hidden = v !== 'caption'; redraw(); }),
      slider({ label: 'Text size', min: 2, max: 20, step: 0.5, value: o.size, unit: '%', onInput: (v) => { o.size = v; redraw(); } }),
      capBox, fmtSeg(fmt, (v) => (fmt = v)))),
    actions(button('Save', () => save(false), { variant: 'primary', icon: 'Download' }), ctx.isMobile ? button('Share', () => save(true), { icon: 'Share2' }) : null),
  );
  root.append(card(null, input$.el), editor);
  loadFonts().then(redraw);
  return () => input$.dispose();
};

// ================================================================== Collage
/** Cell rectangles (0..1) for n photos in a layout. */
export function collageCells(layout: string, n: number): Array<[number, number, number, number]> {
  const T: Record<string, Array<[number, number, number, number]>> = {
    '2h': [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]], '2v': [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
    '3l': [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]], '3t': [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]],
    '4f': [[0, 0, 1, 0.62], [0, 0.62, 1 / 3, 0.38], [1 / 3, 0.62, 1 / 3, 0.38], [2 / 3, 0.62, 1 / 3, 0.38]],
    '5': [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]],
  };
  if (T[layout] && T[layout].length === n) return T[layout];
  const cols = layout === 'rows' ? 1 : layout === 'cols' ? n : Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const cells: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - cols * (rows - 1) : cols; // last row spreads its photos
    const cIdx = i - r * cols;
    cells.push([cIdx / inRow, r / rows, 1 / inRow, 1 / rows]);
  }
  return cells;
}
/** Centre crop rect (in source px) so a w×h source covers a cw×ch cell. */
export function coverCrop(w: number, hh: number, cw: number, ch: number): [number, number, number, number] {
  const s = Math.max(cw / w, ch / hh), sw = cw / s, sh = ch / s;
  return [(w - sw) / 2, (hh - sh) / 2, sw, sh];
}
export interface CollageOpts { layout: string; W: number; H: number; gap: number; radius: number; bg: string }
export async function renderCollage(imgs: Img[], o: CollageOpts): Promise<Img> {
  const c = new OffscreenCanvas(o.W, o.H), g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = o.bg; g.fillRect(0, 0, o.W, o.H);
  const gap = (o.gap / 100) * Math.min(o.W, o.H), cells = collageCells(o.layout, imgs.length);
  for (let i = 0; i < imgs.length; i++) {
    const [cx, cy, cw, ch] = cells[i];
    const x = Math.round(cx * (o.W - gap) + gap), y = Math.round(cy * (o.H - gap) + gap);
    const w = Math.max(1, Math.round(cw * (o.W - gap) - gap)), hh = Math.max(1, Math.round(ch * (o.H - gap) - gap));
    const [sx, sy, sw, sh] = coverCrop(imgs[i].width, imgs[i].height, w, hh);
    const tile = await imgproc('resize', await imgproc('crop', imgs[i], sx, sy, sw, sh), w, hh); // wasm crop + Lanczos
    const r = (o.radius / 100) * Math.min(w, hh);
    g.save(); g.beginPath(); g.roundRect(x, y, w, hh, r); g.clip();
    g.drawImage(toBitmapSource(tile), x, y);
    g.restore();
  }
  return imgOf(c, g);
}

export const collage: Mount = (root, ctx) => {
  const photos: Array<{ name: string; full: Img; small: Img }> = [];
  let layout = 'auto', size = 'square', fmt: Fmt = 'jpeg';
  const o = { gap: 1.5, radius: 3, bg: '#ffffff' };
  const SIZES: Record<string, [number, number, string]> = { square: [2048, 2048, 'Square 1:1'], portrait: [1638, 2048, 'Portrait 4:5'], landscape: [2048, 1152, 'Landscape 16:9'], story: [1152, 2048, 'Story 9:16'], a4: [2480, 3508, 'A4 print (300 dpi)'] };
  const canvas = h('canvas', { class: 'ed-canvas' });
  const strip = h('div', { class: 'collage-strip' });
  const info = h('div', { class: 'muted small' });
  const stage = card(null, h('div', { class: 'ed-stage' }, canvas), info); stage.hidden = true;
  let tok = 0;
  const dims = (scale: number) => { const [W, H] = SIZES[size]; return { W: Math.round(W * scale), H: Math.round(H * scale) }; };
  const redraw = async () => {
    renderStrip();
    stage.hidden = !photos.length;
    if (!photos.length) return;
    const my = ++tok, d = dims(ctx.isMobile ? 0.35 : 0.5);
    const out = await renderCollage(photos.map((p) => p.small), { layout, ...d, ...o });
    if (my !== tok) return;
    canvas.width = out.width; canvas.height = out.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
    info.textContent = `${photos.length} photos · output ${SIZES[size][0]}×${SIZES[size][1]}`;
  };
  const renderStrip = () => clear(strip).append(...photos.map((p, i) => h('div', { class: 'collage-item' },
    h('span', { class: 'collage-n' }, String(i + 1)), h('span', { class: 'file-name small' }, p.name),
    button('', () => { if (i > 0) { [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]]; redraw(); } }, { icon: 'ArrowUp', small: true, variant: 'ghost', title: `Move photo ${i + 1} earlier` }),
    button('', () => { photos.splice(i, 1); redraw(); }, { icon: 'X', small: true, variant: 'ghost', title: `Remove photo ${i + 1}` }))));
  const add = async (fs: File[]) => {
    for (const f of fs) {
      if (photos.length >= 16) { toast('Up to 16 photos per collage', 'err'); break; }
      try { const full = await loadImg(f); photos.push({ name: f.name, full, small: previewOf(full, 900) }); } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    redraw();
  };
  const save = async (share: boolean) => {
    if (photos.length < 2) throw new Error('Add at least two photos.');
    const out = await renderCollage(photos.map((p) => p.full), { layout, ...dims(1), ...o });
    const blob = await encodeImg(out, fmt, 88), name = `collage.${EXT[fmt]}`;
    info.textContent = `${fmtBytes(blob.size)} · ${out.width}×${out.height}`;
    share ? await shareOrDownload(blob, name) : downloadBlob(blob, name);
  };
  root.append(
    card(null, stack(filePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: 'Add photos', hint: '2 to 16 photos', onFiles: (f) => add(f) }), strip)),
    stage,
    card('Layout', stack(
      segmented([['auto', 'Grid'], ['2h', 'Side by side'], ['2v', 'Stacked'], ['3l', '1 + 2'], ['3t', '1 over 2'], ['4f', '1 over 3'], ['5', '2 + 3'], ['rows', 'Rows'], ['cols', 'Columns']], layout, (v) => { layout = v; redraw(); }),
      note('Layouts made for a set number of photos fall back to a grid when the count differs.'),
      field('Canvas', segmented(Object.entries(SIZES).map(([k, v]) => [k, v[2]]) as Array<[string, string]>, size, (v) => { size = v; redraw(); })),
      slider({ label: 'Spacing', min: 0, max: 6, step: 0.25, value: o.gap, unit: '%', onInput: (v) => { o.gap = v; redraw(); } }),
      slider({ label: 'Rounded corners', min: 0, max: 30, value: o.radius, unit: '%', onInput: (v) => { o.radius = v; redraw(); } }),
      grid2(field('Background', input({ type: 'color', value: o.bg, onInput: (v) => { o.bg = v; redraw(); } })), fmtSeg(fmt, (v) => (fmt = v))))),
    actions(button('Save collage', () => save(false), { variant: 'primary', icon: 'Download' }), ctx.isMobile ? button('Share', () => save(true), { icon: 'Share2' }) : null),
  );
};
