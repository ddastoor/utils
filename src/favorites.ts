// Favorites — the ONLY data SuperUtils keeps between visits (owner-requested exception to "stateless").
// Stored as a list of tool ids in this browser's localStorage; never sent anywhere.
const KEY = 'superutils.favorites.v1';
/** The key of the app's old name, SuperTools (until 21 Nov 2026): read once and moved to KEY, so no star is lost. */
const OLD_KEY = 'supertools.favorites.v1';
const listeners = new Set<() => void>();
let cache: string[] | null = null;

/** The stars kept under the old name, moved to the new key (left where they are if the browser refuses the write). */
function moveOld(raw: string): void {
  try { localStorage.setItem(KEY, raw); localStorage.removeItem(OLD_KEY); } catch { /* private mode or full: read it again next time */ }
}

function load(): string[] {
  if (cache) return cache;
  try {
    let raw = localStorage.getItem(KEY);
    if (raw === null) { raw = localStorage.getItem(OLD_KEY); if (raw !== null) moveOld(raw); }
    const v = JSON.parse(raw || '[]');
    cache = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
  } catch { cache = []; }
  return cache;
}
function save(list: string[]) {
  cache = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: keep in memory for this visit */ }
  listeners.forEach((f) => f());
}

export const favs = () => [...load()];
export const isFav = (id: string) => load().includes(id);
export function toggleFav(id: string): boolean {
  const l = load();
  const on = !l.includes(id);
  save(on ? [...l, id] : l.filter((x) => x !== id));
  return on;
}
export function onFavChange(f: () => void) { listeners.add(f); return () => listeners.delete(f); }

// keep several open tabs in sync
// (a page of the old version still open writes the old key: its stars are the newest, so they move over)
window.addEventListener('storage', (e) => {
  if (e.key === OLD_KEY && e.newValue !== null) moveOld(e.newValue);
  if (e.key === KEY || e.key === OLD_KEY || e.key === null) { cache = null; listeners.forEach((f) => f()); } // null: the storage was cleared
});
