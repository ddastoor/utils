// The Long Screenshot Stitcher (potentials #87): screenshots of one chat or page, taken while it scrolls and given in any
// order → one tall picture. imgproc.wasm places every two screenshots against each other (wasm/imgproc/stitch.c:
// p_st_pair) and finds where to join them (p_st_seam); here they are put in order (by the page row each one starts at),
// joined, and copied into one picture. No DOM: the worker (src/workers/stitch.worker.ts) runs it, the unit suite too.
import type { Img, Imgproc, StitchPair } from '../wasm/imgproc';

/** A screenshot: its pixels as given (`orig`), and as wide as the others (`img`: the same picture, or made so — `from` its
 *  own width), its name. */
export interface Shot { id: number; name: string; orig: Img; img: Img; from?: number }
/** b below a: b's row y shows a's row y + shift; the stretch they share is b's rows y0 … y1 (its score, the best other
 *  shift's — and that shift —, the share of the rows the shift lays over each other that match). */
export interface Link { a: number; b: number; shift: number; y0: number; y1: number; score: number; other: number; otherShift: number; cover: number; sure: boolean }
export type Status = 'top' | 'joined' | 'line' | 'same' | 'alone';
/** A screenshot's place: the top of a picture, joined under another, under a line (nothing in common with the one above),
 *  left out as the same as another; `rows` in common with the one above, `exact` the rows match pixel for pixel. */
export interface Item { id: number; status: Status; under?: number; rows?: number; sure?: boolean; exact?: boolean; sameAs?: number; seam?: number }
export interface Arrangement { order: number[]; items: Map<number, Item>; manual: boolean }
/** what the picture is made of: rows y0 … y1 of a screenshot, or a line between screenshots that share nothing */
export type Piece = { id: number; y0: number; y1: number } | { line: number };
export interface Plan { pieces: Piece[]; width: number; height: number; joins: number[] /* rows of the picture where screenshots join */ }

/** a band's luma may differ by this (sixteenths: 4 levels) and still match */
export const TOL = 64;
/** a join needs a stretch scoring this much (rows of text matched, less twice those not) … */
export const MIN_SCORE = 12;
/** … and this share of the rows its shift lays over each other matching (a coincidence: a few rows among many that do not) */
export const MIN_COVER = 0.2;
/** the same screenshot: this share of its rows with detail match at the same place */
export const SAME = 0.9;
/** the line between screenshots that share nothing: rows, and its grey */
export const LINE_ROWS = 6, LINE_GREY = 128;
/** the most pixels a picture may have (400 MB of pixels; phones: less, the tab's choice) */
export const MAX_PX = 100e6;

const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** a pair's answer as a link with the upper screenshot first, or null when they share nothing for sure */
export function linkOf(a: number, b: number, p: StitchPair): Link | null {
  if (!p.found) return null;
  const all = p.allMatched + p.allMissed, cover = all ? p.allMatched / all : 0;
  if (p.score < MIN_SCORE || cover < MIN_COVER || p.score <= p.other) return null;
  const sure = p.score >= 2 * p.other;
  if (p.shift > 0) return { a, b, shift: p.shift, y0: p.y0, y1: p.y1, score: p.score, other: p.other, otherShift: p.otherShift, cover, sure };
  return { a: b, b: a, shift: -p.shift, y0: p.y0 + p.shift, y1: p.y1 + p.shift, score: p.score, other: p.other, otherShift: -p.otherShift, cover, sure };
}

/** The screenshots, every two of them placed against each other as they come. */
export class Stitch {
  shots = new Map<number, Shot>();
  /** the screenshots in the order they were given (their names' order when given together) */
  given: number[] = [];
  private st: ReturnType<Imgproc['stitcher']>;
  private pairs = new Map<string, { a: number; b: number; p: StitchPair }>();
  private seams = new Map<string, { row: number; mean: number }>();
  constructor(private ip: Imgproc) { this.st = ip.stitcher(); }

  /** the width every screenshot is made: the most common one (the widest of equals) */
  get width() {
    const n = new Map<number, number>();
    for (const s of this.shots.values()) n.set(s.orig.width, (n.get(s.orig.width) ?? 0) + 1);
    let w = 0, c = 0;
    for (const [k, v] of n) if (v > c || (v === c && k > w)) { w = k; c = v; }
    return w;
  }

  /** a screenshot in; made as wide as the others; placed against every other. `onPair` after each (the progress) */
  add(id: number, name: string, img: Img, onPair?: () => void) {
    const before = this.width;
    this.shots.set(id, { id, name, orig: img, img });
    this.given.push(id);
    const W = this.width;
    if (this.shots.size > 1 && W !== before) { // the common width changed: every screenshot again
      this.pairs.clear(); this.seams.clear();
      for (const s of this.shots.values()) this.fit(s, W);
      const ids = [...this.shots.keys()];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { this.pair(ids[i], ids[j]); onPair?.(); }
      return;
    }
    this.fit(this.shots.get(id)!, W);
    for (const o of this.shots.keys()) if (o !== id) { this.pair(o, id); onPair?.(); }
  }
  /** a screenshot made W wide (Lanczos, imgproc.wasm) when it is not; its rows into the matcher */
  private fit(s: Shot, W: number) {
    const o = s.orig;
    s.img = o.width === W ? o : this.ip.resize(o, W, Math.max(1, Math.round(o.height * W / o.width)));
    s.from = o.width === W ? undefined : o.width;
    this.st.add(s.id, s.img);
  }
  /** every two screenshots placed against each other — at the size of the smaller where one was made larger to fit (a
   *  copy sent through a chat app: enlarged it is soft, so the sharp one is made as small instead — Lanczos, imgproc.wasm —,
   *  and each band taken over three rows, which evens out JPEG's noise; the shift found there is scaled up) */
  private pair(a: number, b: number) {
    const [x, y] = a < b ? [a, b] : [b, a];
    const sx = this.shots.get(x)!, sy = this.shots.get(y)!, W = this.width, wm = Math.min(sx.orig.width, sy.orig.width);
    let p: StitchPair;
    if (wm < W) {
      const low = this.ip.stitcher(), at = (s: Shot) => (s.orig.width === wm ? s.orig : this.ip.resize(s.orig, wm, Math.max(1, Math.round(s.orig.height * wm / s.orig.width))));
      try { low.add(0, at(sx), true); low.add(1, at(sy), true); p = low.pair(0, 1, TOL); } finally { low.free(); }
      const k = W / wm, shift = p.shift * k;
      p = { ...p, shift, d: Math.floor(shift), f: shift - Math.floor(shift), y0: Math.round(p.y0 * k), y1: Math.round(p.y1 * k), otherShift: p.otherShift * k };
    } else p = this.st.pair(x, y, TOL);
    this.pairs.set(key(x, y), { a: x, b: y, p });
  }
  remove(id: number) {
    this.shots.delete(id); this.given = this.given.filter((x) => x !== id); this.st.remove(id);
    for (const k of [...this.pairs.keys()]) if (k.split(':').map(Number).includes(id)) this.pairs.delete(k);
    for (const k of [...this.seams.keys()]) if (k.split(':').slice(0, 2).map(Number).includes(id)) this.seams.delete(k);
  }
  free() { this.st.free(); this.shots.clear(); this.pairs.clear(); }

  /** the pair's raw answer as asked (b against a) */
  raw(a: number, b: number): StitchPair | null {
    const r = this.pairs.get(key(a, b)); if (!r) return null;
    if (r.a === a) return r.p;
    const p = r.p; // b against a = a against b turned round
    return { ...p, shift: -p.shift, d: -p.d - (p.f ? 1 : 0), f: p.f ? 1 - p.f : 0, y0: p.y0 + p.shift, y1: p.y1 + p.shift, otherShift: -p.otherShift };
  }
  /** the link between two screenshots (the upper first), if they share something */
  link(a: number, b: number): Link | null { const r = this.pairs.get(key(a, b)); return r ? linkOf(r.a, r.b, r.p) : null; }
  /** a duplicate of another (the earlier given) */
  sameAs(id: number): number | undefined {
    for (const o of this.given) {
      if (o === id) return undefined;
      const r = this.pairs.get(key(o, id));
      if (r && r.p.same >= SAME) return o;
    }
  }

  /** the order: by itself (every group of screenshots that share something, top to bottom by the page row each starts
   *  at; groups in the order given), or as the reader put them (`manual`) */
  arrange(manual?: number[]): Arrangement {
    const items = new Map<number, Item>();
    const dup = new Map<number, number>();
    for (const id of this.given) { const s = this.sameAs(id); if (s !== undefined) dup.set(id, s); }
    const live = this.given.filter((id) => !dup.has(id));
    let order: number[];
    if (manual) order = manual.filter((id) => this.shots.has(id) && !dup.has(id));
    else {
      // the strongest links first; a link that joins two groups places one against the other (Kruskal's forest)
      const links: Link[] = [];
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) { const l = this.link(live[i], live[j]); if (l) links.push(l); }
      links.sort((x, y) => y.score - x.score);
      const up = new Map(live.map((id) => [id, id]));
      const find = (x: number): number => { while (up.get(x) !== x) { up.set(x, up.get(up.get(x)!)!); x = up.get(x)!; } return x; };
      const adj = new Map<number, Array<{ to: number; d: number }>>(live.map((id) => [id, []]));
      for (const l of links) {
        const ra = find(l.a), rb = find(l.b); if (ra === rb) continue;
        up.set(ra, rb);
        adj.get(l.a)!.push({ to: l.b, d: l.shift }); adj.get(l.b)!.push({ to: l.a, d: -l.shift });
      }
      // each group: the page row each screenshot starts at, from its first given
      const off = new Map<number, number>(), groups: number[][] = [];
      for (const id of live) {
        if (off.has(id)) continue;
        const g: number[] = [id]; off.set(id, 0);
        for (let k = 0; k < g.length; k++) for (const e of adj.get(g[k])!) if (!off.has(e.to)) { off.set(e.to, off.get(g[k])! + e.d); g.push(e.to); }
        const rank = new Map(live.map((x, i) => [x, i]));
        g.sort((x, y) => off.get(x)! - off.get(y)! || rank.get(x)! - rank.get(y)!);
        groups.push(g);
      }
      order = groups.flat();
    }
    // each screenshot against the one above it
    order.forEach((id, i) => {
      const prev = order[i - 1];
      const l = prev === undefined ? null : this.link(prev, id);
      if (prev === undefined) items.set(id, { id, status: 'top' });
      else if (l && l.a === prev) items.set(id, { id, status: 'joined', under: prev, rows: Math.round(l.y1 - l.y0), sure: l.sure });
      else items.set(id, { id, status: 'line', under: prev });
    });
    for (const [id, s] of dup) items.set(id, { id, status: 'same', sameAs: s });
    return { order, items, manual: !!manual };
  }

  /** where two joined screenshots meet: a row of the lower one (the upper gives the rows above row + shift) */
  seam(a: number, b: number): { row: number; mean: number } {
    const l = this.link(a, b)!, k = `${a}:${b}:${l.shift}`;
    let s = this.seams.get(k);
    if (!s) {
      const r = this.ip.stitchSeam(this.shots.get(a)!.img, this.shots.get(b)!.img, Math.round(l.shift), l.y0, l.y1);
      s = { row: r.row, mean: r.mean };
      this.seams.set(k, s);
    }
    return s;
  }

  /** the rows at the top and at the bottom of screenshot `id` that stay put in the others of its size (its bars: the
   *  status bar and the app's title; the typing box and the buttons) — 0 when there is no other to tell by */
  bars(id: number): { top: number; bottom: number } {
    const me = this.shots.get(id)!, h = me.img.height;
    const others = [...this.shots.values()].filter((s) => s.id !== id && s.img.height === h && s.img.width === me.img.width && this.sameAs(s.id) === undefined);
    if (!others.length || this.sameAs(id) !== undefined) return { top: 0, bottom: 0 };
    const rows = others.map((o) => this.st.same(o.id, id, TOL));
    const changed = (y: number) => rows.filter((r) => r[y] === 0).length * 2 > rows.length; // a majority sees it change
    const run = 6; // content: rows that change, several in a row (a clock that changed is one short run)
    let top = 0;
    for (let y = 0; y + run <= h; y++) { let n = 0; while (n < run && changed(y + n)) n++; if (n === run) { top = y; break; } top = y + 1; }
    let bottom = 0;
    for (let y = h - 1; y - run + 1 >= 0; y--) { let n = 0; while (n < run && changed(y - n)) n++; if (n === run) { bottom = h - 1 - y; break; } bottom = h - y; }
    if (top + bottom >= h * 0.8) return { top: 0, bottom: 0 }; // nothing changes: no bars to tell
    return { top, bottom };
  }

  /** the picture: each screenshot of the order from where it meets the one above to where it meets the one below; a line
   *  where two share nothing. `bars`: leave out the top bars (of each group's first screenshot) and the bottom ones (of
   *  its last). Worked out in rows of the page (each screenshot starts at the page row of the one above + their shift):
   *  a screenshot whose share lies inside its neighbours' gives nothing */
  plan(arr: Arrangement, bars: { top?: boolean; bottom?: boolean } = {}): Plan {
    const W = this.width, pieces: Piece[] = [], joins: number[] = [];
    const order = arr.order.filter((id) => this.shots.has(id));
    let height = 0, i = 0;
    while (i < order.length) {
      const g = [order[i]]; // a group: screenshots joined one under another
      while (i + 1 < order.length && arr.items.get(order[i + 1])?.status === 'joined') g.push(order[++i]);
      i++;
      if (pieces.length) { pieces.push({ line: LINE_ROWS }); height += LINE_ROWS; }
      const off = [0], seam: number[] = [];
      for (let k = 0; k + 1 < g.length; k++) {
        const l = this.link(g[k], g[k + 1])!;
        off.push(off[k] + Math.round(l.shift));
        seam.push(off[k + 1] + this.seam(g[k], g[k + 1]).row);
      }
      let start = bars.top ? this.bars(g[0]).top : 0;
      for (let k = 0; k < g.length; k++) {
        const h = this.shots.get(g[k])!.img.height;
        let end = k + 1 < g.length ? seam[k] : off[k] + h - (bars.bottom ? this.bars(g[k]).bottom : 0);
        end = Math.min(Math.max(end, start), off[k] + h);
        if (end > start) {
          if (k > 0 && pieces.length && !('line' in pieces[pieces.length - 1])) joins.push(height);
          pieces.push({ id: g[k], y0: start - off[k], y1: end - off[k] }); height += end - start;
        }
        start = end;
      }
    }
    return { pieces, width: W, height, joins };
  }

  /** the picture of a plan, `scale` times its size (a preview: smaller; the screenshots made smaller once each) */
  compose(plan: Plan, scale = 1, small?: Map<number, Img>): Img {
    const W = Math.max(1, Math.round(plan.width * scale));
    const rowsOf = (p: Piece) => ('line' in p ? Math.max(1, Math.round(p.line * scale)) : Math.round(p.y1 * scale) - Math.round(p.y0 * scale));
    const H = plan.pieces.reduce((n, p) => n + Math.max(0, rowsOf(p)), 0);
    if (W * H > MAX_PX) throw new Error(`The picture would be ${W} × ${H} pixels — more than this page can make. Leave some screenshots out.`);
    const out = new Uint8ClampedArray(W * H * 4);
    let at = 0;
    for (const p of plan.pieces) {
      const n = Math.max(0, rowsOf(p));
      if ('line' in p) { out.fill(LINE_GREY, at * W * 4, (at + n) * W * 4); for (let i = at * W * 4 + 3; i < (at + n) * W * 4; i += 4) out[i] = 255; }
      else {
        const img = scale === 1 ? this.shots.get(p.id)!.img : small!.get(p.id)!;
        const y0 = Math.min(img.height, Math.round(p.y0 * scale)), y1 = Math.min(img.height, y0 + n);
        out.set(img.data.subarray(y0 * W * 4, y1 * W * 4), at * W * 4);
      }
      at += n;
    }
    return { data: out, width: W, height: H };
  }
}
