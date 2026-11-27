// Safe ID Copy (potentials #93): an ID copy made safe to send — the first 8 digits of an Aadhaar number hidden (the last 4
// shown, as UIDAI's own masked Aadhaar shows them), the first 12 of a VID, a QR code that holds the full number covered,
// "For <purpose> only · <date>" stamped across it, and the result flattened into pictures (a PDF of pictures, or one
// picture) so the stamp cannot be lifted off. No DOM: the unit suite runs every rule here in Node; the tab draws.
import type { OcrResult } from './ocr';
import { rectsOf, type PageText, type Rect } from './redact';

export type { Rect } from './redact';
/** A match of the Number Detective's scan (`ids:scan`) or of `idShapes`: UTF-16 offsets into a page's text */
export interface Hit { s: number; e: number; kind: string; value: string }
/** Something covered on a picture: digits of a number, a QR code, a box drawn by hand. `rect` in the picture's pixels. */
export interface Cover { id: string; rect: Rect; kind: 'aadhaar' | 'vid' | 'qr' | 'box'; label: string; on: boolean; text?: string }

/** How many digits are hidden: an Aadhaar number's first 8 of 12, a VID's first 12 of 16 (the last 4 stay, as on UIDAI's
 *  masked Aadhaar) */
export const HIDE: Record<'aadhaar' | 'vid', { of: number; hide: number }> = { aadhaar: { of: 12, hide: 8 }, vid: { of: 16, hide: 12 } };

/** An OCR reading as a page's text with a box for every character — a word's box divided evenly among its characters
 *  (digits are of one width in nearly every typeface) — so the first 8 digits of a number can be covered and the last
 *  4 left. Lines apart by a line break, words by a space (null boxes). */
export function ocrPageText(r: Pick<OcrResult, 'words' | 'lines'>): PageText {
  let text = ''; const quads: Array<number[] | null> = []; const line: number[] = [];
  const lines = r.lines?.length ? r.lines : [{ w0: 0, w1: r.words.length, para: 0, block: 0 }];
  lines.forEach((l, li) => {
    if (text) { text += '\n'; quads.push(null); line.push(-1); }
    for (let w = l.w0; w < l.w1; w++) {
      const wd = r.words[w]; if (!wd || !wd.text) continue;
      if (w > l.w0) { text += ' '; quads.push(null); line.push(li); }
      const n = wd.text.length, cw = (wd.x1 - wd.x0) / n;
      for (let i = 0; i < n; i++) {
        const x0 = wd.x0 + i * cw, x1 = x0 + cw;
        text += wd.text[i]; quads.push([x0, wd.y0, x1, wd.y0, x0, wd.y1, x1, wd.y1]); line.push(li);
      }
    }
  });
  return { text, quads, line: Int32Array.from(line) };
}

/** Numbers in an Aadhaar's shape whose check digit does not pass — a digit misread by the OCR, or a number printed wrong:
 *  as private as the right one, so they are hidden too ("4 4 4" digits apart by spaces: an Aadhaar number; "4 4 4 4": a
 *  VID). The Number Detective's scan finds the ones that pass, written any way. */
export function idShapes(text: string): Hit[] {
  const out: Hit[] = [];
  const re = /(?<![\d])(\d{4})[ \u00a0](\d{4})[ \u00a0](\d{4})(?:[ \u00a0](\d{4}))?(?![\d])/g;
  for (let m: RegExpExecArray | null; (m = re.exec(text));) {
    // four groups are a VID only after its label — a card number has the same shape (a VID that passes its check is the
    // scan's anyway)
    if (m[4] && !/\bVID\b[\s:.\-–]*$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    out.push({ s: m.index, e: m.index + m[0].length, kind: m[4] ? 'vid' : 'aadhaar', value: m[0].replace(/\D/g, '') });
  }
  return out;
}

/** The scan's hits and the shapes put together: one hit per place (an overlap keeps the scan's — it read the kind). */
export function mergeHits(scan: Hit[], shapes: Hit[]): Hit[] {
  const out = scan.filter((h) => h.kind === 'aadhaar' || h.kind === 'vid');
  for (const s of shapes) if (!out.some((h) => h.s < s.e && s.s < h.e)) out.push(s);
  return out.sort((a, b) => a.s - b.s);
}

let nid = 0;
/** The covers over a page's numbers: for each hit, the boxes of the digits to hide (one a line), padded a little — a
 *  fraction of a digit's width to the left and up and down, less to the right (the next digit may follow without a space). */
export function digitCovers(pt: PageText, hits: Hit[], o: { aadhaar: boolean; vid: boolean } = { aadhaar: true, vid: true }): Cover[] {
  const out: Cover[] = [];
  for (const h of hits) {
    if (h.kind !== 'aadhaar' && h.kind !== 'vid') continue;
    const rule = HIDE[h.kind];
    const digits: number[] = [];
    for (let i = h.s; i < h.e; i++) if (/\d/.test(pt.text[i])) digits.push(i);
    if (digits.length < rule.of) continue;
    const s = digits[0], e = digits[rule.hide - 1] + 1;
    const last4 = digits.slice(rule.hide).map((i) => pt.text[i]).join('');
    for (const r of rectsOf(pt, s, e)) {
      const ht = r[3] - r[1], cw = (r[2] - r[0]) / Math.max(1, rule.hide + (e - s - rule.hide) * 0.5);
      out.push({
        id: `c${++nid}`, kind: h.kind, on: h.kind === 'aadhaar' ? o.aadhaar : o.vid, text: last4,
        label: h.kind === 'aadhaar' ? `Aadhaar number ending ${last4}: its first 8 digits` : `VID ending ${last4}: its first 12 digits`,
        rect: [r[0] - 0.25 * cw, r[1] - 0.18 * ht, r[2] + 0.08 * cw, r[3] + 0.18 * ht],
      });
    }
  }
  return out;
}

/** Does a QR code give the full Aadhaar number away? The QR of older printed cards and letters is XML with the number in
 *  its `uid` (`<PrintLetterBarcodeData uid="…"`), some hold the bare number; UIDAI's Secure QR (since 2019: one long
 *  decimal number, signed) carries only the last 4 digits (its reference ID) — it is kept unless every QR code is to be
 *  covered. Returns the number, or null. */
export function qrNumber(text: string): string | null {
  const m = /\buid\s*=\s*["']?\s*(\d{4}\s?\d{4}\s?\d{4})(?!\d)/i.exec(text) || /<uid>\s*(\d{4}\s?\d{4}\s?\d{4})\s*<\/uid>/i.exec(text)
    || /^\s*(\d{4}[ -]?\d{4}[ -]?\d{4})\s*$/.exec(text);
  return m ? m[1].replace(/\D/g, '') : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-27" → "27 Nov 2026" (the date box's value; anything else is shown as typed) */
export function fmtDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : iso.trim();
}
/** The stamp: "For <purpose> only · <date>" — a purpose typed with its own "for" or "only" keeps one of each; none: KYC. */
export function stampText(purpose: string, iso: string): string {
  const p = purpose.replace(/\s+/g, ' ').trim().replace(/^for\s+/i, '').replace(/\s+only\.?$/i, '').trim() || 'KYC';
  const d = fmtDay(iso);
  return d ? `For ${p} only · ${d}` : `For ${p} only`;
}

/** Pictures on A4 pages for the PDF, as a photocopier puts them: each as wide as the page's text area (no wider than its own
 *  pixels at 150 dpi), down the page while they fit — a card's two sides on one page — or alone on a page, made smaller
 *  to fit its height. Sizes in pixels, places in points from the page's top left. */
export interface Placed { i: number; x: number; y: number; w: number; h: number }
export function packPages(sizes: Array<{ w: number; h: number }>, page: [number, number] = [595.28, 841.89], margin = 42, gap = 24): Placed[][] {
  const [PW, PH] = page, aw = PW - 2 * margin, ah = PH - 2 * margin;
  const pages: Placed[][] = []; let cur: Placed[] = [], y = 0;
  sizes.forEach((sz, i) => {
    let w = Math.min(aw, (sz.w * 72) / 150), h = (w * sz.h) / sz.w;
    if (h > ah) { h = ah; w = (h * sz.w) / sz.h; }
    if (cur.length && y + gap + h > ah) { pages.push(cur); cur = []; y = 0; }
    const top = cur.length ? y + gap : 0;
    cur.push({ i, x: margin + (aw - w) / 2, y: margin + top, w, h });
    y = top + h;
  });
  if (cur.length) pages.push(cur);
  return pages;
}

/** A card or page the finder found (corners as fractions of the photo: top left, top right, bottom right, bottom left),
 *  pushed out from its middle by `f` of its size: a card found a little short — a dark band along its edge taken for the
 *  desk (measured on the specimen card: 4 – 6 % of its height) — comes out whole, with a thin border of what lies round it. */
export const MARGIN = 0.14;
export function expandQuad(q: number[], f = MARGIN): number[] {
  const cx = (q[0] + q[2] + q[4] + q[6]) / 4, cy = (q[1] + q[3] + q[5] + q[7]) / 4;
  return q.map((v, i) => { const c = i % 2 ? cy : cx; return Math.min(1, Math.max(0, c + (v - c) * (1 + f))); });
}
/** The straightened picture's size for a quad on a W × H photo: its longer opposite edges, the long side at most `cap`. */
export function quadSize(q: number[], W: number, H: number, cap = 2400): [number, number] {
  const d = (a: number, b: number) => Math.hypot((q[a * 2] - q[b * 2]) * W, (q[a * 2 + 1] - q[b * 2 + 1]) * H);
  let w = Math.max(d(0, 1), d(3, 2)), hh = Math.max(d(0, 3), d(1, 2));
  const s = Math.min(1, cap / Math.max(w, hh));
  return [Math.max(16, Math.round(w * s)), Math.max(16, Math.round(hh * s))];
}

/** A file name: "<first file>-safe-copy" */
export const copyName = (first: string) => `${(first.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'id')}-safe-copy`;
