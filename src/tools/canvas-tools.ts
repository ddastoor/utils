// Watermark, Text on Image and Collage Maker. Pixel work: crops and preview resizes in imgproc.wasm, the resizes of
// saved pictures with @jsquash/resize (Squoosh's Lanczos-3 in linear light);
// text shaping/rasterising and compositing use the browser's native canvas (compiled C++); encoding uses
// MozJPEG / libwebp / OxiPNG (wasm). Fonts: system fonts + Anton (OFL-1.1) served from this site.
import antonUrl from '@fontsource/anton/files/anton-latin-400-normal.woff2?url';
import { h, card, field, input, textarea, button, segmented, slider, toggle, stack, grid2, note, clear, actions, toast, errMsg, baseName, downloadBlob, shareOrDownload, fmtBytes, filePicker, type Mount } from '../ui';
import { passwordAsker } from '../lib/pdfui';
import { imgproc, type Img } from '../wasm/imgproc';
import { loadImg, encodeImg, previewOf, resizeImg, setJpegDpi, EXT, type Fmt } from '../lib/imgio';
import { imageInput, imagePicker, resultList } from '../lib/imgtools';
import { isIOS } from '../platform';
import { wrapLines } from '../lib/textwrap';
import { diagonalFit, type Pos } from '../lib/wmlayout';

// ------------------------------------------------------------------ shared
let fontsReady: Promise<void> | null = null;
export const loadFonts = () => (fontsReady ||= (async () => {
  try { const f = new FontFace('Anton', `url(${antonUrl})`); await f.load(); document.fonts.add(f); } catch { /* falls back to system fonts */ }
})());
export const FONTS: Array<[string, string]> = [['Anton, Impact, sans-serif', 'Meme'], ['system-ui, sans-serif', 'Sans'], ['Georgia, "Times New Roman", serif', 'Serif'], ['ui-monospace, Menlo, Consolas, monospace', 'Mono'], ['"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive', 'Script']];
const IOS_MAX = 16_700_000; // iOS Safari canvas pixel limit
/** iOS cannot draw canvases above ~16.7 MP: scale those down (in wasm) before compositing. */
async function fitForCanvas(img: Img): Promise<{ img: Img; scaled: boolean }> {
  const px = img.width * img.height;
  if (!isIOS || px <= IOS_MAX) return { img, scaled: false };
  const s = Math.sqrt(IOS_MAX / px) * 0.98;
  return { img: await resizeImg(img, Math.floor(img.width * s), Math.floor(img.height * s)), scaled: true };
}
function canvasOf(img: Img) {
  const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d', { willReadFrequently: true })!;
  g.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return { c, g };
}
const imgOf = (c: OffscreenCanvas, g: OffscreenCanvasRenderingContext2D): Img => { const d = g.getImageData(0, 0, c.width, c.height); return { data: d.data, width: d.width, height: d.height }; };
function toBitmapSource(img: Img) { const { c } = canvasOf(img); return c; }
const fmtSeg = (cur: Fmt, on: (v: Fmt) => void) => field('Format', segmented([['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WebP']], cur, on));

// ================================================================== Watermark
export type { Pos } from '../lib/wmlayout';
export { diagonalFit } from '../lib/wmlayout';
/** `fill`: for 'diag', the share (0.2 – 1) of the longest mark the picture's diagonal holds within the margin; `cover`: a
 *  document's first page gets the mark too (to-do #34 — documents only) */
export interface WmOpts { kind: 'text' | 'logo'; text: string; font: string; color: string; opacity: number; size: number; pos: Pos; margin: number; angle: number; shadow: boolean; logo: Img | null; fill: number; cover: boolean }
/** Draw the watermark onto a copy of img. Sizes are % of the image's shorter side, so previews match exports. */
export async function applyWatermark(img: Img, o: WmOpts, fine = false): Promise<Img> {
  const { c, g } = canvasOf(img), W = img.width, H = img.height, S = Math.min(W, H);
  const m = (o.margin / 100) * S;
  let ow = 0, oh = 0, logoSrc: OffscreenCanvas | null = null;
  const diag = o.pos === 'diag';
  let th = 0, tb = { l: 0, r: 0, a: 0, d: 0 }; // the diagonal's angle; the text's tight box at its drawn size
  if (o.kind === 'logo') {
    if (!o.logo) return img;
    if (diag) { const f = diagonalFit(W, H, m, o.logo.width, o.logo.height, o.fill); th = f.th; ow = Math.max(1, Math.round(o.logo.width * f.k)); oh = Math.max(1, Math.round(o.logo.height * f.k)); }
    else { ow = Math.max(1, Math.round((o.size * 4 / 100) * S)); oh = Math.max(1, Math.round((ow * o.logo.height) / o.logo.width)); }
    // the saved photos: Squoosh's Lanczos-3 in linear light (jSquash); the preview: imgproc's (instant)
    logoSrc = toBitmapSource(fine ? await resizeImg(o.logo, ow, oh) : await imgproc('resize', o.logo, ow, oh));
  } else {
    await loadFonts();
    if (diag) { // the text's own tight box at 100 px, then the size that fits the diagonal
      g.font = `100px ${o.font}`;
      const t = g.measureText(o.text), L0 = t.actualBoundingBoxLeft + t.actualBoundingBoxRight, h0 = t.actualBoundingBoxAscent + t.actualBoundingBoxDescent;
      const f = diagonalFit(W, H, m, Math.max(1, L0), Math.max(1, h0), o.fill), px = Math.max(4, 100 * f.k);
      th = f.th; g.font = `${px}px ${o.font}`;
      const u = g.measureText(o.text);
      tb = { l: u.actualBoundingBoxLeft, r: u.actualBoundingBoxRight, a: u.actualBoundingBoxAscent, d: u.actualBoundingBoxDescent };
      ow = tb.l + tb.r; oh = tb.a + tb.d;
    } else {
      g.font = `${Math.max(6, (o.size / 100) * S)}px ${o.font}`;
      ow = g.measureText(o.text).width; oh = (o.size / 100) * S;
    }
  }
  g.globalAlpha = o.opacity;
  const drawAt = (x: number, y: number) => {
    if (logoSrc) g.drawImage(logoSrc, x, y);
    else {
      if (o.shadow) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = oh * 0.12; g.shadowOffsetX = g.shadowOffsetY = oh * 0.04; }
      g.fillStyle = o.color; g.textBaseline = 'top'; g.fillText(o.text, x, y);
      g.shadowColor = 'transparent';
    }
  };
  if (diag) { // centred on the picture, turned to its diagonal: the tight box's middle on the picture's middle
    g.save(); g.translate(W / 2, H / 2); g.rotate(-th);
    if (logoSrc) g.drawImage(logoSrc, -ow / 2, -oh / 2);
    else {
      if (o.shadow) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = oh * 0.12; g.shadowOffsetX = g.shadowOffsetY = oh * 0.04; }
      g.fillStyle = o.color; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
      g.fillText(o.text, -(tb.r - tb.l) / 2, (tb.a - tb.d) / 2);
      g.shadowColor = 'transparent';
    }
    g.restore();
  } else if (o.pos === 'tile') {
    g.save(); g.translate(W / 2, H / 2); g.rotate((o.angle * Math.PI) / 180);
    const stepX = ow + Math.max(ow * 0.6, S * 0.08), stepY = oh * 3.2, R = Math.hypot(W, H) / 2 + Math.max(ow, oh);
    for (let y = -R, row = 0; y < R; y += stepY, row++) for (let x = -R + (row % 2 ? stepX / 2 : 0); x < R; x += stepX) drawAt(x, y);
    g.restore();
  } else {
    const col = o.pos.length === 1 ? 'c' : o.pos[1], rowc = o.pos[0];
    const x = col === 'l' ? m : col === 'r' ? W - m - ow : (W - ow) / 2;
    const y = rowc === 't' ? m : rowc === 'b' ? H - m - oh : (H - oh) / 2;
    drawAt(o.pos === 'c' ? (W - ow) / 2 : x, o.pos === 'c' ? (H - oh) / 2 : y);
  }
  g.globalAlpha = 1;
  return imgOf(c, g);
}

/** The tab's font label for a CSS font of FONTS (documents get fonts by label: src/lib/docmark.ts) */
const fontLabel = (css: string) => FONTS.find(([f]) => f === css)?.[1] ?? 'Sans';
/** a PDF or a Word document chosen in the Watermark tab (to-do #17) */
interface WmDoc { file: File; kind: 'pdf' | 'docx'; bytes?: Uint8Array; password?: string; pages?: number; one?: Record<number, Uint8Array>; page?: { W: number; H: number } }
const isDocx = (f: File) => /\.(docx|docm)$/i.test(f.name) || /wordprocessingml\.document|ms-word\.document\.macroEnabled/i.test(f.type);
const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
const luminance = (hex: string) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

export const watermark: Mount = (root, ctx) => {
  const files: File[] = [];
  const docs: WmDoc[] = [];
  let preview: Img | null = null, fmt: Fmt = 'jpeg';
  const o: WmOpts = { kind: 'text', text: '© My Name', font: FONTS[1][0], color: '#ffffff', opacity: 0.6, size: 5, pos: 'br', margin: 3, angle: -30, shadow: true, logo: null, fill: 0.9, cover: true };
  const canvas = h('canvas', { class: 'ed-canvas' });
  const list = h('div', { class: 'muted small' });
  const docList = h('div', { class: 'muted small' });
  const failed = h('div');
  const shownAs = h('div', { class: 'muted small', id: 'wm-shown' });
  const paperNote = h('div', { class: 'small', id: 'wm-paper' });
  const results = resultList({ zipName: () => 'watermarked.zip', isMobile: ctx.isMobile });
  const { el: pwAsks, ask } = passwordAsker();
  let tok = 0, alive = true, docTimer = 0;
  const show = (out: Img) => {
    canvas.width = out.width; canvas.height = out.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
  };
  /** the page of the first document the preview shows (photos come first in the preview): its first page — the second
   *  when the cover is left without the mark (to-do #34), the first without the mark when it is the only one */
  const docPage = (d: WmDoc) => (o.cover || (d.pages ?? 1) < 2 ? 0 : 1);
  const docPreview = async (d: WmDoc): Promise<Img> => {
    const dm = await import('../lib/docmark'), px = ctx.isMobile ? 900 : 1100;
    await loadFonts();
    if (d.kind === 'pdf') {
      const i = docPage(d);
      if (!d.one?.[i]) { const { subsetPdf } = await import('../lib/pdf'); (d.one ??= {})[i] = await subsetPdf(d.bytes!, d.password, [i]); }
      return dm.previewPdf(d.one![i], o.cover || i > 0 ? o : null, fontLabel(o.font), px);
    }
    return dm.previewWordPage(d.page?.W ?? 595.3, d.page?.H ?? 841.9, o, fontLabel(o.font), px);
  };
  /** what the preview of a document shows, in words */
  const docShown = (d: WmDoc) => {
    if (d.kind === 'docx') return `${d.file.name}: the first page's size, the mark as Word draws it (the page's own text is not shown).${o.cover ? '' : ' The first page, the cover, is left without it.'}`;
    if (o.cover) return `Page 1 of ${d.file.name}, as the file gets it.`;
    return docPage(d) ? `Page 2 of ${d.file.name}, as the file gets it — page 1, the cover, is left without the mark.` : `${d.file.name} has one page: with the cover left without the mark, no page gets it.`;
  };
  const paper = () => { // white text on white paper shows only by its shadow
    const light = docs.length > 0 && o.kind === 'text' && luminance(o.color) > 0.85;
    paperNote.textContent = !light ? '' : o.shadow ? 'On a white page, text this light shows only by its shadow.' : 'Text this light does not show on a white page: choose a darker colour, or turn the shadow on.';
    paperNote.hidden = !light;
  };
  const redraw = async () => {
    paper();
    const my = ++tok;
    if (preview) {
      const out = await applyWatermark(preview, o);
      if (my === tok && alive) { show(out); shownAs.textContent = ''; }
      return;
    }
    const d = docs[0];
    if (!d) return;
    clearTimeout(docTimer); // a document's page is made again when the sliders rest
    docTimer = window.setTimeout(async () => {
      try {
        const out = await docPreview(d);
        if (my !== tok || !alive) return;
        show(out); stage.hidden = false;
        shownAs.textContent = docShown(d);
      } catch (e) { if (my === tok && alive) shownAs.textContent = errMsg(e); }
    }, 150);
  };
  const clearBtn = button('Clear photos', () => { files.length = 0; preview = null; stage.hidden = !docs.length; showList(); results.clear(); clear(failed); redraw(); }, { small: true, variant: 'ghost', icon: 'X' });
  const clearDocsBtn = button('Clear documents', () => { docs.length = 0; stage.hidden = !preview; showList(); results.clear(); clear(failed); redraw(); }, { small: true, variant: 'ghost', icon: 'X' });
  const showList = () => {
    clear(list).append(files.length ? `${files.length} photo${files.length > 1 ? 's' : ''}: ${files.map((f) => f.name).join(', ')}` : '');
    clearBtn.hidden = !files.length;
    clear(docList).append(docs.length ? `${docs.length} document${docs.length > 1 ? 's' : ''}: ${docs.map((d) => d.file.name + (d.pages ? ` (${d.pages} page${d.pages > 1 ? 's' : ''})` : '')).join(', ')}` : '');
    clearDocsBtn.hidden = !docs.length; coverT.hidden = !docs.length;
    paper();
  };
  /** The preview is the first photo that opens (a file that cannot be read is said and left out). */
  const addFiles = async (fs: File[]) => {
    for (const f of fs) {
      if (!preview) {
        try { preview = previewOf(await loadImg(f), ctx.isMobile ? 900 : 1400); stage.hidden = false; redraw(); }
        catch (e) { toast(`${f.name}: ${errMsg(e)} — left out.`, 'err'); continue; }
      }
      files.push(f);
    }
    showList();
  };
  /** PDFs (a password asked for where one is needed) and Word documents; the old .doc is sent back with the reason */
  const addDocs = async (fs: File[]) => {
    for (const f of fs) {
      if (/\.doc$/i.test(f.name) || f.type === 'application/msword') { toast(`${f.name}: this is Word's old format (.doc) — open it in Word and save it as a Word Document (.docx) first.`, 'err'); continue; }
      if (isDocx(f)) {
        const d: WmDoc = { file: f, kind: 'docx' };
        try { // the first section's page, for the preview
          const { extractArchive } = await import('../lib/sevenzip-client');
          const [x] = await extractArchive(f, f.name, '', ['word/document.xml']);
          const xml = x ? new TextDecoder().decode(x.data) : '';
          const m = /<w:pgSz\b[^>]*>/.exec(xml), num = (a: string) => +(new RegExp(`w:${a}="(\\d+)"`).exec(m?.[0] ?? '')?.[1] ?? 0);
          if (m && num('w') && num('h')) d.page = { W: num('w') / 20, H: num('h') / 20 };
        } catch { /* the preview takes A4; the watermarking says what is wrong with the file */ }
        docs.push(d);
      } else if (isPdf(f)) {
        const { openWithPassword } = await import('../lib/pdfui');
        const x = await openWithPassword(f, ask);
        if (x) docs.push({ file: f, kind: 'pdf', bytes: x.bytes, password: x.password, pages: x.pages });
      } else toast(`${f.name}: not a PDF or a Word document (.docx).`, 'err');
    }
    showList();
    if (!preview && docs.length) { stage.hidden = false; redraw(); }
  };
  const textBox = stack(field('Text', input({ value: o.text, onInput: (v) => { o.text = v; redraw(); } })),
    field('Font', segmented(FONTS.map(([f, l]) => [f, l]) as Array<[string, string]>, o.font, (v) => { o.font = v; redraw(); })),
    field('Colour', input({ type: 'color', value: o.color, onInput: (v) => { o.color = v; redraw(); } })),
    toggle('Shadow (readable on any background)', true, (v) => { o.shadow = v; redraw(); }));
  const logoBox = stack(imagePicker({ accept: 'image/*,.heic,.heif', label: 'Choose a logo', hint: 'PNG with transparency works best', compact: true, onFiles: async (f) => {
    try { o.logo = await loadImg(f[0]); redraw(); } catch (e) { toast(`${f[0].name}: ${errMsg(e)}`, 'err'); }
  } }));
  logoBox.hidden = true;
  const angle = slider({ label: 'Tile angle', min: -90, max: 90, value: o.angle, unit: '°', onInput: (v) => { o.angle = v; redraw(); } });
  angle.hidden = true;
  const sizeS = slider({ label: 'Size', min: 1, max: 25, step: 0.5, value: o.size, unit: '%', onInput: (v) => { o.size = v; redraw(); } });
  const fillS = slider({ label: 'Length along the diagonal', min: 20, max: 100, value: o.fill * 100, unit: '%', onInput: (v) => { o.fill = v / 100; redraw(); } });
  fillS.hidden = true;
  // documents only (to-do #34 — owner: "for uploaded documents only, have an option to include (or not) the watermark on the
  // first page or cover page"): on, as before, every page; off, the first page is left as it is
  const coverT = toggle('Watermark the first page (the cover) too', true, (v) => { o.cover = v; redraw(); });
  coverT.hidden = true;
  const stage = card(null, h('div', { class: 'ed-stage' }, canvas), shownAs);
  stage.hidden = true;
  const run = async () => {
    if (!files.length && !docs.length) throw new Error('Add photos, a PDF or a Word document first.');
    if (o.kind === 'logo' && !o.logo) throw new Error('Choose a logo image.');
    if (o.kind === 'text' && !o.text.trim()) throw new Error('Type the text of the watermark.');
    results.clear(); clear(failed);
    const bad: string[] = [];
    let badDocs = 0;
    for (const f of files) {
      try {
        const { img, scaled } = await fitForCanvas(await loadImg(f));
        const out = await applyWatermark(img, o, true);
        results.add(`${baseName(f.name)}-watermarked.${EXT[fmt]}`, await encodeImg(out, fmt, 88), `${out.width}×${out.height}${scaled ? ' (reduced for iPhone)' : ''}`);
      } catch (e) { bad.push(`${f.name}: ${errMsg(e)}`); }
      if (!alive) return;
    }
    if (docs.length) await loadFonts();
    for (const d of [...docs]) {
      try {
        if (d.kind === 'pdf') {
          const { markPdf } = await import('../lib/docmark');
          const r = await markPdf(d.bytes!, d.password, o, fontLabel(o.font), async (i) => { if (i % 20 === 0) await new Promise((res) => setTimeout(res)); return alive; });
          if (!r || !alive) return;
          const notes = [`${r.pages} page${r.pages > 1 ? 's' : ''}${r.marked < r.pages ? `, the mark on ${r.marked} — not on page 1, the cover` : ''}`, ...(d.password !== undefined ? ['it had a password: the copy has none (Protect PDF adds one)'] : []), ...(r.signed ? ['it was digitally signed: the copy no longer proves the signature'] : [])];
          results.add(`${baseName(d.file.name)}-watermarked.pdf`, new Blob([r.bytes as BlobPart], { type: 'application/pdf' }), notes.join(' · '));
        } else {
          const { markDocx } = await import('../lib/docxmark');
          const r = await markDocx(d.file, d.file.name, o, fontLabel(o.font));
          if (!alive) return;
          const ext = /\.docm$/i.test(d.file.name) ? 'docm' : 'docx';
          const notes = [`${r.sections} section${r.sections > 1 ? 's' : ''}, ${r.headers} header${r.headers > 1 ? 's' : ''}`, ...(r.cover ? ['the first page, the cover, without the mark'] : []), ...(r.replaced ? ['the earlier watermark was replaced'] : []), ...(r.signed ? ['it was digitally signed: the copy no longer proves the signature'] : [])];
          results.add(`${baseName(d.file.name)}-watermarked.${ext}`, new Blob([r.bytes as BlobPart], { type: ext === 'docm' ? 'application/vnd.ms-word.document.macroEnabled.12' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), notes.join(' · '));
        }
      } catch (e) { bad.push(`${d.file.name}: ${errMsg(e)}`); badDocs++; }
    }
    if (bad.length) {
      const what = badDocs === 0 ? 'photo' : badDocs === bad.length ? 'document' : 'file';
      failed.append(note(h('div', null, `${bad.length} ${what}${bad.length === 1 ? '' : 's'} could not be watermarked:`, h('ul', null, bad.map((x) => h('li', null, x)))), 'err'));
    }
  };
  root.append(
    card(null, stack(
      imagePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: 'Add photos', hint: 'one or many — the same watermark goes on all', onFiles: (f) => addFiles(f).catch((e) => toast(errMsg(e), 'err')) }), h('div', { class: 'row' }, list, clearBtn),
      filePicker({ accept: '.pdf,application/pdf,.docx,.docm,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword', multiple: true, compact: true, label: 'Add PDFs or Word documents', hint: 'every page gets the watermark (.pdf, .docx) — the first one as you choose', onFiles: (f) => addDocs(f) }),
      h('div', { class: 'row' }, docList, clearDocsBtn), coverT, pwAsks)),
    stage,
    card('Watermark', stack(
      segmented([['text', 'Text'], ['logo', 'Logo']], o.kind, (v) => { o.kind = v; textBox.hidden = v !== 'text'; logoBox.hidden = v !== 'logo'; redraw(); }),
      textBox, logoBox,
      field('Position', segmented([['tl', '↖'], ['tc', '↑'], ['tr', '↗'], ['ml', '←'], ['c', '•'], ['mr', '→'], ['bl', '↙'], ['bc', '↓'], ['br', '↘'], ['tile', 'Tiled'], ['diag', 'Diagonal']], o.pos, (v) => { o.pos = v; angle.hidden = v !== 'tile'; sizeS.hidden = v === 'diag'; fillS.hidden = v !== 'diag'; redraw(); })),
      angle, sizeS, fillS,
      slider({ label: 'Opacity', min: 5, max: 100, value: o.opacity * 100, unit: '%', onInput: (v) => { o.opacity = v / 100; redraw(); } }),
      slider({ label: 'Margin', min: 0, max: 15, step: 0.5, value: o.margin, unit: '%', onInput: (v) => { o.margin = v; redraw(); } }),
      paperNote,
      field('Photo format', segmented([['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WebP']], fmt, (v) => (fmt = v))))),
    actions(button('Watermark all', run, { variant: 'primary', icon: 'Stamp' })),
    card('Results', failed, results.el),
  );
  showList();
  loadFonts().then(redraw);
  return () => { alive = false; clearTimeout(docTimer); results.clear(); };
};

// ================================================================== Text on Image (captions / memes)
export interface CapOpts { top: string; bottom: string; style: 'meme' | 'caption'; font: string; color: string; size: number; stroke: number; band: boolean; align: CanvasTextAlign; upper: boolean }
export async function applyCaption(img: Img, o: CapOpts): Promise<Img> {
  await loadFonts();
  const { c, g } = canvasOf(img), W = img.width, H = img.height;
  const meme = o.style === 'meme';
  let px = Math.max(8, (o.size / 100) * Math.min(W, H) * (meme ? 1.25 : 1));
  const family = meme ? FONTS[0][0] : o.font, maxW = W * 0.92;
  const prep = (text: string) => (meme || o.upper ? text.toLocaleUpperCase() : text);
  const linesOf = (text: string) => (text.trim() ? wrapLines(g, prep(text), maxW) : []);
  // text that would not fit is made smaller: each block at most 45 % of the picture's height (the two never meet)
  for (let k = 0; k < 40; k++) {
    g.font = `${px}px ${family}`;
    const tall = Math.max(linesOf(o.top).length, linesOf(o.bottom).length) * px * 1.12 + px * 0.7;
    if (tall <= H * 0.45 || px <= 6) break;
    px = Math.max(6, px * 0.9);
  }
  g.font = `${px}px ${family}`;
  g.textAlign = o.align; g.textBaseline = 'top'; g.lineJoin = 'round';
  const lineH = px * 1.12, pad = px * 0.35;
  const x = o.align === 'left' ? W * 0.04 : o.align === 'right' ? W * 0.96 : W / 2;
  const block = (text: string, at: 'top' | 'bottom') => {
    if (!text.trim()) return;
    const lines = linesOf(text), bh = lines.length * lineH;
    const y0 = at === 'top' ? H * 0.03 + (o.band ? pad : 0) : H - H * 0.03 - bh - (o.band ? pad : 0);
    if (o.band && !meme) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, y0 - pad, W, bh + pad * 2); }
    lines.forEach((ln, i) => {
      const y = y0 + i * lineH;
      const sw = meme ? px * 0.14 : (o.stroke / 100) * px;
      if (sw > 0) { g.strokeStyle = '#000'; g.lineWidth = sw; g.strokeText(ln, x, y); }
      g.fillStyle = meme ? '#fff' : o.color; g.fillText(ln, x, y);
    });
  };
  block(o.top, 'top'); block(o.bottom, 'bottom');
  return imgOf(c, g);
}

export const caption: Mount = (root, ctx) => {
  let orig: Img | null = null, preview: Img | null = null, name = 'image', fmt: Fmt = 'jpeg';
  const o: CapOpts = { top: 'When the code works', bottom: 'on the first try', style: 'meme', font: FONTS[1][0], color: '#ffffff', size: 9, stroke: 8, band: false, align: 'center', upper: false };
  const canvas = h('canvas', { class: 'ed-canvas' });
  const editor = h('div', { class: 'stack', hidden: true });
  const info = h('div', { class: 'muted small' });
  let tok = 0;
  const redraw = async () => {
    if (!preview) return;
    const my = ++tok, out = await applyCaption(preview, o);
    if (my !== tok) return;
    canvas.width = out.width; canvas.height = out.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
  };
  const capBox = stack(
    field('Font', segmented(FONTS.slice(1).map(([f, l]) => [f, l]) as Array<[string, string]>, o.font, (v) => { o.font = v; redraw(); })),
    grid2(field('Text colour', input({ type: 'color', value: o.color, onInput: (v) => { o.color = v; redraw(); } })),
      field('Align', segmented([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], 'center', (v) => { o.align = v; redraw(); }))),
    slider({ label: 'Outline', min: 0, max: 25, value: o.stroke, unit: '%', onInput: (v) => { o.stroke = v; redraw(); } }),
    h('div', { class: 'row' }, toggle('Dark band behind text', false, (v) => { o.band = v; redraw(); }), toggle('UPPERCASE', false, (v) => { o.upper = v; redraw(); })));
  capBox.hidden = true;
  const save = async (share: boolean) => {
    if (!orig) throw new Error('Choose a photo first.');
    const { img, scaled } = await fitForCanvas(orig);
    const blob = await encodeImg(await applyCaption(img, o), fmt, 90);
    info.textContent = `${fmtBytes(blob.size)} · ${img.width}×${img.height}${scaled ? ' (reduced for iPhone)' : ''}`;
    const fname = `${name}-caption.${EXT[fmt]}`;
    share ? await shareOrDownload(blob, fname) : downloadBlob(blob, fname);
  };
  const input$ = imageInput((img, f) => { orig = img; name = baseName(f.name); preview = previewOf(img, ctx.isMobile ? 900 : 1400); editor.hidden = false; info.textContent = `${img.width}×${img.height}`; redraw(); });
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, canvas), info),
    card('Text', stack(
      field('Top text', textarea({ rows: 2, value: o.top, onInput: (v: string) => { o.top = v; redraw(); } } as any)),
      field('Bottom text', textarea({ rows: 2, value: o.bottom, onInput: (v: string) => { o.bottom = v; redraw(); } } as any)),
      segmented([['meme', 'Meme style'], ['caption', 'Caption']], o.style, (v) => { o.style = v; capBox.hidden = v !== 'caption'; redraw(); }),
      slider({ label: 'Text size', min: 2, max: 20, step: 0.5, value: o.size, unit: '%', onInput: (v) => { o.size = v; redraw(); } }),
      capBox, fmtSeg(fmt, (v) => (fmt = v)))),
    actions(button('Save', () => save(false), { variant: 'primary', icon: 'Download' }), ctx.isMobile ? button('Share', () => save(true), { icon: 'Share2' }) : null),
  );
  root.append(card(null, input$.el), editor);
  loadFonts().then(redraw);
  return () => input$.dispose();
};

// ================================================================== Collage
/** Cell rectangles (0..1) for n photos in a layout. */
export function collageCells(layout: string, n: number): Array<[number, number, number, number]> {
  const T: Record<string, Array<[number, number, number, number]>> = {
    '2h': [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]], '2v': [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
    '3l': [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]], '3t': [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]],
    '4f': [[0, 0, 1, 0.62], [0, 0.62, 1 / 3, 0.38], [1 / 3, 0.62, 1 / 3, 0.38], [2 / 3, 0.62, 1 / 3, 0.38]],
    '5': [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]],
  };
  if (T[layout] && T[layout].length === n) return T[layout];
  const cols = layout === 'rows' ? 1 : layout === 'cols' ? n : Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const cells: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - cols * (rows - 1) : cols; // last row spreads its photos
    const cIdx = i - r * cols;
    cells.push([cIdx / inRow, r / rows, 1 / inRow, 1 / rows]);
  }
  return cells;
}
/** Centre crop rect (in source px) so a w×h source covers a cw×ch cell. */
export function coverCrop(w: number, hh: number, cw: number, ch: number): [number, number, number, number] {
  const s = Math.max(cw / w, ch / hh), sw = cw / s, sh = ch / s;
  return [(w - sw) / 2, (hh - sh) / 2, sw, sh];
}
export interface CollageOpts { layout: string; W: number; H: number; gap: number; radius: number; bg: string }
/** fine: the saved collage — photos resized with Squoosh's Lanczos-3 in linear light (jSquash); the preview uses
 *  imgproc's (instant). */
export async function renderCollage(imgs: Img[], o: CollageOpts, fine = false): Promise<Img> {
  const c = new OffscreenCanvas(o.W, o.H), g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = o.bg; g.fillRect(0, 0, o.W, o.H);
  const gap = (o.gap / 100) * Math.min(o.W, o.H), cells = collageCells(o.layout, imgs.length);
  for (let i = 0; i < imgs.length; i++) {
    const [cx, cy, cw, ch] = cells[i];
    const x = Math.round(cx * (o.W - gap) + gap), y = Math.round(cy * (o.H - gap) + gap);
    const w = Math.max(1, Math.round(cw * (o.W - gap) - gap)), hh = Math.max(1, Math.round(ch * (o.H - gap) - gap));
    const [sx, sy, sw, sh] = coverCrop(imgs[i].width, imgs[i].height, w, hh);
    const cropped = await imgproc('crop', imgs[i], sx, sy, sw, sh);
    const tile = fine ? await resizeImg(cropped, w, hh) : await imgproc('resize', cropped, w, hh);
    const r = (o.radius / 100) * Math.min(w, hh);
    g.save(); g.beginPath(); g.roundRect(x, y, w, hh, r); g.clip();
    g.drawImage(toBitmapSource(tile), x, y);
    g.restore();
  }
  return imgOf(c, g);
}

export const collage: Mount = (root, ctx) => {
  const photos: Array<{ name: string; full: Img; small: Img }> = [];
  let layout = 'auto', size = 'square', fmt: Fmt = 'jpeg';
  const o = { gap: 1.5, radius: 3, bg: '#ffffff' };
  const SIZES: Record<string, [number, number, string]> = { square: [2048, 2048, 'Square 1:1'], portrait: [1638, 2048, 'Portrait 4:5'], landscape: [2048, 1152, 'Landscape 16:9'], story: [1152, 2048, 'Story 9:16'], a4: [2480, 3508, 'A4 print (300 dpi)'] };
  const canvas = h('canvas', { class: 'ed-canvas' });
  const strip = h('div', { class: 'collage-strip' });
  const info = h('div', { class: 'muted small' });
  const stage = card(null, h('div', { class: 'ed-stage' }, canvas), info); stage.hidden = true;
  let tok = 0;
  const dims = (scale: number) => { const [W, H] = SIZES[size]; return { W: Math.round(W * scale), H: Math.round(H * scale) }; };
  const redraw = async () => {
    renderStrip();
    stage.hidden = !photos.length;
    if (!photos.length) return;
    const my = ++tok, d = dims(ctx.isMobile ? 0.35 : 0.5);
    let out: Img;
    try { out = await renderCollage(photos.map((p) => p.small), { layout, ...d, ...o }); }
    catch (e) { if (my === tok) info.textContent = `The preview could not be drawn: ${errMsg(e)}`; return; }
    if (my !== tok) return;
    canvas.width = out.width; canvas.height = out.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
    info.textContent = `${photos.length} photos · output ${SIZES[size][0]}×${SIZES[size][1]}`;
  };
  const renderStrip = () => clear(strip).append(...photos.map((p, i) => h('div', { class: 'collage-item' },
    h('span', { class: 'collage-n' }, String(i + 1)), h('span', { class: 'file-name small' }, p.name),
    Object.assign(button('', () => { if (i > 0) { [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]]; redraw(); } }, { icon: 'ArrowUp', small: true, variant: 'ghost', title: `Move photo ${i + 1} earlier` }), { disabled: i === 0 }), // the first cannot move earlier
    button('', () => { photos.splice(i, 1); redraw(); }, { icon: 'X', small: true, variant: 'ghost', title: `Remove photo ${i + 1}` }))));
  const add = async (fs: File[]) => {
    for (const f of fs) {
      if (photos.length >= 16) { toast('Up to 16 photos per collage', 'err'); break; }
      try { const full = await loadImg(f); photos.push({ name: f.name, full, small: previewOf(full, 900) }); } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    redraw();
  };
  const save = async (share: boolean) => {
    if (photos.length < 2) throw new Error('Add at least two photos.');
    const out = await renderCollage(photos.map((p) => p.full), { layout, ...dims(1), ...o }, true);
    let blob = await encodeImg(out, fmt, 88);
    // the A4 page prints at its size only when the file says 300 dpi (JPEG's JFIF header; PNG and WebP are printed at
    // whatever the printing program assumes)
    const a4 = size === 'a4';
    if (a4 && fmt === 'jpeg') blob = await setJpegDpi(blob, 300);
    const name = `collage.${EXT[fmt]}`;
    info.textContent = `${fmtBytes(blob.size)} · ${out.width}×${out.height}${a4 ? (fmt === 'jpeg' ? ' · 300 dpi (prints at A4)' : ' · choose JPEG for a file that says 300 dpi') : ''}`;
    share ? await shareOrDownload(blob, name) : downloadBlob(blob, name);
  };
  root.append(
    card(null, stack(imagePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: 'Add photos', hint: '2 to 16 photos', onFiles: (f) => add(f) }), strip)),
    stage,
    card('Layout', stack(
      segmented([['auto', 'Grid'], ['2h', 'Side by side'], ['2v', 'Stacked'], ['3l', '1 + 2'], ['3t', '1 over 2'], ['4f', '1 over 3'], ['5', '2 + 3'], ['rows', 'Rows'], ['cols', 'Columns']], layout, (v) => { layout = v; redraw(); }),
      note('Layouts made for a set number of photos fall back to a grid when the count differs.'),
      field('Canvas', segmented(Object.entries(SIZES).map(([k, v]) => [k, v[2]]) as Array<[string, string]>, size, (v) => { size = v; redraw(); })),
      slider({ label: 'Spacing', min: 0, max: 6, step: 0.25, value: o.gap, unit: '%', onInput: (v) => { o.gap = v; redraw(); } }),
      slider({ label: 'Rounded corners', min: 0, max: 30, value: o.radius, unit: '%', onInput: (v) => { o.radius = v; redraw(); } }),
      grid2(field('Background', input({ type: 'color', value: o.bg, onInput: (v) => { o.bg = v; redraw(); } })), fmtSeg(fmt, (v) => (fmt = v))))),
    actions(button('Save collage', () => save(false), { variant: 'primary', icon: 'Download' }), ctx.isMobile ? button('Share', () => save(true), { icon: 'Share2' }) : null),
  );
};
