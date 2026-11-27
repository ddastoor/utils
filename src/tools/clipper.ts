// Newspaper Clipper (potentials #110; owner, 21 Nov 2026): "photograph a newspaper article that runs over several columns →
// the page found and straightened, the reader taps the blocks of the article (a page holds several stories) → its columns
// stacked one under another in reading order with the headline on top — PDF → EPUB's rule for side-by-side pieces, each
// marked 'part 1', 'part 2' … → one clean, tall picture that reads on a phone by scrolling, a PDF, or its text (to copy, or
// to hear with the Text-to-Speech voices); an article continued on another page joined from a second photo".
// Engines, all on the site: the OCR tab's page finder (src/lib/pagecrop.ts) and imgproc.wasm's clean-up, Tesseract (its
// page layout gives the blocks), textcore.wasm's XY-cut (the reading order), MuPDF (the PDF). The steps without the DOM:
// src/lib/clipper.ts. Each page is kept as a JPEG once read (a phone's memory) and a small copy for the screen; the
// clipping is cut from the JPEG when it is saved.
import { h, card, field, button, segmented, toggle, stack, note, clear, actions, toast, errMsg, downloadBlob, shareOrDownload, fmtBytes, progress, copy, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { textcore } from '../wasm/textcore';
import { loadImg, encodeImg, previewOf, paint } from '../lib/imgio';
import { imagePicker } from '../lib/imgtools';
import { imagesToPdf, type ImagePage } from '../lib/pdf';
import { browserEngines } from '../lib/readpage';
import { POOR } from '../lib/ocr';
import { uprightWords } from '../lib/upright';
import { give } from '../lib/handoff';
import { readClip, storyOf, readingOrder, clipText, clipPlan, pageCuts, clipName, blockLabel, bodySize, textScale, type Block, type ClipEngines, type Plan, type Part } from '../lib/clipper';

type Look = 'none' | 'color' | 'grey' | 'bw';
const LOOK_ID: Record<Look, -1 | 0 | 1 | 2> = { none: -1, color: 0, grey: 1, bw: 2 };
interface Shot {
  name: string;
  /** the page as it was read (found, straightened, set upright), kept as a JPEG: the clipping is cut from it */
  page: Blob;
  width: number; height: number;
  /** a small copy for the screen, and its scale against the page */
  view: Img; vk: number;
  blocks: Block[];
  chosen: Set<number>;
  /** the chosen blocks in the order the reader put them (null: the page's reading order) */
  order: number[] | null;
  /** the height of its text's words (px of the page): the photos' text is drawn the same size */
  body: number;
  /** what was done to the photo and how well it read */
  said: string;
  poor: boolean;
  thumb: string;
}
const op = (name: string) => (...a: any[]) => imgproc(name as any, ...a);
const engines: ClipEngines = { ops: { ...browserEngines.ops, inkRegions: op('inkRegions'), sharpen: op('sharpen') } as unknown as ClipEngines['ops'], read: browserEngines.read };
/** A4 inside margins of half an inch (523 × 770 pt): the clipping's pages in the PDF. */
const PDF_MARGIN = 36, PDF_RATIO = 770 / 523;
const pct = (v: number, of: number) => `${((100 * v) / of).toFixed(3)}%`;

/** Rows of an image copied out (a memory copy a row: no pixel is computed). */
function cropRows(img: Img, x0: number, y0: number, x1: number, y1: number): Img {
  const w = x1 - x0, hh = y1 - y0, out = new Uint8ClampedArray(w * hh * 4);
  for (let y = 0; y < hh; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x1) * 4), y * w * 4);
  return { width: w, height: hh, data: out };
}
/** An image put into a larger one at x, y (rows copied). */
function blit(dst: Img, src: Img, x: number, y: number) {
  const w = Math.min(src.width, dst.width - x), hh = Math.min(src.height, dst.height - y);
  for (let r = 0; r < hh; r++) dst.data.set(src.data.subarray(r * src.width * 4, (r * src.width + w) * 4), ((y + r) * dst.width + x) * 4);
}

export const mount: Mount = (root, ctx) => {
  const shots: Shot[] = [];
  let sel = -1, look: Look = 'color', labels = true, alive = true, queue: Promise<unknown> = Promise.resolve(), parts: Array<{ shot: number; block: Block }> = [];
  const viewCanvas = h('canvas', { role: 'img', 'aria-label': 'The page, with its blocks to choose' });
  const layer = h('div', { class: 'clip-layer' });
  const view = h('div', { class: 'clip-view' }, viewCanvas, layer);
  const info = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const hintText = h('span');
  const hint = note(hintText, 'warn'); hint.hidden = true; hint.setAttribute('role', 'status');
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const prog = progress();
  const strip = h('div', { class: 'scan-pages' });
  const storiesEl = h('div', { class: 'clip-stories' });
  const partsEl = h('ol', { class: 'clip-parts' });
  const outCanvas = h('canvas', { role: 'img', 'aria-label': 'The clipping: the parts one under another' });
  const out = h('div', { class: 'clip-out' }, outCanvas);
  const outInfo = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const ta = h('textarea', { class: 'input textarea', rows: 10, 'aria-label': 'The clipping’s text', spellcheck: 'true' }) as HTMLTextAreaElement;
  const editor = h('div', { class: 'stack', hidden: true });
  const result = h('div', { class: 'stack', hidden: true });
  /** the screen copies cleaned up as chosen (one per photo and look), as canvases to draw the preview from */
  const looked = new Map<string, HTMLCanvasElement>();
  const lookedView = async (i: number): Promise<HTMLCanvasElement> => {
    const s = shots[i], key = `${s.name}|${i}|${look}`;
    let c = looked.get(key);
    if (!c) {
      const im = look === 'none' ? s.view : await imgproc('docEnhance', s.view, LOOK_ID[look] as 0 | 1 | 2);
      c = document.createElement('canvas'); paint(im, c); looked.set(key, c);
    }
    return c;
  };

  // ---------------------------------------------------------------- the parts of the clipping, in order
  const order = async () => {
    const tc = await textcore();
    const xy = (b: number[][], gx: number, gy: number) => tc.xycut(b, gx, gy).order;
    parts = [];
    shots.forEach((s, i) => {
      let ids = readingOrder(s.blocks, [...s.chosen], xy);
      if (s.order) { const kept = s.order.filter((id) => s.chosen.has(id)); ids = [...kept, ...ids.filter((id) => !kept.includes(id))]; }
      for (const id of ids) parts.push({ shot: i, block: s.blocks[id] });
    });
  };
  const planOf = (): Plan | null => {
    if (!parts.length) return null;
    const used = [...new Set(parts.map((p) => p.shot))], ks = textScale(shots.map((s) => s.body));
    const body = shots[used[0]].body * ks[used[0]] || 20;
    const list: Part[] = parts.map((p) => ({ shot: p.shot, block: p.block, k: ks[p.shot], page: { width: shots[p.shot].width, height: shots[p.shot].height } }));
    const several = used.length > 1;
    return clipPlan(list, {
      pad: Math.round(0.45 * body), gap: Math.round(1.1 * body), label: labels ? Math.round(2 * body) : 0, margin: Math.round(body),
      labels: parts.map((p, n) => `Part ${n + 1}${several ? ` · photo ${p.shot + 1}` : ''}`),
    });
  };
  let drawTok = 0;
  const drawPreview = async () => {
    const my = ++drawTok, plan = planOf();
    result.hidden = !plan;
    if (!plan) { ta.value = ''; outInfo.textContent = ''; return; }
    ta.value = clipText(parts.map((p) => p.block));
    // the preview: a width a screen shows, at most 16 megapixels (Safari's canvas)
    let s = Math.min(1, (ctx.isMobile ? 720 : 960) / plan.width);
    s = Math.min(s, Math.sqrt(16e6 / (plan.width * plan.height)));
    const views = new Map<number, HTMLCanvasElement>();
    for (const i of new Set(plan.pieces.map((p) => p.shot))) views.set(i, await lookedView(i));
    if (my !== drawTok || !alive) return;
    outCanvas.width = Math.max(1, Math.round(plan.width * s)); outCanvas.height = Math.max(1, Math.round(plan.height * s));
    const g = outCanvas.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, outCanvas.width, outCanvas.height);
    g.imageSmoothingQuality = 'high';
    for (const p of plan.pieces) {
      const vk = shots[p.shot].vk, c = p.crop;
      g.drawImage(views.get(p.shot)!, c[0] * vk, c[1] * vk, (c[2] - c[0]) * vk, (c[3] - c[1]) * vk, p.x * s, p.y * s, p.w * s, p.h * s);
    }
    drawLabels(g, plan, s);
    outCanvas.dataset.parts = parts.map((p) => `${p.shot}:${p.block.id}`).join(','); // what it shows (for the tests)
    const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    outInfo.textContent = `${parts.length} part${parts.length > 1 ? 's' : ''} · ${words.toLocaleString()} words · ${plan.width} × ${plan.height} px when saved`;
  };
  const drawLabels = (g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, plan: Plan, s: number, dy = 0) => {
    for (const lb of plan.labels) {
      // the label as large as the text (its strip two of the text's word heights), a dark grey: readable, not loud
      const size = Math.max(9, Math.round(lb.h * 0.55 * s));
      g.fillStyle = '#444'; g.font = `600 ${size}px system-ui, sans-serif`; g.textBaseline = 'alphabetic';
      const x = (lb.x ?? 0) * s;
      g.fillText(lb.text, x, (lb.y + lb.h * 0.7) * s - dy);
      g.fillStyle = '#c8c8c8'; g.fillRect(x + g.measureText(lb.text).width + size * 0.6, (lb.y + lb.h * 0.5) * s - dy, plan.width * s - 2 * x - g.measureText(lb.text).width - size * 0.6, Math.max(1, s));
    }
  };

  // ---------------------------------------------------------------- the page chosen: its blocks to tap
  const partNo = (i: number, id: number) => parts.findIndex((p) => p.shot === i && p.block.id === id) + 1;
  const renderPage = () => {
    const s = shots[sel]; editor.hidden = !s;
    if (!s) { clear(layer); clear(storiesEl); return; }
    clear(layer).append(...s.blocks.map((b) => {
      const n = partNo(sel, b.id);
      return h('button', {
        type: 'button', class: ['clip-block', b.headline && 'head', b.picture && 'pic'], 'aria-pressed': String(s.chosen.has(b.id)),
        'aria-label': `${blockLabel(b)}${n ? ` — part ${n}` : ''}`, title: blockLabel(b), 'data-id': String(b.id),
        style: { left: pct(b.box[0], s.width), top: pct(b.box[1], s.height), width: pct(b.box[2] - b.box[0], s.width), height: pct(b.box[3] - b.box[1], s.height) },
        onclick: () => tap(b),
      }, n ? h('span', { class: 'clip-n', 'aria-hidden': 'true' }, String(n)) : null);
    }));
    const heads = s.blocks.filter((b) => b.headline);
    clear(storiesEl).append(...(heads.length ? heads.map((b) => {
      const story = storyOf(s.blocks, b.id), on = story.every((id) => s.chosen.has(id));
      const btn = button(b.text.length > 70 ? `${b.text.slice(0, 68)}…` : b.text, () => tap(b), { small: true, variant: on ? 'primary' : 'secondary', title: on ? 'Take this story out of the clipping' : 'Put this story into the clipping' });
      btn.setAttribute('aria-pressed', String(on));
      return btn;
    }) : [h('p', { class: 'muted small' }, 'No headline was found on this page — tap its blocks one by one.')]));
  };
  const renderStrip = () => {
    clear(strip).append(...shots.map((s, i) => h('button', { type: 'button', class: ['scan-thumb', i === sel && 'sel'], 'aria-label': `Photo ${i + 1}: ${s.name}`, 'aria-pressed': String(i === sel), onclick: () => select(i) },
      h('img', { src: s.thumb, alt: '' }), h('span', null, String(i + 1)))));
  };
  const renderParts = () => {
    clear(partsEl).append(...parts.map((p, n) => {
      const s = shots[p.shot], mine = parts.filter((q) => q.shot === p.shot), k = mine.indexOf(p);
      const move = (d: -1 | 1) => () => {
        const ids = mine.map((q) => q.block.id), j = k + d; if (j < 0 || j >= ids.length) return;
        [ids[k], ids[j]] = [ids[j], ids[k]]; s.order = ids; changed();
      };
      const name = `Part ${n + 1}${shots.length > 1 ? ` (photo ${p.shot + 1})` : ''}: ${blockLabel(p.block)}`;
      return h('li', null,
        h('span', { class: 't', title: name }, name),
        button('', move(-1), { icon: 'ArrowUp', small: true, title: `Move part ${n + 1} up`, disabled: k === 0 }),
        button('', move(1), { icon: 'ArrowDown', small: true, title: `Move part ${n + 1} down`, disabled: k === mine.length - 1 }),
        button('', () => { s.chosen.delete(p.block.id); changed(); }, { icon: 'X', small: true, title: `Take part ${n + 1} out` }));
    }));
  };
  let changing: Promise<void> | null = null;
  const changed = () => {
    const run = (async () => {
      await order();
      if (!alive) return;
      renderPage(); renderParts();
      await drawPreview();
    })().catch((e) => toast(errMsg(e), 'err'));
    changing = run;
    return run;
  };
  /** A block tapped: a headline puts its whole story in (or takes it out, when all of it is in); any other block itself. */
  const tap = (b: Block) => {
    const s = shots[sel]; if (!s) return;
    if (b.headline) {
      const story = storyOf(s.blocks, b.id), all = story.every((id) => s.chosen.has(id));
      for (const id of story) if (all) s.chosen.delete(id); else s.chosen.add(id);
    } else if (s.chosen.has(b.id)) s.chosen.delete(b.id); else s.chosen.add(b.id);
    changed();
  };
  const select = (i: number) => {
    sel = i; const s = shots[i];
    renderStrip();
    editor.hidden = !s;
    if (!s) { info.textContent = ''; hint.hidden = true; return; }
    paint(s.view, viewCanvas);
    viewCanvas.dataset.shown = s.name;
    info.textContent = `Photo ${i + 1} of ${shots.length} · ${s.name} · ${s.said}`;
    hint.hidden = !s.poor;
    hintText.textContent = s.poor ? 'The text reads poorly: a sharper photo — closer, in good light, the phone held still — reads better.' : '';
    renderPage();
  };

  // ---------------------------------------------------------------- photos in
  const add = (files: File[]) => (queue = queue.then(async () => {
    for (const [n, f] of files.entries()) {
      if (!alive) return;
      const of = files.length > 1 ? `Photo ${n + 1} of ${files.length}: ` : '';
      try {
        prog.set(null, `${of}finding the page…`);
        const photo = await loadImg(f);
        if (!alive) return;
        let again = false; // Tesseract's layout went wrong: the page is read again, sharper
        const c = await readClip(photo, engines, {
          stale: () => !alive,
          onProgress: (p, st) => { if (/recogniz/i.test(st)) prog.set(p, `${of}reading the page${again ? ' again, sharper' : ''}… ${Math.round(p * 100)} %`); },
          onAgain: () => { again = true; },
        });
        if (!c || !alive) return;
        prog.set(null, `${of}keeping the page…`);
        const page = await encodeImg(c.img, 'jpeg', 90);
        const view = previewOf(c.img, ctx.isMobile ? 1100 : 1400);
        const heads = c.blocks.filter((b) => b.headline).length, pics = c.blocks.filter((b) => b.picture).length;
        const did = [c.found ? 'the page was found and straightened' : 'no page edge was found — read as it is', uprightWords(c.up)].filter(Boolean).join(', ');
        const said = `${did} · ${heads} headline${heads === 1 ? '' : 's'}, ${c.blocks.length - heads - pics} blocks of text${pics ? `, ${pics} picture${pics > 1 ? 's' : ''}` : ''}`;
        const tc = document.createElement('canvas'); paint(previewOf(c.img, 200), tc);
        shots.push({
          name: f.name, page, width: c.img.width, height: c.img.height, view, vk: view.width / c.img.width, blocks: c.blocks, chosen: new Set(), order: null,
          body: bodySize(c.blocks), said, poor: c.r.confidence < POOR || c.r.words.length < 25, thumb: tc.toDataURL('image/jpeg', 0.7),
        });
        select(shots.length - 1);
        await changed();
      } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    prog.done();
  }));

  // ---------------------------------------------------------------- the clipping saved
  /** The clipping at full size: each piece cut from its page (cleaned up as chosen), the labels drawn by the browser. */
  const compose = async (plan: Plan): Promise<Img> => {
    const outImg: Img = { width: plan.width, height: plan.height, data: new Uint8ClampedArray(plan.width * plan.height * 4).fill(255) };
    const byShot = new Map<number, typeof plan.pieces>();
    for (const p of plan.pieces) byShot.set(p.shot, [...(byShot.get(p.shot) ?? []), p]);
    let done = 0;
    for (const [i, pieces] of byShot) {
      status.textContent = `Cutting the parts out of photo ${i + 1}…`;
      let page = await loadImg(shots[i].page);
      if (look !== 'none') page = await imgproc('docEnhance', page, LOOK_ID[look] as 0 | 1 | 2);
      for (const p of pieces) {
        const c = cropRows(page, p.crop[0], p.crop[1], Math.min(page.width, p.crop[2]), Math.min(page.height, p.crop[3]));
        blit(outImg, c.width === p.w && c.height === p.h ? c : await imgproc('resize', c, p.w, p.h), p.x, p.y);
        if (!alive) throw new Error('Stopped.');
        done++;
      }
    }
    if (plan.labels.length) {
      const strip = new OffscreenCanvas(plan.width, Math.max(...plan.labels.map((l) => l.h)));
      const g = strip.getContext('2d')!;
      for (const lb of plan.labels) {
        g.fillStyle = '#fff'; g.fillRect(0, 0, strip.width, strip.height);
        drawLabels(g, { ...plan, labels: [{ ...lb, y: 0 }] }, 1);
        const d = g.getImageData(0, 0, plan.width, lb.h);
        blit(outImg, { width: plan.width, height: lb.h, data: d.data }, 0, lb.y);
      }
    }
    status.textContent = '';
    void done;
    return outImg;
  };
  const headlineOf = () => parts.find((p) => p.block.headline)?.block.text ?? parts[0]?.block.text ?? '';
  const need = async () => {
    await changing;
    const plan = planOf();
    if (!plan) throw new Error(shots.length ? 'Choose the blocks of an article first: tap its headline, or its blocks one by one.' : 'Add a photo of a newspaper page first.');
    return plan;
  };
  const savePicture = async (share = false) => {
    const plan = await need(), img = await compose(plan);
    const blob = look === 'bw' ? await encodeImg(img, 'png') : await encodeImg(img, 'jpeg', 85);
    const name = `${clipName(headlineOf())}.${look === 'bw' ? 'png' : 'jpg'}`;
    status.textContent = `Picture: ${plan.width} × ${plan.height} px, ${fmtBytes(blob.size)}`;
    share ? await shareOrDownload(blob, name) : downloadBlob(blob, name);
  };
  const savePdf = async (share = false) => {
    const plan = await need(), img = await compose(plan);
    // pages of A4's shape inside its margins, each ending between two lines or two parts
    const pageH = Math.round(plan.width * PDF_RATIO), pages: ImagePage[] = [];
    for (const [top, bot] of pageCuts(plan.height, plan.cuts, pageH)) {
      const pg: Img = { width: plan.width, height: pageH, data: new Uint8ClampedArray(plan.width * pageH * 4).fill(255) };
      blit(pg, cropRows(img, 0, top, plan.width, bot), 0, 0);
      const blob = look === 'bw' ? await encodeImg(pg, 'png') : await encodeImg(pg, 'jpeg', 85);
      pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: pg.width, height: pg.height });
      if (!alive) return;
    }
    const pdf = new Blob([await imagesToPdf(pages, { size: 'a4', margin: PDF_MARGIN }) as BlobPart], { type: 'application/pdf' });
    const name = `${clipName(headlineOf())}.pdf`;
    status.textContent = `PDF: ${pages.length} page${pages.length > 1 ? 's' : ''}, ${fmtBytes(pdf.size)}`;
    share ? await shareOrDownload(pdf, name) : downloadBlob(pdf, name);
  };

  // ---------------------------------------------------------------- the tab
  const lookSeg = segmented<Look>([['color', 'Colour'], ['grey', 'Grey'], ['bw', 'B & W'], ['none', 'Original']], look, (v) => { look = v; drawPreview().catch(() => {}); });
  const labelsSw = toggle('Mark the parts (“Part 1”, “Part 2” …)', labels, (v) => { labels = v; drawPreview().catch(() => {}); });
  const move = (dir: -1 | 1) => button('', () => {
    const j = sel + dir; if (sel < 0 || j < 0 || j >= shots.length) return;
    [shots[j], shots[sel]] = [shots[sel], shots[j]]; looked.clear(); select(j); changed();
  }, { icon: dir < 0 ? 'ArrowLeft' : 'ArrowRight', title: dir < 0 ? 'Move this photo earlier' : 'Move this photo later' });
  editor.append(
    card(null, info, hint, view,
      field('Stories on this page', storiesEl, 'A headline puts its whole story in; tap again to take it out.'),
      h('div', { class: 'row' },
        button('Clear choice', () => { const s = shots[sel]; if (s) { s.chosen.clear(); s.order = null; changed(); } }, { small: true, variant: 'ghost', icon: 'RotateCcw', title: 'Take every block of this photo out' }),
        move(-1), move(1),
        button('', () => { if (sel < 0) return; shots.splice(sel, 1); looked.clear(); select(Math.min(sel, shots.length - 1)); changed(); }, { icon: 'Trash2', title: 'Remove this photo', variant: 'danger' })),
      note('Tap a headline to take its story — its columns, its picture and caption; tap any block to put it in or take it out. Dashed: a headline; dotted: a picture. A story continued on another page: add a photo of that page too.')),
  );
  result.append(
    card('The clipping', stack(
      partsEl, outInfo, out,
      labelsSw, field('Clean-up', lookSeg),
      note('Colour whitens the paper; B & W gives the crispest text (saved as PNG). The PDF has A4 pages, each ending between two lines.'))),
    card('Its text', stack(ta,
      h('div', { class: 'row' },
        button('Copy', () => copy(ta.value), { icon: 'Copy', small: true }),
        button('Save .txt', () => downloadBlob(new Blob([ta.value.replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), `${clipName(headlineOf())}.txt`), { icon: 'FileText', small: true }),
        button('Read aloud', () => { give('tts', ta.value); location.hash = '#/tts'; }, { icon: 'Volume2', small: true, title: 'Hear it with the Text-to-Speech voices' })),
      note('The text as it was read; correct it here before you copy it or hear it — choosing other blocks writes it again.'))),
    actions(
      button(ctx.isMobile ? 'Picture' : 'Save picture', () => savePicture(), { variant: 'primary', icon: 'Image', title: 'Save the clipping as one tall picture' }),
      button(ctx.isMobile ? 'PDF' : 'Save PDF', () => savePdf(), { icon: 'FileDown', title: 'Save the clipping as a PDF' }),
      ctx.isMobile ? button('Share', () => savePicture(true), { icon: 'Share2' }) : null),
    status,
  );
  const pick = imagePicker({
    accept: 'image/*,.heic,.heif', multiple: true,
    label: ctx.isMobile ? 'Choose photos' : 'Add photos of newspaper pages',
    hint: ctx.isMobile ? 'a newspaper page with the article on it — or use the camera, the whole article in the picture' : 'a phone’s photo of the page with the article; a story continued on another page: a photo of each',
    onFiles: (f) => add(f),
  });
  root.append(
    card(null, stack(pick, prog, strip,
      h('div', { class: 'row' }, button('Start over', () => { shots.length = 0; looked.clear(); parts = []; select(-1); changed(); }, { small: true, variant: 'ghost', icon: 'RotateCcw', title: 'Remove all photos' })))),
    editor, result,
  );
  select(-1);
  return () => { alive = false; looked.clear(); };
};
