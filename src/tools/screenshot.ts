// Screenshot (PC): delayed screenshots of a screen, window or tab. Share once (Chrome's picker, own tab excluded), then
// "Arm": a tiny always-on-top countdown window (Document Picture-in-Picture) lets the owner minimise the browser; the
// frame is grabbed after the delay or on "Snap now" (the countdown window closes itself first). Crop, save PNG (OxiPNG)
// or JPEG (MozJPEG) through our image encoders, or copy to the clipboard. The share stays alive for more shots.
// "An area" (to-do #24): the frame is frozen and a rectangle drawn on it with the mouse (src/lib/areapick.ts).
import { h, card, field, actions, button, select, segmented, toggle, stack, note, toast, errMsg, fmtBytes, downloadBlob, sleep, clear, type Mount } from '../ui';
import { cropBox } from '../lib/imgtools';
import { encodeImg } from '../lib/imgio';
import { linuxBanner, CAPTURE_TIPS } from '../linux';
import { countdownWindow, showCount } from '../lib/pipcount';
import { pickArea, type AreaPicker } from '../lib/areapick';
import { cropImg, type Rect } from '../lib/areageom';
import type { Img } from '../wasm/imgproc';

/** a shot keeps its pixels while it is the one shown; the others are kept as lossless PNG (a 4K screenshot is 33 MB of
 *  pixels — every shot of a visit was kept that way) and decoded again when opened */
interface Shot { img?: Img; png?: Promise<Blob>; w: number; h: number; at: Date; area?: Rect; of?: [number, number] }
type How = 'whole' | 'area';
/** how shots are taken, kept while the page is open (through other tabs; nothing stored) */
const kept: { how: How } = { how: 'whole' };
const toCanvas = (img: Img) => { const c = new OffscreenCanvas(img.width, img.height); c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0); return c; };

export const mount: Mount = (root) => {
  let stream: MediaStream | null = null, delay = 3, cursor = false, armed = false, cancelArm = false, pip: Window | null = null, cancelWait: (() => void) | null = null;
  let how: How = kept.how, picker: AreaPicker | null = null;
  const shots: Shot[] = [];
  let cur: Shot | null = null;
  const video = h('video', { muted: true, playsinline: true, autoplay: true, class: 'shot-src' }) as HTMLVideoElement;
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' }, 'Share a screen, window or tab to start.');
  const canvas = h('canvas', { class: 'shot-canvas' }) as HTMLCanvasElement;
  const crop = cropBox(canvas);
  const shotInfo = h('div', { class: 'muted small' });
  const editCard = card('Screenshot', h('div', { class: 'shot-stage' }, crop.el), shotInfo);
  editCard.hidden = true;
  const gallery = h('div', { class: 'shot-gallery' });
  const galleryCard = card('Shots this visit', gallery); galleryCard.hidden = true;

  async function share() {
    stopShare();
    const asked = cursor;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: cursor ? 'always' : 'never', frameRate: { ideal: 10 } } as any, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include' } as any);
    } catch (e: any) { if (e?.name !== 'NotAllowedError') toast(errMsg(e), 'err'); return; }
    if (asked !== cursor) { // the switch changed while the picker was open
      stream.getTracks().forEach((t) => t.stop()); stream = null;
      status.textContent = 'The mouse pointer is set when sharing starts: share again.'; sync(); return;
    }
    stream.getVideoTracks()[0].addEventListener('ended', () => { stream = null; status.textContent = 'Sharing ended. Share again to take more shots.'; sync(); });
    const mine = stream;
    video.srcObject = stream;
    // the share can end while its first picture is on its way (the pointer switch, Stop sharing): stop waiting then
    await new Promise((r) => { cancelWait = () => r(null); if (video.readyState >= 2) r(null); else video.onloadeddata = () => r(null); });
    cancelWait = null;
    if (stream !== mine) return;
    const s = stream.getVideoTracks()[0].getSettings(), c = (s as any).cursor as string | undefined;
    const ptr = c === 'never' ? ' · no mouse pointer' : c ? (cursor ? ' · with the mouse pointer' : ' · with the mouse pointer: this browser keeps it in, though it was asked to leave it out') : cursor ? '' : ' · this browser may still show the mouse pointer';
    status.textContent = `Sharing ${(s as any).displaySurface || 'screen'} · ${s.width}×${s.height}${ptr}. Press “Take screenshot”.`;
    sync();
  }
  function stopShare() { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; cancelWait?.(); sync(); }

  /** One frame at full resolution: a fresh VideoFrame if the browser offers one, else the <video> element. */
  async function grab(): Promise<Img> {
    const track = stream!.getVideoTracks()[0];
    const W = window as any;
    if (W.MediaStreamTrackProcessor) {
      const clone = track.clone(), reader = new W.MediaStreamTrackProcessor({ track: clone }).readable.getReader();
      try {
        const { value: frame } = await reader.read();
        const c = new OffscreenCanvas(frame.displayWidth, frame.displayHeight), g = c.getContext('2d')!;
        g.drawImage(frame, 0, 0); frame.close();
        const id = g.getImageData(0, 0, c.width, c.height);
        return { data: id.data, width: c.width, height: c.height };
      } finally { reader.cancel().catch(() => {}); clone.stop(); } // a clone left running kept the screen shared after "Stop sharing"
    }
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d')!; g.drawImage(video, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height);
    return { data: id.data, width: c.width, height: c.height };
  }

  /** The always-on-top countdown (Document Picture-in-Picture, src/lib/pipcount.ts), or null where it is not available. */
  const openPip = (onSnap: () => void, onCancel: () => void) => countdownWindow('Snap now', onSnap, onCancel);
  async function arm() {
    if (!stream) { await share(); if (!stream) return; }
    armed = true; cancelArm = false; sync();
    let snapNow = false;
    pip = delay > 0 ? await openPip(() => (snapNow = true), () => (cancelArm = true)) : null;
    for (let k = delay; k > 0 && !snapNow && !cancelArm; k--) {
      status.textContent = `Screenshot in ${k} s — minimise this browser now if needed${pip ? ' (the small window stays on top)' : ''}.`;
      showCount(pip, k);
      for (let i = 0; i < 10 && !snapNow && !cancelArm; i++) await sleep(100);
    }
    if (pip) { pip.close(); pip = null; await sleep(250); } // let the countdown window disappear before the shot
    if (cancelArm) { armed = false; status.textContent = 'Cancelled.'; sync(); return; }
    if (!stream || stream.getVideoTracks()[0]?.readyState !== 'live') { armed = false; status.textContent = 'Sharing ended before the shot. Share again to take one.'; stream = null; sync(); return; }
    try {
      const img = await grab();
      let take = img, area: Rect | undefined;
      if (how === 'area') {
        // the frame is frozen; the rectangle is drawn on it (full screen at once while the click that started it lasts)
        status.textContent = 'The screen is frozen: drag a rectangle on it, then press Enter (Esc cancels).';
        picker = pickArea(img, { full: !!(navigator as any).userActivation?.isActive });
        const p = await picker.done;
        picker = null;
        if (!p) { status.textContent = 'Cancelled — no shot was taken.'; return; }
        if (p !== 'whole') { area = p; take = cropImg(img, p); }
      }
      const shot: Shot = { img: take, w: take.width, h: take.height, at: new Date(), area, of: area ? [img.width, img.height] : undefined };
      shot.png = toCanvas(take).convertToBlob({ type: 'image/png' });
      shots.unshift(shot); await show(shot); renderGallery();
      status.textContent = area ? `Captured ${take.width}×${take.height}: the area at ${area.x}, ${area.y} of the ${img.width}×${img.height} screen. Crop it further if you like, then save or copy.`
        : `Captured ${img.width}×${img.height}. Crop it if you like, then save or copy.`;
    } catch (e) { toast(`Could not capture: ${errMsg(e)}`, 'err'); }
    finally { armed = false; sync(); }
  }
  async function show(s: Shot) {
    if (cur && cur !== s && cur.png) cur.img = undefined; // the one shown before keeps only its PNG
    cur = s;
    if (!s.img) { // decode its PNG again
      const bmp = await createImageBitmap(await s.png!), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d')!;
      g.drawImage(bmp, 0, 0); bmp.close();
      const id = g.getImageData(0, 0, c.width, c.height);
      if (cur !== s) return;
      s.img = { data: id.data, width: c.width, height: c.height };
    }
    canvas.width = s.w; canvas.height = s.h;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(s.img.data), s.w, s.h), 0, 0);
    crop.reset(); cropOn.querySelector('input')!.checked = false;
    shotInfo.textContent = `${s.w}×${s.h}${s.area && s.of ? ` · an area at ${s.area.x}, ${s.area.y} of ${s.of[0]}×${s.of[1]}` : ''} · ${s.at.toLocaleTimeString()}`;
    editCard.hidden = false;
  }
  async function cropped(): Promise<Img> {
    const s = cur!.img!;
    if (!crop.active) return s;
    const r = crop.rect(s.width, s.height), x = Math.round(r.x), y = Math.round(r.y), w = Math.max(1, Math.round(r.w)), hh = Math.max(1, Math.round(r.h));
    const c = new OffscreenCanvas(w, hh), g = c.getContext('2d')!;
    g.drawImage(canvas, x, y, w, hh, 0, 0, w, hh);
    const id = g.getImageData(0, 0, w, hh);
    return { data: id.data, width: w, height: hh };
  }
  const fname = (ext: string) => `screenshot-${cur!.at.toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;
  async function save(fmt: 'png' | 'jpeg') {
    if (!cur) return;
    const blob = await encodeImg(await cropped(), fmt, 90);
    downloadBlob(blob, fname(fmt === 'png' ? 'png' : 'jpg'));
    status.textContent = `Saved ${fname(fmt === 'png' ? 'png' : 'jpg')} (${fmtBytes(blob.size)}).`;
  }
  async function copyImg() {
    if (!cur) return;
    const img = await cropped(), c = new OffscreenCanvas(img.width, img.height);
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Copied — paste it anywhere', 'ok'); }
    catch (e) { toast(`The browser refused the clipboard: ${errMsg(e)}`, 'err'); }
  }
  function renderGallery() {
    galleryCard.hidden = shots.length < 2;
    clear(gallery).append(...shots.map((s, i) => {
      const c = h('canvas', { class: 'shot-thumb', width: 160, height: Math.max(1, Math.round((160 * s.h) / s.w)), title: `Shot ${shots.length - i}` }) as HTMLCanvasElement;
      const b = s.img ? createImageBitmap(new ImageData(new Uint8ClampedArray(s.img.data), s.w, s.h)) : s.png!.then((p) => createImageBitmap(p));
      b.then((bmp) => { c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close(); }).catch(() => {});
      c.addEventListener('click', () => { show(s).catch((e) => toast(errMsg(e), 'err')); });
      return c;
    }));
  }
  function sync() {
    shareBtn.setLabel(stream ? 'Share something else' : 'Share a screen, window or tab');
    const what = how === 'area' ? 'Choose an area' : 'Take screenshot';
    snapBtn.disabled = armed; snapBtn.setLabel(armed ? 'Waiting…' : delay ? `${what} in ${delay} s` : what);
    shareBtn.disabled = armed; stopBtn.disabled = false; // another share during the countdown left the shot without a picture
    (pointerT.querySelector('input') as HTMLInputElement).disabled = armed;
    stopBtn.hidden = !stream;
  }
  const cropOn = toggle('Crop (drag the box)', false, (v) => crop.setEnabled(v));
  // the browser takes the pointer setting when sharing starts and keeps it (Chrome ignores a change on the live track):
  // changed while sharing, the share ends and the next one has it
  const pointerT = toggle('Show the mouse pointer', cursor, (v) => {
    cursor = v;
    if (stream && !armed) { stopShare(); status.textContent = 'The mouse pointer is set when sharing starts: share again.'; }
  });
  const shareBtn = button('Share a screen, window or tab', () => share(), { icon: 'MonitorUp' });
  const snapBtn = button('Take screenshot', () => arm(), { icon: 'Camera', variant: 'primary' });
  const stopBtn = button('Stop sharing', () => stopShare(), { icon: 'MonitorOff', variant: 'ghost' });
  editCard.append(h('div', { class: 'row' }, cropOn), actions(
    button('PNG', () => save('png'), { icon: 'Download', variant: 'primary', title: 'Lossless PNG (optimised with OxiPNG)' }),
    button('JPEG', () => save('jpeg'), { icon: 'Download', title: 'Smaller JPEG (MozJPEG, quality 90)' }),
    button('Copy', () => copyImg(), { icon: 'Copy', title: 'Copy the image to the clipboard' })));
  editCard.querySelector('.actions')!.classList.add('inline');
  root.append(
    card('Take a screenshot', stack(
      field('Take', segmented<How>([['whole', 'The whole picture'], ['area', 'An area (draw a rectangle)']], how, (v) => { how = kept.how = v; sync(); })),
      h('div', { class: 'row' },
        field('Delay', select<string>([['0', 'None'], ['3', '3 seconds'], ['5', '5 seconds'], ['10', '10 seconds']], String(delay), (v) => { delay = +v; sync(); })),
        pointerT),
      status, video)),
    // Wayland leaves "always on top" to the desktop: the countdown window may not stay above other windows there
    ...[linuxBanner({ ...CAPTURE_TIPS, wayland: `${CAPTURE_TIPS.wayland} The countdown window may not stay on top here: Wayland leaves that to the desktop (GNOME keeps it among the other windows; on KDE right-click its title bar → More Actions → Keep Above).` })].filter((x): x is HTMLElement => !!x),
    editCard, galleryCard,
    note('A web page cannot take a screenshot silently, minimise the browser or see the active window: share once, then take as many shots as you like. With a delay, a small countdown window stays on top while you minimise the browser. A web page cannot draw over the desktop either: for an area, the screen is frozen when the shot is taken and the rectangle is drawn on the frozen screen, full screen at its own pixels — as the Snipping Tool does.', 'info'),
    actions(shareBtn, snapBtn, stopBtn));
  sync();
  return () => { cancelArm = true; pip?.close(); picker?.close(); stopShare(); };
};
