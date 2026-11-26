// Whether the category's list of apps is folded away (to-do #27; owner, 26 Nov 2026: "make the list of apps in this
// category in a collapsible pane … By default, keep the app pane expanded, but … the user should be able to collapse the
// list of all apps in that category so that the real estate for the currently selected app increases", and "remembered
// between visits like Favorites"). Kept in this browser's localStorage beside Favorites — the one other thing SuperUtils
// keeps between visits (CLAUDE.md §1, rule 1); never sent anywhere. Open is the default and is stored as nothing.
const KEY = 'superutils.applist.v1';
const listeners = new Set<() => void>();
let mem: boolean | null = null;

export function appListFolded(): boolean {
  if (mem === null) { try { mem = localStorage.getItem(KEY) === 'folded'; } catch { mem = false; } }
  return mem;
}
export function setAppListFolded(folded: boolean) {
  mem = folded;
  try { if (folded) localStorage.setItem(KEY, 'folded'); else localStorage.removeItem(KEY); } catch { /* private mode: for this visit */ }
  listeners.forEach((f) => f());
}
export function onAppListChange(f: () => void) { listeners.add(f); return () => listeners.delete(f); }
// another open tab of the site folded or opened it
window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { mem = null; listeners.forEach((f) => f()); } });
