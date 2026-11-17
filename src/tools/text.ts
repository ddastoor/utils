// Text tools + the JSON formatter and the regex tester (the other small developer tabs are in software/dev1.ts).
// Unicode-aware work (segmentation, case mapping, collation, regex, JSON) uses the browser's native engines;
// algorithmic work (diff) runs in textcore.wasm.
import { h, card, field, input, textarea, button, segmented, toggle, select, clear, stack, row, note, copy, outputBox, downloadBlob, slider, type Mount } from '../ui';
import { textcore, type DiffOp, type bindTextcore } from '../wasm/textcore';
import { sodium } from '../wasm/crypto';
import { devcore, type Devcore } from '../wasm/devcore';
import { trackWorker, releaseNow } from '../lifecycle';
import type { RegexReq, RegexRes } from '../workers/regex.worker';

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
/** One JSON problem from the formatter engine ({ message, line, column, pos }), as a sentence. */
export function jsonProblem(e: any): { text: string; pos: number | null } {
  try { const m = JSON.parse(String(e?.message ?? e)); if (m && typeof m.message === 'string') return { text: `${m.message} — line ${m.line}, column ${m.column}`, pos: m.pos }; } catch { /* not from the engine */ }
  return { text: String(e?.message ?? e), pos: null };
}
interface JsonFmt { out: string; values: number; objects: number; arrays: number; keys: number; depth: number; duplicates: Array<{ key: string; line: number }> }
export const json: Mount = (root) => {
  const ta = textarea({ rows: 12, mono: true, value: '{"name":"SuperTools","tools":173,"tags":["private","wasm"],"nested":{"b":2,"a":1}}' });
  const out = outputBox({ rows: 14, mono: true });
  const status = h('div');
  let indent = '2', sorted = false, mini = false, dc: Devcore | null = null, seq = 0;
  // The formatter is our Rust engine: it changes white space only. (JSON.parse → JSON.stringify moved keys such as
  // "2" and "10" to the front of their object, dropped duplicate keys and rewrote numbers like 1.0 or 1e5.)
  const run = async () => {
    const id = ++seq; dc ||= await devcore('json'); if (id !== seq) return;
    clear(status);
    try {
      const r = dc.bytesJson<JsonFmt>(`jsonfmt:${mini ? 0 : indent === 'tab' ? -1 : +indent}:${sorted ? 1 : 0}`, new TextEncoder().encode(ta.value));
      out.value = r.out;
      const n = (k: number, w: string) => `${k.toLocaleString('en-IN')} ${w}${k === 1 ? '' : 's'}`;
      status.append(note(`Valid JSON · ${n(r.out.length, 'character')}${r.objects + r.arrays ? ` · ${n(r.keys, 'key')} in ${n(r.objects, 'object')}, ${n(r.arrays, 'array')}, ${n(r.depth, 'level')} deep` : ''}`, 'ok'));
      if (r.duplicates.length) status.append(note(`${n(r.duplicates.length, 'duplicate key')}: ${r.duplicates.slice(0, 5).map((d) => `${JSON.stringify(d.key)} (line ${d.line})`).join(', ')}${r.duplicates.length > 5 ? ' …' : ''}. They are kept as written, but most programs read only the last one.`, 'warn'));
    } catch (e: any) {
      out.value = ''; // no old result under an error
      const pr = jsonProblem(e);
      status.append(note(h('span', null, pr.text, pr.pos === null ? '' : [' ', h('button', { type: 'button', class: 'link-btn', onclick: () => { ta.focus(); ta.setSelectionRange(pr.pos!, Math.min(ta.value.length, pr.pos! + 1)); } }, 'Show it')]), 'err'));
    }
  };
  ta.addEventListener('input', () => { void run(); });
  root.append(card(null, stack(field('JSON', ta), h('div', { class: 'row' }, segmented([['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tabs']], indent, (v) => { indent = v; mini = false; void run(); }), toggle('Sort keys', false, (v) => { sorted = v; void run(); })))), status, card('Output', out),
    h('div', { class: 'actions' }, button('Format', () => { mini = false; return run(); }, { variant: 'primary', icon: 'Braces' }), button('Minify', () => { mini = true; return run(); }, { icon: 'Minimize2' }),
      button('Download', () => { if (!out.value) throw new Error('Nothing to save — fix the JSON first'); downloadBlob(new Blob([out.value], { type: 'application/json' }), 'data.json'); }, { icon: 'Download' })));
  void run();
};

// ================================================================== Regex tester (Software)
/** Why a flags text is not usable, or null. (The browser's own message for a bad flag names neither the flag nor the rule.) */
export function flagsError(f: string): string | null {
  const bad = [...f].find((c) => !'dgimsuvy'.includes(c));
  if (bad) return `“${bad}” is not a flag. The flags are g i m s u v y d.`;
  const twice = [...f].find((c, i) => f.indexOf(c) !== i);
  if (twice) return `Flag ${twice} is given twice.`;
  if (f.includes('u') && f.includes('v')) return 'Flags u and v cannot be used together (v includes u).';
  return null;
}
/** The names of the capture groups of `pattern`, by group number (index 0 = group 1); '' for an unnamed group. */
export function groupNames(pattern: string): string[] {
  const out: string[] = []; let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c !== '(') continue;
    if (pattern[i + 1] !== '?') { out.push(''); continue; }
    const m = /^\(\?<([^>=!][^>]*)>/.exec(pattern.slice(i));
    if (m) out.push(m[1]);
  }
  return out;
}
/** How long one run may take before the worker is ended (a pattern that backtracks without end never finishes). */
const REGEX_LIMIT_MS = 2000;
export const regex: Mount = (root) => {
  const pat = input({ value: '(\\d{3})-(\\d{4})', attrs: { spellcheck: 'false', class: 'input mono', 'aria-label': 'Pattern' } });
  const flags = input({ value: 'g', attrs: { spellcheck: 'false', class: 'input mono', 'aria-label': 'Flags' } });
  const text = textarea({ rows: 6, value: 'Call 555-1234 or 555-9876 today.' });
  const rep = input({ placeholder: 'Replacement (optional, $1 for groups)', attrs: { spellcheck: 'false', 'aria-label': 'Replacement' } });
  const hl = h('div', { class: 'regex-hl' });
  const groups = h('div');
  const repOut = outputBox({ rows: 4 });
  let worker: Worker | null = null, seq = 0, timer = 0;
  const stop = () => { clearTimeout(timer); if (worker) { releaseNow('regex'); worker = null; } };
  const show = (r: RegexRes, s: string) => {
    clear(groups); clear(hl);
    if (r.error) { groups.append(note(r.error, 'err')); hl.textContent = s; repOut.value = ''; return; }
    const ms = r.matches!, total = r.total!;
    let last = 0;
    for (const m of ms) { hl.append(s.slice(last, m.index), h('mark', { class: m.text ? null : 'empty' }, m.text || '∅')); last = m.index + m.text.length; }
    hl.append(s.slice(last));
    groups.append(note(`${total.toLocaleString('en-US')}${total >= 1000000 ? '+' : ''} match${total === 1 ? '' : 'es'}${total > ms.length ? ` (first ${ms.length.toLocaleString('en-US')} highlighted, ${Math.min(200, ms.length)} in the table)` : ms.length > 200 ? ' (first 200 in the table)' : ''}`, total ? 'ok' : 'info'));
    const ng = Math.max(0, ...ms.map((m) => m.groups.length)), names = groupNames(pat.value);
    if (ms.length) groups.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Match'), h('th', null, 'Index'), ...Array.from({ length: ng }, (_, i) => h('th', null, `$${i + 1}${names[i] ? ` ${names[i]}` : ''}`)))),
      h('tbody', null, ms.slice(0, 200).map((m, i) => h('tr', null, h('td', null, String(i + 1)), h('td', { class: 'mono' }, m.text), h('td', null, String(m.index)), ...Array.from({ length: ng }, (_, j) => h('td', { class: 'mono' }, m.groups[j] ?? '—'))))))));
    repOut.value = r.replaced ?? '';
  };
  const run = () => {
    const fe = flagsError(flags.value); flags.classList.toggle('bad', !!fe);
    let pe: string | null = null;
    if (!fe) { try { new RegExp(pat.value, flags.value); } catch (e: any) { pe = String(e.message).replace(/^Invalid regular expression: /, ''); } }
    pat.classList.toggle('bad', !!pe);
    if (fe || pe) { stop(); seq++; show({ id: 0, error: fe || pe! }, text.value); return; }
    const id = ++seq, s = text.value;
    if (!worker) {
      worker = trackWorker(new Worker(new URL('../workers/regex.worker.ts', import.meta.url), { type: 'module' }), 'regex', () => { worker = null; });
      worker.onmessage = (ev: MessageEvent<RegexRes>) => { if (ev.data.id !== seq) return; clearTimeout(timer); show(ev.data, text.value); };
    }
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (id !== seq) return;
      stop();
      show({ id, error: `Stopped after ${REGEX_LIMIT_MS / 1000} seconds: this pattern takes too long on this text. Nested repeats such as (a+)+ or (.*)* make the engine try a huge number of ways to match — rewrite the pattern without them.` }, s);
    }, REGEX_LIMIT_MS);
    worker.postMessage({ id, pattern: pat.value, flags: flags.value, text: s, replacement: rep.value ? rep.value : null } satisfies RegexReq);
  };
  let deb = 0; const runD = () => { clearTimeout(deb); deb = window.setTimeout(run, 60); };
  [pat, flags, text, rep].forEach((x) => x.addEventListener('input', runD));
  root.append(card(null, stack(h('div', { class: 'regex-row' }, field('Pattern', pat), field('Flags', flags)), field('Test text', text))), card('Matches', hl, groups), card('Replace', rep, repOut),
    note('Uses the browser\'s JavaScript (ECMAScript) regex engine, run off the page so a runaway pattern cannot freeze it. Flags: g i m s u v y d. Without g, Replace changes only the first match.'));
  run();
  return () => { clearTimeout(timer); clearTimeout(deb); };
};
void select; void row;
