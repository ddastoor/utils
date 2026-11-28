// Wallpapers from Wikimedia and Museums (potentials #115; owner, 21 Nov 2026). Today's picks (Wikimedia Commons' Picture of the Day,
// a highlight of the Met and of the Art Institute of Chicago, the same for everyone on a day), topics and a search across Commons'
// featured pictures and the two museums' public-domain paintings; a picture opened → its credit and licence, its story (Wikipedia), and
// a wallpaper of it made for a screen — this one at its real pixels, a phone upright, a monitor across, or any size (the wallpaper maker,
// src/lib/wallmaker.ts, shared with the NASA Image Explorer: the crop on the faces or the busiest part, moved and zoomed by hand, saved at
// the screen's pixels with the credit in the JPEG). The pictures are fetched (CORS) and shown from blob: addresses — the CSP's img-src
// stays 'self'; the services: src/lib/wallpapers.ts.
import { h, card, button, ic, note, select, input, clear, field, type Mount } from '../ui';
import * as W from '../lib/wallpapers';
import type { Pic, SourceId } from '../lib/wallpapers';
import { getJson, blobUrls, thumbLoader, pictureDialog, wallMaker } from '../lib/wallmaker';
import { wikiSummary } from '../lib/wikipedia';
import './wallpapers.css';

type Museum = Exclude<SourceId, 'nasa'>;
type Src = 'all' | Museum;
// kept while the page is open: coming back shows what was found
let today: Pic[] | null = null;
const state = { src: 'all' as Src, topic: 'landscapes', words: '' };
let found: Pic[] = [], offsets = { wikimedia: 0, met: 0, aic: 1 }, left = { wikimedia: true, met: true, aic: true }, more = false, searched = '';

export const mount: Mount = (root) => {
  let gone = false;
  const isGone = () => gone;
  const ac = new AbortController(), urls = blobUrls();
  const thumbs = thumbLoader(urls, ac.signal, isGone);
  const credit = (p: Pic) => `${p.artist}${p.date ? `, ${p.date}` : ''}`;

  // ------------------------------------------------------------------ today's picks
  const picksRow = h('div', { class: 'wp-picks' });
  const picksNote = h('p', { class: 'small muted wp-picks-note', role: 'status', 'aria-live': 'polite' });
  const picksCard = card('Today’s picks', h('p', { class: 'small muted' }, 'Wikimedia Commons’ Picture of the Day and a highlight of each museum — the same for everyone today.'), picksRow, picksNote);
  const drawPicks = () => {
    clear(picksRow).append(...(today ?? []).map((p) => h('button', { type: 'button', class: 'wp-pick wp-loading', onclick: () => void openPic(p) },
      h('span', { class: 'wp-pick-img' }, thumbs.img(p.preview)),
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

  const queryOf = (s: Museum): string | null => {
    if (state.words) return state.words;
    const t = W.TOPICS.find((x) => x.id === state.topic) ?? W.TOPICS[0];
    return t[s];
  };
  const lightTopics = () => { for (const b of topics.querySelectorAll<HTMLElement>('.wp-chip')) { const on = !state.words && b.dataset.topic === state.topic; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); } };
  let searchAc: AbortController | null = null;
  async function search(append = false): Promise<void> {
    searchAc?.abort();
    const my = (searchAc = new AbortController()), signal = AbortSignal.any([ac.signal, my.signal]);
    const sources: Museum[] = state.src === 'all' ? ['wikimedia', 'met', 'aic'] : [state.src];
    const per = state.src === 'all' ? 8 : 24;
    if (!append) { offsets = { wikimedia: 0, met: 0, aic: 1 }; left = { wikimedia: true, met: true, aic: true }; found = []; clear(grid); }
    lightTopics();
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
    h('span', { class: 'wp-tile-img' }, thumbs.img(p.thumb)),
    h('span', { class: 'wp-tile-text' }, h('span', { class: 'wp-tile-title' }, p.title), h('span', { class: 'small muted' }, `${credit(p)} · ${W.SOURCES[p.source].name}`))));

  const about = note(h('div', null,
    h('p', null, 'Pictures from Wikimedia Commons (its featured pictures — chosen by its community; each under its own free licence, shown with it), The Metropolitan Museum of Art and the Art Institute of Chicago (public-domain works, CC0). Only the words searched and the pictures asked for go to them; the wallpaper is made on this device. The Cleveland Museum of Art is not among them: its picture server does not let a web page read a picture, so none of its pictures could be fitted to a screen.'),
  ));
  root.append(picksCard, findCard, about);

  // ------------------------------------------------------------------ a picture: its credit, its story, a wallpaper of it
  let viewAc: AbortController | null = null, shown: Pic | null = null;
  const maker = wallMaker(urls, isGone);
  const dialog = pictureDialog(() => { viewAc?.abort(); maker.clear(); shown = null; });
  const info = h('div', { class: 'wp-info' });
  const story = h('div', { class: 'wp-story' });
  const origA = h('a', { class: 'btn btn-sm', target: '_blank', rel: 'noopener noreferrer' }, 'Full-size original', ic('ExternalLink'));
  const pageA = h('a', { class: 'btn btn-sm', target: '_blank', rel: 'noopener noreferrer' }, h('span', null, 'Its page'), ic('ExternalLink'));
  dialog.left.append(maker.picture);
  dialog.right.append(maker.controls, info, h('div', { class: 'row wp-links' }, origA, pageA), story);

  async function openPic(p: Pic) {
    viewAc?.abort();
    const my = (viewAc = new AbortController()), signal = AbortSignal.any([ac.signal, my.signal]);
    shown = p;
    dialog.title.textContent = p.title;
    clear(info).append(...[
      h('p', { class: 'wp-artist' }, credit(p)),
      h('p', { class: 'small' }, W.SOURCES[p.source].name, ' · ', p.licence.url ? h('a', { href: p.licence.url, target: '_blank', rel: 'noopener noreferrer' }, p.licence.name) : p.licence.name),
      h('p', { class: 'small muted' }, `Credit: ${p.credit}`),
      p.about ? h('p', { class: 'small wp-about' }, p.about) : null,
      p.aboutCredit ? h('p', { class: 'small muted' }, p.aboutCredit) : null].filter((x): x is HTMLParagraphElement => !!x));
    origA.href = p.original; pageA.href = p.page; pageA.querySelector('span')!.textContent = `At ${W.SOURCES[p.source].name}`;
    clear(story);
    dialog.open();
    // its story: the Wikipedia article it names (the artist's, or the first its description links to)
    if (p.wiki) void wikiSummary(p.wiki).then((s) => {
      if (gone || shown !== p || s.kind !== 'article') return;
      clear(story).append(h('h3', { class: 'small' }, `From Wikipedia: ${s.title}`), h('p', { class: 'small' }, s.text), h('p', { class: 'small muted' }, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, 'Read on Wikipedia'), ' (CC BY-SA 4.0)'));
    }).catch(() => { /* no story: the picture stands on its own */ });
    await maker.load(p, signal);
  }

  // ------------------------------------------------------------------ start
  if (today?.length) drawPicks(); else void loadToday();
  if (found.length && searched === `${state.src}|${state.topic}|${state.words}`) {
    gridHead.textContent = state.words ? `Pictures of “${state.words}”` : W.TOPICS.find((x) => x.id === state.topic)?.name ?? '';
    lightTopics();
    grid.append(...found.map(tileOf)); moreB.hidden = !more; gridState.textContent = `${found.length} pictures${more ? ' — more below' : ''}.`;
  } else void search();

  return () => {
    gone = true; ac.abort(); searchAc?.abort(); viewAc?.abort(); thumbs.stop();
    dialog.remove();
    urls.freeAll();
  };
};
