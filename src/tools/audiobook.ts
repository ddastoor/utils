// PDF / EPUB → Audiobook (potentials #14; owner's pick of 27 Nov 2026, group 1): a book read aloud into MP3 files, one per
// chapter, by the neural voices of the Text-to-Speech tab (Kokoro's US and British voices, Piper's Indian English) — on
// this device; the book never leaves it. The book's text in tracks: src/lib/audiobook.ts in a reading worker
// (src/workers/bookread.worker.ts); each track said and made an MP3 straight away in a speech worker
// (src/workers/audiobook.worker.ts: the voice's network + audio.wasm's LAME, as a stream with ID3 tags and the cover).
// On a PC several speech engines work at once and the MP3s can be saved into a folder as they are made (a folder that
// already holds some is carried on from). PC and phones.
import { h, card, field, note, actions, button, toggle, input, select, slider, progress, clear, downloadBlob, shareOrDownload, fmtBytes, fmtTime, filePicker, toast, errMsg, type Mount } from '../ui';
import { trackWorker, onLeave, releaseNow } from '../lifecycle';
import { VOICES, voiceById, type Voice } from '../lib/voices';
import { loadImg, resizeImg, encodeImg } from '../lib/imgio';
import type { Book, Track } from '../lib/audiobook';
import type { MakeMsg } from '../workers/audiobook.worker';

const ACCEPT = '.epub,.pdf,.mobi,.azw,.azw3,.prc,.pdb,.fb2,.fbz,.txt,.text,.html,.htm,.xhtml,application/epub+zip,application/pdf,application/x-fictionbook+xml,text/plain,text/html';
/** words a minute of speech at speed 1 (Kokoro and Piper read about this fast) */
const WPM = 155;
const LANG3: Record<string, string> = { en: 'eng', fr: 'fra', de: 'deu', es: 'spa', it: 'ita', pt: 'por', nl: 'nld', hi: 'hin', ru: 'rus', el: 'ell', sv: 'swe', da: 'dan', no: 'nor', fi: 'fin', pl: 'pol', ja: 'jpn', zh: 'zho' };
// kept while the page is open (through other tabs): the voice, the speed, the MP3's bitrate, footnotes, engines at once
let voiceId = 'af_heart', speed = 1, kbps = 64, readNotes = false, enginesAtOnce = 0;

/** A file name a system accepts, readable: "03 Chapter 2. Fog.mp3". */
export const fileName = (n: number, of: number, title: string) => {
  const t = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 90) || `Track ${n}`;
  return `${String(n).padStart(Math.max(2, String(of).length), '0')} ${t}.mp3`;
};
const folderName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80) || 'Audiobook';
const mins = (words: number, sp: number) => (words / WPM / sp) * 60;
/** a length in words: "less than a minute", "about 12 min", "about 3 h 5 min" */
const about = (sec: number) => (sec < 60 ? 'less than a minute' : `about ${sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`}`);

/** Keeps the screen on while the book is being read (a phone that sleeps stops the page). The browser lets the lock go
 *  when the tab is hidden: it is asked for again when the tab is shown. */
function wakeLock() {
  let lock: any = null, want = false;
  const ask = async () => {
    const wl = (navigator as any).wakeLock;
    if (!want || lock || !wl || document.visibilityState !== 'visible') return;
    try { const l = await wl.request('screen'); if (!want || lock) { l.release?.()?.catch?.(() => {}); return; } lock = l; l.addEventListener?.('release', () => { if (lock === l) lock = null; }); } catch { /* refused: the work goes on */ }
  };
  const shown = () => { if (document.visibilityState === 'visible') void ask(); };
  document.addEventListener('visibilitychange', shown);
  const off = () => { want = false; const l = lock; lock = null; l?.release?.()?.catch?.(() => {}); };
  return { on() { want = true; void ask(); }, off, dispose() { off(); document.removeEventListener('visibilitychange', shown); } };
}

// ---------------------------------------------------------------------------------------------------- reading the book
let reader: Worker | null = null, readSeq = 0;
const readPending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (done: number, of: number, phase: string) => void }>();
function readBook(bytes: Uint8Array, name: string, notes: boolean, password: string | undefined, onProgress: (done: number, of: number, phase: string) => void): Promise<{ book?: Book; refused?: string; password?: boolean; wrong?: boolean }> {
  if (!reader) {
    reader = trackWorker(new Worker(new URL('../workers/bookread.worker.ts', import.meta.url), { type: 'module' }), 'audiobook-reader', () => {
      const ps = [...readPending.values()]; readPending.clear(); reader = null;
      for (const p of ps) p.reject(new Error('Stopped.'));
    });
    reader.onmessage = (e) => {
      const m = e.data, p = readPending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') { p.onProgress?.(m.done, m.of, m.phase); return; }
      readPending.delete(m.id);
      m.type === 'done' ? p.resolve(m.result) : p.reject(new Error(m.message));
    };
    reader.onerror = (e) => { e.preventDefault(); const ps = [...readPending.values()]; readPending.clear(); releaseNow('audiobook-reader'); for (const p of ps) p.reject(new Error(`the book could not be read (${e.message || 'the reader stopped'}). Try again.`)); };
  }
  const id = ++readSeq, w = reader;
  return new Promise((resolve, reject) => { readPending.set(id, { resolve, reject, onProgress }); w.postMessage({ id, bytes, name, notes, password }); });
}

// ---------------------------------------------------------------------------------------------------- speech engines
/** One speech worker: tracks made one after another (`make`); `end()` stops it at once. */
function speaker(key: string) {
  let seq = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; on: (m: any) => void }>();
  const w = trackWorker(new Worker(new URL('../workers/audiobook.worker.ts', import.meta.url), { type: 'module' }), key, () => {
    const ps = [...pending.values()]; pending.clear();
    for (const p of ps) p.reject(new Stopped());
  });
  w.onmessage = (e) => {
    const m = e.data, p = pending.get(m.id);
    if (!p) return;
    if (m.type === 'done') { pending.delete(m.id); p.resolve(m); }
    else if (m.type === 'error') { pending.delete(m.id); p.reject(new Error(m.error)); }
    else if (m.type === 'cancelled') { pending.delete(m.id); p.reject(new Stopped()); }
    else p.on(m);
  };
  w.onerror = (e) => { e.preventDefault(); const ps = [...pending.values()]; pending.clear(); releaseNow(key); for (const p of ps) p.reject(new Error(`the speech engine stopped (${e.message || 'out of memory?'})`)); };
  return {
    make(msg: Omit<MakeMsg, 'id' | 'op' | 'base'>, on: (m: any) => void): Promise<{ file: Blob; seconds: number; bytes: number; ms: number }> {
      const id = ++seq;
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, on }); w.postMessage({ id, op: 'make', base: document.baseURI, ...msg }); });
    },
    end() { releaseNow(key); },
  };
}
class Stopped extends Error { constructor() { super('Stopped.'); } }

interface Row { track: Track; include: boolean; title: string; state: 'idle' | 'queued' | 'making' | 'done' | 'skipped' | 'error'; file?: Blob; url?: string; seconds?: number; error?: string; made?: string; el?: HTMLElement }

export const mount: Mount = (root, ctx) => {
  const pc = !ctx.isMobile;
  const canFolder = pc && 'showDirectoryPicker' in window;
  let book: Book | null = null, rows: Row[] = [], art: Uint8Array | undefined, coverUrl = '', source: { bytes: Uint8Array; name: string; password?: string } | null = null;
  let making = false, stopAll: (() => void) | null = null, readId = 0, where: 'page' | 'folder' = 'page';
  const urls = new Set<string>();
  const urlOf = (b: Blob) => { const u = URL.createObjectURL(b); urls.add(u); return u; };
  const dropUrl = (u?: string) => { if (u) { URL.revokeObjectURL(u); urls.delete(u); } };
  onLeave('audiobook-urls', () => { for (const u of urls) URL.revokeObjectURL(u); urls.clear(); });
  const wl = wakeLock();
  onLeave('audiobook-wakelock', () => wl.dispose());

  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const readProg = progress();
  const bookBox = h('div', { class: 'stack' });
  const chapterBox = h('div', { class: 'stack' });
  const resultBox = h('div', { class: 'stack' });

  // ---- the voice
  const voice = (): Voice => voiceById(voiceId) || VOICES[0][1][0];
  const vsel = h('select', { class: 'input select', 'aria-label': 'Voice' }, VOICES.map(([g, vs]) => h('optgroup', { label: g }, vs.map((v) => h('option', { value: v.id }, v.label))))) as HTMLSelectElement;
  vsel.value = voiceId;
  const voiceHint = h('div', { class: 'muted small' });
  const syncHint = () => { voiceHint.textContent = voice().engine === 'piper' ? 'Indian English: L2-ARCTIC speakers (first language Hindi), Piper — its model (77 MB) is fetched once a visit.' : 'Kokoro neural voice — its model (92 MB) is fetched once a visit.'; };
  syncHint();
  vsel.addEventListener('change', () => { voiceId = vsel.value; syncHint(); summary(); });
  const speedSl = slider({ label: 'Speed', min: 0.5, max: 2, step: 0.05, value: speed, fmt: (v) => `${+v.toFixed(2)}×`, onInput: (v) => { speed = v; summary(); } });
  const kbpsSel = select<string>([['48', '48 kbps — about 22 MB an hour'], ['64', '64 kbps — about 29 MB an hour'], ['96', '96 kbps — about 43 MB an hour']], String(kbps), (v) => { kbps = +v; }, 'MP3 quality');
  const engineCount = () => enginesAtOnce || (pc ? Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2))) : 1);
  const enginesSel = select<string>(['1', '2', '3', '4'].map((n) => [n, n === '1' ? '1 (least memory)' : n]), String(engineCount()), (v) => { enginesAtOnce = +v; }, 'Speech engines at once');
  const listenBtn = button('Listen to a sample', () => sample(), { icon: 'Play' });
  const player = h('audio', { controls: true, class: 'ab-player', hidden: true, 'aria-label': 'Sample' }) as HTMLAudioElement;

  const notesTgl = toggle('Read the footnotes', readNotes, (v) => { readNotes = v; if (source) void open(source.bytes, source.name, source.password); });

  // ---- the book
  const picker = filePicker({ accept: ACCEPT, label: 'Choose a book', hint: 'EPUB, PDF, MOBI, FictionBook, plain text or a web page — or drop it here', onFiles: (fs) => fs[0] && pick(fs[0]) });
  async function pick(f: File) {
    if (making) { toast('A book is being read aloud: stop it first.', 'info'); return; }
    await open(new Uint8Array(await f.arrayBuffer()), f.name);
  }
  async function open(bytes: Uint8Array, name: string, password?: string) {
    const my = ++readId;
    releaseNow('audiobook-reader');   // a book still being read is let go
    source = { bytes, name, password };
    clear(bookBox); clear(chapterBox); clear(resultBox); rows = []; book = null; art = undefined;
    if (coverUrl) { dropUrl(coverUrl); coverUrl = ''; }
    status.textContent = `Reading ${name}…`;
    readProg.set(null, 'Reading the book…');
    let r;
    try {
      r = await readBook(bytes.slice(), name, readNotes, password, (done, of, phase) => { if (my === readId) readProg.set(of ? done / of : null, phase === 'read' ? `Reading the PDF: page ${done + 1} of ${of}…` : `Laying out the PDF: page ${done + 1} of ${of}…`); });
    } catch (e) { if (my !== readId) return; readProg.done(); status.textContent = ''; bookBox.append(note(errMsg(e), 'err')); return; }
    finally { if (my === readId) releaseNow('audiobook-reader'); }
    if (my !== readId) return;
    readProg.done(); status.textContent = '';
    if (r.password) {
      const pw = input({ type: 'password', attrs: { 'aria-label': 'Password of the PDF', autocomplete: 'off' } });
      const go = () => void open(bytes, name, pw.value);
      pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      bookBox.append(card('This PDF is protected', r.wrong ? note('That password is not this PDF’s.', 'err') : note('Type its password to read it.'), field('Password', pw), actions(button('Open', go, { variant: 'primary' }))));
      pw.focus();
      return;
    }
    if (r.refused || !r.book) { bookBox.append(note(r.refused || 'This file could not be read.', 'warn')); return; }
    const b: Book = r.book;
    book = b;
    rows = b.tracks.map((t) => ({ track: t, include: !t.skip, title: t.title, state: 'idle' }));
    if (b.cover) void coverOf(b.cover, my);
    showBook();
  }
  /** the cover: at most 500 px, JPEG (it goes into every MP3) */
  async function coverOf(c: { bytes: Uint8Array; mime: string }, my: number) {
    try {
      let img = await loadImg(new Blob([c.bytes as BlobPart], { type: c.mime }));
      const s = Math.min(1, 500 / Math.max(img.width, img.height));
      if (s < 1) img = await resizeImg(img, Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
      const jpg = await encodeImg(img, 'jpeg', 85);
      if (my !== readId) return;
      art = new Uint8Array(await jpg.arrayBuffer());
      coverUrl = urlOf(jpg);
      const slot = bookBox.querySelector('.ab-cover');
      slot?.replaceChildren(h('img', { src: coverUrl, alt: 'The cover', class: 'ab-cover-img' }));
    } catch { /* no cover: the MP3s go without one */ }
  }

  const titleIn = input({ attrs: { 'aria-label': 'Book title' } }), authorIn = input({ attrs: { 'aria-label': 'Author' } });
  const sumLine = h('div', { class: 'muted small', 'aria-live': 'polite' });
  function summary() {
    if (!book) return;
    const sel = rows.filter((r) => r.include), w = sel.reduce((s, r) => s + r.track.words, 0);
    sumLine.textContent = `${sel.length} of ${rows.length} track${rows.length === 1 ? '' : 's'} chosen · ${w.toLocaleString('en-IN')} words · ${about(mins(w, speed))} of speech at ${+speed.toFixed(2)}×`;
    for (const r of rows) { const m = r.el?.querySelector('.ab-meta'); if (m && r.state === 'idle') m.textContent = `${r.track.words.toLocaleString('en-IN')} words · ${about(mins(r.track.words, speed))}`; }
  }
  function showBook() {
    if (!book) return;
    titleIn.value = book.title; authorIn.value = book.author;
    const how = { contents: 'a track for each chapter of the book’s contents', headings: 'a track for each heading (the book has no contents)', length: 'parts of about 17 minutes (the book has no contents and no headings)' }[book.how];
    const left = [book.refs ? `${book.refs} footnote mark${book.refs === 1 ? '' : 's'}` : '', book.notes ? `${book.notes} note${book.notes === 1 ? '' : 's'}` : '', book.heads ? `${book.heads} running head${book.heads === 1 ? '' : 's'} and page numbers` : ''].filter(Boolean);
    bookBox.append(card(null,
      h('div', { class: 'ab-book' }, h('div', { class: 'ab-cover', 'aria-hidden': coverUrl ? null : 'true' }), h('div', { class: 'stack' },
        field('Title', titleIn), field('Author', authorIn),
        h('div', { class: 'muted small' }, `Read as ${how}.${left.length ? ` Not read: ${left.join(', ')}.` : ''}`),
        notesTgl))));
    const list = h('div', { class: 'ab-list', role: 'list' });
    rows.forEach((r, i) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': `Read “${r.title}”` }) as HTMLInputElement;
      cb.checked = r.include;
      cb.addEventListener('change', () => { r.include = cb.checked; summary(); });
      const name = input({ value: r.title, attrs: { 'aria-label': `Title of track ${i + 1}`, class: 'input ab-title' } });
      name.addEventListener('input', () => { r.title = name.value.trim() || r.track.title; cb.setAttribute('aria-label', `Read “${r.title}”`); });
      const res = h('div', { class: 'ab-res' });
      r.el = h('div', { class: 'ab-row', role: 'listitem' },
        h('label', { class: 'ab-check' }, cb, h('span', { class: 'ab-num' }, String(i + 1))),
        h('div', { class: 'ab-main' }, name, h('div', { class: 'ab-meta muted small' }), res),
        button('', () => sample(i), { icon: 'Play', small: true, variant: 'ghost', title: `Listen to the beginning of “${r.title}”` }));
      list.append(r.el);
    });
    chapterBox.append(card('Tracks',
      h('div', { class: 'row ab-all' }, button('Choose all', () => setAll(true), { small: true }), button('Choose none', () => setAll(false), { small: true })),
      list, sumLine));
    summary();
    function setAll(v: boolean) { rows.forEach((r) => { r.include = v; const c = r.el?.querySelector('input[type=checkbox]') as HTMLInputElement | null; if (c) c.checked = v; }); summary(); }
  }
  const resOf = (r: Row) => r.el?.querySelector('.ab-res') as HTMLElement | null;
  const metaOf = (r: Row) => r.el?.querySelector('.ab-meta') as HTMLElement | null;

  // ---- a sample of the voice (the beginning of a track)
  let sampler: ReturnType<typeof speaker> | null = null;
  async function sample(i?: number) {
    if (making) { toast('The book is being read aloud: the speech engines are busy.', 'info'); return; }
    const r = i == null ? rows.find((x) => x.include) ?? rows[0] : rows[i];
    const blocks: Array<{ kind: 'heading' | 'text' | 'break'; text: string }> = [];
    let words = 0;
    for (const b of r?.track.blocks || []) { if (b.kind === 'break') continue; blocks.push({ kind: b.kind, text: b.text }); words += b.text.split(/\s+/).length; if (words >= 35) break; }
    if (!blocks.length) blocks.push({ kind: 'text', text: 'This is how the book will sound, read by this voice on your own device.' });
    // at most about 35 words: the last paragraph cut at a sentence's end
    const last = blocks[blocks.length - 1], cut = /^(.{60,}?[.!?…])\s/s.exec(last.text);
    if (words > 50 && cut) last.text = cut[1];
    const v = voice();
    listenBtn.setAttribute('disabled', ''); status.textContent = 'Making a sample…';
    try {
      sampler ||= speaker('audiobook-sample');
      const out = await sampler.make({ voice: { engine: v.engine as 'kokoro' | 'piper', voice: v.id, lang: v.lang, speaker: v.speaker }, speed, kbps, tags: {}, blocks, sample: true },
        (m) => { if (m.type === 'progress') status.textContent = `Fetching ${m.what}: ${Math.round((m.loaded / m.total) * 100)} %`; else if (m.type === 'ready') status.textContent = 'Making a sample…'; });
      dropUrl(player.src || undefined);
      player.src = urlOf(out.file); player.hidden = false;
      status.textContent = `A sample of ${v.label}${r ? `, from “${r.title}”` : ''}.`;
      void player.play().catch(() => {});
    } catch (e) { if (!(e instanceof Stopped)) status.textContent = `The sample could not be made: ${errMsg(e)}`; sampler = null; }
    finally { listenBtn.removeAttribute('disabled'); }
  }

  // ---- making the audiobook
  const makeProg = progress();
  const makeLine = h('div', { class: 'small ab-line', 'aria-live': 'polite' });
  const makeBtn = button('Make the audiobook', () => void make(), { variant: 'primary', icon: 'Headphones' });
  const stopBtn = button('Stop', () => stopAll?.(), { variant: 'danger', icon: 'Square' });
  stopBtn.hidden = true;
  const whereSel = canFolder ? select<'page' | 'folder'>([['page', 'Keep them in this page (download when ready)'], ['folder', 'Save them into a folder as they are made']], where, (v) => { where = v; }, 'Where the MP3 files go') : null;

  async function make() {
    if (!book) { toast('Choose a book first.', 'info'); return; }
    const chosen = rows.map((r, i) => ({ r, i })).filter((x) => x.r.include);
    if (!chosen.length) { toast('Choose at least one track.', 'info'); return; }
    const v = voice(), bookTitle = titleIn.value.trim() || book.title, author = authorIn.value.trim();
    const sig = [v.id, speed, kbps, bookTitle, author].join('|');
    // a track already made with these settings (and its title) is kept
    const queue = chosen.filter(({ r }) => !(r.state === 'done' && r.made === `${sig}|${r.title}`));
    let dir: any = null;
    if (where === 'folder' && canFolder) {
      try { dir = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'audiobook' }); } catch (e: any) { if (e?.name === 'AbortError') return; throw e; }
    }
    const n = rows.length, lang3 = LANG3[(book.language || '').slice(0, 2).toLowerCase()];
    // tracks already in the folder (a run that was stopped, or the page closed) are not made again
    if (dir) for (const { r, i } of [...queue]) {
      try { const f = await (await dir.getFileHandle(fileName(i + 1, n, r.title))).getFile(); if (f.size > 1024) { r.state = 'skipped'; resOf(r)?.replaceChildren(h('span', { class: 'muted small' }, `Already in the folder (${fmtBytes(f.size)}).`)); queue.splice(queue.findIndex((q) => q.r === r), 1); } } catch { /* not there */ }
    }
    if (!queue.length) { makeLine.textContent = dir ? 'Every chosen track is in the folder already.' : 'Every chosen track is made already (with this voice, speed and quality).'; return; }
    making = true; makeBtn.hidden = true; stopBtn.hidden = false; listenBtn.setAttribute('disabled', ''); clear(resultBox);
    sampler?.end(); sampler = null;
    wl.on();
    for (const { r } of queue) { r.state = 'queued'; if (r.url) { dropUrl(r.url); r.url = undefined; } r.file = undefined; resOf(r)?.replaceChildren(h('span', { class: 'muted small' }, 'Waiting…')); }
    const totalChars = queue.reduce((s, { r }) => s + r.track.blocks.reduce((a, b) => a + b.text.length, 0), 0) || 1;
    const live = new Map<number, number>();   // chars done of the tracks being made
    let doneChars = 0, speechSec = 0, liveSec = new Map<number, number>(), started = 0, failed = 0, stopped = false;
    const workers: Array<ReturnType<typeof speaker>> = [];
    stopAll = () => { stopped = true; for (const w of workers) w.end(); };
    const show = () => {
      const now = doneChars + [...live.values()].reduce((a, b) => a + b, 0), sec = speechSec + [...liveSec.values()].reduce((a, b) => a + b, 0);
      const el = started ? (performance.now() - started) / 1000 : 0, left = el > 5 && now > 0 ? ((totalChars - now) * el) / now : 0;
      const busy = queue.filter((q) => q.r.state === 'making').map((q) => q.i + 1);
      makeProg.set(now / totalChars, `${Math.round((now / totalChars) * 100)} %`);
      makeLine.textContent = `${busy.length ? `Making track${busy.length > 1 ? 's' : ''} ${busy.join(', ')} · ` : ''}${fmtTime(sec)} of speech made${el > 5 ? ` · ${(sec / el).toFixed(1)}× as fast as it is spoken · ${about(left)} left` : ''}`;
    };
    makeProg.set(0, 'Starting…'); makeLine.textContent = 'Fetching the voice…';
    let next = 0;
    const runner = async (k: number, w: ReturnType<typeof speaker>) => {
      while (!stopped && next < queue.length) {
        const { r, i } = queue[next++];
        r.state = 'making'; resOf(r)?.replaceChildren(h('span', { class: 'muted small' }, 'Making…'));
        const tags: Record<string, string> = { TIT2: r.title, TALB: bookTitle, TPE1: author, TPE2: author, TRCK: `${i + 1}/${n}`, TCON: 'Audiobook' };
        if (lang3) tags.TLAN = lang3;
        try {
          const out = await w.make({ voice: { engine: v.engine as 'kokoro' | 'piper', voice: v.id, lang: v.lang, speaker: v.speaker }, speed, kbps, tags, art, blocks: r.track.blocks.map((b) => ({ kind: b.kind, text: b.text })) }, (m) => {
            if (m.type === 'progress') makeLine.textContent = `Fetching ${m.what}: ${Math.round((m.loaded / m.total) * 100)} %`;
            else if (m.type === 'ready') { if (!started) started = performance.now(); readyOnce(); }
            else if (m.type === 'step') { live.set(i, (m.done / m.of) * r.track.blocks.reduce((a, b) => a + b.text.length, 0)); liveSec.set(i, m.seconds); show(); }
          });
          live.delete(i); liveSec.delete(i);
          doneChars += r.track.blocks.reduce((a, b) => a + b.text.length, 0); speechSec += out.seconds;
          const name = fileName(i + 1, n, r.title);
          if (dir) {
            const fh = await dir.getFileHandle(name, { create: true }), ws = await fh.createWritable();
            await ws.write(out.file); await ws.close();
            r.state = 'done'; r.made = `${sig}|${r.title}`; r.seconds = out.seconds;
            resOf(r)?.replaceChildren(h('span', { class: 'small' }, `Saved into the folder · ${fmtTime(out.seconds)} · ${fmtBytes(out.bytes)}`));
          } else {
            r.state = 'done'; r.made = `${sig}|${r.title}`; r.file = out.file; r.seconds = out.seconds; r.url = urlOf(out.file);
            resOf(r)?.replaceChildren(h('div', { class: 'ab-made' },
              h('audio', { controls: true, src: r.url, preload: 'none', class: 'ab-player', 'aria-label': `Track ${i + 1}: ${r.title}` }),
              h('span', { class: 'muted small' }, `${fmtTime(out.seconds)} · ${fmtBytes(out.bytes)}`),
              button('', () => downloadBlob(out.file, name), { icon: 'Download', small: true, variant: 'ghost', title: `Download ${name}` })));
          }
          show();
        } catch (e) {
          live.delete(i); liveSec.delete(i);
          if (e instanceof Stopped || stopped) { r.state = 'idle'; resOf(r)?.replaceChildren(); return; }
          failed++; r.state = 'error'; r.error = errMsg(e);
          resOf(r)?.replaceChildren(note(`Not made: ${r.error}`, 'err'));
        }
      }
    };
    // the first engine fetches the voice; the others start when it has it (from the browser's cache)
    let readyOnce = () => {};
    const count = Math.min(engineCount(), queue.length);
    const first = speaker('audiobook-speech-1'); workers.push(first);
    const others = new Promise<void>((res) => { readyOnce = () => { readyOnce = () => {}; res(); }; });
    const runs = [runner(0, first)];
    if (count > 1) runs.push(others.then(async () => {
      const more: Array<Promise<void>> = [];
      for (let k = 1; k < count && !stopped && next < queue.length; k++) { const w = speaker(`audiobook-speech-${k + 1}`); workers.push(w); more.push(runner(k, w)); }
      await Promise.all(more);
    }));
    try { await Promise.all(runs); }
    finally {
      readyOnce();
      for (const w of workers) w.end();
      wl.off(); making = false; stopAll = null;
      makeBtn.hidden = false; stopBtn.hidden = true; listenBtn.removeAttribute('disabled');
      for (const { r } of queue) if (r.state === 'queued') { r.state = 'idle'; resOf(r)?.replaceChildren(); }
      makeProg.done();
      const made = rows.filter((r) => r.state === 'done' || r.state === 'skipped');
      makeLine.textContent = stopped ? `Stopped. ${made.length} of ${chosen.length} track${chosen.length === 1 ? '' : 's'} made${dir ? ' (in the folder: the next run carries on from there)' : ''}.` : failed ? `${failed} track${failed === 1 ? '' : 's'} could not be made.` : `Done: ${made.length} track${made.length === 1 ? '' : 's'}, ${fmtTime(rows.reduce((s, r) => s + (r.state === 'done' ? r.seconds || 0 : 0), 0))} of speech.`;
      if (!dir) showResult(bookTitle, author);
    }
  }

  /** every MP3 of this page in one zip, with a playlist (.m3u) */
  function showResult(bookTitle: string, author: string) {
    clear(resultBox);
    const done = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.state === 'done' && r.file);
    if (!done.length) return;
    const size = done.reduce((s, { r }) => s + (r.file?.size || 0), 0), folder = folderName(bookTitle);
    const zip = async () => {
      const { Zip, ZipPassThrough } = await import('fflate');
      const chunks: Uint8Array[] = [];
      const z = new Zip((err, chunk) => { if (err) throw err; chunks.push(chunk); });
      const add = async (name: string, bytes: Uint8Array) => { const f = new ZipPassThrough(`${folder}/${name}`); z.add(f); f.push(bytes, true); };
      let m3u = '#EXTM3U\n';
      for (const { r, i } of done) {
        const name = fileName(i + 1, rows.length, r.title);
        await add(name, new Uint8Array(await r.file!.arrayBuffer()));
        m3u += `#EXTINF:${Math.round(r.seconds || 0)},${author ? `${author} - ` : ''}${r.title}\n${name}\n`;
      }
      await add(`${folder}.m3u`, new TextEncoder().encode(m3u));
      z.end();
      return new Blob(chunks as BlobPart[], { type: 'application/zip' });
    };
    resultBox.append(card('The audiobook',
      h('p', { class: 'small' }, `${done.length} MP3 file${done.length === 1 ? '' : 's'} · ${fmtBytes(size)} · each with its title, the book’s title and author, its number${art ? ' and the cover' : ''}. Any music or audiobook player plays them in order (the files’ numbers, or the playlist in the zip).`),
      actions(
        button('Download all (.zip)', async () => { const z = await zip(); downloadBlob(z, `${folder}.zip`); }, { variant: 'primary', icon: 'Download' }),
        ctx.isMobile ? button('Share', async () => shareOrDownload(await zip(), `${folder}.zip`), { icon: 'Share2' }) : null)));
  }

  root.append(
    card('Book', picker, readProg, status, note('The book never leaves this device: its text is read, and spoken, here.')),
    bookBox, chapterBox,
    card('Voice',
      field('Voice', vsel, voiceHint),
      speedSl,
      field('MP3 quality (mono)', kbpsSel),
      pc ? field('Speech engines at once', enginesSel, 'Each makes speech on a processor core of its own (and takes about 400 MB of memory): two or three make a long book that many times sooner.') : null,
      h('div', { class: 'row' }, listenBtn), player),
    card('Make',
      whereSel ? field('Where the MP3 files go', whereSel, 'A folder keeps each track as soon as it is made; a folder that already holds some of them is carried on from.') : null,
      note(pc ? 'Keep this page open while it works; a long book takes hours. A laptop on battery may pause a tab in the background — keep it plugged in.' : 'Keep this page open and the screen on while it works (the screen is kept on for you); a long book takes hours on a phone — a PC is many times faster.'),
      makeProg, makeLine, actions(makeBtn, stopBtn)),
    resultBox,
  );
  root.addEventListener('dragover', (e) => e.preventDefault());
  root.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); void pick(f); } });
  return () => { stopAll?.(); wl.dispose(); };
};
