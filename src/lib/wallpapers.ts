// Wallpapers from Wikimedia and Museums (potentials #115; owner, 21 Nov 2026: "add … Wallpapers from Wikimedia and museums", then "I
// changed my mind. You can use the wallpaper tab"). Pictures from Wikimedia Commons — its Picture of the Day and its Featured Pictures,
// chosen by the community for quality, each under its own free licence (its author and licence shown, as CC BY-SA asks) — and the
// public-domain paintings the Metropolitan Museum of Art and the Art Institute of Chicago publish (CC0). The Cleveland Museum of Art,
// named in the plan, is left out: its picture server sends no CORS header, so a page cannot read a picture's pixels to fit it to a
// screen. What is around the services is here — their addresses, their answers read, a picture's renditions, the crop for a screen,
// the credit written into the JPEG — without the DOM: the unit suite runs it in Node on recorded answers.

export type SourceId = 'wikimedia' | 'met' | 'aic' | 'nasa';
export const SOURCES: Record<SourceId, { name: string; site: string }> = {
  wikimedia: { name: 'Wikimedia Commons', site: 'https://commons.wikimedia.org/' },
  met: { name: 'The Met', site: 'https://www.metmuseum.org/' },
  aic: { name: 'Art Institute of Chicago', site: 'https://www.artic.edu/' },
  nasa: { name: 'NASA', site: 'https://images.nasa.gov/' }, // the NASA Image Explorer's pictures (src/lib/nasa.ts)
};
/** the hosts the tab asks (the CSP's connect-src lists them; en.wikipedia.org is the Photo Dictionary's already) */
export const HOSTS = ['en.wikipedia.org', 'commons.wikimedia.org', 'upload.wikimedia.org', 'collectionapi.metmuseum.org', 'images.metmuseum.org', 'api.artic.edu', 'www.artic.edu'] as const;

export interface Pic {
  /** "wikimedia:File:X.jpg", "met:436524", "aic:16568" */ key: string;
  source: SourceId;
  title: string; artist: string; date: string;
  /** the source's own words about it, as plain text ('' none) */ about: string;
  /** whose words `about` are, where the source asks for credit (the Art Institute's: CC BY 4.0) */ aboutCredit: string;
  licence: { name: string; url: string };
  /** the credit to give with the picture ("King of Hearts, CC BY-SA 3.0, via Wikimedia Commons") */ credit: string;
  /** the item's page at its source */ page: string;
  /** the original's size in pixels (0 × 0: not known before it is loaded — the Met's) */ width: number; height: number;
  /** the full-size file */ original: string;
  /** for the grid (about 500 px) and the view (about 1,280 px) */ thumb: string; preview: string;
  /** the Art Institute's IIIF image id ('' otherwise) */ iiif: string;
  /** the Wikipedia article that tells its story ('' none) */ wiki: string;
  /** the renditions a source lists, by width (NASA's: thumb, small, medium, large, the original) */ renditions?: Array<{ url: string; width: number; height: number }>;
}

// ------------------------------------------------------------------ text from the services
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', copy: '©' };
/** HTML from a service as plain text: tags out, entities read, white space folded (shown with textContent — never as HTML) */
export function htmlText(html: unknown, max = 2000): string {
  if (typeof html !== 'string') return '';
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, ' ').replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? (() => { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; })() : ENT[e.toLowerCase()] ?? m))
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
/** the first English Wikipedia article an HTML text links to ('' none) — a picture's story */
export function wikiLink(html: unknown): string {
  if (typeof html !== 'string') return '';
  const m = html.match(/href="(?:https?:)?\/\/en\.wikipedia\.org\/wiki\/([^"#?]+)/i);
  if (!m) return '';
  try { const t = decodeURIComponent(m[1]).replace(/_/g, ' '); return /:/.test(t) ? '' : t; } catch { return ''; }
}
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
/** an address without the tracking a service adds (utm_…) */
export function cleanUrl(u: unknown): string {
  if (typeof u !== 'string' || !/^https:\/\//i.test(u)) return '';
  try { const x = new URL(u); for (const k of [...x.searchParams.keys()]) if (/^utm_/i.test(k)) x.searchParams.delete(k); return x.href; } catch { return ''; }
}

// ------------------------------------------------------------------ Wikimedia Commons
/** the widths of Wikimedia's thumbnails (its standard sizes; others it may refuse) */
export const WM_SIZES = [330, 500, 960, 1280, 1920, 3840] as const;
/** a Commons file's thumbnail `w` px wide, from its original's address (the original itself when it is not wider) */
export function commonsThumb(original: string, w: number, width = 0): string {
  const m = original.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/);
  if (!m || (width && w >= width)) return original;
  const name = m[3], ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const file = ext === 'svg' ? `${w}px-${name}.png` : ext === 'tif' || ext === 'tiff' ? `lossy-page1-${w}px-${name}.jpg` : `${w}px-${name}`;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${name}/${file}`;
}
/** the smallest of Wikimedia's sizes at least `need` px wide (the original past them) */
export const commonsSize = (need: number, width: number) => (WM_SIZES.find((s) => s >= need && (!width || s < width)) ?? 0);
/** Commons' search among its featured pictures: the words, a page of `limit` from `offset` (MediaWiki's action API, anonymous CORS) */
export function commonsSearchUrl(words: string, offset = 0, limit = 24): string {
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: String(limit), gsroffset: String(offset),
    gsrsearch: `incategory:"Featured_pictures_on_Wikimedia_Commons" filetype:bitmap ${words}`.trim(),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiextmetadatalanguage: 'en',
    iiextmetadatafilter: 'ImageDescription|Artist|LicenseShortName|LicenseUrl|Credit|DateTimeOriginal|ObjectName|AttributionRequired',
  });
  return `https://commons.wikimedia.org/w/api.php?${p}`;
}
function commonsPic(title: string, ii: any, description = ''): Pic | null {
  const original = cleanUrl(ii?.url), md = ii?.extmetadata ?? {};
  if (!original || !/^image\/(jpeg|png|tiff|webp|gif)$/.test(String(ii?.mime ?? 'image/jpeg'))) return null;
  const width = num(ii?.width), height = num(ii?.height);
  const name = title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
  const artist = htmlText(md.Artist?.value, 200) || 'Unknown author';
  const lic = str(htmlText(md.LicenseShortName?.value, 80)) || 'See its page';
  const descHtml = description || md.ImageDescription?.value;
  const page = cleanUrl(ii?.descriptionurl) || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  return {
    key: `wikimedia:${title}`, source: 'wikimedia',
    title: htmlText(md.ObjectName?.value, 200) || name, artist, date: htmlText(md.DateTimeOriginal?.value, 60),
    about: htmlText(descHtml, 1200), aboutCredit: '', licence: { name: lic, url: cleanUrl(md.LicenseUrl?.value) },
    credit: `${artist}, ${lic}, via Wikimedia Commons`, page, width, height, original,
    thumb: commonsThumb(original, 500, width), preview: commonsThumb(original, 1280, width), iiif: '', wiki: wikiLink(descHtml),
  };
}
/** the pictures of a Commons search answer, in the search's order, and the offset of the next page (0: none) */
export function readCommonsSearch(j: any): { pics: Pic[]; next: number } {
  const pages: any[] = Array.isArray(j?.query?.pages) ? j.query.pages : Object.values(j?.query?.pages ?? {});
  const pics = pages.filter((p) => p && p.imageinfo?.[0]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => commonsPic(String(p.title ?? ''), p.imageinfo[0])).filter((p): p is Pic => !!p);
  return { pics, next: num(j?.continue?.gsroffset) };
}
/** Wikipedia's featured feed of a date (its Picture of the Day is Commons') */
export const feedUrl = (y: number, m: number, d: number) => `https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
/** the Picture of the Day of a feed answer (null: none) */
export function readFeedImage(j: any): Pic | null {
  const i = j?.image;
  if (!i?.image?.source) return null;
  const p = commonsPic(String(i.title ?? ''), { url: i.image.source, width: i.image.width, height: i.image.height, mime: 'image/jpeg', descriptionurl: i.file_page, extmetadata: {
    Artist: { value: i.artist?.html ?? i.artist?.text }, LicenseShortName: { value: i.license?.type }, LicenseUrl: { value: i.license?.url },
  } }, i.description?.html ?? i.description?.text ?? '');
  if (!p) return null;
  if (!p.licence.name || p.licence.name === 'See its page') { p.licence.name = str(i.license?.code) || 'See its page'; p.credit = `${p.artist}, ${p.licence.name}, via Wikimedia Commons`; }
  return p;
}

// ------------------------------------------------------------------ The Metropolitan Museum of Art (Open Access, CC0)
const MET = 'https://collectionapi.metmuseum.org/public/collection';
/** the Met's search (v1.1 — paginated; the old v1 search was retired on 1 Oct 2026): public-domain paintings with pictures */
export function metSearchUrl(q: string, o: { offset?: number; limit?: number; highlight?: boolean; medium?: string } = {}): string {
  const p = new URLSearchParams({ q: q.trim() || '*', hasImages: 'true', isPublicDomain: 'true' });
  if (o.highlight) p.set('isHighlight', 'true');
  p.set('medium', o.medium ?? 'Paintings');
  p.set('limit', String(o.limit ?? 24)); if (o.offset) p.set('offset', String(o.offset));
  return `${MET}/v1.1/search?${p}`;
}
export function readMetSearch(j: any): { ids: number[]; total: number } {
  return { ids: Array.isArray(j?.objectIDs) ? j.objectIDs.filter((x: unknown) => typeof x === 'number' && x > 0) : [], total: num(j?.total) };
}
export const metObjectUrl = (id: number) => `${MET}/v1/objects/${id}`;
/** an object of the Met as a picture (null: not in the public domain, or no picture) */
export function readMetObject(j: any): Pic | null {
  const id = num(j?.objectID), original = cleanUrl(j?.primaryImage), small = cleanUrl(j?.primaryImageSmall);
  if (!id || j?.isPublicDomain !== true || !original) return null;
  const artist = str(j.artistDisplayName, 200), title = str(j.title, 300) || 'Untitled';
  const about = [str(j.medium, 200), str(j.culture, 100), str(j.department, 100), str(j.creditLine, 200)].filter(Boolean).join(' · ');
  return {
    key: `met:${id}`, source: 'met', title, artist: artist || str(j.culture, 100) || 'Unknown artist', date: str(j.objectDate, 80),
    about, aboutCredit: '', licence: { name: 'Public domain (CC0)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    credit: 'The Metropolitan Museum of Art, Open Access (public domain)', page: cleanUrl(j.objectURL) || `https://www.metmuseum.org/art/collection/search/${id}`,
    width: 0, height: 0, original, thumb: small || original, preview: small || original, iiif: '', wiki: artist,
  };
}

// ------------------------------------------------------------------ Art Institute of Chicago (CC0; IIIF pictures)
const AIC = 'https://api.artic.edu/api/v1/artworks/search';
const AIC_FIELDS = 'id,title,image_id,artist_title,artist_display,date_display,thumbnail,short_description,is_public_domain,artwork_type_title';
/** the IIIF picture of an Art Institute work `w` px wide (at most its own size and the server's 74.5 megapixels) */
export function aicImage(id: string, w: number, width = 0, height = 0): string {
  let x = Math.max(1, Math.round(w));
  if (width) x = Math.min(x, width);
  if (width && height && x * (x * height / width) > 74_000_000) x = Math.floor(Math.sqrt(74_000_000 * width / height));
  return `https://www.artic.edu/iiif/2/${id}/full/${x},/0/default.jpg`;
}
/** the Art Institute's search: public-domain works of a kind (paintings unless said), a page of `limit` */
export function aicSearchUrl(q: string, o: { page?: number; limit?: number; boosted?: boolean; type?: string } = {}): string {
  const must: unknown[] = [{ term: { is_public_domain: true } }, { exists: { field: 'image_id' } }, { term: { 'artwork_type_title.keyword': o.type ?? 'Painting' } }];
  if (o.boosted) must.push({ term: { is_boosted: true } });
  const query: Record<string, unknown> = { bool: { must: q.trim() ? [...must, { multi_match: { query: q.trim(), fields: ['title^2', 'artist_title', 'term_titles', 'subject_titles', 'style_titles', 'classification_titles', 'description'] } }] : must } };
  const p = new URLSearchParams({ params: JSON.stringify({ query }), fields: AIC_FIELDS, limit: String(o.limit ?? 24), page: String(o.page ?? 1) });
  return `${AIC}?${p}`;
}
export function readAicSearch(j: any): { pics: Pic[]; total: number } {
  const pics = (Array.isArray(j?.data) ? j.data : []).map((d: any): Pic | null => {
    const id = num(d?.id), iiif = typeof d?.image_id === 'string' && /^[0-9a-f-]{20,}$/i.test(d.image_id) ? d.image_id : '';
    if (!id || !iiif || d.is_public_domain === false) return null;
    const width = num(d.thumbnail?.width), height = num(d.thumbnail?.height), artist = str(d.artist_title, 200);
    const about = htmlText(d.short_description, 1200);
    return {
      key: `aic:${id}`, source: 'aic', title: str(d.title, 300) || 'Untitled', artist: artist || htmlText(d.artist_display, 200) || 'Unknown artist', date: str(d.date_display, 80),
      about, aboutCredit: about ? 'Text: Art Institute of Chicago, CC BY 4.0' : '', licence: { name: 'Public domain (CC0)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      credit: 'Art Institute of Chicago (public domain)', page: `https://www.artic.edu/artworks/${id}`, width, height,
      original: aicImage(iiif, width || 3000, width, height), thumb: aicImage(iiif, 500, width, height), preview: aicImage(iiif, 1280, width, height), iiif, wiki: artist,
    };
  }).filter((p: Pic | null): p is Pic => !!p);
  return { pics, total: num(j?.pagination?.total) };
}

// ------------------------------------------------------------------ what to show
export interface Topic { id: string; name: string; wikimedia: string | null; met: string | null; aic: string | null }
/** quick topics: the words each source is searched for (null: that source has little of it) */
export const TOPICS: Topic[] = [
  { id: 'landscapes', name: 'Landscapes', wikimedia: 'landscape', met: 'landscape', aic: 'landscape' },
  { id: 'mountains', name: 'Mountains', wikimedia: 'mountain', met: 'mountains', aic: 'mountains' },
  { id: 'sea', name: 'Sea and coast', wikimedia: 'sea coast', met: 'seascape', aic: 'sea' },
  { id: 'space', name: 'Space', wikimedia: 'galaxy OR nebula OR "Milky Way"', met: null, aic: null },
  { id: 'nature', name: 'Nature', wikimedia: 'forest', met: 'forest', aic: 'forest' },
  { id: 'flowers', name: 'Flowers', wikimedia: 'flower', met: 'flowers', aic: 'flowers' },
  { id: 'birds', name: 'Birds and animals', wikimedia: 'bird', met: 'birds', aic: 'birds' },
  { id: 'cities', name: 'Cities', wikimedia: 'cityscape OR skyline', met: 'city view', aic: 'city' },
  { id: 'night', name: 'Night', wikimedia: 'night', met: 'night', aic: 'night' },
  { id: 'impressionism', name: 'Impressionism', wikimedia: null, met: 'impressionism', aic: 'impressionism' },
  { id: 'india', name: 'India', wikimedia: 'India', met: 'India', aic: 'India' },
  { id: 'japan', name: 'Japan', wikimedia: 'Japan', met: 'Japan', aic: 'Japan' },
];
/** pictures of several sources, one from each in turn (a source's first, then its second …) */
export function interleave(lists: Pic[][]): Pic[] {
  const out: Pic[] = [], seen = new Set<string>();
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) { const p = l[i]; if (p && !seen.has(p.key)) { seen.add(p.key); out.push(p); } }
  return out;
}
/** the day's number (days since 1 Jan 2000, by the reader's own date): today's picks are the same for everyone on a day */
export const dayNumber = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2000, 0, 1)) / 86_400_000);

// ------------------------------------------------------------------ the screen a wallpaper is for
export interface Screen { id: string; name: string; w: number; h: number }
export const SCREENS: Array<{ group: string; screens: Screen[] }> = [
  { group: 'Phones (upright)', screens: [
    { id: 'p1080', name: 'Android phone, 1080 × 2400', w: 1080, h: 2400 },
    { id: 'p1440', name: 'Android phone (QHD+), 1440 × 3200', w: 1440, h: 3200 },
    { id: 'p1170', name: 'iPhone 12 – 14, 1170 × 2532', w: 1170, h: 2532 },
    { id: 'p1179', name: 'iPhone 15 – 16, 1179 × 2556', w: 1179, h: 2556 },
    { id: 'p1290', name: 'iPhone Pro Max / Plus, 1290 × 2796', w: 1290, h: 2796 },
    { id: 'p1320', name: 'iPhone 16 Pro Max, 1320 × 2868', w: 1320, h: 2868 },
  ] },
  { group: 'Computers (across)', screens: [
    { id: 'm1366', name: 'Laptop, 1366 × 768', w: 1366, h: 768 },
    { id: 'm1920', name: 'Full HD, 1920 × 1080', w: 1920, h: 1080 },
    { id: 'm2560', name: 'QHD, 2560 × 1440', w: 2560, h: 1440 },
    { id: 'm2560w', name: '16 : 10, 2560 × 1600', w: 2560, h: 1600 },
    { id: 'm3440', name: 'Ultrawide, 3440 × 1440', w: 3440, h: 1440 },
    { id: 'm3840', name: '4K, 3840 × 2160', w: 3840, h: 2160 },
  ] },
  { group: 'Tablets', screens: [
    { id: 't2048', name: 'iPad, 2048 × 2732 (upright)', w: 2048, h: 2732 },
    { id: 't2560', name: 'Android tablet, 2560 × 1600 (across)', w: 2560, h: 1600 },
  ] },
];
/** this device's screen in its own pixels, as it is held now */
export function screenOf(sw: number, sh: number, dpr: number): Screen {
  const w = Math.round(sw * (dpr || 1)), h = Math.round(sh * (dpr || 1));
  return { id: 'this', name: `This screen, ${w} × ${h}`, w, h };
}
export const MAX_SIDE = 8192;

// ------------------------------------------------------------------ the crop
export interface Box { x: number; y: number; w: number; h: number }
/** the frame of a w × h picture for a W × H screen: the largest of its shape, times `zoom` (0.2 – 1), centred on (cx, cy) and kept
 *  inside the picture */
export function frameAt(w: number, h: number, W: number, H: number, zoom: number, cx: number, cy: number): Box {
  const a = W / H, z = Math.min(1, Math.max(0.2, zoom));
  let fw = Math.min(w, h * a), fh = fw / a;
  fw *= z; fh *= z;
  const x = Math.min(w - fw, Math.max(0, cx - fw / 2)), y = Math.min(h - fh, Math.max(0, cy - fh / 2));
  return { x, y, w: fw, h: fh };
}
/** the frame over faces: centred on them all, as large as needed to hold them (and their hair) if it can */
export function frameOnFaces(w: number, h: number, W: number, H: number, faces: Box[]): Box {
  const x0 = Math.min(...faces.map((f) => f.x)), y0 = Math.min(...faces.map((f) => f.y - f.h * 0.35));
  const x1 = Math.max(...faces.map((f) => f.x + f.w)), y1 = Math.max(...faces.map((f) => f.y + f.h * 1.15));
  const full = frameAt(w, h, W, H, 1, w / 2, h / 2);
  // the faces somewhat above the middle, as a portrait is framed
  return frameAt(w, h, W, H, 1, (x0 + x1) / 2, (y0 + y1) / 2 + full.h * 0.08);
}
/** the width a rendition of the picture must have so that the frame (in a picture `shownW` px wide) gives W pixels across */
export const neededWidth = (frame: Box, shownW: number, W: number) => Math.ceil(W * shownW / Math.max(1, frame.w));
/** the rendition of a picture at least `need` px wide (the original when none is): Commons' standard thumbnail widths, the Art Institute's
 *  IIIF width, a listed rendition (NASA's), the Met's original */
export function renditionFor(p: Pic, need: number): string {
  if (p.source === 'wikimedia') { const s = commonsSize(need, p.width); return s ? commonsThumb(p.original, s, p.width) : p.original; }
  if (p.source === 'aic' && p.iiif) return aicImage(p.iiif, need, p.width, p.height);
  if (p.renditions?.length) return (p.renditions.find((r) => r.width >= need) ?? p.renditions[p.renditions.length - 1]).url;
  return p.original;
}

// ------------------------------------------------------------------ the file
/** a JPEG with a comment segment (COM) holding `text` after its JFIF header: the picture carries its credit */
export function jpegWithComment(jpeg: Uint8Array, text: string): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]); // after APP0 (JFIF must come first)
  const body = new TextEncoder().encode(text).slice(0, 65000);
  const seg = new Uint8Array(4 + body.length);
  seg.set([0xff, 0xfe, ((body.length + 2) >> 8) & 0xff, (body.length + 2) & 0xff]); seg.set(body, 4);
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, at)); out.set(seg, at); out.set(jpeg.subarray(at), at + seg.length);
  return out;
}
/** what the saved file says of itself */
export const creditText = (p: Pic) => `${p.title}${p.artist ? ` — ${p.artist}` : ''}${p.date ? ` (${p.date})` : ''}. ${p.credit}. Licence: ${p.licence.name}${p.licence.url ? ` ${p.licence.url}` : ''}. Source: ${p.page}`;
/** a file name of the title and the size ("Sunflowers-1920x1080.jpg") */
export function fileName(p: Pic, W: number, H: number): string {
  const t = p.title.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'wallpaper';
  return `${t}-${W}x${H}.jpg`;
}
