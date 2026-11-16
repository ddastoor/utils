// Kokoro-82M text front end (port of kokoro-js 1.2.1 / misaki rules, Apache-2.0): text normalisation, punctuation
// kept around eSpeak NG phonemes, Kokoro's phoneme fix-ups, sentence splitting and the model's 115-symbol vocabulary
// (onnx-community/Kokoro-82M-v1.0-ONNX tokenizer.json). The phonemes come from our own espeak.wasm.
import type { Espeak } from '../wasm/espeak';

export const VOCAB: Record<string, number> = {"$": 0, ";": 1, ":": 2, ",": 3, ".": 4, "!": 5, "?": 6, "—": 9, "…": 10, "\"": 11, "(": 12, ")": 13, "“": 14, "”": 15, " ": 16, "̃": 17, "ʣ": 18, "ʥ": 19, "ʦ": 20, "ʨ": 21, "ᵝ": 22, "ꭧ": 23, "A": 24, "I": 25, "O": 31, "Q": 33, "S": 35, "T": 36, "W": 39, "Y": 41, "ᵊ": 42, "a": 43, "b": 44, "c": 45, "d": 46, "e": 47, "f": 48, "h": 50, "i": 51, "j": 52, "k": 53, "l": 54, "m": 55, "n": 56, "o": 57, "p": 58, "q": 59, "r": 60, "s": 61, "t": 62, "u": 63, "v": 64, "w": 65, "x": 66, "y": 67, "z": 68, "ɑ": 69, "ɐ": 70, "ɒ": 71, "æ": 72, "β": 75, "ɔ": 76, "ɕ": 77, "ç": 78, "ɖ": 80, "ð": 81, "ʤ": 82, "ə": 83, "ɚ": 85, "ɛ": 86, "ɜ": 87, "ɟ": 90, "ɡ": 92, "ɥ": 99, "ɨ": 101, "ɪ": 102, "ʝ": 103, "ɯ": 110, "ɰ": 111, "ŋ": 112, "ɳ": 113, "ɲ": 114, "ɴ": 115, "ø": 116, "ɸ": 118, "θ": 119, "œ": 120, "ɹ": 123, "ɾ": 125, "ɻ": 126, "ʁ": 128, "ɽ": 129, "ʂ": 130, "ʃ": 131, "ʈ": 132, "ʧ": 133, "ʊ": 135, "ʋ": 136, "ʌ": 138, "ɣ": 139, "ɤ": 140, "χ": 142, "ʎ": 143, "ʒ": 147, "ʔ": 148, "ˈ": 156, "ˌ": 157, "ː": 158, "ʰ": 162, "ʲ": 164, "↓": 169, "→": 171, "↗": 172, "↘": 173, "ᵻ": 177};
export const MAX_TOKENS = 510; // 512 with the two "$" pads

const PUNCT = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCT_RE = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+\\s*)+`, 'g');

function splitNum(m: string) {
  if (m.includes('.')) return m;
  if (m.includes(':')) { const [h, mi] = m.split(':').map(Number); return mi === 0 ? `${h} o'clock` : mi < 10 ? `${h} oh ${mi}` : `${h} ${mi}`; }
  const y = parseInt(m.slice(0, 4), 10);
  if (y < 1100 || y % 1000 < 10) return m;
  const l = m.slice(0, 2), r = parseInt(m.slice(2, 4), 10), s = m.endsWith('s') ? 's' : '';
  if (y % 1000 >= 100 && y % 1000 <= 999) { if (r === 0) return `${l} hundred${s}`; if (r < 10) return `${l} oh ${r}${s}`; }
  return `${l} ${r}${s}`;
}
function flipMoney(m: string) {
  const bill = m[0] === '$' ? 'dollar' : 'pound';
  if (isNaN(Number(m.slice(1)))) return `${m.slice(1)} ${bill}s`;
  if (!m.includes('.')) return `${m.slice(1)} ${bill}${m.slice(1) === '1' ? '' : 's'}`;
  const [b, c] = m.slice(1).split('.'), cents = parseInt(c.padEnd(2, '0'), 10);
  return `${b} ${bill}${b === '1' ? '' : 's'} and ${cents} ${m[0] === '$' ? (cents === 1 ? 'cent' : 'cents') : cents === 1 ? 'penny' : 'pence'}`;
}
const pointNum = (m: string) => { const [a, b] = m.split('.'); return `${a} point ${b.split('').join(' ')}`; };

/** kokoro-js normalize_text: quotes, abbreviations, years/times, money, decimals, ranges, initialisms. */
export function normalizeText(t: string): string {
  return t.replace(/[‘’]/g, "'").replace(/«/g, '“').replace(/»/g, '”').replace(/[“”]/g, '"').replace(/\(/g, '«').replace(/\)/g, '»')
    .replace(/、/g, ', ').replace(/。/g, '. ').replace(/！/g, '! ').replace(/，/g, ', ').replace(/：/g, ': ').replace(/；/g, '; ').replace(/？/g, '? ')
    .replace(/[^\S \n]/g, ' ').replace(/  +/, ' ').replace(/(?<=\n) +(?=\n)/g, '')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor').replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister').replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss').replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc').replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flipMoney)
    .replace(/\d*\.\d+/g, pointNum).replace(/(?<=\d)-(?=\d)/g, ' to ').replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S").replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, '-')).replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-').trim();
}
/** Text → Kokoro phonemes. lang 'a' = American (eSpeak en-us), 'b' = British (eSpeak en). */
export function phonemize(es: Espeak, text: string, lang: 'a' | 'b', norm = true): string {
  if (norm) text = normalizeText(text);
  es.voice(lang === 'a' ? 'gmw/en-us' : 'gmw/en');
  let out = '', last = 0;
  for (const m of text.matchAll(PUNCT_RE)) {
    if (last < m.index!) out += es.phonemes(text.slice(last, m.index));
    out += m[0]; last = m.index! + m[0].length;
  }
  if (last < text.length) out += es.phonemes(text.slice(last));
  let p = out.replace(/kəkˈ[oɔ]ːɹoʊ/g, 'kˈoʊkəɹoʊ') // eSpeak 1.52 says kəkˈɔːɹoʊ (kokoro-js matched the older kəkˈoːɹoʊ)
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ').replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ').replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (lang === 'a') p = p.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return p.trim();
}
/** Phonemes → input ids with the "$" pad (0) at both ends; symbols outside the vocabulary are dropped. */
export function tokenize(ph: string): number[] {
  const ids = [0];
  for (const c of ph) { const id = VOCAB[c]; if (id !== undefined) ids.push(id); }
  ids.push(0);
  return ids;
}

const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'sgt', 'col', 'gen', 'rep', 'sen', 'gov', 'lt', 'maj', 'capt', 'st', 'mt', 'etc', 'co', 'inc', 'ltd', 'dept', 'vs', 'p', 'pg', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'sun', 'mon', 'tu', 'tue', 'tues', 'wed', 'th', 'thu', 'thur', 'thurs', 'fri', 'sat', 'e.g', 'i.e']);
/** Sentences: split after . ! ? … (and blank lines) unless the word before is an abbreviation, an initial or a number. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n\s*\n|\n(?=\s*[-*•\d]+[.)]?\s)/)) {
    const parts = para.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…]["”’')\]]*)\s+(?=["“‘(\[]?[A-Z0-9])/);
    let cur = '';
    for (const s of parts) {
      cur = cur ? `${cur} ${s}` : s;
      const lastWord = (/(\S+)$/.exec(cur.replace(/[.!?…"”’')\]]+$/, ''))?.[1] || '').toLowerCase();
      if (/\.$/.test(cur) && (ABBR.has(lastWord) || /^[a-z]$/i.test(lastWord))) continue;
      out.push(cur); cur = '';
    }
    if (cur) out.push(cur);
  }
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s));
}
/** Kokoro chunks: whole sentences, merged while short, each at most MAX_TOKENS phoneme symbols (long ones split at commas/spaces). */
export function chunks(es: Espeak, text: string, lang: 'a' | 'b'): Array<{ text: string; phonemes: string }> {
  const out: Array<{ text: string; phonemes: string }> = [];
  for (const s of sentences(text)) {
    let ph = phonemize(es, s, lang);
    if (!ph) continue;
    while ([...ph].length > MAX_TOKENS) { // split an over-long sentence at the last comma or space that fits
      const cs = [...ph], head = cs.slice(0, MAX_TOKENS).join('');
      let cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '));
      if (cut < MAX_TOKENS * 0.4) cut = head.lastIndexOf(' ');
      if (cut <= 0) cut = MAX_TOKENS;
      out.push({ text: s, phonemes: cs.slice(0, cut + 1).join('').trim() });
      ph = cs.slice(cut + 1).join('').trim();
    }
    const prev = out[out.length - 1];
    if (prev && [...prev.phonemes].length + [...ph].length < 120 && /[.!?…]$/.test(prev.text)) { prev.text += ` ${s}`; prev.phonemes += ` ${ph}`; }
    else out.push({ text: s, phonemes: ph });
  }
  return out;
}
