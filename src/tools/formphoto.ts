// Photo & Signature Resizer: exact pixels + KB range for Indian exam/job portals. Photo: crop at the required
// aspect (auto-placed around the face with MediaPipe BlazeFace). Signature/thumb/declaration: optional paper clean-up
// (imgproc ink extraction onto white) and auto-trim. Resize: Squoosh's Lanczos-3 in linear light (jSquash); MozJPEG at the highest quality
// that fits the maximum; files below the minimum are padded with JPEG comments (metacore.wasm) — picture untouched.
import { h, card, field, input, button, segmented, toggle, stack, grid2, note, clear, actions, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { metacore } from '../wasm/metacore';
import { encodeToSize, encodeImg, previewOf, paint, resizeImg } from '../lib/imgio';
import { imageInput, cropBox } from '../lib/imgtools';
import { FORM_SPECS, KIND_LABEL, kbRange, type Item, type Kind } from '../lib/form-specs';

/** Encode to JPEG within [minKB, maxKB]: best quality ≤ max, then pad up to min. Returns blob + details. */
export async function encodeInRange(img: Img, minKB: number, maxKB: number, dpi = 0) {
  const mc = await metacore();
  const lim = kbRange(minKB, maxKB);
  const enc = async (target: number) => {
    const r = await encodeToSize(img, 'jpeg', target);
    const raw = new Uint8Array(await r.blob.arrayBuffer());
    return { r, bytes: (dpi ? mc.jpegDpi(raw, dpi) : raw) as Uint8Array<ArrayBuffer> };
  };
  // the dpi goes in before the size is judged and before padding (padding first would put the comments ahead of the
  // JFIF header, and the dpi would then add a second header behind the padded size)
  let { r, bytes } = await enc(lim.max);
  if (bytes.length > lim.max && !r.tooBig) ({ r, bytes } = await enc(lim.max - (bytes.length - r.blob.size)));
  let padded = false;
  if (bytes.length < lim.min) { bytes = mc.jpegPad(bytes, Math.min(lim.max, lim.min + 64)) as Uint8Array<ArrayBuffer>; padded = true; }
  return { blob: new Blob([bytes as BlobPart], { type: 'image/jpeg' }), quality: r.quality, padded, tooBig: !!r.tooBig };
}

/** Clean a photographed signature/thumb/declaration: ink onto pure white (keeps ink colour). */
async function cleanPaper(img: Img): Promise<Img> {
  const ink = await imgproc('inkToAlpha', img, 0, true, 1);
  const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  const t = new OffscreenCanvas(img.width, img.height); t.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(ink.data), ink.width, ink.height), 0, 0);
  g.drawImage(t, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height };
}

export const mount: Mount = (root, ctx) => {
  let spec = FORM_SPECS[0], kind: Kind = 'photo', clean = true, src: Img | null = null, small: Img | null = null;
  const item = (): Item => ({ ...(spec.items.find((i) => i.kind === kind) || spec.items[0]), ...custom });
  let custom: Partial<Item> = {};
  let face: { x: number; y: number; w: number; h: number } | null = null, seq = 0, url = '';
  const wI = input({ type: 'number', min: 10 }), hI = input({ type: 'number', min: 10 }), minI = input({ type: 'number', min: 0 }), maxI = input({ type: 'number', min: 1 });
  const specNote = h('div');
  const kindRow = h('div');
  const canvas = h('canvas', { class: 'ed-canvas' });
  const crop$ = cropBox(canvas);
  const editor = h('div', { class: 'stack', hidden: true });
  const result = h('div', { class: 'stack' });
  const cleanToggle = toggle('Clean the paper background (pure white)', true, (v) => { clean = v; prepare(); });

  const syncFields = () => {
    const it = item();
    wI.value = String(it.w); hI.value = String(it.h); minI.value = String(it.minKB); maxI.value = String(it.maxKB);
    clear(specNote).append(note(h('span', null, h('strong', null, `${KIND_LABEL[it.kind]}: ${it.w} × ${it.h} px, ${it.minKB}–${it.maxKB} KB, JPG. `), it.note || '', spec.note ? h('br') : null, spec.note || '', h('br'), 'Always confirm with the current official notification — portals change these rules.')));
    clear(kindRow).append(segmented(spec.items.map((i) => [i.kind, KIND_LABEL[i.kind]]) as Array<[Kind, string]>, kind, (v) => { kind = v; custom = {}; syncFields(); prepare(); }));
    cleanToggle.hidden = kind === 'photo';
  };
  const sideOk = (v: string) => /^\s*\d+\s*$/.test(v) && +v >= 10 && +v <= 5000;
  for (const [el, key] of [[wI, 'w'], [hI, 'h'], [minI, 'minKB'], [maxI, 'maxKB']] as const) el.addEventListener('input', () => { (custom as any)[key] = +el.value; if (key === 'w' || key === 'h') frame(); });

  /** The crop box at the aspect of the width and height boxes (while both hold a valid size); for photos placed around
   *  the face found in the picture. A change of the size only re-frames — the face is not looked for again. */
  const frame = () => {
    if (!small || !sideOk(wI.value) || !sideOk(hI.value)) return;
    const ar = +wI.value / +hI.value;
    crop$.setEnabled(true); crop$.setAspect(ar);
    if (kind !== 'photo' || !face) return;
    // frame in pixels: head ≈ 1.45 × face-box height and fills ~62 % of the photo height; face centre at ~45 %
    const W = small.width, H = small.height, f = face;
    let ch = (f.h * H * 1.45) / 0.62, cw = ch * ar;
    if (cw > W) { cw = W; ch = cw / ar; }
    if (ch > H) { ch = H; cw = ch * ar; }
    const cx = (f.x + f.w / 2) * W, cy = (f.y + f.h * 0.45) * H;
    crop$.setRect({ x: (cx - cw / 2) / W, y: (cy - ch * 0.45) / H, w: cw / W, h: ch / H });
  };
  /** Preview + crop box; for photos the face is looked for first. The newest call wins (a new photo or kind while
   *  an older one is still being cleaned or searched leaves the older result unused). */
  const prepare = async () => {
    if (!src) return;
    const my = ++seq, from = src, k = kind;
    let base = from;
    if (k !== 'photo' && clean) base = await cleanPaper(previewOf(from, 1600));
    if (my !== seq) return;
    const sm = previewOf(base, ctx.isMobile ? 1000 : 1300);
    let f: typeof face = null;
    if (k === 'photo') {
      try {
        const { detectFaces } = await import('./redact');
        f = (await detectFaces(sm)).sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
      } catch { /* face detection optional */ }
      if (my !== seq) return;
    }
    small = sm; face = f;
    paint(small, canvas);
    crop$.reset();
    frame();
  };

  const make = async (share: boolean) => {
    if (!src) throw new Error('Choose a photo or scan first.');
    const it = { ...item(), w: +wI.value, h: +hI.value, minKB: +minI.value, maxKB: +maxI.value };
    for (const [v, label] of [[wI.value, 'width'], [hI.value, 'height']] as const)
      if (!sideOk(v)) throw new Error(`The ${label} is a whole number of pixels from 10 to 5,000.`);
    if (!(minI.value.trim() && it.minKB >= 0)) throw new Error('The minimum is a size in KB (0 for none).');
    if (!(maxI.value.trim() && it.maxKB >= 1)) throw new Error('The maximum is a size in KB, at least 1.');
    if (it.minKB > it.maxKB) throw new Error('The minimum KB is above the maximum.');
    let img = src;
    if (kind !== 'photo' && clean) img = await cleanPaper(src);
    const r = crop$.rect(img.width, img.height);
    img = await imgproc('crop', img, r.x, r.y, r.w, r.h);
    img = await resizeImg(img, it.w, it.h); // Lanczos-3 in linear light (jSquash)
    const out = await encodeInRange(img, it.minKB, it.maxKB, it.dpi || (kind === 'photo' ? 300 : 0));
    const lim = kbRange(it.minKB, it.maxKB), ok = out.blob.size >= lim.min && out.blob.size <= lim.max;
    const name = `${spec.id}-${kind}-${it.w}x${it.h}.jpg`;
    const give = () => (share ? shareOrDownload(out.blob, name) : downloadBlob(out.blob, name));
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(out.blob);
    clear(result).append(card('Result',
      h('img', { src: url, alt: `The ${KIND_LABEL[kind].toLowerCase()} as it will be uploaded`, class: 'form-result' }),
      h('ul', { class: 'checks' },
        h('li', { class: 'ok' }, `✓ ${it.w} × ${it.h} px JPG`),
        h('li', { class: ok ? 'ok' : 'bad' }, `${ok ? '✓' : '✗'} ${out.blob.size.toLocaleString('en-IN')} bytes (allowed ${it.minKB}–${it.maxKB} KB: ${lim.min.toLocaleString('en-IN')} – ${lim.max.toLocaleString('en-IN')} bytes, so that either way of counting a KB passes)${out.padded ? ' · padded to the minimum' : ''}`),
        h('li', null, `JPEG quality ${out.quality}${it.dpi ? ` · ${it.dpi} dpi` : ''} · no location/camera metadata`)),
      ok ? null : note(h('span', null, `It does not fit under ${it.maxKB} KB even at the lowest quality — make the width and height smaller (or choose less of the picture), then make it again. `, button('Download anyway', give, { small: true })), 'err')));
    if (ok) await give(); // a file the portal would refuse is not downloaded without asking
  };

  const input$ = imageInput(async (img) => { src = img; editor.hidden = false; await prepare(); }, { label: 'Choose a photo or scan' });
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, crop$.el), note('Drag the frame to choose what goes in. Photos are framed around your face automatically.')),
    actions(button(ctx.isMobile ? 'Make JPG' : 'Make & download', () => make(false), { variant: 'primary', icon: 'Download', title: 'Make the JPG and download it' }), ctx.isMobile ? button('Share', () => make(true), { icon: 'Share2' }) : null),
    result,
  );
  root.append(
    card('Form', stack(
      field('Exam / portal', h('select', { class: 'input', onchange: (e: Event) => { spec = FORM_SPECS.find((s) => s.id === (e.target as HTMLSelectElement).value)!; kind = spec.items[0].kind; custom = {}; syncFields(); prepare(); } },
        ...FORM_SPECS.map((s) => h('option', { value: s.id }, s.name)))),
      kindRow, specNote,
      grid2(field('Width (px)', wI), field('Height (px)', hI)), grid2(field('Minimum KB', minI), field('Maximum KB', maxI)),
      cleanToggle)),
    card(null, input$.el),
    editor,
  );
  syncFields();
  void encodeImg;
  return () => { input$.dispose(); if (url) URL.revokeObjectURL(url); };
};
