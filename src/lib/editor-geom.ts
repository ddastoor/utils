// Image Editor: geometry that is worked out, not drawn. Straightening rotates the picture inside its own frame; the
// largest centred rectangle of the same shape that holds no empty corner is kept (as phone editors do).

/** The centred rectangle of a w × h picture rotated by `deg` that lies wholly inside the rotated picture, with the
 *  picture's own aspect ratio: scale k = min(w / (w·cos + h·sin), h / (w·sin + h·cos)). */
export function straightenCrop(w: number, h: number, deg: number) {
  const a = Math.abs(deg) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const k = Math.min(w / (w * c + h * s), h / (w * s + h * c));
  const cw = Math.max(1, Math.floor(w * k)), ch = Math.max(1, Math.floor(h * k));
  return { x: Math.floor((w - cw) / 2), y: Math.floor((h - ch) / 2), w: cw, h: ch };
}

export const MAX_SIDE = 16384;
/** A width or height typed into the Resize boxes: a whole number of pixels 1 – 16,384, or the reason it is not. */
export function readSide(v: string, label: string): number | string {
  const t = v.trim();
  if (!t) return `Type the ${label}.`;
  const n = Number(t);
  if (!Number.isFinite(n) || n !== Math.round(n)) return `The ${label} is a whole number of pixels.`;
  if (n < 1) return `The ${label} must be at least 1 pixel.`;
  if (n > MAX_SIDE) return `The ${label} can be at most ${MAX_SIDE.toLocaleString('en-IN')} pixels (browsers cannot hold larger pictures).`;
  return n;
}
