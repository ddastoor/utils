// World Clock (potentials #73; owner, 21 Nov 2026: "a world clock with live ticking of time … standard presets, city presets, all
// the important ones. Definitely like New York, San Francisco, London, Mumbai, Sydney, Hong Kong, Singapore … use the common code
// from time converter"). A card per city, ticking by the second: its time (a dial and the digits), date and day against yours, how
// far it is from your time, its zone (UTC offset, abbreviation, name), sunrise and sunset there and whether it is day or night,
// and its next clock change. Sets of cities, any city or zone added by search, removed, moved; 12 or 24 hours; a slider to look
// some hours ahead or back. The list is kept while the page is open and carried in the address (#/worldclock?c=…) — nothing is
// stored. Cities, sun and words: src/lib/worldclock.ts; the zones: the browser's Intl through src/lib/tz.ts; the sun: mathcore.
import { h, card, button, ic, note, type Mount } from '../ui';
import { mathcore } from '../wasm/mathcore';
import type { bindTextcore } from '../wasm/textcore';
import { localZone, zoneOffset, zoneLabel } from '../lib/tz';
import * as W from '../lib/worldclock';
import { worldclockSettings } from '../settings';
import './worldclock.css';

type Textcore = ReturnType<typeof bindTextcore>;
// the cities and the clock are the Settings' (to-do #39: kept in this browser, in the settings file); the list also rides in the address
// (a link shows its own list, which becomes yours once you change it)
const SHOWN = 8; // suggestions under the search box
const MIN = 60_000, DAY = 86_400_000;
const setIds = (id: string) => [...W.SETS.find((s) => s.id === id)!.ids];
const localH24 = () => { try { return /h2[34]/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle || ''); } catch { return false; } };

const DIAL = `<svg viewBox="0 0 100 100" class="wc-dial" aria-hidden="true" focusable="false"><circle class="wc-face" cx="50" cy="50" r="47"/>${Array.from({ length: 12 }, (_, i) => `<line class="wc-tick${i % 3 ? '' : ' wc-tick-q'}" x1="50" y1="${i % 3 ? 8 : 7}" x2="50" y2="${i % 3 ? 13 : 16}" transform="rotate(${i * 30} 50 50)"/>`).join('')}<line class="wc-h" x1="50" y1="53" x2="50" y2="27"/><line class="wc-m" x1="50" y1="54" x2="50" y2="15"/><line class="wc-s" x1="50" y1="60" x2="50" y2="11"/><circle class="wc-pin" cx="50" cy="50" r="3.2"/></svg>`;

interface Card {
  id: string; place: W.Place | null; el: HTMLElement;
  time: HTMLElement; date: HTMLElement; gap: HTMLElement; zone: HTMLElement; sun: HTMLElement | null; change: HTMLElement; dayIc: HTMLElement | null;
  hands: [SVGElement, SVGElement, SVGElement];
  last: Record<string, string>; sunKey: string; sunDay: W.SunDay | null; change0: { from: number; c: W.Change | null } | null; upKey: string;
}

export const mount: Mount = async (root) => {
  const m = await mathcore();
  const urlIds = W.listFromHash(location.hash), urlH = W.hourFromHash(location.hash);
  const k0 = worldclockSettings.get();
  let ids: string[] = urlIds ?? k0.cities?.filter((id) => W.placeOf(id)) ?? setIds(W.DEFAULT_SET);
  let h24 = urlH !== null ? urlH === 24 : k0.h24 ?? localH24();
  let shift = 0, timer = 0, gone = false, seq = 0;
  let engine: { tc: Textcore; handle: number; places: W.Place[] } | null = null, building: Promise<void> | null = null;
  let undo: { ids: string[]; text: string } | null = null;
  const you = localZone();

  // ---------------------------------------------------------------- the address
  /** the list and the clock into the address — and into the Settings when you changed them (`keep`) */
  const writeUrl = (keep = true) => {
    if (keep) worldclockSettings.set({ cities: [...ids], h24: h24 !== localH24() ? h24 : null });
    const q = [`c=${W.encodeList(ids)}`, h24 !== localH24() ? `h=${h24 ? 24 : 12}` : ''].filter(Boolean).join('&');
    try { history.replaceState(history.state, '', `#/worldclock?${q}`); } catch { /* sandboxed: the list stays in memory */ }
  };
  const onHash = () => { if (location.hash.startsWith('#/worldclock') && W.listFromHash(location.hash) === null) writeUrl(false); };
  window.addEventListener('hashchange', onHash);

  // ---------------------------------------------------------------- status (what was added, removed, with Undo)
  const status = h('div', { class: 'wc-status small', role: 'status', 'aria-live': 'polite' });
  const say = (text: string, before?: string[]) => {
    undo = before ? { ids: before, text } : null;
    status.replaceChildren(h('span', null, text), ...(before ? [button('Undo', () => { if (!undo) return; ids = undo.ids; undo = null; status.replaceChildren(h('span', null, 'Undone.')); draw(); writeUrl(); }, { small: true, variant: 'ghost', icon: 'Undo2' })] : []));
  };

  // ---------------------------------------------------------------- the search
  const q = h('input', {
    class: 'input wc-q', type: 'search', placeholder: 'Add a city or zone: Tokyo, Pune, PST…', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go',
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'wc-sugg', 'aria-autocomplete': 'list', 'aria-label': 'Add a city or time zone',
  }) as HTMLInputElement;
  const sugg = h('ul', { class: 'wc-sugg', id: 'wc-sugg', role: 'listbox', 'aria-label': 'Cities and time zones', hidden: true });
  const searchNote = h('div', { class: 'muted small wc-search-note', 'aria-live': 'polite' });
  let found: W.Place[] = [], active = 0;
  const build = () => (building ||= (async () => {
    const tc = await (await import('../wasm/textcore')).textcore();
    const { recs, places } = W.searchRecords(Date.now());
    if (gone) return;
    engine = { tc, handle: tc.searchBuild(recs), places };
  })().catch((e) => { building = null; throw e; }));
  const close = () => { sugg.hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); };
  const showSugg = () => {
    const t = Date.now() + shift * MIN;
    sugg.replaceChildren(...found.map((p, i) => {
      const r = W.readingAt(p.zone, t), had = ids.includes(p.id);
      return h('li', {
        id: `wc-opt-${i}`, role: 'option', class: ['wc-opt', i === active && 'on'], 'aria-selected': String(i === active),
        onmousedown: (e: MouseEvent) => e.preventDefault(), onclick: () => add(p),
      }, h('span', { class: 'wc-opt-name' }, p.name), h('span', { class: 'wc-opt-where muted' }, p.where),
        h('span', { class: 'wc-opt-time' }, had ? 'added' : W.clockText(r, h24)));
    }));
    sugg.hidden = !found.length;
    q.setAttribute('aria-expanded', String(!sugg.hidden));
    if (found.length) q.setAttribute('aria-activedescendant', `wc-opt-${active}`); else q.removeAttribute('aria-activedescendant');
  };
  const find = async () => {
    const text = q.value.trim(), my = ++seq;
    if (!text) { found = []; close(); searchNote.textContent = ''; return; }
    if (!engine) {
      searchNote.textContent = 'Loading the list of cities…';
      try { await build(); } catch { if (my === seq && !gone) searchNote.textContent = 'The search could not be loaded — check your connection. It is tried again with the next key.'; return; }
      if (my !== seq || gone || !engine) return;
    }
    const e = engine!;
    found = e.tc.searchQuery(e.handle, W.fold(text), SHOWN).map((i) => e.places[i]);
    active = 0;
    searchNote.textContent = found.length ? '' : `Nothing found for “${text}”. Try a nearby large city, the country, or the zone (Europe/Lisbon, UTC+5:30, PST).`;
    showSugg();
  };
  const add = (p: W.Place) => {
    q.value = ''; found = []; close(); searchNote.textContent = '';
    if (ids.includes(p.id)) { say(`${p.name} is in the list already.`); cards.get(p.id)?.el.scrollIntoView({ block: 'nearest' }); flash(p.id); return; }
    const before = [...ids];
    ids = [...ids, p.id];
    draw(); writeUrl();
    say(`${p.name} added.`, before);
    cards.get(p.id)?.el.scrollIntoView({ block: 'nearest' });
    flash(p.id);
  };
  q.addEventListener('focus', () => { void build().catch(() => { /* said at the first key */ }); });
  q.addEventListener('input', () => void find());
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!found.length) return;
      e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length; showSugg();
      sugg.children[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { if (found[active]) { e.preventDefault(); add(found[active]); } }
    else if (e.key === 'Escape') { if (!sugg.hidden) { e.preventDefault(); close(); } else if (q.value) { e.preventDefault(); q.value = ''; void find(); } }
  });
  q.addEventListener('blur', () => setTimeout(close, 150));

  // ---------------------------------------------------------------- sets, 12 / 24 hours, looking ahead
  const sets = h('div', { class: 'wc-sets', role: 'group', 'aria-label': 'Sets of cities' });
  const drawSets = () => sets.replaceChildren(h('span', { class: 'muted small wc-sets-label' }, 'Sets:'), ...W.SETS.map((s) => {
    const on = s.ids.length === ids.length && s.ids.every((x, i) => ids[i] === x);
    return h('button', { type: 'button', class: ['wc-set', on && 'on'], 'aria-pressed': String(on), onclick: () => {
      if (on) return;
      const before = [...ids]; ids = [...s.ids]; draw(); writeUrl();
      say(`The set “${s.name}”: ${s.ids.length} cities.`, before);
    } }, s.name);
  }));
  const hours = h('div', { class: 'seg wc-hours', role: 'radiogroup', 'aria-label': 'Clock' });
  const drawHours = () => hours.replaceChildren(...([[false, '12 h'], [true, '24 h']] as Array<[boolean, string]>).map(([v, l]) =>
    h('button', { type: 'button', role: 'radio', class: ['seg-btn', v === h24 && 'on'], 'aria-checked': String(v === h24), onclick: () => { if (h24 === v) return; h24 = v; drawHours(); for (const c of cards.values()) c.last = {}; tick(); writeUrl(); if (found.length) showSugg(); } }, l)));
  const ahead = h('input', { type: 'range', class: 'range', min: -48, max: 48, step: 1, value: 0, 'aria-label': 'Look ahead or back' }) as HTMLInputElement;
  const aheadOut = h('output', { class: 'wc-ahead-val' }, 'Now');
  const nowBtn = button('Back to now', () => { ahead.value = '0'; setShift(0); }, { small: true, variant: 'ghost', icon: 'RotateCcw' });
  nowBtn.hidden = true;
  const setShift = (k: number) => {
    shift = k * 15;
    const a = Math.abs(shift), txt = `${Math.floor(a / 60) ? `${Math.floor(a / 60)} h` : ''}${a % 60 ? ` ${a % 60} min` : ''}`.trim();
    aheadOut.textContent = shift ? `${shift > 0 ? 'In' : ''} ${txt}${shift < 0 ? ' ago' : ''}`.trim() : 'Now';
    ahead.setAttribute('aria-valuetext', shift ? aheadOut.textContent : 'now');
    nowBtn.hidden = !shift; listEl.classList.toggle('wc-shifted', !!shift);
    tick();
  };
  ahead.addEventListener('input', () => setShift(+ahead.value));

  // ---------------------------------------------------------------- the cards
  const listEl = h('ul', { class: 'wc-list', 'aria-label': 'Clocks' });
  const cards = new Map<string, Card>();
  const flash = (id: string) => { const el = cards.get(id)?.el; if (!el) return; el.classList.remove('wc-flash'); void el.offsetWidth; el.classList.add('wc-flash'); };
  const move = (id: string, by: number) => {
    const i = ids.indexOf(id), j = i + by;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];[next[i], next[j]] = [next[j], next[i]]; ids = next;
    draw(); writeUrl();
    const p = W.placeOf(id); say(`${p?.name ?? id} moved ${by < 0 ? 'earlier' : 'later'}: ${j + 1} of ${ids.length}.`);
    (cards.get(id)?.el.querySelector(by < 0 ? '.wc-up' : '.wc-down') as HTMLButtonElement | null)?.focus();
  };
  const remove = (id: string) => {
    const i = ids.indexOf(id), before = [...ids], p = W.placeOf(id);
    ids = ids.filter((x) => x !== id); draw(); writeUrl();
    say(`${p?.name ?? id} removed.`, before);
    const next = ids[Math.min(i, ids.length - 1)];
    ((next && cards.get(next)?.el.querySelector('.wc-remove')) as HTMLElement | null ?? q).focus();
  };
  const makeCard = (id: string, mine: boolean): Card => {
    const place = mine ? null : W.placeOf(id);
    const name = mine ? 'You' : place!.name, where = mine ? `Your time zone: ${zoneLabel(you)}` : place!.where;
    const time = h('div', { class: 'wc-time' }), date = h('div', { class: 'wc-date' }), gap = h('div', { class: 'wc-gap' });
    const zone = h('div', { class: 'wc-line wc-zone' }), change = h('div', { class: 'wc-line wc-change' });
    const sun = place && place.lat !== null ? h('div', { class: 'wc-line wc-sun' }) : null;
    const dayIc = place && place.lat !== null ? h('span', { class: 'wc-dayic' }) : null;
    const dial = h('div', { class: 'wc-dial-wrap', html: DIAL });
    const tools = mine ? null : h('div', { class: 'wc-tools' },
      button('', () => move(id, -1), { small: true, variant: 'ghost', icon: 'ChevronUp', title: `Move ${name} earlier` }),
      button('', () => move(id, 1), { small: true, variant: 'ghost', icon: 'ChevronDown', title: `Move ${name} later` }),
      button('', () => remove(id), { small: true, variant: 'ghost', icon: 'X', title: `Remove ${name}` }));
    if (tools) { tools.children[0].classList.add('wc-up'); tools.children[1].classList.add('wc-down'); tools.children[2].classList.add('wc-remove'); }
    const el = h('li', { class: ['wc-card', mine && 'wc-you'], 'data-id': id },
      h('div', { class: 'wc-head' }, h('div', { class: 'wc-names' }, h('h3', { class: 'wc-name' }, name, dayIc), h('div', { class: 'wc-where muted small' }, where)), tools),
      h('div', { class: 'wc-main' }, dial, h('div', { class: 'wc-digits' }, time, date, gap)),
      zone, sun, change);
    const hs = [...el.querySelectorAll('.wc-h, .wc-m, .wc-s')] as SVGElement[];
    return { id, place, el, time, date, gap, zone, sun, change, dayIc, hands: [hs[0], hs[1], hs[2]], last: {}, sunKey: '', sunDay: null, change0: null, upKey: '' };
  };
  const draw = () => {
    const want = ['you', ...ids.filter((id) => W.placeOf(id))];
    for (const [id, c] of cards) if (!want.includes(id)) { c.el.remove(); cards.delete(id); }
    for (const id of want) if (!cards.has(id)) cards.set(id, makeCard(id, id === 'you'));
    want.forEach((id, i) => {
      const c = cards.get(id)!;
      if (listEl.children[i] !== c.el) listEl.insertBefore(c.el, listEl.children[i] ?? null);
      const up = c.el.querySelector('.wc-up') as HTMLButtonElement | null, down = c.el.querySelector('.wc-down') as HTMLButtonElement | null;
      if (up) up.disabled = i === 1;
      if (down) down.disabled = i === want.length - 1;
    });
    empty.hidden = want.length > 1;
    drawSets();
    tick();
  };
  const empty = note('No cities in the list. Add one with the search above, or pick a set.');

  // ---------------------------------------------------------------- ticking
  const put = (c: Card, key: string, el: HTMLElement, text: string) => { if (c.last[key] !== text) { c.last[key] = text; el.textContent = text; } };
  const tick = () => {
    if (gone) return;
    const real = Date.now(), t = real + shift * MIN, yours = W.readingAt(you, t), yourOff = zoneOffset(you, t);
    for (const c of cards.values()) {
      const zone = c.place?.zone ?? you, r = W.readingAt(zone, t);
      put(c, 'time', c.time, W.clockText(r, h24, true));
      const sec = r.s * 6, min = r.mi * 6 + r.s * 0.1, hr = (r.h % 12) * 30 + r.mi * 0.5 + r.s / 120;
      c.hands[0].setAttribute('transform', `rotate(${hr} 50 50)`); c.hands[1].setAttribute('transform', `rotate(${min} 50 50)`); c.hands[2].setAttribute('transform', `rotate(${sec} 50 50)`);
      put(c, 'date', c.date, `${W.dateText(r)} · ${c.place ? W.dayWord(r, yours) : 'Today'}`);
      const off = zoneOffset(zone, t), g = W.gapText(off - yourOff);
      if (c.place) { put(c, 'gap', c.gap, g.short === 'Same time' ? 'Same time as you' : `${g.short} from you`); c.gap.setAttribute('aria-label', g.words); }
      else put(c, 'gap', c.gap, shift ? 'Your time then' : 'Your time now');
      if (c.last.off !== String(off)) { c.last.off = String(off); put(c, 'zone', c.zone, W.zoneLine(zone, t)); }
      // sunrise and sunset of the day there (worked out again when the date there changes)
      if (c.sun && c.place) {
        const key = `${r.y}-${r.mo}-${r.d}`;
        if (c.sunKey !== key) { c.sunKey = key; c.sunDay = W.sunDay(m, c.place, r); c.last.sun = ''; }
        put(c, 'sun', c.sun, sunText(c.sunDay!, zone));
        const upKey = `${Math.floor(t / MIN)}`;
        if (c.upKey !== upKey) {
          c.upKey = upKey;
          const up = W.sunUp(m, c.place, t);
          c.el.classList.toggle('wc-night', up === false);
          if (c.dayIc && c.last.up !== String(up)) { c.last.up = String(up); c.dayIc.replaceChildren(ic(up ? 'Sun' : 'Moon')); c.dayIc.title = up ? 'Day there now' : 'Night there now'; c.dayIc.setAttribute('aria-label', c.dayIc.title); c.dayIc.setAttribute('role', 'img'); }
        }
      }
      // the next clock change (found again once it has passed, or when the slider goes back before the time it was found from)
      if (!c.change0 || t < c.change0.from || (c.change0.c && t >= c.change0.c.at) || (!c.change0.c && t >= c.change0.from + DAY)) c.change0 = { from: t, c: W.nextChange(zone, t) };
      const ch = c.change0.c;
      let text = ch ? W.changeText(ch, h24) : 'No clock changes in the coming year';
      if (ch) { const days = Math.round((ch.at - t) / DAY); if (days < 8) text += days <= 0 ? ' — today' : days === 1 ? ' — tomorrow' : ` — in ${days} days`; }
      put(c, 'change', c.change, text);
      c.change.classList.toggle('soon', !!ch && ch.at - t < 8 * DAY);
    }
  };
  const sunText = (s: W.SunDay, zone: string) => {
    const at = (e: W.SunEvent) => (typeof e === 'number' ? W.sunClock(zone, e, h24) : '');
    if (s.rise === 'up' || s.set === 'up') return 'The sun does not set today (midnight sun)';
    if (s.rise === 'down' || s.set === 'down') return 'The sun does not rise today (polar night)';
    const rise = typeof s.rise === 'number' ? `Sunrise ${at(s.rise)}` : 'No sunrise on this date', set = typeof s.set === 'number' ? `Sunset ${at(s.set)}` : 'No sunset on this date';
    return [rise, set, typeof s.rise === 'number' && typeof s.set === 'number' && s.set > s.rise ? W.daylightText(s.rise, s.set) : ''].filter(Boolean).join(' · ');
  };
  const loop = () => { tick(); timer = window.setTimeout(loop, 1000 - (Date.now() % 1000) + 8); };
  const onVis = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', onVis);

  // ---------------------------------------------------------------- the page
  drawHours();
  root.append(
    card(null, h('div', { class: 'wc-search' }, ic('Search', 'wc-search-ic'), q, sugg), searchNote, sets,
      h('div', { class: 'wc-row' }, hours, h('div', { class: 'wc-ahead' }, h('span', { class: 'wc-ahead-head' }, h('span', { class: 'small' }, 'Look ahead'), aheadOut), ahead, nowBtn)), status),
    empty, listEl,
    h('p', { class: 'muted small wc-source' }, `Cities: ${W.SOURCE}. Time zones: this browser's own database. Sunrise and sunset: NOAA's equations at sea level, to the minute; hills and the weather move them a little.`),
  );
  draw();
  writeUrl(false);
  loop();
  // changed elsewhere (the Settings page in another tab, an import there): the list and the clock follow
  const offSettings = worldclockSettings.on((local) => {
    if (local || gone) return;
    const k = worldclockSettings.get();
    ids = k.cities?.filter((id) => W.placeOf(id)) ?? setIds(W.DEFAULT_SET); h24 = k.h24 ?? localH24();
    drawHours(); for (const c of cards.values()) c.last = {};
    draw(); tick(); writeUrl(false);
  });
  return () => {
    gone = true; clearTimeout(timer); offSettings();
    window.removeEventListener('hashchange', onHash); document.removeEventListener('visibilitychange', onVis);
    try { if (engine) engine.tc.searchFree(engine.handle); } catch { /* the engine is gone already */ }
  };
};
