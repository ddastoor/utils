// PDF / EPUB → Audiobook: a book's text as a listener should hear it, in tracks — one per chapter. No DOM: it runs in the
// tab's reading worker (src/workers/bookread.worker.ts) and in the unit suite.
// - EPUB, MOBI, FictionBook, plain text and web pages: MuPDF (the EPUB Reader's engine, src/lib/ebook.ts) lays the book out
//   on pages 100,000 px tall — an EPUB's file is then one page, a MOBI a page with its headings at known heights — and
//   its structured text gives the paragraphs (one block each), their font sizes (headings) and their heights; the book's
//   contents, each entry resolved to a page and a height (resolveLinkDestination: a #id inside a file, as Project
//   Gutenberg's books have them), say where each track begins. Footnote marks are taken out of the XHTML before MuPDF reads
//   it (epub:type="noteref", a raised link, a bracketed [1] link; FictionBook's notes by CSS) — they are never read aloud —,
//   and the notes themselves (<aside epub:type="footnote">) unless they are asked for.
// - PDF: the PDF → EPUB engine (src/lib/pdf2epub.ts — reading order, columns, running heads and page numbers left out,
//   words broken over lines joined, figures, tables and display formulas found and kept as pictures) makes the pages'
//   XHTML, which is read here: its paragraphs and headings, without its pictures, page labels and footnotes; the PDF's
//   bookmarks begin the tracks (a chapter that starts in the middle of a page: its heading on that page).
// - Which level of the contents makes the tracks: the deepest whose tracks are, at the median, 250 words or more (a
//   paper's subsections of a few lines are no tracks); a part's own page ("Part One: The Rock", a few words) goes with the
//   chapter after it. Without contents: the headings of the largest size that comes twice; without them, parts of about
//   2,500 words (17 minutes) ended at paragraph ends.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { openDoc, metaOf, type Opened, type Kind } from './ebook';
import { pdfToEpub, pdfLang, type EpubEngines } from './pdf2epub';
import { countWords, speechText } from './speechtext';

export { countWords, speechText };

export type BlockKind = 'heading' | 'text' | 'break';
/** A paragraph, a heading, or a break between scenes (* * *): its text, the page it is on and its height on the page (in
 *  the PDF path: its place among the page's paragraphs). */
export interface Block { kind: BlockKind; text: string; page: number; y: number }
/** A track: one MP3. `skip`: not ticked at first (contents, an index, a copyright page, a few words). */
export interface Track { title: string; blocks: Block[]; words: number; skip: boolean }
export interface Book {
  kind: Kind | 'pdf'; title: string; author: string; language: string;
  tracks: Track[]; words: number;
  /** what began the tracks: the book's contents, its headings, or its length */
  how: 'contents' | 'headings' | 'length';
  /** footnote marks taken out, and notes left out (or kept, when asked for); running heads left out (a PDF's) */
  refs: number; notes: number; heads?: number;
  cover?: { bytes: Uint8Array; mime: string };
}
export interface ReadOptions { notes?: boolean }
/** An entry of the contents: its title, depth and where it begins (page, height). */
export interface Entry { title: string; depth: number; page: number; y: number }

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Titles that are not read by default (ticked off at first). */
export const SKIP = /^(?:table of )?contents$|^index\b|^copyright\b|^(?:front |back )?cover$|^(?:also by|other books by|books by)\b|^about the (?:author|publisher)\b|^colophon$/i;
/** Front matter whose name is no name for a track it is joined to. */
const GENERIC = /^(?:cover|title(?: page)?|half[- ]?title|frontispiece|copyright(?: page)?|dedication|epigraph|imprint)$/i;

// ---------------------------------------------------------------------------------------------------- footnote marks
const HREF_HASH = String.raw`\bhref\s*=\s*["'][^"']*#[^"']*["']`;
const NOTE_REFS = [
  // EPUB 3's own mark, and ARIA's
  new RegExp(String.raw`<a\b[^>]*\b(?:epub:type|role)\s*=\s*["'][^"']*\b(?:noteref|doc-noteref)\b[^"']*["'][^>]*>[\s\S]*?</a>`, 'gi'),
  // a raised link, and a link around a raised mark
  new RegExp(String.raw`<sup\b[^>]*>\s*<a\b[^>]*${HREF_HASH}[^>]*>[\s\S]*?</a>\s*</sup>`, 'gi'),
  new RegExp(String.raw`<a\b[^>]*${HREF_HASH}[^>]*>\s*<sup\b[^>]*>[\s\S]*?</sup>\s*</a>`, 'gi'),
  // a link that is only a number or a mark, bracketed or not (Project Gutenberg's [1], Calibre's footnote links)
  new RegExp(String.raw`<a\b[^>]*${HREF_HASH}[^>]*>\s*(?:\[\s*)?(?:\d{1,3}|[*†‡§¶]{1,3})(?:\s*\])?\s*</a>`, 'gi'),
];
const NOTE_BODIES = /<aside\b[^>]*\b(?:epub:type|role)\s*=\s*["'][^"']*\b(?:footnote|endnote|rearnote|doc-footnote|doc-endnote)\b[^"']*["'][^>]*>[\s\S]*?<\/aside>/gi;
/** Footnote marks taken out of (X)HTML (never read aloud); the notes too unless `notes`. */
export function stripNotes(html: string, notes = false): { html: string; refs: number; bodies: number } {
  let refs = 0, bodies = 0;
  for (const re of NOTE_REFS) html = html.replace(re, () => { refs++; return ''; });
  if (!notes) html = html.replace(NOTE_BODIES, () => { bodies++; return ''; });
  return { html, refs, bodies };
}

const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|svg|bmp|tiff?|avif)$/i, FONT_EXT = /\.(?:ttf|otf|woff2?|eot)$/i;
const sniff = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0x47 && b[1] === 0x49 ? 'image/gif' : b[0] === 0x52 && b[8] === 0x57 ? 'image/webp' : '';
/** An EPUB's cover picture (its manifest's cover-image, or <meta name="cover">), as bytes. */
export function epubCover(files: Record<string, Uint8Array>): { bytes: Uint8Array; mime: string } | undefined {
  const container = files['META-INF/container.xml'];
  const opfPath = container ? /full-path\s*=\s*["']([^"']+)["']/.exec(strFromU8(container))?.[1] : Object.keys(files).find((n) => n.endsWith('.opf'));
  const opf = opfPath && files[opfPath] ? strFromU8(files[opfPath]) : '';
  if (!opf) return undefined;
  const items = [...opf.matchAll(/<item\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, a: string) => new RegExp(String.raw`\b${a}\s*=\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  let item = items.find((t) => /\bproperties\s*=\s*["'][^"']*\bcover-image\b/i.test(t));
  if (!item) { const id = /<meta\b[^>]*\bname\s*=\s*["']cover["'][^>]*>/i.exec(opf)?.[0]; const ref = id && attr(id, 'content'); if (ref) item = items.find((t) => attr(t, 'id') === ref); }
  const href = item && attr(item, 'href');
  if (!href) return undefined;
  const dir = opfPath!.includes('/') ? opfPath!.slice(0, opfPath!.lastIndexOf('/') + 1) : '';
  let path = dir + decodeURIComponent(href);
  while (/[^/]+\/\.\.\//.test(path)) path = path.replace(/[^/]+\/\.\.\//, '');
  const bytes = files[path];
  const mime = bytes && sniff(bytes);
  return bytes && mime ? { bytes, mime } : undefined;
}

/** Pictures, drawings and media out of a page (MuPDF would put "[image]" where a picture is missing; nothing of them is
 *  read aloud). */
const PICTURES = /<(svg|video|audio|object|math)\b[\s\S]*?<\/\1>|<(?:img|image|embed|source)\b[^>]*>/gi;
/** The language an EPUB's package names (dc:language), and its title and author. */
export function epubMeta(files: Record<string, Uint8Array>): { language: string; title: string; author: string } {
  const container = files['META-INF/container.xml'];
  const opfPath = container ? /full-path\s*=\s*["']([^"']+)["']/.exec(strFromU8(container))?.[1] : Object.keys(files).find((n) => n.endsWith('.opf'));
  const opf = opfPath && files[opfPath] ? strFromU8(files[opfPath]) : '';
  const dc = (tag: string) => (new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i').exec(opf)?.[1] || '').replace(/<[^>]+>/g, '').trim();
  return { language: dc('language'), title: dc('title'), author: dc('creator') };
}

/** The bytes MuPDF should lay out: an EPUB with its footnote marks (and notes) taken out of every page and without its
 *  pictures and fonts (the text does not need them); a web page likewise. */
export function prepare(o: Opened, notes: boolean): { opened: Opened; refs: number; notes: number; language: string; cover?: { bytes: Uint8Array; mime: string } } {
  let refs = 0, bodies = 0;
  const clean = (html: string) => { const r = stripNotes(html, notes); refs += r.refs; bodies += r.bodies; return r.html.replace(PICTURES, ''); };
  if (o.kind === 'epub') {
    const files = unzipSync(o.bytes), out: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
    const cover = epubCover(files), meta = epubMeta(files);
    if (files.mimetype) out.mimetype = [files.mimetype, { level: 0 }];
    for (const [name, data] of Object.entries(files)) {
      if (name === 'mimetype' || IMAGE_EXT.test(name) || FONT_EXT.test(name)) continue;
      out[name] = /\.(?:x?html?)$/i.test(name) && !/^meta-inf\//i.test(name) ? strToU8(clean(strFromU8(data))) : data;
    }
    return { opened: { ...o, bytes: zipSync(out as any, { level: 0 }), title: o.title || meta.title || undefined, author: o.author || meta.author || undefined }, refs, notes: bodies, language: meta.language, cover };
  }
  if (o.kind === 'html') return { opened: { ...o, bytes: strToU8(clean(strFromU8(o.bytes))) }, refs, notes: bodies, language: '' };
  return { opened: o, refs: 0, notes: 0, language: '' };
}

// ---------------------------------------------------------------------------------------------------- reading a layout
/** FictionBook's note marks (MuPDF styles them itself) and raised links out of the layout. */
const READ_CSS = (notes: boolean) => `sup a, a sup, a[type="note"] { display: none; }${notes ? '' : ' body[name="notes"] { display: none; }'}
p, div, li, blockquote, dd, dt, h1, h2, h3, h4, h5, h6 { margin-top: 0.8em; margin-bottom: 0.8em; }`;
// (the margins: paragraphs set without space between them — MOBI's, many EPUBs' — would come out of MuPDF as one block)
const W = 600, TALL = 100000, EM = 12;

interface Raw { text: string; size: number; bold: boolean; page: number; y: number; chars: number }
/** A page's paragraphs: MuPDF's blocks, cut where a paragraph begins inside one (a line indented after a short or a
 *  finished line, or a line of another size after a short one: a heading run into its paragraph); lines joined — after a
 *  hyphen without a space (MuPDF breaks "well-known" there); the size of a paragraph is its lines' median (a drop cap
 *  makes its first line large). */
export function pageParagraphs(doc: any, i: number): Raw[] {
  const page = doc.loadPage(i), st = page.toStructuredText('preserve-whitespace');
  try {
    const j = JSON.parse(st.asJSON()), out: Raw[] = [];
    for (const b of j.blocks || []) {
      if (b.type !== 'text') continue;
      const lines = (b.lines || []).filter((l: any) => String(l.text || '').trim()).map((l: any) => ({
        t: String(l.text).replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim(), x: l.bbox.x, y: l.bbox.y, w: l.bbox.w,
        size: l.font?.size || EM, bold: l.font?.weight === 'bold',
      }));
      if (!lines.length) continue;
      const minX = Math.min(...lines.map((l: any) => l.x)), maxW = Math.max(...lines.map((l: any) => l.w));
      let cur: typeof lines = [];
      const flush = () => {
        if (!cur.length) return;
        let text = '', chars = 0, bold = 0;
        for (const l of cur) {
          const n = l.t.replace(/\s/g, '').length;
          chars += n; if (l.bold) bold += n;
          text = !text ? l.t : /[-‐]$/.test(text) && /^\p{Ll}/u.test(l.t) ? text + l.t : text + ' ' + l.t;
        }
        const sizes = cur.map((l: any) => l.size).sort((a: number, c: number) => a - c);
        out.push({ text, size: sizes[(sizes.length - 1) >> 1], bold: bold > chars / 2, page: i, y: cur[0].y, chars });
        cur = [];
      };
      lines.forEach((l: any, k: number) => {
        const prev = lines[k - 1];
        if (prev) {
          const short = prev.w < 0.75 * maxW, done = /[.!?…:"”’)\]]$/.test(prev.t);
          if (short || (done && l.x > minX + 6) || (short && Math.abs(l.size - prev.size) > 0.25 * Math.max(l.size, prev.size))) flush();
        }
        cur.push(l);
      });
      flush();
    }
    return out;
  } finally { st.destroy?.(); page.destroy?.(); }
}

/** Paragraphs → blocks: headings by their size (1.15 × the book's text and more) or a short bold line; a paragraph
 *  without letters or digits is a break between scenes; a drop cap (one or two capitals alone) is joined to its word. */
export function classify(raw: Raw[]): Block[] {
  const bySize = new Map<number, number>();
  for (const r of raw) { const k = Math.round(r.size * 2) / 2; bySize.set(k, (bySize.get(k) || 0) + r.chars); }
  const body = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || EM;
  const out: Block[] = [];
  for (let k = 0; k < raw.length; k++) {
    const r = raw[k];
    let text = r.text;
    const next = raw[k + 1];
    if (/^\p{Lu}{1,2}$/u.test(text) && next && next.page === r.page && /^\p{Ll}/u.test(next.text)) { raw[k + 1] = { ...next, text: text + next.text }; continue; }
    if (!/[\p{L}\p{N}]/u.test(text)) { if (/[*⁂~#•·◆❦—–_=-]/.test(text) && out.length && out[out.length - 1].kind !== 'break') out.push({ kind: 'break', text: '', page: r.page, y: r.y }); continue; }
    const words = countWords(text);
    const heading = (r.size >= body * 1.15 && words <= 30) || (r.bold && words <= 12 && !/[.,;:]$/.test(text));
    out.push({ kind: heading ? 'heading' : 'text', text, page: r.page, y: r.y });
  }
  return out;
}

/** The book's contents, flattened, each entry with the page it begins on and its height there (NaN → 0). */
export function outlineAt(doc: any): Entry[] {
  const out: Entry[] = [];
  let ol: any[] | null = null;
  try { ol = doc.loadOutline(); } catch { ol = null; }
  const walk = (items: any[] | undefined, depth: number) => {
    for (const it of items || []) {
      const title = String(it.title || '').replace(/\s+/g, ' ').trim();
      let page = -1, y = 0;
      if (it.uri) {
        try { page = doc.resolveLink(it.uri); } catch { page = -1; }
        try { const d = doc.resolveLinkDestination(it.uri); if (Number.isFinite(d.y)) y = d.y; } catch { /* page only */ }
      }
      if (page < 0 && typeof it.page === 'number') page = it.page;
      if (title && page >= 0) out.push({ title, depth, page, y });
      if (out.length < 5000) walk(it.down, depth + 1);
    }
  };
  walk(ol || [], 0);
  return out;
}

/** The first block at or after a place in the book. */
export function indexAt(blocks: Block[], page: number, y: number): number {
  for (let k = 0; k < blocks.length; k++) if (blocks[k].page > page || (blocks[k].page === page && blocks[k].y >= y - 3)) return k;
  return blocks.length;
}

/** A paragraph that goes on over a page break is one (a word broken there with a hyphen is joined: "break-" + "water"). */
export function joinPages(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let ends = -1;   // the page the last paragraph ends on (a joined one ends on a later page than it begins)
  for (const b of blocks) {
    const a = out[out.length - 1];
    if (a && b.page > ends && a.kind === 'text' && b.kind === 'text' && /^\p{Ll}/u.test(b.text)) {
      if (/\p{L}[-‐]$/u.test(a.text)) { a.text = a.text.slice(0, -1) + b.text; ends = b.page; continue; }
      if (!/[.!?…:;"”’)\]]$/.test(a.text)) { a.text += ' ' + b.text; ends = b.page; continue; }
    }
    out.push({ ...b }); ends = b.page;
  }
  return out;
}
/** A contents page is not read: a paragraph that holds three titles of the contents and more (a PDF's contents page comes
 *  as one), or three paragraphs and more in a row that are each a title (an EPUB's), with the heading above them. */
export function dropContents(blocks: Block[], titles: string[]): Block[] {
  const keys = [...new Set(titles.map(norm).filter((k) => k.length >= 3))];
  if (keys.length < 3) return blocks;
  const isTitle = (b: Block) => b.kind !== 'break' && keys.includes(norm(b.text));
  const holds = (b: Block) => { const t = ` ${norm(b.text)} `; return keys.filter((k) => t.includes(` ${k} `)).length >= 3; };
  const drop = new Set<number>();
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === 'text' && holds(blocks[i]) && countWords(blocks[i].text) <= 12 * keys.length) drop.add(i);
    // (a run ends where a title comes again: the chapter's own heading after the list)
    let j = i; const run = new Set<string>(); while (j < blocks.length && isTitle(blocks[j]) && !run.has(norm(blocks[j].text))) run.add(norm(blocks[j++].text));
    if (j - i >= 3) { for (let k = i; k < j; k++) drop.add(k); i = j - 1; }
  }
  for (const i of [...drop]) if (i > 0 && /^(?:table of )?contents$/i.test(blocks[i - 1].text.trim())) drop.add(i - 1);
  return blocks.filter((_, i) => !drop.has(i));
}

// ---------------------------------------------------------------------------------------------------- tracks
interface At { title: string; depth: number; at: number }
const wordsOf = (bs: Block[]) => bs.reduce((s, b) => s + countWords(b.text), 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const joinTitle = (a: string, b: string, book: string) => (GENERIC.test(a) || norm(a) === norm(book) || !a ? b : GENERIC.test(b) || !b ? a : norm(b).startsWith(norm(a)) ? b : `${a} — ${b}`);

/** Tracks from entries (sorted, one per block index): the blocks before the first entry are the book's own track; a track
 *  of fewer than 30 words goes with the one after it (a part's title page), unless it is one that is not read by default;
 *  empty tracks are left out. */
function split(blocks: Block[], entries: At[], book: string): Track[] {
  const tracks: Track[] = [];
  const first = entries.length ? entries[0].at : blocks.length;
  if (first > 0) tracks.push({ title: book, blocks: blocks.slice(0, first), words: 0, skip: false });
  entries.forEach((e, i) => tracks.push({ title: e.title, blocks: blocks.slice(e.at, i + 1 < entries.length ? entries[i + 1].at : blocks.length), words: 0, skip: false }));
  for (const t of tracks) t.words = wordsOf(t.blocks);
  const out: Track[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i], next = tracks[i + 1];
    if (!t.words) continue;
    if (t.words < 30 && next && !SKIP.test(t.title) && !SKIP.test(next.title)) {
      next.blocks = [...t.blocks, ...next.blocks]; next.words += t.words; next.title = joinTitle(t.title, next.title, book);
      continue;
    }
    // (a track that is only its heading: the notes' page once the notes are left out)
    if (t.blocks.some((b) => b.kind === 'text')) out.push(t);
  }
  for (const t of out) t.skip = SKIP.test(t.title) || t.words < 30;
  return out;
}

/** Tracks for a book whose blocks and contents are known (each entry already a block index). */
export function buildTracks(blocks: Block[], contents: Array<{ title: string; depth: number; at: number }>, book: string): { tracks: Track[]; how: Book['how'] } {
  // entries in reading order; several at one place are one (a part and its first chapter on one page: "The Watches —
  // The First Watch")
  const sorted = contents.filter((e) => e.at < blocks.length).map((e, i) => ({ ...e, i })).sort((a, b) => a.at - b.at || a.i - b.i);
  const entries: At[] = [];
  for (const e of sorted) {
    const last = entries[entries.length - 1];
    if (last && last.at === e.at) { last.title = joinTitle(last.title, e.title, book); last.depth = Math.min(last.depth, e.depth); }
    else entries.push({ title: e.title, depth: e.depth, at: e.at });
  }
  if (entries.length >= 2) {
    const depths = [...new Set(entries.map((e) => e.depth))].sort((a, b) => b - a);
    for (const d of depths) {
      const tracks = split(blocks, entries.filter((e) => e.depth <= d), book);
      const read = tracks.filter((t) => !t.skip);
      if (d === depths[depths.length - 1] || (median(read.map((t) => t.words)) >= 250 && tracks.length <= 400)) return { tracks, how: 'contents' };
    }
  }
  // no contents: the headings of the largest size that comes at least twice
  const heads = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.kind === 'heading' && countWords(x.b.text) <= 15);
  if (heads.length >= 2) {
    const tracks = split(blocks, heads.map((x) => ({ title: x.b.text.slice(0, 100), depth: 0, at: x.i })), book);
    if (tracks.filter((t) => !t.skip).length >= 2) return { tracks, how: 'headings' };
  }
  // nothing to go by: parts of about 2,500 words, ended at a paragraph's end
  const total = wordsOf(blocks), n = Math.max(1, Math.round(total / 2500)), target = total / n, starts: At[] = [];
  let acc = 0, next = 1;
  for (let i = 0; i < blocks.length; i++) {
    if (i === 0) starts.push({ title: 'Part 1', depth: 0, at: 0 });
    else if (acc >= target * next && next < n) { next++; starts.push({ title: `Part ${next}`, depth: 0, at: i }); }
    acc += countWords(blocks[i].text);
  }
  if (n === 1) return { tracks: split(blocks, [{ title: book, depth: 0, at: 0 }], book), how: 'length' };
  return { tracks: split(blocks, starts, book), how: 'length' };
}

// ---------------------------------------------------------------------------------------------------- the formats
/** EPUB, MOBI, FictionBook, plain text, a web page (what openFile of src/lib/ebook.ts gives) → its tracks. */
export function readReflowable(m: any, o: Opened, name: string, opt: ReadOptions = {}): Book {
  const prep = prepare(o, !!opt.notes);
  const doc = openDoc(m, prep.opened);
  try {
    const meta = metaOf(doc);
    doc.style(true, READ_CSS(!!opt.notes));
    doc.layout(W, TALL, EM);
    const raw: Raw[] = [];
    for (let i = 0; i < doc.countPages(); i++) raw.push(...pageParagraphs(doc, i));
    const title = meta.title || prep.opened.title || name.replace(/\.[^.]+$/, '');
    const outline = outlineAt(doc);
    const blocks = dropContents(joinPages(classify(raw)), outline.map((e) => e.title));
    const contents = outline.map((e) => ({ title: e.title, depth: e.depth, at: indexAt(blocks, e.page, e.y) }));
    const { tracks, how } = buildTracks(blocks, contents, title);
    return { kind: o.kind, title, author: meta.author || prep.opened.author || '', language: meta.language || prep.language, tracks, words: wordsOf(blocks), how, refs: prep.refs, notes: prep.notes, cover: prep.cover };
  } finally { doc.destroy?.(); }
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
/** One page of the PDF → EPUB engine's XHTML → its blocks: headings and paragraphs, without the page's label, its parts'
 *  markers, pictures (figures, tables, display formulas and their numbers), raised note marks and — unless `notes` — the
 *  footnotes under its rule and the notes in its margin. */
export function pdfPageBlocks(xhtml: string, page: number, notes: boolean): { blocks: Block[]; notes: number } {
  let body = /<section\b[^>]*>([\s\S]*)<\/section>/.exec(xhtml)?.[1] ?? '';
  body = body.replace(/<p class="pgno">[\s\S]*?<\/p>/g, '').replace(/<h4 class="part">[\s\S]*?<\/h4>/g, '').replace(/<p class="eqno">[\s\S]*?<\/p>/g, '');
  // a figure, and a label beside it that the engine left as text ("Metres": a few words without a sentence's end)
  const label = (p: string | undefined) => (p && countWords(p) <= 3 && !/[.!?:]/.test(p) ? '' : p ? `<p>${p}</p>` : '');
  body = body.replace(/(?:<p>([^<]{1,60})<\/p>\s*)?<div class="fig[^"]*">[\s\S]*?<\/div>(?:\s*<p>([^<]{1,60})<\/p>)?/g, (_, a, b) => `${label(a)}\n${label(b)}`);
  let foot = '', dropped = 0;
  const hr = body.indexOf('<hr class="fn"');
  if (hr >= 0) { foot = body.slice(hr); body = body.slice(0, hr); }
  const margins = [...body.matchAll(/<p class="margin">[\s\S]*?<\/p>/g)].map((x) => x[0]);
  body = body.replace(/<p class="margin">[\s\S]*?<\/p>/g, '');
  if (notes) body += foot + margins.join('');
  else dropped = (foot.match(/<p\b/g) || []).length + margins.length;
  const blocks: Block[] = [];
  for (const mm of body.matchAll(/<(h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    // a raised note mark goes, with a space in its place (the engine keeps none beside it: "ledger<sup>1</sup>that")
    const inner = mm[2].replace(/<sup>\s*(?:\d{1,3}|[*†‡§¶]{1,3})(?:\s*,\s*\d{1,3})*\s*<\/sup>/g, ' ').replace(/<img\b[^>]*>/g, ' ').replace(/\s*<br\s*\/?>\s*/g, '\n');
    let text = unescape(inner.replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/ ([.,;:!?)])/g, '$1');
    text = text.split('\n').map((s) => s.trim()).filter(Boolean).map((s, i, a) => (i < a.length - 1 && !/[.,;:!?…—–-]$/.test(s) ? s + ',' : s)).join(' ');
    if (!/[\p{L}\p{N}]/u.test(text)) { if (/[*⁂~#•]/.test(text)) blocks.push({ kind: 'break', text: '', page, y: blocks.length }); continue; }
    blocks.push({ kind: mm[1] === 'p' ? 'text' : 'heading', text, page, y: blocks.length });
  }
  return { blocks, notes: dropped };
}

/** A PDF → its tracks. The PDF → EPUB engine reads the pages (its pictures are not needed: `engines.jpeg` may make none). */
export async function readPdf(doc: any, engines: EpubEngines, opt: ReadOptions & { alive?: () => boolean } = {}, onProgress?: (done: number, of: number, phase: 'read' | 'pages') => void): Promise<Book> {
  const meta = (k: string) => { try { return (doc.getMetaData(k) || '').trim(); } catch { return ''; } };
  const title = meta('info:Title'), author = meta('info:Author'), language = pdfLang(doc);
  const entries = outlineAt(doc);
  const heights = new Map<number, number>();
  const H = (p: number) => { if (!heights.has(p)) { try { const b = doc.loadPage(p).getBounds(); heights.set(p, b[3] - b[1]); } catch { heights.set(p, 792); } } return heights.get(p)!; };
  for (const e of entries) H(e.page);
  const { epub } = await pdfToEpub(doc, { mode: 'reflow', width: 600, grey: true, removeHeaders: true, labels: false, title, author, alive: opt.alive }, onProgress, engines);
  const files = unzipSync(epub);
  const pages = Object.keys(files).filter((n) => /^OEBPS\/p\d+\.xhtml$/.test(n)).sort();
  const blocks: Block[] = [];
  let notes = 0;
  for (const f of pages) {
    const r = pdfPageBlocks(strFromU8(files[f]), +/p(\d+)\.xhtml$/.exec(f)![1] - 1, !!opt.notes);
    blocks.push(...r.blocks); notes += r.notes;
  }
  const book = title || 'Book';
  const heads = dropRunningHeads(blocks, [book, author, ...entries.map((e) => e.title)]);
  const kept = dropContents(joinPages(blocks.filter((b) => !heads.has(b))), entries.map((e) => e.title));
  const contents = entries.map((e) => ({ title: e.title, depth: e.depth, at: pdfIndex(kept, e, H(e.page)) }));
  const { tracks, how } = buildTracks(kept, contents, book);
  return { kind: 'pdf', title: book, author, language, tracks, words: wordsOf(kept), how, refs: 0, notes, heads: heads.size };
}

/** Running heads the PDF → EPUB engine kept (it leaves out a line at a page's edge that repeats on 40 % of the pages — a
 *  book alternates its title and the chapter's, each on fewer): a page's first or last paragraph of a few words that is
 *  the book's title, its author or a chapter's title after that title has been met once (its own heading, the title
 *  page), or that copies a heading on its page, or that stands at the edge of three pages and more. Letters only are
 *  compared ("12 THE BOOK OF TIDES"). */
export function dropRunningHeads(blocks: Block[], titles: string[]): Set<Block> {
  const key = (t: string) => t.normalize('NFKD').toLowerCase().replace(/[^\p{L}]+/gu, '').slice(0, 30);
  const named = new Set(titles.map(key).filter((k) => k.length >= 4));
  const byPage = new Map<number, Block[]>();
  for (const b of blocks) { if (!byPage.has(b.page)) byPage.set(b.page, []); byPage.get(b.page)!.push(b); }
  const edge = new Set<Block>();
  for (const bs of byPage.values()) for (const b of [bs[0], bs[bs.length - 1]]) if (b && b.kind !== 'break' && countWords(b.text) <= 12) edge.add(b);
  const count = new Map<string, number>();
  for (const bs of byPage.values()) for (const k of new Set(bs.filter((b) => edge.has(b)).map((b) => key(b.text)))) if (k) count.set(k, (count.get(k) || 0) + 1);
  const out = new Set<Block>(), seen = new Set<string>();
  for (const b of blocks) {
    const k = key(b.text);
    if (!k) continue;
    const page = byPage.get(b.page)!;
    if (edge.has(b) && page.some((o) => o !== b && o.kind === 'heading' && key(o.text) === k)) { out.add(b); continue; }
    if (named.has(k)) { if (seen.has(k) && edge.has(b)) out.add(b); else seen.add(k); continue; }
    if (edge.has(b) && (count.get(k) || 0) >= 3) out.add(b);
  }
  return out;
}

/** Where a bookmark of a PDF begins among the blocks: the first block of its page — or, for a place well down the page,
 *  the heading (else the paragraph) on that page that begins with the bookmark's words. */
export function pdfIndex(blocks: Block[], e: Entry, H: number): number {
  let first = blocks.findIndex((b) => b.page >= e.page);
  if (first < 0) return blocks.length;
  if (blocks[first].page !== e.page || e.y < 0.15 * H) return first;
  const want = norm(e.title).split(' ').slice(0, 6).join(' ');
  const onPage: number[] = [];
  for (let k = first; k < blocks.length && blocks[k].page === e.page; k++) onPage.push(k);
  const hit = onPage.find((k) => blocks[k].kind === 'heading' && norm(blocks[k].text).startsWith(want)) ?? onPage.find((k) => norm(blocks[k].text).startsWith(want));
  return hit ?? first;
}
