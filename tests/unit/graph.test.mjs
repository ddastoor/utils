// The Graphing Calculator: mathcore's plot sampler (m_expr_plot — which neighbours belong to one unbroken stretch of
// the curve) against the mathematics of each function, and the view's arithmetic (src/lib/graph.ts).
export default async (t, { load, wasm }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const G = await load('/src/lib/graph.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  let seed = 20261119; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  /** plot `src` on a grid and compare each join with `broken(a, b)` — does the curve break between a and b? */
  const check = (src, broken, { grids = 60, defined = () => true, tolPx = 8 } = {}) => {
    const ex = m.compile(src), bad = [];
    try {
      for (let k = 0; k < grids; k++) {
        const scale = 10 ** (rnd() * 4 - 1), W = 300, cx = (rnd() - 0.5) * 20, x0 = cx - W / 2 / scale, dx = 1 / (2 * scale), n = 2 * W + 1;
        const { y, join } = ex.plot(x0, dx, n, tolPx / scale);
        if (join[0] !== 0) bad.push('join[0] must be 0');
        for (let i = 0; i < n; i++) {
          const x = x0 + dx * i, want = ex.eval(x);
          if (!Object.is(y[i], want) && !(Number.isNaN(y[i]) && Number.isNaN(want))) bad.push(`${src}: y(${x}) = ${y[i]}, eval gives ${want}`);
          if (!i) continue;
          const a = x0 + dx * (i - 1), fin = Number.isFinite(y[i - 1]) && Number.isFinite(y[i]);
          const expect = fin && defined(a, x) && !(broken(a, x) && Math.abs(y[i] - y[i - 1]) > tolPx / scale) ? 1 : 0;
          if (join[i] !== expect && !(fin && Math.abs(y[i] - y[i - 1]) <= tolPx / scale)) bad.push(`${src} at scale ${scale.toPrecision(3)}: between ${a} and ${x} (${y[i - 1]} → ${y[i]}) join = ${join[i]}, expected ${expect}`);
          if (join[i] && !fin) bad.push(`${src}: joined across a value that does not exist at ${x}`);
        }
      }
    } finally { ex.free(); }
    return bad;
  };
  const holds = (a, b, at) => { const k = Math.ceil(a / at - 1e-300); return k * at > a && k * at <= b; }; // a multiple of `at` in (a, b]
  const poleBetween = (a, b, first, every) => { const k = Math.ceil((a - first) / every); return first + k * every >= a && first + k * every <= b; };

  // ---- unbroken curves stay in one piece, however steep
  for (const src of ['2', 'x/2 + 1', 'x^2', 'sin(x)', '1000x', '1000000x', 'x^3 - 2x', 'exp(x)', 'abs(x)', 'x^(1/3)', 'abs(x)^0.1', '50sin(20x)', 'atan(1000x)'])
    { const bad = check(src, () => false); t.ok(!bad.length, `${src}: one unbroken curve on 60 grids from 0.1 to 1,000 pixels per unit ${bad.slice(0, 2).join(' | ')}`); }
  // ---- jumps: the curve is cut exactly where it jumps
  { const bad = check('floor(x)', (a, b) => holds(a, b, 1)); t.ok(!bad.length, `floor(x): cut at every whole number and nowhere else — it used to get vertical connectors ${bad.slice(0, 2).join(' | ')}`); }
  { const bad = check('ceil(x)', (a, b) => Math.floor(b - 1e-300) > Math.floor(a) || (Number.isInteger(a) && b > a)); t.ok(!bad.length, `ceil(x) ${bad.slice(0, 2).join(' | ')}`); }
  { const bad = check('x - floor(x)', (a, b) => holds(a, b, 1)); t.ok(!bad.length, `the saw-tooth x − floor(x) ${bad.slice(0, 2).join(' | ')}`); }
  { const bad = check('abs(x)/x', (a, b) => a < 0 && b > 0); t.ok(!bad.length, `abs(x)/x: the two halves are not joined across 0 ${bad.slice(0, 2).join(' | ')}`); }
  { const bad = check('round(x)', (a, b) => holds(a - 0.5, b - 0.5, 1)); t.ok(!bad.length, `round(x) ${bad.slice(0, 2).join(' | ')}`); }
  // ---- poles
  { const bad = check('1/x', (a, b) => a <= 0 && b >= 0); t.ok(!bad.length, `1/x: no line across the pole ${bad.slice(0, 2).join(' | ')}`); }
  { const bad = check('tan(x)', (a, b) => poleBetween(a, b, Math.PI / 2, Math.PI), { grids: 40 }); t.ok(!bad.length, `tan(x): cut at every pole ${bad.slice(0, 2).join(' | ')}`); }
  { const bad = check('1/(x^2 - 1)', (a, b) => (a <= 1 && b >= 1) || (a <= -1 && b >= -1)); t.ok(!bad.length, `1/(x² − 1) ${bad.slice(0, 2).join(' | ')}`); }
  // ---- where a function is not defined nothing is drawn, and its edge is not joined to anything
  { const bad = check('sqrt(x)', () => false, { defined: (a) => a >= 0 }); t.ok(!bad.length, `sqrt(x): nothing left of 0, one piece right of it — the steep start included ${bad.slice(0, 2).join(' | ')}`); }
  { const bad = check('ln(x)', () => false, { defined: (a) => a > 0 }); t.ok(!bad.length, `ln(x) ${bad.slice(0, 2).join(' | ')}`); }
  { const bad = check('asin(x)', () => false, { defined: (a, b) => a >= -1 && b <= 1 }); t.ok(!bad.length, `asin(x) ${bad.slice(0, 2).join(' | ')}`); }
  // ---- by hand
  { const ex = m.compile('floor(x)'), p = ex.plot(-0.25, 0.5, 6, 0.1); ex.free();
    t.eq(`${[...p.y]} | ${[...p.join]}`, '-1,0,0,1,1,2 | 0,0,1,0,1,0', 'floor(x) at −0.25, 0.25, 0.75, 1.25, 1.75, 2.25'); }
  { const ex = m.compile('1000x'), p = ex.plot(-1, 0.01, 201, 0.16); ex.free(); t.ok(p.join.slice(1).every((j) => j === 1) && p.y[100] === 0, '1000x: every sample joined to the one before (the tab drew nothing)'); }
  { const ex = m.compile('1/x'), p = ex.plot(-1, 0.25, 9, 0.16); ex.free(); t.ok(Number.isNaN(p.y[4]) || !Number.isFinite(p.y[4]) ? p.join[4] === 0 && p.join[5] === 0 : false, '1/x at 0 itself: no value, no join on either side'); }
  { const ex = m.compile('x'), p = ex.plot(0, 1, 1, 1); ex.free(); t.ok(p.y.length === 1 && p.join[0] === 0, 'a single sample'); }
  { const ex = m.compile('sin(x)'), t0 = Date.now(); for (let k = 0; k < 50; k++) ex.plot(-12, 0.01, 2401, 0.16); const ms = Date.now() - t0; ex.free(); t.ok(ms < 1500, `50 curves of 2,401 samples in ${ms} ms`); }
  { const ex = m.compile('tan(1000x)'), t0 = Date.now(); const p = ex.plot(-12, 0.01, 2401, 0.16); const ms = Date.now() - t0; ex.free(); t.ok(ms < 1500 && p.y.length === 2401, `a curve that breaks between nearly all samples (tan(1000x)) in ${ms} ms`); }

  // ================================================================== what a function box may hold
  for (const [src, kind, body] of [['2x + 1', 'y', '2x + 1'], ['y = 2x + 1', 'y', '2x + 1'], ['Y=2x', 'y', '2x'], ['f(x) = sin(x)', 'y', 'sin(x)'], ['g ( x )=x^2', 'y', 'x^2'], ['  x^2  ', 'y', 'x^2'], ['x = 2', 'x', '2'], ['X=-pi/2', 'x', '-pi/2'], ['x=sqrt(2)', 'x', 'sqrt(2)']])
    { const r = G.readFunction(src); t.ok(r.kind === kind && r.body === body, `"${src}" is ${kind === 'x' ? 'the vertical line x = ' + body : 'the function ' + body}`); }
  for (const [src, reason] of [['', 'Type a function of x, such as 2x + 1 or sin(x).'], ['y =', 'Type a function of x, such as 2x + 1 or sin(x).'], ['x =', 'x = … needs a number after the = sign.'], ['x = 2 = 3', 'One = sign is enough: x = 2 draws a vertical line.'],
    ['x^2 + y^2 = 1', 'An equation cannot be drawn — write y as a function of x (2x + 1), or x = 2 for a vertical line. The Equation Solver solves equations.'], ['2x = 4', 'An equation cannot be drawn — write y as a function of x (2x + 1), or x = 2 for a vertical line. The Equation Solver solves equations.'],
    ['y = x = 2', 'An equation cannot be drawn — write y as a function of x (2x + 1), or x = 2 for a vertical line. The Equation Solver solves equations.']])
    t.eq(why(() => G.readFunction(src)), reason, `"${src}" is refused`);

  // ================================================================== the view
  t.eq([50, 40, 39, 100, 8, 0.5, 5000, 1e-9, 1e9, 400, 20].map((s) => G.tickStep(s)).join(' '), '1 1 2 0.5 5 100 0.01 50000000000 5e-8 0.1 2', 'grid lines 1, 2 or 5 × 10^k apart, at least 40 px');
  { let bad = []; for (let k = 0; k < 2000; k++) { const scale = 10 ** (rnd() * 24 - 12), s = G.tickStep(scale), lead = s / 10 ** Math.floor(Math.log10(s) + 1e-9); if (!(s * scale >= 40 * (1 - 1e-9) && s * scale < 100.0001) || ![1, 2, 5].some((d) => Math.abs(lead - d) < 1e-9)) bad.push(`${scale}: ${s}`); }
    t.ok(!bad.length, `2,000 scales: the step is 1, 2 or 5 × 10^k and 40 – 100 px on screen ${bad.slice(0, 3).join(' | ')}`); }
  t.eq(G.ticks(-2.5, 2.5, 1).join(' '), '-2 -1 0 1 2', 'ticks between −2.5 and 2.5');
  t.eq(G.ticks(-0.25, 0.25, 0.1).join(' '), '-0.2 -0.1 0 0.1 0.2', 'multiples of 0.1 (counted, not added up); −0 is 0');
  { const at3 = G.ticks(3 - 1e-15, 3 + 1e-15, 2e-16); t.ok(at3.length === 0, `a step smaller than the gap between two doubles near 3: no lines can be told apart there, and the list ends (${at3.length} lines) — adding the step never arrived, and the page froze`); }
  t.ok(G.ticks(0, 1e9, 1).length === 400 && G.ticks(1, 0, 1).length === 0 && G.ticks(0, 1, 0).length === 0 && G.ticks(NaN, 1, 1).length === 0, 'never more than 400 lines; nothing for an empty or senseless range');
  t.eq([[2, 1], [-2, 1], [0.5, 0.5], [0.25, 0.05], [3.000001, 0.000001], [-0.3, 0.1], [0, 1], [2e9, 1e9], [-4e-7, 1e-7], [12500000, 500000], [1e-5, 1e-5], [1234.5, 0.5], [3e-12, 1e-12], [-0, 1]].map(([v, s]) => G.tickLabel(v, s)).join(' '),
    '2 −2 0.5 0.25 3.000001 −0.3 0 2e9 −4e−7 1.25e7 1e−5 1234.5 3e−12 0', 'labels carry the digits their step needs');
  // zoom limits
  t.ok(G.clampScale(1e30, 0, 0) === 1e12 && G.clampScale(1e-30, 0, 0) === 1e-12 && G.clampScale(50, 0, 0) === 50 && G.clampScale(NaN, 0, 0) === 50 && G.clampScale(-5, 0, 0) === 50, 'the scale stays between 10⁻¹² and 10¹² pixels per unit');
  t.ok(G.clampScale(1e12, 3, 0) === 1e13 / 3 || G.clampScale(1e12, 3, 0) === 1e12, 'near the origin the full depth');
  t.ok(G.clampScale(1e12, 1e6, 0) === 1e7 && G.clampScale(1e12, 0, -1e9) === 1e4, 'far from the origin a pixel stays thousands of steps of a double wide: 10¹³ ÷ the distance');
  t.ok(G.clampCentre(1e300) === 1e15 && G.clampCentre(-1e300) === -1e15 && G.clampCentre(NaN) === 0 && G.clampCentre(3) === 3, 'the centre stays within ±10¹⁵');
  { let bad = [];
    for (let k = 0; k < 500; k++) {
      const v = { cx: (rnd() - 0.5) * 100, cy: (rnd() - 0.5) * 100, scale: 10 ** (rnd() * 6 - 2) }, W = 800, H = 460, px = rnd() * W, py = rnd() * H, f = 10 ** (rnd() * 2 - 1);
      const ux = v.cx + (px - W / 2) / v.scale, uy = v.cy - (py - H / 2) / v.scale, z = G.zoomAbout(v, px, py, f, W, H);
      const ux2 = z.cx + (px - W / 2) / z.scale, uy2 = z.cy - (py - H / 2) / z.scale;
      if (Math.abs(ux2 - ux) > 1e-9 * Math.max(1, Math.abs(ux)) || Math.abs(uy2 - uy) > 1e-9 * Math.max(1, Math.abs(uy)) || Math.abs(z.scale - v.scale * f) > 1e-9 * z.scale) bad.push(JSON.stringify([v, px, py, f, z]));
    }
    t.ok(!bad.length, `500 zooms: the point under the cursor stays under the cursor ${bad.slice(0, 2).join(' | ')}`); }
  { let v = { cx: 3, cy: 0, scale: 50 }; for (let k = 0; k < 400; k++) v = G.zoomAbout(v, 400, 230, 1.5, 800, 460); const lines = G.ticks(v.cx - 400 / v.scale, v.cx + 400 / v.scale, G.tickStep(v.scale));
    t.ok(v.scale <= 1e13 / 3 && Math.abs(v.cx - 3) < 1e-9 && lines.length > 0 && lines.length <= 21 && new Set(lines).size === lines.length, `400 zooms in at x = 3 stop at ${v.scale.toExponential(2)} px per unit with ${lines.length} distinct grid lines`);
    for (let k = 0; k < 400; k++) v = G.zoomAbout(v, 400, 230, 1 / 1.5, 800, 460);
    t.ok(v.scale === 1e-12 && Number.isFinite(v.cx), '400 zooms out stop at 10⁻¹² px per unit'); }
};
