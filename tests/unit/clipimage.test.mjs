// The picture on the clipboard (src/lib/clipimage.ts — to-do #37, the OCR's and the Photo Dictionary's "Paste image"):
// which of an item's formats is its picture, the name it is kept under, and what is said for every way the clipboard can
// answer — a stand-in for the browser's navigator.clipboard (the e2e suite paste-image runs the real one in Chromium).
export default async (t, { load }) => {
  const C = await load('/src/lib/clipimage.ts');
  const item = (parts) => ({ types: Object.keys(parts), getType: async (ty) => { const v = parts[ty]; if (v instanceof Error) throw v; return new Blob([v], { type: ty }); } });
  const clip = (items) => ({ read: async () => items });
  const fail = (name, message) => ({ read: async () => { const e = new Error(message); e.name = name; throw e; } });
  const at = new Date(2026, 10, 27, 9, 15, 3);
  const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };

  // ---- which format is the picture
  t.eq(C.pictureType(['text/plain', 'image/png']), 'image/png', 'a picture beside text: the picture');
  t.eq(C.pictureType(['image/svg+xml', 'image/png']), 'image/png', 'PNG before an SVG drawing (Chrome puts both on the clipboard for a copied SVG)');
  t.eq(C.pictureType(['image/tiff', 'image/jpeg']), 'image/jpeg', 'the usual formats first: JPEG before TIFF');
  t.eq(C.pictureType(['image/x-icon']), 'image/x-icon', 'any other picture format when it is the only one');
  t.eq(C.pictureType(['image/svg+xml']), 'image/svg+xml', 'an SVG when nothing else is there');
  t.eq(C.pictureType(['IMAGE/PNG']), 'IMAGE/PNG', 'formats in capitals');
  t.eq(C.pictureType(['text/plain', 'text/html']), null, 'text only: no picture');
  t.eq(C.pictureType([]), null, 'nothing');

  // ---- the name: clipboard-<date>-<time>.<ext>, -2, -3 … within a second
  t.eq(C.clipboardName('image/png', at), 'clipboard-20261127-091503.png', 'named as a pasted screenshot is kept, by the local date and time');
  t.eq(C.clipboardName('image/png', at), 'clipboard-20261127-091503-2.png', 'a second one in the same second: -2');
  t.eq(C.clipboardName('image/jpeg', at), 'clipboard-20261127-091503-3.jpg', '… -3, and a JPEG is .jpg');
  t.eq(C.clipboardName('image/webp', new Date(2026, 0, 2, 3, 4, 5)), 'clipboard-20260102-030405.webp', 'a new second starts again; months, days and hours with two digits');
  t.eq(C.clipboardName('image/x-icon', new Date(2026, 0, 2, 3, 4, 6)), 'clipboard-20260102-030406.xicon', 'another format: letters of its name');

  // ---- a picture: the file the tab opens
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3]);
  let f = await C.clipboardPicture(clip([item({ 'text/plain': 'x', 'image/png': png })]), 'pc', () => at);
  t.ok(f instanceof File && f.type === 'image/png' && /^clipboard-20261127-091503(-\d+)?\.png$/.test(f.name) && f.lastModified === at.getTime(), `the picture as a file: ${f.name}, ${f.type}`);
  t.eq([...new Uint8Array(await f.arrayBuffer())], [...png], '… its bytes as the clipboard gave them');
  f = await C.clipboardPicture(clip([item({ 'text/plain': 'a caption' }), item({ 'image/jpeg': png })]), 'pc', () => at);
  t.ok(f.type === 'image/jpeg' && /\.jpg$/.test(f.name), 'text in one item, a picture in the next: the picture');
  f = await C.clipboardPicture(clip([item({ 'image/png': new Uint8Array(0) }), item({ 'image/png': png })]), 'pc', () => at);
  t.eq(f.size, png.length, 'an empty picture is passed over for the next one');

  // ---- what is there instead, in words for the device
  for (const where of ['pc', 'mac', 'android', 'ios']) {
    let e = await caught(C.clipboardPicture(clip([item({ 'text/plain': 'hello' })]), where));
    t.ok(e?.kind === 'text' && e.message.startsWith('The clipboard holds text, not a picture. Copy one first') && e.message.includes(C.copyTip(where)), `${where}: text, not a picture — "${e?.message.slice(0, 60)}…"`);
    e = await caught(C.clipboardPicture(clip([]), where));
    t.ok(e?.kind === 'empty' && e.message.startsWith('There is no picture on the clipboard.'), `${where}: an empty clipboard`);
    e = await caught(C.clipboardPicture(fail('NotAllowedError', 'Read permission denied.'), where));
    t.ok(e?.kind === 'denied' && e.message === C.deniedTip(where), `${where}: refused — "${e?.message.slice(0, 70)}…"`);
  }
  t.ok(/Win\+Shift\+S/.test(C.copyTip('pc')) && /Ctrl\+V/.test(C.copyTip('pc')) && /⌘V/.test(C.copyTip('mac')) && /press and hold/.test(C.copyTip('android')) && /Copy Photo/.test(C.copyTip('ios')), 'how to copy a picture: a screenshot to the clipboard on a PC, ⌘ on a Mac, press and hold on a phone, Photos on an iPhone');
  t.ok(/Site settings → Clipboard → Allow/.test(C.deniedTip('pc')) && /Ctrl\+V, which needs no leave/.test(C.deniedTip('pc')) && /Site settings → Clipboard/.test(C.deniedTip('android')) && /tap “Paste”/.test(C.deniedTip('ios')), 'refused: where to allow it on a PC and on Android; on an iPhone, Safari\'s own Paste button');
  let e = await caught(C.clipboardPicture(fail('NotAllowedError', 'Document is not focused.'), 'pc'));
  t.ok(e?.kind === 'failed' && /did not have the focus/.test(e.message), 'Chrome refuses while the page does not have the focus: said so (it is not a refusal of leave)');
  e = await caught(C.clipboardPicture(fail('DataError', 'boom'), 'pc'));
  t.ok(e?.kind === 'failed' && /could not be read — boom\. Press Ctrl\+V instead\./.test(e.message), 'another failure: its words, and Ctrl+V');
  e = await caught(C.clipboardPicture(clip([item({ 'image/png': new Error('gone') })]), 'android'));
  t.ok(e?.kind === 'failed' && /picture on the clipboard could not be read — gone/.test(e.message), 'a picture that cannot be fetched from the clipboard');
  e = await caught(C.clipboardPicture(undefined, 'pc'));
  t.ok(e?.kind === 'unsupported' && /Press Ctrl\+V instead/.test(e.message), 'a browser without the clipboard API: Ctrl+V');
  e = await caught(C.clipboardPicture({}, 'ios'));
  t.ok(e?.kind === 'unsupported' && !/Ctrl/.test(e.message), '… on a phone, without Ctrl+V');
  // the clipboard is asked at once — in the tap itself (Safari reads it only there): nothing is awaited before read()
  let asked = false; const p = C.clipboardPicture({ read: () => { asked = true; return Promise.resolve([]); } }, 'ios');
  t.ok(asked, 'read() is called before clipboardPicture first waits (Safari needs it in the tap)'); await caught(p);
};
