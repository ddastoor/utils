// Text tools + developer tools that share this module.
// Unicode-aware work (segmentation, case mapping, collation, regex, JSON) uses the browser's native engines;
// algorithmic work (diff) runs in textcore.wasm.
import { h, card, field, input, textarea, button, segmented, toggle, select, clear, stack, row, note, copy, outputBox, downloadBlob, filePicker, readBytes, slider, type Mount } from '../ui';
import { textcore, type DiffOp, type bindTextcore } from '../wasm/textcore';
import { sodium, toB64, fromB64 } from '../wasm/crypto';
import { mathcore } from '../wasm/mathcore';

const fmt = (n: number) => n.toLocaleString('en-IN');

// ================================================================== Word counter
/** Counts via the browser's Unicode segmenter; keyword frequency ranking runs in textcore.wasm (own C). */
export function textStats(s: string, tc?: ReturnType<typeof bindTextcore>) {
  const seg = (g: 'word' | 'grapheme' | 'sentence') => [...new Intl.Segmenter(undefined, { granularity: g }).segment(s)];
  // word-like segments joined by a single hyphen count as one word ("e-mail", "well-known"), as in Word and Docs
  const words: string[] = [];
  const ws = seg('word') as any[];
  for (let i = 0; i < ws.length; i++) {
    if (!ws[i].isWordLike) continue;
    let w = ws[i].segment;
    while (i + 2 < ws.length && /^[-‐]$/.test(ws[i + 1].segment) && ws[i + 2].isWordLike) { w += ws[i + 1].segment + ws[i + 2].segment; i += 2; }
    words.push(w);
  }
  const graphemes = seg('grapheme').length;
  const noSpaces = seg('grapheme').filter((x) => !/^\s+$/.test(x.segment)).length;
  const sentences = seg('sentence').filter((x) => x.segment.trim()).length;
  const paragraphs = s.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const lines = s ? s.split('\n').length : 0;
  const top = tc ? tc.wordFreq(words.map((w) => w.toLowerCase()), 10, { stop: true, numbers: true, minLen: 3 }) : [];
  return { words: words.length, graphemes, noSpaces, sentences, paragraphs, lines, top, avgWord: words.length ? words.reduce((a, w) => a + [...w].length, 0) / words.length : 0 };
}
export const wordcount: Mount = async (root) => {
  const tc = await textcore();
  const ta = textarea({ rows: 10, placeholder: 'Type or paste text…' });
  const big = h('div', { class: 'big-results' });
  const more = h('div', { class: 'kv' });
  const kw = h('div', { class: 'chips' });
  const run = () => {
    const s = textStats(ta.value, tc);
    const mins = (wpm: number) => { const m = s.words / wpm; return m < 1 ? `${Math.max(1, Math.round(m * 60))} sec` : `${Math.round(m)} min`; };
    clear(big).append(...([['Words', fmt(s.words)], ['Characters', fmt(s.graphemes)], ['Sentences', fmt(s.sentences)], ['Reading time', s.words ? mins(238) : '—']] as Array<[string, string]>)
      .map(([l, v]) => h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, l), h('span', { class: 'big-value' }, v))));
    clear(more).append(...([['Characters (no spaces)', fmt(s.noSpaces)], ['Paragraphs', fmt(s.paragraphs)], ['Lines', fmt(s.lines)], ['Avg word length', s.avgWord.toFixed(1)], ['Speaking time', s.words ? mins(150) : '—']] as Array<[string, string]>).flatMap(([l, v]) => [h('span', null, l), h('span', null, v)]));
    clear(kw).append(...s.top.map(([w, n]) => h('span', { class: 'chip' }, `${w} · ${n}`)));
  };
  ta.addEventListener('input', run);
  root.append(card(null, ta), card('Counts', big, more), card('Top keywords', kw));
  run();
};

// ================================================================== Case converter
/** words for code-style cases: split at camelCase humps and acronyms (XMLHttpRequest → XML Http Request), drop punctuation */
const wordsOf = (s: string) => s.replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const cap = (w: string) => w.charAt(0).toLocaleUpperCase() + w.slice(1);
const SMALL = new Set('a an and as at but by for if in nor of on or per the to vs via'.split(' '));
export const CASES: Array<[string, (s: string) => string]> = [
  ['UPPER CASE', (s) => s.toLocaleUpperCase()],
  ['lower case', (s) => s.toLocaleLowerCase()],
  // small words stay lower case except first, last and after : — (Chicago style)
  ['Title Case', (s) => { const low = s.toLocaleLowerCase(), ws = [...low.matchAll(/[\p{L}\p{N}']+/gu)], last = ws.length - 1;
    return low.replace(/[\p{L}\p{N}']+/gu, (w, off) => { const k = ws.findIndex((m) => m.index === off), prev = low.slice(0, off).trimEnd(); return k > 0 && k < last && SMALL.has(w) && !/[:—–]$/.test(prev) ? w : cap(w); }); }],
  // a full stop after a lone letter is an abbreviation (i.e., e.g., U.S.), not the end of a sentence
  ['Sentence case', (s) => s.toLocaleLowerCase().replace(/(^\s*|(?<!(?:^|[\s.])\p{L})[.!?]\s+)(\p{L})/gu, (_, p, c) => p + c.toLocaleUpperCase()).replace(/\bi\b(?![.'’]?\p{L})|\bi(?=['’](m|ll|ve|d)\b)/gu, 'I')],
  ['camelCase', (s) => wordsOf(s).map((w, i) => (i ? cap(w.toLocaleLowerCase()) : w.toLocaleLowerCase())).join('')],
  ['PascalCase', (s) => wordsOf(s).map((w) => cap(w.toLocaleLowerCase())).join('')],
  ['snake_case', (s) => wordsOf(s).map((w) => w.toLowerCase()).join('_')],
  ['kebab-case', (s) => wordsOf(s).map((w) => w.toLowerCase()).join('-')],
  ['CONSTANT_CASE', (s) => wordsOf(s).map((w) => w.toUpperCase()).join('_')],
  ['dot.case', (s) => wordsOf(s).map((w) => w.toLowerCase()).join('.')],
  ['aLtErNaTiNg', (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join('')],
  ['iNVERSE', (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')],
];
export const caseConv: Mount = (root) => {
  const ta = textarea({ rows: 6, value: 'The quick brown fox jumps over the lazy dog', placeholder: 'Text…' });
  const list = h('div', { class: 'stack' });
  const run = () => clear(list).append(...CASES.map(([name, f]) => {
    const v = f(ta.value);
    return h('div', { class: 'case-row' }, h('span', { class: 'case-name' }, name), h('code', { class: 'case-val' }, v), button('', () => copy(v), { icon: 'Copy', small: true, variant: 'ghost', title: 'Copy' }));
  }));
  ta.addEventListener('input', run);
  root.append(card(null, ta), card('Conversions', list));
  run();
};

// ================================================================== Line tools
export const lines: Mount = async (root) => {
  const na = await sodium();
  const ta = textarea({ rows: 10, value: 'banana\napple\n  cherry  \napple\n\nBanana\n10\n9', mono: true });
  const out = outputBox({ rows: 10, mono: true });
  const o = { trim: true, empty: true, dedupe: true, ci: false, sort: 'az', reverse: false, number: false, prefix: '', suffix: '' };
  const info = h('div', { class: 'muted small' });
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const run = () => {
    let ls = ta.value.split(/\r?\n/);
    const before = ls.length;
    if (o.trim) ls = ls.map((l) => l.trim());
    if (o.empty) ls = ls.filter((l) => l.trim());
    if (o.dedupe) { const seen = new Set<string>(); ls = ls.filter((l) => { const k = o.ci ? l.toLowerCase() : l; if (seen.has(k)) return false; seen.add(k); return true; }); }
    if (o.sort === 'az') ls.sort(coll.compare); else if (o.sort === 'za') ls.sort((a, b) => coll.compare(b, a));
    else if (o.sort === 'len') ls.sort((a, b) => a.length - b.length || coll.compare(a, b));
    else if (o.sort === 'shuffle') ls = na.shuffle(ls); // fair CSPRNG shuffle (crypto.wasm)
    if (o.reverse) ls.reverse();
    ls = ls.map((l, i) => `${o.number ? `${i + 1}. ` : ''}${o.prefix}${l}${o.suffix}`);
    out.value = ls.join('\n');
    info.textContent = `${before} lines in → ${ls.length} lines out`;
  };
  ta.addEventListener('input', run);
  root.append(card(null, field('Input', ta)), card('Options', stack(
    h('div', { class: 'grid2' }, toggle('Trim spaces', o.trim, (v) => { o.trim = v; run(); }), toggle('Remove empty lines', o.empty, (v) => { o.empty = v; run(); }),
      toggle('Remove duplicates', o.dedupe, (v) => { o.dedupe = v; run(); }), toggle('…ignoring case', o.ci, (v) => { o.ci = v; run(); }),
      toggle('Reverse order', o.reverse, (v) => { o.reverse = v; run(); }), toggle('Number lines', o.number, (v) => { o.number = v; run(); })),
    field('Sort', segmented([['none', 'Keep order'], ['az', 'A → Z'], ['za', 'Z → A'], ['len', 'By length'], ['shuffle', 'Shuffle']], o.sort, (v) => { o.sort = v; run(); })),
    h('div', { class: 'grid2' }, field('Add prefix', input({ onInput: (v) => { o.prefix = v; run(); } })), field('Add suffix', input({ onInput: (v) => { o.suffix = v; run(); } }))))),
  card('Output', out, info));
  run();
};

// ================================================================== Find & replace
export const replace: Mount = (root) => {
  const ta = textarea({ rows: 8, value: 'Colour and flavour, colour again.' });
  const find = input({ value: 'colour', attrs: { spellcheck: 'false' } }), rep = input({ value: 'color', attrs: { spellcheck: 'false' } });
  const o = { regex: false, cs: false, word: false };
  const out = outputBox({ rows: 8 });
  const info = h('div', { class: 'muted small' });
  const run = () => {
    try {
      if (!find.value) { out.value = ta.value; info.textContent = ''; return; }
      let src = o.regex ? find.value : find.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (o.word) src = `\\b(?:${src})\\b`;
      const re = new RegExp(src, `g${o.cs ? '' : 'i'}u`);
      const n = [...ta.value.matchAll(re)].length;
      out.value = ta.value.replace(re, o.regex ? rep.value : rep.value.replace(/\$/g, '$$$$'));
      info.textContent = `${n} replacement${n === 1 ? '' : 's'}`;
      find.classList.remove('bad');
    } catch (e: any) { find.classList.add('bad'); info.textContent = e.message; }
  };
  [ta, find, rep].forEach((x) => x.addEventListener('input', run));
  root.append(card(null, stack(field('Text', ta), h('div', { class: 'grid2' }, field('Find', find), field('Replace with', rep)),
    h('div', { class: 'row' }, toggle('Regular expression', false, (v) => { o.regex = v; run(); }), toggle('Case sensitive', false, (v) => { o.cs = v; run(); }), toggle('Whole words', false, (v) => { o.word = v; run(); })))),
  card('Result', out, info));
  run();
};

// ================================================================== Diff
export const diff: Mount = async (root) => {
  const tc = await textcore();
  const A = textarea({ rows: 8, mono: true, value: 'apple\nbanana\ncherry\ndate' }), B = textarea({ rows: 8, mono: true, value: 'apple\nblueberry\ncherry\ndate\nelderberry' });
  let mode: 'lines' | 'words' | 'chars' = 'lines';
  const out = h('div', { class: 'diff-out' });
  const info = h('div', { class: 'muted small' });
  const split = (s: string) => (mode === 'lines' ? s.split(/\r?\n/) : mode === 'words' ? s.split(/(\s+)/).filter((x) => x !== '') : [...s]);
  const run = () => {
    const a = split(A.value), b = split(B.value);
    const ops = tc.diff(a, b, 20000) as DiffOp[] | null;
    if (!ops) { clear(out).append(note('Texts are too different to diff.', 'warn')); return; }
    let add = 0, del = 0;
    const els = ops.map((o) => {
      const txt = o.kind === 'ins' ? b[o.b] : a[o.a];
      if (o.kind === 'ins') add++; else if (o.kind === 'del') del++;
      return mode === 'lines'
        ? h('div', { class: `dl dl-${o.kind}` }, h('span', { class: 'dl-sign' }, o.kind === 'ins' ? '+' : o.kind === 'del' ? '−' : ' '), h('span', null, txt || ' '))
        : h('span', { class: `dw dw-${o.kind}` }, txt);
    });
    clear(out).append(mode === 'lines' ? h('div', { class: 'dl-wrap' }, els) : h('div', { class: 'dw-wrap' }, els));
    info.textContent = add || del ? `${add} added, ${del} removed (${mode})` : 'The texts are identical.';
  };
  [A, B].forEach((x) => x.addEventListener('input', run));
  root.append(card(null, stack(h('div', { class: 'grid2' }, field('Original', A), field('Changed', B)), segmented([['lines', 'Lines'], ['words', 'Words'], ['chars', 'Characters']], mode, (v) => { mode = v; run(); }))), card('Differences', info, out));
  run();
};

// ================================================================== Fancy text
const ranges = (upper: number, lower: number, digit?: number, exc: Record<string, string> = {}) => (s: string) => [...s].map((c) => {
  if (exc[c]) return exc[c];
  const k = c.codePointAt(0)!;
  if (k >= 65 && k <= 90) return String.fromCodePoint(upper + k - 65);
  if (k >= 97 && k <= 122) return String.fromCodePoint(lower + k - 97);
  if (digit && k >= 48 && k <= 57) return String.fromCodePoint(digit + k - 48);
  return c;
}).join('');
const mapChars = (from: string, to: string[]) => (s: string) => [...s].map((c) => { const i = from.indexOf(c); return i >= 0 ? to[i] : c; }).join('');
const az = 'abcdefghijklmnopqrstuvwxyz';
export const FANCY: Array<[string, (s: string) => string]> = [
  ['Bold', ranges(0x1d400, 0x1d41a, 0x1d7ce)],
  ['Italic', ranges(0x1d434, 0x1d44e, undefined, { h: 'ℎ' })],
  ['Bold italic', ranges(0x1d468, 0x1d482)],
  ['Script', ranges(0x1d49c, 0x1d4b6, undefined, { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' })],
  ['Bold script', ranges(0x1d4d0, 0x1d4ea)],
  ['Fraktur', ranges(0x1d504, 0x1d51e, undefined, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' })],
  ['Double-struck', ranges(0x1d538, 0x1d552, 0x1d7d8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' })],
  ['Sans-serif', ranges(0x1d5a0, 0x1d5ba, 0x1d7e2)],
  ['Sans bold', ranges(0x1d5d4, 0x1d5ee, 0x1d7ec)],
  ['Sans italic', ranges(0x1d608, 0x1d622)],
  ['Monospace', ranges(0x1d670, 0x1d68a, 0x1d7f6)],
  ['Circled', ranges(0x24b6, 0x24d0)],
  ['Fullwidth', (s) => [...s].map((c) => { const k = c.codePointAt(0)!; return k >= 33 && k <= 126 ? String.fromCodePoint(k + 0xfee0) : c === ' ' ? '　' : c; }).join('')],
  ['Small caps', mapChars(az, [...'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ'])],
  ['Upside down', (s) => [...mapChars(az + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?', [...'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz∀ꓭƆꓷƎℲ⅁HIſꓘ⅂WNOԀꝹꓤSꓕՈɅMX⅄Z˙\'¡¿'])(s)].reverse().join('')],
  ['Strikethrough', (s) => [...s].map((c) => c + '̶').join('')],
  ['Underline', (s) => [...s].map((c) => c + '̲').join('')],
  ['Bubble squares', ranges(0x1f130, 0x1f130)],
];
export const fancy: Mount = (root) => {
  const inp = input({ value: 'SuperTools', placeholder: 'Type something…' });
  const list = h('div', { class: 'stack' });
  const run = () => clear(list).append(...FANCY.map(([n, f]) => { const v = f(inp.value); return h('div', { class: 'case-row' }, h('span', { class: 'case-name' }, n), h('span', { class: 'case-val fancy-val' }, v), button('', () => copy(v), { icon: 'Copy', small: true, variant: 'ghost', title: 'Copy' })); }));
  inp.addEventListener('input', run);
  root.append(card(null, inp), card('Styles — tap to copy', list), note('These are Unicode characters, so they paste anywhere (Instagram, WhatsApp, X). Screen readers may read them oddly.'));
  run();
};

// ================================================================== Emoji & symbols
const SYMBOLS: Record<string, string> = {
  Arrows: '← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇑ ⇒ ⇓ ⇔ ⇕ ➔ ➜ ➤ ↩ ↪ ⤴ ⤵ ↻ ↺ ⟵ ⟶ ⟷',
  Math: '± × ÷ = ≠ ≈ ≡ ≤ ≥ < > ∞ √ ∛ ∑ ∏ ∫ ∂ ∆ ∇ π θ λ μ σ Ω α β γ ° ‰ ∈ ∉ ⊂ ⊃ ∪ ∩ ∧ ∨ ¬ ∀ ∃ ∅ ⅓ ⅔ ¼ ½ ¾ ² ³ ⁿ',
  Currency: '₹ $ € £ ¥ ₩ ₽ ₺ ₪ ₫ ₦ ₱ ฿ ₿ ¢ ₣ ₴ ₸',
  Punctuation: '“ ” ‘ ’ « » ‹ › … — – • · ¶ § † ‡ © ® ™ ℠ № ‽ ¡ ¿',
  'Check & stars': '✓ ✔ ✗ ✘ ☐ ☑ ☒ ★ ☆ ✦ ✧ ✪ ✩ ❤ ♥ ♡ ♦ ♣ ♠ ● ○ ◆ ◇ ■ □ ▲ △ ▼ ▽',
  Misc: '☀ ☁ ☂ ☃ ☎ ☕ ☘ ☮ ☯ ☺ ♀ ♂ ⚠ ⚡ ⌘ ⌥ ⇧ ⌫ ⏎ ⎋ ⌚ ⌛ ✂ ✈ ✉ ✏ ♪ ♫ ∴ ∵',
};
export const emoji: Mount = async (root) => {
  const data: Array<{ name: string; slug: string; emojis: Array<{ emoji: string; name: string }> }> = (await import('unicode-emoji-json/data-by-group.json')).default as any;
  let kind = 'emoji';
  const q = input({ placeholder: 'Search emoji or symbols (e.g. heart, rupee, arrow)…' });
  const body = h('div', { class: 'stack' });
  const cell = (ch: string, title: string) => h('button', { class: 'emoji-cell', type: 'button', title, onclick: () => copy(ch) }, ch);
  const render = () => {
    const t = q.value.toLowerCase().trim();
    clear(body);
    if (kind === 'emoji') {
      for (const g of data) {
        const items = g.emojis.filter((e) => { const n = e.name.toLowerCase(); return !t || t.split(/\s+/).every((w) => n.includes(w)); }); // case-insensitive, all words ("flag india")
        if (items.length) body.append(card(g.name, h('div', { class: 'emoji-grid' }, items.map((e) => cell(e.emoji, e.name)))));
      }
    } else {
      for (const [name, chars] of Object.entries(SYMBOLS)) {
        const items = chars.split(' ').filter((c) => !t || name.toLowerCase().includes(t) || (t === 'rupee' && c === '₹'));
        if (items.length) body.append(card(name, h('div', { class: 'emoji-grid' }, items.map((c) => cell(c, `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)))));
      }
    }
    if (!body.children.length) body.append(note('Nothing found.'));
  };
  q.addEventListener('input', render);
  root.append(card(null, stack(segmented([['emoji', 'Emoji'], ['symbols', 'Symbols']], kind, (v) => { kind = v; render(); }), q)), body, note('Tap any character to copy it.'));
  render();
};

// ================================================================== Morse
const MORSE: Record<string, string> = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.' };
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
export const toMorse = (s: string) => s.toUpperCase().split(/\s+/).filter(Boolean).map((w) => [...w].map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')).join(' / ');
export const fromMorse = (s: string) => s.trim().split(/\s*\/\s*|\s{3,}/).map((w) => w.split(/\s+/).map((c) => UNMORSE[c.replace(/[·•]/g, '.').replace(/[−–—_]/g, '-')] ?? '').join('')).join(' ');
export const morse: Mount = (root) => {
  const inp = textarea({ rows: 4, value: 'SOS Help', placeholder: 'Text or Morse (. - / )' });
  const out = outputBox({ rows: 4, mono: true });
  let wpm = 18, ctx: AudioContext | null = null;
  const isMorse = () => /^[\s.\-/·•−–—_]+$/.test(inp.value.trim());
  const run = () => { out.value = isMorse() ? fromMorse(inp.value) : toMorse(inp.value); };
  inp.addEventListener('input', run);
  const play = async () => {
    const code = isMorse() ? inp.value : toMorse(inp.value);
    ctx ||= new AudioContext();
    const unit = 1.2 / wpm; let t = ctx.currentTime + 0.05;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.value = 650; g.gain.value = 0; osc.connect(g).connect(ctx.destination); osc.start();
    for (const ch of code) {
      if (ch === '.' || ch === '-') { const d = ch === '.' ? unit : 3 * unit; g.gain.setValueAtTime(0.4, t); g.gain.setValueAtTime(0, t + d); t += d + unit; }
      else if (ch === ' ') t += 2 * unit; else if (ch === '/') t += 2 * unit; // gaps: symbol 1, letter 1+2 = 3, word " / " 1+2+2+2 = 7 units
    }
    osc.stop(t + 0.1);
  };
  root.append(card(null, stack(field('Input (auto-detects text or Morse)', inp), field('Output', out))),
    card('Sound', slider({ label: 'Speed', min: 5, max: 40, value: wpm, unit: ' wpm', onInput: (v) => (wpm = v) })),
    h('div', { class: 'actions' }, button('Play', play, { variant: 'primary', icon: 'Play' })));
  run();
  return () => { ctx?.close(); };
};

// ================================================================== Lorem ipsum
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');
export const lorem: Mount = async (root) => {
  const na = await sodium();
  let unit = 'p', n = 3, classic = true;
  const out = outputBox({ rows: 12, label: 'Generated text' });
  const pick = () => LOREM[na.uniform(LOREM.length)];
  const sentence = () => { const w = Array.from({ length: 8 + na.uniform(10) }, pick); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(' ') + '.'; };
  const para = () => Array.from({ length: 4 + na.uniform(4) }, sentence).join(' ');
  const OPEN = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.', OPEN_W = OPEN.replace(/[,.]/g, '').toLowerCase().split(' ');
  /** exactly n paragraphs / sentences / words; "classic" makes the first sentence (or first words) the usual opening */
  const run = () => {
    let s: string;
    if (unit === 'w') { const w = Array.from({ length: n }, (_, i) => (classic && i < OPEN_W.length ? OPEN_W[i] : pick())); w[0] = w[0][0].toUpperCase() + w[0].slice(1); s = w.join(' ') + '.'; }
    else if (unit === 's') s = Array.from({ length: n }, (_, i) => (classic && !i ? OPEN : sentence())).join(' ');
    else s = Array.from({ length: n }, (_, i) => (classic && !i ? para().replace(/^[^.]*\./, OPEN) : para())).join('\n\n');
    out.value = s;
  };
  root.append(card(null, stack(segmented([['p', 'Paragraphs'], ['s', 'Sentences'], ['w', 'Words']], unit, (v) => { unit = v; run(); }),
    slider({ label: 'How many', min: 1, max: 50, value: n, onInput: (v) => { n = v; run(); } }),
    toggle('Start with "Lorem ipsum…"', true, (v) => { classic = v; run(); }))), card(null, out), h('div', { class: 'actions' }, button('Regenerate', run, { icon: 'RefreshCw' }), button('Copy', () => copy(out.value), { variant: 'primary', icon: 'Copy' })));
  run();
};

// ================================================================== JSON (Software)
/** Where the JSON breaks. V8 gives "at position N" for most errors but not for "Unexpected token …": then the longest
 *  prefix the native parser still accepts as unfinished is found by binary search (valid prefixes are prefix-closed). */
export function jsonErrorAt(src: string, msg: string) {
  const m = /position (\d+)/.exec(msg);
  if (m) return +m[1];
  if (/Unexpected end of JSON input/.test(msg)) return src.length;
  // a prefix is "unfinished" when it parses, or its error is at (or past) its own end
  const unfinished = (L: number) => { try { JSON.parse(src.slice(0, L)); return true; } catch (e: any) { const p = /position (\d+)/.exec(e.message); return /Unexpected end of JSON input|Unterminated string/.test(e.message) || (!!p && +p[1] >= L); } };
  let lo = 0, hi = src.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (unfinished(mid)) lo = mid; else hi = mid - 1; }
  return lo;
}
function jsonError(src: string, e: any) {
  const pos = jsonErrorAt(src, e.message), before = src.slice(0, pos);
  const line = before.split('\n').length, col = pos - before.lastIndexOf('\n');
  const tok = /^(Unexpected token '.+?'),\s/s.exec(e.message);
  const what = tok ? tok[1] : e.message.replace(/ in JSON at.*/s, '');
  return `${what} — line ${line}, column ${col}`;
}
// numbers keep their exact text (12345678901234567890 would otherwise become …000; 0.1000000000000000055 → 0.1)
const RAW = typeof (JSON as any).rawJSON === 'function';
const keepNumbers = RAW ? (_k: string, v: any, ctx?: { source?: string }) => (typeof v === 'number' && ctx?.source !== undefined ? (JSON as any).rawJSON(ctx.source) : v) : undefined;
const isRaw = (v: any) => RAW && (JSON as any).isRawJSON(v);
const sortKeys = (v: any): any => (isRaw(v) ? v : Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
export const json: Mount = (root) => {
  const ta = textarea({ rows: 12, mono: true, value: '{"name":"SuperTools","tools":173,"tags":["private","wasm"],"nested":{"b":2,"a":1}}' });
  const out = outputBox({ rows: 14, mono: true });
  const status = h('div');
  let indent = '2', sorted = false;
  const run = (minify = false) => {
    try {
      let v = JSON.parse(ta.value, keepNumbers as any);
      if (sorted) v = sortKeys(v);
      out.value = minify ? JSON.stringify(v) : JSON.stringify(v, null, indent === 'tab' ? '\t' : +indent);
      clear(status).append(note(`Valid JSON · ${out.value.length.toLocaleString()} characters`, 'ok'));
    } catch (e: any) { clear(status).append(note(jsonError(ta.value, e), 'err')); }
  };
  ta.addEventListener('input', () => run());
  root.append(card(null, stack(field('JSON', ta), h('div', { class: 'row' }, segmented([['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tabs']], indent, (v) => { indent = v; run(); }), toggle('Sort keys', false, (v) => { sorted = v; run(); })))), status, card('Output', out),
    h('div', { class: 'actions' }, button('Format', () => run(), { variant: 'primary', icon: 'Braces' }), button('Minify', () => run(true), { icon: 'Minimize2' }), button('Download', () => downloadBlob(new Blob([out.value], { type: 'application/json' }), 'data.json'), { icon: 'Download' })));
  run();
};

// ================================================================== Regex tester (Software)
export const regex: Mount = (root) => {
  const pat = input({ value: '(\\d{3})-(\\d{4})', attrs: { spellcheck: 'false', class: 'input mono' } });
  const flags = input({ value: 'g', attrs: { spellcheck: 'false', class: 'input mono' } });
  const text = textarea({ rows: 6, value: 'Call 555-1234 or 555-9876 today.' });
  const rep = input({ placeholder: 'Replacement (optional, $1 for groups)', attrs: { spellcheck: 'false' } });
  const hl = h('div', { class: 'regex-hl' });
  const groups = h('div');
  const repOut = outputBox({ rows: 4 });
  const run = () => {
    clear(groups); clear(hl);
    let re: RegExp;
    try { re = new RegExp(pat.value, flags.value.includes('g') ? flags.value : flags.value + 'g'); pat.classList.remove('bad'); }
    catch (e: any) { pat.classList.add('bad'); groups.append(note(e.message, 'err')); return; }
    const s = text.value, ms: RegExpMatchArray[] = [];
    let total = 0;
    for (const m of s.matchAll(re)) { if (ms.length < 1000) ms.push(m); if (++total >= 1000000) break; } // count everything, highlight the first 1,000
    let last = 0;
    for (const m of ms) { hl.append(s.slice(last, m.index), h('mark', { class: m[0] ? null : 'empty' }, m[0] || '∅')); last = m.index! + m[0].length; }
    hl.append(s.slice(last));
    groups.append(note(`${total.toLocaleString('en-US')}${total >= 1000000 ? '+' : ''} match${total === 1 ? '' : 'es'}${total > ms.length ? ` (first ${ms.length.toLocaleString('en-US')} highlighted, ${Math.min(200, ms.length)} in the table)` : ''}`, total ? 'ok' : 'info'));
    if (ms.length) groups.append( h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Match'), h('th', null, 'Index'), ...Array.from({ length: Math.max(0, ...ms.map((m) => m.length - 1)) }, (_, i) => h('th', null, `$${i + 1}`)))),
        h('tbody', null, ms.slice(0, 200).map((m, i) => h('tr', null, h('td', null, String(i + 1)), h('td', { class: 'mono' }, m[0]), h('td', null, String(m.index)), ...m.slice(1).map((g) => h('td', { class: 'mono' }, g ?? '—'))))))));
    repOut.value = rep.value ? s.replace(new RegExp(pat.value, flags.value), rep.value) : '';
  };
  [pat, flags, text, rep].forEach((x) => x.addEventListener('input', run));
  root.append(card(null, stack(h('div', { class: 'regex-row' }, field('Pattern', pat), field('Flags', flags)), field('Test text', text))), card('Matches', hl, groups), card('Replace', rep, repOut),
    note('Uses the browser\'s JavaScript (ECMAScript) regex engine. Flags: g i m s u y d v.'));
  run();
};

// ================================================================== Base64 (Software)
export const base64: Mount = (root) => {
  const inp = textarea({ rows: 6, value: 'Hello, नमस्ते 👋', placeholder: 'Text or Base64' });
  const out = outputBox({ rows: 6, mono: true });
  let mode: 'enc' | 'dec' = 'enc', url = false;
  const status = h('div');
  const run = () => {
    clear(status);
    try { out.value = mode === 'enc' ? toB64(new TextEncoder().encode(inp.value), url) : new TextDecoder('utf-8', { fatal: true }).decode(fromB64(inp.value)); }
    catch { out.value = ''; status.append(note(mode === 'dec' ? 'Not valid Base64 text (or the result is binary — use the file option).' : 'Could not encode.', 'warn')); }
  };
  inp.addEventListener('input', run);
  root.append(card(null, stack(segmented([['enc', 'Encode'], ['dec', 'Decode']], mode, (v) => { mode = v; run(); }), toggle('URL-safe alphabet (-_ no padding)', false, (v) => { url = v; run(); }), field('Input', inp))), status, card('Output', out),
    card('Files', stack(filePicker({ compact: true, label: 'File → Base64 / data URL', onFiles: async ([f]) => { const b = await readBytes(f); out.value = `data:${f.type || 'application/octet-stream'};base64,${toB64(b)}`; } }),
      button('Base64 → download file', () => { const s = inp.value.trim().replace(/^data:[^,]*,/, ''); let b: Uint8Array; try { b = fromB64(s); } catch { clear(status).append(note('Not valid Base64 — nothing to download.', 'warn')); return; } downloadBlob(new Blob([b as BlobPart]), 'decoded.bin'); }, { icon: 'Download', small: true }))));
  run();
};

// ================================================================== URL encoder (Software)
export const urlenc: Mount = (root) => {
  const inp = textarea({ rows: 4, value: 'https://example.com/search?q=chai & samosa&city=मुंबई#top' });
  const out = outputBox({ rows: 4, mono: true });
  const parts = h('div');
  let mode = 'component';
  const run = () => {
    try {
      out.value = mode === 'component' ? encodeURIComponent(inp.value) : mode === 'uri' ? encodeURI(inp.value) : decodeURIComponent(inp.value.replace(/\+/g, ' '));
    } catch (e: any) { out.value = '⚠ ' + e.message; }
    clear(parts);
    try {
      const u = new URL(mode === 'decode' ? out.value : inp.value);
      parts.append(card('URL parts', h('div', { class: 'kv' }, ...([['Protocol', u.protocol], ['Host', u.host], ['Path', decodeURIComponent(u.pathname)], ['Hash', u.hash]] as Array<[string, string]>).flatMap(([k, v]) => [h('span', null, k), h('span', { class: 'mono' }, v || '—')])),
        [...u.searchParams].length ? h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Param'), h('th', null, 'Value'))), h('tbody', null, [...u.searchParams].map(([k, v]) => h('tr', null, h('td', { class: 'mono' }, k), h('td', { class: 'mono' }, v))))) : null));
    } catch { /* not a URL */ }
  };
  inp.addEventListener('input', run);
  root.append(card(null, stack(segmented([['component', 'Encode component'], ['uri', 'Encode full URL'], ['decode', 'Decode']], mode, (v) => { mode = v; run(); }), field('Input', inp))), card('Output', out), parts);
  run();
};

// ================================================================== Epoch (Software)
export const epoch: Mount = (root) => {
  const now = h('div', { class: 'big-value mono' });
  const upd = () => { now.textContent = String(Math.floor(Date.now() / 1000)); };
  upd(); const tick = setInterval(upd, 250);
  const ts = input({ value: String(Math.floor(Date.now() / 1000)), attrs: { class: 'input mono', inputmode: 'numeric' } });
  const dt = input({ type: 'datetime-local' });
  const out = h('div', { class: 'kv' });
  const rel = (ms: number) => { const d = (ms - Date.now()) / 1000, a = Math.abs(d); const u: Array<[number, string]> = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']]; const [s, n] = u.find(([s]) => a >= s) || [1, 'second']; return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(d / s), n as any); };
  const show = (ms: number) => {
    const d = new Date(ms);
    if (isNaN(d.getTime())) { clear(out).append(h('span', null, 'Invalid'), h('span', null, '—')); return; }
    clear(out).append(...([['Seconds', String(Math.floor(ms / 1000))], ['Milliseconds', String(ms)], ['UTC', d.toUTCString()], ['ISO 8601', d.toISOString()], ['Local', d.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'long' })], ['Relative', rel(ms)]] as Array<[string, string]>).flatMap(([k, v]) => [h('span', null, k), h('span', { class: 'mono' }, v)]));
  };
  ts.addEventListener('input', () => { const t = ts.value.trim(); if (!t) { clear(out); return; } const n = Number(t); show(Math.abs(n) > 1e11 ? n : n * 1000); }); // auto-detect ms vs s
  dt.addEventListener('input', () => { const ms = new Date(dt.value).getTime(); ts.value = String(Math.floor(ms / 1000)); show(ms); });
  root.append(card('Current Unix time', now), card(null, h('div', { class: 'grid2' }, field('Timestamp (seconds or ms)', ts), field('…or pick a date & time', dt))), card('Converted', out));
  show(Date.now());
  return () => clearInterval(tick);
};

// ================================================================== UUID (Software)
export const uuid: Mount = async (root) => {
  const na = await sodium();
  let ver = 'v4', n = 5, upper = false, hyph = true;
  const out = outputBox({ rows: 8, mono: true, label: 'UUIDs' });
  const check = input({ placeholder: 'Paste a UUID to inspect', attrs: { class: 'input mono', spellcheck: 'false' } });
  const info = h('div');
  const gen = () => { out.value = Array.from({ length: n }, () => { let u = na.uuid(ver === 'v7' ? 7 : 4); if (!hyph) u = u.replace(/-/g, ''); return upper ? u.toUpperCase() : u; }).join('\n'); };
  check.addEventListener('input', () => {
    clear(info);
    const m = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i.exec(check.value.trim());
    if (!m) { if (check.value.trim()) info.append(note('Not a valid UUID.', 'warn')); return; }
    const version = parseInt(m[3][0], 16);
    const rows: Array<[string, string]> = [['Version', `v${version}`], ['Variant', (parseInt(m[4][0], 16) & 0xc) === 0x8 ? 'RFC 9562' : 'other']];
    if (version === 7) rows.push(['Timestamp', new Date(parseInt(m[1] + m[2], 16)).toISOString()]);
    info.append(h('div', { class: 'kv' }, rows.flatMap(([k, v]) => [h('span', null, k), h('span', { class: 'mono' }, v)])));
  });
  root.append(card(null, stack(segmented([['v4', 'v4 (random)'], ['v7', 'v7 (time-ordered)']], ver, (v) => { ver = v; gen(); }), slider({ label: 'How many', min: 1, max: 100, value: n, onInput: (v) => { n = v; gen(); } }),
    h('div', { class: 'row' }, toggle('Uppercase', false, (v) => { upper = v; gen(); }), toggle('Hyphens', true, (v) => { hyph = v; gen(); })))), card(null, out), card('Inspect', check, info),
    h('div', { class: 'actions' }, button('Generate', gen, { variant: 'primary', icon: 'RefreshCw' }), button('Copy all', () => copy(out.value), { icon: 'Copy' })));
  gen();
};

// ================================================================== Color converter (Software)
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
function hexToRgb(hex: string) { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim()); if (!m) return null; let s = m[1]; if (s.length === 3) s = [...s].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); }
const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
function rgbToHsl(r: number, g: number, b: number) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; } return [hh, s * 100, l * 100]; }
function hslToRgb(hh: number, s: number, l: number) { s /= 100; l /= 100; const k = (n: number) => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l); const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255]; }
/** Colour maths runs in mathcore.wasm (own C); hex parsing/formatting is string glue. */
export const colorFns = { hexToRgb, rgbToHex };
export const color: Mount = async (root) => {
  const { rgbToHsl, hslToRgb, rgbToOklch, oklchToRgb, contrast: contrastRatio } = await mathcore();
  let rgb = [79, 70, 229];
  const picker = h('input', { type: 'color', class: 'color-picker', 'aria-label': 'Pick a colour' });
  const hex = input({ attrs: { class: 'input mono' } }), rgbI = input({ attrs: { class: 'input mono' } }), hsl = input({ attrs: { class: 'input mono' } }), ok = input({ attrs: { class: 'input mono' } });
  const swatch = h('div', { class: 'swatch' });
  const info = h('div', { class: 'kv' });
  const sync = (except?: HTMLInputElement) => {
    const [r, g, b] = rgb, hx = rgbToHex(r, g, b), [hh, s, l] = rgbToHsl(r, g, b), [L, C, H] = rgbToOklch(r, g, b);
    if (except !== hex) hex.value = hx;
    if (except !== rgbI) rgbI.value = `rgb(${rgb.map(Math.round).join(', ')})`;
    if (except !== hsl) hsl.value = `hsl(${Math.round(hh)} ${Math.round(s)}% ${Math.round(l)}%)`;
    if (except !== ok) ok.value = `oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})`;
    picker.value = hx; swatch.style.background = hx;
    clear(info).append(h('span', null, 'Contrast vs white'), h('span', null, `${contrastRatio(rgb, [255, 255, 255]).toFixed(2)} : 1`), h('span', null, 'Contrast vs black'), h('span', null, `${contrastRatio(rgb, [0, 0, 0]).toFixed(2)} : 1`));
  };
  const nums = (s: string) => (s.match(/-?\d*\.?\d+/g) || []).map(Number);
  picker.addEventListener('input', () => { rgb = hexToRgb(picker.value)!; sync(); });
  hex.addEventListener('input', () => { const v = hexToRgb(hex.value); hex.classList.toggle('bad', !v); if (v) { rgb = v; sync(hex); } });
  rgbI.addEventListener('input', () => { const v = nums(rgbI.value); if (v.length >= 3) { rgb = v.slice(0, 3).map((x) => clamp(x, 0, 255)); sync(rgbI); } });
  hsl.addEventListener('input', () => { const v = nums(hsl.value); if (v.length >= 3) { rgb = hslToRgb(v[0], v[1], v[2]); sync(hsl); } });
  ok.addEventListener('input', () => { const v = nums(ok.value); if (v.length >= 3) { rgb = oklchToRgb(v[0], v[1], v[2]); sync(ok); } });
  root.append(card(null, h('div', { class: 'color-top' }, swatch, picker)), card(null, h('div', { class: 'grid2' }, field('HEX', hex), field('RGB', rgbI), field('HSL', hsl), field('OKLCH', ok))), card('Accessibility', info));
  sync();
};

// ================================================================== JWT (Software)
export const jwt: Mount = (root) => {
  const sample = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlN1cGVyVG9vbHMiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTgwMDAwMDAwMH0.signature';
  const ta = textarea({ rows: 5, mono: true, value: sample });
  const out = h('div', { class: 'stack' });
  const run = () => {
    clear(out);
    const parts = ta.value.trim().split('.');
    if (parts.length < 2) { out.append(note('A JWT has three dot-separated parts.', 'warn')); return; }
    try {
      const dec = (s: string) => JSON.parse(new TextDecoder().decode(fromB64(s)));
      const header = dec(parts[0]), payload = dec(parts[1]);
      const hb = outputBox({ rows: 5, mono: true }); hb.value = JSON.stringify(header, null, 2);
      const pb = outputBox({ rows: 10, mono: true }); pb.value = JSON.stringify(payload, null, 2);
      const times = ['iat', 'nbf', 'exp'].filter((k) => typeof payload[k] === 'number').flatMap((k) => [h('span', null, k), h('span', null, `${new Date(payload[k] * 1000).toLocaleString('en-IN')}`)]);
      const expired = typeof payload.exp === 'number' && payload.exp * 1000 < Date.now(), early = typeof payload.nbf === 'number' && payload.nbf * 1000 > Date.now();
      out.append(card('Header', hb), card('Payload', pb, times.length ? h('div', { class: 'kv' }, times) : null),
        typeof payload.exp === 'number' ? note(expired ? 'This token has EXPIRED.' : 'Token is not expired.', expired ? 'err' : 'ok') : null as any,
        early ? note('This token is NOT VALID YET (its "nbf" time is in the future).', 'warn') : null as any,
        note('Decoded only — the signature is NOT verified (that needs the secret or public key).', 'warn'));
    } catch { out.append(note('Could not decode — not a valid JWT.', 'err')); }
  };
  ta.addEventListener('input', run);
  root.append(card(null, field('JWT', ta)), out);
  run();
};
void select; void row;
