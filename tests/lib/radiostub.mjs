// Radio Browser as the tests see it: answers to World Radio's requests made from the recorded fixtures (tests/fixtures/radio/, by
// scripts/make-radio-fixtures.py). The e2e harness routes every page's requests to the directory's servers here, so no suite reaches the
// real directory; the World Radio suite passes stations of its own (streams it serves itself). Filters as the directory applies them.
import { readFileSync } from 'node:fs';

export const RADIO_HOSTS = /^https:\/\/(all|de1|de2)\.api\.radio-browser\.info\//;
const dir = new URL('../fixtures/radio/', import.meta.url);
let cache = null;
export function radioFixtures() {
  if (!cache) {
    const load = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    cache = { stations: load('stations.json'), countries: load('countries.json'), languages: load('languages.json'), tags: load('tags.json') };
  }
  return cache;
}
const list = (v) => String(v ?? '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);

/** the directory's answer to `url` (null: a path it does not have); `stations` in place of the recorded ones */
export function radioAnswer(url, stations = radioFixtures().stations) {
  const u = new URL(url), p = u.searchParams, path = u.pathname.replace(/\/+$/, '');
  const f = radioFixtures();
  if (path === '/json/countries') return f.countries;
  if (path === '/json/languages') return f.languages;
  if (path === '/json/tags') return f.tags;
  if (path.startsWith('/json/url/')) {
    const id = path.slice('/json/url/'.length), s = stations.find((x) => x.stationuuid === id);
    return { ok: !!s, message: s ? 'retrieved station url' : 'did not find station', stationuuid: id, name: s?.name ?? '', url: s?.url_resolved ?? '' };
  }
  if (path === '/json/stations/byuuid') { const ids = list(p.get('uuids')); return stations.filter((s) => ids.includes(s.stationuuid)); }
  if (path === '/json/stations/search') {
    let r = stations;
    const name = p.get('name'), cc = p.get('countrycode'), lang = p.get('language'), tag = p.get('tag');
    if (name) r = r.filter((s) => s.name.toLowerCase().includes(name.toLowerCase()));
    if (cc) r = r.filter((s) => s.countrycode === cc);
    if (lang) r = r.filter((s) => (p.get('languageExact') === 'true' ? list(s.language).includes(lang.toLowerCase()) : s.language.toLowerCase().includes(lang.toLowerCase())));
    if (tag) r = r.filter((s) => (p.get('tagExact') === 'true' ? list(s.tags).includes(tag.toLowerCase()) : s.tags.toLowerCase().includes(tag.toLowerCase())));
    if (p.get('hidebroken') === 'true') r = r.filter((s) => s.lastcheckok === 1);
    const order = p.get('order') || 'name';
    r = [...r];
    if (order === 'clickcount') r.sort((a, b) => a.clickcount - b.clickcount);
    else if (order === 'votes') r.sort((a, b) => a.votes - b.votes);
    else if (order === 'name') r.sort((a, b) => a.name.localeCompare(b.name));
    if (p.get('reverse') === 'true') r.reverse();
    const off = Number(p.get('offset') || 0), lim = Number(p.get('limit') || 100000);
    return r.slice(off, off + lim);
  }
  return null;
}
/** a Playwright route handler: `stations` (optional) in place of the recorded ones, `seen` collects the paths asked for */
export function radioRoute(stations, seen) {
  return (route) => {
    const url = route.request().url();
    seen?.push(url);
    const a = radioAnswer(url, stations);
    return route.fulfill({ status: a === null ? 404 : 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a ?? { error: 'not found' }) });
  };
}
