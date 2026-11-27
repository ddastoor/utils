// Text handed from one tab to another in the same visit — the Newspaper Clipper's "Read aloud" gives its text to the
// Text-to-Speech tab. In memory only (a module's variable): nothing is stored, and the text is gone once taken or when the
// page is closed (CLAUDE.md §1: nothing is saved between visits).
const box = new Map<string, string>();
/** Leave a text for a tab (`key`: its id). */
export const give = (key: string, text: string) => { box.set(key, text); };
/** The text left for a tab, taken (a second call gives nothing). */
export const take = (key: string): string | undefined => { const t = box.get(key); box.delete(key); return t; };
