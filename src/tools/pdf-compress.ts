// Compress PDF: re-encode the embedded images (resize to a target dpi in imgproc.wasm, MozJPEG), subset fonts, remove
// duplicate objects (MuPDF). "Target size" tries stronger levels until the file fits; "Scanned pages" rebuilds each page
// as one JPEG (smallest for scans, but the text layer is lost).
import { h, card, field, stack, note, actions, button, segmented, input, progress, fmtBytes, type Mount } from '../ui';
import { mupdf, imagesToPdf, pageGeom, renderPage } from '../lib/pdf';
import { pdfInput, savePdfFile, stem, type LoadedPdf } from '../lib/pdfui';
import { imgproc } from '../wasm/imgproc';
import { encodeImg } from '../lib/imgio';

export interface Level { dpi: number; q: number; label: string }
export const LEVELS: Level[] = [
  { dpi: 220, q: 84, label: 'Light (best quality)' },
  { dpi: 150, q: 72, label: 'Recommended' },
  { dpi: 110, q: 60, label: 'Strong' },
  { dpi: 80, q: 48, label: 'Extreme' },
];

type Progress = (frac: number | null, text: string) => void;
/** Recompress the images of a PDF (fresh copy of `bytes`). Returns the new file. */
export async function compressPdf(bytes: Uint8Array, password: string | undefined, lv: Level, onProgress?: Progress): Promise<Uint8Array> {
  const m = await mupdf();
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
  if (password !== undefined) doc.authenticatePassword(password);
  // the largest page decides the pixel budget: an image never needs more pixels than a full page at the target dpi
  let maxIn = 0;
  for (let i = 0; i < doc.countPages(); i++) { const g = pageGeom(doc.loadPage(i) as any); maxIn = Math.max(maxIn, g.W / 72, g.H / 72); }
  const maxPx = Math.ceil(maxIn * lv.dpi);
  // soft masks / masks of other images stay untouched (lossy masks give halos)
  const n = doc.countObjects(), masks = new Set<number>(), images: number[] = [];
  for (let k = 1; k < n; k++) {
    const o = doc.newIndirect(k); // stream-ness is reported on the indirect reference, not on the resolved dictionary
    if (!o.isStream() || o.get('Subtype').toString() !== '/Image') continue;
    images.push(k);
    for (const key of ['SMask', 'Mask']) { const r = o.get(key); if (r.isIndirect()) masks.add(r.asIndirect()); }
  }
  let done = 0;
  for (const k of images) {
    onProgress?.(done++ / Math.max(1, images.length), `Images ${done}/${images.length}…`);
    if (masks.has(k)) continue;
    const ref = doc.newIndirect(k), o = ref;
    if (o.get('ImageMask').valueOf() === true) continue;
    const old = o.readRawStream().length;
    if (old < 8 * 1024) continue; // tiny images: not worth it
    let img: any;
    try { img = doc.loadImage(ref); } catch { continue; }
    const w = img.getWidth(), hgt = img.getHeight();
    if (w < 16 || hgt < 16) continue;
    const cs = img.getColorSpace(), grey = !!cs?.isGray();
    let pix = img.toPixmap();
    if (pix.getColorSpace() && !(grey ? pix.getColorSpace().isGray() : pix.getColorSpace().isRGB())) pix = pix.convertToColorSpace(grey ? m.ColorSpace.DeviceGray : m.ColorSpace.DeviceRGB, false);
    let rgba = await imgproc('expand', pix.getPixels(), pix.getWidth(), pix.getHeight(), pix.getNumberOfComponents());
    const s = Math.min(1, maxPx / Math.max(w, hgt));
    if (s < 0.98) rgba = await imgproc('resize', rgba, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(hgt * s)));
    const jpg = new Uint8Array(await (await encodeImg(rgba, 'jpeg', lv.q, grey ? { color_space: 1 } : {})).arrayBuffer());
    if (jpg.length >= old * 0.92) continue; // keep the original when re-encoding does not really help
    o.writeRawStream(jpg);
    o.put('Filter', doc.newName('DCTDecode'));
    o.put('Width', rgba.width); o.put('Height', rgba.height); o.put('BitsPerComponent', 8);
    o.put('ColorSpace', doc.newName(grey ? 'DeviceGray' : 'DeviceRGB'));
    for (const key of ['DecodeParms', 'Decode', 'Intent']) o.delete(key);
  }
  onProgress?.(null, 'Saving…');
  try { doc.subsetFonts(); } catch { /* fonts that cannot be subset stay as they are */ }
  return doc.saveToBuffer(`compress,compress-fonts,garbage=deduplicate${password !== undefined ? ',encrypt=none' : ''}`).asUint8Array().slice();
}

/** Every page as one JPEG at `dpi` (for scans). Page sizes are kept. */
export async function rasterisePdf(f: LoadedPdf, dpi: number, q: number, grey: boolean, onProgress?: Progress): Promise<Uint8Array> {
  const pages: Array<{ bytes: Uint8Array; width: number; height: number; pt: [number, number] }> = [];
  for (let i = 0; i < f.pages; i++) {
    onProgress?.(i / f.pages, `Page ${i + 1}/${f.pages}…`);
    const pix = await renderPage(f.doc, i, dpi / 72, false);
    let rgba = await imgproc('expand', pix.getPixels(), pix.getWidth(), pix.getHeight(), pix.getNumberOfComponents());
    if (grey) rgba = await imgproc('grayscale', rgba);
    const bytes = new Uint8Array(await (await encodeImg(rgba, 'jpeg', q, grey ? { color_space: 1 } : {})).arrayBuffer());
    const g = pageGeom(f.doc.loadPage(i) as any);
    pages.push({ bytes, width: rgba.width, height: rgba.height, pt: [g.W, g.H] }); // exact page size (pixels are rounded)
  }
  return imagesToPdf(pages, { size: 'fit', dpi });
}

export const mount: Mount = (root, ctx) => {
  let f: LoadedPdf | null = null, mode: 'level' | 'target' | 'scan' = 'level', level = 1, targetKB = 500, scanDpi = 150, scanGrey = true;
  const info = h('div', { class: 'muted small' }), prog = progress(), result = h('div', { class: 'stack' });
  const inp = pdfInput({ onLoad: ([x]) => { f = x; result.replaceChildren(); info.textContent = `${x.name}: ${x.pages} page${x.pages > 1 ? 's' : ''}, ${fmtBytes(x.bytes.length)}`; } });
  const levelBox = field('Level', segmented(LEVELS.map((l, i) => [String(i), l.label] as [string, string]), String(level), (v) => (level = +v)), 'Images are resized to the level’s dpi and saved as JPEG; text and drawings stay sharp.');
  const targetBox = field('Make it smaller than', h('div', { class: 'row' }, input({ type: 'number', value: targetKB, min: 20, onInput: (v) => (targetKB = Math.max(20, +v || 0)) }), h('span', null, 'KB')), 'Tries Light → Extreme until the file fits.'); targetBox.hidden = true;
  const scanBox = stack(field('Resolution', segmented([['100', '100 dpi'], ['150', '150 dpi'], ['200', '200 dpi']], String(scanDpi), (v) => (scanDpi = +v))),
    field('Colour', segmented([['grey', 'Black & white / grey'], ['colour', 'Colour']], 'grey', (v) => (scanGrey = v === 'grey'))),
    note('Each page becomes one picture: the smallest result for scanned documents, but text can no longer be selected or searched.', 'warn')); scanBox.hidden = true;
  const show = (out: Uint8Array, how: string) => {
    const before = f!.bytes.length, pct = Math.round((1 - out.length / before) * 100);
    result.replaceChildren(h('div', { class: ['note', pct > 0 ? 'note-ok' : 'note-info'] }, pct > 0 ? `${fmtBytes(before)} → ${fmtBytes(out.length)} (−${pct} %) · ${how}` : `Already compact: ${fmtBytes(before)} → ${fmtBytes(out.length)} · ${how}`));
  };
  root.append(card(null, inp.el, info),
    card('How', stack(segmented([['level', 'Compression level'], ['target', 'Target size'], ['scan', 'Scanned pages']], mode, (v) => { mode = v; levelBox.hidden = v !== 'level'; targetBox.hidden = v !== 'target'; scanBox.hidden = v !== 'scan'; }), levelBox, targetBox, scanBox)),
    card(null, prog, result),
    actions(button('Compress', async () => {
      if (!f) throw new Error('Choose a PDF first.');
      const set: Progress = (p, t) => prog.set(p, t);
      let out: Uint8Array, how: string;
      try {
        if (mode === 'scan') { out = await rasterisePdf(f, scanDpi, scanGrey ? 55 : 62, scanGrey, set); how = `pages as ${scanDpi} dpi JPEG`; }
        else if (mode === 'level') { out = await compressPdf(f.bytes, f.password, LEVELS[level], set); how = LEVELS[level].label; }
        else {
          out = f.bytes; how = 'no level fits';
          for (const lv of LEVELS) { const o = await compressPdf(f.bytes, f.password, lv, set); if (o.length < out.length) { out = o; how = lv.label; } if (o.length <= targetKB * 1024) { how = `${lv.label} (fits ${targetKB} KB)`; break; } }
          if (out.length > targetKB * 1024) how += ` — still over ${targetKB} KB; try “Scanned pages”`;
        }
      } finally { prog.done(); }
      show(out, how);
      if (out.length >= f.bytes.length && mode !== 'scan') return; // nothing gained: keep the original
      await savePdfFile(out, `${stem(f.name)}-compressed.pdf`, ctx.isMobile);
    }, { variant: 'primary', icon: 'Minimize2' })));
};
