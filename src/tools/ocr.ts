// OCR: photo / scan / screenshot → text in English, French, Spanish or German (Tesseract LSTM in WebAssembly). The reading
// is the Photo Dictionary's own (src/lib/readpage.ts — to-do #18, owner, 26 Nov 2026: "make the ocr app's ocr capability
// the same quality as the Photo Dictionary's"): a photographed page found and straightened, set upright and level, cleaned
// up, its ruled lines and list marks cleared, a page of columns read column by column. The text keeps the page's lists
// (src/lib/listtext.ts — to-do #31): the marks put back at the line starts, nested items indented. Low-confidence words
// highlighted, copy / .txt download. Pictures can be turned by hand; a picture that reads badly is tried the other ways round.
// A picture comes from a file or from the camera (the phone's back camera, the PC's webcam: src/lib/livecam.ts).
import { h, card, field, segmented, toggle, stack, note, progress, button, actions, copy, downloadBlob, shareOrDownload, baseName, reveal, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { previewOf, paint } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import type { OcrLang } from '../lib/ocr';
import { readPage, readsPoorly, unsureWord, secondWords } from '../lib/readpage';
import { listText } from '../lib/listtext';
import { uprightWords, turnWords, ROT } from '../lib/upright';

export const mount: Mount = (root, ctx) => {
  // handTurned: the picture was turned with the buttons — then it is read as it is shown, never turned on its own
  let src: Img | null = null, name = 'text', lang: OcrLang = 'eng', clean = true, turns = 0, seq = 0, alive = true, handTurned = false;
  const canvas = h('canvas', { class: 'ed-canvas' });
  const boxes = h('div', { class: 'ocr-boxes' });
  const stage = h('div', { class: 'crop-wrap' }, canvas, boxes);
  const prog = progress();
  const out = h('textarea', { class: 'input textarea ocr-text', rows: 12, 'aria-label': 'Recognised text', spellcheck: 'false' }) as HTMLTextAreaElement;
  const info = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const editor = h('div', { class: 'stack', hidden: true });
  const turned = async (img: Img, t: number) => (t ? imgproc('orient', img, ROT[t]) : img);
  const show = async () => {
    if (!src) return;
    const my = seq, img = await turned(previewOf(src, 1400), turns);
    if (my === seq && alive) paint(img, canvas);
  };
  const forget = () => { seq++; out.value = ''; info.textContent = ''; boxes.replaceChildren(); prog.done(); };
  const run = async () => {
    if (!src) throw new Error('Choose an image first.');
    const my = ++seq, from = src, t0 = performance.now();
    out.value = ''; info.textContent = ''; boxes.replaceChildren();
    const live = () => my === seq && alive;
    const onProgress = (p: number, s: string) => { if (live()) prog.set(s.includes('recogn') ? p : null, s.includes('recogn') ? `Recognising… ${Math.round(p * 100)} %` : 'Loading the text engine…'); };
    // the picture as the reader turned it (then never turned on its own), read the shared way (src/lib/readpage.ts)
    const res = await readPage(from, {
      lang, clean, auto: !handTurned, turns, retryTurns: true, invertDark: true, onProgress, stale: () => !live(),
      onRetry: () => { if (live()) prog.set(null, 'The text reads badly — trying the picture turned…'); },
      // a soft photo: PaddleOCR, the second reader, reads it too (its models fetched the first time)
      onSecond: (q) => { if (live()) { const w = secondWords(q); prog.set(w.p, w.text); } },
    });
    if (!res || !live()) return;
    const { r, img } = res;
    let note = '';
    // the text stood sideways, upside down or slanted (a phone held another way): said, and the picture as it was read
    // is shown (below) so the highlighted words sit on it
    if (res.up.turns || res.up.slant) note = ` · the picture was ${uprightWords(res.up)} to read it`;
    // a poor reading read clearly better another way round: the picture stays turned that way
    if (res.turned !== null) { turns = res.turned; await show(); note = ` · the picture was turned ${turnWords(res.turned)} to read it`; }
    prog.done();
    // the picture as it was read (the page straightened, levelled, turned) is shown in place of the photo: the
    // highlighted words sit on what was read
    if (res.shown) paint(previewOf(res.shown, 1400), canvas);
    if (res.page) note += ' · the page was found and straightened';
    // the photo was soft and PaddleOCR read it better (or could not be fetched: Tesseract's reading stands)
    if (res.engine === 'paddle') note += ' · the photo was soft: PaddleOCR read it';
    else if (res.secondError) note += ` · the photo was soft, and the second reader could not be loaded (${res.secondError})`;
    // a poor reading after all that: the photo itself (out of focus, shaken, the text a few pixels high) — say so
    if (r.text && readsPoorly(res)) note += ' · the text reads poorly: a sharper photo, closer and in good light, reads better';
    // the page's lists as they stand on it — bullets and check boxes at the line starts, nested items indented (to-do #31;
    // owner, 26 Nov 2026: "In the OCR app, the rich formatting should be preserved, the bullet points, etc."): the text box,
    // Copy and the .txt; the Photo Dictionary keeps its text plain
    out.value = listText(r, res.listMarks, res.xh);
    info.textContent = r.text
      ? `${r.words.length} words · average confidence ${Math.round(r.confidence)} % · ${((performance.now() - t0) / 1000).toFixed(1)} s${note}`
      : 'No text found. Try better light, a straighter photo, or another language.';
    // highlight words the engine is unsure about (over the picture as it was read)
    for (const w of r.words) if (unsureWord(w.conf, res.engine)) boxes.append(h('span', { class: 'ocr-low', title: `${w.text} (${Math.round(w.conf)} %)`, style: { left: `${(w.x0 / img.width) * 100}%`, top: `${(w.y0 / img.height) * 100}%`, width: `${((w.x1 - w.x0) / img.width) * 100}%`, height: `${((w.y1 - w.y0) / img.height) * 100}%` } }));
  };
  // a file (a photo already taken, a screenshot, a paste) — or the camera: the phone's back camera, the PC's webcam, live
  // in the page with Snap (owner, 20 Nov 2026; the picker's own camera, src/lib/livecam.ts)
  const input$ = imageInput((img, f, how) => {
    src = img; turns = 0; handTurned = false; name = baseName(f.name); forget(); show(); editor.hidden = false;
    if (how === 'camera') reveal(editor.firstElementChild!); // the photo where the camera was
  }, { label: 'Choose an image with text', instead: 'choose an image instead', paste: true });
  const turn = (k: number) => { if (!src) return; turns = (turns + k) % 4; handTurned = true; forget(); show(); };
  const text = () => { if (!out.value.trim()) throw new Error('There is no text yet — choose an image and press "Extract text".'); return out.value; };
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, stage), h('div', { class: 'row' },
      button('', () => turn(3), { icon: 'RotateCcw', title: 'Turn the picture left' }),
      button('', () => turn(1), { icon: 'RotateCw', title: 'Turn the picture right' }))),
    card('Options', stack(
      field('Language', segmented([['eng', 'English'], ['fra', 'Français'], ['spa', 'Español'], ['deu', 'Deutsch'], ['eng+fra+spa+deu', 'Mixed / not sure']], lang, (v) => { lang = v; forget(); })),
      toggle('Clean up photographed pages first (recommended for camera photos)', true, (v) => { clean = v; forget(); }),
      note('Nothing is uploaded — recognition runs in your browser. The first run loads the text engine and language model (a few MB).'))),
    actions(button('Extract text', run, { variant: 'primary', icon: 'ScanText' })),
    card('Text', prog, out, info, h('div', { class: 'row' },
      button('Copy', () => copy(text()), { small: true, icon: 'Copy' }),
      button('Download .txt', () => (ctx.isMobile ? shareOrDownload : downloadBlob)(new Blob([text()], { type: 'text/plain;charset=utf-8' }), `${name}.txt`), { small: true, icon: 'Download' }))),
  );
  root.append(card(null, input$.el), editor);
  return () => { alive = false; seq++; input$.dispose(); };
};
