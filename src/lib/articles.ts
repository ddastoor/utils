// Articles → Kindle (potentials #106): web articles saved on the device made into one EPUB for Send to Kindle. No DOM —
// the unit suite runs it in Node with the same engine.
//   1. pages from what was chosen (`pagesOf`): Chrome's and Edge's single file (.mhtml — Chrome on Android saves pages so
//      too) and Safari's web archive unpacked by article.wasm; a page saved "complete" with the files of its folder; a page
//      saved as HTML only; a text file; a pasted selection (`pastedPage`).
//   2. its article (`articleOf`): article.wasm — Mozilla Readability's algorithm (dom_smoothie): the title, author, site,
//      date and the article as XHTML (whole = the page as it is, for a selection the reader made).
//   3. its pictures found among the saved files (`pictureFor`): by address, Content-ID, data: URL or path in the folder.
//   4. the EPUB (`makeEpub`): a chapter per article (its title, author, site, date and address on top), a contents page
//      when there are several, the pictures in a size for an e-reader (the page's `convert`), a cover; EPUB 3 with an
//      NCX for older readers, the mimetype stored first (fflate).
import { zipSync, strToU8 } from 'fflate';
import type { ArticleEngine, Found, SavedPart } from '../wasm/article';
import { textToHtml } from './ebook';

export interface InFile { name: string; bytes: Uint8Array; /** the path inside a chosen or dropped folder */ path?: string }
export type Via = 'mhtml' | 'webarchive' | 'complete' | 'html' | 'text' | 'paste';
export interface Page {
  name: string; via: Via; html: string;
  /** the page's address (where it was saved from), '' when unknown */
  url: string;
  subject?: string;
  /** the files saved with it (MHTML parts, web archive resources, the folder of a "complete" save) */
  files: SavedPart[];
  /** the whole page is the article (a pasted selection, a text file) */
  whole?: boolean;
}
export interface Picture { alt: string; urls: Array<[string, number]>; file: SavedPart | null }
export interface Article {
  name: string; via: Via; title: string; author: string; site: string;
  /** yyyy-mm-dd, '' when the page gives no date */
  date: string;
  lang: string; dir: string; url: string; excerpt: string; words: number; readable: boolean; whole: boolean;
  xhtml: string; text: string; pictures: Picture[]; dropped: Found['dropped'];
}

const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
const lower = (s: string) => s.toLowerCase();
const EXT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff', css: 'text/css', js: 'text/javascript',
  htm: 'text/html', html: 'text/html', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', json: 'application/json',
};
/** A picture's type from its first bytes ('' when it is none the tab knows). */
export function pictureType(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (latin1(b.subarray(4, 12)) === 'ftypavif' || latin1(b.subarray(4, 12)) === 'ftypavis') return 'image/avif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  const head = latin1(b.subarray(0, 512)).replace(/^﻿|^\xEF\xBB\xBF/, '').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return '';
}

/** What a chosen file is, by its name and its first bytes. */
export function kindOf(f: InFile): 'mhtml' | 'webarchive' | 'html' | 'text' | 'picture' | 'other' {
  const n = lower(f.name), b = f.bytes;
  const head = latin1(b.subarray(0, 4096));
  if (head.startsWith('bplist00') || /\.webarchive$/.test(n)) return 'webarchive';
  if (/\.(mhtml|mht)$/.test(n) || (/^mime-version:/im.test(head) && /^content-type:\s*multipart\/related/im.test(head))) return 'mhtml';
  if (/\.(x?html?|shtml)$/.test(n)) return 'html';
  if (pictureType(b) || /\.(jpe?g|jfif|png|gif|webp|avif|svg|bmp|ico|tiff?)$/.test(n)) return 'picture';
  if (/^\s*(?:<!--[\s\S]*?-->\s*)*<(?:!doctype html|html|head|body)\b/i.test(head.replace(/^\xEF\xBB\xBF/, ''))) return 'html';
  if (/\.(txt|text|md|markdown)$/.test(n)) return 'text';
  return 'other';
}

/** The character set an HTML file declares in its first 1,024 bytes (the HTML standard's prescan, simplified). */
export function declaredCharset(b: Uint8Array): string {
  const head = latin1(b.subarray(0, 1024));
  const m = /<meta\b[^>]*?charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : '';
}
const decoder = (label: string) => { try { return new TextDecoder(label); } catch { return null; } };
/** An HTML file's text: its byte-order mark, else the character set its container or its <meta> gives (UTF-16 in a <meta>
 *  means UTF-8, as the HTML standard says), else UTF-8 when it is valid, else Windows-1252 (an old page without a label). */
export function decodeHtml(b: Uint8Array, label = ''): string {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  let d = label ? decoder(label) : null;
  if (!d) { const m = declaredCharset(b); if (m) { d = decoder(m); if (d && /^utf-16/.test(d.encoding)) d = new TextDecoder('utf-8'); } }
  if (d) return d.decode(b);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

/** The address a page was saved from: Chrome's mark at the top of a saved page ("<!-- saved from url=(0047)https://…"). */
export function savedFrom(html: string): string {
  const m = /<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i.exec(html.slice(0, 4096));
  return m && /^https?:\/\//i.test(m[1]) ? m[1] : '';
}
/** The address a page names itself by: its canonical link, else og:url (a page saved as HTML only has no other). */
export function canonicalOf(html: string): string {
  const head = html.slice(0, 200_000);
  const tag = /<link\b[^>]*\brel=["']?canonical\b[^>]*>/i.exec(head)?.[0] || /<meta\b[^>]*\bproperty=["']?og:url\b[^>]*>/i.exec(head)?.[0] || '';
  const v = /\b(?:href|content)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  const u = (v?.[1] ?? v?.[2] ?? v?.[3] ?? '').trim().replace(/&amp;/g, '&');
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : '';
}
const typeOfName = (name: string) => EXT_TYPE[lower(name).split('?')[0].split('.').pop() || ''] || '';

/** Pages from the files chosen (or dropped): each saved page with the files it came with. Pictures and a page's own
 *  files chosen beside an HTML page are its folder's ("Webpage, Complete"). */
export function pagesOf(files: InFile[], e: ArticleEngine): { pages: Page[]; skipped: Array<{ name: string; why: string }> } {
  const pages: Page[] = [], skipped: Array<{ name: string; why: string }> = [];
  const loose: SavedPart[] = [];
  const htmls: InFile[] = [];
  for (const f of files) {
    const k = kindOf(f);
    if (k === 'picture' || k === 'other') {
      const path = (f.path || f.name).replace(/\\/g, '/');
      loose.push({ type: pictureType(f.bytes) || typeOfName(f.name), charset: '', url: path, cid: '', bytes: f.bytes });
      continue;
    }
    if (k === 'html') { htmls.push(f); continue; }
    if (k === 'text') {
      const text = decodeHtml(f.bytes);
      if (!text.trim()) { skipped.push({ name: f.name, why: 'it is empty' }); continue; }
      pages.push({ name: f.name, via: 'text', html: textToHtml(text, f.name), url: '', files: [], whole: true });
      continue;
    }
    try {
      const u = k === 'mhtml' ? e.mhtml(f.bytes) : e.webarchive(f.bytes);
      const main = u.parts.find((p) => /html/.test(p.type) && u.url && p.url === u.url) || u.parts.find((p) => /html/.test(p.type));
      if (!main) { skipped.push({ name: f.name, why: 'it holds no web page' }); continue; }
      // Chrome's MHTML points a frame (an embedded video) at the part it saved of it: its address again, so the frame
      // becomes a link to it
      const html = decodeHtml(main.bytes, main.charset).replace(/(<iframe\b[^>]*?\bsrc=")cid:([^"]+)"/gi, (m, a: string, cid: string) => { const fr = u.parts.find((p) => p.cid === cid); return fr && /^https?:\/\//i.test(fr.url) ? `${a}${fr.url.replace(/"/g, '&quot;')}"` : m; });
      pages.push({ name: f.name, via: k, html, url: /^https?:/i.test(u.url) ? u.url : (/^https?:/i.test(main.url) ? main.url : ''), subject: u.subject, files: u.parts.filter((p) => p !== main) });
    } catch (err: any) {
      skipped.push({ name: f.name, why: String(err?.message || err) });
    }
  }
  for (const f of htmls) {
    const html = decodeHtml(f.bytes);
    if (!html.trim()) { skipped.push({ name: f.name, why: 'it is empty' }); continue; }
    pages.push({ name: f.name, via: loose.length ? 'complete' : 'html', html, url: savedFrom(html) || canonicalOf(html), files: loose });
  }
  if (!pages.length && loose.length) for (const p of loose.slice(0, 3)) skipped.push({ name: p.url.split('/').pop() || p.url, why: /^image\//.test(p.type) ? 'a picture on its own is no article — choose the page it belongs to as well' : 'it is not a saved web page' });
  return { pages, skipped };
}

/** A pasted selection: what the browser copied as HTML (its links absolute), else the plain text. */
export function pastedPage(html: string, text: string, n = 1): Page {
  const has = html && /<[a-z][\s\S]*>/i.test(html);
  return { name: `Pasted ${n}`, via: 'paste', html: has ? html : textToHtml(text, `Pasted ${n}`), url: '', files: [], whole: true };
}

// ------------------------------------------------------------------------------------------------- the article
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
/** A piece of a byline that is a date, a time or a reading time ("20 November 2026", "Updated 3 hours ago", "6 min read"). */
const DATEISH = new RegExp(`\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}|${MONTH}\\s+\\d{1,2})\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}\\b|\\b(?:19|20)\\d{2}\\b|\\b(?:updated|published|posted)\\b|\\bmin(?:ute)?s?\\b|\\bread\\b|\\bago\\b|\\b\\d{1,2}:\\d{2}\\b`, 'i');
/** "By Jane Doe · 20 November 2026" → "Jane Doe": the "By", and the date or reading time after a separator, left out (a
 *  page whose metadata is gone — Chrome's MHTML leaves its JSON-LD out — gives its byline line as it stands); nothing
 *  that is an address, the site's name or longer than a byline. */
export function cleanByline(b: string | null | undefined, site = ''): string {
  const parts = collapse(b || '').split(/\s+[·•|—–]\s+|\s+-\s+|\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
  let s = (parts.find((x) => !DATEISH.test(x)) || '').replace(/^(?:by|written by|von|par|por)\s*[:\-–]?\s+/i, '').replace(/^[|·•–—-]\s*/, '');
  if (!s || s.length > 120 || DATEISH.test(s) || /^https?:\/\//i.test(s) || /^\W+$/.test(s) || (site && lower(s) === lower(site))) return '';
  return s;
}
/** A date the page gives (ISO 8601 or anything Date reads) as yyyy-mm-dd; '' when it cannot be read. */
export function isoDate(s: string | null | undefined): string {
  const t = collapse(s || '');
  if (!t) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(t);
  if (isNaN(+d) || d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2200) return '';
  return d.toISOString().slice(0, 10);
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** yyyy-mm-dd as "20 November 2026". */
export const dateText = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : ''; };
const langOf = (l: string | null | undefined) => { const s = collapse(l || '').replace(/_/g, '-'); return /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i.test(s) ? s : ''; };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** The article of a page (`whole`: the page as it is). Throws NoArticle when Readability finds none. */
export function articleOf(e: ArticleEngine, p: Page, whole = !!p.whole): Article {
  const f = e.read(p.html, p.url, { whole });
  const url = p.url || (f.url && /^https?:\/\//i.test(f.url) ? f.url : '');
  const site = collapse(f.siteName || '') || host(url);
  const title = collapse(f.title || '') || collapse(p.subject || '') || p.name.replace(/\.[^.]+$/, '');
  const pictures: Picture[] = f.images.map((i) => ({ alt: i.alt, urls: i.urls, file: pictureFor(i.urls, p) }));
  let xhtml = f.xhtml;
  // the page's own picture (og:image — a news story's lead photo) on top, when it was saved with the page and the article
  // does not show it: Readability leaves a lead picture that stands above the article's text out
  const lead = !whole && f.image ? pictureFor([[f.image, 0]], p) : null;
  if (lead && !pictures.some((q) => q.file === lead || (q.file && q.file.bytes.length === lead.bytes.length && q.file.url === lead.url))) {
    xhtml = `<figure><img src="\u27e60\u27e7" alt=""/></figure>` + xhtml.replace(/\u27e6(\d+)\u27e7/g, (_, n) => `\u27e6${+n + 1}\u27e7`);
    pictures.unshift({ alt: '', urls: [[f.image!, 0]], file: lead });
  }
  return {
    name: p.name, via: p.via, title, author: cleanByline(f.byline, site), site, date: isoDate(f.published), lang: langOf(f.lang), dir: f.dir === 'rtl' ? 'rtl' : '',
    url, excerpt: collapse(f.excerpt || ''), words: f.words, readable: f.readable, whole, xhtml, text: f.text, pictures, dropped: f.dropped,
  };
}

// ------------------------------------------------------------------------------------------------- pictures
const index = new WeakMap<Page, { url: Map<string, SavedPart>; cid: Map<string, SavedPart>; paths: Array<[string, SavedPart]> }>();
const noFrag = (u: string) => u.split('#')[0];
const decodePath = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
function indexOf(p: Page) {
  let x = index.get(p);
  if (x) return x;
  x = { url: new Map(), cid: new Map(), paths: [] };
  for (const f of p.files) {
    if (f.url) {
      x.url.set(noFrag(f.url), f);
      try { x.url.set(noFrag(new URL(f.url, p.url || undefined).href), f); } catch { /* a path of a folder */ }
      if (!/^[a-z][\w+.-]*:/i.test(f.url)) x.paths.push([decodePath(f.url).replace(/^\.?\//, ''), f]);
    }
    if (f.cid) x.cid.set(f.cid, f);
  }
  index.set(p, x);
  return x;
}
/** A data: URL's bytes. */
export function dataUrl(u: string): SavedPart | null {
  const m = /^data:([^,]*?),(.*)$/is.exec(u.trim());
  if (!m) return null;
  const meta = m[1].split(';').map((s) => s.trim()), b64 = meta.some((s) => lower(s) === 'base64');
  let bytes: Uint8Array;
  try {
    if (b64) { const bin = atob(decodePath(m[2]).replace(/[^A-Za-z0-9+/=]/g, '')); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    else bytes = new TextEncoder().encode(decodePath(m[2]));
  } catch { return null; }
  return { type: lower(meta[0] || '') || pictureType(bytes), charset: '', url: '', cid: '', bytes };
}
const isPicture = (f: SavedPart) => /^image\//.test(f.type) || !!pictureType(f.bytes);
/** The saved file a picture of the article is, by the addresses the engine gave (the first that was saved). */
export function pictureFor(urls: Array<[string, number]>, p: Page): SavedPart | null {
  const x = indexOf(p);
  for (const [raw] of urls) {
    const u = raw.trim();
    if (!u) continue;
    if (/^data:/i.test(u)) { const d = dataUrl(u); if (d && isPicture(d)) return d; continue; }
    if (/^cid:/i.test(u)) { const f = x.cid.get(u.slice(4).replace(/^<|>$/g, '')); if (f && isPicture(f)) return f; continue; }
    let abs = u;
    try { abs = new URL(u, p.url || undefined).href; } catch { /* no base: a relative path */ }
    const f = x.url.get(noFrag(abs)) || x.url.get(noFrag(u));
    if (f && isPicture(f)) return f;
    // a page saved "complete": its pictures in the folder beside it ("Title_files/photo.jpg")
    if (x.paths.length) {
      let path = u;
      try { if (/^[a-z][\w+.-]*:/i.test(u)) path = new URL(u).pathname; } catch { /* as it is */ }
      path = decodePath(noFrag(path).split('?')[0]).replace(/^\.?\//, '');
      const tail = path.split('/').slice(-2).join('/');
      const hit = x.paths.find(([q]) => q === path || q.endsWith('/' + path) || path.endsWith('/' + q) || (tail.includes('/') && q.endsWith('/' + tail)));
      if (hit && isPicture(hit[1])) return hit[1];
      const name = path.split('/').pop() || '';
      const same = x.paths.filter(([q]) => q.split('/').pop() === name);
      if (name && same.length === 1 && isPicture(same[0][1])) return same[0][1];
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------- the EPUB
export interface BookOptions {
  title: string; author: string;
  /** keep the pictures (made to fit an e-reader) or leave them out */
  pictures: boolean;
  cover?: { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' } | null;
  /** for the tests: a fixed identifier and modification time */
  id?: string; modified?: string;
}
/** A picture made to fit an e-reader (JPEG, PNG or GIF), or null when it cannot be read or is a tracking pixel. */
export type Convert = (f: SavedPart) => Promise<{ bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' | 'image/gif'; w: number; h: number } | null>;

export const xmlText = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f￾￿]/g, '');
export const esc = (s: string) => xmlText(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };
/** Reading time at 238 words a minute (the Word Counter's speed). */
export const minutes = (words: number) => Math.max(1, Math.round(words / 238));
/** The line under an article's title: author · site · date · reading time. */
export const byline = (a: Article) => [a.author, a.site, dateText(a.date), `${minutes(a.words)} min read`].filter(Boolean).join(' · ');

const STYLE = `body { margin: 0 2%; line-height: 1.45 }
h1 { font-size: 1.6em; line-height: 1.2; margin: 0.4em 0 0.3em }
h2 { font-size: 1.3em; margin: 1.2em 0 0.4em } h3 { font-size: 1.12em; margin: 1em 0 0.3em } h4, h5, h6 { font-size: 1em; margin: 1em 0 0.3em }
p { margin: 0 0 0.75em }
header.head { margin-bottom: 1.4em; padding-bottom: 0.6em; border-bottom: 1px solid #888 }
p.meta { font-size: 0.85em; margin: 0.2em 0; color: #444 }
p.src { font-size: 0.75em; margin: 0.2em 0; word-wrap: break-word; overflow-wrap: anywhere }
img { max-width: 100%; height: auto }
figure { margin: 1em 0; text-align: center } figcaption { font-size: 0.85em; font-style: italic; margin-top: 0.3em }
blockquote { margin: 1em 1.2em; font-style: italic }
pre { white-space: pre-wrap; word-wrap: break-word; font-size: 0.85em; margin: 0.8em 0 } code { font-family: monospace; font-size: 0.95em }
table { border-collapse: collapse; margin: 1em 0; font-size: 0.9em } td, th { border: 1px solid #999; padding: 0.2em 0.4em; vertical-align: top } th { font-weight: bold }
p.embed { font-size: 0.85em; font-style: italic }
code.tex { font-size: 0.9em }
.toc p { margin: 0 0 1em } .toc span.by { font-size: 0.85em; color: #444 }
`;

const doc = (lang: string, title: string, body: string, dir = '') => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"${dir ? ` dir="${dir}"` : ''}><head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>${body}</body></html>\n`;
const stripTags = (s: string) => collapse(s.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

/** The EPUB of the articles, in their order. */
export async function makeEpub(arts: Article[], o: BookOptions, convert: Convert, onProgress?: (done: number, of: number) => void): Promise<{ epub: Uint8Array; pictures: number; missing: number }> {
  if (!arts.length) throw new Error('No article to put in the book.');
  const lang = arts.map((a) => a.lang).find(Boolean) || 'en';
  const files: Record<string, Uint8Array> = {};
  const manifest: string[] = [], spine: string[] = [];
  const toc: Array<{ file: string; label: string; kids: Array<{ file: string; label: string }> }> = [];
  const stored = new Map<SavedPart, string | null>();
  let pics = 0, missing = 0, done = 0;
  const total = arts.reduce((n, a) => n + a.pictures.length, 0);
  const several = arts.length > 1;
  for (let k = 0; k < arts.length; k++) {
    const a = arts[k], id = `a${String(k + 1).padStart(2, '0')}`, file = `${id}.xhtml`;
    // the pictures: each saved file once, in a size for an e-reader
    const hrefs: Array<string | null> = [];
    for (const p of a.pictures) {
      let href: string | null = null;
      if (o.pictures && p.file) {
        if (stored.has(p.file)) href = stored.get(p.file)!;
        else {
          const c = await convert(p.file).catch(() => null);
          if (c) {
            href = `images/p${String(stored.size + 1).padStart(3, '0')}.${EXT[c.mime]}`;
            files[`OEBPS/${href}`] = c.bytes;
            manifest.push(`<item id="img${stored.size + 1}" href="${href}" media-type="${c.mime}"/>`);
          }
          stored.set(p.file, href);
        }
      }
      if (href) pics++; else if (o.pictures) missing++;
      hrefs.push(href);
      onProgress?.(++done, total);
    }
    let body = a.xhtml.replace(/<img src="⟦(\d+)⟧" alt="([^"]*)"\/>/g, (_, n, alt) => { const h = hrefs[+n]; return h ? `<img src="${h}" alt="${alt}"/>` : ''; });
    // figures and paragraphs left empty by a picture that is not there
    body = body.replace(/<figure>\s*<\/figure>|<p>\s*<\/p>/g, '');
    // the article's sections in the contents: its second-level headings
    const kids: Array<{ file: string; label: string }> = [];
    let s = 0;
    body = body.replace(/<h2((?: [a-z:]+="[^"]*")*)>([\s\S]*?)<\/h2>/g, (m, attrs: string, inner: string) => {
      const label = stripTags(inner);
      if (!label) return m;
      let hid = /\sid="([^"]*)"/.exec(attrs)?.[1];
      if (!hid) { hid = `${id}-s${++s}`; attrs += ` id="${hid}"`; }
      kids.push({ file: `${file}#${hid}`, label });
      return `<h2${attrs}>${inner}</h2>`;
    });
    const meta = byline(a);
    const head = `<header class="head"><h1>${esc(a.title)}</h1>${meta ? `<p class="meta">${esc(meta)}</p>` : ''}${a.url ? `<p class="src"><a href="${esc(a.url)}">${esc(a.url.replace(/^https?:\/\//, ''))}</a></p>` : ''}</header>`;
    files[`OEBPS/${file}`] = strToU8(doc(a.lang || lang, a.title, `<section epub:type="chapter" class="article" id="${id}">${head}\n${body}\n</section>`, a.dir));
    manifest.push(`<item id="${id}" href="${file}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    toc.push({ file, label: a.title, kids: kids.length > 1 && kids.length <= 60 ? kids : [] });
  }
  // the contents page (several articles): titles with author, site, date and reading time
  if (several) {
    const list = arts.map((a, k) => `<p><a href="a${String(k + 1).padStart(2, '0')}.xhtml">${esc(a.title)}</a><br/><span class="by">${esc(byline(a))}</span></p>`).join('\n');
    files['OEBPS/contents.xhtml'] = strToU8(doc(lang, 'Contents', `<section class="toc" epub:type="toc"><h1>${esc(o.title)}</h1><h2>Contents</h2>\n${list}\n</section>`));
    manifest.unshift('<item id="contents" href="contents.xhtml" media-type="application/xhtml+xml"/>');
    spine.unshift('<itemref idref="contents"/>');
  }
  if (o.cover) {
    const href = `images/cover.${o.cover.mime === 'image/png' ? 'png' : 'jpg'}`;
    files[`OEBPS/${href}`] = o.cover.bytes;
    manifest.push(`<item id="cover-image" href="${href}" media-type="${o.cover.mime}" properties="cover-image"/>`);
  }
  const title = esc(o.title || arts[0].title) || 'Articles', id = o.id || `urn:uuid:${crypto.randomUUID()}`;
  const modified = o.modified || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const items = several ? [{ file: 'contents.xhtml', label: 'Contents', kids: [] }, ...toc] : toc;
  const ol = (xs: Array<{ file: string; label: string; kids?: Array<{ file: string; label: string }> }>): string => `<ol>${xs.map((t) => `<li><a href="${t.file}">${esc(t.label)}</a>${t.kids?.length ? ol(t.kids) : ''}</li>`).join('')}</ol>`;
  files['OEBPS/nav.xhtml'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><meta charset="utf-8"/><title>${title}</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1>${ol(items)}</nav></body></html>\n`);
  let n = 0;
  const plays = new Map<string, number>(), play = (f: string) => { const base = f.split('#')[0]; if (!plays.has(f)) plays.set(f, plays.size + 1); return plays.get(f)! + (base ? 0 : 0); };
  const points = (xs: Array<{ file: string; label: string; kids?: Array<{ file: string; label: string }> }>): string => xs.map((t) => `<navPoint id="n${++n}" playOrder="${play(t.file)}"><navLabel><text>${esc(t.label)}</text></navLabel><content src="${t.file}"/>${t.kids?.length ? points(t.kids) : ''}</navPoint>`).join('');
  files['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(id)}"/></head><docTitle><text>${title}</text></docTitle><navMap>${points(items)}</navMap></ncx>\n`);
  files['OEBPS/style.css'] = strToU8(STYLE);
  const one = !several ? arts[0] : null;
  const author = collapse(o.author || '');
  const dcs = [
    `<dc:identifier id="bookid">${esc(id)}</dc:identifier>`, `<dc:title>${title}</dc:title>`, author ? `<dc:creator>${esc(author)}</dc:creator>` : '',
    `<dc:language>${lang}</dc:language>`, `<meta property="dcterms:modified">${modified}</meta>`,
    one?.date ? `<dc:date>${one.date}</dc:date>` : '', one?.site ? `<dc:publisher>${esc(one.site)}</dc:publisher>` : '',
    one?.url ? `<dc:source>${esc(one.url)}</dc:source>` : '', one?.excerpt ? `<dc:description>${esc(one.excerpt.slice(0, 500))}</dc:description>` : '',
    o.cover ? '<meta name="cover" content="cover-image"/>' : '',
  ].filter(Boolean).join('');
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${dcs}</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>${manifest.join('')}</manifest>
<spine toc="ncx">${spine.join('')}</spine></package>\n`);
  const epub = zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n'),
    ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: /\.(jpg|png|gif)$/.test(k) ? 0 : 6 }]])),
  } as any);
  return { epub, pictures: pics, missing };
}
