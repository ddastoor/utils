// The Scientific Calculator's dealings with text (src/tools/calc.ts): what is typed → what the engine is given, and
// numbers → what is put back into an expression. String work on one short line; the arithmetic is mathcore's.
import { fmtNum } from '../wasm/mathcore';

/** What the engine is given for what was typed: a letter x between two operands is the multiplication sign
 *  ("2x3", "4 x 5" — as people write it; this calculator has no unknowns). Names that hold an x stay (exp, max). */
export const prepare = (v: string) => {
  // one x at a time, so that the second x of "2x3x4" sees the × the first one became (and not a letter before its 3)
  for (let i = 0; i < 200; i++) {
    let hit = false;
    const next = v.replace(/([\d)π.%!])\s*[xX]\s*(?=[\d(π.√∛+\-−a-zA-Z])/g, (m, before, at, all) => { if (hit || /[a-zA-Z]/.test(all[at - 1] || '')) return m; hit = true; return `${before}×`; });
    if (!hit) break;
    v = next;
  }
  return v;
};
/** The text for a number in an expression, exact: the rounded form when it gives the same number back, else all digits. */
export const literal = (x: number) => { const t = fmtNum(x); return parseFloat(t.replace('−', '-')) === x ? t : String(x); };
/** Does this piece start a new operand (a digit, a bracket, a name) — as opposed to an operator that goes on from the result? */
export const startsOperand = (s: string) => /^[0-9.(πe√∛a-z]/i.test(s);
/** ±: a plain number changes its sign; anything else is put in −( … ), and −( … ) is taken out again. */
export const negate = (v: string) => {
  const t = v.trim().replace(/−/g, '-');
  if (!t) return '-';
  if (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return t.startsWith('-') ? t.slice(1) : `-${t}`;
  if (t.startsWith('-(') && t.endsWith(')')) { let d = 0, whole = true; for (let i = 1; i < t.length; i++) { if (t[i] === '(') d++; else if (t[i] === ')' && --d === 0 && i < t.length - 1) { whole = false; break; } } if (whole) return t.slice(2, -1); }
  return `-(${t})`;
};
