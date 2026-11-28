// Screenshot Annotator & How-To Guide (potentials #113): the marks put on a picture — arrows, boxes, circles, numbered
// step markers, text, the highlighter, a pen — and the areas hidden (pixelated, blurred or covered: burnt into the
// picture's pixels when it is saved). Every mark is kept in the picture's own pixels, so a crop or a zoom never moves
// it. The marks are drawn by the browser's canvas (Skia), the hidden areas by imgproc.wasm (src/wasm/imgproc.ts); the
// geometry here takes no DOM — the unit suite runs it in Node with a measuring function of its own.
import type { Img, Imgproc } from '../wasm/imgproc';

export type Kind = 'arrow' | 'rect' | 'ellipse' | 'step' | 'text' | 'highlight' | 'pen' | 'hide';
export type Size = 's' | 'm' | 'l';
export type HideStyle = 'pixelate' | 'blur' | 'solid';
interface Common { id: number; color: string; size: Size }
export interface Arrow extends Common { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number }
export interface Box extends Common { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number }
export interface Step extends Common { kind: 'step'; x: number; y: number }
/** text: (x, y) is the top left of its box; `label`: on a filled box (else the letters alone, with an outline) */
export interface Text extends Common { kind: 'text'; x: number; y: number; text: string; label: boolean }
export interface Stroke extends Common { kind: 'highlight' | 'pen'; pts: number[] }
/** an area hidden; `seed`, `ox`, `oy`: the mosaic's random numbers, chosen once (the same mosaic every time it is drawn) */
export interface Hide { id: number; kind: 'hide'; style: HideStyle; x: number; y: number; w: number; h: number; seed: number; ox: number; oy: number }
export type Shape = Arrow | Box | Step | Text | Stroke | Hide;
export interface Rect { x: number; y: number; w: number; h: number }
export type Measure = (text: string, px: number) => number;

/** The font of the text and the step numbers (Noto Sans Bold, from this site — registered by the tab). */
export const FONT = "SuperUtilsMark, 'Noto Sans', system-ui, sans-serif";
/** sizes in units of `unit()`: the line of an arrow, a box, a circle, the pen */
export const STROKE: Record<Size, number> = { s: 2.5, m: 4, l: 6.5 };
/** the text's size */
export const TEXT: Record<Size, number> = { s: 13, m: 18, l: 26 };
/** a step marker's radius */
export const STEP: Record<Size, number> = { s: 11, m: 15, l: 21 };
/** the highlighter's width */
export const HILITE: Record<Size, number> = { s: 12, m: 20, l: 32 };
export const COLORS: Array<[string, string]> = [
  ['#e53935', 'Red'], ['#fb8c00', 'Orange'], ['#fdd835', 'Yellow'], ['#43a047', 'Green'], ['#1e88e5', 'Blue'],
  ['#8e24aa', 'Purple'], ['#ffffff', 'White'], ['#212121', 'Black'],
];

/** A unit of the marks' sizes for a picture W × H: a thousandth of its longer side (at least a pixel) — so the marks
 *  look the same on a phone's screenshot (1080 × 2400) and a PC's (1920 × 1080). */
export const unit = (W: number, H: number) => Math.max(1, Math.max(W, H) / 1000);

/** a colour's relative luminance (sRGB, WCAG) — #rgb or #rrggbb */
export function luminance(hex: string): number {
  let s = hex.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  if (!Number.isFinite(n)) return 0;
  const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
/** The text colour on a fill of `hex`: white where it stands out by 3 : 1 and more — the marks' text is large and bold,
 *  for which WCAG asks 3 : 1 (white on red, blue, green, purple, as annotations are read) —, else near-black (yellow,
 *  orange, white). */
export const onColor = (hex: string) => (1.05 / (luminance(hex) + 0.05) >= 3 ? '#ffffff' : '#111111');

// ---------------------------------------------------------------------------------------------------- the step numbers
/** Each step marker's number: its place among the picture's markers, from `start` (markers numbered on across the
 *  pictures of a guide start where the picture before ended). */
export function stepNumbers(shapes: Shape[], start = 1): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of shapes) if (s.kind === 'step') m.set(s.id, start + m.size);
  return m;
}

// ---------------------------------------------------------------------------------------------------- geometry
/** a box with a positive width and height (a drag to the left or up gives a negative one) */
export function normBox<T extends Rect>(b: T): T {
  const x = Math.min(b.x, b.x + b.w), y = Math.min(b.y, b.y + b.h);
  return { ...b, x, y, w: Math.abs(b.w), h: Math.abs(b.h) };
}

/** The lines of a text and its box: the font's size, the line height, the padding. */
export function textBox(t: Pick<Text, 'text' | 'size' | 'label' | 'x' | 'y'>, u: number, measure: Measure) {
  const fs = TEXT[t.size] * u, lh = fs * 1.25, pad = t.label ? fs * 0.45 : fs * 0.12;
  const lines = (t.text || ' ').split('\n');
  const w = Math.max(fs * 0.5, ...lines.map((l) => measure(l, fs))) + 2 * pad, h = lines.length * lh + 2 * pad;
  return { fs, lh, pad, lines, x: t.x, y: t.y, w, h };
}

/** An arrow's head: its length and half-width, and where the shaft ends (short arrows get a smaller head). */
export function arrowHead(a: Pick<Arrow, 'x1' | 'y1' | 'x2' | 'y2' | 'size'>, u: number) {
  const lw = STROKE[a.size] * u, dx = a.x2 - a.x1, dy = a.y2 - a.y1, len = Math.hypot(dx, dy) || 1e-9;
  const L = Math.min(lw * 3.6 + 6 * u, len * 0.6), half = L * 0.55;
  const ux = dx / len, uy = dy / len, bx = a.x2 - ux * L, by = a.y2 - uy * L;
  return {
    lw, L, half, len,
    /** the triangle: the tip and the two corners of its base */
    tri: [a.x2, a.y2, bx - uy * half, by + ux * half, bx + uy * half, by - ux * half] as const,
    /** the shaft ends a little inside the head (no gap between them) */
    sx: bx + ux * Math.min(lw, L * 0.3), sy: by + uy * Math.min(lw, L * 0.3),
  };
}

/** What a mark covers (for its outline when it is chosen, and for the keys that move it). */
export function bounds(s: Shape, u: number, measure: Measure): Rect {
  switch (s.kind) {
    case 'arrow': { const p = STROKE[s.size] * u * 2; return { x: Math.min(s.x1, s.x2) - p, y: Math.min(s.y1, s.y2) - p, w: Math.abs(s.x2 - s.x1) + 2 * p, h: Math.abs(s.y2 - s.y1) + 2 * p }; }
    case 'rect': case 'ellipse': case 'hide': return { x: s.x, y: s.y, w: s.w, h: s.h };
    case 'step': { const r = STEP[s.size] * u; return { x: s.x - r, y: s.y - r, w: 2 * r, h: 2 * r }; }
    case 'text': { const b = textBox(s, u, measure); return { x: b.x, y: b.y, w: b.w, h: b.h }; }
    case 'highlight': case 'pen': {
      const r = (s.kind === 'highlight' ? HILITE[s.size] : STROKE[s.size]) * u / 2;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < s.pts.length; i += 2) { x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]); y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]); }
      return { x: x0 - r, y: y0 - r, w: x1 - x0 + 2 * r, h: y1 - y0 + 2 * r };
    }
  }
}

/** the distance from (px, py) to the segment (ax, ay) – (bx, by) */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const inRect = (x: number, y: number, r: Rect, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** Does a press at (x, y) take the mark? `inside`: also its inside (a box's, a circle's — the second look, when no line
 *  was pressed: an arrow inside a box is taken before the box). `tol`: how far off a press may land, in picture pixels. */
export function hits(s: Shape, x: number, y: number, tol: number, u: number, measure: Measure, inside = false): boolean {
  switch (s.kind) {
    case 'arrow': {
      const a = arrowHead(s, u);
      return segDist(x, y, s.x1, s.y1, a.sx, a.sy) <= a.lw / 2 + tol || Math.hypot(x - (s.x2 - (s.x2 - s.x1) / a.len * a.L / 2), y - (s.y2 - (s.y2 - s.y1) / a.len * a.L / 2)) <= a.L * 0.6 + tol;
    }
    case 'rect': {
      const lw = STROKE[s.size] * u / 2 + tol;
      if (inside) return inRect(x, y, s, tol);
      return inRect(x, y, s, lw) && !(x > s.x + lw && x < s.x + s.w - lw && y > s.y + lw && y < s.y + s.h - lw);
    }
    case 'ellipse': {
      const a = s.w / 2, b = s.h / 2, cx = s.x + a, cy = s.y + b;
      if (a < 1 || b < 1) return segDist(x, y, s.x, s.y, s.x + s.w, s.y + s.h) <= STROKE[s.size] * u / 2 + tol;
      const r = Math.hypot((x - cx) / a, (y - cy) / b);
      if (inside) return r <= 1 + tol / Math.min(a, b);
      return Math.abs(r - 1) * Math.min(a, b) <= STROKE[s.size] * u / 2 + tol;
    }
    case 'step': return Math.hypot(x - s.x, y - s.y) <= STEP[s.size] * u + tol;
    case 'text': return inRect(x, y, bounds(s, u, measure), tol);
    case 'highlight': case 'pen': {
      const r = (s.kind === 'highlight' ? HILITE[s.size] : STROKE[s.size]) * u / 2 + tol, p = s.pts;
      if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= r;
      for (let i = 0; i + 3 < p.length; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return true;
      return false;
    }
    case 'hide': return inside && inRect(x, y, s, tol);
  }
}

/** The topmost mark at (x, y): the lines and the filled marks first, then the insides of boxes, circles and hidden
 *  areas — newest first in each look. */
export function hitTest(shapes: Shape[], x: number, y: number, tol: number, u: number, measure: Measure): Shape | null {
  for (const inside of [false, true]) for (let i = shapes.length - 1; i >= 0; i--) if (hits(shapes[i], x, y, tol, u, measure, inside)) return shapes[i];
  return null;
}

export type Handle = 'p1' | 'p2' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
/** The handles a chosen mark can be dragged by: an arrow's two ends, a box's corners and sides. */
export function handles(s: Shape): Array<{ name: Handle; x: number; y: number }> {
  if (s.kind === 'arrow') return [{ name: 'p1', x: s.x1, y: s.y1 }, { name: 'p2', x: s.x2, y: s.y2 }];
  if (s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'hide') {
    const { x, y, w, h } = s, mx = x + w / 2, my = y + h / 2;
    return [{ name: 'nw', x, y }, { name: 'n', x: mx, y }, { name: 'ne', x: x + w, y }, { name: 'e', x: x + w, y: my },
      { name: 'se', x: x + w, y: y + h }, { name: 's', x: mx, y: y + h }, { name: 'sw', x, y: y + h }, { name: 'w', x, y: my }];
  }
  return [];
}
/** the handle within `tol` of (x, y), the nearest */
export function handleAt(s: Shape, x: number, y: number, tol: number): Handle | null {
  let best: Handle | null = null, d = tol;
  for (const hd of handles(s)) { const e = Math.hypot(x - hd.x, y - hd.y); if (e <= d) { d = e; best = hd.name; } }
  return best;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** A mark moved by (dx, dy), held so that a part of it stays on the picture (W × H). */
export function moved<T extends Shape>(s: T, dx: number, dy: number, W: number, H: number, u: number, measure: Measure): T {
  const b = bounds(s, u, measure), keep = Math.min(24 * u, b.w / 2, b.h / 2);
  dx = clamp(dx, -(b.x + b.w) + keep, W - b.x - keep);
  dy = clamp(dy, -(b.y + b.h) + keep, H - b.y - keep);
  switch (s.kind) {
    case 'arrow': return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    case 'highlight': case 'pen': return { ...s, pts: s.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
    default: return { ...s, x: (s as any).x + dx, y: (s as any).y + dy };
  }
}
/** A mark with one of its handles at (x, y) (inside the picture). Boxes stay at least `min` pixels a side. */
export function resized<T extends Shape>(s: T, hd: Handle, x: number, y: number, W: number, H: number, min = 4): T {
  x = clamp(x, 0, W); y = clamp(y, 0, H);
  if (s.kind === 'arrow') return hd === 'p1' ? { ...s, x1: x, y1: y } : { ...s, x2: x, y2: y };
  if (s.kind !== 'rect' && s.kind !== 'ellipse' && s.kind !== 'hide') return s;
  let x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h;
  if (hd.includes('w')) x0 = x; if (hd.includes('e')) x1 = x;
  if (hd === 'n' || hd === 'nw' || hd === 'ne') y0 = y; if (hd === 's' || hd === 'sw' || hd === 'se') y1 = y;
  if (Math.abs(x1 - x0) < min) { if (hd.includes('w')) x0 = x1 - min; else x1 = x0 + min; }
  if (Math.abs(y1 - y0) < min) { if (/^n/.test(hd)) y0 = y1 - min; else y1 = y0 + min; }
  return normBox({ ...s, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

/** A crop: a box inside the picture, whole pixels, at least `min` a side. */
export function cropOf(r: Rect, W: number, H: number, min = 16): Rect {
  const b = normBox(r);
  let x0 = Math.round(clamp(b.x, 0, W)), y0 = Math.round(clamp(b.y, 0, H)), x1 = Math.round(clamp(b.x + b.w, 0, W)), y1 = Math.round(clamp(b.y + b.h, 0, H));
  if (x1 - x0 < min) { x1 = Math.min(W, x0 + min); x0 = Math.max(0, x1 - min); }
  if (y1 - y0 < min) { y1 = Math.min(H, y0 + min); y0 = Math.max(0, y1 - min); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A freehand stroke's points thinned: a point is kept when it is `minStep` or more from the last one kept. */
export function thin(pts: number[], minStep: number): number[] {
  if (pts.length <= 4) return pts.slice();
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length - 2; i += 2) if (Math.hypot(pts[i] - out[out.length - 2], pts[i + 1] - out[out.length - 1]) >= minStep) out.push(pts[i], pts[i + 1]);
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------------------------------- hidden areas
/** The whole pixels an area hides: from the floor of its left and top to the ceiling of its right and bottom — a part of
 *  a pixel under it is hidden too. */
export function hidePixels(s: Rect, W: number, H: number): Rect {
  const x0 = clamp(Math.floor(Math.min(s.x, s.x + s.w)), 0, W), y0 = clamp(Math.floor(Math.min(s.y, s.y + s.h)), 0, H);
  const x1 = clamp(Math.ceil(Math.max(s.x, s.x + s.w)), 0, W), y1 = clamp(Math.ceil(Math.max(s.y, s.y + s.h)), 0, H);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** How a hidden area is made: the mosaic's block, the blur's sigma (in pixels) — larger than a line of text in it. */
export function hideStrength(s: Rect, u: number) {
  const short = Math.min(Math.abs(s.w), Math.abs(s.h));
  return {
    block: Math.max(6, Math.round(clamp(short * 0.55, 10 * u, 28 * u))),
    sigma: clamp(short * 0.3, 4 * u, 24 * u),
    /** the most a block's colour is moved (levels of 255) */
    noise: 20,
  };
}
/** The picture with every hidden area applied to its pixels, in order (a copy: `img` is left as it was). */
export function hideAll(img: Img, hides: Hide[], ip: Imgproc): Img {
  if (!hides.length) return img;
  const u = unit(img.width, img.height);
  let out: Img = img; // each step gives a new picture (imgproc copies the pixels in and out): `img` is left as it was
  for (const s of hides) {
    const r = hidePixels(s, img.width, img.height);
    if (r.w < 1 || r.h < 1) continue;
    const k = hideStrength(r, u);
    if (s.style === 'solid') out = ip.fillRect(out, r.x, r.y, r.w, r.h, [17, 17, 17, 255]);
    else if (s.style === 'blur') out = ip.blurRect(out, r.x, r.y, r.w, r.h, k.sigma);
    else out = ip.mosaicRect(out, r.x, r.y, r.w, r.h, k.block, s.ox % k.block, s.oy % k.block, k.noise, s.seed);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- drawing
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** A freehand path through the points (quadratic curves through their middles). */
function strokePath(ctx: Ctx, p: number[]) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length === 2) { ctx.lineTo(p[0] + 0.01, p[1]); return; }
  for (let i = 2; i + 3 < p.length; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  ctx.lineTo(p[p.length - 2], p[p.length - 1]);
}
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Draw the marks (not the hidden areas: those are in the picture's pixels). The context's transform maps picture
 *  pixels to the canvas; `px` = canvas pixels per picture pixel (a shadow's blur is in canvas pixels). `numbers`: the
 *  step markers' numbers. */
export function drawMarks(ctx: Ctx, shapes: Shape[], u: number, px: number, numbers: Map<number, number>) {
  const shadow = (on: boolean) => {
    ctx.shadowColor = on ? 'rgba(0,0,0,0.32)' : 'transparent';
    ctx.shadowBlur = on ? 4 * u * px : 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = on ? 1.5 * u * px : 0;
  };
  for (const s of shapes) {
    if (s.kind === 'hide') continue;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (s.kind) {
      case 'arrow': {
        const a = arrowHead(s, u);
        shadow(true);
        ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = a.lw;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(a.sx, a.sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.tri[0], a.tri[1]); ctx.lineTo(a.tri[2], a.tri[3]); ctx.lineTo(a.tri[4], a.tri[5]); ctx.closePath();
        ctx.lineWidth = a.lw * 0.5; ctx.fill(); ctx.stroke();
        break;
      }
      case 'rect': shadow(true); ctx.strokeStyle = s.color; ctx.lineWidth = STROKE[s.size] * u; ctx.strokeRect(s.x, s.y, s.w, s.h); break;
      case 'ellipse':
        shadow(true); ctx.strokeStyle = s.color; ctx.lineWidth = STROKE[s.size] * u;
        ctx.beginPath(); ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.max(0.5, s.w / 2), Math.max(0.5, s.h / 2), 0, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'step': {
        const r = STEP[s.size] * u, n = String(numbers.get(s.id) ?? '?');
        shadow(true);
        ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        shadow(false);
        ctx.strokeStyle = luminance(s.color) > 0.8 ? '#212121' : '#ffffff'; ctx.lineWidth = r * 0.13;
        ctx.beginPath(); ctx.arc(s.x, s.y, r - r * 0.065, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = onColor(s.color);
        ctx.font = `700 ${r * (n.length === 1 ? 1.15 : n.length === 2 ? 0.95 : 0.75)}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n, s.x, s.y + r * 0.04);
        break;
      }
      case 'text': {
        const measure: Measure = (t, f) => { ctx.font = `700 ${f}px ${FONT}`; return ctx.measureText(t).width; };
        const b = textBox(s, u, measure);
        ctx.font = `700 ${b.fs}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        if (s.label) {
          shadow(true); ctx.fillStyle = s.color; roundRect(ctx, b.x, b.y, b.w, b.h, b.fs * 0.35); ctx.fill(); shadow(false);
          ctx.fillStyle = onColor(s.color);
          b.lines.forEach((l, i) => ctx.fillText(l, b.x + b.pad, b.y + b.pad + b.lh * (i + 0.5)));
        } else {
          ctx.strokeStyle = onColor(s.color); ctx.lineWidth = b.fs * 0.18; ctx.fillStyle = s.color;
          b.lines.forEach((l, i) => { const y = b.y + b.pad + b.lh * (i + 0.5); ctx.strokeText(l, b.x + b.pad, y); ctx.fillText(l, b.x + b.pad, y); });
        }
        break;
      }
      case 'highlight':
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.6;
        ctx.strokeStyle = s.color; ctx.lineWidth = HILITE[s.size] * u; ctx.lineCap = 'round';
        strokePath(ctx, s.pts); ctx.stroke();
        break;
      case 'pen':
        shadow(true); ctx.strokeStyle = s.color; ctx.lineWidth = STROKE[s.size] * u;
        strokePath(ctx, s.pts); ctx.stroke();
        break;
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------------- the guide
/** Words wrapped into lines of at most `maxW` (a word longer than that is cut between its characters). */
export function wrap(text: string, maxW: number, px: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (measure(tryLine, px) <= maxW) { line = tryLine; continue; }
      if (line) out.push(line);
      if (measure(word, px) <= maxW) { line = word; continue; }
      let piece = '';
      for (const ch of Array.from(word)) { if (piece && measure(piece + ch, px) > maxW) { out.push(piece); piece = ''; } piece += ch; }
      line = piece;
    }
    out.push(line);
  }
  return out;
}

/** A picture's size on a page: as wide as `maxW` and as tall as `maxH` allow, never more than `perPx` points a pixel. */
export function fitIn(w: number, h: number, maxW: number, maxH: number, perPx = 0.75) {
  const k = Math.min(maxW / w, maxH / h, perPx);
  return { w: w * k, h: h * k };
}
/** Steps of these heights on pages of `pageH`: as many on each page as fit, in order, `gap` between two (a step taller
 *  than a page has one of its own). */
export function packPages(heights: number[], pageH: number, gap: number): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [], used = 0;
  heights.forEach((hgt, i) => {
    const need = (cur.length ? gap : 0) + hgt;
    if (cur.length && used + need > pageH) { pages.push(cur); cur = []; used = 0; }
    used += (cur.length ? gap : 0) + hgt; cur.push(i);
  });
  if (cur.length) pages.push(cur);
  return pages;
}

/** The heading of a step in the guide: "Step 2", or nothing when the steps are not numbered. */
export const stepHeading = (i: number, numbered: boolean) => (numbered ? `Step ${i + 1}` : '');

// ---------------------------------------------------------------------------------------------------- undo and redo
/** A history of the guide's states (as text: a state is small — the marks, not the pictures): `push` before a change,
 *  `undo` / `redo` with the state now, giving the one to go to. */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  constructor(private max = 200) {}
  push(state: string) { if (this.past[this.past.length - 1] === state) return; this.past.push(state); if (this.past.length > this.max) this.past.shift(); this.future = []; }
  undo(now: string): string | null { const s = this.past.pop(); if (s === undefined) return null; this.future.push(now); return s; }
  redo(now: string): string | null { const s = this.future.pop(); if (s === undefined) return null; this.past.push(now); return s; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  clear() { this.past = []; this.future = []; }
}
