// Text Diff: what the tab shows of the engine's answer (textkit-diff.wasm). No DOM here.
import type { DiffRow, LineDiff, SpanDiff } from '../wasm/textdiff';

/** A stretch of the line view: rows that are shown, or a run of unchanged rows that is folded away. */
export type Block = { fold: false; rows: DiffRow[] } | { fold: true; rows: DiffRow[] };
/** Folds long runs of unchanged lines: `context` lines stay next to every change; a run is folded only when at
 *  least `min` lines would disappear. */
export function foldRows(rows: DiffRow[], context = 3, min = 6): Block[] {
  const blocks: Block[] = []; let shown: DiffRow[] = [];
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
/** The line under "Differences" for the line view. */
export function lineSummary(d: LineDiff): string {
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
