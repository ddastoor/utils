import { h, card, field, input, textarea, button, segmented, clear, stack, row, note, copy, type Mount } from '../ui';
import { mathcore, fmtNum, type Complex } from '../wasm/mathcore';
import { ELEMENTS, CATEGORY_COLORS } from '../lib/elements';

// ================================================================== Graphing calculator
const COLORS = ['#4f46e5', '#e11d48', '#059669', '#d97706', '#0891b2', '#7c3aed'];
export const graph: Mount = async (root, ctx) => {
  const m = await mathcore();
  const fns: Array<{ src: string; on: boolean }> = [{ src: 'sin(x)', on: true }, { src: 'x^2/4 - 1', on: true }];
  let cx = 0, cy = 0, scale = 50; // px per unit
  let deg = false;
  const canvas = h('canvas', { class: 'graph-canvas' });
  const readout = h('div', { class: 'graph-readout muted small' });
  const list = h('div', { class: 'stack' });
  type Ex = ReturnType<typeof m.compile>;
  const compiled: Array<Ex | null> = [];

  const recompile = () => {
    compiled.forEach((c) => c?.free());
    compiled.length = 0;
    fns.forEach((f, i) => {
      const inp = list.querySelectorAll<HTMLInputElement>('.fn-input')[i];
      try { if (!f.src.trim()) throw 0; compiled.push(m.compile(f.src.replace(/^\s*y\s*=/, ''), deg)); inp?.classList.remove('bad'); }
      catch { compiled.push(null); inp?.classList.toggle('bad', !!f.src.trim()); }
    });
    draw();
  };
  const renderList = () => {
    clear(list).append(...fns.map((f, i) => h('div', { class: 'fn-row' },
      h('span', { class: 'fn-swatch', style: { background: COLORS[i % COLORS.length], opacity: f.on ? '1' : '.3' }, onclick: () => { f.on = !f.on; renderList(); draw(); }, title: 'Show/hide' }),
      h('span', { class: 'fn-y' }, 'y ='),
      input({ value: f.src, placeholder: 'e.g. 2x+1, sin(x), sqrt(x)', onInput: (v) => { f.src = v; recompile(); }, attrs: { class: 'input fn-input', spellcheck: 'false' } }),
      button('', () => { fns.splice(i, 1); renderList(); recompile(); }, { icon: 'X', small: true, variant: 'ghost', title: 'Remove' }))));
    recompile();
  };

  const draw = () => {
    const dpr = devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = (v: string) => css.getPropertyValue(v).trim();
    g.fillStyle = col('--surface'); g.fillRect(0, 0, W, H);
    const toPx = (x: number, y: number) => [W / 2 + (x - cx) * scale, H / 2 - (y - cy) * scale];
    const x0 = cx - W / 2 / scale, x1 = cx + W / 2 / scale, y0 = cy - H / 2 / scale, y1 = cy + H / 2 / scale;
    // grid step: 1, 2, 5 × 10^k so lines are >= 40 px apart
    const raw = 40 / scale, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
    g.lineWidth = 1; g.font = '11px system-ui'; g.fillStyle = col('--muted');
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      const [px] = toPx(x, 0); g.strokeStyle = col('--surface-3'); g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke();
      if (Math.abs(x) > step / 2) { const [, py] = toPx(0, 0); g.fillText(fmtNum(x, 6), px + 3, Math.min(H - 4, Math.max(12, py + 13))); }
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const [, py] = toPx(0, y); g.strokeStyle = col('--surface-3'); g.beginPath(); g.moveTo(0, py); g.lineTo(W, py); g.stroke();
      if (Math.abs(y) > step / 2) { const [px] = toPx(0, 0); g.fillText(fmtNum(y, 6), Math.min(W - 30, Math.max(3, px + 4)), py - 3); }
    }
    g.strokeStyle = col('--faint'); g.lineWidth = 1.5;
    const [ax, ay] = toPx(0, 0);
    g.beginPath(); g.moveTo(0, ay); g.lineTo(W, ay); g.moveTo(ax, 0); g.lineTo(ax, H); g.stroke();
    compiled.forEach((f, i) => {
      if (!f || !fns[i].on) return;
      g.strokeStyle = COLORS[i % COLORS.length]; g.lineWidth = 2.2; g.beginPath();
      let pen = false, lastY = NaN;
      const ys = f.range(x0, 1 / scale, W + 1); // one wasm call per curve
      for (let px = 0; px <= W; px += 1) {
        const y = ys[px];
        const py = H / 2 - (y - cy) * scale;
        if (!isFinite(y) || Math.abs(py) > H * 20 || (pen && Math.abs(py - lastY) > H * 2)) { pen = false; lastY = py; continue; }
        if (pen) g.lineTo(px, py); else g.moveTo(px, py);
        pen = true; lastY = py;
      }
      g.stroke();
    });
  };

  // pan & zoom (mouse, touch, pinch)
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  canvas.addEventListener('pointerup', (e) => { pointers.delete(e.pointerId); pinchDist = 0; });
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinchDist = 0; });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = cx + (e.clientX - r.left - r.width / 2) / scale, my = cy - (e.clientY - r.top - r.height / 2) / scale;
    readout.textContent = `x = ${fmtNum(mx, 5)}, y = ${fmtNum(my, 5)}` + compiled.map((f, i) => (f && fns[i].on ? `  ·  f${i + 1}(x) = ${fmtNum(f.eval(mx), 6)}` : '')).join('');
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) { cx -= (e.clientX - prev.x) / scale; cy += (e.clientY - prev.y) / scale; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) scale = Math.min(5000, Math.max(0.5, scale * (d / pinchDist)));
      pinchDist = d;
    }
    draw();
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015); scale = Math.min(5000, Math.max(0.5, scale * f)); draw(); }, { passive: false });
  const ro = new ResizeObserver(draw); ro.observe(canvas);

  root.append(
    card(null, h('div', { class: 'graph-wrap' }, canvas), readout,
      row(button('', () => { scale *= 1.5; draw(); }, { icon: 'ZoomIn', small: true, title: 'Zoom in' }), button('', () => { scale /= 1.5; draw(); }, { icon: 'ZoomOut', small: true, title: 'Zoom out' }),
        button('Reset view', () => { cx = cy = 0; scale = 50; draw(); }, { icon: 'RotateCcw', small: true }),
        segmented([['rad', 'Radians'], ['deg', 'Degrees']], 'rad', (v) => { deg = v === 'deg'; recompile(); }),
        button('Save PNG', () => canvas.toBlob((b) => { if (b) { const a = h('a', { href: URL.createObjectURL(b), download: 'graph.png' }); a.click(); } }), { icon: 'Download', small: true }))),
    card('Functions', list, button('Add function', () => { if (fns.length < 6) { fns.push({ src: '', on: true }); renderList(); } }, { icon: 'Plus', small: true })),
    note(ctx.isMobile ? 'Drag to pan, pinch to zoom.' : 'Drag to pan, scroll to zoom. Use x as the variable; implicit multiplication works (2x, 3sin(x)).'),
  );
  renderList();
  return () => { ro.disconnect(); compiled.forEach((c) => c?.free()); };
};

// ================================================================== Equation solver
const cfmt = (z: Complex) => (Math.abs(z.im) < 1e-12 ? fmtNum(z.re) : `${Math.abs(z.re) < 1e-12 ? '' : fmtNum(z.re) + ' '}${z.im < 0 ? '−' : Math.abs(z.re) < 1e-12 ? '' : '+'} ${fmtNum(Math.abs(z.im))}i`.trim());
export const equation: Mount = async (root) => {
  const m = await mathcore();
  let mode = 'any';
  const body = h('div', { class: 'stack' });
  const out = h('div', { class: 'stack' });
  const num = (v: string | number) => input({ type: 'number', value: v });
  /** run a Solve handler; problems are shown under the form instead of escaping as page errors */
  const safe = (f: () => void) => () => { try { f(); } catch (e: any) { clear(out).append(note(e?.message || String(e), 'warn')); } };
  const render = () => {
    clear(body); clear(out);
    if (mode === 'any') {
      const eq = input({ value: 'x^3 - 2x = 1', attrs: { spellcheck: 'false' } });
      const lo = num(-100), hi = num(100);
      body.append(field('Equation in x (use = or just an expression = 0)', eq), h('div', { class: 'grid2' }, field('Search from', lo), field('to', hi)),
        button('Solve', safe(() => {
          if (!eq.value.trim()) throw new Error('Type an equation, e.g. x^2 = 2.');
          const a = parseFloat(lo.value), b = parseFloat(hi.value);
          if (!isFinite(a) || !isFinite(b) || a >= b) throw new Error('The search range needs two numbers, "from" below "to".');
          const ex = m.compile(eq.value);
          const uniq = (() => { try { return ex.roots(a, b); } finally { ex.free(); } })();
          clear(out).append(card('Real solutions', uniq.length ? h('div', { class: 'big-results' }, uniq.slice(0, 20).map((r, i) => h('button', { class: 'big-result', type: 'button', onclick: () => copy(fmtNum(r)) }, h('span', { class: 'big-label' }, `x${uniq.length > 1 ? i + 1 : ''}`), h('span', { class: 'big-value' }, fmtNum(r, 10))))) : note('No real solution found in that range.', 'warn')));
        }), { variant: 'primary', icon: 'Variable' }));
    } else if (mode === 'quad' || mode === 'cubic') {
      const names = mode === 'quad' ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd'];
      const vals = mode === 'quad' ? [1, -3, 2] : [1, -6, 11, -6];
      const ins = names.map((n, i) => num(vals[i]));
      body.append(h('p', { class: 'muted' }, mode === 'quad' ? 'ax² + bx + c = 0' : 'ax³ + bx² + cx + d = 0'), h('div', { class: 'form-grid' }, ins.map((x, i) => field(names[i], x))),
        button('Solve', safe(() => {
          const v = ins.map((x) => parseFloat(x.value));
          if (v.some((x) => !isFinite(x)) || v[0] === 0) throw new Error('Coefficient a must be a non-zero number.');
          let roots: Complex[];
          if (mode === 'quad') {
            const [a, b, c] = v, D = b * b - 4 * a * c;
            roots = m.quadratic(a, b, c);
            clear(out).append(card('Roots', h('div', { class: 'big-results' }, roots.map((r, i) => h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, `x${i + 1}`), h('span', { class: 'big-value' }, cfmt(r))))),
              h('div', { class: 'kv' }, h('span', null, 'Discriminant'), h('span', null, fmtNum(D)), h('span', null, 'Vertex'), h('span', null, `(${fmtNum(-b / (2 * a))}, ${fmtNum(c - (b * b) / (4 * a))})`))));
          } else {
            roots = m.cubic(v[0], v[1], v[2], v[3]);
            clear(out).append(card('Roots', h('div', { class: 'big-results' }, roots.map((r, i) => h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, `x${i + 1}`), h('span', { class: 'big-value' }, cfmt(r)))))));
          }
        }), { variant: 'primary', icon: 'Variable' }));
    } else {
      let n = 2;
      const grid = h('div');
      const cells: HTMLInputElement[][] = [];
      const build = () => {
        cells.length = 0;
        const vars = ['x', 'y', 'z', 'w'].slice(0, n);
        const defaults = n === 2 ? [[2, 3, 8], [1, -1, -1]] : [[1, 1, 1, 6], [0, 2, 5, -4], [2, 5, -1, 27]];
        clear(grid).append(...Array.from({ length: n }, (_, r) => {
          const rowCells = Array.from({ length: n + 1 }, (_, c) => { const x = num(defaults[r]?.[c] ?? 0); x.classList.add('eq-cell'); return x; });
          cells.push(rowCells);
          return h('div', { class: 'eq-row' }, ...rowCells.slice(0, n).flatMap((x, c) => [x, h('span', { class: 'eq-var' }, vars[c] + (c < n - 1 ? ' +' : ' ='))]), rowCells[n]);
        }));
      };
      body.append(segmented([['2', '2 unknowns'], ['3', '3 unknowns'], ['4', '4 unknowns']], '2', (v) => { n = +v; build(); }), h('div', { class: 'scroll-x' }, grid),
        button('Solve', safe(() => {
          const A = cells.map((r) => r.slice(0, n).map((x) => parseFloat(x.value))), b = cells.map((r) => parseFloat(r[n].value));
          if ([...A.flat(), ...b].some((x) => !isFinite(x))) throw new Error('Fill in every coefficient (use 0 for a missing term).');
          const s = m.solveLinear(A, b);
          clear(out).append(card('Solution', s ? h('div', { class: 'big-results' }, s.map((v, i) => h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'xyzw'[i]), h('span', { class: 'big-value' }, fmtNum(v))))) : note('No unique solution (the equations are dependent or inconsistent).', 'warn')));
        }), { variant: 'primary', icon: 'Variable' }));
      build();
    }
  };
  root.append(card(null, stack(segmented([['any', 'Any equation f(x)=g(x)'], ['quad', 'Quadratic'], ['cubic', 'Cubic'], ['sys', 'Simultaneous (linear)']], mode, (v) => { mode = v; render(); }), body)), out);
  render();
};

// ================================================================== Statistics
/** plain decimal numbers only (1, -2.5, .5, 3e1); anything else (0x10, Infinity, words) is ignored */
const NUM = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const parseNums = (s: string) => s.split(/[\s,;]+/).filter((x) => NUM.test(x)).map(Number).filter((x) => isFinite(x));
export const stats: Mount = async (root) => {
  const m = await mathcore();
  const ta = textarea({ rows: 6, value: '12, 15, 15, 18, 21, 24, 24, 24, 30', placeholder: 'Numbers separated by commas, spaces or new lines' });
  const xy = textarea({ rows: 5, value: '', placeholder: 'Optional regression: one "x, y" pair per line' });
  const out = h('div', { class: 'stack' });
  const run = () => {
    clear(out);
    const xs = parseNums(ta.value);
    if (xs.length) {
      const s = m.stats(xs);
      const rows: Array<[string, number | string]> = [['Count', s.count], ['Sum', s.sum], ['Min', s.min], ['Max', s.max], ['Range', s.range], ['Q1 (25%)', s.q1], ['Q3 (75%)', s.q3], ['IQR', s.iqr],
        ['Variance (population)', s.varP], ['Variance (sample)', s.varS], ['Std dev (sample)', s.sdS], ['Geometric mean', s.geomean], ['Harmonic mean', s.harmmean], ['Skewness', s.skew], ['Sorted', s.sorted.map((x) => fmtNum(x)).join(', ')]];
      out.append(card('Summary',
        h('div', { class: 'big-results' }, ...([['Mean', fmtNum(s.mean)], ['Median', fmtNum(s.median)], ['Mode', s.modes.length ? s.modes.map((x) => fmtNum(x)).join(', ') : 'none'], ['Std dev (population)', isNaN(s.sdP) ? '—' : fmtNum(s.sdP)]] as Array<[string, string]>).map(([l, v]) => h('button', { class: 'big-result', type: 'button', onclick: () => copy(v) }, h('span', { class: 'big-label' }, l), h('span', { class: 'big-value' }, v)))),
        h('div', { class: 'kv' }, rows.flatMap(([l, v]) => [h('span', null, l), h('span', null, typeof v === 'number' ? (isNaN(v) ? '—' : fmtNum(v)) : v)]))));
    }
    const pairs = xy.value.split('\n').map((l) => parseNums(l)).filter((p) => p.length >= 2);
    if (pairs.length >= 2) {
      const r = m.regress(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
      out.append(card('Linear regression', h('div', { class: 'big-results' }, h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'Best-fit line'), h('span', { class: 'big-value' }, `y = ${fmtNum(r.slope, 6)}x ${r.intercept < 0 ? '−' : '+'} ${fmtNum(Math.abs(r.intercept), 6)}`))),
        h('div', { class: 'kv' }, h('span', null, 'Correlation r'), h('span', null, fmtNum(r.r, 6)), h('span', null, 'R²'), h('span', null, fmtNum(r.r * r.r, 6)), h('span', null, 'Pairs'), h('span', null, String(pairs.length)))));
    }
  };
  ta.addEventListener('input', run); xy.addEventListener('input', run);
  root.append(card(null, stack(field('Data', ta), field('x, y pairs (optional)', xy))), out);
  run();
};

// ================================================================== Matrix
type Mat = number[][];
const parseMat = (s: string): Mat => {
  const m = s.trim().split('\n').map((r) => parseNums(r)).filter((r) => r.length);
  if (!m.length || m.some((r) => r.length !== m[0].length)) throw new Error('Each row needs the same number of values.');
  return m;
};
const matStr = (m: Mat) => m.map((r) => r.map((x) => fmtNum(Math.abs(x) < 1e-12 ? 0 : x, 8)).join('\t')).join('\n');
export const matrix: Mount = async (root) => {
  const m = await mathcore();
  const mul = (a: Mat, b: Mat) => m.matmul(a, b);
  const A = textarea({ rows: 4, mono: true, value: '2 1 0\n1 3 1\n0 1 4' }), B = textarea({ rows: 4, mono: true, value: '1 0 0\n0 1 0\n0 0 1' });
  const out = h('pre', { class: 'mat-out' });
  const pw = input({ type: 'number', value: 2 });
  const op = (label: string, f: () => string | Mat) => button(label, () => { try { const r = f(); out.textContent = typeof r === 'string' ? r : matStr(r); } catch (e: any) { out.textContent = '⚠ ' + e.message; } }, { small: true });
  const sq = (m: Mat) => { if (m.length !== m[0].length) throw new Error('Needs a square matrix.'); return m; };
  root.append(card(null, stack(h('div', { class: 'grid2' }, field('Matrix A (rows on lines)', A), field('Matrix B', B)),
    h('div', { class: 'row' },
      op('A + B', () => m.matadd(parseMat(A.value), parseMat(B.value), 1)),
      op('A − B', () => m.matadd(parseMat(A.value), parseMat(B.value), -1)),
      op('A × B', () => mul(parseMat(A.value), parseMat(B.value))),
      op('det(A)', () => fmtNum(m.det(sq(parseMat(A.value))))),
      op('A⁻¹', () => { const r = m.inverse(sq(parseMat(A.value))); if (!r) throw new Error('Matrix is singular (no inverse).'); return r; }),
      op('Aᵀ', () => m.transpose(parseMat(A.value))),
      op('rank(A)', () => String(m.rank(parseMat(A.value)))),
      op('trace(A)', () => fmtNum(m.trace(sq(parseMat(A.value))))),
      op('Aⁿ', () => { const a = sq(parseMat(A.value)); const n = parseInt(pw.value); if (!(n >= 0 && n <= 1000)) throw new Error('n between 0 and 1000'); return m.matpow(a, n); }),
      h('span', { class: 'muted small' }, 'n ='), pw))),
    card('Result', out, button('Copy', () => copy(out.textContent || ''), { small: true, icon: 'Copy' })));
};

// ================================================================== Fractions (exact, mathcore int64 with overflow checks)
export const fraction: Mount = async (root) => {
  const m = await mathcore();
  const ex = input({ value: '3/4 + 5/6 × 2 1/2', attrs: { spellcheck: 'false' } });
  const out = h('div', { class: 'big-results' });
  const err = h('div');
  const run = () => {
    clear(out); clear(err);
    try {
      const q = m.fraction(ex.value);
      const whole = q.n / q.d, rem = (q.n < 0n ? -q.n : q.n) % q.d;
      const items: Array<[string, string]> = [['Fraction', q.d === 1n ? String(q.n) : `${q.n}/${q.d}`], ['Mixed number', q.d === 1n || whole === 0n ? (q.d === 1n ? String(q.n) : `${q.n}/${q.d}`) : `${whole} ${rem}/${q.d}`], ['Decimal', fmtNum(Number(q.n) / Number(q.d), 14)]];
      out.append(...items.map(([l, v]) => h('button', { class: 'big-result', type: 'button', onclick: () => copy(v) }, h('span', { class: 'big-label' }, l), h('span', { class: 'big-value' }, v))));
    } catch (e: any) { err.append(note(e.message, 'warn')); }
  };
  ex.addEventListener('input', run);
  root.append(card(null, field('Expression', ex, 'Use a/b, mixed numbers like 2 1/2, decimals (converted exactly), + − × ÷ ^ and parentheses.')), card('Result', out, err));
  run();
};

// ================================================================== Primes / LCM / GCD (BigInt)
export const primes: Mount = async (root) => {
  const m = await mathcore();
  const inp = input({ value: '360, 84, 1001', attrs: { spellcheck: 'false' } });
  const out = h('div', { class: 'stack' });
  const run = () => {
    clear(out);
    const MAX = 2n ** 64n - 1n;
    const ns = inp.value.split(/[\s,;]+/).filter(Boolean).map((x) => { try { return BigInt(x.replace(/_/g, '')); } catch { return null; } }).filter((x): x is bigint => x !== null && x > 0n);
    if (!ns.length) return;
    if (ns.some((n) => n > MAX)) { out.append(note('Numbers up to 18,446,744,073,709,551,615 (64-bit) are supported.', 'warn')); return; }
    if (ns.length > 1) {
      // gcd in wasm; the LCM can outgrow 64 bits, so it is built exactly as l / gcd(l, b) × b (gcd(l, b) = gcd(b, l mod b), both ≤ 64 bits)
      const g = ns.reduce((a, b) => m.gcd(a, b)), l = ns.reduce((a, b) => (a / (a > MAX ? m.gcd(b, a % b) : m.gcd(a, b))) * b);
      out.append(h('div', { class: 'big-results' }, h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'GCD / HCF'), h('span', { class: 'big-value' }, String(g))), h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'LCM'), h('span', { class: 'big-value' }, String(l)))));
    }
    out.append(card(null, h('div', { class: 'kv' }, ns.slice(0, 20).flatMap((n) => {
      const f = m.factor(n);
      const grouped = [...f.reduce((m, p) => m.set(p, (m.get(p) || 0) + 1), new Map<bigint, number>())].map(([p, k]) => (k > 1 ? `${p}^${k}` : `${p}`)).join(' × ');
      const next = m.nextPrime(n);
      return [h('strong', null, String(n)), h('span', null, m.isPrime(n) ? 'Prime ✓' : n === 1n ? '1 (neither prime nor composite)' : `${grouped}  ·  next prime ${next ? String(next) : 'above 2⁶⁴ (out of range)'}`)];
    }))));
  };
  inp.addEventListener('input', run);
  root.append(card(null, field('Numbers (one or more)', inp, 'Exact 64-bit prime test (deterministic Miller–Rabin), factorisation (Pollard rho), GCD and LCM — computed in mathcore.wasm.')), out);
  run();
};

// ================================================================== Periodic table
export const periodic: Mount = (root) => {
  const detail = h('div');
  const q = input({ placeholder: 'Search element, symbol or number…' });
  const show = (el: (typeof ELEMENTS)[number]) => {
    clear(detail).append(card(null, h('div', { class: 'el-detail' },
      h('div', { class: 'el-big', style: { background: CATEGORY_COLORS[el.cat] } }, h('small', null, String(el.z)), h('strong', null, el.sym), h('span', null, el.name)),
      h('div', { class: 'kv' },
        h('span', null, 'Atomic number'), h('span', null, String(el.z)), h('span', null, 'Atomic mass'), h('span', null, el.mass),
        h('span', null, 'Category'), h('span', null, el.cat), h('span', null, 'Group / period'), h('span', null, `${el.group || '—'} / ${el.period}`),
        h('span', null, 'Electron configuration'), h('span', null, el.config)))));
  };
  const grid = h('div', { class: 'ptable' }, ELEMENTS.map((el) => h('button', {
    type: 'button', class: 'el', title: `${el.name} (${el.z})`, 'data-name': `${el.name} ${el.sym} ${el.z}`.toLowerCase(),
    style: { gridColumn: String(el.col), gridRow: String(el.row), background: CATEGORY_COLORS[el.cat] }, onclick: () => show(el),
  }, h('small', null, String(el.z)), h('strong', null, el.sym))));
  q.addEventListener('input', () => {
    const t = q.value.toLowerCase().trim();
    grid.querySelectorAll<HTMLElement>('.el').forEach((b) => b.classList.toggle('dim', !!t && !b.dataset.name!.split(' ').some((w) => w.startsWith(t))));
    const hit = ELEMENTS.find((e) => e.sym.toLowerCase() === t || e.name.toLowerCase().startsWith(t) || String(e.z) === t);
    if (t && hit) show(hit);
  });
  root.append(card(null, q), card(null, h('div', { class: 'ptable-scroll' }, grid),
    h('div', { class: 'legend' }, Object.entries(CATEGORY_COLORS).map(([k, c]) => h('span', null, h('i', { style: { background: c } }), k)))), detail);
  show(ELEMENTS[0]);
};
