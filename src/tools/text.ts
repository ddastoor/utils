// Text tools + the JSON formatter and the regex tester (the other small developer tabs are in software/dev1.ts).
// Counting, case conversion and comparing are textkit.wasm's and textkit-diff.wasm's (wasm/textkit); sorting and
// regular expressions are the browser's own (Intl.Collator, RegExp); each tab's rules are in src/lib/.
import { h, card, field, input, textarea, button, segmented, toggle, select, clear, stack, row, note, copy, outputBox, downloadBlob, slider, type Mount } from '../ui';
import { textkit, type Textkit } from '../wasm/textkit';
import type { bindTextcore } from '../wasm/textcore';
type Textcore = ReturnType<typeof bindTextcore>;
import { textStats, timeText, EMPTY, READING_WPM, SPEAKING_WPM, type TextStats } from '../lib/wordcount';
import { roundDec } from '../lib/round';
import { CASE_NAMES, CASE_HINTS, SHOWN, shownPart } from '../lib/caseconv';
import { processLines, summary, type LineOptions, type LineDeps, type SortMode } from '../lib/linetools';
import { plan, countText, type FindOptions, type Plan } from '../lib/findreplace';
import { textdiff, type Textdiff, type DiffRow, type LineDiff, type SpanDiff } from '../wasm/textdiff';
import { foldRows, lineSummary, spanSummary, APPROX, MAX_ROWS, MAX_SPAN_CHARS } from '../lib/textdiff';
import * as M from '../lib/morse';
import { LIMITS, readCount, asText, summary as loremSummary, newSeed } from '../lib/lorem';
import { loremEngine, type LoremUnit, type LoremEngine } from '../wasm/lorem';
import { FANCY, FANCY_SHOWN, BY_CHARACTER, needsEngine, plainClusters, fancyRow, type Split } from '../lib/fancy';
import { sodium } from '../wasm/crypto';
import { devcore, type Devcore } from '../wasm/devcore';
import { trackWorker, releaseNow } from '../lifecycle';
import type { RegexReq, RegexRes } from '../workers/regex.worker';
import { FLAVOURS, flavour, flagsError as flavourFlagsError, type FlavourId } from '../lib/regex/flavours';

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
// What is searched for is src/lib/findreplace.ts; the search runs in the regex worker (the browser's RegExp, off the
// page), ended after REPLACE_LIMIT_MS so that a runaway pattern cannot freeze the tab.
const REPLACE_LIMIT_MS = 5000;
export const replace: Mount = (root) => {
  const ta = textarea({ rows: 8, value: 'Colour and flavour, colour again.' });
  const find = input({ value: 'colour', attrs: { spellcheck: 'false' } }), rep = input({ value: 'color', attrs: { spellcheck: 'false' } });
  const o: FindOptions = { regex: false, cs: false, word: false };
  const out = outputBox({ rows: 8 });
  const info = h('div', { class: 'muted small' }), problem = h('div', { class: 'stack' });
  let worker: Worker | null = null, seq = 0, timer = 0, deb = 0, current: Plan | null = null;
  const stop = () => { clearTimeout(timer); if (worker) { releaseNow('replace'); worker = null; } };
  const fail = (text: string) => { find.classList.add('bad'); out.value = ta.value; info.textContent = ''; clear(problem).append(note(text, 'err')); };
  const run = () => {
    const id = ++seq, text = ta.value;
    clearTimeout(timer);
    if (!find.value) { stop(); find.classList.remove('bad'); clear(problem); out.value = text; info.textContent = ''; return; }
    let p: Plan;
    try { p = current = plan(find.value, rep.value, o); } catch (e: any) { stop(); return fail(e.message); }
    if (!worker) {
      worker = trackWorker(new Worker(new URL('../workers/regex.worker.ts', import.meta.url), { type: 'module' }), 'replace', () => { worker = null; });
      worker.onmessage = (ev: MessageEvent<RegexRes>) => {
        if (ev.data.id !== seq || ev.data.phase) return; // an answer to an earlier text, or only "started"
        clearTimeout(timer);
        if (ev.data.error) return fail(`The search could not be run: ${ev.data.error}`);
        find.classList.remove('bad'); clear(problem);
        out.value = ev.data.replaced ?? ''; info.textContent = countText(ev.data.total ?? 0);
        if (current?.loose) problem.append(note('This pattern is valid only in JavaScript\'s older (non-Unicode) mode — an escape such as \\- or a lone brace — and was run that way.', 'info'));
      };
    }
    timer = window.setTimeout(() => {
      if (id !== seq) return;
      stop();
      fail(`Stopped after ${REPLACE_LIMIT_MS / 1000} seconds: this pattern takes too long on this text. Nested repeats such as (a+)+ or (.*)* make the engine try a huge number of ways to match — rewrite the pattern without them.`);
    }, REPLACE_LIMIT_MS);
    worker.postMessage({ id, flavour: 'js', pattern: p.pattern, flags: p.flags, text, replacement: p.replacement, all: true } satisfies RegexReq);
  };
  const runSoon = () => { clearTimeout(deb); deb = window.setTimeout(run, ta.value.length > 200_000 ? 250 : 30); };
  [ta, find, rep].forEach((x) => x.addEventListener('input', runSoon));
  const set = (k: keyof FindOptions) => (v: boolean) => { o[k] = v; run(); };
  root.append(card(null, stack(field('Text', ta), h('div', { class: 'grid2' }, field('Find', find), field('Replace with', rep)),
    h('div', { class: 'row' }, toggle('Regular expression', false, set('regex')), toggle('Case sensitive', false, set('cs')), toggle('Whole words', false, set('word'))),
    h('details', null, h('summary', null, 'With a regular expression'), h('ul', { class: 'muted small' },
      h('li', null, 'The patterns are JavaScript\'s, the same as in the Regex Tester tab.'),
      h('li', null, 'In "Replace with": $1, $2 … stand for the groups, $<name> for a named group, $& or $0 for the whole match; \\n makes a line break, \\t a tab.'),
      h('li', null, '^ and $ match at the start and the end of every line.'),
      h('li', null, 'Without a regular expression, every character in both boxes stands for itself.'))))),
  card('Result', out, info, problem));
  run();
  return () => { clearTimeout(timer); clearTimeout(deb); };
};

// ================================================================== Diff
// The comparing is textkit-diff.wasm's (the `similar` crate: Myers' algorithm with a time limit); src/lib/textdiff.ts
// folds long unchanged runs and words the summary; this draws.
export const diff: Mount = (root) => {
  const A = textarea({ rows: 8, mono: true, value: 'apple\nbanana\ncherry\ndate' }), B = textarea({ rows: 8, mono: true, value: 'apple\nblueberry\ncherry\ndate\nelderberry' });
  let mode: 'lines' | 'words' | 'chars' = 'lines';
  const out = h('div', { class: 'diff-out' }), info = h('div', { class: 'muted small' }), problem = h('div', { class: 'stack' });
  let engine: Textdiff | null = null, gone = false, timer = 0, patch = '';
  const copyBtn = button('Copy as patch', () => { if (patch) copy(patch); }, { small: true, icon: 'Copy' });
  const saveBtn = button('Download .diff', () => { if (patch) downloadBlob(new Blob([patch], { type: 'text/x-diff' }), 'changes.diff'); }, { small: true, icon: 'Download' });
  const actions = h('div', { class: 'row' }, copyBtn, saveBtn);
  const lineRow = ([kind, a, b, parts]: DiffRow) => {
    const partly = parts.some(([m]) => m) && parts.some(([m]) => !m); // a line that changed in part: mark the part
    return h('div', { class: `dl dl-${kind === 2 ? 'ins' : kind === 1 ? 'del' : 'eq'}` }, h('span', { class: 'dl-no' }, a ? String(a) : ''), h('span', { class: 'dl-no' }, b ? String(b) : ''),
      h('span', { class: 'dl-sign' }, kind === 2 ? '+' : kind === 1 ? '−' : ' '), h('span', { class: 'dl-text' }, parts.length ? parts.map(([m, t]) => (m && partly ? h('mark', null, t) : t)) : ' '));
  };
  const showLines = (d: LineDiff) => {
    const wrap = h('div', { class: 'dl-wrap' }); let budget = MAX_ROWS, cut = false;
    for (const block of foldRows(d.rows)) {
      if (budget <= 0) { cut = true; break; }
      if (block.fold) {
        const rows = block.rows, fold = h('button', { type: 'button', class: 'dl-fold' }, `⋯ ${rows.length.toLocaleString('en-IN')} unchanged lines — show`);
        fold.onclick = () => fold.replaceWith(...rows.slice(0, MAX_ROWS).map(lineRow), ...(rows.length > MAX_ROWS ? [h('div', { class: 'dl dl-eq' }, h('span', { class: 'dl-text muted' }, `… and ${(rows.length - MAX_ROWS).toLocaleString('en-IN')} more unchanged lines`))] : []));
        wrap.append(fold);
      } else { wrap.append(...block.rows.slice(0, budget).map(lineRow)); if (block.rows.length > budget) cut = true; budget -= block.rows.length; }
    }
    clear(out).append(wrap);
    if (cut) out.append(note(`The first ${MAX_ROWS.toLocaleString('en-IN')} lines of the differences are shown. The patch holds all of them.`, 'info'));
    info.textContent = lineSummary(d); patch = d.unified; actions.hidden = !patch;
  };
  const showSpans = (d: SpanDiff) => {
    let left = MAX_SPAN_CHARS, cut = false; const els: Node[] = [];
    for (const [kind, text] of d.spans) { if (left <= 0) { cut = true; break; } els.push(h('span', { class: `dw dw-${kind === 2 ? 'ins' : kind === 1 ? 'del' : 'eq'}` }, text.length > left ? text.slice(0, left) : text)); left -= text.length; }
    clear(out).append(h('div', { class: 'dw-wrap' }, els));
    if (cut) out.append(note(`The first ${MAX_SPAN_CHARS.toLocaleString('en-IN')} characters are shown.`, 'info'));
    info.textContent = spanSummary(d); patch = ''; actions.hidden = true;
  };
  const run = async () => {
    try {
      if (!engine) { engine = await textdiff(); if (gone) return; }
      clear(problem);
      const d = mode === 'lines' ? engine.diff(A.value, B.value, 0) : engine.diff(A.value, B.value, mode === 'words' ? 1 : 2); // the texts as they are now
      if (d.mode === 0) showLines(d); else showSpans(d);
      if (d.approx) problem.append(note(APPROX, 'warn'));
    } catch (e: any) { clear(problem).append(note(`The comparison could not be loaded — ${e?.message || e}. Type again to retry.`, 'err')); }
  };
  // longer texts are compared when the typing pauses (comparing and drawing 8,000 lines at every key made typing sluggish)
  const soon = () => { clearTimeout(timer); if (A.value.length + B.value.length > 20_000) timer = window.setTimeout(run, 200); else void run(); };
  [A, B].forEach((x) => x.addEventListener('input', soon));
  actions.hidden = true;
  root.append(card(null, stack(h('div', { class: 'grid2' }, field('Original', A), field('Changed', B)), segmented([['lines', 'Lines'], ['words', 'Words'], ['chars', 'Characters']], mode, (v) => { mode = v; void run(); }))),
    card('Differences', info, problem, out, actions));
  void run();
  return () => { gone = true; clearTimeout(timer); };
};

// ================================================================== Fancy text
// The styles are tables (src/lib/fancy.ts); this lists them. Three styles work character by character (a mark under
// every character, the text turned upside down): the characters of a text with emoji or another script than Latin
// are told apart by textkit.wasm, fetched with the first such text.
export const fancy: Mount = (root) => {
  const inp = textarea({ rows: 2, value: 'SuperUtils', placeholder: 'Type something…' }); inp.setAttribute('aria-label', 'Text to style');
  const cells = FANCY.map(() => h('span', { class: 'case-val fancy-val' }));
  /** the splitter for the text in the box: null while the engine it needs is not there */
  let split: Split | null = plainClusters, kit: Split | null = null, seq = 0, gone = false;
  const styled = (i: number): string => { const [name, f] = FANCY[i]; return inp.value && (split || !BY_CHARACTER.has(name)) ? f(inp.value, split ?? plainClusters) : ''; };
  const copyRow = (i: number) => { const v = styled(i); if (v) copy(v); };
  // a tap anywhere on a row copies it; the button says which style it copies
  const list = h('div', { class: 'stack' }, FANCY.map(([name], i) => { const row = h('div', { class: 'case-row fancy-row', title: `Copy ${name}` }, h('span', { class: 'case-name' }, name), cells[i], button('', (e) => { e.stopPropagation(); copyRow(i); }, { icon: 'Copy', small: true, variant: 'ghost', title: `Copy ${name}` })); row.onclick = () => copyRow(i); return row; }));
  const cutNote = h('p', { class: 'muted small', hidden: true }, `A long text is shown up to its first ${FANCY_SHOWN.toLocaleString('en-IN')} characters — Copy gives all of it.`);
  const problem = h('div', { class: 'stack' });
  // without the engine a long text is cut for the screen between two code points (what is copied is never cut)
  const draw = () => { const text = inp.value; FANCY.forEach(([name, f], i) => { cells[i].textContent = !split && BY_CHARACTER.has(name) ? '' : fancyRow(name, f, text, split ?? ((s) => Array.from(s))); }); cutNote.hidden = text.length <= FANCY_SHOWN; };
  const run = async () => {
    const my = ++seq;
    if (!needsEngine(inp.value)) { split = plainClusters; problem.replaceChildren(); draw(); return; }
    if (!kit) {
      split = null; draw(); // the table styles at once; the three others when the engine is there
      try { const k = await textkit(); kit = k.clusters; } catch {
        if (!gone && my === seq) problem.replaceChildren(note('The part that tells emoji and other scripts apart could not be loaded, so Upside down, Strikethrough and Underline are empty — check your connection. It is tried again with the next change.', 'warn'));
        return;
      }
      if (gone || my !== seq) return; // a newer text is on its way through here
    }
    split = kit; problem.replaceChildren(); draw();
  };
  inp.addEventListener('input', () => void run());
  root.append(card(null, inp), card('Styles — tap to copy', list, cutNote, problem), note('These are Unicode characters, so they paste anywhere (Instagram, WhatsApp, X). Screen readers may read them oddly, and a search will not find the words.'));
  void run();
  return () => { gone = true; };
};

// ================================================================== Emoji & symbols
// Data and search records: src/lib/emoji.ts (a chunk of its own, fetched with the tab); the ranking is textcore.wasm's
// (the engine of the tool search), fetched with the first search.
export const emoji: Mount = async (root) => {
  const [lib, support] = await Promise.all([import('../lib/emoji'), import('../lib/emoji-support')]);
  const { EMOJI, SYMBOLS, ALL, EMOJI_GROUPS, SYMBOL_GROUPS, TONES, withTone, describe, byCharacter, records, norm } = lib;
  type Item = (typeof ALL)[number];
  const MAX = 300; // results asked of the engine
  let kind: 'emoji' | 'symbols' = 'emoji', tone = 0, showAll = false, seq = 0, gone = false;
  let index: { tc: Textcore; handle: number } | null = null;
  // emoji newer than this device's font would be empty boxes: they are left out (and can be asked for)
  const missing = support.missingEmojiVersions();
  const tooNew = EMOJI.filter((it) => missing.has(it.version!)).length;
  const drawable = (it: Item) => showAll || it.kind !== 'emoji' || !missing.has(it.version!);

  const q = input({ placeholder: 'Search: heart, thanks, rupee, arrow…', attrs: { type: 'search', 'aria-label': 'Search emoji and symbols', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' } });
  const status = h('p', { class: 'muted small emoji-status', 'aria-live': 'polite' }, 'Tap a character to copy it.');
  const problem = h('div', { class: 'stack' }), body = h('div', { class: 'stack' });
  const pick = (it: Item) => { const ch = withTone(it, tone); void copy(ch); status.textContent = `Copied ${ch} — ${describe(it, tone)}`; };
  const cell = (it: Item) => { const d = describe(it, tone); return h('button', { class: 'emoji-cell', type: 'button', title: d, 'aria-label': d, onclick: () => pick(it) }, withTone(it, tone)); };
  const grid = (items: Item[]) => h('div', { class: 'emoji-grid' }, items.map(cell));

  // skin tone: a hand in each of the six
  const toneRow = h('div', { class: 'tone-row', role: 'radiogroup', 'aria-label': 'Skin tone' });
  const drawTones = () => toneRow.replaceChildren(h('span', { class: 'muted small' }, 'Skin tone'), ...TONES.map((name, i) => h('button', { type: 'button', role: 'radio', class: ['tone-btn', i === tone && 'on'], 'aria-checked': String(i === tone), 'aria-label': `Skin tone: ${name}`, title: name, onclick: () => { if (tone === i) return; tone = i; drawTones(); void find(); } }, i ? `\u270b${String.fromCodePoint(0x1f3fa + i)}` : '\u270b')));

  const browse = () => {
    const items = kind === 'emoji' ? EMOJI.filter(drawable) : SYMBOLS;
    body.replaceChildren(...(kind === 'emoji' ? EMOJI_GROUPS : SYMBOL_GROUPS).map((g) => card(g, grid(items.filter((it) => it.group === g)))));
    if (kind === 'emoji' && tooNew && !showAll) body.append(h('div', { class: 'row emoji-new' }, h('span', { class: 'muted small' }, `${tooNew} newer emoji that this device cannot draw yet are left out.`), button('Show them anyway', () => { showAll = true; void find(); }, { small: true, variant: 'ghost' })));
  };
  const load = async () => { const tc = await (await import('../wasm/textcore')).textcore(); return { tc, handle: tc.searchBuild(records()) }; };
  const find = async () => {
    const text = q.value.trim(), my = ++seq;
    toneRow.hidden = !text && kind === 'symbols';
    if (!text) { problem.replaceChildren(); browse(); return; }
    const exact = byCharacter(text), nq = norm(text);
    let ranked: Item[] = [];
    if (nq) {
      if (!index) {
        try { const made = await load(); if (gone) return; index ||= made; } catch {
          if (!gone && my === seq) problem.replaceChildren(note('The search could not be loaded — check your connection. It is tried again with the next key.', 'warn'));
          return;
        }
        if (my !== seq) return; // a newer search is on its way through here
      }
      ranked = index.tc.searchQuery(index.handle, nq, MAX).map((i) => ALL[i]);
    }
    problem.replaceChildren();
    const found = [...exact, ...ranked.filter((it) => !exact.includes(it))].filter(drawable);
    const part = (k: Item['kind'], title: string) => { const items = found.filter((it) => it.kind === k); return items.length ? [card(`${title} — ${items.length}${ranked.length === MAX ? '+' : ''}`, grid(items))] : []; };
    const cards = kind === 'emoji' ? [...part('emoji', 'Emoji'), ...part('symbol', 'Symbols')] : [...part('symbol', 'Symbols'), ...part('emoji', 'Emoji')];
    body.replaceChildren(...(cards.length ? cards : [note(`Nothing found for "${text}". Try another word — a feeling, a thing, a country, or what a sign is called.`)]));
  };
  q.addEventListener('input', () => void find());
  // Enter copies the best match
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && q.value.trim()) { e.preventDefault(); (body.querySelector('.emoji-cell') as HTMLButtonElement | null)?.click(); } });
  drawTones();
  root.append(card(null, stack(q, row(segmented([['emoji', 'Emoji'], ['symbols', 'Symbols']], kind, (v) => { kind = v; void find(); }), toneRow), status)), problem, body);
  void find();
  return () => { gone = true; try { index?.tc.searchFree(index.handle); } catch { /* the engine is gone already */ } };
};

// ================================================================== Morse
// The alphabet, both conversions and the timing of the tones: src/lib/morse.ts. The sound is the browser's Web Audio.
export const morse: Mount = (root) => {
  type Way = 'auto' | 'encode' | 'decode';
  let way: Way = 'auto', wpm = 18, pitch = 650, code = '';
  let ctx: AudioContext | null = null, osc: OscillatorNode | null = null, endTimer = 0;
  const inp = textarea({ rows: 4, value: 'SOS Help', placeholder: 'Text, or Morse code:  ... --- ...' }); inp.setAttribute('aria-label', 'Text or Morse code');
  // the result: a box of its own kind, so that a letter's dots and dashes are never broken over two lines
  const outText = h('div', { class: 'input textarea mono morse-out', role: 'textbox', 'aria-readonly': 'true', 'aria-multiline': 'true', 'aria-label': 'Morse code', tabindex: '0' });
  let shown = '';
  const out = h('div', { class: 'outbox' }, outText, button('', () => { if (shown) void copy(shown); }, { icon: 'Copy', small: true, title: 'Copy' }));
  const cutNote = h('p', { class: 'muted small', hidden: true });
  /** A long result: its first SHOW_MAX characters (cut between two letter groups), Copy gives all of it. */
  const show = (text: string, isCode: boolean) => {
    shown = text;
    let part = text;
    if (text.length > M.SHOW_MAX) { part = text.slice(0, M.SHOW_MAX); const gap = Math.max(part.lastIndexOf(' '), part.lastIndexOf('\n')); if (isCode && gap > 0) part = part.slice(0, gap + 1); }
    const frag = document.createDocumentFragment(); // appended one by one: a spread of 500,000 groups overflowed the stack
    if (isCode) { for (const p of part.split(/([ \n])/)) if (p) frag.append(p === ' ' || p === '\n' ? p : h('span', { class: 'nb' }, p)); } else frag.append(part);
    if (part.length < text.length) frag.append(/\s$/.test(part) ? '…' : ' …');
    outText.replaceChildren(frag);
    cutNote.hidden = part.length === text.length;
    cutNote.textContent = cutNote.hidden ? '' : `The first ${part.length.toLocaleString('en-IN')} of ${text.length.toLocaleString('en-IN')} characters are shown — Copy gives all of it.`;
  };
  const outField = field('Morse code', out), notes = h('div', { class: 'stack' }), lengthLine = h('p', { class: 'muted small morse-length' });
  /** the result is Morse code or text: its box says which */
  const nameOut = (name: string) => { outField.querySelector('.field-label')!.textContent = name; outField.setAttribute('aria-label', name); outText.setAttribute('aria-label', name); };
  const list = (items: string[]) => items.slice(0, 12).join('  ') + (items.length > 12 ? ` … (${items.length} in all)` : '');
  const showLength = () => { const s = M.schedule(code, wpm, 0); lengthLine.textContent = s.total ? `${M.lengthText(s.total)} of sound at ${wpm} words a minute.${s.total > M.PLAY_MAX ? ' Play gives the first hour.' : ''}` : ''; playBtn.disabled = !s.total; };
  const run = () => {
    stop();
    const text = inp.value, decoding = way === 'decode' || (way === 'auto' && M.isMorse(text));
    notes.replaceChildren();
    if (decoding) {
      const d = M.decode(text); show(d.text, false); code = M.tidy(text); nameOut('Text');
      if (d.unknown.length) notes.append(note(`${d.unknown.length === 1 ? 'This group is' : `${d.unknown.length} groups are`} no Morse code and ${d.unknown.length === 1 ? 'is' : 'are'} shown as \ufffd:  ${list(d.unknown)}${/[^\s./|\-\u00b7\u2022\u2219\u22c5\u2212\u2013\u2014\u2012\u2015_]/.test(text) ? ' — Morse code is made of dots, dashes, spaces and slashes only.' : ''}`, 'warn'));
    } else {
      const e = M.encode(text); show(e.code, true); code = e.code; nameOut('Morse code');
      if (e.skipped.length) notes.append(note(`No Morse code for ${e.skipped.length === 1 ? 'this character, which is' : `these ${e.skipped.length} characters, which are`} left out:  ${list(e.skipped)}`, 'warn'));
    }
    showLength();
  };
  // ---- sound: one oscillator, switched on and off by its gain (with 5 ms slopes, or every tone would click)
  const stop = () => {
    clearTimeout(endTimer);
    if (osc) { const o = osc; osc = null; try { o.onended = null; o.stop(); o.disconnect(); } catch { /* it had ended */ } }
    playBtn.hidden = false; stopBtn.hidden = true;
  };
  const play = async () => {
    if (osc) stop();
    const { tones } = M.schedule(code, wpm, M.PLAY_MAX), total = tones.length ? tones[tones.length - 1].at + tones[tones.length - 1].len : 0;
    if (!tones.length) return;
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + 0.06;
    o.frequency.value = pitch; g.gain.value = 0; o.connect(g).connect(ctx.destination);
    for (const { at, len } of tones) { const slope = Math.min(0.005, len / 4); g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(0.4, t0 + at + slope); g.gain.setValueAtTime(0.4, t0 + at + len - slope); g.gain.linearRampToValueAtTime(0, t0 + at + len); }
    o.start(); o.stop(t0 + total + 0.05); osc = o;
    o.onended = () => { if (osc === o) stop(); };
    endTimer = window.setTimeout(() => { if (osc === o) stop(); }, (total + 0.5) * 1000); // if "ended" never comes
    playBtn.hidden = true; stopBtn.hidden = false;
  };
  const playBtn = button('Play', play, { variant: 'primary', icon: 'Play' }), stopBtn = button('Stop', () => stop(), { variant: 'primary', icon: 'Square' }); stopBtn.hidden = true;
  inp.addEventListener('input', run);
  const chart = h('details', { class: 'morse-chart' }, h('summary', {}, 'The Morse alphabet'),
    h('div', { class: 'morse-grid' }, Object.entries(M.MORSE).sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : 1)).map(([c, m]) => h('span', { class: 'morse-item' }, h('b', {}, c), h('code', {}, m)))),
    h('p', { class: 'muted small' }, 'A dash lasts three dots. Between the parts of a letter: one dot of silence; between letters three; between words seven. Words are written apart with a slash. Letters in angle brackets, such as <SK> (end of contact) or <SOS>, are sent as one sign without gaps.'));
  root.append(card(null, stack(segmented<Way>([['auto', 'Auto'], ['encode', 'Text → Morse'], ['decode', 'Morse → text']], way, (v) => { way = v; run(); }), field('Text or Morse code', inp), outField, cutNote, notes)),
    card('Sound', stack(slider({ label: 'Speed', min: 5, max: 40, value: wpm, unit: ' wpm', onInput: (v) => { wpm = v; stop(); showLength(); } }), slider({ label: 'Pitch', min: 400, max: 1000, step: 10, value: pitch, unit: ' Hz', onInput: (v) => { pitch = v; if (osc && ctx) osc.frequency.setValueAtTime(v, ctx.currentTime); } }), lengthLine)),
    h('div', { class: 'actions' }, playBtn, stopBtn), chart);
  run();
  return () => { stop(); void ctx?.close(); };
};
/** the order of the chart: letters, digits, signs, accented letters */
const rank = (c: string) => (/[A-Z]/.test(c) ? 0 : /[0-9]/.test(c) ? 1 : c.charCodeAt(0) < 128 ? 2 : 3);

// ================================================================== Lorem ipsum
// The text is textkit-lorem.wasm's (the lipsum crate's Markov chain over Cicero); src/lib/lorem.ts reads the count
// and lays the result out. One seed per text: a new count or format keeps the text, Regenerate makes a new one.
export const lorem: Mount = (root) => {
  let unit: LoremUnit = 'p', classic = true, html = false, seed = newSeed(), text = '', gone = false;
  // a text box with the number keys (a number box empties itself when "1,000" is pasted into it); ↑ / ↓ step by one
  const count = input({ value: LIMITS.p.start, attrs: { 'aria-label': 'How many', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' } });
  count.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const r = readCount(count.value, unit); if (!('n' in r)) return;
    e.preventDefault(); count.value = String(Math.min(LIMITS[unit].max, Math.max(1, r.n + (e.key === 'ArrowUp' ? 1 : -1)))); void run();
  });
  const out = outputBox({ rows: 12, label: 'Generated text', text: () => text });
  const info = h('p', { class: 'muted small lorem-info', 'aria-live': 'polite' }), problem = h('div', { class: 'stack' });
  count.classList.add('lorem-count');
  const countField = field('How many paragraphs', count);
  const run = async () => {
    const read = readCount(count.value, unit);
    countField.querySelector('.field-label')!.textContent = `How many ${LIMITS[unit].many}`;
    if ('error' in read) { problem.replaceChildren(note(read.error, 'warn')); count.setAttribute('aria-invalid', 'true'); return; }
    count.removeAttribute('aria-invalid');
    let eng: LoremEngine;
    try { eng = await loremEngine(); } catch {
      if (!gone) problem.replaceChildren(note('The text generator could not be loaded — check your connection. It is tried again with the next change or with Regenerate.', 'warn'));
      return;
    }
    if (gone) return;
    const r = eng.generate(unit, read.n, classic, seed);
    text = asText(r.paragraphs, html); out.value = text;
    info.textContent = loremSummary(r.paragraphs, r.sentences, r.words);
    problem.replaceChildren();
  };
  count.addEventListener('input', () => void run());
  const regenerate = () => { seed = newSeed(); return run(); };
  root.append(
    card(null, stack(
      segmented<LoremUnit>([['p', 'Paragraphs'], ['s', 'Sentences'], ['w', 'Words']], unit, (v) => { unit = v; count.value = String(LIMITS[v].start); void run(); }), // each unit starts at its own usual number
      countField,
      toggle('Start with "Lorem ipsum dolor sit amet…"', classic, (v) => { classic = v; void run(); }),
      segmented<'text' | 'html'>([['text', 'Plain text'], ['html', 'HTML <p>']], 'text', (v) => { html = v === 'html'; void run(); }),
      problem)),
    card(null, out, info),
    h('div', { class: 'actions' }, button('Regenerate', regenerate, { icon: 'RefreshCw' }), button('Copy', () => { if (text) void copy(text); }, { variant: 'primary', icon: 'Copy' })),
    note('Latin from Cicero\'s "On the Ends of Good and Evil" (45 BC), the book the classic Lorem ipsum passage was cut from, put together anew each time by a Markov chain (the lipsum library). Placeholder text: it means nothing in particular.'));
  void run();
  return () => { gone = true; };
};

// ================================================================== JSON (Software)
/** One JSON problem from the formatter engine ({ message, line, column, pos }), as a sentence. */
export function jsonProblem(e: any): { text: string; pos: number | null } {
  try { const m = JSON.parse(String(e?.message ?? e)); if (m && typeof m.message === 'string') return { text: `${m.message} — line ${m.line}, column ${m.column}`, pos: m.pos }; } catch { /* not from the engine */ }
  return { text: String(e?.message ?? e), pos: null };
}
interface JsonFmt { out: string; values: number; objects: number; arrays: number; keys: number; depth: number; duplicates: Array<{ key: string; line: number }> }
export const json: Mount = (root) => {
  const ta = textarea({ rows: 12, mono: true, value: '{"name":"SuperUtils","tools":175,"tags":["private","wasm"],"nested":{"b":2,"a":1}}' });
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
// Flavours (to-do #8): the engines and their rules are src/lib/regex/; matching runs in the regex worker.
export { groupNames } from '../lib/regex/flavours';
/** Why a JavaScript flags text is not usable, or null. (The browser's own message for a bad flag names neither the flag nor the rule.) */
export const flagsError = (f: string) => flavourFlagsError(FLAVOURS[0], f);
/** How long one run may take before the worker is ended (a pattern that backtracks without end never finishes); Python
 *  starts an interpreter for every run, Go never backtracks. */
const REGEX_LIMIT_MS: Record<FlavourId, number> = { js: 2000, pcre2: 5000, perl: 5000, python: 10000, go: 10000, ruby: 5000 };
/** What fetching an engine costs, said while it comes (once a visit). */
const ENGINE_SIZE: Partial<Record<FlavourId, string>> = { pcre2: 'PCRE2, 0.5 MB', perl: 'Perl 5.42, 25 MB', python: 'CPython, 12 MB', go: 'Go\'s regexp, 2.6 MB', ruby: 'Oniguruma, 0.5 MB' };
export const regex: Mount = (root) => {
  let fl = FLAVOURS[0];
  const loaded = new Set<FlavourId>(['js']);
  const pat = input({ value: '(\\d{3})-(\\d{4})', attrs: { spellcheck: 'false', class: 'input mono', 'aria-label': 'Pattern' } });
  const flags = input({ value: 'g', attrs: { spellcheck: 'false', class: 'input mono', 'aria-label': 'Flags' } });
  const text = textarea({ rows: 6, value: 'Call 555-1234 or 555-9876 today.' });
  const rep = input({ placeholder: 'Replacement (optional, $1 for groups)', attrs: { spellcheck: 'false', 'aria-label': 'Replacement' } });
  const every = toggle('Replace every match', true, () => runD());
  const flagHint = h('div', { class: 'small muted regex-flags' }), repHint = h('div', { class: 'small muted' });
  const hl = h('div', { class: 'regex-hl' });
  const groups = h('div');
  const repOut = outputBox({ rows: 4 });
  const engineNote = h('div');
  let worker: Worker | null = null, seq = 0, timer = 0, slow = 0, version = '';
  // the request the worker is matching now (its "run" message came, its answer not yet) and the flavour of each request
  let running = 0;
  const sent = new Map<number, FlavourId>();
  const stop = () => { clearTimeout(timer); clearTimeout(slow); running = 0; if (worker) { releaseNow('regex'); worker = null; } };
  const describe = () => {
    clear(flagHint).append(...fl.flags.map(([c, what], i) => h('span', null, i ? ' · ' : '', h('code', null, c), ` ${what}`)));
    repHint.textContent = `Groups in the replacement: ${fl.replace}.`;
    rep.placeholder = fl.id === 'python' || fl.id === 'ruby' ? 'Replacement (optional, \\1 for groups)' : 'Replacement (optional, $1 for groups)';
    every.style.display = fl.id === 'js' ? 'none' : '';
    clear(engineNote).append(note(`${fl.note}${version ? ` (${version})` : ''}`));
  };
  const setFlavour = (id: FlavourId) => {
    const prev = fl; fl = flavour(id); version = '';
    // the letters both flavours have stay; JavaScript's g and "Replace every match" stand for each other
    const allow = new Set(fl.flags.map(([c]) => c));
    if (prev.id === 'js') every.checked = flags.value.includes('g');
    let f = [...new Set(flags.value)].filter((c) => allow.has(c) && c !== 'g').join('');
    if (fl.id === 'js' && every.checked) f = `g${f}`;
    flags.value = f;
    describe(); run();
  };
  const show = (r: RegexRes, s: string) => {
    clear(groups); clear(hl);
    if (r.error) { groups.append(note(r.error, 'err')); hl.textContent = s; repOut.value = ''; pat.classList.toggle('bad', !!r.pattern); return; }
    pat.classList.remove('bad');
    if (r.version && r.version !== version) { version = r.version; describe(); }
    const ms = r.matches!, total = r.total!;
    let last = 0;
    for (const m of ms) { hl.append(s.slice(last, m.index), h('mark', { class: m.text ? null : 'empty' }, m.text || '∅')); last = m.index + m.text.length; }
    hl.append(s.slice(last));
    groups.append(note(`${total.toLocaleString('en-US')}${total >= 1000000 ? '+' : ''} match${total === 1 ? '' : 'es'}${total > ms.length ? ` (first ${ms.length.toLocaleString('en-US')} highlighted, ${Math.min(200, ms.length)} in the table)` : ms.length > 200 ? ' (first 200 in the table)' : ''}`, total ? 'ok' : 'info'));
    const ng = Math.max(0, ...ms.map((m) => m.groups.length)), names = r.names ?? [];
    if (ms.length) groups.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Match'), h('th', null, 'Index'), ...Array.from({ length: ng }, (_, i) => h('th', null, `$${i + 1}${names[i] ? ` ${names[i]}` : ''}`)))),
      h('tbody', null, ms.slice(0, 200).map((m, i) => h('tr', null, h('td', null, String(i + 1)), h('td', { class: 'mono' }, m.text), h('td', null, String(m.index)), ...Array.from({ length: ng }, (_, j) => h('td', { class: 'mono' }, m.groups[j] ?? '—'))))))));
    repOut.value = r.replaced ?? '';
    if (r.repError) groups.append(note(`The replacement could not be made: ${r.repError}`, 'err'));
  };
  const run = () => {
    const fe = flavourFlagsError(fl, flags.value); flags.classList.toggle('bad', !!fe);
    if (fe) { stop(); seq++; pat.classList.remove('bad'); show({ id: 0, error: fe }, text.value); return; }
    const id = ++seq, f = fl;
    if (!worker) {
      worker = trackWorker(new Worker(new URL('../workers/regex.worker.ts', import.meta.url), { type: 'module' }), 'regex', () => { worker = null; });
      worker.onmessage = (ev: MessageEvent<RegexRes>) => {
        const r = ev.data;
        if (r.phase === 'run') {
          // the engine is ready and matches request r.id: its time limit starts now, whichever request is the newest — a
          // newer one waits behind it in the worker
          running = r.id; clearTimeout(timer);
          const fid = sent.get(r.id) ?? 'js', limit = REGEX_LIMIT_MS[fid];
          if (r.id === seq) { clearTimeout(slow); loaded.add(fid); }
          timer = window.setTimeout(() => {
            const stuck = running;
            stop();
            // the newest request is the one that took too long: say so; else it waited behind an older one — run it afresh
            if (stuck === seq) show({ id: stuck, error: `Stopped after ${limit / 1000} seconds: this pattern takes too long on this text. Nested repeats such as (a+)+ or (.*)* make the engine try a huge number of ways to match — rewrite the pattern without them.` }, text.value);
            else run();
          }, limit);
          return;
        }
        if (r.id === running) { clearTimeout(timer); running = 0; }
        sent.delete(r.id);
        if (r.id !== seq) return;
        clearTimeout(slow);
        show(r, text.value);
      };
    }
    clearTimeout(slow);
    sent.set(id, f.id);
    if (!loaded.has(f.id)) slow = window.setTimeout(() => { if (id === seq) clear(groups).append(note(`Fetching the ${f.label.replace(/ \(.*/, '')} engine (${ENGINE_SIZE[f.id]}, once a visit)…`, 'info')); }, 300);
    worker.postMessage({ id, flavour: f.id, pattern: pat.value, flags: flags.value, text: text.value, replacement: rep.value ? rep.value : null, all: every.checked, base: document.baseURI } satisfies RegexReq);
  };
  let deb = 0; const runD = () => { clearTimeout(deb); deb = window.setTimeout(run, 60); };
  [pat, flags, text, rep].forEach((x) => x.addEventListener('input', runD));
  const flavourSel = select(FLAVOURS.map((x) => [x.id, x.label] as [FlavourId, string]), 'js', (v) => setFlavour(v), 'Flavour');
  root.append(card(null, stack(field('Flavour', flavourSel), h('div', { class: 'regex-row' }, field('Pattern', pat), field('Flags', flags)), flagHint, field('Test text', text))), card('Matches', hl, groups), card('Replace', rep, repHint, every, repOut),
    engineNote);
  describe(); run();
  return () => { clearTimeout(timer); clearTimeout(deb); clearTimeout(slow); };
};
void select; void row;
