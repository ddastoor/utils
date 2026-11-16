// Tiny DOM toolkit shared by every tool. No framework.
import { icon } from './icons';

export type Cleanup = () => void;
export interface ToolCtx { isMobile: boolean; signal: AbortSignal }
export type Mount = (root: HTMLElement, ctx: ToolCtx) => void | Cleanup | Promise<void | Cleanup>;

export type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any>;

function append(el: Node, c: Child) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { c.forEach((x) => append(el, x)); return; }
  el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
}

/** h('div', {class: 'x', onclick: fn}, 'text', child) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement;
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v; // only ever used with our own static markup (icons)
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') (el as any)[k] = v;
      else if (k === 'value' || k === 'checked') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  children.forEach((c) => append(el, c));
  return el;
}

/** Attach accessors/methods to an element (Object.assign would flatten getters into plain values). */
export function extend<E extends object, X extends object>(el: E, extra: X): E & X {
  Object.defineProperties(el, Object.getOwnPropertyDescriptors(extra));
  return el as E & X;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
export const clear = (el: Element) => { el.replaceChildren(); return el; };
export const ic = (name: string, cls = '') => h('span', { class: `ic ${cls}`, 'aria-hidden': 'true', html: icon(name) });

// ------------------------------------------------------------------ layout

export const card = (title: string | null, ...children: Child[]) =>
  h('section', { class: 'card' }, title ? h('h3', { class: 'card-title' }, title) : null, ...children);
export const row = (...children: Child[]) => h('div', { class: 'row' }, ...children);
export const stack = (...children: Child[]) => h('div', { class: 'stack' }, ...children);
export const grid2 = (...children: Child[]) => h('div', { class: 'grid2' }, ...children);
export const note = (text: Child, kind: 'info' | 'warn' | 'ok' | 'err' = 'info') =>
  h('div', { class: `note note-${kind}` }, ic(kind === 'warn' || kind === 'err' ? 'TriangleAlert' : kind === 'ok' ? 'CircleCheck' : 'Info'), h('div', null, text));
/** Two-pane tool layout: controls left, preview right (stacked on phones). */
export const split = (left: Child, right: Child) => h('div', { class: 'split' }, h('div', { class: 'split-a' }, left), h('div', { class: 'split-b' }, right));
/** Sticky bottom action bar on phones, normal row on desktop. */
export const actions = (...children: Child[]) => h('div', { class: 'actions' }, ...children);

// ------------------------------------------------------------------ controls

export interface BtnOpts { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: string; small?: boolean; disabled?: boolean; title?: string; type?: string }
export function button(label: string, onClick: (e: MouseEvent) => any, o: BtnOpts = {}) {
  const b = h('button', {
    type: o.type || 'button',
    class: ['btn', `btn-${o.variant || 'secondary'}`, o.small && 'btn-sm', !label && 'btn-icon'],
    title: o.title || (label ? null : o.icon), 'aria-label': label || o.title || o.icon,
    disabled: o.disabled,
  }, o.icon ? ic(o.icon) : null, label ? h('span', null, label) : null);
  extend(b, {
    setLabel(text: string) {
      const span = b.querySelector(':scope > span:not(.ic)');
      if (span) span.textContent = text;
      b.setAttribute('aria-label', text);
    },
  });
  b.addEventListener('click', async (e) => {
    if (b.classList.contains('busy')) return;
    let r: any;
    try { r = onClick(e); } catch (err) { toast(errMsg(err), 'err'); console.error(err); return; } // synchronous handlers report like async ones
    if (r && typeof r.then === 'function') {
      b.classList.add('busy'); b.disabled = true;
      try { await r; } catch (err) { toast(errMsg(err), 'err'); console.error(err); } finally { b.classList.remove('busy'); b.disabled = false; }
    }
  });
  return b as HTMLButtonElement & { setLabel(text: string): void };
}

export function field(label: string, control: Node, hint?: Child) {
  // Only real form controls go inside <label>; wrapping buttons would steal their names and clicks.
  const native = control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement;
  const tag = native ? 'label' : 'div';
  return h(tag, { class: 'field', role: native ? null : 'group', 'aria-label': native ? null : label },
    h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function input(o: { type?: string; value?: string | number; placeholder?: string; min?: number; max?: number; step?: number | string; onInput?: (v: string, el: HTMLInputElement) => void; onChange?: (v: string, el: HTMLInputElement) => void; attrs?: Props } = {}) {
  const el = h('input', { class: 'input', type: o.type || 'text', placeholder: o.placeholder, min: o.min, max: o.max, step: o.step, ...(o.attrs || {}) });
  if (o.value != null) el.value = String(o.value);
  if (o.type === 'number') el.inputMode = 'decimal';
  if (o.onInput) el.addEventListener('input', () => o.onInput!(el.value, el));
  if (o.onChange) el.addEventListener('change', () => o.onChange!(el.value, el));
  return el;
}

export function textarea(o: { value?: string; placeholder?: string; rows?: number; readonly?: boolean; mono?: boolean; onInput?: (v: string) => void } = {}) {
  const el = h('textarea', { class: ['input', 'textarea', o.mono && 'mono'], rows: o.rows || 6, placeholder: o.placeholder, spellcheck: 'false' });
  if (o.readonly) el.readOnly = true;
  if (o.value != null) el.value = o.value;
  if (o.onInput) el.addEventListener('input', () => o.onInput!(el.value));
  return el;
}

export function select<T extends string>(options: Array<[T, string]>, value: T, onChange?: (v: T) => void) {
  const el = h('select', { class: 'input select' }, options.map(([v, l]) => h('option', { value: v }, l)));
  el.value = value;
  if (onChange) el.addEventListener('change', () => onChange(el.value as T));
  return el;
}

export function toggle(label: string, checked: boolean, onChange?: (v: boolean) => void) {
  const cb = h('input', { type: 'checkbox', class: 'switch-input' });
  cb.checked = checked;
  if (onChange) cb.addEventListener('change', () => onChange(cb.checked));
  const el = h('label', { class: 'switch' }, cb, h('span', { class: 'switch-track' }), h('span', { class: 'switch-label' }, label));
  return extend(el, { get checked() { return cb.checked; }, set checked(v: boolean) { cb.checked = v; } });
}

/** Choice chips (a radio group) — for options inside a tool. */
export function segmented<T extends string>(options: Array<[T, string]>, value: T, onChange?: (v: T) => void) {
  let cur = value;
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  const render = () => {
    el.replaceChildren(...options.map(([v, l]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(v === cur), class: ['seg-btn', v === cur && 'on'],
      onclick: () => { if (cur === v) return; cur = v; render(); onChange?.(v); },
    }, l)));
  };
  render();
  return extend(el, { get value() { return cur; }, set value(v: T) { cur = v; render(); } });
}

export function slider(o: { label: string; min: number; max: number; step?: number; value: number; unit?: string; fmt?: (v: number) => string; onInput?: (v: number) => void; onChange?: (v: number) => void }) {
  const fmt = o.fmt || ((v: number) => `${+v.toFixed(2)}${o.unit || ''}`);
  const out = h('output', { class: 'slider-val' }, fmt(o.value));
  const r = h('input', { type: 'range', class: 'range', min: o.min, max: o.max, step: o.step ?? 1 });
  r.value = String(o.value);
  r.addEventListener('input', () => { out.textContent = fmt(+r.value); o.onInput?.(+r.value); });
  r.addEventListener('change', () => o.onChange?.(+r.value));
  const reset = () => { r.value = String(o.value); out.textContent = fmt(o.value); o.onInput?.(o.value); o.onChange?.(o.value); };
  out.addEventListener('dblclick', reset);
  const el = h('div', { class: 'slider' }, h('div', { class: 'slider-head' }, h('span', null, o.label), out), r);
  return extend(el, {
    get value() { return +r.value; },
    set value(v: number) { r.value = String(v); out.textContent = fmt(v); },
    reset,
  });
}

export function progress() {
  const bar = h('div', { class: 'progress-bar' });
  const label = h('div', { class: 'progress-label' });
  const el = h('div', { class: 'progress', hidden: true }, h('div', { class: 'progress-track' }, bar), label);
  return extend(el, {
    set(frac: number | null, text = '') {
      el.hidden = false;
      el.classList.toggle('indeterminate', frac == null);
      bar.style.width = frac == null ? '30%' : `${Math.max(0, Math.min(1, frac)) * 100}%`;
      label.textContent = text;
    },
    done() { el.hidden = true; },
  });
}

/** Read-only output with copy button. */
export function outputBox(o: { rows?: number; mono?: boolean; placeholder?: string } = {}) {
  const ta = textarea({ rows: o.rows || 6, readonly: true, mono: o.mono, placeholder: o.placeholder });
  const el = h('div', { class: 'outbox' }, ta, button('', () => copy(ta.value), { icon: 'Copy', small: true, title: 'Copy' }));
  return extend(el, { get value() { return ta.value; }, set value(v: string) { ta.value = v; }, ta });
}

// ------------------------------------------------------------------ files

export interface PickOpts { accept?: string; multiple?: boolean; label?: string; hint?: string; capture?: 'user' | 'environment'; onFiles: (files: File[]) => void | Promise<unknown>; compact?: boolean }
export function filePicker(o: PickOpts) {
  const inp = h('input', { type: 'file', accept: o.accept, multiple: o.multiple, hidden: true });
  if (o.capture) inp.setAttribute('capture', o.capture);
  // errors from the handler (sync or async) are shown like a button's, not left as uncaught page errors
  const call = (fs: File[]) => { try { const r = o.onFiles(fs); if (r && typeof (r as any).then === 'function') (r as Promise<unknown>).catch((err) => { toast(errMsg(err), 'err'); console.error(err); }); } catch (err) { toast(errMsg(err), 'err'); console.error(err); } };
  inp.addEventListener('change', () => { if (inp.files?.length) call([...inp.files]); inp.value = ''; });
  const el = h('div', { class: ['drop', o.compact && 'drop-compact'], tabindex: '0', role: 'button' },
    ic('Upload', 'drop-ic'),
    h('div', { class: 'drop-text' }, h('strong', null, o.label || (o.multiple ? 'Choose files' : 'Choose a file')), h('span', { class: 'drop-hint' }, o.hint || 'or drop here')),
    inp);
  el.addEventListener('click', () => inp.click());
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); el.classList.remove('over');
    const fs = [...(e.dataTransfer?.files || [])];
    if (fs.length) call(o.multiple ? fs : fs.slice(0, 1));
  });
  return extend(el, { open: () => inp.click() });
}

/** Opens the system file chooser directly (for "Add more" buttons). */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept, multiple, hidden: true });
    inp.addEventListener('change', () => resolve([...(inp.files || [])]));
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => inp.remove(), 60_000);
  });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const canShareFiles = (files: File[]) => !!(navigator.canShare && navigator.canShare({ files }));
/** On phones: share sheet (lets iPhone users "Save Image" to Photos). Falls back to download. */
export async function shareOrDownload(blob: Blob, name: string) {
  const f = new File([blob], name, { type: blob.type });
  if (canShareFiles([f])) {
    try { await navigator.share({ files: [f] }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
  }
  downloadBlob(blob, name);
}

/** Download button + (on phones that support it) Share button. */
export function saveButtons(get: () => Blob | Promise<Blob>, name: () => string, label = 'Download') {
  const els: HTMLElement[] = [button(label, async () => downloadBlob(await get(), name()), { variant: 'primary', icon: 'Download' })];
  if ('share' in navigator && 'canShare' in navigator && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    els.push(button('Share', async () => shareOrDownload(await get(), name()), { icon: 'Share2' }));
  }
  return els;
}

export const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
export const extOf = (name: string) => (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
export const readBytes = async (f: Blob) => new Uint8Array(await f.arrayBuffer());

export function fmtBytes(n: number) {
  if (!isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${i ? n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) : n} ${u[i]}`;
}
export function fmtTime(sec: number, ms = false) {
  const s = Math.max(0, sec);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  const frac = ms ? '.' + String(Math.floor((s % 1) * 100)).padStart(2, '0') : '';
  return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm}`) + `:${String(ss).padStart(2, '0')}${frac}`;
}

// ------------------------------------------------------------------ feedback

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = text;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied');
  }
}

let toastHost: HTMLElement | null = null;
export function toast(msg: string, kind: 'ok' | 'err' | 'info' = 'info', ms = 2600) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(toastHost); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  toastHost.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? Math.max(ms, 5000) : ms);
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong');

// ------------------------------------------------------------------ images

/** Decode an image file honouring EXIF orientation. */
export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as any); }
  catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally { URL.revokeObjectURL(url); }
  }
}

/** RGBA pixels of a bitmap, optionally scaled so the long side <= maxSide. */
export function bitmapToImageData(bmp: CanvasImageSource & { width: number; height: number }, maxSide = Infinity): ImageData {
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), hgt = Math.max(1, Math.round(bmp.height * s));
  const c = new OffscreenCanvas(w, hgt);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, hgt);
  return g.getImageData(0, 0, w, hgt);
}

export function imageDataToCanvas(img: ImageData, canvas?: HTMLCanvasElement) {
  const c = canvas || h('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

export async function canvasToBlob(c: HTMLCanvasElement | OffscreenCanvas, type = 'image/png', quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return (c as OffscreenCanvas).convertToBlob({ type, quality });
  return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed'))), type, quality));
}

/** Keeps a tool's long-running work cancellable when the user switches tabs. */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const raf = () => new Promise((r) => requestAnimationFrame(() => r(null)));
