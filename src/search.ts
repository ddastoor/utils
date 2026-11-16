// Tool search. Ranking runs in textcore.wasm (own C: wasm/textcore/search.c); this file only normalises text with
// the browser's Unicode tables (lower-case, strip accents) and maps results back to tools.
import type { Tool } from './registry';
import type { bindTextcore } from './wasm/textcore';

type Engine = ReturnType<typeof bindTextcore>;
let engine: Engine | null = null;
/** Load the wasm engine on first use of the search box (its own instance: tools release theirs when left). */
export const initSearch = async () => { engine ||= await (await import('./wasm/textcore')).newTextcore(); };
/** For Node unit tests: supply an engine bound with bindTextcore(). */
export const setSearchEngine = (e: Engine) => { engine = e; };

export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+#.%/ -]+/g, ' ').replace(/\s+/g, ' ').trim();

let last: { tools: Tool[]; index: number } | null = null;
/** Ranks tools for a query: whole-phrase matches first, then every meaningful word must match somewhere. */
export function searchTools(tools: Tool[], query: string, max = 64): Tool[] {
  const q = norm(query);
  if (!q || !engine) return [];
  if (!last || last.tools !== tools) {
    if (last) engine.searchFree(last.index);
    last = { tools, index: engine.searchBuild(tools.map((t) => [t.id, norm(t.title), t.kw.map(norm), norm(t.desc)])) };
  }
  return engine.searchQuery(last.index, q, max).map((i) => tools[i]);
}
