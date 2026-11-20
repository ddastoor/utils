// A live camera in the page (getUserMedia), for tabs that take a photo: the phone's back camera ("Switch camera" for the
// front one) or the PC's webcam ("Switch camera" when it has more than one). "Snap" hands over the frame at the full
// size the camera sends, as it is — not mirrored, so text in it reads the right way. Snap, Cancel, a new request and
// leaving the tab stop the camera; a camera that answers after it was cancelled (the person was still deciding on the
// permission) is stopped at once. Owner, 20 Nov 2026: "take a photo with the camera if it's on the phone, or with the
// webcam if it's on the PC" — first in the OCR tab.
import { h, button, toast, reveal } from '../ui';
import { cameraError } from './camera';
import type { Img } from '../wasm/imgproc';

export interface LiveCameraOptions {
  /** phones: the back camera first, Switch turns between back and front; PC: the default webcam, Switch goes through the others */
  mobile: boolean;
  /** what an error tells the person to do instead ("choose an image instead") */
  instead?: string;
  onSnap: (img: Img) => void | Promise<void>;
  /** the live view opened / closed (a tab may hide what would sit beside it) */
  onOpen?: () => void;
  onClose?: () => void;
}

/** The size asked for: the largest the camera offers up to 4K (text needs pixels). */
const SIZE = { width: { ideal: 3840 }, height: { ideal: 2160 } };

export function liveCamera(o: LiveCameraOptions) {
  const instead = o.instead ?? 'choose a photo instead';
  const video = h('video', { class: 'live-cam-video', autoplay: true, muted: true, playsInline: true, 'aria-label': 'Camera picture' } as any) as HTMLVideoElement;
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  let stream: MediaStream | null = null, req = 0, gone = false, shown = false;
  let facing: 'environment' | 'user' = 'environment';
  let cams: string[] = [], cam = -1; // PC: the cameras by deviceId, and the one in use
  const box = h('div', { class: 'live-cam', hidden: true }, video);
  const release = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; };
  /** Close the camera; a request still waiting for the person's answer is stopped when it arrives. */
  const stop = () => {
    req++; release();
    box.hidden = true; ctl.hidden = true; startBtn.hidden = false; status.textContent = '';
    if (shown) { shown = false; o.onClose?.(); }
  };
  const constraints = (): MediaStreamConstraints => ({
    audio: false,
    video: o.mobile ? { facingMode: { ideal: facing }, ...SIZE } : { ...(cams[cam] ? { deviceId: { exact: cams[cam] } } : {}), ...SIZE },
  });
  const open = async () => {
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
    box.hidden = false; ctl.hidden = false; startBtn.hidden = true; status.textContent = '';
    if (!shown) { shown = true; o.onOpen?.(); }
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
    stop();
    await o.onSnap({ data: d.data, width: d.width, height: d.height });
  };
  const switchCam = () => {
    if (o.mobile) facing = facing === 'environment' ? 'user' : 'environment';
    else if (cams.length > 1) cam = (cam + 1) % cams.length; // a camera not in the list (-1) → the first
    return open();
  };
  const startBtn = button(o.mobile ? 'Use camera' : 'Use webcam', open, { icon: 'Camera', title: o.mobile ? 'Opens the back camera' : 'Opens the webcam' });
  // phones: the camera-app symbol alone, so Snap, Switch and Cancel fit on one line
  const switchBtn = button(o.mobile ? '' : 'Switch camera', switchCam, { icon: 'SwitchCamera', title: 'Switch camera' }); switchBtn.hidden = true;
  const ctl = h('div', { class: 'row live-cam-ctl', hidden: true },
    button('Snap', snap, { variant: 'primary', icon: 'Camera' }), switchBtn, button('Cancel', () => stop(), { variant: 'ghost' }));
  const el = h('div', { class: 'stack live-cam-wrap' }, h('div', { class: 'row' }, startBtn), box, ctl, status);
  return {
    el,
    /** close the camera (a file was chosen instead, …) */
    stop,
    /** the tab is left: close it, and stop whatever answers later */
    dispose: () => { gone = true; stop(); },
  };
}
