// The Statistics tab's reading of its two boxes: which pieces of text are numbers, and which are left out — said, not
// passed over. The statistics themselves are mathcore's (m_stats, m_regress). No DOM.

/** plain decimal numbers only: 1, -2.5, .5, 3e1, with a real minus sign (−) or a plus too */
const NUM = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const tidy = (s: string) => s.replace(/[−–]/g, '-');
const pieces = (s: string) => tidy(s).split(/[\s,;]+/).filter(Boolean);
const isNum = (t: string) => NUM.test(t) && Number.isFinite(Number(t));

export interface Numbers { values: number[]; /** pieces that are not numbers, as typed */ skipped: string[] }
/** numbers separated by commas, semicolons, spaces or line breaks */
export function readNumbers(text: string): Numbers {
  const values: number[] = [], skipped: string[] = [];
  for (const t of pieces(text)) if (isNum(t)) values.push(Number(t)); else skipped.push(t);
  return { values, skipped };
}
export interface Pairs { x: number[]; y: number[]; /** lines that are not a pair, with the reason */ problems: string[] }
/** one "x, y" pair a line; an empty line is skipped without a word */
export function readPairs(text: string): Pairs {
  const x: number[] = [], y: number[] = [], problems: string[] = [];
  text.split('\n').forEach((line, i) => {
    const t = pieces(line);
    if (!t.length) return;
    const bad = t.find((p) => !isNum(p));
    if (bad !== undefined) problems.push(`Line ${i + 1}: "${bad}" is not a number — the line is left out.`);
    else if (t.length !== 2) problems.push(`Line ${i + 1}: ${t.length === 1 ? 'one number' : `${t.length} numbers`} — a pair is two (x, y); the line is left out.`);
    else { x.push(Number(t[0])); y.push(Number(t[1])); }
  });
  return { x, y, problems };
}
/** "abc, 12x and 3 more" — at most `max` pieces by name */
export function someOf(items: string[], max = 5): string {
  const shown = items.slice(0, max).map((s) => (s.length > 20 ? `${s.slice(0, 20)}…` : s)).join(', ');
  return items.length > max ? `${shown} and ${(items.length - max).toLocaleString('en-IN')} more` : shown;
}
/** y = 2.5x − 0.67 */
export function lineText(slope: number, intercept: number, num: (x: number) => string): string {
  const a = num(slope).replace(/^-/, '−'), b = num(Math.abs(intercept));
  return `y = ${a === '1' ? '' : a === '−1' ? '−' : a}x${intercept === 0 ? '' : ` ${intercept < 0 ? '−' : '+'} ${b}`}`;
}
