// Doc Scanner: photograph or upload pages → automatic page detection (imgproc.wasm: Otsu + largest component +
// extreme points) with draggable corners → perspective correction (homography in C) → clean-up (colour / grey /
// black & white adaptive threshold, imgproc) → multi-page PDF (MuPDF, JPEG pages embedded as-is) or JPEGs.
import { h, card, field, button, segmented, stack, note, clear, actions, toast, errMsg, downloadBlob, shareOrDownload, fmtBytes, filePicker, type Mount } from '../ui';
import { imgproc, imgprocDirect, type Img } from '../wasm/imgproc';
import { loadImg, encodeImg, previewOf, paint } from '../lib/imgio';
import { quadEditor, resultList } from '../lib/imgtools';
import { imagesToPdf } from '../lib/pdf';

type Mode = 'color' | 'grey' | 'bw' | 'none';
interface Page { name: string; src: Img; small: Img; quad: number[]; turns: number; mode: Mode; thumb: string }
const MODE_ID: Record<Mode, 0 | 1 | 2 | -1> = { color: 0, grey: 1, bw: 2, none: -1 };
const dist = (q: number[], a: number, b: number, W: number, H: number) => Math.hypot((q[a * 2] - q[b * 2]) * W, (q[a * 2 + 1] - q[b * 2 + 1]) * H);

/** Output pixel size for a quad (normalised) on a W×H source: longest opposite edges, long side capped. */
export function warpSize(q: number[], W: number, H: number, cap = 3000): [number, number] {
  let w = Math.max(dist(q, 0, 1, W, H), dist(q, 3, 2, W, H)), hh = Math.max(dist(q, 0, 3, W, H), dist(q, 1, 2, W, H));
  const s = Math.min(1, cap / Math.max(w, hh));
  w = Math.max(16, Math.round(w * s)); hh = Math.max(16, Math.round(hh * s));
  return [w, hh];
}
const ROT = [1, 6, 3, 8];

/** Warp + rotate + enhance one page (worker). */
async function processPage(p: Page, img: Img, cap: number): Promise<Img> {
  const [w, hh] = warpSize(p.quad, img.width, img.height, cap);
  let out = await imgproc('warp', img, p.quad.map((v, i) => v * (i % 2 ? img.height : img.width)), w, hh);
  if (p.turns) out = await imgproc('orient', out, ROT[p.turns]);
  if (p.mode !== 'none') out = await imgproc('docEnhance', out, MODE_ID[p.mode] as 0 | 1 | 2);
  return out;
}

export const mount: Mount = (root, ctx) => {
  const pages: Page[] = [];
  let sel = -1, size = 'a4', mode: Mode = 'color';
  const strip = h('div', { class: 'scan-pages' });
  const editCanvas = h('canvas', { class: 'ed-canvas' });
  const outCanvas = h('canvas', { class: 'ed-canvas scan-out' });
  const quad = quadEditor(editCanvas, () => { if (pages[sel]) { pages[sel].quad = quad.quad; schedule(); } });
  const editor = h('div', { class: 'stack', hidden: true });
  const info = h('div', { class: 'muted small' });
  const results = resultList({ zipName: () => 'scans.zip', isMobile: ctx.isMobile });
  let timer = 0, tok = 0;
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(previewOut, 120); };
  const previewOut = async () => {
    const p = pages[sel]; if (!p) return;
    const my = ++tok, out = await processPage(p, p.small, 900);
    if (my !== tok) return;
    paint(out, outCanvas);
    const c = document.createElement('canvas'); paint(previewOf(out, 200), c); p.thumb = c.toDataURL('image/jpeg', 0.7); renderStrip();
  };
  const renderStrip = () => clear(strip).append(...pages.map((p, i) => h('button', { type: 'button', class: ['scan-thumb', i === sel && 'sel'], 'aria-label': `Page ${i + 1}`, onclick: () => select(i) },
    p.thumb ? h('img', { src: p.thumb, alt: '' }) : null, h('span', null, String(i + 1)))));
  const select = (i: number) => {
    sel = i; const p = pages[i]; editor.hidden = !p; renderStrip();
    if (!p) return;
    paint(p.small, editCanvas); quad.quad = p.quad; modeSeg.value = p.mode;
    info.textContent = `Page ${i + 1} of ${pages.length} · ${p.name} · drag the corners to the page edges`;
    previewOut();
  };
  const add = async (files: File[]) => {
    const ip = await imgprocDirect();
    for (const f of files) {
      try {
        const src = await loadImg(f), small = previewOf(src, ctx.isMobile ? 900 : 1100);
        const d = ip.detectQuad(small);
        const q = d.confidence > 0 ? d.corners.map((v, k) => v / (k % 2 ? small.height : small.width)) : [0.02, 0.02, 0.98, 0.02, 0.98, 0.98, 0.02, 0.98];
        pages.push({ name: f.name, src, small, quad: q, turns: 0, mode, thumb: '' });
      } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    select(pages.length - 1);
  };
  const modeSeg = segmented([['color', 'Colour'], ['grey', 'Grey'], ['bw', 'B & W'], ['none', 'Original']], mode, (v) => { mode = v; if (pages[sel]) { pages[sel].mode = v; schedule(); } });
  const exportAll = async (kind: 'pdf' | 'jpg', share = false) => {
    if (!pages.length) throw new Error('Add a page first.');
    const out: Array<{ bytes: Uint8Array; width: number; height: number }> = [];
    for (let i = 0; i < pages.length; i++) {
      info.textContent = `Processing page ${i + 1} of ${pages.length}…`;
      const img = await processPage(pages[i], pages[i].src, 3000);
      const blob = await encodeImg(img, 'jpeg', pages[i].mode === 'bw' ? 70 : 80);
      out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: img.width, height: img.height });
    }
    if (kind === 'pdf') {
      const pdf = new Blob([await imagesToPdf(out, { size, margin: 0 }) as BlobPart], { type: 'application/pdf' });
      info.textContent = `PDF: ${pages.length} page${pages.length > 1 ? 's' : ''}, ${fmtBytes(pdf.size)}`;
      share ? await shareOrDownload(pdf, 'scan.pdf') : downloadBlob(pdf, 'scan.pdf');
    } else {
      results.clear();
      out.forEach((o, i) => results.add(`scan-${String(i + 1).padStart(2, '0')}.jpg`, new Blob([o.bytes as BlobPart], { type: 'image/jpeg' }), `${o.width}×${o.height}`));
      info.textContent = `${out.length} JPEG${out.length > 1 ? 's' : ''} ready below`;
    }
  };
  editor.append(
    card(null, info, h('div', { class: 'scan-grid' }, h('div', { class: 'ed-stage' }, quad.el), h('div', { class: 'ed-stage' }, outCanvas)),
      h('div', { class: 'row' },
        button('', () => { const p = pages[sel]; if (p) { p.turns = (p.turns + 3) % 4; schedule(); } }, { icon: 'RotateCcw', title: 'Rotate page left' }),
        button('', () => { const p = pages[sel]; if (p) { p.turns = (p.turns + 1) % 4; schedule(); } }, { icon: 'RotateCw', title: 'Rotate page right' }),
        button('Whole photo', () => { const p = pages[sel]; if (p) { p.quad = [0, 0, 1, 0, 1, 1, 0, 1]; quad.quad = p.quad; schedule(); } }, { small: true, variant: 'ghost', icon: 'Maximize' }),
        button('', () => { if (sel > 0) { [pages[sel - 1], pages[sel]] = [pages[sel], pages[sel - 1]]; select(sel - 1); } }, { icon: 'ArrowLeft', title: 'Move page earlier' }),
        button('', () => { pages.splice(sel, 1); select(Math.min(sel, pages.length - 1)); }, { icon: 'Trash2', title: 'Delete page', variant: 'danger' }))),
    card('Clean-up', stack(modeSeg, note('B & W gives the crispest text and smallest files; Colour keeps stamps and signatures in colour.'))),
  );
  root.append(
    card(null, stack(filePicker({ accept: 'image/*,.heic,.heif', multiple: true, capture: ctx.isMobile ? 'environment' : undefined, label: ctx.isMobile ? 'Take a photo of a page' : 'Add page photos', hint: 'one or many pages — flat, well lit, all four corners visible', onFiles: (f) => add(f).catch((e) => toast(errMsg(e), 'err')) }), strip)),
    editor,
    card('Save', stack(field('PDF page size', segmented([['a4', 'A4'], ['letter', 'Letter'], ['fit', 'Fit to scan']], size, (v) => (size = v))))),
    actions(button(ctx.isMobile ? 'PDF' : 'Save PDF', () => exportAll('pdf'), { variant: 'primary', icon: 'FileDown', title: 'Save all pages as one PDF' }),
      button(ctx.isMobile ? 'JPGs' : 'Save JPGs', () => exportAll('jpg'), { icon: 'Images', title: 'Save each page as a JPEG' }),
      ctx.isMobile ? button('Share', () => exportAll('pdf', true), { icon: 'Share2' }) : null),
    card(null, results.el),
  );
  return () => results.clear();
};
