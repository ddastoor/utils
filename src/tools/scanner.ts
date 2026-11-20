// Doc Scanner: photograph or upload pages → the page found by a small neural network (DocCornerNet LEAN on ONNX
// Runtime Web — src/lib/pagefind.ts; if it is not sure, imgproc's outline of the paper; else the whole photo) with
// draggable corners → perspective correction (homography in C, imgproc) → clean-up (colour / grey / black & white
// adaptive threshold, imgproc) → one PDF (MuPDF: photos as JPEG, black-and-white pages as PNG) or JPEGs.
// Only a preview of each photo is kept; the photo itself is read again, one page at a time, when the pages are saved.
import { h, card, field, button, segmented, stack, note, clear, actions, toast, errMsg, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { imgproc, imgprocDirect, type Img } from '../wasm/imgproc';
import { loadImg, encodeImg, previewOf, paint } from '../lib/imgio';
import { imagePicker, quadEditor, resultList } from '../lib/imgtools';
import { imagesToPdf, type ImagePage } from '../lib/pdf';
import { SIZE, startQuad, isPageQuad, type Found, type Source } from '../lib/pagefind';
import { findPage } from '../lib/pagefind-client';

type Mode = 'color' | 'grey' | 'bw' | 'none';
interface Page { name: string; file: Blob; small: Img; quad: number[]; from: Source; turns: number; mode: Mode; thumb: string }
const MODE_ID: Record<Mode, 0 | 1 | 2 | -1> = { color: 0, grey: 1, bw: 2, none: -1 };
const dist = (q: number[], a: number, b: number, W: number, H: number) => Math.hypot((q[a * 2] - q[b * 2]) * W, (q[a * 2 + 1] - q[b * 2 + 1]) * H);

/** Output pixel size for a quad (normalised) on a W×H source: longest opposite edges, long side capped. */
export function warpSize(q: number[], W: number, H: number, cap = 3000): [number, number] {
  let w = Math.max(dist(q, 0, 1, W, H), dist(q, 3, 2, W, H)), hh = Math.max(dist(q, 0, 3, W, H), dist(q, 1, 2, W, H));
  const s = Math.min(1, cap / Math.max(w, hh));
  w = Math.max(16, Math.round(w * s)); hh = Math.max(16, Math.round(hh * s));
  return [w, hh];
}
/** "Fit to scan": the page has the scan's shape and the length of A4's long side (a photo does not say how big the
    paper was; 841.89 pt = 297 mm, so a page of A4 comes out its real size and a receipt a printable strip). */
export function fitPage(w: number, h: number): [number, number] {
  const s = 841.89 / Math.max(w, h);
  return [Math.round(w * s * 100) / 100, Math.round(h * s * 100) / 100];
}
const ROT = [1, 6, 3, 8];
const CROSSED = 'The corners cross or fold back — drag them so that they go round the page: top-left, top-right, bottom-right, bottom-left.';

/** Warp + rotate + enhance one page (worker). */
async function processPage(p: Page, img: Img, cap: number): Promise<Img> {
  if (!isPageQuad(p.quad, img.width, img.height)) throw new Error(CROSSED);
  const [w, hh] = warpSize(p.quad, img.width, img.height, cap);
  let out = await imgproc('warp', img, p.quad.map((v, i) => v * (i % 2 ? img.height : img.width)), w, hh);
  if (p.turns) out = await imgproc('orient', out, ROT[p.turns]);
  if (p.mode !== 'none') out = await imgproc('docEnhance', out, MODE_ID[p.mode] as 0 | 1 | 2);
  return out;
}

const HOW: Record<Source, string> = {
  model: 'page found — check the corners',
  outline: 'outline of the paper found — check the corners',
  whole: 'no page found — drag the corners to the page edges',
};

export const mount: Mount = (root, ctx) => {
  const pages: Page[] = [];
  let sel = -1, size = 'a4', mode: Mode = 'color', finderNote = '', alive = true;
  const strip = h('div', { class: 'scan-pages' });
  const editCanvas = h('canvas', { class: 'ed-canvas' });
  const outCanvas = h('canvas', { class: 'ed-canvas scan-out' });
  const quad = quadEditor(editCanvas, () => { if (pages[sel]) { pages[sel].quad = quad.quad; schedule(); } });
  const editor = h('div', { class: 'stack', hidden: true });
  const info = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const warn = h('p', { class: 'err-text small', hidden: true, role: 'alert' });
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const results = resultList({ zipName: () => 'scans.zip', isMobile: ctx.isMobile });
  let timer = 0, tok = 0;
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(previewOut, 120); };
  const thumbOf = async (p: Page) => {
    const out = await processPage(p, p.small, 240);
    const c = document.createElement('canvas'); paint(previewOf(out, 200), c); p.thumb = c.toDataURL('image/jpeg', 0.7);
    if (alive) renderStrip();
  };
  const previewOut = async () => {
    const p = pages[sel]; if (!p) return;
    const ok = isPageQuad(p.quad, p.small.width, p.small.height);
    warn.hidden = ok; warn.textContent = ok ? '' : CROSSED; outCanvas.classList.toggle('dim', !ok);
    if (!ok) return;
    const my = ++tok, out = await processPage(p, p.small, 900);
    if (my !== tok || !alive) return;
    paint(out, outCanvas);
    thumbOf(p).catch(() => {});
  };
  const moveBtn = (dir: -1 | 1) => button('', () => {
    const j = sel + dir; if (sel < 0 || j < 0 || j >= pages.length) return;
    [pages[j], pages[sel]] = [pages[sel], pages[j]]; select(j);
  }, { icon: dir < 0 ? 'ArrowLeft' : 'ArrowRight', title: dir < 0 ? 'Move page earlier' : 'Move page later' });
  const earlier = moveBtn(-1), later = moveBtn(1);
  const renderStrip = () => clear(strip).append(...pages.map((p, i) => h('button', { type: 'button', class: ['scan-thumb', i === sel && 'sel'], 'aria-label': `Page ${i + 1}`, 'aria-pressed': String(i === sel), onclick: () => select(i) },
    p.thumb ? h('img', { src: p.thumb, alt: '' }) : null, h('span', null, String(i + 1)))));
  const select = (i: number) => {
    sel = i; const p = pages[i]; editor.hidden = !p; renderStrip();
    (earlier as HTMLButtonElement).disabled = !p || i === 0; (later as HTMLButtonElement).disabled = !p || i === pages.length - 1;
    if (!p) { info.textContent = ''; return; }
    paint(p.small, editCanvas); quad.quad = p.quad; modeSeg.value = p.mode;
    info.textContent = `Page ${i + 1} of ${pages.length} · ${p.name} · ${HOW[p.from]}${p.from !== 'model' && finderNote ? ` (${finderNote})` : ''}`;
    previewOut();
  };
  const add = async (files: File[]) => {
    const ip = await imgprocDirect();
    let added = 0;
    for (const [n, f] of files.entries()) {
      if (!alive) return;
      status.textContent = files.length > 1 ? `Reading photo ${n + 1} of ${files.length}…` : 'Reading the photo…';
      try {
        const small = previewOf(await loadImg(f), ctx.isMobile ? 900 : 1100); // the photo itself is not kept
        let found: Found | null = null;
        try {
          if (!finderNote && !pages.length) status.textContent = 'Finding the page (the page finder is fetched once, about 5 MB)…';
          found = await findPage(ip.resizeArea(small, SIZE, SIZE).data);
          finderNote = '';
        } catch (e) {
          if (!alive) return;
          if (!finderNote) toast(`The page finder could not be loaded (${errMsg(e)}) — the outline of the paper is looked for instead.`, 'err');
          finderNote = 'the page finder could not be loaded';
        }
        const s = startQuad(found, ip.detectQuad(small), small.width, small.height);
        const p: Page = { name: f.name, file: f, small, quad: s.quad, from: s.from, turns: 0, mode, thumb: '' };
        pages.push(p); added++;
        thumbOf(p).catch(() => {});
      } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    status.textContent = '';
    if (added && alive) select(pages.length - 1);
  };
  const modeSeg = segmented([['color', 'Colour'], ['grey', 'Grey'], ['bw', 'B & W'], ['none', 'Original']], mode, (v) => { mode = v; if (pages[sel]) { pages[sel].mode = v; schedule(); } });
  const exportAll = async (kind: 'pdf' | 'jpg', share = false) => {
    if (!pages.length) throw new Error('Add a page first.');
    const bad = pages.findIndex((p) => !isPageQuad(p.quad, p.small.width, p.small.height));
    if (bad >= 0) { select(bad); throw new Error(`Page ${bad + 1}: ${CROSSED}`); }
    const out: ImagePage[] = [], files: Array<{ name: string; blob: Blob; size: string }> = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        status.textContent = `Saving page ${i + 1} of ${pages.length}…`;
        let img: Img;
        try { img = await processPage(p, await loadImg(p.file), 3000); } catch (e) { throw new Error(`Page ${i + 1} (${p.name}): ${errMsg(e)}`); }
        // black and white: a PNG for the PDF (two colours — no JPEG smudges around the letters, and smaller)
        const blob = kind === 'pdf' && p.mode === 'bw' ? await encodeImg(img, 'png') : await encodeImg(img, 'jpeg', p.mode === 'bw' ? 85 : 80);
        if (kind === 'pdf') out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: img.width, height: img.height, pt: size === 'fit' ? fitPage(img.width, img.height) : undefined });
        else files.push({ name: `scan-${String(i + 1).padStart(2, '0')}.jpg`, blob, size: `${img.width}×${img.height}` });
      }
    } finally { status.textContent = ''; }
    if (!alive) return;
    if (kind === 'pdf') {
      const pdf = new Blob([await imagesToPdf(out, { size, margin: 0 }) as BlobPart], { type: 'application/pdf' });
      status.textContent = `PDF: ${pages.length} page${pages.length > 1 ? 's' : ''}, ${fmtBytes(pdf.size)}`;
      share ? await shareOrDownload(pdf, 'scan.pdf') : downloadBlob(pdf, 'scan.pdf');
    } else {
      results.clear();
      for (const f of files) results.add(f.name, f.blob, f.size);
      status.textContent = `${files.length} JPEG${files.length > 1 ? 's' : ''} ready below`;
    }
  };
  editor.append(
    card(null, info, h('div', { class: 'scan-grid' }, h('div', { class: 'ed-stage' }, quad.el), h('div', { class: 'ed-stage' }, outCanvas)), warn,
      h('div', { class: 'row' },
        button('', () => { const p = pages[sel]; if (p) { p.turns = (p.turns + 3) % 4; schedule(); } }, { icon: 'RotateCcw', title: 'Rotate page left' }),
        button('', () => { const p = pages[sel]; if (p) { p.turns = (p.turns + 1) % 4; schedule(); } }, { icon: 'RotateCw', title: 'Rotate page right' }),
        button('Whole photo', () => { const p = pages[sel]; if (p) { p.quad = [0, 0, 1, 0, 1, 1, 0, 1]; quad.quad = p.quad; schedule(); } }, { small: true, variant: 'ghost', icon: 'Maximize' }),
        earlier, later,
        button('', () => { if (sel < 0) return; pages.splice(sel, 1); select(Math.min(sel, pages.length - 1)); }, { icon: 'Trash2', title: 'Delete page', variant: 'danger' }))),
    card('Clean-up', stack(modeSeg, note('B & W gives the crispest text and the smallest PDF; Colour keeps stamps and signatures in colour.'))),
  );
  // photos of pages — or the camera (phone: the back camera; PC: the webcam), which stays open for page after page
  const pick = (o: { label: string; hint: string }) => imagePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: o.label, hint: o.hint, onFiles: (f) => add(f).catch((e) => toast(errMsg(e), 'err')) });
  root.append(
    card(null, stack(
      ctx.isMobile
        ? pick({ label: 'Choose photos', hint: 'pages you have already photographed — or use the camera: flat, well lit, all four corners in the picture' })
        : pick({ label: 'Add page photos', hint: 'one or many pages — flat, well lit, all four corners visible' }),
      status, strip,
      h('div', { class: 'row' }, button('Start over', () => { pages.length = 0; results.clear(); select(-1); status.textContent = ''; }, { small: true, variant: 'ghost', icon: 'RotateCcw', title: 'Remove all pages' })))),
    editor,
    card('Save', stack(field('PDF page size', segmented([['a4', 'A4'], ['letter', 'Letter'], ['fit', 'Fit to scan']], size, (v) => (size = v))))),
    actions(button(ctx.isMobile ? 'PDF' : 'Save PDF', () => exportAll('pdf'), { variant: 'primary', icon: 'FileDown', title: 'Save all pages as one PDF' }),
      button(ctx.isMobile ? 'JPGs' : 'Save JPGs', () => exportAll('jpg'), { icon: 'Images', title: 'Save each page as a JPEG' }),
      ctx.isMobile ? button('Share', () => exportAll('pdf', true), { icon: 'Share2' }) : null),
    card(null, results.el),
  );
  select(-1);
  return () => { alive = false; clearTimeout(timer); results.clear(); };
};
