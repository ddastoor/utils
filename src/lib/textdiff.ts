// Text Diff: what the tab shows of the engine's answer (textkit-diff.wasm). No DOM here.
import type { DiffRow, LineDiff, SideRow, SpanDiff } from '../wasm/textdiff';

/** a row of either line view: its kind first (0 = unchanged), its line numbers next (0 = not on that side) */
type Row = DiffRow | SideRow;
/** A stretch of the line view: rows that are shown, or a run of unchanged rows that is folded away. */
export type Block<R extends Row = DiffRow> = { fold: false; rows: R[] } | { fold: true; rows: R[] };
/** Folds long runs of unchanged lines: `context` lines stay next to every change; a run is folded only when at
 *  least `min` lines would disappear. */
export function foldRows<R extends Row>(rows: R[], context = 3, min = 6): Block<R>[] {
  const blocks: Block<R>[] = []; let shown: R[] = [];
  for (let i = 0; i < rows.length;) {
    if (rows[i][0] !== 0) { shown.push(rows[i++]); continue; }
    let j = i; while (j < rows.length && rows[j][0] === 0) j++;
    const head = i === 0 ? 0 : context, tail = j === rows.length ? 0 : context, hidden = j - i - head - tail;
    if (hidden >= min) {
      shown.push(...rows.slice(i, i + head));
      if (shown.length) blocks.push({ fold: false, rows: shown });
      blocks.push({ fold: true, rows: rows.slice(i + head, j - tail) });
      shown = rows.slice(j - tail, j);
    } else shown.push(...rows.slice(i, j));
    i = j;
  }
  if (shown.length) blocks.push({ fold: false, rows: shown });
  return blocks;
}

const n = (x: number) => x.toLocaleString('en-IN');
const count = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;
/** The line under "Differences" for the line views. */
export function lineSummary(d: Pick<LineDiff, 'added' | 'removed' | 'same' | 'unified' | 'endA'>): string {
  if (!d.added && !d.removed) {
    if (d.unified) return `The texts differ only in the line break at the end: ${d.endA ? 'only the original' : 'only the changed text'} ends with one.`;
    return d.same ? 'The texts are identical.' : 'Both boxes are empty.';
  }
  return `${count(d.added, 'line')} added, ${n(d.removed)} removed, ${n(d.same)} unchanged`;
}
/** … for the word and the character view. */
export function spanSummary(d: SpanDiff): string {
  const unit = d.mode === 1 ? 'word' : 'character';
  if (!d.added && !d.removed) return d.spans.some(([k]) => k !== 0) ? `The same ${unit}s; only spaces or signs between them differ.` : d.spans.length ? 'The texts are identical.' : 'Both boxes are empty.';
  return `${count(d.added, unit)} added, ${n(d.removed)} removed, ${n(d.same)} unchanged`;
}
/** Said when the time limit cut the comparing short. */
export const APPROX = 'These texts differ so much that the shortest set of changes was not searched to the end: what is shown is correct (it turns the original into the changed text), but a shorter set may exist.';
/** How many rows of the line view are put on screen (the patch always holds everything). */
export const MAX_ROWS = 5000;
/** … and how many characters of the word / character view. */
export const MAX_SPAN_CHARS = 400_000;

/** A change of the side-by-side view: a run of rows between two unchanged lines — `first` … `last` (indexes of the
 *  rows), the lines it holds on each side (`a` in the original, `b` in the changed text: from … to, 0 lines = to <
 *  from) and where it stands (`at`: the unchanged line before it on each side, 0 at the top). */
export interface Hunk { first: number; last: number; a: [number, number]; b: [number, number]; at: [number, number] }
export function hunks(rows: Row[]): Hunk[] {
  const out: Hunk[] = []; let na = 0, nb = 0;
  for (let i = 0; i < rows.length;) {
    const r = rows[i];
    if (r[0] === 0) { na = r[1]; nb = r[2]; i++; continue; }
    const h: Hunk = { first: i, last: i, a: [na + 1, na], b: [nb + 1, nb], at: [na, nb] };
    for (; i < rows.length && rows[i][0] !== 0; i++) {
      const [, x, y] = rows[i];
      if (x) h.a[1] = na = x;
      if (y) h.b[1] = nb = y;
      h.last = i;
    }
    out.push(h);
  }
  return out;
}
const range = ([from, to]: [number, number]) => (to > from ? `lines ${n(from)}–${n(to)}` : `line ${n(from)}`);
/** Where a change stands, in words: "original line 4, changed lines 4–5", "2 lines added: changed lines 7–8",
 *  "line 12 removed: original line 12". */
export function hunkWhere(h: Hunk): string {
  const ca = h.a[1] - h.a[0] + 1, cb = h.b[1] - h.b[0] + 1;
  if (ca > 0 && cb > 0) return `original ${range(h.a)}, changed ${range(h.b)}`;
  if (ca > 0) return `${count(ca, 'line')} removed: original ${range(h.a)}`;
  return `${count(cb, 'line')} added: changed ${range(h.b)}`;
}
/** The words beside Previous and Next. */
export function hunkCounter(total: number, cur: number, h?: Hunk): string {
  if (!total) return 'No changes to go through.';
  if (cur < 0 || !h) return `${count(total, 'change')} — Next goes to the first.`;
  return `Change ${n(cur + 1)} of ${n(total)} — ${hunkWhere(h)}`;
}
