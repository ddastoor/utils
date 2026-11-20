// Background Remover: MediaPipe person segmentation + guided-filter matting (imgproc.wasm) → transparent PNG, a solid
// colour, a blurred background, or another photo behind the person. Everything runs on the device.
import { h, card, field, input, segmented, slider, stack, note, actions, button, downloadBlob, shareOrDownload, fmtBytes, baseName, toast, errMsg, type Mount } from '../ui';
import { imgproc, imgprocDirect, type Img } from '../wasm/imgproc';
import { encodeImg, loadImg, previewOf, paint, resizeImg } from '../lib/imgio';
import { imageInput, imagePicker } from '../lib/imgtools';
import { personMask, type PersonMask } from '../lib/segment';
import { coverCrop } from './canvas-tools';

type Mode = 'transparent' | 'colour' | 'blur' | 'photo';
const SWATCHES: Array<[string, string]> = [['#ffffff', 'White'], ['#f2f2f2', 'Light grey'], ['#1e88e5', 'Blue'], ['#e53935', 'Red'], ['#000000', 'Black']];
const hexRgb = (hex: string) => parseInt(hex.slice(1), 16);
/** Share of the picture the person mask holds (0 … 1): below MIN_PERSON nobody was found and the cut-out would be empty. */
export function personShare(pm: PersonMask) { let n = 0; for (const v of pm.mask) if (v >= 128) n++; return n / Math.max(1, pm.mask.length); }
export const MIN_PERSON = 0.003;
let modelLoaded = false; // for the status line: only the first run in a visit fetches the 16 MB model

/** Final image for a mode (works on any size; alpha computed for that size). */
export async function applyBackground(img: Img, pm: PersonMask, mode: Mode, o: { colour: string; blur: number; edge: number; bg: Img | null }, direct = false): Promise<Img> {
  const ip = direct ? await imgprocDirect() : null;
  const r = Math.max(2, Math.round((o.edge * Math.max(img.width, img.height)) / 1000));
  const alpha: Uint8Array = ip ? ip.guidedAlpha(img, pm.mask, pm.w, pm.h, r, 1e-4) : await imgproc('guidedAlpha', img, pm.mask, pm.w, pm.h, r, 1e-4);
  if (mode === 'transparent') return ip ? ip.composite(img, alpha, 0, 0, true) : imgproc('composite', img, alpha, 0, 0, true);
  if (mode === 'colour') return ip ? ip.composite(img, alpha, hexRgb(o.colour), 0, false) : imgproc('composite', img, alpha, hexRgb(o.colour), 0, false);
  if (mode === 'blur') { const sg = (o.blur * Math.max(img.width, img.height)) / 600; return ip ? ip.composite(img, alpha, 0, sg, false) : imgproc('composite', img, alpha, 0, sg, false); }
  if (!o.bg) throw new Error('Choose a background photo.');
  const [sx, sy, sw, sh] = coverCrop(o.bg.width, o.bg.height, img.width, img.height);
  // the preview resizes in imgproc (instant); the saved picture with Squoosh's Lanczos-3 in linear light (jSquash)
  const bg = ip ? ip.resize(ip.crop(o.bg, sx, sy, sw, sh), img.width, img.height) : await resizeImg(await imgproc('crop', o.bg, sx, sy, sw, sh), img.width, img.height);
  return ip ? ip.compositeImg(img, alpha, bg) : imgproc('compositeImg', img, alpha, bg);
}

export const mount: Mount = (root, ctx) => {
  let orig: Img | null = null, small: Img | null = null, pm: PersonMask | null = null, name = 'photo';
  let why = '', info = '', photoSeq = 0, bgSeq = 0; // why: the reason there is nothing to save (no person, a failure)
  let mode: Mode = 'transparent';
  const o = { colour: '#ffffff', blur: 6, edge: 6, bg: null as Img | null };
  const canvas = h('canvas', { class: 'ed-canvas' });
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const editor = h('div', { class: 'stack', hidden: true });
  let tok = 0;
  const render = async () => {
    if (!small || !pm) return;
    const my = ++tok;
    try { const out = await applyBackground(small, pm, mode, o, true); if (my === tok) { paint(out, canvas); status.textContent = info; } }
    catch (e) { if (my === tok) { paint(small, canvas); status.textContent = errMsg(e); } }
  };
  const swatches = SWATCHES.map(([c, n]) => h('button', { type: 'button', class: 'bg-swatch', title: n, 'aria-label': n, 'aria-pressed': String(c === o.colour), style: { background: c }, onclick: () => setColour(c) }));
  const colourRow = h('div', { class: 'row' }, ...swatches);
  const setColour = (c: string) => { o.colour = c; colourIn.value = c; swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(SWATCHES[i][0] === c))); render(); };
  const colourIn = input({ type: 'color', value: o.colour, onInput: (v) => setColour(v) });
  const colourBox = stack(colourRow, field('Custom colour', colourIn)); colourBox.hidden = true;
  const blurBox = slider({ label: 'Background blur', min: 1, max: 20, value: o.blur, onChange: (v) => { o.blur = v; render(); } }); blurBox.hidden = true;
  const photoBox = imagePicker({ accept: 'image/*,.heic,.heif', compact: true, label: 'Choose a background photo', onFiles: async (f) => {
    const my = ++bgSeq; // the newest background photo wins
    try { const bg = previewOf(await loadImg(f[0]), 4000); if (my === bgSeq) { o.bg = bg; render(); } } catch (e) { toast(`${f[0].name}: ${errMsg(e)}`, 'err'); }
  } }); photoBox.hidden = true;
  const input$ = imageInput(async (img, f) => {
    const my = ++photoSeq; // a photo chosen while another is still being read wins
    ++tok; orig = img; name = baseName(f.name); small = previewOf(img, ctx.isMobile ? 900 : 1200); editor.hidden = false; pm = null; why = 'The person is still being found — a moment.';
    paint(small, canvas); status.textContent = info = `Finding the person…${modelLoaded ? '' : ' (the first photo loads a 16 MB model)'}`;
    try {
      const t0 = performance.now(), m = await personMask(img);
      modelLoaded = true;
      if (my !== photoSeq) return;
      const share = personShare(m);
      if (share < MIN_PERSON) {
        why = 'No person was found in this photo — there is nothing to keep. This tab finds people (portraits, selfies, group photos); it does not cut out objects or animals.';
        status.textContent = info = why;
        return;
      }
      pm = m; why = '';
      status.textContent = info = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s · ${img.width}×${img.height} · the person fills ${Math.max(1, Math.round(share * 100))} % of it`;
      render();
    } catch (e) {
      if (my !== photoSeq) return;
      why = `The person could not be found: ${errMsg(e)}`; status.textContent = info = why;
    }
  });
  const save = async (share: boolean) => {
    if (!orig) throw new Error('Choose a photo first.');
    if (!pm) throw new Error(why || 'Choose a photo first.');
    status.textContent = 'Making the full-size image…';
    const out = await applyBackground(orig, pm, mode, o);
    const png = mode === 'transparent';
    const blob = await encodeImg(out, png ? 'png' : 'jpeg', 90), fname = `${name}-${png ? 'cutout.png' : 'background.jpg'}`;
    status.textContent = `${info} · saved ${fmtBytes(blob.size)}, ${out.width}×${out.height}`;
    share ? await shareOrDownload(blob, fname) : downloadBlob(blob, fname);
  };
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, canvas), status),
    card('New background', stack(
      segmented([['transparent', 'Transparent'], ['colour', 'Colour'], ['blur', 'Blur'], ['photo', 'Photo']], mode, (v) => { mode = v; colourBox.hidden = v !== 'colour'; blurBox.hidden = v !== 'blur'; photoBox.hidden = v !== 'photo'; render(); }),
      colourBox, blurBox, photoBox,
      slider({ label: 'Edge softness', min: 2, max: 16, value: o.edge, onChange: (v) => { o.edge = v; render(); } }),
      note('Works best on photos of people (portraits, selfies, group photos). Transparent saves a PNG; the others save a JPG.'))),
    actions(button('Save', () => save(false), { variant: 'primary', icon: 'Download' }), ctx.isMobile ? button('Share', () => save(true), { icon: 'Share2' }) : null),
  );
  root.append(card(null, input$.el), editor);
  return () => input$.dispose();
};
