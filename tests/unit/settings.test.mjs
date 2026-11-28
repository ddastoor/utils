// The Settings (to-do #39): src/settings.ts and src/lib/settingsfile.ts in Node, with a stand-in for the browser's localStorage and its
// storage event. The sections and their order; every app's values checked as they are stored or imported (wrong types, out of range,
// unknown choices back to their defaults, unknown fields dropped); a change made here told as local, one heard from another tab not; the
// snapshot of every section; an import replacing what is kept, apps the site does not have and sections this version does not know named
// and left out; a file that is no settings file, or from a newer version, refused; the file's name.
export default async (t, { load }) => {
  // ---- a stand-in browser: localStorage and the storage event
  // no settings file is written here (the browser suite checks the files): "after every change" off from the start
  const store = new Map([['superutils.settings.v1', '{"autoSave":false}']]), handlers = [];
  const hadWindow = 'window' in globalThis, hadStorage = 'localStorage' in globalThis;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
  };
  globalThis.window ??= globalThis;
  const added = globalThis.addEventListener;
  globalThis.addEventListener = (type, f) => { if (type === 'storage') handlers.push(f); else added?.call(globalThis, type, f); };
  /** another tab wrote `key` */
  const otherTab = (key, value) => { if (value === null) store.delete(key); else store.set(key, value); for (const f of handlers) f({ key, newValue: value }); };

  const S = await load('/src/settings.ts');
  const F = await load('/src/lib/settingsfile.ts');
  const { TOOL_BY_ID } = await load('/src/registry.ts');

  t.eq(S.settingsSections().map((s) => s.id), ['favorites', 'applist', 'tts', 'camreader', 'audiobook', 'ebook', 'spell', 'worldclock'],
    'the sections: Favorites, the list of apps, and the apps the owner chose (28 Nov 2026) in their order');

  // ---- defaults, from an empty store
  const snap0 = S.snapshot(new Date(2026, 10, 28, 9, 5, 7));
  t.eq([snap0.app, snap0.kind, snap0.format], ['SuperUtils', 'settings', 1], 'a settings file says what it is and its format');
  t.ok(/^2026-11-28T09:05:07[+-]\d\d:\d\d$/.test(snap0.saved), `the time it was saved, as the device shows it with its offset (${snap0.saved})`);
  t.eq(snap0.settings, {
    favorites: [], applist: { folded: false },
    tts: { voice: 'af_heart', speed: 1 }, camreader: { voice: 'af_heart', speed: '1', size: 24, auto: true }, audiobook: { voice: 'af_heart', speed: 1, kbps: 64 },
    ebook: { font: 'literata', size: null, line: 1.5, justify: null, theme: null, publisher: true, margin: 'normal', spread: 'auto', books: [], voice: null, speed: '1' },
    spell: { lang: null, added: [] }, worldclock: { cities: null, h24: null },
  }, 'from an empty store every section has its defaults (null: what follows the device or the browser until chosen)');

  // ---- every app's values checked
  const heard = [];
  const off = S.onSettings((id, local) => heard.push(`${id}:${local}`));
  S.ttsSettings.set({ speed: 1.25, voice: 'in_svbi' });
  t.eq([S.ttsSettings.get(), JSON.parse(store.get('superutils.app.tts.v1'))], [{ voice: 'in_svbi', speed: 1.25 }, { voice: 'in_svbi', speed: 1.25 }], 'a change is stored at once under the app\'s own key');
  t.eq(heard, ['tts:true'], 'and told as made in this tab');
  S.ttsSettings.set({ speed: 9 });
  t.eq(S.ttsSettings.get().speed, 1, 'a speed outside 0.5 – 2 falls back to the default');
  S.ttsSettings.set({ voice: 'sys:Microsoft Zira Desktop' });
  t.eq(S.ttsSettings.get().voice, 'sys:Microsoft Zira Desktop', 'a voice of this device is kept by its name, spaces and all');
  S.camreaderSettings.set({ size: 22, speed: '2', auto: 'yes' });
  t.eq(S.camreaderSettings.get(), { voice: 'af_heart', speed: '1', size: 24, auto: true }, 'the Camera Reader: a size that is not one of its six, a speed not offered, a switch that is no true / false — the defaults');
  S.camreaderSettings.set({ size: 34, speed: '1.2', auto: false });
  t.eq(S.camreaderSettings.get(), { voice: 'af_heart', speed: '1.2', size: 34, auto: false }, '… and its own values kept');
  S.audiobookSettings.set({ kbps: 128 });
  t.eq(S.audiobookSettings.get().kbps, 64, 'the Audiobook: a bitrate it does not offer is its default');
  S.ebookSettings.set({ font: 'comic', size: 99, theme: 'neon', line: 1.75, justify: false });
  t.eq(S.ebookSettings.get(), { font: 'literata', size: 20, line: 1.75, justify: false, theme: 'light', publisher: true, margin: 'normal', spread: 'auto', books: [], voice: null, speed: '1' },
    'the EPUB Reader: an unknown font and theme, a size beyond 42 — the defaults; what is valid kept');
  S.ebookSettings.set({ size: null, theme: null, justify: null });
  t.eq([S.ebookSettings.get().size, S.ebookSettings.get().theme, S.ebookSettings.get().justify], [null, null, null], 'null again: back to what follows the device');
  // the books it remembers and its reading voice (to-do #40)
  const H = (c) => c.repeat(32);
  S.ebookSettings.set({ voice: 'in_tni', speed: '1.2', books: [
    { hash: H('a'), title: 'The Lighthouse', author: 'A. Writer', anchor: 'The sea was calm that night', share: 0.25, page: 12, pages: 48, at: 1000 },
    { hash: H('b'), title: 'Old', author: '', anchor: '', share: 0.5, page: 3, pages: 6, at: 3000 },
    { hash: H('a'), title: 'The Lighthouse', author: 'A. Writer', anchor: 'Later words', share: 0.5, page: 24, pages: 48, at: 2000 },
    { hash: 'NOT-A-HASH', title: 'x', page: 1, pages: 2, at: 5 },
    { hash: H('c'), title: 'Odd values', author: 7, anchor: 'a\u0000b', share: 4, page: 99, pages: 10, at: -1 },
  ] });
  const kb = S.ebookSettings.get();
  t.eq([kb.voice, kb.speed], ['in_tni', '1.2'], 'the reading voice and speed kept');
  t.eq(kb.books.map((b) => [b.hash[0], b.at]), [['b', 3000], ['a', 2000], ['c', 0]], 'the books: one entry a fingerprint (the latest kept), the last read first, one that is no fingerprint left out');
  t.eq(kb.books[1].anchor, 'Later words', '… its place the latest one');
  t.eq(kb.books[2], { hash: H('c'), title: 'Odd values', author: '', anchor: 'a b', share: 0, page: 9, pages: 10, at: 0 }, 'values out of range back within it (the page within the book, the share 0 – 1), control characters out');
  S.ebookSettings.set({ voice: 'sys:Microsoft Zira Desktop' });
  t.eq(S.ebookSettings.get().voice, 'sys:Microsoft Zira Desktop', 'a voice of this device kept by its name');
  S.ebookSettings.set({ voice: null, speed: '3' });
  t.eq([S.ebookSettings.get().voice, S.ebookSettings.get().speed], [null, '1'], 'null: not chosen yet (asked the first time); a speed not offered → normal');
  t.eq(S.ebookSettings.get().books.length, 3, 'a change of the voice leaves the books as they were');
  // the place kept quietly as the pages turn: stored and told, but no settings file of its own (one follows remember / forget)
  const heardQ = [];
  const offQ = S.onSettings((id, local) => heardQ.push(`${id}:${local}`));
  S.ebookSettings.setQuietly({ books: S.ebookSettings.get().books.map((b) => (b.hash === H('a') ? { ...b, page: 30, anchor: 'Page thirty', at: 9000 } : b)) });
  t.eq([S.ebookSettings.get().books[0].page, JSON.parse(store.get('superutils.app.ebook.v1')).books[0].anchor, heardQ], [30, 'Page thirty', ['ebook:true']], 'a quiet change: stored at once and told as made here (its place first: the last read)');
  offQ();
  const notesB = S.importSettings({ app: 'SuperUtils', kind: 'settings', format: 1, settings: { ebook: { books: [{ hash: H('d'), title: 'Imported', page: 0, pages: 5, at: 1 }, { hash: 'zz' }, 42] } } }).notes;
  t.ok(S.ebookSettings.get().books.length === 1 && notesB.some((n) => /2 remembered books that could not be read left out/.test(n)), `an import: the books of the file replace them, the ones that are no books named (${notesB.join(' | ')})`);
  S.ebookSettings.set({ books: [] });
  S.spellSettings.set({ lang: 'fr-FR', added: ['Aadhaar', 'Aadhaar', 'GSTIN2', '', 'naïve', 42] });
  t.eq(S.spellSettings.get(), { lang: 'en-US', added: ['Aadhaar', 'naïve'] }, 'the Spell Checker: a language it does not have is American English; its words once each, only words (no digits, no empty)');
  S.worldclockSettings.set({ cities: ['new-york-us', 3, 'london-gb', 'new-york-us'], h24: 'yes' });
  t.eq(S.worldclockSettings.get(), { cities: ['new-york-us', 'london-gb'], h24: false }, 'the World Clock: its cities once each, as text');

  // ---- what another tab changed
  heard.length = 0;
  otherTab('superutils.app.tts.v1', JSON.stringify({ voice: 'bf_emma', speed: 0.75 }));
  t.eq([S.ttsSettings.get(), heard], [{ voice: 'bf_emma', speed: 0.75 }, ['tts:false']], 'a change in another tab is read again and told as not made here (no file for it)');
  otherTab('superutils.app.tts.v1', 'not json');
  t.eq(S.ttsSettings.get(), { voice: 'af_heart', speed: 1 }, 'what cannot be read falls back to the defaults');
  off();

  // ---- import
  const known = [...TOOL_BY_ID.keys()].slice(0, 3);
  const r = S.importSettings({ app: 'SuperUtils', kind: 'settings', format: 1, saved: '2026-11-28T10:00:00+05:30', settings: {
    favorites: [...known, 'no-such-app'], applist: { folded: true }, tts: { voice: 'in_tni', speed: 1.5, extra: 1 },
    worldclock: { cities: ['mumbai-in'], h24: true }, radio: { stations: [] },
  } });
  t.eq(r.done, ['Favorites', 'The list of apps', 'Text-to-Speech', 'World Clock'], 'an import puts in place the sections the file holds');
  t.ok(r.notes.some((n) => /1 app this site does not have left out \(no-such-app\)/.test(n)) && r.notes.some((n) => /“radio”: not a section of this version/.test(n)),
    `apps the site does not have and sections this version does not know are named and left out (${r.notes.join(' / ')})`);
  t.eq(S.snapshot().settings.favorites, known, 'the favorites replaced by the file\'s');
  t.eq([S.snapshot().settings.applist, S.ttsSettings.get(), S.worldclockSettings.get()], [{ folded: true }, { voice: 'in_tni', speed: 1.5 }, { cities: ['mumbai-in'], h24: true }], 'each section as the file has it (its unknown fields dropped)');
  t.eq(S.spellSettings.get().added, ['Aadhaar', 'naïve'], 'a section the file does not hold is left as it was');
  t.throws(() => S.importSettings({ app: 'Other', settings: {} }), 'a file of another program is refused');
  t.throws(() => S.importSettings({ app: 'SuperUtils', kind: 'settings', format: 99, settings: {} }), 'a file from a newer version is refused (reload and import again)');
  t.throws(() => F.readSettingsText('{ not json'), 'a file that is not JSON is refused');
  t.eq(F.readSettingsText('\uFEFF{"a":1}'), { a: 1 }, 'a byte-order mark before the JSON is no obstacle');

  // ---- the file's name and text
  t.eq(F.settingsFileName(new Date(2026, 10, 28, 9, 5)), 'superutils_settings_20261128_0905.json', 'the file\'s name: superutils_settings_YYYYMMDD_HHMM.json');
  t.eq(F.settingsFileName(new Date(2027, 0, 3, 23, 59)), 'superutils_settings_20270103_2359.json', '… with leading zeros, the 24-hour clock');
  const text = F.settingsText(S.snapshot());
  t.ok(text.endsWith('\n') && JSON.parse(text).settings.tts.voice === 'in_tni', 'the file is the snapshot as readable JSON');

  // ---- the device's switch
  S.setAutoSave(false);
  t.eq([S.autoSave(), store.get('superutils.settings.v1')], [false, '{"autoSave":false}'], '"Save a settings file after every change" off is kept for this device');
  S.setAutoSave(true);
  t.eq(S.autoSave(), true, '… and on again');
  t.ok(!('device' in S.snapshot().settings), 'the device\'s own switch is not in the file');
  S.setAutoSave(false);
  // the suites of a thread run side by side: leave the globals as they were
  globalThis.addEventListener = added;
  if (!hadStorage) delete globalThis.localStorage;
  if (!hadWindow) delete globalThis.window;
};
