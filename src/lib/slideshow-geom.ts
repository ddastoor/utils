// Slideshow Maker: where a photo is drawn in a frame (no DOM — the unit suite checks the placements).
// "fill": the photo covers the frame (its edges are cut where its shape differs from the frame's); "fit": the photo inside
// the frame over a blurred copy of itself. Both grow by 8 % with the gentle zoom and pan sideways, which cuts the edges
// of "fit" too — the look these two always had, kept as it was.
// "whole" (owner, 26 Nov 2026: "none of the pictures get cut at all … the original pictures in their full, original
// uncut form"): the photo stays entire inside the frame for all its time on screen. The gentle zoom goes from 92 % of
// the fitted size up to the fitted size, never past it, and the pan uses only the room left beside the photo.
export type FitMode = 'fill' | 'fit' | 'whole';
export interface Rect { x: number; y: number; w: number; h: number }
/** how much the gentle zoom grows a photo over its time, and how far it pans (a share of the frame's width) */
export const ZOOM = 0.08, PAN = 0.025;

/** The rectangle photo k (pw × ph) takes in a W × H frame at q = 0 … 1 of its time on screen (crossfade included). */
export function placement(fit: FitMode, zoom: boolean, q: number, k: number, W: number, H: number, pw: number, ph: number): Rect {
  const dir = k % 2 ? 1 : -1, cover = Math.max(W / pw, H / ph), contain = Math.min(W / pw, H / ph);
  if (fit === 'whole') {
    const t = Math.min(1, Math.max(0, q)), s = contain * (zoom ? 1 - ZOOM + ZOOM * t : 1), w = pw * s, h = ph * s;
    const pan = zoom ? dir * Math.min(PAN * W, Math.max(0, W - w)) * (t - 0.5) : 0; // |pan| ≤ half the room beside it
    return { x: (W - w) / 2 + pan, y: (H - h) / 2, w, h };
  }
  const s = (fit === 'fill' ? cover : contain) * (zoom ? 1 + ZOOM * q : 1), w = pw * s, h = ph * s;
  const pan = zoom ? dir * PAN * W * (q - 0.5) : 0;
  return { x: (W - w) / 2 + pan, y: (H - h) / 2, w, h };
}

/** What share of the photo is outside the frame at this placement (0 = nothing cut). */
export function cutShare(r: Rect, W: number, H: number): number {
  const vw = Math.max(0, Math.min(W, r.x + r.w) - Math.max(0, r.x)), vh = Math.max(0, Math.min(H, r.y + r.h) - Math.max(0, r.y));
  return 1 - (vw * vh) / (r.w * r.h);
}
