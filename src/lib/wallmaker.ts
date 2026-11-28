// The wallpaper maker of the Wallpapers and NASA Image Explorer tabs: a picture opened in a dialog, a crop of the screen's shape on the
// subject (faces by BlazeFace, else the busiest part — imgproc.wasm's p_busy_window), moved and zoomed by hand, and saved at the screen's
// exact pixels — cut from a rendition wide enough (`renditionFor` in ./wallpapers), resized by Squoosh's Lanczos (the codec worker), a
// MozJPEG with the credit in its comment. And the services' fetches both tabs share (a refusal said in words). The pictures are read as
// bytes (CORS) and shown from blob: addresses — the CSP's img-src stays the site's own.
import { h, button, input, slider, clear, field, shareOrDownload, downloadBlob, fmtBytes } from '../ui';
import { isMobile } from '../platform';
import * as W from './wallpapers';
import type { Pic, Screen, Box } from './wallpapers';
import { loadImg, resizeImg, encodeImg } from './imgio';
import { imgproc, imgprocDirect, type Img } from '../wasm/imgproc';
import './wallmaker.css';

/** the screen chosen, kept while the page is open (both tabs) */
let screenId = 'this';
const custom = { w: 1920, h: 1080 };

export class BusyError extends Error {}
const serviceOf = (url: string) => (/wikimedia|wikipedia/.test(url) ? 'Wikimedia' : /metmuseum/.test(url) ? 'The Met' : /artic\.edu/.test(url) ? 'The Art Institute of Chicago' : /nasa/.test(url) ? 'NASA' : 'The service');
/** a service's JSON (null: not found; a refusal said in words — Wikimedia limits how often it is asked) */
export async function getJson(url: string, signal: AbortSignal): Promise<any> {
  const name = serviceOf(url);
  let r: Response;
  try { r = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (e) { if (signal.aborted) throw e; throw new Error(`${name} could not be reached — no connection, or it is down.`); }
  if (r.status === 429) throw new BusyError(`${name} is busy — it limits how often it is asked. Try again in a minute.`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${name} answered HTTP ${r.status}.`);
  try { return await r.json(); } catch { throw new Error(`${name} sent an answer that could not be read.`); }
}
/** a file's bytes, with progress */
export async function getBlob(url: string, signal: AbortSignal, progress?: (got: number, total: number) => void): Promise<Blob> {
  let r: Response;
  try { r = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (e) { if (signal.aborted) throw e; throw new Error('The picture could not be fetched — no connection, or its server refused.'); }
  if (r.status === 429) throw new BusyError('The picture\'s server is busy — it limits how often it is asked. Try again in a minute.');
  if (!r.ok || !r.body) throw new Error(`The picture's server answered HTTP ${r.status}.`);
  const total = Number(r.headers.get('content-length')) || 0, rd = r.body.getReader(), parts: Uint8Array[] = [];
  let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; progress?.(got, total); }
  return new Blob(parts as BlobPart[], { type: r.headers.get('content-type') || 'image/jpeg' });
}

/** blob: addresses of a tab, let go when it is left */
export function blobUrls() {
  const urls = new Set<string>();
  return {
    make(b: Blob) { const u = URL.createObjectURL(b); urls.add(u); return u; },
    free(u: string) { if (urls.delete(u)) URL.revokeObjectURL(u); },
    freeAll() { for (const u of urls) URL.revokeObjectURL(u); urls.clear(); },
  };
}

/** thumbnails fetched as they come into view, six at a time, shown from blob: addresses (a cache for the tab's visit) */
export function thumbLoader(urls: ReturnType<typeof blobUrls>, signal: AbortSignal, gone: () => boolean, fetchUrl: (u: string) => string = (u) => u) {
  const cache = new Map<string, string>();
  let active = 0; const waiting: Array<() => void> = [];
  async function show(img: HTMLImageElement) {
    const src = img.dataset.src!;
    const box = img.closest('.wp-tile, .wp-pick');
    if (cache.has(src)) { img.src = cache.get(src)!; box?.classList.remove('wp-loading'); return; }
    if (active >= 6) await new Promise<void>((r) => waiting.push(r));
    active++;
    try { const b = await getBlob(fetchUrl(src), signal); if (gone()) return; const u = urls.make(b); cache.set(src, u); img.src = u; box?.classList.remove('wp-loading'); }
    catch { if (!gone()) box?.classList.add('wp-noimg'); }
    finally { active--; waiting.shift()?.(); }
  }
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); void show(e.target as HTMLImageElement); } }, { rootMargin: '300px' });
  return {
    img(src: string, alt = '') { const im = h('img', { alt, 'data-src': src, decoding: 'async' }); io.observe(im); return im; },
    stop() { io.disconnect(); },
  };
}

/** the dialog a picture opens in: a title, the picture's side and the side for its details (full screen on phones) */
export function pictureDialog(onClose: () => void) {
  const title = h('h2', { class: 'wp-dlg-title', id: `wp-dlg-title-${Math.random().toString(36).slice(2, 8)}` });
  const dlg = h('dialog', { class: 'wp-dlg', 'aria-labelledby': title.id });
  const left = h('div', { class: 'wp-dlg-pic' }), right = h('div', { class: 'wp-dlg-side' });
  const closeB = button('', () => dlg.close(), { icon: 'X', variant: 'ghost', title: 'Close' });
  dlg.append(h('div', { class: 'wp-dlg-head' }, title, closeB), h('div', { class: 'wp-dlg-body' }, left, right));
  document.body.append(dlg); // in the page's top layer; removed when the tab is left
  dlg.addEventListener('close', onClose);
  return {
    dlg, title, left, right,
    open() { if (!dlg.open) dlg.showModal(); },
    close() { if (dlg.open) dlg.close(); },
    remove() { if (dlg.open) dlg.close(); dlg.remove(); },
  };
}

export interface Maker {
  /** the picture with its crop, and the line under it */ picture: HTMLElement;
  /** the screen, the zoom, "Centre on the subject", Save and its status line */ controls: HTMLElement;
  /** show a picture: its preview fetched, the faces looked for, the crop placed */ load(p: Pic, signal: AbortSignal): Promise<void>;
  /** let the picture go (the dialog closed) */ clear(): void;
  status: HTMLElement;
}
/** the wallpaper maker (`urls`: the tab's blob: addresses; `fetchUrl`: where a picture's bytes are read — NASA's at its bucket) */
export function wallMaker(urls: ReturnType<typeof blobUrls>, gone: () => boolean, fetchUrl: (u: string) => string = (u) => u): Maker {
  const stage = h('div', { class: 'wp-stage' });
  const frameEl = h('div', { class: 'wp-frame', tabindex: '0', role: 'group', 'aria-label': 'The wallpaper’s crop — drag it, or move it with the arrow keys' });
  const pimg = h('img', { class: 'wp-pimg', alt: '' });
  stage.append(pimg, frameEl);
  const how = h('p', { class: 'small muted wp-how' });
  const status = h('p', { class: 'small wp-status', role: 'status', 'aria-live': 'polite' });
  const screenSel = h('select', { class: 'input select', 'aria-label': 'The screen it is for' });
  const cw = input({ type: 'number', value: custom.w, min: 100, max: W.MAX_SIDE, attrs: { 'aria-label': 'Width in pixels' } });
  const chh = input({ type: 'number', value: custom.h, min: 100, max: W.MAX_SIDE, attrs: { 'aria-label': 'Height in pixels' } });
  const customRow = h('div', { class: 'wp-custom' }, field('Width', cw), h('span', { 'aria-hidden': 'true' }, '×'), field('Height', chh));
  const zoom = slider({ label: 'Zoom', min: 100, max: 400, step: 5, value: 100, unit: ' %', onInput: (v) => { view.zoom = 100 / v; place(); } });
  const autoB = button('Centre on the subject', () => void findSubject(), { icon: 'Focus', small: true });
  const saveB = button('Save wallpaper', () => save(), { icon: 'Download', variant: 'primary' });
  const controls = h('div', { class: 'wp-maker' }, field('The screen it is for', screenSel), customRow, zoom, h('div', { class: 'row wp-btns' }, autoB), h('div', { class: 'actions wp-save' }, saveB), status);
  customRow.hidden = screenId !== 'custom';

  const fillScreens = () => {
    const me = W.screenOf(screen.width, screen.height, devicePixelRatio);
    clear(screenSel).append(h('option', { value: 'this' }, me.name), h('option', { value: 'turned' }, `This screen turned, ${me.h} × ${me.w}`),
      ...W.SCREENS.map((g) => h('optgroup', { label: g.group }, g.screens.map((s) => h('option', { value: s.id }, s.name)))), h('option', { value: 'custom' }, 'Another size…'));
    screenSel.value = screenId; if (screenSel.value !== screenId) screenSel.value = 'this';
  };
  const target = (): Screen => {
    const me = W.screenOf(screen.width, screen.height, devicePixelRatio);
    if (screenId === 'this') return me;
    if (screenId === 'turned') return { id: 'turned', name: '', w: me.h, h: me.w };
    if (screenId === 'custom') return { id: 'custom', name: '', w: custom.w, h: custom.h };
    return W.SCREENS.flatMap((g) => g.screens).find((s) => s.id === screenId) ?? me;
  };
  screenSel.addEventListener('change', () => { screenId = screenSel.value; customRow.hidden = screenId !== 'custom'; void findSubject(); });
  const sizeOk = (v: number) => Number.isInteger(v) && v >= 100 && v <= W.MAX_SIDE;
  for (const [el, k] of [[cw, 'w'], [chh, 'h']] as const) el.addEventListener('change', () => {
    const v = Number(el.value);
    if (!sizeOk(v)) { status.textContent = `A size of 100 to ${W.MAX_SIDE.toLocaleString()} pixels, in whole pixels.`; el.value = String(custom[k]); return; }
    custom[k] = v; void findSubject();
  });

  const view = { pic: null as Pic | null, url: '', pw: 0, ph: 0, img: null as Img | null, frame: { x: 0, y: 0, w: 0, h: 0 } as Box, cx: 0, cy: 0, zoom: 1, faces: [] as Box[], byHand: false };
  let signal: AbortSignal = AbortSignal.abort();
  const place = () => {
    if (!view.pw) return; // no picture yet
    const t = target();
    view.frame = W.frameAt(view.pw, view.ph, t.w, t.h, view.zoom, view.cx, view.cy);
    const f = view.frame;
    frameEl.style.left = `${(f.x / view.pw) * 100}%`; frameEl.style.top = `${(f.y / view.ph) * 100}%`;
    frameEl.style.width = `${(f.w / view.pw) * 100}%`; frameEl.style.height = `${(f.h / view.ph) * 100}%`;
    view.cx = f.x + f.w / 2; view.cy = f.y + f.h / 2; // kept inside the picture
  };
  async function findSubject() {
    if (!view.img) return;
    const t = target();
    view.byHand = false;
    if (view.faces.length) {
      const fr = W.frameOnFaces(view.pw, view.ph, t.w, t.h, view.faces);
      view.cx = fr.x + fr.w / 2; view.cy = fr.y + fr.h / 2;
      how.textContent = `The crop holds the ${view.faces.length === 1 ? 'face' : `${view.faces.length} faces`} found in the picture.`;
    } else {
      const fr = W.frameAt(view.pw, view.ph, t.w, t.h, view.zoom, view.pw / 2, view.ph / 2);
      const ip = await imgprocDirect();
      const b = ip.busyWindow(view.img, fr.w, fr.h);
      view.cx = b.x + fr.w / 2; view.cy = b.y + fr.h / 2;
      how.textContent = b.detail > 0 ? 'No face in the picture: the crop holds its busiest part — move it to taste.' : 'The crop is in the middle — move it to taste.';
    }
    place();
  }
  async function facesOf(p: Pic) {
    try {
      const { detectFaces } = await import('../tools/redact'); // BlazeFace on the whole picture and on tiles (the Blur & Redact tab's)
      const faces = await detectFaces(view.img!);
      if (gone() || view.pic !== p) return;
      view.faces = faces.map((f) => ({ x: f.x * view.pw, y: f.y * view.ph, w: f.w * view.pw, h: f.h * view.ph }));
    } catch { view.faces = []; /* no face finder (it could not be fetched): the busiest part */ }
    if (!view.byHand) await findSubject();
  }
  async function load(p: Pic, sig: AbortSignal) {
    signal = sig;
    view.pic = p; view.img = null; view.pw = 0; view.faces = []; view.zoom = 1; zoom.value = 100;
    fillScreens(); customRow.hidden = screenId !== 'custom';
    status.textContent = 'Fetching the picture…'; how.textContent = ''; saveB.disabled = true;
    try {
      const blob = await getBlob(fetchUrl(p.preview), signal);
      if (gone() || view.pic !== p) return;
      if (view.url) urls.free(view.url);
      view.url = urls.make(blob); pimg.src = view.url;
      const img = await loadImg(blob);
      if (gone() || view.pic !== p) return;
      view.img = img; view.pw = img.width; view.ph = img.height;
      stage.style.setProperty('--ar', String(img.width / img.height));
      status.textContent = '';
      saveB.disabled = false;
      view.cx = img.width / 2; view.cy = img.height / 2; place();
      await facesOf(p);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || gone()) return;
      status.textContent = (e as Error).message;
    }
  }
  // moving the crop: a drag, or the arrow keys (Shift: further); + and − zoom
  let drag: { id: number; x: number; y: number; cx: number; cy: number } | null = null;
  frameEl.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; frameEl.setPointerCapture(e.pointerId); e.preventDefault(); });
  frameEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const r = stage.getBoundingClientRect(), s = view.pw / r.width;
    view.cx = drag.cx + (e.clientX - drag.x) * s; view.cy = drag.cy + (e.clientY - drag.y) * s; view.byHand = true; place();
    how.textContent = 'The crop where you put it.';
  });
  const endDrag = () => { drag = null; };
  frameEl.addEventListener('pointerup', endDrag); frameEl.addEventListener('pointercancel', endDrag);
  frameEl.addEventListener('keydown', (e) => {
    const step = (e.shiftKey ? 0.1 : 0.02) * Math.max(view.pw, view.ph);
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (d[e.key]) { e.preventDefault(); view.cx += d[e.key][0]; view.cy += d[e.key][1]; view.byHand = true; place(); how.textContent = 'The crop where you put it.'; }
    else if (e.key === '+' || e.key === '=' || e.key === '-') { e.preventDefault(); zoom.value = Math.min(400, Math.max(100, zoom.value + (e.key === '-' ? -25 : 25))); view.zoom = 100 / zoom.value; place(); }
  });

  async function save() {
    const p = view.pic; if (!p || !view.img) return;
    const t = target(), f = view.frame;
    if (!sizeOk(t.w) || !sizeOk(t.h)) { status.textContent = `The screen's size must be 100 to ${W.MAX_SIDE.toLocaleString()} pixels a side.`; return; }
    saveB.disabled = true;
    try {
      // a rendition wide enough for the crop to give the screen's pixels (the preview when it is)
      const need = W.neededWidth(f, view.pw, t.w);
      const src = need > view.pw ? W.renditionFor(p, need) : p.preview;
      let img: Img = view.img, rw = view.pw;
      if (src !== p.preview) {
        status.textContent = 'Fetching the picture in full…';
        const blob = await getBlob(fetchUrl(src), signal, (got, total) => { status.textContent = total ? `Fetching the picture in full — ${fmtBytes(got)} of ${fmtBytes(total)}…` : `Fetching the picture in full — ${fmtBytes(got)}…`; });
        status.textContent = 'Reading the picture…';
        img = await loadImg(blob); rw = img.width;
      }
      const s = rw / view.pw;
      const box = { x: Math.round(f.x * s), y: Math.round(f.y * s), w: Math.max(1, Math.round(f.w * s)), h: Math.max(1, Math.round(f.h * s)) };
      box.w = Math.min(box.w, img.width - box.x); box.h = Math.min(box.h, img.height - box.y);
      status.textContent = `Making the wallpaper, ${t.w.toLocaleString()} × ${t.h.toLocaleString()}…`;
      const cut = await imgproc('crop', img, box.x, box.y, box.w, box.h);
      const out = await resizeImg(cut, t.w, t.h);
      const jpeg = await encodeImg(out, 'jpeg', 90);
      const bytes = W.jpegWithComment(new Uint8Array(await jpeg.arrayBuffer()), W.creditText(p));
      const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' }), name = W.fileName(p, t.w, t.h);
      if (gone()) return;
      if (isMobile) await shareOrDownload(blob, name); else downloadBlob(blob, name);
      status.textContent = `Saved ${name} — ${t.w.toLocaleString()} × ${t.h.toLocaleString()}, ${fmtBytes(blob.size)}${box.w < t.w * 0.95 ? `; the picture had ${box.w.toLocaleString()} × ${box.h.toLocaleString()} pixels there, enlarged to fit` : ''}. Its credit is in the file.`;
    } catch (e) {
      if ((e as Error).name === 'AbortError' || gone()) return;
      status.textContent = (e as Error).message;
    } finally { saveB.disabled = !view.img; }
  }
  return {
    picture: h('div', { class: 'wp-maker-pic' }, stage, how), controls, status, load,
    clear() { if (view.url) urls.free(view.url); view.url = ''; view.pic = null; view.img = null; view.pw = 0; pimg.removeAttribute('src'); },
  };
}
