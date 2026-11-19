// The Graphing Calculator's arithmetic of the view (no DOM): what a function box may hold, the grid, its labels, and
// how far one may zoom before the numbers of a double run out.

/** What a function box holds: y as a function of x, or a vertical line x = constant. */
export interface FnText { kind: 'y' | 'x'; body: string }
/** "2x + 1", "y = 2x + 1", "f(x) = 2x + 1" → the function; "x = 2" → a vertical line; any other equation is refused. */
export function readFunction(src: string): FnText {
  let s = src.trim();
  const vertical = /^x\s*=(?!=)\s*(.*)$/i.exec(s);
  if (vertical) {
    if (!vertical[1].trim()) throw new Error('x = … needs a number after the = sign.');
    if (vertical[1].includes('=')) throw new Error('One = sign is enough: x = 2 draws a vertical line.');
    return { kind: 'x', body: vertical[1] };
  }
  s = s.replace(/^(?:y|[a-z]\s*\(\s*x\s*\))\s*=(?!=)\s*/i, ''); // y = …, f(x) = …
  if (!s) throw new Error('Type a function of x, such as 2x + 1 or sin(x).');
  if (s.includes('=')) throw new Error('An equation cannot be drawn — write y as a function of x (2x + 1), or x = 2 for a vertical line. The Equation Solver solves equations.');
  return { kind: 'y', body: s };
}

export const MIN_SCALE = 1e-12, MAX_SCALE = 1e12; // pixels per unit
/** A scale the numbers can carry: a pixel is never finer than a few thousand steps of a double at the view's centre
 *  (deeper, the grid could not move from one line to the next — the page used to freeze there). */
export function clampScale(scale: number, cx: number, cy: number): number {
  const top = Math.min(MAX_SCALE, 1e13 / Math.max(1, Math.abs(cx), Math.abs(cy)));
  return !Number.isFinite(scale) || scale <= 0 ? 50 : Math.min(top, Math.max(MIN_SCALE, scale));
}
export const MAX_CENTRE = 1e15;
export const clampCentre = (c: number) => (Number.isFinite(c) ? Math.min(MAX_CENTRE, Math.max(-MAX_CENTRE, c)) : 0);

export interface View { cx: number; cy: number; scale: number }
/** Zoom by `factor` so that the point under (px, py) — pixels from the canvas's top-left corner — stays where it is. */
export function zoomAbout(v: View, px: number, py: number, factor: number, W: number, H: number): View {
  const ux = v.cx + (px - W / 2) / v.scale, uy = v.cy - (py - H / 2) / v.scale;
  const scale = clampScale(v.scale * factor, v.cx, v.cy);
  const cx = clampCentre(ux - (px - W / 2) / scale), cy = clampCentre(uy + (py - H / 2) / scale);
  return { cx, cy, scale: clampScale(scale, cx, cy) };
}

/** Grid lines 1, 2 or 5 × 10^k units apart, at least `minPx` pixels on screen. */
export function tickStep(scale: number, minPx = 40): number {
  const raw = minPx / scale, k = Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) { const s = m * 10 ** k; if (s >= raw * (1 - 1e-12)) return s; }
  return 10 ** (k + 1);
}
/** The grid lines between lo and hi: whole multiples of the step (counted, never added up — adding a step that is
 *  smaller than the gap between two doubles never arrives). At most `max` of them. */
export function ticks(lo: number, hi: number, step: number, max = 400): number[] {
  const first = Math.ceil(lo / step), last = Math.floor(hi / step), out: number[] = [];
  if (!(step > 0) || !Number.isFinite(first) || !Number.isFinite(last) || Math.abs(first) > 2 ** 52 || Math.abs(last) > 2 ** 52) return out; // beyond 2^52 the count itself cannot step by one
  for (let i = first; i <= last && out.length < max; i++) out.push(i * step || 0);
  return out;
}
/** A grid label with as many digits as the step needs: 0.25 beside 0.5, 3.000001 beside 3.000002, 2e+9 beside 4e+9. */
export function tickLabel(v: number, step: number): string {
  if (v === 0) return '0';
  const k = Math.floor(Math.log10(step) + 1e-9), a = Math.abs(v);
  if (a >= 1e7 || a < 1e-4) {
    const digits = Math.min(15, Math.max(0, Math.floor(Math.log10(a) + 1e-9) - k));
    return v.toExponential(digits).replace(/\.?0+e/, 'e').replace('e+', 'e').replace(/-/g, '−');
  }
  return v.toFixed(Math.min(15, Math.max(0, -k))).replace('-', '−');
}
