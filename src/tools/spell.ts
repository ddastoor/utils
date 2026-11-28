// Spell Checker (potentials #10; owner, 26 Nov 2026: "the app should be able to take text from the clipboard, and upload text files.
// The spell checking operation should involve the usual cycling through of all ill spelt words with suggestions to fix. A download
// and copy button should also be there for the end result"). The text in a box, its misspelt words underlined; one at a time in its
// sentence with Hunspell's suggestions — Change, Change all, Ignore, Ignore all, Add to dictionary (for this visit), a word typed by
// hand, Previous / Next, Undo; names, CAPITALS, words with digits and web and e-mail addresses left alone. English of the United
// States, the United Kingdom or India. The engine: our Hunspell 1.7.6 with SCOWL's dictionaries in a worker
// (src/workers/spell.worker.ts); the text's words: src/lib/spelltext.ts.
import { h, card, button, toggle, select, note, ic, copy, downloadBlob, pickFiles, toast, errMsg, actions, type Mount } from '../ui';
import { trackWorker } from '../lifecycle';
import { readTextFile } from '../lib/textfile';
import { tokens, around, matchCase, applyEdits, moved, diffSpan, DEFAULT_OPTS, type SpellOpts, type Tok } from '../lib/spelltext';
import './spell.css';

type Lang = 'en-US' | 'en-GB' | 'en-IN';
const LANGS: Array<[Lang, string]> = [['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['en-IN', 'English (India)']];
const MAX = 1_000_000; // characters
const SHOWN = 8; // suggestions shown
/** kept while the page is open (nothing is stored) */
const kept: { text: string; name: string; lang: Lang | null; opts: SpellOpts; added: string[]; ignoreAll: Set<string> } =
  { text: '', name: '', lang: null, opts: { ...DEFAULT_OPTS }, added: [], ignoreAll: new Set() };
const defaultLang = (): Lang => {
  const l = (navigator.language || 'en-US').toLowerCase();
  return /-in$/.test(l) ? 'en-IN' : /^en-(gb|au|nz|ie|za)$/.test(l) ? 'en-GB' : 'en-US';
};

export const mount: Mount = (root, ctx) => {
  let lang: Lang = kept.lang ?? defaultLang();
  let gone = false, runSeq = 0, timer = 0, loaded = new Set<Lang>();
  let toks: Tok[] = [], bad: Tok[] = [], cur: number | null = null, ignoreAt = new Set<number>(), last = kept.text, choice = '';
  const known = new Map<string, boolean>(), sugg = new Map<string, string[] | Promise<string[]>>();
  const undo: Array<{ text: string; ignoreAt: number[]; ignoreAll: string[]; added: string[]; cur: number | null; what: string }> = [];

  // ---------------------------------------------------------------- the engine (a worker)
  let worker: Worker | null = null, seq = 0;
  const waits = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  const call = (op: string, data: Record<string, unknown> = {}, l: Lang = lang) => new Promise<any>((res, rej) => {
    if (!worker) {
      worker = trackWorker(new Worker(new URL('../workers/spell.worker.ts', import.meta.url), { type: 'module' }), 'spell', () => {
        for (const w of waits.values()) w.rej(new Error('The spell checker stopped.'));
        waits.clear(); worker = null; loaded = new Set();
      });
      worker.onmessage = (e) => { const w = waits.get(e.data.id); if (!w) return; waits.delete(e.data.id); if (e.data.ok) w.res(e.data.result); else w.rej(new Error(e.data.error)); };
      worker.onerror = (e) => { const ws = [...waits.values()]; waits.clear(); worker?.terminate(); worker = null; loaded = new Set(); for (const w of ws) w.rej(new Error(e.message || 'The spell checker stopped.')); };
    }
    const id = ++seq; waits.set(id, { res, rej });
    worker.postMessage({ id, op, lang: l, base: document.baseURI, ...data });
  });
  /** the language's dictionary loaded, the reader's own words put back into it */
  const ready = async (l: Lang) => {
    if (loaded.has(l)) return;
    await call('load', {}, l);
    if (kept.added.length) await call('add', { words: kept.added }, l);
    loaded.add(l);
  };

  // ---------------------------------------------------------------- the box
  const ta = h('textarea', { class: 'input sp-text', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', maxlength: MAX, rows: 12, placeholder: 'Type, paste or open a text: misspelt words are underlined.', 'aria-label': 'Text to check' }) as HTMLTextAreaElement;
  ta.value = kept.text;
  const back = h('div', { class: 'sp-back', 'aria-hidden': 'true' });
  const editor = h('div', { class: 'sp-editor' }, back, ta);
  ta.addEventListener('scroll', () => { back.scrollTop = ta.scrollTop; back.scrollLeft = ta.scrollLeft; });
  new ResizeObserver(() => { back.style.height = `${ta.offsetHeight}px`; }).observe(ta);
  const info = h('div', { class: 'muted small sp-info', 'aria-live': 'polite' });

  const setText = (text: string, how: string) => {
    if (text.length > MAX) { text = text.slice(0, MAX); toast(`Only the first ${MAX.toLocaleString('en-IN')} characters are kept.`, 'info'); }
    undo.push(snap(how)); ta.value = text; last = text; kept.text = text; ignoreAt = new Set(); cur = null; schedule(0);
  };
  const paste = async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); }
    catch { info.textContent = 'This browser did not let the page read the clipboard — press Ctrl+V (⌘V on a Mac; on a phone, press and hold in the box, then Paste).'; ta.focus(); return; }
    if (!text) { info.textContent = 'The clipboard holds no text.'; return; }
    const a = ta.selectionStart, b = ta.selectionEnd;
    setText(ta.value && !(a === 0 && b === ta.value.length) ? ta.value.slice(0, a) + text + ta.value.slice(b) : text, 'Paste');
    info.textContent = `Pasted ${text.length.toLocaleString('en-IN')} characters.`;
  };
  const open = async (f?: File) => {
    const file = f ?? (await pickFiles('.txt,.text,.md,.markdown,.csv,.tsv,.srt,.vtt,.log,.html,.htm,.xml,.json,.tex,text/*'))[0];
    if (!file) return;
    try { const text = await readTextFile(file, 'open a text file (.txt, .md, .csv …)'); kept.name = file.name; setText(text, 'Open a file'); info.textContent = `Opened ${file.name}.`; }
    catch (e) { info.textContent = errMsg(e); }
  };
  editor.addEventListener('dragover', (e) => { e.preventDefault(); editor.classList.add('over'); });
  editor.addEventListener('dragleave', () => editor.classList.remove('over'));
  editor.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (!f) return; e.preventDefault(); editor.classList.remove('over'); void open(f); });

  // what a person types moves the positions after it (Ignore once, the current word)
  ta.addEventListener('input', () => {
    const now = ta.value, d = diffSpan(last, now), len = d.endB - d.start;
    ignoreAt = new Set([...ignoreAt].map((p) => moved(p, d.start, d.endA, len)).filter((p): p is number => p !== null));
    if (cur !== null) cur = moved(cur, d.start, d.endA, len);
    last = now; kept.text = now;
    schedule(now.length > 200_000 ? 600 : 250);
  });
  ta.addEventListener('click', () => {
    const p = ta.selectionStart, b = bad.find((t) => t.start <= p && p <= t.end);
    if (b && b.start !== cur) { cur = b.start; choice = ''; draw(); }
  });

  // ---------------------------------------------------------------- checking
  const schedule = (ms: number) => { clearTimeout(timer); timer = window.setTimeout(() => void run(), ms); };
  const run = async () => {
    const my = ++runSeq, text = ta.value;
    toks = text ? tokens(text, kept.opts) : [];
    if (!text.trim()) { bad = []; cur = null; draw(); return; } // nothing to check: the dictionary is not fetched
    const need = [...new Set(toks.filter((t) => !t.skip && !known.has(t.word)).map((t) => t.word))];
    if (need.length || !loaded.has(lang)) {
      if (!loaded.has(lang)) status(`Loading the ${LANGS.find(([l]) => l === lang)![1]} dictionary…`);
      try {
        await ready(lang);
        for (let i = 0; i < need.length; i += 5000) {
          const part = need.slice(i, i + 5000), ok: boolean[] = await call('check', { words: part });
          if (my !== runSeq || gone) return;
          part.forEach((w, k) => known.set(w, ok[k]));
        }
      } catch (e) {
        if (my === runSeq && !gone) status(`The dictionary could not be loaded — ${errMsg(e)} It is tried again with the next change.`, true);
        return;
      }
      if (my !== runSeq || gone) return;
    }
    bad = toks.filter((t) => !t.skip && known.get(t.word) === false && !kept.ignoreAll.has(t.word) && !ignoreAt.has(t.start));
    if (cur === null || !bad.some((t) => t.start === cur)) cur = (bad.find((t) => cur === null || t.start >= cur) ?? bad[0])?.start ?? null;
    draw();
  };

  // ---------------------------------------------------------------- drawing
  const draw = () => {
    const text = ta.value, f = document.createDocumentFragment();
    let at = 0;
    for (const t of bad) {
      if (t.start > at) f.append(text.slice(at, t.start));
      f.append(h('mark', { class: ['sp-bad', t.start === cur && 'cur'] }, text.slice(t.start, t.end)));
      at = t.end;
    }
    f.append(text.slice(at), '​');
    back.replaceChildren(f);
    back.scrollTop = ta.scrollTop;
    drawPane();
  };
  const pane = h('div', { class: 'sp-pane', 'aria-live': 'polite' });
  // phones: the current word's Ignore / Change / Next in the fixed bar at the foot of the screen
  let barAct: { change: () => void; ignore: () => void } | null = null;
  const bar = ctx.isMobile ? actions(button('Ignore', () => barAct?.ignore(), { icon: 'ArrowRight' }), button('Change', () => barAct?.change(), { variant: 'primary', icon: 'Check' }),
    button('Next', () => step(1), { icon: 'ChevronRight' })) : null;
  if (bar) bar.hidden = true;
  const status = (text: string, warn = false) => { pane.replaceChildren(warn ? note(text, 'warn') : h('p', { class: 'muted' }, text)); };
  const left = () => toks.filter((t) => t.skip).length;
  const drawPane = () => {
    const text = ta.value;
    barAct = null;
    if (bar) bar.hidden = !bad.length || !text.trim();
    const undoBtn = () => button(undo.length ? `Undo ${undo.at(-1)!.what}` : 'Undo', () => back1(), { small: true, icon: 'Undo2', variant: 'ghost', disabled: !undo.length });
    if (!text.trim()) {
      pane.replaceChildren(h('p', { class: 'muted' }, 'Type, paste or open a text: its misspelt words are underlined, and you go through them here one by one.'),
        ...(undo.length ? [h('div', { class: 'sp-nav' }, undoBtn())] : []));
      return;
    }
    const words = toks.length, skipped = left(), counts = `${words.toLocaleString('en-IN')} word${words === 1 ? '' : 's'} checked${skipped ? ` · ${skipped.toLocaleString('en-IN')} left alone (names, CAPITALS, numbers, addresses)` : ''}`;
    if (!bad.length) {
      pane.replaceChildren(note(h('span', null, h('strong', null, 'No spelling mistakes found. '), counts), 'ok'), ...(undo.length ? [h('div', { class: 'sp-nav' }, undoBtn())] : []));
      return;
    }
    const t = bad.find((b) => b.start === cur) ?? bad[0], i = bad.indexOf(t), ctx = around(text, t.start, t.end);
    const box = h('input', { class: 'input sp-to', type: 'text', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Change to' }) as HTMLInputElement;
    const list = h('div', { class: 'sp-sugg', role: 'radiogroup', 'aria-label': 'Suggestions' }, h('span', { class: 'muted small' }, 'Finding suggestions…'));
    const same = bad.filter((b) => b.word === t.word).length;
    // Change with nothing in "Change to" yet (the suggestions still coming): the first suggestion, once it is there
    const doChange = async (all: boolean) => {
      let to = box.value.trim();
      if (!to) {
        const s = sugg.get(t.word);
        to = (Array.isArray(s) ? s : await Promise.resolve(s).catch(() => [] as string[]))?.[0] ?? '';
        if (gone || cur !== t.start || ta.value.slice(t.start, t.end) !== t.word) return; // the text or the word moved on meanwhile
      }
      if (!to) { info.textContent = 'There are no suggestions for this word: type it in “Change to”.'; box.focus(); return; }
      change(t, to, all);
    };
    barAct = { change: () => doChange(false), ignore: () => ignore(t, false) };
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void doChange(false); } });
    pane.replaceChildren(
      h('div', { class: 'sp-head' }, h('strong', null, 'Not in the dictionary'), h('span', { class: 'sp-count' }, `${i + 1} of ${bad.length}`)),
      h('p', { class: 'sp-ctx' }, ctx.before, h('mark', { class: 'sp-word' }, ctx.word), ctx.after),
      h('div', { class: 'sp-label small muted' }, 'Suggestions'), list,
      h('label', { class: 'sp-change' }, h('span', { class: 'small muted' }, 'Change to'), box),
      h('div', { class: 'sp-acts' },
        button('Change', () => doChange(false), { variant: 'primary', icon: 'Check' }),
        button(same > 1 ? `Change all (${same})` : 'Change all', () => doChange(true), { icon: 'CheckCheck' }),
        button('Ignore', () => ignore(t, false), { icon: 'ArrowRight' }),
        button('Ignore all', () => ignore(t, true), { icon: 'EyeOff' }),
        button('Add to dictionary', () => add(t), { icon: 'BookPlus', title: 'Kept while this page is open' })),
      h('div', { class: 'sp-nav' },
        button('Previous', () => step(-1), { small: true, icon: 'ChevronLeft', disabled: bad.length < 2 }),
        button('Next', () => step(1), { small: true, icon: 'ChevronRight', disabled: bad.length < 2 }),
        undoBtn(),
        h('span', { class: 'muted small sp-counts' }, counts)));
    // suggestions (cached a word); the first fills "Change to"
    const fill = (s: string[], all = false) => {
      if (cur !== t.start || !pane.contains(list)) return;
      const shown = all ? s : s.slice(0, SHOWN);
      if (!choice || !box.value) { choice = shown[0] ?? ''; box.value = choice || t.word; }
      const pick = (w: string) => {
        choice = w; box.value = w;
        for (const b of list.querySelectorAll('.sp-s')) { const on = (b as HTMLElement).textContent === w; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      };
      list.replaceChildren(...(shown.length ? shown.map((w) => h('button', {
        type: 'button', role: 'radio', class: ['sp-s', w === choice && 'on'], 'aria-checked': String(w === choice),
        onclick: () => pick(w), ondblclick: () => change(t, w, false),
      }, w)) : [h('span', { class: 'muted small' }, 'No suggestions — type the word in “Change to”.')]),
      ...(s.length > shown.length ? [h('button', { type: 'button', class: 'btn btn-ghost btn-sm sp-more', onclick: () => fill(s, true) }, `${s.length - shown.length} more`)] : []));
    };
    const s = sugg.get(t.word);
    if (Array.isArray(s)) fill(s);
    else {
      const p = s ?? call('suggest', { word: t.word }).then((r: string[]) => { sugg.set(t.word, r); return r; }, (e) => { sugg.delete(t.word); throw e; });
      sugg.set(t.word, p);
      p.then(fill, () => { if (pane.contains(list)) list.replaceChildren(h('span', { class: 'muted small' }, 'Suggestions could not be found.')); });
    }
  };
  // the current word brought into view in the box
  const show = () => {
    const m = back.querySelector('mark.cur') as HTMLElement | null;
    if (!m) return;
    const top = m.offsetTop, view = ta.clientHeight;
    if (top < ta.scrollTop + 8 || top > ta.scrollTop + view - 32) { ta.scrollTop = Math.max(0, top - view / 3); back.scrollTop = ta.scrollTop; }
  };

  // ---------------------------------------------------------------- what the buttons do
  function snap(what: string) { return { text: ta.value, ignoreAt: [...ignoreAt], ignoreAll: [...kept.ignoreAll], added: [...kept.added], cur, what }; }
  const push = (what: string) => { undo.push(snap(what)); if (undo.length > 30) undo.shift(); };
  const after = (pos: number) => { cur = pos; choice = ''; void run().then(show); };
  function change(t: Tok, to: string, all: boolean) {
    // a suggestion as it is; a word typed by hand with the capitals of the word it replaces (the suggestions may still be coming)
    const offered = sugg.get(t.word);
    const repl = to === t.word || to === '' ? t.word : Array.isArray(offered) && offered.includes(to) ? to : matchCase(t.word, to);
    if (repl === t.word) { ignore(t, false); return; }
    push(all ? 'Change all' : 'Change');
    const targets = all ? bad.filter((b) => b.word === t.word) : [t];
    const text = applyEdits(ta.value, targets.map((b) => ({ start: b.start, end: b.end, text: repl })));
    let set = [...ignoreAt], next = t.start + repl.length;
    for (const b of [...targets].sort((x, y) => y.start - x.start)) set = set.map((p) => moved(p, b.start, b.end, repl.length)).filter((p): p is number => p !== null);
    // the next word to look at: the first after the changed one, in the new text
    for (const b of targets) if (b.start < t.start) next += repl.length - (b.end - b.start);
    ignoreAt = new Set(set); ta.value = text; last = text; kept.text = text;
    info.textContent = all ? `Changed ${targets.length} × “${t.word}” to “${repl}”.` : `Changed “${t.word}” to “${repl}”.`;
    after(next);
  }
  function ignore(t: Tok, all: boolean) {
    push(all ? 'Ignore all' : 'Ignore');
    if (all) kept.ignoreAll.add(t.word); else ignoreAt.add(t.start);
    info.textContent = all ? `“${t.word}” is ignored everywhere while this page is open.` : `“${t.word}” ignored here.`;
    after(t.end);
  }
  function add(t: Tok) {
    push('Add to dictionary');
    kept.added.push(t.word); known.set(t.word, true);
    void call('add', { words: [t.word] }).catch(() => { /* the next load puts it back */ });
    info.textContent = `“${t.word}” added to the dictionary while this page is open.`;
    after(t.end);
  }
  function step(by: number) {
    if (!bad.length) return;
    const i = bad.findIndex((b) => b.start === cur), j = ((i < 0 ? 0 : i) + by + bad.length) % bad.length;
    cur = bad[j].start; choice = ''; draw(); show();
  }
  function back1() {
    const s = undo.pop();
    if (!s) return;
    const removed = kept.added.filter((w) => !s.added.includes(w));
    ta.value = s.text; last = s.text; kept.text = s.text; ignoreAt = new Set(s.ignoreAt); kept.ignoreAll = new Set(s.ignoreAll); kept.added = s.added; cur = s.cur; choice = '';
    if (removed.length) { for (const w of removed) known.delete(w); void call('remove', { words: removed }).catch(() => { /* nothing */ }); }
    info.textContent = `Undone: ${s.what}.`;
    void run().then(show);
  }

  // ---------------------------------------------------------------- the result
  const fileName = () => kept.name && /\.(txt|text|md|markdown|csv|tsv|srt|vtt|log|tex)$/i.test(kept.name) ? kept.name : `${kept.name ? kept.name.replace(/\.[^.]+$/, '') : 'spell-checked'}.txt`;
  const outActs = h('div', { class: 'sp-out' },
    button('Copy', () => { if (!ta.value) { toast('There is no text yet.', 'info'); return; } void copy(ta.value); }, { icon: 'Copy' }),
    button('Download', () => { if (!ta.value) { toast('There is no text yet.', 'info'); return; } downloadBlob(new Blob([ta.value], { type: 'text/plain;charset=utf-8' }), fileName()); }, { icon: 'Download' }));

  // ---------------------------------------------------------------- choices
  const langSel = select(LANGS, lang, (v) => { lang = v; kept.lang = v; known.clear(); sugg.clear(); cur = null; schedule(0); }, 'Language');
  const opt = (label: string, key: keyof SpellOpts) => toggle(label, kept.opts[key], (v) => { kept.opts[key] = v; schedule(0); });
  root.append(h('div', { class: 'sp-grid' },
    card(null,
      h('div', { class: 'sp-tools' },
        button('Paste', () => paste(), { icon: 'ClipboardPaste' }),
        button('Open a text file', () => open(), { icon: 'FileText' }),
        button('Clear', () => { if (ta.value) setText('', 'Clear'); }, { icon: 'Eraser', variant: 'ghost' }),
        h('label', { class: 'sp-lang' }, ic('Languages'), langSel)),
      editor, info,
      h('details', { class: 'sp-opts' }, h('summary', null, 'What is left alone'),
        h('div', { class: 'sp-opts-body' },
          opt('Names: capitalised words in mid-sentence (Ramesh, Infosys)', 'names'),
          opt('Words in CAPITALS (NASA, GST)', 'caps'),
          opt('Words with digits (2nd, B2B)', 'digits'),
          h('p', { class: 'muted small' }, 'Web and e-mail addresses are always left alone. Words you add or ignore everywhere are kept while this page is open; nothing is stored.')))),
    h('div', { class: 'sp-side' }, card('Spelling', pane, outActs))),
    h('p', { class: 'muted small' }, 'Hunspell 1.7.6 — the spell checker of LibreOffice, Firefox and Chrome — with SCOWL’s dictionaries (wordlist.aspell.net): American; British with “-ise” (Indian English spells as British English does, and its own words — lakh, crore, Bengaluru, prepone … — are added). The text never leaves this device.'),
    ...(bar ? [bar] : []),
  );
  schedule(0);
  return () => { gone = true; clearTimeout(timer); };
};
