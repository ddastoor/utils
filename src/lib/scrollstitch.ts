// The joining of a scrolling screenshot (Screenshot tab, to-do #28 — owner, 26 Nov 2026: "Make a new option also for
// scrolling screenshots in the screenshot app"). Views of one page, taken while it scrolls, each placed against the view
// kept before it by imgproc.wasm (p_scroll_match: the rows that stay put at the top and the bottom — a sticky header, a
// footer — and the shift of the rest); the rows each view adds below the picture so far are copied as they are. No DOM:
// the worker (src/workers/scrollshot.worker.ts) feeds it frames, the unit suite synthetic pages.
//
// The picture in page rows: view k shows page rows S_k + y in its scrolling part (y from `top` to h − `bottom`). Rows up
// to `committed` are final. A new view adds the rows below `committed` that it shows above its own footer; the rows
// between `committed` and the top of its scrolling part (hidden under its header, or left as the last view's footer
// because they were blank there) come from the view before. At the end the footer of the lowest view closes the picture.
import type { Imgproc, ScrollFit } from '../wasm/imgproc';

/** Rows of one part: a browser's canvas holds 32,767 a side (Chrome), and the editor shows a part on a canvas. */
export const PART_H = 32000;
/** The most pixels one capture keeps (400 MB of pixels): a longer page is stopped there, and said. */
export const MAX_PX = 100e6;
/** The overlap's pixels at the shift found: the mean difference of a channel, the share of pixels clearly off. */
export const MEAN_OK = 2.5, BAD_OK = 0.015;

export type StepKind = 'first' | 'still' | 'added' | 'back' | 'nofit' | 'blank' | 'size' | 'full';
export interface Step { kind: StepKind; d: number; height: number; views: number; fit?: ScrollFit }
export interface Part { data: Uint8ClampedArray; width: number; height: number }

export function stitcher(ip: Imgproc, o: { partH?: number; maxPx?: number } = {}) {
  const partH = o.partH ?? PART_H, maxPx = o.maxPx ?? MAX_PX;
  let m: ReturnType<Imgproc['scrollMatcher']> | null = null;
  let w = 0, h = 0, S = 0, committed = 0, views = 0, low = 0, prior: number | undefined, full = false;
  const strips: Uint8ClampedArray[] = [];
  let foot: Uint8ClampedArray | null = null; // the footer of the lowest view: the picture ends with it
  const edge = { top: -1, bottom: -1 };        // the fewest rows that stayed put at a move so far (−1: none yet)
  const rowsOf = (a: Uint8ClampedArray) => a.length / (w * 4);
  const height = () => committed + (foot ? rowsOf(foot) : 0);
  const push = (a: Uint8ClampedArray) => { if (a.length) { strips.push(a); committed += rowsOf(a); } };
  const step = (kind: StepKind, d = 0, fit?: ScrollFit): Step => ({ kind, d, height: views > 1 ? height() : h, views, fit });

  return {
    get width() { return w; },
    get views() { return views; },
    /** A view (RGBA, fw × fh). `hint` = the shift expected from the scrolling seen (rows), the choice among shifts that fit
     *  equally; `trust`: it is exact (a view whose overlap is blank is then placed by it). */
    add(px: Uint8ClampedArray, fw: number, fh: number, hint?: number, trust = false): Step {
      if (full) return step('full');
      if (!m) { w = fw; h = fh; m = ip.scrollMatcher(w, h); m.first(px); views = 1; return step('first'); }
      if (fw !== w || fh !== h) return step('size');
      const f = m.match(px, hint ?? prior, edge);
      const known = trust && hint !== undefined && Math.round(hint) !== 0;
      let d = f.d;
      if (f.status === 0 && known) { d = Math.round(hint!); f.top = Math.max(0, edge.top); f.bottom = Math.max(0, edge.bottom); } // all its rows alike: blank — placed where the scrolling seen puts it
      else if (f.status === 0 || ((f.status === 1 || f.status === 3) && f.d === 0)) return step('still', 0, f);
      else if (f.status === 4) { if (!known || f.mean > MEAN_OK || f.bad > BAD_OK) return step('blank', 0, f); d = Math.round(hint!); }
      else if (f.status === 2 || f.mean > MEAN_OK || f.bad > BAD_OK) return step('nofit', f.d, f);
      // before the picture has begun, a move up moves its start up: the new view is the first
      if (views === 1 && d < 0) { m.keep(); prior = d; return step('back', d, f); }
      const Snew = S + d;
      if ((committed + h) * w > maxPx) { full = true; return step('full', d, f); }
      // rows hidden under the new view's header, or left as the old view's footer: from the view before
      if (Snew + f.top > committed) push(m.rows(committed - S, Math.min(h, Snew + f.top - S), true));
      // the new rows this view shows above its footer
      const from = committed - Snew, to = h - f.bottom;
      if (to > from) push(m.rows(from, to));
      if (Snew >= low) { low = Snew; foot = m.rows(h - f.bottom, h); } // the lowest view's footer
      m.keep(); S = Snew; views++; prior = d;
      if (f.status === 1 || f.status === 3) { // a header is never taller than the fewest rows that stayed put at a move
        edge.top = edge.top < 0 ? f.top : Math.min(edge.top, f.top);
        edge.bottom = edge.bottom < 0 ? f.bottom : Math.min(edge.bottom, f.bottom);
      }
      return step(d < 0 ? 'back' : 'added', d, f);
    },
    /** The picture: one part, or parts of at most PART_H rows, top to bottom. */
    finish(): Part[] {
      if (!m) return [];
      let all: Uint8ClampedArray[];
      if (views === 1) all = [m.rows(0, h, true)];
      else all = [...strips, ...(foot && foot.length ? [foot] : [])];
      m.free(); m = null;
      const total = all.reduce((n, a) => n + rowsOf(a), 0), parts: Part[] = [];
      let i = 0, off = 0; // the strip being read and the row within it
      for (let y = 0; y < total; ) {
        const ph = Math.min(partH, total - y), data = new Uint8ClampedArray(ph * w * 4);
        let at = 0;
        while (at < ph) {
          const s = all[i], left = rowsOf(s) - off, n = Math.min(left, ph - at);
          data.set(s.subarray(off * w * 4, (off + n) * w * 4), at * w * 4);
          at += n; off += n;
          if (off === rowsOf(s)) { all[i] = new Uint8ClampedArray(0); i++; off = 0; } // let the strip go
        }
        parts.push({ data, width: w, height: ph });
        y += ph;
      }
      strips.length = 0; foot = null;
      return parts;
    },
    /** let go without a picture */
    drop() { m?.free(); m = null; strips.length = 0; foot = null; },
  };
}
