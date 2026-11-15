import './styles.css';
import { CATEGORIES, TOOLS, TOOL_BY_ID, type Tool, type CatId } from './registry';
import { searchTools } from './search';
import { h, ic, clear, errMsg, type Cleanup } from './ui';
import { isMobile } from './platform';

const available = (t: Tool) => t.platform === 'both' || (t.platform === 'pc') !== isMobile;
const visible = TOOLS.filter(available);
const toolsIn = (cat: CatId) => visible.filter((t) => t.cat === cat);
const cats = CATEGORIES.filter((c) => toolsIn(c.id).length);
const lastInCat = new Map<CatId, string>(); // in-memory only (stateless app)

// ------------------------------------------------------------------ layout
const searchInput = h('input', {
  class: 'search-input', type: 'search', placeholder: isMobile ? 'Search tools…' : 'Search tools…  ( / )',
  'aria-label': 'Search tools', autocomplete: 'off', enterkeyhint: 'go', spellcheck: 'false',
});
const results = h('div', { class: 'search-results', role: 'listbox', hidden: true });
const search = h('div', { class: 'search' }, h('span', { class: 'search-ic', html: '' }, ic('Search')), searchInput, results);

const catBar = h('nav', { class: 'tabs tabs-cat', role: 'tablist', 'aria-label': 'Categories' });
const toolBar = h('nav', { class: 'tabs tabs-tool', role: 'tablist', 'aria-label': 'Tools' });
const view = h('main', { class: 'view', id: 'view' });

const app = document.getElementById('app')!;
app.append(
  h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'Utils home' }, h('span', { class: 'brand-mark' }, ic('LayoutGrid')), h('span', { class: 'brand-name' }, 'Utils')),
    search,
    h('span', { class: 'privacy', title: 'Everything runs in your browser. Files never leave your device.' }, ic('ShieldCheck'), h('span', null, 'Private · on-device'))),
  h('div', { class: 'navwrap' }, catBar, toolBar),
  view,
);

// ------------------------------------------------------------------ tabs
let current: Tool | null = null;
let cleanup: Cleanup | null = null;
let abort: AbortController | null = null;

function renderTabs(active: Tool) {
  clear(catBar).append(...cats.map((c) => h('button', {
    class: ['tab', c.id === active.cat && 'on'], role: 'tab', 'aria-selected': String(c.id === active.cat),
    onclick: () => go(lastInCat.get(c.id) || toolsIn(c.id)[0].id),
  }, ic(c.icon), h('span', null, c.title))));
  clear(toolBar).append(...toolsIn(active.cat).map((t) => h('a', {
    class: ['tab', 'tab-tool', t.id === active.id && 'on'], role: 'tab', href: `#/${t.id}`, 'aria-selected': String(t.id === active.id),
  }, ic(t.icon), h('span', null, t.title))));
  for (const bar of [catBar, toolBar]) {
    const on = bar.querySelector<HTMLElement>('.on');
    if (on) {
      // keep the active tab in view on swipeable rows (phones) without moving the page
      const left = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;
      bar.scrollTo({ left, behavior: 'instant' as ScrollBehavior });
    }
  }
}

async function show(tool: Tool) {
  if (current?.id === tool.id) return;
  try { cleanup?.(); } catch (e) { console.error(e); }
  abort?.abort();
  cleanup = null;
  current = tool;
  lastInCat.set(tool.cat, tool.id);
  renderTabs(tool);
  document.title = `${tool.title} · Utils`;

  const body = h('div', { class: 'tool-body' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading…'));
  clear(view).append(
    h('div', { class: 'tool-head' },
      h('div', { class: 'tool-head-ic' }, ic(tool.icon)),
      h('div', null,
        h('h1', { class: 'tool-title' }, tool.title, tool.platform !== 'both' ? h('span', { class: 'badge' }, tool.platform === 'pc' ? 'PC only' : 'Mobile only') : null),
        h('p', { class: 'tool-desc' }, tool.desc))),
    body,
  );
  window.scrollTo({ top: 0 });

  if (!available(tool)) {
    const msg = tool.platform === 'pc' ? 'This tool is available on desktop browsers only.' : 'This tool needs a phone (it uses motion sensors or a touchscreen).';
    clear(body).append(h('div', { class: 'note note-warn' }, ic(tool.platform === 'pc' ? 'Monitor' : 'Smartphone'), h('div', null, msg)));
    return;
  }
  const ac = new AbortController();
  abort = ac;
  try {
    const mount = await tool.load();
    if (current !== tool) return;
    clear(body);
    const r = await mount(body, { isMobile, signal: ac.signal });
    if (current !== tool) { if (typeof r === 'function') r(); return; }
    if (typeof r === 'function') cleanup = r;
  } catch (e) {
    console.error(e);
    if (current === tool) clear(body).append(h('div', { class: 'note note-err' }, ic('TriangleAlert'), h('div', null, `Could not load this tool: ${errMsg(e)}`)));
  }
}

function route() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, '').split(/[?&]/)[0]);
  const tool = TOOL_BY_ID.get(id);
  if (tool) show(tool); // unavailable tools show an explanation instead of the tool
  else go(visible[0].id, true);
}

export function go(id: string, replace = false) {
  const url = `#/${id}`;
  if (location.hash === url) { route(); return; }
  if (replace) { history.replaceState(null, '', url); route(); }
  else location.hash = url;
}

window.addEventListener('hashchange', route);

// ------------------------------------------------------------------ search
let hits: Tool[] = [];
let sel = 0;
function renderResults() {
  const q = searchInput.value;
  hits = searchTools(visible, q).slice(0, 12);
  sel = Math.min(sel, Math.max(0, hits.length - 1));
  results.hidden = !q.trim();
  clear(results).append(...(hits.length ? hits.map((t, i) => {
    const cat = CATEGORIES.find((c) => c.id === t.cat)!;
    return h('button', {
      class: ['result', i === sel && 'sel'], role: 'option', 'aria-selected': String(i === sel),
      onmousedown: (e: Event) => e.preventDefault(), onclick: () => pick(t),
    }, ic(t.icon), h('span', { class: 'result-text' }, h('strong', null, t.title), h('small', null, `${cat.title} · ${t.desc}`)));
  }) : [h('div', { class: 'result-empty' }, 'No matching tool')]));
}
function pick(t: Tool) {
  searchInput.value = '';
  results.hidden = true;
  searchInput.blur();
  go(t.id);
}
searchInput.addEventListener('input', () => { sel = 0; renderResults(); });
searchInput.addEventListener('focus', () => { if (searchInput.value) renderResults(); });
searchInput.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 120));
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); if (!hits.length) renderResults(); if (hits[sel]) pick(hits[sel]); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, hits.length - 1); renderResults(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); renderResults(); }
  else if (e.key === 'Escape') { searchInput.value = ''; results.hidden = true; searchInput.blur(); }
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

route();
