// mathcore.wasm: expressions, roots, polynomials, linear algebra, stats, integers, fractions, bases, words, finance, health.
export default async (t, { load, wasm }) => {
  const { bindMathcore, fmtNum } = await load('/src/wasm/mathcore.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ev = (s, o = {}) => fmtNum(m.evaluate(s, { x: 3, ...o }));
  // --- expressions
  const cases = [
    ['1+2*3', '7'], ['(1+2)*3', '9'], ['2^3^2', '512'], ['-2^2', '-4'], ['0.1+0.2', '0.3'], ['2pi', fmtNum(2 * Math.PI)], ['3(4+1)', '15'],
    ['5!', '120'], ['50%', '0.5'], ['200*15%', '30'], ['200+10%', '220'], ['200-10%', '180'], ['200+10%*2', '200.2'], ['50%+50%', '0.75'], ['200+(10)%', '220'], ['200+3*10%', '200.3'], ['10%-1', '-0.9'], ['(200+10%)/2', '110'], ['sqrt(16)', '4'], ['√16', '4'], ['cos(pi)', '-1'], ['log(1000)', '3'], ['ln(e)', '1'],
    ['log(8,2)', '3'], ['nCr(5,2)', '10'], ['nPr(5,2)', '20'], ['10÷4', '2.5'], ['6×7', '42'], ['7−2', '5'], ['1e3+1', '1001'], ['abs(-3)', '3'],
    ['(2)(3)', '6'], ['2 sqrt 9', '6'], ['gcd(12,18)', '6'], ['lcm(4,6)', '12'], ['0.5!', fmtNum(Math.sqrt(Math.PI) / 2)], ['π', fmtNum(Math.PI)],
    ['3²', '9'], ['2³', '8'], ['2**10', '1024'], ['mod(-7,3)', '2'], ['round(2.567,2)', '2.57'], ['hypot(3,4)', '5'], ['root(27,3)', '3'], ['root(-8,3)', '-2'],
    ['cbrt(-27)', '-3'], ['1/0', 'Error'] /* a division by zero is refused since Nov 2026 (tests/unit/calc.test.mjs) */, ['10^400', '∞'], ['sinh(0)', '0'], ['atan2(1,1)', fmtNum(Math.PI / 4)], ['e^2', fmtNum(Math.E ** 2)], ['tau/2', fmtNum(Math.PI)], ['log10(100)', '2'], ['log2(8)', '3'], ['x2', '6'],
  ];
  for (const [s, want] of cases) { let got; try { got = ev(s); } catch (e) { got = 'ERR ' + e.message; } t.eq(got, want, `expr ${s}`); }
  t.eq(ev('sin(30)', { deg: true }), '0.5', 'sin 30°');
  t.eq(ev('tan(45)', { deg: true }), '1', 'tan 45°');
  t.eq(ev('asin(1)', { deg: true }), '90', 'asin 1 = 90°');
  t.eq(ev('tan(90)', { deg: true }), 'Error', 'tan 90° undefined');
  t.eq(ev('2x+1', { x: 3 }), '7', '2x+1 at x=3');
  t.eq(ev('x^2', { x: 3 }), '9', 'x^2');
  t.eq(ev('sinx', { x: 2 }), fmtNum(Math.sin(2)), 'sinx implicit');
  t.eq(ev('ans*2', { ans: 21 }), '42', 'ans');
  t.eq(ev('x^2 = 9', { x: 3 }), '0', 'equation compiles to lhs-rhs');
  { // roots: sign changes, touching (double) roots off the sampling grid, no false roots
    const R = (src, a = -100, b = 100) => { const e = m.compile(src); try { return e.roots(a, b); } finally { e.free(); } };
    const r1 = R('x^3 - 2x = 1'); t.ok(r1.length === 3 && Math.abs(r1[0] + 1) < 1e-9 && Math.abs(r1[1] - (1 - Math.sqrt(5)) / 2) < 1e-9 && Math.abs(r1[2] - (1 + Math.sqrt(5)) / 2) < 1e-9, `x³ − 2x = 1 → −1, (1 ± √5)/2 (${r1})`);
    const r2 = R('(x - 1/3)^2'); t.ok(r2.length === 1 && Math.abs(r2[0] - 1 / 3) < 1e-6, `touching root (x − 1/3)² → 1/3 (${r2})`);
    const r3 = R('(x - 0.7)^2 * (x + 2.2)'); t.ok(r3.length === 2 && Math.abs(r3[0] + 2.2) < 1e-9 && Math.abs(r3[1] - 0.7) < 1e-6, `double + single root (${r3})`);
    t.eq(String(m.nextPrime(2n ** 64n - 1n)), '0', 'next prime above 2^64 − 1 → 0 (out of range), not 2');
    t.eq(String(m.nextPrime(18446744073709551556n)), '18446744073709551557', 'next prime just below 2^64');
    t.eq(String(m.gcd(18446744073709551557n * 1n, 18446744073709551557n)), '18446744073709551557', 'gcd above 2^63 read unsigned');
    t.eq(String(m.lcm(9223372036854775809n, 1n)), '9223372036854775809', 'lcm above 2^63 read unsigned');
    t.eq(R('x^2 + 1').length, 0, 'x² + 1: no real root');
    t.eq(R('x^2 + 1e-6').length, 0, 'x² + 10⁻⁶: no false touching root');
    t.eq(R('1/x').length, 0, '1/x: the pole is not a root');
    const r4 = R('sin(x) = 0.5', 0, 10); t.ok(r4.length === 4 && [Math.PI / 6, 5 * Math.PI / 6, 13 * Math.PI / 6, 17 * Math.PI / 6].every((v, i) => Math.abs(r4[i] - v) < 1e-9), `sin x = 0.5 on [0, 10] (${r4})`);
    const r5 = R('cos(x) - 1', -1, 13); t.ok(r5.length === 3 && Math.abs(r5[0]) < 1e-6 && Math.abs(r5[1] - 2 * Math.PI) < 1e-6 && Math.abs(r5[2] - 4 * Math.PI) < 1e-6, `cos x = 1 (touching) → 0, 2π, 4π (${r5})`);
  }
  for (const bad of ['1+', '(2', 'foo(2)', '2**', '', 'sin(', '3 $ 4', 'log(1,2,3)']) t.throws(() => m.evaluate(bad), `rejects "${bad}"`);
  // plotting range
  const sq = m.compile('x^2'); const r = sq.range(-2, 1, 5); t.eq(Array.from(r), [4, 1, 0, 1, 4], 'range eval'); t.ok(sq.uses('x'), 'uses x'); sq.free();
  // many handles do not leak
  for (let i = 0; i < 500; i++) m.compile('x+1').free();
  t.ok(true, 'handle reuse');
  // --- roots
  const cubic = m.compile('x^3 - 6x^2 + 11x - 6'); t.eq(cubic.roots(-10, 10).map((x) => +x.toFixed(9)), [1, 2, 3], 'roots of cubic'); cubic.free();
  const pole = m.compile('1/x'); t.eq(pole.roots(-5, 5).length, 0, 'pole is not a root'); pole.free();
  const eq = m.compile('x^3 - 2x = 1'); t.eq(eq.roots(-10, 10).length, 3, 'x³−2x=1 has 3 roots'); eq.free();
  // --- polynomials
  t.eq(m.quadratic(1, -3, 2).map((z) => z.re), [2, 1], 'quadratic real');
  const qc = m.quadratic(1, 2, 5); t.eq([qc[0].re, qc[0].im, qc[1].im], [-1, 2, -2], 'quadratic complex');
  t.near(m.quadratic(1, -1e8, 1)[1].re, 1e-8, 1e-15, 'quadratic stable small root');
  const cr = m.cubic(1, -6, 11, -6).map((z) => +z.re.toFixed(9)).sort(); t.eq(cr, [1, 2, 3], 'cubic three real');
  const cc = m.cubic(1, 0, 0, -1); t.near(cc[0].re, 1, 1e-12, 'cubic x³=1 real'); t.near(Math.abs(cc[1].im), Math.sqrt(3) / 2, 1e-12, 'cubic complex pair');
  // --- linear algebra
  t.near(m.det([[2, 1, 0], [1, 3, 1], [0, 1, 4]]), 18, 1e-12, 'det 3x3');
  t.eq(m.det([[1, 2], [2, 4]]), 0, 'det singular');
  const inv = m.inverse([[4, 7], [2, 6]]); t.near(inv[0][0], 0.6, 1e-12, 'inverse [0][0]'); t.near(inv[1][0], -0.2, 1e-12, 'inverse [1][0]');
  t.eq(m.inverse([[1, 2], [2, 4]]), null, 'inverse of singular is null');
  t.eq(m.matmul([[1, 2], [3, 4]], [[5, 6], [7, 8]]), [[19, 22], [43, 50]], 'matmul');
  t.eq(m.rank([[1, 2, 3], [2, 4, 6], [1, 0, 1]]), 2, 'rank');
  t.eq(m.solveLinear([[2, 3], [1, -1]], [8, -1]).map((x) => +x.toFixed(12)), [1, 2], 'solve 2x2');
  t.eq(m.solveLinear([[1, 1], [2, 2]], [1, 2]), null, 'dependent system');
  // --- statistics
  const s = m.stats([12, 15, 15, 18, 21, 24, 24, 24, 30]);
  t.eq([s.count, s.sum, s.median, s.min, s.max, s.range], [9, 183, 21, 12, 30, 18], 'stats basics');
  t.near(s.mean, 20.333333333333332, 1e-12, 'mean'); t.near(s.sdS, Math.sqrt(266 / 8), 1e-9, 'sample sd'); t.eq(s.modes, [24], 'mode');
  t.eq(m.stats([1, 2, 3]).modes, [], 'no mode');
  const rg = m.regress([1, 2, 3, 4], [3, 5, 7, 9]); t.near(rg.slope, 2, 1e-12, 'slope'); t.near(rg.intercept, 1, 1e-12, 'intercept'); t.near(rg.r, 1, 1e-12, 'r');
  // --- integers
  t.ok(m.isPrime(2n) && m.isPrime(97n) && !m.isPrime(1n) && !m.isPrime(561n), 'small primes / Carmichael');
  t.ok(m.isPrime(18446744073709551557n), 'largest 64-bit prime');
  t.ok(!m.isPrime(18446744073709551555n), '64-bit composite');
  t.eq(m.factor(360n), [2n, 2n, 2n, 3n, 3n, 5n], 'factor 360');
  t.eq(m.factor(600851475143n), [71n, 839n, 1471n, 6857n], 'factor Euler #3');
  t.eq(m.factor(18446744073709551557n), [18446744073709551557n], 'factor prime');
  t.eq(m.factor(4295098369n), [65537n, 65537n], 'factor square of prime (rho)');
  t.eq(m.gcd(84n, 360n), 12n, 'gcd'); t.eq(m.lcm(4n, 6n), 12n, 'lcm'); t.eq(m.nextPrime(100n), 101n, 'next prime');
  // --- fractions
  const fr = m.fraction('3/4 + 5/6 × 2 1/2'); t.eq([fr.n, fr.d], [17n, 6n], 'fraction expression with mixed number');
  const fd = m.fraction('0.125'); t.eq([fd.n, fd.d], [1n, 8n], 'decimal → exact fraction');
  const fp = m.fraction('(2/3)^-2'); t.eq([fp.n, fp.d], [9n, 4n], 'negative power');
  t.throws(() => m.fraction('1/0'), 'fraction division by zero');
  for (const [e, n, d] of [['1/3 ÷ 2/3', 1n, 2n], ['1/3 / 2/3', 1n, 2n], ['3/4 × 2/3', 1n, 2n], ['2/3^2', 2n, 9n], ['1 / 3 / 2', 1n, 6n], ['1/2/3', 1n, 6n], ['6/4', 3n, 2n], ['1/0.5', 2n, 1n], ['2 1/2 ÷ 1/2', 5n, 1n], ['-3/4 ÷ 3/8', -2n, 1n]]) {
    const q = m.fraction(e); t.eq([q.n, q.d], [n, d], `fraction literal: ${e} = ${n}/${d}`);
  }
  t.throws(() => m.fraction('2^(1/2)'), 'fractional power rejected');
  t.throws(() => m.fraction('99999999999999999 * 99999999999999999'), 'overflow detected');
  // --- bases, roman, words
  t.eq(m.baseConvert('255', 10, 16), 'FF', 'dec→hex'); t.eq(m.baseConvert('0xff', 16, 2), '11111111', 'hex prefix → bin');
  t.eq(m.baseConvert('-42', 10, 2), '-101010', 'negative'); t.eq(m.baseConvert('12345678901234567890123456789', 10, 16), '27E41B3246BEC9B16E398115', 'big number');
  t.eq(m.baseConvert('129', 8, 10), null, 'invalid digit'); t.eq(m.baseConvert('0', 10, 2), '0', 'zero');
  t.eq(m.toRoman(2026), 'MMXXVI', 'to roman'); t.eq(m.toRoman(3999), 'MMMCMXCIX', 'roman max'); t.eq(m.toRoman(0), null, 'roman 0');
  t.eq(m.fromRoman('mcmxc'), 1990, 'from roman'); t.eq(m.fromRoman('IIII'), null, 'non-canonical roman'); t.eq(m.fromRoman('XM'), null, 'invalid roman');
  t.eq(m.words(1234567n, true), 'twelve lakh thirty-four thousand five hundred and sixty-seven', 'indian words');
  t.eq(m.words(1234567n, false), 'one million two hundred and thirty-four thousand five hundred and sixty-seven', 'intl words');
  t.eq(m.words(1000000000n, true), 'one hundred crore', '100 crore');
  t.eq(m.words(0n, true), 'zero', 'zero words'); t.eq(m.words(100n, true), 'one hundred', '100');
  // --- finance (known answers, cross-checked with standard calculators)
  t.eq(Math.round(m.emi(2500000, 8.5, 240)), 21696, 'EMI 25L @8.5% 20y');
  t.eq(Math.round(m.emi(120000, 0, 12)), 10000, 'EMI zero interest');
  const am = m.amortizeYearly(2500000, 8.5, 240); t.eq(am.length, 20, 'amortisation years'); t.near(am[19].balance, 0, 1, 'loan fully repaid');
  t.eq(Math.round(m.sip(10000, 12, 15, 0, false).value), 5045760, 'SIP 10k @12% 15y');
  t.eq(Math.round(m.sip(100000, 10, 10, 0, true).value), 259374, 'lumpsum 1L @10% 10y');
  t.eq(Math.round(m.fd(100000, 7, 5, 4, false).value), 141478, 'FD quarterly');
  t.eq(Math.round(m.fd(100000, 7, 5, 0, false).value), 135000, 'FD simple');
  t.eq(Math.round(m.ppf(150000, 7.1, 15)), 4068209, 'PPF 1.5L 15y @7.1%');
  const pp = m.prepay(2500000, 8.5, 240, 200000, 12, false, false); t.ok(pp.interest < pp.baseInterest && pp.monthsTaken < 240, 'prepayment saves interest and months');
  const pt = m.prepay(2500000, 8.5, 240, 200000, 12, false, true); t.ok(pt.newEmi < pt.emi && pt.monthsTaken === 240, 'keep tenure lowers EMI');
  const nps = m.nps(10000, 30, 10, 40, 6); t.ok(nps.corpus > 2e7 && Math.abs(nps.lump - nps.corpus * 0.6) < 1, 'NPS corpus & 60% lump');
  const epf = m.epf(50000, 30, 58, 0, 6, 8.25); t.ok(epf.corpus > epf.contrib && epf.contrib > 0, 'EPF grows');
  // --- health & geodesy
  t.near(m.bmi(68, 1.7), 23.53, 0.01, 'BMI'); t.eq(Math.round(m.bmr(true, 70, 170, 30)), 1618, 'BMR Mifflin');
  t.near(m.bodyfat(true, 175, 38, 85, 0), 16.9, 0.2, 'body fat navy');
  t.near(m.idealWeight(true, 170).devine, 65.98, 0.05, 'Devine');
  t.ok(Number.isNaN(m.idealWeight(true, 140).devine), 'the ideal-weight formulas have no answer below 5 feet'); // distances on the Earth: wasm/geo, tests/unit/geo.test.mjs
  // matrices (C): add/sub, transpose, trace, power by squaring vs naive products
  const A = [[1, 2], [3, 4]], B = [[5, 6], [7, 8]];
  t.eq(m.matadd(A, B), [[6, 8], [10, 12]], 'A + B'); t.eq(m.matadd(A, B, -1), [[-4, -4], [-4, -4]], 'A − B');
  t.throws(() => m.matadd(A, [[1, 2, 3]]), 'size mismatch rejected');
  t.eq(m.transpose([[1, 2, 3], [4, 5, 6]]), [[1, 4], [2, 5], [3, 6]], 'transpose 2×3');
  t.eq(m.trace([[2, 9, 9], [9, 3, 9], [9, 9, 4]]), 9, 'trace');
  t.eq(m.matpow(A, 0), [[1, 0], [0, 1]], 'A⁰ = I'); t.eq(m.matpow(A, 1), A, 'A¹ = A');
  let naive = A; for (let i = 1; i < 7; i++) naive = m.matmul(naive, A);
  t.eq(m.matpow(A, 7), naive, 'A⁷ by squaring = repeated product');
  t.eq(m.matpow([[1, 1], [1, 0]], 30)[0][1], 832040, 'Fibonacci F(30) via [[1,1],[1,0]]³⁰');
  // weekdays (closed form) vs brute force over many ranges incl. negative day numbers (before 1970)
  const brute = (a, b) => { let n = 0; for (let d = a; d <= b; d++) { const g = new Date(d * 86400000).getUTCDay(); if (g && g !== 6) n++; } return n; };
  let wdOk = true, seed = 3;
  for (let i = 0; i < 400; i++) { seed = (seed * 48271) % 2147483647; const a = (seed % 40000) - 20000, len = (seed >> 7) % 900 - 5; if (m.weekdays(a, a + len) !== brute(a, a + len)) { wdOk = false; t.ok(false, `weekdays(${a}, ${a + len})`); break; } }
  t.ok(wdOk, 'weekdays closed form = brute force (400 random ranges, ±55 years)');
  const day = (s) => Date.UTC(...s.split('-').map((x, i) => +x - (i === 1 ? 1 : 0))) / 86400000;
  t.eq(m.weekdays(day('2026-01-01'), day('2026-12-31')), 261, '2026 has 261 weekdays');
  t.eq(m.weekdays(day('2026-11-14'), day('2026-11-15')), 0, 'a weekend has no weekdays');
};
