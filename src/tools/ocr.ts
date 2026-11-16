// OCR: photo / scan / screenshot → text in English, French, Spanish or German (Tesseract LSTM in WebAssembly). Optional clean-up of
// photographed pages (imgproc document enhance), low-confidence words highlighted, copy / .txt download.
import { h, card, field, segmented, toggle, stack, note, progress, button, actions, copy, downloadBlob, shareOrDownload, baseName, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { previewOf, paint } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { recognize, type OcrLang } from '../lib/ocr';

export const mount: Mount = (root, ctx) => {
  let src: Img | null = null, name = 'text', lang: OcrLang = 'eng', clean = true;
  const canvas = h('canvas', { class: 'ed-canvas' });
  const boxes = h('div', { class: 'ocr-boxes' });
  const stage = h('div', { class: 'crop-wrap' }, canvas, boxes);
  const prog = progress();
  const out = h('textarea', { class: 'input textarea ocr-text', rows: 12, 'aria-label': 'Recognised text', spellcheck: 'false' }) as HTMLTextAreaElement;
  const info = h('div', { class: 'muted small' });
  const editor = h('div', { class: 'stack', hidden: true });
  const run = async () => {
    if (!src) throw new Error('Choose an image first.');
    let img = src;
    // Tesseract works best around 300 dpi text height; very large photos are scaled to ≤ 3000 px (wasm resize)
    const L = Math.max(img.width, img.height);
    if (L > 3000) img = await imgproc('resize', img, Math.round((img.width * 3000) / L), Math.round((img.height * 3000) / L));
    if (clean) img = await imgproc('docEnhance', img, 1);
    out.value = ''; boxes.replaceChildren();
    const t0 = performance.now();
    const r = await recognize(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), lang, (p, s) => prog.set(s.includes('recogn') ? p : null, s.includes('recogn') ? `Recognising… ${Math.round(p * 100)} %` : 'Loading the text engine…'));
    prog.done();
    out.value = r.text;
    info.textContent = r.text ? `${r.words.length} words · average confidence ${Math.round(r.confidence)} % · ${((performance.now() - t0) / 1000).toFixed(1)} s` : 'No text found. Try better light, a straighter photo, or another language.';
    // highlight words the engine is unsure about
    for (const w of r.words) if (w.conf < 60) boxes.append(h('span', { class: 'ocr-low', title: `${w.text} (${Math.round(w.conf)} %)`, style: { left: `${(w.x0 / img.width) * 100}%`, top: `${(w.y0 / img.height) * 100}%`, width: `${((w.x1 - w.x0) / img.width) * 100}%`, height: `${((w.y1 - w.y0) / img.height) * 100}%` } }));
  };
  const input$ = imageInput((img, f) => { src = img; name = baseName(f.name); paint(previewOf(img, 1400), canvas); editor.hidden = false; out.value = ''; info.textContent = ''; boxes.replaceChildren(); }, { label: 'Choose an image with text', capture: ctx.isMobile ? 'environment' : undefined });
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, stage)),
    card('Options', stack(
      field('Language', segmented([['eng', 'English'], ['fra', 'Français'], ['spa', 'Español'], ['deu', 'Deutsch'], ['eng+fra+spa+deu', 'Mixed / not sure']], lang, (v) => (lang = v))),
      toggle('Clean up photographed pages first (recommended for camera photos)', true, (v) => (clean = v)),
      note('Nothing is uploaded — recognition runs in your browser. The first run loads the text engine and language model (a few MB).'))),
    actions(button('Extract text', run, { variant: 'primary', icon: 'ScanText' })),
    card('Text', prog, out, info, h('div', { class: 'row' },
      button('Copy', () => copy(out.value), { small: true, icon: 'Copy' }),
      button('Download .txt', () => (ctx.isMobile ? shareOrDownload : downloadBlob)(new Blob([out.value], { type: 'text/plain;charset=utf-8' }), `${name}.txt`), { small: true, icon: 'Download' }))),
  );
  root.append(card(null, input$.el), editor);
  return () => input$.dispose();
};
