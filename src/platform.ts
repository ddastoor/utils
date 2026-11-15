// Platform and capability detection. No user-agent sniffing beyond what's needed to tell phones apart.
const ua = navigator.userAgent;
const uad = (navigator as any).userAgentData;

export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/.test(ua);
export const isMobile: boolean = !!(uad?.mobile) || isIOS || isAndroid || /Mobi/.test(ua);
export const isWindows = /Windows/.test(ua);
export const isLinux = /Linux/.test(ua) && !isAndroid;
export const isMac = /Macintosh/.test(ua) && !isIOS;
export const isChromium = !!uad?.brands?.some((b: any) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));

export const has = {
  displayMedia: !!navigator.mediaDevices?.getDisplayMedia,
  userMedia: !!navigator.mediaDevices?.getUserMedia,
  docPiP: 'documentPictureInPicture' in window,
  cropTarget: 'CropTarget' in window,
  webcodecs: 'VideoEncoder' in window,
  savePicker: 'showSaveFilePicker' in window,
  wakeLock: 'wakeLock' in navigator,
  share: 'share' in navigator,
};
