// The Statistics tab: mathcore's m_stats / m_modes / m_regress against tests/fixtures/stats/reference.json — every
// figure from the exact values of the doubles (Python's fractions), cross-checked there with Python's statistics
// module (scripts/make-stats-reference.py) — and the reading of the two boxes (src/lib/stats.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore, fmtNum } = await load('/src/wasm/mathcore.ts');
  const S = await load('/src/lib/stats.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/stats/reference.json'), 'utf8'));
  const ulps = (a, b) => (a === b ? 0 : Math.abs(a - b) / (Math.max(Math.abs(a), Math.abs(b)) * 2 ** -52));

  // ================================================================== 320 data sets
  const EXACT = ['count', 'sum', 'mean', 'median', 'min', 'max', 'range', 'q1', 'q3', 'iqr'];
  let bad = [], worst = { mean: 0, sum: 0, varP: 0, sdS: 0, skew: 0, geomean: 0 };
  for (const [texts, want] of ref.summaries) {
    const xs = texts.map(Number), s = m.stats(xs), at = `[${texts.slice(0, 6).join(', ')}${texts.length > 6 ? ', …' : ''}] (${texts.length})`, scale = Math.max(...xs.map(Math.abs));
    for (const k of EXACT) { // one rounding from the exact value: at most a step of a double (the interpolated ones two)
      const tol = k === 'sum' || k === 'mean' || k === 'count' || k === 'min' || k === 'max' ? 1 : 4;
      if (want[k] === null ? Number.isFinite(s[k]) : !(ulps(s[k], want[k]) <= tol || Math.abs(s[k] - want[k]) <= 4e-16 * scale)) bad.push(`${at}: ${k} = ${s[k]}, not ${want[k]}`);
      if (k in worst && want[k] !== null) worst[k] = Math.max(worst[k], ulps(s[k], want[k]));
    }
    for (const k of ['varP', 'varS', 'sdP', 'sdS', 'geomean', 'harmmean', 'skew']) {
      if (want[k] === null) { if (Number.isFinite(s[k])) bad.push(`${at}: ${k} = ${s[k]}, where there is none`); continue; }
      // the spread is taken about a rounded mean: good to the digits the data leave (the size of the numbers against their spread)
      const lost = k === 'geomean' || k === 'harmmean' ? 1 : Math.max(1, (scale * scale) / Math.max(want.varP, 1e-300)), tol = 2e-14 * Math.sqrt(lost) + 1e-13;
      if (!(Math.abs(s[k] - want[k]) <= tol * Math.max(Math.abs(want[k]), 1e-300) || (k === 'skew' && Math.abs(s[k] - want[k]) <= 1e-12 * Math.sqrt(lost)) || Math.abs(s[k] - want[k]) <= 1e-15 * scale * (k.startsWith('var') ? scale : 1))) bad.push(`${at}: ${k} = ${s[k]}, not ${want[k]}`);
    }
    if (JSON.stringify(s.modes) !== JSON.stringify(want.modes)) bad.push(`${at}: modes ${s.modes}, not ${want.modes}`);
    if (s.sorted.length !== xs.length || s.sorted.some((v, i) => i && v < s.sorted[i - 1])) bad.push(`${at}: not sorted`);
  }
  t.ok(ref.summaries.length === 320 && !bad.length, `${ref.summaries.length} data sets of 1 – 200 numbers — whole, decimal, 10⁹ + a few, mixed from 10⁻⁸ to 10¹², repeats, zeros, negatives: sum and mean rounded once from the exact value (${worst.sum}, ${worst.mean} steps of a double off at most), median, quartiles, both variances and deviations, skewness, geometric and harmonic mean, the modes ${bad.slice(0, 3).join(' | ')}`);
  // ---- by hand
  const st = (xs) => m.stats(xs);
  { const s = st([12, 15, 15, 18, 21, 24, 24, 24, 30]); t.ok(s.mean === 183 / 9 && s.median === 21 && s.q1 === 15 && s.q3 === 24 && s.iqr === 9 && s.modes.join() === '24' && Math.abs(s.sdP - ref.summaries[0][1].sdP) < 1e-14 && Math.abs(s.sdP - Math.sqrt(266 / 9)) < 1e-14 && s.count === 9 && s.sum === 183, `the sample: mean 20.3333, median 21, quartiles 15 and 24, mode 24 (${fmtNum(s.mean)}, ${s.sdP})`); }
  { const s = st([1e16, 1, -1e16]); t.ok(s.sum === 1 && s.mean === 1 / 3, `10¹⁶ + 1 − 10¹⁶ is 1 — the sum was 0 and the mean 0 (${s.sum}, ${s.mean})`); }
  { const s = st([0.1, 0.2, 0.3]); t.ok(fmtNum(s.sum) === '0.6' && fmtNum(s.mean) === '0.2' && Math.abs(s.sum - 0.6) < 1.2e-16, `0.1 + 0.2 + 0.3 (${s.sum})`); }
  { const s = st([1000000001, 1000000002, 1000000003]); t.ok(s.varP === 2 / 3 && s.varS === 1 && s.sdS === 1, `a large offset keeps its variance: 2/3 and 1 (${s.varP}, ${s.varS})`); }
  { const s = st([5]); t.ok(s.mean === 5 && s.median === 5 && s.varP === 0 && s.sdP === 0 && Number.isNaN(s.varS) && Number.isNaN(s.sdS) && Number.isNaN(s.skew) && s.modes.length === 0, 'one number: no sample variance, no skewness, no mode'); }
  { const s = st([3, 3, 3, 3]); t.ok(s.varP === 0 && Number.isNaN(s.skew) && s.modes.join() === '3' && s.geomean === 3 && Math.abs(s.harmmean - 3) < 1e-15, 'four equal numbers: variance 0, no skewness, mode 3'); }
  { const s = st([0, 1, 2]); t.ok(s.geomean === 0 && s.harmmean === 0, 'a zero among the numbers: geometric and harmonic mean 0 (they showed "—")'); }
  { const s = st([-1, 1, 2]); t.ok(Number.isNaN(s.geomean) && Number.isNaN(s.harmmean), 'a negative number: neither mean exists'); }
  { const s = st([2, 8]); t.ok(s.geomean === 4 && Math.abs(s.harmmean - 3.2) < 1e-15, 'geometric mean of 2 and 8 is 4, harmonic 3.2'); }
  { const s = st([1, 1, 2, 2, 3]); t.eq(s.modes.join(' '), '1 2', 'two modes'); }
  t.eq(st([]).count, 0, 'nothing: count 0');
  { const xs = Array.from({ length: 100000 }, (_, i) => (i * 7919) % 1000 / 10), t0 = Date.now(), s = st(xs), ms = Date.now() - t0; t.ok(s.count === 100000 && Math.abs(s.mean - 49.95) < 1e-9 && ms < 1500, `a lakh of numbers in ${ms} ms`); }

  // ================================================================== regression
  bad = [];
  for (const [pairs, want] of ref.lines) {
    const x = pairs.map((p) => +p[0]), y = pairs.map((p) => +p[1]), r = m.regress(x, y), at = JSON.stringify(pairs.slice(0, 3));
    const sx = Math.max(...x.map(Math.abs)), spread = Math.max(...x) - Math.min(...x), lost = spread ? Math.max(1, sx / spread) : 1;
    for (const k of ['slope', 'intercept', 'r']) {
      if (want[k] === null) { if (!Number.isNaN(r[k])) bad.push(`${at}: ${k} = ${r[k]}, where there is none`); continue; }
      const tol = (k === 'intercept' ? 1e-12 * lost * lost : 1e-12 * lost) + 1e-13;
      if (!(Math.abs(r[k] - want[k]) <= tol * Math.max(Math.abs(want[k]), k === 'intercept' ? Math.abs(want.slope) * sx : 0, 1e-300))) bad.push(`${at}: ${k} = ${r[k]}, not ${want[k]}`);
    }
    if (Math.abs(r.r) > 1) bad.push(`${at}: r = ${r.r} is beyond 1`);
  }
  t.ok(ref.lines.length === 160 && !bad.length, `${ref.lines.length} sets of pairs: slope, intercept and r of the exact least-squares line — also about x = 10⁹; none where all x (or all y) are equal ${bad.slice(0, 3).join(' | ')}`);
  { const r = m.regress([1, 2, 3], [2, 4, 7]); t.ok(r.slope === 2.5 && Math.abs(r.intercept + 2 / 3) < 1e-15 && Math.abs(r.r - 0.9933992677987828) < 1e-15, 'y = 2.5x − 0.6667 through (1, 2), (2, 4), (3, 7)'); }
  { const r = m.regress([1, 1, 1], [5, 7, 9]); t.ok(Number.isNaN(r.slope) && Number.isNaN(r.intercept) && Number.isNaN(r.r), 'all x equal: no line (the tab showed "y = Errorx + Error")'); }
  { const r = m.regress([1, 2, 3], [4, 4, 4]); t.ok(r.slope === 0 && r.intercept === 4 && Number.isNaN(r.r), 'all y equal: the level line y = 4, no correlation'); }
  { const r = m.regress([1, 2, 3], [1, 2, 3]), q = m.regress([1, 2, 3], [3, 2, 1]); t.ok(r.r === 1 && q.r === -1 && r.slope === 1 && q.slope === -1, 'perfect lines: r is exactly 1 and −1'); }

  // ================================================================== reading the boxes
  const rn = (s) => { const r = S.readNumbers(s); return `${r.values.join(' ')} | ${r.skipped.join(' ')}`; };
  t.eq(rn('12, 15;15\n18\t21  24'), '12 15 15 18 21 24 | ', 'commas, semicolons, tabs, spaces and line breaks separate');
  t.eq(rn('1, -2.5, .5, 3e1, +4, 5., 1E-2'), '1 -2.5 0.5 30 4 5 0.01 | ', 'the ways of writing a number');
  t.eq(rn('−3, –4'), '-3 -4 | ', 'a real minus sign (−) and a dash are read — they were left out without a word');
  t.eq(rn('12, abc, 15, 12x, 0x10, Infinity, NaN, 1.2.3, --5, 1e999'), '12 15 | abc 12x 0x10 Infinity NaN 1.2.3 --5 1e999', 'what is not a number is left out — and named');
  t.eq(rn(''), ' | ', 'an empty box');
  const rp = (s) => { const r = S.readPairs(s); return `${r.x.map((x, i) => `(${x}, ${r.y[i]})`).join(' ')} | ${r.problems.join(' ')}`; };
  t.eq(rp('1, 2\n2 4\n\n3;7'), '(1, 2) (2, 4) (3, 7) | ', 'a pair a line');
  t.eq(rp('1, 2\n5\n3, 4, 5\n6, x\n7, 8'), '(1, 2) (7, 8) | Line 2: one number — a pair is two (x, y); the line is left out. Line 3: 3 numbers — a pair is two (x, y); the line is left out. Line 4: "x" is not a number — the line is left out.', 'lines that are not a pair are named — a third number was dropped and a line with one number passed over, both without a word');
  t.eq([S.someOf(['a', 'b']), S.someOf(['a', 'b', 'c', 'd', 'e', 'f', 'g']), S.someOf(['x'.repeat(30)])].join(' | '), 'a, b | a, b, c, d, e and 2 more | xxxxxxxxxxxxxxxxxxxx…', 'a long list of left-out pieces is cut');
  t.eq([[2.5, -2 / 3], [1, 0], [-1, 4], [0, 4], [-0.5, -1], [3, 1e-7]].map(([a, b]) => S.lineText(a, b, (v) => fmtNum(v, 6))).join(' | '), 'y = 2.5x − 0.666667 | y = x | y = −x + 4 | y = 0x + 4 | y = −0.5x − 1 | y = 3x + 1e-7', 'the line as it is written');
};
