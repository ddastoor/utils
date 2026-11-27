// Book Page Flattener (potentials #96; owner, 21 Nov 2026): photos of an open book → each page flat — the curve near the
// spine taken out, the two pages of a spread split at the gutter, the lines straight → clean pages as pictures or one PDF.
// Engine: imgproc.wasm (wasm/imgproc/flatten.c — Matt Zucker's page-dewarp method in C: the text lines found, a curved
// sheet and the camera fitted to them, every pixel of the flat page looked up in the photo); the steps around it in
// src/lib/bookflat.ts. Only a copy of each photo (at most 1,600 px) is kept; the photo is read again when the pages are
// saved, and each page drawn from it at the photo's own resolution.
import { h, card, field, button, segmented, select as selectBox, stack, note, clear, actions, toast, errMsg, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { imgproc, type Img, type BookFit, type BookPage } from '../wasm/imgproc';
import { loadImg, encodeImg, previewOf, paint } from '../lib/imgio';
import { imagePicker, resultList } from '../lib/imgtools';
import { imagesToPdf, type ImagePage } from '../lib/pdf';
import { textTurns } from '../lib/upright';
import { analyse, renderPage, summary, sideName, fitPage, focalFrom35, FIT_SIZE, ROT, type BookOps, type PagesMode } from '../lib/bookflat';
import { readExif } from '../lib/exif';

type Look = 'none' | 'color' | 'grey' | 'bw';
const LOOK_ID: Record<Look, -1 | 0 | 1 | 2> = { none: -1, color: 0, grey: 1, bw: 2 };
/** The lens that took the photo: its focal length as on 35 mm film ('exif': what the photo says). The fit needs it — a zoomed
 *  photo flattened as if taken with the main camera came out skewed by up to 7 % of the page's width (docs/WASM-AUDIT.md
 *  179); phones write it into the photo, a photo sent through a chat app has lost it. */
type Lens = 'exif' | '13' | '26' | '52' | '77' | '120';
const LENSES: Array<[Lens, string]> = [['13', 'Ultra-wide (0.5×, about 13 mm)'], ['26', 'Main camera or webcam (1×, about 26 mm)'], ['52', 'Zoom 2× (about 52 mm)'], ['77', 'Zoom 3× (about 77 mm)'], ['120', 'Zoom 5× (about 120 mm)']];
interface Shot { name: string; file: Blob; mode: PagesMode; turns: number; lens: Lens; f35: number; focal: number; img: Img; fit: BookFit; thumbs: string[] }
/** the fit's focal length for a photo of w × h taken with a lens */
const focalOf = (lens: Lens, f35: number, w: number, h: number) => focalFrom35(lens === 'exif' ? f35 : +lens, w, h);

/** The engine's calls in the imgproc worker. */
const ops: BookOps = {
  bookFit: (img, mode, focal) => imgproc('bookFit', img, mode, focal ?? 0),
  bookProject: (page, w, h, pts) => imgproc('bookProject', page, w, h, pts),
  bookRender: (img, page, w, h, fill) => imgproc('bookRender', img, page, w, h, fill),
  orient: (img, o) => imgproc('orient', img, o),
};
const NO_TEXT = 'No lines of print were found in this photo — the flattener follows the lines of text. Try a sharper photo with the whole page in it, or turn it with the buttons.';

export const mount: Mount = (root, ctx) => {
  const shots: Shot[] = [];
  let sel = -1, page = 0, mode: PagesMode = 'auto', look: Look = 'color', size = 'fit', alive = true, tok = 0;
  const cap = ctx.isMobile ? 2400 : 3200; // a saved page's longer side at most (a phone's memory)
  const strip = h('div', { class: 'scan-pages' });
  const photoCanvas = h('canvas', { class: 'ed-canvas', role: 'img', 'aria-label': 'The photo, with the lines of text found and the gutter between the pages' });
  const pageCanvas = h('canvas', { class: 'ed-canvas', role: 'img', 'aria-label': 'The page flattened' });
  const editor = h('div', { class: 'stack', hidden: true });
  const info = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const warn = h('p', { class: 'err-text small', hidden: true, role: 'alert' });
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const results = resultList({ zipName: () => 'book-pages.zip', isMobile: ctx.isMobile });
  /** every page of every photo, in order: [photo, page] */
  const pagesOf = () => shots.flatMap((s, i) => (s.fit.pages.length ? s.fit.pages.map((_, j) => [i, j] as const) : []));
  const withLook = async (img: Img) => (look === 'none' ? img : imgproc('docEnhance', img, LOOK_ID[look] as 0 | 1 | 2));

  const thumbsOf = async (s: Shot) => {
    s.thumbs = [];
    for (const p of s.fit.pages) {
      const out = await withLook(await renderPage(s.img, p, 260, ops));
      const c = document.createElement('canvas'); paint(previewOf(out, 220), c); s.thumbs.push(c.toDataURL('image/jpeg', 0.7));
    }
    if (alive) renderStrip();
  };
  const renderStrip = () => {
    const list = pagesOf();
    clear(strip).append(...list.map(([i, j], n) => {
      const s = shots[i], on = i === sel && j === page;
      return h('button', { type: 'button', class: ['scan-thumb', on && 'sel'], 'aria-label': `Page ${n + 1}: ${sideName(s.fit.pages[j])} of ${s.name}`, 'aria-pressed': String(on), onclick: () => select(i, j) },
        s.thumbs[j] ? h('img', { src: s.thumbs[j], alt: '' }) : null, h('span', null, String(n + 1)));
    }));
  };
  /** the photo with what was found on it: the samples of each line (a dot each), the gutter, and each flat page's outline
   *  (the part of the photo that becomes the page — the chosen one drawn heavier) */
  const drawPhoto = async (s: Shot) => {
    const pv = previewOf(s.img, ctx.isMobile ? 700 : 900);
    const edges = await Promise.all(s.fit.pages.map((p) => {
      const pts: number[][] = []; const N = 24;
      for (let i = 0; i <= N; i++) pts.push([i / N, 0]); for (let i = 1; i <= N; i++) pts.push([1, i / N]);
      for (let i = N - 1; i >= 0; i--) pts.push([i / N, 1]); for (let i = N - 1; i > 0; i--) pts.push([0, i / N]);
      return ops.bookProject!(p, pv.width, pv.height, pts);
    }));
    if (shots[sel] !== s || !alive) return;
    paint(pv, photoCanvas);
    const g = photoCanvas.getContext('2d')!, k = pv.width / s.img.width, half = Math.max(pv.width, pv.height) / 2;
    const css = getComputedStyle(photoCanvas), accent = css.getPropertyValue('--accent').trim() || '#4f46e5';
    edges.forEach((pts, j) => {
      g.strokeStyle = accent; g.lineWidth = Math.max(j === page ? 3 : 1.5, pv.width / (j === page ? 280 : 500)); g.setLineDash([]);
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + 0.5, y + 0.5) : g.moveTo(x + 0.5, y + 0.5))); g.closePath(); g.stroke();
    });
    for (const [u, v, , pg] of s.fit.points) {
      if (pg < 0) continue;
      g.fillStyle = pg === 2 ? '#0a8a5a' : pg === 1 ? '#c2410c' : '#2563eb';
      g.beginPath(); g.arc(u * half + pv.width / 2, v * half + pv.height / 2, Math.max(1.5, pv.width / 400), 0, 2 * Math.PI); g.fill();
    }
    if (s.fit.gutter) {
      const [x0, y0, x1, y1] = s.fit.gutter;
      g.strokeStyle = accent; g.lineWidth = Math.max(2, pv.width / 300); g.setLineDash([8, 6]);
      g.beginPath(); g.moveTo((x0 + 0.5) * k, (y0 + 0.5) * k); g.lineTo((x1 + 0.5) * k, (y1 + 0.5) * k); g.stroke();
    }
  };
  const previewPage = async () => {
    const s = shots[sel]; if (!s) return;
    const p = s.fit.pages[page];
    warn.hidden = !!p; warn.textContent = p ? '' : NO_TEXT;
    pageCanvas.hidden = !p; if (!p) return;
    const my = ++tok, out = await withLook(await renderPage(s.img, p, ctx.isMobile ? 900 : 1200, ops));
    if (my !== tok || !alive) return;
    paint(out, pageCanvas);
    pageCanvas.dataset.shown = `${s.name}|${p.side}|${s.lens}`; // what the page shows (for the tests)
  };
  const pagesSeg = segmented<PagesMode>([['auto', 'Find out'], ['one', 'One page'], ['two', 'Two pages']], mode, (v) => { const s = shots[sel]; if (s) refit(s, v, s.turns, true); });
  const sideSeg = segmented<'0' | '1'>([['0', 'Left page'], ['1', 'Right page']], '0', (v) => { select(sel, +v); });
  const lensSel = selectBox<Lens>(LENSES, '26', (v) => {
    const s = shots[sel]; if (!s) return;
    s.lens = v; s.focal = focalOf(v, s.f35, s.img.width, s.img.height); refit(s, s.mode, s.turns, true);
  });
  /** the lenses to choose from for a photo: what it says first, where it says */
  const lensOptions = (s: Shot) => {
    const list: Array<[Lens, string]> = s.f35 ? [['exif', `As the photo says (${s.f35} mm)`], ...LENSES] : LENSES;
    lensSel.replaceChildren(...list.map(([v, l]) => h('option', { value: v }, l))); lensSel.value = s.lens;
  };
  const sideRow = h('div', { class: 'row' }, sideSeg);
  const select = (i: number, j = 0) => {
    sel = i; const s = shots[i]; editor.hidden = !s;
    page = s && j < s.fit.pages.length ? j : 0;
    renderStrip();
    if (!s) { info.textContent = ''; return; }
    pagesSeg.value = s.mode; sideRow.hidden = s.fit.pages.length !== 2; sideSeg.value = String(page) as '0' | '1'; lensOptions(s);
    info.textContent = `Photo ${i + 1} of ${shots.length} · ${s.name} · ${summary(s.fit)}${s.turns ? ` · turned ${s.turns === 2 ? 'upside down' : `a quarter to the ${s.turns === 1 ? 'right' : 'left'}`}` : ''}`;
    drawPhoto(s).catch(() => {}); previewPage().catch((e) => toast(errMsg(e), 'err'));
  };
  /** the pages of a photo again: another number of pages, or turned by hand */
  const refit = async (s: Shot, m: PagesMode, turns: number, only: boolean) => {
    status.textContent = 'Finding the pages…';
    try {
      const small = previewOf(await loadImg(s.file), FIT_SIZE);
      const a = await analyse(small, m, ops, turns, only, s.focal);
      if (!alive) return;
      Object.assign(s, { mode: m, turns: a.turns, img: a.img, fit: a.fit });
      await thumbsOf(s);
      if (shots[sel] === s) select(sel, 0);
    } catch (e) { toast(errMsg(e), 'err'); } finally { status.textContent = ''; }
  };
  const add = async (files: File[]) => {
    let added = 0;
    for (const [n, f] of files.entries()) {
      if (!alive) return;
      status.textContent = files.length > 1 ? `Flattening photo ${n + 1} of ${files.length}…` : 'Finding the pages…';
      try {
        const small = previewOf(await loadImg(f), FIT_SIZE); // the photo itself is not kept
        // the lens, where the photo says (a phone's JPEG does; the camera of the page does not: the main camera then)
        const said = (await readExif(f).catch(() => null))?.focal35 ?? 0;
        const f35 = said >= 8 && said <= 800 ? Math.round(said) : 0, lens: Lens = f35 ? 'exif' : '26';
        const focal = focalOf(lens, f35, small.width, small.height);
        const guess = await textTurns(small).catch(() => null);
        const first = guess?.turns ?? (guess?.axis === 'down' ? 1 : 0);
        const a = await analyse(small, mode, ops, first, false, focal);
        if (!alive) return;
        const s: Shot = { name: f.name, file: f, mode, turns: a.turns, lens, f35, focal, img: a.img, fit: a.fit, thumbs: [] };
        shots.push(s); added++;
        if (!a.fit.pages.length) toast(`${f.name}: ${NO_TEXT}`, 'err');
        await thumbsOf(s);
      } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    status.textContent = '';
    if (added && alive) select(shots.length - 1, 0);
  };
  const lookSeg = segmented<Look>([['color', 'Colour'], ['grey', 'Grey'], ['bw', 'B & W'], ['none', 'Original']], look, (v) => {
    look = v; previewPage().catch(() => {}); for (const s of shots) thumbsOf(s).catch(() => {});
  });
  const exportAll = async (kind: 'pdf' | 'jpg', share = false) => {
    const list = pagesOf();
    if (!list.length) throw new Error(shots.length ? 'No page was found in the photos — see the note under the photo.' : 'Add a photo of a book first.');
    const out: ImagePage[] = [], files: Array<{ name: string; blob: Blob; size: string }> = [];
    try {
      let done = 0;
      for (const [i, s] of shots.entries()) {
        if (!s.fit.pages.length) continue;
        // the whole photo, the way round the fit saw it (at most 4,000 px: a phone's memory; the text keeps its sharpness)
        let photo = previewOf(await loadImg(s.file), ctx.isMobile ? 3000 : 4000);
        if (s.turns) photo = await imgproc('orient', photo, ROT[s.turns]);
        for (const p of s.fit.pages) {
          status.textContent = `Flattening page ${++done} of ${list.length}…`;
          let img: Img;
          try { img = await withLook(await renderPage(photo, p, cap, ops)); } catch (e) { throw new Error(`Photo ${i + 1} (${s.name}), ${sideName(p)}: ${errMsg(e)}`); }
          if (!alive) return;
          // black and white: a PNG for the PDF (two colours — crisp letters, and smaller than a JPEG)
          const blob = kind === 'pdf' && look === 'bw' ? await encodeImg(img, 'png') : await encodeImg(img, 'jpeg', look === 'bw' ? 85 : 82);
          if (kind === 'pdf') out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: img.width, height: img.height, pt: size === 'fit' ? fitPage(img.width, img.height) : undefined });
          else files.push({ name: `book-page-${String(done).padStart(2, '0')}.jpg`, blob, size: `${img.width}×${img.height}` });
        }
      }
    } finally { status.textContent = ''; }
    if (!alive) return;
    if (kind === 'pdf') {
      const pdf = new Blob([await imagesToPdf(out, { size: size === 'fit' ? 'fit' : size, margin: 0 }) as BlobPart], { type: 'application/pdf' });
      status.textContent = `PDF: ${out.length} page${out.length > 1 ? 's' : ''}, ${fmtBytes(pdf.size)}`;
      share ? await shareOrDownload(pdf, 'book-pages.pdf') : downloadBlob(pdf, 'book-pages.pdf');
    } else {
      results.clear();
      for (const f of files) results.add(f.name, f.blob, f.size);
      status.textContent = `${files.length} JPEG${files.length > 1 ? 's' : ''} ready below`;
    }
  };
  const move = (dir: -1 | 1) => button('', () => {
    const j = sel + dir; if (sel < 0 || j < 0 || j >= shots.length) return;
    [shots[j], shots[sel]] = [shots[sel], shots[j]]; select(j, 0);
  }, { icon: dir < 0 ? 'ArrowLeft' : 'ArrowRight', title: dir < 0 ? 'Move this photo earlier' : 'Move this photo later' });
  editor.append(
    card(null, info, h('div', { class: 'scan-grid' }, h('div', { class: 'ed-stage' }, photoCanvas), h('div', { class: 'ed-stage' }, pageCanvas)), warn, sideRow,
      field('Pages in this photo', pagesSeg),
      field('Camera lens', lensSel),
      h('div', { class: 'row' },
        button('', () => { const s = shots[sel]; if (s) refit(s, s.mode, (s.turns + 3) % 4, true); }, { icon: 'RotateCcw', title: 'Turn the photo a quarter to the left' }),
        button('', () => { const s = shots[sel]; if (s) refit(s, s.mode, (s.turns + 1) % 4, true); }, { icon: 'RotateCw', title: 'Turn the photo a quarter to the right' }),
        move(-1), move(1),
        button('', () => { if (sel < 0) return; shots.splice(sel, 1); select(Math.min(sel, shots.length - 1), 0); }, { icon: 'Trash2', title: 'Remove this photo', variant: 'danger' })),
      note('Dots: the lines of text the page was fitted to; dashed: the gutter between two pages; the outline: what becomes each flat page. The lens: a phone says in the photo which one took it; a photo sent through a chat app has lost that — if the page was zoomed in on, choose the zoom, or the page comes out skewed.')),
  );
  const pick = (o: { label: string; hint: string }) => imagePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: o.label, hint: o.hint, onFiles: (f) => add(f).catch((e) => toast(errMsg(e), 'err')) });
  root.append(
    card(null, stack(
      ctx.isMobile
        ? pick({ label: 'Choose photos', hint: 'photos of an open book — or use the camera: from above, both pages and the gutter in the picture' })
        : pick({ label: 'Add photos of book pages', hint: 'one or two pages of an open book per photo, taken from above' }),
      status, strip,
      h('div', { class: 'row' }, button('Start over', () => { shots.length = 0; results.clear(); select(-1); status.textContent = ''; }, { small: true, variant: 'ghost', icon: 'RotateCcw', title: 'Remove all photos' })))),
    editor,
    card('Clean-up', stack(lookSeg, note('Colour whitens the paper and evens out the shadow of the gutter; B & W gives the crispest text and the smallest PDF.'))),
    card('Save', stack(field('PDF page size', segmented([['fit', 'Fit to page'], ['a4', 'A4'], ['letter', 'Letter']], size, (v) => (size = v))))),
    actions(button(ctx.isMobile ? 'PDF' : 'Save PDF', () => exportAll('pdf'), { variant: 'primary', icon: 'FileDown', title: 'Save all pages as one PDF' }),
      button(ctx.isMobile ? 'JPGs' : 'Save JPGs', () => exportAll('jpg'), { icon: 'Images', title: 'Save each page as a JPEG' }),
      ctx.isMobile ? button('Share', () => exportAll('pdf', true), { icon: 'Share2' }) : null),
    card(null, results.el),
  );
  select(-1);
  return () => { alive = false; results.clear(); };
};
