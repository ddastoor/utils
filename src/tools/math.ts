import { h, card, field, input, textarea, button, segmented, clear, stack, row, note, copy, downloadBlob, type Mount } from '../ui';
import { readFunction, clampScale, clampCentre, zoomAbout, tickStep, ticks, tickLabel, type View } from '../lib/graph';
import { mathcore, fmtNum, type Complex } from '../wasm/mathcore';
import { ELEMENTS, CATEGORY_COLORS } from '../lib/elements';

// ================================================================== Graphing calculator
const COLORS = ['#4f46e5', '#e11d48', '#059669', '#d97706', '#0891b2', '#7c3aed'];
const MAX_FNS = 6, SAMPLES = 2; // samples per pixel
export const graph: Mount = async (root, ctx) => {
  const m = await mathcore();
  type Ex = ReturnType<typeof m.compile>;
  /** a function of x (ex), or a vertical line x = at */
  interface Fn { src: string; on: boolean; kind: 'y' | 'x'; ex: Ex | null; at: number; error: string }
  const fn = (src: string): Fn => ({ src, on: true, kind: 'y', ex: null, at: NaN, error: '' });
  const fns: Fn[] = [fn('sin(x)'), fn('x^2/4 - 1')];
  let view: View = { cx: 0, cy: 0, scale: 50 }; // scale = pixels per unit
  let deg = false;
  const canvas = h('canvas', { class: 'graph-canvas', tabindex: '0', role: 'img', 'aria-label': 'Graph of the functions below. Arrow keys move the view, + and − zoom, 0 resets it.' });
  const readout = h('div', { class: 'graph-readout muted small' });
  const list = h('div', { class: 'stack' });

  const compile = (f: Fn) => {
    f.ex?.free(); f.ex = null; f.error = ''; f.at = NaN;
    if (!f.src.trim()) return;
    try {
      const t = readFunction(f.src), ex = m.compile(t.body, deg);
      const other = (['y', 'z', 't', 'ans'] as const).find((v) => ex.uses(v));
      if (other || (t.kind === 'x' && ex.uses('x'))) {
        ex.free();
        throw new Error(t.kind === 'x' ? 'x = … takes a number: x = 2 draws a vertical line.' : other === 'ans' ? 'Ans belongs to the calculator — a function here is written with x.' : `Only x can be used here: "${other}" has no value.`);
      }
      f.kind = t.kind;
      if (t.kind === 'y') f.ex = ex;
      else { f.at = ex.eval(0); ex.free(); if (!Number.isFinite(f.at)) throw new Error('x = … needs a number that exists.'); }
    } catch (e: any) { f.error = e?.message || String(e); }
  };
  const addBtn = button('Add function', () => { if (fns.length < MAX_FNS) { fns.push(fn('')); renderList(); list.querySelectorAll<HTMLInputElement>('.fn-input')[fns.length - 1]?.focus(); } }, { icon: 'Plus', small: true });
  const renderList = () => {
    clear(list).append(...fns.map((f, i) => {
      const err = h('div', { class: 'fn-err', role: 'alert' });
      const box = input({ value: f.src, placeholder: 'e.g. 2x+1, sin(x), sqrt(x), x = 2', onInput: (v) => { f.src = v; compile(f); mark(); draw(); }, attrs: { class: 'input fn-input', spellcheck: 'false', autocapitalize: 'off', 'aria-label': `Function ${i + 1}` } });
      const mark = () => { box.classList.toggle('bad', !!f.error); err.textContent = f.error; err.hidden = !f.error; };
      compile(f); mark();
      return h('div', { class: 'fn-row' },
        h('button', { type: 'button', class: 'fn-swatch', style: { background: COLORS[i % COLORS.length], opacity: f.on ? '1' : '.3' }, onclick: () => { f.on = !f.on; renderList(); }, title: f.on ? 'Hide' : 'Show', 'aria-label': `${f.on ? 'Hide' : 'Show'} function ${i + 1}`, 'aria-pressed': String(f.on) }),
        h('span', { class: 'fn-y' }, 'y ='), box,
        button('', () => { f.ex?.free(); fns.splice(i, 1); renderList(); }, { icon: 'X', small: true, variant: 'ghost', title: 'Remove' }), err);
    }));
    addBtn.disabled = fns.length >= MAX_FNS; addBtn.title = addBtn.disabled ? `${MAX_FNS} functions at most` : '';
    draw();
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
    const { cx, cy, scale } = view;
    g.fillStyle = col('--surface'); g.fillRect(0, 0, W, H);
    const X = (x: number) => W / 2 + (x - cx) * scale, Y = (y: number) => H / 2 - (y - cy) * scale;
    const x0 = cx - W / 2 / scale, x1 = cx + W / 2 / scale, y0 = cy - H / 2 / scale, y1 = cy + H / 2 / scale;
    const step = tickStep(scale), ax = X(0), ay = Y(0);
    g.lineWidth = 1; g.font = '11px system-ui'; g.fillStyle = col('--muted'); g.strokeStyle = col('--surface-3');
    for (const x of ticks(x0, x1, step)) {
      const px = X(x); g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke();
      if (x !== 0) g.fillText(tickLabel(x, step), px + 3, Math.min(H - 4, Math.max(12, ay + 13)));
    }
    for (const y of ticks(y0, y1, step)) {
      const py = Y(y); g.beginPath(); g.moveTo(0, py); g.lineTo(W, py); g.stroke();
      if (y !== 0) { const label = tickLabel(y, step); g.fillText(label, Math.min(W - g.measureText(label).width - 4, Math.max(3, ax + 4)), py - 3); }
    }
    g.strokeStyle = col('--faint'); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, ay); g.lineTo(W, ay); g.moveTo(ax, 0); g.lineTo(ax, H); g.stroke();
    const far = 4 * H; // a point far outside the picture is drawn there: the canvas does not take 10^300 pixels
    fns.forEach((f, i) => {
      if (!f.on || f.error) return;
      g.strokeStyle = COLORS[i % COLORS.length]; g.lineWidth = 2.2; g.beginPath();
      if (f.kind === 'x') { const px = X(f.at); if (px >= -2 && px <= W + 2) { g.moveTo(px, 0); g.lineTo(px, H); } g.stroke(); return; }
      if (!f.ex) return;
      const n = W * SAMPLES + 1, { y, join } = f.ex.plot(x0, 1 / (scale * SAMPLES), n, 8 / scale); // one wasm call per curve
      for (let k = 0; k < n; k++) {
        if (!Number.isFinite(y[k])) continue;
        const py = Math.min(H + far, Math.max(-far, Y(y[k])));
        if (join[k]) g.lineTo(k / SAMPLES, py); else g.moveTo(k / SAMPLES, py);
      }
      g.stroke();
    });
  };
  const setView = (v: View) => { const cx = clampCentre(v.cx), cy = clampCentre(v.cy); view = { cx, cy, scale: clampScale(v.scale, cx, cy) }; draw(); };
  const zoom = (factor: number, px = canvas.clientWidth / 2, py = canvas.clientHeight / 2) => setView(zoomAbout(view, px, py, factor, canvas.clientWidth, canvas.clientHeight));

  // pan & zoom (mouse, touch, pinch, keyboard); a zoom keeps the point under the cursor or between the fingers in place
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  const say = (mx: number, my: number) => {
    const digits = (v: number) => Math.min(15, Math.max(3, Math.ceil(Math.log10(Math.max(Math.abs(v), 1e-300) * view.scale)) + 1));
    readout.textContent = `x = ${fmtNum(mx, digits(mx))}, y = ${fmtNum(my, digits(my))}` + fns.map((f, i) => {
      if (!f.on || f.error || (!f.ex && f.kind === 'y')) return '';
      if (f.kind === 'x') return `  ·  line x = ${fmtNum(f.at, 6)}`;
      const v = f.ex!.eval(mx);
      return `  ·  f${i + 1}(x) = ${Number.isFinite(v) ? fmtNum(v, 6) : 'undefined'}`;
    }).join('');
  };
  canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone */ } pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  const lift = (e: PointerEvent) => { pointers.delete(e.pointerId); pinchDist = 0; };
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    say(view.cx + (e.clientX - r.left - r.width / 2) / view.scale, view.cy - (e.clientY - r.top - r.height / 2) / view.scale);
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) view = { ...view, cx: view.cx - (e.clientX - prev.x) / view.scale, cy: view.cy + (e.clientY - prev.y) / view.scale };
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist && d) view = zoomAbout(view, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchDist, r.width, r.height);
      pinchDist = d;
    }
    setView(view);
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const reset = () => setView({ cx: 0, cy: 0, scale: 50 });
  canvas.addEventListener('keydown', (e) => {
    const step = 40 / view.scale, k = e.key;
    if (k === 'ArrowLeft') setView({ ...view, cx: view.cx - step }); else if (k === 'ArrowRight') setView({ ...view, cx: view.cx + step });
    else if (k === 'ArrowUp') setView({ ...view, cy: view.cy + step }); else if (k === 'ArrowDown') setView({ ...view, cy: view.cy - step });
    else if (k === '+' || k === '=') zoom(1.5); else if (k === '-' || k === '_') zoom(1 / 1.5); else if (k === '0') reset(); else return;
    e.preventDefault();
  });
  const ro = new ResizeObserver(draw); ro.observe(canvas);
  const dark = matchMedia('(prefers-color-scheme: dark)'); dark.addEventListener('change', draw); // the colours come from the page's theme

  root.append(h('div', { class: 'graph-layout' },
    card(null, h('div', { class: 'graph-wrap' }, canvas), readout,
      row(button('', () => zoom(1.5), { icon: 'ZoomIn', small: true, title: 'Zoom in' }), button('', () => zoom(1 / 1.5), { icon: 'ZoomOut', small: true, title: 'Zoom out' }),
        button('Reset view', reset, { icon: 'RotateCcw', small: true }),
        segmented([['rad', 'Radians'], ['deg', 'Degrees']], 'rad', (v) => { deg = v === 'deg'; renderList(); }),
        button('Save PNG', () => canvas.toBlob((b) => { if (b) downloadBlob(b, 'graph.png'); }), { icon: 'Download', small: true }))),
    card('Functions', list, addBtn)),
    note(`${ctx.isMobile ? 'Drag to pan, pinch to zoom.' : 'Drag to pan, scroll to zoom; with the graph in focus the arrow keys, + and − work too.'} Use x as the variable — 2x, 3sin(x), x^2, sqrt(x), abs(x) — and x = 2 for a vertical line.`),
  );
  renderList();
  return () => { ro.disconnect(); dark.removeEventListener('change', draw); fns.forEach((f) => f.ex?.free()); };
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
  const pw = input({ type: 'number', value: 2, attrs: { 'aria-label': 'Power n' } });
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
