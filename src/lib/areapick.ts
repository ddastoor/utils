// Choosing an area of a screenshot already taken (Screenshot tab, to-do #24 — owner, 26 Nov 2026: "add the ability for the
// user to draw a rectangular area with his mouse also as an option to take the screenshot"). A page cannot draw over the
// desktop, so the screen is frozen first, as Windows' Snipping Tool does: the frame is shown over the whole window — full
// screen where the browser allows it (a click not used up by Chrome's picker), at the screen's own pixels when the frame
// is the screen — dimmed; the mouse (or a finger, or the arrow keys) draws a rectangle, its size in pixels beside it;
// corners and edges move it, a drag inside moves it, a drag outside starts anew; Enter or a double-click takes it, Esc
// cancels. Geometry: src/lib/areageom.ts.
import { h, button } from '../ui';
import type { Img } from '../wasm/imgproc';
import { type Rect, type Layout, layoutOf, toFrame, rectFrom, moved, resized, sized, hitOf, cursorOf, clamp } from './areageom';

export type Picked = Rect | 'whole' | null;
export interface AreaPicker { done: Promise<Picked>; close(): void }

/** Shows `img` for an area to be chosen; `done` gives the rectangle (frame pixels), 'whole' for the whole picture, or null
 *  when cancelled. `full`: try full screen at once (only when the page still has the click that started it). */
export function pickArea(img: Img, o: { full?: boolean; what?: string } = {}): AreaPicker {
  const W = img.width, H = img.height;
  let sel: Rect | null = null, bmp: ImageBitmap | null = null, L: Layout = { s: 1, ox: 0, oy: 0 }, frame = 0, finished = false;
  let drag: { kind: 'new'; ax: number; ay: number } | { kind: 'move' | 'edge'; edges: string; fx: number; fy: number; start: Rect } | null = null;
  let resolve!: (p: Picked) => void;
  const done = new Promise<Picked>((r) => (resolve = r));

  const canvas = h('canvas', { class: 'area-canvas', tabindex: '0', role: 'application', 'aria-roledescription': 'area chooser',
    'aria-label': `The screenshot, frozen (${W} × ${H}). Drag a rectangle; the arrow keys move it, Ctrl with an arrow key changes its size, Shift takes steps of 10 pixels.`,
    'aria-describedby': 'area-say' }) as HTMLCanvasElement;
  const say = h('span', { class: 'area-say', id: 'area-say', 'aria-live': 'polite' }, 'Drag a rectangle on the screenshot.');
  const takeBtn = button('Take this area', () => finish(sel), { icon: 'Crop', variant: 'primary', title: 'Enter — or a double-click on the area', disabled: true });
  const wholeBtn = button('Whole picture', () => finish('whole'), { icon: 'Image', title: `Take all of it (${W} × ${H})` });
  const fsBtn = button('Full screen', () => { toggleFull(); }, { icon: 'Maximize', title: 'Show the screenshot over the whole screen, at its own pixels' });
  fsBtn.hidden = !document.fullscreenEnabled;
  const cancelBtn = button('Cancel', () => finish(null), { icon: 'X', variant: 'ghost', title: 'Esc' });
  const bar = h('div', { class: 'area-bar', role: 'toolbar', 'aria-label': 'The area' }, say, h('div', { class: 'area-btns' }, takeBtn, wholeBtn, fsBtn, cancelBtn));
  const box = h('div', { class: 'area-pick', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Choose an area of the ${o.what || 'screenshot'}` }, canvas, bar);

  // the rest of the page cannot be reached while the area is chosen
  const others = [...document.body.children].filter((e) => !(e as HTMLElement).inert) as HTMLElement[];
  others.forEach((e) => (e.inert = true));
  document.body.append(box);
  const ro = new ResizeObserver(() => layout());
  ro.observe(canvas);
  createImageBitmap(new ImageData(new Uint8ClampedArray(img.data.buffer as ArrayBuffer, img.data.byteOffset, img.data.length), W, H))
    .then((b) => { if (finished) b.close(); else { bmp = b; draw(); } })
    .catch(() => finish(null));
  canvas.focus();
  if (o.full && document.fullscreenEnabled) toggleFull();

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    L = layoutOf(W, H, cw, ch);
    draw();
  }
  const draw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); };
  /** the selection on the canvas (device pixels) */
  const drawn = (r: Rect) => [L.ox + r.x * L.s, L.oy + r.y * L.s, L.ox + (r.x + r.w) * L.s, L.oy + (r.y + r.h) * L.s];
  function paint() {
    const g = canvas.getContext('2d')!, dpr = window.devicePixelRatio || 1, dw = W * L.s, dh = H * L.s;
    g.fillStyle = '#0b0b0f'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.imageSmoothingEnabled = L.s !== 1; g.imageSmoothingQuality = 'high';
    if (bmp) g.drawImage(bmp, L.ox, L.oy, dw, dh);
    const has = sel && sel.w > 0 && sel.h > 0;
    // everything but the area dimmed
    g.fillStyle = 'rgb(0 0 0 / 52%)';
    g.beginPath(); g.rect(L.ox, L.oy, dw, dh);
    if (has) { const [x0, y0, x1, y1] = drawn(sel!); g.rect(x0, y0, x1 - x0, y1 - y0); }
    g.fill('evenodd');
    if (!has) return;
    const [x0, y0, x1, y1] = drawn(sel!), lw = Math.max(1, Math.round(dpr));
    // the border just outside the area, so it covers none of the pixels taken
    g.lineWidth = lw; g.strokeStyle = '#fff'; g.setLineDash([]);
    g.strokeRect(x0 - lw / 2, y0 - lw / 2, x1 - x0 + lw, y1 - y0 + lw);
    g.strokeStyle = 'rgb(79 70 229 / 90%)'; g.setLineDash([4 * lw, 4 * lw]);
    g.strokeRect(x0 - lw * 1.5, y0 - lw * 1.5, x1 - x0 + lw * 3, y1 - y0 + lw * 3);
    g.setLineDash([]);
    // handles: the corners, and the middle of each side long enough to hold one
    const hs = 8 * dpr, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, pts: [number, number][] = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    if (x1 - x0 > hs * 3) pts.push([mx, y0], [mx, y1]);
    if (y1 - y0 > hs * 3) pts.push([x0, my], [x1, my]);
    g.fillStyle = '#fff'; g.strokeStyle = '#4f46e5'; g.lineWidth = Math.max(1, 1.5 * dpr);
    for (const [x, y] of pts) { g.fillRect(x - hs / 2, y - hs / 2, hs, hs); g.strokeRect(x - hs / 2, y - hs / 2, hs, hs); }
    // its size in pixels, above its top left corner (inside when there is no room above)
    const text = `${sel!.w} × ${sel!.h}`;
    g.font = `600 ${Math.round(12.5 * dpr)}px system-ui, sans-serif`; g.textBaseline = 'middle';
    const tw = g.measureText(text).width + 12 * dpr, th = 22 * dpr;
    const lx = clamp(x0, 2 * dpr, canvas.width - tw - 2 * dpr), ly = y0 - th - 8 * dpr >= 0 ? y0 - th - 8 * dpr : y0 + 8 * dpr;
    g.fillStyle = 'rgb(17 17 27 / 85%)';
    g.beginPath(); g.roundRect(lx, ly, tw, th, 5 * dpr); g.fill();
    g.fillStyle = '#fff'; g.fillText(text, lx + 6 * dpr, ly + th / 2);
  }
  function update() {
    const has = !!sel && sel.w > 0 && sel.h > 0;
    takeBtn.disabled = !has;
    say.textContent = has ? `Area ${sel!.w} × ${sel!.h} at ${sel!.x}, ${sel!.y} — Enter or a double-click takes it.` : 'Drag a rectangle on the screenshot.';
    // the bar stays out of the way of the area: at the bottom, at the top when the area reaches down into it
    if (has) {
      const r = canvas.getBoundingClientRect(), k = r.height / canvas.height, [, y0, , y1] = drawn(sel!), bh = bar.offsetHeight;
      const reachesBottom = r.top + y1 * k > r.bottom - bh - 24, reachesTop = r.top + y0 * k < r.top + bh + 24;
      bar.classList.toggle('top', reachesBottom && !reachesTop);
    }
    draw();
  }
  const point = (ev: MouseEvent) => {
    const r = canvas.getBoundingClientRect(), px = (ev.clientX - r.left) * (canvas.width / r.width), py = (ev.clientY - r.top) * (canvas.height / r.height);
    return { px, py, ...toFrame(L, px, py) };
  };
  const reach = (ev: PointerEvent) => (ev.pointerType === 'touch' ? 22 : 10) * (canvas.width / canvas.getBoundingClientRect().width);
  const hitAt = (ev: PointerEvent) => {
    if (!sel || !sel.w || !sel.h) return '';
    const p = point(ev), [x0, y0, x1, y1] = drawn(sel);
    return hitOf(x0, y0, x1, y1, p.px, p.py, reach(ev));
  };

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !bmp) return;
    ev.preventDefault();
    canvas.focus();
    canvas.setPointerCapture(ev.pointerId);
    const p = point(ev), hit = hitAt(ev);
    if (hit === 'move' || hit) drag = { kind: hit === 'move' ? 'move' : 'edge', edges: hit, fx: p.x, fy: p.y, start: { ...sel! } };
    else { const ax = clamp(p.x, 0, W), ay = clamp(p.y, 0, H); drag = { kind: 'new', ax, ay }; sel = { x: ax, y: ay, w: 0, h: 0 }; }
    update();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag) { canvas.style.cursor = cursorOf(hitAt(ev)); return; }
    const p = point(ev);
    if (drag.kind === 'new') sel = rectFrom(drag.ax, drag.ay, p.x, p.y, W, H);
    else if (drag.kind === 'move') sel = moved(drag.start, p.x - drag.fx, p.y - drag.fy, W, H);
    else sel = resized(drag.start, drag.edges, p.x - drag.fx, p.y - drag.fy, W, H);
    update();
  });
  const endDrag = () => { if (!drag) return; drag = null; if (sel && (!sel.w || !sel.h)) sel = null; update(); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', (ev) => { if (sel && sel.w && sel.h && hitAt(ev as PointerEvent) === 'move') finish(sel); });
  box.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); finish(null); return; }
    if (ev.target !== canvas) return; // the buttons keep their own keys
    if (ev.key === 'Enter') { if (sel && sel.w && sel.h) { ev.preventDefault(); finish(sel); } return; }
    const step = ev.shiftKey ? 10 : 1;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[ev.key];
    if (d) {
      ev.preventDefault();
      if (!sel) sel = { x: Math.round(W / 4), y: Math.round(H / 4), w: Math.max(1, Math.round(W / 2)), h: Math.max(1, Math.round(H / 2)) };
      else sel = ev.ctrlKey || ev.metaKey ? sized(sel, d[0], d[1], W, H) : moved(sel, d[0], d[1], W, H);
      update();
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') { ev.preventDefault(); sel = { x: 0, y: 0, w: W, h: H }; update(); }
  });

  const onFull = () => { fsBtn.setLabel(document.fullscreenElement === box ? 'Leave full screen' : 'Full screen'); layout(); };
  document.addEventListener('fullscreenchange', onFull);
  async function toggleFull() {
    if (document.fullscreenElement === box) { await document.exitFullscreen().catch(() => {}); return; }
    try {
      await box.requestFullscreen({ navigationUI: 'hide' });
      // Esc then reaches the page (a short press cancels, a long one leaves full screen), as in the Snipping Tool
      await (navigator as any).keyboard?.lock?.(['Escape']).catch(() => {});
    } catch { /* refused: no click left for it — the button is there */ }
    canvas.focus();
  }

  function finish(p: Picked) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame); ro.disconnect();
    document.removeEventListener('fullscreenchange', onFull);
    try { (navigator as any).keyboard?.unlock?.(); } catch { /* none */ }
    if (document.fullscreenElement === box) document.exitFullscreen().catch(() => {});
    box.remove(); bmp?.close(); bmp = null;
    others.forEach((e) => (e.inert = false));
    resolve(p && p !== 'whole' ? { ...p } : p);
  }
  return { done, close: () => finish(null) };
}
