import { h, card, field, input, textarea, button, segmented, clear, stack, row, note, copy, downloadBlob, type Mount } from '../ui';
import { readFunction, clampScale, clampCentre, zoomAbout, tickStep, ticks, tickLabel, type View } from '../lib/graph';
import { mathcore, fmtNum } from '../wasm/mathcore';
import { quadratic, cubic, linear, complexText, type Root } from '../lib/equations';
import { readNumbers, readPairs, someOf, lineText } from '../lib/stats';
import { type M, readMatrix, shape, addM, mulM, transposeM, traceM, detM, rankM, inverseM, powM, readPower, exactOk, toNumbers, matrixText, valueText } from '../lib/matrix';
import type { Q } from '../lib/exact';
import { fractionAnswer } from '../lib/fractions';
import { readWholeNumbers, factorText, MAX_U64 } from '../lib/primes';
import { roundDec } from '../lib/round';
import { ELEMENTS, CATEGORY_COLORS, ALIASES, elementMatches, findElement } from '../lib/elements';

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
const ROOT_CAP = 50; // roots of "any equation" that are listed
export const equation: Mount = async (root) => {
  const m = await mathcore();
  let mode = 'any', deg = false, n = 2;
  const kept: Record<string, string> = {}; // what was typed into the grid of the simultaneous equations, by "row,column"
  const body = h('div', { class: 'stack' });
  const out = h('div', { class: 'stack' });
  const num = (v: string | number, label: string) => input({ type: 'number', value: v, step: 'any', attrs: { 'aria-label': label } });
  const sub = (k: number) => '₁₂₃₄₅₆₇₈₉'[k] ?? String(k + 1);
  const tile = (label: string, value: string, small = '', copyAs = value) => h('button', { class: 'big-result', type: 'button', title: 'Copy', onclick: () => copy(copyAs) },
    h('span', { class: 'big-label' }, label), h('span', { class: 'big-value' }, value), small ? h('span', { class: 'big-sub muted small' }, small) : null);
  const rootTile = (z: Root, label: string) => tile(label, complexText(z, (x) => fmtNum(x)), z.exact ? `= ${z.exact}` : '');
  const kv = (rows: Array<[string, string]>) => h('div', { class: 'kv' }, rows.flatMap(([l, v]) => [h('span', null, l), h('span', null, v)]));
  let solve = () => {};
  /** work the answer out again; what cannot be solved is said under the form, never thrown at the page */
  const run = () => { try { solve(); } catch (e: any) { clear(out).append(note(e?.message || String(e), 'warn')); } };
  const live = (...boxes: HTMLElement[]) => boxes.forEach((b) => { b.addEventListener('input', run); b.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') run(); }); });
  const solveBtn = () => button('Solve', run, { variant: 'primary', icon: 'Variable' });

  const render = () => {
    clear(body); clear(out);
    if (mode === 'any') {
      const eq = input({ value: 'x^3 - 2x = 1', attrs: { spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Equation' } });
      const lo = num(-100, 'Search from'), hi = num(100, 'Search to');
      solve = () => {
        if (!eq.value.trim()) throw new Error('Type an equation, e.g. x^2 = 2.');
        if ((eq.value.match(/=/g) || []).length > 1) throw new Error('One = sign, please: left side = right side.');
        const a = parseFloat(lo.value), b = parseFloat(hi.value);
        if (!isFinite(a) || !isFinite(b) || a >= b) throw new Error('The search range needs two numbers, "from" below "to".');
        const ex = m.compile(eq.value, deg);
        try {
          const other = (['y', 'z', 't', 'ans'] as const).find((v) => ex.uses(v));
          if (other) throw new Error(other === 'ans' ? 'Ans belongs to the calculator — an equation here is written with x.' : `Only x can be the unknown: "${other}" has no value. (Several unknowns: "Simultaneous".)`);
          if (!ex.uses('x')) { // nothing to solve for: the two sides are equal or they are not
            const v = ex.eval(0);
            clear(out).append(note(!Number.isFinite(v) ? 'There is no x in the equation, and one side has no value.' : v === 0 ? 'There is no x in the equation, and it is true as it stands: every x solves it.' : 'There is no x in the equation, and it is false as it stands: no x solves it.', 'warn'));
            return;
          }
          const probe = ex.range(a, (b - a) / 16, 17);
          if (probe.every((v) => v === 0)) { clear(out).append(note('Both sides are equal for every x that was tried: every x in the range solves it.', 'warn')); return; }
          const found = ex.roots(a, b, 20000, ROOT_CAP), step = (b - a) / 20000;
          clear(out).append(card(found.length === 1 ? 'Real solution' : `Real solutions${found.length > 1 ? ` (${found.length}${found.length >= ROOT_CAP ? ' shown' : ''})` : ''}`,
            found.length ? h('div', { class: 'big-results' }, found.map((r, i) => tile(`x${found.length > 1 ? sub(i) : ''}`, fmtNum(r + 0, 10).replace(/^-/, '−'), '', fmtNum(r + 0)))) : note(`No real solution between ${fmtNum(a)} and ${fmtNum(b)}.`, 'warn'),
            found.length >= ROOT_CAP ? note(`The first ${ROOT_CAP} solutions from ${fmtNum(a)} upwards are shown — there may be more: narrow the range.`, 'warn') : null,
            step > 0.05 ? note(`The range is searched in 20,000 steps of ${fmtNum(step, 3)}: solutions closer together than that can be missed — narrow the range to find them.`) : null));
        } finally { ex.free(); }
      };
      live(eq, lo, hi);
      body.append(field('Equation in x (use = or just an expression = 0)', eq), h('div', { class: 'grid2' }, field('Search from', lo), field('to', hi)),
        row(solveBtn(), segmented([['rad', 'Radians'], ['deg', 'Degrees']], deg ? 'deg' : 'rad', (v) => { deg = v === 'deg'; run(); })));
    } else if (mode === 'quad' || mode === 'cubic') {
      const names = mode === 'quad' ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd'];
      const vals = mode === 'quad' ? [1, -3, 2] : [1, -6, 11, -6];
      const ins = names.map((nm, i) => num(vals[i], nm));
      solve = () => {
        const v = ins.map((x) => (x.validity.badInput ? 'not a number' : x.value));
        if (mode === 'quad') {
          const q = quadratic(v[0], v[1], v[2]), [p, r] = q.roots;
          clear(out).append(card(q.kind === 'double' ? 'Root' : 'Roots', h('div', { class: 'big-results' }, q.kind === 'double' ? rootTile(p, 'x₁ = x₂') : [rootTile(p, 'x₁'), rootTile(r, 'x₂')]),
            kv([['Kind', q.kind === 'two' ? 'Two different real roots' : q.kind === 'double' ? 'One real root, twice (the parabola touches the axis)' : 'Two complex roots (the parabola does not reach the axis)'],
              ['Discriminant b² − 4ac', q.disc.length > 40 ? fmtNum(parseFloat(q.disc.replace('−', '-'))).replace(/^-/, '−') : q.disc], ['Vertex', `(${fmtNum(q.vertex[0])}, ${fmtNum(q.vertex[1])})`.replace(/-/g, '−')]])));
        } else {
          const q = cubic(v[0], v[1], v[2], v[3], (a, b, c, d) => m.cubic(a, b, c, d)[0].re), [p, r, t3] = q.roots;
          clear(out).append(card(q.kind === 'triple' ? 'Root' : 'Roots', h('div', { class: 'big-results' }, q.kind === 'triple' ? rootTile(p, 'x₁ = x₂ = x₃')
            : q.kind === 'double' ? (p.re === r.re ? [rootTile(p, 'x₁ = x₂'), rootTile(t3, 'x₃')] : [rootTile(p, 'x₁'), rootTile(r, 'x₂ = x₃')]) : [rootTile(p, 'x₁'), rootTile(r, 'x₂'), rootTile(t3, 'x₃')]),
            kv([['Kind', q.kind === 'three' ? 'Three different real roots' : q.kind === 'double' ? 'Two real roots, one of them twice' : q.kind === 'triple' ? 'One real root, three times' : 'One real root and two complex ones']])));
        }
      };
      live(...ins);
      body.append(h('p', { class: 'muted' }, mode === 'quad' ? 'ax² + bx + c = 0' : 'ax³ + bx² + cx + d = 0'), h('div', { class: 'form-grid' }, ins.map((x, i) => field(names[i], x))), solveBtn());
    } else {
      const grid = h('div');
      let cells: HTMLInputElement[][] = [];
      const build = () => {
        const vars = ['x', 'y', 'z', 'w'].slice(0, n);
        const defaults: Record<number, number[][]> = { 2: [[2, 3, 8], [1, -1, -1]], 3: [[1, 1, 1, 6], [0, 2, 5, -4], [2, 5, -1, 27]], 4: [[1, 1, 1, 1, 10], [1, -1, 2, 0, 5], [0, 2, 1, -1, 3], [3, 0, 0, 1, 7]] };
        const touched = Object.keys(kept).length > 0; // once something was typed, the grid keeps it through a change of size
        cells = Array.from({ length: n }, (_, r) => Array.from({ length: n + 1 }, (_, c) => {
          const key = `${r},${c === n ? 'rhs' : c}`;
          const x = num(kept[key] ?? (touched ? '0' : defaults[n][r][c]), c === n ? `Equation ${r + 1}, right-hand side` : `Equation ${r + 1}, coefficient of ${vars[c]}`);
          x.classList.add('eq-cell'); x.addEventListener('input', () => { kept[key] = x.value; });
          return x;
        }));
        clear(grid).append(...cells.map((rowCells) => h('div', { class: 'eq-row' }, ...rowCells.slice(0, n).flatMap((x, c) => [x, h('span', { class: 'eq-var' }, vars[c] + (c < n - 1 ? ' +' : ' ='))]), rowCells[n])));
        live(...cells.flat());
      };
      solve = () => {
        const s = linear(cells.map((r) => r.map((x) => (x.validity.badInput ? 'not a number' : x.value))));
        clear(out).append(card(s.kind === 'one' ? 'Solution' : 'No single solution', s.kind === 'one' ? h('div', { class: 'big-results' }, s.x.map((v, i) => rootTile(v, 'xyzw'[i])))
          : note(s.kind === 'none' ? 'No solution: the equations contradict each other.' : `Infinitely many solutions: the equations are not independent — only ${s.rank} of the ${n} ${s.rank === 1 ? 'says' : 'say'} something new.`, 'warn')));
      };
      body.append(segmented([['2', '2 unknowns'], ['3', '3 unknowns'], ['4', '4 unknowns']], String(n), (v) => { n = +v; build(); run(); }), h('div', { class: 'scroll-x' }, grid), solveBtn());
      build();
    }
    run();
  };
  root.append(card(null, stack(segmented([['any', 'Any equation f(x)=g(x)'], ['quad', 'Quadratic'], ['cubic', 'Cubic'], ['sys', 'Simultaneous (linear)']], mode, (v) => { mode = v; render(); }), body)), out,
    note('Quadratic, cubic and simultaneous equations are solved from the numbers exactly as typed: (x − 1.1)² = 0 has one root, and a fraction is shown beside its decimal. "Any equation" looks for real solutions between the two limits.'));
  render();
};

// ================================================================== Statistics
const SORTED_SHOWN = 1000;
export const stats: Mount = async (root) => {
  const m = await mathcore();
  const ta = textarea({ rows: 6, value: '12, 15, 15, 18, 21, 24, 24, 24, 30', placeholder: 'Numbers separated by commas, spaces or new lines' });
  const xy = textarea({ rows: 5, value: '', placeholder: 'Optional regression: one "x, y" pair per line' });
  const out = h('div', { class: 'stack' });
  const n = (v: number) => (Number.isNaN(v) ? '—' : fmtNum(v).replace(/^-/, '−'));
  const tile = (l: string, v: string) => h('button', { class: 'big-result', type: 'button', title: 'Copy', onclick: () => copy(v.replace(/−/g, '-')) }, h('span', { class: 'big-label' }, l), h('span', { class: 'big-value' }, v));
  const run = () => {
    clear(out);
    const data = readNumbers(ta.value), xs = data.values;
    const left = data.skipped.length ? note(`Left out — not ${data.skipped.length === 1 ? 'a number' : 'numbers'}: ${someOf(data.skipped)}`, 'warn') : null;
    if (xs.length) {
      const s = m.stats(xs), neg = s.min < 0;
      const rows: Array<[string, string]> = [['Count', s.count.toLocaleString('en-IN')], ['Sum', n(s.sum)], ['Min', n(s.min)], ['Max', n(s.max)], ['Range', n(s.range)], ['Q1 (25%)', n(s.q1)], ['Q3 (75%)', n(s.q3)], ['IQR', n(s.iqr)],
        ['Variance (population)', n(s.varP)], ['Variance (sample)', n(s.varS)], ['Std dev (sample)', n(s.sdS)], ['Geometric mean', n(s.geomean)], ['Harmonic mean', n(s.harmmean)], ['Skewness (population)', n(roundDec(s.skew, 10) + 0)], // a pure number of ordinary size: ten decimals, so that evenly spread data show 0 and not 5 × 10⁻¹⁶
        ['Sorted', s.sorted.slice(0, SORTED_SHOWN).map(n).join(', ') + (s.sorted.length > SORTED_SHOWN ? ` … and ${(s.sorted.length - SORTED_SHOWN).toLocaleString('en-IN')} more` : '')]];
      const why = [xs.length === 1 ? 'One number: the sample variance and standard deviation need two.' : '', neg ? 'The geometric and the harmonic mean are for numbers above 0 — there is a negative one.' : s.min === 0 ? 'With a 0 among the numbers the geometric and the harmonic mean are 0.' : '',
        s.count > 1 && Number.isNaN(s.skew) ? 'All the numbers are equal: no skewness.' : ''].filter(Boolean);
      out.append(card('Summary',
        h('div', { class: 'big-results' }, tile('Mean', n(s.mean)), tile('Median', n(s.median)), tile('Mode', s.modes.length ? s.modes.slice(0, 20).map(n).join(', ') + (s.modes.length > 20 ? ' …' : '') : 'none'), tile('Std dev (population)', n(s.sdP))),
        h('div', { class: 'kv' }, rows.flatMap(([l, v]) => [h('span', null, l), h('span', null, v)])), ...why.map((w) => note(w)), left,
        h('p', { class: 'muted small' }, 'Quartiles by linear interpolation between the sorted values (Excel\'s QUARTILE.INC, NumPy\'s default). Mode: the values that occur most often, when anything repeats.')));
    } else out.append(card('Summary', note(ta.value.trim() ? 'No numbers among what was typed.' : 'Type some numbers — separated by commas, spaces or new lines.', ta.value.trim() ? 'warn' : undefined), left));
    const pairs = readPairs(xy.value), k = pairs.x.length, problems = pairs.problems.slice(0, 5).map((p) => note(p, 'warn'));
    if (pairs.problems.length > 5) problems.push(note(`… and ${pairs.problems.length - 5} more lines left out.`, 'warn'));
    if (k >= 2) {
      const r = m.regress(pairs.x, pairs.y), flat = Number.isNaN(r.slope);
      out.append(card('Linear regression', flat ? note('All the x values are equal: the points stand above each other, and no line y = ax + b fits them.', 'warn')
        : h('div', { class: 'big-results' }, tile('Best-fit line', lineText(r.slope, r.intercept, (v) => fmtNum(v, 6)))),
        h('div', { class: 'kv' }, h('span', null, 'Correlation r'), h('span', null, Number.isNaN(r.r) ? '—' : fmtNum(r.r, 6).replace(/^-/, '−')), h('span', null, 'R²'), h('span', null, Number.isNaN(r.r) ? '—' : fmtNum(r.r * r.r, 6)), h('span', null, 'Pairs'), h('span', null, k.toLocaleString('en-IN'))),
        !flat && Number.isNaN(r.r) ? note('All the y values are equal: the line is level, and a correlation is not defined.') : null, ...problems));
    } else if (k === 1 || problems.length) out.append(card('Linear regression', k === 1 ? note('One pair — a line needs at least two.', 'warn') : null, ...problems));
  };
  ta.addEventListener('input', run); xy.addEventListener('input', run);
  root.append(card(null, stack(field('Data', ta), field('x, y pairs (optional)', xy))), out);
  run();
};

// ================================================================== Matrix
export const matrix: Mount = async (root) => {
  const m = await mathcore();
  const A = textarea({ rows: 4, mono: true, value: '2 1 0\n1 3 1\n0 1 4', placeholder: 'Rows on lines: 1 2 3' }), B = textarea({ rows: 4, mono: true, value: '1 0 0\n0 1 0\n0 0 1' });
  const out = h('pre', { class: 'mat-out', 'aria-live': 'polite' }), about = h('div', { class: 'muted small mat-about' });
  const pw = input({ type: 'number', value: 2, attrs: { 'aria-label': 'Power n' } });
  let fractions = false;
  /** what the last press produced: a matrix or a single value, exact (fractions) or rounded (numbers) */
  type Shown = { title: string; exact?: M | Q; rounded?: number[][] | number; text?: string };
  let last: Shown | null = null;
  const num8 = (x: number) => fmtNum(x, 12);
  const paint = () => {
    if (!last) { out.textContent = ''; about.textContent = ''; return; }
    const r = last;
    if (r.text !== undefined) out.textContent = r.text;
    else if (r.exact !== undefined) out.textContent = Array.isArray(r.exact) ? matrixText(r.exact, fractions, num8) : valueText(r.exact, fractions, num8);
    else out.textContent = Array.isArray(r.rounded) ? r.rounded.map((row) => row.map((x) => num8(x + 0).replace(/^-/, '−')).join('\t')).join('\n') : num8((r.rounded as number) + 0).replace(/^-/, '−');
    about.textContent = `${r.title}${r.rounded !== undefined ? ' — in rounded arithmetic (double precision): the matrix is too large for exact fractions' : ''}`;
  };
  const press = (label: string, f: () => Shown) => button(label, () => { try { last = f(); } catch (e: any) { last = { title: '', text: `⚠ ${e?.message || e}` }; } paint(); }, { small: true });
  const a = () => readMatrix(A.value, 'A'), b = () => readMatrix(B.value, 'B');
  const sq = (x: M, what: string) => { if (x.length !== x[0].length) throw new Error(`${what} needs a square matrix — A is ${shape(x)}.`); return x; };
  root.append(card(null, stack(h('div', { class: 'grid2' }, field('Matrix A (rows on lines)', A), field('Matrix B', B)),
    h('div', { class: 'row' },
      press('A + B', () => { const r = addM(a(), b(), 1); return { title: `A + B (${shape(r)})`, exact: r }; }),
      press('A − B', () => { const r = addM(a(), b(), -1); return { title: `A − B (${shape(r)})`, exact: r }; }),
      press('A × B', () => { const x = a(), y = b(); if (x[0].length !== y.length) mulM(x, y); return exactOk(x) && exactOk(y) ? ((r) => ({ title: `A × B (${shape(r)})`, exact: r }))(mulM(x, y)) : { title: 'A × B', rounded: m.matmul(toNumbers(x), toNumbers(y)) }; }),
      press('det(A)', () => { const x = sq(a(), 'The determinant'); return exactOk(x) ? { title: 'det(A)', exact: detM(x) } : { title: 'det(A)', rounded: m.det(toNumbers(x)) }; }),
      press('A⁻¹', () => {
        const x = sq(a(), 'The inverse');
        if (exactOk(x)) { const r = inverseM(x); if (!r) throw new Error('A has no inverse: its determinant is 0.'); return { title: `A⁻¹ (${shape(r)})`, exact: r }; }
        const r = m.inverse(toNumbers(x)); if (!r) throw new Error('A has no inverse (in rounded arithmetic its determinant is 0).'); return { title: 'A⁻¹', rounded: r };
      }),
      press('Aᵀ', () => { const r = transposeM(a()); return { title: `Aᵀ (${shape(r)})`, exact: r }; }),
      press('rank(A)', () => { const x = a(); return exactOk(x) ? { title: `rank(A) — A is ${shape(x)}`, text: String(rankM(x)) } : { title: `rank(A) — A is ${shape(x)}`, rounded: m.rank(toNumbers(x)) }; }),
      press('trace(A)', () => ({ title: 'trace(A)', exact: traceM(a()) })),
      press('Aⁿ', () => { const x = sq(a(), 'A power'), n = readPower(pw.validity.badInput ? 'x' : pw.value); return exactOk(x, n) ? { title: `A^${n} (${shape(x)})`, exact: powM(x, n) } : { title: `A^${n}`, rounded: m.matpow(toNumbers(x), n) }; }),
      h('span', { class: 'muted small' }, 'n ='), pw))),
    card('Result', out, about, row(button('Copy', () => copy((out.textContent || '').replace(/−/g, '-')), { small: true, icon: 'Copy' }),
      segmented([['dec', 'Decimals'], ['frac', 'Fractions']], 'dec', (v) => { fractions = v === 'frac'; paint(); }))),
    note('Cells: whole numbers, decimals or fractions (3/4), separated by spaces, commas or tabs; a row a line — or on one line with semicolons (1 2; 3 4). The arithmetic is exact: a determinant of 0 is 0, and an inverse can be shown in fractions.'));
};

// ================================================================== Fractions (exact, mathcore 128-bit with overflow checks)
export const fraction: Mount = async (root) => {
  const m = await mathcore();
  const ex = input({ value: '3/4 + 5/6 × 2 1/2', attrs: { spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Expression' } });
  const out = h('div', { class: 'big-results' });
  const err = h('div');
  const run = () => {
    clear(out); clear(err);
    try {
      const a = fractionAnswer(m, ex.value);
      const items: Array<[string, string]> = [['Fraction', a.fraction], ['Mixed number', a.mixed], ['Decimal', a.decimal]];
      out.append(...items.map(([l, v]) => h('button', { class: 'big-result', type: 'button', title: 'Copy', onclick: () => copy(v.replace(/−/g, '-')) }, h('span', { class: 'big-label' }, l), h('span', { class: 'big-value' }, v))));
    } catch (e: any) { err.append(note(e.message, ex.value.trim() ? 'warn' : undefined)); }
  };
  ex.addEventListener('input', run);
  root.append(card(null, field('Expression', ex, 'Use a/b, mixed numbers like 2 1/2, decimals (converted exactly), + − × ÷ ^ and parentheses.')), card('Result', out, err),
    note('2/3 written without spaces is one number: 1/3 ÷ 2/3 = 1/2. A power comes first: 2/3^2 = 2/9, (2/3)^2 = 4/9. In the decimal, digits in brackets repeat for ever: 1/6 = 0.1(6).'));
  run();
};

// ================================================================== Primes / LCM / GCD (64-bit, mathcore)
const PRIMES_SHOWN = 20;
export const primes: Mount = async (root) => {
  const m = await mathcore();
  const inp = input({ value: '360, 84, 1001', attrs: { spellcheck: 'false', 'aria-label': 'Numbers' } });
  const out = h('div', { class: 'stack' });
  const run = () => {
    clear(out);
    const { ns, skipped, tooLarge } = readWholeNumbers(inp.value);
    const left = [skipped.length ? note(`Left out — whole numbers from 1 up only: ${someOf(skipped)}`, 'warn') : null, tooLarge.length ? note(`Left out — beyond 18,446,744,073,709,551,615 (64 bits): ${someOf(tooLarge)}`, 'warn') : null];
    if (!ns.length) { out.append(inp.value.trim() ? card(null, note('No whole number from 1 up among what was typed.', 'warn'), ...left) : note('Type one or more whole numbers — separated by commas or spaces.')); return; }
    if (ns.length > 1) {
      // gcd in wasm; the LCM can outgrow 64 bits, so it is built exactly as l / gcd(l, b) × b (gcd(l, b) = gcd(b, l mod b), both ≤ 64 bits)
      const g = ns.reduce((a, b) => m.gcd(a, b)), l = ns.reduce((a, b) => (a / (a > MAX_U64 ? m.gcd(b, a % b) : m.gcd(a, b))) * b);
      const tile = (label: string, v: string) => h('button', { class: 'big-result', type: 'button', title: 'Copy', onclick: () => copy(v) }, h('span', { class: 'big-label' }, label), h('span', { class: 'big-value' }, v));
      out.append(h('div', { class: 'big-results' }, tile('GCD / HCF', String(g)), tile('LCM', String(l))));
    }
    out.append(card(null, h('div', { class: 'kv' }, ns.slice(0, PRIMES_SHOWN).flatMap((n) => {
      const next = m.nextPrime(n), after = `next prime ${next ? String(next) : 'above 2⁶⁴ (out of range)'}`;
      return [h('strong', null, String(n)), h('span', null, n === 1n ? `1 (neither prime nor composite)  ·  ${after}` : m.isPrime(n) ? `Prime ✓  ·  ${after}` : `${factorText(m.factor(n))}  ·  ${after}`)];
    })), ns.length > PRIMES_SHOWN ? note(`The first ${PRIMES_SHOWN} of ${ns.length.toLocaleString('en-IN')} numbers are taken apart here; GCD and LCM are of all of them.`) : null, ...left));
  };
  inp.addEventListener('input', run);
  root.append(card(null, field('Numbers (one or more)', inp, 'Exact 64-bit prime test (deterministic Miller–Rabin), factorisation (Pollard rho), GCD and LCM — computed in mathcore.wasm.')), out);
  run();
};

// ================================================================== Periodic table
export const periodic: Mount = (root) => {
  const detail = h('div', { 'aria-live': 'polite' });
  const q = input({ placeholder: 'Search element, symbol or number…', attrs: { 'aria-label': 'Search element, symbol or number', spellcheck: 'false', autocapitalize: 'off' } });
  const none = h('div');
  let shown = ELEMENTS[0], only = ''; // the category picked in the legend, or ''
  const cells = new Map<number, HTMLButtonElement>();
  const show = (el: (typeof ELEMENTS)[number]) => {
    shown = el;
    cells.forEach((b, z) => { b.classList.toggle('sel', z === el.z); b.setAttribute('aria-pressed', String(z === el.z)); });
    const unstable = el.mass.startsWith('[');
    clear(detail).append(card(null, h('div', { class: 'el-detail' },
      h('div', { class: 'el-big', style: { background: CATEGORY_COLORS[el.cat] } }, h('small', null, String(el.z)), h('strong', null, el.sym), h('span', null, el.name)),
      h('div', { class: 'kv' },
        h('span', null, 'Atomic number'), h('span', null, String(el.z)), h('span', null, 'Atomic mass'), h('span', null, el.mass),
        h('span', null, 'Category'), h('span', null, el.cat), h('span', null, 'Group / period'), h('span', null, `${el.group || '—'} / ${el.period}`), h('span', null, 'Block'), h('span', null, el.block),
        h('span', null, 'Electron configuration'), h('span', null, el.config))),
      unstable ? h('p', { class: 'muted small' }, `${el.name} has no stable isotope: ${el.mass} is the mass number of its longest-lived one.`) : null,
      ALIASES[el.sym] ? h('p', { class: 'muted small' }, `Also: ${ALIASES[el.sym].map((a) => a[0].toUpperCase() + a.slice(1)).join(', ')}.`) : null));
  };
  const gap = (row: number, text: string) => h('div', { class: 'el-gap', style: { gridColumn: '3', gridRow: String(row) }, title: `Elements ${text}: in the rows below` }, text);
  const grid = h('div', { class: 'ptable' }, ELEMENTS.map((el) => {
    const b = h('button', { type: 'button', class: 'el', title: `${el.name} (${el.z})`, 'aria-label': `${el.z} ${el.sym}, ${el.name}`, // starts with what the cell shows (WCAG 2.5.3: the visible text is part of the name)
      style: { gridColumn: String(el.col), gridRow: String(el.row), background: CATEGORY_COLORS[el.cat] }, onclick: () => show(el) }, h('small', null, String(el.z)), ' ', h('strong', null, el.sym)); // the space: the visible text reads "2 He", as the name begins
    cells.set(el.z, b);
    return b;
  }), gap(6, '57–71'), gap(7, '89–103'));
  // arrow keys move through the table as it is drawn
  grid.addEventListener('keydown', (e) => {
    const d = ({ ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] } as Record<string, number[]>)[e.key];
    const from = ELEMENTS.find((x) => cells.get(x.z) === document.activeElement);
    if (!d || !from) return;
    for (let r = from.row + d[0], c = from.col + d[1]; r >= 1 && r <= 10 && c >= 1 && c <= 18; r += d[0], c += d[1]) {
      const to = ELEMENTS.find((x) => x.row === r && x.col === c);
      if (to) { e.preventDefault(); cells.get(to.z)!.focus(); show(to); return; }
    }
  });
  const legend = h('div', { class: 'legend legend-pick' });
  const apply = () => {
    const t = q.value.trim();
    let lit = 0;
    for (const el of ELEMENTS) { const on = elementMatches(el, t) && (!only || el.cat === only); if (on) lit++; cells.get(el.z)!.classList.toggle('dim', !on); }
    const hit = findElement(t);
    if (t && hit && (!only || hit.cat === only)) show(hit);
    clear(none);
    if (!lit) none.append(note(t ? `No element matches "${t}"${only ? ` among the ${only}s` : ''}.` : `No element in that category.`, 'warn'));
    clear(legend).append(...Object.entries(CATEGORY_COLORS).map(([k, c]) => h('button', { type: 'button', class: ['legend-item', only === k && 'on'], 'aria-pressed': String(only === k), title: only === k ? 'Show all' : `Show only: ${k}`, onclick: () => { only = only === k ? '' : k; apply(); } }, h('i', { style: { background: c } }), k)));
  };
  q.addEventListener('input', apply);
  root.append(card(null, q, none), card(null, h('div', { class: 'ptable-scroll' }, grid), legend), detail);
  show(shown); apply();
};
