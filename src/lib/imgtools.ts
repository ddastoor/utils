// Small shared helpers for image tools: input widget (pick/drop/paste/camera), flips, 90° rotations, crop.
import { h, filePicker, toast, button, downloadBlob, shareOrDownload, fmtBytes } from '../ui';
import { zipFiles } from './zip';
import type { Img } from '../wasm/imgproc';
import { loadImg } from './imgio';

/** File picker that also accepts pasted images (Ctrl+V). Calls onImage with the decoded image. */
export function imageInput(onImage: (img: Img, file: File) => void, opts: { label?: string; multiple?: boolean; capture?: 'user' | 'environment' } = {}) {
  const busy = h('div', { class: 'muted small' });
  const handle = async (files: File[]) => {
    for (const f of files) {
      busy.textContent = `Opening ${f.name}…`;
      try {
        onImage(await loadImg(f), f);
        // once a photo is open, shrink the big drop zone so the photo sits higher on phones
        picker.classList.add('drop-compact');
        const strong = picker.querySelector('strong'); if (strong) strong.textContent = opts.multiple ? 'Add more photos' : 'Choose another photo';
      } catch (e: any) { toast(`${f.name}: ${e.message}`, 'err'); }
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

/** A list of produced files (thumbnail, name, size, per-file download/share) + "Download all (.zip)". */
export function resultList(opts: { zipName: () => string; isMobile?: boolean }) {
  const items: Array<{ name: string; blob: Blob; url: string }> = [];
  const listEl = h('div', { class: 'result-list' });
  const allBtn = h('div', { class: 'row' });
  const el = h('div', { class: 'stack' }, listEl, allBtn);
  const renderAll = () => {
    allBtn.replaceChildren(...(items.length > 1 ? [button(`Download all (${items.length}) as .zip`, async () => downloadBlob(await zipFiles(items), opts.zipName()), { icon: 'FolderArchive', variant: 'primary' })] : []));
  };
  return {
    el,
    add(name: string, blob: Blob, note = '') {
      const url = URL.createObjectURL(blob);
      items.push({ name, blob, url });
      listEl.append(h('div', { class: 'result-row' },
        blob.type.startsWith('image/') ? h('img', { src: url, alt: '', class: 'result-thumb', loading: 'lazy' }) : null,
        h('div', { class: 'result-meta' }, h('div', { class: 'file-name' }, name), h('div', { class: 'muted small' }, `${fmtBytes(blob.size)}${note ? ' · ' + note : ''}`)),
        button('', () => (opts.isMobile ? shareOrDownload(blob, name) : downloadBlob(blob, name)), { icon: opts.isMobile ? 'Share2' : 'Download', small: true, title: `Save ${name}` })));
      renderAll();
    },
    clear() { for (const i of items) URL.revokeObjectURL(i.url); items.length = 0; listEl.replaceChildren(); allBtn.replaceChildren(); },
    get items() { return items; },
  };
}

/** Pixel dimensions without a full decode where the browser can (falls back to decoding). */
export async function imageInfoOf(file: Blob): Promise<{ width: number; height: number } | null> {
  try { const b = await createImageBitmap(file, { imageOrientation: 'from-image' } as any); const r = { width: b.width, height: b.height }; b.close(); return r; }
  catch { try { const i = await loadImg(file); return { width: i.width, height: i.height }; } catch { return null; } }
}
