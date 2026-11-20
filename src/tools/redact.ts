// Blur & Redact: automatic face detection (MediaPipe BlazeFace, official C++ → wasm) on the whole photo plus
// overlapping tiles so small faces in group photos are found; boxes merged with NMS in imgproc.wasm. Manual boxes
// for number plates, documents, screens. Effects (pixelate / blur / solid bar) run in imgproc.wasm.
import { h, card, field, button, segmented, slider, stack, note, actions, errMsg, baseName, downloadBlob, shareOrDownload, fmtBytes, clear, type Mount } from '../ui';
import { imgproc, imgprocDirect, type Img } from '../wasm/imgproc';
import { encodeImg, previewOf, EXT, type Fmt } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { faceDetector, toImageData } from '../lib/mediapipe';

export type Box = { x: number; y: number; w: number; h: number; on: boolean; face: boolean; score?: number }; // normalised 0..1
export type Effect = 'pixelate' | 'blur' | 'bar';

/** Face boxes (normalised) found on the whole image and on overlapping square tiles at two finer scales (BlazeFace
 *  short-range sees faces that fill ≳ 15 % of its 128 px input, so small faces in group photos need tiles), merged
 *  by NMS in imgproc.wasm. Tile hits need a higher score, and faces cut by an inner tile edge are ignored. */
export async function detectFaces(img: Img): Promise<Box[]> {
  const det = await faceDetector(), ip = await imgprocDirect();
  const found: number[][] = [];
  const run = async (x0: number, y0: number, w: number, hh: number, minScore: number) => {
    const whole = x0 === 0 && y0 === 0 && w === img.width && hh === img.height;
    let tile = whole ? img : ip.crop(img, x0, y0, w, hh);
    const s = Math.min(1, 640 / Math.max(tile.width, tile.height));
    if (s < 1) tile = ip.resize(tile, Math.round(tile.width * s), Math.round(tile.height * s));
    for (const d of det.detect(toImageData(tile)).detections) {
      const b = d.boundingBox!, score = d.categories?.[0]?.score ?? 0;
      if (score < minScore) continue;
      const m = 2, cut = !whole && ((b.originX < m && x0 > 0) || (b.originY < m && y0 > 0) || (b.originX + b.width > tile.width - m && x0 + w < img.width) || (b.originY + b.height > tile.height - m && y0 + hh < img.height));
      if (cut) continue;
      found.push([(x0 + b.originX / s) / img.width, (y0 + b.originY / s) / img.height, b.width / s / img.width, b.height / s / img.height, score]);
    }
  };
  await run(0, 0, img.width, img.height, 0.55);
  const S = Math.min(img.width, img.height);
  for (const k of [2, 3, 4]) {
    const side = Math.round(S / k);
    if (side < 96) break;
    const step = Math.round(side * 0.7);
    for (let y = 0; y < img.height; y += step) for (let x = 0; x < img.width; x += step) {
      const x0 = Math.min(x, img.width - side), y0 = Math.min(y, img.height - side);
      await run(x0, y0, side, side, 0.7);
      if (x0 + side >= img.width) break;
    }
  }
  return ip.nms(found, 0.3, 0.6).map((i) => ({ x: found[i][0], y: found[i][1], w: found[i][2], h: found[i][3], on: true, face: true, score: found[i][4] }));
}

/** Apply the effect to every enabled box (padding grows face boxes so hair/ears are covered). */
export async function applyRedaction(img: Img, boxes: Box[], effect: Effect, strength: number, padPct: number): Promise<Img> {
  let out = img;
  const S = Math.min(img.width, img.height);
  for (const b of boxes) {
    if (!b.on) continue;
    const p = b.face ? padPct / 100 : 0;
    const x = (b.x - b.w * p) * img.width, y = (b.y - b.h * p * 1.3) * img.height, w = b.w * (1 + 2 * p) * img.width, hh = b.h * (1 + 2.6 * p) * img.height;
    if (effect === 'pixelate') out = await imgproc('pixelateRect', out, x, y, w, hh, Math.max(4, Math.round(Math.max(w, hh) / (22 - strength * 1.6))));
    else if (effect === 'blur') out = await imgproc('blurRect', out, x, y, w, hh, Math.max(2, (S / 60) * strength));
    else out = await imgproc('fillRect', out, x, y, w, hh, [0, 0, 0, 255]);
  }
  return out;
}

export const mount: Mount = (root, ctx) => {
  let orig: Img | null = null, small: Img | null = null, name = 'photo', fmt: Fmt = 'jpeg';
  let effect: Effect = 'pixelate', strength = 6, pad = 18, drawing = false;
  let boxes: Box[] = [], detecting = false, photoSeq = 0, detectNote = '';
  const canvas = h('canvas', { class: 'ed-canvas' });
  const layer = h('div', { class: 'redact-layer' });
  const wrap = h('div', { class: 'crop-wrap redact-wrap' }, canvas, layer);
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const editor = h('div', { class: 'stack', hidden: true });
  let tok = 0;
  const render = async () => {
    if (!small) return;
    const my = ++tok, out = await applyRedaction(small, boxes, effect, strength, pad);
    if (my !== tok) return;
    canvas.width = out.width; canvas.height = out.height;
    canvas.getContext('2d')!.putImageData(toImageData(out), 0, 0);
    clear(layer).append(...boxes.map((b, i) => h('button', {
      type: 'button', class: ['redact-box', !b.on && 'off', b.face && 'face'], title: b.on ? 'Tap to keep this area visible' : 'Tap to hide this area', 'aria-label': `${b.face ? 'Face' : 'Area'} ${i + 1}: ${b.on ? 'hidden' : 'visible'}`,
      style: { left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` },
      'data-score': b.score?.toFixed(2),
      onclick: (e: Event) => { e.stopPropagation(); if (!drawing) { b.on = !b.on; render(); } },
    })));
    if (detecting) return;
    const faces = boxes.filter((b) => b.face).length, hidden = boxes.filter((b) => b.on).length;
    status.textContent = detectNote || `${faces} face${faces === 1 ? '' : 's'} found · ${hidden} area${hidden === 1 ? '' : 's'} hidden`;
  };
  // draw manual boxes
  let start: { x: number; y: number } | null = null, ghost: HTMLElement | null = null;
  const norm = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  layer.addEventListener('pointerdown', (e) => { if (!drawing) return; start = norm(e); try { layer.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ } ghost = h('div', { class: 'redact-box ghost' }); layer.append(ghost); e.preventDefault(); });
  layer.addEventListener('pointermove', (e) => { if (!start || !ghost) return; const p = norm(e); Object.assign(ghost.style, { left: `${Math.min(p.x, start.x) * 100}%`, top: `${Math.min(p.y, start.y) * 100}%`, width: `${Math.abs(p.x - start.x) * 100}%`, height: `${Math.abs(p.y - start.y) * 100}%` }); });
  layer.addEventListener('pointerup', (e) => {
    if (!start) return;
    const p = norm(e), w = Math.abs(p.x - start.x), hh = Math.abs(p.y - start.y);
    if (w > 0.01 && hh > 0.01) boxes.push({ x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), w, h: hh, on: true, face: false });
    start = null; ghost = null; render();
  });
  // a gesture the browser takes over (a scroll, a second finger, a call) leaves no half-drawn box behind
  layer.addEventListener('pointercancel', () => { start = null; ghost?.remove(); ghost = null; });
  const drawBtn = button('Draw a box', () => { drawing = !drawing; drawBtn.setLabel(drawing ? 'Done drawing' : 'Draw a box'); wrap.classList.toggle('drawing', drawing); }, { icon: 'SquareDashed' });
  const input$ = imageInput(async (img, f) => {
    const my = ++photoSeq; // a photo chosen while faces are being looked for in another wins
    orig = img; name = baseName(f.name); small = previewOf(img, ctx.isMobile ? 1000 : 1400); boxes = []; editor.hidden = false;
    status.textContent = 'Looking for faces…'; detecting = true; detectNote = ''; render();
    let faces: Box[] = [];
    try { faces = await detectFaces(img); }
    catch (e) {
      if (my !== photoSeq || !root.isConnected) return; // another photo, or the tab was left (its detector closed)
      detectNote = `Faces could not be looked for (${errMsg(e)}) — draw boxes by hand over what to hide.`;
    }
    if (my !== photoSeq) return;
    boxes = [...faces, ...boxes]; // boxes drawn while the search ran are kept
    detecting = false; render();
  });
  const save = async (share: boolean) => {
    if (!orig) throw new Error('Choose a photo first.');
    // saving before the search ends would give a photo with every face visible
    if (detecting) throw new Error('Still looking for faces — Save again in a moment.');
    const out = await applyRedaction(orig, boxes, effect, strength, pad);
    const blob = await encodeImg(out, fmt, 90), fname = `${name}-redacted.${EXT[fmt]}`;
    status.textContent = `Saved ${fmtBytes(blob.size)} · ${out.width}×${out.height} · no metadata`;
    share ? await shareOrDownload(blob, fname) : downloadBlob(blob, fname);
  };
  editor.append(
    card(null, h('div', { class: 'ed-stage' }, wrap), status, h('div', { class: 'row' }, drawBtn,
      button('Hide all', () => { boxes.forEach((b) => (b.on = true)); render(); }, { small: true, variant: 'ghost' }),
      button('Remove my boxes', () => { boxes = boxes.filter((b) => b.face); render(); }, { small: true, variant: 'ghost' }))),
    card('Effect', stack(
      segmented([['pixelate', 'Pixelate'], ['blur', 'Blur'], ['bar', 'Black bar']], effect, (v) => { effect = v; render(); }),
      slider({ label: 'Strength', min: 1, max: 10, value: strength, onChange: (v) => { strength = v; render(); } }),
      slider({ label: 'Extra margin around faces', min: 0, max: 50, value: pad, unit: '%', onChange: (v) => { pad = v; render(); } }),
      field('Format', segmented([['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WebP']], fmt, (v) => (fmt = v))),
      note('Tap a box to keep that area visible. Pixelation and blur at low strength can sometimes be reversed — use "Black bar" for documents, card numbers and number plates.'))),
    actions(button('Save', () => save(false), { variant: 'primary', icon: 'Download' }), ctx.isMobile ? button('Share', () => save(true), { icon: 'Share2' }) : null),
  );
  root.append(card(null, input$.el), editor);
  return () => input$.dispose();
};
