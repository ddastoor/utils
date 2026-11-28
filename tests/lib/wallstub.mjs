// The Wallpapers tab's services as the tests see them: Wikipedia's featured feed and summaries, Commons' search, the Met's and the Art
// Institute's APIs answered from tests/fixtures/wallpapers (scripts/make-wallpaper-fixtures.py), and their picture servers answered
// with test pictures — busy.jpg (a checkered block at a known place) for Commons' and the Art Institute's, face.jpg (the astronaut's
// portrait at the right of a wide picture: a face far from the middle) for the Met's, tall.jpg (a portrait painting's shape) for the
// Art Institute's El Greco.
// The e2e harness routes every page's requests to these hosts here, so no suite reaches the real services.
import { readFileSync } from 'node:fs';

export const WALL_HOSTS = /^https:\/\/(en\.wikipedia\.org\/api\/rest_v1\/(feed|page\/summary)\/|commons\.wikimedia\.org\/w\/api\.php|upload\.wikimedia\.org\/|collectionapi\.metmuseum\.org\/|images\.metmuseum\.org\/|api\.artic\.edu\/|www\.artic\.edu\/iiif\/)/;
const dir = new URL('../fixtures/wallpapers/', import.meta.url);
/** the Art Institute's El Greco (The Assumption of the Virgin, a tall painting): shown as tall.jpg */
export const TALL = '47fd1564-93f5-f30b-7786-013421133b4a';
const J = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
let fx = null;
export function wallFixtures() {
  if (!fx) fx = {
    feed: J('feed.json'), commons: J('commons-search.json'), met: J('met-search.json'), metHigh: J('met-highlights.json'), metObjects: J('met-objects.json'),
    aic: J('aic-search.json'), aicBoosted: J('aic-boosted.json'),
    busy: readFileSync(new URL('busy.jpg', dir)), face: readFileSync(new URL('face.jpg', dir)), tall: readFileSync(new URL('tall.jpg', dir)),
  };
  return fx;
}
/** the answer to `url`: { status, type, body } (`over` replaces parts: { commons, met, aic, feed, summary, pictures(url) }) */
export function wallAnswer(url, over = {}) {
  const f = wallFixtures(), u = new URL(url), json = (v, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(v) });
  if (u.host === 'en.wikipedia.org') {
    if (u.pathname.startsWith('/api/rest_v1/feed/')) return over.feed === 429 ? { status: 429, type: 'text/plain', body: 'Too many requests' } : json(over.feed ?? f.feed);
    const t = decodeURIComponent(u.pathname.split('/').pop()).replace(/_/g, ' ');
    return over.summary ? json(over.summary(t)) : json({ type: 'standard', title: t, titles: { normalized: t }, extract: `${t} is the subject of a test article. It has two sentences.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${encodeURIComponent(t)}` } } });
  }
  if (u.host === 'commons.wikimedia.org') {
    if (over.commons === 429) return { status: 429, type: 'text/plain', body: 'You are making too many requests to the API.' };
    const off = Number(u.searchParams.get('gsroffset') || 0);
    return json(off ? { batchcomplete: true, query: { pages: [] } } : (over.commons ?? f.commons));
  }
  if (u.host === 'collectionapi.metmuseum.org') {
    // its search: the recorded page first, then its highlights' page (other objects), then nothing
    if (/\/v1\.1\/search/.test(u.pathname)) {
      if (u.searchParams.get('isHighlight')) return json(f.metHigh);
      const off = Number(u.searchParams.get('offset') || 0);
      return json(!off ? (over.met ?? f.met) : off <= f.met.objectIDs.length ? { total: f.met.total, objectIDs: f.metHigh.objectIDs } : { total: f.met.total, objectIDs: [] });
    }
    const id = u.pathname.split('/').pop(), o = f.metObjects[id];
    return o ? json(o) : json({ message: 'Not a valid object' }, 404);
  }
  if (u.host === 'api.artic.edu') {
    const p = JSON.parse(u.searchParams.get('params') || '{}');
    const boosted = JSON.stringify(p).includes('is_boosted');
    // its search: the recorded page, then a page of its highlights (some of them on the first page too), then nothing
    const page = Number(u.searchParams.get('page') || 1);
    return json(boosted ? f.aicBoosted : page === 1 ? (over.aic ?? f.aic) : page === 2 ? { pagination: { ...f.aic.pagination, current_page: 2 }, data: f.aicBoosted.data } : { pagination: { ...f.aic.pagination, current_page: page }, data: [] });
  }
  // the pictures
  const pic = over.pictures?.(url);
  if (pic) return pic;
  if (u.host === 'images.metmuseum.org') return { status: 200, type: 'image/jpeg', body: f.face };
  if (u.pathname.includes(`/iiif/2/${TALL}/`)) return { status: 200, type: 'image/jpeg', body: f.tall };
  return { status: 200, type: 'image/jpeg', body: f.busy };
}
/** a Playwright route handler (`seen` collects the addresses asked for) */
export function wallRoute(over = {}, seen) {
  return (route) => {
    const url = route.request().url();
    seen?.push(url);
    const a = wallAnswer(url, over);
    return route.fulfill({ status: a.status, contentType: a.type, headers: { 'access-control-allow-origin': '*' }, body: a.body });
  };
}
