// Photo Dictionary (PC + mobile — owner, 21 Nov 2026; it was mobile only): photograph a page (book, newspaper, Kindle)
// with the phone's back camera or the PC's webcam (the shared live camera of every picture tab), or choose a photo → OCR (Tesseract wasm) →
// rank the words by English frequency in textcore.wasm (own C) → the 20 hardest with meanings from the bundled English
// Wiktionary; words the bundle lacks are looked up online one word at a time (Wiktionary, then Free Dictionary API).
import literata400 from '@fontsource/literata/files/literata-latin-400-normal.woff2?url';
import literata400i from '@fontsource/literata/files/literata-latin-400-italic.woff2?url';
import literata600 from '@fontsource/literata/files/literata-latin-600-normal.woff2?url';
import { h, card, stack, note, toggle, button, progress, errMsg, copy, type Mount } from '../ui';
import { isMobile } from '../platform';
import { imgproc, type Img } from '../wasm/imgproc';
import { previewOf, paint } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { recognize } from '../lib/ocr';
import { hardWords, lookupWord, rarity, ranker, type WordCard, type Result } from '../lib/dictionary';

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

export const mount: Mount = (root, ctx) => {
  let online = true, screen = false, last: Result | null = null, busy = false, gone = false;
  /** a photo chosen while another is being read: it is read next, and the older result is not shown */
  let pending: Img | null = null;
  const thumb = h('canvas', { class: 'pd-thumb', 'aria-label': 'Your photo' });
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const cards = h('div', { class: 'pd-list' });
  const looked = h('div', { class: 'pd-looked' });
  const extra = h('div', { class: 'stack' });
  const textBox = h('div', { class: 'pd-text' });
  const results = h('div', { class: 'stack', hidden: true });

  // ---------------------------------------------------------------- pipeline
  const run = async (img: Img): Promise<void> => {
    if (busy) { // the engine is busy with the photo before: this one is read as soon as it is free
      pending = img; paint(previewOf(img, 480), thumb); cards.replaceChildren(); extra.replaceChildren(); textBox.replaceChildren(); bar.hidden = true; last = null;
      status.textContent = 'A new photo — it is read as soon as the one before is done.';
      return;
    }
    busy = true;
    const stale = () => gone || pending !== null; // a newer photo is waiting, or the tab was left
    results.hidden = false; bar.hidden = true; cards.replaceChildren(); looked.replaceChildren(); extra.replaceChildren(); textBox.replaceChildren(); last = null;
    paint(previewOf(img, 480), thumb);
    try {
      // camera photos: ≤ 3000 px, optional moiré removal for screens, then the document clean-up (grey, even light)
      let work = img; const L = Math.max(img.width, img.height);
      if (L > 3000) work = await imgproc('resize', work, Math.round((work.width * 3000) / L), Math.round((work.height * 3000) / L));
      if (screen) work = await imgproc('blur', work, 1.1);
      work = await imgproc('docEnhance', work, 1);
      ranker().catch(() => {}); loadFonts(); // word list + reading font load while OCR runs
      const r = await recognize(new ImageData(new Uint8ClampedArray(work.data), work.width, work.height), 'eng', (p, s) => prog.set(s.includes('recogn') ? p : null, s.includes('recogn') ? `Reading the page… ${Math.round(p * 100)} %` : 'Loading the text engine…'));
      if (stale()) return;
      if (!r.text.trim()) { prog.done(); status.textContent = isMobile ? 'No text found. Hold the phone straight over the page, in good light, and try again.' : 'No text found. Hold the page flat and close to the webcam, in good light, and try again — or choose a photo of it.'; return; }
      showText(r.text);
      prog.set(null, 'Finding the hardest words…');
      const res = await hardWords(r.text, { max: 20, online, onProgress: (d, n) => { if (!stale()) prog.set(n ? d / n : null, 'Looking up words…'); } });
      if (stale()) return;
      last = res; prog.done();
      cards.replaceChildren(...res.cards.map((c) => wordCard(c)));
      bar.hidden = !res.cards.length;
      status.textContent = res.cards.length
        ? `${res.cards.length} hardest word${res.cards.length > 1 ? 's' : ''}, rarest first · ${r.words.length} words read${res.online.tried ? ` · ${res.online.tried} looked up online` : ''}`
        : 'No hard words on this page — everything here is common English.';
      if (res.online.failed) extra.append(note('Some words could not be looked up online (no connection?). Results from the dictionary in this app are shown.', 'warn'));
      if (res.notFound.length) extra.append(h('details', { class: 'pd-more' }, h('summary', null, `Not found (${res.notFound.length})`), h('p', { class: 'small' }, res.notFound.join(', '), h('br'), h('span', { class: 'muted' }, 'Usually misread letters or very rare names. Tap a word in the text below to try it.'))));
      if (res.names.length) extra.append(h('details', { class: 'pd-more' }, h('summary', null, `Names skipped (${res.names.length})`), h('p', { class: 'small' }, res.names.join(', '))));
    } catch (e) { if (!stale()) { prog.done(); status.textContent = `Something went wrong: ${errMsg(e)}`; } }
    finally {
      busy = false;
      if (pending && !gone) { const next = pending; pending = null; return run(next); }
    }
  };

  // recognised text: every word can be tapped to look it up
  const showText = (text: string) => {
    const seg = new Intl.Segmenter('en', { granularity: 'word' });
    const frag = document.createDocumentFragment();
    for (const s of seg.segment(text)) frag.append(s.isWordLike && /\p{L}/u.test(s.segment) ? h('button', { type: 'button', class: 'pd-tok', onclick: () => tap(s.segment) }, s.segment) : document.createTextNode(s.segment));
    textBox.replaceChildren(h('details', { class: 'pd-more' }, h('summary', null, 'Recognised text — tap any word to look it up'), h('p', { class: 'pd-textbody' }, frag)));
  };
  const tap = async (word: string) => {
    looked.replaceChildren(h('div', { class: 'muted small' }, `Looking up “${word}”…`));
    try {
      const c = await lookupWord(word, online);
      looked.replaceChildren(c ? wordCard(c, true) : note(`“${word}” is not in the dictionary${online ? '' : ' in this app (online look-up is off)'}.`, 'info'),
        button('Close', () => looked.replaceChildren(), { small: true, variant: 'ghost' }));
      looked.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } catch (e) { looked.replaceChildren(note(errMsg(e), 'err')); }
  };

  // ---------------------------------------------------------------- input: the camera (phone: back; PC: webcam) or a photo
  // the shared live camera of every picture tab (src/lib/livecam.ts): Snap gives the frame at full size; a photo chosen
  // instead closes it; leaving the tab closes it. The reading runs on its own (the picker is free for the next photo).
  const input$ = imageInput((img) => { void run(img); }, { label: 'Choose a photo of a page', instead: 'choose a photo of the page instead' });
  const shareBtn = button('Share list', () => shareList(), { icon: 'Share2' });
  const bar = h('div', { class: 'actions', hidden: true }, shareBtn); // phones: a fixed bar, once there is a list to share

  const shareList = async () => {
    if (!last?.cards.length) throw new Error('Take a photo first.');
    const text = last.cards.map((c) => `${c.word} (${c.entries[0]?.pos || ''}): ${c.entries[0]?.senses[0]?.g || ''}`).join('\n');
    if (navigator.share) { try { await navigator.share({ title: 'Hard words', text }); return; } catch (e: any) { if (e?.name === 'AbortError') return; } }
    await copy(text);
  };

  results.append(
    card(null, h('div', { class: 'pd-top' }, thumb, h('div', { class: 'stack' }, prog, status))),
    looked, cards, extra, textBox,
    h('p', { class: 'muted small pd-attr' }, 'Definitions: English Wiktionary (CC BY-SA 4.0 / GFDL), extracted by wiktextract / kaikki.org. Word frequencies: wordfreq by Robyn Speer (CC BY-SA 4.0). Online look-ups send only the single missing word.'));
  root.append(
    card(null, stack(
      h('p', { class: 'pd-intro' }, 'Photograph a page of a book, newspaper or Kindle. You get its 20 hardest words, rarest first, with their meanings.'),
      input$.el,
      toggle('Photo of a screen (Kindle, phone, monitor)', false, (v) => (screen = v)),
      toggle('Look up missing words online (sends only that word)', true, (v) => (online = v)))),
    results,
    bar);
  return () => { gone = true; pending = null; input$.dispose(); };
};
