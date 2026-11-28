// World Radio (potentials #116; owner, 21 Nov 2026: "add world radio also"; 28 Nov 2026: "listen to different radio stations all across
// the world, including India. You should remember my favorite stations … the settings page will have the world radio section in it. I
// should have an option to keep playing when I switch to another app. A station that won't play (offline, http-only, a format the browser
// can't play) is skipped and the reason is said, never a silent failure"). The stations of Radio Browser — India first, then the world —
// by quick picks, name, country, language and genre, the most listened first; played in the page by the site's one radio player
// (src/lib/radioplayer.ts: it plays on in other apps when asked, skips a station that does not play and says why, knows the lock screen
// and the media keys). Favourites are the Settings' (World Radio section). The directory and the streams are data (CLAUDE.md §1 rule 2):
// the directory's three servers are in connect-src, the streams come from any https: server (media-src) — sound only.
import { h, card, button, ic, note, toggle, select, slider, input, actions, clear, toast, field, type Mount } from '../ui';
import { isIOS, isWindows } from '../platform';
import { onLeave } from '../lifecycle';
import * as R from '../lib/radio';
import type { Station } from '../lib/radio';
import * as P from '../lib/radioplayer';
import { worldradioSettings, RADIO_FAVS_MAX, type RadioFav } from '../settings';
import './worldradio.css';

type Source = { kind: 'pick'; id: string } | { kind: 'fav' } | { kind: 'search'; q: R.Query };
// kept while the page is open (the module stays loaded): coming back to the tab shows the list as it was
let source: Source = { kind: 'pick', id: 'india' };
let shown: Station[] = [], more = false, offset = 0, loaded = false;
let lists: { countries: R.Country[]; langs: R.Named[]; tags: R.Named[] } | null = null;
let q: R.Query = { order: 'clickcount' };
/** the player's list is the favourites (it follows them when one is taken off) */
let favPlay = false;
/** what the directory said of each favourite at its last check (this visit) */
const favOk = new Map<string, boolean>();

// the languages and genres of India first (the owner lives there), as the directory names them
const INDIAN_LANGS = ['hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'bengali', 'bangla', 'marathi', 'gujarati', 'punjabi', 'odia', 'oriya', 'urdu', 'assamese', 'sanskrit', 'konkani', 'bhojpuri', 'kashmiri', 'sindhi', 'nepali', 'maithili', 'tulu', 'haryanvi', 'rajasthani', 'dogri', 'manipuri'];
const INDIAN_TAGS = ['bollywood', 'hindi', 'devotional', 'bhakti', 'bhajan', 'carnatic', 'hindustani', 'hindustani classical', 'indian classical', 'ghazal', 'filmi', 'desi', 'sufi', 'qawwali', 'bhangra', 'punjabi', 'tamil', 'telugu', 'malayalam', 'kannada', 'indian', 'india', 'mantra', 'kirtan', 'gurbani'];

const dn = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const regionName = (cc: string) => { try { const n = dn?.of(cc); return n && n !== cc ? n : undefined; } catch { return undefined; } };
const cap = (s: string) => s.replace(/(^|[\s-])(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());
const countryOf = (s: Pick<Station, 'cc' | 'country' | 'state'>) => {
  const name = (s.cc && regionName(s.cc)) || s.country;
  return [isWindows ? '' : R.flagOf(s.cc), [s.state, name].filter(Boolean).join(', ')].filter(Boolean).join(' ');
};
const langsOf = (s: Station) => s.lang.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3).map(cap).join(', ');
const metaOf = (s: Station) => [countryOf(s), langsOf(s), s.tags.slice(0, 3).join(', ')].filter(Boolean).join(' · ');
const num = (n: number) => n.toLocaleString();

// ------------------------------------------------------------------ favourites (the Settings' World Radio section)
const favOf = (s: Station): RadioFav => ({ id: s.id, name: s.name, url: s.url, cc: s.cc, country: s.country, lang: s.lang, codec: s.codec, bitrate: s.bitrate, hls: s.hls, homepage: s.homepage, tags: s.tags.join(',') });
const ofFav = (f: RadioFav): Station => ({
  id: f.id, name: f.name, url: f.url, homepage: f.homepage, country: f.country, cc: f.cc, state: '', lang: f.lang,
  tags: f.tags ? f.tags.split(',').map((t) => t.trim()).filter(Boolean) : [], codec: f.codec || 'UNKNOWN', bitrate: f.bitrate, hls: f.hls,
  ok: favOk.get(f.id) ?? true, checked: '', clicks: 0, votes: 0,
});
const favStations = () => worldradioSettings.get().favourites.map(ofFav);
const isFav = (id: string) => worldradioSettings.get().favourites.some((f) => f.id === id);
function toggleFav(s: Station) {
  const fs = worldradioSettings.get().favourites;
  if (fs.some((f) => f.id === s.id)) { worldradioSettings.set({ favourites: fs.filter((f) => f.id !== s.id) }); toast(`${s.name} taken off your favourites`); return; }
  if (fs.length >= RADIO_FAVS_MAX) { toast(`At most ${RADIO_FAVS_MAX} favourite stations — take one off first`, 'err'); return; }
  worldradioSettings.set({ favourites: [...fs, favOf(s)] });
  toast(`${s.name} added to your favourites`, 'ok');
}
/** the directory's current address of each favourite (a station moves its stream now and then): kept without a settings file of its
 *  own — it goes into the next one */
async function refreshFavs(signal: AbortSignal): Promise<boolean> {
  const fs = worldradioSettings.get().favourites;
  if (!fs.length) return false;
  const now = new Map((await R.stationsById(fs.map((f) => f.id), { signal })).map((s) => [s.id, s]));
  let changed = false;
  const next = fs.map((f) => {
    const s = now.get(f.id);
    if (!s) return f;
    favOk.set(f.id, s.ok);
    const g: RadioFav = { ...f, url: s.url, codec: s.codec, bitrate: s.bitrate, hls: s.hls, homepage: s.homepage || f.homepage };
    if (g.url !== f.url || g.codec !== f.codec || g.bitrate !== f.bitrate || g.hls !== f.hls || g.homepage !== f.homepage) changed = true;
    return g;
  });
  if (changed && !signal.aborted) worldradioSettings.setQuietly({ favourites: next });
  return changed;
}

/** a button's label and icon changed together */
function setBtn(b: HTMLButtonElement & { setLabel(t: string): void }, label: string, icon: string) {
  b.setLabel(label);
  b.querySelector('.ic')?.replaceWith(ic(icon));
}

export const mount: Mount = (root) => {
  P.entered();
  onLeave('worldradio-player', () => P.left());
  let gone = false, ac: AbortController | null = null, favAc: AbortController | null = null, typing = 0, favIds = worldradioSettings.get().favourites.map((f) => f.id).join();
  const offs: Array<() => void> = [];

  // ------------------------------------------------------------------ the station playing
  const letter = h('span', { class: 'radio-letter wr-big', 'aria-hidden': 'true' });
  const name = h('h2', { class: 'wr-name' });
  const meta = h('p', { class: 'wr-meta small' });
  const details = h('p', { class: 'wr-meta small' });
  const site = h('p', { class: 'wr-meta small' });
  const status = h('p', { class: 'wr-status', role: 'status', 'aria-live': 'polite' });
  const noteEl = h('p', { class: 'wr-note small', 'aria-live': 'polite' });
  const star = button('', () => { const s = P.view().station; if (s) toggleFav(s); }, { icon: 'Star', variant: 'ghost', title: 'Add to your favourites' });
  star.classList.add('wr-star');
  const prevB = button('Previous', () => P.prev(), { icon: 'SkipBack', title: 'The station before it in the list' });
  const playB = button('Play', () => P.toggle(), { icon: 'Play', variant: 'primary' });
  const nextB = button('Next', () => P.next(), { icon: 'SkipForward', title: 'The next station in the list' });
  const stopB = button('Stop', () => P.stop(), { icon: 'Square', title: 'Stop the radio' });
  const bar = actions(prevB, playB, nextB, stopB);
  bar.classList.add('wr-bar');
  const empty = h('p', { class: 'muted wr-empty' }, 'Choose a station below — India’s most listened stations come first.');
  const vol0 = worldradioSettings.get().volume;
  const vol = slider({ label: 'Volume', min: 0, max: 100, step: 1, value: Math.round(vol0 * 100), unit: ' %', onInput: (v) => P.setVolume(v / 100) });
  const sleepLine = h('span', { class: 'small muted' });
  const sleepSel = select<string>([['0', 'Off'], ['15', '15 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['90', '1½ hours'], ['120', '2 hours']], '0', (v) => P.setSleep(+v), 'Sleep timer');
  const keepT = toggle('Keep playing in other apps', worldradioSettings.get().keep, (v) => worldradioSettings.set({ keep: v }));
  const controls = h('div', { class: 'wr-controls' },
    isIOS ? h('p', { class: 'small muted' }, 'The volume: the phone’s own buttons.') : vol,
    field('Sleep timer', sleepSel, sleepLine),
    h('div', { class: 'stack' }, keepT, h('p', { class: 'small muted' }, 'On: the station plays on while another app of SuperUtils is open, in a small player at the foot of the page (Pause, Stop, and back here). Off: leaving World Radio stops the sound.')));
  const nowBody = h('div', { class: 'wr-now' }, letter, h('div', { class: 'wr-now-text' }, name, meta, details, site, status, noteEl), star);
  const nowCard = card('Now playing', empty, nowBody, bar, controls);
  nowCard.classList.add('wr-now-card');

  const drawNow = () => {
    const v = P.view(), s = v.station;
    empty.hidden = !!s; nowBody.hidden = !s; bar.hidden = !s;
    if (s) {
      letter.textContent = R.letterOf(s.name); letter.style.setProperty('--hue', String(R.hueOf(s.name)));
      name.textContent = s.name;
      meta.textContent = metaOf(s);
      details.textContent = [R.formatOf(s), s.clicks ? `listened to ${num(s.clicks)} times in the last day` : '', s.votes ? `${num(s.votes)} likes` : ''].filter(Boolean).join(' · ');
      clear(site).append(...(s.homepage ? [h('a', { href: s.homepage, target: '_blank', rel: 'noopener noreferrer' }, 'The station’s website', ic('ExternalLink'))] : []));
      status.textContent = v.state === 'connecting' ? 'Connecting…' : v.state === 'playing' ? (v.buffering ? 'Playing — waiting for the stream…' : 'Playing')
        : v.state === 'paused' ? 'Paused' : v.state === 'failed' ? `Did not play: ${v.reason}.` : 'Stopped';
      status.className = `wr-status wr-${v.state}`;
      const fav = isFav(s.id);
      star.classList.toggle('on', fav); star.setAttribute('aria-pressed', String(fav));
      star.setAttribute('aria-label', fav ? `Take ${s.name} off your favourites` : `Add ${s.name} to your favourites`); star.title = star.getAttribute('aria-label')!;
    }
    noteEl.textContent = v.note; noteEl.hidden = !v.note;
    const on = v.state === 'playing' || v.state === 'connecting';
    setBtn(playB, on ? 'Pause' : 'Play', on ? 'Pause' : 'Play');
    playB.title = on ? 'Pause (the stream is let go; Play connects again, live)' : 'Play';
    prevB.disabled = !s || v.index <= 0; nextB.disabled = !s || v.index >= v.list.length - 1; stopB.disabled = !s || v.state === 'idle';
    if (!v.sleepAt && sleepSel.value !== '0') sleepSel.value = '0';
    sleepLine.textContent = v.sleepAt ? `Stops at ${new Date(v.sleepAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} (the sound fades out first)` : '';
  };

  // ------------------------------------------------------------------ the stations
  const picks = h('div', { class: 'wr-picks', role: 'group', 'aria-label': 'Quick picks' });
  const favChip = h('button', { type: 'button', class: 'wr-chip', 'aria-pressed': 'false', onclick: () => choose({ kind: 'fav' }) });
  picks.append(favChip, ...R.PICKS.map((p) => h('button', { type: 'button', class: 'wr-chip', 'data-pick': p.id, 'aria-pressed': 'false', onclick: () => choose({ kind: 'pick', id: p.id }) }, p.name)));
  const nameBox = input({ type: 'search', placeholder: 'A station’s name', attrs: { 'aria-label': 'Search stations by name', enterkeyhint: 'search', maxlength: 100, autocomplete: 'off', spellcheck: 'false' } });
  nameBox.addEventListener('input', () => { clearTimeout(typing); typing = window.setTimeout(search, 450); });
  nameBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(typing); search(); } });
  const ccSel = h('select', { class: 'input select', 'aria-label': 'Country' });
  const langSel = h('select', { class: 'input select', 'aria-label': 'Language' });
  const tagSel = h('select', { class: 'input select', 'aria-label': 'Genre' });
  const orderSel = select<NonNullable<R.Query['order']>>([['clickcount', 'Most listened'], ['votes', 'Most liked'], ['name', 'A → Z'], ['random', 'Surprise me']], q.order ?? 'clickcount', () => search(), 'Order');
  for (const s of [ccSel, langSel, tagSel]) s.addEventListener('change', () => search());
  const fillSelects = () => {
    const opt = (value: string, text: string) => h('option', { value }, text);
    const keep = (sel: HTMLSelectElement, v: string) => { sel.value = v; if (sel.value !== v) sel.value = ''; };
    clear(ccSel).append(opt('', 'Any country'), ...(lists?.countries ?? []).map((c) => opt(c.cc, `${c.name} (${num(c.stations)})`)));
    const group = (label: string, xs: R.Named[]) => (xs.length ? h('optgroup', { label }, xs.map((x) => opt(x.value, `${x.name} (${num(x.stations)})`))) : null);
    const L = lists?.langs ?? [], T = lists?.tags ?? [];
    clear(langSel).append(opt('', 'Any language'), group('Languages of India', INDIAN_LANGS.map((v) => L.find((x) => x.value === v)).filter((x): x is R.Named => !!x)) ?? '', group('All languages', L) ?? '');
    clear(tagSel).append(opt('', 'Any genre'), group('Indian', INDIAN_TAGS.map((v) => T.find((x) => x.value === v)).filter((x): x is R.Named => !!x)) ?? '', group('All genres', T) ?? '');
    keep(ccSel, q.cc ?? ''); keep(langSel, q.lang ?? ''); keep(tagSel, q.tag ?? '');
  };
  fillSelects();
  nameBox.value = q.name ?? '';
  const searchBox = h('div', { class: 'wr-search' },
    field('Name', nameBox), field('Country', ccSel), field('Language', langSel), field('Genre', tagSel), field('Order', orderSel));
  const listTitle = h('h3', { class: 'wr-list-title' });
  const listState = h('p', { class: 'small muted wr-list-state', role: 'status', 'aria-live': 'polite' });
  const listEl = h('ul', { class: 'wr-list', 'aria-label': 'Stations' });
  const moreB = button('More stations', () => load(true), { icon: 'ChevronDown' });
  const errBox = h('div', { class: 'wr-err' });
  const listCard = card('Stations', picks, searchBox, h('div', { class: 'wr-list-head' }, listTitle, listState), errBox, listEl, h('div', { class: 'row' }, moreB));
  const about = note(h('div', { class: 'wr-about' },
    h('p', null, 'Stations from Radio Browser — a free directory of more than 50,000 stations, kept by its community. The sound comes straight from each station’s own server (about 30 – 60 MB an hour); playing a station adds one to its count of listeners there, and nothing else is sent. A station that streams only over plain HTTP cannot play on a secure page such as this one.'),
    h('a', { class: 'btn btn-sm btn-ghost', href: 'https://www.radio-browser.info/', target: '_blank', rel: 'noopener noreferrer' }, 'radio-browser.info', ic('ExternalLink'))));
  root.append(nowCard, listCard, about);

  // the rows, updated in place as the player changes (the focus stays where it is)
  const rows = new Map<string, { li: HTMLElement; st: HTMLElement; fav: HTMLElement }>();
  const rowOf = (s: Station, i: number) => {
    // the button is named by what it shows (WCAG 2.5.3): the station, its details, whether it plays or why it did not
    const st = h('span', { class: 'wr-row-state small' });
    const main = h('button', { type: 'button', class: 'wr-row-main', title: `Play ${s.name}`, onclick: () => playFrom(i) },
      h('span', { class: 'radio-letter', style: `--hue:${R.hueOf(s.name)}`, 'aria-hidden': 'true' }, R.letterOf(s.name)),
      h('span', { class: 'wr-row-text' }, h('span', { class: 'wr-row-name' }, s.name),
        h('span', { class: 'wr-row-meta small' }, [metaOf(s), R.formatOf(s)].filter(Boolean).join(' · ')), st));
    const fav = h('button', { type: 'button', class: 'btn btn-ghost btn-icon wr-row-star', onclick: () => toggleFav(s) });
    const li = h('li', { class: 'wr-row' }, main, fav);
    rows.set(s.id, { li, st, fav });
    paint(s.id);
    return li;
  };
  const paint = (id: string) => {
    const r = rows.get(id); if (!r) return;
    const v = P.view(), cur = v.station?.id === id, why = P.failedWhy(id);
    const live = cur && v.state !== 'idle' && v.state !== 'failed';
    const down = !why && source.kind === 'fav' && favOk.get(id) === false;
    r.li.classList.toggle('wr-on', live); r.li.classList.toggle('wr-failed', !!why || down);
    if (live) r.li.setAttribute('aria-current', 'true'); else r.li.removeAttribute('aria-current');
    r.st.textContent = live ? (v.state === 'connecting' ? 'Connecting…' : v.state === 'paused' ? 'Paused' : 'Playing') : why ? `Did not play: ${why}`
      : down ? 'The directory could not reach it at its last check — it may be off the air' : '';
    r.st.hidden = !r.st.textContent;
    const name = r.li.querySelector('.wr-row-name')?.textContent ?? '';
    const fav = isFav(id);
    r.fav.classList.toggle('on', fav); r.fav.setAttribute('aria-pressed', String(fav));
    r.fav.setAttribute('aria-label', fav ? `Take ${name} off your favourites` : `Add ${name} to your favourites`); r.fav.title = r.fav.getAttribute('aria-label')!;
    if (!r.fav.firstChild) r.fav.append(ic('Star'));
  };
  const paintAll = () => { for (const id of rows.keys()) paint(id); };
  const playFrom = (i: number) => { if (shown[i]) { favPlay = source.kind === 'fav'; P.play(shown, i); } };

  const titleOf = (): string => {
    if (source.kind === 'fav') return 'Your favourites';
    if (source.kind === 'pick') { const id = source.id; return R.PICKS.find((p) => p.id === id)?.name ?? ''; }
    const x = source.q, parts: string[] = [];
    if (x.name) parts.push(`named “${x.name}”`);
    if (x.cc) parts.push(`in ${(lists?.countries.find((c) => c.cc === x.cc)?.name) ?? regionName(x.cc) ?? x.cc}`);
    if (x.lang) parts.push(`in ${cap(x.lang)}`);
    if (x.tag) parts.push(`— ${cap(x.tag)}`);
    const by = x.order === 'votes' ? 'most liked first' : x.order === 'name' ? 'A → Z' : x.order === 'random' ? 'in no order' : 'most listened first';
    return `Stations ${parts.join(' ') || 'of the world'}, ${by}`;
  };
  const drawChips = () => {
    favChip.textContent = `★ Your favourites (${worldradioSettings.get().favourites.length})`;
    for (const b of picks.querySelectorAll<HTMLElement>('.wr-chip')) {
      const on = b === favChip ? source.kind === 'fav' : source.kind === 'pick' && b.dataset.pick === source.id;
      b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on);
    }
  };
  const drawList = (added: Station[] | null = null) => {
    listTitle.textContent = titleOf();
    drawChips();
    if (!added) { rows.clear(); clear(listEl); shown.forEach((s, i) => listEl.append(rowOf(s, i))); }
    else { const start = shown.length - added.length; added.forEach((s, k) => listEl.append(rowOf(s, start + k))); }
    moreB.hidden = !more || source.kind === 'fav';
    listState.textContent = !shown.length
      ? source.kind === 'fav' ? 'No favourites yet — tap ☆ beside a station to keep it here (and on the Settings page).' : 'No station matches — try fewer filters, or another spelling.'
      : `${num(shown.length)} station${shown.length === 1 ? '' : 's'}${more && source.kind !== 'fav' ? ' — more below' : ''}`;
  };

  async function load(append = false) {
    ac?.abort();
    const my = (ac = new AbortController());
    clear(errBox);
    listState.textContent = append ? 'Fetching more stations…' : 'Fetching stations…';
    listEl.setAttribute('aria-busy', 'true');
    if (!append) moreB.hidden = true;
    try {
      const at = append ? offset : 0;
      let r: { stations: Station[]; more: boolean };
      if (source.kind === 'fav') r = { stations: favStations(), more: false };
      else if (source.kind === 'pick') { const id = source.id; r = await R.pickStations(R.PICKS.find((p) => p.id === id) ?? R.PICKS[0], at, { signal: my.signal }); }
      else r = await R.searchAll([{ ...source.q, offset: at }], { signal: my.signal });
      if (gone || my !== ac) return;
      const add = append ? r.stations.filter((s) => !shown.some((x) => x.id === s.id)) : r.stations;
      shown = append ? [...shown, ...add] : r.stations;
      offset = at + R.PAGE; more = r.more; loaded = true;
      drawList(append ? add : null);
      if (source.kind === 'fav') void freshFavs();
    } catch (e) {
      if (gone || my !== ac || (e as Error)?.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : String(e);
      listState.textContent = '';
      clear(errBox).append(note(h('span', null, msg, ' ', button('Try again', () => load(append), { small: true, icon: 'RotateCcw' })), 'err'));
    } finally { if (my === ac) listEl.removeAttribute('aria-busy'); }
  }
  async function freshFavs() {
    favAc?.abort();
    const my = (favAc = new AbortController());
    try {
      const changed = await refreshFavs(my.signal);
      if (gone || my !== favAc || source.kind !== 'fav') return;
      if (changed) { shown = favStations(); drawList(); } else paintAll();
    } catch { /* the stored addresses are played as they are */ }
  }
  function choose(s: Source) {
    source = s; offset = 0;
    if (s.kind !== 'search') { q = { order: 'clickcount' }; nameBox.value = ''; ccSel.value = ''; langSel.value = ''; tagSel.value = ''; orderSel.value = 'clickcount'; }
    void load();
  }
  function search() {
    q = { name: nameBox.value.trim() || undefined, cc: ccSel.value || undefined, lang: langSel.value || undefined, tag: tagSel.value || undefined, order: orderSel.value as R.Query['order'] };
    if (!q.name && !q.cc && !q.lang && !q.tag && q.order === 'clickcount') { choose({ kind: 'pick', id: 'india' }); return; } // back to the start: India first
    choose({ kind: 'search', q: { ...q } });
  }

  // ------------------------------------------------------------------ follow the player and the store
  offs.push(P.subscribe(() => { if (!gone) { drawNow(); paintAll(); } }));
  offs.push(worldradioSettings.on(() => {
    if (gone) return;
    const k = worldradioSettings.get();
    keepT.checked = k.keep;
    if (!isIOS && Math.round(k.volume * 100) !== vol.value) vol.value = Math.round(k.volume * 100);
    drawChips();
    if (source.kind === 'fav' && k.favourites.map((f) => f.id).join() !== shown.map((s) => s.id).join()) { shown = favStations(); drawList(); } else paintAll();
    const ids = k.favourites.map((f) => f.id).join();
    if (favPlay && ids !== favIds) P.relist(favStations()); // Next and Previous move in the favourites as they are now
    favIds = ids;
    drawNow();
  }));

  drawNow();
  if (loaded) { if (source.kind === 'fav') shown = favStations(); drawList(); if (source.kind === 'fav') void freshFavs(); } else void load();
  if (!lists) {
    void Promise.all([
      R.directory('/json/countries?hidebroken=true'),
      R.directory('/json/languages?order=stationcount&reverse=true&hidebroken=true&limit=300'),
      R.directory('/json/tags?order=stationcount&reverse=true&hidebroken=true&limit=300'),
    ]).then(([c, l, t]) => {
      const byName = (a: R.Named, b: R.Named) => a.name.localeCompare(b.name);
      lists = { countries: R.countriesOf(c, regionName), langs: R.namedOf(l, 5).sort(byName), tags: R.namedOf(t, 15).sort(byName) };
      if (!gone) { fillSelects(); if (source.kind === 'search') listTitle.textContent = titleOf(); }
    }).catch(() => { /* the boxes keep "Any …": tried again when the tab is opened again */ });
  }

  return () => { gone = true; ac?.abort(); favAc?.abort(); clearTimeout(typing); offs.forEach((f) => f()); };
};
