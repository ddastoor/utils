// Small shared helpers for image tools: input widget (pick/drop/paste/camera), flips, 90° rotations, crop.
import { h, filePicker, toast, button, downloadBlob, shareOrDownload, fmtBytes } from '../ui';
import { zipFiles } from './zip';
import type { Img } from '../wasm/imgproc';
import { loadImg } from './imgio';

/** File picker that also accepts pasted images (Ctrl+V). Calls onImage with the decoded image. */
export function imageInput(onImage: (img: Img, file: File) => void | Promise<void>, opts: { label?: string; multiple?: boolean; capture?: 'user' | 'environment' } = {}) {
  const busy = h('div', { class: 'muted small' });
  const handle = async (files: File[]) => {
    for (const f of files) {
      busy.textContent = `Opening ${f.name}…`;
      try {
        await onImage(await loadImg(f), f);
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
    /** Place the box (normalised 0..1) — clamped to the image. */
    setRect(n: { x: number; y: number; w: number; h: number }) { enabled = true; const w = Math.min(1, n.w), hh = Math.min(1, n.h); r = { x: Math.max(0, Math.min(1 - w, n.x)), y: Math.max(0, Math.min(1 - hh, n.y)), w, h: hh }; apply(); onChange?.(); },
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
    add(name0: string, blob: Blob, note = '') {
      // the same name twice (two IMG_0001.jpg from two folders, a pattern without {n}) would overwrite in the zip
      let name = name0;
      const taken = (n: string) => items.some((i) => i.name.toLowerCase() === n.toLowerCase());
      if (taken(name)) { const m = /^(.*?)(\.[^.]{1,10})?$/.exec(name0)!; for (let k = 2; taken(name); k++) name = `${m[1]} (${k})${m[2] ?? ''}`; }
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

/** Four draggable corner handles (TL, TR, BR, BL; normalised 0..1) over a canvas, with an outline. */
export function quadEditor(canvas: HTMLCanvasElement, onChange?: (q: number[]) => void) {
  let q = [0, 0, 1, 0, 1, 1, 0, 1];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'quad-svg'); svg.setAttribute('viewBox', '0 0 1000 1000'); svg.setAttribute('preserveAspectRatio', 'none');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('class', 'quad-poly'); svg.append(poly);
  const names = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];
  const handles = names.map((n, i) => h('span', { class: 'quad-h', role: 'slider', 'aria-label': `${n} corner`, tabindex: '0', 'data-i': String(i) }));
  const wrap = h('div', { class: 'crop-wrap quad-wrap' }, canvas, svg, ...handles);
  const apply = () => {
    poly.setAttribute('points', [0, 1, 2, 3].map((i) => `${q[i * 2] * 1000},${q[i * 2 + 1] * 1000}`).join(' '));
    handles.forEach((hd, i) => Object.assign(hd.style, { left: `${q[i * 2] * 100}%`, top: `${q[i * 2 + 1] * 100}%` }));
  };
  let drag = -1;
  for (const hd of handles) {
    hd.addEventListener('pointerdown', (e) => { drag = +hd.dataset.i!; hd.setPointerCapture(e.pointerId); e.preventDefault(); });
    hd.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const r = canvas.getBoundingClientRect();
      q[drag * 2] = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); q[drag * 2 + 1] = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      apply(); onChange?.(q.slice());
    });
    hd.addEventListener('pointerup', () => { drag = -1; });
    hd.addEventListener('keydown', (e) => {
      const i = +hd.dataset.i!, d = e.shiftKey ? 0.02 : 0.005, k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (!k) return;
      e.preventDefault(); q[i * 2] = Math.min(1, Math.max(0, q[i * 2] + k[0])); q[i * 2 + 1] = Math.min(1, Math.max(0, q[i * 2 + 1] + k[1])); apply(); onChange?.(q.slice());
    });
  }
  apply();
  return { el: wrap, get quad() { return q.slice(); }, set quad(v: number[]) { q = v.slice(); apply(); } };
}
