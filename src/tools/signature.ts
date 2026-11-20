// Signature Maker: draw (pressure-aware, smoothed vector strokes), type (self-hosted OFL handwriting fonts) or
// photograph a signature on paper (ink extraction in imgproc.wasm). Output: trimmed transparent PNG (OxiPNG) or
// JPEG on white. Trimming (alpha bounding box) and cropping run in imgproc.wasm.
import greatVibes from '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2?url';
import dancing from '@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff2?url';
import caveat from '@fontsource/caveat/files/caveat-latin-400-normal.woff2?url';
import { h, card, field, input, button, segmented, slider, stack, grid2, note, actions, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { encodeImg, onWhite } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';

export const HAND_FONTS: Array<[string, string, string]> = [['Great Vibes', 'Elegant', greatVibes], ['Dancing Script', 'Flowing', dancing], ['Caveat', 'Casual', caveat]];
let handReady: Promise<void> | null = null;
export const loadHandFonts = () => (handReady ||= Promise.all(HAND_FONTS.map(async ([fam, , url]) => {
  try { const f = new FontFace(fam, `url(${url})`); await f.load(); document.fonts.add(f); } catch { /* system fallback */ }
})).then(() => undefined));
const INKS: Array<[string, string]> = [['#0b2a8a', 'Blue'], ['#111111', 'Black'], ['#7a1020', 'Maroon']];

type Pt = { x: number; y: number; p: number };
type Stroke = { pts: Pt[]; color: string; width: number };
/** Render strokes (CSS-pixel coordinates) at `scale` onto a transparent canvas. Variable width from pressure;
 *  midpoint quadratic smoothing. */
export function renderStrokes(strokes: Stroke[], w: number, hh: number, scale: number) {
  const c = new OffscreenCanvas(Math.round(w * scale), Math.round(hh * scale)), g = c.getContext('2d', { willReadFrequently: true })!;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of strokes) {
    g.strokeStyle = s.color; g.fillStyle = s.color;
    const P = s.pts.map((p) => ({ x: p.x * scale, y: p.y * scale, p: p.p }));
    const wOf = (p: number) => Math.max(0.4, s.width * scale * (0.45 + 0.9 * p));
    if (P.length === 1) { g.beginPath(); g.arc(P[0].x, P[0].y, wOf(P[0].p) / 2, 0, Math.PI * 2); g.fill(); continue; }
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], m0 = i > 1 ? { x: (P[i - 2].x + a.x) / 2, y: (P[i - 2].y + a.y) / 2 } : a, m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.lineWidth = wOf((a.p + b.p) / 2);
      g.beginPath(); g.moveTo(m0.x, m0.y); g.quadraticCurveTo(a.x, a.y, m1.x, m1.y); g.stroke();
      if (i === P.length - 1) { g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(b.x, b.y); g.stroke(); }
    }
  }
  const d = g.getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height } as Img;
}

/** Trim to the ink (alpha bounding box) plus padding, in wasm. */
export async function trim(img: Img, padFrac = 0.06): Promise<Img> {
  const b = await imgproc('alphaBBox', img, 8);
  if (!b.w) throw new Error('Nothing to save yet — sign first.');
  const pad = Math.round(Math.max(b.w, b.h) * padFrac);
  return imgproc('crop', img, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
}
export const mount: Mount = (root, ctx) => {
  let mode: 'draw' | 'type' | 'photo' = 'draw', color = INKS[0][0], width = 3;
  const strokes: Stroke[] = [];
  let typed = 'Your Name', font = HAND_FONTS[0][0], photo: Img | null = null, inkFromPhoto: Img | null = null, keepInk = false, strength = 1;
  const info = h('div', { class: 'muted small' });

  // ---------- draw pad
  const pad = h('canvas', { class: 'sig-pad', 'aria-label': 'Signature pad — draw with mouse, finger or pen' });
  const padWrap = h('div', { class: 'sig-wrap' }, pad, h('div', { class: 'sig-line' }), h('span', { class: 'sig-hint' }, 'Sign above the line'));
  let cssW = 600, cssH = 220;
  const resizePad = () => {
    const r = padWrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    cssW = Math.max(240, r.width || 600); cssH = Math.round(cssW / (ctx.isMobile ? 2 : 2.7));
    pad.style.height = `${cssH}px`; pad.width = Math.round(cssW * dpr); pad.height = Math.round(cssH * dpr);
    paintPad();
  };
  const paintPad = () => {
    const g = pad.getContext('2d')!, img = renderStrokes(strokes, cssW, cssH, pad.width / cssW);
    g.clearRect(0, 0, pad.width, pad.height);
    g.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  };
  let cur: Stroke | null = null;
  const pt = (e: PointerEvent): Pt => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5 }; };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); cur = { pts: [pt(e)], color, width }; strokes.push(cur); paintPad(); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => {
    if (!cur) return;
    for (const ce of (e.getCoalescedEvents?.() || [e])) cur.pts.push(pt(ce));
    paintPad();
  });
  const end = () => { cur = null; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  const ro = new ResizeObserver(() => resizePad());
  ro.observe(padWrap);

  // ---------- type
  const typedPreview = h('div', { class: 'sig-typed', style: { fontFamily: `'${font}', cursive`, color } }, typed);
  const typedInput = input({ value: typed, onInput: (v) => { typed = v; typedPreview.textContent = v || ' '; } });
  const typeBox = stack(field('Your name', typedInput),
    field('Style', segmented(HAND_FONTS.map(([f, l]) => [f, l]) as Array<[string, string]>, font, (v) => { font = v; typedPreview.style.fontFamily = `'${v}', cursive`; })), typedPreview);
  const renderTyped = async (): Promise<Img> => {
    await loadHandFonts();
    const px = 160, c0 = new OffscreenCanvas(10, 10).getContext('2d')!;
    c0.font = `${px}px '${font}', cursive`;
    const w = Math.ceil(c0.measureText(typed).width + px), hh = Math.ceil(px * 1.8);
    const c = new OffscreenCanvas(w, hh), g = c.getContext('2d', { willReadFrequently: true })!;
    g.font = c0.font; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(typed, px / 2, hh / 2);
    const d = g.getImageData(0, 0, w, hh);
    return { data: d.data, width: w, height: hh };
  };

  // ---------- photo
  const photoCanvas = h('canvas', { class: 'ed-canvas sig-photo' });
  const extract = async () => {
    if (!photo) return;
    inkFromPhoto = await imgproc('inkToAlpha', photo, parseInt(color.slice(1), 16), keepInk, strength);
    photoCanvas.width = inkFromPhoto.width; photoCanvas.height = inkFromPhoto.height;
    photoCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(inkFromPhoto.data), inkFromPhoto.width, inkFromPhoto.height), 0, 0);
  };
  const photoIn = imageInput(async (img) => { photo = img.width > 2400 ? await imgproc('resize', img, 2400, Math.round((img.height * 2400) / img.width)) : img; await extract(); }, { label: 'Photo of your signature', capture: ctx.isMobile ? 'environment' : undefined, cameraLabel: 'Photograph your signature' });
  const photoBox = stack(photoIn.el, note('Sign on plain white paper with a dark pen, take a photo straight on, in even light.'),
    h('div', { class: 'ed-stage' }, photoCanvas),
    slider({ label: 'Ink sensitivity', min: 0.5, max: 2.5, step: 0.05, value: 1, onChange: (v) => { strength = v; extract(); } }),
    segmented([['recolor', 'Use chosen ink colour'], ['keep', 'Keep original ink']], 'recolor', (v) => { keepInk = v === 'keep'; extract(); }));

  const drawBox = stack(padWrap, h('div', { class: 'row' },
    button('Undo', () => { strokes.pop(); paintPad(); }, { icon: 'Undo2', small: true }),
    button('Clear', () => { strokes.length = 0; paintPad(); }, { icon: 'Eraser', small: true }),
    slider({ label: 'Pen width', min: 1, max: 10, step: 0.5, value: width, onInput: (v) => (width = v) })));
  typeBox.hidden = true; photoBox.hidden = true;

  const current = async (): Promise<Img> => {
    if (mode === 'draw') { if (!strokes.length) throw new Error('Nothing to save yet — sign first.'); return renderStrokes(strokes, cssW, cssH, 4); } // 4× = crisp at print sizes
    if (mode === 'type') { if (!typed.trim()) throw new Error('Type your name first.'); return renderTyped(); }
    if (!inkFromPhoto) throw new Error('Take or choose a photo of your signature first.');
    return inkFromPhoto;
  };
  const save = async (kind: 'png' | 'jpeg', share = false) => {
    let img = await trim(await current());
    if (kind === 'jpeg') img = onWhite(img);
    const blob = await encodeImg(img, kind, 92), name = `signature.${kind === 'png' ? 'png' : 'jpg'}`;
    info.textContent = `${img.width}×${img.height} · ${fmtBytes(blob.size)}${kind === 'png' ? ' · transparent' : ' · white background'}`;
    share ? await shareOrDownload(blob, name) : downloadBlob(blob, name);
  };
  root.append(
    card(null, stack(
      segmented([['draw', 'Draw'], ['type', 'Type'], ['photo', 'From photo']], mode, (v) => { mode = v; drawBox.hidden = v !== 'draw'; typeBox.hidden = v !== 'type'; photoBox.hidden = v !== 'photo'; if (v === 'draw') resizePad(); }),
      drawBox, typeBox, photoBox)),
    card('Ink', grid2(field('Colour', segmented(INKS, color, (v) => { color = v; typedPreview.style.color = v; if (mode === 'photo') extract(); })),
      field('Custom', input({ type: 'color', value: color, onInput: (v) => { color = v; typedPreview.style.color = v; } })))),
    card(null, info, note(h('span', null, 'Need exact pixels/KB for an exam or job form? Save here, then use ', h('a', { href: '#/formphoto' }, 'Photo & Signature Resizer'), '.'))),
    actions(button(ctx.isMobile ? 'PNG' : 'Save PNG (transparent)', () => save('png'), { variant: 'primary', icon: 'Download', title: 'Save PNG with a transparent background' }),
      button(ctx.isMobile ? 'JPG' : 'Save JPG (white)', () => save('jpeg'), { icon: 'FileImage', title: 'Save JPG on a white background' }),
      ctx.isMobile ? button('Share', () => save('png', true), { icon: 'Share2' }) : null),
  );
  loadHandFonts();
  requestAnimationFrame(resizePad);
  return () => { ro.disconnect(); photoIn.dispose(); };
};
