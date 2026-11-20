// Favorites — the ONLY data SuperTools keeps between visits (owner-requested exception to "stateless").
// Stored as a list of tool ids in this browser's localStorage; never sent anywhere.
const KEY = 'supertools.favorites.v1';
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function load(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
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
window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { cache = null; listeners.forEach((f) => f()); } }); // null: the storage was cleared
