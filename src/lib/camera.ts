// The browser's camera and microphone errors, said for a person (getUserMedia's DOMException names).
export function cameraError(e: unknown, device: 'camera' | 'microphone' = 'camera', instead = 'choose a photo instead'): Error {
  const n = (e as { name?: string })?.name ?? '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return new Error(`The ${device} was not allowed — allow it in the browser's site settings (the ${device} icon in the address bar), or ${instead}.`);
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return new Error(`No ${device} was found — ${instead}.`);
  if (n === 'NotReadableError' || n === 'AbortError') return new Error(`The ${device} is busy (another app or tab is using it). Close that, then try again.`);
  if (!navigator.mediaDevices?.getUserMedia) return new Error(`This browser gives no access to a ${device} here (it needs a secure https:// page) — ${instead}.`);
  return e instanceof Error ? e : new Error(String(e));
}
