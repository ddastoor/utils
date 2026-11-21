// OCR: photo / scan / screenshot → text in English, French, Spanish or German (Tesseract LSTM in WebAssembly). Optional clean-up of
// photographed pages (imgproc document enhance), low-confidence words highlighted, copy / .txt download. Pictures can be
// turned; a sideways or upside-down picture that reads badly is tried the other ways round and read the best way.
// A picture comes from a file or from the camera (the phone's back camera, the PC's webcam: src/lib/livecam.ts).
import { h, card, field, segmented, toggle, stack, note, progress, button, actions, copy, downloadBlob, shareOrDownload, baseName, reveal, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { previewOf, paint } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { recognize, POOR, type OcrLang, type OcrResult } from '../lib/ocr';
import { straighten } from '../lib/pagecrop';
import { uprightByReading, turnWords, ROT } from '../lib/upright';
/** Light text on a dark ground (a screenshot in dark mode, chalk on a board): the clean-up expects dark text on paper. */
export const isDark = (luma: Uint32Array | number[]) => {
  let n = 0, sum = 0;
  for (let v = 0; v < 256; v++) { n += luma[v]; sum += v * luma[v]; }
  return n > 0 && sum / n < 110;
};

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
  /** The clean-up for reading: light text on a dark ground turned dark on light, then the document enhancement. */
  const enhance = async (im: Img) => (clean ? imgproc('docEnhance', isDark((await imgproc('histogram', im)).subarray(768, 1024)) ? await imgproc('invert', im) : im, 1) : im);
  /** The picture as the engine reads it (img) and, when a photographed page was found and straightened, that page as
   *  it looks (page: shown instead of the photo, so the highlighted words sit on what was read). straight: false reads
   *  the photo as it is (the second try when the page found gave little). auto: the text set upright first (owner,
   *  21 Nov 2026: a phone held sideways in either hand — src/lib/upright.ts); autoTurns: the quarter turns that took. */
  const prepare = async (from: Img, t: number, straight = true, auto = false) => {
    let img = await turned(from, t), page: Img | null = null, autoTurns = 0;
    // Tesseract works best around 300 dpi text height; very large photos are scaled to ≤ 3000 px (wasm resize)
    const L = Math.max(img.width, img.height);
    if (L > 3000) img = await imgproc('resize', img, Math.round((img.width * 3000) / L), Math.round((img.height * 3000) / L));
    if (clean) {
      // a photographed page (a Kindle in its black body, a sheet on a table) found and straightened first — the Photo
      // Dictionary's (src/lib/pagecrop.ts; owner, 21 Nov 2026: the OCR tab as good on a phone, to-do #9); a screenshot or a
      // scan is left as it is
      if (straight) { const s = await straighten(img).catch(() => ({ img, found: false })); if (s.found) img = page = s.img; }
    }
    if (auto) {
      const u = await uprightByReading(img, async (im) => read(await enhance(im))).catch(() => null);
      if (u?.turns) { img = u.img; if (page) page = img; autoTurns = u.turns; }
    }
    img = await enhance(img);
    return { img, page, autoTurns };
  };
  const read = (img: Img, onProgress?: (p: number, s: string) => void) => recognize(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), lang, onProgress);
  const run = async () => {
    if (!src) throw new Error('Choose an image first.');
    const my = ++seq, from = src, t0 = performance.now();
    out.value = ''; info.textContent = ''; boxes.replaceChildren();
    const live = () => my === seq && alive;
    const onProgress = (p: number, s: string) => { if (live()) prog.set(s.includes('recogn') ? p : null, s.includes('recogn') ? `Recognising… ${Math.round(p * 100)} %` : 'Loading the text engine…'); };
    const auto = !handTurned;
    let t = turns, { img, page, autoTurns } = await prepare(from, t, true, auto);
    let r: OcrResult = await read(img, onProgress);
    if (!live()) return;
    // a page found that gave little (it was not the page): the whole picture is read too, and the better reading kept
    if (page && r.words.length < 25) {
      const w = await prepare(from, t, false, auto), r2 = await read(w.img, onProgress);
      if (!live()) return;
      if (r2.words.length > r.words.length) { r = r2; img = w.img; page = null; autoTurns = w.autoTurns; }
    }
    let note = '';
    // the text stood sideways or upside down (a phone held the other way): the picture as it was read is shown
    if (autoTurns) {
      if (!page) { turns = (turns + autoTurns) % 4; await show(); }
      note = ` · the text stood ${autoTurns === 2 ? 'upside down' : 'sideways'}: the picture was turned ${turnWords(autoTurns)} to read it`;
    }
    if (r.confidence < POOR) {
      // sideways or upside down? Read a smaller copy each other way round; take a way that reads clearly better
      prog.set(null, 'The text reads badly — trying the picture turned…');
      // (cur: the way round the picture was just read — its own turns and those the text's lines asked for)
      const small = previewOf(from, 1200), cur = (t + autoTurns) % 4;
      let best = { t: cur, conf: r.confidence };
      for (const k of [1, 3, 2]) {
        const tt = (cur + k) % 4, q = await read((await prepare(small, tt)).img);
        if (!live()) return;
        if (q.confidence > best.conf) best = { t: tt, conf: q.confidence };
      }
      if (best.t !== cur && best.conf >= POOR && best.conf >= r.confidence + 20) {
        t = best.t; ({ img, page } = await prepare(from, t));
        r = await read(img, onProgress);
        if (!live()) return;
        turns = t; await show();
        note = ` · the picture was turned ${turnWords(t)} to read it`;
      }
    }
    prog.done();
    // the straightened page is shown in place of the photo: the highlighted words sit on what was read
    if (page) { paint(previewOf(page, 1400), canvas); note += ' · the page was found and straightened'; }
    // a poor reading after all that: the photo itself (out of focus, shaken, the text a few pixels high) — say so
    if (r.text && r.confidence < POOR) note += ' · the text reads poorly: a sharper photo, closer and in good light, reads better';
    out.value = r.text;
    info.textContent = r.text
      ? `${r.words.length} words · average confidence ${Math.round(r.confidence)} % · ${((performance.now() - t0) / 1000).toFixed(1)} s${note}`
      : 'No text found. Try better light, a straighter photo, or another language.';
    // highlight words the engine is unsure about (over the picture as it was read)
    for (const w of r.words) if (w.conf < 60) boxes.append(h('span', { class: 'ocr-low', title: `${w.text} (${Math.round(w.conf)} %)`, style: { left: `${(w.x0 / img.width) * 100}%`, top: `${(w.y0 / img.height) * 100}%`, width: `${((w.x1 - w.x0) / img.width) * 100}%`, height: `${((w.y1 - w.y0) / img.height) * 100}%` } }));
  };
  // a file (a photo already taken, a screenshot, a paste) — or the camera: the phone's back camera, the PC's webcam, live
  // in the page with Snap (owner, 20 Nov 2026; the picker's own camera, src/lib/livecam.ts)
  const input$ = imageInput((img, f, how) => {
    src = img; turns = 0; handTurned = false; name = baseName(f.name); forget(); show(); editor.hidden = false;
    if (how === 'camera') reveal(editor.firstElementChild!); // the photo where the camera was
  }, { label: 'Choose an image with text', instead: 'choose an image instead' });
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
