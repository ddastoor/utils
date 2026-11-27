// bc console (PC, inside the Scientific Calculator tab — owner request): BusyBox's bc (Gavin Howard's arbitrary-
// precision bc with the -l maths library) from our own BusyBox WebAssembly build, run in the terminal worker.
// bc keeps variables and functions across lines: each Enter replays the session and shows only the new output.
// Every number printed gets a name — A … Z, AA … ZZ, as Excel names columns (to-do #10, owner, 21 Nov 2026) — shown at
// the end of its row and used later as $A; `$name = …` names one yourself; a $ name keeps its value (src/lib/bcvars.ts).
// bc's own variables are $ names too (to-do #25): after interest = 20.78, $interest is what bc holds in interest.
import { h, card, button, clear, copy } from '../ui';
import { trackWorker } from '../lifecycle';
import { BcVars, isBcNumber } from '../lib/bcvars';
import './bc-console.css';

export function bcConsole() {
  // BusyBox (≈ 0.5 MB) loads on the first Enter, not when the calculator opens
  let worker: Worker | null = null;
  const getWorker = () => {
    if (!worker) {
      worker = trackWorker(new Worker(new URL('../workers/terminal.worker.ts', import.meta.url), { type: 'module' }), 'bc-worker', () => { worker = null; for (const r of pend.values()) r({ out: '', err: 'bc stopped' }); pend.clear(); });
      worker.onmessage = (e) => { if (e.data.type === 'reply') { pend.get(e.data.id)?.(e.data); pend.delete(e.data.id); } };
    }
    return worker;
  };
  let seq = 0, prevOut = '', busy = false;
  const lines: string[] = [], hist: string[] = [];
  let hpos = 0;
  const pend = new Map<number, (r: any) => void>();
  const call = (op: string, data: any) => new Promise<any>((res) => { const id = ++seq; pend.set(id, res); getWorker().postMessage({ id, op, ...data }); });
  const out = h('pre', { class: 'bc-out', role: 'log', 'aria-live': 'polite', 'aria-label': 'bc output' });
  const inp = h('input', { class: 'input mono bc-in', 'aria-label': 'bc input', placeholder: 'e.g.  scale=50; 4*a(1)    or    2^256', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const vars = new BcVars();
  const add = (cls: string, text: string) => { out.append(h('div', { class: cls }, text)); out.scrollTop = out.scrollHeight; };
  /** Puts $name into the input where the cursor is. */
  const insert = (name: string) => {
    const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a, t = `$${name}`;
    inp.value = inp.value.slice(0, a) + t + inp.value.slice(b);
    inp.focus(); inp.setSelectionRange(a + t.length, a + t.length);
  };
  const answer = (row: string, name?: string) => {
    out.append(h('div', { class: 'bc-a' }, h('span', { class: 'bc-v' }, row),
      name ? h('button', { class: 'bc-var', type: 'button', title: `$${name} — click to use it in the next line`, 'aria-label': `Use $${name}`, onclick: () => insert(name) }, `$${name}`) : null));
    out.scrollTop = out.scrollHeight;
  };
  const run = async (src: string) => {
    if (busy || !src.trim()) return;
    busy = true; inp.disabled = true;
    hist.push(src); hpos = hist.length;
    add('bc-q', `> ${src}`);
    const prep = vars.prepare(src);
    if (prep.error) { add('bc-err', prep.error); busy = false; inp.disabled = false; inp.focus(); return; }
    if (prep.note) add('bc-note', prep.note);
    const session = [...lines, prep.line].join('\n');
    const r = await call('capture', { line: `bc -lq <<'__SUPERUTILS_BC__'\n${session}\n__SUPERUTILS_BC__` });
    const full = r.out as string;
    const fresh = full.startsWith(prevOut) ? full.slice(prevOut.length) : full;
    const errText = (r.err as string).trim();
    if (errText && !/^\s*$/.test(errText)) { add('bc-err', errText.split('\n').slice(-3).join('\n')); }
    else { lines.push(prep.line); prevOut = full; vars.learn(prep.sets); if (lines.length > 500) lines.shift(); }
    // one row a printed line (bc breaks long numbers with a backslash); each number gets a name — the first one the
    // user's own for $name = …
    let own = prep.own;
    if (fresh.trim()) {
      for (const row of fresh.replace(/\\\n/g, '').replace(/\n$/, '').split('\n')) {
        const v = row.trim();
        if (isBcNumber(v)) { answer(row, vars.assign(v, own)); own = undefined; } else answer(row);
      }
    }
    if (own && !errText) add('bc-err', `$${own} = … gave no number to name`);
    busy = false; inp.disabled = false; inp.focus();
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = inp.value; inp.value = ''; run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) inp.value = hist[--hpos]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hpos < hist.length - 1) inp.value = hist[++hpos]; else { hpos = hist.length; inp.value = ''; } }
  });
  const el = card('bc console (arbitrary precision)',
    h('p', { class: 'muted small' }, 'GNU-style bc from our BusyBox WebAssembly build, with the maths library: s(x) c(x) a(x) l(x) e(x) sqrt(x), scale=, ibase/obase, variables, define f(x) { … }.'),
    h('p', { class: 'muted small' }, 'Every result gets a name — A, B … Z, AA … — at the end of its row: use it in a later line as $A ($a is the same). $total = 7 * 6 names a result yourself. A $ name keeps its value: it cannot be set again. It stands for the number as bc printed it.'),
    h('p', { class: 'muted small' }, 'bc\'s own variables are $ names too: after interest = 20.78, $interest is what interest holds at that point (a later interest = 21 is seen); scale, ibase and obase as well. Where a result has the same name ($a and a), $a is the result — bc\'s variable is a, without the $.'),
    out, inp,
    h('div', { class: 'row' }, button('Copy last answer', () => copy([...out.querySelectorAll('.bc-a .bc-v')].pop()?.textContent || ''), { small: true, icon: 'Copy' }),
      button('Clear session', () => { lines.length = 0; prevOut = ''; vars.clear(); clear(out); inp.focus(); }, { small: true, variant: 'ghost', icon: 'Eraser' })));
  return { el, dispose: () => { worker?.terminate(); worker = null; } };
}
