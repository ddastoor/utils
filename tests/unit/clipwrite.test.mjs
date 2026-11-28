// To-do #38: src/lib/clipwrite.ts — the copy of a reading's text begun in the tap (a ClipboardItem whose text is still a promise,
// handed to the clipboard at once) and given when the text is read; the text itself written where the item is refused; dropped
// (the clipboard left as it was) when there is no text. Held to stand-ins of the browsers' clipboards: one that takes promised
// items (Chrome, Safari), one that refuses them outside a tap (Safari, Firefox — and the text written later is refused too), one
// without ClipboardItem, one whose ClipboardItem cannot take a promise, none at all.

/** a stand-in clipboard: what it was handed, in order; `refuse` = the item, the text, or both refused */
function board({ refuseItem = false, refuseText = false } = {}) {
  const c = { calls: [], written: [], write: null, writeText: null };
  c.write = async (items) => {
    c.calls.push('write');
    if (refuseItem) throw Object.assign(new Error('Write permission denied.'), { name: 'NotAllowedError' });
    // as Chromium does: the promised data waited for, the clipboard written only when every part has arrived
    const blob = await items[0].data['text/plain'];
    c.written.push(await blob.text());
  };
  c.writeText = async (t) => {
    c.calls.push('writeText');
    if (refuseText) throw Object.assign(new Error('Write permission denied.'), { name: 'NotAllowedError' });
    c.written.push(t);
  };
  return c;
}
class Item { constructor(data) { this.data = data; } }
const tick = () => new Promise((r) => setTimeout(r, 5));

export default async (t, { load }) => {
  const { laterCopy, copyNote, FRESH_MS } = await load('/src/lib/clipwrite.ts');
  const had = globalThis.ClipboardItem;
  globalThis.ClipboardItem = Item;
  try {
    // ---------------------------------------------------------------- a browser that takes a promised item (Chrome, Safari in a tap)
    {
      const c = board(), cp = laterCopy(c);
      t.eq(c.calls, ['write'], 'the item is handed to the clipboard at once — in the tap, before the text is there');
      await tick();
      t.eq(c.written, [], '… and nothing is written while the text is still being read');
      t.eq(await cp.give('• the first line\n    ◦ a nested item'), 'copied', 'the text given: copied');
      t.eq(c.written, ['• the first line\n    ◦ a nested item'], '… exactly the text, its marks and indentation kept, through the item');
      t.eq(c.calls, ['write'], '… and not written a second time');
      t.eq(await cp.give('again'), 'dropped', 'a second text for the same copy: dropped');
      cp.drop();
      t.eq(c.written.length, 1, 'a drop after the text: nothing changes');
      t.ok(typeof cp.at === 'number' && cp.at <= performance.now(), 'when it was begun, for "the copy belongs to the reading the tap starts"');
    }
    // ---------------------------------------------------------------- no text after all: the clipboard as it was
    {
      const c = board(), cp = laterCopy(c);
      cp.drop(); await tick();
      t.eq(c.written, [], 'dropped (nothing read, a newer reading, the tab left): the clipboard is left as it was');
      t.eq(await cp.give('late'), 'dropped', '… and text given after the drop is not copied');
      t.eq(c.written, [], '… still nothing written');
    }
    // ---------------------------------------------------------------- the item refused, the text taken (Chrome without a tap, as here)
    {
      const c = board({ refuseItem: true }), cp = laterCopy(c);
      t.eq(await cp.give('read text'), 'copied', 'the item refused, the text itself written once it is there: copied');
      t.eq(c.calls, ['write', 'writeText'], '… the text written after the item was refused');
      t.eq(c.written, ['read text'], '… exactly the text');
    }
    // ---------------------------------------------------------------- both refused (Safari, a photo chosen from the gallery)
    {
      const c = board({ refuseItem: true, refuseText: true }), cp = laterCopy(c);
      t.eq(await cp.give('read text'), 'refused', 'the item and the text refused: "refused" — the tab says to press Copy');
      t.eq(c.written, [], '… nothing written');
    }
    // ---------------------------------------------------------------- a browser without ClipboardItem
    globalThis.ClipboardItem = undefined;
    {
      const c = board(), cp = laterCopy(c);
      t.eq(c.calls, [], 'no ClipboardItem: nothing handed over in the tap');
      t.eq(await cp.give('plain'), 'copied', '… the text written when it is there');
      t.eq(c.calls, ['writeText'], '… by writeText');
    }
    // ---------------------------------------------------------------- a ClipboardItem that cannot take a promise
    globalThis.ClipboardItem = class { constructor() { throw new TypeError('Failed to construct ClipboardItem'); } };
    {
      const c = board(), cp = laterCopy(c);
      t.eq(await cp.give('plain'), 'copied', 'a ClipboardItem that throws on a promise: the text written instead, no error');
      t.eq(c.calls, ['writeText'], '… by writeText');
    }
    globalThis.ClipboardItem = Item;
    // ---------------------------------------------------------------- a clipboard without write(); no clipboard at all
    {
      const c = board(); delete c.write;
      t.eq(await laterCopy(c).give('x'), 'copied', 'a clipboard without write() (an older browser): writeText');
      t.eq(await laterCopy(undefined).give('x'), 'refused', 'no clipboard at all (a page that is not secure): refused, no error');
    }
    // ---------------------------------------------------------------- a dropped copy rejects the promised item (no write left waiting)
    {
      let settled = '';
      const c = { write: (items) => Promise.resolve(items[0].data['text/plain']).then(() => { settled = 'written'; }, () => { settled = 'rejected'; }), writeText: async () => {} };
      laterCopy(c).drop(); await tick();
      t.eq(settled, 'rejected', 'a drop rejects the promised item: the browser\'s pending write ends, nothing waits for ever');
    }
    // ---------------------------------------------------------------- the words
    t.eq(copyNote('copied'), 'Copied to the clipboard.', 'copied: "Copied to the clipboard."');
    t.eq(copyNote('refused'), 'Not copied by itself: this browser lets a page copy only when you tap — press “Copy”.', 'refused: what to press');
    t.eq(copyNote('refused', 'Copy the text'), 'Not copied by itself: this browser lets a page copy only when you tap — press “Copy the text”.', '… the tab\'s own button named');
    t.eq(copyNote('dropped'), '', 'dropped: nothing said');
    t.ok(FRESH_MS >= 5000 && FRESH_MS <= 60000, `a tap's copy is the reading's within ${FRESH_MS / 1000} s (a camera's still and a clipboard's picture take a moment)`);
  } finally { globalThis.ClipboardItem = had; }
};
