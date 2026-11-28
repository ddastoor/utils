// The NASA Image Explorer's service as the tests see it: NASA's API (images-api.nasa.gov: its searches and file lists, answered from
// tests/fixtures/nasa — scripts/make-nasa-fixtures.py), its files at the bucket's own address (s3.amazonaws.com/images-assets.nasa.gov —
// answered with test pictures and captions) and at its file server (images-assets.nasa.gov, what a <video> plays — a test video). The e2e
// harness routes every page's requests to these here, so no suite reaches NASA.
import { readFileSync } from 'node:fs';

export const NASA_HOSTS = /^https:\/\/(images-api\.nasa\.gov\/|s3\.amazonaws\.com\/images-assets\.nasa\.gov\/|images-assets\.nasa\.gov\/)/;
const dir = new URL('../fixtures/nasa/', import.meta.url);
const J = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
let fx = null;
export function nasaFixtures() {
  if (!fx) fx = {
    earth: J('search-earth.json'), earth2: J('search-earth-2.json'), nebula: J('search-nebula.json'), apollo: J('search-apollo.json'), video: J('search-video.json'),
    assets: J('assets.json'),
    busy: readFileSync(new URL('../wallpapers/busy.jpg', dir)), face: readFileSync(new URL('../wallpapers/face.jpg', dir)), tall: readFileSync(new URL('../wallpapers/tall.jpg', dir)),
    mp4: readFileSync(new URL('../media/clip.mp4', dir)), srt: readFileSync(new URL('../media/subs.srt', dir)),
  };
  return fx;
}
/** the NASA items (ids) shown as the face picture and the tall picture */
export const FACE_ID = 'sl4-143-4707', TALL_ID = 'PIA14417';
const empty = { collection: { version: '1.0', href: 'https://images-api.nasa.gov/search', items: [], metadata: { total_hits: 0 }, links: [] } };
/** the answer to `url`: { status, type, body } (`over`: { search(url) → answer | status, pictures(url) }) */
export function nasaAnswer(url, over = {}) {
  const f = nasaFixtures(), u = new URL(url), json = (v, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(v) });
  if (u.host === 'images-api.nasa.gov') {
    if (u.pathname === '/search') {
      const o = over.search?.(u);
      if (typeof o === 'number') return { status: o, type: 'application/json', body: JSON.stringify({ reason: 'Too many requests' }) };
      if (o) return json(o);
      // by the words (and the kind asked for): the recorded answers, nothing for other words
      const q = (u.searchParams.get('q') || '').toLowerCase(), page = Number(u.searchParams.get('page') || 1), kinds = (u.searchParams.get('media_type') || 'image').split(',');
      if (/rover/.test(q)) return json(kinds.includes('video') && page === 1 ? f.video : empty);
      const imgs = /^earth from space/.test(q) ? [f.earth, f.earth2] : /nebula|spitzer|helix/.test(q) ? [f.nebula] : /apollo/.test(q) ? [f.apollo] : null;
      if (!imgs) return json(empty);
      if (kinds.includes('image')) return json(imgs[page - 1] ?? empty);
      return json(page === 1 ? f.video : empty); // a topic's videos: the recorded videos stand in
    }
    if (u.pathname.startsWith('/asset/')) {
      const id = decodeURIComponent(u.pathname.slice(7));
      return f.assets[id] ? json(f.assets[id]) : json({ reason: 'Not found' }, 404);
    }
    return json({ reason: 'Not found' }, 404);
  }
  const pic = over.pictures?.(url);
  if (pic) return pic;
  const path = decodeURIComponent(u.pathname);
  if (/\.mp4$/i.test(path)) return { status: 200, type: 'video/mp4', body: f.mp4 };
  if (/\.(srt|vtt)$/i.test(path)) return { status: 200, type: 'text/plain', body: f.srt };
  if (path.includes(`/${FACE_ID}/`)) return { status: 200, type: 'image/jpeg', body: f.face };
  if (path.includes(`/${TALL_ID}/`)) return { status: 200, type: 'image/jpeg', body: f.tall };
  return { status: 200, type: 'image/jpeg', body: f.busy };
}
/** a Playwright route handler (`seen` collects the addresses asked for) */
export function nasaRoute(over = {}, seen) {
  return (route) => {
    const url = route.request().url();
    seen?.push(url);
    const a = nasaAnswer(url, over);
    // NASA's API and the bucket's own address answer CORS; its file server (images-assets.nasa.gov) does not — as the real ones
    const cors = /^https:\/\/(images-api\.nasa\.gov|s3\.amazonaws\.com)\//.test(url) ? { 'access-control-allow-origin': '*' } : {};
    return route.fulfill({ status: a.status, contentType: a.type, headers: cors, body: a.body });
  };
}
