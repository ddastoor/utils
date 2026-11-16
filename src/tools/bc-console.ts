// bc console (PC, inside the Scientific Calculator tab — owner request): BusyBox's bc (Gavin Howard's arbitrary-
// precision bc with the -l maths library) from our own BusyBox WebAssembly build, run in the terminal worker.
// bc keeps variables and functions across lines: each Enter replays the session and shows only the new output.
import { h, card, button, clear, copy } from '../ui';

export function bcConsole() {
  const worker = new Worker(new URL('../workers/terminal.worker.ts', import.meta.url), { type: 'module' });
  let seq = 0, prevOut = '', busy = false;
  const lines: string[] = [], hist: string[] = [];
  let hpos = 0;
  const pend = new Map<number, (r: any) => void>();
  worker.onmessage = (e) => { if (e.data.type === 'reply') { pend.get(e.data.id)?.(e.data); pend.delete(e.data.id); } };
  const call = (op: string, data: any) => new Promise<any>((res) => { const id = ++seq; pend.set(id, res); worker.postMessage({ id, op, ...data }); });
  const out = h('pre', { class: 'bc-out', 'aria-live': 'polite', 'aria-label': 'bc output' });
  const inp = h('input', { class: 'input mono bc-in', 'aria-label': 'bc input', placeholder: 'e.g.  scale=50; 4*a(1)    or    2^256', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const add = (cls: string, text: string) => { out.append(h('div', { class: cls }, text)); out.scrollTop = out.scrollHeight; };
  const run = async (src: string) => {
    if (busy || !src.trim()) return;
    busy = true; inp.disabled = true;
    hist.push(src); hpos = hist.length;
    add('bc-q', `> ${src}`);
    const session = [...lines, src].join('\n');
    const r = await call('capture', { line: `bc -lq <<'__SUPERTOOLS_BC__'\n${session}\n__SUPERTOOLS_BC__` });
    const full = r.out as string;
    const fresh = full.startsWith(prevOut) ? full.slice(prevOut.length) : full;
    const errText = (r.err as string).trim();
    if (errText && !/^\s*$/.test(errText)) { add('bc-err', errText.split('\n').slice(-3).join('\n')); }
    else { lines.push(src); prevOut = full; if (lines.length > 500) lines.shift(); }
    if (fresh.trim()) add('bc-a', fresh.replace(/\\\n/g, '').replace(/\n$/, ''));
    busy = false; inp.disabled = false; inp.focus();
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = inp.value; inp.value = ''; run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) inp.value = hist[--hpos]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hpos < hist.length - 1) inp.value = hist[++hpos]; else { hpos = hist.length; inp.value = ''; } }
  });
  const el = card('bc console (arbitrary precision)',
    h('p', { class: 'muted small' }, 'GNU-style bc from our BusyBox WebAssembly build, with the maths library: s(x) c(x) a(x) l(x) e(x) sqrt(x), scale=, ibase/obase, variables, define f(x) { … }.'),
    out, inp,
    h('div', { class: 'row' }, button('Copy last answer', () => copy((out.querySelector('.bc-a:last-of-type')?.textContent) || ''), { small: true, icon: 'Copy' }),
      button('Clear session', () => { lines.length = 0; prevOut = ''; clear(out); inp.focus(); }, { small: true, variant: 'ghost', icon: 'Eraser' })));
  return { el, dispose: () => worker.terminate() };
}
