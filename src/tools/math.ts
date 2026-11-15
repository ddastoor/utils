import { h, card, field, input, textarea, button, segmented, clear, stack, row, note, copy, type Mount } from '../ui';
import { compile, fmtNum, gcd as gcdNum } from '../lib/expr';
import { ELEMENTS, CATEGORY_COLORS } from '../lib/elements';

// ================================================================== Graphing calculator
const COLORS = ['#4f46e5', '#e11d48', '#059669', '#d97706', '#0891b2', '#7c3aed'];
export const graph: Mount = (root, ctx) => {
  const fns: Array<{ src: string; on: boolean }> = [{ src: 'sin(x)', on: true }, { src: 'x^2/4 - 1', on: true }];
  let cx = 0, cy = 0, scale = 50; // px per unit
  let deg = false;
  const canvas = h('canvas', { class: 'graph-canvas' });
  const readout = h('div', { class: 'graph-readout muted small' });
  const list = h('div', { class: 'stack' });
  const compiled: Array<((x: number) => number) | null> = [];

  const recompile = () => {
    compiled.length = 0;
    fns.forEach((f, i) => {
      const inp = list.querySelectorAll<HTMLInputElement>('.fn-input')[i];
      try { const c = compile(f.src.replace(/^\s*y\s*=/, ''), { deg }, ['x']); compiled.push((x) => c({ x })); inp?.classList.remove('bad'); }
      catch { compiled.push(null); inp?.classList.add('bad'); }
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
      for (let px = 0; px <= W; px += 1) {
        const x = x0 + px / scale;
        let y: number; try { y = f(x); } catch { y = NaN; }
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
    readout.textContent = `x = ${fmtNum(mx, 5)}, y = ${fmtNum(my, 5)}` + compiled.map((f, i) => (f && fns[i].on ? `  ·  f${i + 1}(x) = ${fmtNum(f(mx), 6)}` : '')).join('');
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
  return () => ro.disconnect();
};

// ================================================================== Equation solver
type C = { re: number; im: number };
const cfmt = (z: C) => (Math.abs(z.im) < 1e-12 ? fmtNum(z.re) : `${Math.abs(z.re) < 1e-12 ? '' : fmtNum(z.re) + ' '}${z.im < 0 ? '−' : Math.abs(z.re) < 1e-12 ? '' : '+'} ${fmtNum(Math.abs(z.im))}i`.trim());
function cubicRoots(a: number, b: number, c: number, d: number): C[] {
  // depressed cubic via Cardano with complex arithmetic fallback (trigonometric for 3 real roots)
  b /= a; c /= a; d /= a;
  const p = c - (b * b) / 3, q = (2 * b * b * b) / 27 - (b * c) / 3 + d, sh = -b / 3;
  const disc = (q * q) / 4 + (p * p * p) / 27;
  if (Math.abs(disc) < 1e-14) {
    const u = Math.cbrt(-q / 2);
    return [{ re: 2 * u + sh, im: 0 }, { re: -u + sh, im: 0 }, { re: -u + sh, im: 0 }];
  }
  if (disc < 0) {
    const r = Math.sqrt(-(p * p * p) / 27), phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r)))), m = 2 * Math.cbrt(r);
    return [0, 1, 2].map((k) => ({ re: m * Math.cos((phi + 2 * Math.PI * k) / 3) + sh, im: 0 }));
  }
  const u = Math.cbrt(-q / 2 + Math.sqrt(disc)), v = Math.cbrt(-q / 2 - Math.sqrt(disc));
  return [{ re: u + v + sh, im: 0 }, { re: -(u + v) / 2 + sh, im: (Math.sqrt(3) / 2) * (u - v) }, { re: -(u + v) / 2 + sh, im: -(Math.sqrt(3) / 2) * (u - v) }];
}
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
export const equation: Mount = (root) => {
  let mode = 'any';
  const body = h('div', { class: 'stack' });
  const out = h('div', { class: 'stack' });
  const num = (v: string | number) => input({ type: 'number', value: v });
  const render = () => {
    clear(body); clear(out);
    if (mode === 'any') {
      const eq = input({ value: 'x^3 - 2x = 1', attrs: { spellcheck: 'false' } });
      const lo = num(-100), hi = num(100);
      body.append(field('Equation in x (use = or just an expression = 0)', eq), h('div', { class: 'grid2' }, field('Search from', lo), field('to', hi)),
        button('Solve', () => {
          const [l, r] = eq.value.split('=');
          const fl = compile(l, {}, ['x']), fr = r !== undefined ? compile(r, {}, ['x']) : () => 0;
          const f = (x: number) => fl({ x }) - fr({ x });
          const a = parseFloat(lo.value), b = parseFloat(hi.value), N = 20000, roots: number[] = [];
          let px = a, pf = f(a);
          for (let i = 1; i <= N; i++) {
            const x = a + ((b - a) * i) / N, fx = f(x);
            if (isFinite(pf) && isFinite(fx)) {
              if (pf === 0) roots.push(px);
              else if (pf * fx < 0) { let u = px, w = x, fu = pf; for (let k = 0; k < 100; k++) { const m = (u + w) / 2, fm = f(m); if (fu * fm <= 0) w = m; else { u = m; fu = fm; } } const rt = (u + w) / 2; if (Math.abs(f(rt)) < 1e-6 * (1 + Math.abs(fl({ x: rt })))) roots.push(rt); }
            }
            px = x; pf = fx;
          }
          const uniq = roots.filter((r, i) => i === 0 || Math.abs(r - roots[i - 1]) > 1e-7);
          clear(out).append(card('Real solutions', uniq.length ? h('div', { class: 'big-results' }, uniq.slice(0, 20).map((r, i) => h('button', { class: 'big-result', type: 'button', onclick: () => copy(fmtNum(r)) }, h('span', { class: 'big-label' }, `x${uniq.length > 1 ? i + 1 : ''}`), h('span', { class: 'big-value' }, fmtNum(r, 10))))) : note('No real solution found in that range.', 'warn')));
        }, { variant: 'primary', icon: 'Variable' }));
    } else if (mode === 'quad' || mode === 'cubic') {
      const names = mode === 'quad' ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd'];
      const vals = mode === 'quad' ? [1, -3, 2] : [1, -6, 11, -6];
      const ins = names.map((n, i) => num(vals[i]));
      body.append(h('p', { class: 'muted' }, mode === 'quad' ? 'ax² + bx + c = 0' : 'ax³ + bx² + cx + d = 0'), h('div', { class: 'form-grid' }, ins.map((x, i) => field(names[i], x))),
        button('Solve', () => {
          const v = ins.map((x) => parseFloat(x.value));
          if (v.some((x) => !isFinite(x)) || v[0] === 0) throw new Error('Coefficient a must be a non-zero number.');
          let roots: C[];
          if (mode === 'quad') {
            const [a, b, c] = v, D = b * b - 4 * a * c;
            roots = D >= 0 ? [{ re: (-b + Math.sqrt(D)) / (2 * a), im: 0 }, { re: (-b - Math.sqrt(D)) / (2 * a), im: 0 }] : [{ re: -b / (2 * a), im: Math.sqrt(-D) / (2 * a) }, { re: -b / (2 * a), im: -Math.sqrt(-D) / (2 * a) }];
            clear(out).append(card('Roots', h('div', { class: 'big-results' }, roots.map((r, i) => h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, `x${i + 1}`), h('span', { class: 'big-value' }, cfmt(r))))),
              h('div', { class: 'kv' }, h('span', null, 'Discriminant'), h('span', null, fmtNum(D)), h('span', null, 'Vertex'), h('span', null, `(${fmtNum(-b / (2 * a))}, ${fmtNum(c - (b * b) / (4 * a))})`))));
          } else {
            roots = cubicRoots(v[0], v[1], v[2], v[3]);
            clear(out).append(card('Roots', h('div', { class: 'big-results' }, roots.map((r, i) => h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, `x${i + 1}`), h('span', { class: 'big-value' }, cfmt(r)))))));
          }
        }, { variant: 'primary', icon: 'Variable' }));
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
        button('Solve', () => {
          const A = cells.map((r) => r.slice(0, n).map((x) => parseFloat(x.value))), b = cells.map((r) => parseFloat(r[n].value));
          const s = solveLinearSystem(A, b);
          clear(out).append(card('Solution', s ? h('div', { class: 'big-results' }, s.map((v, i) => h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'xyzw'[i]), h('span', { class: 'big-value' }, fmtNum(v))))) : note('No unique solution (the equations are dependent or inconsistent).', 'warn')));
        }, { variant: 'primary', icon: 'Variable' }));
      build();
    }
  };
  root.append(card(null, stack(segmented([['any', 'Any equation f(x)=g(x)'], ['quad', 'Quadratic'], ['cubic', 'Cubic'], ['sys', 'Simultaneous (linear)']], mode, (v) => { mode = v; render(); }), body)), out);
  render();
};

// ================================================================== Statistics
const parseNums = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).map(Number).filter((x) => isFinite(x));
function quantile(sorted: number[], q: number) { const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); }
export const stats: Mount = (root) => {
  const ta = textarea({ rows: 6, value: '12, 15, 15, 18, 21, 24, 24, 24, 30', placeholder: 'Numbers separated by commas, spaces or new lines' });
  const xy = textarea({ rows: 5, value: '', placeholder: 'Optional regression: one "x, y" pair per line' });
  const out = h('div', { class: 'stack' });
  const run = () => {
    clear(out);
    const xs = parseNums(ta.value);
    if (xs.length) {
      const n = xs.length, s = [...xs].sort((a, b) => a - b), sum = xs.reduce((a, b) => a + b, 0), mean = sum / n;
      const ss = xs.reduce((a, x) => a + (x - mean) ** 2, 0), varP = ss / n, varS = n > 1 ? ss / (n - 1) : NaN;
      const freq = new Map<number, number>(); xs.forEach((x) => freq.set(x, (freq.get(x) || 0) + 1));
      const maxF = Math.max(...freq.values()), modes = [...freq].filter(([, f]) => f === maxF && maxF > 1).map(([v]) => v);
      const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), sd = Math.sqrt(varP);
      const skew = sd ? xs.reduce((a, x) => a + ((x - mean) / sd) ** 3, 0) / n : NaN;
      const rows: Array<[string, number | string]> = [['Count', n], ['Sum', sum], ['Min', s[0]], ['Max', s[n - 1]], ['Range', s[n - 1] - s[0]], ['Q1 (25%)', q1], ['Q3 (75%)', q3], ['IQR', q3 - q1],
        ['Variance (population)', varP], ['Variance (sample)', varS], ['Std dev (sample)', Math.sqrt(varS)], ['Geometric mean', xs.every((x) => x > 0) ? Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / n) : NaN],
        ['Harmonic mean', xs.every((x) => x > 0) ? n / xs.reduce((a, x) => a + 1 / x, 0) : NaN], ['Skewness', skew], ['Sorted', s.map((x) => fmtNum(x)).join(', ')]];
      out.append(card('Summary',
        h('div', { class: 'big-results' }, ...([['Mean', fmtNum(mean)], ['Median', fmtNum(quantile(s, 0.5))], ['Mode', modes.length ? modes.map((m) => fmtNum(m)).join(', ') : 'none'], ['Std dev (population)', fmtNum(sd)]] as Array<[string, string]>).map(([l, v]) => h('button', { class: 'big-result', type: 'button', onclick: () => copy(v) }, h('span', { class: 'big-label' }, l), h('span', { class: 'big-value' }, v)))),
        h('div', { class: 'kv' }, rows.flatMap(([l, v]) => [h('span', null, l), h('span', null, typeof v === 'number' ? fmtNum(v) : v)]))));
    }
    const pairs = xy.value.split('\n').map((l) => parseNums(l)).filter((p) => p.length >= 2);
    if (pairs.length >= 2) {
      const n = pairs.length, mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
      let sxy = 0, sxx = 0, syy = 0; pairs.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
      const m = sxy / sxx, c = my - m * mx, r = sxy / Math.sqrt(sxx * syy);
      out.append(card('Linear regression', h('div', { class: 'big-results' }, h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'Best-fit line'), h('span', { class: 'big-value' }, `y = ${fmtNum(m, 6)}x ${c < 0 ? '−' : '+'} ${fmtNum(Math.abs(c), 6)}`))),
        h('div', { class: 'kv' }, h('span', null, 'Correlation r'), h('span', null, fmtNum(r, 6)), h('span', null, 'R²'), h('span', null, fmtNum(r * r, 6)), h('span', null, 'Pairs'), h('span', null, String(n)))));
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
function det(m: Mat): number {
  const n = m.length; const a = m.map((r) => [...r]); let d = 1;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-14) return 0;
    if (p !== c) { [a[p], a[c]] = [a[c], a[p]]; d = -d; }
    d *= a[c][c];
    for (let r = c + 1; r < n; r++) { const f = a[r][c] / a[c][c]; for (let k = c; k < n; k++) a[r][k] -= f * a[c][k]; }
  }
  return d;
}
function inverse(m: Mat): Mat {
  const n = m.length; const a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-14) throw new Error('Matrix is singular (no inverse).');
    [a[p], a[c]] = [a[c], a[p]];
    const pv = a[c][c]; for (let k = 0; k < 2 * n; k++) a[c][k] /= pv;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]; }
  }
  return a.map((r) => r.slice(n));
}
const mul = (a: Mat, b: Mat): Mat => { if (a[0].length !== b.length) throw new Error('Columns of A must equal rows of B.'); return a.map((r) => b[0].map((_, j) => r.reduce((s, x, k) => s + x * b[k][j], 0))); };
function rank(m: Mat) { const a = m.map((r) => [...r]); let rk = 0; const rows = a.length, cols = a[0].length; for (let c = 0; c < cols && rk < rows; c++) { let p = rk; for (let r = rk + 1; r < rows; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; if (Math.abs(a[p][c]) < 1e-10) continue; [a[p], a[rk]] = [a[rk], a[p]]; for (let r = rk + 1; r < rows; r++) { const f = a[r][c] / a[rk][c]; for (let k = c; k < cols; k++) a[r][k] -= f * a[rk][k]; } rk++; } return rk; }
export const matrix: Mount = (root) => {
  const A = textarea({ rows: 4, mono: true, value: '2 1 0\n1 3 1\n0 1 4' }), B = textarea({ rows: 4, mono: true, value: '1 0 0\n0 1 0\n0 0 1' });
  const out = h('pre', { class: 'mat-out' });
  const pw = input({ type: 'number', value: 2 });
  const op = (label: string, f: () => string | Mat) => button(label, () => { try { const r = f(); out.textContent = typeof r === 'string' ? r : matStr(r); } catch (e: any) { out.textContent = '⚠ ' + e.message; } }, { small: true });
  const sq = (m: Mat) => { if (m.length !== m[0].length) throw new Error('Needs a square matrix.'); return m; };
  root.append(card(null, stack(h('div', { class: 'grid2' }, field('Matrix A (rows on lines)', A), field('Matrix B', B)),
    h('div', { class: 'row' },
      op('A + B', () => { const a = parseMat(A.value), b = parseMat(B.value); if (a.length !== b.length || a[0].length !== b[0].length) throw new Error('Same size needed.'); return a.map((r, i) => r.map((x, j) => x + b[i][j])); }),
      op('A − B', () => { const a = parseMat(A.value), b = parseMat(B.value); if (a.length !== b.length || a[0].length !== b[0].length) throw new Error('Same size needed.'); return a.map((r, i) => r.map((x, j) => x - b[i][j])); }),
      op('A × B', () => mul(parseMat(A.value), parseMat(B.value))),
      op('det(A)', () => fmtNum(det(sq(parseMat(A.value))))),
      op('A⁻¹', () => inverse(sq(parseMat(A.value)))),
      op('Aᵀ', () => { const a = parseMat(A.value); return a[0].map((_, j) => a.map((r) => r[j])); }),
      op('rank(A)', () => String(rank(parseMat(A.value)))),
      op('trace(A)', () => fmtNum(sq(parseMat(A.value)).reduce((s, r, i) => s + r[i], 0))),
      op('Aⁿ', () => { let a = sq(parseMat(A.value)); const n = parseInt(pw.value); if (!(n >= 1 && n <= 50)) throw new Error('n between 1 and 50'); let r = a; for (let i = 1; i < n; i++) r = mul(r, a); return r; }),
      h('span', { class: 'muted small' }, 'n ='), pw))),
    card('Result', out, button('Copy', () => copy(out.textContent || ''), { small: true, icon: 'Copy' })));
};

// ================================================================== Fractions (exact, BigInt)
type Q = { n: bigint; d: bigint };
const bgcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const Qn = (n: bigint, d = 1n): Q => { if (d === 0n) throw new Error('Division by zero'); if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; return { n: n / g, d: d / g }; };
const qadd = (a: Q, b: Q) => Qn(a.n * b.d + b.n * a.d, a.d * b.d), qsub = (a: Q, b: Q) => Qn(a.n * b.d - b.n * a.d, a.d * b.d);
const qmul = (a: Q, b: Q) => Qn(a.n * b.n, a.d * b.d), qdiv = (a: Q, b: Q) => Qn(a.n * b.d, a.d * b.n);
function qpow(a: Q, e: Q): Q { if (e.d !== 1n) throw new Error('Only whole-number powers keep fractions exact.'); let k = e.n, r = Qn(1n); const base = k < 0n ? qdiv(Qn(1n), a) : a; k = k < 0n ? -k : k; if (k > 1000n) throw new Error('Power too large'); for (let i = 0n; i < k; i++) r = qmul(r, base); return r; }
function parseFrac(src: string): Q {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  let i = 0;
  const ws = () => { while (s[i] === ' ') i++; };
  const num = (): Q => {
    ws();
    if (s[i] === '(') { i++; const v = expr(); ws(); if (s[i] !== ')') throw new Error('Missing )'); i++; return v; }
    if (s[i] === '-') { i++; const v = factor(); return Qn(-v.n, v.d); }
    const m = /^(\d+)(?:\.(\d+))?/.exec(s.slice(i)); if (!m) throw new Error(`Unexpected "${s[i] ?? 'end'}"`);
    i += m[0].length;
    let q = m[2] ? Qn(BigInt(m[1] + m[2]), 10n ** BigInt(m[2].length)) : Qn(BigInt(m[1]));
    // mixed number "1 1/2"
    const mixed = /^\s+(\d+)\/(\d+)/.exec(s.slice(i));
    if (mixed && !m[2]) { i += mixed[0].length; q = qadd(q, Qn(BigInt(mixed[1]), BigInt(mixed[2]))); }
    return q;
  };
  const factor = (): Q => { const b = num(); ws(); if (s[i] === '^') { i++; return qpow(b, factor()); } return b; };
  const term = (): Q => { let v = factor(); for (;;) { ws(); if (s[i] === '*') { i++; v = qmul(v, factor()); } else if (s[i] === '/') { i++; v = qdiv(v, factor()); } else return v; } };
  const expr = (): Q => { let v = term(); for (;;) { ws(); if (s[i] === '+') { i++; v = qadd(v, term()); } else if (s[i] === '-') { i++; v = qsub(v, term()); } else return v; } };
  const v = expr(); ws(); if (i < s.length) throw new Error(`Unexpected "${s[i]}"`); return v;
}
export const fraction: Mount = (root) => {
  const ex = input({ value: '3/4 + 5/6 × 2 1/2', attrs: { spellcheck: 'false' } });
  const out = h('div', { class: 'big-results' });
  const err = h('div');
  const run = () => {
    clear(out); clear(err);
    try {
      const q = parseFrac(ex.value);
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
function modpow(b: bigint, e: bigint, m: bigint) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n, s = 0; while (!(d & 1n)) { d >>= 1n; s++; }
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { // deterministic for n < 3.3e24
    let x = modpow(a, d, n); if (x === 1n || x === n - 1n) continue;
    let comp = true; for (let r = 1; r < s; r++) { x = (x * x) % n; if (x === n - 1n) { comp = false; break; } }
    if (comp) return false;
  }
  return true;
}
function rho(n: bigint): bigint {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; ; c++) {
    let x = 2n, y = 2n, d = 1n;
    const f = (v: bigint) => (v * v + c) % n;
    while (d === 1n) { x = f(x); y = f(f(y)); d = bgcd(x > y ? x - y : y - x, n); }
    if (d !== n) return d;
  }
}
export function factorize(n: bigint): bigint[] {
  if (n < 2n) return [];
  const out: bigint[] = [];
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n]) while (n % p === 0n) { out.push(p); n /= p; }
  const stack = n > 1n ? [n] : [];
  while (stack.length) { const m = stack.pop()!; if (isPrime(m)) out.push(m); else { const d = rho(m); stack.push(d, m / d); } }
  return out.sort((a, b) => (a < b ? -1 : 1));
}
export const primes: Mount = (root) => {
  const inp = input({ value: '360, 84, 1001', attrs: { spellcheck: 'false' } });
  const out = h('div', { class: 'stack' });
  const run = () => {
    clear(out);
    const ns = inp.value.split(/[\s,;]+/).filter(Boolean).map((x) => { try { return BigInt(x.replace(/_/g, '')); } catch { return null; } }).filter((x): x is bigint => x !== null && x > 0n);
    if (!ns.length) return;
    if (ns.length > 1) {
      const g = ns.reduce((a, b) => bgcd(a, b)), l = ns.reduce((a, b) => (a / bgcd(a, b)) * b);
      out.append(h('div', { class: 'big-results' }, h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'GCD / HCF'), h('span', { class: 'big-value' }, String(g))), h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'LCM'), h('span', { class: 'big-value' }, String(l)))));
    }
    out.append(card(null, h('div', { class: 'kv' }, ns.slice(0, 20).flatMap((n) => {
      const f = n < 10n ** 30n ? factorize(n) : [];
      const grouped = [...f.reduce((m, p) => m.set(p, (m.get(p) || 0) + 1), new Map<bigint, number>())].map(([p, k]) => (k > 1 ? `${p}^${k}` : `${p}`)).join(' × ');
      let next = n + 1n; while (!isPrime(next)) next++;
      return [h('strong', null, String(n)), h('span', null, isPrime(n) ? 'Prime ✓' : n === 1n ? '1 (neither prime nor composite)' : `${grouped}  ·  next prime ${next}`)];
    }))));
  };
  inp.addEventListener('input', run);
  root.append(card(null, field('Numbers (one or more)', inp, 'Prime check (Miller–Rabin, exact up to 3·10²⁴), factorisation (Pollard rho), GCD and LCM of all numbers.')), out);
  run();
};
void gcdNum;

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
