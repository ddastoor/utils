// Small shared UI pieces for the Software tabs.
import { h, clear, note } from '../../ui';
export const kvRows = (rows: Array<[string, string | Node | null | undefined]>) =>
  h('div', { class: 'kv' }, rows.filter(([, v]) => v != null && v !== '').flatMap(([k, v]) => [h('span', null, k), h('span', { class: 'mono' }, v as any)]));
/** Run `f`, put its result (or the error as a warning) into `box`. */
export function show(box: HTMLElement, f: () => Node | Node[] | null) {
  try { const r = f(); clear(box); if (r) box.append(...(Array.isArray(r) ? r : [r])); }
  catch (e: any) { clear(box).append(note(e?.message || String(e), 'warn')); }
}
export const table = (head: string[], rows: Array<Array<string | Node>>, cls = 'tbl') =>
  h('div', { class: 'scroll-x' }, h('table', { class: cls }, h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', { class: 'mono' }, c)))))));
export const debounce = <A extends any[]>(f: (...a: A) => void, ms = 150) => { let t: any; return Object.assign((...a: A) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }, { cancel: () => clearTimeout(t) }); };
