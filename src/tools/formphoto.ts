// Photo & Signature Resizer: exact pixels + KB range for Indian exam/job portals. Photo: crop at the required
// aspect (auto-placed around the face with MediaPipe BlazeFace). Signature/thumb/declaration: optional paper clean-up
// (imgproc ink extraction onto white) and auto-trim. Resize (Lanczos) in imgproc.wasm; MozJPEG at the highest quality
// that fits the maximum; files below the minimum are padded with JPEG comments (metacore.wasm) — picture untouched.
import { h, card, field, input, button, segmented, toggle, stack, grid2, note, clear, actions, downloadBlob, shareOrDownload, fmtBytes, type Mount } from '../ui';
import { imgproc, type Img } from '../wasm/imgproc';
import { metacore } from '../wasm/metacore';
import { encodeToSize, encodeImg, previewOf, paint } from '../lib/imgio';
import { imageInput, cropBox } from '../lib/imgtools';
import { FORM_SPECS, KIND_LABEL, type Item, type Kind } from '../lib/form-specs';

/** Encode to JPEG within [minKB, maxKB]: best quality ≤ max, then pad up to min. Returns blob + details. */
export async function encodeInRange(img: Img, minKB: number, maxKB: number, dpi = 0) {
  const mc = await metacore();
  const r = await encodeToSize(img, 'jpeg', maxKB * 1024);
  let bytes = new Uint8Array(await r.blob.arrayBuffer());
  let padded = false;
  if (bytes.length < minKB * 1024) { bytes = mc.jpegPad(bytes, minKB * 1024 + 64) as Uint8Array<ArrayBuffer>; padded = true; }
  if (dpi) bytes = mc.jpegDpi(bytes, dpi) as Uint8Array<ArrayBuffer>;
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
  for (const [el, key] of [[wI, 'w'], [hI, 'h'], [minI, 'minKB'], [maxI, 'maxKB']] as const) el.addEventListener('input', () => { (custom as any)[key] = +el.value; if (key === 'w' || key === 'h') prepare(); });

  /** Preview + crop box at the target aspect; for photos the box is placed around the detected face. */
  const prepare = async () => {
    if (!src) return;
    let base = src;
    if (kind !== 'photo' && clean) base = await cleanPaper(previewOf(src, 1600));
    small = previewOf(base, ctx.isMobile ? 1000 : 1300);
    paint(small, canvas);
    const it = item();
    crop$.setEnabled(true); crop$.setAspect(it.w / it.h);
    if (kind === 'photo') {
      try {
        const { detectFaces } = await import('./redact');
        const f = (await detectFaces(small)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
        if (f) {
          // frame in pixels: head ≈ 1.45 × face-box height and fills ~62 % of the photo height; face centre at ~45 %
          const W = small.width, H = small.height, ar = it.w / it.h;
          let ch = (f.h * H * 1.45) / 0.62, cw = ch * ar;
          if (cw > W) { cw = W; ch = cw / ar; }
          if (ch > H) { ch = H; cw = ch * ar; }
          const cx = (f.x + f.w / 2) * W, cy = (f.y + f.h * 0.45) * H;
          crop$.setRect({ x: (cx - cw / 2) / W, y: (cy - ch * 0.45) / H, w: cw / W, h: ch / H });
        }
      } catch { /* face detection optional */ }
    }
  };

  const make = async (share: boolean) => {
    if (!src) throw new Error('Choose a photo or scan first.');
    const it = { ...item(), w: +wI.value, h: +hI.value, minKB: +minI.value, maxKB: +maxI.value };
    if (!(it.w >= 10 && it.h >= 10 && it.maxKB >= 1 && it.maxKB >= it.minKB)) throw new Error('Check the size and KB fields.');
    let img = src;
    if (kind !== 'photo' && clean) img = await cleanPaper(src);
    const r = crop$.rect(img.width, img.height);
    img = await imgproc('crop', img, r.x, r.y, r.w, r.h);
    img = await imgproc('resize', img, it.w, it.h);
    const out = await encodeInRange(img, it.minKB, it.maxKB, it.dpi || (kind === 'photo' ? 300 : 0));
    const kb = out.blob.size / 1024, ok = kb >= it.minKB && kb <= it.maxKB;
    const name = `${spec.id}-${kind}-${it.w}x${it.h}.jpg`;
    clear(result).append(card('Result',
      h('img', { src: URL.createObjectURL(out.blob), alt: 'result', class: 'form-result' }),
      h('ul', { class: 'checks' },
        h('li', { class: 'ok' }, `✓ ${it.w} × ${it.h} px JPG`),
        h('li', { class: ok ? 'ok' : 'bad' }, `${ok ? '✓' : '✗'} ${fmtBytes(out.blob.size)} (allowed ${it.minKB}–${it.maxKB} KB)${out.padded ? ' · padded to the minimum' : ''}${out.tooBig ? ' · could not get under the maximum — reduce pixels' : ''}`),
        h('li', null, `JPEG quality ${out.quality}${it.dpi ? ` · ${it.dpi} dpi` : ''} · no location/camera metadata`))));
    share ? await shareOrDownload(out.blob, name) : downloadBlob(out.blob, name);
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
  return () => input$.dispose();
};
