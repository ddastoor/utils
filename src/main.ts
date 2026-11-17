import './styles.css';
import { CATEGORIES, TOOLS, TOOL_BY_ID, type Tool, type CatId } from './registry';
import { searchTools, initSearch } from './search';
import { releaseAll, setIdle } from './lifecycle';
import { h, ic, clear, errMsg, toast, type Cleanup } from './ui';
import { isMobile } from './platform';
import { favs, isFav, toggleFav, onFavChange } from './favorites';

const available = (t: Tool) => t.platform === 'both' || (t.platform === 'pc') !== isMobile;
const visible = TOOLS.filter(available);
const toolsIn = (cat: CatId) => visible.filter((t) => t.cat === cat);
const cats = CATEGORIES.filter((c) => toolsIn(c.id).length);
const favTools = () => favs().map((id) => TOOL_BY_ID.get(id)).filter((t): t is Tool => !!t && available(t));

/** What the two tab rows show. 'all' = home, 'fav' = favourites, or a category id. */
type Section = 'all' | 'fav' | CatId;
type Route = { kind: 'home' } | { kind: 'section'; section: Section } | { kind: 'tool'; tool: Tool; from?: 'fav' };

// ------------------------------------------------------------------ layout
const searchInput = h('input', {
  class: 'search-input', type: 'search', placeholder: isMobile ? 'Search 170+ tools…' : 'Search tools…  ( / )',
  'aria-label': 'Search tools', autocomplete: 'off', enterkeyhint: 'go', spellcheck: 'false',
});
const results = h('div', { class: 'search-results', role: 'listbox', hidden: true });
const search = h('div', { class: 'search' }, h('span', { class: 'search-ic' }, ic('Search')), searchInput, results);
const catBar = h('nav', { class: 'tabs tabs-cat', role: 'tablist', 'aria-label': 'Categories' });
const toolBar = h('nav', { class: 'tabs tabs-tool', role: 'tablist', 'aria-label': 'Tools' });
const view = h('main', { class: 'view', id: 'view' });

document.getElementById('app')!.append(
  h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'SuperTools home' }, h('span', { class: 'brand-mark' }, ic('Zap')), h('span', { class: 'brand-name' }, 'SuperTools')),
    search,
    h('span', { class: 'privacy', title: 'Everything runs in your browser. Files never leave your device.' }, ic('ShieldCheck'), h('span', null, 'Private · on-device'))),
  h('div', { class: 'navwrap' }, catBar, toolBar),
  view,
);

// ------------------------------------------------------------------ tab rows
let lastSection: Section = 'all';
const lastInSection = new Map<Section, string>(); // in-memory only

function centerActive(bar: HTMLElement) {
  const on = bar.querySelector<HTMLElement>('.on');
  if (on) bar.scrollTo({ left: on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2, behavior: 'instant' as ScrollBehavior });
}

function renderTabs(section: Section, activeTool?: Tool) {
  const favCount = favTools().length;
  const sectionTab = (id: Section, title: string, icon: string, extra?: string) => h('a', {
    class: ['tab', id === section && 'on', id === 'fav' && 'tab-fav'], role: 'tab', 'aria-selected': String(id === section),
    href: id === 'all' ? '#/' : `#/c/${id}`,
  }, ic(icon), h('span', null, title), extra ? h('span', { class: 'tab-count' }, extra) : null);
  clear(catBar).append(
    sectionTab('all', 'All', 'LayoutGrid'),
    sectionTab('fav', 'Favorites', 'Star', favCount ? String(favCount) : undefined),
    ...cats.map((c) => sectionTab(c.id, c.title, c.icon)),
  );
  const list = section === 'all' ? [] : section === 'fav' ? favTools() : toolsIn(section);
  toolBar.hidden = !list.length;
  clear(toolBar).append(...list.map((t) => h('a', {
    class: ['tab', 'tab-tool', t.id === activeTool?.id && 'on'], role: 'tab', 'aria-selected': String(t.id === activeTool?.id),
    href: section === 'fav' ? `#/${t.id}?from=fav` : `#/${t.id}`,
  }, ic(t.icon), h('span', null, t.title))));
  centerActive(catBar); centerActive(toolBar);
}

// ------------------------------------------------------------------ star button & tiles
function starButton(t: Tool, cls = 'star') {
  const b = h('button', { type: 'button', class: [cls, isFav(t.id) && 'on'], 'aria-pressed': String(isFav(t.id)), title: isFav(t.id) ? 'Remove from favorites' : 'Add to favorites' }, ic('Star'));
  b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const on = toggleFav(t.id);
    toast(on ? `★ ${t.title} added to Favorites` : `${t.title} removed from Favorites`, on ? 'ok' : 'info', 1800);
  });
  return b;
}

function tile(t: Tool, from?: 'fav') {
  return h('a', { class: 'tile', href: `#/${t.id}${from ? '?from=fav' : ''}` },
    h('span', { class: 'tile-ic' }, ic(t.icon)),
    h('span', { class: 'tile-text' }, h('strong', null, t.title, t.platform !== 'both' ? h('span', { class: 'badge' }, t.platform === 'pc' ? 'PC' : 'Mobile') : null), h('small', null, t.desc)),
    starButton(t, 'star tile-star'));
}

function favEmpty() {
  return h('div', { class: 'empty' }, h('span', { class: 'empty-ic' }, ic('Star')), h('strong', null, 'No favorites yet'),
    h('p', { class: 'muted' }, 'Tap the ☆ star on any tool (on its page or its card) to pin it here for quick access. Favorites are saved only in this browser.'));
}

// ------------------------------------------------------------------ views
let current: Route = { kind: 'home' };
let currentKey = ''; // the tool's hash without ?from= (see showTool)
let cleanup: Cleanup | null = null;
let abort: AbortController | null = null;
let currentTool: Tool | null = null;
let nav = 0; // bumped on every navigation: a tool whose code arrives after the user moved on (even back to the same tool) is not mounted

function teardown() {
  try { cleanup?.(); } catch (e) { console.error(e); }
  abort?.abort();
  cleanup = null; abort = null; currentTool = null; nav++;
  releaseAll(); // workers, wasm instances, models and caches of the tool we are leaving (src/lifecycle.ts)
}

function showHome() {
  teardown(); setIdle(true);
  lastSection = 'all';
  renderTabs('all');
  document.title = 'SuperTools';
  const fv = favTools();
  clear(view).append(
    h('section', { class: 'home-hero' },
      h('h1', null, 'SuperTools'),
      h('p', { class: 'muted' }, `${visible.length} private tools that run entirely in your browser. Browse by category, search, or star your favorites.`)),
    h('section', { class: 'home-sec' }, h('h2', { class: 'sec-title' }, ic('Star'), 'Favorites'), fv.length ? h('div', { class: 'tiles' }, fv.map((t) => tile(t, 'fav'))) : favEmpty()),
    ...cats.map((c) => h('section', { class: 'home-sec' },
      h('h2', { class: 'sec-title' }, ic(c.icon), h('a', { href: `#/c/${c.id}` }, c.title), h('span', { class: 'sec-count' }, String(toolsIn(c.id).length))),
      h('div', { class: 'tiles' }, toolsIn(c.id).map((t) => tile(t))))),
  );
  window.scrollTo({ top: 0 });
}

function showSection(section: Section) {
  if (section === 'all') { showHome(); return; }
  teardown(); setIdle(true);
  lastSection = section;
  renderTabs(section);
  const cat = CATEGORIES.find((c) => c.id === section);
  const title = section === 'fav' ? 'Favorites' : cat!.title;
  document.title = `${title} · SuperTools`;
  const list = section === 'fav' ? favTools() : toolsIn(section);
  clear(view).append(
    h('div', { class: 'tool-head' }, h('div', { class: 'tool-head-ic' }, ic(section === 'fav' ? 'Star' : cat!.icon)),
      h('div', null, h('h1', { class: 'tool-title' }, title), h('p', { class: 'tool-desc' }, section === 'fav' ? 'Your starred tools.' : `${list.length} tools`))),
    list.length ? h('div', { class: 'tiles' }, list.map((t) => tile(t, section === 'fav' ? 'fav' : undefined))) : favEmpty(),
  );
  window.scrollTo({ top: 0 });
}

async function showTool(tool: Tool, from?: 'fav') {
  const section: Section = from === 'fav' && isFav(tool.id) ? 'fav' : tool.cat;
  // same tab: keep it, unless its own parameters changed (e.g. #/sharelink?d=… → #/sharelink "New message"); ?from= only picks the tab row
  const key = location.hash.replace(/([?&])from=[^&]*&?/, '$1').replace(/[?&]$/, '');
  if (currentTool?.id === tool.id && key === currentKey) { renderTabs(section, tool); return; }
  currentKey = key;
  teardown(); setIdle(!available(tool));
  currentTool = tool;
  lastSection = section;
  lastInSection.set(section, tool.id);
  renderTabs(section, tool);
  document.title = `${tool.title} · SuperTools`;

  const body = h('div', { class: 'tool-body' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading…'));
  clear(view).append(
    h('div', { class: 'tool-head' },
      h('div', { class: 'tool-head-ic' }, ic(tool.icon)),
      h('div', { class: 'tool-head-text' },
        h('h1', { class: 'tool-title' }, tool.title, tool.platform !== 'both' ? h('span', { class: 'badge' }, tool.platform === 'pc' ? 'PC only' : 'Mobile only') : null),
        h('p', { class: 'tool-desc' }, tool.desc)),
      available(tool) ? starButton(tool, 'star head-star') : null), // a tool hidden on this device could never show up in its Favorites
    body,
  );
  window.scrollTo({ top: 0 });

  if (!available(tool)) {
    const msg = tool.platform === 'pc' ? 'This tool is available on desktop browsers only.' : 'This tool is made for phones (it uses the phone’s camera, motion sensors or touchscreen) — open it on your phone.';
    clear(body).append(h('div', { class: 'note note-warn' }, ic(tool.platform === 'pc' ? 'Monitor' : 'Smartphone'), h('div', null, msg)));
    return;
  }
  const ac = new AbortController();
  abort = ac;
  const my = nav;
  try {
    const mount = await tool.load();
    if (my !== nav) return;
    clear(body);
    const r = await mount(body, { isMobile, signal: ac.signal });
    if (my !== nav) { if (typeof r === 'function') r(); return; }
    if (typeof r === 'function') cleanup = r;
  } catch (e) {
    console.error(e);
    // a failed download of the tool's code is remembered by the browser for this page, so "try again" = reload (same tab reopens)
    if (my === nav) clear(body).append(h('div', { class: 'note note-err' }, ic('TriangleAlert'), h('div', null,
      h('div', null, `Could not load this tool: ${errMsg(e)}`),
      h('div', { class: 'muted' }, 'Check your internet connection, then try again.'),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => location.reload() }, 'Try again'))));
  }
}

function parse(): Route {
  let raw = location.hash.replace(/^#\/?/, '');
  try { raw = decodeURIComponent(raw); } catch { /* a malformed %-sequence (hand-edited or cut-off link): use it as typed → home */ }
  const [path, query = ''] = raw.split('?');
  if (!path) return { kind: 'home' };
  const m = /^c\/(\w+)$/.exec(path);
  if (m) {
    const s = m[1] as Section;
    if (s === 'fav' || s === 'all' || cats.some((c) => c.id === s)) return { kind: 'section', section: s };
    return { kind: 'home' };
  }
  const tool = TOOL_BY_ID.get(path);
  if (tool) return { kind: 'tool', tool, from: /(^|&)from=fav/.test(query) ? 'fav' : undefined };
  return { kind: 'home' };
}

function route() {
  current = parse();
  if (current.kind === 'home') showHome();
  else if (current.kind === 'section') showSection(current.section);
  else showTool(current.tool, current.from);
}
window.addEventListener('hashchange', route);

onFavChange(() => {
  // refresh counts, tab rows and any visible star buttons / lists
  if (current.kind === 'tool') {
    renderTabs(lastSection === 'fav' && !isFav(current.tool.id) ? current.tool.cat : lastSection, current.tool);
    document.querySelectorAll<HTMLElement>('.head-star').forEach((b) => { const on = isFav(current.kind === 'tool' ? current.tool.id : ''); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  } else route();
});

// ------------------------------------------------------------------ search
let hits: Tool[] = [];
let sel = 0;
// the search engine (textcore.wasm, ranking in C) loads the first time the search box is used, not at start-up
let searchReady: Promise<void> | null = null;
const ensureSearch = () => (searchReady ||= initSearch().catch((e) => { searchReady = null; throw e; }));
function renderResults() {
  const q = searchInput.value;
  hits = searchTools(visible, q).slice(0, 12);
  sel = Math.max(0, Math.min(sel, hits.length - 1));
  results.hidden = !q.trim();
  clear(results).append(...(hits.length ? hits.map((t, i) => {
    const cat = CATEGORIES.find((c) => c.id === t.cat)!;
    return h('button', {
      class: ['result', i === sel && 'sel'], role: 'option', 'aria-selected': String(i === sel),
      onmousedown: (e: Event) => e.preventDefault(), onclick: () => pick(t),
    }, ic(t.icon), h('span', { class: 'result-text' }, h('strong', null, t.title, isFav(t.id) ? ' ★' : ''), h('small', null, `${cat.title} · ${t.desc}`)));
  }) : [h('div', { class: 'result-empty' }, 'No matching tool')]));
}
function closeSearch() { searchInput.value = ''; hits = []; sel = 0; results.hidden = true; }
function pick(t: Tool) {
  closeSearch();
  searchInput.blur();
  location.hash = `#/${t.id}`;
}
searchInput.addEventListener('input', async () => { sel = 0; await ensureSearch(); renderResults(); });
searchInput.addEventListener('focus', () => { ensureSearch().then(() => { if (searchInput.value) renderResults(); }); });
searchInput.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 120));
searchInput.addEventListener('keydown', async (e) => {
  if (e.isComposing) return; // Enter that confirms an IME composition is not "open the top match"
  if (e.key === 'Enter') { e.preventDefault(); await ensureSearch(); renderResults(); if (hits[sel]) pick(hits[sel]); } // always rank what is in the box now
  else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.max(0, Math.min(sel + 1, hits.length - 1)); renderResults(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); renderResults(); }
  else if (e.key === 'Escape') { closeSearch(); searchInput.blur(); }
});
document.addEventListener('keydown', (e) => {
  const tgt = e.target as HTMLElement;
  const typing = tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName));
  if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// A file dropped beside a drop zone must not make the browser open it in place of the app (losing the work in the tab).
for (const type of ['dragover', 'drop'] as const) window.addEventListener(type, (e) => {
  if (e.defaultPrevented || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; // a drop zone took it / not a file
  e.preventDefault();
  if (type === 'dragover') e.dataTransfer.dropEffect = 'none';
});

route();
