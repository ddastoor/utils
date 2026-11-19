// The Matrix Calculator's reading and its exact arithmetic: every cell is the decimal or the fraction that was typed
// (src/lib/exact.ts), so a determinant that is 0 is 0, a rank is certain, and an inverse can be shown in fractions.
// Matrices too large for that (see EXACT_CELLS) go to mathcore in double precision. No DOM.
import { type Q, ZERO, ONE, parseDec, add, sub, mul, div, isZero, toNumber, fracText } from './exact';

export type M = Q[][];
export const EXACT_CELLS = 400, MAX_SIDE = 60;
const size = (m: { length: number; 0?: { length: number } }) => `${m.length} × ${m[0]?.length ?? 0}`;

/** one cell: a decimal (1.5, −2e3) or a fraction of two (3/4, −1/3) */
function cell(text: string): Q | null {
  const t = text.replace(/[−–]/g, '-'), parts = t.split('/');
  if (parts.length === 1) return parseDec(t);
  if (parts.length !== 2) return null;
  const n = parseDec(parts[0]), d = parseDec(parts[1]);
  return n && d && !isZero(d) ? div(n, d) : null;
}
/** Rows on lines (or, on one line, separated by semicolons: 1 2; 3 4); cells by spaces, commas or tabs; brackets
 *  round the matrix or its rows are ignored. Throws an Error that names the matrix and what is wrong. */
export function readMatrix(text: string, name: string): M {
  const body = String(text ?? '').replace(/[[\](){}|]/g, ' ').trim();
  if (!body) throw new Error(`Matrix ${name} is empty.`);
  const lines = (body.includes('\n') ? body.split('\n') : body.split(';')).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((line, r) => line.split(/[\s,;]+/).filter(Boolean).map((t) => {
    const v = cell(t);
    if (!v) throw new Error(`Matrix ${name}, row ${r + 1}: "${t.length > 20 ? `${t.slice(0, 20)}…` : t}" is not a number${/\/\s*0+(\.0*)?$/.test(t) ? ' (a division by 0)' : ''}.`);
    return v;
  }));
  const bad = rows.findIndex((r) => r.length !== rows[0].length);
  if (bad > 0) throw new Error(`Matrix ${name}: row ${bad + 1} has ${rows[bad].length} ${rows[bad].length === 1 ? 'number' : 'numbers'} and row 1 has ${rows[0].length} — every row needs the same count.`);
  if (rows.length > MAX_SIDE || rows[0].length > MAX_SIDE) throw new Error(`Matrix ${name} is ${size(rows)} — at most ${MAX_SIDE} × ${MAX_SIDE}.`);
  return rows;
}
export const shape = (m: M) => size(m);
function square(a: M, what: string, name = 'A'): void { if (a.length !== a[0].length) throw new Error(`${what} needs a square matrix — ${name} is ${size(a)}.`); }
function sameShape(a: M, b: M, what: string): void { if (a.length !== b.length || a[0].length !== b[0].length) throw new Error(`To ${what}, both matrices need the same shape — A is ${size(a)} and B is ${size(b)}.`); }

export function addM(a: M, b: M, sign: 1 | -1 = 1): M { sameShape(a, b, sign > 0 ? 'add' : 'subtract'); return a.map((row, r) => row.map((v, c) => (sign > 0 ? add(v, b[r][c]) : sub(v, b[r][c])))); }
export function mulM(a: M, b: M): M {
  if (a[0].length !== b.length) throw new Error(`A × B needs as many columns in A as rows in B — A is ${size(a)} and B is ${size(b)}.`);
  return a.map((row) => b[0].map((_, c) => row.reduce((s, v, k) => (isZero(v) || isZero(b[k][c]) ? s : add(s, mul(v, b[k][c]))), ZERO)));
}
export const transposeM = (a: M): M => a[0].map((_, c) => a.map((row) => row[c]));
export function traceM(a: M): Q { square(a, 'The trace'); return a.reduce((s, row, i) => add(s, row[i]), ZERO); }
/** elimination on fractions: the determinant (for a square matrix) and the rank */
function eliminate(a: M): { det: Q; rank: number } {
  const m = a.map((r) => [...r]), rows = m.length, cols = m[0].length;
  let det = ONE, rank = 0;
  for (let c = 0; c < cols && rank < rows; c++) {
    const p = m.findIndex((row, r) => r >= rank && !isZero(row[c]));
    if (p < 0) { det = ZERO; continue; }
    if (p !== rank) { [m[p], m[rank]] = [m[rank], m[p]]; det = sub(ZERO, det); }
    det = mul(det, m[rank][c]);
    for (let r = rank + 1; r < rows; r++) if (!isZero(m[r][c])) { const f = div(m[r][c], m[rank][c]); for (let k = c; k < cols; k++) m[r][k] = sub(m[r][k], mul(f, m[rank][k])); }
    rank++;
  }
  return { det: rows === cols && rank === rows ? det : ZERO, rank };
}
export function detM(a: M): Q { square(a, 'The determinant'); return eliminate(a).det; }
export const rankM = (a: M): number => eliminate(a).rank;
/** the inverse, or null when the matrix has none (its determinant is 0) */
export function inverseM(a: M): M | null {
  square(a, 'The inverse');
  const n = a.length, m = a.map((row, r) => [...row, ...Array.from({ length: n }, (_, c) => (c === r ? ONE : ZERO))]);
  for (let c = 0; c < n; c++) {
    const p = m.findIndex((row, r) => r >= c && !isZero(row[c]));
    if (p < 0) return null;
    [m[p], m[c]] = [m[c], m[p]];
    const pv = m[c][c]; m[c] = m[c].map((v) => div(v, pv));
    m.forEach((row, r) => { if (r !== c && !isZero(row[c])) { const f = row[c]; m[r] = row.map((v, k) => sub(v, mul(f, m[c][k]))); } });
  }
  return m.map((row) => row.slice(n));
}
export const identity = (n: number): M => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (c === r ? ONE : ZERO)));
/** A to a whole power ≥ 0, by squaring */
export function powM(a: M, p: number): M {
  square(a, 'A power');
  let result = identity(a.length), base = a;
  for (let k = p; k > 0; k = Math.floor(k / 2)) { if (k % 2) result = mulM(result, base); if (k > 1) base = mulM(base, base); }
  return result;
}
/** the power box: a whole number 0 … 1000 */
export function readPower(text: string): number {
  const n = Number(String(text ?? '').trim());
  if (!String(text ?? '').trim() || !Number.isInteger(n) || n < 0 || n > 1000) throw new Error('n: a whole number from 0 to 1000.');
  return n;
}
/** is the exact way affordable? (cells, and for a power the work of multiplying) */
export const exactOk = (a: M, power = 1) => a.length * a[0].length <= EXACT_CELLS && a.length * a[0].length * Math.max(1, power) <= 20000;
export const toNumbers = (a: M): number[][] => a.map((row) => row.map((v) => toNumber(v) + 0));
/** a matrix as text: tabs between cells, a line per row; fractions or decimals (`num` writes a number) */
export function matrixText(a: M, fractions: boolean, num: (x: number) => string): string {
  return a.map((row) => row.map((v) => (fractions ? fracText(v) : num(toNumber(v) + 0).replace(/^-/, '−'))).join('\t')).join('\n');
}
export const valueText = (v: Q, fractions: boolean, num: (x: number) => string) => (fractions ? fracText(v) : num(toNumber(v) + 0).replace(/^-/, '−'));
