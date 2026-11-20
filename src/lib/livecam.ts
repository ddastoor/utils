// A live camera in the page (getUserMedia), for every tab that takes a picture (owner, 20 Nov 2026: "in all apps that
// offer to upload an image, also add the option of taking a photo … with the phone camera … on the PC … with a webcam").
// Phones: the back camera ("Switch camera" — the camera symbol — for the front one); PCs: the webcam ("Switch camera"
// when there are more). "Snap" hands over the frame at the full size the camera sends, as it is (the live view of the
// back camera and of a webcam is not mirrored: text in it reads the right way; a selfie's is, as a mirror). One photo:
// Snap closes the camera; several (`multiple`): it stays open, each Snap adds one, "Done" closes it.
// The camera closes on Snap, Cancel / Done, a file chosen instead (the pickers call `stop`), another camera of the page
// opening, and when the tab is left (registered with the lifecycle — no tab has to remember it); a camera that answers
// after that (the permission question was still open) is stopped at once. While it is open a phone's fixed action bar
// steps aside (html.cam-open), so nothing covers its buttons.
import { h, button, toast, reveal } from '../ui';
import { cameraError } from './camera';
import { onLeave } from '../lifecycle';
import { isMobile } from '../platform';
import type { Img } from '../wasm/imgproc';

export interface LiveCameraOptions {
  /** phones: the back camera first, Switch turns between back and front; PC: the default webcam, Switch goes through
   *  the others. Default: what the device is. */
  mobile?: boolean;
  /** 'user' for a selfie (a résumé photo): the front camera first on phones, the live view mirrored */
  facing?: 'environment' | 'user';
  /** several photos: the camera stays open after each Snap ("Done" closes it) */
  multiple?: boolean;
  /** what an error tells the person to do instead ("choose a photo instead") */
  instead?: string;
  /** the start button's words (default "Use camera" on phones, "Use webcam" on PCs) */
  label?: string;
  /** the photo: its pixels, and — for a tab that works on files — the same photo as a JPEG file (made when asked) */
  onSnap: (img: Img, file: () => Promise<File>) => void | Promise<void>;
  /** the live view opened / closed */
  onOpen?: () => void;
  onClose?: () => void;
}

/** The size asked for: the largest the camera offers up to 4K (text and faces need pixels). */
const SIZE = { width: { ideal: 3840 }, height: { ideal: 2160 } };
let active: { stop: () => void } | null = null, ids = 0;
let lastStamp = '', sameStamp = 0;

/** A snapped frame as a JPEG file, named as a phone names its photos: camera-20261120-211503.jpg (-2, -3 … within a second). */
function jpegOf(c: HTMLCanvasElement): Promise<File> {
  return new Promise((res, rej) => c.toBlob((b) => {
    if (!b) { rej(new Error('The photo could not be kept — the device is short of memory. Try again.')); return; }
    const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
    let stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    if (stamp === lastStamp) stamp += `-${++sameStamp + 1}`; else { lastStamp = stamp; sameStamp = 0; }
    res(new File([b], `camera-${stamp}.jpg`, { type: 'image/jpeg', lastModified: d.getTime() }));
  }, 'image/jpeg', 0.92));
}

export function liveCamera(o: LiveCameraOptions) {
  const mobile = o.mobile ?? isMobile, instead = o.instead ?? 'choose a photo instead', key = `livecam:${++ids}`;
  const video = h('video', { class: 'live-cam-video', autoplay: true, muted: true, playsInline: true, 'aria-label': 'Camera picture' } as any) as HTMLVideoElement;
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  let stream: MediaStream | null = null, req = 0, gone = false, shown = false, taken = 0;
  let facing: 'environment' | 'user' = o.facing ?? 'environment';
  let cams: string[] = [], cam = -1; // PC: the cameras by deviceId, and the one in use
  const box = h('div', { class: 'live-cam', hidden: true }, video);
  const self = { stop: () => stop() };
  const release = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; };
  /** Close the camera; a request still waiting for the person's answer is stopped when it arrives. */
  const stop = () => {
    req++; release();
    box.hidden = true; ctl.hidden = true; startBtn.hidden = false; status.textContent = '';
    if (active === self) { active = null; document.documentElement.classList.remove('cam-open'); }
    if (shown) { shown = false; o.onClose?.(); }
  };
  const constraints = (): MediaStreamConstraints => ({
    audio: false,
    video: mobile ? { facingMode: { ideal: facing }, ...SIZE } : { ...(cams[cam] ? { deviceId: { exact: cams[cam] } } : {}), ...SIZE },
  });
  const open = async () => {
    if (active && active !== self) active.stop(); // one camera at a time (a phone cannot hold two)
    active = self;
    onLeave(key, dispose); // leaving the tab closes it — also while the browser is still asking
    const my = ++req;
    release();
    status.textContent = 'Asking for the camera…';
    let s: MediaStream;
    try { s = await navigator.mediaDevices.getUserMedia(constraints()); }
    catch (e) {
      if (my === req && !gone) { stop(); toast(cameraError(e, 'camera', instead).message, 'err'); }
      return;
    }
    if (my !== req || gone) { s.getTracks().forEach((t) => t.stop()); return; } // cancelled, a file chosen, or the tab left meanwhile
    stream = s; video.srcObject = s; video.play().catch(() => { /* autoplay plays it; play() only nudges Safari */ });
    video.classList.toggle('mirror', facing === 'user');
    box.hidden = false; ctl.hidden = false; startBtn.hidden = true; status.textContent = '';
    document.documentElement.classList.add('cam-open');
    if (!shown) { shown = true; taken = 0; doneBtn.setLabel('Cancel'); o.onOpen?.(); }
    const track = s.getVideoTracks()[0];
    track?.addEventListener('ended', () => { if (stream === s) { stop(); toast('The camera stopped — it was unplugged, or another app took it.', 'err'); } });
    // in view with its buttons — again once the picture's size is known (the box grows from the default 300 × 150)
    reveal(el);
    video.addEventListener('loadedmetadata', () => { if (stream === s) reveal(el); }, { once: true });
    // a second camera: offer Switch (the list is complete only once a camera is allowed)
    try {
      cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').map((d) => d.deviceId);
      const id = track?.getSettings?.().deviceId;
      cam = id ? cams.indexOf(id) : -1;
    } catch { cams = []; }
    if (my === req) switchBtn.hidden = cams.length < 2;
  };
  const snap = async () => {
    const s = stream;
    if (!s) return;
    // the first frame may not have arrived yet: wait for it (up to 5 s) instead of doing nothing
    if (!video.videoWidth) await new Promise<void>((res) => { const t = setTimeout(res, 5000); video.addEventListener('loadeddata', () => { clearTimeout(t); res(); }, { once: true }); });
    if (stream !== s) return; // closed meanwhile
    if (!video.videoWidth) throw new Error(`The camera sends no picture — try again, or ${instead}.`);
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(video, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    let file: Promise<File> | null = null;
    const asFile = () => (file ??= jpegOf(c));
    if (o.multiple) {
      taken++;
      box.classList.remove('snap-flash'); void box.offsetWidth; box.classList.add('snap-flash'); // the shutter
      status.textContent = `${taken} photo${taken === 1 ? '' : 's'} taken — take another, or press Done.`;
      doneBtn.setLabel('Done');
    } else { stop(); reveal(el); }
    await o.onSnap({ data: d.data, width: d.width, height: d.height }, asFile);
  };
  const switchCam = () => {
    if (mobile) facing = facing === 'environment' ? 'user' : 'environment';
    else if (cams.length > 1) cam = (cam + 1) % cams.length; // a camera not in the list (-1) → the first
    return open();
  };
  const dispose = () => { gone = true; stop(); seen.disconnect(); };
  const startBtn = button(o.label ?? (mobile ? 'Use camera' : 'Use webcam'), open, { icon: 'Camera', title: mobile ? (facing === 'user' ? 'Opens the front camera' : 'Opens the back camera') : 'Opens the webcam' });
  // phones: the camera-app symbol alone, so Snap, Switch and Cancel fit on one line
  const switchBtn = button(mobile ? '' : 'Switch camera', switchCam, { icon: 'SwitchCamera', title: 'Switch camera' }); switchBtn.hidden = true;
  const doneBtn = button('Cancel', () => { stop(); reveal(el); }, { variant: 'ghost' });
  const ctl = h('div', { class: 'row live-cam-ctl', hidden: true }, button('Snap', snap, { variant: 'primary', icon: 'Camera' }), switchBtn, doneBtn);
  const el = h('div', { class: 'stack live-cam-wrap' }, h('div', { class: 'row' }, startBtn), box, ctl, status);
  // hidden with what holds it (another mode chosen, the box closed) or taken off the page: the camera closes
  const seen = new ResizeObserver(() => { if (stream && !el.getClientRects().length) stop(); });
  seen.observe(el);
  return {
    el,
    /** close the camera (a file was chosen instead, …) */
    stop,
    /** the tab is left: close it, and stop whatever answers later (also done by the lifecycle on leave) */
    dispose,
  };
}
export type LiveCamera = ReturnType<typeof liveCamera>;
