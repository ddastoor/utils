// Screenshot (PC): delayed screenshots of a screen, window or tab. Share once (Chrome's picker, own tab excluded), then
// "Arm": a tiny always-on-top countdown window (Document Picture-in-Picture) lets the owner minimise the browser; the
// frame is grabbed after the delay or on "Snap now" (the countdown window closes itself first). Crop, save PNG (OxiPNG)
// or JPEG (MozJPEG) through our image encoders, or copy to the clipboard. The share stays alive for more shots.
import { h, card, field, actions, button, select, toggle, stack, note, toast, errMsg, fmtBytes, downloadBlob, sleep, clear, type Mount } from '../ui';
import { cropBox } from '../lib/imgtools';
import { encodeImg } from '../lib/imgio';
import { linuxBanner } from '../linux';
import type { Img } from '../wasm/imgproc';

interface Shot { img: Img; at: Date }

export const mount: Mount = (root) => {
  let stream: MediaStream | null = null, delay = 3, cursor = false, armed = false, cancelArm = false, pip: Window | null = null;
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
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: cursor ? 'always' : 'never', frameRate: { ideal: 10 } } as any, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include' } as any);
    } catch (e: any) { if (e?.name !== 'NotAllowedError') toast(errMsg(e), 'err'); return; }
    stream.getVideoTracks()[0].addEventListener('ended', () => { stream = null; status.textContent = 'Sharing ended. Share again to take more shots.'; sync(); });
    video.srcObject = stream;
    await new Promise((r) => (video.readyState >= 2 ? r(null) : (video.onloadeddata = () => r(null))));
    const s = stream.getVideoTracks()[0].getSettings();
    status.textContent = `Sharing ${(s as any).displaySurface || 'screen'} · ${s.width}×${s.height}. Press “Take screenshot”.`;
    sync();
  }
  function stopShare() { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; sync(); }

  /** One frame at full resolution: a fresh VideoFrame if the browser offers one, else the <video> element. */
  async function grab(): Promise<Img> {
    const track = stream!.getVideoTracks()[0];
    const W = window as any;
    if (W.MediaStreamTrackProcessor) {
      const reader = new W.MediaStreamTrackProcessor({ track: track.clone() }).readable.getReader();
      try {
        const { value: frame } = await reader.read();
        const c = new OffscreenCanvas(frame.displayWidth, frame.displayHeight), g = c.getContext('2d')!;
        g.drawImage(frame, 0, 0); frame.close();
        const id = g.getImageData(0, 0, c.width, c.height);
        return { data: id.data, width: c.width, height: c.height };
      } finally { reader.cancel().catch(() => {}); }
    }
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d')!; g.drawImage(video, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height);
    return { data: id.data, width: c.width, height: c.height };
  }

  /** The always-on-top countdown (Document Picture-in-Picture), or null where it is not available. */
  async function openPip(onSnap: () => void, onCancel: () => void) {
    const dpip = (window as any).documentPictureInPicture;
    if (!dpip) return null;
    try {
      const w: Window = await dpip.requestWindow({ width: 240, height: 140 });
      const d = w.document;
      d.body.innerHTML = '';
      const css = d.createElement('style');
      css.textContent = 'body{margin:0;font:600 15px system-ui,sans-serif;background:#1e1b4b;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100vh}#n{font:800 44px system-ui}button{font:600 14px system-ui;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}#s{background:#818cf8;color:#fff}#c{background:#334155;color:#fff}';
      d.head.append(css);
      d.body.innerHTML = '<div id="n"></div><div><button id="s">Snap now</button> <button id="c">Cancel</button></div>';
      d.getElementById('s')!.onclick = onSnap; d.getElementById('c')!.onclick = onCancel;
      return w;
    } catch { return null; }
  }
  async function arm() {
    if (!stream) { await share(); if (!stream) return; }
    armed = true; cancelArm = false; sync();
    let snapNow = false;
    pip = delay > 0 ? await openPip(() => (snapNow = true), () => (cancelArm = true)) : null;
    for (let k = delay; k > 0 && !snapNow && !cancelArm; k--) {
      status.textContent = `Screenshot in ${k} s — minimise this browser now if needed${pip ? ' (the small window stays on top)' : ''}.`;
      if (pip) pip.document.getElementById('n')!.textContent = String(k);
      for (let i = 0; i < 10 && !snapNow && !cancelArm; i++) await sleep(100);
    }
    if (pip) { pip.close(); pip = null; await sleep(250); } // let the countdown window disappear before the shot
    armed = false;
    if (cancelArm) { status.textContent = 'Cancelled.'; sync(); return; }
    try {
      const img = await grab();
      const shot = { img, at: new Date() };
      shots.unshift(shot); show(shot); renderGallery();
      status.textContent = `Captured ${img.width}×${img.height}. Crop it if you like, then save or copy.`;
    } catch (e) { toast(`Could not capture: ${errMsg(e)}`, 'err'); }
    sync();
  }
  function show(s: Shot) {
    cur = s;
    canvas.width = s.img.width; canvas.height = s.img.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(s.img.data), s.img.width, s.img.height), 0, 0);
    crop.reset(); cropOn.querySelector('input')!.checked = false;
    shotInfo.textContent = `${s.img.width}×${s.img.height} · ${s.at.toLocaleTimeString()}`;
    editCard.hidden = false;
  }
  async function cropped(): Promise<Img> {
    const s = cur!.img;
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
      const c = h('canvas', { class: 'shot-thumb', width: 160, height: Math.max(1, Math.round((160 * s.img.height) / s.img.width)), title: `Shot ${shots.length - i}` }) as HTMLCanvasElement;
      const b = createImageBitmap(new ImageData(new Uint8ClampedArray(s.img.data), s.img.width, s.img.height));
      b.then((bmp) => { c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close(); });
      c.addEventListener('click', () => show(s));
      return c;
    }));
  }
  function sync() {
    shareBtn.setLabel(stream ? 'Share something else' : 'Share a screen, window or tab');
    snapBtn.disabled = armed; snapBtn.setLabel(armed ? 'Waiting…' : delay ? `Take screenshot in ${delay} s` : 'Take screenshot');
    stopBtn.hidden = !stream;
  }
  const cropOn = toggle('Crop (drag the box)', false, (v) => crop.setEnabled(v));
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
      h('div', { class: 'row' },
        field('Delay', select<string>([['0', 'None'], ['3', '3 seconds'], ['5', '5 seconds'], ['10', '10 seconds']], String(delay), (v) => { delay = +v; sync(); })),
        toggle('Show the mouse pointer', cursor, (v) => (cursor = v))),
      status, video)),
    ...[linuxBanner()].filter((x): x is HTMLElement => !!x),
    editCard, galleryCard,
    note('A web page cannot take a screenshot silently, minimise the browser or see the active window: share once, then take as many shots as you like. With a delay, a small countdown window stays on top while you minimise the browser.', 'info'),
    actions(shareBtn, snapBtn, stopBtn));
  sync();
  return () => { cancelArm = true; pip?.close(); stopShare(); };
};
