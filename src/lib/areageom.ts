// The geometry of choosing an area on a frozen screenshot (Screenshot tab, to-do #24): where the frame stands on the
// screen, the rectangle from a drag, moving and resizing it, what the pointer is over, and the part of the picture it
// holds. No DOM: the unit suite runs it in Node (tests/unit/areageom.test.mjs).
//
// Coordinates are the frame's pixel EDGES: a rectangle { x, y, w, h } covers the pixels x … x + w − 1 and y … y + h − 1,
// and a point dragged to is rounded to the nearest edge — so a drag from one pixel's corner to another's takes exactly
// the pixels between them, at any scale.
import type { Img } from '../wasm/imgproc';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Layout { s: number; ox: number; oy: number }

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where a W × H frame stands on a canvas of cw × ch device pixels: one device pixel a frame pixel at most (the screen's
 *  own size when the frame is the screen and the window fills it), fitted when it is larger; centred — on whole device
 *  pixels at 1:1, so no frame pixel is smeared over two. */
export function layoutOf(W: number, H: number, cw: number, ch: number): Layout {
  const s = Math.min(1, cw / W, ch / H);
  return s === 1 ? { s, ox: Math.floor((cw - W) / 2), oy: Math.floor((ch - H) / 2) } : { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 };
}

/** The frame edge nearest to a point of the canvas (device pixels). */
export const toFrame = (L: Layout, px: number, py: number) => ({ x: Math.round((px - L.ox) / L.s), y: Math.round((py - L.oy) / L.s) });

/** The rectangle between two points (either order), held inside the frame. */
export function rectFrom(ax: number, ay: number, bx: number, by: number, W: number, H: number): Rect {
  const x0 = clamp(Math.min(ax, bx), 0, W), x1 = clamp(Math.max(ax, bx), 0, W);
  const y0 = clamp(Math.min(ay, by), 0, H), y1 = clamp(Math.max(ay, by), 0, H);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A rectangle moved by (dx, dy), its size kept, stopped at the frame's edges. */
export const moved = (r: Rect, dx: number, dy: number, W: number, H: number): Rect =>
  ({ x: clamp(r.x + dx, 0, W - r.w), y: clamp(r.y + dy, 0, H - r.h), w: r.w, h: r.h });

/** A rectangle with some of its edges dragged — `edges` holds l, r, t, b — the others staying; dragged past the
 *  opposite edge it turns over, as in every drawing program. */
export function resized(r: Rect, edges: string, dx: number, dy: number, W: number, H: number): Rect {
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  if (edges.includes('l')) x0 += dx; else if (edges.includes('r')) x1 += dx;
  if (edges.includes('t')) y0 += dy; else if (edges.includes('b')) y1 += dy;
  return rectFrom(x0, y0, x1, y1, W, H);
}

/** The right and bottom edges moved by (dx, dy) — the keyboard's way to size it — never below one pixel. */
export const sized = (r: Rect, dx: number, dy: number, W: number, H: number): Rect =>
  ({ x: r.x, y: r.y, w: clamp(r.w + dx, 1, W - r.x), h: clamp(r.h + dy, 1, H - r.y) });

/** What a point of the canvas is over, the rectangle drawn at x0 … x1, y0 … y1 (device pixels): '' (outside: a new
 *  rectangle), 'move' (inside), or the edges it grabs — 'l', 'r', 't', 'b', or a corner 'lt', 'rt', 'lb', 'rb'. `tol` is
 *  how far from an edge still grabs it; of two edges both within reach (a small rectangle) the nearer one. */
export function hitOf(x0: number, y0: number, x1: number, y1: number, px: number, py: number, tol: number): string {
  const inX = px >= x0 - tol && px <= x1 + tol, inY = py >= y0 - tol && py <= y1 + tol;
  const dl = Math.abs(px - x0), dr = Math.abs(px - x1), dt = Math.abs(py - y0), db = Math.abs(py - y1);
  let e = '';
  if (inY && Math.min(dl, dr) <= tol) e += dl <= dr ? 'l' : 'r';
  if (inX && Math.min(dt, db) <= tol) e += dt <= db ? 't' : 'b';
  if (e) return e;
  return px > x0 && px < x1 && py > y0 && py < y1 ? 'move' : '';
}

/** The mouse pointer's look over each part. */
export const cursorOf = (hit: string) =>
  hit === 'move' ? 'move' : hit === 'l' || hit === 'r' ? 'ew-resize' : hit === 't' || hit === 'b' ? 'ns-resize'
    : hit === 'lt' || hit === 'rb' ? 'nwse-resize' : hit === 'rt' || hit === 'lb' ? 'nesw-resize' : 'crosshair';

/** The pixels of a picture inside a rectangle, row by row as they are (no scaling, no colour change). */
export function cropImg(img: Img, r: Rect): Img {
  const W = img.width, out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * W + r.x) * 4;
    out.set(img.data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return { data: out, width: r.w, height: r.h };
}
