// OCR: photo / scan / screenshot → text in English, French, Spanish or German (Tesseract LSTM in WebAssembly). Optional clean-up of
// photographed pages (imgproc document enhance), low-confidence words highlighted, copy / .txt download. Pictures can be
// turned; a sideways or upside-down picture that reads badly is tried the other ways round and read the best way.
import { h, card, field, segmented, toggle, stack, note, progress, button, actions, copy, downloadBlob, shareOrDownload, baseName, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { previewOf, paint } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { recognize, type OcrLang, type OcrResult } from '../lib/ocr';

const ROT = [1, 6, 3, 8]; // quarter turns to the right as EXIF orientations
/** Below this average confidence a reading is suspect: the picture is also tried turned. */
export const POOR = 60;
/** Light text on a dark ground (a screenshot in dark mode, chalk on a board): the clean-up expects dark text on paper. */
export const isDark = (luma: Uint32Array | number[]) => {
  let n = 0, sum = 0;
  for (let v = 0; v < 256; v++) { n += luma[v]; sum += v * luma[v]; }
  return n > 0 && sum / n < 110;
};

export const mount: Mount = (root, ctx) => {
  let src: Img | null = null, name = 'text', lang: OcrLang = 'eng', clean = true, turns = 0, seq = 0, alive = true;
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
  const prepare = async (img: Img, t: number) => {
    img = await turned(img, t);
    // Tesseract works best around 300 dpi text height; very large photos are scaled to ≤ 3000 px (wasm resize)
    const L = Math.max(img.width, img.height);
    if (L > 3000) img = await imgproc('resize', img, Math.round((img.width * 3000) / L), Math.round((img.height * 3000) / L));
    if (clean) {
      if (isDark((await imgproc('histogram', img)).subarray(768, 1024))) img = await imgproc('invert', img);
      img = await imgproc('docEnhance', img, 1);
    }
    return img;
  };
  const read = (img: Img, onProgress?: (p: number, s: string) => void) => recognize(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), lang, onProgress);
  const run = async () => {
    if (!src) throw new Error('Choose an image first.');
    const my = ++seq, from = src, t0 = performance.now();
    out.value = ''; info.textContent = ''; boxes.replaceChildren();
    const live = () => my === seq && alive;
    const onProgress = (p: number, s: string) => { if (live()) prog.set(s.includes('recogn') ? p : null, s.includes('recogn') ? `Recognising… ${Math.round(p * 100)} %` : 'Loading the text engine…'); };
    let t = turns, img = await prepare(from, t);
    let r: OcrResult = await read(img, onProgress);
    if (!live()) return;
    let note = '';
    if (r.confidence < POOR) {
      // sideways or upside down? Read a smaller copy each other way round; take a way that reads clearly better
      prog.set(null, 'The text reads badly — trying the picture turned…');
      const small = previewOf(from, 1200);
      let best = { t, conf: r.confidence };
      for (const k of [1, 3, 2]) {
        const tt = (turns + k) % 4, q = await read(await prepare(small, tt));
        if (!live()) return;
        if (q.confidence > best.conf) best = { t: tt, conf: q.confidence };
      }
      if (best.t !== t && best.conf >= POOR && best.conf >= r.confidence + 20) {
        t = best.t; img = await prepare(from, t);
        r = await read(img, onProgress);
        if (!live()) return;
        turns = t; await show();
        note = ` · the picture was turned ${t === 2 ? 'upside down' : t === 1 ? 'a quarter to the right' : 'a quarter to the left'} to read it`;
      }
    }
    prog.done();
    out.value = r.text;
    info.textContent = r.text
      ? `${r.words.length} words · average confidence ${Math.round(r.confidence)} % · ${((performance.now() - t0) / 1000).toFixed(1)} s${note}`
      : 'No text found. Try better light, a straighter photo, or another language.';
    // highlight words the engine is unsure about (over the picture as it was read)
    for (const w of r.words) if (w.conf < 60) boxes.append(h('span', { class: 'ocr-low', title: `${w.text} (${Math.round(w.conf)} %)`, style: { left: `${(w.x0 / img.width) * 100}%`, top: `${(w.y0 / img.height) * 100}%`, width: `${((w.x1 - w.x0) / img.width) * 100}%`, height: `${((w.y1 - w.y0) / img.height) * 100}%` } }));
  };
  const input$ = imageInput((img, f) => { src = img; turns = 0; name = baseName(f.name); forget(); show(); editor.hidden = false; },
    { label: 'Choose an image with text', capture: ctx.isMobile ? 'environment' : undefined });
  const turn = (k: number) => { if (!src) return; turns = (turns + k) % 4; forget(); show(); };
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
