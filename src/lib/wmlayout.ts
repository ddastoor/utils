// Where the Watermark tab's mark goes (to-do #17 — owner, 26 Nov 2026: "the watermark should be from the bottom left to
// the top right, diagonally right across the picture … I should be able to upload a PDF or a Word document, and the
// style of the watermark chosen should be applied to every page"). Pure geometry, no DOM: the photo's diagonal
// (src/tools/canvas-tools.ts), the PDF writer (src/lib/docmark.ts), the Word writer (src/lib/docxmark.ts) and the
// tab's preview of a Word page all take their places from here; the unit suite (tests/unit/wmlayout.test.mjs) holds it.

export type Pos = 'tl' | 'tc' | 'tr' | 'ml' | 'c' | 'mr' | 'bl' | 'bc' | 'br' | 'tile' | 'diag';
export interface MarkOpts { pos: Pos; size: number; margin: number; angle: number; fill: number }

/** The diagonal: the angle of the page's own diagonal (radians, the mark rising to the right) and the scale k for a mark
 *  L0 × h0 (its own size) centred on it, so that all four of its corners lie within the margin m — the box turned by θ
 *  spans L·cosθ + h·sinθ across and L·sinθ + h·cosθ down. `fill` (0.05 – 1): the share of that largest size. */
export function diagonalFit(W: number, H: number, m: number, L0: number, h0: number, fill: number) {
  const th = Math.atan2(H, W), c = Math.cos(th), s = Math.sin(th);
  const k = Math.max(0, Math.min((W - 2 * m) / (L0 * c + h0 * s), (H - 2 * m) / (L0 * s + h0 * c))) * Math.min(1, Math.max(0.05, fill));
  return { th, k };
}

/** The mark's tight box per unit — text: per point of type (its glyphs' box at 1 pt); a logo: per point of width
 *  (1 × 1 / aspect). `row`: the height of a mark's row when tiled, in the same unit (text: 1 em; a logo: its height). */
export interface Unit { w: number; h: number; row: number; logo: boolean }
/** One mark on a page: its centre (points from the top left, y down), its box (the glyphs' or the logo's) and its
 *  rotation in degrees, clockwise as the screen shows it (Word's VML `rotation` counts the same way). `k`: the unit's
 *  scale (text: the type size in points). */
export interface Place { cx: number; cy: number; w: number; h: number; rot: number; k: number }

/** The marks on a page of W × H points (as the page is shown). Sizes are shares of the page's shorter side, as on a
 *  photo: the type size for text (Size %), four times that for a logo's width; the margin likewise. */
export function placeMarks(W: number, H: number, o: MarkOpts, u: Unit): Place[] {
  const S = Math.min(W, H), m = (o.margin / 100) * S;
  if (o.pos === 'diag') {
    const { th, k } = diagonalFit(W, H, m, u.w, u.h, o.fill);
    return [{ cx: W / 2, cy: H / 2, w: u.w * k, h: u.h * k, rot: -(th * 180) / Math.PI, k }];
  }
  const k = (u.logo ? (o.size * 4) / 100 : o.size / 100) * S;
  const w = u.w * k, h = u.h * k;
  if (o.pos === 'tile') { // the photo's tiling: rows of marks turned by the tile angle about the page's middle
    const a = (o.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), rowH = u.row * k;
    const stepX = w + Math.max(w * 0.6, S * 0.08), stepY = rowH * 3.2, R = Math.hypot(W, H) / 2 + Math.max(w, rowH);
    const ex = Math.abs((w / 2) * c) + Math.abs((h / 2) * s), ey = Math.abs((w / 2) * s) + Math.abs((h / 2) * c), out: Place[] = []; // half the turned box's extent
    for (let y = -R, row = 0; y < R; y += stepY, row++) {
      for (let x = -R + (row % 2 ? stepX / 2 : 0); x < R; x += stepX) {
        const ux = x + w / 2, uy = y + rowH / 2; // the mark's middle in the turned rows
        const cx = W / 2 + ux * c - uy * s, cy = H / 2 + ux * s + uy * c;
        if (cx + ex > 0 && cx - ex < W && cy + ey > 0 && cy - ey < H) out.push({ cx, cy, w, h, rot: o.angle, k }); // marks wholly off the page are left out
      }
    }
    return out;
  }
  const col = o.pos.length === 1 ? 'c' : o.pos[1], row = o.pos[0];
  const cx = col === 'l' ? m + w / 2 : col === 'r' ? W - m - w / 2 : W / 2;
  const cy = row === 't' ? m + h / 2 : row === 'b' ? H - m - h / 2 : H / 2;
  return [{ cx, cy, w, h, rot: 0, k }];
}

/** The four corners of a mark (y down), for the tests and the reach of a tile. */
export function cornersOf(p: Place): Array<[number, number]> {
  const a = (p.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = (sx * p.w) / 2, y = (sy * p.h) / 2;
    return [p.cx + x * c - y * s, p.cy + x * s + y * c] as [number, number];
  });
}
