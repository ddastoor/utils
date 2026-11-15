import type { Tool } from './registry';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+#.%/ ]+/g, ' ').trim();

/** Ranks tools for a query. Every query word must match the title, a keyword, the id or the description. */
export function searchTools(tools: Tool[], query: string): Tool[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: Array<[number, Tool]> = [];
  for (const t of tools) {
    const title = norm(t.title), kws = t.kw.map(norm), desc = norm(t.desc), id = t.id;
    let total = 0, ok = true;
    for (const w of words) {
      let s = 0;
      if (title === q) s = Math.max(s, 120);
      if (title === w || id === w) s = Math.max(s, 100);
      if (title.startsWith(w)) s = Math.max(s, 80);
      if (title.split(' ').some((x) => x.startsWith(w))) s = Math.max(s, 60);
      for (const k of kws) {
        if (k === w || k === q) s = Math.max(s, 70);
        else if (k.startsWith(w)) s = Math.max(s, 45);
        else if (k.split(' ').some((x) => x.startsWith(w))) s = Math.max(s, 35);
        else if (w.length >= 3 && k.includes(w)) s = Math.max(s, 20);
      }
      if (!s && w.length >= 3 && (title.includes(w) || desc.includes(w))) s = 15;
      if (!s) { ok = false; break; }
      total += s;
    }
    if (ok) scored.push([total, t]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}
