// Typed wrapper around mathcore.wasm (own C: wasm/mathcore/mathcore.c).
// `bindMathcore(exports)` is environment-neutral so Node unit tests can use it too.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/mathcore.wasm?url';
import { lazyEngine } from '../lifecycle';

export type Complex = { re: number; im: number };
export interface Stats { count: number; sum: number; mean: number; median: number; min: number; max: number; range: number; q1: number; q3: number; iqr: number; varP: number; varS: number; sdP: number; sdS: number; geomean: number; harmmean: number; skew: number; sorted: number[]; modes: number[] }

export function bindMathcore(e: any) {
  const mem = () => e.memory.buffer as ArrayBuffer;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const withStr = <T>(s: string, f: (p: number, n: number) => T): T => {
    const b = enc.encode(s); const p = e.m_malloc(b.length + 1);
    new Uint8Array(mem(), p, b.length + 1).set([...b, 0]);
    try { return f(p, b.length); } finally { e.m_free(p); }
  };
  const withF64 = <T>(n: number, f: (p: number) => T, init?: ArrayLike<number>): T => {
    const p = e.m_malloc(Math.max(1, n) * 8);
    if (init) new Float64Array(mem(), p, n).set(init);
    try { return f(p); } finally { e.m_free(p); }
  };
  const f64 = (p: number, n: number) => Array.from(new Float64Array(mem(), p, n));
  const cstr = (p: number) => { const m = new Uint8Array(mem()); let q = p; while (m[q]) q++; return dec.decode(m.subarray(p, q)); };
  const err = () => cstr(e.m_error());

  /** A compiled expression; call free() when done (handles are limited). */
  class Expr {
    constructor(public h: number) {}
    eval(x = 0, ans = 0, y = 0) { return e.m_expr_eval(this.h, x, y, 0, 0, ans) as number; }
    range(x0: number, dx: number, n: number): Float64Array { return withF64(n, (p) => { e.m_expr_eval_range(this.h, x0, dx, n, p); return new Float64Array(mem().slice(p, p + n * 8)); }); }
    roots(a: number, b: number, samples = 20000, max = 50) { return withF64(max, (p) => f64(p, e.m_find_roots(this.h, a, b, samples, p, max))); }
    /** Samples for a plot: y[i] = f(x0 + i·dx) and join[i] = 1 when the curve runs unbroken from sample i−1 to i —
     *  jumps, poles and holes are told from steep but unbroken stretches (see m_expr_plot). `tol` in units of y. */
    plot(x0: number, dx: number, n: number, tol: number): { y: Float64Array; join: Uint8Array } {
      const py = e.m_malloc(Math.max(1, n) * 8), pj = e.m_malloc(Math.max(1, n));
      try { e.m_expr_plot(this.h, x0, dx, n, tol, py, pj); return { y: new Float64Array(mem().slice(py, py + n * 8)), join: new Uint8Array(mem().slice(pj, pj + n)) }; } finally { e.m_free(py); e.m_free(pj); }
    }
    uses(v: 'x' | 'y' | 'z' | 't' | 'ans') { return !!e.m_expr_uses(this.h, ['x', 'y', 'z', 't', 'ans'].indexOf(v)); }
    free() { e.m_expr_free(this.h); }
  }

  return {
    compile(src: string, deg = false): Expr {
      const h = withStr(src, (p, n) => e.m_expr_compile(p, n, deg ? 1 : 0));
      if (!h) throw new Error(err());
      return new Expr(h);
    },
    /** one-shot evaluation */
    /** Why the last evaluation gave NaN: a division by zero, or something a function is not defined for. */
    why(): '' | 'div0' | 'domain' { return (['', 'div0', 'domain'] as const)[e.m_expr_why() as number] || ''; },
    /** one-shot evaluation. `numbersOnly`: the letters x, y, z, t stand for nothing (a calculator, not a formula) —
     *  "2x" is then an error instead of 2 × 0. */
    evaluate(src: string, opts: { deg?: boolean; x?: number; ans?: number; numbersOnly?: boolean } = {}) {
      const ex = this.compile(src, opts.deg);
      try {
        if (opts.numbersOnly) for (const v of ['x', 'y', 'z', 't'] as const) if (ex.uses(v)) throw new Error(`Unknown name: ${v}`);
        return ex.eval(opts.x ?? 0, opts.ans ?? 0);
      } finally { ex.free(); }
    },
    quadratic(a: number, b: number, c: number): Complex[] { return withF64(4, (p) => { e.m_quadratic(a, b, c, p); const r = f64(p, 4); return [{ re: r[0], im: r[1] }, { re: r[2], im: r[3] }]; }); },
    cubic(a: number, b: number, c: number, d: number): Complex[] { return withF64(6, (p) => { e.m_cubic(a, b, c, d, p); const r = f64(p, 6); return [0, 1, 2].map((k) => ({ re: r[2 * k], im: r[2 * k + 1] })); }); },
    det(A: number[][]) { const n = A.length; return withF64(n * n, (p) => e.m_det(p, n) as number, A.flat()); },
    inverse(A: number[][]): number[][] | null {
      const n = A.length;
      return withF64(n * n, (pa) => withF64(n * n, (po) => (e.m_inverse(pa, n, po) ? Array.from({ length: n }, (_, r) => f64(po + r * n * 8, n)) : null)), A.flat());
    },
    /** A + sign·B (same shape). */
    matadd(A: number[][], B: number[][], sign = 1): number[][] {
      const r = A.length, c = A[0].length;
      if (B.length !== r || B[0].length !== c) throw new Error('Same size needed.');
      return withF64(r * c, (pa) => withF64(r * c, (pb) => withF64(r * c, (po) => { e.m_matadd(pa, pb, r * c, sign, po); return Array.from({ length: r }, (_, i) => f64(po + i * c * 8, c)); }), B.flat()), A.flat());
    },
    transpose(A: number[][]): number[][] {
      const r = A.length, c = A[0].length;
      return withF64(r * c, (pa) => withF64(r * c, (po) => { e.m_transpose(pa, r, c, po); return Array.from({ length: c }, (_, i) => f64(po + i * r * 8, r)); }), A.flat());
    },
    trace(A: number[][]): number { const n = A.length; return withF64(n * n, (pa) => e.m_trace(pa, n), A.flat()); },
    /** A^p (square A, 0 ≤ p ≤ 1e6) by repeated squaring. */
    matpow(A: number[][], p: number): number[][] {
      const n = A.length;
      return withF64(n * n, (pa) => withF64(n * n, (po) => { e.m_matpow(pa, n, p, po); return Array.from({ length: n }, (_, i) => f64(po + i * n * 8, n)); }), A.flat());
    },
    /** Mon–Fri days in the inclusive range [a, b] of day numbers (days since 1970-01-01). */
    weekdays: (a: number, b: number) => e.m_weekdays(a, b) as number,
    /** Colour conversions (sRGB 0–255, HSL deg/%/%, OKLCH %/C/deg). */
    rgbToHsl: (r: number, g: number, b: number) => withF64(3, (o) => { e.m_color(0, r, g, b, o); return f64(o, 3); }),
    hslToRgb: (h: number, s: number, l: number) => withF64(3, (o) => { e.m_color(1, h, s, l, o); return f64(o, 3); }),
    rgbToOklch: (r: number, g: number, b: number) => withF64(3, (o) => { e.m_color(2, r, g, b, o); return f64(o, 3); }),
    oklchToRgb: (L: number, C: number, H: number) => withF64(3, (o) => { e.m_color(3, L, C, H, o); return f64(o, 3); }),
    /** OKLCH → sRGB with the gamut mapping of CSS Color 4 for colours outside sRGB (chroma reduced, clipped within a just-noticeable difference). */
    oklchToRgbFit: (L: number, C: number, H: number) => withF64(5, (o) => { e.m_color(5, L, C, H, o); const v = f64(o, 5); return { rgb: [v[0], v[1], v[2]] as number[], fitted: v[3] === 1, chroma: v[4] }; }),
    relLum: (r: number, g: number, b: number) => withF64(1, (o) => { e.m_color(4, r, g, b, o); return f64(o, 1)[0]; }),
    /** WCAG 2 contrast ratio. */
    contrast: (a: number[], b: number[]) => e.m_contrast(a[0], a[1], a[2], b[0], b[1], b[2]) as number,
    matmul(A: number[][], B: number[][]): number[][] {
      const r1 = A.length, c1 = A[0].length, c2 = B[0].length;
      if (B.length !== c1) throw new Error('Columns of A must equal rows of B.');
      return withF64(r1 * c1, (pa) => withF64(c1 * c2, (pb) => withF64(r1 * c2, (po) => { e.m_matmul(pa, r1, c1, pb, c2, po); return Array.from({ length: r1 }, (_, r) => f64(po + r * c2 * 8, c2)); }), B.flat()), A.flat());
    },
    rank(A: number[][]) { return withF64(A.length * A[0].length, (p) => e.m_rank(p, A.length, A[0].length) as number, A.flat()); },
    solveLinear(A: number[][], b: number[]): number[] | null { const n = A.length; return withF64(n * n, (pa) => withF64(n, (pb) => withF64(n, (px) => (e.m_solve_linear(pa, pb, n, px) ? f64(px, n) : null)), b), A.flat()); },
    stats(xs: number[]): Stats {
      const n = xs.length;
      return withF64(n, (px) => withF64(17, (po) => {
        e.m_stats(px, n, po);
        const o = f64(po, 17), sorted = f64(px, n);
        const modes = withF64(Math.max(1, n), (pm) => f64(pm, e.m_modes(px, n, pm, n)));
        const k = ['count', 'sum', 'mean', 'median', 'min', 'max', 'range', 'q1', 'q3', 'iqr', 'varP', 'varS', 'sdP', 'sdS', 'geomean', 'harmmean', 'skew'];
        return Object.assign(Object.fromEntries(k.map((name, i) => [name, o[i]])), { sorted, modes }) as unknown as Stats;
      }), xs);
    },
    regress(x: number[], y: number[]) { const n = x.length; return withF64(n, (px) => withF64(n, (py) => withF64(3, (po) => { e.m_regress(px, py, n, po); const [slope, intercept, r] = f64(po, 3); return { slope, intercept, r }; }), y), x); },
    isPrime: (n: bigint) => !!e.m_is_prime(BigInt.asUintN(64, n)),
    factor(n: bigint): bigint[] { const p = e.m_malloc(64 * 8); try { const k = e.m_factor(BigInt.asUintN(64, n), p); return Array.from(new BigUint64Array(mem(), p, k)); } finally { e.m_free(p); } },
    // wasm i64 results come back signed: read them as unsigned 64-bit (values ≥ 2^63 would otherwise be negative)
    gcd: (a: bigint, b: bigint) => BigInt.asUintN(64, e.m_gcd(a, b) as bigint),
    lcm: (a: bigint, b: bigint) => BigInt.asUintN(64, e.m_lcm(a, b) as bigint),
    nextPrime: (n: bigint) => BigInt.asUintN(64, e.m_next_prime(n) as bigint),
    /** an expression of fractions, exactly: numerator and denominator up to 38 digits. `rest` of an Error = the part that could not be read */
    fraction(src: string): { n: bigint; d: bigint } {
      const p = e.m_malloc(32);
      try {
        const ok = withStr(src, (s, len) => e.m_frac_eval(s, len, p));
        if (!ok) throw Object.assign(new Error(err()), { rest: cstr(e.m_frac_rest()) });
        const v = new BigInt64Array(mem(), p, 4), wide = (lo: bigint, hi: bigint) => (hi << 64n) | BigInt.asUintN(64, lo);
        return { n: wide(v[0], v[1]), d: wide(v[2], v[3]) };
      } finally { e.m_free(p); }
    },
    baseConvert(src: string, from: number, to: number): string | null {
      const cap = src.length * 6 + 16, out = e.m_malloc(cap);
      try { const n = withStr(src, (p, len) => e.m_base_convert(p, len, from, to, out, cap)); return n < 0 ? null : cstr(out); } finally { e.m_free(out); }
    },
    toRoman(n: number) { const p = e.m_malloc(32); try { return e.m_to_roman(n, p) ? cstr(p) : null; } finally { e.m_free(p); } },
    fromRoman(s: string) { const v = withStr(s.trim(), (p, n) => e.m_from_roman(p, n)) as number; return v || null; },
    /** as found on clock faces and buildings too (IIII, MDCCCCX): the value up to 4,999, or null */
    fromRomanLoose(s: string) { const v = withStr(s.trim(), (p, n) => e.m_from_roman_loose(p, n)) as number; return v || null; },
    words(n: bigint, indian: boolean) { const p = e.m_malloc(1024); try { e.m_words(n, indian ? 1 : 0, p, 1024); return cstr(p); } finally { e.m_free(p); } },
    emi: (P: number, annual: number, months: number) => e.m_emi(P, annual, months) as number,
    amortizeYearly(P: number, annual: number, months: number) { const max = 100; return withF64(max * 3, (p) => { const y = e.m_amortize_yearly(P, annual, months, p, max); const r = f64(p, y * 3); return Array.from({ length: y }, (_, i) => ({ principal: r[i * 3], interest: r[i * 3 + 1], balance: r[i * 3 + 2] })); }); },
    sip(amount: number, annual: number, years: number, stepup: number, lump: boolean) { return withF64(2, (p) => { e.m_sip(amount, annual, years, stepup, lump ? 1 : 0, p); const [invested, value] = f64(p, 2); return { invested, value }; }); },
    fd(amount: number, annual: number, years: number, comp: number, rd: boolean) { return withF64(2, (p) => { e.m_fd(amount, annual, years, comp, rd ? 1 : 0, p); const [invested, value] = f64(p, 2); return { invested, value }; }); },
    ppf: (yearly: number, annual: number, years: number) => e.m_ppf(yearly, annual, years) as number,
    /** EPF as the EPFO keeps the account (see m_epf). `eps` went to the pension scheme and is not in the corpus. */
    epf(basic: number, age: number, retire: number, balance: number, inc: number, annual: number) { return withF64(5, (p) => { e.m_epf(basic, age, retire, balance, inc, annual, p); const [corpus, own, employer, eps, interest] = f64(p, 5); return { corpus, own, employer, eps, interest, contrib: own + employer }; }); },
    nps(monthly: number, age: number, annual: number, annuityPct: number, annuityRate: number) { return withF64(4, (p) => { e.m_nps(monthly, age, annual, annuityPct, annuityRate, p); const [corpus, pension, lump, invested] = f64(p, 4); return { corpus, pension, lump, invested }; }); },
    /** when: prepay after that many instalments (0 = before the next one) */
    prepay(P: number, annual: number, months: number, pp: number, when: number, yearly: boolean, keepTenure: boolean) { return withF64(7, (p) => { e.m_prepay(P, annual, months, pp, when, yearly ? 1 : 0, keepTenure ? 1 : 0, p); const [emi, baseInterest, interest, monthsTaken, newEmi, prepaid, ended] = f64(p, 7); return { emi, baseInterest, interest, monthsTaken, newEmi, prepaid, paidOff: ended === 1 }; }); },
    bmi: (kg: number, m: number) => e.m_bmi(kg, m) as number,
    bmr: (male: boolean, kg: number, cm: number, age: number) => e.m_bmr(male ? 1 : 0, kg, cm, age) as number,
    bodyfat: (male: boolean, h: number, neck: number, waist: number, hip: number) => e.m_bodyfat(male ? 1 : 0, h, neck, waist, hip) as number,
    idealWeight(male: boolean, cm: number) { return withF64(4, (p) => { e.m_idealweight(male ? 1 : 0, cm, p); const [devine, robinson, miller, hamwi] = f64(p, 4); return { devine, robinson, miller, hamwi }; }); },
    /** GST invoice maths in integer paise. lines: [qty, rate ₹, discount %, GST %]. Returns rupees. */
    invoice(lines: Array<[number, number, number, number]>, intra: boolean, roundoff: boolean) {
      const n = lines.length, lp = e.m_malloc(Math.max(1, n) * 32), op = e.m_malloc(Math.max(1, n) * 32), tp = e.m_malloc(56);
      try {
        new Float64Array(mem(), lp, n * 4).set(lines.flat());
        e.m_invoice(lp, n, intra ? 1 : 0, roundoff ? 1 : 0, op, tp);
        const L = new BigInt64Array(mem(), op, n * 4), t = new BigInt64Array(mem(), tp, 7), r = (x: bigint) => Number(x) / 100;
        return {
          lines: Array.from({ length: n }, (_, i) => ({ taxable: r(L[i * 4]), cgst: r(L[i * 4 + 1]), sgst: r(L[i * 4 + 2]), igst: r(L[i * 4 + 3]) })),
          taxable: r(t[0]), cgst: r(t[1]), sgst: r(t[2]), igst: r(t[3]), total: r(t[4]), roundoff: r(t[5]), grand: r(t[6]),
        };
      } finally { e.m_free(lp); e.m_free(op); e.m_free(tp); }
    },
    /** GST on one amount in whole paise (see m_gst). Returns rupees, or null when the amount or the rate is out of range. */
    gst(amount: number, rate: number, inclusive: boolean, intra: boolean) {
      const p = e.m_malloc(40);
      try {
        if (!e.m_gst(amount, rate, inclusive ? 1 : 0, intra ? 1 : 0, p)) return null;
        const t = new BigInt64Array(mem(), p, 5), r = (x: bigint) => Number(x) / 100;
        return { base: r(t[0]), cgst: r(t[1]), sgst: r(t[2]), igst: r(t[3]), total: r(t[4]) };
      } finally { e.m_free(p); }
    },
    /** A bill split in whole paise (see m_bill_split): `items` in paise; `parts[i][p]` what person p had of item i (0 none, 1 each for
     *  shared equally, units); `extras` in paise, shared in proportion to each person's items or equally. For each person: the items,
     *  each extra, the total — each items and total figure within a paisa of the exact share, every row and column adding up to the
     *  paisa. Throws when an item has no one or is below zero. */
    billSplit(items: number[], parts: number[][], extras: Array<{ paise: number; equal?: boolean }>, people: number) {
      const ni = items.length, ne = extras.length, W = 2 + ne;
      const ip = e.m_malloc(Math.max(1, ni) * 8), pp = e.m_malloc(Math.max(1, ni * people) * 4), xp = e.m_malloc(Math.max(1, ne) * 8), qp = e.m_malloc(Math.max(1, ne) * 4), op = e.m_malloc(people * W * 8);
      try {
        new BigInt64Array(mem(), ip, ni).set(items.map((x) => BigInt(Math.round(x))));
        new Int32Array(mem(), pp, ni * people).set(parts.flatMap((r) => Array.from({ length: people }, (_, k) => Math.max(0, Math.round(r[k] ?? 0)))));
        new BigInt64Array(mem(), xp, ne).set(extras.map((x) => BigInt(Math.round(x.paise))));
        new Int32Array(mem(), qp, ne).set(extras.map((x) => (x.equal ? 1 : 0)));
        const rc = e.m_bill_split(ni, people, ip, pp, ne, xp, qp, op);
        if (rc === -1) throw new Error('An item is shared by no one: tick who had it.');
        if (rc === -2) throw new Error('No one had anything.');
        if (rc === -4) throw new Error('An item’s amount is below zero: put a discount among the charges.');
        const o = new BigInt64Array(mem(), op, people * W);
        return Array.from({ length: people }, (_, p) => ({ items: Number(o[p * W]), extras: Array.from({ length: ne }, (_, k) => Number(o[p * W + 1 + k])), total: Number(o[p * W + 1 + ne]) }));
      } finally { e.m_free(ip); e.m_free(pp); e.m_free(xp); e.m_free(qp); e.m_free(op); }
    },
    /** Sunrise, sunset and solar noon for the UTC date y-m-d at a latitude and longitude (east positive), as minutes after 0:00
     *  UTC of that date (m_sun: NOAA's formulas as astral computes them). rise / set null where there is none; polar: 1 the sun
     *  stays up all day, -1 it stays down, 0 neither. */
    sun(y: number, mo: number, d: number, lat: number, lon: number) {
      const p = e.m_malloc(3 * 8);
      try {
        const polar = e.m_sun(y, mo, d, lat, lon, p), o = new Float64Array(mem(), p, 3);
        const val = (x: number) => (Number.isNaN(x) ? null : x);
        return { rise: val(o[0]), set: val(o[1]), noon: o[2], polar: polar as -1 | 0 | 1 };
      } finally { e.m_free(p); }
    },
    /** GSTIN format + check character. */
    gstinValid: (g: string) => !!withStr(g.trim().toUpperCase(), (p, n) => e.m_gstin_valid(p, n)),
  };
}
export type Mathcore = ReturnType<typeof bindMathcore>;

export const mathcore = lazyEngine('mathcore', () => instantiateWasi(wasmUrl).then((x) => bindMathcore(x.exports)));

/** Display formatting (presentation only): up to 12 significant digits, no float noise. */
/** A number for a person. Whole numbers are shown whole up to 2^53 (2^40 = 1099511627776, digit for digit);
 *  other numbers with 12 significant digits — 15 from 10^11 on, where the part before the point needs them —
 *  which hides the noise of binary fractions (0.1 + 0.2 = 0.3); very large and very small ones with an exponent. */
export function fmtNum(x: number, sig = 12): string {
  if (!isFinite(x)) return isNaN(x) ? 'Error' : x > 0 ? '∞' : '−∞';
  if (x === 0) return '0';
  if (Number.isSafeInteger(x)) return String(x);
  const a = Math.abs(x);
  if (a >= 1e15 || a < 1e-9) return x.toExponential(sig - 3).replace(/\.?0+e/, 'e').replace('e+', 'e');
  return String(parseFloat(x.toPrecision(a >= 1e11 ? Math.max(sig, 15) : sig)));
}
