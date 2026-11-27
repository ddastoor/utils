// The EPUB Reader's engine (potentials #71): e-books opened, laid out and drawn by MuPDF (Artifex's official
// WebAssembly build, already on the site for every PDF tab) — EPUB 2 and 3, MOBI (Mobipocket, without DRM), FictionBook,
// comics (CBZ, CBT; CBR and CB7 once 7-Zip has turned them into a zip), plain text and web pages. No DOM: it runs in the
// reader's worker (src/workers/ebook.worker.ts) and under Node in the unit suite.
//
// What is ours (glue around MuPDF): telling the kinds apart and refusing what cannot be read (DRM, Amazon's own formats,
// a PDF) in words; the title and author where MuPDF gives none (MOBI's EXTH, a comic's ComicInfo.xml); a plain text made a
// web page (paragraphs joined, chapter lines made headings, so the text reflows and has contents); the reader's look as
// CSS (font, size, line spacing, justification, theme); keeping the reader's place when the book is laid out again (the
// text at the top of the page found on the new pages); search with the line around each hit.
import { unzipSync } from 'fflate';
import { textOf } from './textfile';

type Mu = typeof import('mupdf');
type Doc = any;

export type Kind = 'epub' | 'mobi' | 'fb2' | 'cbz' | 'cbt' | 'txt' | 'html';
/** MuPDF's document handler for each kind */
export const MAGIC: Record<Kind, string> = {
  epub: 'application/epub+zip', mobi: 'application/x-mobipocket-ebook', fb2: 'application/x-fictionbook',
  cbz: 'application/vnd.comicbook+zip', cbt: 'application/x-cbt', txt: 'application/xhtml+xml', html: 'text/html',
};
export const KIND_NAMES: Record<Kind, string> = {
  epub: 'EPUB', mobi: 'MOBI (Kindle)', fb2: 'FictionBook', cbz: 'comic book', cbt: 'comic book', txt: 'plain text', html: 'web page',
};
/** comics: pages of a fixed size, never laid out */
export const isFixed = (k: Kind) => k === 'cbz' || k === 'cbt';

const IMAGE = /\.(jpe?g|png|gif|webp|bmp|tiff?|jxr|jp2|jpx|avif)$/i;
const td = new TextDecoder();
const latin1 = (b: Uint8Array, a: number, n: number) => String.fromCharCode(...b.subarray(a, a + n));
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

export interface Opened {
  kind: Kind;
  /** the bytes MuPDF opens (a plain text: the web page made of it; a zipped FictionBook: the book) */
  bytes: Uint8Array;
  /** what our own reading found, where MuPDF says nothing */
  title?: string;
  author?: string;
  /** how the file was read, for the line under the book ("a CBR comic, unpacked by 7-Zip") */
  note?: string;
}
/** A file this tab will not open; the message says why and what to do. */
export class Refused extends Error {}
/** A RAR or 7z archive: the tab has 7-Zip turn it into a zip and asks again (a CBR or CB7 comic). */
export class NeedsUnpacking extends Error { constructor(public format: 'RAR' | '7z') { super(format); } }

/** The names in a zip, without inflating anything. */
export function zipNames(b: Uint8Array): string[] {
  const names: string[] = [];
  unzipSync(b, { filter: (f) => { names.push(f.name); return false; } });
  return names;
}
/** One file of a zip (its bytes), or undefined. */
export function zipFile(b: Uint8Array, name: string): Uint8Array | undefined {
  const lower = name.toLowerCase();
  const got = unzipSync(b, { filter: (f) => f.name.toLowerCase() === lower });
  return Object.values(got)[0];
}

/** The DRM of an EPUB, or '' when it has none. Font obfuscation (IDPF's and Adobe's) is not DRM: the text is readable. */
export function epubDrm(b: Uint8Array, names: string[]): string {
  const has = (n: string) => names.some((x) => x.toLowerCase() === n);
  if (has('meta-inf/license.lcpl')) return 'Readium LCP';
  if (has('meta-inf/sinf.xml')) return 'Apple’s FairPlay';
  if (!has('meta-inf/encryption.xml')) return '';
  const xml = td.decode(zipFile(b, 'META-INF/encryption.xml') || new Uint8Array());
  const algos = [...xml.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/g)].map((x) => x[1]);
  const fontsOnly = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
  if (!algos.some((a) => !fontsOnly.includes(a))) return '';
  if (/ns\.adobe\.com\/adept/.test(xml) || has('meta-inf/rights.xml')) return 'Adobe’s DRM (ADEPT)';
  if (/kobo/i.test(xml)) return 'Kobo’s DRM';
  return 'DRM';
}

export interface MobiHeader { compression: number; encryption: number; encoding: number; title?: string; author?: string; version: number }
/** Record 0 of a Mobipocket file: compression, DRM, and the title and author of its EXTH header (MuPDF reads neither). */
export function mobiHeader(b: Uint8Array): MobiHeader | null {
  if (b.length < 86) return null;
  const n = u16(b, 76), r0 = u32(b, 78);
  if (!n || r0 + 16 > b.length) return null;
  const h: MobiHeader = { compression: u16(b, r0), encryption: u16(b, r0 + 12), encoding: 1252, version: 0 };
  if (latin1(b, r0 + 16, 4) !== 'MOBI') return h;
  const len = u32(b, r0 + 20);
  h.encoding = u32(b, r0 + 28);
  h.version = u32(b, r0 + 36);
  const dec = (a: number, l: number) => { const s = b.subarray(a, Math.min(b.length, a + l)); return h.encoding === 65001 ? td.decode(s) : new TextDecoder('windows-1252').decode(s); };
  const nameOff = u32(b, r0 + 0x54), nameLen = u32(b, r0 + 0x58);
  if (nameLen && nameLen < 1024 && r0 + nameOff + nameLen <= b.length) h.title = dec(r0 + nameOff, nameLen).trim() || undefined;
  const flags = u32(b, r0 + 0x80), ex = r0 + 16 + len;
  if (flags & 0x40 && latin1(b, ex, 4) === 'EXTH') {
    const count = u32(b, ex + 8);
    for (let k = 0, o = ex + 12; k < count && o + 8 <= b.length; k++) {
      const type = u32(b, o), l = u32(b, o + 4);
      if (l < 8 || o + l > b.length) break;
      if (type === 503) h.title = dec(o + 8, l - 8).trim() || h.title;
      if (type === 100 && !h.author) h.author = dec(o + 8, l - 8).trim() || undefined;
      o += l;
    }
  }
  return h;
}

const xmlText = (xml: string, tag: string) => {
  const r = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return r ? r[1].replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim() || undefined : undefined;
};

/** What a file is, and the bytes MuPDF should open. Throws Refused (in words) or NeedsUnpacking. */
export function openFile(bytes: Uint8Array, name: string): Opened {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();
  if (!bytes.length) throw new Refused(`${name} is empty.`);
  const head = latin1(bytes, 0, Math.min(8, bytes.length));
  if (head.startsWith('%PDF')) throw new Refused(`${name} is a PDF, not an e-book. The browser shows a PDF by itself; to read one on a Kindle’s screen, the PDF for Kindle tab cuts it to size.`);
  if (head.startsWith('Rar!\x1a\x07')) throw new NeedsUnpacking('RAR');
  if (head.startsWith('7z\xbc\xaf\x27\x1c')) throw new NeedsUnpacking('7z');
  if (head.startsWith('\xeaDRMION') || head.startsWith('CONT') && bytes[4] <= 2 && bytes[5] === 0) throw new Refused(`${name} is in Amazon’s KFX format, which only Kindle devices and apps open. A book bought from Amazon cannot be read here; a book of your own opens here as EPUB or MOBI.`);
  if (head.startsWith('PK\x03\x04') || head.startsWith('PK\x05\x06')) {
    let names: string[];
    try { names = zipNames(bytes); } catch { throw new Refused(`${name} is a damaged zip file.`); }
    const lower = names.map((x) => x.toLowerCase());
    if (lower.includes('meta-inf/container.xml') || lower.includes('mimetype') && td.decode(zipFile(bytes, 'mimetype') || new Uint8Array()).trim() === 'application/epub+zip') {
      const drm = epubDrm(bytes, names);
      if (drm) throw new Refused(`${name} is locked with ${drm}. Only the app of the shop it was bought from can open it; a book without DRM opens here.`);
      return { kind: 'epub', bytes };
    }
    const fb2s = names.filter((x) => /\.fb2$/i.test(x));
    if (fb2s.length === 1) return { kind: 'fb2', bytes: zipFile(bytes, fb2s[0])!, note: 'a FictionBook in a zip' };
    const images = names.filter((x) => IMAGE.test(x) && !/(^|\/)(__macosx|\.)/i.test(x));
    if (images.length) {
      const info = names.find((x) => /(^|\/)comicinfo\.xml$/i.test(x));
      const xml = info ? td.decode(zipFile(bytes, info) || new Uint8Array()) : '';
      return { kind: 'cbz', bytes, title: xmlText(xml, 'Title') || xmlText(xml, 'Series'), author: xmlText(xml, 'Writer') || xmlText(xml, 'Penciller') };
    }
    if (lower.includes('word/document.xml')) throw new Refused(`${name} is a Word document, not an e-book.`);
    throw new Refused(`${name} is a zip file without a book or pictures in it.`);
  }
  if (bytes.length > 68 && /^(BOOKMOBI|TEXtREAd)$/.test(latin1(bytes, 60, 8))) {
    const h = mobiHeader(bytes);
    if (!h) throw new Refused(`${name} is a damaged MOBI file.`);
    if (h.encryption) throw new Refused(`${name} is locked with Amazon’s DRM (Mobipocket encryption). A Kindle book bought from Amazon only opens in Kindle devices and apps; a MOBI file without DRM opens here.`);
    if (h.compression === 17480) throw new Refused(`${name} is compressed with Amazon’s Huffman scheme (HUFF/CDIC), which MuPDF cannot read.`);
    if (h.compression !== 1 && h.compression !== 2) throw new Refused(`${name} uses a compression MuPDF cannot read (${h.compression}).`);
    const pdbName = latin1(bytes, 0, 32).replace(/\0[\s\S]*$/, '').replace(/_/g, ' ').trim();
    return { kind: 'mobi', bytes, title: h.title || pdbName || undefined, author: h.author, note: h.version >= 8 ? 'a Kindle Format 8 (AZW3) book: its text is read, its pictures and its own styles may be missing' : undefined };
  }
  if (bytes.length > 68 && /^[A-Za-z]{4}[A-Za-z]{4}$/.test(latin1(bytes, 60, 8)) && ['pdb', 'prc', 'azw', 'azw3', 'mobi'].includes(ext))
    throw new Refused(`${name} is a Palm database of the kind “${latin1(bytes, 60, 8)}”, not a book this tab can read.`);
  if (bytes.length > 262 && latin1(bytes, 257, 5) === 'ustar') {
    const names = tarNames(bytes);
    if (names.some((x) => IMAGE.test(x))) return { kind: 'cbt', bytes };
    throw new Refused(`${name} is a tar archive without pictures in it.`);
  }
  const t = textOf(bytes);
  if (!t) throw new Refused(`${name} is not an e-book this tab can read (EPUB, MOBI, FictionBook, a comic — CBZ, CBR, CB7, CBT —, plain text or a web page).`);
  const start = t.text.slice(0, 4096);
  if (/<FictionBook\b/.test(start)) return { kind: 'fb2', bytes: utf8(t.text) };
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype\s+html|<html\b)/i.test(start) || ['html', 'htm', 'xhtml'].includes(ext) && /<(p|div|body|h1)\b/i.test(start)) return { kind: 'html', bytes: utf8(t.text) };
  return { kind: 'txt', bytes: utf8(textToHtml(t.text, name)), note: t.how ? `read as ${t.how}` : undefined };
}
const utf8 = (s: string) => new TextEncoder().encode(s);

/** The names of the files in a tar archive. */
export function tarNames(b: Uint8Array): string[] {
  const out: string[] = [];
  for (let o = 0; o + 512 <= b.length && out.length < 10000;) {
    const name = td.decode(b.subarray(o, o + 100)).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(td.decode(b.subarray(o + 124, o + 136)).replace(/\0.*$/s, '').trim() || '0', 8) || 0;
    out.push(name);
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEADING = /^(chapter|book|part|section|volume|act|scene|canto|prologue|epilogue|preface|foreword|introduction|contents|appendix|afterword)\b[\s\S]{0,70}$/i;
/** A plain-text book as a web page MuPDF lays out: paragraphs at blank lines; lines broken by hand inside a paragraph
 *  (Project Gutenberg's at about 70 characters) joined so the text reflows, short lines kept as they are (a poem, a list);
 *  chapter lines ("CHAPTER IV.", "Part Two") and short lines in capitals made headings — the book's contents. The first
 *  short paragraph is the title. */
export function textToHtml(text: string, name = ''): string {
  const paras = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split(/\n[ \t]*\n+/).map((p) => p.replace(/^\n+|\s+$/g, '')).filter((p) => p.trim());
  let title = '';
  const body = paras.map((p, k) => {
    const lines = p.split('\n');
    const one = lines.length === 1 ? lines[0].trim() : '';
    if (k === 0 && one && one.length <= 80) { title = one; return `<h1 class="title">${esc(one)}</h1>`; }
    if (one && (HEADING.test(one) || one.length <= 60 && /[A-Z]/.test(one) && one === one.toUpperCase() && /[A-Z]{3}/.test(one))) return `<h2>${esc(one)}</h2>`;
    const long = lines.slice(0, -1).filter((l) => l.trim().length >= 45).length;
    const wrapped = lines.length > 1 && long >= Math.max(1, (lines.length - 1) * 0.8);
    const inner = wrapped ? esc(lines.map((l) => l.trim()).join(' ')) : lines.map((l) => esc(l.replace(/^ +/, (s) => '\u00a0'.repeat(s.length)))).join('<br/>');
    return `<p${wrapped ? '' : ' class="lines"'}>${inner}</p>`;
  }).join('\n');
  const t = title || name.replace(/\.[^.]+$/, '');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(t)}</title><style>` +
    'h1.title { text-align: center; margin: 2em 0 } h2 { text-align: center; page-break-before: always; margin: 1.5em 0 1em } ' +
    'p { margin: 0 0 0.6em 0 } p.lines { text-align: left }' + `</style></head><body>${body}</body></html>\n`;
}

// --------------------------------------------------------------------------------------------- the look
export type FontChoice = 'literata' | 'serif' | 'sans' | 'book';
export type Theme = 'light' | 'sepia' | 'dark' | 'black';
export interface Look {
  font: FontChoice;
  /** the body text's size, CSS px (MuPDF's em) */
  size: number;
  /** line spacing (1.2 – 2), 0 = the book's own */
  line: number;
  justify: boolean;
  theme: Theme;
  /** the book's own styles (its CSS) */
  publisher: boolean;
}
export const THEMES: Record<Theme, { name: string; bg: string; fg: string; link: string }> = {
  light: { name: 'Light', bg: '#ffffff', fg: '#1b1b1b', link: '#1a5fb4' },
  sepia: { name: 'Sepia', bg: '#f4ecd8', fg: '#433422', link: '#7a4a12' },
  dark: { name: 'Dark', bg: '#1f2023', fg: '#dcdcdc', link: '#8ab4f8' },
  black: { name: 'Black', bg: '#000000', fg: '#c8c8c8', link: '#8ab4f8' },
};
export const FONTS: Record<FontChoice, string> = {
  literata: 'Literata', serif: 'Serif (Times)', sans: 'Sans (Noto Sans)', book: 'The book’s own',
};
/** The reader's look as the user style sheet MuPDF lays the book out with. The page's margins are the reader's (the
 *  space around the page it draws), so the book's own are taken off; the chosen font is the body text's — code stays
 *  monospace; in a theme other than Light every text takes the theme's colour and no box paints a background (the
 *  page is the theme's colour). */
export function readerCSS(kind: Kind, look: Look): string {
  const css: string[] = ['@page { margin: 0 } html, body { margin: 0 !important } img, svg { max-width: 100% }'];
  const fam = look.font === 'literata' ? 'Literata, serif' : look.font === 'serif' ? 'serif' : look.font === 'sans' ? '"Noto Sans", sans-serif' : '';
  if (fam) css.push(`body, body * { font-family: ${fam} !important } body pre, body code, body kbd, body samp, body tt, body pre * { font-family: monospace !important }`);
  css.push('body pre { white-space: pre-wrap !important }');
  if (look.line) css.push(`body, body * { line-height: ${look.line} !important }`);
  css.push(look.justify ? 'p { text-align: justify }' : 'p { text-align: left }');
  const t = THEMES[look.theme];
  if (look.theme !== 'light') css.push(`body, body * { color: ${t.fg} !important; background-color: transparent !important; border-color: ${t.fg} } body a, body a * { color: ${t.link} !important }`);
  else css.push(`body a, body a * { color: ${t.link} }`);
  if (kind === 'mobi') css.push('pagebreak { display: block; page-break-after: always }');
  return css.join('\n');
}
/** The fonts MuPDF asks for by name while it lays a book out: Literata and Noto Sans (TTF: MuPDF's FreeType reads no
 *  WOFF) from the bytes given; for a script none of the built-in fonts covers (MuPDF's own: Latin, Greek, Cyrillic, and
 *  Chinese, Japanese and Korean in Droid Sans Fallback) it records the script — that text is left out of the pages, and
 *  the tab says so. */
export interface FontFiles { literata?: Uint8Array[]; noto?: Uint8Array[] }
const BUILT_IN = /^(latin|greek|cyrillic|common|inherited|tc|sc|jp|kr|han|hani|hiragana|katakana|hangul|bopomofo|undefined)$/i;
export function fontHook(m: Mu, files: FontFiles, missing: Set<string>) {
  const made = new Map<string, any>();
  const font = (key: string, family: string, bytes?: Uint8Array) => {
    if (!bytes) return null;
    let f = made.get(key);
    if (!f) { f = new m.Font(family, bytes); made.set(key, f); }
    return f;
  };
  return (name: string, script: string, bold: boolean | number, italic: boolean | number) => {
    const b = !!bold, i = !!italic;
    if (/^literata$/i.test(name)) { const L = files.literata || []; const k = b ? (i ? 3 : 2) : i ? 1 : 0; return font(`L${k}`, 'Literata', L[k] || L[0]); }
    if (/^noto ?sans$/i.test(name)) { const N = files.noto || []; const k = b ? 1 : i ? 2 : 0; return font(`N${k}`, 'Noto Sans', N[k] || N[0]); }
    if ((!name || name === 'undefined') && script && !BUILT_IN.test(script)) missing.add(script);
    return null;
  };
}
export const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

// --------------------------------------------------------------------------------------------- the book
export interface Entry { title: string; depth: number; page: number }
export interface BookInfo { kind: Kind; title: string; author: string; language: string; pages: number; contents: Entry[]; fixed: boolean }

/** `f(x)`, then x's MuPDF memory freed at once (a page, its text): a search through a long book loads every page, and
 *  waiting for the garbage collector's finalizers let MuPDF's heap grow by hundreds of megabytes. */
export function use<T, R>(x: T, f: (x: T) => R): R {
  try { return f(x); } finally { (x as any)?.destroy?.(); }
}
/** Open the bytes of `openFile` with MuPDF. */
export function openDoc(m: Mu, o: Opened): Doc {
  return m.Document.openDocument(o.bytes, MAGIC[o.kind]);
}
/** Lay a reflowable book out on pages of w × h CSS px with the look (comics keep their pages). */
export function layOut(doc: Doc, kind: Kind, look: Look, w: number, h: number) {
  if (isFixed(kind)) return;
  doc.style(look.publisher, readerCSS(kind, look));
  doc.layout(Math.max(120, w), Math.max(160, h), look.size);
}
export interface Meta { title: string; author: string; language: string }
/** The title, author and language MuPDF reads from the book. Read right after opening, before the book is styled and laid
 *  out: MuPDF keeps a FictionBook's title with the parsed document, and styling it again parses it anew without it (the
 *  tab showed "tale" for "The Shore Tale" — found in the browser's worker). */
export function metaOf(doc: Doc): Meta {
  const meta = (k: string) => { try { return (doc.getMetaData(k) || '').trim(); } catch { return ''; } };
  return { title: meta('info:Title'), author: meta('info:Author'), language: meta('info:Language') };
}
export function info(doc: Doc, o: Opened, name: string, meta: Meta): BookInfo {
  return {
    kind: o.kind,
    title: meta.title || o.title || name.replace(/\.[^.]+$/, ''),
    author: meta.author || o.author || '',
    language: meta.language,
    pages: doc.countPages(),
    contents: contents(doc),
    fixed: isFixed(o.kind),
  };
}
/** The contents (the book's own: EPUB's nav or NCX, FictionBook's sections; MuPDF's from the headings of MOBI, text and
 *  web pages), flattened, each entry with the page it is on now (-1: nowhere). */
export function contents(doc: Doc): Entry[] {
  const out: Entry[] = [];
  let ol: any[] | null = null;
  try { ol = doc.loadOutline(); } catch { ol = null; }
  const walk = (items: any[] | undefined, depth: number) => {
    for (const it of items || []) {
      let page = typeof it.page === 'number' ? it.page : -1;
      if (page < 0 && it.uri) { try { page = doc.resolveLink(it.uri); } catch { page = -1; } }
      const title = (it.title || '').replace(/\s+/g, ' ').trim();
      if (title) out.push({ title, depth, page });
      if (out.length < 5000) walk(it.down, depth + 1);
    }
  };
  walk(ol || [], 0);
  return out;
}
/** The entry the page belongs to: the last one that starts on it or before. */
export function chapterAt(list: Entry[], page: number): Entry | undefined {
  let best: Entry | undefined;
  for (const e of list) if (e.page >= 0 && e.page <= page && (!best || e.page >= best.page)) best = e;
  return best;
}

/** A page drawn at `scale` (device pixels per CSS px) on the theme's colour: RGBA, alpha 255 everywhere. */
export function drawPage(m: Mu, doc: Doc, i: number, scale: number, bg: string): { w: number; h: number; rgba: Uint8ClampedArray } {
  const page = doc.loadPage(i), b = page.getBounds();
  const w = Math.max(1, Math.round((b[2] - b[0]) * scale)), h = Math.max(1, Math.round((b[3] - b[1]) * scale));
  const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, w, h], true);
  pix.clear(255);
  const dev = new m.DrawDevice(m.Matrix.identity, pix), path = new m.Path();
  path.rect(0, 0, w, h);
  dev.fillPath(path, false, m.Matrix.identity, m.ColorSpace.DeviceRGB, rgb(bg), 1);
  page.run(dev, [scale, 0, 0, scale, -b[0] * scale, -b[1] * scale]);
  dev.close();
  const rgba = new Uint8ClampedArray(pix.getPixels());   // a copy: the pixmap's pixels are a view into MuPDF's memory
  dev.destroy?.(); pix.destroy?.(); page.destroy?.();
  return { w, h, rgba };
}
/** A page's size in CSS px (a comic's page: the picture's). */
export function pageSize(doc: Doc, i: number): [number, number] {
  return use(doc.loadPage(i), (p) => { const b = p.getBounds(); return [b[2] - b[0], b[3] - b[1]]; });
}

/** A page's text, line by line. */
export function pageText(doc: Doc, i: number): string {
  return use(doc.loadPage(i), (p) => use(p.toStructuredText('preserve-whitespace'), (st) => st.asText()));
}
/** Text as the place finder compares it: soft hyphens out, white space single. */
export const flat = (s: string) => s.replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();

/** What marks the top of a page: its first words (about 48 characters, whole words). '' for a page without text. */
export function anchorOf(doc: Doc, i: number): string {
  const t = flat(pageText(doc, i));
  if (!t) return '';
  const cut = t.slice(0, 64), sp = cut.lastIndexOf(' ');
  return (t.length > 64 && sp > 24 ? cut.slice(0, sp) : cut).trim();
}
/** The page of the new layout on which the text of an anchor stands, looked for from `guess` outwards (the same share of
 *  the book); a phrase cut by the new page's end counts for the page it begins on. `guess` itself when it is found
 *  nowhere near. */
export function findAnchor(doc: Doc, anchor: string, guess: number): number {
  const n = doc.countPages();
  guess = Math.max(0, Math.min(n - 1, guess));
  if (!anchor) return guess;
  const cache = new Map<number, string>();
  const text = (k: number) => { let t = cache.get(k); if (t === undefined) { t = k >= 0 && k < n ? flat(pageText(doc, k)) : ''; cache.set(k, t); } return t; };
  const reach = Math.max(12, Math.ceil(n * 0.06));
  for (let d = 0; d <= reach; d++) {
    for (const k of d ? [guess - d, guess + d] : [guess]) {
      if (k < 0 || k >= n) continue;
      const own = text(k), at = (own + ' ' + text(k + 1).slice(0, anchor.length + 8)).indexOf(anchor);
      if (at >= 0 && at <= own.length) return k;
    }
  }
  return guess;
}

export interface Hit { page: number; quads: number[][]; before: string; match: string; after: string }
/** Every place a text is found on a page (case and accents ignored, as MuPDF searches), with the words around it. */
export function searchPage(doc: Doc, i: number, query: string): Hit[] {
  let found: number[][][] = [], json = '';
  use(doc.loadPage(i), (page) => {
    try { found = page.search(query, 'ignore-case,ignore-diacritics'); } catch { found = []; }
    if (found.length) json = use(page.toStructuredText('preserve-whitespace'), (s) => s.asJSON());
  });
  if (!found.length) return [];
  const st = JSON.parse(json);
  const lines: { bbox: { x: number; y: number; w: number; h: number }; text: string }[] = [];
  for (const b of st.blocks || []) for (const l of b.lines || []) lines.push(l);
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = fold(flat(query));
  return found.slice(0, 200).map((quads) => {
    const q0 = quads[0], cx = (q0[0] + q0[2] + q0[4] + q0[6]) / 4, cy = (q0[1] + q0[3] + q0[5] + q0[7]) / 4;
    const li = lines.findIndex((l) => cx >= l.bbox.x - 1 && cx <= l.bbox.x + l.bbox.w + 1 && cy >= l.bbox.y - 1 && cy <= l.bbox.y + l.bbox.h + 1);
    const prev = li > 0 ? lines[li - 1].text : '', cur = li >= 0 ? lines[li].text : '', next = li >= 0 && li + 1 < lines.length ? lines[li + 1].text : '';
    const all = flat(`${prev} ${cur} ${next}`), f = fold(all);
    // the hit inside the line: the occurrence nearest the hit's place along the line
    let at = -1, best = Infinity;
    const off = flat(prev).length + (prev ? 1 : 0), rel = li >= 0 && lines[li].bbox.w > 0 ? (cx - lines[li].bbox.x) / lines[li].bbox.w : 0;
    for (let k = f.indexOf(q); k >= 0; k = f.indexOf(q, k + 1)) {
      const d = Math.abs(k - (off + rel * flat(cur).length));
      if (d < best) { best = d; at = k; }
    }
    if (at < 0) return { page: i, quads, before: all.slice(0, 120), match: '', after: '' };
    return { page: i, quads, before: all.slice(Math.max(0, at - 60), at).replace(/^\S*\s/, '…'), match: all.slice(at, at + q.length), after: all.slice(at + q.length, at + q.length + 60).replace(/\s\S*$/, '…') };
  });
}

export interface PageLink { rect: [number, number, number, number]; page?: number; uri?: string }
/** The links of a page: to another page of the book, or to the web (http, https, mailto). */
export function linksOf(doc: Doc, i: number): PageLink[] {
  const out: PageLink[] = [];
  use(doc.loadPage(i), (p) => {
    for (const l of p.getLinks()) {
      const r = l.getBounds() as [number, number, number, number], uri = l.getURI() || '';
      if (l.isExternal()) { if (/^(https?:|mailto:)/i.test(uri)) out.push({ rect: r, uri }); }
      else {
        let page = -1;
        try { page = doc.resolveLink(l); } catch { page = -1; }
        if (page >= 0) out.push({ rect: r, page });
      }
      l.destroy?.();
    }
  });
  return out;
}

/** The text between two points of a page (a selection) and the boxes to mark it. */
export function selectText(doc: Doc, i: number, a: [number, number], b: [number, number]): { text: string; quads: number[][] } {
  return use(doc.loadPage(i), (p) => use(p.toStructuredText('preserve-whitespace'), (st) => ({ text: st.copy(a, b), quads: st.highlight(a, b, 2000) })));
}
/** The word under a point (a long press), as the two ends to select it; null where no word is (a margin, a picture,
 *  the space between two words). A word: the letters, digits and joining marks (’ ' - ‐) around the point on its line. */
export function wordAt(doc: Doc, i: number, at: [number, number]): { a: [number, number]; b: [number, number] } | null {
  const lines: { c: string; q: number[] }[][] = [];
  let cur: { c: string; q: number[] }[] = [];
  use(doc.loadPage(i), (p) => use(p.toStructuredText('preserve-whitespace'), (st) => st.walk({ beginLine() { cur = []; lines.push(cur); }, onChar(c: string, _o: any, _f: any, _s: number, q: number[]) { cur.push({ c, q }); } })));
  const box = (q: number[]) => [Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])];
  const isWord = (c: string) => /[\p{L}\p{N}\p{M}'’\-‐]/u.test(c);
  for (const line of lines) {
    for (let k = 0; k < line.length; k++) {
      const [x0, y0, x1, y1] = box(line[k].q);
      if (at[0] < x0 - 0.5 || at[0] > x1 + 0.5 || at[1] < y0 - 0.5 || at[1] > y1 + 0.5) continue;
      if (!isWord(line[k].c)) return null;
      let a = k, b = k;
      while (a > 0 && isWord(line[a - 1].c)) a--;
      while (b + 1 < line.length && isWord(line[b + 1].c)) b++;
      while (b > a && /['’\-‐]/.test(line[b].c)) b--;   // a quotation mark or dash after the word is not part of it
      while (a < b && /['’\-‐]/.test(line[a].c)) a++;
      const A = box(line[a].q), B = box(line[b].q), y = (A[1] + A[3]) / 2;
      return { a: [A[0] + 0.2, y], b: [B[2] - 0.2, y] };
    }
  }
  return null;
}
