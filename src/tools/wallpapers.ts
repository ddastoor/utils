// Wallpapers from Wikimedia and Museums (potentials #115; owner, 21 Nov 2026). Today's picks (Wikimedia Commons' Picture of the Day,
// a highlight of the Met and of the Art Institute of Chicago, the same for everyone on a day), topics and a search across Commons'
// featured pictures and the two museums' public-domain paintings; a picture opened → its credit and licence, its story (Wikipedia), and
// a wallpaper of it made for a screen — this one at its real pixels, a phone upright, a monitor across, or any size: the crop keeps
// the subject (faces by BlazeFace, else the busiest part — imgproc.wasm), can be moved and zoomed by hand, and is cut from a rendition
// large enough for the screen, resized by Squoosh's Lanczos (in the codec worker) and saved as a JPEG (MozJPEG) that carries its credit.
// The pictures are fetched (CORS) and shown from blob: addresses — the CSP's img-src stays 'self'; the services: src/lib/wallpapers.ts.
import { h, card, button, ic, note, select, input, slider, clear, field, shareOrDownload, downloadBlob, fmtBytes, type Mount } from '../ui';
import { isMobile } from '../platform';
import * as W from '../lib/wallpapers';
import type { Pic, Screen, Box, SourceId } from '../lib/wallpapers';
import { loadImg, resizeImg, encodeImg } from '../lib/imgio';
import { imgproc, imgprocDirect, type Img } from '../wasm/imgproc';
import { wikiSummary } from '../lib/wikipedia';
import './wallpapers.css';

type Src = 'all' | SourceId;
// kept while the page is open: coming back shows what was found
let today: Pic[] | null = null;
let state = { src: 'all' as Src, topic: 'landscapes', words: '' };
let found: Pic[] = [], offsets = { wikimedia: 0, met: 0, aic: 1 }, left = { wikimedia: true, met: true, aic: true }, more = false, searched = '';
let screenId = 'this', custom = { w: 1920, h: 1080 };

class BusyError extends Error {}
/** a service's JSON (a refusal said in words: Wikimedia limits how often it is asked) */
async function getJson(url: string, signal: AbortSignal): Promise<any> {
  const name = /wikimedia|wikipedia/.test(url) ? 'Wikimedia' : /metmuseum/.test(url) ? 'The Met' : 'The Art Institute of Chicago';
  let r: Response;
  try { r = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (e) { if (signal.aborted) throw e; throw new Error(`${name} could not be reached — no connection, or it is down.`); }
  if (r.status === 429) throw new BusyError(`${name} is busy — it limits how often it is asked. Try again in a minute.`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${name} answered HTTP ${r.status}.`);
  return r.json();
}
/** a picture's bytes, with progress */
async function getBlob(url: string, signal: AbortSignal, progress?: (got: number, total: number) => void): Promise<Blob> {
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

export const mount: Mount = (root) => {
  let gone = false;
  const ac = new AbortController(), urls = new Set<string>();
  const blobUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.add(u); return u; };
  const free = (u: string) => { if (urls.delete(u)) URL.revokeObjectURL(u); };
  const thumbCache = new Map<string, string>(); // a picture's address → its blob: URL (this visit of the tab)
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); void showThumb(e.target as HTMLImageElement); } }, { rootMargin: '300px' });
  let active = 0; const waiting: Array<() => void> = [];
  async function showThumb(img: HTMLImageElement) {
    const src = img.dataset.src!;
    if (thumbCache.has(src)) { img.src = thumbCache.get(src)!; return; }
    if (active >= 6) await new Promise<void>((r) => waiting.push(r));
    active++;
    try { const b = await getBlob(src, ac.signal); if (gone) return; const u = blobUrl(b); thumbCache.set(src, u); img.src = u; img.closest('.wp-tile, .wp-pick')?.classList.remove('wp-loading'); }
    catch { if (!gone) img.closest('.wp-tile, .wp-pick')?.classList.add('wp-noimg'); }
    finally { active--; waiting.shift()?.(); }
  }
  const thumbImg = (p: Pic, big = false) => { const im = h('img', { alt: '', 'data-src': big ? p.preview : p.thumb, decoding: 'async' }); io.observe(im); return im; };
  const credit = (p: Pic) => `${p.artist}${p.date ? `, ${p.date}` : ''}`;

  // ------------------------------------------------------------------ today's picks
  const picksRow = h('div', { class: 'wp-picks' });
  const picksNote = h('p', { class: 'small muted wp-picks-note', role: 'status', 'aria-live': 'polite' });
  const picksCard = card('Today’s picks', h('p', { class: 'small muted' }, 'Wikimedia Commons’ Picture of the Day and a highlight of each museum — the same for everyone today.'), picksRow, picksNote);
  const drawPicks = () => {
    clear(picksRow).append(...(today ?? []).map((p) => h('button', { type: 'button', class: 'wp-pick wp-loading', onclick: () => void openPic(p) },
      h('span', { class: 'wp-pick-img' }, thumbImg(p, true)),
      h('span', { class: 'wp-pick-text' }, h('span', { class: 'wp-pick-src small' }, W.SOURCES[p.source].name), h('span', { class: 'wp-pick-title' }, p.title), h('span', { class: 'small muted' }, credit(p))))));
  };
  async function loadToday() {
    const d = new Date(), day = W.dayNumber(d), signal = ac.signal, notes: string[] = [];
    picksNote.textContent = 'Fetching today’s picks…';
    const wm = (async () => {
      for (const back of [0, 1]) { // the reader's date; the day before when the feed has none yet
        const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
        const j = await getJson(W.feedUrl(x.getFullYear(), x.getMonth() + 1, x.getDate()), signal);
        const p = W.readFeedImage(j);
        if (p) return p;
      }
      return null;
    })();
    const met = (async () => {
      let s = W.readMetSearch(await getJson(W.metSearchUrl('*', { highlight: true, limit: 6, offset: day % 400 }), signal));
      if (!s.ids.length && s.total) s = W.readMetSearch(await getJson(W.metSearchUrl('*', { highlight: true, limit: 6, offset: day % s.total }), signal));
      for (const id of s.ids) { const p = W.readMetObject(await getJson(W.metObjectUrl(id), signal)); if (p) return p; }
      return null;
    })();
    const aic = (async () => {
      let r = W.readAicSearch(await getJson(W.aicSearchUrl('', { boosted: true, limit: 1, page: (day % 120) + 1 }), signal));
      if (!r.pics.length && r.total) r = W.readAicSearch(await getJson(W.aicSearchUrl('', { boosted: true, limit: 1, page: (day % r.total) + 1 }), signal));
      return r.pics[0] ?? null;
    })();
    const got = await Promise.allSettled([wm, met, aic]);
    if (gone) return;
    today = got.map((g) => (g.status === 'fulfilled' ? g.value : null)).filter((p): p is Pic => !!p);
    got.forEach((g, i) => { if (g.status === 'rejected' && (g.reason as Error)?.name !== 'AbortError') notes.push((g.reason as Error).message); else if (g.status === 'fulfilled' && !g.value) notes.push(`${['Wikimedia Commons', 'The Met', 'The Art Institute of Chicago'][i]} has no pick today.`); });
    picksNote.textContent = notes.join(' ');
    drawPicks();
  }

  // ------------------------------------------------------------------ finding pictures
  const srcSel = select<Src>([['all', 'All sources'], ['wikimedia', 'Wikimedia Commons — featured pictures'], ['met', 'The Met — public-domain paintings'], ['aic', 'Art Institute of Chicago — public-domain paintings']], state.src, (v) => { state.src = v; void search(); }, 'Source');
  const topics = h('div', { class: 'wp-topics', role: 'group', 'aria-label': 'Topics' }, W.TOPICS.map((t) => h('button', { type: 'button', class: 'wp-chip', 'data-topic': t.id, 'aria-pressed': 'false', onclick: () => { state.topic = t.id; state.words = ''; words.value = ''; void search(); } }, t.name)));
  const words = input({ type: 'search', placeholder: 'Words: sunflowers, Monet, waterfall…', attrs: { 'aria-label': 'Search pictures', enterkeyhint: 'search', maxlength: 100, autocomplete: 'off' } });
  words.value = state.words;
  const go = () => { state.words = words.value.trim(); state.topic = state.words ? '' : state.topic || 'landscapes'; return search(); };
  words.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void go(); } });
  const goB = button('Search', go, { icon: 'Search' });
  const grid = h('div', { class: 'wp-grid', 'aria-label': 'Pictures', role: 'list' });
  const gridHead = h('h3', { class: 'wp-grid-title' });
  const gridState = h('p', { class: 'small muted wp-grid-state', role: 'status', 'aria-live': 'polite' });
  const moreB = button('More pictures', () => search(true), { icon: 'ChevronDown' });
  const findCard = card('Find pictures', h('div', { class: 'wp-find' }, field('Source', srcSel), h('div', { class: 'wp-words' }, words, goB)), topics, gridHead, gridState, grid, h('div', { class: 'row' }, moreB));

  const queryOf = (s: SourceId): string | null => {
    if (state.words) return state.words;
    const t = W.TOPICS.find((x) => x.id === state.topic) ?? W.TOPICS[0];
    return t[s];
  };
  let searchAc: AbortController | null = null;
  async function search(append = false): Promise<void> {
    searchAc?.abort();
    const my = (searchAc = new AbortController()), signal = AbortSignal.any([ac.signal, my.signal]);
    const sources: SourceId[] = state.src === 'all' ? ['wikimedia', 'met', 'aic'] : [state.src];
    const per = state.src === 'all' ? 8 : 24;
    if (!append) { offsets = { wikimedia: 0, met: 0, aic: 1 }; left = { wikimedia: true, met: true, aic: true }; found = []; clear(grid); }
    for (const b of topics.querySelectorAll<HTMLElement>('.wp-chip')) { const on = !state.words && b.dataset.topic === state.topic; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); }
    const title = state.words ? `Pictures of “${state.words}”` : W.TOPICS.find((x) => x.id === state.topic)?.name ?? '';
    gridHead.textContent = `${title}${state.src === 'all' ? '' : ` — ${W.SOURCES[state.src].name}`}`;
    gridState.textContent = append ? 'Fetching more pictures…' : 'Fetching pictures…';
    grid.setAttribute('aria-busy', 'true'); moreB.hidden = true;
    const notes: string[] = [];
    const lists = await Promise.all(sources.map(async (s): Promise<{ pics: Pic[]; more: boolean }> => {
      const q = queryOf(s);
      if (q === null || !left[s]) return { pics: [], more: false }; // a source with nothing more is not asked again
      try {
        if (s === 'wikimedia') {
          const r = W.readCommonsSearch(await getJson(W.commonsSearchUrl(q, offsets.wikimedia, per), signal));
          offsets.wikimedia = r.next; return { pics: r.pics, more: r.next > 0 };
        }
        if (s === 'met') {
          // its search does not keep to the public domain: twice as many asked, the public-domain ones kept
          const r = W.readMetSearch(await getJson(W.metSearchUrl(q, { offset: offsets.met, limit: per * 2 }), signal));
          offsets.met += r.ids.length;
          const objs = await Promise.all(r.ids.map((id) => getJson(W.metObjectUrl(id), signal).then(W.readMetObject, () => null)));
          return { pics: objs.filter((p): p is Pic => !!p).slice(0, per), more: r.ids.length > 0 && offsets.met < r.total };
        }
        const r = W.readAicSearch(await getJson(W.aicSearchUrl(q, { page: offsets.aic, limit: per }), signal));
        offsets.aic += 1; return { pics: r.pics, more: r.pics.length > 0 && (offsets.aic - 1) * per < r.total };
      } catch (e) {
        if ((e as Error).name !== 'AbortError') notes.push((e as Error).message);
        return { pics: [], more: false };
      }
    }));
    if (gone || my !== searchAc) return;
    sources.forEach((s, i) => { left[s] = lists[i].more; });
    grid.removeAttribute('aria-busy');
    const add = W.interleave(lists.map((l) => l.pics)).filter((p) => !found.some((x) => x.key === p.key));
    found.push(...add); more = lists.some((l) => l.more);
    searched = `${state.src}|${state.topic}|${state.words}`;
    grid.append(...add.map(tileOf));
    moreB.hidden = !more;
    gridState.textContent = [found.length ? `${found.length} picture${found.length === 1 ? '' : 's'}${more ? ' — more below' : ''}.` : 'No picture found — another word, or another source.', ...notes].join(' ');
  }
  const tileOf = (p: Pic) => h('div', { role: 'listitem', class: 'wp-cell' }, h('button', { type: 'button', class: 'wp-tile wp-loading', onclick: () => void openPic(p) },
    h('span', { class: 'wp-tile-img' }, thumbImg(p)),
    h('span', { class: 'wp-tile-text' }, h('span', { class: 'wp-tile-title' }, p.title), h('span', { class: 'small muted' }, `${credit(p)} · ${W.SOURCES[p.source].name}`))));

  const about = note(h('div', null,
    h('p', null, 'Pictures from Wikimedia Commons (its featured pictures — chosen by its community; each under its own free licence, shown with it), The Metropolitan Museum of Art and the Art Institute of Chicago (public-domain works, CC0). Only the words searched and the pictures asked for go to them; the wallpaper is made on this device. The Cleveland Museum of Art is not among them: its picture server does not let a web page read a picture, so none of its pictures could be fitted to a screen.'),
  ));
  root.append(picksCard, findCard, about);

  // ------------------------------------------------------------------ a picture: its credit, its story, a wallpaper of it
  const dlgTitle = h('h2', { class: 'wp-dlg-title', id: 'wp-dlg-title' });
  const dlg = h('dialog', { class: 'wp-dlg', 'aria-labelledby': 'wp-dlg-title' });
  const stage = h('div', { class: 'wp-stage' });
  const frameEl = h('div', { class: 'wp-frame', tabindex: '0', role: 'group', 'aria-label': 'The wallpaper’s crop — drag it, or move it with the arrow keys' });
  const pimg = h('img', { class: 'wp-pimg', alt: '' });
  stage.append(pimg, frameEl);
  const info = h('div', { class: 'wp-info' });
  const story = h('div', { class: 'wp-story' });
  const status = h('p', { class: 'small wp-status', role: 'status', 'aria-live': 'polite' });
  const how = h('p', { class: 'small muted wp-how' });
  const screenSel = h('select', { class: 'input select', 'aria-label': 'The screen it is for' });
  const cw = input({ type: 'number', value: custom.w, min: 100, max: W.MAX_SIDE, attrs: { 'aria-label': 'Width in pixels' } });
  const chh = input({ type: 'number', value: custom.h, min: 100, max: W.MAX_SIDE, attrs: { 'aria-label': 'Height in pixels' } });
  const customRow = h('div', { class: 'wp-custom' }, field('Width', cw), h('span', { 'aria-hidden': 'true' }, '×'), field('Height', chh));
  const zoom = slider({ label: 'Zoom', min: 100, max: 400, step: 5, value: 100, unit: ' %', onInput: (v) => { view.zoom = 100 / v; place(); } });
  const autoB = button('Centre on the subject', () => void findSubject(), { icon: 'Focus', small: true });
  const saveB = button('Save wallpaper', () => save(), { icon: 'Download', variant: 'primary' });
  const origA = h('a', { class: 'btn btn-sm', target: '_blank', rel: 'noopener noreferrer' }, 'Full-size original', ic('ExternalLink'));
  const pageA = h('a', { class: 'btn btn-sm', target: '_blank', rel: 'noopener noreferrer' }, h('span', null, 'Its page'), ic('ExternalLink'));
  const closeB = button('', () => dlg.close(), { icon: 'X', variant: 'ghost', title: 'Close' });
  const fillScreens = () => {
    const me = W.screenOf(screen.width, screen.height, devicePixelRatio), turned: Screen = { id: 'turned', name: `This screen turned, ${me.h} × ${me.w}`, w: me.h, h: me.w };
    clear(screenSel).append(h('option', { value: 'this' }, me.name), h('option', { value: 'turned' }, turned.name),
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
  dlg.append(h('div', { class: 'wp-dlg-head' }, dlgTitle, closeB),
    h('div', { class: 'wp-dlg-body' },
      h('div', { class: 'wp-dlg-pic' }, stage, how),
      h('div', { class: 'wp-dlg-side' },
        field('The screen it is for', screenSel), customRow, zoom, h('div', { class: 'row wp-btns' }, autoB),
        h('div', { class: 'actions wp-save' }, saveB), status,
        info, h('div', { class: 'row wp-links' }, origA, pageA), story)));
  customRow.hidden = screenId !== 'custom';
  document.body.append(dlg); // the dialog in the page's top layer (removed when the tab is left)
  dlg.addEventListener('close', () => { viewAc?.abort(); if (view.url) free(view.url); view.url = ''; pimg.removeAttribute('src'); });

  const view = { pic: null as Pic | null, url: '', pw: 0, ph: 0, img: null as Img | null, frame: { x: 0, y: 0, w: 0, h: 0 } as Box, cx: 0, cy: 0, zoom: 1, faces: [] as Box[], byHand: false };
  let viewAc: AbortController | null = null;
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
  async function openPic(p: Pic) {
    viewAc?.abort();
    const my = (viewAc = new AbortController()), signal = AbortSignal.any([ac.signal, my.signal]);
    view.pic = p; view.img = null; view.faces = []; view.zoom = 1; zoom.value = 100;
    dlgTitle.textContent = p.title;
    fillScreens();
    clear(info).append(...[
      h('p', { class: 'wp-artist' }, credit(p)),
      h('p', { class: 'small' }, W.SOURCES[p.source].name, ' · ', p.licence.url ? h('a', { href: p.licence.url, target: '_blank', rel: 'noopener noreferrer' }, p.licence.name) : p.licence.name),
      h('p', { class: 'small muted' }, `Credit: ${p.credit}`),
      p.about ? h('p', { class: 'small wp-about' }, p.about) : null,
      p.aboutCredit ? h('p', { class: 'small muted' }, p.aboutCredit) : null].filter((x): x is HTMLParagraphElement => !!x));
    origA.href = p.original; pageA.href = p.page; pageA.querySelector('span')!.textContent = `At ${W.SOURCES[p.source].name}`;
    clear(story); status.textContent = 'Fetching the picture…'; how.textContent = ''; saveB.disabled = true;
    if (!dlg.open) dlg.showModal();
    // its story: the Wikipedia article it names (the artist's, or the first its description links to)
    if (p.wiki) void wikiSummary(p.wiki).then((s) => {
      if (gone || view.pic !== p || s.kind !== 'article') return;
      clear(story).append(h('h3', { class: 'small' }, `From Wikipedia: ${s.title}`), h('p', { class: 'small' }, s.text), h('p', { class: 'small muted' }, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, 'Read on Wikipedia'), ' (CC BY-SA 4.0)'));
    }).catch(() => { /* no story: the picture stands on its own */ });
    try {
      const blob = await getBlob(p.preview, signal);
      if (gone || view.pic !== p) return;
      if (view.url) free(view.url);
      view.url = blobUrl(blob); pimg.src = view.url;
      const img = await loadImg(blob);
      if (gone || view.pic !== p) return;
      view.img = img; view.pw = img.width; view.ph = img.height;
      stage.style.setProperty('--ar', String(img.width / img.height));
      status.textContent = '';
      saveB.disabled = false;
      view.cx = img.width / 2; view.cy = img.height / 2; place();
      await findSubjectWithFaces(p);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || gone) return;
      status.textContent = (e as Error).message;
    }
  }
  async function findSubjectWithFaces(p: Pic) {
    try {
      const { detectFaces } = await import('./redact'); // BlazeFace on the whole picture and on tiles (the Blur & Redact tab's)
      const faces = await detectFaces(view.img!);
      if (gone || view.pic !== p) return;
      view.faces = faces.map((f) => ({ x: f.x * view.pw, y: f.y * view.ph, w: f.w * view.pw, h: f.h * view.ph }));
    } catch { view.faces = []; /* no face finder (it could not be fetched): the busiest part */ }
    if (!view.byHand) await findSubject();
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
    const t = target(), f = view.frame, signal = AbortSignal.any([ac.signal, (viewAc ??= new AbortController()).signal]);
    if (!sizeOk(t.w) || !sizeOk(t.h)) { status.textContent = `The screen's size must be 100 to ${W.MAX_SIDE.toLocaleString()} pixels a side.`; return; }
    // a rendition wide enough for the crop to give the screen's pixels (the preview when it is)
    const need = W.neededWidth(f, view.pw, t.w);
    let src = p.preview, img: Img = view.img, rw = view.pw;
    if (need > view.pw) {
      if (p.source === 'wikimedia') { const s = W.commonsSize(need, p.width); src = s ? W.commonsThumb(p.original, s, p.width) : p.original; }
      else if (p.source === 'aic') src = W.aicImage(p.iiif, need, p.width, p.height);
      else src = p.original;
    }
    if (src !== p.preview) {
      status.textContent = 'Fetching the picture in full…';
      const blob = await getBlob(src, signal, (got, total) => { status.textContent = total ? `Fetching the picture in full — ${fmtBytes(got)} of ${fmtBytes(total)}…` : `Fetching the picture in full — ${fmtBytes(got)}…`; });
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
    if (gone) return;
    if (isMobile) await shareOrDownload(blob, name); else downloadBlob(blob, name);
    status.textContent = `Saved ${name} — ${t.w.toLocaleString()} × ${t.h.toLocaleString()}, ${fmtBytes(blob.size)}${box.w < t.w * 0.95 ? `; the picture had ${box.w.toLocaleString()} × ${box.h.toLocaleString()} pixels there, enlarged to fit` : ''}. Its credit is in the file.`;
  }

  // ------------------------------------------------------------------ start
  if (today?.length) drawPicks(); else void loadToday();
  if (found.length && searched === `${state.src}|${state.topic}|${state.words}`) {
    gridHead.textContent = state.words ? `Pictures of “${state.words}”` : W.TOPICS.find((x) => x.id === state.topic)?.name ?? '';
    for (const b of topics.querySelectorAll<HTMLElement>('.wp-chip')) { const on = !state.words && b.dataset.topic === state.topic; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); }
    grid.append(...found.map(tileOf)); moreB.hidden = !more; gridState.textContent = `${found.length} pictures${more ? ' — more below' : ''}.`;
  } else void search();

  return () => {
    gone = true; ac.abort(); searchAc?.abort(); viewAc?.abort(); io.disconnect();
    if (dlg.open) dlg.close();
    dlg.remove();
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
  };
};
