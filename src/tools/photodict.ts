// Photo Dictionary (PC + mobile — owner, 21 Nov 2026; it was mobile only): photograph a page (book, newspaper, Kindle)
// with the phone's back camera or the PC's webcam (the shared live camera of every picture tab), or choose a photo → OCR (Tesseract wasm) →
// rank the words by English frequency in textcore.wasm (own C) → every uncommon word, rarest first, with its meanings from
// the bundled English Wiktionary (words the bundle lacks are looked up online one word at a time: Wiktionary, then the
// Free Dictionary API) and a short Wikipedia summary under it. The page's text comes first, its words broken over two
// lines put together (t_dehyphen); a tap looks a word up, a selected phrase is looked up on Wikipedia (owner, 21 Nov
// 2026 — the upgrade: CLAUDE.md §3 Photo Dictionary).
import literata400 from '@fontsource/literata/files/literata-latin-400-normal.woff2?url';
import literata400i from '@fontsource/literata/files/literata-latin-400-italic.woff2?url';
import literata600 from '@fontsource/literata/files/literata-latin-600-normal.woff2?url';
import { h, card, stack, note, toggle, button, progress, errMsg, copy, downloadBlob, type Mount } from '../ui';
import { isMobile } from '../platform';
import { imgproc, type Img } from '../wasm/imgproc';
import { previewOf, paint } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { recognize, type OcrResult } from '../lib/ocr';
import { straighten } from '../lib/pagecrop';
import { hardWords, lookupWord, rarity, ranker, type WordCard, type Result } from '../lib/dictionary';
import { wikiSummary, type Summary } from '../lib/wikipedia';
import { onLeave } from '../lifecycle';

let fontsReady: Promise<void> | null = null;
const loadFonts = () => (fontsReady ||= (async () => {
  for (const [url, style, weight] of [[literata400, 'normal', '400'], [literata400i, 'italic', '400'], [literata600, 'normal', '600']]) {
    try { const f = new FontFace('Literata', `url(${url})`, { style, weight }); await f.load(); document.fonts.add(f); } catch { /* serif fallback */ }
  }
})());

const SRC_LABEL: Record<WordCard['source'], string> = { local: '', wiktionary: 'from Wiktionary online', dictionaryapi: 'from the Free Dictionary online' };

/** One dictionary card: word · rarity, part of speech · pronunciation, 1–3 senses (all on tap). */
export function wordCard(c: WordCard, open = false): HTMLElement {
  const senses = c.entries.flatMap((e) => e.senses.map((s) => ({ ...s, pos: e.pos })));
  const first = c.entries[0];
  const shown = open ? senses : senses.slice(0, 3);
  const list = h('ol', { class: 'pd-senses' });
  const render = (items: typeof senses) => list.replaceChildren(...items.map((s, i) => h('li', null,
    i > 0 && s.pos !== items[i - 1].pos ? h('span', { class: 'pd-pos2' }, `${s.pos} · `) : null,
    s.t ? h('span', { class: 'pd-label' }, `(${s.t}) `) : null, s.g,
    s.x ? h('div', { class: 'pd-ex' }, `“${s.x}”`) : null)));
  render(shown);
  const more = senses.length > shown.length ? button(`More meanings (${senses.length - shown.length})`, () => { render(senses); more!.remove(); }, { small: true, variant: 'ghost' }) : null;
  return h('article', { class: 'pd-card', 'data-word': c.word },
    h('header', { class: 'pd-head' }, h('h3', { class: 'pd-word' }, c.word), h('span', { class: 'pd-rarity' }, rarity(c.z))),
    h('div', { class: 'pd-meta' }, [first?.pos, first?.ipa].filter(Boolean).join(' · '),
      c.note ? h('span', { class: 'pd-note' }, ` · ${c.note}`) : null,
      c.seen !== c.word.toLowerCase() && !c.note ? h('span', { class: 'pd-note' }, ` · on the page: “${c.seen}”`) : null),
    list, more,
    c.source !== 'local' ? h('div', { class: 'pd-src' }, SRC_LABEL[c.source]) : null);
}

/** The Wikipedia box under a meaning (or alone, for a phrase): a summary in plain text and a link to the article. */
export function wikiBox(term: string, load: (show: () => void) => void): HTMLElement {
  const body = h('div', { class: 'pd-wiki-body small muted' }, 'Looking up Wikipedia…');
  const box = h('aside', { class: 'pd-wiki', 'aria-label': `Wikipedia: ${term}` }, h('div', { class: 'pd-wiki-k' }, 'Wikipedia'), body);
  const show = () => {
    body.className = 'pd-wiki-body small muted'; body.textContent = 'Looking up Wikipedia…';
    wikiSummary(term).then((s: Summary) => {
      if (s.kind === 'none') { body.textContent = `No Wikipedia article for “${term}”.`; return; }
      const link = h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.kind === 'several' ? `See them on Wikipedia ↗` : 'Read on Wikipedia ↗');
      body.className = 'pd-wiki-body';
      body.replaceChildren(...(s.kind === 'several'
        ? [h('span', null, `“${s.title}” has several meanings on Wikipedia. `), link]
        : [h('strong', null, s.title), ' — ', s.text, ' ', link]));
    }, (e) => {
      body.replaceChildren(`Wikipedia could not be reached (${errMsg(e)}). `, button('Try again', () => show(), { small: true, variant: 'ghost' }));
    });
  };
  load(show);
  return box;
}

export const mount: Mount = (root, ctx) => {
  let online = true, screen = false, wiki = true, last: Result | null = null, busy = false, gone = false;
  // the Wikipedia boxes load as they come near the screen (a page of 40 words does not send 40 requests at once)
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); (e.target as any).__show?.(); } }, { rootMargin: '300px 0px' });
  const lazily = (el: HTMLElement) => (show: () => void) => { (el as any).__show = show; requestAnimationFrame(() => io.observe(el)); };
  const withWiki = (card: HTMLElement, term: string) => { if (wiki) card.append(wikiBox(term, lazily(card))); return card; };
  /** a photo chosen while another is being read: it is read next, and the older result is not shown */
  let pending: Img | null = null, pendingFile: File | null = null;
  /** the photo as it was taken or chosen (owner, 21 Nov 2026: to send one that read badly — a Snap is one frame of the
   *  camera's live picture, not the camera app's photo, so only the tab can save it) */
  let photo: File | null = null;
  const saveBtn = button('Save this photo', () => { if (photo) downloadBlob(photo, photo.name); }, { small: true, variant: 'ghost', icon: 'Download', title: 'The picture that was read, as it was taken or chosen' });
  saveBtn.hidden = true;
  const thumb = h('canvas', { class: 'pd-thumb', 'aria-label': 'Your photo' });
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const cards = h('div', { class: 'pd-list' });
  const looked = h('div', { class: 'pd-looked' });
  const extra = h('div', { class: 'stack' });
  const textBox = h('div', { class: 'pd-text' });
  const results = h('div', { class: 'stack', hidden: true });

  // ---------------------------------------------------------------- pipeline
  const run = async (img: Img, file: File | null = null): Promise<void> => {
    if (busy) { // the engine is busy with the photo before: this one is read as soon as it is free
      pending = img; pendingFile = file; photo = file; saveBtn.hidden = !file; paint(previewOf(img, 480), thumb); cards.replaceChildren(); extra.replaceChildren(); textBox.replaceChildren(); bar.hidden = true; last = null;
      status.textContent = 'A new photo — it is read as soon as the one before is done.';
      return;
    }
    busy = true;
    photo = file; saveBtn.hidden = !file;
    const stale = () => gone || pending !== null; // a newer photo is waiting, or the tab was left
    results.hidden = false; bar.hidden = true; cards.replaceChildren(); looked.replaceChildren(); extra.replaceChildren(); textBox.replaceChildren(); last = null;
    phrases.length = 0; selBtn.hidden = true; // the phrases of the page before go with it
    status.textContent = ''; // the line said the page before's result while the new one was read
    paint(previewOf(img, 480), thumb);
    try {
      // camera photos: ≤ 3000 px; the page found and straightened (a Kindle's screen in its black body, a sheet on a
      // table: src/lib/pagecrop.ts); optional moiré removal for screens; then the document clean-up (grey, even light)
      let work = img; const L = Math.max(img.width, img.height);
      if (L > 3000) work = await imgproc('resize', work, Math.round((work.width * 3000) / L), Math.round((work.height * 3000) / L));
      const whole = work, page = await straighten(work).catch(() => ({ img: work, found: false })); // no page: the photo as it is
      const clean = async (im: Img) => imgproc('docEnhance', screen ? await imgproc('blur', im, 1.1) : im, 1);
      ranker().catch(() => {}); loadFonts(); // word list + reading font load while OCR runs
      const read = async (im: Img) => recognize(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), 'eng', (p, s) => prog.set(s.includes('recogn') ? p : null, s.includes('recogn') ? `Reading the page… ${Math.round(p * 100)} %` : 'Loading the text engine…'));
      let r: OcrResult = await read(await clean(page.img));
      if (stale()) return;
      // an outline that was not the page (little read on it): the whole photo is read too, and the better reading kept
      if (page.found && r.words.length < 25) { const r2 = await read(await clean(whole)); if (stale()) return; if (r2.words.length > r.words.length) r = r2; }
      if (!r.text.trim()) { prog.done(); status.textContent = isMobile ? 'No text found. Hold the phone straight over the page, in good light, and try again.' : 'No text found. Hold the page flat and close to the webcam, in good light, and try again — or choose a photo of it.'; return; }
      // the words broken over two lines put together, for the text shown, a tap, a selection and the ranking
      const text = (await ranker()).dehyphen(r.text);
      if (stale()) return;
      showText(text);
      prog.set(null, 'Finding the uncommon words…');
      const res = await hardWords(text, { max: Infinity, online, onProgress: (d, n) => { if (!stale()) prog.set(n ? d / n : null, 'Looking up words…'); } });
      if (stale()) return;
      last = res; prog.done();
      cards.replaceChildren(...phrases, ...res.cards.map((c) => withWiki(wordCard(c), c.word)));
      bar.hidden = !res.cards.length;
      status.textContent = res.cards.length
        ? `${res.cards.length} uncommon word${res.cards.length > 1 ? 's' : ''}, rarest first · ${r.words.length} words read${res.online.tried ? ` · ${res.online.tried} looked up online` : ''}`
        : 'No uncommon words on this page — tap any word in the text to look it up.';
      if (res.online.failed) extra.append(note('Some words could not be looked up online (no connection?). Results from the dictionary in this app are shown.', 'warn'));
      if (res.notFound.length) extra.append(h('details', { class: 'pd-more' }, h('summary', null, `Not found (${res.notFound.length})`), h('p', { class: 'small' }, res.notFound.join(', '), h('br'), h('span', { class: 'muted' }, 'Usually misread letters or very rare names. Tap a word in the text below to try it.'))));
      if (res.names.length) extra.append(h('details', { class: 'pd-more' }, h('summary', null, `Names skipped (${res.names.length})`), h('p', { class: 'small' }, res.names.join(', '))));
    } catch (e) { if (!stale()) { prog.done(); status.textContent = `Something went wrong: ${errMsg(e)}`; } }
    finally {
      busy = false;
      if (pending && !gone) { const next = pending, f = pendingFile; pending = null; pendingFile = null; return run(next, f); }
    }
  };

  // the page's text first: a tap on a word looks it up; a selected phrase is looked up on Wikipedia (the words are text
  // a person can select — not buttons — and a tap that ends a selection is not a look-up)
  const phrases: HTMLElement[] = [];
  const selBtn = h('button', { type: 'button', class: 'pd-selbtn', hidden: true }, 'Look up on Wikipedia');
  let selText = '';
  const inText = (n: Node | null) => !!n && textBox.contains(n);
  const selected = () => { const s = getSelection(); return s && !s.isCollapsed && s.rangeCount && inText(s.getRangeAt(0).commonAncestorContainer) ? s : null; };
  const showText = (text: string) => {
    const seg = new Intl.Segmenter('en', { granularity: 'word' });
    const frag = document.createDocumentFragment();
    for (const s of seg.segment(text)) {
      if (!(s.isWordLike && /\p{L}/u.test(s.segment))) { frag.append(document.createTextNode(s.segment)); continue; }
      // a word is not a focusable element of its own: a drag over focusable words selects nothing in Chromium — the
      // keyboard goes from word to word in the text box instead (one tab stop: the arrow keys, Enter)
      const w = h('span', { class: 'pd-tok' }, s.segment);
      w.addEventListener('click', () => { if (!selected()) void tap(s.segment); });
      frag.append(w);
    }
    const body = h('p', { class: 'pd-textbody', tabindex: '0', 'aria-label': 'The page’s text — the arrow keys go from word to word, Enter looks the word up' }, frag);
    const words = [...body.querySelectorAll('.pd-tok')] as HTMLElement[], say = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    let kw = -1;
    body.addEventListener('keydown', (e) => {
      const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
      if (words.length && (step || e.key === 'Home' || e.key === 'End')) {
        e.preventDefault();
        words[kw]?.classList.remove('pd-kw');
        kw = e.key === 'Home' ? 0 : e.key === 'End' ? words.length - 1 : Math.max(0, Math.min(words.length - 1, (kw < 0 ? (step > 0 ? -1 : words.length) : kw) + step));
        words[kw].classList.add('pd-kw'); words[kw].scrollIntoView({ block: 'nearest' });
        say.textContent = words[kw].textContent || '';
      } else if ((e.key === 'Enter' || e.key === ' ') && kw >= 0) { e.preventDefault(); void tap(words[kw].textContent || ''); }
    });
    body.addEventListener('blur', () => { words[kw]?.classList.remove('pd-kw'); kw = -1; });
    const all = button('Show all the text', () => { body.classList.remove('pd-clip'); all.remove(); }, { small: true, variant: 'ghost' });
    textBox.replaceChildren(h('h2', { class: 'pd-text-h' }, 'The page’s text'),
      h('div', { class: 'muted small' }, 'Tap a word to look it up · select a phrase to look it up on Wikipedia'), body, selBtn, say);
    if (isMobile) { body.classList.add('pd-clip'); requestAnimationFrame(() => { if (body.scrollHeight > body.clientHeight + 4) body.after(all); else body.classList.remove('pd-clip'); }); }
  };
  const onSelection = () => {
    const s = selected(), t = s ? s.toString().replace(/\s+/g, ' ').trim() : '';
    if (!s || t.length < 2 || t.length > 120 || !/\p{L}/u.test(t)) { selBtn.hidden = true; return; }
    selText = t;
    const box = textBox.getBoundingClientRect(), r = s.getRangeAt(0).getBoundingClientRect();
    selBtn.hidden = false;
    // under the selection (a phone shows its own menu above it), within the card
    const left = Math.max(8, Math.min(r.left - box.left, box.width - selBtn.offsetWidth - 8));
    Object.assign(selBtn.style, { top: `${r.bottom - box.top + (isMobile ? 28 : 8)}px`, left: `${left}px` });
  };
  let selTimer = 0;
  const onSelChange = () => { clearTimeout(selTimer); selTimer = window.setTimeout(onSelection, 120); };
  document.addEventListener('selectionchange', onSelChange);
  onLeave('photodict-selection', () => document.removeEventListener('selectionchange', onSelChange));
  selBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // a press keeps the selection (and its text)
  selBtn.addEventListener('click', () => { addPhrase(selText); getSelection()?.removeAllRanges(); selBtn.hidden = true; });
  /** A selected phrase: a card of its own at the top of the list, with its Wikipedia box (a phrase has no dictionary
   *  entry); the same phrase again moves its card to the top. */
  const addPhrase = (t: string) => {
    const key = t.toLowerCase(), had = phrases.findIndex((p) => p.dataset.phrase === key);
    if (had >= 0) phrases.splice(had, 1)[0].remove();
    const card = h('article', { class: 'pd-card pd-phrase', 'data-phrase': key },
      h('header', { class: 'pd-head' }, h('h3', { class: 'pd-word' }, `“${t}”`),
        h('button', { type: 'button', class: 'pd-x', 'aria-label': `Remove “${t}”`, onclick: () => { card.remove(); phrases.splice(phrases.indexOf(card), 1); } }, '✕')),
      h('div', { class: 'pd-meta' }, 'a phrase from the page'));
    card.append(wikiBox(t, (show) => show()));
    phrases.unshift(card);
    cards.prepend(card);
    card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  };
  const tap = async (word: string) => {
    looked.replaceChildren(h('div', { class: 'muted small' }, `Looking up “${word}”…`));
    try {
      const c = await lookupWord(word, online);
      looked.replaceChildren(c ? withWiki(wordCard(c, true), c.word) : note(`“${word}” is not in the dictionary${online ? '' : ' in this app (online look-up is off)'}.`, 'info'),
        button('Close', () => looked.replaceChildren(), { small: true, variant: 'ghost' }));
      looked.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } catch (e) { looked.replaceChildren(note(errMsg(e), 'err')); }
  };

  // ---------------------------------------------------------------- input: the camera (phone: back; PC: webcam) or a photo
  // the shared live camera of every picture tab (src/lib/livecam.ts): Snap gives the frame at full size; a photo chosen
  // instead closes it; leaving the tab closes it. The reading runs on its own (the picker is free for the next photo).
  const input$ = imageInput((img, file) => { void run(img, file); }, { label: 'Choose a photo of a page', instead: 'choose a photo of the page instead' });
  const shareBtn = button('Share list', () => shareList(), { icon: 'Share2' });
  const bar = h('div', { class: 'actions', hidden: true }, shareBtn); // phones: a fixed bar, once there is a list to share

  const shareList = async () => {
    if (!last?.cards.length) throw new Error('Take a photo first.');
    const text = last.cards.map((c) => `${c.word} (${c.entries[0]?.pos || ''}): ${c.entries[0]?.senses[0]?.g || ''}`).join('\n');
    if (navigator.share) { try { await navigator.share({ title: 'Hard words', text }); return; } catch (e: any) { if (e?.name === 'AbortError') return; } }
    await copy(text);
  };

  results.append(
    card(null, h('div', { class: 'pd-top' }, thumb, h('div', { class: 'stack' }, prog, status, h('div', null, saveBtn)))),
    textBox, looked, cards, extra,
    h('p', { class: 'muted small pd-attr' }, 'Definitions: English Wiktionary (CC BY-SA 4.0 / GFDL), extracted by wiktextract / kaikki.org. Word frequencies: wordfreq by Robyn Speer (CC BY-SA 4.0). Summaries: Wikipedia (CC BY-SA 4.0). Online look-ups send only the single word, or the phrase you chose.'));
  root.append(
    card(null, stack(
      h('p', { class: 'pd-intro' }, 'Photograph a page of a book, newspaper or Kindle. You get its uncommon words, rarest first, with their meanings and a short Wikipedia summary.'),
      input$.el,
      toggle('Photo of a screen (Kindle, phone, monitor)', false, (v) => (screen = v)),
      toggle('Look up missing words online (sends only that word)', true, (v) => (online = v)),
      toggle('A Wikipedia summary under each word (sends only that word)', true, (v) => (wiki = v)))),
    results,
    bar);
  return () => { gone = true; pending = null; input$.dispose(); io.disconnect(); clearTimeout(selTimer); document.removeEventListener('selectionchange', onSelChange); };
};
