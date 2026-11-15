// Small shared helpers for image tools: input widget (pick/drop/paste/camera), flips, 90° rotations, crop.
import { h, filePicker, toast } from '../ui';
import type { Img } from '../wasm/imgproc';
import { loadImg } from './imgio';

/** File picker that also accepts pasted images (Ctrl+V). Calls onImage with the decoded image. */
export function imageInput(onImage: (img: Img, file: File) => void, opts: { label?: string; multiple?: boolean; capture?: 'user' | 'environment' } = {}) {
  const busy = h('div', { class: 'muted small' });
  const handle = async (files: File[]) => {
    for (const f of files) {
      busy.textContent = `Opening ${f.name}…`;
      try { onImage(await loadImg(f), f); } catch (e: any) { toast(`${f.name}: ${e.message}`, 'err'); }
    }
    busy.textContent = '';
  };
  const picker = filePicker({ accept: 'image/*,.heic,.heif', multiple: opts.multiple, capture: opts.capture, label: opts.label || 'Choose a photo', hint: 'or drop / paste (Ctrl+V) · JPG, PNG, WebP, HEIC…', onFiles: handle });
  const onPaste = (e: ClipboardEvent) => {
    const fs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (fs.length) { e.preventDefault(); handle(opts.multiple ? fs : fs.slice(0, 1)); }
  };
  addEventListener('paste', onPaste);
  return { el: h('div', { class: 'stack' }, picker, busy), dispose: () => removeEventListener('paste', onPaste) };
}

export function flipH(img: Img): Img {
  const { width: w, height: hh } = img, src = new Uint32Array(img.data.buffer, img.data.byteOffset, w * hh), out = new Uint32Array(w * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) out[y * w + x] = src[y * w + (w - 1 - x)];
  return { data: new Uint8ClampedArray(out.buffer), width: w, height: hh };
}
export function flipV(img: Img): Img {
  const { width: w, height: hh } = img, src = new Uint32Array(img.data.buffer, img.data.byteOffset, w * hh), out = new Uint32Array(w * hh);
  for (let y = 0; y < hh; y++) out.set(src.subarray((hh - 1 - y) * w, (hh - y) * w), y * w);
  return { data: new Uint8ClampedArray(out.buffer), width: w, height: hh };
}
/** Exact 90° rotation (k quarter turns clockwise). */
export function rot90(img: Img, k: number): Img {
  k = ((k % 4) + 4) % 4;
  if (!k) return img;
  const { width: w, height: hh } = img, src = new Uint32Array(img.data.buffer, img.data.byteOffset, w * hh);
  const W = k % 2 ? hh : w, H = k % 2 ? w : hh, out = new Uint32Array(W * H);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const v = src[y * w + x];
    if (k === 1) out[x * W + (hh - 1 - y)] = v; else if (k === 2) out[(hh - 1 - y) * W + (w - 1 - x)] = v; else out[(w - 1 - x) * W + y] = v;
  }
  return { data: new Uint8ClampedArray(out.buffer), width: W, height: H };
}
export function crop(img: Img, x: number, y: number, w: number, hh: number): Img {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.max(1, Math.min(img.width - x, Math.round(w))); hh = Math.max(1, Math.min(img.height - y, Math.round(hh)));
  const out = new Uint8ClampedArray(w * hh * 4);
  for (let r = 0; r < hh; r++) out.set(img.data.subarray(((y + r) * img.width + x) * 4, ((y + r) * img.width + x + w) * 4), r * w * 4);
  return { data: out, width: w, height: hh };
}

/** Interactive crop box over a canvas. Returns crop rect in canvas pixel units. aspect = w/h or 0 for free. */
export function cropBox(canvas: HTMLCanvasElement, onChange?: () => void) {
  const box = h('div', { class: 'crop-box' }, ...['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map((d) => h('span', { class: `crop-h crop-${d}`, 'data-d': d })));
  const wrap = h('div', { class: 'crop-wrap' }, canvas, box);
  let r = { x: 0, y: 0, w: 1, h: 1 }; // normalised 0..1
  let aspect = 0, enabled = false;
  const apply = () => { Object.assign(box.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }); box.hidden = !enabled; };
  const fitAspect = () => {
    if (!aspect) return;
    const ca = canvas.width / canvas.height, want = aspect / ca; // in normalised units w/h
    let w = r.w, hh = w / want; if (hh > 1) { hh = 1; w = hh * want; }
    if (w > 1) { w = 1; hh = w / want; }
    r = { x: Math.min(r.x, 1 - w), y: Math.min(r.y, 1 - hh), w, h: hh };
  };
  let drag: { d: string; sx: number; sy: number; r0: typeof r } | null = null;
  box.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    drag = { d: t.dataset.d || 'move', sx: e.clientX, sy: e.clientY, r0: { ...r } };
    box.setPointerCapture(e.pointerId); e.preventDefault();
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect(), dx = (e.clientX - drag.sx) / rect.width, dy = (e.clientY - drag.sy) / rect.height, a = drag.r0;
    let { x, y, w, h: hh } = a;
    if (drag.d === 'move') { x = Math.min(1 - w, Math.max(0, a.x + dx)); y = Math.min(1 - hh, Math.max(0, a.y + dy)); }
    else {
      if (drag.d.includes('w')) { x = Math.min(a.x + a.w - 0.03, Math.max(0, a.x + dx)); w = a.w + (a.x - x); }
      if (drag.d.includes('e')) w = Math.max(0.03, Math.min(1 - a.x, a.w + dx));
      if (drag.d.includes('n')) { y = Math.min(a.y + a.h - 0.03, Math.max(0, a.y + dy)); hh = a.h + (a.y - y); }
      if (drag.d.includes('s')) hh = Math.max(0.03, Math.min(1 - a.y, a.h + dy));
      if (aspect) { const want = aspect / (canvas.width / canvas.height); if (/[ns]/.test(drag.d) && !/[ew]/.test(drag.d)) w = hh * want; else hh = w / want; if (x + w > 1) w = 1 - x, hh = w / want; if (y + hh > 1) hh = 1 - y, w = hh * want; }
    }
    r = { x, y, w, h: hh }; apply(); onChange?.();
  });
  box.addEventListener('pointerup', () => { drag = null; });
  apply();
  return {
    el: wrap,
    setEnabled(v: boolean) { enabled = v; if (v && r.w === 1 && r.h === 1) { r = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }; fitAspect(); } apply(); },
    setAspect(a: number) { aspect = a; fitAspect(); apply(); onChange?.(); },
    reset() { r = { x: 0, y: 0, w: 1, h: 1 }; enabled = false; apply(); },
    /** crop rect in source pixels for an image of size W×H */
    rect(W: number, H: number) { return { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H }; },
    get active() { return enabled && (r.w < 0.999 || r.h < 0.999); },
  };
}
