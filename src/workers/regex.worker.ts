// Regex Tester: matching runs here, not on the page, so a pattern that backtracks without end ((a+)+$ on a long run of
// "a") cannot freeze the tab — the page ends this worker after a time limit and starts a new one.
// The engine is the browser's own RegExp (compiled C++); this file is only the loop around it.
export interface RegexReq { id: number; pattern: string; flags: string; text: string; replacement: string | null }
export interface RegexMatch { index: number; text: string; groups: Array<string | null>; named: Record<string, string | null> | null }
export interface RegexRes { id: number; error?: string; total?: number; matches?: RegexMatch[]; names?: string[]; replaced?: string | null }
const SHOWN = 1000, COUNTED = 1_000_000;
self.onmessage = (ev: MessageEvent<RegexReq>) => {
  const { id, pattern, flags, text, replacement } = ev.data;
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`); // every match is listed whether or not g is set
    const matches: RegexMatch[] = []; let total = 0; const names = new Set<string>();
    for (const m of text.matchAll(re)) {
      if (matches.length < SHOWN) { matches.push({ index: m.index!, text: m[0], groups: m.slice(1).map((g) => g ?? null), named: m.groups ? Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, v ?? null])) : null }); if (m.groups) Object.keys(m.groups).forEach((k) => names.add(k)); }
      if (++total >= COUNTED) break;
    }
    // Replace follows the flags as typed: without g only the first match is replaced, as String.replace does
    const replaced = replacement === null ? null : text.replace(new RegExp(pattern, flags), replacement);
    (self as any).postMessage({ id, total, matches, names: [...names], replaced } satisfies RegexRes);
  } catch (e: any) { (self as any).postMessage({ id, error: String(e?.message || e) } satisfies RegexRes); }
};
