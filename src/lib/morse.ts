// Morse Code: the alphabet and what the tab does with it — text into code, code into text, and when each tone of
// a message sounds. A table and string handling; nothing here needs an engine, and no DOM.

/** The international Morse alphabet (ITU-R M.1677-1) with the signs in common use beside it (! & ; _ $ are not in
 *  the recommendation) and the accented letters that have codes of their own. Held to unixcw's table by the tests. */
export const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...',
  ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.',
  '\u00c9': '..-..', '\u00c8': '.-..-', '\u00c0': '.--.-', '\u00c4': '.-.-', '\u00d6': '---.', '\u00dc': '..--', '\u00d1': '--.--', '\u00c7': '-.-..', // É È À Ä Ö Ü Ñ Ç
};
/** Signs that are sent as something else: the multiplication sign as X, a typographic apostrophe, quote or dash as
 *  the plain one. */
const SAME_AS: Record<string, string> = { '×': 'X', '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '−': '-' };
/** Procedural signals: letters sent as one, without the gaps between them. Written <SK> in text. */
export const PROSIGNS: Record<string, string> = { '...---...': '<SOS>', '...-.-': '<SK>', '-...-.-': '<BK>', '-.-.-': '<KA>', '...-.': '<SN>', '........': '<HH>' };
const UNMORSE: Record<string, string> = { ...Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k])), '----': 'CH' };

const DOTS = /[\u00b7\u2022\u2219\u22c5]/g, DASHES = /[\u2212\u2013\u2014\u2012\u2015_]/g;
/** Dots and dashes as people type them (· • − – — _) made plain. */
const plainSigns = (s: string) => s.replace(DOTS, '.').replace(DASHES, '-');
/** Is this Morse code — nothing but dots, dashes and what separates them (and at least one dot or dash)? */
export const isMorse = (s: string) => /^[\s./|-]+$/.test(plainSigns(s)) && /[.-]/.test(plainSigns(s));

export interface Encoded { /** letters apart by a space, words by " / ", lines as they were */ code: string; /** the characters that have no Morse code, each once, in the order met */ skipped: string[] }
/** Text → Morse code. Small letters are sent as capitals; an accent that has no code of its own is left off (ê as
 *  E); "%" is sent the way the ITU says: 0/0; <SK> (letters in angle brackets) is a procedural signal: its letters
 *  without gaps. What has no code is left out and listed. */
export function encode(text: string): Encoded {
  const skipped: string[] = [];
  const letter = (c: string): string | null => {
    if (MORSE[c]) return MORSE[c];
    if (SAME_AS[c]) return MORSE[SAME_AS[c]];
    if (c === '%') return [MORSE[0], MORSE['/'], MORSE[0]].join(' ');
    const base = c.normalize('NFD')[0];
    return base !== c && MORSE[base] ? MORSE[base] : null;
  };
  const word = (w: string): string => {
    const pro = /^<([A-Z]{2,})>$/.exec(w);
    if (pro) return Array.from(pro[1], (c) => MORSE[c]).join('');
    const out: string[] = [];
    for (const c of w) {
      const m = letter(c);
      if (m) out.push(m);
      else if (!/[\p{M}\u200c\u200d\ufe00-\ufe0f]/u.test(c) && !skipped.includes(c)) skipped.push(c); // a mark or joiner belongs to the character before it
    }
    return out.join(' ');
  };
  const code = text.normalize('NFC').split('\n').map((line) => line.toUpperCase().split(/\s+/).map(word).filter(Boolean).join(' / ')).join('\n');
  return { code, skipped };
}

export interface Decoded { text: string; /** the groups that are no Morse code, each once */ unknown: string[] }
/** Morse code → text (capitals). Letters stand apart by a space; words by a slash, a bar, a tab or two and more
 *  spaces; a line stays a line. A group that is no code comes out as U+FFFD and is listed. */
export function decode(code: string): Decoded {
  const unknown: string[] = [];
  const text = plainSigns(code).split('\n').map((line) => line.trim().split(/\s*[/|]\s*|\t+|\s{2,}/).map((w) => w.split(/\s/).filter(Boolean).map((g) => {
    if (UNMORSE[g]) return UNMORSE[g];
    if (PROSIGNS[g]) return PROSIGNS[g];
    if (!unknown.includes(g)) unknown.push(g);
    return '\ufffd';
  }).join('')).filter(Boolean).join(' ')).join('\n');
  return { text, unknown };
}
/** Morse code as typed, tidied: plain dots and dashes, one space between letters, " / " between words. */
export const tidy = (code: string): string => plainSigns(code).split('\n').map((line) => line.trim().split(/\s*[/|]\s*|\t+|\s{2,}/).map((w) => w.split(/\s/).filter(Boolean).join(' ')).filter(Boolean).join(' / ')).join('\n');

export interface Tone { /** seconds from the start */ at: number; /** seconds */ len: number }
/** When the tones of a message sound. One unit is 1.2 s ÷ words a minute (the word PARIS is 50 units): a dot is one
 *  unit, a dash three; between the parts of a letter one unit of silence, between letters three, between words
 *  (and lines) seven. */
export function schedule(code: string, wpm: number): { tones: Tone[]; total: number; unit: number } {
  const unit = 1.2 / wpm, tones: Tone[] = [];
  let t = 0, gap = 0; // gap: the units of silence owed before the next tone
  for (const line of tidy(code).split('\n')) {
    for (const word of line.split(' / ')) {
      for (const group of word.split(' ')) {
        for (const sign of group) {
          if (sign !== '.' && sign !== '-') continue;
          t += gap * unit;
          const len = (sign === '.' ? 1 : 3) * unit;
          tones.push({ at: t, len }); t += len; gap = 1;
        }
        if (gap) gap = 3;
      }
      if (gap) gap = 7;
    }
  }
  return { tones, total: t, unit };
}
/** "12 s", "1 min 5 s". */
export const lengthText = (seconds: number): string => { const s = Math.max(1, Math.round(seconds)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`; };
