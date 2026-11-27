// Something handed from one tab to another in the same visit — the Newspaper Clipper's "Read aloud" gives its text to the
// Text-to-Speech tab; Articles → Kindle gives its EPUB to the EPUB Reader. In memory only (a module's variable): nothing
// is stored, and it is gone once taken or when the page is closed (CLAUDE.md §1: nothing is saved between visits).
const box = new Map<string, unknown>();
/** Leave a text (or a file) for a tab (`key`: its id). */
export const give = (key: string, value: string | File) => { box.set(key, value); };
/** What was left for a tab, taken (a second call gives nothing). */
export const take = <T = string>(key: string): T | undefined => { const t = box.get(key) as T | undefined; box.delete(key); return t; };
