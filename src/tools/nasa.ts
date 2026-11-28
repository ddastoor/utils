// NASA Image Explorer (potentials #114; owner, 21 Nov 2026: "add … NASA image explorer"): NASA's Image and Video Library searched by
// words, a topic, the kind (pictures, videos), years and a NASA centre → a grid; an item opened: its title, date, centre, photographer and
// credit (NASA's own are not copyrighted in the US; a party credited beside NASA is named — its terms may apply), its description and
// keywords (a tap searches one), the full-size original to download, the item at NASA; a picture made a wallpaper of the screen's exact
// pixels by the Wallpapers tab's maker (src/lib/wallmaker.ts), a video played with its captions. The service: src/lib/nasa.ts — its API
// answers CORS; the files are read at NASA's bucket's own address (its file server sends no CORS header), the videos played from the file
// server (a <video> needs no CORS). Nothing but the words searched and the files asked for goes to NASA.
import { h, card, button, ic, note, select, input, clear, field, segmented, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { isMobile } from '../platform';
import * as N from '../lib/nasa';
import type { Item } from '../lib/nasa';
import { getJson, getBlob, blobUrls, thumbLoader, pictureDialog, wallMaker } from '../lib/wallmaker';
import './nasa.css';

type Show = 'image' | 'video' | 'both';
// kept while the page is open: coming back shows what was found
const state = { topic: 'earth', words: '', show: 'image' as Show, from: '', to: '', center: '' };
let found: Item[] = [], page = 1, next = false, total = 0, searched = '';
const key = () => `${state.topic}|${state.words}|${state.show}|${state.from}|${state.to}|${state.center}`;

export const mount: Mount = (root) => {
  let gone = false;
  const isGone = () => gone;
  const ac = new AbortController(), urls = blobUrls();
  const fromBucket = (u: string) => N.bucketUrl(u) || u;
  const thumbs = thumbLoader(urls, ac.signal, isGone, fromBucket);
  const when = (x: Item) => (x.date ? new Date(x.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');

  // ------------------------------------------------------------------ searching
  const words = input({ type: 'search', placeholder: 'Words: Saturn rings, Artemis, aurora…', attrs: { 'aria-label': 'Search NASA’s library', enterkeyhint: 'search', maxlength: 100, autocomplete: 'off' } });
  words.value = state.words;
  const go = () => { state.words = words.value.trim(); state.topic = state.words ? '' : state.topic || 'earth'; return search(); };
  words.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void go(); } });
  const topics = h('div', { class: 'wp-topics', role: 'group', 'aria-label': 'Topics' }, N.TOPICS.map((t) => h('button', { type: 'button', class: 'wp-chip', 'data-topic': t.id, 'aria-pressed': 'false', onclick: () => { state.topic = t.id; state.words = ''; words.value = ''; void search(); } }, t.name)));
  const show = segmented<Show>([['image', 'Pictures'], ['video', 'Videos'], ['both', 'Both']], state.show, (v) => { state.show = v; void go(); }); // with the words in the box
  show.setAttribute('aria-label', 'Show');
  const fromIn = input({ type: 'text', placeholder: '1969', attrs: { 'aria-label': 'From the year', inputmode: 'numeric', maxlength: 4, autocomplete: 'off' } });
  const toIn = input({ type: 'text', placeholder: String(new Date().getFullYear()), attrs: { 'aria-label': 'To the year', inputmode: 'numeric', maxlength: 4, autocomplete: 'off' } });
  fromIn.value = state.from; toIn.value = state.to;
  for (const el of [fromIn, toIn]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void go(); } }); // Enter or Search: not each box as it is left
  const centerSel = select<string>([['', 'Any NASA centre'], ...N.CENTERS.map(([c, n]): [string, string] => [c, `${n} (${c})`])], state.center, (v) => { state.center = v; void go(); }, 'NASA centre');
  const grid = h('div', { class: 'wp-grid', 'aria-label': 'Results', role: 'list' });
  const gridHead = h('h3', { class: 'wp-grid-title' });
  const gridState = h('p', { class: 'small muted wp-grid-state', role: 'status', 'aria-live': 'polite' });
  const moreB = button('More', () => search(true), { icon: 'ChevronDown' });
  const findCard = card('Search NASA’s library',
    h('div', { class: 'wp-words' }, words, button('Search', go, { icon: 'Search' })), topics,
    h('div', { class: 'ns-filters' }, field('Show', show), h('div', { class: 'ns-years' }, field('From', fromIn), field('To', toIn)), field('NASA centre', centerSel)),
    gridHead, gridState, grid, h('div', { class: 'row' }, moreB));
  const about = note(h('div', null,
    h('p', null, 'NASA’s Image and Video Library (images.nasa.gov): pictures and videos of NASA’s missions, most of them NASA’s own — not copyrighted in the United States; one credited to someone beside NASA says so, and that party’s terms may apply (', h('a', { href: N.GUIDELINES, target: '_blank', rel: 'noopener noreferrer' }, 'NASA’s guidelines'), '). Only the words searched and the files asked for go to NASA; the wallpaper is made on this device. NASA’s files are read from its storage at Amazon (s3.amazonaws.com/images-assets.nasa.gov — the same files; NASA’s file server does not let a web page read them).'),
    h('p', null, 'The Astronomy Picture of the Day is not here: its service asks for a key of one’s own (NASA’s shared one allows 10 requests an hour from an address).'),
  ));
  root.append(findCard, about);

  const lightTopics = () => { for (const b of topics.querySelectorAll<HTMLElement>('.wp-chip')) { const on = !state.words && b.dataset.topic === state.topic; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); } };
  const titleNow = () => {
    const what = state.words ? `“${state.words}”` : N.TOPICS.find((t) => t.id === state.topic)?.name ?? '';
    const kind = state.show === 'video' ? 'Videos' : state.show === 'both' ? 'Pictures and videos' : 'Pictures';
    const years = state.from || state.to ? ` · ${state.from || '…'} – ${state.to || '…'}` : '';
    const centre = state.center ? ` · ${N.CENTERS.find(([c]) => c === state.center)?.[1] ?? state.center}` : '';
    return `${kind}: ${what}${years}${centre}`;
  };
  let searchAc: AbortController | null = null;
  async function search(append = false): Promise<void> {
    // the years first: a box that holds no year is said, nothing asked
    const y0 = N.yearOf(fromIn.value), y1 = N.yearOf(toIn.value), now = new Date().getFullYear();
    if (Number.isNaN(y0) || Number.isNaN(y1)) { gridState.textContent = `A year is four digits, 1920 to ${now + 1}.`; (Number.isNaN(y0) ? fromIn : toIn).focus(); return; }
    if (y0 && y1 && y0 > y1) { gridState.textContent = `“From” is after “To” — ${y0} is after ${y1}.`; fromIn.focus(); return; }
    state.from = y0 ? String(y0) : ''; state.to = y1 ? String(y1) : '';
    searchAc?.abort();
    const my = (searchAc = new AbortController()), signal = AbortSignal.any([ac.signal, my.signal]);
    if (!append) { page = 1; found = []; next = false; total = 0; clear(grid); }
    lightTopics();
    gridHead.textContent = titleNow();
    gridState.textContent = append ? 'Fetching more…' : 'Searching NASA’s library…';
    grid.setAttribute('aria-busy', 'true'); moreB.hidden = true;
    const q = state.words || N.TOPICS.find((t) => t.id === state.topic)?.q || '';
    try {
      const r = N.readSearch(await getJson(N.searchUrl({ q, kind: state.show, from: y0 || undefined, to: y1 || undefined, center: state.center, page: append ? page + 1 : 1, size: 24 }), signal));
      if (gone || my !== searchAc) return;
      if (append) page += 1;
      const add = r.items.filter((x) => !found.some((y) => y.id === x.id));
      found.push(...add); next = r.next && r.items.length > 0; total = r.total;
      searched = key();
      grid.append(...add.map(tileOf));
      moreB.hidden = !next;
      gridState.textContent = found.length ? `${found.length.toLocaleString()} of ${total.toLocaleString()} shown${next ? ' — more below' : ''}.` : 'Nothing found — other words, another kind, or other years.';
    } catch (e) {
      if ((e as Error).name === 'AbortError' || gone || my !== searchAc) return;
      gridState.textContent = (e as Error).message;
      moreB.hidden = !next;
    } finally { if (my === searchAc) grid.removeAttribute('aria-busy'); }
  }
  const tileOf = (x: Item) => h('div', { role: 'listitem', class: 'wp-cell' }, h('button', { type: 'button', class: 'wp-tile wp-loading', onclick: () => void openItem(x) },
    h('span', { class: 'wp-tile-img' }, thumbs.img(x.thumb), x.kind === 'video' ? h('span', { class: 'ns-badge' }, ic('Play'), 'Video') : null),
    h('span', { class: 'wp-tile-text' }, h('span', { class: 'wp-tile-title' }, x.title), h('span', { class: 'small muted' }, [x.year || '', x.centerName].filter(Boolean).join(' · ')))));

  // ------------------------------------------------------------------ an item: its details; a picture's wallpaper, a video played
  let viewAc: AbortController | null = null, shown: Item | null = null, track = '', poster = '';
  const maker = wallMaker(urls, isGone, fromBucket);
  const video = h('video', { class: 'ns-video', controls: true, playsinline: true, preload: 'metadata' }) as HTMLVideoElement;
  const videoWrap = h('div', { class: 'ns-video-wrap' }, video);
  const dialog = pictureDialog(() => {
    viewAc?.abort(); maker.clear(); shown = null;
    video.pause(); video.removeAttribute('src'); video.removeAttribute('poster'); video.load(); clear(video);
    for (const u of [track, poster]) if (u) urls.free(u);
    track = ''; poster = '';
  });
  const info = h('div', { class: 'wp-info' });
  const keywords = h('div', { class: 'ns-keywords', role: 'group', 'aria-label': 'Keywords' });
  const dlStatus = h('p', { class: 'small wp-status', role: 'status', 'aria-live': 'polite' });
  const origB = button('Download the original', () => void downloadOriginal(), { icon: 'Download', small: true });
  const origA = h('a', { class: 'btn btn-sm', target: '_blank', rel: 'noopener noreferrer' }, 'The original video', ic('ExternalLink'));
  const pageA = h('a', { class: 'btn btn-sm', target: '_blank', rel: 'noopener noreferrer' }, 'At NASA', ic('ExternalLink'));
  const links = h('div', { class: 'row wp-links' }, origB, origA, pageA);

  /** a description; a long one folded to six lines with "Read all" */
  function descOf(text: string): HTMLElement[] {
    if (!text) return [];
    const p = h('p', { class: 'small wp-about ns-desc', id: 'ns-desc' }, text);
    if (text.length <= 500) return [p];
    p.classList.add('folded');
    const more = button('Read all', () => { const folded = p.classList.toggle('folded'); more.setLabel(folded ? 'Read all' : 'Fold'); more.setAttribute('aria-expanded', String(!folded)); }, { small: true, variant: 'ghost' });
    more.classList.add('ns-more'); more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'ns-desc');
    return [p, more];
  }
  async function openItem(x: Item) {
    viewAc?.abort();
    const my = (viewAc = new AbortController()), signal = AbortSignal.any([ac.signal, my.signal]);
    shown = x;
    dialog.title.textContent = x.title;
    const credit = x.credit || (x.photographer ? '' : 'NASA');
    clear(info).append(...[
      h('p', { class: 'wp-artist' }, [when(x), x.centerName].filter(Boolean).join(' · ')),
      x.photographer ? h('p', { class: 'small' }, `Photographed by ${x.photographer}`) : null,
      credit ? h('p', { class: 'small muted' }, `Credit: ${credit}`) : null,
      h('p', { class: 'small' }, x.others.length
        ? `Credited beside NASA: ${x.others.join(', ')} — their terms may apply. `
        : 'NASA’s own: not copyrighted in the United States. ', h('a', { href: N.GUIDELINES, target: '_blank', rel: 'noopener noreferrer' }, 'NASA’s guidelines')),
      x.location ? h('p', { class: 'small muted' }, `Place: ${x.location}`) : null,
      x.album ? h('p', { class: 'small muted' }, `Album: ${x.album}`) : null,
      ...descOf(x.description),
    ].filter((e): e is HTMLElement => !!e));
    clear(keywords).append(...x.keywords.slice(0, 12).map((k) => h('button', { type: 'button', class: 'wp-chip ns-kw', onclick: () => { dialog.close(); words.value = k; void go(); } }, k)));
    keywords.hidden = !x.keywords.length;
    pageA.href = x.page;
    dlStatus.textContent = '';
    clear(dialog.left); clear(dialog.right);
    if (x.kind === 'image') {
      origB.hidden = false; origA.hidden = true;
      dialog.left.append(maker.picture);
      dialog.right.append(maker.controls, info, links, dlStatus, keywords);
      dialog.open();
      await maker.load(N.picOf(x), signal);
      return;
    }
    // a video: its files (the MP4 to play, its original, its captions) from its asset list
    origB.hidden = true; origA.hidden = true;
    dialog.left.append(videoWrap);
    dialog.right.append(info, links, dlStatus, keywords);
    dialog.open();
    dlStatus.textContent = 'Fetching the video’s files…';
    try {
      const [assets] = await Promise.all([
        getJson(N.assetUrl(x.id), signal),
        getBlob(fromBucket(x.preview || x.thumb), signal).then((b) => { if (shown === x && !gone) { poster = urls.make(b); video.poster = poster; } }, () => {}),
      ]);
      if (gone || shown !== x) return;
      const a = N.readAssets(assets);
      if (!a.play) { dlStatus.textContent = 'NASA lists no video file for this item.'; return; }
      video.src = a.play;
      origA.href = a.original; origA.hidden = false;
      dlStatus.textContent = '';
      if (a.captions) {
        try {
          const text = await (await getBlob(fromBucket(a.captions), signal)).text();
          if (gone || shown !== x) return;
          track = urls.make(new Blob([N.toVtt(text)], { type: 'text/vtt' }));
          video.append(h('track', { kind: 'captions', srclang: 'en', label: 'English', src: track, default: true }));
        } catch { /* captions are a help, not the video */ }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError' || gone) return;
      dlStatus.textContent = (e as Error).message;
    }
  }
  video.addEventListener('error', () => { if (shown?.kind === 'video' && video.getAttribute('src')) dlStatus.textContent = 'The video could not be played — NASA’s file server did not send it, or this browser cannot play it. “The original video” opens it at NASA.'; });

  async function downloadOriginal() {
    const x = shown; if (!x || x.kind !== 'image') return;
    origB.disabled = true;
    try {
      const name = `${x.id.replace(/[^\w.-]+/g, '_').slice(0, 80)}${(decodeURIComponent(x.original).match(/\.(jpe?g|png|tiff?|gif)$/i)?.[0] ?? '.jpg').toLowerCase()}`;
      dlStatus.textContent = 'Fetching the original…';
      const blob = await getBlob(fromBucket(x.original), viewAc?.signal ?? ac.signal, (got, all) => { dlStatus.textContent = all ? `Fetching the original — ${fmtBytes(got)} of ${fmtBytes(all)}…` : `Fetching the original — ${fmtBytes(got)}…`; });
      if (gone) return;
      if (isMobile) await shareOrDownload(blob, name); else downloadBlob(blob, name);
      dlStatus.textContent = `Saved ${name} — ${fmtBytes(blob.size)}.`;
    } catch (e) {
      if ((e as Error).name === 'AbortError' || gone) return;
      dlStatus.textContent = (e as Error).message;
    } finally { origB.disabled = false; }
  }

  // ------------------------------------------------------------------ start
  if (found.length && searched === key()) {
    lightTopics(); gridHead.textContent = titleNow();
    grid.append(...found.map(tileOf)); moreB.hidden = !next;
    gridState.textContent = `${found.length.toLocaleString()} of ${total.toLocaleString()} shown${next ? ' — more below' : ''}.`;
  } else void search();

  return () => {
    gone = true; ac.abort(); searchAc?.abort(); viewAc?.abort(); thumbs.stop();
    video.pause();
    dialog.remove();
    urls.freeAll();
  };
};
