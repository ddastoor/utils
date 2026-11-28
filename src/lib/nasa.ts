// NASA Image Explorer (potentials #114; owner, 21 Nov 2026: "add … NASA image explorer"): NASA's Image and Video Library
// (images.nasa.gov — 140,000 and more pictures, videos and recordings of NASA's missions, most of them NASA's own, not copyrighted in the
// United States). What is around the service is here, without the DOM (the unit suite runs it in Node on recorded answers): the search's
// address, its answers read, an item's files (its renditions, a video's MP4s and captions), its credit, captions made WebVTT.
// NASA's API (images-api.nasa.gov) sends CORS headers; its file server (images-assets.nasa.gov — CloudFront in front of an S3 bucket) does
// not, so a page cannot read a picture from it. The bucket itself answers CORS (`Access-Control-Allow-Origin: *`) at S3's own address,
// https://s3.amazonaws.com/images-assets.nasa.gov/… — the same files: the tab reads them there (the CSP's connect-src allows that one
// path), and plays videos from images-assets.nasa.gov (a <video> needs no CORS; media-src https:). The Astronomy Picture of the Day is not
// here: its API needs a key (NASA's shared demo key allows 10 calls an hour from an address) and answered "Internal Service Error" when this
// was built (28 Nov 2026).
import type { Pic } from './wallpapers';

export const API = 'https://images-api.nasa.gov';
export const FILES = 'https://images-assets.nasa.gov';
export const BUCKET = 'https://s3.amazonaws.com/images-assets.nasa.gov';
/** NASA's guidelines for the use of its images */
export const GUIDELINES = 'https://www.nasa.gov/nasa-brand-center/images-and-media/';

export type Kind = 'image' | 'video';
export interface Rendition { url: string; width: number; height: number }
export interface Item {
  id: string; kind: Kind;
  title: string; description: string; date: string; year: number;
  center: string; centerName: string;
  /** who took it (an astronaut's name, a photographer) */ photographer: string;
  /** the credit NASA gives (secondary creator, or "Credit: …" in the description); '' NASA's */ credit: string;
  /** the parties of the credit who are not NASA (ESA, a university …) — their terms may apply */ others: string[];
  keywords: string[]; location: string; album: string;
  /** about 640 px (for the grid) and about 1,280 px (for the view) */ thumb: string; preview: string;
  /** the picture's renditions by width (the original last), as the search gives them */ renditions: Rendition[];
  /** the full-size file at NASA (its address on images-assets.nasa.gov) */ original: string;
  /** captions of a video (SRT or WebVTT) '' none */ captions: string;
  /** the item's page at NASA */ page: string;
}

export const CENTERS: Array<[string, string]> = [
  ['ARC', 'Ames Research Center'], ['AFRC', 'Armstrong Flight Research Center'], ['GRC', 'Glenn Research Center'],
  ['GSFC', 'Goddard Space Flight Center'], ['HQ', 'NASA Headquarters'], ['JPL', 'Jet Propulsion Laboratory'], ['JSC', 'Johnson Space Center'],
  ['KSC', 'Kennedy Space Center'], ['LARC', 'Langley Research Center'], ['MSFC', 'Marshall Space Flight Center'], ['SSC', 'Stennis Space Center'],
];
const CENTER_NAME = new Map(CENTERS.map(([c, n]) => [c, n]));

/** quick topics: the words NASA's library is searched for */
export const TOPICS: Array<{ id: string; name: string; q: string }> = [
  { id: 'earth', name: 'Earth from space', q: 'earth from space' },
  { id: 'moon', name: 'The Moon', q: 'moon surface' },
  { id: 'mars', name: 'Mars', q: 'mars surface' },
  { id: 'nebula', name: 'Nebulae', q: 'nebula' },
  { id: 'galaxy', name: 'Galaxies', q: 'galaxy' },
  { id: 'sun', name: 'The Sun', q: 'solar flare' },
  { id: 'planets', name: 'Jupiter and Saturn', q: 'jupiter saturn' },
  { id: 'astronauts', name: 'Astronauts', q: 'spacewalk' },
  { id: 'launch', name: 'Launches', q: 'launch' },
  { id: 'iss', name: 'Space station', q: 'international space station' },
  { id: 'apollo', name: 'Apollo', q: 'apollo' },
  { id: 'hubble', name: 'Hubble', q: 'hubble' },
  { id: 'webb', name: 'James Webb', q: 'webb telescope' },
  { id: 'aurora', name: 'Auroras', q: 'aurora' },
];

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
/** NASA's descriptions hold HTML now and then (<a>, <br>, <p>): as plain text (shown with textContent) */
export function plain(v: unknown, max = 4000): string {
  if (typeof v !== 'string') return '';
  return v.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? (() => { const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; })() : ENT[e.toLowerCase()] ?? m))
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
/** an address at NASA's file server, https (its answers give http:// now and then), each part of the path escaped once */
export function fileUrl(u: unknown): string {
  if (typeof u !== 'string') return '';
  const m = u.match(/^https?:\/\/images-assets\.nasa\.gov\/(.+)$/i);
  if (!m) return '';
  const path = m[1].split('/').map((p) => { let d = p; try { d = decodeURIComponent(p); } catch { /* as it is */ } return encodeURIComponent(d); }).join('/');
  return `${FILES}/${path}`;
}
/** the same file at NASA's bucket's own address (it answers CORS) */
export const bucketUrl = (u: string) => (u.startsWith(`${FILES}/`) ? `${BUCKET}/${u.slice(FILES.length + 1)}` : '');

/** the search: words, pictures and / or videos, years, a NASA centre, a page of `size` */
export function searchUrl(o: { q: string; kind?: Kind | 'both'; from?: number; to?: number; center?: string; page?: number; size?: number }): string {
  const p = new URLSearchParams();
  if (o.q.trim()) p.set('q', o.q.trim());
  p.set('media_type', o.kind === 'video' ? 'video' : o.kind === 'both' ? 'image,video' : 'image');
  if (o.from) p.set('year_start', String(o.from));
  if (o.to) p.set('year_end', String(o.to));
  if (o.center) p.set('center', o.center);
  p.set('page_size', String(o.size ?? 24));
  if (o.page && o.page > 1) p.set('page', String(o.page));
  return `${API}/search?${p}`;
}
/** what a year box holds: a year of the library (1920 – next year), 0 empty, NaN not one */
export function yearOf(s: string, now = new Date().getFullYear()): number {
  const t = s.trim();
  if (!t) return 0;
  const y = /^\d{4}$/.test(t) ? Number(t) : NaN;
  return y >= 1920 && y <= now + 1 ? y : NaN;
}

const NASA_PART = /^(nasa|jpl|caltech|jpl-caltech|nasa['’]s .*|nasa .*(center|centre|laboratory)|(arc|afrc|grc|gsfc|hq|jsc|ksc|larc|msfc|ssc)|goddard.*|johnson.*|kennedy.*|marshall.*|ames.*|langley.*|glenn.*|armstrong.*|stennis.*|u\.?s\.? government)$/i;
/** the parties of a credit who are not NASA ("NASA, ESA & J. Smith" → ESA, J. Smith) */
export function othersIn(credit: string): string[] {
  if (!credit) return [];
  const parts = credit.replace(/\b(image|photo|video)?\s*credits?\s*:/gi, '').split(/\s*(?:\/|,|;|&|\band\b|\+)\s*/i).map((x) => x.replace(/^(the|acknowledgm?ent:?)\s+/i, '').trim()).filter(Boolean);
  const out: string[] = [];
  for (const x of parts) if (!NASA_PART.test(x) && !/^(hubble heritage team|team)$/i.test(x) && !out.includes(x) && x.length <= 80) out.push(x);
  return out.slice(0, 8);
}
/** "Credit: …" at the end of a description */
export function creditInText(text: string): string {
  const m = text.match(/(?:^|[\s.])(?:image |photo |video )?credits?\s*:\s*([^\n]{2,200}?)\s*(?:$|\n)/i);
  return m ? m[1].replace(/[.\s]+$/, '').trim() : '';
}

function itemOf(it: any): Item | null {
  const d = it?.data?.[0];
  const id = str(d?.nasa_id, 300), kind = d?.media_type === 'video' ? 'video' : d?.media_type === 'image' ? 'image' : null;
  if (!id || !kind) return null;
  const links: any[] = Array.isArray(it.links) ? it.links : [];
  const renditions: Rendition[] = [];
  let original = '', captions = '', thumb = '';
  for (const l of links) {
    const url = fileUrl(l?.href);
    if (!url) continue;
    if (l.rel === 'captions') { captions ||= url; continue; }
    if (l.render !== 'image') continue;
    if (l.rel === 'preview') thumb = url;
    if (kind === 'image' && l.rel === 'canonical') { original = url; continue; }
    renditions.push({ url, width: num(l.width), height: num(l.height) });
  }
  const sized = renditions.filter((r) => r.width).sort((a, b) => a.width - b.width);
  const near = (w: number) => sized.find((r) => r.width >= w) ?? sized[sized.length - 1];
  // the original last (its size where the search says it — else it is the largest anyway); a TIFF original cannot be shown by a browser:
  // the largest JPEG stands in for it
  const canon = links.find((l) => l?.rel === 'canonical');
  const all = [...sized];
  if (kind === 'image' && original && !/\.(tiff?)$/i.test(decodeURIComponent(original))) all.push({ url: original, width: num(canon?.width), height: num(canon?.height) });
  const description = plain(d.description_508 && String(d.description_508).length > String(d.description || '').length ? d.description_508 : d.description);
  const secondary = str(d.secondary_creator, 300);
  const credit = secondary || creditInText(description);
  const date = str(d.date_created, 40), year = Number(date.slice(0, 4)) || 0;
  const center = str(d.center, 20).toUpperCase();
  return {
    id, kind, title: str(d.title, 300) || id, description, date, year, center, centerName: CENTER_NAME.get(center) ?? center,
    photographer: str(d.photographer, 200), credit, others: othersIn(credit),
    keywords: (Array.isArray(d.keywords) ? d.keywords : []).map((k: unknown) => str(k, 80)).filter(Boolean).slice(0, 20),
    location: str(d.location, 200), album: (Array.isArray(d.album) ? d.album : []).map((a: unknown) => str(a, 120)).filter(Boolean).join(', '),
    thumb: thumb || near(500)?.url || original, preview: near(1200)?.url || thumb || original, renditions: all,
    original: original || all[all.length - 1]?.url || '', captions,
    page: `https://images.nasa.gov/details/${encodeURIComponent(id)}`,
  };
}
/** the items of a search answer, the total, and whether a next page exists */
export function readSearch(j: any): { items: Item[]; total: number; next: boolean } {
  const c = j?.collection;
  const items = (Array.isArray(c?.items) ? c.items : []).map(itemOf).filter((x: Item | null): x is Item => !!x);
  return { items, total: num(c?.metadata?.total_hits), next: Array.isArray(c?.links) && c.links.some((l: any) => l?.rel === 'next') };
}
export const assetUrl = (id: string) => `${API}/asset/${encodeURIComponent(id)}`;
/** an item's files (its asset list): a video's MP4 to play (medium, else mobile, small, large, the original), its original, its captions */
export function readAssets(j: any): { files: string[]; play: string; original: string; captions: string } {
  const files: string[] = (Array.isArray(j?.collection?.items) ? j.collection.items : []).map((x: any) => fileUrl(x?.href)).filter(Boolean);
  const by = (suffix: string) => files.find((f) => decodeURIComponent(f).toLowerCase().endsWith(suffix)) ?? '';
  const play = by('~medium.mp4') || by('~mobile.mp4') || by('~small.mp4') || by('~large.mp4') || by('~orig.mp4') || files.find((f) => /\.mp4$/i.test(f)) || '';
  const original = by('~orig.mp4') || play;
  const captions = by('.vtt') || by('.srt');
  return { files, play, original, captions };
}
/** SRT captions as WebVTT (a <track> reads only WebVTT); WebVTT as it is */
export function toVtt(text: string): string {
  const t = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (/^WEBVTT/.test(t)) return `${t}\n`;
  const cues = t.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => /-->/.test(l));
    if (at < 0) return '';
    const time = lines[at].replace(/(\d+:\d{2}:\d{2}),(\d{1,3})/g, (_, a: string, b: string) => `${a}.${b.padEnd(3, '0')}`).replace(/(^|\s)(\d{1,2}:\d{2}),(\d{3})/g, '$1$2.$3');
    return [time, ...lines.slice(at + 1)].join('\n');
  }).filter(Boolean);
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
/** an item as the wallpaper maker's picture */
export function picOf(x: Item): Pic {
  const others = x.others.length ? x.others.join(', ') : '';
  const credit = x.credit || (x.photographer ? `NASA / ${x.photographer}` : 'NASA');
  const orig = x.renditions[x.renditions.length - 1];
  // the picture's size: the original's where it is known (0 × 0: known once loaded)
  return {
    key: `nasa:${x.id}`, source: 'nasa', title: x.title, artist: x.photographer || x.credit || 'NASA', date: x.date.slice(0, 10),
    about: x.description.slice(0, 1200), aboutCredit: '',
    licence: others ? { name: `NASA (also credited: ${others} — its terms may apply)`, url: GUIDELINES } : { name: 'NASA — not copyrighted in the US', url: GUIDELINES },
    credit: `${credit}, NASA Image and Video Library`, page: x.page, width: orig?.width ?? 0, height: orig?.height ?? 0,
    original: x.original, thumb: x.thumb, preview: x.preview, iiif: '', wiki: '', renditions: x.renditions,
  };
}
