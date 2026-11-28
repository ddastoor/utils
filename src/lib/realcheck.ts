// "Is This Screenshot Real?" without the page (src/tools/realcheck.ts shows it; tests/unit/realcheck.test.mjs runs it in Node with
// the same engines): a JPEG's own facts (its tables, quality, sampling — jpegcoef.wasm, libjpeg-turbo's reader), the ghosts read
// (an earlier save, and the areas not saved like the rest — jpegcoef's jc_analyse; a lossless picture's by imgproc's pixel
// ghost), copied areas in a photo (imgproc's p_copy_move), the file's embedded preview against the picture, the text's dates,
// times, references and amounts (read by the OCR), the metadata's software, history and dates (ExifTool) — and what they add
// up to, in plain words. Signs, never a proof: a picture can be made with no trace, and only the money in an account proves a
// payment.
import type { Img } from '../wasm/imgproc';
import { tableQuality, type GhostReading, type Jpegcoef, type JpegFrame } from '../wasm/jpegcoef';
import { amountsIn, datesIn, timeIn } from './deadlines';
import type { OcrWord } from './ocr';

export type Box = [number, number, number, number]; // x0, y0, x1, y1 in the picture's pixels
export type Strength = 'strong' | 'weak' | 'info';
/** what the check found, in words: `strong` — a sign of editing on its own; `weak` — re-saved, or something worth a look;
 *  `info` — a fact about the file */
export interface Sign { id: string; strength: Strength; title: string; text: string; boxes?: Box[] }

/* ------------------------------------------------------------------------------------------------ the JPEG's facts */
export interface JpegFacts {
  quality: number; chromaQuality: number | null;
  /** libjpeg's standard tables (the ones phones, apps and most programs write), scaled to that quality */
  standard: boolean;
  sampling: string; progressive: boolean; arithmetic: boolean; warnings: number; warning: string;
}
export function jpegFacts(fr: JpegFrame): JpegFacts {
  const [y, cb] = fr.components, ql = tableQuality(y.table), qc = cb ? tableQuality(cb.table, true) : null;
  const sampling = !cb ? 'greyscale' : y.h === cb.h && y.v === cb.v ? '4:4:4' : y.h === 2 * cb.h && y.v === 2 * cb.v ? '4:2:0'
    : y.h === 2 * cb.h && y.v === cb.v ? '4:2:2' : y.h === cb.h && y.v === 2 * cb.v ? '4:4:0' : `${y.h}×${y.v} / ${cb.h}×${cb.v}`;
  return {
    quality: ql.quality, chromaQuality: qc?.quality ?? null, standard: ql.off === 0 && (!qc || qc.off === 0), sampling,
    progressive: fr.progressive, arithmetic: fr.arithmetic, warnings: fr.warnings, warning: fr.warning,
  };
}

/* ------------------------------------------------------------------------------------------------ the ghosts */
/** the lowest quality the ghosts are worked out for */
export const QLO = 30;
/** a block's share of pixels with a colour clipped at 0 or 255 above which it is left out (×255): 5 % — measured: these
 *  blocks (a saturated bubble's edge, a coloured button) lose what a JPEG save left in them when the picture is decoded */
export const CLIP_LIMIT = 13;
/** 1 for each block of bw × bh to look at: not a colour clipped (`clip`: imgproc's blockClip, ⌈width/8⌉ blocks a row) and,
 *  `partial`, not the last column or row where the picture's size is no multiple of 8 (the encoder fills those blocks with
 *  copies of the edge, again at each save) */
export function keepBlocks(bw: number, bh: number, width: number, height: number, clip: Uint8Array | null, partial: boolean): Uint8Array {
  const keep = new Uint8Array(bw * bh), cw = Math.ceil(width / 8);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      if (partial && ((x === bw - 1 && width % 8) || (y === bh - 1 && height % 8))) continue;
      if (clip && clip[y * cw + x] > CLIP_LIMIT) continue;
      keep[y * bw + x] = 1;
    }
  return keep;
}
/** A JPEG's ghosts on its stored coefficients (none when its tables are not libjpeg's standard ones, or its quality is too low
 *  to have an earlier, lower one to find). */
export function ghostOfJpeg(jc: Jpegcoef, fr: JpegFrame, facts: JpegFacts, clip: Uint8Array | null): GhostReading | null {
  if (!fr.read || !facts.standard || facts.quality < QLO + 15) return null;
  const c = fr.components[0], q1 = facts.quality, g = jc.ghost(0, c.bw, c.bh, QLO, q1), grid = jc.grid(0, c.bw, c.bh, QLO, q1);
  return jc.analyse(g.err, grid, g.energy, keepBlocks(c.bw, c.bh, fr.width, fr.height, clip, true), c.bw, c.bh, QLO, q1, q1);
}
/** the imgproc ops the pixel checks need (the worker's in the page, a bound module in Node) */
export interface PixelOps {
  jpegGhost(img: Img, q0: number, q1: number): { bw: number; bh: number; err: Float32Array; variance: Float32Array } | Promise<{ bw: number; bh: number; err: Float32Array; variance: Float32Array }>;
  jpegGrid(img: Img, q0: number, q1: number): { bw: number; bh: number; dist: Float32Array } | Promise<{ bw: number; bh: number; dist: Float32Array }>;
}
/** A picture saved without loss (PNG, WebP lossless, BMP …): the JPEG traces in its pixels, if it was a JPEG before. */
export async function ghostOfPixels(ops: PixelOps, jc: Jpegcoef, img: Img, clip: Uint8Array | null): Promise<GhostReading | null> {
  if (img.width < 64 || img.height < 64) return null;
  const g = await ops.jpegGhost(img, QLO, 100), grid = await ops.jpegGrid(img, QLO, 100);
  return jc.analyse(g.err, grid.dist, g.variance, keepBlocks(g.bw, g.bh, img.width, img.height, clip, false), g.bw, g.bh, QLO, 100, 99);
}
/** boxes that overlap or stand within `gap` pixels of each other made one (the pieces of one edited amount: "₹7," and "250") */
export function mergeBoxes(boxes: Box[], gap: number): Box[] {
  const out = boxes.map((b) => [...b] as Box);
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (a[0] <= b[2] + gap && b[0] <= a[2] + gap && a[1] <= b[3] + gap && b[1] <= a[3] + gap) {
          out[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
          out.splice(j, 1); changed = true; break;
        }
      }
  }
  return out;
}
/** the areas a ghost reading found, in the picture's pixels (pieces within 24 px made one) */
export const areaBoxes = (r: GhostReading, width: number, height: number): Box[] =>
  mergeBoxes(r.areas.map((a) => [a.x0 * 8, a.y0 * 8, Math.min(width, (a.x1 + 1) * 8), Math.min(height, (a.y1 + 1) * 8)] as Box), 24);

/* ------------------------------------------------------------------------------------------------ the preview inside */
/** How the file's embedded preview compares with the picture made as small (both as stored, not turned): `shape` — the two
 *  shapes differ by more than 3 % (the picture was cropped after the preview was made); `cells` the 12 × 12 cells' mean
 *  brightness difference; `worst` the largest and `typical` the median. */
export function previewDiff(cells: Float32Array): { worst: number; typical: number } {
  const v = Array.from(cells).sort((a, b) => a - b);
  return { worst: v[v.length - 1] ?? 0, typical: v[v.length >> 1] ?? 0 };
}
/** a preview differs where a cell stands well apart from the rest — measured: a preview of the same picture differs by its
 *  resampling and its own low quality (a screenshot's: typical 0.6, worst 3.5 levels; a Canon camera's: typical 5, worst 20);
 *  one digit of an amount painted over moves its cell by 11.7 against a typical 0.6 */
export const previewDiffers = (d: { worst: number; typical: number }) => d.worst >= 8 && d.worst >= 6 * d.typical + 4;

/* ------------------------------------------------------------------------------------------------ the text */
export interface Word { text: string; conf: number; box: Box }
export interface Row { text: string; box: Box; words: Word[]; height: number }
/** the words read (the OCR's), as rows (their middles within 0.6 of a word's height of each other), top to bottom, each left
 *  to right */
export function rowsOf(read: OcrWord[]): Row[] {
  const ws: Word[] = read.map((w) => ({ text: w.text, conf: w.conf, box: [w.x0, w.y0, w.x1, w.y1] as Box })).filter((w) => w.text.trim() && w.box[3] > w.box[1]).sort((a, b) => (a.box[1] + a.box[3]) - (b.box[1] + b.box[3]));
  const rows: Word[][] = [];
  for (const w of ws) {
    const mid = (w.box[1] + w.box[3]) / 2, h = w.box[3] - w.box[1];
    const row = rows.find((r) => { const m = r.reduce((s, x) => s + (x.box[1] + x.box[3]) / 2, 0) / r.length, rh = r.reduce((s, x) => s + x.box[3] - x.box[1], 0) / r.length; return Math.abs(m - mid) <= 0.6 * Math.min(h, rh); });
    if (row) row.push(w); else rows.push([w]);
  }
  return rows.map((r) => {
    r.sort((a, b) => a.box[0] - b.box[0]);
    const hs = r.map((w) => w.box[3] - w.box[1]).sort((a, b) => a - b);
    return { words: r, text: r.map((w) => w.text).join(' '), height: hs[hs.length >> 1], box: [Math.min(...r.map((w) => w.box[0])), Math.min(...r.map((w) => w.box[1])), Math.max(...r.map((w) => w.box[2])), Math.max(...r.map((w) => w.box[3]))] as Box };
  }).sort((a, b) => a.box[1] - b.box[1]);
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (y: number, m: number, d: number) => `${d} ${MONTH_NAMES[m - 1]} ${y}`;
const minutes = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
const clockText = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
/** the status bar's clock: the first word of the top rows (the top 7 % of a tall screenshot), at the left, that is a time */
export function statusClock(rows: Row[], width: number, height: number): { text: string; h: number; m: number; box: Box } | null {
  for (const r of rows) {
    if (r.box[1] > 0.07 * height) break;
    for (const w of r.words) {
      if (w.box[0] > 0.45 * width) break;
      const t = w.text.replace(/[^\d:.]/g, ''), m = t.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
      if (m) return { text: `${+m[1]}:${m[2]}`, h: +m[1], m: +m[2], box: w.box };
    }
  }
  return null;
}
/** a UPI reference's label (the UPI's RRN is 12 digits — NPCI's rule; a bank's UTR for NEFT holds letters and is no UPI's) */
const UPI_REF = /\b(?:UPI\s*(?:Ref(?:erence)?|Txn|Transaction)\.?\s*(?:No\.?|ID|Number)?|RRN)\b\s*[:#.-]?\s*/i;
/** the label of the amount's own row in a receipt */
const AMOUNT_LABEL = /^(?:total\s+)?(?:amount(?:\s+paid)?|paid|total(?:\s+amount)?|debited|you\s+paid)\b/i;
/** A number as Tesseract reads a large amount: the rupee sign may come out as a letter or a digit (₹ → %, 2, 7, X, ¥ …). */
function bigAmount(text: string): { value: number; alt: number | null } | null {
  const t = text.replace(/\s+/g, ''), m = t.match(/^([^\d]{0,2})(\d[\d,]*(?:\.\d{1,2})?)$/);
  if (!m || !/^\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?$|^\d+(?:\.\d{1,2})?$/.test(m[2])) {
    const m2 = t.match(/^[^\d]{0,2}(\d)(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)$/); // a misread sign read as a digit before the number
    return m2 ? { value: +m2[2].replace(/,/g, ''), alt: null } : null;
  }
  const value = +m[2].replace(/,/g, ''), d = m[2].match(/^(\d)(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)$/);
  return { value, alt: !m[1] && d ? +d[2].replace(/,/g, '') : null }; // "71,250": the 7 may be a ₹
}
/**
 * What a receipt's text cannot say: a weekday that is not the date's, a date to come, a UPI reference that is not 12 digits,
 * the status bar's clock a little before the payment, the large amount and the amount's row apart. `today` yyyy-mm-dd.
 */
export function textSigns(rows: Row[], o: { width: number; height: number; today: string }): Sign[] {
  const signs: Sign[] = [];
  // the payment's date and time: the first row with a date (a year written, or this year) and a time beside it or under it
  let pay: { y: number; m: number; d: number; time: string | null; row: Row; weekday: string | null } | null = null;
  for (let i = 0; i < rows.length && !pay; i++) {
    const r = rows[i];
    for (const h of datesIn(r.text)) {
      const y = h.y ?? +o.today.slice(0, 4), wd = h.text.match(/^\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?/i);
      const rest = r.text.slice(h.e), time = timeIn(rest) ?? timeIn(r.text.slice(0, h.s)) ?? (rows[i + 1] ? timeIn(rows[i + 1].text) : null);
      pay = { y, m: h.m, d: h.d, time, row: r, weekday: wd ? wd[1].toLowerCase() : null };
      break;
    }
  }
  if (pay) {
    const { y, m, d } = pay, dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (pay.weekday && WEEKDAYS.indexOf(pay.weekday) !== dow)
      signs.push({ id: 'weekday', strength: 'strong', title: 'The weekday is not the date’s', boxes: [pay.row.box],
        text: `It says ${WEEKDAY_NAMES[WEEKDAYS.indexOf(pay.weekday)]}, ${longDate(y, m, d)} — that date is a ${WEEKDAY_NAMES[dow]}. A payment app writes its own date and never gets the day wrong.` });
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const t = new Date(`${o.today}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1);
    if (iso > t.toISOString().slice(0, 10))
      signs.push({ id: 'future', strength: 'strong', title: 'A date still to come', boxes: [pay.row.box], text: `It says ${longDate(y, m, d)}, after today (on this device’s calendar).` });
    const clock = statusClock(rows, o.width, o.height);
    if (clock && pay.time) {
      const p = minutes(pay.time), c = clock.h * 60 + clock.m, twelve = clock.h <= 12;
      // the status bar of a 12-hour phone shows no am / pm: the same half of the day as the payment is meant
      const span = twelve ? 720 : 1440;
      let diff = (((c - p) % span) + span) % span;
      if (diff > span / 2) diff -= span;
      if (diff <= -2 && diff >= -60)
        signs.push({ id: 'clock', strength: 'strong', title: 'The phone’s clock says before the payment', boxes: [clock.box, pay.row.box],
          text: `The status bar shows ${clock.text}; the payment says ${clockText(p)} — ${-diff} minutes later. A receipt saved after paying shows a later time. Unless the screenshot was taken another day, the time or the clock was changed.` });
    }
  }
  // the UPI reference
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], lm = r.text.match(UPI_REF);
    if (!lm) continue;
    let rest = r.text.slice((lm.index ?? 0) + lm[0].length);
    if (!/\d/.test(rest) && rows[i + 1]) rest = rows[i + 1].text;
    const digits = rest.match(/\d[\d\s]{5,}\d/);
    if (!digits) continue;
    const n = digits[0].replace(/\s/g, '');
    if (/[A-Za-z]/.test(rest.slice(0, (digits.index ?? 0) + digits[0].length).replace(/^\s*(?:no|id)\b/i, ''))) continue;
    if (n.length !== 12)
      signs.push({ id: 'ref', strength: 'strong', title: 'The UPI reference is not 12 digits', boxes: [r.box],
        text: `The UPI reference reads ${n} — ${n.length} digits. Every UPI payment's reference (its RRN) has 12. (If the screenshot is blurred, check that the reading is right.)` });
    break;
  }
  // the large amount against the amount's own row
  const withAmount = rows.map((r) => ({ r, big: bigAmount(r.text) })).filter((x) => x.big && x.r.words.length <= 3);
  const headline = withAmount.sort((a, b) => b.r.height - a.r.height)[0];
  const labelled = rows.find((r) => AMOUNT_LABEL.test(r.text.trim()) && amountsIn(r.text).length);
  if (headline && labelled && headline.r.height > 1.4 * labelled.height) {
    const row = amountsIn(labelled.text)[0].value, big = headline.big!;
    if (Math.abs(big.value - row) > 0.005 && (big.alt == null || Math.abs(big.alt - row) > 0.005))
      signs.push({ id: 'amounts', strength: 'strong', title: 'Two different amounts', boxes: [headline.r.box, labelled.box],
        text: `The amount in large type reads ${headline.r.text.replace(/\s+/g, '')}, the amount below reads ${amountsIn(labelled.text)[0].text}. A payment app shows one amount.` });
  }
  return signs;
}

/* ------------------------------------------------------------------------------------------------ the metadata */
export type Tags = Record<string, unknown>;
/** editing programs and apps (a phone's or camera's own software is none of these) */
const EDITORS = /photoshop|lightroom|gimp|snapseed|picsart|canva|pixlr|photopea|paint\.?net|affinity|fotor|polarr|meitu|facetune|photodirector|vsco|adobe express|photoscape|remini|airbrush|pixelmator|acdsee|corel|paintshop|krita|luminar|capture one|darktable|rawtherapee|faceapp|picmonkey|befunky|ibis ?paint|procreate|photo ?editor|microsoft photos|windows photo editor|picasa|inkscape|figma|sketch\b|illustrator|after ?effects|premiere|kinemaster|inshot|lightx|toolwiz|retouch|touchretouch|ps express|lensa|photoroom/i;
const tagEnds = (tags: Tags, name: string) => Object.entries(tags).filter(([k]) => k.split(':').pop() === name).map(([, v]) => String(v));
/** "2026:11:06 09:02:11" (with a zone or not) → milliseconds, read as UTC (only differences are used) */
const exifTime = (s: string) => { const m = s.match(/^(\d{4})[:-](\d\d)[:-](\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : NaN; };
const span = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.round(m / 1440)} days`; };
export interface MetaFacts {
  software: string[]; editors: string[]; history: string[]; camera: string | null; taken: string | null; modified: string | null;
  comment: string | null; hasPreview: boolean; none: boolean; screenshotTool: string | null;
}
export function metaFacts(tags: Tags): MetaFacts {
  const uniq = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];
  const software = uniq([...tagEnds(tags, 'Software'), ...tagEnds(tags, 'CreatorTool'), ...tagEnds(tags, 'HistorySoftwareAgent').flatMap((s) => s.split(/,\s*(?=[A-Z])/))]);
  const actions = tagEnds(tags, 'HistoryAction'), whens = tagEnds(tags, 'HistoryWhen'), agents = tagEnds(tags, 'HistorySoftwareAgent');
  const history = actions.length ? String(actions[0]).split(/,\s*/).map((a, i) => [a, String(whens[0] ?? '').split(/,\s*/)[i], String(agents[0] ?? '').split(/,\s*(?=[A-Z])/)[i]].filter(Boolean).join(' · ')) : [];
  const make = tagEnds(tags, 'Make')[0], model = tagEnds(tags, 'Model')[0];
  const taken = tagEnds(tags, 'DateTimeOriginal')[0] ?? tagEnds(tags, 'CreateDate')[0] ?? null;
  const modified = tagEnds(tags, 'ModifyDate')[0] ?? null;
  const comment = tagEnds(tags, 'Comment')[0] ?? null;
  const hasPreview = Object.keys(tags).some((k) => /:(ThumbnailImage|PreviewImage|PhotoshopThumbnail)$/.test(k));
  const meaningful = Object.keys(tags).filter((k) => k !== 'SourceFile' && !/^(ExifTool|System|File|Composite|JFIF|PNG|ICC_Profile|ICC-header|ICC-meas|ICC-view)\b/.test(k) || /:(Software|Comment|TextualData)$/.test(k));
  const screenshotTool = software.find((s) => /snipping|greenshot|sharex|lightshot|shottr|flameshot|spectacle|gnome-screenshot|screenshot/i.test(s)) ?? null;
  return {
    software, editors: software.filter((s) => EDITORS.test(s)).concat(comment && EDITORS.test(comment) ? [comment] : []), history,
    camera: make || model ? [make, model && !(make && model.startsWith(make)) ? model : model?.replace(make ?? '', '').trim()].filter(Boolean).join(' ') : null,
    taken, modified, comment, hasPreview, none: meaningful.length === 0, screenshotTool,
  };
}
export function metaSigns(m: MetaFacts): Sign[] {
  const s: Sign[] = [];
  if (m.editors.length)
    s.push({ id: 'software', strength: 'strong', title: 'Saved by an editing program', text: `The file says it was saved by ${m.editors.join(' and ')}. A screenshot or a photo straight from a phone names the phone's own software, or nothing.` });
  if (m.history.length)
    s.push({ id: 'history', strength: 'strong', title: 'An editing history inside', text: `The file keeps a history of what was done to it: ${m.history.slice(0, 6).join('; ')}${m.history.length > 6 ? ` … (${m.history.length} steps)` : ''}.` });
  if (m.taken && m.modified) {
    const d = exifTime(m.modified) - exifTime(m.taken);
    if (d > 60000) s.push({ id: 'modified', strength: 'weak', title: 'Changed after it was taken', text: `It was taken ${m.taken.slice(0, 19).replace(/:/, '-').replace(/:/, '-')} and changed ${span(d)} later (${m.modified.slice(0, 19).replace(/:/, '-').replace(/:/, '-')}) — edited, or saved again by an app.` });
  }
  if (!m.editors.length && m.software.length)
    s.push({ id: 'made-by', strength: 'info', title: 'Saved by', text: m.software.join(', ') + (m.screenshotTool ? ' — a screenshot program.' : '.') });
  if (m.camera) s.push({ id: 'camera', strength: 'info', title: 'Camera or phone', text: m.camera + (m.taken ? `, taken ${m.taken.slice(0, 19).replace(/:/, '-').replace(/:/, '-')}` : '') + '.' });
  if (m.none) s.push({ id: 'no-meta', strength: 'info', title: 'No metadata', text: 'The file says nothing about where it comes from — usual for a screenshot, and for any picture sent through WhatsApp or another chat app (they strip it). Nothing can be read from it either way.' });
  return s;
}

/* ------------------------------------------------------------------------------------------------ the picture's signs */
export interface CopyArea { dx: number; dy: number; cells: number; a: number[]; b: number[] }
/** The signs in the picture itself: the ghosts (`lossless`: a PNG's, read in its pixels), the copied areas of a photo (boxes
 *  in the picture's pixels), the embedded preview. */
export function pictureSigns(o: {
  width: number; height: number; jpeg: JpegFacts | null; ghost: GhostReading | null; lossless: boolean; screenshot: boolean;
  copies: CopyArea[] | null; preview: { worst: number; typical: number; shapeOff: number; boxes: Box[] } | null; name: string;
}): Sign[] {
  const s: Sign[] = [], g = o.ghost;
  const boxes = g && g.earlier ? areaBoxes(g, o.width, o.height) : [];
  if (g && g.earlier) {
    if (boxes.length)
      s.push({ id: 'changed', strength: 'strong', title: boxes.length === 1 ? 'A part not saved like the rest' : `${boxes.length} parts not saved like the rest`, boxes,
        text: `The picture was saved before as a JPEG at about quality ${g.earlier}${o.lossless ? '' : `, then again at ${o.jpeg?.quality}`} — but the part${boxes.length > 1 ? 's' : ''} outlined ${boxes.length > 1 ? 'were' : 'was'} not in that first save: painted or pasted in afterwards. This is the trace an edited amount, name or date leaves.` });
    else if (o.lossless)
      s.push({ id: 'was-jpeg', strength: 'weak', title: 'This PNG was a JPEG before', text: `Its pixels carry the traces of a JPEG saved at about quality ${g.earlier}. A phone saves a screenshot straight as a PNG; this one went through a JPEG first — sent through a chat app, or edited and saved as a PNG. No part of it stands out as changed after that.` });
    else
      s.push({ id: 'twice', strength: 'weak', title: 'Saved twice', text: `This JPEG was saved before at about quality ${g.earlier}, then again at ${o.jpeg?.quality}. Editing does that — so does an app that saves a received picture again. No part of it stands out as changed after the first save.` });
  }
  if (o.copies?.length)
    s.push({ id: 'copied', strength: 'strong', title: o.copies.length === 1 ? 'A part copied from another part' : `${o.copies.length} parts copied from other parts`, boxes: o.copies.flatMap((c) => [c.a, c.b] as Box[]),
      text: 'Two areas of the photo are the same, pixel for pixel, in places a camera does not repeat: something was covered with a copy of another part (cloned).' });
  if (o.preview) {
    if (o.preview.shapeOff > 0.03)
      s.push({ id: 'preview-shape', strength: 'weak', title: 'The preview inside has another shape', text: 'The small preview kept inside the file has another shape than the picture: the picture was cropped after the preview was made, and the preview was not made again.' });
    else if (previewDiffers(o.preview))
      s.push({ id: 'preview', strength: 'strong', title: 'The preview inside shows something else', boxes: o.preview.boxes,
        text: 'The small preview kept inside the file differs from the picture where it is outlined: the picture was changed after the preview was made, and the editing app did not make the preview again.' });
  }
  if (o.jpeg) {
    const j = o.jpeg;
    s.push({ id: 'jpeg', strength: 'info', title: 'JPEG', text: j.standard
      ? `Saved at quality ${j.quality} with libjpeg's standard tables (phones, apps and most programs use them), colour ${j.sampling}${j.progressive ? ', progressive' : ''}.`
      : `Saved with quantization tables of its own (closest to quality ${j.quality}) — a camera's or a program's own; the check for an earlier save needs the standard tables.` });
    if (j.standard && /^IMG-\d{8}-WA\d+/i.test(o.name)) s.push({ id: 'whatsapp', strength: 'info', title: 'WhatsApp', text: 'The name is the one WhatsApp gives a picture it receives: what the sender’s phone saved is gone, WhatsApp saved it again.' });
    if (j.warnings) s.push({ id: 'damaged', strength: 'info', title: 'Damaged data', text: `The JPEG's data is damaged or cut short (${j.warning || 'libjpeg read on'}).` });
  }
  if (o.screenshot && o.copies == null) s.push({ id: 'no-copies', strength: 'info', title: 'Copied areas', text: 'Not looked for in a screenshot: its letters, icons and backgrounds repeat by nature.' });
  return s;
}

/* ------------------------------------------------------------------------------------------------ what it adds up to */
export interface Verdict { tone: 'signs' | 'resaved' | 'none'; headline: string; text: string }
export function verdict(signs: Sign[]): Verdict {
  const strong = signs.filter((s) => s.strength === 'strong'), weak = signs.filter((s) => s.strength === 'weak');
  if (strong.length) return { tone: 'signs', headline: strong.length === 1 ? 'A sign of editing found' : `${strong.length} signs of editing found`, text: 'This picture was most likely changed after it was made. Do not rely on it: check the payment in your own bank or UPI app.' };
  if (weak.length) return { tone: 'resaved', headline: 'Saved again — no clear sign of editing', text: 'The picture went through more than one save (edited, or passed on by an app). Nothing shows that its content was changed — that does not prove it was not.' };
  return { tone: 'none', headline: 'No sign of editing found', text: 'That does not prove it is genuine: a fake can be made without leaving any of these traces.' };
}
