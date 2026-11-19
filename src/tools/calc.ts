import { h, card, button, clear, copy, type Mount } from '../ui';
import { mathcore, fmtNum } from '../wasm/mathcore';
import { bcConsole } from './bc-console';
import { prepare, literal, negate, startsOperand } from '../lib/calc-text';

export const mount: Mount = async (root, ctx) => {
  const m = await mathcore();
  const evaluate = (src: string, env: { ans: number }, o: { deg: boolean }) => m.evaluate(prepare(src), { deg: o.deg, ans: env.ans, numbersOnly: true });
  // `justEvaluated`: the box shows the result of "=" (rounded for the eye); `ans` holds it exactly. Going on with an
  // operator continues from `ans` — 1 ÷ 3 = , × 3 = gives 1, not 0.999999999999.
  let deg = true, second = false, ans = 0, mem = 0, justEvaluated = false;
  const history: Array<{ expr: string; text: string; ansBefore: number }> = [];

  const exprIn = h('input', { class: 'calc-expr', type: 'text', inputmode: ctx.isMobile ? 'none' : 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Expression', placeholder: '0' });
  const preview = h('div', { class: 'calc-preview', 'aria-live': 'polite' });
  const memInd = h('span', { class: 'calc-ind' });
  const modeInd = h('button', { class: 'calc-ind calc-mode', type: 'button', onclick: () => { deg = !deg; refresh(); } });
  const histEl = h('div', { class: 'calc-history' });

  const live = () => {
    const v = exprIn.value.trim();
    preview.classList.remove('err');
    if (!v || justEvaluated) { preview.textContent = ''; return; }
    try { preview.textContent = `= ${fmtNum(evaluate(v, { ans }, { deg }))}`; }
    catch { preview.textContent = ''; }
  };
  const refresh = () => {
    modeInd.textContent = deg ? 'DEG' : 'RAD';
    memInd.textContent = mem ? `M = ${fmtNum(mem)}` : '';
    root.querySelectorAll<HTMLElement>('[data-second]').forEach((b) => { b.textContent = second ? b.dataset.second! : b.dataset.first!; });
    root.querySelector('.calc-2nd')?.classList.toggle('on', second);
    live();
  };
  /** What a key works on: after "=" the exact result (written Ans), else what is in the box. */
  const current = () => (justEvaluated ? 'ans' : exprIn.value);
  const insert = (s: string) => {
    if (justEvaluated) { exprIn.value = startsOperand(s) ? '' : 'ans'; exprIn.setSelectionRange(exprIn.value.length, exprIn.value.length); }
    justEvaluated = false;
    const start = exprIn.selectionStart ?? exprIn.value.length, end = exprIn.selectionEnd ?? start;
    exprIn.value = exprIn.value.slice(0, start) + s + exprIn.value.slice(end);
    const pos = start + s.length;
    exprIn.setSelectionRange(pos, pos);
    if (!ctx.isMobile) exprIn.focus();
    live();
  };
  const fail = (msg: string) => { preview.textContent = msg; preview.classList.add('err'); };
  const equals = () => {
    const v = exprIn.value.trim();
    if (!v || justEvaluated) return;                 // "=" twice: the result stands (and stays exact)
    let r: number;
    try { r = evaluate(v, { ans }, { deg }); }
    catch (e: any) {
      const msg = String(e?.message || e);
      fail(/\d,\d/.test(v) && /Unexpected symbol|Wrong number/.test(msg) ? 'Write numbers without commas (1000, not 1,000) — a comma separates what a function is given.' : msg);
      return;
    }
    // no answer: the expression stays for correcting, and Ans keeps the last good result
    if (Number.isNaN(r)) { fail(m.why() === 'div0' ? 'Division by zero.' : 'No real result — such as √ or log of a negative number, sin⁻¹ of more than 1, tan 90°.'); return; }
    // ∞ is an answer only when ∞ was put in (typed, or as an Ans that is ∞); otherwise the working overflowed
    const withInfinity = /∞|inf/i.test(v) || (/ans/i.test(v) && !Number.isFinite(ans));
    if (!Number.isFinite(r) && !withInfinity) { fail('Too large: the result is beyond 1.8 × 10^308.'); return; }
    history.unshift({ expr: v, text: fmtNum(r), ansBefore: ans });
    if (history.length > 50) history.pop();
    ans = r;
    exprIn.value = fmtNum(r);
    justEvaluated = true;
    preview.textContent = ''; preview.classList.remove('err');
    renderHist();
  };
  // a history row brings its expression back — with the Ans it was worked out with
  const renderHist = () => clear(histEl).append(...history.map((row) => h('button', {
    class: 'calc-hrow', type: 'button', onclick: () => { exprIn.value = row.expr; ans = row.ansBefore; justEvaluated = false; live(); },
  }, h('span', { class: 'muted' }, row.expr.replace(/\bans\b/gi, 'Ans')), h('strong', null, row.text))));

  const valueNow = () => { if (justEvaluated) return ans; try { return evaluate(exprIn.value || '0', { ans }, { deg }); } catch { return NaN; } };
  const setExpr = (v: string) => { exprIn.value = v; justEvaluated = false; exprIn.setSelectionRange(v.length, v.length); live(); };
  type K = [label: string, action: () => void, cls?: string, second?: [string, () => void]];
  const fn = (name: string) => () => insert(`${name}(`);
  const keys: K[] = [
    ['2nd', () => { second = !second; refresh(); }, 'calc-2nd fn'],
    ['deg/rad', () => { deg = !deg; refresh(); }, 'fn'],
    ['MC', () => { mem = 0; refresh(); }, 'fn mem'], ['MR', () => insert(literal(mem)), 'fn mem'],
    ['M+', () => { mem += valueNow() || 0; refresh(); }, 'fn mem', ['M−', () => { mem -= valueNow() || 0; refresh(); }]],
    ['sin', fn('sin'), 'fn', ['asin', fn('asin')]], ['cos', fn('cos'), 'fn', ['acos', fn('acos')]], ['tan', fn('tan'), 'fn', ['atan', fn('atan')]],
    ['ln', fn('ln'), 'fn', ['eˣ', () => insert('e^(')]], ['log', fn('log'), 'fn', ['10ˣ', () => insert('10^(')]],
    ['x²', () => insert('^2'), 'fn', ['x³', () => insert('^3')]], ['xʸ', () => insert('^'), 'fn', ['ʸ√x', () => insert('root(')]],
    ['√', () => insert('√'), 'fn', ['∛', fn('cbrt')]], ['n!', () => insert('!'), 'fn', ['nCr', fn('nCr')]], ['1/x', () => setExpr(`1/(${current() || '0'})`), 'fn', ['nPr', fn('nPr')]],
    ['(', () => insert('('), 'fn'], [')', () => insert(')'), 'fn'], ['π', () => insert('π'), 'fn', ['e', () => insert('e')]], ['%', () => insert('%'), 'fn', ['mod', fn('mod')]], ['AC', () => setExpr(''), 'clr'],
    ['7', () => insert('7')], ['8', () => insert('8')], ['9', () => insert('9')], ['÷', () => insert('÷'), 'op'], ['⌫', () => {
      const s = exprIn.selectionStart ?? exprIn.value.length;
      if (s > 0) { exprIn.value = exprIn.value.slice(0, s - 1) + exprIn.value.slice(s); exprIn.setSelectionRange(s - 1, s - 1); }
      justEvaluated = false; live();
    }, 'clr'],
    ['4', () => insert('4')], ['5', () => insert('5')], ['6', () => insert('6')], ['×', () => insert('×'), 'op'], ['−', () => insert('−'), 'op'],
    ['1', () => insert('1')], ['2', () => insert('2')], ['3', () => insert('3')], ['+', () => insert('+'), 'op'], ['Ans', () => insert('ans'), 'fn'],
    ['±', () => setExpr(negate(current()))], ['0', () => insert('0')], ['.', () => insert('.')], ['EXP', () => insert('e'), 'fn'], ['=', equals, 'eq'],
  ];
  const pad = h('div', { class: 'calc-pad' }, keys.map(([label, act, cls, sec]) => h('button', {
    type: 'button', class: ['calc-key', cls], 'data-first': label, 'data-second': sec ? sec[0] : label,
    onclick: () => { if (second && sec) { sec[1](); second = false; refresh(); } else act(); },
  }, label)));

  // typing on the keyboard after "=" behaves like the keys: a digit starts anew, an operator goes on from Ans
  exprIn.addEventListener('beforeinput', (e) => {
    const text = e.inputType === 'insertText' ? e.data : e.inputType === 'insertFromPaste' ? (e.dataTransfer?.getData('text/plain') ?? e.data) : null;
    if (!justEvaluated || !text) return;
    exprIn.value = startsOperand(text.trim()) ? '' : 'ans';
    exprIn.setSelectionRange(exprIn.value.length, exprIn.value.length);
  });
  exprIn.addEventListener('input', () => { justEvaluated = false; live(); });
  exprIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); }
    else if (e.key === 'Escape') setExpr('');
  });
  const resultText = () => {
    if (justEvaluated) return exprIn.value;
    const v = exprIn.value.trim(); if (!v) throw new Error('Nothing to copy yet');
    let r: number; try { r = evaluate(v, { ans }, { deg }); } catch { throw new Error('This expression has no result yet'); }
    if (Number.isNaN(r)) throw new Error('This expression has no real result');
    return fmtNum(r);
  };

  root.append(h('div', { class: 'calc-wrap' },
    card(null,
      h('div', { class: 'calc-display' }, h('div', { class: 'calc-inds' }, modeInd, memInd), exprIn, preview),
      pad),
    card('History', h('div', { class: 'row' }, button('Copy result', () => copy(resultText()), { small: true, icon: 'Copy' }), button('Clear history', () => { history.length = 0; renderHist(); }, { small: true, variant: 'ghost' })), histEl),
  ));
  // PC only (owner request): the bc console sits in this tab, beside the keypad calculator
  const bc = ctx.isMobile ? null : bcConsole();
  if (bc) root.append(bc.el);
  refresh();
  if (!ctx.isMobile) exprIn.focus();
  return () => bc?.dispose();
};
