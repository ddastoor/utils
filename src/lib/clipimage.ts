// A picture from the clipboard, for the picture tabs that ask for it (to-do #37; owner, 27 Nov 2026: "Make both ocr app and
// photo dictionary app take images, as input, from the clipboard", then "Make a paste button for ocr and photo dictionary
// apps on the pc too"). The "Paste image" button reads it with the browser's Async Clipboard API — Chrome on Windows, Linux
// and Android asks once for leave to read the clipboard, Safari shows its own "Paste" button to tap — and hands it over as a
// file named as a pasted screenshot is kept: clipboard-20261127-091503.png. Ctrl+V needs none of this: the page's paste
// event carries the picture (src/lib/imgtools.ts), and a picture *file* copied in a file manager only arrives that way.
// No DOM here: the page's `navigator.clipboard` is passed in, so the unit suite can stand in for it.

/** the formats of the clipboard a picture may come in, the most usual first (Chrome gives PNG; Safari PNG or JPEG) */
const ORDER = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif', 'image/heic', 'image/heif', 'image/tiff'];
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/tiff': 'tif', 'image/svg+xml': 'svg' };

/** Which of a clipboard item's formats is its picture: the usual ones in ORDER, then any other image format; an SVG drawing
 *  last (the tabs read photos; an SVG is opened as the picture it draws only when nothing else is there). */
export function pictureType(types: readonly string[]): string | null {
  const t = types.map((x) => x.toLowerCase());
  for (const want of ORDER) { const i = t.indexOf(want); if (i >= 0) return types[i]; }
  const other = t.findIndex((x) => x.startsWith('image/') && x !== 'image/svg+xml');
  if (other >= 0) return types[other];
  const svg = t.indexOf('image/svg+xml');
  return svg >= 0 ? types[svg] : null;
}

/** the name a pasted picture is kept under: clipboard-<date>-<time>.<ext>, -2, -3 … within one second */
let lastStamp = '', sameStamp = 0;
export function clipboardName(type: string, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  let stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  if (stamp === lastStamp) stamp += `-${++sameStamp + 1}`; else { lastStamp = stamp; sameStamp = 0; }
  const ext = EXT[type.toLowerCase()] ?? ((type.split('/')[1] || '').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'img');
  return `clipboard-${stamp}.${ext}`;
}

/** the kind of device the words are for: a PC (Windows, Linux, a Mac), an Android phone, an iPhone or iPad */
export type ClipWhere = 'pc' | 'mac' | 'android' | 'ios';
export type ClipProblem = 'unsupported' | 'denied' | 'empty' | 'text' | 'failed';
export class ClipboardPictureError extends Error {
  constructor(public kind: ClipProblem, message: string) { super(message); this.name = 'ClipboardPictureError'; }
}

/** how to put a picture on the clipboard, for the device in hand */
export function copyTip(where: ClipWhere): string {
  if (where === 'ios') return 'Copy one first: press and hold a picture → Copy (in Photos: Share → Copy Photo; a screenshot: tap its preview → Share → Copy).';
  if (where === 'android') return 'Copy one first: press and hold a picture → Copy image (Chrome, Google Photos and most apps have it; a screenshot: Share → Copy).';
  const shot = where === 'mac' ? '⌘⇧4 with Control held copies a part of the screen' : 'Windows: Win+Shift+S; Linux: Shift+PrtScn or the screenshot tool';
  const key = where === 'mac' ? '⌘V' : 'Ctrl+V';
  return `Copy one first: right-click a picture → Copy image, or a screenshot to the clipboard (${shot}). A picture file copied in the file manager is pasted with ${key}.`;
}

/** what to do when the browser did not let the page read the clipboard */
export function deniedTip(where: ClipWhere): string {
  if (where === 'ios') return 'Safari did not paste: tap “Paste” when Safari offers it beside the button (it asks each time).';
  if (where === 'android') return 'Chrome did not let the page read the clipboard. To allow it: the icon at the left of the address bar → Permissions (or ⋮ → Settings → Site settings → Clipboard) → allow this site; then tap Paste image again.';
  const key = where === 'mac' ? '⌘V' : 'Ctrl+V';
  return `The browser did not let the page read the clipboard. To allow it: the icon at the left of the address bar → Site settings → Clipboard → Allow; then press Paste image again — or press ${key}, which needs no leave.`;
}

/** The picture on the clipboard as a file, or a ClipboardPictureError that says in words what is there instead. */
export async function clipboardPicture(clip: Pick<Clipboard, 'read'> | undefined, where: ClipWhere, now = () => new Date()): Promise<File> {
  const key = where === 'mac' ? '⌘V' : 'Ctrl+V';
  if (!clip || typeof clip.read !== 'function') throw new ClipboardPictureError('unsupported', `This browser cannot read the clipboard from a button.${where === 'pc' || where === 'mac' ? ` Press ${key} instead.` : ''}`);
  let items: readonly ClipboardItem[];
  try { items = await clip.read(); }
  catch (e: any) {
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
      // Chrome also refuses while the page does not have the focus (the address bar or another window has it)
      if (/focus/i.test(String(e?.message))) throw new ClipboardPictureError('failed', 'The page did not have the focus, so the browser would not read the clipboard: click on the page, then press Paste image again.');
      throw new ClipboardPictureError('denied', deniedTip(where));
    }
    throw new ClipboardPictureError('failed', `The clipboard could not be read — ${e?.message || e}.${where === 'pc' || where === 'mac' ? ` Press ${key} instead.` : ''}`);
  }
  let text = false;
  for (const item of items) {
    const type = pictureType(item.types);
    if (!type) { if (item.types.some((t) => t.startsWith('text/'))) text = true; continue; }
    let blob: Blob;
    try { blob = await item.getType(type); }
    catch (e: any) { throw new ClipboardPictureError('failed', `The picture on the clipboard could not be read — ${e?.message || e}.`); }
    if (!blob.size) continue;
    return new File([blob], clipboardName(type, now()), { type: blob.type || type, lastModified: now().getTime() });
  }
  throw text ? new ClipboardPictureError('text', `The clipboard holds text, not a picture. ${copyTip(where)}`)
    : new ClipboardPictureError('empty', `There is no picture on the clipboard. ${copyTip(where)}`);
}
