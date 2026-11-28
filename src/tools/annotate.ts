// Screenshot Annotator & How-To Guide (potentials #113): a screenshot or a photo — chosen, dropped, pasted (Ctrl+V or
// "Paste image"), taken with the camera, or handed over by the Screenshot tab — marked with arrows, boxes, circles,
// numbered step markers, text, the highlighter and a pen; passwords and account numbers hidden (pixelated, blurred or
// covered: burnt into the pixels when saved); cropped; undone and redone. Saved as PNG or JPEG, or copied. Several
// pictures with a caption each make a how-to guide ("Step 3: tap Renew") — one PDF (MuPDF's HTML layout, Noto Sans) or one
// tall picture for WhatsApp. The marks are kept in the picture's own pixels (src/lib/annotate.ts) and drawn by the
// browser's canvas; the hidden areas by imgproc.wasm. The pictures and their marks last while the page is open (another
// tab and back: still there); nothing is stored, nothing leaves the device.
import { h, card, button, toggle, segmented, note, clear, actions, toast, errMsg, downloadBlob, shareOrDownload, baseName, field, input, textarea, type Mount } from '../ui';
import { imageInput, resultList } from '../lib/imgtools';
import { encodeImg, resizeImg } from '../lib/imgio';
import { imgprocDirect, type Img, type Imgproc } from '../wasm/imgproc';
import { take } from '../lib/handoff';
import { onLeave } from '../lifecycle';
import * as A from '../lib/annotate';
import './annotate.css';

type Tool = 'select' | 'arrow' | 'rect' | 'ellipse' | 'step' | 'text' | 'highlight' | 'pen' | 'hide' | 'crop';
const TOOLS: Array<[Tool, string, string, string]> = [
  ['select', 'Select', 'MousePointer2', 'Choose a mark to move it, change its size or colour, or delete it'],
  ['arrow', 'Arrow', 'MoveUpRight', 'Drag from where the arrow starts to what it points at — or tap what it points at'],
  ['rect', 'Box', 'Square', 'Drag a box round something — or tap'],
  ['ellipse', 'Circle', 'Circle', 'Drag a circle round something — or tap'],
  ['step', 'Step number', 'ListOrdered', 'Tap each place in turn: 1, 2, 3 …'],
  ['text', 'Text', 'Type', 'Type the text, then tap where it goes'],
  ['highlight', 'Highlighter', 'Highlighter', 'Draw over text to highlight it'],
  ['pen', 'Pen', 'PenLine', 'Draw freely'],
  ['hide', 'Hide', 'EyeOff', 'Drag over a password, a number or a face: pixelated, blurred or covered — burnt into the picture when saved'],
  ['crop', 'Crop', 'Crop', 'Keep only a part of the picture'],
];
const DRAWS = new Set<Tool>(['arrow', 'rect', 'ellipse', 'step', 'text', 'highlight', 'pen']);
type Fmt = 'png' | 'jpeg';
interface Pic { id: number; name: string; bmp: ImageBitmap; w: number; h: number; crop: A.Rect | null; shapes: A.Shape[]; caption: string; base: { key: string; canvas: HTMLCanvasElement } | null }

// ---------------------------------------------------------------- kept while the page is open (another tab and back)
const G = { pics: new Map<number, Pic>(), order: [] as number[], cur: 0, title: '', numbered: true, numberOn: false, nextId: 1, nextShape: 1 };
const history = new A.History();
const prefs = {
  tool: 'arrow' as Tool, label: true, hide: 'pixelate' as A.HideStyle, fmt: 'png' as Fmt,
  color: { arrow: '#e53935', rect: '#e53935', ellipse: '#e53935', step: '#e53935', text: '#e53935', highlight: '#fdd835', pen: '#e53935' } as Record<string, string>,
  size: { arrow: 'm', rect: 'm', ellipse: 'm', step: 'm', text: 'm', highlight: 'm', pen: 'm' } as Record<string, A.Size>,
};
/** the most pictures a guide holds (each is kept in memory while the page is open) */
const MAX_PICS = { pc: 40, phone: 20 };
/** a picture's longer side at most (a 48-megapixel photo is made smaller: marks need no more) */
const MAX_SIDE = 4096;

let fontP: Promise<void> | null = null;
/** Noto Sans Bold for the marks, Noto Sans for the captions of the tall picture — from this site, with the first picture */
const fonts = () => fontP ||= (async () => {
  for (const [fam, file, weight] of [['SuperUtilsMark', 'NotoSans_700Bold', '700'], ['SuperUtilsText', 'NotoSans_400Regular', '400']]) {
    try { const f = new FontFace(fam, `url(${new URL(`vendor/fonts/${file}.ttf`, document.baseURI).href})`, { weight }); await f.load(); document.fonts.add(f); } catch { /* the system's sans-serif */ }
  }
})();
const TEXT_FONT = "SuperUtilsText, 'Noto Sans', system-ui, sans-serif";

const snap = () => JSON.stringify({ order: G.order, cur: G.cur, pics: G.order.map((id) => { const p = G.pics.get(id)!; return { id, crop: p.crop, shapes: p.shapes }; }) });
function restore(json: string) {
  const s = JSON.parse(json);
  G.order = s.order; G.cur = s.cur;
  for (const q of s.pics) { const p = G.pics.get(q.id); if (p) { p.crop = q.crop; p.shapes = q.shapes; } }
}
const curPic = () => G.pics.get(G.cur) ?? null;
/** the step markers' numbers of a picture (numbered on from the pictures before it, when asked) */
function numbersOf(p: Pic) {
  let start = 1;
  if (G.numberOn) for (const id of G.order) { if (id === p.id) break; start += G.pics.get(id)!.shapes.filter((s) => s.kind === 'step').length; }
  return A.stepNumbers(p.shapes, start);
}
const hidesOf = (p: Pic) => p.shapes.filter((s): s is A.Hide => s.kind === 'hide');
let ip: Imgproc | null = null;
/** The picture with its hidden areas burnt in (made again only when they change). */
async function baseOf(p: Pic): Promise<CanvasImageSource> {
  const hides = hidesOf(p);
  if (!hides.length) return p.bmp;
  const key = JSON.stringify(hides);
  if (p.base?.key === key) return p.base.canvas;
  ip ||= await imgprocDirect();
  const c = h('canvas', { width: p.w, height: p.h }) as HTMLCanvasElement, g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(p.bmp, 0, 0);
  const id = g.getImageData(0, 0, p.w, p.h);
  const out = A.hideAll({ data: id.data, width: p.w, height: p.h }, hides, ip);
  g.putImageData(new ImageData(new Uint8ClampedArray(out.data), p.w, p.h), 0, 0);
  p.base = { key, canvas: c };
  return c;
}
/** The picture as saved: cropped, its areas hidden, its marks drawn — at most `maxSide` pixels on its longer side. */
async function renderPic(p: Pic, maxSide = Infinity): Promise<HTMLCanvasElement> {
  const base = await baseOf(p); await fonts();
  const v = p.crop || { x: 0, y: 0, w: p.w, h: p.h }, k = Math.min(1, maxSide / Math.max(v.w, v.h));
  const c = h('canvas', { width: Math.max(1, Math.round(v.w * k)), height: Math.max(1, Math.round(v.h * k)) }) as HTMLCanvasElement;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.setTransform(k, 0, 0, k, -v.x * k, -v.y * k);
  g.drawImage(base, 0, 0);
  A.drawMarks(g, p.shapes, A.unit(p.w, p.h), k, numbersOf(p));
  return c;
}
const imgOf = (c: HTMLCanvasElement): Img => { const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height); return { data: d.data, width: c.width, height: c.height }; };
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'how-to-guide';

export const mount: Mount = (root, ctx) => {
  const phone = ctx.isMobile;
  let alive = true;
  onLeave('annotate-bases', () => { for (const p of G.pics.values()) p.base = null; ip = null; });
  const mctx = (h('canvas') as HTMLCanvasElement).getContext('2d')!;
  const measure: A.Measure = (t, px) => { mctx.font = `700 ${px}px ${A.FONT}`; return mctx.measureText(t).width; };
  const measureText: A.Measure = (t, px) => { mctx.font = `400 ${px}px ${TEXT_FONT}`; return mctx.measureText(t).width; };
  const say = (t: string) => { status.textContent = t; };

  // ---------------------------------------------------------------- the pictures
  const status = h('p', { class: 'muted small an-status', role: 'status', 'aria-live': 'polite' });
  const strip = h('ol', { class: 'an-strip', 'aria-label': 'The pictures of the guide, in order' });
  const picker = imageInput(async (img, file) => { await addPicture(img, file.name); }, {
    multiple: true, paste: true, label: 'Choose screenshots or photos', more: 'Add more pictures',
    hint: 'or drop / paste (Ctrl+V) · several make a how-to guide · JPG, PNG, WebP, HEIC…',
  });
  async function addPicture(img0: Img, name: string) {
    if (!alive) return;
    if (G.order.length >= (phone ? MAX_PICS.phone : MAX_PICS.pc)) { toast(`A guide holds at most ${phone ? MAX_PICS.phone : MAX_PICS.pc} pictures here.`, 'err'); return; }
    let img = img0;
    const side = Math.max(img.width, img.height);
    if (side > MAX_SIDE) { const k = MAX_SIDE / side; img = await resizeImg(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k))); }
    const bmp = await createImageBitmap(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height));
    void fonts();
    const before = snap();
    const p: Pic = { id: G.nextId++, name, bmp, w: img.width, h: img.height, crop: null, shapes: [], caption: '', base: null };
    G.pics.set(p.id, p); G.order.push(p.id); G.cur = p.id;
    history.push(before);
    sel = null; view.zoom = 1;
    renderAll();
    say(`${name} added${G.order.length > 1 ? ` — step ${G.order.length} of the guide` : ''}. ${phone ? 'Choose a tool and draw with a finger.' : 'Choose a tool and draw on it.'}`);
  }

  // ---------------------------------------------------------------- the tools
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  const toolbar = h('div', { class: 'an-tools', role: 'toolbar', 'aria-label': 'Tools' },
    TOOLS.map(([t, label, icon, tip]) => { const b = button(phone ? '' : label, () => setTool(t), { icon, small: true, title: `${label} — ${tip}` }); b.setAttribute('aria-label', label); toolBtns.set(t, b); return b; }));
  const tip = h('p', { class: 'small muted an-tip' });
  // colour, size, text, hide style, crop — what the tool (or the mark chosen) takes
  const swatches = h('div', { class: 'an-swatches', role: 'group', 'aria-label': 'Colour' },
    A.COLORS.map(([c, name]) => h('button', { type: 'button', class: 'an-swatch', style: `--c:${c}`, 'data-c': c, title: name, 'aria-label': name, 'aria-pressed': 'false', onclick: () => setColor(c) })));
  const custom = h('input', { type: 'color', class: 'an-custom', 'aria-label': 'Another colour', title: 'Another colour', value: '#e53935' }) as HTMLInputElement;
  custom.addEventListener('input', () => setColor(custom.value));
  const sizeSel = segmented<A.Size>([['s', 'Thin'], ['m', 'Medium'], ['l', 'Thick']], 'm', (v) => setSize(v));
  sizeSel.setAttribute('aria-label', 'Size');
  const textIn = textarea({ rows: 2, placeholder: 'e.g. Tap Renew' }) as HTMLTextAreaElement;
  textIn.setAttribute('spellcheck', 'true'); textIn.maxLength = 300;
  const labelSel = segmented<'label' | 'plain'>([['label', 'On a label'], ['plain', 'Letters only']], prefs.label ? 'label' : 'plain', (v) => { prefs.label = v === 'label'; if (sel?.kind === 'text') change(() => { (sel as A.Text).label = prefs.label; }); });
  labelSel.setAttribute('aria-label', 'How the text looks');
  const textOpts = h('div', { class: 'stack an-textopts' }, field('Text to place', textIn, 'Enter starts a new line'), labelSel);
  const hideSel = segmented<A.HideStyle>([['pixelate', 'Pixelate'], ['blur', 'Blur'], ['solid', 'Solid']], prefs.hide, (v) => { prefs.hide = v; if (sel?.kind === 'hide') change(() => { (sel as A.Hide).style = v; }); });
  hideSel.setAttribute('aria-label', 'How it is hidden');
  const hideOpts = h('div', { class: 'stack an-hideopts' }, hideSel,
    h('p', { class: 'small muted' }, 'Burnt into the picture when it is saved. For a password, PIN or one-time code choose Solid: a short number pixelated or blurred can sometimes be guessed.'));
  const cropDone = button('Done', () => applyCrop(), { variant: 'primary', small: true, icon: 'Check' });
  const cropWhole = button('Whole picture', () => { const p = curPic(); if (!p) return; cropDraft = { x: 0, y: 0, w: p.w, h: p.h }; draw(); }, { small: true, icon: 'Maximize2' });
  const cropCancel = button('Cancel', () => { cropDraft = null; setTool('select'); }, { small: true, variant: 'ghost' });
  const cropOpts = h('div', { class: 'row an-cropopts' }, cropDone, cropWhole, cropCancel);
  const delBtn = button('Delete', () => deleteSel(), { small: true, icon: 'Trash2', variant: 'ghost', title: 'Delete the mark chosen (Delete key)' });
  const styleOpts = h('div', { class: 'an-styleopts' }, swatches, custom, sizeSel);
  const opts = h('div', { class: 'an-opts' }, styleOpts, textOpts, hideOpts, cropOpts, delBtn);

  // ---------------------------------------------------------------- the picture being marked
  const canvas = h('canvas', {
    class: 'an-canvas', tabindex: '0', role: 'application', 'aria-roledescription': 'drawing area',
    'aria-label': 'The picture. Draw on it with the mouse or a finger. Keys: Enter adds a mark with the tool chosen; arrows move the mark chosen (Shift: further), Alt with arrows changes its size; Delete removes it; N and P choose the next or previous mark; Escape lets it go.',
  }) as HTMLCanvasElement;
  const pane = h('div', { class: 'an-pane' }, canvas);
  const undoB = button(phone ? '' : 'Undo', () => undo(), { icon: 'Undo2', title: 'Undo (Ctrl+Z)' });
  const redoB = button(phone ? '' : 'Redo', () => redo(), { icon: 'Redo2', title: 'Redo (Ctrl+Shift+Z)' });
  undoB.setAttribute('aria-label', 'Undo'); redoB.setAttribute('aria-label', 'Redo');
  const zoomOut = button('', () => setZoom(view.zoom / 1.5), { icon: 'ZoomOut', small: true, variant: 'ghost', title: 'Zoom out' });
  const zoomFit = button('Fit', () => setZoom(1), { icon: 'Scan', small: true, variant: 'ghost', title: 'The whole picture in view' });
  const zoomIn = button('', () => setZoom(view.zoom * 1.5), { icon: 'ZoomIn', small: true, variant: 'ghost', title: 'Zoom in' });
  const zoomRow = h('div', { class: 'row an-zoom', role: 'group', 'aria-label': 'Zoom' }, zoomOut, zoomFit, zoomIn);
  const captionIn = textarea({ rows: 2, placeholder: 'e.g. Tap Renew' }) as HTMLTextAreaElement;
  captionIn.setAttribute('spellcheck', 'true'); captionIn.maxLength = 1000;
  const captionField = field('Caption', captionIn, 'Shown above the picture in the guide (PDF, tall picture)');
  const captionLabel = captionField.querySelector('.field-label')!;
  captionIn.addEventListener('input', () => { const p = curPic(); if (p) { p.caption = captionIn.value; renderStripText(p); } });

  // ---------------------------------------------------------------- saving
  const fmtSel = segmented<Fmt>([['png', 'PNG'], ['jpeg', 'JPEG']], prefs.fmt, (v) => { prefs.fmt = v; });
  fmtSel.setAttribute('aria-label', 'Save as');
  const made = resultList({ zipName: () => `${safeName(G.title)}.zip`, isMobile: phone });
  const saveB = button(phone ? 'Save' : 'Save picture', () => savePicture(), { variant: 'primary', icon: 'Download', title: 'This picture with its marks' });
  const copyB = button('Copy', () => copyPicture(), { icon: 'Copy', title: 'This picture with its marks, on the clipboard (PNG)' });
  copyB.hidden = phone || typeof ClipboardItem === 'undefined';
  const pdfB = button('Save the guide as PDF', () => savePdf(), { icon: 'FileDown', title: 'Every picture with its caption, in order — A4 pages' });
  const tallB = button('Save as one tall picture', () => saveTall(), { icon: 'GalleryVerticalEnd', title: 'Every picture with its caption, one under another — for WhatsApp' });
  const titleIn = input({ placeholder: 'e.g. How to renew the policy online', onInput: (v) => { G.title = v; } });
  titleIn.maxLength = 200; titleIn.value = G.title;
  const numT = toggle('Number the steps (Step 1, Step 2 …)', G.numbered, (v) => { G.numbered = v; renderAll(); });
  const onT = toggle('Number the step markers on from picture to picture', G.numberOn, (v) => { G.numberOn = v; renderAll(); });
  const again = button('Start over', () => startOver(), { variant: 'ghost', icon: 'RotateCcw', small: true });

  const editor = h('div', { class: 'an-editor' },
    toolbar, tip, opts, pane,
    h('div', { class: 'row an-under' }, zoomRow, status),
    actions(undoB, redoB, saveB, copyB));
  const guideCard = card('Save',
    h('div', { class: 'stack' },
      h('div', { class: 'field', role: 'group', 'aria-label': 'Save the picture as' }, h('span', { class: 'field-label' }, 'This picture as'), fmtSel,
        h('span', { class: 'field-hint' }, 'PNG keeps a screenshot’s text sharp (and is usually the smaller file for one); JPEG is smaller for a photo.')),
      h('h3', { class: 'an-h' }, 'A how-to guide of the pictures'),
      field('Title of the guide', titleIn),
      numT, onT,
      h('div', { class: 'stack an-guide-btns' }, pdfB, tallB),
      note('Sent in WhatsApp as a photo, a tall picture is made small and blurry: send it as a document (or the PDF) to keep it sharp.'),
      made.el, again));
  const side = h('div', { class: 'an-side' },
    card('The pictures, in order', h('div', { class: 'stack' }, strip, captionField)),
    guideCard);
  const main = h('div', { class: 'an-main', hidden: true }, editor, side);
  const empty = note('Choose a screenshot or a photo — or paste one (Ctrl+V). Several pictures, each with a caption, make a how-to guide: one PDF or one tall picture.');
  root.append(card('Pictures', picker.el, empty), main);

  // ---------------------------------------------------------------- the view
  const view = { zoom: 1, scale: 1 };
  let sel: A.Shape | null = null, cropDraft: A.Rect | null = null, raf = 0;
  const visRect = (p: Pic): A.Rect => (prefs.tool === 'crop' ? { x: 0, y: 0, w: p.w, h: p.h } : p.crop || { x: 0, y: 0, w: p.w, h: p.h });
  function fitScale(p: Pic) {
    const v = visRect(p), w = Math.max(200, pane.clientWidth - 2), maxH = Math.max(240, Math.min(innerHeight * (phone ? 0.6 : 0.72), 1400));
    return Math.min(w / v.w, maxH / v.h, 2);
  }
  function setZoom(z: number) {
    const p = curPic(); if (!p) return;
    const v = visRect(p), fit = fitScale(p);
    view.zoom = Math.max(1, Math.min(z, 8000 / (v.w * fit), 8000 / (v.h * fit), 4 / fit));
    if (view.zoom < 1.05) view.zoom = 1;
    draw();
  }
  const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };
  let computing = false;
  function paint() {
    const p = curPic(); if (!p || !alive) return;
    const v = visRect(p);
    view.scale = fitScale(p) * view.zoom;
    const cssW = Math.max(1, Math.round(v.w * view.scale)), cssH = Math.max(1, Math.round(v.h * view.scale));
    const dpr = Math.min(devicePixelRatio || 1, 8192 / Math.max(cssW, cssH));
    const bw = Math.max(1, Math.round(cssW * dpr)), bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    pane.classList.toggle('an-zoomed', view.zoom > 1);
    const k = bw / v.w, g = canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, bw, bh);
    g.imageSmoothingQuality = 'high';
    g.setTransform(k, 0, 0, k, -v.x * k, -v.y * k);
    const hides = hidesOf(p), key = hides.length ? JSON.stringify(hides) : '';
    const ready = !hides.length || p.base?.key === key;
    g.drawImage(ready && hides.length ? p.base!.canvas : (p.base?.canvas ?? p.bmp), 0, 0);
    if (!ready) {
      for (const s of hides) { g.fillStyle = 'rgba(120,120,130,0.75)'; g.fillRect(s.x, s.y, s.w, s.h); }
      if (!drag && !computing) { computing = true; void baseOf(p).catch((e) => toast(errMsg(e), 'err')).finally(() => { computing = false; draw(); }); }
    }
    const u = A.unit(p.w, p.h), cpx = 1 / view.scale; // a CSS pixel in the picture's pixels
    A.drawMarks(g, p.shapes, u, k, numbersOf(p));
    // the hidden areas outlined (not saved), the mark chosen with its handles
    g.save(); g.lineWidth = cpx * 1.5; g.setLineDash([5 * cpx, 4 * cpx]);
    for (const s of hides) { g.strokeStyle = s === sel ? '#1e88e5' : 'rgba(255,255,255,0.9)'; g.strokeRect(s.x, s.y, s.w, s.h); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineDashOffset = 5 * cpx; g.strokeRect(s.x, s.y, s.w, s.h); g.lineDashOffset = 0; }
    g.restore();
    if (sel && prefs.tool !== 'crop') {
      const b = A.bounds(sel, u, measure), pad = 4 * cpx;
      g.save(); g.lineWidth = 1.5 * cpx; g.setLineDash([6 * cpx, 4 * cpx]); g.strokeStyle = '#1e88e5';
      g.strokeRect(b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad); g.setLineDash([]);
      for (const hd of A.handles(sel)) { const r = (phone ? 7 : 5) * cpx; g.fillStyle = '#fff'; g.strokeStyle = '#1e88e5'; g.lineWidth = 2 * cpx; g.beginPath(); g.rect(hd.x - r, hd.y - r, 2 * r, 2 * r); g.fill(); g.stroke(); }
      g.restore();
    }
    if (prefs.tool === 'crop' && cropDraft) {
      const c = cropDraft;
      g.save(); g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath(); g.rect(0, 0, p.w, p.h); g.rect(c.x, c.y, c.w, c.h); g.fill('evenodd');
      g.strokeStyle = '#fff'; g.lineWidth = 2 * cpx; g.strokeRect(c.x, c.y, c.w, c.h);
      for (const hd of A.handles({ ...c, id: 0, kind: 'rect', color: '', size: 'm' })) { const r = (phone ? 8 : 6) * cpx; g.fillStyle = '#fff'; g.fillRect(hd.x - r, hd.y - r, 2 * r, 2 * r); }
      g.restore();
    }
    syncButtons();
  }
  new ResizeObserver(() => draw()).observe(pane);

  // ---------------------------------------------------------------- tools and styles
  function setTool(t: Tool) {
    const p = curPic();
    if (t === 'crop' && p) cropDraft = p.crop ? { ...p.crop } : { x: 0, y: 0, w: p.w, h: p.h };
    if (prefs.tool === 'crop' && t !== 'crop') cropDraft = null;
    prefs.tool = t;
    if (t !== 'select' && sel && !(t === sel.kind || (t === 'hide' && sel.kind === 'hide'))) sel = null;
    view.zoom = t === 'crop' ? 1 : view.zoom;
    syncOpts(); draw();
    tip.textContent = TOOLS.find(([x]) => x === t)![3];
  }
  /** the tool whose colour and size the controls show: the mark chosen's, else the tool's */
  const styleKey = () => (sel && sel.kind !== 'hide' ? sel.kind : prefs.tool);
  function syncOpts() {
    const t = prefs.tool, k = styleKey();
    for (const [x, b] of toolBtns) { b.setAttribute('aria-pressed', String(x === t)); b.classList.toggle('on', x === t); }
    const styled = DRAWS.has(t) || (t === 'select' && !!sel && sel.kind !== 'hide');
    styleOpts.hidden = !styled;
    const color = sel && sel.kind !== 'hide' ? sel.color : prefs.color[k] ?? '#e53935';
    for (const s of swatches.querySelectorAll<HTMLButtonElement>('.an-swatch')) s.setAttribute('aria-pressed', String(s.dataset.c === color));
    custom.value = /^#[0-9a-f]{6}$/i.test(color) ? color : '#e53935';
    sizeSel.value = sel && sel.kind !== 'hide' ? sel.size : prefs.size[k] ?? 'm';
    textOpts.hidden = !(t === 'text' || sel?.kind === 'text');
    if (sel?.kind === 'text' && document.activeElement !== textIn) textIn.value = sel.text;
    labelSel.value = sel?.kind === 'text' ? (sel.label ? 'label' : 'plain') : prefs.label ? 'label' : 'plain';
    hideOpts.hidden = !(t === 'hide' || sel?.kind === 'hide');
    hideSel.value = sel?.kind === 'hide' ? sel.style : prefs.hide;
    cropOpts.hidden = t !== 'crop';
    delBtn.hidden = !sel || t === 'crop';
  }
  function setColor(c: string) {
    if (sel && sel.kind !== 'hide') { prefs.color[sel.kind] = c; change(() => { (sel as any).color = c; }); }
    else prefs.color[prefs.tool] = c;
    syncOpts();
  }
  function setSize(s: A.Size) {
    if (sel && sel.kind !== 'hide') { prefs.size[sel.kind] = s; change(() => { (sel as any).size = s; }); }
    else prefs.size[prefs.tool] = s;
    syncOpts();
  }
  /** a change of the picture being marked, as one step of Undo */
  function change(f: () => void) {
    const before = snap(); f();
    if (snap() !== before) history.push(before);
    draw(); renderStripThumb();
  }
  textIn.addEventListener('focus', () => { textEditBefore = sel?.kind === 'text' ? snap() : null; });
  let textEditBefore: string | null = null;
  textIn.addEventListener('input', () => {
    if (sel?.kind !== 'text') return;
    if (textEditBefore) { history.push(textEditBefore); textEditBefore = null; }
    sel.text = textIn.value || ' ';
    draw(); renderStripThumb();
  });

  // ---------------------------------------------------------------- undo, redo, delete
  function undo() {
    const s = history.undo(snap()); if (s == null) { say('Nothing to undo.'); return; }
    restore(s); sel = null; cropDraft = null; if (prefs.tool === 'crop') prefs.tool = 'select';
    renderAll(); say('Undone.');
  }
  function redo() {
    const s = history.redo(snap()); if (s == null) { say('Nothing to redo.'); return; }
    restore(s); sel = null; cropDraft = null; if (prefs.tool === 'crop') prefs.tool = 'select';
    renderAll(); say('Redone.');
  }
  function deleteSel() {
    const p = curPic(); if (!p || !sel) return;
    const gone = sel; change(() => { p.shapes = p.shapes.filter((s) => s.id !== gone.id); });
    sel = null; syncOpts(); draw();
    say(`${nameOf(gone)} deleted. ${countLine(p)}`);
  }
  const nameOf = (s: A.Shape) => ({ arrow: 'Arrow', rect: 'Box', ellipse: 'Circle', step: 'Step marker', text: 'Text', highlight: 'Highlight', pen: 'Drawing', hide: 'Hidden area' })[s.kind];
  const countLine = (p: Pic) => { const n = p.shapes.length; return n ? `${n} ${n === 1 ? 'mark' : 'marks'} on this picture.` : 'No marks on this picture.'; };
  function syncButtons() {
    undoB.disabled = !history.canUndo; redoB.disabled = !history.canRedo;
    const p = curPic();
    zoomOut.disabled = view.zoom <= 1; zoomFit.disabled = view.zoom <= 1;
    if (p) { const v = visRect(p), fit = fitScale(p); zoomIn.disabled = view.zoom * 1.5 > Math.min(8000 / (v.w * fit), 8000 / (v.h * fit), 4 / fit) + 1e-9 && view.zoom >= Math.min(8000 / (v.w * fit), 8000 / (v.h * fit), 4 / fit) - 1e-9; }
  }

  // ---------------------------------------------------------------- drawing with the pointer
  type Drag = { kind: 'new' | 'move' | 'handle' | 'crop-new' | 'crop-move' | 'crop-handle'; handle?: A.Handle; sx: number; sy: number; cx: number; cy: number; before: string; orig: any; moved: boolean; shape?: A.Shape };
  let drag: Drag | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pan: { x: number; y: number; d: number; zoom: number; sl: number; st: number } | null = null;
  const toPic = (e: { clientX: number; clientY: number }) => {
    const p = curPic()!, r = canvas.getBoundingClientRect(), v = visRect(p);
    return { x: v.x + (e.clientX - r.left) / view.scale, y: v.y + (e.clientY - r.top) / view.scale };
  };
  const mid = () => { const a = [...pointers.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }; };
  function cancelDrag() {
    if (!drag) return;
    restore(drag.before); sel = null; drag = null; draw();
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = curPic(); if (!p) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { // two fingers: move and zoom the view, not draw
      cancelDrag();
      const m = mid(); pan = { x: m.x, y: m.y, d: m.d, zoom: view.zoom, sl: pane.scrollLeft, st: pane.scrollTop };
      return;
    }
    if (pointers.size > 2) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pt = toPic(e), u = A.unit(p.w, p.h), cpx = 1 / view.scale, tol = (e.pointerType === 'touch' ? 14 : 7) * cpx;
    const base = { sx: pt.x, sy: pt.y, cx: e.clientX, cy: e.clientY, before: snap(), moved: false };
    const t = prefs.tool;
    if (t === 'crop') {
      const c = cropDraft!, r = { ...c, id: 0, kind: 'rect' as const, color: '', size: 'm' as const };
      const hd = A.handleAt(r, pt.x, pt.y, tol * 1.4);
      if (hd) drag = { ...base, kind: 'crop-handle', handle: hd, orig: { ...c } };
      // inside a crop already made: move it; on the whole picture (nothing cropped yet), or outside: draw a new one
      else if (!(c.x <= 0 && c.y <= 0 && c.w >= p.w && c.h >= p.h) && pt.x > c.x && pt.x < c.x + c.w && pt.y > c.y && pt.y < c.y + c.h) drag = { ...base, kind: 'crop-move', orig: { ...c } };
      else drag = { ...base, kind: 'crop-new', orig: { ...c } };
      return;
    }
    // the mark chosen: by a handle, or by itself
    if (sel) {
      const hd = A.handleAt(sel, pt.x, pt.y, tol * 1.4);
      if (hd) { drag = { ...base, kind: 'handle', handle: hd, orig: structuredClone(sel) }; return; }
      if (A.hits(sel, pt.x, pt.y, tol, u, measure, true)) { drag = { ...base, kind: 'move', orig: structuredClone(sel) }; return; }
    }
    if (t === 'select') {
      const hit = A.hitTest(p.shapes, pt.x, pt.y, tol, u, measure);
      sel = hit; syncOpts(); draw();
      if (hit) { drag = { ...base, kind: 'move', orig: structuredClone(hit) }; say(`${nameOf(hit)} chosen — drag it, or change its colour or size.`); }
      return;
    }
    // a new mark
    const id = G.nextShape++, color = prefs.color[t] ?? '#e53935', size = prefs.size[t] ?? 'm';
    let s: A.Shape;
    if (t === 'arrow') s = { id, kind: 'arrow', color, size, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
    else if (t === 'rect' || t === 'ellipse') s = { id, kind: t, color, size, x: pt.x, y: pt.y, w: 0, h: 0 };
    else if (t === 'hide') { const r = crypto.getRandomValues(new Uint32Array(3)); s = { id, kind: 'hide', style: prefs.hide, x: pt.x, y: pt.y, w: 0, h: 0, seed: r[0] || 1, ox: r[1] % 997, oy: r[2] % 997 }; }
    else if (t === 'highlight' || t === 'pen') s = { id, kind: t, color, size, pts: [pt.x, pt.y] };
    else if (t === 'step') s = { id, kind: 'step', color, size, x: pt.x, y: pt.y };
    else {
      const text = textIn.value.replace(/\s+$/, '');
      if (!text.trim()) { drag = null; say('Type the text first, then tap where it goes.'); textIn.focus(); return; }
      const b = A.textBox({ text, size, label: prefs.label, x: 0, y: 0 }, u, measure);
      s = { id, kind: 'text', color, size, text, label: prefs.label, x: Math.max(0, Math.min(p.w - b.w, pt.x - b.w / 2)), y: Math.max(0, Math.min(p.h - b.h, pt.y - b.h / 2)) };
    }
    p.shapes.push(s); sel = s;
    drag = { ...base, kind: t === 'step' || t === 'text' ? 'move' : 'new', orig: structuredClone(s), shape: s };
    syncOpts(); draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan && pointers.size >= 2) {
      const m = mid(), p = curPic(); if (!p) return;
      const z = Math.max(1, pan.zoom * (m.d / Math.max(1, pan.d)));
      if (Math.abs(z - view.zoom) > 0.02) { setZoom(z); }
      pane.scrollLeft = pan.sl - (m.x - pan.x); pane.scrollTop = pan.st - (m.y - pan.y);
      return;
    }
    const p = curPic(); if (!drag || !p) return;
    const pt = toPic(e), dx = pt.x - drag.sx, dy = pt.y - drag.sy, u = A.unit(p.w, p.h);
    if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 3) return;
    drag.moved = true;
    if (drag.kind === 'crop-new') { cropDraft = A.cropOf({ x: drag.sx, y: drag.sy, w: dx, h: dy }, p.w, p.h, 1); draw(); return; }
    if (drag.kind === 'crop-move') { const o = drag.orig; cropDraft = { ...o, x: Math.max(0, Math.min(p.w - o.w, o.x + dx)), y: Math.max(0, Math.min(p.h - o.h, o.y + dy)) }; draw(); return; }
    if (drag.kind === 'crop-handle') { const r = A.resized({ ...drag.orig, id: 0, kind: 'rect', color: '', size: 'm' }, drag.handle!, pt.x, pt.y, p.w, p.h, 16); cropDraft = { x: r.x, y: r.y, w: r.w, h: r.h }; draw(); return; }
    const i = p.shapes.findIndex((s) => s.id === (sel?.id ?? -1)); if (i < 0) return;
    let s = p.shapes[i];
    const o = drag.orig as A.Shape;
    if (drag.kind === 'move') s = A.moved(o, dx, dy, p.w, p.h, u, measure);
    else if (drag.kind === 'handle') s = A.resized(o, drag.handle!, pt.x, pt.y, p.w, p.h);
    else if (s.kind === 'arrow') s = { ...s, x2: Math.max(0, Math.min(p.w, pt.x)), y2: Math.max(0, Math.min(p.h, pt.y)) };
    else if (s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'hide') s = { ...s, w: Math.max(-drag.sx, Math.min(p.w - drag.sx, dx)), h: Math.max(-drag.sy, Math.min(p.h - drag.sy, dy)) };
    else if (s.kind === 'highlight' || s.kind === 'pen') {
      const last = s.pts.length - 2, x = Math.max(0, Math.min(p.w, pt.x)), y = Math.max(0, Math.min(p.h, pt.y));
      if (Math.hypot(x - s.pts[last], y - s.pts[last + 1]) >= 1.5 / view.scale) s = { ...s, pts: [...s.pts, x, y] };
    }
    p.shapes[i] = s; sel = s; draw();
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pan) { if (pointers.size < 2) pan = null; return; }
    const p = curPic(); if (!drag || !p) { drag = null; return; }
    const d = drag; drag = null;
    if (d.kind.startsWith('crop')) { draw(); return; }
    const i = p.shapes.findIndex((s) => s.id === (sel?.id ?? -1));
    if (i >= 0 && d.kind === 'new') {
      let s = p.shapes[i];
      const u = A.unit(p.w, p.h);
      if (!d.moved || tooSmall(s, u)) s = defaultShape(s, d.sx, d.sy, p.w, p.h, u);
      if (s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'hide') s = A.normBox(s);
      if (s.kind === 'highlight' || s.kind === 'pen') s = { ...s, pts: A.thin(s.pts, 1.2 / view.scale) };
      p.shapes[i] = s; sel = s;
      say(`${nameOf(s)} added${s.kind === 'step' ? '' : ''}. ${countLine(p)}${s.kind === 'hide' ? ' It is burnt into the picture when it is saved.' : ''}`);
    } else if (i >= 0 && d.kind === 'move' && !d.moved && d.shape) {
      const s = p.shapes[i];
      say(`${nameOf(s)}${s.kind === 'step' ? ` ${numbersOf(p).get(s.id)}` : ''} added. ${countLine(p)}`);
    }
    if (snap() !== d.before) history.push(d.before);
    syncOpts(); draw(); renderStripThumb();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pan = null; cancelDrag(); });
  canvas.addEventListener('dblclick', (e) => { const p = curPic(); if (!p) return; const pt = toPic(e), hit = A.hitTest(p.shapes, pt.x, pt.y, 6 / view.scale, A.unit(p.w, p.h), measure); if (hit?.kind === 'text') { sel = hit; syncOpts(); textIn.focus(); textIn.select(); } });
  const tooSmall = (s: A.Shape, u: number) => (s.kind === 'arrow' ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 12 * u : (s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'hide') ? Math.abs(s.w) < 6 * u || Math.abs(s.h) < 6 * u : false);
  /** a mark made by a tap (or a drag too small to mean anything): its usual size, at the place tapped, on the picture */
  function defaultShape(s: A.Shape, x: number, y: number, W: number, H: number, u: number): A.Shape {
    const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    if (s.kind === 'arrow') { // pointing at the place tapped, from the upper left (from the other side near an edge)
      const L = 150 * u, sx = x - L * 0.8 < 0 ? 1 : -1, sy = y - L * 0.6 < 0 ? 1 : -1;
      return { ...s, x1: cl(x + sx * L * 0.8, 0, W), y1: cl(y + sy * L * 0.6, 0, H), x2: x, y2: y };
    }
    if (s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'hide') {
      const w = Math.min(W, (s.kind === 'hide' ? 240 : 220) * u), hh = Math.min(H, (s.kind === 'hide' ? 60 : 130) * u);
      return { ...s, x: cl(x - w / 2, 0, W - w), y: cl(y - hh / 2, 0, H - hh), w, h: hh };
    }
    if (s.kind === 'highlight' && s.pts.length <= 2) { const w = 160 * u; return { ...s, pts: [cl(x - w / 2, 0, W), y, cl(x + w / 2, 0, W), y] }; }
    return s;
  }

  // ---------------------------------------------------------------- the keyboard
  let keyBefore: string | null = null, keyTimer = 0;
  canvas.addEventListener('keydown', (e) => {
    const p = curPic(); if (!p) return;
    const u = A.unit(p.w, p.h), step = (e.shiftKey ? 40 : 4) / view.scale;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key === 'Escape') { if (drag) cancelDrag(); else if (prefs.tool === 'crop') { cropDraft = null; setTool('select'); } else if (sel) { sel = null; syncOpts(); draw(); say('Nothing chosen.'); } e.preventDefault(); return; }
    if (prefs.tool === 'crop' && cropDraft) {
      if (e.key === 'Enter') { applyCrop(); e.preventDefault(); return; }
      const a = arrows[e.key]; if (!a) return;
      e.preventDefault();
      const c = cropDraft;
      cropDraft = e.altKey ? A.cropOf({ ...c, w: c.w + a[0] * step, h: c.h + a[1] * step }, p.w, p.h) : { ...c, x: Math.max(0, Math.min(p.w - c.w, c.x + a[0] * step)), y: Math.max(0, Math.min(p.h - c.h, c.y + a[1] * step)) };
      draw(); return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { deleteSel(); e.preventDefault(); return; }
    if ((e.key === 'n' || e.key === 'p') && !e.ctrlKey && !e.metaKey && !e.altKey && p.shapes.length) {
      const i = sel ? p.shapes.findIndex((s) => s.id === sel!.id) : -1, n = p.shapes.length;
      sel = p.shapes[(i + (e.key === 'n' ? 1 : n - 1 + (i < 0 ? 1 : 0)) + n) % n] ?? null;
      syncOpts(); draw(); if (sel) say(`${nameOf(sel)} chosen (${p.shapes.indexOf(sel) + 1} of ${n}).`);
      e.preventDefault(); return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && (DRAWS.has(prefs.tool) || prefs.tool === 'hide')) { addAtCentre(p); e.preventDefault(); return; }
    const a = arrows[e.key];
    if (a && sel) {
      e.preventDefault();
      const i = p.shapes.findIndex((s) => s.id === sel!.id); if (i < 0) return;
      if (!keyBefore) keyBefore = snap();
      clearTimeout(keyTimer); keyTimer = window.setTimeout(() => { if (keyBefore && keyBefore !== snap()) history.push(keyBefore); keyBefore = null; syncButtons(); renderStripThumb(); }, 700);
      let s = p.shapes[i];
      if (e.altKey) {
        if (s.kind === 'arrow') s = A.resized(s, 'p2', s.x2 + a[0] * step, s.y2 + a[1] * step, p.w, p.h);
        else if (s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'hide') s = A.resized(s, a[0] ? 'e' : 's', s.x + s.w + a[0] * step, s.y + s.h + a[1] * step, p.w, p.h);
      } else s = A.moved(s, a[0] * step, a[1] * step, p.w, p.h, u, measure);
      p.shapes[i] = s; sel = s; draw();
    }
  });
  /** Enter with a tool: its mark in the middle of what is in view */
  function addAtCentre(p: Pic) {
    const v = visRect(p), r = pane.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    const cx = v.x + (Math.max(r.left, c.left) + Math.min(r.right, c.right) - 2 * c.left) / 2 / view.scale;
    const cy = v.y + (Math.max(r.top, c.top) + Math.min(r.bottom, c.bottom) - 2 * c.top) / 2 / view.scale;
    const t = prefs.tool, u = A.unit(p.w, p.h), id = G.nextShape++, color = prefs.color[t] ?? '#e53935', size = prefs.size[t] ?? 'm';
    let s: A.Shape;
    if (t === 'text') {
      const text = textIn.value.replace(/\s+$/, '');
      if (!text.trim()) { say('Type the text first.'); textIn.focus(); return; }
      const b = A.textBox({ text, size, label: prefs.label, x: 0, y: 0 }, u, measure);
      s = { id, kind: 'text', color, size, text, label: prefs.label, x: Math.max(0, cx - b.w / 2), y: Math.max(0, cy - b.h / 2) };
    } else if (t === 'step') s = { id, kind: 'step', color, size, x: cx, y: cy };
    else if (t === 'hide') { const rr = crypto.getRandomValues(new Uint32Array(3)); s = defaultShape({ id, kind: 'hide', style: prefs.hide, x: 0, y: 0, w: 0, h: 0, seed: rr[0] || 1, ox: rr[1] % 997, oy: rr[2] % 997 }, cx, cy, p.w, p.h, u); }
    else if (t === 'arrow') s = defaultShape({ id, kind: 'arrow', color, size, x1: 0, y1: 0, x2: 0, y2: 0 }, cx, cy, p.w, p.h, u);
    else if (t === 'rect' || t === 'ellipse') s = defaultShape({ id, kind: t, color, size, x: 0, y: 0, w: 0, h: 0 }, cx, cy, p.w, p.h, u);
    else { const w = 160 * u; s = { id, kind: t as 'highlight' | 'pen', color, size, pts: [cx - w / 2, cy, cx + w / 2, cy] }; }
    change(() => { p.shapes.push(s); });
    sel = s; syncOpts(); draw();
    say(`${nameOf(s)}${s.kind === 'step' ? ` ${numbersOf(p).get(s.id)}` : ''} added in the middle — move it with the arrow keys${s.kind === 'arrow' || s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'hide' ? ', Alt with the arrows changes its size' : ''}. ${countLine(p)}`);
  }
  // Undo / Redo anywhere in the tab but a text box (a text box has its own)
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!root.contains(t) && t !== document.body) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  };
  addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- crop
  function applyCrop() {
    const p = curPic(); if (!p || !cropDraft) return;
    const c = A.cropOf(cropDraft, p.w, p.h);
    const whole = c.x === 0 && c.y === 0 && c.w === p.w && c.h === p.h;
    change(() => { p.crop = whole ? null : c; });
    cropDraft = null; view.zoom = 1;
    setTool('select');
    say(whole ? 'The whole picture is kept.' : `Cropped to ${c.w} × ${c.h} pixels — the marks outside it are kept, and come back with Crop → Whole picture.`);
  }

  // ---------------------------------------------------------------- the strip of pictures
  const stripThumbs = new Map<number, HTMLCanvasElement>();
  let thumbTimer = 0;
  function renderStrip() {
    stripThumbs.clear();
    clear(strip).append(...G.order.map((id, i) => {
      const p = G.pics.get(id)!;
      const th = h('canvas', { class: 'an-thumb', 'aria-hidden': 'true' }) as HTMLCanvasElement;
      stripThumbs.set(id, th); void thumbOf(p, th);
      const pick = h('button', { type: 'button', class: 'an-pick', 'aria-current': id === G.cur ? 'true' : null, onclick: () => { if (G.cur !== id) { G.cur = id; sel = null; cropDraft = null; if (prefs.tool === 'crop') prefs.tool = 'select'; view.zoom = 1; renderAll(); } } },
        th, h('span', { class: 'an-pick-t' }, h('strong', null, G.numbered ? `Step ${i + 1}` : `Picture ${i + 1}`), h('span', { class: 'small muted an-pick-c' }, p.caption || p.name)));
      return h('li', { class: ['an-item', id === G.cur && 'cur'], 'data-id': String(id) }, pick,
        h('div', { class: 'an-item-btns' },
          button('', () => movePic(id, -1), { icon: 'ArrowUp', small: true, variant: 'ghost', title: `Move ${G.numbered ? `step ${i + 1}` : `picture ${i + 1}`} up`, disabled: i === 0 }),
          button('', () => movePic(id, 1), { icon: 'ArrowDown', small: true, variant: 'ghost', title: `Move ${G.numbered ? `step ${i + 1}` : `picture ${i + 1}`} down`, disabled: i === G.order.length - 1 }),
          button('', () => removePic(id), { icon: 'X', small: true, variant: 'ghost', title: `Remove ${G.numbered ? `step ${i + 1}` : `picture ${i + 1}`} (${p.name})` })));
    }));
  }
  function renderStripText(p: Pic) { const li = strip.querySelector(`[data-id="${p.id}"] .an-pick-c`); if (li) li.textContent = p.caption || p.name; }
  async function thumbOf(p: Pic, th: HTMLCanvasElement) {
    const c = await renderPic(p, 200).catch(() => null); if (!c) return;
    th.width = c.width; th.height = c.height; th.getContext('2d')!.drawImage(c, 0, 0);
  }
  function renderStripThumb() {
    clearTimeout(thumbTimer);
    thumbTimer = window.setTimeout(() => { const p = curPic(), th = p && stripThumbs.get(p.id); if (p && th) void thumbOf(p, th); }, 400);
  }
  function movePic(id: number, d: number) {
    const i = G.order.indexOf(id), j = i + d; if (j < 0 || j >= G.order.length) return;
    const before = snap(); [G.order[i], G.order[j]] = [G.order[j], G.order[i]]; history.push(before);
    renderAll(); say(`Moved to ${G.numbered ? 'step' : 'place'} ${j + 1}.`);
  }
  function removePic(id: number) {
    const i = G.order.indexOf(id); if (i < 0) return;
    const before = snap(); G.order.splice(i, 1); history.push(before);
    if (G.cur === id) G.cur = G.order[Math.min(i, G.order.length - 1)] ?? 0;
    sel = null; renderAll();
    say(`${G.pics.get(id)!.name} removed — Undo brings it back.`);
  }
  function startOver() {
    for (const p of G.pics.values()) p.bmp.close();
    G.pics.clear(); G.order = []; G.cur = 0; history.clear(); sel = null; cropDraft = null; made.clear();
    const drop = picker.el.querySelector('.drop'); drop?.classList.remove('drop-compact');
    const strong = drop?.querySelector('strong'); if (strong) strong.textContent = 'Choose screenshots or photos';
    renderAll(); say('');
  }

  function renderAll() {
    const p = curPic(), any = G.order.length > 0;
    main.hidden = !p; empty.hidden = any;
    if (p) {
      const i = G.order.indexOf(p.id);
      captionLabel.textContent = G.numbered ? `Caption for step ${i + 1}` : 'Caption';
      if (document.activeElement !== captionIn) captionIn.value = p.caption;
      if (prefs.tool === 'crop' && !cropDraft) cropDraft = p.crop ? { ...p.crop } : { x: 0, y: 0, w: p.w, h: p.h };
    }
    pdfB.setLabel(G.order.length > 1 ? `Save the guide as PDF (${G.order.length} steps)` : 'Save as PDF');
    renderStrip(); syncOpts(); draw();
  }

  // ---------------------------------------------------------------- saving
  const picName = (p: Pic, ext: string) => `${safeName(baseName(p.name))}-annotated.${ext}`;
  function deliver(blob: Blob, name: string, what: string) {
    made.add(name, blob, what);
    if (phone) say(`${name} is ready — tap its Share button below to send it or save it.`);
    else { downloadBlob(blob, name); say(`Saved ${name}.`); }
  }
  async function savePicture() {
    const p = curPic(); if (!p) return;
    say('Making the picture…');
    const c = await renderPic(p), img = imgOf(c);
    const blob = await encodeImg(img, prefs.fmt, 90);
    deliver(blob, picName(p, prefs.fmt === 'png' ? 'png' : 'jpg'), `${c.width} × ${c.height}`);
  }
  function copyPicture() {
    const p = curPic(); if (!p) return;
    // the item is handed over in the click, its picture as a promise (the clipboard asks for the click)
    const blob = renderPic(p).then((c) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be made.'))), 'image/png')));
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(() => say('Copied — paste it anywhere (Ctrl+V).'))
      .catch((e) => { say(`The browser refused the clipboard: ${errMsg(e)}`); });
  }
  const guidePics = () => G.order.map((id) => G.pics.get(id)!);
  async function savePdf() {
    const pics = guidePics(); if (!pics.length) return;
    say('Making the PDF…');
    const [{ htmlToPdf, esc, PAGE }] = await Promise.all([import('../lib/htmlpdf'), fonts()]);
    ip ||= await imgprocDirect();
    const [PW, PH] = PAGE.a4, mg = 36, cw = PW - 2 * mg, ch = PH - 2 * mg;
    const files: Record<string, Uint8Array> = {}, items: Array<{ html: string; h: number }> = [];
    const title = G.title.trim();
    const titleH = title ? A.wrap(title, cw, 20, measure).length * 20 * 1.25 + 14 : 0;
    /** a step's room on its page: the title above the first; its heading, caption, margins and a safety margin of 4 % */
    const SAFE = 1.04, PAD = 30;
    for (let i = 0; i < pics.length; i++) {
      const p = pics[i];
      say(`Making the PDF: picture ${i + 1} of ${pics.length}…`);
      const head = A.stepHeading(i, G.numbered), cap = p.caption.trim();
      const capLines = cap ? A.wrap(cap, cw, 11, measureText).length : 0;
      const textH = (head ? 13 * 1.3 + 4 : 0) + (cap ? capLines * 11 * 1.4 + 6 : 0);
      const c = await renderPic(p, 2400), img = imgOf(c);
      const flat = ip.flatShare(img) > 0.25, ext = flat ? 'png' : 'jpg';
      const blob = await encodeImg(img, flat ? 'png' : 'jpeg', 88);
      files[`s${i}.${ext}`] = new Uint8Array(await blob.arrayBuffer());
      const room = (ch - (i === 0 ? titleH : 0)) / SAFE - textH - PAD;
      const fit = A.fitIn(c.width, c.height, cw, Math.max(120, room), 72 / 120);
      const html = `<div class="step">${head ? `<h2>${esc(head)}</h2>` : ''}${cap ? cap.split('\n').map((l) => `<p>${esc(l) || '&#160;'}</p>`).join('') : ''}<div class="pic"><img src="img/s${i}.${ext}" style="width:${fit.w.toFixed(1)}pt;height:${fit.h.toFixed(1)}pt" alt=""/></div></div>`;
      items.push({ html, h: (textH + fit.h + PAD) * SAFE });
    }
    const heights = items.map((x, i) => x.h + (i === 0 ? titleH : 0));
    const pages = A.packPages(heights, ch, 0);
    const bodies = pages.map((idx, n) => `${n === 0 && title ? `<h1>${esc(title)}</h1>` : ''}${idx.map((i) => items[i].html).join('')}`);
    const css = 'h1 { font-size: 20pt; line-height: 1.25; margin: 0 0 12pt 0; } .step { margin: 0 0 18pt 0; } h2 { font-size: 13pt; color: #1565c0; margin: 0 0 4pt 0; } p { font-size: 11pt; line-height: 1.4; margin: 0 0 2pt 0; } .pic { text-align: center; margin-top: 4pt; } img { border: 0.75pt solid #c8ccd2; }';
    const bytes = await htmlToPdf(bodies, css, { title: title || 'How-to guide', margin: mg, pageNumbers: pages.length > 1, files });
    if (!alive) return;
    deliver(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${safeName(title)}.pdf`, `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · ${pics.length} ${pics.length === 1 ? 'picture' : 'pictures'}`);
  }
  async function saveTall() {
    const pics = guidePics(); if (!pics.length) return;
    say('Making the tall picture…');
    await fonts();
    const W = 1080, M = 40, inner = W - 2 * M, GAP = 44;
    const title = G.title.trim(), pieces: HTMLCanvasElement[] = [];
    const textPiece = (lines: Array<{ t: string; font: string; px: number; color: string; lh: number }>, below = 0) => {
      const H = Math.ceil(lines.reduce((a, l) => a + l.lh, 0) + below);
      const c = h('canvas', { width: W, height: Math.max(1, H) }) as HTMLCanvasElement, g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.textBaseline = 'middle';
      let y = 0; for (const l of lines) { g.font = l.font; g.fillStyle = l.color; g.fillText(l.t, M, y + l.lh / 2); y += l.lh; }
      return c;
    };
    if (title) pieces.push(textPiece(A.wrap(title, inner, 52, measure).map((t) => ({ t, font: `700 52px ${A.FONT}`, px: 52, color: '#111', lh: 66 })), 28));
    for (let i = 0; i < pics.length; i++) {
      const p = pics[i];
      say(`Making the tall picture: ${i + 1} of ${pics.length}…`);
      const head = A.stepHeading(i, G.numbered), cap = p.caption.trim();
      const lines = [
        ...(head ? [{ t: head, font: `700 40px ${A.FONT}`, px: 40, color: '#1565c0', lh: 54 }] : []),
        ...(cap ? A.wrap(cap, inner, 34, measureText).map((t) => ({ t, font: `400 34px ${TEXT_FONT}`, px: 34, color: '#222', lh: 46 })) : []),
      ];
      if (lines.length) pieces.push(textPiece(lines, 14));
      const c = await renderPic(p), k = Math.min(1, inner / c.width), w = Math.round(c.width * k), hh = Math.round(c.height * k);
      const pc = h('canvas', { width: W, height: hh + 4 + (i < pics.length - 1 ? GAP : 0) }) as HTMLCanvasElement, g = pc.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, pc.height);
      const x = Math.round((W - w) / 2);
      g.fillStyle = '#c8ccd2'; g.fillRect(x - 2, 0, w + 4, hh + 4);
      g.imageSmoothingQuality = 'high'; g.drawImage(c, x, 2, w, hh);
      pieces.push(pc);
    }
    const H = pieces.reduce((a, c) => a + c.height, 0) + 2 * M, max = phone ? 50e6 : 100e6;
    if (W * H > max) { say(`The picture would be ${(W * H / 1e6).toFixed(0)} megapixels — more than ${phone ? 'a phone' : 'this page'} can make. Save the guide as PDF, or leave some pictures out.`); return; }
    if (prefs.fmt === 'jpeg' && H > 65_535) { say(`A JPEG holds at most 65,535 rows; this one would have ${H.toLocaleString('en')}. Choose PNG.`); return; }
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    let y = M;
    for (const c of pieces) { const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, c.height).data; data.set(d, y * W * 4); y += c.height; }
    const blob = await encodeImg({ data, width: W, height: H }, prefs.fmt, 90);
    if (!alive) return;
    deliver(blob, `${safeName(title)}.${prefs.fmt === 'png' ? 'png' : 'jpg'}`, `${W} × ${H}`);
  }

  // ---------------------------------------------------------------- a picture handed over (the Screenshot tab's "Annotate")
  const given = take<File>('annotate');
  if (given) void (async () => { try { const { loadImg } = await import('../lib/imgio'); await addPicture(await loadImg(given), given.name); picker.compact(); } catch (e) { toast(errMsg(e), 'err'); } })();

  setTool(prefs.tool);
  renderAll();
  return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); picker.dispose(); made.clear(); };
};
