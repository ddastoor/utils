// Photo Dictionary (mobile only, owner request): photograph a page (book, newspaper, Kindle) → OCR (Tesseract wasm) →
// rank the words by English frequency in textcore.wasm (own C) → the 20 hardest with meanings from the bundled English
// Wiktionary; words the bundle lacks are looked up online one word at a time (Wiktionary, then Free Dictionary API).
import literata400 from '@fontsource/literata/files/literata-latin-400-normal.woff2?url';
import literata400i from '@fontsource/literata/files/literata-latin-400-italic.woff2?url';
import literata600 from '@fontsource/literata/files/literata-latin-600-normal.woff2?url';
import { h, card, stack, note, toggle, button, progress, toast, errMsg, copy, type Mount } from '../ui';
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
      pending = img; paint(previewOf(img, 480), thumb); cards.replaceChildren(); extra.replaceChildren(); textBox.replaceChildren(); shareBtn.hidden = true; last = null;
      status.textContent = 'A new photo — it is read as soon as the one before is done.';
      return;
    }
    busy = true;
    const stale = () => gone || pending !== null; // a newer photo is waiting, or the tab was left
    results.hidden = false; shareBtn.hidden = true; cards.replaceChildren(); looked.replaceChildren(); extra.replaceChildren(); textBox.replaceChildren(); last = null;
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
      if (!r.text.trim()) { prog.done(); status.textContent = 'No text found. Hold the phone straight over the page, in good light, and try again.'; return; }
      showText(r.text);
      prog.set(null, 'Finding the hardest words…');
      const res = await hardWords(r.text, { max: 20, online, onProgress: (d, n) => { if (!stale()) prog.set(n ? d / n : null, 'Looking up words…'); } });
      if (stale()) return;
      last = res; prog.done();
      cards.replaceChildren(...res.cards.map((c) => wordCard(c)));
      shareBtn.hidden = !res.cards.length;
      status.textContent = res.cards.length
        ? `${res.cards.length} hardest word${res.cards.length > 1 ? 's' : ''}, rarest first · ${r.words.length} words read${res.online.tried ? ` · ${res.online.tried} looked up online` : ''}`
        : 'No hard words on this page — everything here is common English.';
      if (res.online.failed) extra.append(note('Some words could not be looked up online (no connection?). Results from the dictionary on this phone are shown.', 'warn'));
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
      looked.replaceChildren(c ? wordCard(c, true) : note(`“${word}” is not in the dictionary${online ? '' : ' on this phone (online look-up is off)'}.`, 'info'),
        button('Close', () => looked.replaceChildren(), { small: true, variant: 'ghost' }));
      looked.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { looked.replaceChildren(note(errMsg(e), 'err')); }
  };

  // ---------------------------------------------------------------- input: live back camera or a photo
  const video = h('video', { class: 'pd-video', autoplay: true, muted: true, playsInline: true } as any) as HTMLVideoElement;
  let stream: MediaStream | null = null;
  const camBox = h('div', { class: 'pd-cam', hidden: true }, video);
  const stopCam = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; camBox.hidden = true; camCtl.hidden = true; startBtn.hidden = false; };
  const startCam = async () => {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }); }
    catch (e) { toast(`Camera unavailable: ${errMsg(e)} — use “Choose a photo”.`, 'err'); return; }
    video.srcObject = stream; camBox.hidden = false; camCtl.hidden = false; startBtn.hidden = true;
  };
  const snap = async () => {
    // the first frame may not have arrived yet: wait for it (up to 5 s) instead of doing nothing
    if (!video.videoWidth) await new Promise<void>((res) => { const t = setTimeout(res, 5000); video.addEventListener('loadeddata', () => { clearTimeout(t); res(); }, { once: true }); });
    if (!video.videoWidth) { toast('The camera sends no picture — try again, or use “Choose a photo”.', 'err'); return; }
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(video, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    stopCam();
    await run({ data: d.data, width: d.width, height: d.height });
  };
  const startBtn = button('Use camera', startCam, { variant: 'primary', icon: 'Camera' });
  const shareBtn = button('Share list', () => shareList(), { icon: 'Share2' }); shareBtn.hidden = true;
  const camCtl = h('div', { class: 'row', hidden: true }, button('Snap', snap, { variant: 'primary', icon: 'Camera' }), button('Cancel', stopCam, { variant: 'ghost' }));
  const input$ = imageInput((img) => { stopCam(); run(img); }, { label: 'Choose a photo of a page' });

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
      camBox, camCtl, input$.el,
      toggle('Photo of a screen (Kindle, phone, monitor)', false, (v) => (screen = v)),
      toggle('Look up missing words online (sends only that word)', true, (v) => (online = v)))),
    results,
    h('div', { class: 'actions' }, startBtn, shareBtn)); // sticky bottom bar on phones: the main action
  return () => { gone = true; pending = null; stopCam(); input$.dispose(); };
};
