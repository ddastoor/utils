// Colour text ⇄ numbers for the Color Converter and the web-design tabs (contrast, gradient, shadow).
// Reading what a person typed is string glue and lives here; the colour maths (HSL, OKLCH, fitting a colour into sRGB,
// contrast) runs in mathcore.wasm, passed in as `mc`. Named colours (navy, rebeccapurple…) come from the browser's own
// CSS parser through a canvas.
export type Rgba = [number, number, number, number];
/** What the parser needs from mathcore (src/wasm/mathcore.ts). */
export interface ColorMath {
  hslToRgb(h: number, s: number, l: number): number[];
  rgbToHsl(r: number, g: number, b: number): number[];
  rgbToOklch(r: number, g: number, b: number): number[];
  oklchToRgbFit(L: number, C: number, H: number): { rgb: number[]; fitted: boolean; chroma: number };
}
export interface ParsedColor {
  /** sRGB 0–255 (fractions kept), always inside the range */
  rgb: [number, number, number];
  /** 0–1 */
  alpha: number;
  kind: 'hex' | 'rgb' | 'hsl' | 'hwb' | 'oklch' | 'oklab' | 'name';
  /** set when the colour as written cannot be shown in sRGB and was brought inside it */
  note?: string;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export function hexToRgb(hex: string): number[] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim()); if (!m) return null;
  let s = m[1]; if (s.length === 3) s = [...s].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
/** #rrggbb, or #rrggbbaa when the colour is not opaque. */
export const hexA = (c: number[]) => rgbToHex(c[0], c[1], c[2]) + ((c[3] ?? 1) < 1 ? Math.round(clamp(c[3] ?? 1, 0, 1) * 255).toString(16).padStart(2, '0') : '');
/** `top` painted over an opaque `under` (ordinary alpha compositing). */
export const over = (top: Rgba, under: number[]): [number, number, number] => [0, 1, 2].map((i) => Math.round(top[i] * top[3] + under[i] * (1 - top[3]))) as [number, number, number];

let cctx: CanvasRenderingContext2D | null = null;
/** Any colour the browser's CSS parser understands (#rgb, #rrggbbaa, rgb(), hsl(), names) → [r, g, b, alpha 0–1];
 *  null if it is not a colour. Hex is read here; everything else by a canvas (it keeps the old fill for bad input). */
export function cssColor(text: string): Rgba | null {
  const t = text.trim(); if (!t) return null;
  const hx = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(t);
  if (hx) { let x = hx[1]; if (x.length <= 4) x = [...x].map((c) => c + c).join(''); const n = [0, 2, 4, 6].map((i) => parseInt(x.slice(i, i + 2) || 'ff', 16)); return [n[0], n[1], n[2], n[3] / 255]; }
  if (!/^[a-z]/i.test(t) || typeof document === 'undefined') return null;
  cctx ||= document.createElement('canvas').getContext('2d'); if (!cctx) return null;
  cctx.fillStyle = '#010203'; cctx.fillStyle = t; const one = String(cctx.fillStyle); cctx.fillStyle = '#030201'; cctx.fillStyle = t;
  if (one !== String(cctx.fillStyle)) return null;
  if (one[0] === '#') { const v = hexToRgb(one)!; return [v[0], v[1], v[2], 1]; }
  const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(one);
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
}

const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
/** "12", "1e2", "50%" (→ 0.5 × `full`), "none" (→ 0); null when it is not a number. */
function num(t: string, full: number | null): number | null {
  if (/^none$/i.test(t)) return 0;
  if (t.endsWith('%')) { const x = t.slice(0, -1); return full !== null && NUM.test(x) ? (+x / 100) * full : null; }
  return NUM.test(t) ? +t : null;
}
/** A hue in degrees: "120", "120deg", "0.5turn", "3.14rad", "200grad". */
function angle(t: string): number | null {
  if (/^none$/i.test(t)) return 0;
  const m = /^(.*?)(deg|grad|rad|turn)?$/i.exec(t)!; if (!NUM.test(m[1])) return null;
  const v = +m[1], u = (m[2] || 'deg').toLowerCase();
  return u === 'turn' ? v * 360 : u === 'rad' ? (v * 180) / Math.PI : u === 'grad' ? v * 0.9 : v;
}
const wrap = (h: number) => ((h % 360) + 360) % 360;
/** The three values (+ optional alpha) inside f(…): "a, b, c[, alpha]" or "a b c[ / alpha]". */
function args(body: string): { v: string[]; alpha: number } | null {
  let main = body.trim(), a: string | undefined;
  const slash = main.split('/');
  if (slash.length === 2) { main = slash[0].trim(); a = slash[1].trim(); } else if (slash.length > 2) return null;
  const v = main.includes(',') ? main.split(',').map((x) => x.trim()) : main.split(/\s+/);
  if (a === undefined && v.length === 4) a = v.pop();
  if (v.length !== 3 || v.some((x) => !x)) return null;
  let alpha = 1;
  if (a !== undefined) { const x = num(a, 1); if (x === null) return null; alpha = clamp(x, 0, 1); }
  return { v, alpha };
}
/** Read a colour as a person or a stylesheet writes it: #hex (3, 4, 6 or 8 digits), rgb()/rgba() with numbers or
 *  percentages, hsl()/hsla(), hwb(), oklch(), oklab() (commas or spaces, "/ alpha", angle units, "none"), three bare
 *  numbers, or a CSS colour name. `hint` = the notation of the box being typed in: there three bare numbers mean that
 *  notation ("243 75% 59%" in the HSL box), and digits alone are hex only in the HEX box ("255" on the way to
 *  "255, 0, 0" is not #225555). Values outside a range are brought inside it as CSS does; an OKLCH / OKLab colour
 *  outside sRGB is mapped into it as CSS Color 4 prescribes (noted). null = not a colour. */
export function parseColor(text: string, mc: ColorMath, hint?: 'hex' | 'rgb' | 'hsl' | 'oklch'): ParsedColor | null {
  const t = text.trim().replace(/;$/, '').trim(); if (!t) return null;
  const hx = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(t);
  if (hx && (t[0] === '#' || hint === 'hex' || !/^\d+$/.test(t) || (!hint && t.length >= 6))) {
    let x = hx[1]; if (x.length <= 4) x = [...x].map((c) => c + c).join('');
    const n = [0, 2, 4, 6].map((i) => parseInt(x.slice(i, i + 2) || 'ff', 16));
    return { rgb: [n[0], n[1], n[2]], alpha: n[3] / 255, kind: 'hex' };
  }
  const f = /^([a-z]+)\s*\((.*)\)$/i.exec(t);
  let fn: string, a: { v: string[]; alpha: number } | null;
  if (f) { fn = f[1].toLowerCase(); a = args(f[2]); }
  else if (/^[-+\d.]/.test(t)) { fn = hint === 'hsl' || hint === 'oklch' ? hint : 'rgb'; a = args(t); }
  else { const c = /^[a-z]+$/i.test(t) ? cssColor(t) : null; return c ? { rgb: [c[0], c[1], c[2]], alpha: c[3], kind: 'name' } : null; }
  if (!a) return null;
  const [p, q, r] = a.v;
  if (fn === 'rgb' || fn === 'rgba') {
    const c = [p, q, r].map((x) => num(x, 255)); if (c.some((x) => x === null)) return null;
    return { rgb: c.map((x) => clamp(x!, 0, 255)) as [number, number, number], alpha: a.alpha, kind: 'rgb' };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    const h = angle(p), s = num(q, 100), l = num(r, 100); if (h === null || s === null || l === null) return null;
    return { rgb: mc.hslToRgb(wrap(h), clamp(s, 0, 100), clamp(l, 0, 100)).map((x) => clamp(x, 0, 255)) as [number, number, number], alpha: a.alpha, kind: 'hsl' };
  }
  if (fn === 'hwb') {
    const h = angle(p); let w = num(q, 100), b = num(r, 100); if (h === null || w === null || b === null) return null;
    w = clamp(w, 0, 100) / 100; b = clamp(b, 0, 100) / 100;
    if (w + b >= 1) { const g = (w / (w + b)) * 255; return { rgb: [g, g, g], alpha: a.alpha, kind: 'hwb' }; }
    const pure = mc.hslToRgb(wrap(h), 100, 50);
    return { rgb: pure.map((x) => clamp(x * (1 - w - b) + w * 255, 0, 255)) as [number, number, number], alpha: a.alpha, kind: 'hwb' };
  }
  if (fn === 'oklch' || fn === 'oklab') {
    // L: a plain number is 0–1 and a percentage 0–100 % (CSS Color 4); mathcore takes the percentage
    const l1 = num(p, null), L = p.endsWith('%') ? num(p, 100) : l1 === null ? null : l1 * 100;
    let C: number | null, H: number | null;
    if (fn === 'oklch') { C = num(q, 0.4); H = angle(r); }
    else { const x = num(q, 0.4), y = num(r, 0.4); C = x === null || y === null ? null : Math.hypot(x, y); H = x === null || y === null ? null : (Math.atan2(y, x) * 180) / Math.PI; }
    if (L === null || C === null || H === null) return null;
    const fit = mc.oklchToRgbFit(clamp(L, 0, 100), Math.max(0, C), wrap(H));
    const out: ParsedColor = { rgb: fit.rgb as [number, number, number], alpha: a.alpha, kind: fn };
    // a chroma that differs only by the rounding of the text is the same colour
    if (fit.fitted && C - fit.chroma > 0.002) out.note = `This colour is outside sRGB — what HEX and RGB can express. It is brought inside the way CSS does it: lightness and hue kept as closely as possible, chroma reduced (${+C.toFixed(4)} → ${+fit.chroma.toFixed(4)}).`;
    return out;
  }
  const c = cssColor(t); // color(), lab(), lch()…: whatever the browser itself can turn into sRGB
  return c ? { rgb: [c[0], c[1], c[2]], alpha: c[3], kind: 'name' } : null;
}

const trim = (x: number, d: number) => String(+x.toFixed(d));
const alphaText = (a: number) => trim(a, 3);
/** The colour in each notation. The decimals are enough for every 8-bit colour to come back exactly when the text is
 *  read again (HSL: 1 decimal; OKLCH: 2 / 5 / 2 — checked once over the whole RGB cube, and on a grid of it in
 *  tests/unit/devdata.test.mjs). */
export function formatColor(rgb: number[], alpha: number, mc: ColorMath) {
  const [r, g, b] = rgb.map((x) => Math.round(clamp(x, 0, 255))), opaque = alpha >= 1;
  const [h, s, l] = mc.rgbToHsl(r, g, b), [L, C, H] = mc.rgbToOklch(r, g, b);
  const grey = +C.toFixed(5) === 0; // a grey has no hue: 0 instead of the noise the arithmetic leaves
  return {
    hex: hexA([r, g, b, alpha]),
    rgb: opaque ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alphaText(alpha)})`,
    hsl: `hsl(${trim(s < 0.05 ? 0 : wrap(h), 1)} ${trim(s, 1)}% ${trim(l, 1)}%${opaque ? '' : ` / ${alphaText(alpha)}`})`,
    oklch: `oklch(${trim(L, 2)}% ${grey ? '0' : trim(C, 5)} ${grey ? '0' : trim(wrap(H), 2)}${opaque ? '' : ` / ${alphaText(alpha)}`})`,
  };
}
