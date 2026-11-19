// The Scientific Calculator's engine (wasm/mathcore: m_expr_*) and its display (fmtNum), against references that
// do not come from the engine: mpmath at 50 digits and Python's exact integers
// (scripts/make-calc-reference.py → tests/fixtures/calc/reference.json: every function over a grid of arguments in
// degrees and radians, 1,500 random expressions written with as few brackets as the grammar needs, 134 written
// cases). A result must be right to 12 digits AND be shown as the exact answer is shown — 0.1 + 0.2 as 0.3,
// 2^40 with every digit, sin 180° as 0.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore, fmtNum } = await load('src/wasm/mathcore.ts');
  const { prepare, literal, negate, startsOperand } = await load('src/lib/calc-text.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/calc/reference.json'), 'utf8'));
  const ev = (expr, mode = 'deg', ans = ref.ans) => m.evaluate(prepare(expr), { deg: mode === 'deg', ans, numbersOnly: true });
  const show = (expr, mode, ans) => { try { return fmtNum(ev(expr, mode, ans)); } catch (e) { return `! ${e.message}`; } };

  /** '' when `got` is the reference value, else what is wrong */
  const judge = (got, want, { tol = 1e-12, loose = false } = {}) => {
    if (want === 'undefined') return '';      // something inside is beyond the largest number: ∞, 0 (divided by it) or refused — no single right answer
    if (want === 'nan') return Number.isNaN(got) ? '' : `${got}, expected "no real result"`;
    if (want === 'inf' || want === '-inf') return got === (want === 'inf' ? Infinity : -Infinity) ? '' : `${got}, expected ${want}`;
    const w = Number(want);
    if (!Number.isFinite(got)) return `${got}, expected ${want}`;
    if (w === 0) return (loose ? Math.abs(got) <= tol : got === 0) ? '' : `${got}, expected exactly 0`;
    if (Math.abs(got - w) > tol * (loose ? Math.max(Math.abs(w), 1) : Math.abs(w))) return `${got}, expected ${want}`;
    return '';
  };
  /** the display: a whole number with all its digits; anything else as the exact answer would be displayed */
  const shown = (got, want) => {
    if (!/^-?[\d.e+-]+$/i.test(want)) return '';
    const w = Number(want), a = fmtNum(got), b = fmtNum(w);
    return a === b ? '' : `shown as ${a}, the exact answer is shown as ${b}`;
  };

  // ---- 1. every function over its grid --------------------------------------------------------------------------
  const byName = new Map();
  for (const [expr, mode, want] of ref.functions) {
    const name = /^\(?-?[\d.e]+\)?!$/.test(expr) ? 'x!' : /\^/.test(expr) ? 'a^b' : /^[a-zA-Z0-9]+/.exec(expr)[0];
    const g = byName.get(name) || { n: 0, bad: [], display: [] }; byName.set(name, g); g.n++;
    let got; try { got = ev(expr, mode); } catch (e) { g.bad.push(`${expr} [${mode}]: ${e.message}`); continue; }
    const w = judge(got, want); if (w) g.bad.push(`${expr} [${mode}] = ${w}`);
    else { const d = shown(got, want); if (d) g.display.push(`${expr} [${mode}] ${d}`); }
  }
  let nfn = 0, ndisp = 0;
  for (const [name, g] of byName) { nfn += g.n; ndisp += g.display.length; t.ok(!g.bad.length, `${name}: ${g.n} values as mpmath gives them (12 digits)${g.bad.length ? ` — ${g.bad.length} wrong: ${g.bad.slice(0, 3).join('; ')}` : ''}`); }
  t.ok(nfn === ref.functions.length && byName.size >= 40, `${nfn} function values in ${byName.size} groups`);
  const dispBad = [...byName.values()].flatMap((g) => g.display);
  t.ok(dispBad.length <= nfn * 0.003, `their display is that of the exact answer (${nfn - dispBad.length} of ${nfn}; a 12-digit display may differ in the last digit where the 13th is a 5) ${dispBad.slice(0, 4).join('; ')}`);

  // ---- 2. random expressions: the grammar ------------------------------------------------------------------------
  {
    const bad = [], disp = []; let finite = 0;
    for (const [expr, mode, want] of ref.trees) {
      let got; try { got = ev(expr, mode); } catch (e) { bad.push(`${expr}: ${e.message}`); continue; }
      const w = judge(got, want, { tol: 1e-10, loose: true }); if (w) bad.push(`${expr} = ${w}`);
      else if (want !== 'undefined' && want !== 'nan') { finite++; const d = shown(got, want); if (d && Math.abs(Number(want)) > 1e-6) disp.push(`${expr} ${d}`); }
    }
    for (let i = 0; i < 15; i++) { const part = bad.filter((_, k) => k % 15 === i); t.ok(!part.length, `random expressions, lot ${i + 1} of 15 (100 each): read as Python reads the fully bracketed form ${part.slice(0, 2).join('; ')}`); }
    t.ok(finite > 1200, `${finite} of ${ref.trees.length} have a value; the others divide by zero somewhere or have no real value — and are refused, not answered with 0 or ∞`);
    t.ok(disp.length <= finite * 0.01, `and are displayed as the exact answer is (${finite - disp.length} of ${finite}) ${disp.slice(0, 3).join('; ')}`);
  }

  // ---- 3. written cases: precedence, percent, things side by side, names, digits -----------------------------------
  for (const [expr, mode, want] of ref.written) {
    let got, err = ''; try { got = ev(expr, mode); } catch (e) { err = e.message; }
    const w = err || judge(got, want, { tol: 1e-12 }) || shown(got, want);
    t.ok(!w, `${expr} = ${fmtNum(Number(want === 'inf' ? Infinity : want === '-inf' ? -Infinity : want))}${w ? ` — ${w}` : ''}`);
  }

  // ---- 4. what is not an expression ---------------------------------------------------------------------------------
  for (const [expr, msg] of [['1.2.3', /sign is missing between two numbers/], ['1..2', /sign is missing between two numbers/], ['2 3', /sign is missing between two numbers/], ['1e5.5', /sign is missing between two numbers/], ['1 000', /sign is missing/],
    ['2+', /Incomplete expression/], ['', /Incomplete expression/], ['(2+3', /Missing \)/], ['2+3)', /Unexpected symbol after expression/], ['sin(', /Incomplete expression/], ['sin()', /Wrong number of function arguments/], ['max(1)', /Wrong number of function arguments/], ['log(1,2,3)', /Wrong number of function arguments/],
    ['2*/3', /Unexpected symbol/], ['foo(2)', /^Unknown name: foo$/], ['2 apples', /^Unknown name: apples$/], ['sinn(3)', /^Unknown name: n$/], ['2x', /^Unknown name: x$/], ['y+1', /^Unknown name: y$/], ['3t', /^Unknown name: t$/], ['z', /^Unknown name: z$/], ['2#3', /Unexpected character/], ['1,000', /Unexpected symbol after expression/], ['5 = 5 = 5', /Unexpected symbol after expression/],
    ['('.repeat(101) + '1' + ')'.repeat(101), /Nested too deeply/], ['-'.repeat(5000) + '1', /Nested too deeply/], ['sin '.repeat(200) + '1', /Nested too deeply/], ['2^'.repeat(150) + '2', /Nested too deeply/]]) {
    let said = 'no error'; try { said = `= ${ev(expr)}`; } catch (e) { said = e.message; }
    t.ok(msg.test(said), `${expr.length > 30 ? `${expr.slice(0, 14)}… (${expr.length} characters)` : JSON.stringify(expr)} is refused: ${said}`);
  }
  t.eq(ev('('.repeat(90) + '1+1' + ')'.repeat(90)), 2, 'ninety brackets inside one another are fine');
  t.eq(ev('1' + '+1'.repeat(5000)), 5001, 'a sum of 5,001 terms');
  { let ok = 0; for (let i = 0; i < 300; i++) { try { ev('('.repeat(3000)); } catch { /* refused */ } if (ev('6×7') === 42) ok++; } t.eq(ok, 300, 'after 300 refused expressions the engine still answers (no handle or stack is lost)'); }
  // in a formula (the graphing tab) the letters are unknowns
  t.eq([m.evaluate('2x+1', { x: 3 }), m.evaluate('x^2', { x: -4 }), m.evaluate('2x3', { x: 5 })], [7, 16, 30], 'without numbersOnly x is an unknown: 2x+1 at x = 3 is 7');

  // ---- 5. the display ------------------------------------------------------------------------------------------------
  t.eq([2 ** 40, 1234567 ** 2, 123456789012345, 2 ** 53 - 1, -(2 ** 53 - 1), 1e15, 999999999999999, 100000000000000].map((x) => fmtNum(x)), ['1099511627776', '1524155677489', '123456789012345', '9007199254740991', '-9007199254740991', '1000000000000000', '999999999999999', '100000000000000'], 'whole numbers up to 2^53 with all their digits (2^40 was shown as 1099511627780)');
  t.eq([2 ** 53, 2 ** 60, 1e21, 1.5e300, 170 * 1e300].map((x) => fmtNum(x)), ['9.007199255e15', '1.152921505e18', '1e21', '1.5e300', '1.7e302'], 'beyond 2^53: ten digits and an exponent');
  t.eq([0.1 + 0.2, 0.1 * 3, 1 - 0.9, 4.35 * 100, 1.1 * 1.1, 1 / 3, 2 / 3, Math.sqrt(2) ** 2, 0.49999999999999994, 0.9999999999999998].map((x) => fmtNum(x)), ['0.3', '0.3', '0.1', '435', '1.21', '0.333333333333', '0.666666666667', '2', '0.5', '1'], 'the noise of binary fractions is not shown');
  t.eq([1234567890123.5, 999999999999.9, 123456789012.345, 99999999999.9, 1e11 + 0.25].map((x) => fmtNum(x)), ['1234567890123.5', '999999999999.9', '123456789012.345', '99999999999.9', '100000000000.25'], 'large numbers with a fraction keep the digits before the point (999999999999.9 was shown as 1000000000000)');
  t.eq([1e-9, 1e-10, 1.5e-7, 0.000001, 1.23456789012345e-12, -2.5e-300].map((x) => fmtNum(x)), ['1e-9', '1e-10', '1.5e-7', '0.000001', '1.23456789e-12', '-2.5e-300'], 'small numbers');
  t.eq([0, -0, NaN, Infinity, -Infinity].map((x) => fmtNum(x)), ['0', '0', 'Error', '∞', '−∞'], 'zero, not a number, the infinities');
  // every display can be typed back in (the chain of a calculation goes through the text of a number)
  { let n = 0, ok = 0; for (const [expr, mode, want] of ref.functions) { if (!/^-?[\d.e+-]+$/i.test(want)) continue; const x = Number(want), txt = fmtNum(x); n++; try { if (fmtNum(ev(txt, mode)) === txt) ok++; } catch { /* counted as not ok */ } } t.eq(ok, n, `${n} displayed numbers, typed back in, are read as the same number`); }

  // ---- 6. the page's text helpers ----------------------------------------------------------------------------------
  t.eq(['2x3', '4 x 5', '2X3', '2x(3+1)', '(1+2)x3', '2xπ', '5!x2', '50%x30', '2x-3', '3x√4', '2xsin(30)'].map(prepare), ['2×3', '4×5', '2×3', '2×(3+1)', '(1+2)×3', '2×π', '5!×2', '50%×30', '2×-3', '3×√4', '2×sin(30)'], 'a letter x between two operands is the multiplication sign');
  t.eq(['exp(2)', 'max(1,2)', '2x', 'x', 'x+1', 'log2x3', 'hypot(3,4)', '2exp(1)', 'e^x'].map(prepare), ['exp(2)', 'max(1,2)', '2x', 'x', 'x+1', 'log2x3', 'hypot(3,4)', '2exp(1)', 'e^x'], 'names that hold an x, and an x that stands alone, are left for the engine to judge');
  t.eq([show('2x3'), show('4 x 5'), show('2x'), show('1.5x2x3')], ['6', '20', '! Unknown name: x', '9'], '2x3 = 6; 2x alone names the x');
  t.eq([1 / 3, 0.1 + 0.2, 2 ** 40, 0.5, 1e21, -2.5, 1e-7, 123456789.123456789].map(literal), ['0.3333333333333333', '0.30000000000000004', '1099511627776', '0.5', '1e21', '-2.5', '1e-7', '123456789.12345679'], 'a number put back into an expression is exact: all digits when the rounded form would be another number');
  { let ok = 0; const xs = [1 / 3, 0.1 + 0.2, Math.PI, Math.E * 1e10, 2 / 3 * 1e-8, -1 / 7, 1e15 / 3, 5e-324, 1.7976931348623157e308]; for (const x of xs) if (ev(literal(x)) === x) ok++; t.eq(ok, xs.length, 'and the engine reads it back as the same number'); }
  t.eq(['5', '-5', '−5', '2.5e3', '', '2+3', '-(2+3)', '-(2)+(3)', 'sin(30)', '-sin(30)', '−(4)', 'ans', '-(ans)'].map(negate), ['-5', '5', '5', '-2.5e3', '-', '-(2+3)', '2+3', '-(-(2)+(3))', '-(sin(30))', '-(-sin(30))', '4', '-(ans)', 'ans'], '±: a number changes its sign, an expression is wrapped, a wrapped one unwrapped — with either minus sign');
  t.eq(['7', '.', '(', 'π', 'sin(', 'e', '√', '∛', '+', '−', '×', '÷', '^', '!', '%', '^2', ')'].map(startsOperand), [true, true, true, true, true, true, true, true, false, false, false, false, false, false, false, false, false], 'after "=": a digit or a name starts anew, an operator goes on from the result');
  // going on from a result keeps it exact
  { const third = ev('1÷3'); t.eq([fmtNum(third), fmtNum(ev('ans×3', 'deg', third)), fmtNum(ev(`${fmtNum(third)}×3`))], ['0.333333333333', '1', '0.999999999999'], '1 ÷ 3 = , then × 3: through Ans it is 1 — through the rounded text it was 0.999999999999'); }
};
