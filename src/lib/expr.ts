// Safe math expression parser (no eval). Pratt parser → closure tree.
// Supports: + - * / ^ % (postfix percent), ! (factorial), implicit multiplication (2pi, 3(4), 2x, (1)(2)),
// unicode × ÷ − √ π, constants pi/π, e, tau, phi, ans, functions and user variables.

export type Env = Record<string, number>;
export type Fn = (env: Env) => number;
export interface CompileOpts { deg?: boolean }

const FUNCS: Record<string, (deg: boolean) => (...a: number[]) => number> = {
  sin: (d) => (x) => Math.sin(d ? (x * Math.PI) / 180 : x),
  cos: (d) => (x) => Math.cos(d ? (x * Math.PI) / 180 : x),
  tan: (d) => (x) => {
    if (d && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-12) return NaN;
    return Math.tan(d ? (x * Math.PI) / 180 : x);
  },
  asin: (d) => (x) => (d ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)),
  acos: (d) => (x) => (d ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)),
  atan: (d) => (x) => (d ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)),
  atan2: (d) => (y, x) => (d ? (Math.atan2(y, x) * 180) / Math.PI : Math.atan2(y, x)),
  sinh: () => Math.sinh, cosh: () => Math.cosh, tanh: () => Math.tanh,
  asinh: () => Math.asinh, acosh: () => Math.acosh, atanh: () => Math.atanh,
  sec: (d) => (x) => 1 / Math.cos(d ? (x * Math.PI) / 180 : x),
  csc: (d) => (x) => 1 / Math.sin(d ? (x * Math.PI) / 180 : x),
  cot: (d) => (x) => 1 / Math.tan(d ? (x * Math.PI) / 180 : x),
  ln: () => Math.log, log: () => (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)),
  log10: () => Math.log10, log2: () => Math.log2, exp: () => Math.exp,
  sqrt: () => Math.sqrt, cbrt: () => Math.cbrt, root: () => (x, n) => (x < 0 && n % 2 === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
  abs: () => Math.abs, floor: () => Math.floor, ceil: () => Math.ceil, round: () => (x, n = 0) => { const f = 10 ** n; return Math.round(x * f) / f; },
  trunc: () => Math.trunc, sign: () => Math.sign, min: () => Math.min, max: () => Math.max, hypot: () => Math.hypot,
  mod: () => (a, b) => ((a % b) + b) % b,
  fact: () => factorial, gamma: () => gamma,
  nPr: () => (n, r) => factorial(n) / factorial(n - r),
  nCr: () => (n, r) => Math.round(factorial(n) / (factorial(r) * factorial(n - r))),
  gcd: () => (a, b) => gcd(a, b), lcm: () => (a, b) => Math.abs(a * b) / gcd(a, b),
  rand: () => () => Math.random(),
};
const CONSTS: Record<string, number> = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2, inf: Infinity };

export function gcd(a: number, b: number) { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) [a, b] = [b, a % b]; return a; }
export function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
export function factorial(n: number): number {
  if (n < 0) return NaN;
  if (Number.isInteger(n)) { if (n > 170) return Infinity; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
  return gamma(n + 1);
}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };
function lex(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\*\*/g, '^').replace(/√/g, ' sqrt ').replace(/²/g, '^2').replace(/³/g, '^3');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-zπ_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^%!(),='.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}

/** Split identifiers like "pix" or "sinx" when they are not known names (implicit multiplication). */
function splitIdent(name: string, vars: Set<string>): string[] {
  if (FUNCS[name] || name in CONSTS || vars.has(name) || name === 'ans') return [name];
  // greedy: known function/const prefixes, otherwise single letters
  const parts: string[] = [];
  let rest = name;
  outer: while (rest) {
    for (let l = rest.length; l > 0; l--) {
      const p = rest.slice(0, l);
      if (FUNCS[p] || p in CONSTS || vars.has(p) || p === 'ans') { parts.push(p); rest = rest.slice(l); continue outer; }
    }
    parts.push(rest[0]); rest = rest.slice(1);
  }
  return parts;
}

export function compile(src: string, opts: CompileOpts = {}, vars: string[] = []): Fn {
  const deg = !!opts.deg, varSet = new Set(vars);
  const raw = lex(src);
  const toks: Tok[] = [];
  for (const t of raw) {
    if (t.t === 'id') splitIdent(t.v, varSet).forEach((v) => toks.push({ t: 'id', v }));
    else toks.push(t);
  }
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string) => { if (!isOp(v)) throw new Error(`Expected "${v}"`); p++; };
  // can the next token start a factor (for implicit multiplication)?
  const startsFactor = () => { const t = peek(); return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '(')); };

  function primary(): Fn {
    const t = toks[p++];
    if (!t) throw new Error('Incomplete expression');
    if (t.t === 'num') { const v = t.v; return () => v; }
    if (t.t === 'op' && t.v === '(') { const e = expr(0); expect(')'); return e; }
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) { const e = unary(); return t.v === '-' ? (env) => -e(env) : e; }
    if (t.t === 'id') {
      const name = t.v;
      if (FUNCS[name]) {
        const f = FUNCS[name](deg);
        let args: Fn[] = [];
        if (isOp('(')) {
          p++;
          if (!isOp(')')) { args.push(expr(0)); while (isOp(',')) { p++; args.push(expr(0)); } }
          expect(')');
        } else args = [unary()]; // sin 30, sqrt 2
        if (args.length === 1) { const a = args[0]; return (env) => f(a(env)); }
        if (args.length === 2) { const [a, b] = args; return (env) => f(a(env), b(env)); }
        return (env) => f(...args.map((a) => a(env)));
      }
      if (name in CONSTS) { const v = CONSTS[name]; return () => v; }
      return (env) => { const v = env[name]; if (v === undefined) throw new Error(`Unknown name "${name}"`); return v; };
    }
    throw new Error(`Unexpected "${t.v}"`);
  }
  function postfix(): Fn {
    let e = primary();
    for (;;) {
      if (isOp('!')) { p++; const a = e; e = (env) => factorial(a(env)); continue; }
      if (isOp('%')) { p++; const a = e; e = (env) => a(env) / 100; continue; }
      break;
    }
    return e;
  }
  function power(): Fn {
    const base = postfix();
    if (isOp('^')) { p++; const ex = unary(); return (env) => Math.pow(base(env), ex(env)); }
    return base;
  }
  function unary(): Fn {
    if (isOp('-')) { p++; const e = unary(); return (env) => -e(env); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function term(): Fn {
    let e = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[p++].v; const r = unary(); const l = e;
        e = op === '*' ? (env) => l(env) * r(env) : (env) => l(env) / r(env);
      } else if (startsFactor()) { const r = power(); const l = e; e = (env) => l(env) * r(env); }
      else break;
    }
    return e;
  }
  function expr(_min: number): Fn {
    let e = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v; const r = term(); const l = e;
      e = op === '+' ? (env) => l(env) + r(env) : (env) => l(env) - r(env);
    }
    return e;
  }
  const root = expr(0);
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as any).v}"`);
  return root;
}

export function evaluate(src: string, env: Env = {}, opts: CompileOpts = {}): number {
  return compile(src, opts, Object.keys(env))(env);
}

/** Pretty result: up to 12 significant digits, no float noise (0.1+0.2 → 0.3). */
export function fmtNum(x: number, sig = 12): string {
  if (!isFinite(x)) return isNaN(x) ? 'Error' : x > 0 ? '∞' : '−∞';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e15 || a < 1e-9) return x.toExponential(sig - 3).replace(/\.?0+e/, 'e').replace('e+', 'e');
  return String(parseFloat(x.toPrecision(sig)));
}

export const FUNCTION_NAMES = Object.keys(FUNCS);
