// The Camera Reader (potentials #81): a photographed page's reading → what is read aloud, piece by piece, and how it is shown.
// - `pageParas`: the reading's lines (the page's lists set out by src/lib/listtext.ts) → paragraphs of pieces. A piece is a
//   sentence, or a line that stands alone — a menu's item with its price, a line of an address, a heading — with the pause
//   after it. Lines that run on (a line that reaches the column's width) are joined, a word broken over two lines made whole.
// - `sentencesOf`: a run of text cut into sentences — not after Mr., Dr., Tab., No., e.g. or an initial.
// - `spokenText`: a printed piece as it should be spoken — amounts in rupees (₹, Rs., INR; a ₹ Tesseract read as ¥), medicine
//   units and doses (500 mg, 5 ml, 1-0-1), dates written with slashes, times (10:00 am), phone numbers and PIN codes digit by
//   digit, the abbreviations of leaflets, letters and prescriptions; the dots of a menu's leaders, list marks and signs a
//   reader misread left out. The voices' own normalisers read the rest (numbers, decimals, ordinals).
// String glue around the readers' output (CLAUDE.md §3a). No DOM: the unit suite runs it.
import type { OcrResult } from './ocr';
import { GLYPH, isLabel } from './listtext';

export interface Piece {
  /** as printed (shown) */
  text: string;
  /** as spoken */
  say: string;
  /** seconds of silence after it, at speed 1 */
  pause: number;
  /** a line break after it where it is shown */
  br: boolean;
}
export interface Para { kind: 'heading' | 'text' | 'item'; pieces: Piece[] }

/** The pauses of a page read aloud (seconds at speed 1). */
export const PAUSE = { sentence: 0.3, line: 0.5, item: 0.6, short: 0.5, para: 0.8, heading: 0.9 } as const;

const MARKS = new Set(Object.values(GLYPH));
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const pct = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };

/** a line: its text (with its list mark), its indentation, its left and right ends, its letters' size, its paragraph and block */
interface Row { text: string; lead: number; x0: number; x1: number; h: number; para: number; block: number; words: number }

/** A word's type size from its box (the ink of its letters), so a title in large letters tells from the text by its size, not
 *  by which letters it has: the box reaches from its tallest letter's top — a lowercase ascender (b d f h k l) about 0.76 of
 *  the size, a capital or a digit 0.72, t i j 0.66, small letters alone 0.52 — to its lowest letter's bottom (g j p q y 0.24
 *  below the line, a comma 0.12). 0: no letters. */
export function emOf(w: { text: string; y0: number; y1: number }): number {
  const t = w.text.replace(/[^\p{L}\d()[\]{}]/gu, '');
  if (!t) return 0;
  const top = /[bdfhkl()[\]{}]/.test(t) || /[/\\|]/.test(w.text) ? 0.76 : /[\p{Lu}\d\u00e0-\u00ff]/u.test(t) ? 0.72 : /[tij]/.test(t) ? 0.66 : 0.52;
  const bottom = /[gjpqyç()[\]{}]/.test(t) ? 0.24 : /[,;/\\|]/.test(w.text) ? 0.12 : 0;
  return (w.y1 - w.y0) / (top + bottom);
}
/** A short line in capitals, without a sentence's closing punctuation: a heading (KAVERI CAFE, PARACETAMOL TABLETS IP 500 mg). */
const capsLine = (t: string) => {
  const up = (t.match(/\p{Lu}/gu) || []).length, low = (t.match(/\p{Ll}/gu) || []).length;
  return up >= 4 && up >= 0.8 * (up + low) && t.split(/\s+/).length <= 8 && !/[.,;:!?]["”’')]*$/.test(t);
};

export function pageParas(r: Pick<OcrResult, 'text' | 'words' | 'lines'>, listed?: string): Para[] {
  const lines = r.lines || [];
  const shown = (listed ?? r.text).split('\n');
  const nonBlank = shown.filter((l) => l.trim());
  // the listed text has one line for each line read: its marks and indentation are used; else the lines as read
  const use = nonBlank.length === lines.length;
  const rows: Row[] = [];
  const blankBefore: boolean[] = [];
  let k = 0, sawBlank = false;
  if (use) {
    for (const l of shown) {
      if (!l.trim()) { sawBlank = true; continue; }
      const ln = lines[k++], ws = r.words.slice(ln.w0, ln.w1);
      rows.push({ text: l.trim(), lead: l.length - l.trimStart().length, x0: Math.min(...ws.map((w) => w.x0)), x1: Math.max(...ws.map((w) => w.x1)), h: median(ws.map(emOf).filter((e) => e > 0)), para: ln.para, block: ln.block, words: ws.length });
      blankBefore.push(sawBlank); sawBlank = false;
    }
  } else if (lines.length) {
    for (const ln of lines) {
      const ws = r.words.slice(ln.w0, ln.w1);
      if (!ws.length) continue;
      const prev = rows[rows.length - 1];
      rows.push({ text: ws.map((w) => w.text).join(' '), lead: 0, x0: Math.min(...ws.map((w) => w.x0)), x1: Math.max(...ws.map((w) => w.x1)), h: median(ws.map(emOf).filter((e) => e > 0)), para: ln.para, block: ln.block, words: ws.length });
      blankBefore.push(!!prev && prev.para !== ln.para);
    }
  } else {
    // a reading without lines: its text as it stands, paragraphs apart by blank lines
    for (const l of shown) {
      if (!l.trim()) { sawBlank = true; continue; }
      rows.push({ text: l.trim(), lead: 0, x0: 0, x1: 0, h: 0, para: 0, block: 0, words: l.trim().split(/\s+/).length });
      blankBefore.push(sawBlank); sawBlank = false;
    }
  }
  if (!rows.length) return [];
  // the page's type size (`emOf`, the median over lines of three words and more); each block's (a column's) full width: those
  // lines' 90th percentile
  const body = rows.filter((x) => x.h > 0 && x.words >= 3);
  const H = median((body.length ? body : rows.filter((x) => x.h > 0)).map((x) => x.h));
  const width = new Map<number, number>();
  for (const b of new Set(rows.map((x) => x.block))) {
    const ws = rows.filter((x) => x.block === b && x.words >= 3).map((x) => x.x1 - x.x0);
    width.set(b, ws.length ? pct(ws, 0.9) : Math.max(...rows.filter((x) => x.block === b).map((x) => x.x1 - x.x0)));
  }
  const geom = rows.some((x) => x.x1 > x.x0);
  const firstTok = (t: string) => t.split(/\s+/)[0] ?? '';
  const item = (x: Row) => MARKS.has([...x.text][0]) || isLabel(firstTok(x.text));
  // a heading: larger letters (by a fifth; by a tenth for a short paragraph of its own without a sentence's closing punctuation),
  // or a short line in capitals — with letters, and not running on into a line of small letters
  const tall = (i: number) => {
    const x = rows[i], next = rows[i + 1];
    if (!/\p{L}{2}/u.test(x.text) || (next && !blankBefore[i + 1] && lower(next))) return false;
    if (capsLine(x.text)) return true;
    const own = (i === 0 || blankBefore[i]) && (!next || blankBefore[i + 1]) && x.words <= 8 && !/[.,;:!?]["”’')]*$/.test(x.text);
    // (a line of one or two words measures less surely: a third larger)
    return H > 0 && x.words <= 12 && x.h >= (own ? 1.1 : x.words < 3 ? 1.3 : 1.2) * H;
  };
  const long = (x: Row) => !geom || x.x1 - x.x0 >= 0.6 * (width.get(x.block) || 1);
  const lower = (x: Row) => /^[^\p{L}\d]*\p{Ll}/u.test(x.text.replace(/^\S+\s+/, (m) => (item(x) ? '' : m)));
  const endsNum = (x: Row) => /\d\)?\s*$/.test(x.text);

  const paras: Para[] = [];
  let cur: { kind: Para['kind']; runs: string[] } | null = null;
  let inItem = false;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i], prev = i ? rows[i - 1] : null;
    const isItem = item(x), cont = inItem && x.lead > 0 && !isItem;
    const newPara = !cur || blankBefore[i] || tall(i) || (prev && tall(i - 1)) || isItem || (inItem && !cont);
    if (newPara) {
      if (cur) paras.push(finish(cur));
      cur = { kind: tall(i) ? 'heading' : isItem ? 'item' : 'text', runs: [x.text] };
      inItem = isItem || cont;
      continue;
    }
    // the same paragraph: a line that stands alone (the one before stopped short of the column's width, or ended with a number —
    // a price —, and this one does not run on in small letters), or a line that runs on
    // (also before a short line that stands alone after a sentence: a label in bold letters of the text's size — "Dosage")
    const alone = geom && !long(x) && /[.!?:]["”’')]*$/.test(prev!.text) && i + 1 < rows.length && !lower(rows[i + 1]) && !blankBefore[i + 1];
    const hard = !lower(x) && (!long(prev!) || endsNum(prev!) || alone);
    const last = cur!.runs.length - 1;
    if (hard) cur!.runs.push(x.text);
    else if (/\p{L}[-‐]$/u.test(cur!.runs[last]) && /^\p{Ll}/u.test(x.text)) cur!.runs[last] = cur!.runs[last].slice(0, -1) + x.text;   // a word broken over two lines
    else cur!.runs[last] += ' ' + x.text;
  }
  if (cur) paras.push(finish(cur));
  return paras.filter((p) => p.pieces.length);
}

function finish(p: { kind: Para['kind']; runs: string[] }): Para {
  const pieces: Piece[] = [];
  const words = p.runs.join(' ').split(/\s+/).length;
  p.runs.forEach((run, ri) => {
    const ss = p.kind === 'heading' ? [run] : sentencesOf(run);
    ss.forEach((s, si) => {
      const lastOfRun = si === ss.length - 1, lastOfPara = lastOfRun && ri === p.runs.length - 1;
      const pause = !lastOfRun ? PAUSE.sentence : !lastOfPara ? PAUSE.line
        : p.kind === 'heading' ? PAUSE.heading : p.kind === 'item' ? PAUSE.item : words <= 6 ? PAUSE.short : PAUSE.para;
      pieces.push({ text: s, say: spokenText(s), pause, br: lastOfRun && !lastOfPara });
    });
  });
  return { kind: p.kind, pieces };
}

/** Words after which a full stop ends no sentence: titles, the abbreviations of leaflets, letters and prescriptions. */
const NO_END = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'smt', 'shri', 'sri', 'no', 'nos', 'tab', 'tabs', 'cap', 'caps', 'inj', 'syp',
  'susp', 'oint', 'approx', 'vs', 'fig', 'figs', 'dept', 'govt', 'pvt', 'ltd', 'co', 'inc', 'etc', 'rd', 'ave', 'mt', 'ref', 'vol', 'pp', 'pg', 'ch', 'e.g',
  'i.e', 'w.e.f', 'viz', 'cf', 'al', 'ext', 'tel', 'mob', 'ph', 'dt', 'hon', 'rev', 'gen', 'col', 'lt', 'capt', 'sgt', 'maj', 'jan', 'feb', 'mar', 'apr',
  'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'rs', 'qty', 'sl', 'sq', 'ft', 'max', 'min', 'hrs', 'hr', 'mins', 'secs']);

/** A run of text → its sentences: cut after . ! ? … (and closing quotes or brackets) before a capital or a digit, not after
 *  an abbreviation of NO_END, an initial (A. P. J. Abdul Kalam) or a list's number at the start ("1. Take"). */
export function sentencesOf(run: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of run.matchAll(/[.!?…]+["”’')\]]*(?=\s+["“‘(\[]?[\p{Lu}\d])/gu)) {
    const end = m.index! + m[0].length;
    const head = run.slice(start, m.index!), word = (/(\S+)$/.exec(head)?.[1] ?? '').replace(/^[("“‘[]+/, '');
    const w = word.toLowerCase();
    if (m[0][0] === '.' && (NO_END.has(w) || /^\p{L}$/u.test(word) || /^(?:\p{L}\.)+\p{L}$/u.test(word))) continue;
    if (m[0] === '.' && /^\d{1,3}$/.test(word) && head.trim() === word) continue;
    out.push(run.slice(start, end).trim());
    start = end;
  }
  const rest = run.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Units after a number: [one, many]. */
const UNITS: Record<string, [string, string]> = {
  mg: ['milligram', 'milligrams'], mcg: ['microgram', 'micrograms'], 'µg': ['microgram', 'micrograms'], 'μg': ['microgram', 'micrograms'],
  g: ['gram', 'grams'], gm: ['gram', 'grams'], gms: ['gram', 'grams'], kg: ['kilogram', 'kilograms'], ml: ['millilitre', 'millilitres'],
  mL: ['millilitre', 'millilitres'], l: ['litre', 'litres'], L: ['litre', 'litres'], IU: ['international unit', 'international units'],
  cm: ['centimetre', 'centimetres'], mm: ['millimetre', 'millimetres'], km: ['kilometre', 'kilometres'], kcal: ['kilocalorie', 'kilocalories'],
  hrs: ['hour', 'hours'], hr: ['hour', 'hours'], mins: ['minute', 'minutes'], min: ['minute', 'minutes'], secs: ['second', 'seconds'], sec: ['second', 'seconds'],
  pcs: ['piece', 'pieces'], pc: ['piece', 'pieces'], '%': ['percent', 'percent'], '°C': ['degree Celsius', 'degrees Celsius'], '°F': ['degree Fahrenheit', 'degrees Fahrenheit'],
};
const UNIT_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s?(${Object.keys(UNITS).sort((a, b) => b.length - a.length).map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\d])`, 'gu');
/** Abbreviations of leaflets, prescriptions and letters, as spoken. */
const ABBR: Array<[RegExp, string]> = [
  [/\bTab(s)?\.(?=\s)/g, 'Tablet$1'], [/\bCap(s)?\.(?=\s)/g, 'Capsule$1'], [/\bInj\.(?=\s)/g, 'Injection'], [/\bSyp\.(?=\s)/g, 'Syrup'],
  [/\bSusp\.(?=\s)/g, 'Suspension'], [/\bOint\.(?=\s)/g, 'Ointment'], [/\bapprox\.?(?=\s|$)/gi, 'approximately'], [/\be\.\s?g\.(?=\s|,|$)/gi, 'for example'],
  [/\bi\.\s?e\.(?=\s|,|$)/gi, 'that is'], [/\bviz\.(?=\s)/gi, 'namely'], [/\bw\.e\.f\.?(?=\s|$)/gi, 'with effect from'], [/\bNo\.\s?(?=\d)/g, 'number '],
  [/\bNos\.\s?(?=\d)/g, 'numbers '], [/\bDt\.(?=\s)/g, 'dated'], [/\bGovt\.?(?=\s|$|,)/g, 'Government'], [/\bDept\.?(?=\s|$|,)/g, 'Department'],
  [/\bPvt\.(?=\s)/g, 'Private'], [/\bLtd\.?(?=\s|$|,)/g, 'Limited'], [/\bCo\.(?=\s)/g, 'Company'], [/\bSmt\.?(?=\s)/g, 'Shrimati'], [/\bRd\.(?=\s|,|$)/g, 'Road'],
  [/\bMob\.?(?=\s?[:\d])/g, 'Mobile'], [/\bTel\.?(?=\s?[:\d])/g, 'Telephone'], [/\bFig\.(?=\s)/g, 'Figure'], [/\bQty\.?(?=\s|:)/gi, 'quantity'],
  [/\bSr\.(?=\s)/g, 'Senior'], [/\bJr\.(?=\s)/g, 'Junior'], [/\bvs\.?(?=\s)/g, 'versus'], [/\bDr\.(?=\s)/g, 'Doctor'],
];

/** A printed piece → what the voice says. */
export function spokenText(s: string): string {
  let t = s.normalize('NFC');
  // signs a reader misread (Chinese, Japanese and Korean characters on an English page; private-use), list marks, rules
  t = t.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}-]/gu, '')
    .replace(/[•◦▪◆►☐☑☒◉●○■□➢➤▸✓✔✗✘|_]+/g, ' ');
  // the dots of a menu's leaders, a stray dot before a price
  t = t.replace(/(?:\s*\.){3,}\s*/g, ', ').replace(/(^|\s)\.(?=\s?(?:₹|¥|Rs\b|\d))/g, '$1');
  // a phone number (10 – 13 digits in groups, + in front) and a long number without commas (a PIN code, an account): digit by digit
  t = t.replace(/(?<![\d,.])\+?\d[\d -]{8,}\d(?![\d,.])/g, (m) => {
    const n = m.replace(/\D/g, '').length;
    return n < 10 || n > 13 ? m : (m.startsWith('+') ? 'plus ' : '') + m.replace(/^\+/, '').split(/[ -]+/).map((g) => g.split('').join(' ')).join(', ');
  });
  t = t.replace(/(?<!(?:₹|¥|Rs\.?|INR)\s?)(?<![\d,.])\d{6,}(?![\d,]|\.\d)/g, (m) => m.split('').join(' '));
  // amounts in rupees: ₹ (or a ₹ read as ¥), Rs., INR; "/-" after
  t = t.replace(/(?:₹|¥|\bRs\.?|\bINR)\s?(\d[\d,]*)(?:\.(\d{1,2}))?(?:\s?\/-)?/g, (_m, r: string, p?: string) => {
    const rs = r.replace(/,/g, ''), ps = p ? +p.padEnd(2, '0') : 0;
    return `${rs} rupee${rs === '1' ? '' : 's'}${ps ? ` ${ps} paise` : ''}`;
  });
  t = t.replace(/\b(\d+)\.00\b/g, '$1');
  // dates written with slashes, dashes or dots (day first, as in India)
  t = t.replace(/\b(\d{1,2})([/.-])(\d{1,2})\2((?:19|20)\d{2}|\d{2})\b/g, (m, d: string, _s, mo: string, y: string) => {
    const yy = +(y.length === 2 ? '20' + y : y), last = new Date(Date.UTC(yy, +mo, 0)).getUTCDate();   // the month's last day
    return +d >= 1 && +mo >= 1 && +mo <= 12 && +d <= last ? `${+d} ${MONTHS[+mo - 1]} ${yy}` : m;
  });
  // doses: 1-0-1 (morning, afternoon, night)
  t = t.replace(/(?<![\w.])([0-2]|½)-([0-2]|½)-([0-2]|½)(?![\w.])/g, '$1, $2, $3');
  // a course of days: "x 5 days" — for 5 days
  t = t.replace(/(?:^|\s)[x×]\s?(\d+)\s?(days?|weeks?|months?)\b/gi, ' for $1 $2');
  // times: 10:00 am, 2 p.m.
  t = t.replace(/\b(\d{1,2})(?::(\d{2}))?\s?([ap])\.?\s?m\b\.?/gi, (_m, h: string, mi: string | undefined, ap: string) => `${h}${mi && mi !== '00' ? `:${mi}` : ''} ${ap.toUpperCase()}M`);   // "AM", as eSpeak says it (not "A M": "uh em")
  // units after a number
  t = t.replace(/(\d)\s?[°º*]\s?([CF])\b/g, '$1°$2');
  t = t.replace(UNIT_RE, (_m, n: string, u: string) => `${n} ${UNITS[u][n === '1' ? 0 : 1]}`);
  for (const [re, w] of ABBR) t = t.replace(re, w);
  // ranges and sizes: 4–6 hours, 1 x 10
  t = t.replace(/(\d)\s?[-–]\s?(?=\d)/g, '$1 to ').replace(/(\d)\s?[x×]\s?(?=\d)/g, '$1 by ');
  t = t.replace(/½/g, ' half').replace(/¼/g, ' a quarter').replace(/¾/g, ' three quarters');
  return t.replace(/\s+([,.;:!?])/g, '$1').replace(/,(\s*,)+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s+/g, ' ').trim();
}

/** Whether a piece has anything to say (letters or digits). */
export const speakable = (p: Piece) => /[\p{L}\d]/u.test(p.say);
