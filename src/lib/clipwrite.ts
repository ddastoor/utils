// The text a tab has read, put on the clipboard as soon as it is read (to-do #38; owner, 27 Nov 2026: "Both the ocr and the photo
// dictionary app should copy the ocr text to the clipboard immediately after conversion"). Chrome writes to the clipboard while the
// page has the focus, tap or not; Safari and Firefox only within a tap — and a reading takes seconds. So the copy is begun in the tap
// that starts the reading (Extract text, Snap, Paste image): a ClipboardItem whose text is still a promise, handed over in the tap and
// given when the reading is done (Safari and Chrome take such an item). Where that is refused, the text is written once it is there —
// Chrome does, with the page in front; where that is refused too, the tab says so and its Copy button does it with one tap.
// No DOM: the unit suite runs it with a stand-in clipboard.

/** copied; refused by the browser (the tab says "press Copy"); dropped (a newer reading, no text, the tab left) */
export type CopyResult = 'copied' | 'refused' | 'dropped';
export interface LaterCopy {
  /** when it was begun (performance.now()): a copy begun by a tap belongs to the reading that tap starts */
  readonly at: number;
  /** the text, now that it is read: on the clipboard, or why not */
  give(text: string): Promise<CopyResult>;
  /** no text after all (nothing read, a newer reading, the tab left): the clipboard is left as it was */
  drop(): void;
}

export function laterCopy(clip: Clipboard | undefined = typeof navigator !== 'undefined' ? navigator.clipboard : undefined): LaterCopy {
  let resolve!: (t: string) => void, reject!: (e: Error) => void, over = false;
  const text = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  text.catch(() => {});
  // the item handed over now (in the tap), its text a promise
  let viaItem: Promise<boolean>;
  try {
    if (typeof ClipboardItem === 'function' && typeof clip?.write === 'function') {
      const blob = text.then((t) => new Blob([t], { type: 'text/plain' }));
      blob.catch(() => {});
      viaItem = clip.write([new ClipboardItem({ 'text/plain': blob })]).then(() => true, () => false);
    } else viaItem = Promise.resolve(false);
  } catch { viaItem = Promise.resolve(false); } // a browser without promised items
  return {
    at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    async give(t: string) {
      if (over) return 'dropped';
      over = true; resolve(t);
      if (await viaItem) return 'copied';
      // the item was refused: the text itself, now that it is there (Chrome writes while the page has the focus)
      try { await clip!.writeText(t); return 'copied'; } catch { return 'refused'; }
    },
    drop() { if (over) return; over = true; reject(new Error('dropped')); },
  };
}

/** A copy begun by a tap is the one for the reading it starts — if that reading starts soon after it (the camera's still and a
 *  clipboard's picture take a moment); an older one is dropped. */
export const FRESH_MS = 15_000;

/** What the tab says after a copy: done, or what to press (`what`: the tab's button). Nothing for a copy dropped. */
export function copyNote(r: CopyResult, what = 'Copy'): string {
  return r === 'copied' ? 'Copied to the clipboard.'
    : r === 'refused' ? `Not copied by itself: this browser lets a page copy only when you tap — press “${what}”.`
    : '';
}
