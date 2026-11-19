// Text tools + the JSON formatter and the regex tester (the other small developer tabs are in software/dev1.ts).
// Unicode-aware work (segmentation, case mapping, collation, regex, JSON) uses the browser's native engines;
// algorithmic work (diff) runs in textcore.wasm.
import { h, card, field, input, textarea, button, segmented, toggle, select, clear, stack, row, note, copy, outputBox, downloadBlob, slider, type Mount } from '../ui';
import { textcore, type DiffOp } from '../wasm/textcore';
import { textkit, type Textkit } from '../wasm/textkit';
import { textStats, timeText, EMPTY, READING_WPM, SPEAKING_WPM, type TextStats } from '../lib/wordcount';
import { roundDec } from '../lib/round';
import { CASE_NAMES, CASE_HINTS, SHOWN, shownPart } from '../lib/caseconv';
import { processLines, summary, type LineOptions, type LineDeps, type SortMode } from '../lib/linetools';
import { sodium } from '../wasm/crypto';
import { devcore, type Devcore } from '../wasm/devcore';
import { trackWorker, releaseNow } from '../lifecycle';
import type { RegexReq, RegexRes } from '../workers/regex.worker';

const fmt = (n: number) => n.toLocaleString('en-IN');

// ================================================================== Word counter
// Counting is textkit.wasm's (Unicode's segmentation rules + the rules of src/lib/wordcount.ts); the engine is fetched
// with the first text, not when the tab opens.
export const wordcount: Mount = (root) => {
  const ta = textarea({ rows: 10, placeholder: 'Type or paste text…' }); ta.setAttribute('aria-label', 'Text to count');
  const big = h('div', { class: 'big-results' });
  const more = h('div', { class: 'kv' });
  const kw = h('div', { class: 'chips' });
  const problem = h('div', { class: 'stack' });
  let kit: Textkit | null = null, loading: Promise<void> | null = null, timer = 0, gone = false;
  const show = (s: TextStats) => {
    const tile = (l: string, v: string, plain = v) => h('button', { class: 'big-result', type: 'button', title: 'Copy', onclick: () => { if (plain !== '—') copy(plain); } }, h('span', { class: 'big-label' }, l), h('span', { class: 'big-value' }, v));
    clear(big).append(tile('Words', fmt(s.words), String(s.words)), tile('Characters', fmt(s.chars), String(s.chars)), tile('Sentences', fmt(s.sentences), String(s.sentences)), tile('Reading time', timeText(s.words, READING_WPM)));
    clear(more).append(...([['Characters (no spaces)', fmt(s.noSpace)], ['Paragraphs', fmt(s.paragraphs)], ['Lines', fmt(s.lines)], ['Avg word length', s.words ? roundDec(s.avgWord, 1).toFixed(1) : '—'], ['Speaking time', timeText(s.words, SPEAKING_WPM)]] as Array<[string, string]>).flatMap(([l, v]) => [h('span', null, l), h('span', null, v)]));
    clear(kw).append(...(s.top.length ? s.top.map(([w, n]) => h('span', { class: 'chip' }, `${w} · ${fmt(n)}`)) : [h('span', { class: 'muted small' }, s.words ? 'No word is used more than once.' : 'The words used most often will be listed here.')]));
  };
  const count = async () => {
    if (!ta.value) return show(EMPTY);
    try {
      if (!kit) { await (loading ||= textkit().then((k) => { kit = k; })); if (gone) return; }
      clear(problem);
      show(textStats(ta.value, kit!)); // the text as it is now: it may have changed while the engine was on its way
    } catch (e: any) { loading = null; clear(problem).append(note(`The counter could not be loaded — ${e?.message || e}. Type again to retry.`, 'err')); }
  };
  // a book-length text is counted when the typing pauses, so that each keystroke stays quick
  ta.addEventListener('input', () => { clearTimeout(timer); if (ta.value.length > 200_000) timer = window.setTimeout(count, 250); else void count(); });
  root.append(card(null, ta, problem), card('Counts', big, more,
    h('details', { class: 'mt' }, h('summary', null, 'How these are counted'), h('ul', { class: 'muted small' },
      h('li', null, 'A word is what stands between two spaces and holds a letter or a digit, as Microsoft Word counts: "don’t", "e-mail", "U.S.A.", "km/h", "9:30", "10/11/2026" and a web address are one word each. A dash or an ellipsis between two words separates them ("stop—go" is two). In Chinese and Japanese every character is a word.'),
      h('li', null, 'A character: what a reader sees as one — an emoji with its skin tone, or a letter with its accents and vowel signs, is one. Line breaks count as characters, but not among "no spaces".'),
      h('li', null, 'A sentence ends at . ? ! । or at the end of a line; not after "Dr.", "Mr.", "Rs. 500", "e.g." or an initial like "A. R. Rahman".'),
      h('li', null, 'Paragraphs are separated by blank lines; in a text without any blank line, every line is a paragraph.'),
      h('li', null, `Reading time at ${READING_WPM} words a minute, speaking time at ${SPEAKING_WPM}.`)))),
    card('Top keywords', kw));
  show(EMPTY);
  return () => { gone = true; clearTimeout(timer); };
};

// ================================================================== Case converter
// The conversions are textkit.wasm's (wasm/textkit/src/case.rs); this builds the rows.
export const caseConv: Mount = (root) => {
  const ta = textarea({ rows: 6, value: 'The quick brown fox jumps over the lazy dog', placeholder: 'Text…' }); ta.setAttribute('aria-label', 'Text to convert');
  const values: string[] = CASE_NAMES.map(() => '');
  const codes = CASE_NAMES.map(() => h('code', { class: 'case-val' }));
  const problem = h('div', { class: 'stack' }), cutNote = h('p', { class: 'muted small', hidden: true }, `Long results are shown up to their first ${SHOWN.toLocaleString('en-IN')} characters — Copy gives all of it.`);
  const list = h('div', { class: 'stack' }, CASE_NAMES.map((name, i) => h('div', { class: 'case-row', title: CASE_HINTS[name] }, h('span', { class: 'case-name' }, name), codes[i],
    button('', () => { if (values[i]) copy(values[i]); }, { icon: 'Copy', small: true, variant: 'ghost', title: `Copy ${name}` }))));
  let kit: Textkit | null = null, timer = 0, gone = false;
  const show = (vals: string[]) => { vals.forEach((v, i) => { values[i] = v; codes[i].textContent = shownPart(v); }); cutNote.hidden = !vals.some((v) => v.length > SHOWN); };
  const run = async () => {
    if (!ta.value) return show(CASE_NAMES.map(() => ''));
    try {
      if (!kit) { kit = await textkit(); if (gone) return; }
      clear(problem);
      show(kit.cases(ta.value)); // the text as it is now
    } catch (e: any) { clear(problem).append(note(`The converter could not be loaded — ${e?.message || e}. Type again to retry.`, 'err')); }
  };
  // a very long text is converted when the typing pauses
  ta.addEventListener('input', () => { clearTimeout(timer); if (ta.value.length > 200_000) timer = window.setTimeout(run, 250); else void run(); });
  root.append(card(null, ta, problem), card('Conversions', list, cutNote));
  void run();
  return () => { gone = true; clearTimeout(timer); };
};

// ================================================================== Line tools
// The work on the lines is src/lib/linetools.ts; sorting compares with the browser's collator. The two engines are
// fetched when their option is chosen: crypto.wasm for Shuffle, textkit.wasm for By length.
export const lines: Mount = (root) => {
  const ta = textarea({ rows: 10, value: 'banana\napple\n  cherry  \napple\n\nBanana\n10\n9', mono: true });
  const out = outputBox({ rows: 10, mono: true });
  const o: LineOptions = { trim: true, empty: true, dedupe: true, ci: false, sort: 'az', reverse: false, number: false, prefix: '', suffix: '' };
  const info = h('div', { class: 'muted small' }), problem = h('div', { class: 'stack' });
  let na: Awaited<ReturnType<typeof sodium>> | null = null, kit: Textkit | null = null, gone = false, timer = 0;
  // the order of the last shuffle: it stays while only other options change (a prefix typed letter by letter used to
  // shuffle the list anew at every key)
  let shuffled: { of: string; order: Uint32Array } | null = null;
  const deps: LineDeps = {
    shuffle: (ls) => { const of = ls.join('\n'); if (!shuffled || shuffled.of !== of || shuffled.order.length !== ls.length) shuffled = { of, order: na!.permutation(ls.length) }; return Array.from(shuffled.order, (i) => ls[i]); },
    lengths: (ls) => kit!.lineLengths(ls),
  };
  const again = button('Shuffle again', () => { shuffled = null; void run(); }, { small: true });
  const run = async () => {
    again.hidden = o.sort !== 'shuffle';
    try {
      if (o.sort === 'shuffle' && !na) na = await sodium();
      if (o.sort === 'len' && !kit) kit = await textkit();
      if (gone) return;
      const r = processLines(ta.value, o, deps); // the text and the options as they are now
      out.value = r.lines.join('\n'); info.textContent = summary(r); clear(problem);
    } catch (e: any) { clear(problem).append(note(`This option could not be loaded — ${e?.message || e}. Choose it again to retry.`, 'err')); }
  };
  const set = <K extends keyof LineOptions>(k: K) => (v: LineOptions[K]) => { o[k] = v; void run(); };
  // a very long list is worked on when the typing pauses
  ta.addEventListener('input', () => { clearTimeout(timer); if (ta.value.length > 200_000) timer = window.setTimeout(run, 250); else void run(); });
  root.append(card(null, field('Input', ta)), card('Options', stack(
    h('div', { class: 'grid2' }, toggle('Trim spaces', o.trim, set('trim')), toggle('Remove empty lines', o.empty, set('empty')),
      toggle('Remove duplicates', o.dedupe, set('dedupe')), toggle('…ignoring case', o.ci, set('ci')),
      toggle('Reverse order', o.reverse, set('reverse')), toggle('Number lines', o.number, set('number'))),
    field('Sort', segmented<SortMode>([['none', 'Keep order'], ['az', 'A → Z'], ['za', 'Z → A'], ['num', '0 → 9'], ['len', 'By length'], ['shuffle', 'Shuffle']], o.sort, (v) => { if (v === 'shuffle') shuffled = null; o.sort = v; void run(); }),
      'A → Z sorts as a dictionary does, with "item 2" before "item 10". 0 → 9 sorts by the number a line begins with (−3, 1.5, 1,20,000, ₹ 500); lines without one come last.'),
    again,
    h('div', { class: 'grid2' }, field('Add prefix', input({ onInput: set('prefix') })), field('Add suffix', input({ onInput: set('suffix') }))), problem)),
  card('Output', out, info));
  void run();
  return () => { gone = true; clearTimeout(timer); };
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
