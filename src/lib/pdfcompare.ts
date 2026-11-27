// PDF Compare (potentials #15): two versions of a document, their differences found word by word and shown on their pages.
// Each page's characters — MuPDF's text, or the OCR's words on a scanned page — become tokens (words and signs, with the
// boxes they stand in); the two documents' tokens are compared by textkit-tokens.wasm (wasm/textkit/src/tokens.rs: the
// `similar` crate's patience algorithm, our clean-up, the sliding of added or removed runs, the moves); this file turns its
// answer into changes with their words and their places on both documents' pages, and writes them into the PDFs as
// comments. No DOM: the unit suite runs it in Node.
import type { PageText } from './redact';
import { headerKeys, type Line } from './pdf2epub';
import type { TokenDiff } from '../wasm/texttokens';

export interface Tok {
  /** as printed — a word broken over two lines joined, without its hyphen */
  text: string;
  page: number;
  /** one quad a line it stands on (ul, ur, ll, lr as x, y), in the page's coordinates as shown: points from its top left */
  quads: number[][];
  /** the line of each quad (page × 100000 + the page's line) */
  lines: number[];
  /** a space or a line break stands before it */
  space: boolean;
  /** on a running head or a page number */
  head: boolean;
  /** a word broken over two lines: the length of its first part (where the hyphen stood) */
  hyph?: number;
  /** read by the OCR (a scanned page) */
  ocr?: boolean;
}
export interface Opts { ignoreCase: boolean; ignorePunct: boolean; heads: boolean }
export type Kind = 'changed' | 'added' | 'removed' | 'moved';
/** a mark on a page: a word's box (rects: one a line), or where words were added or taken out on the other side (caret) */
export interface Mark { page: number; rects: Array<[number, number, number, number]>; quads: number[][]; caret?: boolean }
export interface Change {
  kind: Kind;
  /** the tokens of the original (a) and of the changed version (b), as ranges of the compared lists; an empty range stands
   *  where the words would be */
  a: [number, number]; b: [number, number];
  was: string; now: string;
  /** a move: the same words (else at least 80 % of them, in order) */
  exact?: boolean;
  /** the page each side shows it on (1-based) */
  pageA: number; pageB: number;
  marksA: Mark[]; marksB: Mark[];
  /** a few words around it, in the changed version (the original's for a removal) */
  before: string; after: string;
}
export interface Result {
  changes: Change[]; same: number; removed: number; added: number; approx: boolean; tokensA: Tok[]; tokensB: Tok[]; words: { added: number; removed: number };
  /** the engine's changes as it gave them, in order on both sides (for `counterpart`) */
  raw: Array<[number, number, number, number]>;
}

const WORD = /[\p{L}\p{N}\p{M}]/u;
const isWordTok = (t: string) => WORD.test(t);
const APOS = /['’ʼ‘]/, HYPH = /[-‐‑]/;

/** The tokens of a page's characters, line by line: words (letters, digits and their marks; an apostrophe or a hyphen
 *  between two letters and a full stop or a comma between two digits belong to the word: "Buyer’s", "e-mail", "1,25,000")
 *  and every other sign on its own. A word broken over two lines with a hyphen (a soft hyphen, or a hyphen at the line's
 *  end before a small letter) is one word. Lines on a running head or page number are marked (`isHead`). */
export function tokensOf(pt: PageText, page: number, isHead: (line: number) => boolean = () => false, ocr = false): Tok[] {
  type Raw = { s: number; e: number; space: boolean; line: number; word: boolean };
  const lines = new Map<number, Raw[]>(), order: number[] = [];
  let cur: Raw | null = null, space = true;
  const close = () => {
    if (!cur) return;
    let l = lines.get(cur.line);
    if (!l) { l = []; lines.set(cur.line, l); order.push(cur.line); cur.space = true; }   // a line's first token: after a break
    l.push(cur); cur = null;
  };
  const t = pt.text, n = t.length;
  for (let i = 0; i < n; i++) {
    const c = t[i], q = pt.quads[i], ln = pt.line[i];
    if (!q || /\s/.test(c)) { close(); space = true; continue; }
    if (c === '­') { close(); continue; }              // a soft hyphen: no character of its own
    const w = WORD.test(c);
    if (cur && cur.line === ln && cur.e === i) {
      if (w && cur.word) { cur.e = i + 1; continue; }
      // an apostrophe or a hyphen between letters, a full stop or a comma between digits: inside the word
      if (cur.word && i + 1 < n && pt.line[i + 1] === ln && pt.quads[i + 1]) {
        const p = t[i - 1], nx = t[i + 1];
        if ((/\p{L}/u.test(p) && /\p{L}/u.test(nx) && (APOS.test(c) || HYPH.test(c))) || (/\p{N}/u.test(p) && /\p{N}/u.test(nx) && /[.,]/.test(c))) { cur.e = i + 1; continue; }
      }
    }
    close();
    cur = { s: i, e: i + 1, space, line: ln, word: w };
    space = false;
    if (!w) close();
  }
  close();
  const quad = (s: number, e: number) => { const a = pt.quads[s]!, b = pt.quads[e - 1]!; return [a[0], a[1], b[2], b[3], a[4], a[5], b[6], b[7]]; };
  const lid = (l: number) => page * 100000 + l;
  const out: Tok[] = [];
  for (let k = 0; k < order.length; k++) {
    const toks = lines.get(order[k])!;
    const head = isHead(order[k]);
    for (const r of toks) out.push({ text: t.slice(r.s, r.e), page, quads: [quad(r.s, r.e)], lines: [lid(r.line)], space: r.space, head, ...(ocr ? { ocr: true } : {}) });
    // a word broken over two lines: "agree-" at the end of this line (or a soft hyphen after it), "ment" first on the next
    const next = k + 1 < order.length ? lines.get(order[k + 1])! : null;
    if (!next?.length) continue;
    const last = toks[toks.length - 1], prev = toks.length > 1 ? toks[toks.length - 2] : null, first = next[0];
    const ft = t.slice(first.s, first.e);
    if (!first.word || !/^\p{Ll}/u.test(ft)) continue;
    let word: Raw | null = null;
    if (prev && prev.word && !last.word && HYPH.test(t.slice(last.s, last.e)) && prev.e === last.s && /\p{L}$/u.test(t.slice(prev.s, prev.e))) word = prev;
    else if (last.word && t[last.e] === '­' && /\p{L}$/u.test(t.slice(last.s, last.e))) word = last;
    if (!word) continue;
    const drop = word === prev ? 2 : 1, wt = t.slice(word.s, word.e), w = out[out.length - drop];
    out.length -= drop;
    out.push({ ...w, text: wt + ft, quads: [quad(word.s, word.e), quad(first.s, first.e)], lines: [lid(word.line), lid(first.line)], hyph: wt.length });
    next.shift();
  }
  return out;
}

/** The OCR's words as page text: each word's characters share its box evenly (in the picture read), every corner taken to
 *  the page by `map` (the picture read may stand turned: its point → the page's, points from the top left). */
export function ocrText(r: { words: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>; lines?: Array<{ w0: number; w1: number }> }, map: (x: number, y: number) => [number, number]): PageText {
  let text = ''; const quads: Array<number[] | null> = []; const line: number[] = [];
  const lines = r.lines?.length ? r.lines : [{ w0: 0, w1: r.words.length }];
  lines.forEach((l, li) => {
    if (text) { text += '\n'; quads.push(null); line.push(-1); }
    for (let w = l.w0; w < l.w1; w++) {
      const wd = r.words[w]; if (!wd || !wd.text.trim()) continue;
      if (w > l.w0) { text += ' '; quads.push(null); line.push(li); }
      const chars = [...wd.text.trim()], cw = (wd.x1 - wd.x0) / chars.length;
      chars.forEach((ch, i) => {
        const x0 = wd.x0 + i * cw, x1 = x0 + cw;
        const q = [...map(x0, wd.y0), ...map(x1, wd.y0), ...map(x0, wd.y1), ...map(x1, wd.y1)];
        for (let k = 0; k < ch.length; k++) { text += ch[k]; quads.push(q); line.push(li); }
      });
    }
  });
  return { text, quads, line: Int32Array.from(line) };
}

/** The lines of a page, each as the running-head finder takes them: its text, and its top and bottom in the frame of the
 *  page's text (a page shown turned has its running head at a side). `b`: the page's bounds. */
export function pageLines(pt: PageText, b: number[]): { lines: Array<{ id: number; text: string; y0: number; y1: number }>; H: number } {
  const W = b[2] - b[0], H = b[3] - b[1];
  // the direction most characters run in (ul → ur)
  const dir = [0, 0, 0, 0];
  for (const q of pt.quads) if (q) { const dx = q[2] - q[0], dy = q[3] - q[1]; dir[Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3)]++; }
  const d = dir.indexOf(Math.max(...dir));
  const ty = (x: number, y: number) => { x -= b[0]; y -= b[1]; return d === 0 ? y : d === 1 ? W - x : d === 2 ? H - y : x; };
  const by = new Map<number, { id: number; text: string; y0: number; y1: number }>();
  for (let i = 0; i < pt.text.length; i++) {
    const q = pt.quads[i], id = pt.line[i]; if (!q || id < 0) continue;
    const ys = [ty(q[0], q[1]), ty(q[2], q[3]), ty(q[4], q[5]), ty(q[6], q[7])];
    let l = by.get(id); if (!l) by.set(id, (l = { id, text: '', y0: Infinity, y1: -Infinity }));
    l.text += pt.text[i]; l.y0 = Math.min(l.y0, ...ys); l.y1 = Math.max(l.y1, ...ys);
  }
  return { lines: [...by.values()], H: d === 1 || d === 3 ? W : H };
}

/** Which lines of a document are running heads and page numbers (PDF → EPUB's rule: near the top or the bottom and
 *  repeated on 40 % of the pages, or a page number alone), page by page. */
export function headLines(pages: Array<{ lines: Array<{ id: number; text: string; y0: number; y1: number }>; H: number }>): Array<Set<number>> {
  const is = headerKeys(pages as unknown as Array<{ lines: Line[]; H: number }>);
  return pages.map((p) => new Set(p.lines.filter((l) => is(l as unknown as Line, p.H)).map((l) => l.id)));
}

const fold = (s: string) => s.normalize('NFKC').toLowerCase();
/** What a token is compared as: its characters in their compatibility form (ﬁ is fi), typographic quotes and apostrophes
 *  plain; without regard to case when asked. A word broken over two lines keeps its hyphen when the documents write it
 *  with one elsewhere ("well-known") and not without. */
export function keyOf(t: Tok, o: Opts, vocab: Set<string>): string {
  let s = t.text;
  if (t.hyph) { const h = s.slice(0, t.hyph) + '-' + s.slice(t.hyph); if (vocab.has(fold(h)) && !vocab.has(fold(s))) s = h; }
  s = s.normalize('NFKC').replace(/[‘’‚‛′ʼ`]/g, "'").replace(/[“”„‟″]/g, '"');
  return o.ignoreCase ? s.toLowerCase() : s;
}
/** The tokens that are compared: running heads and page numbers left out when asked, signs too when asked. */
export const compared = (toks: Tok[], o: Opts) => toks.filter((t) => !(o.heads && t.head) && !(o.ignorePunct && !isWordTok(t.text)));

/** Text of tokens s … e as it reads (a space where the page had one). */
export function textOf(toks: Tok[], s: number, e: number): string {
  let out = '';
  for (let i = s; i < e; i++) out += (i > s && toks[i].space ? ' ' : '') + toks[i].text;
  return out;
}
const bounds = (q: number[]): [number, number, number, number] => { const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
/** The marks of tokens s … e: one quad a line a page (the words of a line in one, with the spaces between). */
export function marksOf(toks: Tok[], s: number, e: number): Mark[] {
  const out: Mark[] = [];
  let m: Mark | null = null, line = -1;
  for (let i = s; i < e; i++) {
    const t = toks[i];
    t.quads.forEach((q, k) => {
      if (m && m.page === t.page && t.lines[k] === line) { const p = m.quads[m.quads.length - 1]; m.quads[m.quads.length - 1] = [p[0], p[1], q[2], q[3], p[4], p[5], q[6], q[7]]; }
      else { if (!m || m.page !== t.page) { m = { page: t.page, rects: [], quads: [] }; out.push(m); } m.quads.push([...q]); }
      line = t.lines[k];
    });
  }
  for (const k of out) k.rects = k.quads.map(bounds);
  return out;
}
/** Where words were added or taken out, on the side that does not have them: a thin mark at the end of the token before
 *  (or the start of the one after). */
export function caretAt(toks: Tok[], at: number): Mark[] {
  const t = at > 0 ? toks[at - 1] : toks[at];
  if (!t) return [];
  const q = at > 0 ? t.quads[t.quads.length - 1] : t.quads[0];
  const [x1, y1, x2, y2] = at > 0 ? [q[2], q[3], q[6], q[7]] : [q[0], q[1], q[4], q[5]];
  const h = Math.hypot(x2 - x1, y2 - y1), nx = (y2 - y1) / (h || 1) * 0.12 * h, ny = -(x2 - x1) / (h || 1) * 0.12 * h;
  const quad = [x1 - nx, y1 - ny, x1 + nx, y1 + ny, x2 - nx, y2 - ny, x2 + nx, y2 + ny];
  return [{ page: t.page, rects: [bounds(quad)], quads: [quad], caret: true }];
}

/** The two documents compared: the engine's changes made into words and marks, in the order the changed version has them
 *  (a removal where its words would stand, a move where it stands now). */
export function compare(A: Tok[], B: Tok[], o: Opts, diff: (a: string[], b: string[]) => TokenDiff): Result {
  const vocab = new Set<string>();
  for (const t of [...A, ...B]) if (!t.hyph) vocab.add(fold(t.text));
  const ta = compared(A, o), tb = compared(B, o);
  const r = diff(ta.map((t) => keyOf(t, o, vocab)), tb.map((t) => keyOf(t, o, vocab)));
  const page = (toks: Tok[], i: number) => (toks[Math.min(i, toks.length - 1)]?.page ?? 0) + 1;
  const ctx = (toks: Tok[], s: number, e: number) => [textOf(toks, Math.max(0, s - 8), s), textOf(toks, e, Math.min(toks.length, e + 8))];
  const moved = new Map<number, [number, boolean]>(), partner = new Set<number>();
  for (const [i, j, ex] of r.moves) { moved.set(i, [j, !!ex]); partner.add(j); }
  const out: Change[] = [];
  r.changes.forEach(([o0, on, n0, nn], k) => {
    if (partner.has(k)) return;
    const mv = moved.get(k);
    if (mv) {
      const [j, exact] = mv, [, , m0, mn] = r.changes[j];
      const [before, after] = ctx(tb, m0, m0 + mn);
      out.push({ kind: 'moved', a: [o0, o0 + on], b: [m0, m0 + mn], was: textOf(ta, o0, o0 + on), now: textOf(tb, m0, m0 + mn), exact, pageA: page(ta, o0), pageB: page(tb, m0), marksA: marksOf(ta, o0, o0 + on), marksB: marksOf(tb, m0, m0 + mn), before, after });
      return;
    }
    const kind: Kind = on && nn ? 'changed' : on ? 'removed' : 'added';
    const [before, after] = kind === 'removed' ? ctx(ta, o0, o0 + on) : ctx(tb, n0, n0 + nn);
    out.push({
      kind, a: [o0, o0 + on], b: [n0, n0 + nn], was: textOf(ta, o0, o0 + on), now: textOf(tb, n0, n0 + nn), pageA: page(ta, o0), pageB: page(tb, n0),
      marksA: on ? marksOf(ta, o0, o0 + on) : caretAt(ta, o0), marksB: nn ? marksOf(tb, n0, n0 + nn) : caretAt(tb, n0), before, after,
    });
  });
  out.sort((x, y) => x.b[0] - y.b[0] || x.a[0] - y.a[0]);
  const words = { added: 0, removed: 0 };
  for (const c of out) if (c.kind !== 'moved') {
    for (let i = c.a[0]; i < c.a[1]; i++) if (isWordTok(ta[i].text)) words.removed++;
    for (let i = c.b[0]; i < c.b[1]; i++) if (isWordTok(tb[i].text)) words.added++;
  }
  return { changes: out, same: r.same, removed: r.removed, added: r.added, approx: r.approx, tokensA: ta, tokensB: tb, words, raw: r.changes };
}

/** Where token i of one document stands in the other (a → b when `ab`, else b → a): an equal token at its partner, a token
 *  inside a change at the start of the change's other side — for scrolling the two together. */
export function counterpart(raw: Array<[number, number, number, number]>, i: number, ab: boolean): number {
  let off = 0;
  for (const [o0, on, n0, nn] of raw) {
    const [s, len, t, tl] = ab ? [o0, on, n0, nn] : [n0, nn, o0, on];
    if (i < s) break;
    if (i < s + len) return t;
    off = t + tl - (s + len);
  }
  return i + off;
}

export const KIND_WORD: Record<Kind, string> = { changed: 'Changed', added: 'Added', removed: 'Removed', moved: 'Moved' };
const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** The words of a change as one line: “thirty (30” → “sixty (60”. */
export function describe(c: Change): string {
  if (c.kind === 'added') return `Added: “${short(c.now)}”`;
  if (c.kind === 'removed') return `Removed: “${short(c.was)}”`;
  if (c.kind === 'moved') return `Moved${c.exact ? '' : ', with small changes'}: “${short(c.now)}” (page ${c.pageA} → page ${c.pageB})`;
  return `Changed: “${short(c.was)}” → “${short(c.now)}”`;
}
/** The list of changes as plain text, for Copy and the .txt. */
export function report(nameA: string, nameB: string, r: Result): string {
  const lines = [`PDF Compare — ${nameA} → ${nameB}`, `${r.changes.length} change${r.changes.length === 1 ? '' : 's'} · ${r.words.added} word${r.words.added === 1 ? '' : 's'} added, ${r.words.removed} removed`, ''];
  r.changes.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.kind === 'moved' ? `page ${c.pageA} → page ${c.pageB}` : `page ${c.pageA} / page ${c.pageB}`} — ${describe(c)}`);
  });
  return lines.join('\r\n') + '\r\n';
}

/** The changes written into one of the PDFs as comments (annotations any reader shows): in the original, what was taken out
 *  or changed struck through in red ("Now: …"), where words were added a caret ("Added: …"), a move's old place in blue; in
 *  the changed version, what was added or changed highlighted in green ("Was: …"), where words were taken out a caret, a
 *  move's new place in blue. */
export function markPdf(doc: any, side: 'a' | 'b', changes: Change[]): number {
  const RED = [0.86, 0.15, 0.15], GREEN = [0.2, 0.72, 0.3], BLUE = [0.2, 0.45, 0.95];
  let n = 0;
  for (const c of changes) {
    const marks = side === 'a' ? c.marksA : c.marksB;
    for (const m of marks) {
      const page = doc.loadPage(m.page);
      let type: string, color: number[], note: string;
      if (m.caret) { type = 'Caret'; color = side === 'a' ? GREEN : RED; note = side === 'a' ? `Added: “${short(c.now, 2000)}”` : `Removed: “${short(c.was, 2000)}”`; }
      else if (c.kind === 'moved') { type = 'Highlight'; color = BLUE; note = side === 'a' ? `Moved to page ${c.pageB}${c.exact ? '' : ` (with small changes: “${short(c.now, 2000)}”)`}` : `Moved from page ${c.pageA}${c.exact ? '' : ` (was: “${short(c.was, 2000)}”)`}`; }
      else if (side === 'a') { type = 'StrikeOut'; color = RED; note = c.kind === 'removed' ? 'Removed' : `Now: “${short(c.now, 2000)}”`; }
      else { type = 'Highlight'; color = GREEN; note = c.kind === 'added' ? 'Added' : `Was: “${short(c.was, 2000)}”`; }
      const a = page.createAnnotation(type);
      if (m.caret) { const [x0, y0, x1, y1] = m.rects[0]; a.setRect([x0 - 2, y0, x1 + 2, y1]); }
      else a.setQuadPoints(m.quads);
      a.setColor(color); a.setContents(note); a.setAuthor('PDF Compare');
      a.update();
      n++;
    }
  }
  return n;
}
