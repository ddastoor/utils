import { h, card, button, clear, copy, type Mount } from '../ui';
import { mathcore, fmtNum } from '../wasm/mathcore';

export const mount: Mount = async (root, ctx) => {
  const m = await mathcore();
  const evaluate = (src: string, env: { ans: number }, o: { deg: boolean }) => m.evaluate(src, { deg: o.deg, ans: env.ans });
  let deg = true, second = false, ans = 0, mem = 0, justEvaluated = false;
  const history: Array<[string, string]> = [];

  const exprIn = h('input', { class: 'calc-expr', type: 'text', inputmode: ctx.isMobile ? 'none' : 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Expression', placeholder: '0' });
  const preview = h('div', { class: 'calc-preview', 'aria-live': 'polite' });
  const memInd = h('span', { class: 'calc-ind' });
  const modeInd = h('button', { class: 'calc-ind calc-mode', type: 'button', onclick: () => { deg = !deg; refresh(); } });
  const histEl = h('div', { class: 'calc-history' });

  const live = () => {
    const v = exprIn.value.trim();
    if (!v) { preview.textContent = ''; return; }
    try { const r = evaluate(v, { ans }, { deg }); preview.textContent = isFinite(r) || isNaN(r) ? `= ${fmtNum(r)}` : `= ${fmtNum(r)}`; preview.classList.remove('err'); }
    catch { preview.textContent = ''; }
  };
  const refresh = () => {
    modeInd.textContent = deg ? 'DEG' : 'RAD';
    memInd.textContent = mem ? `M = ${fmtNum(mem)}` : '';
    root.querySelectorAll<HTMLElement>('[data-second]').forEach((b) => { b.textContent = second ? b.dataset.second! : b.dataset.first!; });
    root.querySelector('.calc-2nd')?.classList.toggle('on', second);
    live();
  };
  const insert = (s: string) => {
    if (justEvaluated && /^[0-9.(πe√a-z]/.test(s)) exprIn.value = '';
    justEvaluated = false;
    const start = exprIn.selectionStart ?? exprIn.value.length, end = exprIn.selectionEnd ?? start;
    exprIn.value = exprIn.value.slice(0, start) + s + exprIn.value.slice(end);
    const pos = start + s.length;
    exprIn.setSelectionRange(pos, pos);
    if (!ctx.isMobile) exprIn.focus();
    live();
  };
  const equals = () => {
    const v = exprIn.value.trim();
    if (!v) return;
    try {
      const r = evaluate(v, { ans }, { deg });
      ans = r;
      history.unshift([v, fmtNum(r)]);
      if (history.length > 50) history.pop();
      exprIn.value = fmtNum(r) === 'Error' ? '' : fmtNum(r).replace('∞', 'inf');
      preview.textContent = '';
      justEvaluated = true;
      renderHist();
    } catch (e: any) { preview.textContent = e.message; preview.classList.add('err'); }
  };
  const renderHist = () => clear(histEl).append(...history.map(([e, r]) => h('button', {
    class: 'calc-hrow', type: 'button', onclick: () => { exprIn.value = e; justEvaluated = false; live(); },
  }, h('span', { class: 'muted' }, e), h('strong', null, r))));

  const valueNow = () => { try { return evaluate(exprIn.value || '0', { ans }, { deg }); } catch { return NaN; } };
  type K = [label: string, action: () => void, cls?: string, second?: [string, () => void]];
  const fn = (name: string) => () => insert(`${name}(`);
  const keys: K[] = [
    ['2nd', () => { second = !second; refresh(); }, 'calc-2nd fn'],
    ['deg/rad', () => { deg = !deg; refresh(); }, 'fn'],
    ['MC', () => { mem = 0; refresh(); }, 'fn mem'], ['MR', () => insert(fmtNum(mem)), 'fn mem'],
    ['M+', () => { mem += valueNow() || 0; refresh(); }, 'fn mem', ['M−', () => { mem -= valueNow() || 0; refresh(); }]],
    ['sin', fn('sin'), 'fn', ['asin', fn('asin')]], ['cos', fn('cos'), 'fn', ['acos', fn('acos')]], ['tan', fn('tan'), 'fn', ['atan', fn('atan')]],
    ['ln', fn('ln'), 'fn', ['eˣ', () => insert('e^(')]], ['log', fn('log'), 'fn', ['10ˣ', () => insert('10^(')]],
    ['x²', () => insert('^2'), 'fn', ['x³', () => insert('^3')]], ['xʸ', () => insert('^'), 'fn', ['ʸ√x', () => insert('root(')]],
    ['√', () => insert('√'), 'fn', ['∛', fn('cbrt')]], ['n!', () => insert('!'), 'fn', ['nCr', fn('nCr')]], ['1/x', () => { exprIn.value = `1/(${exprIn.value || '0'})`; live(); }, 'fn', ['nPr', fn('nPr')]],
    ['(', () => insert('('), 'fn'], [')', () => insert(')'), 'fn'], ['π', () => insert('π'), 'fn', ['e', () => insert('e')]], ['%', () => insert('%'), 'fn', ['mod', fn('mod')]], ['AC', () => { exprIn.value = ''; justEvaluated = false; live(); }, 'clr'],
    ['7', () => insert('7')], ['8', () => insert('8')], ['9', () => insert('9')], ['÷', () => insert('÷'), 'op'], ['⌫', () => {
      const s = exprIn.selectionStart ?? exprIn.value.length;
      if (s > 0) { exprIn.value = exprIn.value.slice(0, s - 1) + exprIn.value.slice(s); exprIn.setSelectionRange(s - 1, s - 1); }
      justEvaluated = false; live();
    }, 'clr'],
    ['4', () => insert('4')], ['5', () => insert('5')], ['6', () => insert('6')], ['×', () => insert('×'), 'op'], ['−', () => insert('−'), 'op'],
    ['1', () => insert('1')], ['2', () => insert('2')], ['3', () => insert('3')], ['+', () => insert('+'), 'op'], ['Ans', () => insert('ans'), 'fn'],
    ['±', () => { exprIn.value = exprIn.value.startsWith('-') ? exprIn.value.slice(1) : `-(${exprIn.value || '0'})`.replace(/^-\((-?[\d.]+)\)$/, '-$1'); live(); }], ['0', () => insert('0')], ['.', () => insert('.')], ['EXP', () => insert('e'), 'fn'], ['=', equals, 'eq'],
  ];
  const pad = h('div', { class: 'calc-pad' }, keys.map(([label, act, cls, sec]) => h('button', {
    type: 'button', class: ['calc-key', cls], 'data-first': label, 'data-second': sec ? sec[0] : label,
    onclick: () => { if (second && sec) { sec[1](); second = false; refresh(); } else act(); },
  }, label)));

  exprIn.addEventListener('input', () => { justEvaluated = false; live(); });
  exprIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); }
    else if (e.key === 'Escape') { exprIn.value = ''; live(); }
  });

  root.append(h('div', { class: 'calc-wrap' },
    card(null,
      h('div', { class: 'calc-display' }, h('div', { class: 'calc-inds' }, modeInd, memInd), exprIn, preview),
      pad),
    card('History', h('div', { class: 'row' }, button('Copy result', () => copy(exprIn.value), { small: true, icon: 'Copy' }), button('Clear history', () => { history.length = 0; renderHist(); }, { small: true, variant: 'ghost' })), histEl),
  ));
  refresh();
  if (!ctx.isMobile) exprIn.focus();
};
