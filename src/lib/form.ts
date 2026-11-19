// Declarative "inputs → live results" helper used by the many small calculators.
import { h, card, field, input, select, segmented, clear, stack, copy, type Child } from '../ui';
import { roundDec } from './round';
export { roundDec };

/** a field that is shown only while this holds (it keeps its value while hidden) */
type Show = (v: Record<string, any>) => boolean;
export type FieldDef =
  | { key: string; label: string; type?: 'number'; value: number; unit?: string | ((v: Record<string, any>) => string); step?: number; min?: number; max?: number; hint?: string; show?: Show }
  | { key: string; label: string; type: 'text'; value: string; placeholder?: string; hint?: string; show?: Show }
  | { key: string; label: string; type: 'date'; value: string; hint?: string; show?: Show }
  | { key: string; label: string; type: 'time'; value: string; hint?: string; show?: Show }
  | { key: string; label: string; type: 'select'; value: string; options: Array<[string, string]>; hint?: string; show?: Show }
  | { key: string; label: string; type: 'seg'; value: string; options: Array<[string, string]>; hint?: string; show?: Show };

export interface Result {
  big?: Array<[label: string, value: string]>;
  rows?: Array<[label: string, value: string]>;
  extra?: Child;
  error?: string;
  /** lines that explain how the input was read ("counted as 240 monthly instalments") */
  notes?: string[];
}

/** Builds a responsive form; recomputes on every input. Returns `refresh` for programmatic updates. */
export function calcForm(root: HTMLElement, fields: FieldDef[], compute: (v: Record<string, any>) => Result, opts: { title?: string; cols?: number } = {}) {
  const values: Record<string, any> = {};
  const out = h('div', { class: 'calc-result' });
  const live: Array<() => void> = []; // units and fields that follow the other fields
  const run = () => {
    for (const f of live) f();
    let r: Result;
    try { r = compute(values); } catch (e: any) { r = { error: e.message }; }
    // a result is rebuilt on every keystroke: what the reader had unfolded (a schedule) stays unfolded
    const open = [...out.querySelectorAll('details')].map((d) => d.open);
    clear(out);
    if (r.error) { out.append(h('div', { class: 'note note-warn' }, r.error)); return; }
    if (r.big?.length) out.append(h('div', { class: 'big-results' }, r.big.map(([l, v]) => h('button', { class: 'big-result', type: 'button', title: 'Copy', onclick: () => copy(v) }, h('span', { class: 'big-label' }, l), h('span', { class: 'big-value' }, v)))));
    if (r.rows?.length) out.append(h('div', { class: 'kv' }, r.rows.flatMap(([l, v]) => [h('span', null, l), h('span', null, v)])));
    if (r.notes?.length) out.append(...r.notes.map((n) => h('div', { class: 'note calc-note' }, n)));
    if (r.extra) out.append(h('div', { class: 'calc-extra' }, r.extra as any));
    out.querySelectorAll('details').forEach((d, i) => { if (open[i]) d.open = true; });
  };
  const controls = fields.map((f) => {
    values[f.key] = f.value;
    const set = (v: any) => { values[f.key] = v; run(); };
    let ctl: Node;
    if (f.type === 'select') ctl = select(f.options, f.value, set);
    else if (f.type === 'seg') ctl = segmented(f.options, f.value, set);
    else if (f.type === 'text') ctl = input({ value: f.value, placeholder: f.placeholder, onInput: set });
    else if (f.type === 'date' || f.type === 'time') { const inp = input({ type: f.type, value: f.value, onInput: set }); if (f.type === 'date') { inp.min = '0001-01-01'; inp.max = '9999-12-31'; } ctl = inp; }
    else {
      const inp = input({ type: 'number', value: f.value, step: f.step ?? 'any', min: f.min, max: f.max, onInput: (v) => set(v === '' ? NaN : parseFloat(v)) });
      const unit = f.unit, tag = unit ? h('span', { class: 'unit' }, typeof unit === 'string' ? unit : unit(values)) : null;
      if (tag && typeof unit === 'function') live.push(() => { tag.textContent = unit(values); });
      ctl = tag ? h('div', { class: 'with-unit' }, inp, tag) : inp;
    }
    const el = field(f.label, ctl, (f as any).hint), show = f.show;
    if (show) live.push(() => { el.hidden = !show(values); });
    return el;
  });
  root.append(card(opts.title || null, stack(h('div', { class: 'form-grid' }, controls))), card('Result', out));
  run();
  return { values, refresh: run };
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const intl = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
/** Indian digit grouping (12,34,567.89) */
/** −0 and amounts that round to 0 print as "₹0"; a negative amount prints as "−₹1,234" */
/** an amount with paise shows both digits: ₹12.10, never ₹12.1 */
export const fmtINR = (n: number, cur = true) => {
  if (!isFinite(n)) return '—';
  const s = inr.format(roundDec(Math.abs(n), 2)).replace(/\.\d$/, (m) => m + '0'), neg = n < 0 && /[1-9]/.test(s);
  return `${neg ? '−' : ''}${cur ? '₹' : ''}${s}`;
};
export const fmtN = (n: number, d = 2) => (isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(roundDec(n, d)) : '—');
export const fmtIntl = (n: number) => (isFinite(n) ? intl.format(roundDec(n, 2)) : '—');
export const need = (...xs: number[]) => { if (xs.some((x) => !isFinite(x))) throw new Error('Fill in all the numbers.'); };
/** today's date where the reader is, as yyyy-mm-dd (the UTC date is yesterday's in India until 05:30) */
export const today = () => { const n = new Date(); return `${String(n.getFullYear()).padStart(4, '0')}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
